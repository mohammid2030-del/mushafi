import Foundation

/// Port of CloudPayloadMerge.java — three-way merge of actual edits, never a maximum-page
/// merge. A committed local edit wins a simultaneous edit of the same field; untouched
/// fields keep the server value. Payloads stay byte-compatible with Android.
enum CloudMerge {
    static let empty = "{\"format\":\"mushafi-backup\",\"version\":1,\"data\":{}}"
    private static let missing = "<missing>"

    static func canonical(_ value: Any?) -> String {
        guard let value else { return missing }
        if let object = value as? [String: Any] {
            return "{" + object.keys.sorted().map { quote($0) + ":" + canonical(object[$0]) + "," }.joined() + "}"
        }
        if let array = value as? [Any] {
            return "[" + array.map { canonical($0) + "," }.joined() + "]"
        }
        if value is NSNull { return "null" }
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return "bool:" + (number.boolValue ? "true" : "false") }
            return "num:" + number.stringValue
        }
        if let string = value as? String { return "str:" + string }
        return "other:" + String(describing: value)
    }

    static func same(_ a: Any?, _ b: Any?) -> Bool { canonical(a) == canonical(b) }

    /// Values in `data` are strings holding JSON (localStorage); compare them structurally.
    static func decode(_ value: Any?) -> Any? {
        guard let text = value as? String, let data = text.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return value }
        return parsed
    }

    private static func keys(_ objects: [String: Any]?...) -> [String] {
        var all = Set<String>()
        for object in objects { object?.keys.forEach { all.insert($0) } }
        return all.sorted()
    }

    static func mergeValue(_ base: Any?, _ local: Any?, _ remote: Any?, path: String) -> Any? {
        if same(local, base) { return remote }
        if same(remote, base) || same(local, remote) { return local }

        if let l = local as? [String: Any], let r = remote as? [String: Any] {
            let b = (base as? [String: Any]) ?? [:]
            if path == "khatmaPlan" && !same(l["id"], r["id"]) { return local }
            let progressKeys = ["position", "progressPage", "wardIndex", "read"]
            let progress = path == "khatmaPlan" && progressKeys.contains { !same(l[$0], b[$0]) }
            var out: [String: Any] = [:]
            for k in keys(b, l, r) {
                let value = (progress && progressKeys.contains(k)) ? l[k] : mergeValue(b[k], l[k], r[k], path: path + "/" + k)
                if let value { out[k] = value }
            }
            return out
        }

        // These arrays are sets: keep additions from either device and explicit removals.
        if let l = local as? [Any], let r = remote as? [Any],
           path == "bookmarks" || path == "duaFavorites" || path.hasPrefix("wardData/") {
            let b = (base as? [Any]) ?? []
            var values: [String: Any] = [:]
            var sets: [Set<String>] = [[], [], []]
            for (n, array) in [b, l, r].enumerated() {
                for item in array {
                    let k = canonical(item)
                    sets[n].insert(k)
                    values[k] = item
                }
            }
            var out: [Any] = []
            for k in values.keys.sorted() {
                let inLocal = sets[1].contains(k), inBase = sets[0].contains(k)
                if inLocal != inBase ? inLocal : sets[2].contains(k) { out.append(values[k]!) }
            }
            return out
        }
        return local   // includes deletion (missing local key); never a max/union of scalars
    }

    static func merge(baseline: String?, local: String, remote: String?) throws -> String {
        func data(_ text: String?) throws -> [String: Any] {
            let source = (text?.isEmpty ?? true) ? empty : text!
            guard let object = parse(source), let data = object["data"] as? [String: Any] else { throw MergeError.invalid }
            return data
        }
        let b = try data(baseline), l = try data(local), r = try data(remote)
        let reading = !same(l["lastPage"], b["lastPage"]) || !same(l["last"], b["last"])
        var out: [String: Any] = [:]
        for k in keys(b, l, r) {
            let value = (reading && (k == "last" || k == "lastPage")) ? l[k]
                : mergeValue(decode(b[k]), decode(l[k]), decode(r[k]), path: k)
            if let value { out[k] = (value as? String) ?? jsonText(value) }
        }
        return serialize(["format": "mushafi-backup", "version": 1, "data": out])
    }

    static func applied(_ remote: String?, _ operation: String) -> Bool {
        guard let at = operation.lastIndex(of: ":"), at > operation.startIndex,
              let count = Int64(operation[operation.index(after: at)...]),
              let seen = parse(remote ?? "")?["syncSeen"] as? [String: Any] else { return false }
        let device = String(operation[..<at])
        return ((seen[device] as? NSNumber)?.int64Value ?? 0) >= count
    }

    static func record(_ merged: String, remote: String?, operation: String) throws -> String {
        guard var object = parse(merged) else { throw MergeError.invalid }
        var seen = (parse(remote ?? "")?["syncSeen"] as? [String: Any]) ?? [:]
        if let at = operation.lastIndex(of: ":"), at > operation.startIndex,
           let count = Int64(operation[operation.index(after: at)...]) {
            let device = String(operation[..<at])
            seen[device] = max((seen[device] as? NSNumber)?.int64Value ?? 0, count)
        }
        object["syncSeen"] = seen
        return serialize(object)
    }

    static func nextOperation(_ defaults: UserDefaults, device: String) -> String {
        let next = defaults.integer(forKey: "cloud.operationCounter") + 1
        defaults.set(next, forKey: "cloud.operationCounter")
        return "\(device):\(next)"
    }

    // MARK: JSON helpers

    enum MergeError: Error { case invalid }

    static func parse(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func serialize(_ object: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed]),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }

    private static func jsonText(_ value: Any) -> String {
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue ? "true" : "false" }
        return serialize(value)
    }

    private static func quote(_ text: String) -> String { serialize(text) }

    /// Mirrors CloudSyncController.validPayload.
    static func valid(_ payload: String?) -> Bool {
        guard let payload, payload.utf8.count <= 750_000, let object = parse(payload) else { return false }
        return (object["version"] as? Int) == 1 && (object["format"] as? String) == "mushafi-backup" && object["data"] is [String: Any]
    }
}
