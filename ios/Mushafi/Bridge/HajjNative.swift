import UIKit
import CoreMotion

/// Hajj & Umrah on iOS: Core Motion step counting and report sharing.
///
/// CMPedometer keeps up to seven days of history, so a session only stores its start date;
/// every query asks Core Motion for steps (and its own distance estimate) since that date.
/// This survives the app being closed. Nothing leaves the device.
final class HajjNative {
    static let shared = HajjNative()

    private let pedometer = CMPedometer()
    private let defaults = UserDefaults.standard
    private let startKey = "hajjStepsStart"
    var emit: ((String, String) -> Void)?
    weak var presenter: WebShellViewController?

    private func json(_ object: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }

    private var permission: String {
        guard CMPedometer.isStepCountingAvailable() else { return "unsupported" }
        switch CMPedometer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    func status() -> String {
        json(["platform": "ios", "available": CMPedometer.isStepCountingAvailable(), "permission": permission,
              "active": defaults.object(forKey: startKey) != nil, "source": "coremotion",
              "distance": CMPedometer.isDistanceAvailable()])
    }

    /// Core Motion shows its consent prompt on the first query; a tiny query triggers it.
    func requestPermission() {
        guard CMPedometer.isStepCountingAvailable() else { emit?("onHajjStepPermission", status()); return }
        if permission == "denied" {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            emit?("onHajjStepPermission", status())
            return
        }
        pedometer.queryPedometerData(from: Date().addingTimeInterval(-60), to: Date()) { [weak self] _, _ in
            DispatchQueue.main.async { guard let self else { return }; self.emit?("onHajjStepPermission", self.status()) }
        }
    }

    func begin() { defaults.set(Date().timeIntervalSince1970, forKey: startKey) }
    func end() { defaults.removeObject(forKey: startKey) }

    func query() {
        guard let start = defaults.object(forKey: startKey) as? Double, CMPedometer.isStepCountingAvailable() else {
            emit?("onHajjSteps", json(["active": defaults.object(forKey: startKey) != nil, "steps": 0, "source": "coremotion", "permission": permission]))
            return
        }
        // Core Motion keeps seven days; older sessions report what is still available.
        let from = max(Date(timeIntervalSince1970: start), Date().addingTimeInterval(-7 * 86400 + 60))
        pedometer.queryPedometerData(from: from, to: Date()) { [weak self] data, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                var payload: [String: Any] = ["active": true, "steps": data?.numberOfSteps.intValue ?? 0,
                                              "source": "coremotion", "permission": self.permission]
                if let meters = data?.distance?.doubleValue { payload["distance"] = meters }
                self.emit?("onHajjSteps", self.json(payload))
            }
        }
    }

    private static func decode(_ text: String?) -> Data? {
        guard let text, text.count <= 12_000_000 else { return nil }
        let body = text.range(of: ",").map { String(text[$0.upperBound...]) } ?? text
        return Data(base64Encoded: body, options: .ignoreUnknownCharacters)
    }

    private static func safeName(_ name: String?, _ fallback: String) -> String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
        let clean = String((name ?? "").unicodeScalars.filter { allowed.contains($0) })
        return clean.isEmpty || clean.count > 80 ? fallback : clean
    }

    /// Share and save both open the system sheet; it offers "Save Image" and "Save to Files".
    func share(_ base64: String?, mime: String?, name: String?) {
        guard let data = Self.decode(base64), ["image/png", "image/jpeg", "application/pdf"].contains(mime ?? ""),
              let presenter else { emit?("onHajjFile", "{\"ok\":false}"); return }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("shared", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(Self.safeName(name, "Mushafi-report"))
        do { try data.write(to: url, options: .atomic) } catch { emit?("onHajjFile", "{\"ok\":false}"); return }
        let items: [Any] = mime == "application/pdf" ? [url] : [UIImage(data: data) ?? url]
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        sheet.completionWithItemsHandler = { [weak self] _, completed, _, _ in
            self?.emit?("onHajjFile", completed ? "{\"ok\":true,\"action\":\"share\"}" : "{\"ok\":false,\"cancelled\":true}")
        }
        presenter.topPresenter.present(sheet, animated: true)
    }
}
