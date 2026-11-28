import SwiftUI

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    @EnvironmentObject private var prayer: PrayerModel
    @EnvironmentObject private var location: LocationModel
    @EnvironmentObject private var weather: WeatherModel
    @EnvironmentObject private var appearance: AppearanceModel
    @Environment(\.scenePhase) private var phase

    var body: some View {
        ZStack {
            SkyBackground()
            TabView(selection: $state.tab) {
                HomeView().tabItem { Text("الرئيسية") }.tag(Tab.home)
                MushafIndexView().tabItem { Text("المصحف") }.tag(Tab.mushaf)
                RecitersView().tabItem { Text("القرّاء") }.tag(Tab.reciters)
                LiveView().tabItem { Text("البث المباشر") }.tag(Tab.live)
                SettingsView().tabItem { Text("الإعدادات") }.tag(Tab.settings)
            }
            TopBar()
        }
        .fullScreenCover(item: $state.reader) { request in
            ReaderView(startPage: request.page)
        }
        .onAppear {
            location.attach(prayer)
            appearance.attach(prayer)
            weather.refresh(prayer)
            screenshotSetup()
        }
        .onChange(of: prayer.placeStamp) { _, _ in weather.refresh(prayer); appearance.update() }
        .onChange(of: phase) { _, now in
            guard now == .active else { return }
            location.refreshIfNeeded(); weather.refresh(prayer); appearance.update()
        }
        .onReceive(Timer.publish(every: 600, on: .main, in: .common).autoconnect()) { _ in weather.refresh(prayer) }
    }

    /// Launch arguments used only by the App Store screenshot run.
    private func screenshotSetup() {
        let d = UserDefaults.standard
        if let value = d.string(forKey: "tvPlay") {
            let parts = value.split(separator: ":").map(String.init)
            if parts.count >= 2, let s = Int(parts[1]) { player.play(reciter: parts[0], surah: s, from: parts.count > 2 ? Int(parts[2]) ?? 1 : 1) }
        }
        if let id = d.string(forKey: "tvRadio"), let radio = Library.shared.radios.first(where: { $0.id == id }) {
            player.play(radio: radio)
        }
    }
}
