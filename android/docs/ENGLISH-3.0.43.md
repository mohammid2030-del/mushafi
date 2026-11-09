# Mushafi 3.0.43 (93): Arabic and English interface

The user explicitly narrowed the request to English first. Arabic and English are the only offered languages. Hindi/Urdu drafts and future script fonts are retained under docs/localization-future, outside packaged assets. Other languages are not advertised as ready.

## Behavior
- Detect device language: Arabic uses Arabic; other device languages fall back to English. More → Language offers device default, العربية and English. The first welcome screen also offers a native-name toggle without skipping steps.
- Changing language updates the current UI without reloading the app, interrupting recitation, or moving reading/khatma positions. Preference is device-local and excluded from cloud sync.
- English UI uses LTR layout, mirrored navigation arrows, suitable UI fonts, localized Gregorian/Hijri dates and numbers. Quran text and its page layout stay RTL. The reading-card artwork has reserved space to avoid overlapping longer English titles.
- Quran, tafsir, hadith/adhkar text, original religious learning content, personal notes and account names are protected from display translation. This release does not add English translations of Quran meanings or tafsir. Original religious content remains Arabic.
- Search surahs by Arabic names, English names/transliterations or number. English surah labels distinguish chapter names from prayer names and hizb navigation.
- Native prayer/iqamah/khatma notifications and audio controls use the selected language. The isolated loading curtain refreshes language on warm reuse.
- Native live-broadcast toolbar/error/retry text and the app-owned wrapper use English. Official embedded media, sources and isolated-WebView security boundaries are unchanged; broadcaster-owned content remains its original language. External support/privacy pages are unchanged.

## Implementation safeguards
Bundled offline dictionaries, text-node/attribute localization only, no translated HTML injection. Canonical text is retained in WeakMaps for reversible switches. Option values are captured before display translation. Protected devotional/verse text cannot be rewritten by fragment translation. Playback headings compare canonical source to avoid unnecessary writes on every native tick. Greeting/weather retain source signatures so translated content does not trigger redraw loops.

Gradle and tools/verify-locales.py require complete Arabic/English catalogs and matching interpolation placeholders. Catalog drafts were machine-assisted; wording in live screens, prayer/iqamah/khatma, permissions, account/privacy summaries, location, cities, controls and key Islamic terms was manually revised. No professional native-language certification is claimed.

## Validation
- Java native locale checks on Android API 29 passed: persisted English/Arabic preferences, unsupported choice rejection, English prayer notification titles/body and a reused launch curtain switching from Arabic to English.
- Browser test-english-ui.cjs passed device defaults, welcome toggle, exact Quran/tafsir/adhkar preservation, independent reading positions, no playback commands during language switch, canonical heading stability, unchanged select values, Arabic/English surah search and 320/393/740/1280-pixel responsive layouts.
- test-ui-locales.cjs passed reversible DOM text/attribute changes, persistence and personal-text protection.
- Core 18-screen crawl had no visible untranslated Arabic UI outside explicitly protected original content. Deep welcome/setup/listening screens were reviewed and terminology corrections applied.
- Listening-motion, recitation-audit and listening-tafsir regression tests passed: all 6236 tafsir entries, 24944 timeline records, seek guard, confirmed pause/resume and smooth controls.
- Broadcast wrapper fixture passed translated play/pause/resume text with the exact official iframe URL preserved. Actual live-stream decoding was not repeated for a text-only wrapper change.
- No user cloud data, support messages, or Google login was accessed. No runtime translation service/API key is used.
