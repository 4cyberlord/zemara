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
    /// 0.0-1.0 detection confidence (Rhema-style scoring — see `confidence`).
    pub confidence: f64,
    /// True when the book name only matched through the fuzzy (Levenshtein)
    /// alias pass. Used to drop unresolved fuzzy junk at resolve time —
    /// internal only, never serialized to the renderer.
    #[serde(skip)]
    pub fuzzy: bool,
    pub source_text: String,
    pub index: usize,
}

/// Confidence scoring mirrors the app this feature is modeled on (Rhema):
/// exact matches outrank spoken-form matches, and anything that needed the
/// fuzzy book fallback is discounted so callers can threshold auto-actions.
fn confidence(spoken: bool, fuzzy: bool, has_verse: bool) -> f64 {
    let base: f64 = match (spoken, has_verse) {
        (false, true) => 0.95,
        (false, false) => 0.75,
        (true, true) => 0.90,
        (true, false) => 0.72,
    };
    let score = if fuzzy { base - 0.10 } else { base };
    (score * 100.0).round() / 100.0
}

struct AliasEntry {
    book_number: i32,
    canonical_name: &'static str,
}

/// "1 Jn."/"1  jn" -> "1 jn" so a matched capture group can be looked up in ALIAS_MAP.
fn normalize_book_text(raw: &str) -> String {
    raw.to_lowercase()
        .replace('.', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn alias_map() -> &'static HashMap<String, AliasEntry> {
    static MAP: OnceLock<HashMap<String, AliasEntry>> = OnceLock::new();
    MAP.get_or_init(|| {
        let mut map = HashMap::new();
        for book in BIBLE_BOOKS {
            for name in std::iter::once(book.canonical_name).chain(book.aliases.iter().copied()) {
                map.insert(
                    normalize_book_text(name),
                    AliasEntry {
                        book_number: book.book_number,
                        canonical_name: book.canonical_name,
                    },
                );
            }
        }
        map
    })
}

/// Longest alias first so "Song of Solomon" is preferred over the bare
/// "Song" alias when both would otherwise be tried at the same position.
fn book_pattern() -> String {
    let mut aliases: Vec<&String> = alias_map().keys().collect();
    aliases.sort_by_key(|alias| std::cmp::Reverse(alias.len()));
    aliases
        .iter()
        .map(|alias| regex::escape(alias).replace(' ', r"\s+"))
        .collect::<Vec<_>>()
        .join("|")
}

fn reference_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        let book_pattern = book_pattern();
        let pattern = format!(
            r"\b({book_pattern})\.?\s+(\d{{1,3}})(?:\s*:\s*(\d{{1,3}})(?:\s*[-\x{{2013}}]\s*(\d{{1,3}}))?)?\b"
        );
        RegexBuilder::new(&pattern)
            .case_insensitive(true)
            .build()
            .expect("living text reference regex")
    })
}

// ---------------------------------------------------------------------------
// Spoken-form numbers — pastors say "John chapter three verse sixteen", not
// "John three colon sixteen". Digits pass through the same parser so the
// spoken patterns accept either form in each number slot.
// ---------------------------------------------------------------------------

const UNIT_WORDS: [(&str, i32); 9] = [
    ("one", 1),
    ("two", 2),
    ("three", 3),
    ("four", 4),
    ("five", 5),
    ("six", 6),
    ("seven", 7),
    ("eight", 8),
    ("nine", 9),
];
const TEEN_WORDS: [(&str, i32); 10] = [
    ("ten", 10),
    ("eleven", 11),
    ("twelve", 12),
    ("thirteen", 13),
    ("fourteen", 14),
    ("fifteen", 15),
    ("sixteen", 16),
    ("seventeen", 17),
    ("eighteen", 18),
    ("nineteen", 19),
];
const TENS_WORDS: [(&str, i32); 8] = [
    ("twenty", 20),
    ("thirty", 30),
    ("forty", 40),
    ("fifty", 50),
    ("sixty", 60),
    ("seventy", 70),
    ("eighty", 80),
    ("ninety", 90),
];

/// Regex fragment matching 1-99 as digits or English number words (units,
/// teens, tens, and "twenty two"/"twenty-two" compounds).
fn number_pattern() -> String {
    let units = UNIT_WORDS
        .iter()
        .map(|(word, _)| *word)
        .collect::<Vec<_>>()
        .join("|");
    let teens = TEEN_WORDS
        .iter()
        .map(|(word, _)| *word)
        .collect::<Vec<_>>()
        .join("|");
    let tens = TENS_WORDS
        .iter()
        .map(|(word, _)| *word)
        .collect::<Vec<_>>()
        .join("|");
    format!(r"(?:{tens})(?:[-\s](?:{units}))?|(?:{teens})|(?:{units})|\d{{1,3}}")
}

/// "three" | "sixteen" | "twenty two" | "twenty-two" | "22" -> Some(3 | 16 | 22).
/// Edge punctuation is ignored so caption tokens like "sixteen," still parse.
fn parse_number_token(raw: &str) -> Option<i32> {
    let cleaned = raw
        .trim()
        .to_lowercase()
        .trim_matches(|c: char| !c.is_alphanumeric())
        .to_string();
    if cleaned.is_empty() {
        return None;
    }
    if cleaned.chars().all(|c| c.is_ascii_digit()) {
        return cleaned.parse().ok();
    }
    if let Some((tens_raw, unit_raw)) = cleaned.split_once(['-', ' ']) {
        let tens = TENS_WORDS.iter().find(|(word, _)| *word == tens_raw)?.1;
        let unit = UNIT_WORDS.iter().find(|(word, _)| *word == unit_raw)?.1;
        return Some(tens + unit);
    }
    UNIT_WORDS
        .iter()
        .chain(TEEN_WORDS.iter())
        .chain(TENS_WORDS.iter())
        .find(|(word, _)| *word == cleaned)
        .map(|(_, value)| *value)
}

fn spoken_reference_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        let book_pattern = book_pattern();
        let num = number_pattern();
        // Two spoken shapes, keyword form first so it wins at a shared start:
        //   "John chapter three verse sixteen" / "John chapter three"
        //   "John three sixteen"
        // Ordinal book prefixes ("First Corinthians") are just aliases.
        let pattern = format!(
            r"\b({book_pattern})\.?\s+chapter\s+({num})(?:\s+verse\s+({num}))?|\b({book_pattern})\s+({num})\s+({num})\b"
        );
        RegexBuilder::new(&pattern)
            .case_insensitive(true)
            .build()
            .expect("living text spoken reference regex")
    })
}

/// Assemble a citation, collapsing reversed ranges ("23:6-1" -> 6-6) and
/// deriving match type + confidence from the pass that produced it.
#[allow(clippy::too_many_arguments)]
fn build_citation(
    canonical_name: &str,
    book_number: i32,
    chapter: i32,
    verse_start: Option<i32>,
    verse_end: Option<i32>,
    spoken: bool,
    fuzzy: bool,
    source: &str,
    index: usize,
) -> DetectedCitation {
    let verse_end = match (verse_start, verse_end) {
        (Some(start), Some(end)) if end < start => Some(start),
        _ => verse_end,
    };
    DetectedCitation {
        book: canonical_name.to_string(),
        book_number,
        chapter,
        verse_start,
        verse_end,
        match_type: if verse_start.is_some() {
            "explicit"
        } else {
            "chapter"
        },
        confidence: confidence(spoken, fuzzy, verse_start.is_some()),
        fuzzy,
        source_text: source.trim().to_string(),
        index,
    }
}

/// Exact pass — "John 3:16", "Romans 8:28-30", "1 Corinthians 13".
fn detect_exact(text: &str) -> Vec<DetectedCitation> {
    let map = alias_map();
    let mut results = Vec::new();

    for captures in reference_regex().captures_iter(text) {
        let full = captures.get(0).unwrap();
        let book_raw = captures.get(1).map(|m| m.as_str()).unwrap_or_default();
        let Some(info) = map.get(&normalize_book_text(book_raw)) else {
            continue;
        };

        let chapter: i32 = match captures.get(2).and_then(|m| m.as_str().parse().ok()) {
            Some(c) if (1..=150).contains(&c) => c,
            _ => continue,
        };

        let verse_start: Option<i32> = captures.get(3).and_then(|m| m.as_str().parse().ok());
        let verse_end: Option<i32> = captures.get(4).and_then(|m| m.as_str().parse().ok());

        results.push(build_citation(
            info.canonical_name,
            info.book_number,
            chapter,
            verse_start,
            verse_end,
            false,
            false,
            full.as_str(),
            full.start(),
        ));
    }

    results
}

/// Spoken pass — number words (or digits) in the two shapes pastors use:
/// "John chapter three verse sixteen" / "John chapter three", and the bare
/// "John three sixteen". Groups 1-3 are the keyword form, 4-6 the bare form.
fn detect_spoken(text: &str) -> Vec<DetectedCitation> {
    let map = alias_map();
    let mut results = Vec::new();

    for captures in spoken_reference_regex().captures_iter(text) {
        let full = captures.get(0).unwrap();
        let (book_raw, chapter_raw, verse_raw) = if captures.get(1).is_some() {
            (
                captures.get(1).map(|m| m.as_str()).unwrap_or_default(),
                captures.get(2).map(|m| m.as_str()).unwrap_or_default(),
                captures.get(3).map(|m| m.as_str()),
            )
        } else {
            (
                captures.get(4).map(|m| m.as_str()).unwrap_or_default(),
                captures.get(5).map(|m| m.as_str()).unwrap_or_default(),
                captures.get(6).map(|m| m.as_str()),
            )
        };
        let Some(info) = map.get(&normalize_book_text(book_raw)) else {
            continue;
        };
        let Some(chapter) = parse_number_token(chapter_raw).filter(|c| (1..=150).contains(c))
        else {
            continue;
        };
        let verse_start = verse_raw.and_then(parse_number_token);

        results.push(build_citation(
            info.canonical_name,
            info.book_number,
            chapter,
            verse_start,
            None,
            true,
            false,
            full.as_str(),
            full.start(),
        ));
    }

    results
}

// ---------------------------------------------------------------------------
// Fuzzy book fallback — runs only when the exact + spoken passes find nothing.
// Live captions mangle book names ("Roman's", "Corinthains") while keeping the
// numbers intact, so the book match is loosened (Levenshtein) while the
// trailing chapter/verse requirement stays strict — that requirement is what
// keeps "Mark my words" prose from producing phantom citations.
// ---------------------------------------------------------------------------

/// Filler words caption streams sprinkle between the book and its numbers
/// ("turn to, um, Roman's eight one"). Skipped for the fuzzy pass only, and
/// only so they can't block matching — spans still map to the original text.
const FILLER_WORDS: &[&str] = &["um", "uh", "er", "ah", "like"];

#[derive(Clone, Copy)]
struct Token<'a> {
    raw: &'a str,
    start: usize,
    end: usize,
}

fn tokenize(text: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let mut start: Option<usize> = None;
    for (index, character) in text.char_indices() {
        if character.is_whitespace() {
            if let Some(token_start) = start.take() {
                tokens.push(Token {
                    raw: &text[token_start..index],
                    start: token_start,
                    end: index,
                });
            }
        } else if start.is_none() {
            start = Some(index);
        }
    }
    if let Some(token_start) = start {
        tokens.push(Token {
            raw: &text[token_start..],
            start: token_start,
            end: text.len(),
        });
    }
    tokens
}

/// Lowercase, alphanumeric-only comparison form ("Roman's," -> "romans").
fn fuzzy_form(raw: &str) -> String {
    raw.chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn fuzzy_book_form(name: &str) -> String {
    name.split_whitespace()
        .map(fuzzy_form)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

struct FuzzyAlias {
    form: String,
    book_number: i32,
    canonical_name: &'static str,
}

fn fuzzy_aliases() -> &'static [FuzzyAlias] {
    static ALIASES: OnceLock<Vec<FuzzyAlias>> = OnceLock::new();
    ALIASES.get_or_init(|| {
        // Numbered books are often said without the ordinal ("Corinthians
        // 13"), so index the bare stem alongside each full form. Canon order
        // is preserved, so a stem tie resolves to the first numbered book.
        const ORDINAL_PREFIXES: &[&str] = &[
            "first ", "second ", "third ", "1st ", "2nd ", "3rd ", "1 ", "2 ", "3 ", "i ", "ii ",
            "iii ",
        ];
        let mut aliases = Vec::new();
        for book in BIBLE_BOOKS {
            for name in std::iter::once(book.canonical_name).chain(book.aliases.iter().copied()) {
                let form = fuzzy_book_form(name);
                aliases.push(FuzzyAlias {
                    form: form.clone(),
                    book_number: book.book_number,
                    canonical_name: book.canonical_name,
                });
                if ORDINAL_PREFIXES
                    .iter()
                    .any(|prefix| form.starts_with(prefix))
                    && let Some((_, stem)) = form.split_once(' ')
                    && !stem.is_empty()
                {
                    aliases.push(FuzzyAlias {
                        form: stem.to_string(),
                        book_number: book.book_number,
                        canonical_name: book.canonical_name,
                    });
                }
            }
        }
        aliases
    })
}

/// Levenshtein distance with an early-out ceiling — returns None as soon as
/// the distance provably exceeds `max_dist`.
fn levenshtein_within(a: &str, b: &str, max_dist: usize) -> Option<usize> {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > max_dist {
        return None;
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    for (row, ca) in a.iter().enumerate() {
        let mut current = vec![row + 1];
        let mut row_min = row + 1;
        for (column, cb) in b.iter().enumerate() {
            let substitution = previous[column] + usize::from(ca != cb);
            let value = substitution
                .min(previous[column + 1] + 1)
                .min(current[column] + 1);
            current.push(value);
            row_min = row_min.min(value);
        }
        if row_min > max_dist {
            return None;
        }
        previous = current;
    }
    let distance = previous[b.len()];
    (distance <= max_dist).then_some(distance)
}

/// "8:1" / "8:1-3" — a single-token digit reference (chapter:verse[-end]).
fn parse_digit_reference_token(raw: &str) -> Option<(i32, i32, Option<i32>)> {
    let cleaned = raw.trim().trim_matches(|c: char| !c.is_alphanumeric());
    let (chapter_raw, rest) = cleaned.split_once(':')?;
    let chapter: i32 = chapter_raw.parse().ok()?;
    let (verse_raw, end_raw) = match rest.split_once(['-', '\u{2013}']) {
        Some((verse, end)) => (verse, Some(end)),
        None => (rest, None),
    };
    let verse: i32 = verse_raw.parse().ok()?;
    let verse_end = match end_raw {
        Some(end) => Some(end.parse().ok()?),
        None => None,
    };
    Some((chapter, verse, verse_end))
}

fn looks_spoken(raw: &str) -> bool {
    raw.chars().any(|c| c.is_ascii_alphabetic())
}

/// What `parse_fuzzy_tail` parsed out of the tokens after a fuzzy book window.
struct FuzzyTail {
    chapter: i32,
    verse_start: Option<i32>,
    verse_end: Option<i32>,
    /// True when spoken forms (number words or chapter/verse keywords) were used.
    spoken: bool,
    /// How many tokens the tail consumed.
    consumed: usize,
}

/// The tokens after a fuzzy book window must open with a chapter (plus an
/// optional verse) in digit or spoken form — this strictness is what keeps
/// prose mentions of books from producing phantom citations.
fn parse_fuzzy_tail(tokens: &[Token]) -> Option<FuzzyTail> {
    let first = tokens.first()?;
    if let Some((chapter, verse, verse_end)) = parse_digit_reference_token(first.raw) {
        if !(1..=150).contains(&chapter) {
            return None;
        }
        return Some(FuzzyTail {
            chapter,
            verse_start: Some(verse),
            verse_end,
            spoken: false,
            consumed: 1,
        });
    }

    let mut index = 0;
    let mut spoken = false;
    if fuzzy_form(first.raw) == "chapter" {
        spoken = true;
        index += 1;
    }
    let chapter_token = tokens.get(index)?;
    let chapter = parse_number_token(chapter_token.raw).filter(|c| (1..=150).contains(c))?;
    spoken |= looks_spoken(chapter_token.raw);
    index += 1;

    let (verse_start, consumed) = match tokens.get(index) {
        Some(token) if fuzzy_form(token.raw) == "verse" => {
            spoken = true;
            match tokens.get(index + 1).and_then(|verse_token| {
                parse_number_token(verse_token.raw).map(|verse| (verse, verse_token))
            }) {
                Some((verse, verse_token)) => {
                    spoken |= looks_spoken(verse_token.raw);
                    (Some(verse), index + 2)
                }
                // A dangling "verse" keyword with no number — resolve to the
                // chapter alone rather than swallowing the word.
                None => (None, index),
            }
        }
        // Bare second number ("romans eight one") — the spoken "John three
        // sixteen" shape reaching the fuzzy pass via fillers/misspellings.
        Some(token) => match parse_number_token(token.raw) {
            Some(verse) => {
                spoken |= looks_spoken(token.raw);
                (Some(verse), index + 1)
            }
            None => (None, index),
        },
        None => (None, index),
    };
    Some(FuzzyTail {
        chapter,
        verse_start,
        verse_end: None,
        spoken,
        consumed,
    })
}

/// Caption tokens minus filler interjections ("um", "you know") — fillers
/// must never block a match; spans still map to the original text.
fn kept_tokens(text: &str) -> Vec<Token<'_>> {
    let tokens = tokenize(text);
    let mut kept: Vec<Token> = Vec::with_capacity(tokens.len());
    let mut index = 0;
    while index < tokens.len() {
        let form = fuzzy_form(tokens[index].raw);
        let is_you_know = form == "you"
            && tokens
                .get(index + 1)
                .is_some_and(|next| fuzzy_form(next.raw) == "know");
        if is_you_know {
            index += 2;
            continue;
        }
        if FILLER_WORDS.contains(&form.as_str()) {
            index += 1;
            continue;
        }
        kept.push(tokens[index]);
        index += 1;
    }
    kept
}

fn detect_fuzzy(text: &str) -> Vec<DetectedCitation> {
    let kept = kept_tokens(text);

    let aliases = fuzzy_aliases();
    let mut results = Vec::new();
    let mut start = 0;
    while start < kept.len() {
        let mut consumed_through: Option<usize> = None;
        // Widest window first, so "song of solomon" beats its bare "song".
        'windows: for width in (1..=4).rev() {
            let end = start + width;
            if end > kept.len() {
                continue;
            }
            let window = &kept[start..end];
            let form = window
                .iter()
                .map(|token| fuzzy_form(token.raw))
                .collect::<Vec<_>>()
                .join(" ");
            // Numbers themselves are never book names, and windows shorter
            // than 4 chars collide with ordinary prose ("ran 2 laps" would
            // otherwise fuzzy-match Daniel 2) — skip both cheaply.
            if form.len() < 4 || form.bytes().all(|b| b.is_ascii_digit() || b == b' ') {
                continue;
            }
            for alias in aliases {
                let threshold = if alias.form.len() > 8 { 2 } else { 1 };
                if levenshtein_within(&form, &alias.form, threshold).is_none() {
                    continue;
                }
                let Some(tail) = parse_fuzzy_tail(&kept[end..]) else {
                    continue;
                };
                let last = end + tail.consumed - 1;
                results.push(build_citation(
                    alias.canonical_name,
                    alias.book_number,
                    tail.chapter,
                    tail.verse_start,
                    tail.verse_end,
                    tail.spoken,
                    true,
                    &text[window[0].start..kept[last].end],
                    window[0].start,
                ));
                consumed_through = Some(last + 1);
                break 'windows;
            }
        }
        start = consumed_through.unwrap_or(start + 1);
    }
    results
}

// ---------------------------------------------------------------------------
// Tolerant spoken pass — live captions insert ASR garbage between the book
// and its numbers ("GENESIS JUP THE FIVE VASE FIVE"), which defeats both the
// exact and spoken regexes. After a book match (exact or fuzzy alias), scan
// forward collecting up to two number tokens, skipping a bounded number of
// non-number garbage tokens. A skipped token that is itself a book name stops
// the scan so citations never cross-consume ("GENESIS FIVE EXODUS THREE" is
// Genesis 5 + Exodus 3, never Genesis 5:3).
// ---------------------------------------------------------------------------

/// Garbage tokens a rescued citation may skip between the book and its numbers.
const MAX_TOLERANT_SKIPS: usize = 4;

/// Rescued-confidence scoring: garbage was skipped, so the match scores below
/// a clean spoken match (0.90/0.72) but above the fuzzy fallback's discounted
/// scores. A fuzzy book match takes the same -0.10 discount as elsewhere.
fn tolerant_confidence(fuzzy_book: bool, has_verse: bool) -> f64 {
    let base: f64 = if has_verse { 0.80 } else { 0.65 };
    let score = if fuzzy_book { base - 0.10 } else { base };
    (score * 100.0).round() / 100.0
}

struct TolerantBook {
    book_number: i32,
    canonical_name: &'static str,
    /// True when Levenshtein distance was needed (fuzzy alias match).
    fuzzy: bool,
    /// How many tokens the book window consumed.
    width: usize,
}

/// Exact alias forms win over fuzzy ones at the same position; widest window
/// first so "song of solomon" beats its bare "song".
fn match_tolerant_book(tokens: &[Token], start: usize) -> Option<TolerantBook> {
    let aliases = fuzzy_aliases();
    for width in (1..=4).rev() {
        let end = start + width;
        if end > tokens.len() {
            continue;
        }
        let form = tokens[start..end]
            .iter()
            .map(|token| fuzzy_form(token.raw))
            .collect::<Vec<_>>()
            .join(" ");
        // Numbers themselves are never book names, and windows shorter than 4
        // chars collide with ordinary prose (mirrors the fuzzy pass's guard).
        if form.len() < 4 || form.bytes().all(|b| b.is_ascii_digit() || b == b' ') {
            continue;
        }
        if let Some(alias) = aliases.iter().find(|alias| alias.form == form) {
            return Some(TolerantBook {
                book_number: alias.book_number,
                canonical_name: alias.canonical_name,
                fuzzy: false,
                width,
            });
        }
        if let Some(alias) = aliases.iter().find(|alias| {
            let threshold = if alias.form.len() > 8 { 2 } else { 1 };
            levenshtein_within(&form, &alias.form, threshold).is_some()
        }) {
            return Some(TolerantBook {
                book_number: alias.book_number,
                canonical_name: alias.canonical_name,
                fuzzy: true,
                width,
            });
        }
    }
    None
}

/// True when a window starting at `tokens[index]` is exactly a book name or
/// alias — such a token must never be swallowed as ASR garbage.
fn starts_book_window(tokens: &[Token], index: usize) -> bool {
    let aliases = fuzzy_aliases();
    for width in 1..=4 {
        let end = index + width;
        if end > tokens.len() {
            break;
        }
        let form = tokens[index..end]
            .iter()
            .map(|token| fuzzy_form(token.raw))
            .collect::<Vec<_>>()
            .join(" ");
        if form.len() >= 4 && aliases.iter().any(|alias| alias.form == form) {
            return true;
        }
    }
    false
}

struct TolerantTail {
    chapter: i32,
    verse_start: Option<i32>,
    /// How many tokens the tail consumed.
    consumed: usize,
}

/// Collect up to two numbers after the book, skipping ASR garbage. A single
/// number separated from the book by garbage only counts when a "chapter"
/// keyword was among the skips — otherwise prose like "Titus ran 2 laps"
/// would produce phantom chapter citations. Hitting another book name stops
/// the scan and keeps whatever was collected so far.
fn parse_tolerant_tail(tokens: &[Token], start: usize) -> Option<TolerantTail> {
    let mut numbers: Vec<i32> = Vec::new();
    let mut skips = 0usize;
    let mut skips_before_first_number = 0usize;
    let mut saw_chapter_keyword = false;
    let mut index = start;
    while index < tokens.len() && numbers.len() < 2 {
        let token = tokens[index];
        if let Some(value) = parse_number_token(token.raw) {
            let is_chapter = numbers.is_empty();
            if value < 1 || (is_chapter && value > 150) {
                return None;
            }
            numbers.push(value);
        } else {
            if starts_book_window(tokens, index) {
                break;
            }
            skips += 1;
            if skips > MAX_TOLERANT_SKIPS {
                return None;
            }
            if numbers.is_empty() {
                skips_before_first_number += 1;
                saw_chapter_keyword |= fuzzy_form(token.raw) == "chapter";
            }
        }
        index += 1;
    }
    let chapter = *numbers.first()?;
    let verse_start = numbers.get(1).copied();
    if verse_start.is_none() && skips_before_first_number > 0 && !saw_chapter_keyword {
        return None;
    }
    Some(TolerantTail {
        chapter,
        verse_start,
        consumed: index - start,
    })
}

fn detect_tolerant_spoken(text: &str) -> Vec<DetectedCitation> {
    let kept = kept_tokens(text);
    let mut results = Vec::new();
    let mut start = 0;
    while start < kept.len() {
        let Some(book) = match_tolerant_book(&kept, start) else {
            start += 1;
            continue;
        };
        let tail_start = start + book.width;
        let Some(tail) = parse_tolerant_tail(&kept, tail_start) else {
            start += 1;
            continue;
        };
        let last = tail_start + tail.consumed - 1;
        results.push(DetectedCitation {
            book: book.canonical_name.to_string(),
            book_number: book.book_number,
            chapter: tail.chapter,
            verse_start: tail.verse_start,
            verse_end: None,
            match_type: if tail.verse_start.is_some() {
                "explicit"
            } else {
                "chapter"
            },
            confidence: tolerant_confidence(book.fuzzy, tail.verse_start.is_some()),
            fuzzy: book.fuzzy,
            source_text: text[kept[start].start..kept[last].end].to_string(),
            index: kept[start].start,
        });
        start = last + 1;
    }
    results
}

/// Regex-based citation detector — exact ("John 3:16", "Romans 8:28-30",
/// "1 Corinthians 13"), then spoken-form ("John chapter three verse sixteen",
/// "John three sixteen"), then a tolerant spoken pass that skips ASR garbage
/// between the book and its numbers, then a fuzzy book fallback for
/// misspelled or possessive book names when the other passes find nothing.
/// Callers resolve chapter/verse existence against the local verse cache (see
/// `detect_and_resolve`).
pub fn detect_references(text: &str) -> Vec<DetectedCitation> {
    let exact = detect_exact(text);
    // A spoken match overlapping an exact match ("Exodus 20 3" — exact reads
    // the chapter, the bare spoken form reads 20:3) defers to the exact match
    // so exact-pass behavior stays untouched.
    let mut spoken: Vec<DetectedCitation> = detect_spoken(text)
        .into_iter()
        .filter(|citation| !exact.iter().any(|e| spans_overlap(e, citation)))
        .collect();

    // Tolerant pass span conflicts resolve the same way: exact always wins,
    // a spoken chapter+verse match wins, and a rescued chapter+verse match
    // upgrades a spoken chapter-only reading of the same span ("GENESIS
    // CHAPTER FIVE YEARS FIVE" -> Genesis 5:5, not just Genesis 5).
    let mut tolerant = Vec::new();
    for rescued in detect_tolerant_spoken(text) {
        if exact.iter().any(|e| spans_overlap(e, &rescued)) {
            continue;
        }
        if let Some(position) = spoken.iter().position(|s| spans_overlap(s, &rescued)) {
            if spoken[position].verse_start.is_some() || rescued.verse_start.is_none() {
                continue;
            }
            spoken.remove(position);
        }
        tolerant.push(rescued);
    }

    let mut results = exact;
    results.extend(spoken);
    results.extend(tolerant);
    if results.is_empty() {
        results = detect_fuzzy(text);
    }
    results.sort_by_key(|citation| citation.index);
    results
}

fn spans_overlap(a: &DetectedCitation, b: &DetectedCitation) -> bool {
    let a_end = a.index + a.source_text.len();
    let b_end = b.index + b.source_text.len();
    a.index < b_end && b.index < a_end
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
        .map(|book| BookSummary {
            book_number: book.book_number,
            name: book.canonical_name.to_string(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerseSearchHit {
    pub book: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    /// Short excerpt with match terms wrapped in `**...**` markers.
    pub snippet: String,
}

pub struct LivingTextStore {
    conn: Connection,
}

fn database_path() -> PathBuf {
    if let Some(custom) = std::env::var_os("VIDEORC_LIVING_TEXT_DB_PATH") {
        return PathBuf::from(custom);
    }
    let home = std::env::var_os(if cfg!(target_os = "windows") {
        "USERPROFILE"
    } else {
        "HOME"
    })
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("."));

    #[cfg(target_os = "macos")]
    {
        home.join("Library")
            .join("Application Support")
            .join("Videorc")
            .join("living-text.sqlite3")
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
        let conn = Connection::open(&path).with_context(|| {
            format!("Could not open the Living Text cache at {}", path.display())
        })?;
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
                ON verses(translation_code, book, chapter);
             -- FTS5 virtual table for full-text verse search (content table mode).
             -- Mirrors the `verses` table so no extra storage for the text itself.
             CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts
             USING fts5(
                 translation_code UNINDEXED,
                 book UNINDEXED,
                 book_number UNINDEXED,
                 chapter UNINDEXED,
                 verse UNINDEXED,
                 text,
                 content='verses',
                 content_rowid='rowid',
                 tokenize='porter unicode61'
             );
             -- Triggers to keep verses_fts in sync after sync_translation rebuilds rows.
             CREATE TRIGGER IF NOT EXISTS verses_fts_ai
             AFTER INSERT ON verses BEGIN
                 INSERT INTO verses_fts(rowid, translation_code, book, book_number, chapter, verse, text)
                 VALUES (new.rowid, new.translation_code, new.book, new.book_number, new.chapter, new.verse, new.text);
             END;
             CREATE TRIGGER IF NOT EXISTS verses_fts_ad
             AFTER DELETE ON verses BEGIN
                 INSERT INTO verses_fts(verses_fts, rowid, translation_code, book, book_number, chapter, verse, text)
                 VALUES ('delete', old.rowid, old.translation_code, old.book, old.book_number, old.chapter, old.verse, old.text);
             END;",
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
        // Delete verses (FTS trigger will clean up verses_fts)
        tx.execute(
            "DELETE FROM verses WHERE translation_code = ?1",
            params![export.translation.code],
        )?;
        tx.execute(
            "INSERT INTO translations (code, name, language) VALUES (?1, ?2, ?3)
             ON CONFLICT(code) DO UPDATE SET name = excluded.name, language = excluded.language",
            params![
                export.translation.code,
                export.translation.name,
                export.translation.language
            ],
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
        // Rebuild the FTS index so search works on the newly synced content
        // even if old triggers didn't fire (e.g., if verses_fts was created
        // after the initial population).
        self.conn
            .execute_batch("INSERT INTO verses_fts(verses_fts) VALUES('rebuild');")
            .ok(); // non-fatal: FTS will still work via auto-triggers next time
        Ok(SyncSummary {
            code: export.translation.code,
            name: export.translation.name,
            verse_count,
        })
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
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not list Living Text translations.")
    }

    pub fn get_chapter(
        &self,
        translation_code: &str,
        book: &str,
        chapter: i32,
    ) -> Result<Vec<LocalVerse>> {
        let mut stmt = self.conn.prepare(
            "SELECT book, book_number, chapter, verse, text FROM verses
             WHERE translation_code = ?1 AND book = ?2 AND chapter = ?3
             ORDER BY verse",
        )?;
        let rows = stmt.query_map(
            params![translation_code, book, chapter],
            Self::map_verse_row,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not load the chapter.")
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
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not load the verse range.")
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

    /// Full-text search across the verse cache for a given translation.
    ///
    /// Uses the SQLite FTS5 porter-stemmed index. Returns up to `limit` results
    /// ordered by relevance (BM25 rank). Each result includes a short `snippet`
    /// (~60 chars of context around the match, with **bold** markers).
    ///
    /// `book_filter` — if `Some("John")`, restricts to that book only.
    pub fn search_verses(
        &self,
        translation_code: &str,
        query: &str,
        book_filter: Option<&str>,
        limit: usize,
    ) -> Result<Vec<VerseSearchHit>> {
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

        let sql = if book_filter.is_some() {
            "SELECT book, book_number, chapter, verse,
                    snippet(verses_fts, 5, '**', '**', '…', 12) as snippet,
                    rank
             FROM verses_fts
             WHERE verses_fts MATCH ?1
               AND translation_code = ?2
               AND book = ?3
             ORDER BY rank
             LIMIT ?4"
        } else {
            "SELECT book, book_number, chapter, verse,
                    snippet(verses_fts, 5, '**', '**', '…', 12) as snippet,
                    rank
             FROM verses_fts
             WHERE verses_fts MATCH ?1
               AND translation_code = ?2
             ORDER BY rank
             LIMIT ?3"
        };

        // Sanitize query: escape special FTS5 chars that would cause a parse error
        let safe_query = Self::sanitize_fts_query(query);

        let results = if let Some(book) = book_filter {
            let mut stmt = self.conn.prepare(sql)?;
            let rows = stmt.query_map(
                params![safe_query, translation_code, book, limit as i64],
                Self::map_search_row,
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        } else {
            let mut stmt = self.conn.prepare(sql)?;
            let rows = stmt.query_map(
                params![safe_query, translation_code, limit as i64],
                Self::map_search_row,
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        };

        results.context("Full-text search failed")
    }

    fn sanitize_fts_query(q: &str) -> String {
        // Strip chars that have special meaning in FTS5 queries to prevent
        // malformed-query errors from user input. We keep letters, digits,
        // spaces, and apostrophes (for contractions). Wrap in double-quotes
        // for a phrase search so multi-word input does what users expect.
        let clean: String = q
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '\'' || c == ' ' {
                    c
                } else {
                    ' '
                }
            })
            .collect();
        let trimmed = clean.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        // If it is a single word, search as-is (porter stemming applies);
        // multiple words → phrase search in double quotes.
        if trimmed.split_whitespace().count() == 1 {
            trimmed.to_string()
        } else {
            format!("\"{trimmed}\"")
        }
    }

    fn map_search_row(row: &rusqlite::Row) -> rusqlite::Result<VerseSearchHit> {
        Ok(VerseSearchHit {
            book: row.get(0)?,
            book_number: row.get(1)?,
            chapter: row.get(2)?,
            verse: row.get(3)?,
            snippet: row.get(4)?,
        })
    }

    /// Resolve a free-text reference string (e.g. "John 3:16" or
    /// "Romans 8:28-30") to its verse(s) in the cache. This is a thin wrapper
    /// around `detect_and_resolve` that returns only the primary resolved verses
    /// for display as cross-references.
    pub fn resolve_reference(
        &self,
        translation_code: &str,
        reference_text: &str,
    ) -> Result<Vec<LocalVerse>> {
        let has_translation: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM translations WHERE code = ?1)",
            params![translation_code],
            |row| row.get(0),
        )?;
        if !has_translation {
            bail!("The \"{translation_code}\" translation hasn't been synced to this device yet.");
        }
        let resolved = self.detect_and_resolve(translation_code, reference_text)?;
        let verses: Vec<LocalVerse> = resolved
            .into_iter()
            .filter(|r| r.resolved)
            .flat_map(|r| r.verses)
            .collect();
        Ok(verses)
    }

    /// Detects citations in `text` and resolves each against the local cache
    /// for `translation_code`. Fails clearly if that translation was never
    /// synced (see `sync_translation`) rather than silently returning nothing.
    pub fn detect_and_resolve(
        &self,
        translation_code: &str,
        text: &str,
    ) -> Result<Vec<ResolvedCitation>> {
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
            // Fuzzy-path junk: a citation whose book only matched through the
            // fuzzy alias pass AND whose verses don't exist is ASR garbage
            // ("THUS SEVEN" -> 1 Thessalonians 7), not useful feedback — drop
            // it entirely rather than surfacing a phantom in the context feed.
            if verses.is_empty() && citation.fuzzy {
                continue;
            }
            resolved.push(ResolvedCitation {
                resolved: !verses.is_empty(),
                citation,
                verses,
            });
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
        assert_eq!(
            &text[results[0].index..results[0].index + results[0].source_text.len()],
            "John 3:16"
        );
    }

    // --- Spoken-form detection ---------------------------------------------

    #[test]
    fn scores_explicit_verse_and_chapter_confidence() {
        let verse = detect_references("John 3:16");
        assert_eq!(verse[0].confidence, 0.95);
        let chapter = detect_references("Romans 8");
        assert_eq!(chapter[0].confidence, 0.75);
    }

    #[test]
    fn detects_spoken_chapter_verse_keyword_form() {
        let results = detect_references("Turn to John chapter three verse sixteen today.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "John");
        assert_eq!(results[0].chapter, 3);
        assert_eq!(results[0].verse_start, Some(16));
        assert_eq!(results[0].match_type, "explicit");
        assert_eq!(results[0].confidence, 0.90);
        assert_eq!(results[0].source_text, "John chapter three verse sixteen");
    }

    #[test]
    fn detects_spoken_bare_chapter_verse_form() {
        let results = detect_references("Everyone knows John three sixteen by heart.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "John");
        assert_eq!(results[0].chapter, 3);
        assert_eq!(results[0].verse_start, Some(16));
        assert_eq!(results[0].match_type, "explicit");
        assert_eq!(results[0].confidence, 0.90);
    }

    #[test]
    fn detects_spoken_form_with_ordinal_book_prefix() {
        let results = detect_references(
            "First Corinthians chapter thirteen verse four tells us what love is.",
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "1 Corinthians");
        assert_eq!(results[0].chapter, 13);
        assert_eq!(results[0].verse_start, Some(4));
        assert_eq!(results[0].confidence, 0.90);
    }

    #[test]
    fn detects_spoken_chapter_only_form() {
        let results = detect_references("Let's read John chapter three together this morning.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "John");
        assert_eq!(results[0].chapter, 3);
        assert_eq!(results[0].verse_start, None);
        assert_eq!(results[0].match_type, "chapter");
        assert_eq!(results[0].confidence, 0.72);
    }

    #[test]
    fn detects_compound_number_words_spaced_and_hyphenated() {
        let spaced = detect_references("John chapter three verse twenty two is next.");
        assert_eq!(spaced[0].verse_start, Some(22));
        let hyphenated = detect_references("Isaiah chapter twenty-two is a comfort.");
        assert_eq!(hyphenated[0].chapter, 22);
        assert_eq!(hyphenated[0].match_type, "chapter");
    }

    #[test]
    fn spoken_pass_accepts_digits_in_the_keyword_form() {
        let results = detect_references("Open to John chapter 3 verse 16 please.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].verse_start, Some(16));
        assert_eq!(results[0].confidence, 0.90);
    }

    // --- Tolerant spoken pass (ASR garbage between book and numbers) ---------

    #[test]
    fn tolerant_rescues_a_verse_when_garbage_follows_the_chapter_keyword() {
        let results = detect_references("GENESIS CHAPTER FIVE YEARS FIVE");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Genesis");
        assert_eq!(results[0].chapter, 5);
        assert_eq!(results[0].verse_start, Some(5));
        assert_eq!(results[0].match_type, "explicit");
        assert_eq!(results[0].confidence, 0.80);
    }

    #[test]
    fn tolerant_rescues_a_heavily_garbled_spoken_citation() {
        let results = detect_references("GENESIS JUP THE FIVE VASE FIVE");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Genesis");
        assert_eq!(results[0].chapter, 5);
        assert_eq!(results[0].verse_start, Some(5));
        assert_eq!(results[0].match_type, "explicit");
        assert_eq!(results[0].confidence, 0.80);
    }

    #[test]
    fn tolerant_single_number_right_after_the_book_stays_chapter_level() {
        let results = detect_references("GENESIS FIVE");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Genesis");
        assert_eq!(results[0].chapter, 5);
        assert_eq!(results[0].verse_start, None);
        assert_eq!(results[0].match_type, "chapter");
        assert_eq!(results[0].confidence, 0.65);
    }

    #[test]
    fn tolerant_never_cross_consumes_another_books_numbers() {
        let results = detect_references("GENESIS FIVE EXODUS THREE");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].book, "Genesis");
        assert_eq!(results[0].chapter, 5);
        assert_eq!(results[0].verse_start, None);
        assert_eq!(results[1].book, "Exodus");
        assert_eq!(results[1].chapter, 3);
        assert_eq!(results[1].verse_start, None);
    }

    #[test]
    fn tolerant_prose_with_unrelated_numbers_still_yields_nothing() {
        let results = detect_references("Titus ran 2 laps and Mark scored 3 goals.");
        assert!(results.is_empty());
    }

    #[test]
    fn tolerant_chapter_keyword_allows_garbage_before_a_chapter_only_number() {
        let results = detect_references("read Roman's chapter eight tonight");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Romans");
        assert_eq!(results[0].chapter, 8);
        assert_eq!(results[0].verse_start, None);
        assert_eq!(results[0].match_type, "chapter");
        assert_eq!(results[0].confidence, 0.65);
    }

    // --- Fuzzy book fallback -------------------------------------------------

    #[test]
    fn exact_matches_are_not_downgraded_to_fuzzy() {
        let results = detect_references("Romans 8:1");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Romans");
        assert_eq!(results[0].confidence, 0.95);
    }

    #[test]
    fn fuzzy_matches_a_possessive_book_name() {
        let results = detect_references("Roman's 8:1 says there is now no condemnation.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Romans");
        assert_eq!(results[0].chapter, 8);
        assert_eq!(results[0].verse_start, Some(1));
        assert_eq!(results[0].match_type, "explicit");
        assert_eq!(results[0].confidence, 0.85);
        assert_eq!(results[0].source_text, "Roman's 8:1");
    }

    #[test]
    fn fuzzy_matches_a_misspelled_book_via_the_ordinal_stem() {
        let results = detect_references("Corinthains 13:4 is the love passage.");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "1 Corinthians");
        assert_eq!(results[0].chapter, 13);
        assert_eq!(results[0].verse_start, Some(4));
        assert_eq!(results[0].confidence, 0.85);
    }

    #[test]
    fn fuzzy_match_with_spoken_numbers_uses_the_spoken_base() {
        let results = detect_references("turn to, um, Roman's eight one now");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Romans");
        assert_eq!(results[0].chapter, 8);
        assert_eq!(results[0].verse_start, Some(1));
        assert_eq!(results[0].confidence, 0.80);
    }

    #[test]
    fn fuzzy_fillers_between_book_and_numbers_do_not_block_the_match() {
        let results = detect_references("and, like, Roman's, uh, 8:1 okay");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "Romans");
        assert_eq!(results[0].verse_start, Some(1));
        assert_eq!(results[0].source_text, "Roman's, uh, 8:1");
    }

    #[test]
    fn fuzzy_source_span_indexes_the_original_text() {
        let text = "Go to Corinthains 13:4 now.";
        let results = detect_references(text);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_text, "Corinthains 13:4");
        assert_eq!(
            &text[results[0].index..results[0].index + results[0].source_text.len()],
            "Corinthains 13:4"
        );
    }

    #[test]
    fn fuzzy_prose_without_numbers_still_yields_nothing() {
        let results = detect_references("We love the Roman road and the Corinthian church.");
        assert!(results.is_empty());
    }

    #[test]
    fn fuzzy_prose_with_unrelated_numbers_still_yields_nothing() {
        let results = detect_references("Mark scored 3 goals and Titus ran 2 laps.");
        assert!(results.is_empty());
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
        let results = store
            .detect_and_resolve("KJV", "John 3:16 says it all.")
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].resolved);
        assert_eq!(results[0].verses[0].text, "For God so loved the world...");
    }

    #[test]
    fn detect_and_resolve_marks_unresolved_when_no_verse_rows_exist() {
        let store = test_store();
        let results = store
            .detect_and_resolve("KJV", "John 3:999 is out of range.")
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].resolved);
        assert!(results[0].verses.is_empty());
    }

    #[test]
    fn detect_and_resolve_drops_unresolved_fuzzy_garbage() {
        let store = test_store();
        // "thus seven" fuzzy-matches the "thes" alias (1 Thessalonians 7), a
        // chapter that doesn't exist — ASR garbage like this must not surface
        // in the context feed at all.
        let results = store.detect_and_resolve("KJV", "thus seven").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn detect_and_resolve_finds_a_rescued_garbage_separated_verse() {
        let store = test_store();
        let results = store
            .detect_and_resolve("KJV", "JOHN CHAPTER THREE YEARS SIXTEEN")
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].resolved);
        assert_eq!(results[0].citation.confidence, 0.80);
        assert_eq!(results[0].verses[0].text, "For God so loved the world...");
    }

    #[test]
    fn detect_and_resolve_fails_clearly_for_an_unsynced_translation() {
        let store = test_store();
        let error = store.detect_and_resolve("NIV", "John 3:16").unwrap_err();
        assert!(error.to_string().contains("hasn't been synced"));
    }
}
