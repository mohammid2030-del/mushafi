import Foundation

/// Full-surah downloads for offline listening. SurahPlayer plays the local file when it exists.
final class SurahDownloads: NSObject, URLSessionDownloadDelegate {
    static let shared = SurahDownloads()
    var emit: ((String) -> Void)?

    private static let allowedHosts: Set<String> = ["download.quranicaudio.com", "cdn.mp3quran.net", "download.qurancomplex.gov.sa"]
    private lazy var catalog: [String: Any] = (SharedResources.json("surah-audio") as? [String: Any]) ?? [:]
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue.main)
    private var task: URLSessionDownloadTask?
    private var current: (reader: Int, chapter: Int)?
    private var lastProgress = Date.distantPast
    private var cancelled = false

    private func track(_ r: Int, _ c: Int) -> [String: Any]? {
        ((catalog[String(r)] as? [String: Any])?["chapters"] as? [String: Any])?[String(c)] as? [String: Any]
    }

    static func fileURL(reader r: Int, chapter c: Int, track: [String: Any]) -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let version = (track["sourceVersion"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "default"
        return base.appendingPathComponent("surah-audio/\(version)/\(r)/\(c).mp3")
    }

    static func localFile(reader r: Int, chapter c: Int, track: [String: Any]) -> URL? {
        let url = fileURL(reader: r, chapter: c, track: track)
        let size = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.int64Value ?? 0
        return size > 128 ? url : nil
    }

    func list() -> String {
        var out: [String] = []
        for (key, value) in catalog {
            guard let r = Int(key), let chapters = (value as? [String: Any])?["chapters"] as? [String: Any] else { continue }
            for c in 1...114 {
                if let t = chapters[String(c)] as? [String: Any], Self.localFile(reader: r, chapter: c, track: t) != nil { out.append("\(r):\(c)") }
            }
        }
        let data = (try? JSONSerialization.data(withJSONObject: out)) ?? Data("[]".utf8)
        return String(data: data, encoding: .utf8) ?? "[]"
    }

    private func send(_ r: Int, _ c: Int, _ status: String, _ received: Int64 = 0, _ total: Int64 = 0) {
        let payload: [String: Any] = ["reader": r, "chapter": c, "status": status, "received": received, "total": total]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        let emit = self.emit
        if Thread.isMainThread { emit?(json) } else { DispatchQueue.main.async { emit?(json) } }
    }

    func start(reader r: Int, chapter c: Int) {
        if task != nil { send(r, c, "busy"); return }
        guard (1...114).contains(c), let t = track(r, c), let text = t["url"] as? String, let url = URL(string: text),
              url.scheme == "https", let host = url.host, Self.allowedHosts.contains(host) else { send(r, c, "error"); return }
        cancelled = false
        current = (r, c)
        let next = session.downloadTask(with: url)
        task = next
        send(r, c, "progress")
        next.resume()
    }

    func cancel() { cancelled = true; task?.cancel() }

    func delete(reader r: Int, chapter c: Int) {
        if let t = track(r, c) { try? FileManager.default.removeItem(at: Self.fileURL(reader: r, chapter: c, track: t)) }
        send(r, c, "deleted")
    }

    // MARK: URLSessionDownloadDelegate

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let cur = current, Date().timeIntervalSince(lastProgress) > 0.35 else { return }
        lastProgress = Date()
        send(cur.reader, cur.chapter, "progress", totalBytesWritten, max(0, totalBytesExpectedToWrite))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let cur = current, let t = track(cur.reader, cur.chapter) else { return }
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        let size = ((try? FileManager.default.attributesOfItem(atPath: location.path))?[.size] as? NSNumber)?.int64Value ?? 0
        guard status == 200, size > 128 else { send(cur.reader, cur.chapter, "error"); return }
        var dest = Self.fileURL(reader: cur.reader, chapter: cur.chapter, track: t)
        do {
            try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: dest.path) { try FileManager.default.removeItem(at: dest) }
            try FileManager.default.moveItem(at: location, to: dest)
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try? dest.setResourceValues(values)
            send(cur.reader, cur.chapter, "done", size, size)
        } catch {
            send(cur.reader, cur.chapter, "error")
        }
    }

    func urlSession(_ session: URLSession, task finished: URLSessionTask, didCompleteWithError error: Error?) {
        if let error, let cur = current {
            let wasCancelled = cancelled || (error as NSError).code == NSURLErrorCancelled
            send(cur.reader, cur.chapter, wasCancelled ? "cancelled" : "error")
        }
        task = nil
        current = nil
    }
}
