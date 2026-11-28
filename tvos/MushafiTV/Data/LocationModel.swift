import Foundation
import CoreLocation

/// Where prayer times and weather come from: the Apple TV's own location (with permission),
/// else the approximate place of the internet connection, else a city the viewer picks.
/// Nothing leaves the device except the coordinates sent for the weather forecast.
@MainActor
final class LocationModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    enum Source: String { case device, internet, manual }

    @Published private(set) var automatic: Bool
    @Published private(set) var source: Source
    @Published private(set) var busy = false

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private weak var prayer: PrayerModel?
    private var lastAuto: Date
    private let defaults = UserDefaults.standard

    override init() {
        automatic = defaults.object(forKey: "tv.locationAuto") as? Bool ?? true
        source = Source(rawValue: defaults.string(forKey: "tv.locationSource") ?? "") ?? .manual
        lastAuto = Date(timeIntervalSince1970: defaults.double(forKey: "tv.locationAt"))
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /// The App Store screenshot run must never show a permission prompt.
    static let screenshotRun = ["tvTab", "tvReader", "tvWeather"].contains { UserDefaults.standard.object(forKey: $0) != nil }

    var sourceLabel: String {
        switch source {
        case .device: return "من جهاز Apple TV"
        case .internet: return "تقريبي من اتصال الإنترنت"
        case .manual: return automatic ? "تلقائي" : "مدينة مختارة"
        }
    }

    func attach(_ prayer: PrayerModel) {
        self.prayer = prayer
        refreshIfNeeded()
    }

    /// Re-locates at most every six hours while automatic.
    func refreshIfNeeded() {
        guard !Self.screenshotRun, automatic, prayer != nil, Date().timeIntervalSince(lastAuto) > 6 * 3600 || source == .manual else { return }
        locate()
    }

    func useAutomatic() {
        guard !Self.screenshotRun else { return }
        automatic = true
        defaults.set(true, forKey: "tv.locationAuto")
        locate()
    }

    func choose(_ city: City) {
        automatic = false
        defaults.set(false, forKey: "tv.locationAuto")
        set(source: .manual)
        prayer?.choose(city)
    }

    // MARK: Device location

    private func locate() {
        guard !busy else { return }
        busy = true
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: fromInternet()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            guard self.busy else { return }
            switch status {
            case .authorizedWhenInUse, .authorizedAlways: self.manager.requestLocation()
            case .notDetermined: break
            default: self.fromInternet()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        let lat = last.coordinate.latitude, lon = last.coordinate.longitude
        Task { @MainActor in self.name(CLLocation(latitude: lat, longitude: lon), source: .device, fallbackName: nil, zone: nil) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in if self.busy { self.fromInternet() } }
    }

    // MARK: Internet (mushafiapp.com/api/where, approximate city of the connection)

    private struct Where: Decodable { let city: String?; let latitude: Double; let longitude: Double; let timezone: String? }

    private func fromInternet() {
        guard let url = URL(string: "https://mushafiapp.com/api/where") else { finish(); return }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.setValue("Mushafi-TV", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let place = (response as? HTTPURLResponse)?.statusCode == 200 ? data.flatMap { try? JSONDecoder().decode(Where.self, from: $0) } : nil
            Task { @MainActor in
                guard let place else { self.finish(); return }
                self.name(CLLocation(latitude: place.latitude, longitude: place.longitude), source: .internet,
                          fallbackName: place.city, zone: place.timezone)
            }
        }.resume()
    }

    // MARK: Naming the place in Arabic

    private func name(_ location: CLLocation, source: Source, fallbackName: String?, zone: String?) {
        geocoder.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ar")) { placemarks, _ in
            Task { @MainActor in
                let mark = placemarks?.first
                let city = mark?.locality ?? mark?.subAdministrativeArea ?? mark?.administrativeArea ?? fallbackName ?? "موقعي الحالي"
                let tz = mark?.timeZone?.identifier ?? zone ?? TimeZone.current.identifier
                self.prayer?.setPlace(name: city, latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, zone: tz)
                self.set(source: source)
                self.lastAuto = Date()
                self.defaults.set(self.lastAuto.timeIntervalSince1970, forKey: "tv.locationAt")
                self.finish()
            }
        }
    }

    private func set(source: Source) {
        self.source = source
        defaults.set(source.rawValue, forKey: "tv.locationSource")
    }

    private func finish() { busy = false }
}
