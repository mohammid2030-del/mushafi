import CoreLocation
import UIKit
import WidgetKit

/// iOS twin of Android's AutomaticLocation: while the app is open, the device location keeps
/// prayer times, weather and qibla on «موقعي الحالي». Foreground only, no background permission.
/// The page reads `status()` (automaticLocationSnapshot) and is told of changes through `onChange`.
final class AutomaticLocation: NSObject, CLLocationManagerDelegate {
    static let shared = AutomaticLocation()

    var onChange: (() -> Void)?

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private static let fixKey = "automaticLocation.fix"
    private var foreground = false
    private var listening = false
    private var error = ""

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 250
        NotificationCenter.default.addObserver(self, selector: #selector(zoneChanged),
                                               name: .NSSystemTimeZoneDidChange, object: nil)
    }

    // MARK: - State for the page

    var permission: Bool {
        let s = manager.authorizationStatus
        return s == .authorizedWhenInUse || s == .authorizedAlways
    }

    func status() -> String {
        let auth = manager.authorizationStatus
        var out: [String: Any] = ["permission": permission, "denied": auth == .denied || auth == .restricted, "foreground": foreground, "listening": listening,
                                  "providers": CLLocationManager.locationServicesEnabled(), "error": error]
        if let fix = storedFix() {
            out["hasFix"] = true
            out["fixedAt"] = fix["fixedAt"] ?? 0
            out["accuracy"] = fix["accuracy"] ?? 0
        } else {
            out["hasFix"] = false
        }
        return PrayerSettings.serialize(out)
    }

    // MARK: - Lifecycle (called by the shell when the app becomes active / leaves)

    func start() {
        foreground = true
        refreshZone()
        listen()
    }

    func stop() {
        foreground = false
        stopListening()
    }

    /// Asks for permission if needed; otherwise starts listening. Used by «السماح بالموقع».
    func requestPermission() {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() } else { listen() }
    }

    private func listen() {
        guard foreground, !listening else { return }
        guard CLLocationManager.locationServicesEnabled() else {
            error = "خدمة الموقع متوقفة؛ نستخدم آخر موقع محفوظ إن وُجد."
            changed(); return
        }
        guard permission else {
            error = manager.authorizationStatus == .notDetermined ? "" : "إذن الموقع غير مفعّل؛ نستخدم آخر موقع محفوظ إن وُجد."
            changed(); return
        }
        error = ""
        applyToSettings(force: false)   // e.g. after signing out cleared the saved place
        if let last = manager.location { accept(last) }
        manager.startUpdatingLocation()
        listening = true
        changed()
    }

    private func stopListening() {
        guard listening else { return }
        manager.stopUpdatingLocation()
        listening = false
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        stopListening()
        listen()
        changed()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard foreground, let latest = locations.last else { return }
        accept(latest)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError failure: Error) {
        guard let code = (failure as? CLError)?.code, code != .locationUnknown else { return }
        if code == .denied {
            stopListening()
            error = "إذن الموقع غير مفعّل؛ نستخدم آخر موقع محفوظ إن وُجد."
        } else {
            error = "تعذر تحديث الموقع؛ نستخدم آخر موقع محفوظ."
        }
        changed()
    }

    // MARK: - Fixes

    static func fresh(_ l: CLLocation) -> Bool {
        let a = l.horizontalAccuracy
        guard a > 0, a <= 10_000, l.coordinate.latitude.isFinite, abs(l.coordinate.latitude) <= 89,
              l.coordinate.longitude.isFinite, abs(l.coordinate.longitude) <= 180 else { return false }
        let age = -l.timestamp.timeIntervalSinceNow
        return age >= -1 && age <= 15 * 60
    }

    /// Stores the fix and moves prayer settings onto it (city «موقعي الحالي», confirmed).
    func accept(_ l: CLLocation) {
        guard permission, Self.fresh(l) else { return }
        let zone = TimeZone.current.identifier
        let old = storedFix()
        var lat = l.coordinate.latitude, lon = l.coordinate.longitude
        var moved = old == nil
        if let old, let oLat = old["latitude"] as? Double, let oLon = old["longitude"] as? Double {
            let distance = CLLocation(latitude: oLat, longitude: oLon).distance(from: l)
            let oldAccuracy = old["accuracy"] as? Double ?? 0
            moved = distance >= max(1000, min(5000, max(oldAccuracy, l.horizontalAccuracy)))
                || l.horizontalAccuracy < oldAccuracy * 0.5
            // Keep a stable prayer coordinate until the device really moved.
            if !moved { lat = oLat; lon = oLon }
        }
        let fix: [String: Any] = ["latitude": lat, "longitude": lon, "accuracy": l.horizontalAccuracy,
                                  "timezone": zone, "fixedAt": Int64(Date().timeIntervalSince1970 * 1000)]
        defaults.set(PrayerSettings.serialize(fix), forKey: Self.fixKey)
        error = ""
        applyToSettings(force: moved)
        changed()
    }

    private func applyToSettings(force: Bool) {
        guard let fix = storedFix(), let lat = fix["latitude"] as? Double, let lon = fix["longitude"] as? Double else { return }
        let zone = fix["timezone"] as? String ?? TimeZone.current.identifier
        let before = PrayerSettings.load()
        let mismatch = abs(((before.json["latitude"] as? Double) ?? 0) - lat) > 0.00001
            || abs(((before.json["longitude"] as? Double) ?? 0) - lon) > 0.00001
            || before.string("timezone") != zone
            || (before.json["confirmed"] as? Bool) != true
        guard force || mismatch else { return }
        var json = before.json
        json["latitude"] = lat
        json["longitude"] = lon
        json["timezone"] = zone
        json["city"] = "موقعي الحالي"
        json["confirmed"] = true
        if (json["autoMethod"] as? Bool) ?? true { json["method"] = PrayerRegion.method(zone: zone) }
        guard let next = try? PrayerSettings(json) else { return }
        next.save()
        PrayerService.shared.schedule()
        WidgetCenter.shared.reloadAllTimelines()
    }

    @objc private func zoneChanged() {
        DispatchQueue.main.async { self.refreshZone(); self.changed() }
    }

    private func refreshZone() {
        guard var fix = storedFix() else { return }
        let zone = TimeZone.current.identifier
        guard fix["timezone"] as? String != zone else { return }
        fix["timezone"] = zone
        defaults.set(PrayerSettings.serialize(fix), forKey: Self.fixKey)
        applyToSettings(force: true)
    }

    private func storedFix() -> [String: Any]? {
        defaults.string(forKey: Self.fixKey).flatMap(PrayerSettings.parse)
    }

    private func changed() {
        DispatchQueue.main.async { self.onChange?() }
    }
}
