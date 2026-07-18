//! Living Text book catalog — canonical book names + common abbreviations for
//! citation detection. Canonical names here must match exactly what
//! prophet-roja-admin's bible verse import writes to the `book` column (see
//! prophet-roja-admin/scripts/import-bible-translations.mjs's
//! BOOK_NAME_OVERRIDES) so a detected reference can be looked up in the local
//! cache directly, no second normalization pass.

pub struct BibleBook {
    pub book_number: i32,
    pub canonical_name: &'static str,
    pub aliases: &'static [&'static str],
}

pub const BIBLE_BOOKS: &[BibleBook] = &[
    BibleBook { book_number: 1, canonical_name: "Genesis", aliases: &["Gen", "Gn"] },
    BibleBook { book_number: 2, canonical_name: "Exodus", aliases: &["Exod", "Exo", "Ex"] },
    BibleBook { book_number: 3, canonical_name: "Leviticus", aliases: &["Lev", "Lv"] },
    BibleBook { book_number: 4, canonical_name: "Numbers", aliases: &["Num", "Numb", "Nm"] },
    BibleBook { book_number: 5, canonical_name: "Deuteronomy", aliases: &["Deut", "Dt"] },
    BibleBook { book_number: 6, canonical_name: "Joshua", aliases: &["Josh", "Jos"] },
    BibleBook { book_number: 7, canonical_name: "Judges", aliases: &["Judg", "Jdg"] },
    BibleBook { book_number: 8, canonical_name: "Ruth", aliases: &["Rth", "Ru"] },
    BibleBook {
        book_number: 9,
        canonical_name: "1 Samuel",
        aliases: &["1 Sam", "I Samuel", "First Samuel", "1st Samuel"],
    },
    BibleBook {
        book_number: 10,
        canonical_name: "2 Samuel",
        aliases: &["2 Sam", "II Samuel", "Second Samuel", "2nd Samuel"],
    },
    BibleBook {
        book_number: 11,
        canonical_name: "1 Kings",
        aliases: &["1 Kgs", "I Kings", "First Kings", "1st Kings"],
    },
    BibleBook {
        book_number: 12,
        canonical_name: "2 Kings",
        aliases: &["2 Kgs", "II Kings", "Second Kings", "2nd Kings"],
    },
    BibleBook {
        book_number: 13,
        canonical_name: "1 Chronicles",
        aliases: &["1 Chron", "1 Chr", "I Chronicles", "First Chronicles", "1st Chronicles"],
    },
    BibleBook {
        book_number: 14,
        canonical_name: "2 Chronicles",
        aliases: &["2 Chron", "2 Chr", "II Chronicles", "Second Chronicles", "2nd Chronicles"],
    },
    BibleBook { book_number: 15, canonical_name: "Ezra", aliases: &["Ezr"] },
    BibleBook { book_number: 16, canonical_name: "Nehemiah", aliases: &["Neh"] },
    BibleBook { book_number: 17, canonical_name: "Esther", aliases: &["Esth", "Est"] },
    BibleBook { book_number: 18, canonical_name: "Job", aliases: &["Jb"] },
    BibleBook { book_number: 19, canonical_name: "Psalms", aliases: &["Psalm", "Ps", "Pslm", "Psa"] },
    BibleBook { book_number: 20, canonical_name: "Proverbs", aliases: &["Prov", "Pr"] },
    BibleBook { book_number: 21, canonical_name: "Ecclesiastes", aliases: &["Eccl", "Eccles", "Ecc"] },
    BibleBook {
        book_number: 22,
        canonical_name: "Song of Solomon",
        aliases: &["Song of Songs", "Song", "SoS", "Canticles"],
    },
    BibleBook { book_number: 23, canonical_name: "Isaiah", aliases: &["Isa"] },
    BibleBook { book_number: 24, canonical_name: "Jeremiah", aliases: &["Jer"] },
    BibleBook { book_number: 25, canonical_name: "Lamentations", aliases: &["Lam"] },
    BibleBook { book_number: 26, canonical_name: "Ezekiel", aliases: &["Ezek", "Eze"] },
    BibleBook { book_number: 27, canonical_name: "Daniel", aliases: &["Dan"] },
    BibleBook { book_number: 28, canonical_name: "Hosea", aliases: &["Hos"] },
    BibleBook { book_number: 29, canonical_name: "Joel", aliases: &["Jl"] },
    BibleBook { book_number: 30, canonical_name: "Amos", aliases: &["Am"] },
    BibleBook { book_number: 31, canonical_name: "Obadiah", aliases: &["Obad", "Ob"] },
    BibleBook { book_number: 32, canonical_name: "Jonah", aliases: &["Jnh", "Jon"] },
    BibleBook { book_number: 33, canonical_name: "Micah", aliases: &["Mic"] },
    BibleBook { book_number: 34, canonical_name: "Nahum", aliases: &["Nah"] },
    BibleBook { book_number: 35, canonical_name: "Habakkuk", aliases: &["Hab"] },
    BibleBook { book_number: 36, canonical_name: "Zephaniah", aliases: &["Zeph", "Zep"] },
    BibleBook { book_number: 37, canonical_name: "Haggai", aliases: &["Hag"] },
    BibleBook { book_number: 38, canonical_name: "Zechariah", aliases: &["Zech", "Zec"] },
    BibleBook { book_number: 39, canonical_name: "Malachi", aliases: &["Mal"] },
    BibleBook { book_number: 40, canonical_name: "Matthew", aliases: &["Matt", "Mt"] },
    BibleBook { book_number: 41, canonical_name: "Mark", aliases: &["Mrk", "Mk"] },
    BibleBook { book_number: 42, canonical_name: "Luke", aliases: &["Lk"] },
    BibleBook { book_number: 43, canonical_name: "John", aliases: &["Jn", "Jhn"] },
    BibleBook { book_number: 44, canonical_name: "Acts", aliases: &["Ac"] },
    BibleBook { book_number: 45, canonical_name: "Romans", aliases: &["Rom"] },
    BibleBook {
        book_number: 46,
        canonical_name: "1 Corinthians",
        aliases: &["1 Cor", "I Corinthians", "First Corinthians", "1st Corinthians"],
    },
    BibleBook {
        book_number: 47,
        canonical_name: "2 Corinthians",
        aliases: &["2 Cor", "II Corinthians", "Second Corinthians", "2nd Corinthians"],
    },
    BibleBook { book_number: 48, canonical_name: "Galatians", aliases: &["Gal"] },
    BibleBook { book_number: 49, canonical_name: "Ephesians", aliases: &["Eph"] },
    BibleBook { book_number: 50, canonical_name: "Philippians", aliases: &["Phil", "Php"] },
    BibleBook { book_number: 51, canonical_name: "Colossians", aliases: &["Col"] },
    BibleBook {
        book_number: 52,
        canonical_name: "1 Thessalonians",
        aliases: &["1 Thess", "1 Thes", "I Thessalonians", "First Thessalonians", "1st Thessalonians"],
    },
    BibleBook {
        book_number: 53,
        canonical_name: "2 Thessalonians",
        aliases: &["2 Thess", "2 Thes", "II Thessalonians", "Second Thessalonians", "2nd Thessalonians"],
    },
    BibleBook {
        book_number: 54,
        canonical_name: "1 Timothy",
        aliases: &["1 Tim", "I Timothy", "First Timothy", "1st Timothy"],
    },
    BibleBook {
        book_number: 55,
        canonical_name: "2 Timothy",
        aliases: &["2 Tim", "II Timothy", "Second Timothy", "2nd Timothy"],
    },
    BibleBook { book_number: 56, canonical_name: "Titus", aliases: &["Tit"] },
    BibleBook { book_number: 57, canonical_name: "Philemon", aliases: &["Philem", "Phm"] },
    BibleBook { book_number: 58, canonical_name: "Hebrews", aliases: &["Heb"] },
    BibleBook { book_number: 59, canonical_name: "James", aliases: &["Jas"] },
    BibleBook {
        book_number: 60,
        canonical_name: "1 Peter",
        aliases: &["1 Pet", "I Peter", "First Peter", "1st Peter"],
    },
    BibleBook {
        book_number: 61,
        canonical_name: "2 Peter",
        aliases: &["2 Pet", "II Peter", "Second Peter", "2nd Peter"],
    },
    BibleBook {
        book_number: 62,
        canonical_name: "1 John",
        aliases: &["1 Jn", "I John", "First John", "1st John"],
    },
    BibleBook {
        book_number: 63,
        canonical_name: "2 John",
        aliases: &["2 Jn", "II John", "Second John", "2nd John"],
    },
    BibleBook {
        book_number: 64,
        canonical_name: "3 John",
        aliases: &["3 Jn", "III John", "Third John", "3rd John"],
    },
    BibleBook { book_number: 65, canonical_name: "Jude", aliases: &["Jud"] },
    BibleBook { book_number: 66, canonical_name: "Revelation", aliases: &["Rev", "Revelations", "Apocalypse"] },
];
