import Foundation

/// Storage shared by the app and its widgets.
enum AppGroup {
    static let identifier = "group.com.mushafi.app"

    /// Falls back to standard defaults if the App Group is not provisioned yet,
    /// so the app keeps working (widgets then simply show their placeholder).
    static let defaults: UserDefaults = UserDefaults(suiteName: identifier) ?? .standard

    static func string(_ key: String) -> String? { defaults.string(forKey: key) }
    static func set(_ value: String?, _ key: String) { defaults.set(value, forKey: key) }
}

/// Reading position published by the app for the "Mushaf page" widget.
struct ReadingState: Codable, Equatable {
    var page: Int
    var surah: String
    var juz: Int
    var started: Bool
}

enum WidgetStore {
    static let readingKind = "MushafiLastPage"
    private static let readingKey = "widget.reading"

    static func reading() -> ReadingState? {
        guard let data = AppGroup.defaults.data(forKey: readingKey) else { return nil }
        return try? JSONDecoder().decode(ReadingState.self, from: data)
    }

    /// Returns true when the stored value changed.
    @discardableResult
    static func save(_ state: ReadingState) -> Bool {
        guard state != reading(), let data = try? JSONEncoder().encode(state) else { return false }
        AppGroup.defaults.set(data, forKey: readingKey)
        return true
    }
}

/// Locates bundled data files in the app (inside "assets/") or in the widget extension (bundle root).
enum SharedResources {
    static func url(_ name: String, _ ext: String, subdirectory: String? = nil) -> URL? {
        let bundle = Bundle.main
        let inAssets = subdirectory.map { "assets/" + $0 } ?? "assets"
        return bundle.url(forResource: name, withExtension: ext, subdirectory: inAssets)
            ?? bundle.url(forResource: name, withExtension: ext, subdirectory: subdirectory)
    }

    static func json(_ name: String, subdirectory: String? = nil) -> Any? {
        guard let url = url(name, "json", subdirectory: subdirectory),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }
}

/// Port of Android's UiLocale: device language normalised to a supported UI language,
/// texts looked up in the same locale catalogs the web UI uses (keyed by the Arabic text).
enum UiLanguage {
    static let supported: Set<String> = ["ar", "en", "ur", "bn", "tr"]
    private static let key = "mushafi.uiLanguage"
    private static var catalogs: [String: [String: String]] = [:]
    private static let lock = NSLock()

    static var device: String { normalize(Locale.preferredLanguages.first ?? "en") }

    /// The language the web UI selected ("system" follows the device).
    static var current: String {
        let saved = AppGroup.defaults.string(forKey: key) ?? "system"
        return saved == "system" ? device : normalize(saved)
    }

    static var isRTL: Bool { current == "ar" || current == "ur" }

    static func save(_ code: String) {
        guard code == "system" || supported.contains(code) else { return }
        AppGroup.defaults.set(code, forKey: key)
    }

    static func normalize(_ code: String) -> String {
        let base = code.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init) ?? ""
        return supported.contains(base) ? base : "en"
    }

    static func text(_ source: String, _ args: CustomStringConvertible...) -> String {
        text(in: current, source, args)
    }

    static func text(in language: String, _ source: String, _ args: [CustomStringConvertible] = []) -> String {
        var result = source
        if language != "ar", let translated = catalog(language)[source] { result = translated }
        for (index, value) in args.enumerated() {
            result = result.replacingOccurrences(of: "{\(index)}", with: value.description)
        }
        return result
    }

    static func number(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .none
        formatter.locale = Locale(identifier: current)
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private static func catalog(_ language: String) -> [String: String] {
        lock.lock(); defer { lock.unlock() }
        if let cached = catalogs[language] { return cached }
        let loaded = (SharedResources.json(language, subdirectory: "locales") as? [String: String]) ?? [:]
        catalogs[language] = loaded
        return loaded
    }
}
