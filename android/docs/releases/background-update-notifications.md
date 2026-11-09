# Background update alerts (3.1.16)

The system JobScheduler checks only the pinned public release manifest about once an hour on any connected network. A separate immediate job runs at first launch, installation/package replacement, boot and notification permission changes. Both jobs are persisted and independent of the Activity/WebView. No account, location, exact alarm, foreground service or automatic APK download is involved.

A metadata response must pass AppUpdatePolicy (package, HTTPS host/path, version, SDK, size and SHA-256 format). The system notification is posted only for a published, compatible version newer than the installed version and the last notified code. Deduplication persists across process restarts and dismissal. One stable notification ID replaces an older release. Posting uses the shared system-only app icon and localized Arabic/English/Urdu strings. Global notification permission and the channel's system block state are respected.

The notification opens the existing updater, deferring consumption until welcome finishes. Cold launch and onNewIntent are handled. Download and Android installation still require user action and retain the existing full checksum/package/signing checks. Installing a release removes its obsolete notification.

Scheduling is periodic, not instant server push. Android Doze, battery restrictions and connectivity can delay checks. Android force-stop disables scheduled work until the app is opened again.

Verification: JVM NoticePolicyChecks; browser notification-open tests in Arabic, English and Urdu; release build and locale validators. No connected Android device/emulator was available for a physical closed-app notification delivery test.
