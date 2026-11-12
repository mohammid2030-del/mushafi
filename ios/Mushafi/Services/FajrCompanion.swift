import UIKit
import UserNotifications

/// صحبة الفجر on iOS: a time-sensitive notification at Fajr opens the page, which rings
/// each person in the list through WakeClient (in-app rings between Mushafi users).
final class FajrCompanion: NSObject {
    static let shared = FajrCompanion()
    private static let prefix = "fajr."
    private static let budget = 6          // iOS keeps 64 pending: prayer 36, daily 16, khatma 6, fajr 6
    private let defaults = UserDefaults.standard
    private let center = UNUserNotificationCenter.current()
    var pendingLaunch: String?

    // MARK: - Config (same shape and limits as FajrCompanion.java)

    static func validate(_ text: String) -> [String: Any]? {
        guard text.utf8.count <= 80_000, let data = text.data(using: .utf8),
              let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lists = config["lists"] as? [[String: Any]], lists.count <= 20 else { return nil }
        func matches(_ s: String?, _ pattern: String) -> Bool { s?.range(of: pattern, options: .regularExpression) != nil }
        for l in lists {
            guard matches(l["id"] as? String, "^[a-z0-9]{1,16}$"),
                  ["adhan", "manual"].contains(l["mode"] as? String ?? ""),
                  matches(l["time"] as? String, "^([01][0-9]|2[0-3]):[0-5][0-9]$"),
                  let days = l["days"] as? [Int], days.count <= 7, days.allSatisfy({ (0...6).contains($0) }),
                  let members = l["members"] as? [[String: Any]], members.count <= 30,
                  members.allSatisfy({ matches($0["id"] as? String, "^[A-Za-z0-9]{6,128}$") }) else { return nil }
            let offset = l["offset"] as? Int ?? 0
            guard (-30...60).contains(offset) else { return nil }
        }
        return config
    }

    private func load() -> [String: Any]? { defaults.string(forKey: "fajr.config").flatMap(Self.validate) }

    func save(_ text: String?) -> Bool {
        guard let text, Self.validate(text) != nil else { return false }
        defaults.set(text, forKey: "fajr.config")
        schedule()
        return true
    }

    private func events(now: Date) -> [(at: Date, list: String, name: String)] {
        guard let lists = load()?["lists"] as? [[String: Any]] else { return [] }
        let settings = PrayerSettings.load()
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
        var out: [(Date, String, String)] = []
        for l in lists where (l["enabled"] as? Bool) == true && !((l["members"] as? [Any]) ?? []).isEmpty {
            let days = Set(l["days"] as? [Int] ?? [])
            guard !days.isEmpty, let id = l["id"] as? String else { continue }
            let name = l["name"] as? String ?? ""
            for add in 0..<9 {
                guard let day = calendar.date(byAdding: .day, value: add, to: calendar.startOfDay(for: now)),
                      days.contains(calendar.component(.weekday, from: day) - 1) else { continue }
                var at: Date?
                if (l["mode"] as? String) == "manual" {
                    let hm = (l["time"] as? String ?? "04:30").split(separator: ":").compactMap { Int($0) }
                    if hm.count == 2 { at = calendar.date(bySettingHour: hm[0], minute: hm[1], second: 0, of: day) }
                } else {
                    guard (settings.json["confirmed"] as? Bool) == true else { break }
                    if let times = try? PrayerCalculator.calculate(settings, PrayerCalculator.day(settings, now: now, add: add)),
                       let fajr = times["fajr"] as? Int64 {
                        let offset = Int64(l["offset"] as? Int ?? 0) * PrayerCalculator.minute
                        at = Date(timeIntervalSince1970: TimeInterval(fajr + offset) / 1000)
                    }
                }
                if let at, at > now { out.append((at, id, name)) }
            }
        }
        return out.sorted { $0.0 < $1.0 }.map { (at: $0.0, list: $0.1, name: $0.2) }
    }

    func schedule() {
        let upcoming = Array(events(now: Date()).prefix(Self.budget))
        defaults.set(upcoming.first.map { Int64($0.at.timeIntervalSince1970 * 1000) } ?? 0, forKey: "fajr.next")
        defaults.set(upcoming.first?.list ?? "", forKey: "fajr.nextList")
        center.getPendingNotificationRequests { [weak self] pending in
            guard let self else { return }
            self.center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(Self.prefix) })
            for event in upcoming {
                let note = UNMutableNotificationContent()
                note.title = UiLanguage.text("حان وقت صحبة الفجر")
                note.body = UiLanguage.text("اضغط لبدء الاتصال بـ «{0}»", event.name.isEmpty ? UiLanguage.text("قائمة الفجر") : event.name)
                note.sound = .default
                note.threadIdentifier = "fajr"
                note.interruptionLevel = .timeSensitive
                note.userInfo = ["open": "fajr", "list": event.list]
                var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
                let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: event.at)
                self.center.add(UNNotificationRequest(identifier: Self.prefix + event.list + "." + String(Int(event.at.timeIntervalSince1970)),
                                                      content: note,
                                                      trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)))
            }
        }
    }

    func status() -> String {
        let status: [String: Any] = [
            "platform": "ios",
            "notifications": PrayerService.shared.notificationsAuthorized,
            "exact": true,
            "next": defaults.object(forKey: "fajr.next") as? Int64 ?? 0,
            "nextList": defaults.string(forKey: "fajr.nextList") ?? "",
        ]
        let data = (try? JSONSerialization.data(withJSONObject: status)) ?? Data()
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    func consumeLaunch() -> String {
        defer { pendingLaunch = nil }
        return pendingLaunch ?? ""
    }

    func stopAlarm() {
        center.getDeliveredNotifications { [weak self] notes in
            self?.center.removeDeliveredNotifications(withIdentifiers: notes.map(\.request.identifier).filter { $0.hasPrefix(Self.prefix) })
        }
    }

    private(set) var awake = false
    func keepAwake(_ on: Bool) { awake = on }

}
