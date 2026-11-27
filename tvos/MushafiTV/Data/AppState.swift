import SwiftUI

enum Tab: Int, Hashable { case home, mushaf, reciters, live, settings }

struct ReaderRequest: Identifiable, Equatable {
    let id = UUID()
    let page: Int
}

/// App-wide selection and the few things the TV remembers (no account, no sync).
final class AppState: ObservableObject {
    @Published var tab: Tab = .home
    @Published var reader: ReaderRequest?
    @Published var lastPage: Int { didSet { UserDefaults.standard.set(lastPage, forKey: "tv.lastPage") } }
    @Published var reciterId: String { didSet { UserDefaults.standard.set(reciterId, forKey: "tv.reciter") } }

    init() {
        let defaults = UserDefaults.standard
        let saved = defaults.integer(forKey: "tv.lastPage")
        lastPage = (1...604).contains(saved) ? saved : 1
        reciterId = defaults.string(forKey: "tv.reciter") ?? Library.shared.reciters.first?.id ?? "7"

        // Launch arguments used by the App Store screenshot run (ignored otherwise).
        func arg(_ key: String) -> Int? { defaults.string(forKey: key).flatMap { Int($0) } }
        if let tab = arg("tvTab"), let value = Tab(rawValue: tab) { self.tab = value }
        if let page = arg("tvLastPage"), (1...604).contains(page) { lastPage = page }
        if let page = arg("tvReader"), (1...604).contains(page) { reader = ReaderRequest(page: page) }
    }

    func open(page: Int) { reader = ReaderRequest(page: max(1, min(604, page))) }
    var reciter: Reciter? { Library.shared.reciter(reciterId) ?? Library.shared.reciters.first }
}
