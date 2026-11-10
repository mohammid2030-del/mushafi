import SwiftUI
import WidgetKit

// MARK: - Timeline

struct PrayerTime: Hashable {
    let key: String
    let name: String
    let at: Date
    /// Sunrise is listed with the prayers but never counted as one.
    let isPrayer: Bool

    var icon: String {
        switch key {
        case "fajr": return "sun.haze.fill"
        case "sunrise": return "sunrise.fill"
        case "dhuhr": return "sun.max.fill"
        case "asr": return "sun.min.fill"
        case "maghrib": return "sunset.fill"
        default: return "moon.stars.fill"
        }
    }
}

struct PrayerEntry: TimelineEntry {
    let date: Date
    let configured: Bool
    let city: String
    let zone: TimeZone
    /// Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha of the prayer day that holds `next`.
    let today: [PrayerTime]
    let next: PrayerTime?
    let previous: PrayerTime?
    let following: PrayerTime?

    /// Within 30 minutes after an adhan.
    var sinceAdhan: PrayerTime? {
        guard let previous, date.timeIntervalSince(previous.at) < PrayerEntry.afterWindow else { return nil }
        return previous
    }

    static let afterWindow: TimeInterval = 30 * 60

    /// Interval used by progress rings: previous adhan → next adhan.
    var interval: ClosedRange<Date>? {
        guard let next else { return nil }
        let start = previous?.at ?? next.at.addingTimeInterval(-6 * 3600)
        return start < next.at ? start...next.at : nil
    }
}

struct PrayerProvider: TimelineProvider {
    /// Also refresh 30 minutes after each adhan (prayer counter, adhkar period).
    var afterAdhan = false

    func placeholder(in context: Context) -> PrayerEntry { Self.sample() }
    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        let live = Self.entries(afterAdhan: afterAdhan).first
        completion(context.isPreview && live?.configured != true ? Self.sample() : (live ?? Self.sample()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let entries = Self.entries(afterAdhan: afterAdhan)
        let refresh = entries.last.map { $0.date.addingTimeInterval(60) } ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }

    static let rowKeys = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
    static func rowName(_ key: String) -> String {
        switch key {
        case "fajr": return WidgetText.t("الفجر")
        case "sunrise": return WidgetText.t("الشروق")
        case "dhuhr": return WidgetText.t("الظهر")
        case "asr": return WidgetText.t("العصر")
        case "maghrib": return WidgetText.t("المغرب")
        default: return WidgetText.t("العشاء")
        }
    }

    static func sample(now: Date = Date()) -> PrayerEntry {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: now)
        let minutes = [4 * 60 + 38, 6 * 60 + 1, 11 * 60 + 41, 14 * 60 + 47, 17 * 60 + 13, 18 * 60 + 43]
        var rows = zip(rowKeys, minutes).map { key, minute in
            PrayerTime(key: key, name: rowName(key), at: start.addingTimeInterval(Double(minute) * 60), isPrayer: key != "sunrise")
        }
        if !rows.contains(where: { $0.isPrayer && $0.at > now }) {
            rows = rows.map { PrayerTime(key: $0.key, name: $0.name, at: $0.at.addingTimeInterval(86_400), isPrayer: $0.isPrayer) }
        }
        let prayers = rows.filter(\.isPrayer)
        let next = prayers.first { $0.at > now }
        let previous = prayers.last { $0.at <= now }
        let following = next.flatMap { n in prayers.first { $0.at > n.at } }
        return PrayerEntry(date: now, configured: true, city: WidgetText.t("مكة المكرمة"), zone: .current,
                           today: rows, next: next, previous: previous, following: following)
    }

    /// One entry now, one at every adhan (and 30 min after it), and one after midnight.
    static func entries(now: Date = Date(), afterAdhan: Bool = false) -> [PrayerEntry] {
        let settings = PrayerSettings.load()
        let zone = settings.timezone
        let city = settings.string("city")
        let empty = [PrayerEntry(date: now, configured: false, city: city, zone: zone, today: [], next: nil, previous: nil, following: nil)]
        guard (settings.json["confirmed"] as? Bool) == true else { return empty }

        var days: [[PrayerTime]] = []
        for add in -1...2 {
            guard let day = try? PrayerCalculator.calculate(settings, PrayerCalculator.day(settings, now: now, add: add)) else { continue }
            let rows: [PrayerTime] = rowKeys.compactMap { key in
                guard let ms = day[key] as? Int64 else { return nil }
                return PrayerTime(key: key, name: rowName(key), at: Date(timeIntervalSince1970: TimeInterval(ms) / 1000), isPrayer: key != "sunrise")
            }
            if !rows.isEmpty { days.append(rows) }
        }
        let prayers = days.flatMap { $0 }.filter(\.isPrayer)
        guard !prayers.isEmpty else { return empty }

        let horizon = now.addingTimeInterval(86_400)
        var moments: Set<Date> = [now, WidgetText.nextMidnight(after: now)]
        for prayer in prayers {
            if prayer.at > now && prayer.at < horizon { moments.insert(prayer.at) }
            let after = prayer.at.addingTimeInterval(PrayerEntry.afterWindow)
            if afterAdhan && after > now && after < horizon { moments.insert(after) }
        }
        return moments.sorted().map { moment in
            let next = prayers.first { $0.at > moment }
            let previous = prayers.last { $0.at <= moment }
            let following = next.flatMap { n in prayers.first { $0.at > n.at } }
            let list = days.first { day in day.contains { $0.isPrayer && $0.at > moment } } ?? days.last ?? []
            return PrayerEntry(date: moment, configured: true, city: city, zone: zone,
                               today: list, next: next, previous: previous, following: following)
        }
    }
}

// MARK: - Shared pieces

struct NotConfiguredView: View {
    @Environment(\.widgetFamily) private var family
    var theme: WidgetTheme = .emerald

    var body: some View {
        if family.isAccessory {
            HStack(spacing: 4) {
                Image(systemName: "location.circle")
                Text(WidgetText.t("افتح مصحفي لتحديد الموقع")).font(.caption2).lineLimit(2)
            }
            .accessoryContainer()
        } else {
            VStack(spacing: 8) {
                Image(systemName: "location.circle.fill").font(.title2).foregroundStyle(theme.accent)
                Text(WidgetText.t("افتح مصحفي لمراجعة الموقع والمواقيت"))
                    .font(WidgetFont.ui(12, .medium)).foregroundStyle(theme.ink)
                    .multilineTextAlignment(.center)
            }
            .widgetTheme(theme)
        }
    }
}

/// Countdown text that always shows a leading "-" free, monospaced clock.
struct Countdown: View {
    let to: Date
    var size: CGFloat = 13
    var weight: Font.Weight = .semibold
    var body: some View {
        Text(to, style: .timer)
            .font(WidgetFont.number(size, weight))
            .monospacedDigit()
            .multilineTextAlignment(.leading)
    }
}

struct PrayerRow: View {
    let prayer: PrayerTime
    let highlighted: Bool
    let zone: TimeZone
    let theme: WidgetTheme
    var size: CGFloat = 12
    var showIcon = true

    var body: some View {
        HStack(spacing: 6) {
            if showIcon {
                Image(systemName: prayer.icon).font(.system(size: size - 2)).frame(width: size + 4)
                    .foregroundStyle(highlighted ? theme.top : theme.accent.opacity(0.85))
            }
            Text(prayer.name).font(WidgetFont.ui(size, highlighted ? .bold : .regular))
            Spacer(minLength: 4)
            Text(WidgetText.time(prayer.at, zone: zone)).font(WidgetFont.number(size, highlighted ? .bold : .medium)).monospacedDigit()
        }
        .lineLimit(1)
        .padding(.horizontal, 7)
        .padding(.vertical, size > 13 ? 4 : 2.5)
        .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(highlighted ? theme.accent : Color.clear))
        .foregroundStyle(highlighted ? theme.top : theme.ink)
    }
}

// MARK: - Next prayer

struct NextPrayerView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry
    private let theme = WidgetTheme.emerald

    var body: some View {
        Group {
            if !entry.configured || entry.next == nil {
                NotConfiguredView(theme: theme)
            } else if let next = entry.next {
                switch family {
                case .accessoryInline:
                    Text("\(next.name) \(WidgetText.time(next.at, zone: entry.zone))").accessoryContainer()
                case .accessoryCircular:
                    circular(next).accessoryContainer()
                case .accessoryRectangular:
                    rectangular(next).accessoryContainer()
                case .systemMedium:
                    HStack(spacing: 12) {
                        headline(next).frame(maxWidth: .infinity, alignment: .leading)
                        table(size: 11).frame(maxWidth: 158)
                    }
                    .widgetTheme(theme)
                case .systemLarge:
                    large(next).widgetTheme(theme)
                default:
                    headline(next).widgetTheme(theme)
                }
            }
        }
        .widgetChrome("prayer")
    }

    private func circular(_ next: PrayerTime) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            if let range = entry.interval {
                ProgressView(timerInterval: range, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.circular)
                    .widgetAccentable()
            }
            VStack(spacing: 0) {
                Image(systemName: next.icon).font(.system(size: 10, weight: .semibold)).widgetAccentable()
                Text(next.name).font(WidgetFont.ui(11, .bold)).minimumScaleFactor(0.6).lineLimit(1)
                Text(WidgetText.shortTime(next.at, zone: entry.zone)).font(WidgetFont.number(10, .medium)).minimumScaleFactor(0.6)
            }
            .padding(6)
        }
    }

    private func rectangular(_ next: PrayerTime) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: next.icon).font(.system(size: 11, weight: .semibold)).widgetAccentable()
                Text(WidgetText.t("الصلاة القادمة")).font(WidgetFont.ui(11))
                    .foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(next.name).font(WidgetFont.ui(19, .bold)).widgetAccentable()
                Spacer(minLength: 2)
                Text(WidgetText.time(next.at, zone: entry.zone)).font(WidgetFont.number(14, .semibold))
            }
            HStack(spacing: 4) {
                Text(WidgetText.t("بعد")).font(WidgetFont.ui(11)).foregroundStyle(.secondary)
                Countdown(to: next.at, size: 13)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func headline(_ next: PrayerTime) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            WidgetHeader(icon: next.icon, title: WidgetText.t("الصلاة القادمة"), theme: theme)
            Spacer(minLength: 0)
            Text(next.name).font(WidgetFont.ui(28, .bold)).foregroundStyle(theme.accent)
                .minimumScaleFactor(0.6).lineLimit(1)
            Text(WidgetText.time(next.at, zone: entry.zone)).font(WidgetFont.number(17, .semibold)).foregroundStyle(theme.ink)
            Countdown(to: next.at, size: 13, weight: .medium).foregroundStyle(theme.muted)
            if let range = entry.interval {
                ProgressView(timerInterval: range, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.linear)
                    .tint(theme.accent)
                    .padding(.top, 2)
            }
            Text(entry.city).font(WidgetFont.ui(10)).foregroundStyle(theme.muted).lineLimit(1)
        }
    }

    private func table(size: CGFloat) -> some View {
        VStack(spacing: 1) {
            ForEach(entry.today, id: \.self) { prayer in
                PrayerRow(prayer: prayer, highlighted: prayer == entry.next, zone: entry.zone, theme: theme, size: size)
            }
        }
    }

    private func large(_ next: PrayerTime) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "EEEEdMMMMy"))
                        .font(WidgetFont.ui(13, .semibold)).foregroundStyle(theme.ink)
                    Text(WidgetText.formatted(entry.date, .gregorian, "dMMMMy"))
                        .font(WidgetFont.ui(11)).foregroundStyle(theme.muted)
                }
                Spacer()
                Chip(text: entry.city, theme: theme, icon: "location.fill")
            }
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(WidgetText.t("الصلاة القادمة")).font(WidgetFont.ui(11)).foregroundStyle(theme.muted)
                    Text(next.name).font(WidgetFont.ui(30, .bold)).foregroundStyle(theme.accent)
                    Text(WidgetText.time(next.at, zone: entry.zone)).font(WidgetFont.number(16)).foregroundStyle(theme.ink)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(WidgetText.t("متبقي")).font(WidgetFont.ui(11)).foregroundStyle(theme.muted)
                    Countdown(to: next.at, size: 22, weight: .bold).foregroundStyle(theme.ink)
                        .multilineTextAlignment(.trailing)
                }
                .frame(maxWidth: 130, alignment: .trailing)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.chip))
            table(size: 14)
            Spacer(minLength: 0)
        }
    }
}

struct NextPrayerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiNextPrayer", provider: PrayerProvider()) { entry in
            NextPrayerView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("الصلاة القادمة"))
        .description(WidgetText.t("الصلاة القادمة مع عدّ تنازلي حي"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Prayer times (all six)

struct PrayerTimesView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry
    private let theme = WidgetTheme.midnight

    var body: some View {
        Group {
            if !entry.configured || entry.today.isEmpty {
                NotConfiguredView(theme: theme)
            } else {
                switch family {
                case .accessoryRectangular:
                    threeColumns.accessoryContainer()
                case .systemMedium:
                    medium.widgetTheme(theme)
                default:
                    small.widgetTheme(theme)
                }
            }
        }
        .widgetChrome("prayer")
    }

    /// Previous · next · following, the next one highlighted.
    private var threeColumns: some View {
        let items = [entry.previous, entry.next, entry.following].compactMap { $0 }
        return HStack(spacing: 2) {
            ForEach(items, id: \.self) { prayer in
                let isNext = prayer == entry.next
                VStack(spacing: 1) {
                    Text(prayer.name).font(WidgetFont.ui(11, isNext ? .bold : .regular)).lineLimit(1).minimumScaleFactor(0.7)
                    Text(WidgetText.shortTime(prayer.at, zone: entry.zone)).font(WidgetFont.number(13, isNext ? .bold : .medium))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isNext ? Color.white.opacity(0.28) : Color.clear))
                .widgetAccentable(isNext)
            }
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 2) {
            WidgetHeader(icon: "clock.fill", title: WidgetText.t("مواقيت الصلاة"), theme: theme)
                .padding(.bottom, 2)
            ForEach(entry.today, id: \.self) { prayer in
                PrayerRow(prayer: prayer, highlighted: prayer == entry.next, zone: entry.zone, theme: theme, size: 11, showIcon: false)
            }
            Spacer(minLength: 0)
        }
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                WidgetHeader(icon: "clock.fill", title: entry.city.isEmpty ? WidgetText.t("مواقيت الصلاة") : entry.city, theme: theme)
                if let next = entry.next {
                    HStack(spacing: 3) {
                        Text(next.name).font(WidgetFont.ui(11, .semibold)).foregroundStyle(theme.accent)
                        Countdown(to: next.at, size: 11).foregroundStyle(theme.ink).frame(maxWidth: 60)
                    }
                }
            }
            HStack(spacing: 4) {
                ForEach(entry.today, id: \.self) { prayer in
                    let isNext = prayer == entry.next
                    VStack(spacing: 5) {
                        Image(systemName: prayer.icon).font(.system(size: 13))
                            .foregroundStyle(isNext ? theme.top : theme.accent)
                        Text(prayer.name).font(WidgetFont.ui(11, isNext ? .bold : .medium)).lineLimit(1).minimumScaleFactor(0.7)
                        Text(WidgetText.shortTime(prayer.at, zone: entry.zone)).font(WidgetFont.number(13, .bold))
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(isNext ? theme.top : theme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isNext ? theme.accent : theme.chip))
                }
            }
            .frame(maxHeight: .infinity)
        }
    }
}

struct PrayerTimesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiPrayerTimes", provider: PrayerProvider()) { entry in
            PrayerTimesView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("مواقيت الصلاة"))
        .description(WidgetText.t("مواقيت اليوم مع إبراز الصلاة القادمة"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// MARK: - Six times in two columns (Lock Screen)

struct PrayerTableView: View {
    let entry: PrayerEntry

    var body: some View {
        Group {
            if !entry.configured || entry.today.isEmpty {
                NotConfiguredView()
            } else {
                let rows = entry.today
                let half = (rows.count + 1) / 2
                HStack(spacing: 8) {
                    column(Array(rows.prefix(half)))
                    column(Array(rows.dropFirst(half)))
                }
                .accessoryContainer()
            }
        }
        .widgetChrome("prayer")
    }

    private func column(_ rows: [PrayerTime]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(rows, id: \.self) { prayer in
                let isNext = prayer == entry.next
                HStack(spacing: 3) {
                    Text(prayer.name).font(WidgetFont.ui(11, isNext ? .heavy : .regular))
                    Spacer(minLength: 2)
                    Text(WidgetText.shortTime(prayer.at, zone: entry.zone)).font(WidgetFont.number(12, isNext ? .heavy : .regular))
                }
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .opacity(isNext ? 1 : 0.78)
                .widgetAccentable(isNext)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct PrayerTableWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiPrayerTable", provider: PrayerProvider()) { entry in
            PrayerTableView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("جدول المواقيت"))
        .description(WidgetText.t("المواقيت الست في عمودين على شاشة القفل"))
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Prayer counter (before / after the adhan)

struct PrayerCounterView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry
    private let theme = WidgetTheme.ink
    private let done = Color(hex: 0x7FD3A0)

    var body: some View {
        Group {
            if !entry.configured || entry.next == nil {
                NotConfiguredView(theme: theme)
            } else {
                switch family {
                case .accessoryCircular: circular.accessoryContainer()
                case .accessoryRectangular: rectangular.accessoryContainer()
                default: small.widgetTheme(theme)
                }
            }
        }
        .widgetChrome("prayer")
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                if let passed = entry.sinceAdhan {
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).widgetAccentable()
                    Text(passed.name).font(WidgetFont.ui(10, .bold)).lineLimit(1).minimumScaleFactor(0.6)
                    Text(passed.at, style: .timer).font(WidgetFont.number(10)).monospacedDigit()
                        .multilineTextAlignment(.center).minimumScaleFactor(0.5)
                } else if let next = entry.next {
                    Image(systemName: next.icon).font(.system(size: 10, weight: .semibold)).widgetAccentable()
                    Text(next.name).font(WidgetFont.ui(10, .bold)).lineLimit(1).minimumScaleFactor(0.6)
                    Text(next.at, style: .timer).font(WidgetFont.number(10)).monospacedDigit()
                        .multilineTextAlignment(.center).minimumScaleFactor(0.5)
                }
            }
            .padding(5)
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let passed = entry.sinceAdhan {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill").widgetAccentable()
                    Text(WidgetText.t("أُذّن لصلاة {0}", passed.name)).font(WidgetFont.ui(12, .bold))
                }
                HStack(spacing: 4) {
                    Text(WidgetText.t("منذ")).font(WidgetFont.ui(11)).foregroundStyle(.secondary)
                    Countdown(to: passed.at, size: 16, weight: .bold)
                }
                if let next = entry.next {
                    Text(WidgetText.t("ثم {0} {1}", next.name, WidgetText.time(next.at, zone: entry.zone)))
                        .font(WidgetFont.ui(10)).foregroundStyle(.secondary)
                }
            } else if let next = entry.next {
                HStack(spacing: 4) {
                    Image(systemName: "hourglass").widgetAccentable()
                    Text(WidgetText.t("متبقي على {0}", next.name)).font(WidgetFont.ui(12, .bold))
                }
                Countdown(to: next.at, size: 20, weight: .bold)
                Text(WidgetText.time(next.at, zone: entry.zone)).font(WidgetFont.number(11, .medium)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let passed = entry.sinceAdhan {
                WidgetHeader(icon: "checkmark.seal.fill", title: WidgetText.t("حان وقت الصلاة"), theme: theme)
                Spacer(minLength: 0)
                Text(passed.name).font(WidgetFont.ui(26, .bold)).foregroundStyle(done)
                Text(WidgetText.t("مضى على الأذان")).font(WidgetFont.ui(11)).foregroundStyle(theme.muted)
                Countdown(to: passed.at, size: 24, weight: .bold).foregroundStyle(theme.ink)
                ProgressView(timerInterval: passed.at...passed.at.addingTimeInterval(PrayerEntry.afterWindow),
                             countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.linear).tint(done)
            } else if let next = entry.next {
                WidgetHeader(icon: "hourglass", title: WidgetText.t("متبقي على الأذان"), theme: theme)
                Spacer(minLength: 0)
                Text(next.name).font(WidgetFont.ui(26, .bold)).foregroundStyle(theme.accent)
                Text(WidgetText.time(next.at, zone: entry.zone)).font(WidgetFont.number(12, .medium)).foregroundStyle(theme.muted)
                Countdown(to: next.at, size: 24, weight: .bold).foregroundStyle(theme.ink)
                if let range = entry.interval {
                    ProgressView(timerInterval: range, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                        .progressViewStyle(.linear).tint(theme.accent)
                }
            }
        }
    }
}

struct PrayerCounterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiPrayerCounter", provider: PrayerProvider(afterAdhan: true)) { entry in
            PrayerCounterView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("عدّاد الصلاة"))
        .description(WidgetText.t("عدّ تنازلي قبل الأذان، ثم الوقت المنقضي بعده لمدة نصف ساعة"))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}
