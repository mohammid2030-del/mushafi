# Reciter artwork for Android media 3.0.78 (128)

The playback service previously sent only title/artist/duration to MediaSession and omitted the notification large icon. Android therefore showed its generic music artwork. SurahPlaybackService now provides the current reader portrait under ALBUM_ART, ART and DISPLAY_ICON metadata and as the media notification large icon. The official app/status-bar small icon stays unchanged.

ReciterArtwork maps the same nine IDs to the existing bundled portraits, samples source decoding, trims transparent margins and draws an undistorted square cover on a dark neutral background. The 384px result is cached only for the current reader. Reader changes replace the cache; unknown/missing images clear it instead of displaying a previous reader. No download or new permission is needed.

The existing notification normalization explicitly preserves transport notifications with MediaSession metadata, so returning to the app no longer strips a legitimate media portrait. Legacy duplicate branding on non-media notifications is still cleaned up.

Validation: all nine mappings match the Web player and all bundled PNGs decode offline. Extended NotificationIconChecks compiles against the release classes/Android SDK and covers bounded cache behavior, all three metadata fields, all readers, unchanged small icon, media artwork preservation and non-media cleanup. These instrumentation checks were prepared and compiled; a native device/Samsung lock-screen visual run is not claimed. Android release build/seven gates, unchanged signing certificate and APK/AAB source asset parity verified during packaging. Existing app assets, audio policy/timing sources and Quran content remain unchanged except the version label.
