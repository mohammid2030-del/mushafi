# Mushafi Challenge redesign 3.1.5

Replaced the old challenge CSS and all screen templates with a separate presentation module and a scoped visual system: home and entries, setup, private create/join, questions/feedback, results/review, learning profile, online records, waiting rooms, live duels and tournament brackets. Scoring, sourced question bank, persistence and server protocol remain the validated 3.1.4 implementation.

Compact home overview and distinct icon tiles replace the tall hero. Warm opaque surfaces in light mode and charcoal/gold surfaces in dark mode improve separation and contrast. Fractions, percentages and room codes are isolated bidirectional elements that cannot split across lines. Selected options use borders/checkmarks as well as color. Correct and incorrect responses have explicit feedback. Profile sections use readable metrics, a real seven-day calendar and per-category progress. Room occupancy, settings, participants, invite code and host/start/wait states are separate.

Setup controls update without navigation, scroll jumps or header fades, preserving focus. Private create/join are distinct tabs. Main screen background stays stable during navigation. Modal styling, copied-code feedback, empty/loading/error states and reduced-motion behavior are included. The challenge canvas is removed on exit so it does not affect the rest of the app. App version display now matches the Android release.

Validation: Arabic/English, light/dark, 320/393/851 widths, all screen templates, one-line numeric layouts, setup selection/scroll/focus, answer feedback, private join and surface cleanup. Existing functional audit and browser-to-Worker/SQLite full duel and 4/8/16 tournament tests also pass. Physical Android device checks are unavailable.
