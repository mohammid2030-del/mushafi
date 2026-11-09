# System icon only 3.0.76 (126)

The owner's supplied 44281.png becomes the Android system application icon: home-screen launcher, app drawer, app information and notification identity. The supplied original is preserved verbatim at tools/branding/mushafi-icon-original.png. The conversion script trims only transparent margins, sizes without distortion, and prepares legacy/adaptive artwork with mask-safe margins. Android 13 monochrome launchers use the same crescent/star silhouette. Both launcher themes retain the supplied black and gold colors when themed icons are disabled.

Android small notification icons require a monochrome alpha mask. The crescent and star extracted from the supplied image are white on transparent at five density sizes (24/36/48/72/96px). All prayer, khatma and audio notification builders already resolve the same AppIdentity.notificationIcon resource. No colored duplicate large icon is added.

Scope correction: all in-app branding, Home, welcome and the native launch emblem remain exactly as 3.0.75. The new artwork is confined to system resources; no new branding image is shipped in Web assets. The version label is the only existing application asset change.

Validation: verify-system-icon.py inspects the compiled APK resource table, all five PNG density masks and the 512px color artwork, compares every existing application asset with 3.0.75 (except version), and checks the old native launch emblem is retained. test-app-identity.cjs checks the retained Home/welcome brand across light/dark and four viewports. Release build, seven gates, same signing key and APK/AAB asset parity checked during packaging. Actual native phone visual inspection is not claimed.
