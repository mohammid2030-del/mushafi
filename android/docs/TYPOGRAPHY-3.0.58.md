# Listening Quran typography — 3.0.58 / 108

The fullscreen listener used the general Noto Naskh reading font for Uthmani Quran text. Some hamza, vowel and Quranic stop-sign combinations collided or looked detached; a stop sign following a space could also wrap away from its preceding word.

Use the existing embedded Amiri Quran font in the listening verse only, at a readable size with line height 2.8 to reserve actual diacritic ink extents. Keep the word and its following spaced stop sign in an inline nowrap span. Every original code point, including spaces, hamza, Quranic vowels and stop signs, remains intact; no normalization or stripping is applied. The canonical assets and font files are unchanged. All audio timing maps, tafsir and reciter portraits are unchanged from 3.0.57.

Regression checks compare all 6236 source strings after DOM grouping. The reported verses 2:7, 24:4, 24:6 and 24:11, plus 2:1 and long 2:282, are rendered at 320×640, 393×851, 740×360 and 1280×800 with controls shown/hidden. The test measures inter-line ink clearance using shaped canvas metrics, checks nonbreaking stop groups and horizontal bounds. Motion and recitation/tafsir seek regressions also pass. Light screenshots for all four reported verses were visually reviewed.
