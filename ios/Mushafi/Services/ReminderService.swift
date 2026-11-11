import Foundation
import UserNotifications

/// Daily reminders (duas, morning/evening adhkar, night reminder, Friday salawat and the Friday
/// dua before Maghrib) and khatma reminders — iOS port of DailyReminderPlan/DailyReminderScheduler
/// and KhatmaScheduler on Android: same times, same content, same rotation formulas.
///
/// iOS runs no code when a notification fires, so every notification is built in advance as a
/// calendar-triggered request. iOS keeps at most 64 pending requests per app; the budget is
/// prayer 40 + daily 16 + khatma 6. Everything is rescheduled whenever the app becomes active,
/// on background refresh, and when a setting changes.
final class ReminderService {
    static let shared = ReminderService()

    private static let dailyPrefix = "daily."
    private static let khatmaPrefix = "khatma."
    private static let dailyBudget = 16
    private static let khatmaBudget = 6
    static let kinds = ["dua", "morning", "evening", "night", "salawat", "fridayDua"]

    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private lazy var content: [String: Any] = SharedResources.json("daily-reminders") as? [String: Any] ?? [:]

    /// Set when the user taps a reminder; the page consumes it.
    var pendingDaily: (kind: String, id: String)?
    var pendingKhatma = false

    // MARK: - Consent (same semantics as Android)

    private var consent: Bool { defaults.bool(forKey: "reminders.consent") }

    func initializeConsent() -> Bool {
        if defaults.object(forKey: "reminders.consent") == nil {
            defaults.set(PrayerService.shared.notificationsAuthorized, forKey: "reminders.consent")
        }
        schedule()
        return true
    }

    func setConsent(_ enabled: Bool) -> Bool {
        defaults.set(enabled, forKey: "reminders.consent")
        if enabled {
            center.getNotificationSettings { settings in
                if settings.authorizationStatus == .notDetermined {
                    self.center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                        PrayerService.shared.refreshAuthorization { self.schedule() }
                    }
                } else {
                    self.schedule()
                }
            }
        } else {
            schedule()
        }
        return true
    }

    // MARK: - Scheduling

    func schedule() {
        center.getNotificationSettings { settings in
            let allowed = [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus)
            self.center.getPendingNotificationRequests { pending in
                let old = pending.map(\.identifier).filter { $0.hasPrefix(Self.dailyPrefix) || $0.hasPrefix(Self.khatmaPrefix) }
                self.center.removePendingNotificationRequests(withIdentifiers: old)
                guard allowed else { return }
                if self.consent { self.scheduleDaily() }
                self.scheduleKhatma()
            }
        }
    }

    private struct Event { let kind: String; let at: Date }

    private func trigger(_ date: Date) -> UNCalendarNotificationTrigger {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return UNCalendarNotificationTrigger(dateMatching: calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date), repeats: false)
    }

    private func dailyEvents(now: Date) -> [Event] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        var list: [Event] = []
        func at(_ day: Date, _ hour: Int, _ minute: Int) -> Date {
            calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
        }
        let today = calendar.startOfDay(for: now)
        for offset in 0...5 {
            guard let day = calendar.date(byAdding: .day, value: offset, to: today) else { continue }
            list.append(Event(kind: "morning", at: at(day, 5, 0)))
            list.append(Event(kind: "dua", at: at(day, 8, 0)))
            list.append(Event(kind: "evening", at: at(day, 17, 0)))
            list.append(Event(kind: "dua", at: at(day, 20, 0)))
            list.append(Event(kind: "night", at: at(day, 22, 30)))
            if calendar.component(.weekday, from: day) == 6 { list.append(Event(kind: "salawat", at: at(day, 9, 0))) }
        }
        // Friday dua 15 minutes before Maghrib, from the user's prayer settings.
        let settings = PrayerSettings.load()
        if (settings.json["confirmed"] as? Bool) == true {
            for offset in 0...6 {
                let date = PrayerCalculator.day(settings, now: now, add: offset)
                guard let times = try? PrayerCalculator.calculate(settings, date),
                      let maghrib = times["maghrib"] as? Int64 else { continue }
                let when = Date(timeIntervalSince1970: TimeInterval(maghrib) / 1000 - 15 * 60)
                var zoned = Calendar(identifier: .gregorian)
                zoned.timeZone = settings.timezone
                if zoned.component(.weekday, from: when) == 6 { list.append(Event(kind: "fridayDua", at: when)) }
            }
        }
        return list.filter { $0.at > now.addingTimeInterval(5) }.sorted { $0.at < $1.at }
    }

    private func scheduleDaily() {
        let now = Date()
        for event in dailyEvents(now: now).prefix(Self.dailyBudget) {
            let (title, body, item) = dailyText(event)
            let note = UNMutableNotificationContent()
            note.title = title
            note.body = body
            note.sound = .default
            note.threadIdentifier = "daily-reminders"
            note.userInfo = ["open": "daily", "kind": event.kind, "item": item]
            let id = Self.dailyPrefix + event.kind + "." + String(Int(event.at.timeIntervalSince1970))
            center.add(UNNotificationRequest(identifier: id, content: note, trigger: trigger(event.at)))
        }
    }

    // MARK: Content and rotation (identical to DailyReminderPlan.java)

    private static func floorDiv(_ x: Int, _ y: Int) -> Int { let q = x / y; return (x % y != 0 && (x < 0) != (y < 0)) ? q - 1 : q }
    private static func floorMod(_ x: Int, _ y: Int) -> Int { let r = x % y; return r < 0 ? r + y : r }

    /// Days since 1970-01-01 for the local civil date.
    private static func civilDay(_ date: Date) -> Int {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = .current
        let parts = local.dateComponents([.year, .month, .day], from: date)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let start = utc.date(from: parts) ?? date
        return floorDiv(Int(start.timeIntervalSince1970), 86_400)
    }

    private static func duaIndex(_ date: Date, _ size: Int) -> Int {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = .current
        let hour = local.component(.hour, from: date)
        let slot = civilDay(date) * 2 + (hour < 8 ? -1 : hour < 20 ? 0 : 1)
        return floorMod(slot, size)
    }

    private static func fridayIndex(_ date: Date, _ size: Int) -> Int {
        floorMod(floorDiv(civilDay(date), 7) * 5 + 3, size)
    }

    private func dailyText(_ event: Event) -> (String, String, String) {
        let t = { (arabic: String) in UiLanguage.text(arabic) }
        switch event.kind {
        case "dua", "fridayDua":
            let pool = content["pool"] as? [[String: Any]] ?? []
            guard !pool.isEmpty else { return (t("دعاء يطمئن به قلبك"), "", "") }
            let index = event.kind == "dua" ? Self.duaIndex(event.at, pool.count) : Self.fridayIndex(event.at, pool.count)
            let item = pool[index]
            let body = "\(item["text"] as? String ?? "")\n\(item["reference"] as? String ?? "")"
            return (t(event.kind == "dua" ? "دعاء يطمئن به قلبك" : "دعاء قبل مغرب الجمعة"), body, item["id"] as? String ?? "")
        case "salawat":
            let text = (content["salawat"] as? [String: Any])?["text"] as? String ?? ""
            return (t("الصلاة على النبي ﷺ"), text + "\n" + t("الأحزاب ٥٦"), "")
        case "morning":
            return (t("أذكار الصباح"), t("ابدأ صباحك بذكر الله، وخصّص وقتًا لأذكار الصباح."), "")
        case "evening":
            return (t("أذكار المساء"), t("اختم نهارك بذكر الله، وخذ وقتًا لأذكار المساء."), "")
        default:
            return (t("ذكرك وقراءتك قبل النوم"), t("تذكير بأذكار يومك وقراءة سورة الملك. اختم يومك بالذكر والقرآن."), "")
        }
    }

    // MARK: - Friday guide (in-app card, same rules as Android)

    private static func dateKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private static func fridayWindow(_ now: Date) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        guard calendar.component(.weekday, from: now) == 6,
              let start = calendar.date(bySettingHour: 7, minute: 30, second: 0, of: now),
              let end = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: now) else { return false }
        return now >= start && now < end
    }

    /// Counts app visits during the Friday morning window.
    func enter() {
        let now = Date()
        guard Self.fridayWindow(now) else { return }
        let day = Self.dateKey(now)
        let count = defaults.string(forKey: "reminders.visitDay") == day ? defaults.integer(forKey: "reminders.visits") + 1 : 1
        defaults.set(day, forKey: "reminders.visitDay")
        defaults.set(count, forKey: "reminders.visits")
    }

    func consumeFriday() -> Bool {
        let now = Date()
        guard consent, PrayerService.shared.notificationsAuthorized, Self.fridayWindow(now) else { return false }
        let day = Self.dateKey(now)
        let visit = defaults.integer(forKey: "reminders.visits")
        let token = "\(day)|\(visit)"
        guard defaults.string(forKey: "reminders.visitDay") == day, visit > 0, (visit - 1) % 3 == 0,
              defaults.string(forKey: "reminders.shownVisit") != token else { return false }
        defaults.set(token, forKey: "reminders.shownVisit")
        return true
    }

    func consumeDailyOpen() -> String {
        guard let open = pendingDaily, Self.kinds.contains(open.kind) else { return "{}" }
        pendingDaily = nil
        let data = (try? JSONSerialization.data(withJSONObject: ["kind": open.kind, "id": open.id])) ?? Data()
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    // MARK: - Khatma (KhatmaScheduler.java)

    private func loadPlan() -> [String: Any]? {
        guard let text = defaults.string(forKey: "khatma.plan"), let plan = Self.validate(text) else { return nil }
        return plan
    }

    static func validate(_ text: String) -> [String: Any]? {
        guard text.count <= 35_000, let data = text.data(using: .utf8),
              let plan = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              (plan["version"] as? Int) == 1,
              let id = plan["id"] as? String, id.range(of: "^[a-z0-9-]{1,64}$", options: .regularExpression) != nil,
              let days = plan["days"] as? Int, (1...604).contains(days),
              let position = plan["position"] as? Int, (1...604).contains(position),
              let reminder = plan["reminder"] as? String, ["off", "daily", "before", "after"].contains(reminder),
              let read = plan["read"] as? [String: Any], read.count <= 604 else { return nil }
        return plan
    }

    func saveKhatma(_ text: String) -> String {
        guard Self.validate(text) != nil else { return "{\"ok\":false}" }
        defaults.set(text, forKey: "khatma.plan")
        schedule()
        return "{\"ok\":true}"
    }

    private func khatmaEvents(_ plan: [String: Any], now: Date) -> [Date] {
        let mode = plan["reminder"] as? String ?? "off"
        let read = plan["read"] as? [String: Any] ?? [:]
        guard mode != "off", read.count < 604 else { return [] }
        var list: [Date] = []
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        if mode == "daily" {
            for offset in 0..<4 {
                if let day = calendar.date(byAdding: .day, value: offset, to: now),
                   let at = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: day) { list.append(at) }
            }
        } else {
            let settings = PrayerSettings.load()
            guard (settings.json["confirmed"] as? Bool) == true else { return [] }
            for offset in 0...2 {
                let date = PrayerCalculator.day(settings, now: now, add: offset)
                guard let times = try? PrayerCalculator.calculate(settings, date) else { continue }
                for key in PrayerSettings.keys {
                    guard let ms = times[key] as? Int64 else { continue }
                    let iqama = (settings.row(key)["iqama"] as? Int) ?? 0
                    let minutes = mode == "before" ? -5 : iqama + 10
                    list.append(Date(timeIntervalSince1970: TimeInterval(ms) / 1000 + Double(minutes * 60)))
                }
            }
        }
        return list.filter { $0 > now.addingTimeInterval(5) }.sorted()
    }

    private func scheduleKhatma() {
        guard let plan = loadPlan() else { defaults.removeObject(forKey: "khatma.next"); return }
        let events = khatmaEvents(plan, now: Date()).prefix(Self.khatmaBudget)
        defaults.set(events.first.map { Int64($0.timeIntervalSince1970 * 1000) } ?? 0, forKey: "khatma.next")
        let position = plan["position"] as? Int ?? 1
        let done = (plan["read"] as? [String: Any])?.count ?? 0
        for at in events {
            let note = UNMutableNotificationContent()
            note.title = UiLanguage.text("موعدك مع القرآن")
            note.body = UiLanguage.text("ورد ختمتك ينتظرك · تابع من الصفحة {0} · أنجزت {1} من ٦٠٤ صفحات",
                                        UiLanguage.number(position), UiLanguage.number(done))
            note.sound = .default
            note.threadIdentifier = "khatma"
            note.userInfo = ["open": "khatma"]
            center.add(UNNotificationRequest(identifier: Self.khatmaPrefix + String(Int(at.timeIntervalSince1970)),
                                             content: note, trigger: trigger(at)))
        }
    }

    func khatmaStatus() -> String {
        var status: [String: Any] = [
            "notifications": PrayerService.shared.notificationsAuthorized,
            "exact": true,
            "channel": true,
            "next": defaults.object(forKey: "khatma.next") as? Int64 ?? 0,
            "error": "",
        ]
        if let plan = loadPlan() { status["plan"] = plan }
        let data = (try? JSONSerialization.data(withJSONObject: status)) ?? Data()
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    func consumeKhatmaOpen() -> Bool {
        defer { pendingKhatma = false }
        return pendingKhatma
    }
}
