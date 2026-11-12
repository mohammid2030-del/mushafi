import CoreLocation
import UIKit

/// One-shot location for prayer times / qibla. Same payloads and messages as Android:
/// `{latitude, longitude, accuracy, timezone}` or `{error}`.
final class LocationService: NSObject, CLLocationManagerDelegate {
    var onResult: ((_ forQibla: Bool, _ payload: [String: Any]) -> Void)?

    private let manager = CLLocationManager()
    private var active = false
    private var awaitingPermission = false
    private var forQibla = false
    private var best: CLLocation?
    private var timeout: DispatchWorkItem?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func request(forQibla: Bool) {
        stopUpdates()
        self.forQibla = forQibla
        active = true
        best = nil
        switch manager.authorizationStatus {
        case .notDetermined:
            awaitingPermission = true
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            finish(nil, "لم يُسمح بالموقع؛ يمكنك اختيار مدينتك يدويًا")
        default:
            begin()
        }
    }

    func cancel() {
        active = false
        awaitingPermission = false
        stopUpdates()
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard awaitingPermission else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            return
        case .authorizedWhenInUse, .authorizedAlways:
            awaitingPermission = false
            begin()
        default:
            awaitingPermission = false
            finish(nil, "لم يُسمح بالموقع؛ يمكنك اختيار مدينتك يدويًا")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active else { return }
        for location in locations where location.horizontalAccuracy >= 0 {
            if best == nil || location.horizontalAccuracy < best!.horizontalAccuracy { best = location }
            if location.horizontalAccuracy <= 10_000 {
                finish(location, "")
                return
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard active else { return }
        if let code = (error as? CLError)?.code {
            if code == .locationUnknown { return }   // transient; keep waiting until the timeout
            if code == .denied {
                finish(nil, "خدمة الموقع متوقفة؛ فعّلها أو اختر مدينتك يدويًا")
                return
            }
        }
        finish(best, "تعذر الوصول للموقع؛ اختر المدينة يدويًا")
    }

    // MARK: - Private

    private func begin() {
        guard active else { return }
        if let last = manager.location, last.horizontalAccuracy >= 0, last.horizontalAccuracy <= 10_000,
           -last.timestamp.timeIntervalSinceNow < 15 * 60 {
            finish(last, "")
            return
        }
        manager.startUpdatingLocation()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.finish(self.best, "تعذر تحديد الموقع الآن؛ يمكنك اختيار المدينة يدويًا")
        }
        timeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 40, execute: work)
    }

    private func finish(_ location: CLLocation?, _ error: String) {
        guard active else { return }
        active = false
        stopUpdates()
        var payload: [String: Any] = [:]
        // Like Android: a fresh fix also moves prayer times, weather and qibla to «موقعي الحالي».
        if let location { AutomaticLocation.shared.accept(location) }
        if let location {
            payload["latitude"] = location.coordinate.latitude
            payload["longitude"] = location.coordinate.longitude
            payload["accuracy"] = location.horizontalAccuracy
            payload["timezone"] = TimeZone.current.identifier
        } else {
            payload["error"] = error
        }
        onResult?(forQibla, payload)
    }

    private func stopUpdates() {
        timeout?.cancel()
        timeout = nil
        manager.stopUpdatingLocation()
    }
}

/// Compass heading for the qibla screen. Same payloads as Android's QiblaController.
final class CompassService: NSObject, CLLocationManagerDelegate {
    var onUpdate: (([String: Any]) -> Void)?

    private let manager = CLLocationManager()
    private var running = false
    private var lastEmit = Date.distantPast

    override init() {
        super.init()
        manager.delegate = self
        manager.headingFilter = 1
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func start(orientation: UIInterfaceOrientation) {
        guard CLLocationManager.headingAvailable() else {
            onUpdate?(["available": false,
                       "error": "لا يتوفر حساس بوصلة على هذا الجهاز. يمكنك قراءة اتجاه القبلة من الشمال."])
            return
        }
        running = true
        update(orientation: orientation)
        onUpdate?(["available": true, "waiting": true])
        manager.startUpdatingHeading()
        // A location fix lets iOS report true north (corrected for declination), like Android.
        let status = manager.authorizationStatus
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }

    func stop() {
        guard running else { return }
        running = false
        manager.stopUpdatingHeading()
        manager.stopUpdatingLocation()
    }

    func update(orientation: UIInterfaceOrientation) {
        switch orientation {
        case .landscapeLeft: manager.headingOrientation = .landscapeRight
        case .landscapeRight: manager.headingOrientation = .landscapeLeft
        case .portraitUpsideDown: manager.headingOrientation = .portraitUpsideDown
        default: manager.headingOrientation = .portrait
        }
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        true
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard running else { return }
        let now = Date()
        guard now.timeIntervalSince(lastEmit) >= 0.09 else { return }
        lastEmit = now
        let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        guard heading.isFinite, heading >= 0 else { return }
        // Map iOS's ± degrees to Android's sensor accuracy levels (0 unreliable … 3 high).
        let error = newHeading.headingAccuracy
        let accuracy: Int
        if error < 0 { accuracy = 0 } else if error <= 10 { accuracy = 3 } else if error <= 25 { accuracy = 2 } else if error <= 45 { accuracy = 1 } else { accuracy = 0 }
        onUpdate?(["available": true, "heading": heading, "accuracy": accuracy])
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Heading keeps working without a location fix (magnetic north is used instead).
    }
}
