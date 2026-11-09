import Foundation
import JavaScriptCore

// Port of PrayerSettings.java, PrayerRegion.java, PrayerCalculator.java and
// PrayerRemoteSource.java. Astronomy runs the bundled adhan.min.js (Batoul Apps) — the
// same library family Android and the web UI use — inside JavaScriptCore.

enum PrayerError: Error { case invalid(String) }

/// One validated configuration shared by the screen, notifications and widgets.
struct PrayerSettings {
    static let keys = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
    static let names = ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"]
    static let voices = ["afasy", "nafees", "mansour", "mustafa", "silent"]
    static let methods = ["AUTO", "UMM_AL_QURA", "MUSLIM_WORLD_LEAGUE", "EGYPTIAN", "KARACHI", "DUBAI", "KUWAIT", "QATAR", "SINGAPORE", "NORTH_AMERICA"]

    private(set) var json: [String: Any]

    init(_ input: [String: Any]) throws {
        var out: [String: Any] = ["version": 1]
        out["confirmed"] = Self.bool(input, "confirmed", false)
        out["enabled"] = Self.bool(input, "enabled", false)
        let city = ((input["city"] as? String) ?? "الرياض").trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...80).contains(city.count) else { throw PrayerError.invalid("city") }
        out["city"] = city
        let lat = Self.double(input, "latitude") ?? 24.7136
        let lon = Self.double(input, "longitude") ?? 46.6753
        guard lat.isFinite, abs(lat) <= 89, lon.isFinite, abs(lon) <= 180 else { throw PrayerError.invalid("coordinates") }
        out["latitude"] = lat
        out["longitude"] = lon
        let zone = (input["timezone"] as? String) ?? "Asia/Riyadh"
        guard TimeZone(identifier: zone) != nil else { throw PrayerError.invalid("timezone") }
        out["timezone"] = zone
        var method = (input["method"] as? String) ?? "UMM_AL_QURA"
        let automatic = Self.bool(input, "autoMethod", input["method"] == nil || method == "AUTO")
        guard Self.methods.contains(method) else { throw PrayerError.invalid("method") }
        if method == "AUTO" { method = "UMM_AL_QURA" }
        out["autoMethod"] = automatic
        out["method"] = automatic ? PrayerRegion.method(zone: zone) : method
        out["onlineSource"] = Self.bool(input, "onlineSource", true)
        let asr = (input["asr"] as? String) ?? "SHAFI"
        guard asr == "SHAFI" || asr == "HANAFI" else { throw PrayerError.invalid("asr") }
        out["asr"] = asr
        let ramadan = (input["ramadan"] as? String) ?? "auto"
        guard ["auto", "on", "off"].contains(ramadan) else { throw PrayerError.invalid("ramadan") }
        out["ramadan"] = ramadan
        out["duhaOffset"] = try Self.bounded(input, "duhaOffset", 15, 10, 30)
        out["zawalOffset"] = try Self.bounded(input, "zawalOffset", 10, 5, 20)
        out["reminderMinutes"] = try Self.bounded(input, "reminderMinutes", 5, 1, 15)
        var voice = (input["voice"] as? String) ?? "afasy"
        if voice == "ali_mulla" { voice = "afasy" }
        guard Self.voices.contains(voice) else { throw PrayerError.invalid("voice") }
        out["voice"] = voice

        let offsets = (input["offsets"] as? [String: Any]) ?? [:]
        let rows = (input["prayers"] as? [String: Any]) ?? [:]
        let defaults = [20, 20, 20, 10, 20]
        var prayers: [String: Any] = [:]
        var tune: [String: Any] = [:]
        for (i, key) in Self.keys.enumerated() {
            let row = (rows[key] as? [String: Any]) ?? [:]
            let iqama = try Self.bounded(row, "iqama", defaults[i], 0, 120)
            prayers[key] = [
                "iqama": iqama,
                "adhan": Self.bool(row, "adhan", true),
                "reminder": Self.bool(row, "reminder", true),
                "atIqama": Self.bool(row, "atIqama", true),
            ] as [String: Any]
            tune[key] = try Self.bounded(offsets, key, 0, -30, 30)
        }
        tune["sunrise"] = try Self.bounded(offsets, "sunrise", 0, -30, 30)
        out["prayers"] = prayers
        out["offsets"] = tune
        json = out
    }

    // MARK: Accessors

    var enabled: Bool { (json["enabled"] as? Bool ?? false) && (json["confirmed"] as? Bool ?? false) }
    var timezone: TimeZone { TimeZone(identifier: string("timezone")) ?? .current }
    var latitude: Double { (json["latitude"] as? Double) ?? 24.7136 }
    var longitude: Double { (json["longitude"] as? Double) ?? 46.6753 }
    var voice: String { string("voice") }
    func string(_ key: String) -> String { json[key] as? String ?? "" }
    func int(_ key: String) -> Int { (json[key] as? Int) ?? 0 }
    func row(_ key: String) -> [String: Any] { ((json["prayers"] as? [String: Any])?[key] as? [String: Any]) ?? [:] }
    func offset(_ key: String) -> Int { ((json["offsets"] as? [String: Any])?[key] as? Int) ?? 0 }

    mutating func set(_ key: String, _ value: Any) { json[key] = value }

    // MARK: Persistence (App Group, so widgets read the same settings)

    private static let storageKey = "prayer.settings"

    static func load() -> PrayerSettings {
        let defaults = AppGroup.defaults
        var settings: PrayerSettings
        if let text = defaults.string(forKey: storageKey), let object = parse(text), let valid = try? PrayerSettings(object) {
            settings = valid
        } else {
            settings = try! PrayerSettings([:])   // defaults are always valid
        }
        if !defaults.bool(forKey: "prayer.asrIqama20_v1") {
            if (settings.row("asr")["iqama"] as? Int) == 15 {
                var prayers = settings.json["prayers"] as? [String: Any] ?? [:]
                var asr = prayers["asr"] as? [String: Any] ?? [:]
                asr["iqama"] = 20
                prayers["asr"] = asr
                settings.json["prayers"] = prayers
            }
            defaults.set(true, forKey: "prayer.asrIqama20_v1")
            settings.save()
        }
        if !defaults.bool(forKey: "prayer.regional_method_v1") {
            if settings.string("method") == "UMM_AL_QURA" {
                settings.json["autoMethod"] = true
                settings.json["method"] = PrayerRegion.method(zone: settings.string("timezone"))
            }
            defaults.set(true, forKey: "prayer.regional_method_v1")
            settings.save()
        }
        return settings
    }

    func save() {
        AppGroup.defaults.set(Self.serialize(json), forKey: Self.storageKey)
    }

    // MARK: Helpers

    static func parse(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func serialize(_ object: Any) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return "{}" }
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    private static func bool(_ object: [String: Any], _ key: String, _ fallback: Bool) -> Bool {
        guard let value = object[key] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { return fallback }
        return value.boolValue
    }

    private static func double(_ object: [String: Any], _ key: String) -> Double? {
        guard let value = object[key] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
        return value.doubleValue
    }

    private static func bounded(_ object: [String: Any], _ key: String, _ fallback: Int, _ min: Int, _ max: Int) throws -> Int {
        guard let raw = object[key] else { return fallback }
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { throw PrayerError.invalid(key) }
        let d = number.doubleValue
        guard d.isFinite, d == d.rounded(), d >= Double(min), d <= Double(max) else { throw PrayerError.invalid(key) }
        return Int(d)
    }
}

/// Offline method suggestions by time zone (PrayerRegion.java).
enum PrayerRegion {
    static func method(_ settings: PrayerSettings) -> String {
        let chosen = settings.string("method")
        return ((settings.json["autoMethod"] as? Bool) == true || chosen == "AUTO") ? method(zone: settings.string("timezone")) : chosen
    }

    static func method(zone: String) -> String {
        switch zone {
        case "Asia/Riyadh", "Asia/Aden": return "UMM_AL_QURA"
        case "Asia/Dubai": return "DUBAI"
        case "Asia/Kuwait": return "KUWAIT"
        case "Asia/Qatar": return "QATAR"
        case "Africa/Cairo": return "EGYPTIAN"
        case "Asia/Karachi", "Asia/Dhaka", "Asia/Kolkata", "Asia/Calcutta": return "KARACHI"
        case "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Kuching", "Asia/Makassar", "Asia/Jayapura": return "SINGAPORE"
        default:
            if zone.hasPrefix("Asia/Jakarta") { return "SINGAPORE" }
            if zone.hasPrefix("America/") { return "NORTH_AMERICA" }
            return "MUSLIM_WORLD_LEAGUE"
        }
    }
}

/// adhan.min.js inside JavaScriptCore. Thread-safe through a serial queue.
final class PrayerAstronomy {
    static let shared = PrayerAstronomy()

    private let queue = DispatchQueue(label: "mushafi.prayer.astronomy")
    private var context: JSContext?
    private var function: JSValue?

    private static let methodNames = [
        "UMM_AL_QURA": "UmmAlQura", "MUSLIM_WORLD_LEAGUE": "MuslimWorldLeague", "EGYPTIAN": "Egyptian",
        "KARACHI": "Karachi", "DUBAI": "Dubai", "KUWAIT": "Kuwait", "QATAR": "Qatar",
        "SINGAPORE": "Singapore", "NORTH_AMERICA": "NorthAmerica",
    ]

    private static let helper = """
    var mushafiPrayerTimes = function (lat, lon, y, m, d, method, madhab, adj) {
      var params = adhan.CalculationMethod[method]();
      params.madhab = madhab === 'HANAFI' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
      for (var k in adj) { params.adjustments[k] = adj[k]; }
      var t = new adhan.PrayerTimes(new adhan.Coordinates(lat, lon), new Date(y, m - 1, d, 12), params);
      return [+t.fajr, +t.sunrise, +t.dhuhr, +t.asr, +t.maghrib, +t.isha];
    };
    """

    private init() {}

    private func prepare() -> JSValue? {
        if let function { return function }
        guard let url = SharedResources.url("adhan.min", "js"),
              let source = try? String(contentsOf: url, encoding: .utf8),
              let context = JSContext() else { return nil }
        context.evaluateScript(source)
        context.evaluateScript(Self.helper)
        self.context = context
        function = context.objectForKeyedSubscript("mushafiPrayerTimes")
        return function
    }

    /// Returns [fajr, sunrise, dhuhr, asr, maghrib, isha] in epoch milliseconds.
    func times(latitude: Double, longitude: Double, year: Int, month: Int, day: Int,
               method: String, madhab: String, adjustments: [String: Int]) -> [Double]? {
        queue.sync {
            guard let fn = prepare(), let name = Self.methodNames[method] else { return nil }
            let result = fn.call(withArguments: [latitude, longitude, year, month, day, name, madhab, adjustments])
            guard let values = result?.toArray() as? [NSNumber], values.count == 6 else { return nil }
            let doubles = values.map { $0.doubleValue }
            return doubles.allSatisfy({ $0.isFinite }) ? doubles : nil
        }
    }
}

/// PrayerCalculator.java.
enum PrayerCalculator {
    static let minute: Int64 = 60_000
    static let dayKeys = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]

    struct Day {
        let year: Int, month: Int, day: Int
        var key: String { String(format: "%04ld-%02ld-%02ld", year, month, day) }
    }

    static func day(_ settings: PrayerSettings, now: Date, add: Int) -> Day {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = settings.timezone
        let shifted = calendar.date(byAdding: .day, value: add, to: now) ?? now
        let c = calendar.dateComponents([.year, .month, .day], from: shifted)
        return Day(year: c.year ?? 2000, month: c.month ?? 1, day: c.day ?? 1)
    }

    /// Umm al-Qura month 9, evaluated at noon UTC of the civil date (same as the web UI).
    static func isRamadan(_ day: Day) -> Bool {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard let date = utc.date(from: DateComponents(year: day.year, month: day.month, day: day.day, hour: 12)) else { return false }
        var hijri = Calendar(identifier: .islamicUmmAlQura)
        hijri.timeZone = TimeZone(identifier: "UTC")!
        return hijri.component(.month, from: date) == 9
    }

    static func calculate(_ settings: PrayerSettings, _ day: Day) throws -> [String: Any] {
        if let remote = PrayerSource.day(settings, day) { return remote }
        let method = PrayerRegion.method(settings)
        var adjustments: [String: Int] = [:]
        for key in ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] { adjustments[key] = settings.offset(key) }
        let mode = settings.string("ramadan")
        let extra = mode == "on" || (mode == "auto" && isRamadan(day))
        if method == "UMM_AL_QURA" && extra { adjustments["isha", default: 0] += 30 }
        guard let times = PrayerAstronomy.shared.times(latitude: settings.latitude, longitude: settings.longitude,
                                                       year: day.year, month: day.month, day: day.day,
                                                       method: method, madhab: settings.string("asr"),
                                                       adjustments: adjustments) else {
            throw PrayerError.invalid("No valid ordered solar times for these coordinates/date")
        }
        var result: [String: Any] = ["date": day.key, "ramadanAdjustment": extra && method == "UMM_AL_QURA"]
        var previous: Int64 = 0
        for (i, key) in dayKeys.enumerated() {
            let value = Int64(times[i])
            guard value > previous else { throw PrayerError.invalid("No valid ordered solar times for these coordinates/date") }
            previous = value
            result[key] = value
        }
        try PrayerSource.apply(settings, day, &result)
        result["duha"] = (result["sunrise"] as! Int64) + Int64(settings.int("duhaOffset")) * minute
        result["duhaEnd"] = (result["dhuhr"] as! Int64) - Int64(settings.int("zawalOffset")) * minute
        return result
    }

    static func snapshot(_ settings: PrayerSettings, now: Date) throws -> [String: Any] {
        var days: [[String: Any]] = []
        for n in -1...2 { days.append(try calculate(settings, day(settings, now: now, add: n))) }
        return ["now": Int64(now.timeIntervalSince1970 * 1000), "settings": settings.json, "days": days]
    }
}

/// PrayerRemoteSource.java: validated AlAdhan monthly cache. Calculations never block on the network.
enum PrayerSource {
    private static let cacheKey = "prayer.sourceCache"
    private static let remoteNames = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]
    private static var busy = false
    private static var attempted = Date.distantPast

    static var cache: [String: Any] {
        guard let text = AppGroup.string(cacheKey), let object = PrayerSettings.parse(text) else { return [:] }
        return object
    }

    private static func profile(_ s: PrayerSettings) -> String {
        ((s.json["autoMethod"] as? Bool) == true ? "AUTO" : s.string("method")) + "|" + s.string("asr") + "|" + s.string("timezone")
    }

    private static func matches(_ data: [String: Any], _ s: PrayerSettings) -> Bool {
        guard (s.json["onlineSource"] as? Bool) ?? true, profile(s) == (data["profile"] as? String) else { return false }
        let lat = s.latitude, lon = s.longitude
        let a = (lat - ((data["latitude"] as? Double) ?? 999)) * .pi / 180
        let b = (lon - ((data["longitude"] as? Double) ?? 999)) * .pi / 180
        let km = sqrt(a * a + pow(b * cos(lat * .pi / 180), 2)) * 6371
        return km <= 0.5
    }

    private static func methodId(_ method: String) -> Int {
        switch method {
        case "UMM_AL_QURA": return 4
        case "EGYPTIAN": return 5
        case "KARACHI": return 1
        case "DUBAI": return 16
        case "KUWAIT": return 9
        case "QATAR": return 10
        case "SINGAPORE": return 11
        case "NORTH_AMERICA": return 2
        default: return 3
        }
    }

    static func day(_ settings: PrayerSettings, _ day: PrayerCalculator.Day) -> [String: Any]? {
        var result: [String: Any] = ["date": day.key]
        guard (try? apply(settings, day, &result)) != nil, (result["source"] as? String) == "aladhan" else { return nil }
        result["duha"] = (result["sunrise"] as! Int64) + Int64(settings.int("duhaOffset")) * PrayerCalculator.minute
        result["duhaEnd"] = (result["dhuhr"] as! Int64) - Int64(settings.int("zawalOffset")) * PrayerCalculator.minute
        return result
    }

    static func apply(_ settings: PrayerSettings, _ day: PrayerCalculator.Day, _ result: inout [String: Any]) throws {
        let current = cache
        result["source"] = "offline"
        result["sourceMethod"] = PrayerRegion.method(settings)
        guard matches(current, settings),
              let days = current["days"] as? [String: Any],
              let row = days[day.key] as? [String: Any] else { return }
        let method = (row["methodId"] as? Int) ?? 0
        var extra = false
        var values: [String: Int64] = [:]
        for key in PrayerCalculator.dayKeys {
            guard var at = (row[key] as? NSNumber)?.int64Value else { return }
            if key == "isha" && method == 4, let maghrib = (row["maghrib"] as? NSNumber)?.int64Value {
                let mode = settings.string("ramadan")
                extra = mode == "on" || (mode == "auto" && at - maghrib >= 110 * PrayerCalculator.minute)
                if mode != "auto" { at = maghrib + (extra ? 120 : 90) * PrayerCalculator.minute }
            }
            values[key] = at + Int64(settings.offset(key)) * PrayerCalculator.minute
        }
        var previous: Int64 = 0
        for key in PrayerCalculator.dayKeys {
            guard let at = values[key], at > previous else { throw PrayerError.invalid("unordered source times") }
            previous = at
        }
        for (key, value) in values { result[key] = value }
        result["ramadanAdjustment"] = extra
        result["source"] = "aladhan"
        result["sourceMethod"] = (row["methodName"] as? String) ?? ""
        result["sourceMethodId"] = method
        result["sourceUpdated"] = (current["fetchedAt"] as? NSNumber)?.int64Value ?? 0
    }

    /// Fetches the AlAdhan months covering yesterday…+2 days when the cache is stale.
    static func refresh(_ settings: PrayerSettings, completion: ((Bool) -> Void)? = nil) {
        guard (settings.json["confirmed"] as? Bool) == true, (settings.json["onlineSource"] as? Bool) ?? true else {
            completion?(false); return
        }
        let now = Date()
        var complete = matches(cache, settings) && now.timeIntervalSince1970 * 1000 - Double((cache["fetchedAt"] as? NSNumber)?.int64Value ?? 0) < 86_400_000
        let cachedDays = cache["days"] as? [String: Any]
        for n in -1...2 where complete {
            complete = cachedDays?[PrayerCalculator.day(settings, now: now, add: n).key] != nil
        }
        guard !complete, !busy, now.timeIntervalSince(attempted) >= 30 else { completion?(false); return }
        busy = true
        attempted = now

        var months: [String] = []
        for n in -1...2 {
            let d = PrayerCalculator.day(settings, now: now, add: n)
            let month = "\(d.year)/\(d.month)"
            if !months.contains(month) { months.append(month) }
        }
        let requested = settings
        DispatchQueue.global(qos: .utility).async {
            var rows: [String: Any] = [:]
            var ok = true
            for month in months {
                var query = "latitude=\(requested.latitude)&longitude=\(requested.longitude)&school=\(requested.string("asr") == "HANAFI" ? 1 : 0)"
                query += "&timezonestring=" + (requested.string("timezone").addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")
                if (requested.json["autoMethod"] as? Bool) != true { query += "&method=\(methodId(requested.string("method")))" }
                guard let url = URL(string: "https://api.aladhan.com/v1/calendar/\(month)?\(query)&iso8601=true"),
                      let payload = fetch(url),
                      let parsed = try? parseCalendar(payload, requested, month) else { ok = false; break }
                rows.merge(parsed) { _, new in new }
            }
            var updated = false
            if ok {
                let result: [String: Any] = [
                    "profile": profile(requested), "latitude": requested.latitude, "longitude": requested.longitude,
                    "fetchedAt": Int64(Date().timeIntervalSince1970 * 1000), "days": rows,
                ]
                if matches(result, PrayerSettings.load()) {
                    AppGroup.set(PrayerSettings.serialize(result), cacheKey)
                    updated = true
                }
            }
            DispatchQueue.main.async {
                busy = false
                completion?(updated)
            }
        }
    }

    private static func fetch(_ url: URL) -> [String: Any]? {
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Mushafi-Prayer/1", forHTTPHeaderField: "User-Agent")
        let semaphore = DispatchSemaphore(value: 0)
        var output: [String: Any]?
        URLSession.shared.dataTask(with: request) { data, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200, let data, data.count <= 524_288 {
                output = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 15)
        return output
    }

    static func parseCalendar(_ payload: [String: Any], _ requested: PrayerSettings, _ month: String) throws -> [String: Any] {
        let target = month.split(separator: "/").compactMap { Int($0) }
        guard target.count == 2, (1...12).contains(target[1]) else { throw PrayerError.invalid("month") }
        let year = target[0], number = target[1]
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard let first = utc.date(from: DateComponents(year: year, month: number, day: 1)),
              let length = utc.range(of: .day, in: .month, for: first)?.count,
              (payload["code"] as? Int) == 200,
              let data = payload["data"] as? [[String: Any]], data.count == length else { throw PrayerError.invalid("calendar") }
        let school = requested.string("asr") == "HANAFI" ? "HANAFI" : "STANDARD"
        let prefix = String(format: "%04ld-%02ld-", year, number)
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        var rows: [String: Any] = [:]
        for entry in data {
            guard let meta = entry["meta"] as? [String: Any],
                  let method = meta["method"] as? [String: Any],
                  let times = entry["timings"] as? [String: Any],
                  let gregorian = (entry["date"] as? [String: Any])?["gregorian"] as? [String: Any],
                  let raw = gregorian["date"] as? String,
                  raw.range(of: "^[0-9]{2}-[0-9]{2}-[0-9]{4}$", options: .regularExpression) != nil else { throw PrayerError.invalid("date") }
            let parts = raw.split(separator: "-").map(String.init)
            let key = parts[2] + "-" + parts[1] + "-" + parts[0]
            guard key.hasPrefix(prefix), rows[key] == nil else { throw PrayerError.invalid("duplicate date") }
            guard let mLat = (meta["latitude"] as? NSNumber)?.doubleValue, let mLon = (meta["longitude"] as? NSNumber)?.doubleValue,
                  abs(mLat - requested.latitude) <= 0.001, abs(mLon - requested.longitude) <= 0.001 else { throw PrayerError.invalid("coordinates") }
            guard let zone = meta["timezone"] as? String, let tz = TimeZone(identifier: zone),
                  zone == requested.string("timezone") || tz.secondsFromGMT() == requested.timezone.secondsFromGMT() else { throw PrayerError.invalid("zone") }
            guard (meta["school"] as? String) == school else { throw PrayerError.invalid("school") }
            guard let id = method["id"] as? Int, (0...99).contains(id),
                  (requested.json["autoMethod"] as? Bool) == true || id == methodId(requested.string("method")) else { throw PrayerError.invalid("method") }
            var row: [String: Any] = [:]
            var previous: Int64 = 0
            for (j, name) in remoteNames.enumerated() {
                guard let clock = times[name] as? String, clock.hasPrefix(key + "T"), let date = iso.date(from: clock) else { throw PrayerError.invalid("time") }
                var at = Int64(date.timeIntervalSince1970 * 1000)
                if j == remoteNames.count - 1 && at <= previous { at += 86_400_000 }
                guard at > previous else { throw PrayerError.invalid("unordered") }
                previous = at
                row[PrayerCalculator.dayKeys[j]] = at
            }
            guard let name = method["name"] as? String, !name.isEmpty, name.count <= 200 else { throw PrayerError.invalid("method name") }
            row["methodId"] = id
            row["methodName"] = name
            rows[key] = row
        }
        return rows
    }
}
