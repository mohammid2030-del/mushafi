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

/// Night and day paper of the reader; the page images have no background of their own.
enum Paper {
    static let color = Color(light: (0.969, 0.945, 0.894), dark: (0.063, 0.063, 0.075))
}

/// Two-page spread like the printed Mushaf (odd page on the right), filling the screen height.
/// Remote: left/right turn pages, Play/Pause recites, a click (or up/down) shows the controls for five seconds:
/// verse back/forward, play/pause, choose a surah, choose a reciter. The verse being recited is highlighted.
struct ReaderView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    @Environment(\.dismiss) private var dismiss
    @State private var spread: Int
    @State private var chrome = true
    @State private var hideTask: Task<Void, Never>?
    @State private var picker: Picker?
    @FocusState private var focus: Control?
    private let library = Library.shared

    enum Control: Hashable { case pages, surah, prev, play, next, reciter }
    enum Picker: String, Identifiable { case surah, reciter; var id: String { rawValue } }

    init(startPage: Int) { _spread = State(initialValue: startPage % 2 == 1 ? startPage : startPage - 1) }

    private var right: Int { spread }
    private var left: Int { min(604, spread + 1) }
    private var reciting: Bool { if case .surah? = player.item { return true }; return false }

    var body: some View {
        ZStack {
            Paper.color.ignoresSafeArea()
            GeometryReader { geo in
                HStack(spacing: 0) {
                    // RTL: the right page hugs the spine on its left, the left page on its right.
                    page(right, height: geo.size.height)
                        .padding(.trailing, 18)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    page(left, height: geo.size.height)
                        .padding(.leading, 18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.vertical, 26)
            .padding(.horizontal, 40)
            .id(spread)
            .transition(.opacity)
            .focusable(!chrome || picker != nil)
            .focused($focus, equals: .pages)
            .onTapGesture { show() }

            VStack(spacing: 0) {
                topBar
                Spacer()
                controls
            }
            .opacity(chrome ? 1 : 0)
            .allowsHitTesting(chrome)
            .animation(.easeInOut(duration: 0.3), value: chrome)
        }
        .onMoveCommand { direction in
            guard !chrome else { bump(); return }
            switch direction {
            case .left: turn(2)
            case .right: turn(-2)
            default: show()
            }
        }
        .onPlayPauseCommand { playPause(); if chrome { bump() } }
        .onExitCommand { if chrome { hide() } else { dismiss() } }
        .onChange(of: player.ayah) { _, ayah in follow(ayah) }
        .onChange(of: focus) { _, _ in if chrome { bump() } }
        .onAppear { remember(); show(first: reciting ? .play : .surah) }
        .sheet(item: $picker, onDismiss: { show() }) { kind in
            switch kind {
            case .surah: SurahPicker { chapter in pick(chapter) }
            case .reciter: ReciterPicker { id in pick(reciter: id) }
            }
        }
    }

    // MARK: Pages

    @ViewBuilder private func page(_ number: Int, height: CGFloat) -> some View {
        if let image = library.image(page: number) {
            let h = height - 52
            let w = h * image.size.width / image.size.height
            ZStack(alignment: .topLeading) {
                if reciting, let s = player.surah, player.ayah > 0 {
                    ForEach(Array(library.rects(page: number, surah: s, ayah: player.ayah).enumerated()), id: \.offset) { _, r in
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.gold.opacity(0.2))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.gold.opacity(0.35), lineWidth: 1.5))
                            .frame(width: r.width * w + 12, height: r.height * h + 6)
                            .offset(x: r.minX * w - 6, y: r.minY * h - 3)
                    }
                }
                MushafPageImage(image: image).frame(width: w, height: h)
            }
            .frame(width: w, height: h)
            .environment(\.layoutDirection, .leftToRight)
            .animation(.easeInOut(duration: 0.25), value: player.ayah)
        } else {
            Text("صفحة \(number.ar)").font(.system(size: 36, weight: .bold)).foregroundStyle(Theme.muted)
        }
    }

    // MARK: Controls (shown on demand, hidden after five seconds)

    private var topBar: some View {
        let info = library.info(page: right)
        let names = Set([right, left].compactMap { library.info(page: $0)?.s }).sorted().compactMap { library.chapter($0)?.name }
        return HStack(spacing: 14) {
            chip(names.map { "سورة " + $0 }.joined(separator: " · "))
            chip("الجزء \((info?.juz ?? 1).ar)")
            Spacer()
            chip("الصفحتان \(right.ar) – \(left.ar) من ٦٠٤")
        }
        .padding(.horizontal, 70)
        .padding(.top, 36)
    }

    private func chip(_ text: String) -> some View {
        Text(text).font(.system(size: 24, weight: .semibold)).foregroundStyle(Theme.ink)
            .padding(.horizontal, 24).padding(.vertical, 12)
            .background(Capsule().fill(.regularMaterial))
            .overlay(Capsule().stroke(Theme.line))
    }

    private var controls: some View {
        VStack(spacing: 18) {
            if reciting {
                HStack(spacing: 18) {
                    Monogram(name: player.subtitle, id: player.reciterId, size: 64, active: true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(player.title) · الآية \(max(1, player.ayah).ar)").font(.system(size: 27, weight: .bold)).foregroundStyle(Theme.ink)
                        Text(player.subtitle).font(.system(size: 21)).foregroundStyle(Theme.muted)
                    }
                    ProgressView(value: player.progress).tint(Theme.gold)
                }
            }
            HStack(spacing: 22) {
                Button { picker = .surah } label: { Label("اختيار السورة", systemImage: "list.bullet") }
                    .focused($focus, equals: .surah)
                Spacer()
                Button { reciting ? player.step(-1) : playPause() } label: { Image(systemName: "backward.end.fill") }
                    .focused($focus, equals: .prev).disabled(!reciting)
                Button { playPause() } label: {
                    Label(reciting && player.playing ? "إيقاف مؤقت" : "استماع", systemImage: reciting && player.playing ? "pause.fill" : "play.fill")
                }
                .focused($focus, equals: .play)
                Button { player.step(1) } label: { Image(systemName: "forward.end.fill") }
                    .focused($focus, equals: .next).disabled(!reciting)
                Spacer()
                Button { picker = .reciter } label: {
                    Label(state.reciter?.name ?? "القارئ", systemImage: "person.wave.2.fill")
                }
                .focused($focus, equals: .reciter)
            }
            .buttonStyle(PillButtonStyle(prominent: true))
        }
        .padding(.horizontal, 36).padding(.vertical, 26)
        .background(RoundedRectangle(cornerRadius: 34, style: .continuous).fill(.regularMaterial))
        .overlay(RoundedRectangle(cornerRadius: 34, style: .continuous).stroke(Theme.line))
        .padding(.horizontal, 70).padding(.bottom, 40)
        .focusSection()
    }

    private func show(first: Control? = nil) {
        chrome = true
        if let first { DispatchQueue.main.async { focus = first } }
        else if focus == .pages || focus == nil { DispatchQueue.main.async { focus = reciting ? .play : .surah } }
        bump()
    }

    private func bump() {
        hideTask?.cancel()
        hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled, picker == nil else { return }
            hide()
        }
    }

    private func hide() {
        hideTask?.cancel()
        chrome = false
        DispatchQueue.main.async { focus = .pages }
    }

    // MARK: Actions

    private func turn(_ delta: Int) {
        let next = spread + delta
        guard (1...604).contains(next) else { return }
        withAnimation(.easeInOut(duration: 0.25)) { spread = next }
        remember()
    }

    private func remember() { state.lastPage = right }

    private func playPause() {
        if reciting { player.toggle(); return }
        guard let info = library.info(page: right), let reciter = state.reciter else { return }
        player.play(reciter: reciter.id, surah: info.s, from: info.a)
    }

    private func pick(_ chapter: Chapter) {
        picker = nil
        withAnimation { spread = chapter.page % 2 == 1 ? chapter.page : chapter.page - 1 }
        remember()
        if let reciter = state.reciter { player.play(reciter: reciter.id, surah: chapter.id) }
    }

    private func pick(reciter id: String) {
        picker = nil
        state.reciterId = id
        if reciting { player.change(reciter: id) }
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

/// Choose a surah from inside the reader.
struct SurahPicker: View {
    let choose: (Chapter) -> Void
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 26), count: 5)
    var body: some View {
        ZStack {
            SkyBackground()
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 30) {
                    SectionTitle(title: "اختر السورة", detail: "تبدأ التلاوة من أولها")
                    LazyVGrid(columns: columns, spacing: 26) {
                        ForEach(Library.shared.chapters) { chapter in
                            Button { choose(chapter) } label: { SurahCard(chapter: chapter) }
                                .buttonStyle(TileButtonStyle(radius: 24))
                        }
                    }
                }
                .padding(.horizontal, 90).padding(.vertical, 50)
            }
        }
    }
}

/// Choose the reciter from inside the reader (keeps the current verse).
struct ReciterPicker: View {
    let choose: (String) -> Void
    @EnvironmentObject private var state: AppState
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 30), count: 5)
    var body: some View {
        ZStack {
            SkyBackground()
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 30) {
                    SectionTitle(title: "اختر القارئ", detail: "تكمل التلاوة من نفس الآية")
                    LazyVGrid(columns: columns, spacing: 34) {
                        ForEach(Library.shared.reciters) { reciter in
                            Button { choose(reciter.id) } label: {
                                VStack(spacing: 16) {
                                    Monogram(name: reciter.name, id: reciter.id, size: 150, active: state.reciterId == reciter.id)
                                    Text(reciter.name).font(.system(size: 25, weight: .bold)).lineLimit(2).multilineTextAlignment(.center)
                                }
                                .padding(24).frame(maxWidth: .infinity)
                            }
                            .buttonStyle(TileButtonStyle(radius: 28))
                        }
                    }
                }
                .padding(.horizontal, 90).padding(.vertical, 50)
            }
        }
    }
}

/// A page rendered from the night reader on a transparent background (cream ink, gold ornaments).
/// In daylight it turns to dark ink: inverting and turning the hue half way keeps the gold ornaments gold.
struct MushafPageImage: View {
    let image: UIImage
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let base = Image(uiImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fit)
        if scheme == .light {
            base.colorInvert().hueRotation(.degrees(180))
        } else {
            base
        }
    }
}
