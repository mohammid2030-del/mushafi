import UIKit
import UserNotifications
import CallKit
import ContactsUI

/// صحبة الفجر on iOS. iPhone never lets an app place a call without the user's tap, so the
/// schedule is a time-sensitive notification at Fajr and each call is one tap in the page.
/// CXCallObserver tells us exactly whether a call connected and when it ended.
final class FajrCompanion: NSObject, CXCallObserverDelegate, CNContactPickerDelegate {
    static let shared = FajrCompanion()
    private static let prefix = "fajr."
    private static let budget = 6          // iOS keeps 64 pending: prayer 36, daily 16, khatma 6, fajr 6
    private let defaults = UserDefaults.standard
    private let center = UNUserNotificationCenter.current()
    private let observer = CXCallObserver()

    weak var presenter: UIViewController?
    var onCall: ((String) -> Void)?
    var onContact: ((String) -> Void)?
    var pendingLaunch: String?

    private var dialing: (at: Date, sawCall: Bool, connectedAt: Date?, done: Bool)?
    private var noStart: DispatchWorkItem?

    override init() {
        super.init()
        observer.setDelegate(self, queue: .main)
    }

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
                  members.allSatisfy({ matches($0["phone"] as? String, "^\\+?[0-9]{3,18}$") }) else { return nil }
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
            "calls": true,
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

    // MARK: - Contacts

    func pickContact() {
        guard let presenter else { emitContact(["error": "unavailable"]); return }
        let picker = CNContactPickerViewController()
        picker.delegate = self
        picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
        picker.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0")
        picker.predicateForSelectionOfContact = NSPredicate(format: "phoneNumbers.@count == 1")
        var top = presenter
        while let next = top.presentedViewController { top = next }
        top.present(picker, animated: true)
    }

    func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        finishContact(contact, contact.phoneNumbers.first?.value.stringValue)
    }

    func contactPicker(_ picker: CNContactPickerViewController, didSelect property: CNContactProperty) {
        finishContact(property.contact, (property.value as? CNPhoneNumber)?.stringValue)
    }

    func contactPickerDidCancel(_ picker: CNContactPickerViewController) { emitContact(["error": "cancelled"]) }

    private func finishContact(_ contact: CNContact, _ raw: String?) {
        guard let phone = Self.number(raw) else { emitContact(["error": "number"]); return }
        let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
        emitContact(["name": name, "phone": phone])
    }

    private func emitContact(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        onContact?(json)
    }

    static func number(_ raw: String?) -> String? {
        guard let raw else { return nil }
        var digits = raw.map { ch -> Character in
            if let v = ch.wholeNumberValue, !ch.isASCII { return Character(String(v)) }   // Arabic-Indic digits
            return ch
        }.filter { $0.isASCII && ($0.isNumber || $0 == "+") }
        if digits.dropFirst().contains("+") { digits.removeAll { $0 == "+" } }
        let s = String(digits)
        return s.range(of: "^\\+?[0-9]{3,18}$", options: .regularExpression) != nil ? s : nil
    }

    // MARK: - Calling (one tap per call)

    func dial(_ raw: String?) {
        guard let number = Self.number(raw), let url = URL(string: "tel:" + number) else { emit(["state": "failed", "reason": "number"]); return }
        dialing = (Date(), false, nil, false)
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            guard let self else { return }
            if !opened { self.dialing = nil; self.emit(["state": "failed", "reason": "dial"]); return }
            // The system asks "Call …?" first; if the call never starts, report it rather than waiting forever.
            let work = DispatchWorkItem { [weak self] in
                guard let self, let d = self.dialing, !d.sawCall, !d.done else { return }
                self.dialing = nil; self.emit(["state": "cancelled"])
            }
            self.noStart?.cancel(); self.noStart = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 40, execute: work)
        }
    }

    /// Called when the app comes back without any call having started (the user cancelled the system prompt).
    func appBecameActive() {
        guard let d = dialing, !d.sawCall, !d.done, Date().timeIntervalSince(d.at) > 1.5 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self, let d = self.dialing, !d.sawCall, !d.done else { return }
            self.noStart?.cancel(); self.dialing = nil; self.emit(["state": "cancelled"])
        }
    }

    func cancelTracking() { noStart?.cancel(); dialing = nil }

    func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        guard call.isOutgoing, var d = dialing, !d.done else { return }
        if !d.sawCall { d.sawCall = true; noStart?.cancel(); dialing = d; emit(["state": "started"]) }
        if call.hasConnected && d.connectedAt == nil { d.connectedAt = Date(); dialing = d; emit(["state": "connected"]) }
        if call.hasEnded {
            let duration = d.connectedAt.map { Int(Date().timeIntervalSince($0).rounded()) } ?? 0
            dialing = nil
            emit(["state": "ended", "connected": d.connectedAt != nil, "duration": duration])
        }
    }

    private(set) var awake = false
    func keepAwake(_ on: Bool) { awake = on }

    private func emit(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        onCall?(json)
    }
}
