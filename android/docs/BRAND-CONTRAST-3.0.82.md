# Location contrast and gold brand glyph — 3.0.82

Welcome's glass location button now uses var(--ink), replacing its inherited near-white foreground. Its arrow uses var(--gold). Verified computed foreground rgb(33,60,49) in light mode and rgb(240,236,227) in dark mode.

In-app crescent/star glyphs now use the gold palette in app-shell, glass surfaces and onboarding/loading. Native in-app launch_symbol uses #AC884C, consistent with light-mode gold. Shape/path data and system launcher/notification assets are unchanged.

Validation: welcome-settings regression passed city search and selection, native preference mock persistence/rollback and voice picking across AR/EN, light/dark and three viewport sizes. Computed glyph colors matched gold in both modes; startup-loading glyph checked. Light-mode screenshot visually inspected. Seven release gates and signed APK/AAB parity checked. No prayer calculations, Quran text, audio or donation changes.
