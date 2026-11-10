import SwiftUI
import WidgetKit

// MARK: - Day timeline (refreshes after midnight)

struct DayEntry: TimelineEntry { let date: Date }

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) { completion(DayEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let now = Date()
        let midnight = WidgetText.nextMidnight(after: now)
        let second = WidgetText.nextMidnight(after: midnight)
        completion(Timeline(entries: [DayEntry(date: now), DayEntry(date: midnight), DayEntry(date: second)],
                            policy: .after(second.addingTimeInterval(60))))
    }
}

enum Hijri {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .islamicUmmAlQura)
        calendar.timeZone = .current
        return calendar
    }
    static func day(_ date: Date) -> Int { calendar.component(.day, from: date) }
    static func month(_ date: Date) -> Int { calendar.component(.month, from: date) }
}

// MARK: - Date (Hijri + Gregorian, with previous / next prayer on Medium)

struct DateWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry
    private let theme = WidgetTheme.midnight

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "EEEEdMMMM")).accessoryContainer()
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: -2) {
                        Text(WidgetText.number(Hijri.day(entry.date))).font(WidgetFont.number(22, .bold)).widgetAccentable()
                        Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "MMMM"))
                            .font(WidgetFont.ui(9, .semibold)).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .padding(4)
                }
                .accessoryContainer()
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 0) {
                    Text(WidgetText.formatted(entry.date, .gregorian, "EEEE")).font(WidgetFont.ui(12)).foregroundStyle(.secondary)
                    Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "dMMMMy")).font(WidgetFont.ui(16, .bold))
                        .lineLimit(1).minimumScaleFactor(0.7).widgetAccentable()
                    Text(WidgetText.formatted(entry.date, .gregorian, "dMMMMy")).font(WidgetFont.ui(12))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessoryContainer()
            case .systemMedium:
                HStack(spacing: 14) {
                    calendarBlock.frame(maxWidth: .infinity)
                    prayersBlock.frame(maxWidth: .infinity)
                }
                .widgetTheme(theme)
            default:
                calendarBlock.widgetTheme(theme)
            }
        }
        .widgetChrome("home")
    }

    private var calendarBlock: some View {
        VStack(spacing: 2) {
            Text(WidgetText.formatted(entry.date, .gregorian, "EEEE")).font(WidgetFont.ui(13, .semibold)).foregroundStyle(theme.accent)
            Text(WidgetText.number(Hijri.day(entry.date))).font(WidgetFont.number(46, .bold)).foregroundStyle(theme.ink)
                .minimumScaleFactor(0.6)
            Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "MMMMy")).font(WidgetFont.ui(13, .medium))
                .foregroundStyle(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
            Rectangle().fill(theme.accent.opacity(0.35)).frame(width: 36, height: 1).padding(.vertical, 3)
            Text(WidgetText.formatted(entry.date, .gregorian, "dMMMMy")).font(WidgetFont.ui(11)).foregroundStyle(theme.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder private var prayersBlock: some View {
        if entry.configured, let next = entry.next {
            VStack(alignment: .leading, spacing: 8) {
                if let previous = entry.previous {
                    prayerLine(WidgetText.t("السابقة"), previous, highlighted: false)
                }
                prayerLine(WidgetText.t("القادمة"), next, highlighted: true)
                Countdown(to: next.at, size: 13).foregroundStyle(theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(WidgetText.t("افتح مصحفي لمراجعة الموقع والمواقيت"))
                .font(WidgetFont.ui(11)).foregroundStyle(theme.muted).multilineTextAlignment(.center)
        }
    }

    private func prayerLine(_ title: String, _ prayer: PrayerTime, highlighted: Bool) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(WidgetFont.ui(10)).foregroundStyle(theme.muted)
            HStack(spacing: 6) {
                Image(systemName: prayer.icon).font(.system(size: 11)).foregroundStyle(theme.accent)
                Text(prayer.name).font(WidgetFont.ui(14, highlighted ? .bold : .regular))
                Spacer(minLength: 2)
                Text(WidgetText.time(prayer.at, zone: entry.zone)).font(WidgetFont.number(13, highlighted ? .bold : .medium))
            }
            .foregroundStyle(highlighted ? theme.accent : theme.ink)
        }
    }
}

struct DateWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDate", provider: PrayerProvider()) { entry in
            DateWidgetView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("التاريخ الهجري والميلادي"))
        .description(WidgetText.t("التاريخ بالتقويمين، ومعه الصلاة السابقة والقادمة"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Day name in calligraphy

struct DayNameView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DayEntry
    private let theme = WidgetTheme.sand

    private var dayName: String { WidgetText.arabicWeekday(entry.date) }

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Text(dayName).font(WidgetFont.quran(17)).minimumScaleFactor(0.5).lineLimit(1)
                        .padding(.horizontal, 5).widgetAccentable()
                }
                .accessoryContainer()
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    Text(dayName).font(WidgetFont.quran(28)).minimumScaleFactor(0.6).lineLimit(1).widgetAccentable()
                    VStack(alignment: .leading, spacing: 0) {
                        Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "dMMMM")).font(WidgetFont.ui(12, .semibold))
                        Text(WidgetText.formatted(entry.date, .gregorian, "dMMM")).font(WidgetFont.ui(11)).foregroundStyle(.secondary)
                    }
                    .lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
                .environment(\.layoutDirection, .rightToLeft)
                .accessoryContainer()
            default:
                VStack(spacing: 2) {
                    Spacer(minLength: 0)
                    Text(dayName).font(WidgetFont.quran(family == .systemMedium ? 54 : 40))
                        .foregroundStyle(theme.accent).minimumScaleFactor(0.5).lineLimit(1)
                    Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "dMMMMy")).font(WidgetFont.ui(12, .semibold))
                        .foregroundStyle(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(WidgetText.formatted(entry.date, .gregorian, "dMMMMy")).font(WidgetFont.ui(11))
                        .foregroundStyle(theme.muted).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .widgetTheme(theme)
            }
        }
        .widgetChrome("home")
    }
}

struct DayNameWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiDayName", provider: DayProvider()) { entry in
            DayNameView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("اسم اليوم بخط جميل"))
        .description(WidgetText.t("اسم اليوم بالخط العربي مع التاريخ الهجري"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Moon phase

enum MoonPhase {
    static let synodic = 29.530588853

    /// 0 = new moon, 0.5 = full moon.
    static func fraction(_ date: Date) -> Double {
        let julian = date.timeIntervalSince1970 / 86_400 + 2_440_587.5
        let age = (julian - 2_451_550.1).truncatingRemainder(dividingBy: synodic)
        return (age < 0 ? age + synodic : age) / synodic
    }

    static func illumination(_ date: Date) -> Int {
        Int(((1 - cos(2 * Double.pi * fraction(date))) / 2 * 100).rounded())
    }

    static func name(_ date: Date) -> String {
        let f = fraction(date)
        switch f {
        case ..<0.03, 0.97...: return WidgetText.t("محاق")
        case ..<0.22: return WidgetText.t("هلال")
        case ..<0.28: return WidgetText.t("التربيع الأول")
        case ..<0.47: return WidgetText.t("أحدب متزايد")
        case ..<0.53: return WidgetText.t("بدر")
        case ..<0.72: return WidgetText.t("أحدب متناقص")
        case ..<0.78: return WidgetText.t("التربيع الأخير")
        default: return WidgetText.t("هلال متناقص")
        }
    }
}

/// The lit part of the moon for a phase fraction (northern-hemisphere view).
struct MoonLitShape: Shape {
    let fraction: Double

    func path(in rect: CGRect) -> Path {
        let r = min(rect.width, rect.height) / 2
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let waxing = fraction <= 0.5
        let e = cos(2 * Double.pi * fraction)         // terminator x-scale
        let side: Double = waxing ? 1 : -1            // lit limb: right while waxing
        let steps = 48
        var points: [CGPoint] = []
        // Lit limb from top to bottom.
        for i in 0...steps {
            let phi = -Double.pi / 2 + Double.pi * Double(i) / Double(steps)
            points.append(CGPoint(x: c.x + CGFloat(side * cos(phi)) * r, y: c.y + CGFloat(sin(phi)) * r))
        }
        // Terminator from bottom back to top.
        for i in 0...steps {
            let phi = Double.pi / 2 - Double.pi * Double(i) / Double(steps)
            points.append(CGPoint(x: c.x + CGFloat(side * e * cos(phi)) * r, y: c.y + CGFloat(sin(phi)) * r))
        }
        var path = Path()
        path.addLines(points)
        path.closeSubpath()
        return path
    }
}

struct MoonDisc: View {
    let date: Date
    var lit: Color = Color(hex: 0xF4E7C3)
    var dark: Color = Color.white.opacity(0.12)
    var glow = true

    var body: some View {
        ZStack {
            Circle().fill(dark)
            MoonLitShape(fraction: MoonPhase.fraction(date)).fill(lit)
            Circle().stroke(lit.opacity(0.35), lineWidth: 0.6)
        }
        .aspectRatio(1, contentMode: .fit)
        .shadow(color: glow ? lit.opacity(0.35) : .clear, radius: 8)
    }
}

struct MoonView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DayEntry
    private let theme = WidgetTheme.midnight

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        MoonDisc(date: entry.date, lit: .white, dark: Color.white.opacity(0.2), glow: false)
                            .frame(width: 24, height: 24).widgetAccentable()
                        Text(WidgetText.number(Hijri.day(entry.date))).font(WidgetFont.number(13, .bold))
                    }
                }
                .accessoryContainer()
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    MoonDisc(date: entry.date, lit: .white, dark: Color.white.opacity(0.2), glow: false)
                        .frame(width: 38, height: 38).widgetAccentable()
                    VStack(alignment: .leading, spacing: 0) {
                        Text(MoonPhase.name(entry.date)).font(WidgetFont.ui(14, .bold))
                        Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "dMMMM")).font(WidgetFont.ui(12))
                        Text(WidgetText.t("الإضاءة {0}٪", WidgetText.number(MoonPhase.illumination(entry.date))))
                            .font(WidgetFont.ui(11)).foregroundStyle(.secondary)
                    }
                    .lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
                .accessoryContainer()
            default:
                VStack(spacing: 6) {
                    MoonDisc(date: entry.date).frame(width: family == .systemSmall ? 62 : 74)
                    Text(MoonPhase.name(entry.date)).font(WidgetFont.ui(14, .bold)).foregroundStyle(theme.accent)
                    Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "dMMMMy")).font(WidgetFont.ui(11))
                        .foregroundStyle(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(WidgetText.t("الإضاءة {0}٪", WidgetText.number(MoonPhase.illumination(entry.date))))
                        .font(WidgetFont.ui(10)).foregroundStyle(theme.muted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .widgetTheme(theme)
            }
        }
        .widgetChrome("home")
    }
}

struct MoonWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiMoon", provider: DayProvider()) { entry in
            MoonView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("أطوار القمر"))
        .description(WidgetText.t("طور القمر الليلة مع اليوم الهجري"))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Ramadan and Islamic occasions

struct Occasion {
    let name: String
    let date: Date
    let days: Int
}

enum Occasions {
    private static let list: [(month: Int, day: Int, name: String)] = [
        (9, 1, "رمضان"), (10, 1, "عيد الفطر"), (12, 1, "عشر ذي الحجة"), (12, 9, "يوم عرفة"),
        (12, 10, "عيد الأضحى"), (1, 1, "رأس السنة الهجرية"), (1, 10, "يوم عاشوراء"),
    ]

    static func next(after date: Date) -> Occasion? {
        let hijri = Hijri.calendar
        let gregorian = Calendar.current
        let today = gregorian.startOfDay(for: date)
        let year = hijri.component(.year, from: date)
        var best: Occasion?
        for item in list {
            for y in [year, year + 1] {
                guard let start = hijri.date(from: DateComponents(year: y, month: item.month, day: item.day)) else { continue }
                let day = gregorian.startOfDay(for: start)
                guard day >= today else { continue }
                let days = gregorian.dateComponents([.day], from: today, to: day).day ?? 0
                if best == nil || days < best!.days { best = Occasion(name: WidgetText.t(item.name), date: day, days: days) }
                break
            }
        }
        return best
    }

    /// Day of Ramadan and days left, or nil outside Ramadan.
    static func ramadan(_ date: Date) -> (day: Int, left: Int)? {
        let hijri = Hijri.calendar
        guard hijri.component(.month, from: date) == 9 else { return nil }
        let day = hijri.component(.day, from: date)
        let length = hijri.range(of: .day, in: .month, for: date)?.count ?? 30
        return (day, max(0, length - day))
    }
}

struct OccasionView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DayEntry
    private let theme = WidgetTheme.plum

    var body: some View {
        Group {
            if let ramadan = Occasions.ramadan(entry.date) {
                layout(title: WidgetText.t("رمضان مبارك"),
                       big: WidgetText.number(ramadan.day),
                       unit: WidgetText.t("من رمضان"),
                       detail: WidgetText.t("متبقي {0} يومًا على العيد", WidgetText.number(ramadan.left)),
                       icon: "moon.stars.fill")
            } else if let next = Occasions.next(after: entry.date) {
                layout(title: next.name,
                       big: next.days == 0 ? WidgetText.t("اليوم") : WidgetText.number(next.days),
                       unit: next.days == 0 ? "" : WidgetText.t("يومًا"),
                       detail: WidgetText.formatted(next.date, .islamicUmmAlQura, "dMMMMy"),
                       icon: next.name == WidgetText.t("رمضان") ? "moon.stars.fill" : "sparkles")
            } else {
                Text(WidgetText.formatted(entry.date, .islamicUmmAlQura, "dMMMMy")).accessoryContainer()
            }
        }
        .widgetChrome("home")
    }

    @ViewBuilder
    private func layout(title: String, big: String, unit: String, detail: String, icon: String) -> some View {
        switch family {
        case .accessoryInline:
            Text("\(title) · \(big) \(unit)").accessoryContainer()
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: -1) {
                    Image(systemName: icon).font(.system(size: 9, weight: .semibold)).widgetAccentable()
                    Text(big).font(WidgetFont.number(18, .bold)).minimumScaleFactor(0.5).lineLimit(1)
                    Text(title).font(WidgetFont.ui(8, .semibold)).lineLimit(1).minimumScaleFactor(0.5)
                }
                .padding(4)
            }
            .accessoryContainer()
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Image(systemName: icon).widgetAccentable()
                    Text(title).font(WidgetFont.ui(14, .bold)).lineLimit(1)
                }
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(big).font(WidgetFont.number(20, .bold)).widgetAccentable()
                    Text(unit).font(WidgetFont.ui(12))
                }
                Text(detail).font(WidgetFont.ui(11)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessoryContainer()
        default:
            VStack(alignment: .leading, spacing: 2) {
                WidgetHeader(icon: icon, title: WidgetText.t("المناسبة القادمة"), theme: theme)
                Spacer(minLength: 0)
                Text(title).font(WidgetFont.quran(24)).foregroundStyle(theme.accent).lineLimit(1).minimumScaleFactor(0.6)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(big).font(WidgetFont.number(36, .bold)).foregroundStyle(theme.ink).minimumScaleFactor(0.5)
                    Text(unit).font(WidgetFont.ui(13)).foregroundStyle(theme.muted)
                }
                Text(detail).font(WidgetFont.ui(11)).foregroundStyle(theme.muted).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetTheme(theme)
        }
    }
}

struct OccasionWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MushafiOccasions", provider: DayProvider()) { entry in
            OccasionView(entry: entry)
        }
        .configurationDisplayName(WidgetText.t("رمضان والمناسبات"))
        .description(WidgetText.t("عدّ تنازلي لرمضان والعيدين ويوم عرفة وعاشوراء"))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
