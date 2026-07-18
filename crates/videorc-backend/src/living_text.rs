//! Living Text — Bible verse citation detection, running entirely locally.
//!
//! The admin API (prophet_admin_api.rs) is used for exactly one thing: a
//! one-shot sync that pulls a translation's verse text into a local SQLite
//! cache (see `LivingTextStore`). Everything after that — citation
//! detection, chapter/verse lookups — runs against that local cache with no
//! network round-trip. This mirrors how the project this feature is modeled
//! on runs its own bundled SQLite Bible DB and Rust-side reference parser
//! rather than hitting a server per sentence (owner decision 2026-07-18:
//! detection is compute that runs against live input, not CRUD data, so it
//! belongs in the desktop app, not the admin backend).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;

use anyhow::{Context, Result, bail};
use regex::{Regex, RegexBuilder};
use rusqlite::{Connection, params};
use serde::Serialize;

use crate::living_text_catalog::BIBLE_BOOKS;
use crate::prophet_admin_api::ProphetAdminApiClient;

// ---------------------------------------------------------------------------
// Reference detector — pure text in, candidate citations out. No DB access.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedCitation {
    pub book: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse_start: Option<i32>,
    pub verse_end: Option<i32>,
    pub match_type: &'static str, // "explicit" | "chapter"
    pub source_text: String,
    pub index: usize,
}

struct AliasEntry {
    book_number: i32,
    canonical_name: &'static str,
}

/// "1 Jn."/"1  jn" -> "1 jn" so a matched capture group can be looked up in ALIAS_MAP.
fn normalize_book_text(raw: &str) -> String {
    raw.to_lowercase().replace('.', "").split_whitespace().collect::<Vec<_>>().join(" ")
}

fn alias_map() -> &'static HashMap<String, AliasEntry> {
    static MAP: OnceLock<HashMap<String, AliasEntry>> = OnceLock::new();
    MAP.get_or_init(|| {
        let mut map = HashMap::new();
        for book in BIBLE_BOOKS {
            for name in std::iter::once(book.canonical_name).chain(book.aliases.iter().copied()) {
                map.insert(
                    normalize_book_text(name),
                    AliasEntry { book_number: book.book_number, canonical_name: book.canonical_name },
                );
            }
        }
        map
    })
}

fn reference_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Longest alias first so "Song of Solomon" is preferred over the bare
        // "Song" alias when both would otherwise be tried at the same position.
        let mut aliases: Vec<&String> = alias_map().keys().collect();
        aliases.sort_by(|a, b| b.len().cmp(&a.len()));
        let book_pattern = aliases
            .iter()
            .map(|alias| regex::escape(alias).replace(' ', r"\s+"))
            .collect::<Vec<_>>()
            .join("|");
        let pattern = format!(
            r"\b({book_pattern})\.?\s+(\d{{1,3}})(?:\s*:\s*(\d{{1,3}})(?:\s*[-\x{{2013}}]\s*(\d{{1,3}}))?)?\b"
        );
        RegexBuilder::new(&pattern).case_insensitive(true).build().expect("living text reference regex")
    })
}

/// Regex-based explicit citation detector — "John 3:16", "Romans 8:28-30",
/// "1 Corinthians 13" (whole chapter). Callers resolve chapter/verse
/// existence against the local verse cache (see `detect_and_resolve`).
pub fn detect_references(text: &str) -> Vec<DetectedCitation> {
    let map = alias_map();
    let mut results = Vec::new();

    for captures in reference_regex().captures_iter(text) {
        let full = captures.get(0).unwrap();
        let book_raw = captures.get(1).map(|m| m.as_str()).unwrap_or_default();
        let Some(info) = map.get(&normalize_book_text(book_raw)) else { continue };

        let chapter: i32 = match captures.get(2).and_then(|m| m.as_str().parse().ok()) {
            Some(c) if (1..=150).contains(&c) => c,
            _ => continue,
        };

        let verse_start: Option<i32> = captures.get(3).and_then(|m| m.as_str().parse().ok());
        let mut verse_end: Option<i32> = captures.get(4).and_then(|m| m.as_str().parse().ok());
        if let (Some(start), Some(end)) = (verse_start, verse_end) {
            if end < start {
                verse_end = Some(start);
            }
        }

        results.push(DetectedCitation {
            book: info.canonical_name.to_string(),
            book_number: info.book_number,
            chapter,
            verse_start,
            verse_end,
            match_type: if verse_start.is_some() { "explicit" } else { "chapter" },
            source_text: full.as_str().trim().to_string(),
            index: full.start(),
        });
    }

    results
}

// ---------------------------------------------------------------------------
// Local cache — synced once from the admin API, queried locally after that.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTranslation {
    pub code: String,
    pub name: String,
    pub language: String,
    pub verse_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVerse {
    pub book: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCitation {
    #[serde(flatten)]
    pub citation: DetectedCitation,
    pub resolved: bool,
    pub verses: Vec<LocalVerse>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub code: String,
    pub name: String,
    pub verse_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSummary {
    pub book_number: i32,
    pub name: String,
}

pub fn list_books() -> Vec<BookSummary> {
    BIBLE_BOOKS
        .iter()
        .map(|book| BookSummary { book_number: book.book_number, name: book.canonical_name.to_string() })
        .collect()
}

pub struct LivingTextStore {
    conn: Connection,
}

fn database_path() -> PathBuf {
    if let Some(custom) = std::env::var_os("VIDEORC_LIVING_TEXT_DB_PATH") {
        return PathBuf::from(custom);
    }
    let home = std::env::var_os(if cfg!(target_os = "windows") { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    #[cfg(target_os = "macos")]
    {
        home.join("Library").join("Application Support").join("Videorc").join("living-text.sqlite3")
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"))
            .join("Videorc")
            .join("living-text.sqlite3")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        home.join(".videorc").join("living-text.sqlite3")
    }
}

impl LivingTextStore {
    pub fn open() -> Result<Self> {
        let path = database_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Could not create {}", parent.display()))?;
        }
        let conn = Connection::open(&path)
            .with_context(|| format!("Could not open the Living Text cache at {}", path.display()))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS translations (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                language TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS verses (
                translation_code TEXT NOT NULL REFERENCES translations(code) ON DELETE CASCADE,
                book TEXT NOT NULL,
                book_number INTEGER NOT NULL,
                chapter INTEGER NOT NULL,
                verse INTEGER NOT NULL,
                text TEXT NOT NULL,
                PRIMARY KEY (translation_code, book, chapter, verse)
             );
             CREATE INDEX IF NOT EXISTS verses_lookup
                ON verses(translation_code, book, chapter);",
        )?;
        Ok(Self { conn })
    }

    /// Pulls a translation's full verse text from the admin API and replaces
    /// whatever was cached locally for that code. Call once per translation
    /// (or when re-syncing after upstream data changes) — not per detection.
    pub async fn sync_translation(
        &mut self,
        admin: &ProphetAdminApiClient,
        code: &str,
    ) -> Result<SyncSummary> {
        let export = admin.fetch_bible_verses(code).await?;
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM verses WHERE translation_code = ?1", params![export.translation.code])?;
        tx.execute(
            "INSERT INTO translations (code, name, language) VALUES (?1, ?2, ?3)
             ON CONFLICT(code) DO UPDATE SET name = excluded.name, language = excluded.language",
            params![export.translation.code, export.translation.name, export.translation.language],
        )?;
        {
            let mut insert = tx.prepare(
                "INSERT INTO verses (translation_code, book, book_number, chapter, verse, text)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            for verse in &export.verses {
                insert.execute(params![
                    export.translation.code,
                    verse.book,
                    verse.book_number,
                    verse.chapter,
                    verse.verse,
                    verse.text,
                ])?;
            }
        }
        let verse_count = export.verses.len() as i64;
        tx.commit()?;
        Ok(SyncSummary { code: export.translation.code, name: export.translation.name, verse_count })
    }

    pub fn list_translations(&self) -> Result<Vec<LocalTranslation>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.code, t.name, t.language, COUNT(v.text)
             FROM translations t
             LEFT JOIN verses v ON v.translation_code = t.code
             GROUP BY t.code, t.name, t.language
             ORDER BY t.code",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(LocalTranslation {
                code: row.get(0)?,
                name: row.get(1)?,
                language: row.get(2)?,
                verse_count: row.get(3)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>().context("Could not list Living Text translations.")
    }

    pub fn get_chapter(&self, translation_code: &str, book: &str, chapter: i32) -> Result<Vec<LocalVerse>> {
        let mut stmt = self.conn.prepare(
            "SELECT book, book_number, chapter, verse, text FROM verses
             WHERE translation_code = ?1 AND book = ?2 AND chapter = ?3
             ORDER BY verse",
        )?;
        let rows = stmt.query_map(params![translation_code, book, chapter], Self::map_verse_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().context("Could not load the chapter.")
    }

    fn get_verse_range(
        &self,
        translation_code: &str,
        book: &str,
        chapter: i32,
        verse_start: i32,
        verse_end: i32,
    ) -> Result<Vec<LocalVerse>> {
        let mut stmt = self.conn.prepare(
            "SELECT book, book_number, chapter, verse, text FROM verses
             WHERE translation_code = ?1 AND book = ?2 AND chapter = ?3 AND verse BETWEEN ?4 AND ?5
             ORDER BY verse",
        )?;
        let rows = stmt.query_map(
            params![translation_code, book, chapter, verse_start, verse_end],
            Self::map_verse_row,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>().context("Could not load the verse range.")
    }

    fn map_verse_row(row: &rusqlite::Row) -> rusqlite::Result<LocalVerse> {
        Ok(LocalVerse {
            book: row.get(0)?,
            book_number: row.get(1)?,
            chapter: row.get(2)?,
            verse: row.get(3)?,
            text: row.get(4)?,
        })
    }

    /// Detects citations in `text` and resolves each against the local cache
    /// for `translation_code`. Fails clearly if that translation was never
    /// synced (see `sync_translation`) rather than silently returning nothing.
    pub fn detect_and_resolve(&self, translation_code: &str, text: &str) -> Result<Vec<ResolvedCitation>> {
        let has_translation: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM translations WHERE code = ?1)",
            params![translation_code],
            |row| row.get(0),
        )?;
        if !has_translation {
            bail!(
                "The \"{translation_code}\" translation hasn't been synced to this device yet. \
                 Sync it from Living Text settings first."
            );
        }

        let citations = detect_references(text);
        let mut resolved = Vec::with_capacity(citations.len());
        for citation in citations {
            let verses = match (citation.match_type, citation.verse_start) {
                ("explicit", Some(start)) => self.get_verse_range(
                    translation_code,
                    &citation.book,
                    citation.chapter,
                    start,
                    citation.verse_end.unwrap_or(start),
                )?,
                _ => self.get_chapter(translation_code, &citation.book, citation.chapter)?,
            };
            resolved.push(ResolvedCitation { resolved: !verses.is_empty(), citation, verses });
        }
        Ok(resolved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_a_single_explicit_verse() {
        let results = detect_references("As it says in John 3:16, God so loved the world.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "John");
        assert_eq!(results[0].book_number, 43);
        assert_eq!(results[0].chapter, 3);
        assert_eq!(results[0].verse_start, Some(16));
        assert_eq!(results[0].verse_end, None);
        assert_eq!(results[0].match_type, "explicit");
    }

    #[test]
    fn detects_a_verse_range() {
        let results = detect_references("Turn with me to Romans 8:28-30 this morning.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Romans");
        assert_eq!(results[0].verse_start, Some(28));
        assert_eq!(results[0].verse_end, Some(30));
    }

    #[test]
    fn detects_a_whole_chapter_reference() {
        let results = detect_references("Please open your Bibles to 1 Corinthians 13.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "1 Corinthians");
        assert_eq!(results[0].book_number, 46);
        assert_eq!(results[0].chapter, 13);
        assert_eq!(results[0].verse_start, None);
        assert_eq!(results[0].match_type, "chapter");
    }

    #[test]
    fn resolves_abbreviations_and_numeral_word_prefixes() {
        let results = detect_references("Rom 8:1 and First Corinthians 13:4 and 2 Tim. 3:16");
        let books: Vec<&str> = results.iter().map(|r| r.book.as_str()).collect();
        assert_eq!(books, vec!["Romans", "1 Corinthians", "2 Timothy"]);
    }

    #[test]
    fn prefers_the_longer_alias_when_one_is_a_prefix_of_another() {
        let results = detect_references("Song of Solomon 2:1 is a beautiful passage.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Song of Solomon");
        assert_eq!(results[0].chapter, 2);
        assert_eq!(results[0].verse_start, Some(1));
    }

    #[test]
    fn does_not_match_a_book_name_with_no_trailing_chapter_number() {
        let results = detect_references("Mark my words, John left early and Titus called.");
        assert!(results.is_empty());
    }

    #[test]
    fn finds_multiple_distinct_references_in_the_same_text() {
        let results = detect_references("Read Genesis 1:1 and then Revelation 21:4 for contrast.");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].book, "Genesis");
        assert_eq!(results[1].book, "Revelation");
    }

    #[test]
    fn swaps_a_reversed_verse_range_so_verse_end_is_never_less_than_verse_start() {
        let results = detect_references("Look at Psalm 23:6-1 for this example.");
        assert_eq!(results[0].verse_start, Some(6));
        assert_eq!(results[0].verse_end, Some(6));
    }

    #[test]
    fn returns_the_matched_source_text_and_character_offset() {
        let text = "In John 3:16 we read the gospel.";
        let results = detect_references(text);
        assert_eq!(results[0].source_text, "John 3:16");
        assert_eq!(&text[results[0].index..results[0].index + results[0].source_text.len()], "John 3:16");
    }

    fn test_store() -> LivingTextStore {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE translations (code TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL);
             CREATE TABLE verses (
                translation_code TEXT NOT NULL, book TEXT NOT NULL, book_number INTEGER NOT NULL,
                chapter INTEGER NOT NULL, verse INTEGER NOT NULL, text TEXT NOT NULL,
                PRIMARY KEY (translation_code, book, chapter, verse)
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO translations (code, name, language) VALUES ('KJV', 'King James Version', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO verses (translation_code, book, book_number, chapter, verse, text)
             VALUES ('KJV', 'John', 43, 3, 16, 'For God so loved the world...')",
            [],
        )
        .unwrap();
        LivingTextStore { conn }
    }

    #[test]
    fn detect_and_resolve_finds_the_cached_verse_text() {
        let store = test_store();
        let results = store.detect_and_resolve("KJV", "John 3:16 says it all.").unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].resolved);
        assert_eq!(results[0].verses[0].text, "For God so loved the world...");
    }

    #[test]
    fn detect_and_resolve_marks_unresolved_when_no_verse_rows_exist() {
        let store = test_store();
        let results = store.detect_and_resolve("KJV", "John 3:999 is out of range.").unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].resolved);
        assert!(results[0].verses.is_empty());
    }

    #[test]
    fn detect_and_resolve_fails_clearly_for_an_unsynced_translation() {
        let store = test_store();
        let error = store.detect_and_resolve("NIV", "John 3:16").unwrap_err();
        assert!(error.to_string().contains("hasn't been synced"));
    }
}
