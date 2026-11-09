Accessibility checks (3.1.27)

Serve assets on http://127.0.0.1:8765. Tests use the installed Playwright and /usr/bin/chromium.
Install axe separately: npm install --prefix /tmp/mushafi-audit --no-audit --no-fund axe-core

node qa/accessibility/audit.cjs
node qa/accessibility/interaction.cjs
node qa/accessibility/scale.cjs

Audit: nine representative screens in light and dark, Arabic, WCAG A/AA tags and 44px target geometry. The audit reports visible controls even below the fold. Solid palette contrast is calculated separately because axe cannot fully evaluate gradients.
Interaction: dialog focus, inert background, forward/reverse Tab, Escape, nested modal restoration and original trigger restoration.
Scale: 200% computed font-size simulation across six screens and all five interface languages, at 393×851. This is a browser reflow check, not a substitute for Android WebView textZoom/device rendering.
Native UiTextScalePolicyTest checks system scale handling and independent full-page reader typography.
Regressions: welcome language picker and responsive layouts, all 60 book pages at four sizes, and native inset bridge geometry.

Physical Android TalkBack traversal, Android system font scaling, large display-size settings, and real touch testing remain to be verified on a device. This is not a claim of complete WCAG compliance.
