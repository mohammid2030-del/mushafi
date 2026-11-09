Primary audio repair — 3.1.30

The five migrated readers use sourceVersion mp3quran-primary-v1. Full-surah playback and individual verse clips reference the same primary MP3 and recording-specific timings. There are no fallbackUrl entries or untimed failover paths.

Source evidence: docs/sources/primary-audio-validation.json records all 570 live range/MPEG checks, 31,180 timed verse segments, publisher/QUD bindings and the three explicitly documented publisher timing corrections. Every verse sequence and duration bound is checked at release build time. This is not a claim of human listening review for all boundaries.

Run with assets served on localhost:8765:
- node qa/audio/primary.browser.cjs: authentic downloaded primary Fatiha MP3s, first/middle/last verses, triple repetition, four corrected clips, and all five readers inside khatma. Fixtures are in /tmp/primary-rebuild/fixtures; corrected surahs are in /tmp/primary-rebuild.
- node qa/audio/media.browser.cjs: all ten Fatiha players, pause/resume/stop, actual home entry/back, section switch and mini-player, Quran/khatma reading checkpoints.
- node qa/audio/flows.browser.cjs: request ordering, pending-source cancellation, all native session arguments and primary timing availability. Native calls use a bridge double.
- node qa/accessibility/navigation.cjs: recitation/modal close and navigation regression.

The native build checks matching primary and inline catalogs, pinned sources, complete verse ranges, source/cache version isolation and unchanged unrelated reciters. New audio timelines do not reuse positions from the replaced recording; Quran and khatma reading checkpoints stay independent.

Physical Android MediaPlayer seeking, audio focus, Bluetooth/headset interruptions and locked-screen playback still require device validation. HTML media tests exercise Chromium, not Android MediaPlayer.

3.1.31: full recitation continuity
- full-continuous.browser.cjs boots with the old single preference, runs authentic Fatiha files for all ten reciters past the first ayah through completion, and checks the next-chapter request. It also checks that full-player settings do not offer verse-only playback and that inline practice does not send full-service mode commands.
- SurahPlaybackModeTest covers native migration and accepted full modes. The native service no longer enforces per-ayah stop boundaries. Random full recitation also waits until chapter completion.
- recitationPlayMode now belongs to full recitation; inlineRecitationPlayMode belongs to ayah practice. Both are stored independently.
