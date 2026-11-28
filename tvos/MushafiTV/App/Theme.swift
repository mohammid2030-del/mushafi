import SwiftUI

/// Mushafi's palette: night (deep violet-black, warm gold, cream ink) and day (ivory, deep gold, dark ink).
/// Every colour follows the app's light/dark appearance, which changes with sunrise and maghrib.
enum Theme {
    static let gold = Color(light: (0.66, 0.48, 0.15), dark: (0.898, 0.769, 0.486))
    static let goldDeep = Color(red: 0.725, green: 0.561, blue: 0.227)
    static let ink = Color(light: (0.165, 0.129, 0.086), dark: (0.957, 0.918, 0.839))
    static let muted = Color(light: (0.50, 0.435, 0.333), dark: (0.64, 0.59, 0.49))
    static let card = Color(light: (1, 1, 1, 0.62), dark: (1, 1, 1, 0.06))
    static let line = Color(light: (0.55, 0.41, 0.18, 0.16), dark: (1, 1, 1, 0.09))
    /// Fill and text of a focused pill (cream on night, dark ink on day).
    static let focusFill = Color(light: (0.165, 0.129, 0.086), dark: (0.957, 0.918, 0.839))
    static let focusText = Color(light: (0.97, 0.94, 0.88), dark: (0, 0, 0))
    static let pill = Color(light: (1, 1, 1, 0.72), dark: (1, 1, 1, 0.10))
    static let pillProminent = Color(light: (1, 1, 1, 0.9), dark: (1, 1, 1, 0.16))
    static let shadow = Color(light: (0.43, 0.31, 0.12, 0.28), dark: (0, 0, 0, 0.5))
    static let panel = Color(light: (1, 1, 1, 0.55), dark: (0, 0, 0, 0.28))
    static let dark = Color(red: 0.09, green: 0.08, blue: 0.06)
    /// Frosted glass cards (not see-through): thick material, a milky tint and a bright hairline edge.
    static let glassTint = Color(light: (1, 0.992, 0.97, 0.62), dark: (0.16, 0.15, 0.17, 0.62))
    static let glassEdge = Color(light: (1, 1, 1, 0.9), dark: (1, 1, 1, 0.14))
    static let goldGradient = LinearGradient(colors: [Color(red: 0.965, green: 0.89, blue: 0.68), Color(red: 0.79, green: 0.635, blue: 0.29)],
                                            startPoint: .topLeading, endPoint: .bottomTrailing)

    static func quran(_ size: CGFloat) -> Font { .custom("Amiri Quran", size: size) }
}

extension Color {
    /// A colour that resolves differently in light and dark appearance.
    init(light: (Double, Double, Double), dark: (Double, Double, Double)) {
        self.init(light: (light.0, light.1, light.2, 1), dark: (dark.0, dark.1, dark.2, 1))
    }
    init(light: (Double, Double, Double, Double), dark: (Double, Double, Double, Double)) {
        self.init(uiColor: UIColor { trait in
            let c = trait.userInterfaceStyle == .light ? light : dark
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
    }
}

/// Arabic-Indic digits for numbers shown in Arabic text.
extension Int {
    var ar: String { String(self).arDigits }
}

extension String {
    /// Arabic-Indic digits (٠١٢…) whatever the device's number setting.
    var arDigits: String {
        String(map { c in
            guard let d = c.wholeNumberValue, c.isASCII else { return c }
            return Character(UnicodeScalar(0x0660 + d)!)
        })
    }
}

extension Date {
    /// «6:34» in the prayer's time zone, Latin digits like the phone app.
    func clock(_ zone: TimeZone) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = "h:mm"
        return f.string(from: self)
    }
}

// MARK: - Focus styles (the focused item lifts and turns gold or cream, like Apple TV)

struct PillButtonStyle: ButtonStyle {
    var prominent = false
    func makeBody(configuration: Configuration) -> some View { Styled(configuration: configuration, prominent: prominent) }

    private struct Styled: View {
        let configuration: ButtonStyleConfiguration
        let prominent: Bool
        @Environment(\.isFocused) private var focused
        var body: some View {
            configuration.label
                .font(.system(size: 27, weight: .bold))
                .padding(.horizontal, 36)
                .frame(height: 72)
                .foregroundStyle(focused ? Theme.focusText : Theme.ink)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(focused ? AnyShapeStyle(Theme.focusFill) : AnyShapeStyle(prominent ? Theme.pillProminent : Theme.pill)))
                .scaleEffect(configuration.isPressed ? 0.97 : (focused ? 1.06 : 1))
                .shadow(color: focused ? Theme.shadow : .clear, radius: 18, y: 12)
                .animation(.easeOut(duration: 0.16), value: focused)
        }
    }
}

struct TileButtonStyle: ButtonStyle {
    var radius: CGFloat = 26
    func makeBody(configuration: Configuration) -> some View { Styled(configuration: configuration, radius: radius) }

    private struct Styled: View {
        let configuration: ButtonStyleConfiguration
        let radius: CGFloat
        @Environment(\.isFocused) private var focused
        var body: some View {
            configuration.label
                .foregroundStyle(focused ? Color.black : Theme.ink)
                .environment(\.tileFocused, focused)
                .background(RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(focused ? AnyShapeStyle(Theme.goldGradient) : AnyShapeStyle(.thickMaterial)))
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(focused ? Color.clear : Theme.glassTint))
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(focused ? .clear : Theme.glassEdge, lineWidth: 1.2))
                .scaleEffect(configuration.isPressed ? 0.98 : (focused ? 1.07 : 1))
                .shadow(color: focused ? Theme.shadow : .clear, radius: 26, y: 18)
                .animation(.easeOut(duration: 0.16), value: focused)
        }
    }
}

private struct TileFocusedKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// True inside a focused tile, so secondary text can switch to a dark tone.
    var tileFocused: Bool {
        get { self[TileFocusedKey.self] }
        set { self[TileFocusedKey.self] = newValue }
    }
}

/// Secondary text that stays readable on both the dark tile and the gold focused tile.
struct SubText: View {
    let text: String
    var size: CGFloat = 21
    @Environment(\.tileFocused) private var focused
    init(_ text: String, size: CGFloat = 21) { self.text = text; self.size = size }
    var body: some View {
        Text(text).font(.system(size: size, weight: .medium))
            .foregroundStyle(focused ? Color.black.opacity(0.62) : Theme.muted)
    }
}

struct SectionTitle: View {
    let title: String
    var detail: String? = nil
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            Text(title).font(.system(size: 29, weight: .heavy)).foregroundStyle(Theme.ink)
            if let detail { Text(detail).font(.system(size: 21, weight: .medium)).foregroundStyle(Theme.muted) }
            Spacer()
        }
    }
}

struct Eyebrow: View {
    let text: String
    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(Theme.gold).frame(width: 9, height: 9)
            Text(text).font(.system(size: 23, weight: .heavy)).foregroundStyle(Theme.gold)
        }
    }
}

/// The reciter's photo (same portraits as the phone app) in a round frame, or a gold monogram if none.
struct Monogram: View {
    let name: String
    var id: String? = nil
    var size: CGFloat = 170
    var active = false
    var body: some View {
        Group {
            if let id, let photo = Library.shared.portrait(id) {
                Image(uiImage: photo).resizable().scaledToFill()
                    .frame(width: size, height: size, alignment: .top)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(active ? AnyShapeStyle(Theme.goldGradient) : AnyShapeStyle(Theme.gold.opacity(0.35)), lineWidth: active ? 5 : 1.5))
            } else {
                Text(String(name.first ?? "م"))
                    .font(.system(size: size * 0.36, weight: .heavy))
                    .foregroundStyle(active ? Color.black : Theme.gold)
                    .frame(width: size, height: size)
                    .background(Circle().fill(active ? AnyShapeStyle(Theme.goldGradient)
                                                     : AnyShapeStyle(LinearGradient(colors: [Color(light: (1, 0.97, 0.9), dark: (0.23, 0.2, 0.15)), Color(light: (0.93, 0.87, 0.74), dark: (0.11, 0.1, 0.075))],
                                                                                    startPoint: .topLeading, endPoint: .bottomTrailing))))
                    .overlay(Circle().stroke(Theme.gold.opacity(active ? 0 : 0.3), lineWidth: 1))
            }
        }
        .frame(width: size, height: size)
    }
}

/// Small animated bars shown next to whatever is playing.
struct Equalizer: View {
    var color: Color = Theme.gold
    var playing = true
    @State private var phase = false
    private static let up: [CGFloat] = [18, 30, 12, 26, 20]
    private static let down: [CGFloat] = [28, 14, 24, 10, 30]
    private static let rest: [CGFloat] = [12, 22, 30, 18, 10]
    private func height(_ i: Int) -> CGFloat { playing ? (phase ? Self.up[i] : Self.down[i]) : Self.rest[i] }
    var body: some View {
        HStack(alignment: .bottom, spacing: 5) {
            ForEach(0..<5, id: \.self) { i in
                Capsule().fill(color).frame(width: 6, height: height(i))
            }
        }
        .frame(height: 32, alignment: .bottom)
        .animation(playing ? .easeInOut(duration: 0.45).repeatForever(autoreverses: true) : .default, value: phase)
        .onAppear { phase.toggle() }
    }
}

extension View {
    /// Frosted glass panel used by the big cards (now playing, live radio).
    func glassPanel(radius: CGFloat = 36) -> some View {
        background(
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(.thickMaterial)
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Theme.glassTint)
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(RadialGradient(colors: [Theme.gold.opacity(0.16), .clear], center: UnitPoint(x: 0.9, y: 0.15), startRadius: 0, endRadius: 700))
            }
        )
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.glassEdge, lineWidth: 1.2))
        .shadow(color: Theme.shadow.opacity(0.35), radius: 30, y: 16)
    }
}
