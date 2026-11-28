import SwiftUI
import UIKit
import AVFoundation

@main
struct MushafiTVApp: App {
    @StateObject private var state = AppState()
    @StateObject private var player = AudioPlayer.shared
    @StateObject private var prayer = PrayerModel()
    @StateObject private var location = LocationModel()
    @StateObject private var weather = WeatherModel()
    @StateObject private var appearance = AppearanceModel()

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
                .environmentObject(location)
                .environmentObject(weather)
                .environmentObject(appearance)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .preferredColorScheme(appearance.scheme)
        }
    }
}
