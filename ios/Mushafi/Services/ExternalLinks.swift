import UIKit

/// Fixed allow-lists copied from MainActivity.java. Everything opens in Safari.
enum ExternalLinks {
    private static let sourceHosts: Set<String> = [
        "quran.com", "sunnah.com", "islamhouse.com", "dorar.net",
        "binbaz.org.sa", "www.diyanet.gov.tr", "saadalkhathlan.com",
    ]
    private static let supportBase = "https://mohammid2030-del.github.io/mushafi-support/"
    static let supportEmail = "appmushafi@gmail.com"

    static func openSource(_ text: String?) {
        guard let text, let url = URL(string: text), url.scheme == "https",
              let host = url.host, sourceHosts.contains(host) else { return }
        open(url)
    }

    static func openWeatherReference(_ kind: String?) {
        switch kind {
        case "source": open("https://api.met.no/")
        case "license": open("https://creativecommons.org/licenses/by/4.0/")
        default: break
        }
    }

    static func openRecitationReference(_ kind: String?) {
        switch kind {
        case "mp3quran": open("https://www.mp3quran.net/ar/api")
        case "complex": open("https://qurancomplex.gov.sa/quran-audios/")
        case "timing": open("https://github.com/QUD-Technologies/quranic-universal-audio")
        case "license": open("https://creativecommons.org/licenses/by/4.0/")
        default: break
        }
    }

    static func openSupportPage(_ page: String?) {
        guard let page, ["privacy", "support", "delete-account"].contains(page) else { return }
        open(supportBase + (page == "privacy" ? "privacy.html" : ""))
    }

    /// Opens the user's mail app with a message to the developer already addressed and filled in.
    static func contactDeveloper(subject: String?, body: String?) {
        var parts = URLComponents()
        parts.scheme = "mailto"
        parts.path = supportEmail
        parts.queryItems = [
            URLQueryItem(name: "subject", value: String((subject ?? "").prefix(160))),
            URLQueryItem(name: "body", value: String((body ?? "").prefix(4000))),
        ]
        if let url = parts.url { open(url) }
    }

    /// App Store rule 3.2.2: donations are completed in Safari, never inside the app.
    @discardableResult
    static func openCharity(_ id: String?) -> Bool {
        guard let id, id.range(of: "^[a-z][a-z0-9-]{0,70}$", options: .regularExpression) != nil,
              let file = Bundle.main.url(forResource: "charity-directory", withExtension: "json", subdirectory: "assets"),
              let data = try? Data(contentsOf: file),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let routes = root["routes"] as? [String: Any],
              let route = routes[id] as? [String: Any],
              let text = route["url"] as? String,
              let url = URL(string: text),
              url.scheme?.lowercased() == "https", url.user == nil, url.port == nil || url.port == 443,
              let host = url.host, host == "ehsan.sa" || host == "waqfy.sa",
              url.path != "/", !url.path.isEmpty else { return false }
        open(url)
        return true
    }

    static func openAppSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { open(url) }
    }

    private static func open(_ text: String) {
        if let url = URL(string: text) { open(url) }
    }

    private static func open(_ url: URL) {
        DispatchQueue.main.async { UIApplication.shared.open(url) }
    }
}
