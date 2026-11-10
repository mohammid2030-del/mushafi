import SwiftUI
import WidgetKit

// MARK: - Content

struct DevotionItem {
    let id: String
    let title: String
    let text: String
    let reference: String
    let count: Int
    let groups: [String]
}

enum Devotions {
    static let all: [DevotionItem] = {
        guard let data = SharedResources.json("widget-devotions") as? [String: Any],
              let items = data["items"] as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            guard let id = item["id"] as? String, let text = item["text"] as? String else { return nil }
            return DevotionItem(id: id, title: item["title"] as? String ?? "", text: text,
                                reference: item["reference"] as? String ?? "",
                                count: item["count"] as? Int ?? 0,
                                groups: item["groups"] as? [String] ?? [])
        }
    }()

    static func group(_ id: String) -> [DevotionItem] { all.filter { $0.groups.contains(id) } }
}

struct Verse {
    let key: String
    let text: String
    let translation: String
    let surah: String

    var ayahNumber: String {
        WidgetText.number(Int(key.split(separator: ":").last ?? "") ?? 0)
    }
}

enum Verses {
    static func daily(at date: Date) -> Verse? {
        guard let data = SharedResources.json("widget-daily-verses") as? [String: Any],
              let order = data["order"] as? [String], !order.isEmpty,
              let ar = data["ar"] as? [String: String] else { return nil }
        let key = order[WidgetText.dailyIndex(order.count, at: date)]
        let en = data["en"] as? [String: String] ?? [:]
        let names = data[WidgetText.arabicScript ? "surah" : "surahEn"] as? [String: String] ?? [:]
        return Verse(key: key, text: ar[key] ?? "", translation: en[key] ?? "", surah: names[key] ?? "")
    }
}

// MARK: - Daily verse

struct VerseEntry: TimelineEntry {
    let date: Date
    let verse: Verse?
}

struct VerseProvider: TimelineProvider {
    func placeholder(in context: Context) -> VerseEntry { VerseEntry(date: Date(), verse: Verses.daily(at: Date())) }
    func getSnapshot(in context: Context, completion: @escaping (VerseEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<VerseEntry>) -> Void) {
        let now = Date()
        let midnight = WidgetText.nextMidnight(after: now)
        completion(Timeline(entries: [VerseEntry(date: now, verse: Verses.daily(at: now)),
                                      VerseEntry(date: midnight, verse: Verses.daily(at: midnight))],
                            policy: .after(midnight.addingTimeInterval(60))))
    }
}

struct VerseView: View {
    @Environment(\.widgetFamily) private var family
    let entry: VerseEntry
    private let theme = WidgetTheme.sand

    var body: some View {
        Group {
            if let verse = entry.verse {
                switch family {
                case .accessoryRectangular:
                    VStack(alignment: .leading, spacing: 0) {
                        Text("﴿\(verse.text)﴾").font(WidgetFont.quran(15)).lineLimit(2).minimumScaleFactor(0.6)
                            .widgetAccentable()
                        Text("\(verse.surah) · \(verse.ayahNumber)").font(WidgetFont.ui(10)).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .environment(\.layoutDirection, .rightToLeft)
                    .accessoryContainer()
                default:
                    card(verse).widgetTheme(theme)
                }
            } else {
                Text(WidgetText.t("آية اليوم")).accessoryContainer()
            }
        }
        .widgetChrome("daily-verse")
    }

    private func card(_ verse: Verse) -> some View {
        let large = family == .systemLarge
        return VStack(spacing: large ? 12 : 6) {
            WidgetHeader(icon: "book.closed.fill", title: WidgetText.t("آية اليوم"), theme: theme,
                         trailing: family == .systemSmall ? nil : verse.surah)
            Spacer(minLength: 0)
            Text("﴿ \(verse.text) ﴾")
                .font(WidgetFont.quran(large ? 30 : (family == .systemSmall ? 19 : 23)))
                .foregroundStyle(theme.ink)
                .multilineTextAlignment(.center)
                .lineSpacing(large ? 8 : 3)
                .minimumScaleFactor(0.5)
                .environment(\.layoutDirection, .rightToLeft)
            if large && !WidgetText.arabicScript && !verse.translation.isEmpty {
                Text(verse.translation).font(.system(size: 13, design: .serif)).foregroundStyle(theme.muted)
                    .multilineTextAlignment(.center).minimumScaleFactor(0.6)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Rectangle().fill(theme.accent.opacity(0.4)).frame(height: 0.7)
                Text("\(verse.surah) · \(verse.ayahNumber)").font(WidgetFont.ui(10, .semibold)).foregroundStyle(theme.accent)
                    .lineLimit(1).fixedSize()
                Rectangle().fill(theme.accent.opacity(0.4)).frame(height: 0.7)
            }
        }
    }
}

struct DailyVerseWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDailyVerse", provider: VerseProvider()) { entry in
            VerseView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("آية اليوم"))
        .description(WidgetText.t("آية جديدة كل يوم بخط المصحف"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

// MARK: - Rotating remembrance / dua

struct DevotionEntry: TimelineEntry {
    let date: Date
    let item: DevotionItem?
}

struct DevotionProvider: TimelineProvider {
    let groups: [String]
    let hours: Int

    private func item(at date: Date) -> DevotionItem? {
        let items = Devotions.all.filter { item in item.groups.contains { groups.contains($0) } }
        guard !items.isEmpty else { return nil }
        return items[WidgetText.slotIndex(items.count, hours: hours, at: date)]
    }

    func placeholder(in context: Context) -> DevotionEntry { DevotionEntry(date: Date(), item: item(at: Date())) }
    func getSnapshot(in context: Context, completion: @escaping (DevotionEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DevotionEntry>) -> Void) {
        var entries = [DevotionEntry(date: Date(), item: item(at: Date()))]
        var moment = Date()
        for _ in 0..<(24 / hours) {
            moment = WidgetText.nextSlot(hours: hours, after: moment)
            entries.append(DevotionEntry(date: moment, item: item(at: moment)))
        }
        completion(Timeline(entries: entries, policy: .after(moment.addingTimeInterval(60))))
    }
}

struct DevotionView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DevotionEntry
    let title: String
    let icon: String
    let theme: WidgetTheme
    let quranic: Bool
    let link: String

    private func font(_ size: CGFloat) -> Font { quranic ? WidgetFont.quran(size) : WidgetFont.naskh(size, .medium) }

    var body: some View {
        Group {
            if let item = entry.item {
                switch family {
                case .accessoryRectangular:
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 3) {
                            Image(systemName: icon).font(.system(size: 9)).widgetAccentable()
                            Text(title).font(WidgetFont.ui(10)).foregroundStyle(.secondary)
                        }
                        Text(item.text).font(font(14)).lineLimit(2).minimumScaleFactor(0.6).widgetAccentable()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .environment(\.layoutDirection, .rightToLeft)
                    .accessoryContainer()
                default:
                    card(item).widgetTheme(theme)
                }
            } else {
                Text(title).accessoryContainer()
            }
        }
        .widgetChrome(link)
    }

    private func card(_ item: DevotionItem) -> some View {
        let size: CGFloat = family == .systemLarge ? 28 : (family == .systemSmall ? 17 : 21)
        return VStack(spacing: 6) {
            WidgetHeader(icon: icon, title: title, theme: theme,
                         trailing: family == .systemSmall || item.count < 2 ? nil : "× " + WidgetText.number(item.count))
            Spacer(minLength: 0)
            Text(item.text)
                .font(font(size))
                .foregroundStyle(theme.ink)
                .multilineTextAlignment(.center)
                .lineSpacing(family == .systemLarge ? 8 : 3)
                .minimumScaleFactor(0.45)
                .environment(\.layoutDirection, .rightToLeft)
            Spacer(minLength: 0)
            Text(item.reference).font(WidgetFont.ui(9, .medium)).foregroundStyle(theme.accent).lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

struct DailyDhikrWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDailyDhikr", provider: DevotionProvider(groups: ["prayer", "sunnah", "morning"], hours: 3)) { entry in
            DevotionView(entry: entry, title: WidgetText.t("ذكر"), icon: "sparkles", theme: .emerald, quranic: false, link: "daily-dhikr")
        }
        .configurationDisplayName(WidgetText.t("أذكار متنوعة"))
        .description(WidgetText.t("ذكر يتجدد كل ثلاث ساعات بخط النسخ"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct DuaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDua", provider: DevotionProvider(groups: ["quran"], hours: 4)) { entry in
            DevotionView(entry: entry, title: WidgetText.t("دعاء من القرآن"), icon: "hands.sparkles.fill", theme: .plum, quranic: true, link: "adhkar-quran")
        }
        .configurationDisplayName(WidgetText.t("أدعية من القرآن"))
        .description(WidgetText.t("دعاء قرآني بخط المصحف يتجدد خلال اليوم"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

// MARK: - Adhkar for the time of day (morning / evening / sleep)

enum AdhkarPeriod: String {
    case morning, evening, sleep

    static func at(_ entry: PrayerEntry) -> AdhkarPeriod {
        if entry.configured, let previous = entry.previous {
            switch previous.key {
            case "fajr", "dhuhr": return .morning
            case "asr", "maghrib": return .evening
            default: return .sleep
            }
        }
        let hour = Calendar.current.component(.hour, from: entry.date)
        switch hour {
        case 4..<15: return .morning
        case 15..<20: return .evening
        default: return .sleep
        }
    }

    var title: String {
        switch self {
        case .morning: return WidgetText.t("أذكار الصباح")
        case .evening: return WidgetText.t("أذكار المساء")
        case .sleep: return WidgetText.t("أذكار النوم")
        }
    }

    var icon: String {
        switch self {
        case .morning: return "sun.max.fill"
        case .evening: return "sunset.fill"
        case .sleep: return "moon.zzz.fill"
        }
    }

    var theme: WidgetTheme {
        switch self {
        case .morning: return .sand
        case .evening: return .plum
        case .sleep: return .midnight
        }
    }

    func item(at date: Date) -> DevotionItem? {
        let items = Devotions.group(rawValue)
        guard !items.isEmpty else { return nil }
        return items[WidgetText.slotIndex(items.count, hours: 2, at: date)]
    }
}

struct TimedAdhkarView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry

    var body: some View {
        let period = AdhkarPeriod.at(entry)
        let item = period.item(at: entry.date)
        let theme = period.theme
        return Group {
            switch family {
            case .accessoryInline:
                Label(period.title, systemImage: period.icon).accessoryContainer()
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Image(systemName: period.icon).font(.system(size: 11)).widgetAccentable()
                        Text(period.title).font(WidgetFont.ui(13, .bold))
                    }
                    if let item {
                        Text(item.text).font(WidgetFont.naskh(13)).lineLimit(2).minimumScaleFactor(0.6)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessoryContainer()
            default:
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: period.icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(theme.accent)
                        Text(period.title).font(WidgetFont.ui(15, .bold)).foregroundStyle(theme.ink)
                        Spacer(minLength: 0)
                        if family != .systemSmall, let count = item?.count, count > 1 {
                            Chip(text: "× " + WidgetText.number(count), theme: theme)
                        }
                    }
                    Spacer(minLength: 0)
                    if let item {
                        Text(item.text)
                            .font(WidgetFont.naskh(family == .systemSmall ? 15 : 18, .medium))
                            .foregroundStyle(theme.ink)
                            .lineSpacing(3)
                            .minimumScaleFactor(0.5)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .environment(\.layoutDirection, .rightToLeft)
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        Text(WidgetText.t("اضغط لقراءة الأذكار كاملة")).font(WidgetFont.ui(10)).foregroundStyle(theme.muted)
                        Image(systemName: WidgetText.layout == .rightToLeft ? "chevron.left" : "chevron.right")
                            .font(.system(size: 8, weight: .bold)).foregroundStyle(theme.accent)
                    }
                }
                .widgetTheme(theme)
            }
        }
        .widgetChrome("adhkar-\(period.rawValue)")
    }
}

struct TimedAdhkarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiTimedAdhkar", provider: PrayerProvider(afterAdhan: true)) { entry in
            TimedAdhkarView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("أذكار الوقت"))
        .description(WidgetText.t("أذكار الصباح والمساء والنوم تتبدل تلقائيًا حسب مواقيت الصلاة"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Last read page

struct ReadingEntry: TimelineEntry {
    let date: Date
    let state: ReadingState?
}

struct ReadingProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReadingEntry {
        ReadingEntry(date: Date(), state: ReadingState(page: 1, surah: "الفاتحة", juz: 1, started: true))
    }
    func getSnapshot(in context: Context, completion: @escaping (ReadingEntry) -> Void) {
        completion(ReadingEntry(date: Date(), state: WidgetStore.reading() ?? placeholder(in: context).state))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ReadingEntry>) -> Void) {
        // The app reloads this widget whenever the reading position changes.
        completion(Timeline(entries: [ReadingEntry(date: Date(), state: WidgetStore.reading())], policy: .never))
    }
}

struct LastPageView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ReadingEntry
    private let theme = WidgetTheme.emerald

    var body: some View {
        let state = entry.state
        let started = state?.started == true
        let page = state?.page ?? 1
        let progress = Double(page) / 604
        return Group {
            switch family {
            case .accessoryCircular:
                Gauge(value: progress) {
                    Image(systemName: "book.fill")
                } currentValueLabel: {
                    Text(WidgetText.number(page)).font(WidgetFont.number(14, .bold))
                }
                .gaugeStyle(.accessoryCircularCapacity)
                .widgetAccentable()
                .accessoryContainer()
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Image(systemName: "book.fill").font(.system(size: 10)).widgetAccentable()
                        Text(started ? WidgetText.t("آخر قراءة") : WidgetText.t("ابدأ القراءة")).font(WidgetFont.ui(11)).foregroundStyle(.secondary)
                    }
                    Text(WidgetText.t("سورة {0}", state?.surah ?? WidgetText.t("الفاتحة"))).font(WidgetFont.quran(17)).lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(WidgetText.t("صفحة {0} · الجزء {1}", WidgetText.number(page), WidgetText.number(state?.juz ?? 1)))
                        .font(WidgetFont.ui(11)).lineLimit(1)
                    ProgressView(value: progress).tint(.white).widgetAccentable()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessoryContainer()
            default:
                VStack(alignment: .leading, spacing: 4) {
                    WidgetHeader(icon: "book.fill", title: started ? WidgetText.t("تابع من حيث وصلت") : WidgetText.t("ابدأ رحلتك مع القرآن"), theme: theme)
                    Spacer(minLength: 0)
                    Text(WidgetText.t("سورة {0}", state?.surah ?? WidgetText.t("الفاتحة")))
                        .font(WidgetFont.quran(family == .systemSmall ? 24 : 30)).foregroundStyle(theme.accent)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    HStack(spacing: 6) {
                        Chip(text: WidgetText.t("صفحة {0}", WidgetText.number(page)), theme: theme)
                        Chip(text: WidgetText.t("الجزء {0}", WidgetText.number(state?.juz ?? 1)), theme: theme)
                    }
                    Spacer(minLength: 0)
                    ProgressView(value: progress).tint(theme.accent)
                    Text(WidgetText.t("{0}٪ من المصحف", WidgetText.number(Int((progress * 100).rounded()))))
                        .font(WidgetFont.ui(10)).foregroundStyle(theme.muted)
                }
                .widgetTheme(theme)
            }
        }
        .widgetChrome("reader")
    }
}

struct LastPageWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetStore.readingKind, provider: ReadingProvider()) { entry in
            LastPageView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("صفحة المصحف"))
        .description(WidgetText.t("آخر صفحة قرأتها، والمس للمتابعة مباشرة"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}
