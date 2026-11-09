# FCM release notifications — activated in 3.1.18

## Why polling alone was insufficient
3.1.16/17 used hourly JobScheduler checks. Android can defer those checks until a launch job runs. The user confirmed 3.1.16 was installed and the app was dismissed from Recents, not force-stopped. No device job trace was available to establish the exact device-side delay. FCM now supplies the primary closed-app notification path; polling remains a recovery fallback.

## Android behavior
Firebase Messaging subscribes to `mushafi_app_updates_v1` only with notification permission and an enabled update channel. Subscription refreshes after token changes. High-priority data-only messages reach the private FirebaseMessagingService without requiring an Activity/WebView. Strict payload checks enforce the app package, version/SDK, pinned HTTPS download URL, size and SHA format. The existing notification policy suppresses installed/older/already-notified versions and races with the fallback job. The shared notification identity produces one system app icon. Taps open the existing updater, including cold/warm launch and welcome deferral. No automatic APK download or installation was introduced.

Users must install/open 3.1.18 once with notification permission before they can receive future push. Android force-stop and devices without working Google Play services cannot be promised immediate FCM delivery. Actual physical-device closed-app delivery was not tested in this environment.

## Production server
Project `mushafiapp-1b3d7` is configured through the encrypted runtime secret `FCM_SERVICE_ACCOUNT_JSON`; `FCM_RELEASE_PUSH_ENABLED=1` enables automatic announcements. No private credential is in Git, website assets or the APK. Only scoped FCM OAuth is requested. Cloudflare Workers use manual redirect handling and reject redirects.

After publishing, requesting `/api/app-update` for a ready checksum-pinned release queues the server announcement. A five-minute conditional R2 lock prevents concurrent sends; a durable `push/sent/CODE.json` marker is written only after Google accepts the real message. Repeated feed checks do not rebroadcast. Offline devices receive only the latest collapsed release within the one-day TTL. Native deduplication also guards retries.

## Release workflow
1. Build and sign the next APK with the original signing identity; verify exact package/code/name and SHA-256.
2. Upload the APK with checksum validation, then promote the release and all four language notes. Preserve previous download URLs.
3. Publish and GET `/api/app-update` to trigger the automatic announcement. Verify FCM acceptance and the durable sent marker before reporting the announcement complete. Validate the entire public APK through parallel byte ranges.
4. Keep temporary upload/diagnostic HTTP routes closed. Production `/_release-upload` and `/_release-notify` both return 404; temporary `RELEASE_UPLOAD_KEY` and `RELEASE_PUSH_KEY` were removed. Server sender functions remain testable internally. If diagnosis is necessary, an owner may temporarily enable the authenticated diagnostic route and a fresh secret, then close/remove both again.

## Verified activation on 2026-11-05
- User-provided service account: real Google OAuth and FCM validation-only HTTP 200.
- Deployed server validation-only HTTP 200 after correcting Cloudflare redirect compatibility.
- Automatic real announcement for versionCode 168 accepted; subsequent publisher check returned HTTP 200 with `alreadySent:true`, proving the durable sent marker existed before that check.
- Signed APK size 119111020; SHA-256 `e9b2f8f9900e95353fbdd283f459da058145e90a08e2ba1210719c40ecd4f209`. Full public APK compared byte-for-byte in three parallel ranges.
- Credential absent from APK and website artifact; only encrypted sender credential plus enabled flag remain in runtime configuration.
- JVM PushPayloadChecks and server tests cover metadata rejection, own-version suppression, FCM/job dedup, RS256 signing/scope, authorization/readiness, safe dry run, automatic announcement, retry and concurrent locking.

Final production receipt: `store-release/DEPLOYMENT-3.1.18.json`. Physical device receipt/delivery is not asserted by server acceptance.
