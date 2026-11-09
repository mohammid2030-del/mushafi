import Foundation
import WebKit
import UniformTypeIdentifiers

/// Serves the bundled shared web UI from `mushafi://app/assets/…`.
/// Mirrors Android's appassets origin: one fixed host, no path traversal, no network.
final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "mushafi"
    static let host = "app"
    static let homeURL = URL(string: "mushafi://app/assets/index.html")!

    private let root: URL
    private var activeTasks = Set<ObjectIdentifier>()
    private let queue = DispatchQueue(label: "mushafi.assets", qos: .userInitiated, attributes: .concurrent)

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    static func bundledRoot() -> URL {
        guard let url = Bundle.main.url(forResource: "assets", withExtension: nil) else {
            fatalError("Shared web assets folder is missing from the app bundle")
        }
        return url
    }

    static func isTrusted(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == scheme && url.host == host && url.port == nil
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask as AnyObject)
        activeTasks.insert(id)
        let request = urlSchemeTask.request
        queue.async { [weak self] in
            guard let self else { return }
            let reply = self.respond(to: request)
            DispatchQueue.main.async {
                guard self.activeTasks.remove(id) != nil else { return }
                urlSchemeTask.didReceive(reply.response)
                if !reply.body.isEmpty { urlSchemeTask.didReceive(reply.body) }
                urlSchemeTask.didFinish()
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        activeTasks.remove(ObjectIdentifier(urlSchemeTask as AnyObject))
    }

    // MARK: - Response building

    private struct Reply {
        let response: URLResponse
        let body: Data
    }

    private func respond(to request: URLRequest) -> Reply {
        guard let url = request.url, Self.isTrusted(url), url.path.hasPrefix("/assets/") else {
            return status(403, url: request.url)
        }
        let relative = String(url.path.dropFirst("/assets/".count))
        if relative.isEmpty || relative.hasPrefix("/") || relative.split(separator: "/").contains("..") {
            return status(403, url: url)
        }
        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"),
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            return status(404, url: url)
        }

        var headers = [
            "Content-Type": Self.contentType(for: file.pathExtension),
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": "bytes",
        ]

        // Byte ranges keep <audio>/<video> seeking working for any local media.
        if let range = request.value(forHTTPHeaderField: "Range"), let bounds = Self.parse(range: range, length: data.count) {
            let slice = data.subdata(in: bounds.lowerBound..<(bounds.upperBound + 1))
            headers["Content-Range"] = "bytes \(bounds.lowerBound)-\(bounds.upperBound)/\(data.count)"
            headers["Content-Length"] = String(slice.count)
            let response = HTTPURLResponse(url: url, statusCode: 206, httpVersion: "HTTP/1.1", headerFields: headers)!
            return Reply(response: response, body: slice)
        }

        headers["Content-Length"] = String(data.count)
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        return Reply(response: response, body: data)
    }

    private func status(_ code: Int, url: URL?) -> Reply {
        let target = url ?? Self.homeURL
        let response = HTTPURLResponse(url: target, statusCode: code, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/plain", "Content-Length": "0"])!
        return Reply(response: response, body: Data())
    }

    private static func parse(range header: String, length: Int) -> ClosedRange<Int>? {
        guard length > 0, header.hasPrefix("bytes=") else { return nil }
        let spec = header.dropFirst("bytes=".count).split(separator: ",").first.map(String.init) ?? ""
        let parts = spec.split(separator: "-", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2 else { return nil }
        let start: Int
        var end: Int
        if parts[0].isEmpty {
            guard let suffix = Int(parts[1]), suffix > 0 else { return nil }
            start = max(0, length - suffix)
            end = length - 1
        } else {
            guard let s = Int(parts[0]) else { return nil }
            start = s
            end = parts[1].isEmpty ? length - 1 : (Int(parts[1]) ?? length - 1)
        }
        end = min(end, length - 1)
        guard start >= 0, start <= end else { return nil }
        return start...end
    }

    private static func contentType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "txt": return "text/plain; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "wasm": return "application/wasm"
        case "mp3": return "audio/mpeg"
        default:
            return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
