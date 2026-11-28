import SwiftUI

struct RecitersView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    private let library = Library.shared

    var body: some View {
        NavigationStack {
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 56) {
                    NowPlayingCard()
                    VStack(alignment: .leading, spacing: 26) {
                        SectionTitle(title: "القرّاء", detail: "\(library.reciters.count.ar) قرّاء · تلاوة السورة كاملة")
                        ScrollView(.horizontal) {
                            HStack(spacing: 46) {
                                ForEach(library.reciters) { reciter in
                                    NavigationLink(value: reciter) { ReciterBubble(reciter: reciter, current: player.reciterId == reciter.id) }
                                        .buttonStyle(BubbleButtonStyle())
                                }
                            }
                            .padding(.vertical, 30)
                            .padding(.horizontal, 10)
                        }
                        .scrollClipDisabled()
                    }
                }
                .padding(.horizontal, 90)
                .padding(.vertical, 30)
            }
            .navigationDestination(for: Reciter.self) { ReciterSurahsView(reciter: $0) }
        }
    }
}

struct ReciterBubble: View {
    let reciter: Reciter
    let current: Bool
    @Environment(\.tileFocused) private var focused
    var body: some View {
        VStack(spacing: 16) {
            Monogram(name: reciter.name, id: reciter.id, size: 176, active: focused || current)
            Text(reciter.name).font(.system(size: 24, weight: .bold)).multilineTextAlignment(.center).lineLimit(2)
                .foregroundStyle(focused ? Theme.gold : Theme.ink)
            Text(reciter.style).font(.system(size: 18)).foregroundStyle(Theme.muted).lineLimit(1)
        }
        .frame(width: 210)
    }
}

/// Reciter circles: the focused one grows and turns gold.
struct BubbleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Styled(configuration: configuration) }
    private struct Styled: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isFocused) private var focused
        var body: some View {
            configuration.label
                .environment(\.tileFocused, focused)
                .scaleEffect(configuration.isPressed ? 0.97 : (focused ? 1.1 : 1))
                .shadow(color: .black.opacity(focused ? 0.5 : 0), radius: 24, y: 16)
                .animation(.easeOut(duration: 0.16), value: focused)
        }
    }
}

/// «Now playing» banner: reciter, surah, the verse being recited, progress and controls.
struct NowPlayingCard: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    private let library = Library.shared

    var body: some View {
        let reciter = player.reciterId.flatMap { library.reciter($0) } ?? state.reciter
        HStack(spacing: 54) {
            Monogram(name: reciter?.name ?? "م", id: reciter?.id, size: 230, active: true)
            VStack(alignment: .leading, spacing: 12) {
                Eyebrow(text: player.surah != nil ? (player.playing ? "يُتلى الآن" : "متوقف مؤقتًا") : "ابدأ الاستماع")
                Text(reciter?.name ?? "").font(.system(size: 58, weight: .heavy)).foregroundStyle(Theme.ink).lineLimit(1)
                Text(player.surah != nil ? "\(player.title) · \(reciter?.style ?? "")" : "اختر قارئًا ثم السورة التي تحب سماعها")
                    .font(.system(size: 26)).foregroundStyle(Theme.ink.opacity(0.75))
                HStack(spacing: 20) {
                    if player.surah != nil {
                        Button { player.skip(-1) } label: { Image(systemName: "forward.end.fill") }.buttonStyle(PillButtonStyle())
                        Button { player.toggle() } label: {
                            Label(player.playing ? "إيقاف مؤقت" : "تشغيل", systemImage: player.playing ? "pause.fill" : "play.fill")
                        }.buttonStyle(PillButtonStyle(prominent: true))
                        Button { player.skip(1) } label: { Image(systemName: "backward.end.fill") }.buttonStyle(PillButtonStyle())
                    } else if let reciter {
                        Button { player.play(reciter: reciter.id, surah: 1) } label: { Label("استمع للفاتحة", systemImage: "play.fill") }
                            .buttonStyle(PillButtonStyle(prominent: true))
                    }
                }
                .padding(.top, 14)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let s = player.surah, player.ayah > 0 {
                VStack(alignment: .leading, spacing: 14) {
                    Text("الآية \(player.ayah.ar) من \((library.chapter(s)?.verses ?? 0).ar)").font(.system(size: 20)).foregroundStyle(Theme.muted)
                    Text(library.verse(s, player.ayah)).font(Theme.quran(40)).foregroundStyle(Theme.ink)
                        .lineLimit(3).minimumScaleFactor(0.6).lineSpacing(10)
                    ProgressView(value: player.progress).tint(Theme.gold)
                }
                .padding(30)
                .frame(width: 560)
                .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Theme.panel))
                .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.line))
            }
        }
        .padding(.horizontal, 56)
        .padding(.vertical, 44)
        .glassPanel()
    }
}

struct ReciterSurahsView: View {
    let reciter: Reciter
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    private let library = Library.shared
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 30), count: 5)

    var body: some View {
        ZStack {
            SkyBackground()
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 36) {
                    HStack(spacing: 34) {
                        Monogram(name: reciter.name, id: reciter.id, size: 150, active: true)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(reciter.name).font(.system(size: 56, weight: .heavy))
                            Text(reciter.style).font(.system(size: 24)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button { state.reciterId = reciter.id } label: {
                            Label(state.reciterId == reciter.id ? "القارئ المفضّل" : "اجعله القارئ المفضّل",
                                  systemImage: state.reciterId == reciter.id ? "star.fill" : "star")
                        }
                        .buttonStyle(PillButtonStyle())
                    }
                    LazyVGrid(columns: columns, spacing: 30) {
                        ForEach(library.chapters) { chapter in
                            Button { player.play(reciter: reciter.id, surah: chapter.id) } label: {
                                HStack {
                                    SurahCard(chapter: chapter)
                                    if player.isCurrent(reciter: reciter.id, surah: chapter.id) {
                                        Equalizer(playing: player.playing).padding(.trailing, 22)
                                    }
                                }
                            }
                            .buttonStyle(TileButtonStyle(radius: 24))
                        }
                    }
                }
                .padding(.horizontal, 90)
                .padding(.vertical, 40)
            }
        }
    }
}
