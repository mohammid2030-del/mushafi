import AVFoundation
import MediaPlayer

/// الإذاعات: live Quran radio streamed natively.
///
/// AVPlayer plays the station's own address and follows its redirects (Radiojar moves to a plain-http
/// node, allowed for radiojar.com only in Info.plist). A drop, stall or error reconnects on its own,
/// alternating with the station's backup server when it has one (mp3quran: qurango.net and
/// backup.qurango.net). It keeps playing in the background, resumes after a call, and shows on the
/// lock screen. State goes to `window.onNativeRadio`.
final class RadioPlayer: NSObject {
    static let shared = RadioPlayer()

    var onState: ((String) -> Void)?
    private(set) var id = ""
    private(set) var status = "stopped"
    private var title = "", place = ""
    private var sources: [URL] = []
    private var sourceIndex = 0
    private var player: AVPlayer?
    private var statusObserver: NSKeyValueObservation?
    private var timeObserver: NSKeyValueObservation?
    private var itemObservers: [NSObjectProtocol] = []
    private var generation = 0
    private var attempts = 0
    private var stallTimer: Timer?
    private var steadyTimer: Timer?
    private static let maxAttempts = 8

    var active: Bool { status != "stopped" }

    var snapshot: String { Self.json(["id": id, "status": status]) }

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    /// Only the known radio networks may be played: Radiojar and mp3quran.
    static func allowed(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return ["radiojar.com", "qurango.net", "mp3quran.net"].contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// The station's address, then its backup server.
    static func candidates(_ url: URL) -> [URL] {
        var list = [url]
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false), let host = parts.host?.lowercased() else { return list }
        if host == "qurango.net" { parts.host = "backup.qurango.net" } else if host == "backup.qurango.net" { parts.host = "qurango.net" } else { return list }
        if let backup = parts.url { list.append(backup) }
        return list
    }

    func play(id: String, url: String, title: String, place: String) {
        stop(silent: true)
        guard let link = URL(string: url), Self.allowed(link) else { fail(); return }
        SurahPlayer.shared.stop()
        PrayerService.shared.stopPreview()
        self.id = String(id.prefix(20)); self.title = title; self.place = place
        sources = Self.candidates(link); sourceIndex = 0
        attempts = 0
        status = "loading"
        publish()
        connect()
    }

    func stop() { stop(silent: false) }

    private func stop(silent: Bool) {
        generation += 1
        stallTimer?.invalidate(); stallTimer = nil
        steadyTimer?.invalidate(); steadyTimer = nil
        teardownPlayer()
        let was = active
        id = ""; status = "stopped"
        if was {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            if !silent { publish() }
        }
    }

    // MARK: - Connection

    private func teardownPlayer() {
        statusObserver = nil; timeObserver = nil
        itemObservers.forEach { NotificationCenter.default.removeObserver($0) }
        itemObservers = []
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
    }

    private func connect() {
        teardownPlayer()
        generation += 1
        let gen = generation
        guard !sources.isEmpty else { fail(); return }
        let url = sources[sourceIndex % sources.count]
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 6
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
                if p.timeControlStatus == .playing {
                    self.stallTimer?.invalidate(); self.stallTimer = nil
                    if self.status != "playing" { self.status = "playing"; self.publish(); self.updateNowPlaying() }
                    self.steadyTimer?.invalidate()
                    self.steadyTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in self?.attempts = 0 }
                } else if p.timeControlStatus == .waitingToPlayAtSpecifiedRate {
                    if self.status != "loading" { self.status = "loading"; self.publish(); self.updateNowPlaying() }
                    self.armStall(gen: gen, seconds: 15)
                }
            }
        }
        let center = NotificationCenter.default
        let again: (Notification) -> Void = { [weak self] _ in
            DispatchQueue.main.async { guard let self, gen == self.generation else { return }; self.retry() }
        }
        itemObservers.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: nil, using: again))
        itemObservers.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: nil, using: again))
        itemObservers.append(center.addObserver(forName: .AVPlayerItemPlaybackStalled, object: item, queue: nil) { [weak self] _ in
            DispatchQueue.main.async { guard let self, gen == self.generation else { return }; self.armStall(gen: gen, seconds: 10) }
        })
        player.play()
        updateNowPlaying()
        armStall(gen: gen, seconds: 20)
    }

    private func armStall(gen: Int, seconds: TimeInterval) {
        guard stallTimer == nil else { return }
        stallTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self, gen == self.generation else { return }
            self.stallTimer = nil
            if self.status != "playing" || self.player?.timeControlStatus != .playing { self.retry() }
        }
    }

    private func retry() {
        guard active else { return }
        stallTimer?.invalidate(); stallTimer = nil
        steadyTimer?.invalidate(); steadyTimer = nil
        attempts += 1
        guard attempts <= Self.maxAttempts else { fail(); return }
        teardownPlayer()
        sourceIndex += 1
        status = "loading"; publish(); updateNowPlaying()
        generation += 1
        let gen = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(min(attempts, 5))) { [weak self] in
            guard let self, gen == self.generation, self.active else { return }
            self.connect()
        }
    }

    private func fail() {
        stop(silent: true)
        onState?(Self.json(["id": "", "status": "error"]))
    }

    /// A phone call or another app's audio pauses the radio; when it ends the live stream starts again.
    @objc private func interrupted(_ note: Notification) {
        guard active, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        DispatchQueue.main.async {
            guard self.active else { return }
            if type == .began {
                self.stallTimer?.invalidate(); self.stallTimer = nil
                self.status = "loading"; self.publish(); self.updateNowPlaying()
            } else {
                self.attempts = 0
                self.connect()
            }
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
