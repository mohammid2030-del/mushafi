# Welcome plan controls and theme-aware identity — 3.0.83

Onboarding plan kind and reminder selectors now use themed in-app disclosure pickers. Hidden native selects retain existing change handlers and validated model semantics. Three plan modes and four reminders preserved; number inputs, presets and plan commit unchanged.

Light-mode in-app brand SVGs show a translucent white rounded tile with a gold crescent/star in Welcome, More, Account and loading. Dark-mode artwork/background rules are unchanged. System-themed UI follows the existing system theme integration.

Launcher resources now provide light vector/gold artwork by default and the original supplied dark bitmap/adaptive layers through night qualifiers. All legacy, adaptive API26 and monochrome API33 launcher definitions have matching night entries to avoid legacy fallback on modern devices. Existing dark PNG files are unchanged. The original dark source artwork remains archived. Launcher repaint timing depends on the device launcher/cache; Android 13 themed icons remain system-colored.

Notification small icons retain the original white alpha silhouette for Android's automatic contrast/tint. Notification accent colors now read day/night gold resources. Reconciliation updates accent colors without repeat alerts and retains media-session reciter artwork; obsolete nonmedia large icons continue to be cleared. No ringer/DND/volume changes.

Validation: test-welcome-plan-style.cjs passes three plan kinds, four reminder options, AR/EN, both simulated system themes, three viewport sizes, and light emblem tiles in Welcome/More/Account with unchanged dark Welcome background. Existing welcome-resume suite passes GPS cancellation, account gating and foreground loading. Screenshots inspected. Android release compile/gates and signed APK/AAB parity checked. No physical-launcher or notification-panel theme-switch test performed.
