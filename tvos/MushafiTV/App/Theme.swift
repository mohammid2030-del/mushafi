import SwiftUI

/// Mushafi's night palette: deep violet-black, warm gold, cream ink.
enum Theme {
    static let gold = Color(red: 0.898, green: 0.769, blue: 0.486)
    static let goldDeep = Color(red: 0.725, green: 0.561, blue: 0.227)
    static let ink = Color(red: 0.957, green: 0.918, blue: 0.839)
    static let muted = Color(red: 0.64, green: 0.59, blue: 0.49)
    static let card = Color.white.opacity(0.06)
    static let line = Color.white.opacity(0.09)
    static let dark = Color(red: 0.09, green: 0.08, blue: 0.06)
    static let goldGradient = LinearGradient(colors: [Color(red: 0.965, green: 0.89, blue: 0.68), Color(red: 0.79, green: 0.635, blue: 0.29)],
                                            startPoint: .topLeading, endPoint: .bottomTrailing)

    static func quran(_ size: CGFloat) -> Font { .custom("Amiri Quran", size: size) }
}

/// Screen background shared by every tab.
struct NightBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.106, green: 0.094, blue: 0.133), Color(red: 0.071, green: 0.063, blue: 0.09),
                                    Color(red: 0.051, green: 0.043, blue: 0.063)], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Theme.gold.opacity(0.16), .clear], center: UnitPoint(x: 0.78, y: 0.28), startRadius: 0, endRadius: 900)
        }
        .ignoresSafeArea()
    }
}

/// Arabic-Indic digits for numbers shown in Arabic text.
extension Int {
    var ar: String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "ar")
        return f.string(from: NSNumber(value: self)) ?? String(self)
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
    func makeBody(configuration: Configuration) -> some View { Body(configuration: configuration, prominent: prominent) }

    private struct Body: View {
        let configuration: ButtonStyleConfiguration
        let prominent: Bool
        @Environment(\.isFocused) private var focused
        var body: some View {
            configuration.label
                .font(.system(size: 27, weight: .bold))
                .padding(.horizontal, 36)
                .frame(height: 72)
                .foregroundStyle(focused ? Color.black : Theme.ink)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(focused ? AnyShapeStyle(Theme.ink) : AnyShapeStyle(Color.white.opacity(prominent ? 0.16 : 0.1))))
                .scaleEffect(configuration.isPressed ? 0.97 : (focused ? 1.06 : 1))
                .shadow(color: .black.opacity(focused ? 0.45 : 0), radius: 18, y: 12)
                .animation(.easeOut(duration: 0.16), value: focused)
        }
    }
}

struct TileButtonStyle: ButtonStyle {
    var radius: CGFloat = 26
    func makeBody(configuration: Configuration) -> some View { Body(configuration: configuration, radius: radius) }

    private struct Body: View {
        let configuration: ButtonStyleConfiguration
        let radius: CGFloat
        @Environment(\.isFocused) private var focused
        var body: some View {
            configuration.label
                .foregroundStyle(focused ? Color.black : Theme.ink)
                .environment(\.tileFocused, focused)
                .background(RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(focused ? AnyShapeStyle(Theme.goldGradient) : AnyShapeStyle(Theme.card)))
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(focused ? .clear : Theme.line, lineWidth: 1))
                .scaleEffect(configuration.isPressed ? 0.98 : (focused ? 1.07 : 1))
                .shadow(color: .black.opacity(focused ? 0.55 : 0), radius: 26, y: 18)
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

/// Gold monogram for a reciter (first letter of the name; no photos).
struct Monogram: View {
    let name: String
    var size: CGFloat = 170
    var active = false
    var body: some View {
        Text(String(name.first ?? "م"))
            .font(.system(size: size * 0.36, weight: .heavy))
            .foregroundStyle(active ? Color.black : Theme.gold)
            .frame(width: size, height: size)
            .background(Circle().fill(active ? AnyShapeStyle(Theme.goldGradient)
                                             : AnyShapeStyle(LinearGradient(colors: [Color(red: 0.23, green: 0.2, blue: 0.15), Color(red: 0.11, green: 0.1, blue: 0.075)],
                                                                            startPoint: .topLeading, endPoint: .bottomTrailing))))
            .overlay(Circle().stroke(Theme.gold.opacity(active ? 0 : 0.3), lineWidth: 1))
    }
}

/// Small animated bars shown next to whatever is playing.
struct Equalizer: View {
    var color: Color = Theme.gold
    var playing = true
    @State private var phase = false
    private static let up: [CGFloat] = [18, 30, 12, 26, 20]
    private static let down: [CGFloat] = [28, 14, 24, 10, 30]
    private func height(_ i: Int) -> CGFloat { playing ? (phase ? Self.up[i] : Self.down[i]) : 8 }
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
