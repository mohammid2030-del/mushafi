# Welcome experience 3.0.74 (124)

Four introductory pages present Mushafi, six feature groups, all nine configured reciters with the supplied portraits, and the existing three Ehsan collections. Light/dark/system and Arabic/English controls are available in the welcome header. Pages support buttons, progress dots and horizontal swipes, with reduced motion respected. Introduction can be skipped; location and optional khatma, alerts and account choices retain their existing validation, draft resume and consent behavior. No audio or location permission is started by introductory pages.

Existing completed installations continue to Home. More → Discover Mushafi opens a read-only feature tour without replacing completion flags, the real setup draft, reading position or khatma. Theme/language choices remain normal app preferences. Preparation now takes 1.6 seconds of foreground time after the existing local content validation succeeds, instead of ten seconds.

Asr iqama defaults and reset defaults are 20 minutes in JavaScript and Android. A once-only migration updates the former 15-minute value to 20. Other prayer offsets and non-15 custom Asr offsets are preserved; choosing 15 manually after migration remains supported. The migration stores the Android value before the shared scheduler/widget reads it; it does not modify astronomical prayer calculations.

Validation: test-welcome74.cjs covers 64 intro layouts (AR/EN, light/dark, four viewports, four pages), nine decoded portraits, no automatic permission requests, draft resume, native Back, optional replay safety, and browser migration and exact Asr phase boundary. Existing wizard, resume, responsive and prayer suites cover setup choices, plan preservation, loading pause/resume and prayer settings. Android release compilation, release gates, signing and APK/AAB asset parity checked separately. Native phone visual inspection is not claimed.

Quran text, tafsir, Quran fonts, reciter data/audio and synchronization implementation are unchanged.
