import SwiftUI
import UIKit
import AVFoundation

@main
struct MushafiTVApp: App {
    @StateObject private var state = AppState()
    @StateObject private var player = AudioPlayer.shared
    @StateObject private var prayer = PrayerModel()

    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        UIView.appearance().semanticContentAttribute = .forceRightToLeft
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .environmentObject(player)
                .environmentObject(prayer)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .preferredColorScheme(.dark)
        }
    }
}
