# Mushafi 3.0.44 (94): optional English Quran meanings

## Authorized source and scope
The user accepted Saheeh International from Tanzil after Quran.com/API returned HTTP 403 and the official API documentation required developer credentials. The user requested no visible source line. Only one individual translation is included. No provider/translator credit line is rendered in the reader; original provenance, exact source file and non-commercial terms are retained in metadata and source documentation. App distribution is currently free and without advertisements. More than three Tanzil translations or commercial use require the additional conditions documented in TANZIL-ENGLISH-MEANINGS-TERMS.txt.

Official download: https://tanzil.net/trans/en.sahih
Retrieved: 2026-10-28; publisher file last-update header: April 24, 2011.
Original SHA256: a1778a1a56695d9b59ae910809ec46d9f4a55f05961de51cd56e6ebcf9040883
No text was machine-translated, rewritten, trimmed, or taken from a different publisher.

## Reader behavior
- English interface only: Arabic / English buttons appear in the Quran reading tools. Tap the reading screen to show the tools. Arabic-interface users have neither this switch nor English content.
- Arabic is the default. The device-local text-language preference is separate from interface language and is not synced or included in backups.
- English shows the translation of meanings, with full verse texts and numbers on the corresponding printed Quran pages. A verse spanning printed pages can appear in full on both pages; it is never arbitrarily cut into English fragments.
- Vertical scrolling handles long texts, including 2:282. Phone, tablet and landscape spreads are supported. Horizontal page navigation and existing verse actions retain their verse keys.
- The opening basmala uses the same source's 1:1 text, without an invented verse number. It is not duplicated in Al-Fatihah or inserted before At-Tawbah.
- Text-mode switching replaces only visible leaves, bypassing navigation/save hooks. Main reading, khatma state, smart-reading context and audio state remain independent.
- Smart surah sessions filter out neighboring surahs. Arabic audio can follow/highlight the matching English verse; recitation itself remains Arabic.
- Latest navigation/switch intent wins while data loads. A failed/invalid dataset leaves Arabic available.
- Original Arabic verses in action sheets remain protected from UI localization.

## Validation and limits
- Both release gates and tools/verify-english-meanings.cjs verify 6236 unique records, exact equality with the retained publisher text and the source SHA256. Canonical chapter/verse coverage matches all 114 Arabic chapters and all 604 pages.
- test-quran-translation.cjs passed exact displayed text, English-only visibility, absence of a source line, scrolling by mouse and real CDP touch gestures, 320/393/740/1280 layouts, long verses, Arabic keyboard words, basmala rules, stable main/khatma positions, smart-surah boundaries, audio-follow without changing playback state and cancellation of delayed navigation.
- Existing English-interface regression test passed, including unchanged Quran/tafsir/adhkar, source option values and independent anchors.
- Data is bundled offline. No new API key, network permission, account requirement or cloud field is introduced.
- Structural/source fidelity checks are not a theological certification of the publisher translation. This is a translation of meanings, not a replacement for the original Arabic text.
