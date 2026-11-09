# Mushafi 3.1.21 publishing incident

Observed at: 2026-11-05T16:22:12.857729+00:00

## Confirmed evidence

- Signed Android 3.1.21 artifact is ready at `/tmp/Mushafi-3.1.21.apk`.
- Source publication to the existing Sites Git repository fails with HTTP 503.
- The response reports: `upstream connect error or disconnect/reset before headers`, `immediate connect error: Invalid argument`, remote transport `envoy://cloudflare_https_tunnel/`.
- Public website requests from this executor are intermittently affected by the same transport error.
- Independently retrieved production Worker logs show recent `/api/app-update` responses with HTTP 200 and completed requests to `/download/Mushafi-3.1.20.apk` with HTTP 200/206.
- Managed environment reports connected, with unrestricted HTTP policy enforced. No retained diagnostic records are available from the supported diagnostic tool.
- The Android background update checker requests rescheduling after network failure. Existing FCM topic delivery remains configured; no new-release push has been sent for 3.1.21.

## Scope and limits

This evidence identifies a publication transport failure; it does not establish its underlying provider-side cause. It does not establish that all future update delivery is broken. New version 3.1.21 cannot become discoverable until its APK and release manifest are published.

## Required recovery

The hosting/cloud environment provider needs to restore the failing HTTPS tunnel or source-publication service. This agent has no supported operator control to repair that tunnel. Preserve the current public deployment and existing FCM configuration. After recovery, resume the prepared bootstrap source push, deploy, upload the checksum-pinned APK, promote the manifest, remove the temporary upload route/key, and verify both the public download and FCM acceptance marker.

No application reinstall or Firebase reconfiguration is indicated by the current evidence.

## Resolution

Publication transport recovered. Android 3.1.21 was published and verified on 2026-11-05T19:29:28.258459+00:00. Complete APK hash and automatic FCM acceptance were verified; temporary publication credentials and routes were removed.
