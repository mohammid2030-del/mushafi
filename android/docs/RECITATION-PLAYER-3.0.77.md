# Recitation player 3.0.77 (127)

Three explicit playback policies share a themed selection sheet: continuous (default, next verse and next surah automatically, stops after 114:6), random (uniform over the other 6235 verses, same reciter), and selected verse only (stops at the selected timing row end). Preferences persist locally/native-side. Explicit previous/next verse controls complement ten-second transport and scrubbing.

The full-screen player offers a portrait-only scene and the existing synchronized verse/tafsir scene. Switching scenes never changes the audio source, playback key or reading position. Existing five-second control hiding, touch reveal, reduced motion, Back origin, pause/resume and full-tafsir pause acknowledgment are retained. New controls are inside the existing inert/hide container. Quran code points, font files and source/timing catalogs are unchanged; listening-only type size adapts to keep space for tafsir.

Android policies execute inside SurahPlaybackService, independent of WebView/background visibility. The service retains full-track streaming, with native timing-boundary checks every 40ms for random/single and existing native seek acknowledgments. Selected-verse completion publishes a single terminal key before any next-verse metadata. Native cross-surah transitions retain audio focus, media session and foreground notification. RecitationSequence is a pure Java policy tested over every canonical verse. Real acoustic stop precision still depends on the existing timing catalog, media frames and Android scheduling; an actual phone background playback test is not claimed.

Browser fallback applies the same sequence with generation guards, stale pause-event suppression, pause/seek gating and metadata-ready cross-source seeks. Stops cancel pending metadata playback; switching mode while loading anchors to the intended position. Inline verse playback shares the choices, retains the existing one/three repeats for each verse, advances only after that repeat count, and leaves the reading page untouched. Closing the inline sheet still stops it.

Validation:
- qa/unit/RecitationSequenceTest.java: all 6236 continuous/single decisions, final Quran boundary, 124720 valid random choices excluding immediate repeat, and exact millisecond paused/seeking/playing gates.
- test-player-browser-policy.cjs: single boundary/key, sequential chapter transition, random cross-source transition, late pause events, paused gating and loading-mode anchor.
- test-player-modes.cjs: native mode/play dispatch, three-option sheet, exact verse/tafsir and retained playback position, portrait mode, previous/next, 32 AR/EN/light/dark/viewport combinations, hidden controls and reduced motion, inline boundaries.
- Existing Home recitation, listening tafsir, surah synchronization and nine-reader inline single/repeat suites pass. Android release compilation/seven gates, same signing key and APK/AAB asset parity checked separately.
