import Foundation

/// Books kept on the device (الكتب): PDFs in Application Support/books plus a small index.
/// Same JSON entries as Android's BookStore.
enum BookStore {
    static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("books", isDirectory: true)
        if !FileManager.default.fileExists(atPath: base.path) {
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            var url = base; try? url.setResourceValues(values)
        }
        return base
    }
    private static var index: URL { dir.appendingPathComponent("index.json") }
    private static let lock = NSLock()

    static func trusted(_ text: String?) -> Bool {
        guard let text, let url = URL(string: text), url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "islamhouse.com" || host.hasSuffix(".islamhouse.com")
    }
    static func validId(_ id: String?) -> Bool { id?.range(of: "^[0-9]{1,14}$", options: .regularExpression) != nil }
    static func file(_ id: String) -> URL { dir.appendingPathComponent(id + ".pdf") }

    static func all() -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return read()
    }
    private static func read() -> [[String: Any]] {
        guard let data = try? Data(contentsOf: index), let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return list.filter { validId($0["id"] as? String) && FileManager.default.fileExists(atPath: file($0["id"] as! String).path) }
    }
    private static func write(_ list: [[String: Any]]) {
        if let data = try? JSONSerialization.data(withJSONObject: list) { try? data.write(to: index, options: .atomic) }
    }
    static func json() -> String {
        (try? JSONSerialization.data(withJSONObject: all())).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }
    static func find(_ id: String) -> [String: Any]? { all().first { $0["id"] as? String == id } }

    static func put(_ entry: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        var e = entry; e["savedAt"] = Int64(Date().timeIntervalSince1970 * 1000)
        let id = e["id"] as? String ?? ""
        write([e] + read().filter { $0["id"] as? String != id })
    }
    static func setPage(_ id: String, page: Int, pages: Int) {
        lock.lock(); defer { lock.unlock() }
        write(read().map { var o = $0; if o["id"] as? String == id { o["page"] = page; o["pages"] = pages }; return o })
    }
    /// Removes a book, or every part of it when given the book's own id.
    static func delete(_ id: String?) {
        guard let id, validId(id) else { return }
        lock.lock(); defer { lock.unlock() }
        var kept: [[String: Any]] = []
        for o in read() {
            let oid = o["id"] as? String ?? ""
            if oid == id || "\(o["bookId"] ?? "")" == id { try? FileManager.default.removeItem(at: file(oid)) } else { kept.append(o) }
        }
        write(kept)
    }
}
