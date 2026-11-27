import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var player: AudioPlayer
    @EnvironmentObject private var prayer: PrayerModel
    private let library = Library.shared

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 56) {
                hero
                today
                prayerStrip
            }
            .padding(.horizontal, 90)
            .padding(.top, 30)
            .padding(.bottom, 70)
        }
    }

    // MARK: Continue reading

    private var hero: some View {
        let page = state.lastPage
        let info = library.info(page: page)
        let chapter = library.chapter(info?.s ?? 1)
        return HStack(alignment: .center, spacing: 60) {
            VStack(alignment: .leading, spacing: 18) {
                Eyebrow(text: page > 1 ? "تابع من حيث توقفت" : "ابدأ رحلتك مع القرآن")
                Text("سورة " + (chapter?.name ?? "الفاتحة"))
                    .font(.system(size: 92, weight: .heavy))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text("الصفحة \(page.ar) · الجزء \((info?.juz ?? 1).ar)")
                    .font(.system(size: 28, weight: .medium)).foregroundStyle(Theme.muted)
                HStack(spacing: 22) {
                    Button { state.open(page: page) } label: {
                        Label("تابع القراءة", systemImage: "book.fill")
                    }
                    .buttonStyle(PillButtonStyle(prominent: true))
                    Button {
                        if let reciter = state.reciter { player.play(reciter: reciter.id, surah: info?.s ?? 1, from: info?.a ?? 1) }
                    } label: {
                        Label("استمع للصفحة", systemImage: "headphones")
                    }
                    .buttonStyle(PillButtonStyle())
                }
                .padding(.top, 22)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            PageStack(page: page)
                .frame(width: 560, height: 480)
        }
        .frame(height: 520)
    }

    // MARK: Today

    private var today: some View {
        VStack(alignment: .leading, spacing: 24) {
            let line = prayer.dateLine()
            SectionTitle(title: "يومك مع مصحفي", detail: "\(line.gregorian) · \(line.hijri)")
            HStack(spacing: 30) {
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    let next = prayer.next(after: context.date)
                    tile(title: "الصلاة القادمة", icon: "clock") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(next?.name ?? "—") \(next?.date.clock(prayer.zone) ?? "")")
                                .font(.system(size: 40, weight: .heavy))
                            SubText(next.map { prayer.countdown(to: $0.date, now: context.date) } ?? "")
                        }
                    } action: { state.tab = .settings }
                }
                let verse = library.verseOfTheDay()
                tile(title: "آية اليوم", icon: "sparkles") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("﴿\(verse.text)﴾").font(Theme.quran(31)).lineLimit(2).minimumScaleFactor(0.7)
                        SubText(verse.reference)
                    }
                } action: {}
                tile(title: "إذاعة القرآن الكريم", icon: "dot.radiowaves.left.and.right") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(player.isPlaying(radio: library.radios[0]) ? "تستمع الآن" : "استمع مباشرة")
                            .font(.system(size: 40, weight: .heavy))
                        SubText("من المملكة العربية السعودية")
                    }
                } action: {
                    let radio = library.radios[0]
                    if player.isPlaying(radio: radio) { player.toggle() } else { player.play(radio: radio) }
                }
                tile(title: "المصحف كاملًا", icon: "books.vertical") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("١١٤ سورة").font(.system(size: 40, weight: .heavy))
                        SubText("تصفّح السور وابدأ القراءة")
                    }
                } action: { state.tab = .mushaf }
            }
        }
    }

    private func tile<Content: View>(title: String, icon: String, @ViewBuilder content: () -> Content, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    SubText(title, size: 22)
                    Spacer()
                    Image(systemName: icon).font(.system(size: 26, weight: .semibold))
                }
                Spacer(minLength: 12)
                content()
            }
            .padding(28)
            .frame(maxWidth: .infinity, minHeight: 210, maxHeight: 210, alignment: .leading)
        }
        .buttonStyle(TileButtonStyle())
    }

    // MARK: Prayer strip

    private var prayerStrip: some View {
        VStack(alignment: .leading, spacing: 22) {
            SectionTitle(title: "مواقيت الصلاة", detail: prayer.city)
            TimelineView(.periodic(from: .now, by: 30)) { context in
                let next = prayer.next(after: context.date)
                HStack(spacing: 22) {
                    ForEach(prayer.today) { p in
                        let isNext = p.key == next?.key && Calendar.current.isDate(p.date, inSameDayAs: next?.date ?? .distantPast)
                        VStack(spacing: 8) {
                            Text(p.name).font(.system(size: 25, weight: .bold))
                            Text(p.date.clock(prayer.zone)).font(.system(size: 38, weight: .heavy)).environment(\.layoutDirection, .leftToRight)
                        }
                        .foregroundStyle(isNext ? Color.black : (p.date < context.date ? Theme.ink.opacity(0.45) : Theme.ink))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 22)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(isNext ? AnyShapeStyle(Theme.goldGradient) : AnyShapeStyle(Theme.card)))
                    }
                }
            }
        }
    }
}

/// Two real Mushaf pages, slightly fanned, with a warm glow.
struct PageStack: View {
    let page: Int
    var body: some View {
        let library = Library.shared
        let other = page % 2 == 1 ? min(604, page + 1) : max(1, page - 1)
        ZStack {
            Circle().fill(RadialGradient(colors: [Theme.gold.opacity(0.28), .clear], center: .center, startRadius: 0, endRadius: 320))
                .frame(width: 700, height: 700)
            pageImage(library.image(page: other))
                .rotationEffect(.degrees(-11))
                .offset(x: -110, y: 18)
                .opacity(0.55)
            pageImage(library.image(page: page))
                .rotationEffect(.degrees(-3))
                .offset(x: 60)
        }
    }

    @ViewBuilder private func pageImage(_ image: UIImage?) -> some View {
        Group {
            if let image { Image(uiImage: image).resizable().aspectRatio(contentMode: .fit) }
            else { RoundedRectangle(cornerRadius: 14).fill(Color.black).aspectRatio(0.643, contentMode: .fit) }
        }
        .frame(height: 450)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.gold.opacity(0.28), lineWidth: 1))
        .shadow(color: .black.opacity(0.6), radius: 30, y: 24)
    }
}
