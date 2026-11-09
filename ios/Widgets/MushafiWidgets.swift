import SwiftUI
import WidgetKit

// Home-screen and Lock Screen widgets — iOS counterparts of MushafiWidget.java.
// Prayer times come from the same PrayerSettings / PrayerCalculator code the app uses,
// reading the settings the app stores in the shared App Group.

@main
struct MushafiWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextPrayerWidget()
        DateWidget()
        DailyVerseWidget()
        DailyDhikrWidget()
    }
}

// MARK: - Palette

enum WidgetPalette {
    static let gold = Color(red: 0.725, green: 0.604, blue: 0.361)
    static let goldLight = Color(red: 0.902, green: 0.812, blue: 0.604)
    static let night = Color(red: 0.063, green: 0.063, blue: 0.075)
    static let paper = Color(red: 0.961, green: 0.953, blue: 0.929)
}

struct WidgetBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        LinearGradient(colors: scheme == .dark
                       ? [WidgetPalette.night, Color(red: 0.11, green: 0.10, blue: 0.09)]
                       : [WidgetPalette.paper, Color(red: 0.93, green: 0.90, blue: 0.83)],
                       startPoint: .top, endPoint: .bottom)
    }
}

extension View {
    /// iOS 17 requires a container background; older systems draw it behind the content.
    @ViewBuilder func mushafiBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { WidgetBackground() }
        } else {
            background(WidgetBackground())
        }
    }
}

enum WidgetText {
    static var language: String { UiLanguage.current }
    static var locale: Locale { Locale(identifier: language) }
    static var layout: LayoutDirection { UiLanguage.isRTL ? .rightToLeft : .leftToRight }
    static func t(_ arabic: String, _ args: CustomStringConvertible...) -> String { UiLanguage.text(in: language, arabic, args) }

    static func time(_ date: Date, zone: TimeZone) -> String {
        let f = DateFormatter()
        f.locale = locale
        f.timeZone = zone
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: date)
    }

    /// Day index shared with Android: (year × 366 + day of year) mod count.
    static func dailyIndex(_ count: Int, at date: Date = Date()) -> Int {
        guard count > 0 else { return 0 }
        let calendar = Calendar(identifier: .gregorian)
        let year = calendar.component(.year, from: date)
        let day = calendar.ordinality(of: .day, in: .year, for: date) ?? 1
        return (year * 366 + day) % count
    }

    static func nextMidnight(after date: Date = Date()) -> Date {
        let calendar = Calendar.current
        return calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date))?.addingTimeInterval(1) ?? date.addingTimeInterval(3600)
    }
}

// MARK: - Next prayer

struct PrayerTime: Hashable {
    let key: String
    let name: String
    let at: Date
}

struct PrayerEntry: TimelineEntry {
    let date: Date
    let configured: Bool
    let city: String
    let zone: TimeZone
    let today: [PrayerTime]
    let next: PrayerTime?
}

struct PrayerProvider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerEntry { Self.sample }
    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        completion(context.isPreview ? Self.sample : (Self.entries().first ?? Self.sample))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let entries = Self.entries()
        let refresh = entries.last.map { $0.date.addingTimeInterval(60) } ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }

    static var sample: PrayerEntry {
        let now = Date()
        let names = PrayerSettings.names.map { WidgetText.t($0) }
        let times = PrayerSettings.keys.enumerated().map { PrayerTime(key: $1, name: names[$0], at: now.addingTimeInterval(Double($0 + 1) * 10_800)) }
        return PrayerEntry(date: now, configured: true, city: WidgetText.t("الرياض"), zone: .current, today: times, next: times.first)
    }

    /// One entry now and one at each prayer onset in the next ~24 hours.
    static func entries(now: Date = Date()) -> [PrayerEntry] {
        let settings = PrayerSettings.load()
        let zone = settings.timezone
        let city = settings.string("city")
        guard (settings.json["confirmed"] as? Bool) == true else {
            return [PrayerEntry(date: now, configured: false, city: city, zone: zone, today: [], next: nil)]
        }
        var days: [[PrayerTime]] = []
        for add in 0...2 {
            guard let day = try? PrayerCalculator.calculate(settings, PrayerCalculator.day(settings, now: now, add: add)) else { continue }
            days.append(PrayerSettings.keys.enumerated().compactMap { index, key in
                guard let ms = day[key] as? Int64 else { return nil }
                return PrayerTime(key: key, name: WidgetText.t(PrayerSettings.names[index]), at: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
            })
        }
        let all = days.flatMap { $0 }
        guard !all.isEmpty else { return [PrayerEntry(date: now, configured: false, city: city, zone: zone, today: [], next: nil)] }

        var moments = [now]
        moments += all.map(\.at).filter { $0 > now && $0 < now.addingTimeInterval(86_400) }
        return moments.map { moment in
            let next = all.first { $0.at > moment }
            // "Today" = the prayer day that contains the next prayer.
            let list = days.first { day in day.contains { $0.at > moment } } ?? days.last ?? []
            return PrayerEntry(date: moment, configured: true, city: city, zone: zone, today: list, next: next)
        }
    }
}

struct NextPrayerView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry

    var body: some View {
        content
            .environment(\.layoutDirection, WidgetText.layout)
            .widgetURL(URL(string: "mushafi-app://open/prayer"))
    }

    @ViewBuilder private var content: some View {
        if !entry.configured {
            VStack(spacing: 6) {
                Image(systemName: "location.circle").font(.title2).foregroundStyle(WidgetPalette.gold)
                Text(WidgetText.t("افتح مصحفي لمراجعة الموقع والمواقيت"))
                    .font(.caption).multilineTextAlignment(.center)
            }
            .mushafiBackground()
        } else {
            switch family {
            case .accessoryInline:
                if let next = entry.next {
                    Text("\(next.name) \(WidgetText.time(next.at, zone: entry.zone))")
                }
            case .accessoryRectangular:
                if let next = entry.next {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(WidgetText.t("الصلاة القادمة")).font(.caption2).foregroundStyle(.secondary)
                        Text(next.name).font(.headline)
                        Text(next.at, style: .timer).font(.caption).monospacedDigit()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            case .systemMedium:
                HStack(spacing: 14) {
                    headline.frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(entry.today, id: \.self) { prayer in
                            HStack {
                                Text(prayer.name).font(.caption)
                                    .fontWeight(prayer.key == entry.next?.key ? .bold : .regular)
                                Spacer(minLength: 6)
                                Text(WidgetText.time(prayer.at, zone: entry.zone)).font(.caption).monospacedDigit()
                            }
                            .foregroundStyle(prayer.key == entry.next?.key ? WidgetPalette.gold : Color.primary)
                        }
                    }
                    .frame(maxWidth: 150)
                }
                .padding(2)
                .mushafiBackground()
            default:
                headline.mushafiBackground()
            }
        }
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "moon.stars.fill").font(.caption2).foregroundStyle(WidgetPalette.gold)
                Text(WidgetText.t("الصلاة القادمة")).font(.caption2).foregroundStyle(.secondary)
            }
            if let next = entry.next {
                Text(next.name).font(.title2.weight(.bold)).foregroundStyle(WidgetPalette.gold)
                Text(WidgetText.time(next.at, zone: entry.zone)).font(.subheadline).monospacedDigit()
                Text(next.at, style: .timer).font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Text(entry.city).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

struct NextPrayerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiNextPrayer", provider: PrayerProvider()) { entry in
            NextPrayerView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("الصلاة القادمة"))
        .description(WidgetText.t("الصلاة والتاريخ وآية وذكر"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Hijri / Gregorian date

struct DateEntry: TimelineEntry { let date: Date }

struct DateProvider: TimelineProvider {
    func placeholder(in context: Context) -> DateEntry { DateEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (DateEntry) -> Void) { completion(DateEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DateEntry>) -> Void) {
        let midnight = WidgetText.nextMidnight()
        completion(Timeline(entries: [DateEntry(date: Date()), DateEntry(date: midnight)], policy: .after(midnight.addingTimeInterval(60))))
    }
}

struct DateWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DateEntry

    private func formatted(_ calendar: Calendar.Identifier, _ format: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: calendar)
        f.locale = WidgetText.locale
        f.setLocalizedDateFormatFromTemplate(format)
        return f.string(from: entry.date)
    }

    var body: some View {
        Group {
            if family == .accessoryInline {
                Text(formatted(.islamicUmmAlQura, "dMMMMy"))
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text(formatted(.gregorian, "EEEE")).font(.caption).foregroundStyle(.secondary)
                    Text(formatted(.islamicUmmAlQura, "dMMMM")).font(.title3.weight(.bold)).foregroundStyle(WidgetPalette.gold)
                    Text(formatted(.islamicUmmAlQura, "y")).font(.caption)
                    Spacer(minLength: 0)
                    Text(formatted(.gregorian, "dMMMMy")).font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .mushafiBackground()
            }
        }
        .environment(\.layoutDirection, WidgetText.layout)
        .widgetURL(URL(string: "mushafi-app://open/home"))
    }
}

struct DateWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDate", provider: DateProvider()) { entry in
            DateWidgetView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("التاريخ الهجري والميلادي"))
        .description(WidgetText.t("الصلاة والتاريخ وآية وذكر"))
        .supportedFamilies([.systemSmall, .accessoryInline])
    }
}

// MARK: - Daily verse / remembrance

struct DailyEntry: TimelineEntry {
    let date: Date
    let title: String
    let body: String
    let reference: String
}

enum DailyContent {
    static func verse(at date: Date = Date()) -> DailyEntry {
        let english = WidgetText.language != "ar"
        let title = english ? "Daily verse" : "آية اليوم"
        guard let data = SharedResources.json("widget-daily-verses") as? [String: Any],
              let order = data["order"] as? [String], !order.isEmpty,
              let texts = data[english ? "en" : "ar"] as? [String: String] else {
            return DailyEntry(date: date, title: title, body: "", reference: "")
        }
        let key = order[WidgetText.dailyIndex(order.count, at: date)]
        return DailyEntry(date: date, title: title, body: texts[key] ?? "", reference: key)
    }

    static func dhikr(at date: Date = Date()) -> DailyEntry {
        let english = WidgetText.language != "ar"
        let title = english ? "Daily remembrance" : "ذكر اليوم"
        guard let data = SharedResources.json("widget-adhkar") as? [String: Any],
              let items = data["entries"] as? [[String: Any]], !items.isEmpty else {
            return DailyEntry(date: date, title: title, body: "", reference: "")
        }
        let item = items[WidgetText.dailyIndex(items.count, at: date)]
        return DailyEntry(date: date, title: title,
                          body: (item[english ? "en" : "ar"] as? String) ?? "",
                          reference: (item[english ? "referenceEn" : "referenceAr"] as? String) ?? "")
    }
}

struct DailyProvider: TimelineProvider {
    let make: (Date) -> DailyEntry
    func placeholder(in context: Context) -> DailyEntry { make(Date()) }
    func getSnapshot(in context: Context, completion: @escaping (DailyEntry) -> Void) { completion(make(Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyEntry>) -> Void) {
        let midnight = WidgetText.nextMidnight()
        completion(Timeline(entries: [make(Date()), make(midnight)], policy: .after(midnight.addingTimeInterval(60))))
    }
}

struct DailyView: View {
    let entry: DailyEntry
    let link: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "sparkles").font(.caption2).foregroundStyle(WidgetPalette.gold)
                Text(entry.title).font(.caption2).foregroundStyle(.secondary)
            }
            Text(entry.body)
                .font(.system(.body, design: .serif))
                .minimumScaleFactor(0.6)
                .lineLimit(5)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            Text(entry.reference).font(.caption2).foregroundStyle(WidgetPalette.gold).lineLimit(1)
        }
        .environment(\.layoutDirection, WidgetText.layout)
        .mushafiBackground()
        .widgetURL(URL(string: link))
    }
}

struct DailyVerseWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDailyVerse", provider: DailyProvider(make: { DailyContent.verse(at: $0) })) { entry in
            DailyView(entry: entry, link: "mushafi-app://open/daily-verse")
        }
        .configurationDisplayName(WidgetText.t("آية اليوم"))
        .description(WidgetText.t("الصلاة والتاريخ وآية وذكر"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DailyDhikrWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDailyDhikr", provider: DailyProvider(make: { DailyContent.dhikr(at: $0) })) { entry in
            DailyView(entry: entry, link: "mushafi-app://open/daily-dhikr")
        }
        .configurationDisplayName(WidgetText.t("ذكر اليوم"))
        .description(WidgetText.t("الصلاة والتاريخ وآية وذكر"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
