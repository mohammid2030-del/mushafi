import AVFoundation
import MediaPlayer
import SwiftUI

/// One player for recitations (with verse timings) and live radio. Keeps playing in the background,
/// and answers the Siri Remote and the system «Now Playing» screen.
final class AudioPlayer: ObservableObject {
    static let shared = AudioPlayer()

    enum Item: Equatable {
        case surah(reciter: String, surah: Int)
        case radio(Radio)
    }

    @Published private(set) var item: Item?
    @Published private(set) var playing = false
    @Published private(set) var loading = false
    @Published private(set) var position: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var ayah: Int = 0

    private let player = AVPlayer()
    private var timings: [[Int]] = []
    private var observer: Any?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?
    private var usedBackup = false

    private init() {
        player.automaticallyWaitsToMinimizeStalling = true
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            self?.tick(time.seconds)
        }
        statusObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
            DispatchQueue.main.async {
                self?.playing = p.timeControlStatus == .playing
                self?.loading = p.timeControlStatus == .waitingToPlayAtSpecifiedRate
                self?.publishNowPlaying()
            }
        }
        setupRemote()
    }

    // MARK: Commands

    func play(reciter: String, surah: Int, from startAyah: Int = 1) {
        guard let audio = Library.shared.audio(reciter: reciter, surah: surah) else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        timings = audio.timings
        item = .surah(reciter: reciter, surah: surah)
        ayah = startAyah
        position = 0
        duration = 0
        let next = AVPlayerItem(url: audio.url)
        watchEnd(of: next)
        player.replaceCurrentItem(with: next)
        if startAyah > 1, let row = timings.first(where: { $0[0] == startAyah }) {
            player.seek(to: CMTime(seconds: Double(row[1]) / 1000, preferredTimescale: 600))
        }
        player.play()
        publishNowPlaying()
    }

    func play(radio: Radio, backup: Bool = false) {
        try? AVAudioSession.sharedInstance().setActive(true)
        timings = []
        ayah = 0
        usedBackup = backup
        item = .radio(radio)
        position = 0
        duration = 0
        let next = AVPlayerItem(url: backup ? (radio.backup ?? radio.url) : radio.url)
        watchEnd(of: next)
        player.replaceCurrentItem(with: next)
        player.play()
        publishNowPlaying()
    }

    func toggle() {
        guard item != nil else { return }
        if player.timeControlStatus == .paused { player.play() } else { player.pause() }
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        item = nil
        playing = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    func skip(_ delta: Int) {
        guard case let .surah(reciter, surah)? = item else { return }
        let next = surah + delta
        if (1...114).contains(next) { play(reciter: reciter, surah: next) }
    }

    /// Jumps to a verse of the current recitation.
    func seek(ayah target: Int) {
        guard case let .surah(reciter, surah)? = item else { return }
        guard let row = timings.first(where: { $0[0] == target }) else {
            if target > (timings.last?[0] ?? 0) { skip(1) } else if target < 1 { play(reciter: reciter, surah: surah) }
            return
        }
        ayah = target
        player.seek(to: CMTime(seconds: Double(row[1]) / 1000, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        if player.timeControlStatus == .paused { player.play() }
    }

    /// Next or previous verse (into the next surah after the last verse).
    func step(_ delta: Int) { seek(ayah: max(1, ayah) + delta) }

    /// Same verse, another reciter.
    func change(reciter: String) {
        guard case let .surah(_, surah)? = item else { return }
        play(reciter: reciter, surah: surah, from: max(1, ayah))
    }

    func isPlaying(radio: Radio) -> Bool {
        if case let .radio(r)? = item { return r.id == radio.id }
        return false
    }

    func isCurrent(reciter: String, surah: Int) -> Bool {
        if case let .surah(r, s)? = item { return r == reciter && s == surah }
        return false
    }

    var surah: Int? { if case let .surah(_, s)? = item { return s }; return nil }
    var reciterId: String? { if case let .surah(r, _)? = item { return r }; return nil }
    var progress: Double { duration > 0 ? min(1, position / duration) : 0 }

    var title: String {
        switch item {
        case let .surah(_, s)?: return "سورة " + (Library.shared.chapter(s)?.name ?? "")
        case let .radio(r)?: return r.title
        case nil: return ""
        }
    }
    var subtitle: String {
        switch item {
        case let .surah(r, _)?: return Library.shared.reciter(r)?.name ?? ""
        case let .radio(r)?: return r.place
        case nil: return ""
        }
    }

    // MARK: Internals

    private func tick(_ seconds: Double) {
        guard seconds.isFinite else { return }
        position = seconds
        if let d = player.currentItem?.duration.seconds, d.isFinite, d > 0 { duration = d }
        let ms = Int(seconds * 1000)
        if let row = timings.last(where: { $0[1] <= ms }), row[0] != ayah { ayah = row[0] }
    }

    private func watchEnd(of next: AVPlayerItem) {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: next, queue: .main) { [weak self] _ in
            self?.skip(1)
        }
        NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: next, queue: .main) { [weak self] _ in
            guard let self, case let .radio(r)? = self.item, r.backup != nil, !self.usedBackup else { return }
            self.play(radio: r, backup: true)
        }
    }

    private func publishNowPlaying() {
        guard item != nil else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: subtitle,
            MPMediaItemPropertyAlbumTitle: "مصحفي",
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
        ]
        if case .radio = item { info[MPNowPlayingInfoPropertyIsLiveStream] = true }
        else {
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
            if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        }
        if let icon = UIImage(named: "NowPlayingArt") {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: icon.size) { _ in icon }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func setupRemote() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in self?.player.play(); return .success }
        center.pauseCommand.addTarget { [weak self] _ in self?.player.pause(); return .success }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in self?.toggle(); return .success }
        center.nextTrackCommand.addTarget { [weak self] _ in self?.skip(1); return .success }
        center.previousTrackCommand.addTarget { [weak self] _ in self?.skip(-1); return .success }
    }
}
