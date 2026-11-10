import SwiftUI
import WidgetKit

// Home Screen and Lock Screen widgets for مصحفي.
// Prayer times come from the same PrayerSettings / PrayerCalculator code the app uses,
// reading the settings the app stores in the shared App Group.
//
// Files:
//   MushafiWidgets.swift   – bundle, themes, fonts, shared helpers
//   PrayerWidgets.swift    – timeline provider + prayer widgets
//   CalendarWidgets.swift  – date, day name, moon phase, occasions
//   DevotionWidgets.swift  – verse, remembrance, timed adhkar, duas, last page

@main
struct MushafiWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextPrayerWidget()
        PrayerTimesWidget()
        PrayerTableWidget()
        PrayerCounterWidget()
        TimedAdhkarWidget()
        DailyVerseWidget()
        DailyDhikrWidget()
        MoreMushafiWidgets().body
    }
}

struct MoreMushafiWidgets: WidgetBundle {
    var body: some Widget {
        DuaWidget()
        LastPageWidget()
        DateWidget()
        DayNameWidget()
        MoonWidget()
        OccasionWidget()
    }
}

// MARK: - Themes

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// Fixed palettes so every widget keeps its character in light and dark mode.
struct WidgetTheme {
    let top: Color
    let bottom: Color
    let ink: Color
    let muted: Color
    let accent: Color
    let chip: Color

    static let emerald = WidgetTheme(top: Color(hex: 0x0F4A3A), bottom: Color(hex: 0x05231B),
                                     ink: .white, muted: Color.white.opacity(0.66),
                                     accent: Color(hex: 0xE4C47F), chip: Color.white.opacity(0.10))
    static let midnight = WidgetTheme(top: Color(hex: 0x1C2747), bottom: Color(hex: 0x080D1C),
                                      ink: .white, muted: Color.white.opacity(0.62),
                                      accent: Color(hex: 0xE9CE91), chip: Color.white.opacity(0.09))
    static let sand = WidgetTheme(top: Color(hex: 0xFBF5E8), bottom: Color(hex: 0xEBDDBF),
                                  ink: Color(hex: 0x3B2A12), muted: Color(hex: 0x3B2A12, opacity: 0.6),
                                  accent: Color(hex: 0x9C6A1C), chip: Color(hex: 0x9C6A1C, opacity: 0.12))
    static let plum = WidgetTheme(top: Color(hex: 0x4A2140), bottom: Color(hex: 0x1F0C1B),
                                  ink: .white, muted: Color.white.opacity(0.64),
                                  accent: Color(hex: 0xF1CDA2), chip: Color.white.opacity(0.10))
    static let ink = WidgetTheme(top: Color(hex: 0x23211D), bottom: Color(hex: 0x0E0D0B),
                                 ink: Color(hex: 0xF5EEDD), muted: Color(hex: 0xF5EEDD, opacity: 0.6),
                                 accent: Color(hex: 0xD9B56A), chip: Color.white.opacity(0.08))
}

/// Eight-pointed star (two overlapping squares) used as a quiet ornament.
struct EightStar: Shape {
    func path(in rect: CGRect) -> Path {
        let side = min(rect.width, rect.height) / 1.41421356
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path()
        for rotation in [0.0, Double.pi / 4] {
            var corners: [CGPoint] = []
            for index in 0..<4 {
                let angle = rotation + Double.pi / 4 + Double(index) * Double.pi / 2
                let radius = side / 2 * 1.41421356
                corners.append(CGPoint(x: center.x + CGFloat(cos(angle)) * radius,
                                       y: center.y + CGFloat(sin(angle)) * radius))
            }
            path.addLines(corners)
            path.closeSubpath()
        }
        return path
    }
}

struct ThemeBackground: View {
    let theme: WidgetTheme
    var body: some View {
        ZStack {
            LinearGradient(colors: [theme.top, theme.bottom], startPoint: .topLeading, endPoint: .bottomTrailing)
            GeometryReader { proxy in
                let size = max(proxy.size.width, proxy.size.height) * 0.9
                ZStack {
                    EightStar().stroke(theme.accent.opacity(0.14), lineWidth: 1)
                    EightStar().stroke(theme.accent.opacity(0.08), lineWidth: 1).scaleEffect(0.72)
                    Circle().stroke(theme.accent.opacity(0.07), lineWidth: 1).scaleEffect(0.5)
                }
                .frame(width: size, height: size)
                .position(x: proxy.size.width * 0.92, y: proxy.size.height * 0.08)
            }
        }
    }
}

extension View {
    /// Home Screen container: themed background (iOS 17 requires containerBackground).
    @ViewBuilder func widgetTheme(_ theme: WidgetTheme) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { ThemeBackground(theme: theme) }
        } else {
            padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(ThemeBackground(theme: theme))
        }
    }

    /// Lock Screen container: the system draws the material, we only satisfy iOS 17.
    @ViewBuilder func accessoryContainer() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { Color.clear }
        } else {
            self
        }
    }

    /// Direction, locale (Arabic digits in timers) and deep link shared by every widget.
    func widgetChrome(_ link: String) -> some View {
        self
            .environment(\.layoutDirection, WidgetText.layout)
            .environment(\.locale, WidgetText.locale)
            .widgetURL(URL(string: "mushafi-app://open/\(link)"))
    }
}

extension WidgetFamily {
    var isAccessory: Bool {
        switch self {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline: return true
        default: return false
        }
    }
}

// MARK: - Fonts (bundled with the extension, registered through UIAppFonts)

enum WidgetFont {
    /// Amiri Quran – verses, duas and calligraphic headings.
    static func quran(_ size: CGFloat) -> Font { .custom("AmiriQuran-Regular", size: size) }
    /// Noto Naskh Arabic – remembrance text.
    static func naskh(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        Font.custom("NotoNaskhArabic-Regular", size: size).weight(weight)
    }
    /// Interface text: Noto Sans Arabic for Arabic/Urdu, the system font otherwise.
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        WidgetText.arabicScript
            ? Font.custom("NotoSansArabic-Regular", size: size).weight(weight)
            : .system(size: size, weight: weight, design: .rounded)
    }
    /// Numbers and clocks.
    static func number(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

// MARK: - Text helpers

enum WidgetText {
    static var language: String { UiLanguage.current }
    static var arabicScript: Bool { language == "ar" || language == "ur" }
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

    /// Clock without the AM/PM marker, for tight layouts.
    static func shortTime(_ date: Date, zone: TimeZone) -> String {
        let f = DateFormatter()
        f.locale = locale
        f.timeZone = zone
        f.setLocalizedDateFormatFromTemplate("hmm")
        let text = f.string(from: date)
        return text
            .replacingOccurrences(of: f.amSymbol, with: "")
            .replacingOccurrences(of: f.pmSymbol, with: "")
            .trimmingCharacters(in: .whitespaces)
    }

    static func number(_ value: Int) -> String {
        let f = NumberFormatter()
        f.locale = locale
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }

    static func formatted(_ date: Date, _ calendar: Calendar.Identifier, _ template: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: calendar)
        f.locale = locale
        f.setLocalizedDateFormatFromTemplate(template)
        return f.string(from: date)
    }

    /// Arabic weekday name regardless of interface language (used for calligraphy).
    static func arabicWeekday(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.dateFormat = "EEEE"
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

    /// Changes every `hours` hours (used for rotating duas and remembrance).
    static func slotIndex(_ count: Int, hours: Int, at date: Date = Date()) -> Int {
        guard count > 0 else { return 0 }
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: date)
        return (dailyIndex(10_000, at: date) * (24 / max(1, hours)) + hour / max(1, hours)) % count
    }

    static func nextMidnight(after date: Date = Date()) -> Date {
        let calendar = Calendar.current
        return calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date))?.addingTimeInterval(1) ?? date.addingTimeInterval(3600)
    }

    /// Start of the next `hours`-hour slot.
    static func nextSlot(hours: Int, after date: Date = Date()) -> Date {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: date)
        let hour = calendar.component(.hour, from: date)
        let next = (hour / hours + 1) * hours
        return calendar.date(byAdding: .hour, value: next, to: start)?.addingTimeInterval(1) ?? date.addingTimeInterval(3600)
    }
}

// MARK: - Clear / Tinted Home Screen support
//
// In "Clear" and "Tinted" modes (iOS 18+) the system removes the container background and
// renders content as a single tint using each view's alpha. Solid fills with contrasting text
// would turn into blank blocks there, so highlights switch to a translucent pill and the
// important parts are marked accentable.

struct Highlight: ViewModifier {
    @Environment(\.widgetRenderingMode) private var mode
    let on: Bool
    let theme: WidgetTheme
    var radius: CGFloat = 8

    func body(content: Content) -> some View {
        let full = mode == .fullColor
        content
            .foregroundStyle(on && full ? theme.top : theme.ink)
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(on ? (full ? theme.accent : Color.white.opacity(0.2)) : Color.clear))
            .widgetAccentable(on && !full)
    }
}

extension View {
    func highlight(_ on: Bool, _ theme: WidgetTheme, radius: CGFloat = 8) -> some View {
        modifier(Highlight(on: on, theme: theme, radius: radius))
    }
}

/// Small rounded label used across widgets.
struct Chip: View {
    let text: String
    let theme: WidgetTheme
    var icon: String? = nil
    var body: some View {
        HStack(spacing: 3) {
            if let icon { Image(systemName: icon).font(.system(size: 9, weight: .semibold)) }
            Text(text).font(WidgetFont.ui(10, .semibold)).lineLimit(1)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Capsule().fill(theme.chip))
        .foregroundStyle(theme.accent)
        .widgetAccentable()
    }
}

/// Header row: icon + caption.
struct WidgetHeader: View {
    let icon: String
    let title: String
    let theme: WidgetTheme
    var trailing: String? = nil
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 10, weight: .semibold)).foregroundStyle(theme.accent)
                .widgetAccentable()
            Text(title).font(WidgetFont.ui(11, .medium)).foregroundStyle(theme.muted).lineLimit(1)
            Spacer(minLength: 2)
            if let trailing {
                Text(trailing).font(WidgetFont.ui(10)).foregroundStyle(theme.muted).lineLimit(1)
            }
        }
    }
}
