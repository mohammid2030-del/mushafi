# Reader search viewport restoration 3.1.1

While the surah picker is open or the keyboard is dismissing, skip keyboard-induced spread-mode changes. On dismissal blur the search field, explicitly hide the Android IME and reapply immersive system bars. Refit only after viewport/insets settle; genuine device rotation still refreshes the spread layout. Android API 30+ uses IME visibility insets; older devices get a bounded keyboard-dismiss delay. No Quran content or page font changes.

Verified browser keyboard-resize simulation, close button/backdrop/Escape/native Back, unchanged reading anchor, original full page height and actual orientation change. Physical-device verification remains outstanding.
