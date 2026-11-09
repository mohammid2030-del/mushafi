# Reader viewport 3.1.2

Fix native fullscreen letterboxing: allow display-cutout layout while reading and stop reserving hidden status/navigation bar insets. Keep keyboard insets, safe horizontal insets and non-reader system-bar behavior. Reader surface fills the window.

Replace independent search/reader resize timers with one layout coordinator, observing actual reader bounds, native IME changes and visual viewport. Release pending restoration on exit and use a bounded fallback if a platform callback is missing. Anchor writes are avoided for layout-only redraw. Fixed reader main fills WebView bounds rather than stale viewport-unit height.

Validation: native policy cases cover API 23–36, IME and safe areas; browser regressions cover search dismissal, keyboard-size transitions, real rotation, slider, khatma/smart isolation and calm page turn. Physical device with the reported OEM cutout behavior is unavailable.
