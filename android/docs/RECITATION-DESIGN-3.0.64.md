# 3.0.64 (114): themed reader picker and home recitation card

Replaces the system reader dialog in inline listening with an application surface, portraits, selected indicator and scrollable nine-reader list. Uses existing reader selection change handler and source data; preserves playback/repeat/page behavior. Selection supports keyboard focus trap, Escape, Android Back, backdrop dismissal and focus return. Both theme palettes and Arabic/English are supported.

Home recitation entry sits directly after Quran dua and opens the existing full-surah catalog. Uses all nine supplied portraits/names in three staggered, masked rising lanes with slow sideways sway. Decoration is aria-hidden; CTA remains readable. Animates transforms/opacity only, pauses outside the viewport or when app is hidden, and respects reduced motion. No auto playback, new external sources or network animation assets.

Browser QA covers both languages/themes, nine selections, saved reader, Back preserving verse dialog/page, home entry destination, 320/393/768 widths, reduced motion and screenshots. Existing inline nine-reader/repeat and full-surah ayah/tafsir synchronization suites pass. Native audio/timelines/widgets remain unchanged. Release checks retain all seven data gates.
