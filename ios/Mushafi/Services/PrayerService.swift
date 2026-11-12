import AVFoundation
import UIKit
import UserNotifications
import WidgetKit

/// iOS counterpart of PrayerScheduler.java + the prayer part of MainActivity's bridge.
///
/// iOS cannot wake the app at each prayer, so instead of Android's single rolling alarm the
/// next events are handed to the system as local notifications (iOS keeps at most 64), and
/// the schedule is rebuilt whenever the app opens, returns to the foreground or gets a
/// background refresh.
final class PrayerService: NSObject {
    static let shared = PrayerService()

    /// Called on the main thread whenever the snapshot the page shows has changed.
    var onChange: (() -> Void)?
    var onPreview: ((Bool) -> Void)?

    private(set) var notificationsAuthorized = false
    private var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private var preview: AVAudioPlayer?
    private let center = UNUserNotificationCenter.current()
    private static let prefix = "prayer."
    private static let testId = "prayer.test"
    private static let maxScheduled = 36   // iOS keeps 64 pending: prayer 36, daily reminders 16, khatma 6, fajr companion 6

    // MARK: Status

    func refreshAuthorization(_ done: (() -> Void)? = nil) {
        center.getNotificationSettings { settings in
            DispatchQueue.main.async {
                self.authorizationStatus = settings.authorizationStatus
                let allowed: Set<UNAuthorizationStatus> = [.authorized, .provisional, .ephemeral]
                self.notificationsAuthorized = allowed.contains(settings.authorizationStatus)
                done?()
            }
        }
    }

    private func status(_ settings: PrayerSettings) -> [String: Any] {
        var voices: [String: Any] = [:]
        for voice in PrayerSettings.voices {
            voices[voice] = ["enabled": notificationsAuthorized, "sound": notificationsAuthorized && voice != "silent"]
        }
        let next = AppGroup.string("prayer.next").flatMap(PrayerSettings.parse)
        return [
            "adhanOnSilent": false,
            "alarmVolume": 0,
            "alarmMax": 0,
            "adhanAudioError": "",
            "notifications": notificationsAuthorized,
            "exact": true,
            "enabled": settings.enabled,
            "batteryRestricted": false,
            "next": next ?? NSNull(),
            "error": AppGroup.string("prayer.error") ?? "",
            "adhanChannel": notificationsAuthorized,
            "adhanSound": notificationsAuthorized && settings.voice != "silent",
            "iqamaChannel": notificationsAuthorized,
            "voices": voices,
            "platform": "ios",
        ]
    }

    // MARK: Bridge methods

    func snapshotJSON() -> String {
        let settings = PrayerSettings.load()
        PrayerSource.refresh(settings) { [weak self] updated in
            guard updated, let self else { return }
            self.schedule()
            WidgetCenter.shared.reloadAllTimelines()
            self.onChange?()
        }
        do {
            var result = try PrayerCalculator.snapshot(settings, now: Date())
            result["status"] = status(settings)
            return PrayerSettings.serialize(result)
        } catch {
            return PrayerSettings.serialize([
                "settings": settings.json,
                "status": status(settings),
                "error": "تعذر حساب مواقيت صالحة لهذا الموقع والتاريخ؛ جرّب مدينة أخرى أو راجع طريقة الحساب",
            ])
        }
    }

    func save(_ text: String?) -> String {
        guard let text, text.utf8.count <= 12_000, let object = PrayerSettings.parse(text),
              let settings = try? PrayerSettings(object) else {
            return "{\"error\":\"تعذر حفظ الإعدادات؛ راجع القيم والموقع والمنطقة الزمنية\"}"
        }
        settings.save()
        schedule()
        WidgetCenter.shared.reloadAllTimelines()
        return snapshotJSON()
    }

    /// Restore from a backup or the cloud: prayer settings only (khatma is kept by the page).
    func syncDeviceState(_ prayerText: String?) -> String {
        let previous = PrayerSettings.load()
        guard let text = prayerText, let object = PrayerSettings.parse(text), let next = try? PrayerSettings(object) else {
            previous.save()
            return "{\"ok\":false}"
        }
        next.save()
        schedule()
        WidgetCenter.shared.reloadAllTimelines()
        return "{\"ok\":true}"
    }

    func requestPermission() {
        refreshAuthorization { [weak self] in
            guard let self else { return }
            if self.authorizationStatus == .notDetermined {
                self.center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                    self.refreshAuthorization {
                        self.schedule()
                        self.onChange?()
                    }
                }
            } else if !self.notificationsAuthorized {
                Self.openSettings()
            } else {
                self.onChange?()
            }
        }
    }

    static func openSettings() {
        let target: String
        if #available(iOS 16.0, *) { target = UIApplication.openNotificationSettingsURLString } else { target = UIApplication.openSettingsURLString }
        if let url = URL(string: target) { UIApplication.shared.open(url) }
    }

    func previewVoice(_ voice: String?) {
        stopPreview()
        guard let voice, PrayerSettings.voices.contains(voice), voice != "silent",
              let url = Bundle.main.url(forResource: "adhan_\(voice)", withExtension: "caf") else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            let player = try AVAudioPlayer(contentsOf: url)
            player.delegate = self
            preview = player
            player.play()
            onPreview?(true)
        } catch {
            stopPreview()
        }
    }

    func stopPreview() {
        guard let player = preview else { return }
        player.stop()
        preview = nil
        onPreview?(false)
    }

    /// Returns an error message for the page, or nil when the test was scheduled.
    func testNotification() -> String? {
        guard notificationsAuthorized else { return "فعّل إذن الإشعارات أولًا" }
        let settings = PrayerSettings.load()
        let content = UNMutableNotificationContent()
        content.title = UiLanguage.text("تجربة تنبيه الصلاة")
        content.body = UiLanguage.text("تنبيه تجريبي، وليس دخول وقت الصلاة")
        content.sound = sound(for: settings, kind: "adhan")
        content.userInfo = ["open": "prayer"]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        center.add(UNNotificationRequest(identifier: Self.testId, content: content, trigger: trigger))
        return nil
    }

    // MARK: Scheduling

    struct Event {
        let at: Int64, key: String, kind: String
        var id: String { "\(at)|\(key)|\(kind)" }
    }

    /// Same rules as PrayerScheduler.events, extended over more days because iOS
    /// delivers from a pre-built list instead of waking the app at each prayer.
    static func events(_ s: PrayerSettings, now: Date, days: ClosedRange<Int> = -1...4) -> [Event] {
        var onsets: [Event] = []
        for d in days {
            guard let day = try? PrayerCalculator.calculate(s, PrayerCalculator.day(s, now: now, add: d)) else { continue }
            for key in PrayerSettings.keys {
                if let at = day[key] as? Int64 { onsets.append(Event(at: at, key: key, kind: "adhan")) }
            }
        }
        onsets.sort { $0.at < $1.at }
        var result: [Event] = []
        let reminder = Int64(s.int("reminderMinutes"))
        for (i, onset) in onsets.enumerated() {
            let row = s.row(onset.key)
            let iqamaMinutes = Int64((row["iqama"] as? Int) ?? 0)
            let iqama = onset.at + iqamaMinutes * PrayerCalculator.minute
            let next = i + 1 < onsets.count ? onsets[i + 1].at : Int64.max
            if (row["adhan"] as? Bool) == true { result.append(onset) }
            if iqama >= next { continue }   // an iqama overlapping the next prayer would mislead
            if (row["reminder"] as? Bool) == true && iqamaMinutes > reminder {
                result.append(Event(at: iqama - reminder * PrayerCalculator.minute, key: onset.key, kind: "reminder"))
            }
            if (row["atIqama"] as? Bool) == true && iqamaMinutes > 0 {
                result.append(Event(at: iqama, key: onset.key, kind: "iqama"))
            }
        }
        return result.sorted { $0.at < $1.at }
    }

    func schedule() {
        let settings = PrayerSettings.load()
        center.getPendingNotificationRequests { [weak self] pending in
            guard let self else { return }
            let old = pending.map(\.identifier).filter { $0.hasPrefix(Self.prefix) && $0 != Self.testId }
            self.center.removePendingNotificationRequests(withIdentifiers: old)
            AppGroup.set(nil, "prayer.next")
            AppGroup.set(nil, "prayer.error")
            guard settings.enabled else { return }

            let now = Date()
            let nowMs = Int64(now.timeIntervalSince1970 * 1000)
            let upcoming = Self.events(settings, now: now).filter { $0.at > nowMs + 1000 }.prefix(Self.maxScheduled)
            if upcoming.isEmpty {
                AppGroup.set("تعذر حساب المواقيت أو جدولة التنبيه؛ راجع الموقع", "prayer.error")
                return
            }
            for event in upcoming {
                let date = Date(timeIntervalSince1970: TimeInterval(event.at) / 1000)
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = .current
                let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
                let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                let request = UNNotificationRequest(identifier: Self.prefix + event.id,
                                                    content: self.content(settings, event), trigger: trigger)
                self.center.add(request)
            }
            if let first = upcoming.first {
                AppGroup.set(PrayerSettings.serialize(["at": first.at, "key": first.key, "kind": first.kind]), "prayer.next")
            }
        }
    }

    private func content(_ s: PrayerSettings, _ e: Event) -> UNNotificationContent {
        let content = UNMutableNotificationContent()
        let index = PrayerSettings.keys.firstIndex(of: e.key) ?? 0
        let name = UiLanguage.text(PrayerSettings.names[index])
        func minutes(_ n: Int) -> String { UiLanguage.text("{0} دقيقة", UiLanguage.number(n)) }
        switch e.kind {
        case "adhan":
            let iqama = (s.row(e.key)["iqama"] as? Int) ?? 0
            content.title = UiLanguage.text("حان وقت صلاة {0}", name)
            content.body = iqama > 0 ? UiLanguage.text("الإقامة بعد {0}", minutes(iqama)) : UiLanguage.text("حيّ على الصلاة")
        case "reminder":
            content.title = UiLanguage.text("اقتربت إقامة صلاة {0}", name)
            content.body = UiLanguage.text("متبقي {0} على إقامة صلاة {1}", minutes(s.int("reminderMinutes")), name)
        default:
            content.title = UiLanguage.text("موعد إقامة صلاة {0}", name)
            content.body = UiLanguage.text("حان وقت إقامة صلاة {0}", name)
        }
        content.sound = e.kind == "adhan" && PrayerMute.muted(e.key, at: e.at) ? nil : sound(for: s, kind: e.kind)
        content.threadIdentifier = "prayer"
        content.userInfo = ["open": "prayer", "key": e.key, "kind": e.kind]
        if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
        return content
    }

    private func sound(for s: PrayerSettings, kind: String) -> UNNotificationSound? {
        guard kind == "adhan" else { return .default }
        let voice = s.voice
        if voice == "silent" { return nil }
        return UNNotificationSound(named: UNNotificationSoundName("adhan_\(voice).caf"))
    }
}

extension PrayerService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        if player === preview { stopPreview() }
    }
}


/// Adhan voice muted for single prayers of today only; the notification itself still arrives.
enum PrayerMute {
    private static let key = "prayer.mute"
    static func save(_ text: String?) -> String {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        guard let data = (text ?? "[]").data(using: .utf8),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return "[]" }
        let kept: [[String: Any]] = list.compactMap { entry in
            guard let k = entry["key"] as? String, PrayerSettings.keys.contains(k),
                  let at = (entry["at"] as? NSNumber)?.int64Value,
                  at > now - 2 * 3_600_000, at < now + 26 * 3_600_000 else { return nil }
            return ["key": k, "at": at]
        }.prefix(12).map { $0 }
        let json = (try? JSONSerialization.data(withJSONObject: kept)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        UserDefaults.standard.set(json, forKey: key)
        PrayerService.shared.schedule()
        return json
    }
    static func muted(_ prayer: String, at: Int64) -> Bool {
        guard let data = UserDefaults.standard.string(forKey: key)?.data(using: .utf8),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return false }
        return list.contains { ($0["key"] as? String) == prayer && abs((($0["at"] as? NSNumber)?.int64Value ?? 0) - at) < 90_000 }
    }
}
