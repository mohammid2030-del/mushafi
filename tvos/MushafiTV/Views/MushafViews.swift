import SwiftUI

struct MushafIndexView: View {
    @EnvironmentObject private var state: AppState
    private let library = Library.shared
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 30), count: 5)

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 34) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow(text: "المصحف الشريف")
                        Text("سور القرآن الكريم").font(.system(size: 64, weight: .heavy)).foregroundStyle(Theme.ink)
                        Text("١١٤ سورة · ٦٠٤ صفحة برواية حفص عن عاصم").font(.system(size: 25, weight: .medium)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button { state.open(page: state.lastPage) } label: {
                        Label("تابع من الصفحة \(state.lastPage.ar)", systemImage: "bookmark.fill")
                    }
                    .buttonStyle(PillButtonStyle(prominent: true))
                }
                LazyVGrid(columns: columns, spacing: 30) {
                    ForEach(library.chapters) { chapter in
                        Button { state.open(page: chapter.page) } label: { SurahCard(chapter: chapter) }
                            .buttonStyle(TileButtonStyle(radius: 24))
                    }
                }
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 30)
        }
    }
}

struct SurahCard: View {
    let chapter: Chapter
    @Environment(\.tileFocused) private var focused
    var body: some View {
        HStack(spacing: 18) {
            ZStack {
                Image(systemName: "seal").font(.system(size: 62, weight: .ultraLight))
                    .foregroundStyle(focused ? Color.black.opacity(0.55) : Theme.gold.opacity(0.7))
                Text(chapter.id.ar).font(.system(size: 22, weight: .heavy))
            }
            .frame(width: 66)
            VStack(alignment: .leading, spacing: 4) {
                Text(chapter.name).font(.system(size: 30, weight: .heavy)).lineLimit(1)
                SubText("\(chapter.placeName) · \(chapter.verses.ar) آية", size: 19)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
        .frame(height: 122)
    }
}

/// Two-page spread like the printed Mushaf: the odd page on the right. Left/right on the remote turns pages,
/// Play/Pause recites from the first verse of the spread, and the pages follow the recitation.
struct ReaderView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    @Environment(\.dismiss) private var dismiss
    @State private var spread: Int
    @State private var showHints = true
    private let library = Library.shared

    init(startPage: Int) { _spread = State(initialValue: startPage % 2 == 1 ? startPage : startPage - 1) }

    private var right: Int { spread }
    private var left: Int { min(604, spread + 1) }

    var body: some View {
        ZStack {
            Color(light: (0.976, 0.953, 0.898), dark: (0.07, 0.065, 0.075)).ignoresSafeArea()
            HStack(spacing: 0) {
                page(right)
                Rectangle().fill(Theme.gold.opacity(0.18)).frame(width: 1).padding(.vertical, 60)
                page(left)
            }
            .padding(.vertical, 26)
            .id(spread)
            .transition(.opacity)

            VStack {
                topBar
                Spacer()
                bottomBar
            }
        }
        .focusable()
        .onMoveCommand { direction in
            switch direction {
            case .left: turn(2)
            case .right: turn(-2)
            default: break
            }
        }
        .onPlayPauseCommand(perform: playPause)
        .onExitCommand { dismiss() }
        .onChange(of: player.ayah) { _, ayah in follow(ayah) }
        .onAppear { remember() }
        .task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            withAnimation { showHints = false }
        }
    }

    @ViewBuilder private func page(_ number: Int) -> some View {
        if let image = library.image(page: number) {
            MushafPageImage(image: image).frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 12) {
                Text("صفحة \(number.ar)").font(.system(size: 36, weight: .bold))
                Text("ستتوفر صور الصفحات في النسخة النهائية").foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var topBar: some View {
        let info = library.info(page: right)
        let names = Set([right, left].compactMap { library.info(page: $0)?.s }).sorted().compactMap { library.chapter($0)?.name }
        return HStack {
            HStack(spacing: 12) {
                chip(names.joined(separator: " · "))
                chip("الجزء \((info?.juz ?? 1).ar)")
            }
            Spacer()
            Text("الصفحتان \(right.ar) – \(left.ar) من ٦٠٤").font(.system(size: 23, weight: .semibold)).foregroundStyle(Theme.ink.opacity(0.75))
        }
        .padding(.horizontal, 80)
        .padding(.top, 40)
        .opacity(showHints || player.item != nil ? 1 : 0)
    }

    private func chip(_ text: String) -> some View {
        Text(text).font(.system(size: 23, weight: .semibold)).foregroundStyle(Theme.ink)
            .padding(.horizontal, 22).padding(.vertical, 10)
            .background(Capsule().fill(.ultraThinMaterial))
    }

    @ViewBuilder private var bottomBar: some View {
        if case .surah? = player.item {
            HStack(spacing: 26) {
                Text((player.surah ?? 1).ar)
                    .font(.system(size: 30, weight: .heavy)).foregroundStyle(Theme.gold)
                    .frame(width: 80, height: 80)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Theme.panel))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.gold.opacity(0.35)))
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(player.title) · الآية \(player.ayah.ar)").font(.system(size: 27, weight: .bold))
                    Text(player.subtitle).font(.system(size: 21)).foregroundStyle(Theme.muted)
                }
                ProgressView(value: player.progress).tint(Theme.gold)
                Image(systemName: player.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 26, weight: .bold)).foregroundStyle(Theme.focusText)
                    .frame(width: 66, height: 66).background(Circle().fill(Theme.ink))
            }
            .padding(.horizontal, 30).padding(.vertical, 18)
            .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(.ultraThinMaterial))
            .padding(.horizontal, 80).padding(.bottom, 40)
        } else if showHints {
            HStack(spacing: 34) {
                hint("◀ ▶", "تقليب الصفحات")
                hint("⏯", "استماع من أول الصفحة")
                hint("Menu", "رجوع")
            }
            .padding(.bottom, 46)
            .transition(.opacity)
        }
    }

    private func hint(_ key: String, _ text: String) -> some View {
        HStack(spacing: 12) {
            Text(key).font(.system(size: 20, weight: .bold)).padding(.horizontal, 12).frame(height: 40)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.pill))
            Text(text).font(.system(size: 22)).foregroundStyle(Theme.ink.opacity(0.7))
        }
    }

    private func turn(_ delta: Int) {
        let next = spread + delta
        guard (1...604).contains(next) else { return }
        withAnimation(.easeInOut(duration: 0.25)) { spread = next }
        remember()
    }

    private func remember() { state.lastPage = right }

    private func playPause() {
        guard let info = library.info(page: right), let reciter = state.reciter else { return }
        if case .surah? = player.item { player.toggle(); return }
        player.play(reciter: reciter.id, surah: info.s, from: info.a)
    }

    private func follow(_ ayah: Int) {
        guard ayah > 0, let s = player.surah else { return }
        let p = library.page(surah: s, ayah: ayah)
        if p != right && p != left {
            withAnimation(.easeInOut(duration: 0.3)) { spread = p % 2 == 1 ? p : p - 1 }
            remember()
        }
    }
}

/// A page image rendered from the night reader. In daylight it is shown as cream paper with dark ink:
/// inverting and turning the hue half way keeps the gold ornaments gold.
struct MushafPageImage: View {
    let image: UIImage
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let base = Image(uiImage: image).resizable().aspectRatio(contentMode: .fit)
        if scheme == .light {
            base.colorInvert().hueRotation(.degrees(180)).colorMultiply(Color(red: 0.99, green: 0.96, blue: 0.89))
        } else {
            base
        }
    }
}
