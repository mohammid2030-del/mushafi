import SwiftUI

struct LiveView: View {
    @EnvironmentObject private var player: AudioPlayer
    private let library = Library.shared
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 30), count: 3)

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 46) {
                featured
                VStack(alignment: .leading, spacing: 24) {
                    SectionTitle(title: "كل الإذاعات", detail: "\(library.radios.count.ar) إذاعات · بث مباشر على مدار الساعة")
                    LazyVGrid(columns: columns, spacing: 30) {
                        ForEach(library.radios.dropFirst()) { radio in
                            Button { toggle(radio) } label: { RadioCard(radio: radio, live: player.isPlaying(radio: radio), playing: player.playing) }
                                .buttonStyle(TileButtonStyle(radius: 24, clear: true))
                        }
                    }
                }
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 30)
        }
    }

    private var featured: some View {
        let radio = library.radios[0]
        let live = player.isPlaying(radio: radio)
        return HStack(alignment: .bottom, spacing: 50) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Circle().fill(Color(red: 1, green: 0.42, blue: 0.37)).frame(width: 12, height: 12)
                    Text(live ? "تستمع الآن" : "يبث الآن").font(.system(size: 22, weight: .heavy)).foregroundStyle(Color(light: (0.72, 0.16, 0.14), dark: (1, 0.7, 0.66)))
                }
                .padding(.horizontal, 18).padding(.vertical, 8)
                .background(Capsule().fill(Color(red: 1, green: 0.35, blue: 0.35).opacity(0.16)))
                Spacer()
                Text(radio.title).font(.system(size: 70, weight: .heavy)).foregroundStyle(Theme.ink)
                Text("\(radio.place) · على مدار الساعة").font(.system(size: 27)).foregroundStyle(Theme.ink.opacity(0.75))
                Button { toggle(radio) } label: {
                    Label(live && player.playing ? "إيقاف" : "استمع الآن", systemImage: live && player.playing ? "pause.fill" : "play.fill")
                }
                .buttonStyle(PillButtonStyle(prominent: true))
                .padding(.top, 12)
            }
            Spacer()
            Equalizer(playing: live && player.playing).scaleEffect(2.2).padding(.trailing, 60).padding(.bottom, 40)
        }
        .padding(50)
        .frame(height: 430)
        .glassPanel()
    }

    private func toggle(_ radio: Radio) {
        if player.isPlaying(radio: radio) { player.toggle() } else { player.play(radio: radio) }
    }
}

struct RadioCard: View {
    let radio: Radio
    let live: Bool
    let playing: Bool
    @Environment(\.tileFocused) private var focused
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(Color(red: 1, green: 0.42, blue: 0.37)).frame(width: 9, height: 9)
                    Text(live ? "تستمع الآن" : "مباشر").font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(focused ? Color(red: 0.48, green: 0.12, blue: 0.12) : Color(light: (0.78, 0.2, 0.18), dark: (1, 0.62, 0.57)))
                }
                Spacer()
                if live { Equalizer(color: focused ? .black : Theme.gold, playing: playing) }
                else { Image(systemName: "dot.radiowaves.left.and.right").font(.system(size: 26, weight: .semibold)).foregroundStyle(focused ? .black : Theme.gold) }
            }
            Spacer(minLength: 12)
            Text(radio.title).font(.system(size: 30, weight: .heavy)).lineLimit(1)
            SubText(radio.place, size: 20)
        }
        .padding(26)
        .frame(maxWidth: .infinity, minHeight: 180, maxHeight: 180, alignment: .leading)
    }
}
