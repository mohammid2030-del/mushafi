import Foundation

/// Port of HomeWeather.java: MET Norway compact forecast, coordinates rounded to ~1 km.
enum WeatherService {
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        return URLSession(configuration: config)
    }()

    static func load(latitude: Double, longitude: Double, key: String, completion: @escaping ([String: Any]) -> Void) {
        let failure: [String: Any] = ["key": key, "error": true]
        guard abs(latitude) <= 90, abs(longitude) <= 180 else { completion(failure); return }
        let lat = String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), latitude)
        let lon = String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), longitude)
        guard let url = URL(string: "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=\(lat)&lon=\(lon)") else {
            completion(failure); return
        }
        var request = URLRequest(url: url)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        request.setValue("Mushafi/\(version) (iOS) https://mushafiapp.com/",
                         forHTTPHeaderField: "User-Agent")

        session.dataTask(with: request) { data, response, _ in
            var result = failure
            if let http = response as? HTTPURLResponse, http.statusCode == 200,
               let data, data.count <= 524_288,
               let parsed = parse(data, key: key, now: Date()) {
                result = parsed
            }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }

    static func parse(_ data: Data, key: String, now: Date) -> [String: Any]? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let properties = root["properties"] as? [String: Any],
              let series = properties["timeseries"] as? [[String: Any]] else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        var chosen: [String: Any]?
        var selected = Date.distantPast
        for item in series {
            guard let text = item["time"] as? String, let time = iso.date(from: text) else { continue }
            if time <= now && time > selected { chosen = item; selected = time }
        }
        guard let chosen, now.timeIntervalSince(selected) <= 7200,
              let entry = chosen["data"] as? [String: Any],
              let instant = entry["instant"] as? [String: Any],
              let details = instant["details"] as? [String: Any],
              let temperature = (details["air_temperature"] as? NSNumber)?.doubleValue,
              temperature.isFinite, temperature >= -100, temperature <= 70 else { return nil }
        let period = (entry["next_1_hours"] as? [String: Any]) ?? (entry["next_6_hours"] as? [String: Any])
        let summary = period?["summary"] as? [String: Any]
        let symbol = summary?["symbol_code"] as? String ?? ""
        return [
            "key": key,
            "temperature": temperature,
            "symbol": symbol,
            "forecastAt": Int64(selected.timeIntervalSince1970 * 1000),
            "fetchedAt": Int64(now.timeIntervalSince1970 * 1000),
        ]
    }
}
