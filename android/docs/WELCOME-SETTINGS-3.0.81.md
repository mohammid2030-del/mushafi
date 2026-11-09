# Welcome setup and silent Adhan — 3.0.81

City selection now uses a consistent two-column searchable grid, explicit pressed state and a separate confirmed-city row. Removed custom-coordinate/timezone/account-settings expander from onboarding; advanced prayer location settings remain available after setup. Location consent text now includes the existing AlAdhan connection.

Replaced native Adhan voice dropdowns in both onboarding and Prayer settings with an in-app themed disclosure picker. Five choices retain their original value/change handlers and audio preview. Added the device-local silent-mode switch to onboarding.

Root cause of stale silent switch: prayer-source.js wrapped renderPrayerSettings but discarded its force argument. It now forwards force; the toggle also consumes and validates the native setter snapshot, updates shared prayerData immediately, and rolls the switch back with an error message on failure. MainActivity reconciles any active Adhan after a routing preference change. It still uses alarm volume when opted in, never changes system volume/ringer/DND and is not included in account sync.

Validation: test-welcome-settings.cjs passed all five voice choices, settings and onboarding true/false persistence across renders, forced snapshot invalidation and failed-save rollback, city search/selection, removed obsolete fields, AR/EN light/dark and 320/393/740px viewports. Existing welcome-resume suite passed GPS cancellation, account wait/sign-out, foreground loading, tour and location propagation. Dark/light screenshots visually inspected. All seven release gates passed. Android compilation/signing/asset parity verified; actual silent-device playback has not been physically tested in this environment.
