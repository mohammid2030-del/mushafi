import AVFoundation
import MediaPlayer
import UIKit

/// Full-surah recitation, the iOS counterpart of SurahPlaybackService.java:
/// same catalog (surah-audio.json), same verse timings, same snapshot JSON for the page,
/// plus lock-screen / Control Center / headphone controls through MPRemoteCommandCenter.
final class SurahPlayer: NSObject {
    static let shared = SurahPlayer()

    /// Receives every snapshot (JSON text) on the main thread.
    var onState: ((String) -> Void)?

    private let catalog: [String: Any]
    private let surahNames: [String]
    private var player: AVPlayer?
    private var item: AVPlayerItem?
    private var observations: [NSKeyValueObservation] = []
    private var endObserver: NSObjectProtocol?
    private var timer: Timer?
    private var prepareTimeout: DispatchWorkItem?

    private var reader = 7, chapter = 1, position = 0, duration = 0, pendingSeek = 0
    private var status = "stopped", message = "", key = "", seekToken = "", playbackMode = "continuous"
    private var timings: [[Int]] = []
    private var prepared = false, seeking = false, resumeAfterSeek = false, resumeAfterInterruption = false
    private var eventOrder: Int64 = 0
    private var lastSaved = Date.distantPast
    private(set) var snapshot = "{}"
    private var artworkReader = -1
    private var artwork: MPMediaItemArtwork?

    private static let allowedHosts: Set<String> = ["download.quranicaudio.com", "cdn.mp3quran.net", "download.qurancomplex.gov.sa"]
    private let defaults = UserDefaults.standard

    private override init() {
        catalog = (SharedResources.json("surah-audio") as? [String: Any]) ?? [:]
        if let url = Bundle.main.url(forResource: "surah-names", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let names = try? JSONSerialization.jsonObject(with: data) as? [String] {
            surahNames = names
        } else {
            surahNames = []
        }
        super.init()
        reader = defaults.object(forKey: "surah.reader") as? Int ?? 7
        chapter = defaults.object(forKey: "surah.chapter") as? Int ?? 1
        position = defaults.integer(forKey: "surah.position")
        duration = defaults.integer(forKey: "surah.duration")
        if duration > 0 && position >= duration - 500 { position = 0 }
        if timelineRevision != (defaults.string(forKey: "surah.timelineRevision") ?? "") { position = 0 }
        status = position > 0 ? "paused" : "stopped"
        playbackMode = Self.normalize(defaults.string(forKey: "surah.mode"))
        loadTimings()
        updateKey()
        setupRemoteCommands()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        center.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        publish()
    }

    static func normalize(_ mode: String?) -> String { mode == "random" ? "random" : "continuous" }

    // MARK: - Catalog

    private func track(_ r: Int? = nil, _ c: Int? = nil) -> [String: Any]? {
        guard let reciter = catalog[String(r ?? reader)] as? [String: Any],
              let chapters = reciter["chapters"] as? [String: Any] else { return nil }
        return chapters[String(c ?? chapter)] as? [String: Any]
    }

    private func valid(_ r: Int, _ c: Int) -> Bool { (1...114).contains(c) && track(r, c) != nil }

    private var readerName: String {
        ((catalog[String(reader)] as? [String: Any])?["name"] as? String) ?? "القارئ"
    }

    private var chapterName: String {
        chapter >= 1 && chapter <= surahNames.count ? surahNames[chapter - 1] : String(chapter)
    }

    private var timelineRevision: String {
        reader == 1005 ? "full-file-v2" : ((track()?["sourceVersion"] as? String) ?? "")
    }

    private var audioOffset: Int { max(0, (track()?["audioOffsetMs"] as? Int) ?? 0) }
    private var trimmed: Bool { (track()?["trimToTimings"] as? Bool) ?? false }

    private func loadTimings() {
        if !valid(reader, chapter) { reader = 7; chapter = 1; position = 0 }
        let verified = (track()?["verseTimingVerified"] as? Bool) ?? true
        let raw = verified ? ((track()?["timings"] as? [[Any]]) ?? []) : []
        timings = raw.compactMap { row in
            let numbers = row.compactMap { ($0 as? NSNumber)?.intValue }
            return numbers.count >= 3 ? numbers : nil
        }
    }

    private func chapterCounts() -> [Int] {
        guard let chapters = (catalog[String(reader)] as? [String: Any])?["chapters"] as? [String: Any] else {
            return Array(repeating: 0, count: 114)
        }
        return (1...114).map { c in
            let t = chapters[String(c)] as? [String: Any]
            return (t?["verseCount"] as? Int) ?? ((t?["timings"] as? [Any])?.count ?? 0)
        }
    }

    private func effectiveDuration(_ actual: Int) -> Int {
        let available = max(0, actual - audioOffset)
        guard trimmed, let end = timings.last?[2], end > 0 else { return available }
        return min(available, end)
    }

    private func verseAt(_ at: Int) -> Int {
        var verse = 1
        for row in timings {
            if row[1] > at { break }
            verse = row[0]
        }
        return verse
    }

    private func updateKey() {
        key = ""
        for row in timings {
            if position < row[1] { break }
            key = "\(chapter):\(row[0])"
        }
    }

    // MARK: - Commands (bridge)

    func play(reader r: Int, chapter c: Int, verse: Int, mode: String? = nil) {
        if let mode { playbackMode = Self.normalize(mode) }
        guard valid(r, c) else {
            message = "التلاوة غير متاحة"
            status = "error"
            publish()
            return
        }
        if r == reader && c == chapter && prepared {
            if status == "ended" { seek(0) }
            if verse > 0 { seekVerse(verse) }
            resume()
            return
        }
        let saved = (reader == r && chapter == c && status != "ended") ? position : 0
        releasePlayer()
        reader = r
        chapter = c
        duration = 0
        loadTimings()
        pendingSeek = saved
        if verse > 0 {
            pendingSeek = 0
            if verse > 1, let row = timings.first(where: { $0[0] == verse }) { pendingSeek = row[1] }
        }
        position = pendingSeek
        status = "loading"
        message = ""
        updateKey()
        updateNowPlaying()
        publish()
        prepareSource()
    }

    func setMode(_ mode: String?) {
        playbackMode = Self.normalize(mode)
        message = ""
        persist()
        publish()
    }

    func pause() {
        resumeAfterInterruption = false
        guard status == "playing" || status == "loading" else { return }
        pauseInternal()
    }

    func resume() {
        message = ""
        guard let player, prepared else {
            play(reader: reader, chapter: chapter, verse: 0)
            return
        }
        activateSession()
        if seeking {
            resumeAfterSeek = true
            status = "loading"
            publish()
            return
        }
        player.play()
        status = "playing"
        startTimer()
        updateNowPlaying()
        publish()
    }

    func stop() {
        resumeAfterInterruption = false
        if prepared && !seeking { position = currentLogical() }
        releasePlayer()
        status = "stopped"
        message = ""
        persist()
        updateNowPlaying()
        publish()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func skip(_ millis: Int) {
        seek((seeking ? pendingSeek : position) + millis)
    }

    func seekVerse(_ verse: Int) {
        guard !timings.isEmpty else { return }
        if verse == 1 { seek(0); return }
        if let row = timings.first(where: { $0[0] == verse }) { seek(row[1]) }
    }

    func seek(_ at: Int, token: String = "") {
        seekToken = token
        pendingSeek = max(0, min(at, duration > 0 ? duration : Int.max))
        guard let player, prepared else {
            position = pendingSeek
            updateKey()
            persist()
            publish()
            return
        }
        if seeking { publish(); return }
        resumeAfterSeek = status == "playing" || status == "loading"
        if status == "ended" { status = "paused" }
        player.pause()
        if resumeAfterSeek { status = "loading" }
        beginSeek()
    }

    // MARK: - Playback internals

    private func prepareSource() {
        guard let text = track()?["url"] as? String, let url = URL(string: text), url.scheme == "https",
              let host = url.host, Self.allowedHosts.contains(host) else {
            fail("تعذر فتح التلاوة. تحقق من اتصال الإنترنت وحاول مجددًا.")
            return
        }
        activateSession()
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = true
        self.item = item
        self.player = player

        observations.append(item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async { self?.itemStatusChanged(item) }
        })
        observations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            DispatchQueue.main.async { self?.timeControlChanged(player) }
        })
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            guard let self, !self.seeking else { return }
            self.finishTrack()
        }
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, !self.prepared, self.item === item else { return }
            self.fail("تعذر فتح التلاوة. تحقق من اتصال الإنترنت وحاول مجددًا.")
        }
        prepareTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
    }

    private func itemStatusChanged(_ item: AVPlayerItem) {
        guard item === self.item else { return }
        switch item.status {
        case .readyToPlay where !prepared:
            prepared = true
            prepareTimeout?.cancel()
            let seconds = item.duration.seconds
            duration = effectiveDuration(seconds.isFinite ? Int(seconds * 1000) : 0)
            pendingSeek = max(0, min(pendingSeek, max(0, duration - 500)))
            if pendingSeek > 0 || audioOffset > 0 {
                resumeAfterSeek = true
                beginSeek()
            } else {
                player?.play()
                status = "playing"
                position = 0
                updateKey()
                startTimer()
                updateNowPlaying()
                publish()
            }
        case .failed:
            fail("تعذر تشغيل السورة. تحقق من الاتصال ثم اضغط تشغيل للمتابعة.")
        default:
            break
        }
    }

    private func timeControlChanged(_ player: AVPlayer) {
        guard player === self.player, prepared, !seeking, status == "playing" || status == "loading" else { return }
        let next = player.timeControlStatus == .waitingToPlayAtSpecifiedRate ? "loading" : (player.timeControlStatus == .playing ? "playing" : status)
        if next != status {
            status = next
            updateNowPlaying()
            publish()
        }
    }

    private func beginSeek() {
        guard let player, prepared, !seeking else { return }
        seeking = true
        let target = pendingSeek
        stopTimer()
        publish()
        let time = CMTime(value: CMTimeValue(target + audioOffset), timescale: 1000)
        let tolerance: CMTime = trimmed ? .zero : CMTime(value: 500, timescale: 1000)
        player.seek(to: time, toleranceBefore: tolerance, toleranceAfter: tolerance) { [weak self] _ in
            DispatchQueue.main.async { self?.completeSeek(target) }
        }
    }

    private func completeSeek(_ target: Int) {
        guard seeking else { return }
        seeking = false
        if target != pendingSeek { beginSeek(); return }
        position = currentLogical()
        if resumeAfterSeek && status != "stopped" && status != "ended" {
            player?.play()
            status = "playing"
        }
        resumeAfterSeek = false
        updateKey()
        persist()
        updateNowPlaying()
        publish()
        if status == "playing" || status == "loading" { startTimer() }
    }

    private func pauseInternal() {
        resumeAfterSeek = false
        if prepared {
            if !seeking { position = currentLogical() }
            player?.pause()
        } else if status == "loading" {
            releasePlayer()
        }
        stopTimer()
        status = "paused"
        persist()
        updateKey()
        updateNowPlaying()
        publish()
    }

    private func finishTrack() {
        let counts = chapterCounts()
        if let next = Self.next(mode: playbackMode, chapter: chapter, verse: counts[chapter - 1], counts: counts) {
            play(reader: reader, chapter: next.chapter, verse: next.verse)
            return
        }
        player?.pause()
        position = duration
        status = "ended"
        stopTimer()
        persist()
        updateKey()
        updateNowPlaying()
        publish()
    }

    /// RecitationSequence.java: continuous Quran order, or a random different chapter.
    static func next(mode: String, chapter: Int, verse: Int, counts: [Int]) -> (chapter: Int, verse: Int)? {
        guard chapter >= 1, chapter <= counts.count, verse >= 1, verse <= counts[chapter - 1], mode != "single" else { return nil }
        if mode != "random" {
            if verse < counts[chapter - 1] { return (chapter, verse + 1) }
            return chapter < counts.count ? (chapter + 1, 1) : nil
        }
        let options = counts.indices.filter { $0 != chapter - 1 && counts[$0] > 0 }
        guard let pick = options.randomElement() else { return nil }
        return (pick + 1, 1)
    }

    private func fail(_ why: String) {
        releasePlayer()
        status = "error"
        message = why
        persist()
        updateNowPlaying()
        publish()
    }

    private func releasePlayer() {
        prepareTimeout?.cancel()
        prepareTimeout = nil
        stopTimer()
        observations.forEach { $0.invalidate() }
        observations.removeAll()
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        player?.pause()
        player = nil
        item = nil
        prepared = false
        seeking = false
        resumeAfterSeek = false
    }

    private func currentLogical() -> Int {
        guard let seconds = player?.currentTime().seconds, seconds.isFinite else { return position }
        return max(0, Int(seconds * 1000) - audioOffset)
    }

    private func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        guard prepared, !seeking else { return }
        position = currentLogical()
        if status == "playing" && trimmed && duration > 0 && position >= duration {
            finishTrack()
            return
        }
        let previousKey = key
        updateKey()
        publish()
        if key != previousKey { updateNowPlaying() }
        if Date().timeIntervalSince(lastSaved) > 5 { persist() }
    }

    private func persist() {
        lastSaved = Date()
        defaults.set(timelineRevision, forKey: "surah.timelineRevision")
        defaults.set(reader, forKey: "surah.reader")
        defaults.set(chapter, forKey: "surah.chapter")
        defaults.set(position, forKey: "surah.position")
        defaults.set(duration, forKey: "surah.duration")
        defaults.set(playbackMode, forKey: "surah.mode")
    }

    private func publish() {
        eventOrder = max(eventOrder + 1, Int64(Date().timeIntervalSince1970 * 1_000_000))
        let state: [String: Any] = [
            "timingAvailable": !timings.isEmpty, "playbackMode": playbackMode, "eventOrder": eventOrder,
            "seeking": seeking, "seekPosition": pendingSeek, "seekToken": seekToken,
            "reader": reader, "chapter": chapter, "position": position, "duration": duration,
            "status": status, "key": key, "message": message,
        ]
        snapshot = PrayerSettings.serialize(state)
        onState?(snapshot)
    }

    private func activateSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    // MARK: - Lock screen / Control Center

    private func setupRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in self?.resume(); return .success }
        commands.pauseCommand.addTarget { [weak self] _ in self?.pause(); return .success }
        commands.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            if self.status == "playing" || self.status == "loading" { self.pause() } else { self.resume() }
            return .success
        }
        commands.stopCommand.addTarget { [weak self] _ in self?.stop(); return .success }
        commands.skipForwardCommand.preferredIntervals = [15]
        commands.skipBackwardCommand.preferredIntervals = [15]
        commands.skipForwardCommand.addTarget { [weak self] _ in self?.skip(15_000); return .success }
        commands.skipBackwardCommand.addTarget { [weak self] _ in self?.skip(-15_000); return .success }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.seek(Int(event.positionTime * 1000))
            return .success
        }
        commands.nextTrackCommand.isEnabled = false
        commands.previousTrackCommand.isEnabled = false
    }

    private func updateNowPlaying() {
        let center = MPNowPlayingInfoCenter.default()
        guard status != "stopped" else {
            center.nowPlayingInfo = nil
            if #available(iOS 13.0, *) { center.playbackState = .stopped }
            return
        }
        var subtitle = UiLanguage.text(readerName)
        if let verse = key.split(separator: ":").last, !key.isEmpty {
            subtitle += " · " + UiLanguage.text("الآية") + " " + verse
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: UiLanguage.text("سورة " + chapterName),
            MPMediaItemPropertyArtist: subtitle,
            MPMediaItemPropertyAlbumTitle: UiLanguage.text("مصحفي"),
            MPMediaItemPropertyPlaybackDuration: Double(duration) / 1000,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: Double(position) / 1000,
            MPNowPlayingInfoPropertyPlaybackRate: status == "playing" ? 1.0 : 0.0,
        ]
        if let art = readerArtwork() { info[MPMediaItemPropertyArtwork] = art }
        center.nowPlayingInfo = info
        center.playbackState = status == "playing" ? .playing : .paused
    }

    private func readerArtwork() -> MPMediaItemArtwork? {
        if artworkReader == reader { return artwork }
        artworkReader = reader
        artwork = nil
        let names = [7: "mishary-alafasy", 133: "maher-almuaiqly", 6: "mahmoud-alhusary", 2: "abdulbasit-abdulsamad",
                     3: "abdurrahman-as-sudais", 1001: "ali-alhudhaifi", 1002: "muhammad-ayyub", 1003: "khalid-almuhanna",
                     1004: "ibrahim-alakhdar", 1005: "ahmad-alnafees"]
        let name = names[reader] ?? "mushafi-official-icon"
        guard let url = SharedResources.url(name, "png", subdirectory: "images"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        return artwork
    }

    // MARK: - Audio session events

    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        DispatchQueue.main.async {
            if type == .began {
                if self.status == "playing" || self.status == "loading" {
                    self.resumeAfterInterruption = true
                    self.pauseInternal()
                }
            } else {
                let options = AVAudioSession.InterruptionOptions(rawValue: (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0)
                if self.resumeAfterInterruption && options.contains(.shouldResume) { self.resume() }
                self.resumeAfterInterruption = false
            }
        }
    }

    @objc private func routeChanged(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        DispatchQueue.main.async { self.pause() }   // headphones unplugged
    }
}
