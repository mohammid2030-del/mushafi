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
    /// Bumped whenever the place changes, so weather can follow.
    @Published private(set) var placeStamp = 0
    @Published private(set) var zone: TimeZone = TimeZone(identifier: "Asia/Riyadh")!
    @Published private(set) var today: [PrayerTime] = []
    private var tomorrow: [PrayerTime] = []
    private var computedFor = ""

    private static let names = ["fajr": "الفجر", "sunrise": "الشروق", "dhuhr": "الظهر", "asr": "العصر", "maghrib": "المغرب", "isha": "العشاء"]

    init() { refresh() }

    func choose(_ c: City) { setPlace(name: c.name, latitude: c.latitude, longitude: c.longitude, zone: c.zone) }

    /// Moves prayer times (and with them weather and day/night) to a place.
    func setPlace(name: String, latitude: Double, longitude: Double, zone: String) {
        var settings = PrayerSettings.load()
        var json = settings.json
        json["city"] = name
        json["latitude"] = latitude
        json["longitude"] = longitude
        json["timezone"] = TimeZone(identifier: zone) != nil ? zone : TimeZone.current.identifier
        json["autoMethod"] = true
        json["method"] = "AUTO"
        json["confirmed"] = true
        if let updated = try? PrayerSettings(json) { settings = updated; settings.save() }
        computedFor = ""
        refresh()
    }

    var coordinate: (latitude: Double, longitude: Double)? {
        let json = PrayerSettings.load().json
        guard let lat = (json["latitude"] as? NSNumber)?.doubleValue, let lon = (json["longitude"] as? NSNumber)?.doubleValue,
              abs(lat) <= 90, abs(lon) <= 180 else { return nil }
        return (lat, lon)
    }

    /// Daytime runs from sunrise to maghrib of the chosen place.
    func isDay(_ now: Date = Date()) -> Bool {
        refresh(now: now)
        guard let sunrise = today.first(where: { $0.key == "sunrise" })?.date,
              let maghrib = today.first(where: { $0.key == "maghrib" })?.date else {
            var cal = Calendar(identifier: .gregorian); cal.timeZone = zone
            let h = cal.component(.hour, from: now); return h >= 6 && h < 18
        }
        return now >= sunrise && now < maghrib
    }

    /// The moment of the day at the chosen place (same split as the phone's home sky).
    func phase(_ now: Date = Date()) -> SkyPhase {
        refresh(now: now)
        func t(_ key: String) -> Date? { today.first(where: { $0.key == key })?.date }
        guard let fajr = t("fajr"), let sunrise = t("sunrise"), let asr = t("asr"), let maghrib = t("maghrib"), let isha = t("isha") else {
            return isDay(now) ? .day : .night
        }
        if now < fajr || now >= isha { return .night }
        if now < sunrise { return .dawn }
        if now < asr { return .day }
        if now < maghrib.addingTimeInterval(-25 * 60) { return .afternoon }
        return .dusk
    }

    /// Next sunrise or maghrib after now, to switch the appearance exactly then.
    func nextSunEvent(after now: Date = Date()) -> Date? {
        refresh(now: now)
        return (today + tomorrow).filter { ($0.key == "sunrise" || $0.key == "maghrib") && $0.date > now }.map(\.date).min()
    }

    func refresh(now: Date = Date()) {
        let settings = PrayerSettings.load()
        let stamp = settings.string("city") + PrayerCalculator.day(settings, now: now, add: 0).key
        guard stamp != computedFor else { return }
        city = settings.string("city")
        placeStamp &+= 1
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
