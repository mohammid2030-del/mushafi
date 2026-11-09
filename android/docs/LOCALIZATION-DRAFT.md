> Superseded: the user requested English first. See ENGLISH-3.0.43.md. Remaining languages are future drafts, not release requirements.

# UI localization — unpublished work in progress

Requested languages: Arabic, English, Hindi, Urdu, Sinhala, Tamil, Bengali, Turkish and French.

The installed/download release remains **3.0.42**. No new APK/AAB was released or Site updated for this work.

Implemented:
- Device language detection, device-local preference, native-name language selector in More, runtime switching without navigation or stopping recitation.
- RTL Arabic/Urdu and LTR for other languages; logical UI alignment and directional arrows.
- Offline catalog engine translating presentation text/labels/placeholders only; protected Quran, tafsir, devotional and personal text. No account data or personal content is sent for translation.
- Four bundled OFL fonts with licenses for Devanagari, Sinhala, Tamil and Bengali. Glyph checks passed.
- Localized weather calendar locale, native prayer/iqamah/khatma notifications and audio transport labels. Isolated loading page receives language explicitly.
- Release gate prevents packaging missing catalogs or broken interpolation placeholders.

Validation: Java release compilation passed. `node test-ui-locales.cjs` passed available catalogs' RTL/LTR, language persistence, live DOM text updates, unchanged Quran/personal text, independent reading anchor and phone overflow checks. The test does not certify linguistic correctness.

Blocker: public translation service returned HTTP 429, persisted after repeated server-respecting 60-second waits. Alternatives were unavailable (HTTP 401/403/500); no authentication or network controls bypassed. Translation job stopped. Only public application UI strings were processed during catalog preparation.

Current catalog coverage: Arabic source / English draft / Hindi draft: 1483 entries each; Urdu draft: 1066/1483; Sinhala, Tamil, Bengali, Turkish, French: not yet populated. English/Hindi and partial Urdu are machine-assisted drafts, **not language-professional verified**. Existing ambiguities such as website/location wording still need correction.

Do not publish this draft or describe all nine languages as completed. Finish all eight non-Arabic catalogs, review Islamic terminology and placeholders, run tools/verify-locales.py and the Gradle gate, then expand UI tests to every language, loading and native notification rendering. Keep religious original texts Arabic; translations of Quran meanings/tafsir require separately vetted sources and attribution.

Native preference uses `ui-language` SharedPreferences; web preference `appLanguage` is per device, excluded from account sync. Catalog engine is in assets/i18n.js; baseline keys in assets/locales/ar.json. Translation scripts/cache are in /workspace/scratch; no service credentials stored in project.
