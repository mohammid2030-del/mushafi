# 3.0.69 (119): stepwise native Back

Native Back retains the consumed true result while the home recitation overlay is open, but now calls the same homeRecitationBack function as the header arrow. Mode returns to chapters, chapters returns to readers, and readers closes to home. This supersedes the direct-to-home modal close behavior in 3.0.68. Close button and backdrop still dismiss the overlay. Bare-home exit remains the original native false boundary.

The exact Android JS entry point is tested across Arabic/English, light/dark and all three modal stages. Tests verify each intermediate list, true consumption on each step, full-screen -> chapters -> readers -> home, playback/page/scroll preservation, internal arrow and false return only at bare home. Original full-screen player and native audio are unchanged. Release data gates, version/certificate and APK/AAB asset parity pass.
