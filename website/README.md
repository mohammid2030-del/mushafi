# Mushafi public website
Arabic RTL promotional website for Mushafi. Includes light/dark themes, real app screenshots, city search, prayer times from AlAdhan, weather from Open-Meteo, and a checksum-pinned official Android APK streamed from R2. Google Play and App Store are explicitly coming soon.

## Develop and verify
Node 24+; no runtime dependencies.

```
npm test
npm run build
npm run dev
```
Use `MUSHAFI_WEB_OUTPUT=/tmp/mushafi-web-build` for builds on constrained disks. The local preview may require `node --use-env-proxy scripts/dev.mjs` in a proxied environment. Production fetch uses the Workers runtime.

## Hosting
Reuse `.openai/hosting.json`. Build output is `dist/server/index.js` (or the configured output directory). Package the Worker under `dist/server/index.js` and include `.openai/hosting.json` at the archive root. Source must be committed and pushed before saving the corresponding version. The site is public by the owner's explicit request.

R2 binding `BUCKET` serves `releases/Mushafi-3.1.31.apk`. The release size and SHA-256 are pinned in `worker/index.js`; mismatched files are not served. Downloads support byte ranges and resumptions. The official APK has been uploaded with checksum verification. The bootstrap upload handler was removed; the route returns 404. Future release updates require an authenticated server-only upload workflow. Never commit secrets or the APK to source. Without that secret the upload endpoint returns 404.

Manual city and theme preferences stay in the browser. Geolocation is opt-in; automatic coordinates are not saved to local storage. The server only proxies fixed providers; the browser can contact the same public weather and geocoding providers directly if the host cannot reach them. It and validates coordinates, timezones and calculation options. Provider failures are displayed explicitly, with no fabricated weather or prayer times. See `/privacy` for visitor-facing details.

## Languages
Arabic is the default. The globe control switches the entire site between Arabic RTL and English LTR, with browser-local persistence. `public/i18n.js` owns shared text and accessible-label translations; dynamic dates and numbers follow the selected locale. Real app screenshots have Arabic and English variants for both themes. Quran verses remain in Arabic, accompanied by their English meaning/reference in English mode. The privacy page shares the same language setting.

With Playwright and Chromium available, run `node tests/bilingual.browser.cjs` against the local preview, or pass the production origin.

## Android update feed
`GET /api/app-update` exposes the current downloadable APK with versionCode, versionName, package name, minimum SDK, size, SHA-256, localized release notes and readiness. The Android updater in 3.1.6+ consumes this endpoint. Only promote a higher versionCode built with the original signing key. Verify the APK signature, upload with checksum verification, update the release metadata and download UI, and remove temporary upload handlers before finishing. Existing 3.1.5 download URLs remain valid. Older installed apps need one manual installation of 3.1.6 to acquire the update feature.

## Release push notifications
The server uses an encrypted `FCM_SERVICE_ACCOUNT_JSON` runtime secret for project `mushafiapp-1b3d7`. Never put it in source, static assets or an APK. `FCM_RELEASE_PUSH_ENABLED=1` enables announcement of each current checksum-pinned ready release when `/api/app-update` is verified after deployment. A conditional R2 lock and a durable sent marker prevent repeated/concurrent broadcasts. The data-only high-priority topic is `mushafi_app_updates_v1`; clients validate metadata and suppress their own/previous/already-notified versions. Android 3.1.18+ must be installed/opened once with notification permission before it can receive push. Keep the polling job as a recovery path.

Release checklist: sign APK with the existing key, upload with verified SHA-256/size, promote the release and all locale notes, publish, request `/api/app-update` to announce, verify FCM accepted the release and its sent marker, verify the full public APK, and remove all temporary publisher/upload access. A missing FCM marker blocks reporting a release announcement as complete.

Production HTTP write/diagnostic routes are closed after publication, including `/_release-notify` and `/_release-upload`. Automatic announcements use the internal sender, not an exposed admin route. Temporary publisher/upload secrets are removed after verifying actual FCM acceptance.

The update feed exposes `notificationAnnounced` as server acceptance of the release announcement (not per-device delivery). Release verification waits for this flag after checking the ready public APK.
