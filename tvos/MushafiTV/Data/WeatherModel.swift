import SwiftUI

/// Current weather at the prayer place (MET Norway, same source as the phone app), refreshed hourly.
@MainActor
final class WeatherModel: ObservableObject {
    enum Kind: String { case clear, partly, cloudy, rain, snow, fog, thunder }

    @Published private(set) var kind: Kind?
    @Published private(set) var temperature: Int?
    private var fetchedAt = Date.distantPast
    private var fetchedFor = ""
    private var loading = false

    init() {
        let d = UserDefaults.standard
        // Screenshot run: -tvWeather partly:24
        if let forced = d.string(forKey: "tvWeather") {
            let parts = forced.split(separator: ":")
            kind = Kind(rawValue: String(parts.first ?? ""))
            temperature = parts.count > 1 ? Int(parts[1]) : nil
            fetchedAt = .distantFuture
            return
        }
        if let k = d.string(forKey: "tv.wx.kind") { kind = Kind(rawValue: k) }
        if d.object(forKey: "tv.wx.temp") != nil { temperature = d.integer(forKey: "tv.wx.temp") }
        fetchedAt = Date(timeIntervalSince1970: d.double(forKey: "tv.wx.at"))
        fetchedFor = d.string(forKey: "tv.wx.for") ?? ""
    }

    func label(day: Bool) -> String {
        switch kind {
        case .clear: return day ? "سماء صافية" : "ليلة صافية"
        case .partly: return "غائم جزئيًا"
        case .cloudy: return "غائم"
        case .rain: return "أمطار"
        case .snow: return "ثلوج"
        case .fog: return "ضباب"
        case .thunder: return "عواصف رعدية"
        case nil: return ""
        }
    }

    func symbol(day: Bool) -> String {
        switch kind {
        case .clear: return day ? "sun.max.fill" : "moon.stars.fill"
        case .partly: return day ? "cloud.sun.fill" : "cloud.moon.fill"
        case .cloudy: return "cloud.fill"
        case .rain: return "cloud.rain.fill"
        case .snow: return "cloud.snow.fill"
        case .fog: return "cloud.fog.fill"
        case .thunder: return "cloud.bolt.rain.fill"
        case nil: return "cloud"
        }
    }

    func refresh(_ prayer: PrayerModel) {
        guard let c = prayer.coordinate, !loading else { return }
        let key = String(format: "%.2f,%.2f", locale: Locale(identifier: "en_US_POSIX"), c.latitude, c.longitude)
        guard key != fetchedFor || Date().timeIntervalSince(fetchedAt) > 3600 else { return }
        guard let url = URL(string: "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=\(key.split(separator: ",")[0])&lon=\(key.split(separator: ",")[1])") else { return }
        loading = true
        var request = URLRequest(url: url, timeoutInterval: 12)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        request.setValue("Mushafi/\(version) (tvOS) https://mushafiapp.com/", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let parsed = (response as? HTTPURLResponse)?.statusCode == 200 ? data.flatMap(Self.parse) : nil
            Task { @MainActor in
                self.loading = false
                guard let parsed else { return }
                self.kind = parsed.kind
                self.temperature = parsed.temp
                self.fetchedAt = Date()
                self.fetchedFor = key
                let d = UserDefaults.standard
                d.set(parsed.kind.rawValue, forKey: "tv.wx.kind")
                d.set(parsed.temp, forKey: "tv.wx.temp")
                d.set(self.fetchedAt.timeIntervalSince1970, forKey: "tv.wx.at")
                d.set(key, forKey: "tv.wx.for")
            }
        }.resume()
    }

    nonisolated private static func parse(_ data: Data) -> (kind: Kind, temp: Int)? {
        guard data.count < 600_000,
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let series = (root["properties"] as? [String: Any])?["timeseries"] as? [[String: Any]] else { return nil }
        let iso = ISO8601DateFormatter()
        let now = Date()
        var chosen: [String: Any]?
        var best = Date.distantPast
        for item in series {
            guard let t = (item["time"] as? String).flatMap(iso.date(from:)) else { continue }
            if t <= now, t > best { best = t; chosen = item }
        }
        guard let entry = chosen?["data"] as? [String: Any],
              let temp = (((entry["instant"] as? [String: Any])?["details"] as? [String: Any])?["air_temperature"] as? NSNumber)?.doubleValue,
              temp.isFinite, temp > -100, temp < 70 else { return nil }
        let period = (entry["next_1_hours"] as? [String: Any]) ?? (entry["next_6_hours"] as? [String: Any])
        let symbol = ((period?["summary"] as? [String: Any])?["symbol_code"] as? String) ?? ""
        let kind: Kind
        if symbol.contains("thunder") { kind = .thunder }
        else if symbol.contains("snow") || symbol.contains("sleet") { kind = .snow }
        else if symbol.contains("rain") { kind = .rain }
        else if symbol.contains("fog") { kind = .fog }
        else if symbol.contains("partlycloudy") || symbol.contains("fair") { kind = .partly }
        else if symbol.contains("cloudy") { kind = .cloudy }
        else { kind = .clear }
        return (kind, Int(temp.rounded()))
    }
}

/// Light from sunrise to maghrib, dark after, unless the viewer fixes one.
@MainActor
final class AppearanceModel: ObservableObject {
    enum Mode: String, CaseIterable { case auto, light, dark
        var title: String { switch self { case .auto: "تلقائي حسب الشمس"; case .light: "فاتح دائمًا"; case .dark: "داكن دائمًا" } }
        var detail: String { switch self { case .auto: "فاتح من الشروق وداكن من المغرب"; case .light: "ورق كريمي وخط داكن"; case .dark: "مريح في الإضاءة الخافتة" } }
    }

    @Published var mode: Mode { didSet { UserDefaults.standard.set(mode.rawValue, forKey: "tv.appearance"); update() } }
    @Published private(set) var isDay = false
    private weak var prayer: PrayerModel?
    private var timer: Timer?

    init() {
        let d = UserDefaults.standard
        mode = Mode(rawValue: d.string(forKey: "tvAppearance") ?? d.string(forKey: "tv.appearance") ?? "") ?? .auto
    }

    var light: Bool { mode == .light || (mode == .auto && isDay) }
    var scheme: ColorScheme { light ? .light : .dark }

    func attach(_ prayer: PrayerModel) {
        self.prayer = prayer
        update()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in Task { @MainActor in self?.update() } }
    }

    func update() {
        // Screenshot run: -tvDay 1/0 fixes day or night.
        if let forced = UserDefaults.standard.string(forKey: "tvDay") { isDay = forced == "1"; return }
        let day = prayer?.isDay() ?? false
        if day != isDay { withAnimation(.easeInOut(duration: 2.5)) { isDay = day } }
    }
}
