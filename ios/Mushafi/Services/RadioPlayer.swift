import AVFoundation
import MediaPlayer

/// الإذاعات: live Quran radio streamed natively.
///
/// The page runs on a custom scheme, so an <audio> element cannot follow the stream's
/// redirect to a plain-http server (mixed content). Here the redirect is resolved first,
/// radiojar hosts are moved to https, and AVPlayer plays the stream with retries; it keeps
/// playing in the background and shows on the lock screen. State goes to `window.onNativeRadio`.
final class RadioPlayer: NSObject {
    static let shared = RadioPlayer()

    var onState: ((String) -> Void)?
    private(set) var id = ""
    private(set) var status = "stopped"
    private var title = "", place = "", source = ""
    private var player: AVPlayer?
    private var statusObserver: NSKeyValueObservation?
    private var timeObserver: NSKeyValueObservation?
    private var generation = 0
    private var attempts = 0
    private var stallTimer: Timer?

    var active: Bool { status != "stopped" }

    var snapshot: String { Self.json(["id": id, "status": status]) }

    func play(id: String, url: String, title: String, place: String) {
        stop(silent: true)
        guard let link = URL(string: url), link.scheme == "https" else { fail(); return }
        SurahPlayer.shared.stop()
        PrayerService.shared.stopPreview()
        self.id = String(id.prefix(20)); self.title = title; self.place = place; source = url
        attempts = 0
        status = "loading"
        publish()
        connect()
    }

    func stop() { stop(silent: false) }

    private func stop(silent: Bool) {
        generation += 1
        stallTimer?.invalidate(); stallTimer = nil
        statusObserver = nil; timeObserver = nil
        player?.pause(); player = nil
        let was = active
        id = ""; status = "stopped"
        if was {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            if !silent { publish() }
        }
    }

    // MARK: - Connection

    private func connect() {
        generation += 1
        let gen = generation
        guard let link = URL(string: source) else { fail(); return }
        Self.resolve(link) { [weak self] resolved in
            DispatchQueue.main.async {
                guard let self, gen == self.generation else { return }
                self.start(resolved ?? link, gen: gen)
            }
        }
    }

    private func start(_ url: URL, gen: Int) {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 4
        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = true
        self.player = player
        statusObserver = item.observe(\.status) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self, gen == self.generation else { return }
                if item.status == .failed { self.retry() }
            }
        }
        timeObserver = player.observe(\.timeControlStatus) { [weak self] p, _ in
            DispatchQueue.main.async {
                guard let self, gen == self.generation else { return }
                let next = p.timeControlStatus == .playing ? "playing" : "loading"
                if next == "playing" { self.attempts = 0 }
                if next != self.status { self.status = next; self.publish(); self.updateNowPlaying() }
            }
        }
        player.play()
        updateNowPlaying()
        stallTimer?.invalidate()
        stallTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
            guard let self, gen == self.generation, self.status != "playing" else { return }
            self.retry()
        }
    }

    private func retry() {
        attempts += 1
        guard attempts <= 5, active else { fail(); return }
        player?.pause(); player = nil
        status = "loading"; publish()
        let gen = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(min(attempts, 3))) { [weak self] in
            guard let self, gen == self.generation, self.active else { return }
            self.connect()
        }
    }

    private func fail() {
        stop(silent: true)
        onState?(Self.json(["id": "", "status": "error"]))
    }

    /// Follows the stream's redirects by hand (up to 4 hops) and keeps radiojar on https.
    private static func resolve(_ url: URL, hops: Int = 0, done: @escaping (URL?) -> Void) {
        guard hops < 4 else { done(url); return }
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.httpMethod = "GET"
        request.setValue("bytes=0-0", forHTTPHeaderField: "Range")
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect.shared, delegateQueue: nil)
        session.dataTask(with: request) { _, response, _ in
            session.finishTasksAndInvalidate()
            guard let http = response as? HTTPURLResponse else { done(secure(url)); return }
            if (300..<400).contains(http.statusCode), let location = http.value(forHTTPHeaderField: "Location"),
               let next = URL(string: location, relativeTo: url)?.absoluteURL {
                resolve(secure(next), hops: hops + 1, done: done)
            } else {
                done(secure(url))
            }
        }.resume()
    }

    private static func secure(_ url: URL) -> URL {
        guard url.scheme == "http", let host = url.host?.lowercased(), host == "radiojar.com" || host.hasSuffix(".radiojar.com"),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        parts.scheme = "https"
        return parts.url ?? url
    }

    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        static let shared = NoRedirect()
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    // MARK: - Lock screen & page

    private func updateNowPlaying() {
        guard active else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: UiLanguage.text(title),
            MPMediaItemPropertyArtist: UiLanguage.text(place),
            MPMediaItemPropertyAlbumTitle: UiLanguage.text("مصحفي"),
            MPNowPlayingInfoPropertyIsLiveStream: true,
            MPNowPlayingInfoPropertyPlaybackRate: status == "playing" ? 1.0 : 0.0,
        ]
    }

    private func publish() { onState?(snapshot) }

    private static func json(_ object: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }
}
