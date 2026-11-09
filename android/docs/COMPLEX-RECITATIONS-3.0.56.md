# Official Hafs recordings — 3.0.56 / 106

Added: Muhammad Ayyub (1002), Khalid Al-Muhanna (1003), Ibrahim Al-Akhdar (1004), from the King Fahd Complex. New readers use the existing headphone placeholder. Existing six reader catalogs and all supplied portraits must remain unchanged from 3.0.55.

Each added reader has 114 chapters and 6236 independently matched official verse clips. All 342 new chapter reports passed before catalog promotion; the five release data gates passed. Partial reports stay outside runtime assets.

Verification tools fetch publisher ZIP entries with CRC32 checks, decode complete official chapter MP3s, compare the actual decoder duration, and locate independently voiced waveform windows in every verse. Matching accounts for fractional sample clocks and an inverted waveform polarity (audibly equivalent), with polarity retained in the evidence. QUD provides search hints only; hints, interpolation and byte-clock estimates are never promoted as timestamps. Matched starts are strictly ordered, and verse intervals end at the next verified start. Rare spectral verification, when used, additionally requires full-clip spectral confidence, two ordinary-waveform positive controls, a reversed-audio negative control and an independent raw-waveform anchor. The three-anchor variant additionally proves early, middle and late windows (each correlation ≥0.85, fractional clock within 0.975–1.025, path error ≤120 ms, spanning at least half the verse). This variant requires whole-profile mean/median ≥0.85 and tenth percentile ≥0.65; the one-anchor legacy variant retains median ≥0.90. Both require negative-control separation ≥0.12 and positive-control agreement. Evidence records its distinct method and metrics. Public publisher page/ZIP/playlist metadata is retained in docs/sources/complex-publisher-library.json.

Publisher anomaly: in the Al-Muhanna verse ZIP, the three files under `110 An-Nasr` are mistakenly named `10-109001-A06.mp3` through `10-109003-A06.mp3`. The importer maps only these known entries to chapter 110 based on their directory. Every corrected clip must still match the official An-Nasr chapter waveform; no label correction alone establishes timing validity.

The release gate requires exact catalog/evidence equality, ordered complete verse coverage, every clip/audio SHA-256 digest, positive waveform thresholds, matching evidence starts, and preservation of previous reader catalogs. Native QA uses publisher MP3 bytes and exercises current audio caching, actual playback, rapid large seeks and paused seeks. Browser QA checks immediate ayah/tafsir previews and acknowledgments, full-tafsir pause/resume, Arabic/English and responsive layouts.

Audio permission: https://qurancomplex.gov.sa/quran-audios/ permits free public use in computer applications and websites. Only HTTPS download.qurancomplex.gov.sa is added to existing production host restrictions. Official recording cache namespace remains kfgqpc-v1. Source/CC BY attribution remains in the visible recitation sources sheet and docs/sources/QUD-CC-BY-4.0.txt.

Non-Hafs recordings are excluded because their matching canonical text is not yet present. This is machine signal verification, not a claim of an independent human audit of every spoken boundary.

## Validation result

All 342 new chapters / 18708 new verse timestamps are complete. The app now has nine complete readers; six previous reader catalogs are preserved. All five release data gates passed. Arabic/English browser checks passed at 320×640, 393×851, 740×360 and 1280×800, including new reader card dispatch, 15-minute ayah/tafsir seek preview/acknowledgment and full-tafsir pause/resume.

Android API 29 actual MediaPlayer checks passed for five official Fatiha MP3 fixtures: publisher host validation, exact source durations, versioned cache isolation, seeking, paused rapid latest seek and single-player playback. The official Al-Muhanna Al-Kahf file also passed streamed HTTP Range playback: one minute to fifteen, rapid 20/2/15-minute seeks, actual native ayah key, paused five-minute seek and the same MediaPlayer. Source SHA-256 was checked before serving the fixture. These native tests ran on an emulator, not a claim of testing every physical Android device.

708 other app assets are byte-identical to 3.0.55, including Quran, tafsir, adhkar, fonts and portraits. Validation reports are retained in docs/verification/3.0.56.

Release APK SHA-256: `f7390b0d917117c0901fc57ca0dcb920e0d14d8bb5f824ba24893465482ea663`.
