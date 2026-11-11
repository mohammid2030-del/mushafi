import UIKit
import WebKit

/// iOS implementation of the Android `AndroidReader` JavaScript interface.
///
/// Only the methods listed in `syncMethods` / `asyncMethods` are exposed to the page; the
/// shared web code checks each one before use, so anything not ported keeps its existing
/// fallback. Method names and argument order match MainActivity.java exactly.
final class NativeBridge: NSObject, WKScriptMessageHandler {

    /// Methods that return a value to JavaScript.
    static var syncMethods: [String] {
        var list = [
            "appWindowInsets", "isSystemDark", "getUiLanguage",
            "prayerSnapshot", "savePrayerSettings", "syncDeviceState",
            "consumePrayerOpen", "consumeWidgetDaily", "consumeSurahOpen",
            "surahSnapshot",
            "initializeDailyReminderConsent", "setDailyReminderConsent", "consumeFridayReminder", "consumeDailyReminderOpen",
            "saveKhatmaPlan", "khatmaStatus", "consumeKhatmaOpen",
        ]
        if CloudSync.isAvailable { list += ["cloudSnapshot", "cloudMatchesAck"] }
        return list
    }

    /// Fire-and-forget methods; results come back through `window.on…` callbacks.
    static var asyncMethods: [String] {
        var list = [
            "startupReady", "setAppTheme", "setUiLanguage", "setReading", "setStoryReading",
            "haptic", "copyText", "shareText",
            "openSourceUrl", "openWeatherReference", "openRecitationReference", "openSupportPage", "openCharityPlatform",
            "exportAppBackup", "importAppBackup",
            "requestPrayerLocation", "requestQiblaLocation", "cancelPrayerLocation", "openLocationSettings",
            "startQibla", "stopQibla", "requestHomeWeather",
            "requestPrayerNotifications", "openPrayerSystemSettings", "previewPrayerVoice", "stopPrayerVoice",
            "testPrayerNotification", "openWidgets", "openLiveBroadcast",
            "surahPlay", "surahPlaySession", "surahSetMode", "surahPause", "surahResume", "surahStop", "surahSkip", "surahSeek",
        ]
        if CloudSync.isAvailable {
            list += ["cloudSignIn", "cloudSignInApple", "cloudSignOut", "cloudPush", "cloudRetry", "cloudResolve",
                     "cloudDeleteAccount", "cloudDeletionAcknowledged", "challengeRequest"]
        }
        return list
    }

    weak var shell: WebShellViewController? {
        didSet { CloudSync.shared.presenter = shell }
    }

    private let location = LocationService()
    private let compass = CompassService()
    private let backups = BackupDocuments()
    private let prayer = PrayerService.shared
    private let surah = SurahPlayer.shared
    private var reading = false
    private var storyReading = false

    override init() {
        super.init()
        location.onResult = { [weak self] forQibla, payload in
            self?.shell?.callback(forQibla ? "onQiblaLocation" : "onPrayerLocation", payload)
        }
        compass.onUpdate = { [weak self] payload in self?.shell?.callback("onNativeQibla", payload) }
        backups.onMessage = { [weak self] ok, message in self?.fileMessage(ok, message) }
        backups.onLoaded = { [weak self] text in self?.shell?.callback("onMushafiBackupLoaded", text) }
        prayer.onChange = { [weak self] in self?.shell?.callback("onPrayerNativeChanged") }
        prayer.onPreview = { [weak self] playing in self?.shell?.callback("onPrayerPreview", playing) }
        surah.onState = { [weak self] json in self?.shell?.callbackRaw("onNativeSurah", json) }
        CloudSync.shared.onState = { [weak self] json in self?.shell?.callbackRaw("onNativeCloud", json) }
        ChallengeClient.shared.onReply = { [weak self] payload in self?.shell?.callback("onChallengeResponse", payload) }
    }

    // MARK: - Entry points

    /// Async channel: `webkit.messageHandlers.mushafi.postMessage(JSON)`.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              Self.isTrusted(message.frameInfo.securityOrigin),
              let text = message.body as? String,
              let call = Self.decode(text),
              Self.asyncMethods.contains(call.method) else { return }
        perform(call.method, call.args)
    }

    /// Sync channel: `window.prompt(marker, JSON)`; returns `{"v": value}` as JSON.
    func handleSync(_ text: String, from frame: WKFrameInfo) -> String? {
        guard frame.isMainFrame, Self.isTrusted(frame.securityOrigin),
              let call = Self.decode(text), Self.syncMethods.contains(call.method) else { return nil }
        let a = call.args
        let value: Any
        switch call.method {
        case "appWindowInsets": value = shell?.windowInsetsJSON ?? "{\"top\":0,\"bottom\":0,\"density\":1}"
        case "isSystemDark": value = shell?.isSystemDark ?? false
        case "getUiLanguage": value = UiLanguage.device
        case "prayerSnapshot": value = prayer.snapshotJSON()
        case "savePrayerSettings": value = prayer.save(a.string(0))
        case "syncDeviceState": value = prayer.syncDeviceState(a.string(0))
        case "consumePrayerOpen": value = AppRouter.shared.consume("prayer")
        case "consumeWidgetDaily":
            value = AppRouter.shared.consume("daily-dhikr") ? "dhikr" : (AppRouter.shared.consume("daily-verse") ? "quran" : "")
        case "consumeSurahOpen": value = AppRouter.shared.consume("surah")
        case "initializeDailyReminderConsent": value = ReminderService.shared.initializeConsent()
        case "setDailyReminderConsent": value = ReminderService.shared.setConsent(a.bool(0))
        case "consumeFridayReminder": value = ReminderService.shared.consumeFriday()
        case "consumeDailyReminderOpen": value = ReminderService.shared.consumeDailyOpen()
        case "saveKhatmaPlan": value = ReminderService.shared.saveKhatma(a.string(0) ?? "")
        case "khatmaStatus": value = ReminderService.shared.khatmaStatus()
        case "consumeKhatmaOpen": value = ReminderService.shared.consumeKhatmaOpen()
        case "surahSnapshot": value = surah.snapshot
        case "cloudSnapshot": value = CloudSync.shared.snapshotJSON()
        case "cloudMatchesAck": value = CloudSync.shared.matchesAck(a.string(0))
        default: return nil
        }
        guard let data = try? JSONSerialization.data(withJSONObject: ["v": value]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func isTrusted(_ origin: WKSecurityOrigin) -> Bool {
        origin.protocol == AssetSchemeHandler.scheme && origin.host == AssetSchemeHandler.host && origin.port == 0
    }

    // MARK: - Dispatch

    private func perform(_ method: String, _ a: Args) {
        switch method {
        // Shell
        case "startupReady": shell?.pageReady()
        case "setAppTheme": shell?.applyTheme(dark: a.bool(0))
        case "setUiLanguage": if let code = a.string(0) { UiLanguage.save(code); prayer.schedule() }
        case "setReading": reading = a.bool(0); updateIdleTimer(); shell?.readingMode = reading
        case "setStoryReading": storyReading = a.bool(0); updateIdleTimer()
        case "haptic":
            let style: UIImpactFeedbackGenerator.FeedbackStyle = a.int(0) == 1 ? .medium : .light
            UIImpactFeedbackGenerator(style: style).impactOccurred()
        case "copyText": if let text = a.string(0), text.count <= 200_000 { UIPasteboard.general.string = text }
        case "shareText": if let text = a.string(0), text.count <= 200_000 { shell?.share(text) }

        // Links
        case "openSourceUrl": ExternalLinks.openSource(a.string(0))
        case "openWeatherReference": ExternalLinks.openWeatherReference(a.string(0))
        case "openRecitationReference": ExternalLinks.openRecitationReference(a.string(0))
        case "openSupportPage": ExternalLinks.openSupportPage(a.string(0))
        case "openLiveBroadcast":
            if let city = a.string(0), LiveBroadcastViewController.cities.contains(city) {
                SurahPlayer.shared.pause()
                shell?.present(LiveBroadcastViewController(city: city, dark: a.bool(1)), animated: true)
            }
        case "openCharityPlatform":
            if !ExternalLinks.openCharity(a.string(0)) { fileMessage(false, "تعذر فتح صفحة الجهة") }

        // Files
        case "exportAppBackup": backups.presenter = shell; backups.export(a.string(0))
        case "importAppBackup": backups.presenter = shell; backups.importBackup()

        // Location, qibla, weather
        case "requestPrayerLocation": location.request(forQibla: false)
        case "requestQiblaLocation": location.request(forQibla: true)
        case "cancelPrayerLocation": location.cancel()
        case "openLocationSettings": ExternalLinks.openAppSettings()
        case "startQibla": compass.start(orientation: shell?.currentOrientation ?? .portrait)
        case "stopQibla": compass.stop()
        case "requestHomeWeather":
            guard let lat = a.double(0), let lon = a.double(1), let key = a.string(2),
                  key.range(of: "^[0-9.,+-]{1,48}$", options: .regularExpression) != nil else { return }
            WeatherService.load(latitude: lat, longitude: lon, key: key) { [weak self] payload in
                self?.shell?.callback("onHomeWeather", payload)
            }

        // Prayer notifications
        case "requestPrayerNotifications": prayer.requestPermission()
        case "openPrayerSystemSettings": PrayerService.openSettings()
        case "previewPrayerVoice": surah.pause(); prayer.previewVoice(a.string(0))
        case "stopPrayerVoice": prayer.stopPreview()
        case "testPrayerNotification": if let problem = prayer.testNotification() { fileMessage(false, problem) }
        case "openWidgets": shell?.showWidgetHelp()

        // Full-surah recitation
        case "surahPlay": prayer.stopPreview(); surah.play(reader: a.int(0) ?? 7, chapter: a.int(1) ?? 1, verse: a.int(2) ?? 0)
        case "surahPlaySession":
            prayer.stopPreview()
            surah.play(reader: a.int(0) ?? 7, chapter: a.int(1) ?? 1, verse: a.int(2) ?? 0, mode: a.string(4))
        case "surahSetMode": if let mode = a.string(0), ["continuous", "random", "single"].contains(mode) { surah.setMode(mode) }
        case "surahPause": surah.pause()
        case "surahResume": surah.resume()
        case "surahStop": surah.stop()
        case "surahSkip": surah.skip(a.int(0) ?? 0)
        case "surahSeek":
            if let position = a.int(0), position >= 0, let token = a.string(1), token.count <= 80 { surah.seek(position, token: token) }

        // Account & sync
        case "cloudSignIn": CloudSync.shared.signIn("google")
        case "cloudSignInApple": CloudSync.shared.signIn("apple")
        case "cloudSignOut": CloudSync.shared.signOut()
        case "cloudPush":
            CloudSync.shared.push(a.string(0), revision: Int64(a.double(1) ?? -1), owner: a.string(2), baseline: a.string(3))
        case "cloudRetry": CloudSync.shared.retry()
        case "cloudResolve": CloudSync.shared.resolve(local: a.bool(0), owner: a.string(1))
        case "cloudDeleteAccount": CloudSync.shared.deleteAccount()
        case "cloudDeletionAcknowledged": CloudSync.shared.acknowledgeDeletion()
        case "challengeRequest":
            ChallengeClient.shared.request(id: a.string(0), method: a.string(1), path: a.string(2), body: a.string(3))
        default:
            break
        }
    }

    private func fileMessage(_ ok: Bool, _ message: String) {
        shell?.callback("onMushafiFileResult", ok, message)
    }

    func viewDidDisappear() { compass.stop() }

    func orientationChanged(_ orientation: UIInterfaceOrientation) { compass.update(orientation: orientation) }

    private func updateIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = reading || storyReading
    }

    // MARK: - Decoding

    struct Args {
        let values: [Any]
        func string(_ i: Int) -> String? { i < values.count ? values[i] as? String : nil }
        func number(_ i: Int) -> NSNumber? { i < values.count ? values[i] as? NSNumber : nil }
        func double(_ i: Int) -> Double? {
            guard let value = number(i)?.doubleValue, value.isFinite else { return nil }
            return value
        }
        func int(_ i: Int) -> Int? { number(i)?.intValue }
        func bool(_ i: Int) -> Bool { number(i)?.boolValue ?? false }
    }

    private static func decode(_ text: String) -> (method: String, args: Args)? {
        guard text.utf8.count <= 2_000_000,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let method = object["m"] as? String else { return nil }
        let values = (object["a"] as? [Any]) ?? []
        return (method, Args(values: values))
    }
}

/// Breaks the WKUserContentController → handler retain cycle.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// Where a notification, widget or lock-screen tap wants to take the reader.
/// The page asks with consume…() at start-up; when it is already running we call it directly.
final class AppRouter {
    static let shared = AppRouter()
    /// Routes the shell runs itself in the page (widgets), as opposed to routes the page consumes.
    static let pageRoutes = ["reader", "adhkar-morning", "adhkar-evening", "adhkar-sleep", "adhkar-quran"]
    private var pending = Set<String>()
    var onRoute: ((String) -> Void)?
    /// Calls `window.<name>()` in the page once it is ready (cold starts consume pending state instead).
    var onPageCallback: ((String) -> Void)?
    func notifyPage(_ name: String) { onPageCallback?(name) }

    func open(_ route: String) {
        pending.insert(route)
        onRoute?(route)
    }

    func consume(_ route: String) -> Bool {
        pending.remove(route) != nil
    }

    /// mushafi-app://open/<route>
    func handle(_ url: URL) -> Bool {
        guard url.scheme == "mushafi-app", url.host == "open" else { return false }
        let route = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard ["prayer", "daily-verse", "daily-dhikr", "surah", "home"].contains(route) || Self.pageRoutes.contains(route) else { return false }
        if route != "home" { open(route) }
        return true
    }
}
