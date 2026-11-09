# Reader position 3.1.0

Persistent surah names beneath the page field, including all surahs on a shared page. A coalesced range preview shows surah and page metadata while scrubbing; only release commits through the existing navigation handler. Cancellation restores the current page without changing progress.

Arabic next is visually left and previous right. CSS ordering preserves DOM handlers and khatma limits. Quran glyphs, fonts, page geometry and swipe direction are unchanged.

Validated with Playwright on mobile, narrow and landscape layouts, light/dark, Arabic/English, preview cancellation, stale events and progress isolation. Physical Android device testing remains outstanding.

The ordinary Quran reader book button opens an in-place searchable chapter dialog; close, backdrop, Escape and native back dismiss without navigation. A separate adjacent exit button opens the Quran index. Dedicated khatma, smart-reading and recitation exit actions are preserved.
