import SwiftUI

struct PrayerTime: Identifiable {
    let key: String
    let name: String
    let date: Date
    var id: String { key }
}

/// Today's and tomorrow's times from the same engine as the phone app (adhan.js, Umm al-Qura in Saudi Arabia).
final class PrayerModel: ObservableObject {
    @Published private(set) var city: String = "الرياض"
    @Published private(set) var zone: TimeZone = TimeZone(identifier: "Asia/Riyadh")!
    @Published private(set) var today: [PrayerTime] = []
    private var tomorrow: [PrayerTime] = []
    private var computedFor = ""

    private static let names = ["fajr": "الفجر", "sunrise": "الشروق", "dhuhr": "الظهر", "asr": "العصر", "maghrib": "المغرب", "isha": "العشاء"]

    init() { refresh() }

    func choose(_ c: City) {
        var settings = PrayerSettings.load()
        var json = settings.json
        json["city"] = c.name
        json["latitude"] = c.latitude
        json["longitude"] = c.longitude
        json["timezone"] = c.zone
        json["autoMethod"] = true
        json["method"] = "AUTO"
        json["confirmed"] = true
        if let updated = try? PrayerSettings(json) { settings = updated; settings.save() }
        computedFor = ""
        refresh()
    }

    func refresh(now: Date = Date()) {
        let settings = PrayerSettings.load()
        let stamp = settings.string("city") + PrayerCalculator.day(settings, now: now, add: 0).key
        guard stamp != computedFor else { return }
        city = settings.string("city")
        zone = settings.timezone
        today = rows(settings, PrayerCalculator.day(settings, now: now, add: 0))
        tomorrow = rows(settings, PrayerCalculator.day(settings, now: now, add: 1))
        computedFor = stamp
    }

    private func rows(_ settings: PrayerSettings, _ day: PrayerCalculator.Day) -> [PrayerTime] {
        guard let result = try? PrayerCalculator.calculate(settings, day) else { return [] }
        return PrayerCalculator.dayKeys.compactMap { key in
            guard let ms = (result[key] as? Int64) ?? (result[key] as? NSNumber)?.int64Value else { return nil }
            return PrayerTime(key: key, name: Self.names[key] ?? key, date: Date(timeIntervalSince1970: Double(ms) / 1000))
        }
    }

    /// Next adhan (sunrise is skipped), rolling over to tomorrow's Fajr after Isha.
    func next(after now: Date = Date()) -> PrayerTime? {
        refresh(now: now)
        return today.first { $0.key != "sunrise" && $0.date > now } ?? tomorrow.first { $0.key == "fajr" }
    }

    func countdown(to date: Date, now: Date = Date()) -> String {
        let seconds = max(0, Int(date.timeIntervalSince(now)))
        let h = seconds / 3600, m = seconds % 3600 / 60
        if h > 0 { return "بعد \(h.ar) س و\(m.ar) د" }
        if m > 0 { return "بعد \(m.ar) دقيقة" }
        return "حان الآن"
    }

    func dateLine(_ now: Date = Date()) -> (gregorian: String, hijri: String) {
        let g = DateFormatter()
        g.locale = Locale(identifier: "ar")
        g.timeZone = zone
        g.dateFormat = "EEEE d MMMM"
        let h = DateFormatter()
        h.locale = Locale(identifier: "ar")
        h.calendar = Calendar(identifier: .islamicUmmAlQura)
        h.timeZone = zone
        h.dateFormat = "d MMMM y"
        return (g.string(from: now).arDigits, h.string(from: now).arDigits + " هـ")
    }
}
