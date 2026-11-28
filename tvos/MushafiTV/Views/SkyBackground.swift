import SwiftUI

/// Screen background that follows the real sky: day or night, sun, clouds drifting, rain, snow, stars.
/// Calm on purpose: slow movement behind the content, never on top of it.
struct SkyBackground: View {
    @EnvironmentObject private var weather: WeatherModel
    @EnvironmentObject private var appearance: AppearanceModel

    var body: some View {
        let light = appearance.light, phase = appearance.phase, kind = weather.kind ?? .clear
        ZStack {
            LinearGradient(colors: Self.base(light: light, phase: phase, kind: kind), startPoint: .top, endPoint: .bottom)
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                Canvas { ctx, size in
                    let t = context.date.timeIntervalSinceReferenceDate
                    Self.draw(&ctx, size: size, t: t, light: light, phase: phase, kind: kind)
                }
            }
            // Dawn and dusk: deepen the bright horizon behind the cards so cream text stays readable.
            if !light && (phase == .dawn || phase == .dusk) {
                LinearGradient(stops: [.init(color: .clear, location: 0.35), .init(color: .black.opacity(0.42), location: 1)], startPoint: .top, endPoint: .bottom)
            }
        }
        .ignoresSafeArea()
        .environment(\.layoutDirection, .leftToRight)
        .animation(.easeInOut(duration: 2.5), value: light)
        .animation(.easeInOut(duration: 2.5), value: phase)
    }

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r, green: g, blue: b) }

    private static func hex(_ v: UInt32) -> Color { rgb(Double(v >> 16 & 255) / 255, Double(v >> 8 & 255) / 255, Double(v & 255) / 255) }

    /// Sky colours per moment of the day (the phone's home sky), greyer under clouds and rain.
    static func base(light: Bool, phase: SkyPhase, kind: WeatherModel.Kind) -> [Color] {
        let wet = kind == .rain || kind == .thunder, grey = wet || kind == .cloudy || kind == .fog || kind == .snow
        if light && !phase.light {
            // Light appearance fixed by the viewer outside daytime: keep the ivory screens.
            return wet ? [rgb(0.851, 0.867, 0.89), rgb(0.902, 0.902, 0.894), rgb(0.882, 0.863, 0.824)]
                       : [rgb(0.953, 0.918, 0.847), rgb(0.965, 0.937, 0.886), rgb(0.937, 0.894, 0.812)]
        }
        switch phase {
        case .dawn:
            return grey ? [hex(0x323a4e), hex(0x6b6b7c), hex(0xa99484)] : [hex(0x3b4a68), hex(0x8c8aa0), hex(0xe6b38e)]
        case .day:
            if wet { return [rgb(0.851, 0.867, 0.89), rgb(0.902, 0.902, 0.894), rgb(0.882, 0.863, 0.824)] }
            if grey { return [rgb(0.886, 0.89, 0.902), rgb(0.933, 0.922, 0.894), rgb(0.91, 0.882, 0.827)] }
            return kind == .partly ? [rgb(0.914, 0.922, 0.925), rgb(0.957, 0.933, 0.886), rgb(0.933, 0.89, 0.808)]
                                   : [rgb(0.953, 0.918, 0.847), rgb(0.965, 0.937, 0.886), rgb(0.937, 0.894, 0.812)]
        case .afternoon:
            return grey ? [hex(0xc9cbc6), hex(0xdcd3c0), hex(0xd9b997)] : [hex(0xc4cdbf), hex(0xe5d6b4), hex(0xefbf88)]
        case .dusk:
            return grey ? [hex(0x34324a), hex(0x6e5560), hex(0xa77a5e)] : [hex(0x3d3a5c), hex(0x8b5f6e), hex(0xd98c5f)]
        case .night:
            if wet { return [rgb(0.10, 0.114, 0.149), rgb(0.075, 0.082, 0.11), rgb(0.051, 0.055, 0.07)] }
            if grey { return [rgb(0.133, 0.133, 0.165), rgb(0.09, 0.086, 0.114), rgb(0.059, 0.055, 0.075)] }
            return [rgb(0.08, 0.086, 0.15), rgb(0.06, 0.063, 0.106), rgb(0.04, 0.04, 0.063)]
        }
    }

    private static func noise(_ i: Int) -> Double { let x = sin(Double(i) * 12.9898) * 43758.5453; return x - floor(x) }

    static func draw(_ ctx: inout GraphicsContext, size: CGSize, t: Double, light: Bool, phase: SkyPhase, kind: WeatherModel.Kind) {
        let w = size.width, h = size.height
        let sunny = kind == .clear || kind == .partly
        let day = phase == .day || phase == .afternoon
        // The sun walks down the sky through the day.
        let center: CGPoint = phase == .afternoon ? CGPoint(x: w * 0.32, y: h * 0.3) : CGPoint(x: w * 0.42, y: h * 0.2)

        // Low warm sun on the horizon at dusk, first light at dawn.
        if phase == .dusk || phase == .dawn {
            let p = phase == .dusk ? CGPoint(x: w * 0.24, y: h * 0.78) : CGPoint(x: w * 0.72, y: h * 1.02)
            let glow: Color = phase == .dusk ? Color(red: 1, green: 0.62, blue: 0.36) : Color(red: 1, green: 0.78, blue: 0.62)
            let r = w * (phase == .dusk ? 0.42 : 0.5)
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)),
                     with: .radialGradient(Gradient(colors: [glow.opacity(sunny ? 0.55 : 0.25), .clear]), center: p, startRadius: 0, endRadius: r))
            if phase == .dusk && sunny {
                let s: CGFloat = 120 + 4 * sin(t * 2 * .pi / 6)
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - s, y: p.y - s, width: s * 2, height: s * 2)),
                         with: .radialGradient(Gradient(stops: [.init(color: Color(red: 1, green: 0.86, blue: 0.62), location: 0),
                                                                .init(color: Color(red: 1, green: 0.6, blue: 0.35).opacity(0.6), location: 0.45),
                                                                .init(color: .clear, location: 1)]),
                                               center: p, startRadius: 0, endRadius: s))
            }
            if phase == .dawn && sunny {
                for i in 0..<60 {
                    let x = noise(i) * w, y = noise(i + 500) * h * 0.45
                    let tw = 0.5 + 0.5 * sin(t * (0.6 + noise(i + 900)) + noise(i + 1300) * 6)
                    let s = 2 + noise(i + 1700) * 2
                    ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: s, height: s)), with: .color(.white.opacity((0.2 + 0.5 * tw) * 0.5)))
                }
            }
        }

        // Sun with slowly turning rays, or moon with stars.
        if day && sunny {
            var rays = ctx
            rays.translateBy(x: center.x, y: center.y)
            rays.rotate(by: .radians(t * 2 * .pi / 120))
            for i in 0..<20 {
                var p = Path()
                let a = Double(i) / 20 * 2 * .pi
                p.move(to: .zero)
                p.addLine(to: CGPoint(x: cos(a - 0.03) * w * 0.45, y: sin(a - 0.03) * w * 0.45))
                p.addLine(to: CGPoint(x: cos(a + 0.03) * w * 0.45, y: sin(a + 0.03) * w * 0.45))
                p.closeSubpath()
                rays.fill(p, with: .radialGradient(Gradient(colors: [Color(red: 1, green: phase == .afternoon ? 0.76 : 0.85, blue: phase == .afternoon ? 0.45 : 0.55).opacity(light ? 0.22 : 0.14), .clear]),
                                                   center: .zero, startRadius: 0, endRadius: w * 0.4))
            }
            let pulse = 1 + 0.04 * sin(t * 2 * .pi / 6)
            let r = 300 * pulse
            ctx.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                     with: .radialGradient(Gradient(stops: [.init(color: Color(red: 1, green: 0.91, blue: 0.67), location: 0),
                                                            .init(color: Color(red: 1, green: 0.78, blue: 0.43).opacity(0.5), location: 0.3),
                                                            .init(color: .clear, location: 1)]),
                                           center: center, startRadius: 0, endRadius: r))
        } else if phase == .night && sunny {
            for i in 0..<90 {
                let x = noise(i) * w, y = noise(i + 500) * h * 0.6
                let tw = 0.5 + 0.5 * sin(t * (0.6 + noise(i + 900)) + noise(i + 1300) * 6)
                let s = 2 + noise(i + 1700) * 2.5
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: s, height: s)),
                         with: .color((light ? Color(red: 0.5, green: 0.45, blue: 0.35) : .white).opacity(0.25 + 0.65 * tw)))
            }
            let m = CGPoint(x: w * 0.42, y: h * 0.16), r: CGFloat = 46
            var moon = Path(ellipseIn: CGRect(x: m.x - r, y: m.y - r, width: r * 2, height: r * 2))
            moon = moon.subtracting(Path(ellipseIn: CGRect(x: m.x - r + 26, y: m.y - r - 14, width: r * 2, height: r * 2)))
            var glow = ctx
            glow.addFilter(.shadow(color: Color(red: 0.95, green: 0.92, blue: 0.82).opacity(0.7), radius: 26))
            glow.fill(moon, with: .color(Color(red: 0.95, green: 0.92, blue: 0.82)))
        }

        // Clouds: soft puffs drifting right to left, slowly.
        let cloudy: [(y: Double, size: Double, alpha: Double, speed: Double, seed: Double)]
        switch kind {
        case .partly: cloudy = [(0.16, 1.0, 0.30, 9, 0.1), (0.30, 0.65, 0.18, 6, 0.55), (0.06, 1.3, 0.12, 5, 0.8)]
        case .cloudy, .fog, .snow: cloudy = [(0.08, 1.5, 0.22, 7, 0.2), (0.2, 1.1, 0.2, 9, 0.6), (0.34, 0.9, 0.12, 6, 0.4), (-0.02, 1.9, 0.14, 4, 0.9), (0.44, 1.3, 0.08, 5, 0.05)]
        case .rain, .thunder: cloudy = [(0.02, 1.7, 0.24, 7, 0.3), (0.14, 1.3, 0.2, 9, 0.7), (-0.06, 2.1, 0.16, 5, 0.1)]
        case .clear: cloudy = []
        }
        if !cloudy.isEmpty {
            var layer = ctx
            layer.addFilter(.blur(radius: 18))
            let tone: Color = {
                if kind == .rain || kind == .thunder { return light ? Color(red: 0.68, green: 0.71, blue: 0.76) : Color(red: 0.55, green: 0.58, blue: 0.65) }
                if phase == .dusk { return Color(red: 0.96, green: 0.8, blue: 0.74) }
                if phase == .dawn { return Color(red: 0.92, green: 0.86, blue: 0.86) }
                return light ? .white : Color(red: 0.88, green: 0.87, blue: 0.93)
            }()
            for c in cloudy {
                let cw = 520 * c.size, span = w + cw * 2
                let x = span - (c.seed * span + t * c.speed).truncatingRemainder(dividingBy: span) - cw
                let y = h * c.y
                var puff = Path()
                puff.addRoundedRect(in: CGRect(x: x + cw * 0.06, y: y + cw * 0.2, width: cw * 0.88, height: cw * 0.2), cornerSize: CGSize(width: cw * 0.1, height: cw * 0.1))
                puff.addEllipse(in: CGRect(x: x + cw * 0.2, y: y + cw * 0.02, width: cw * 0.4, height: cw * 0.32))
                puff.addEllipse(in: CGRect(x: x + cw * 0.46, y: y + cw * 0.09, width: cw * 0.32, height: cw * 0.26))
                layer.fill(puff, with: .color(tone.opacity(light ? min(1, c.alpha * 2.6) : (phase == .dusk || phase == .dawn) ? min(1, c.alpha * 1.8) : c.alpha)))
            }
        }

        // Rain, snow, fog, lightning.
        if kind == .rain || kind == .thunder {
            let color = light ? Color(red: 0.37, green: 0.43, blue: 0.55).opacity(0.32) : Color(red: 0.75, green: 0.8, blue: 0.92).opacity(0.22)
            for i in 0..<140 {
                let speed = 700 + noise(i) * 500, len = 26 + noise(i + 40) * 22
                let x0 = noise(i + 200) * (w + 200)
                let y = (noise(i + 400) * h + t * speed).truncatingRemainder(dividingBy: h + 80) - 40
                let x = x0 - y * 0.27
                var p = Path(); p.move(to: CGPoint(x: x, y: y)); p.addLine(to: CGPoint(x: x - len * 0.27, y: y + len))
                ctx.stroke(p, with: .color(color.opacity(y > h * 0.75 ? 0.4 : 1)), lineWidth: 1.6)
            }
            if kind == .thunder, (t.truncatingRemainder(dividingBy: 9)) < 0.12 {
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(light ? 0.25 : 0.12)))
            }
        } else if kind == .snow {
            for i in 0..<110 {
                let y = (noise(i) * h + t * (40 + noise(i + 60) * 50)).truncatingRemainder(dividingBy: h + 20) - 10
                let x = noise(i + 300) * w + sin(t * 0.8 + Double(i)) * 18
                let s = 3 + noise(i + 700) * 4
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: s, height: s)), with: .color((light ? Color(red: 0.6, green: 0.65, blue: 0.75) : .white).opacity(0.6)))
            }
        } else if kind == .fog {
            var fog = ctx
            fog.addFilter(.blur(radius: 40))
            for i in 0..<4 {
                let y = h * (0.25 + Double(i) * 0.17), x = sin(t / 20 + Double(i)) * 120 - 200
                fog.fill(Path(roundedRect: CGRect(x: x, y: y, width: w + 400, height: 70), cornerRadius: 35),
                         with: .color((light ? Color.white : Color(red: 0.7, green: 0.7, blue: 0.78)).opacity(light ? 0.55 : 0.08)))
            }
        }
    }
}

/// «٢٤° غائم جزئيًا · الرياض» shown at the top of the home screen.
struct WeatherChip: View {
    @EnvironmentObject private var weather: WeatherModel
    @EnvironmentObject private var appearance: AppearanceModel
    @EnvironmentObject private var prayer: PrayerModel

    var body: some View {
        HStack(spacing: 14) {
            if weather.kind != nil {
                Image(systemName: weather.symbol(day: appearance.phase != .night))
                    .symbolRenderingMode(.multicolor)
                    .font(.system(size: 30, weight: .semibold))
                if let temp = weather.temperature {
                    Text("\(temp.ar)°").font(.system(size: 30, weight: .heavy)).foregroundStyle(Theme.ink)
                }
                Text(weather.label(day: appearance.phase != .night)).font(.system(size: 24, weight: .semibold)).foregroundStyle(Theme.muted)
                Circle().fill(Theme.gold).frame(width: 6, height: 6)
            }
            Image(systemName: "location.fill").font(.system(size: 18)).foregroundStyle(Theme.gold)
            Text(prayer.city).font(.system(size: 24, weight: .semibold)).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 24).frame(height: 58)
        .background(Capsule().fill(Theme.card))
        .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
    }
}

/// The bar around the tabs, laid out like the Android TV app: Mushafi's mark on the right,
/// weather, city and time on the left. Not focusable; it never takes the remote.
struct TopBar: View {
    @EnvironmentObject private var weather: WeatherModel
    @EnvironmentObject private var appearance: AppearanceModel
    @EnvironmentObject private var prayer: PrayerModel

    var body: some View {
        VStack {
            HStack(spacing: 16) {
                HStack(spacing: 16) {
                    Image("Logo").resizable().scaledToFit().frame(width: 60, height: 60)
                        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
                    Text("مصحفي").font(.system(size: 34, weight: .heavy)).foregroundStyle(Theme.gold)
                }
                Spacer()
                HStack(spacing: 14) {
                    if weather.kind != nil {
                        Image(systemName: weather.symbol(day: appearance.phase != .night))
                            .symbolRenderingMode(.multicolor).font(.system(size: 30, weight: .semibold))
                        if let temp = weather.temperature {
                            Text("\(temp.ar)°").font(.system(size: 28, weight: .heavy)).foregroundStyle(Theme.ink)
                        }
                        Text(weather.label(day: appearance.phase != .night)).font(.system(size: 22, weight: .medium)).foregroundStyle(Theme.muted)
                        Circle().fill(Theme.gold).frame(width: 5, height: 5)
                    }
                    Text(prayer.city).font(.system(size: 23, weight: .medium)).foregroundStyle(Theme.muted)
                    Circle().fill(Theme.gold).frame(width: 5, height: 5)
                    TimelineView(.periodic(from: .now, by: 20)) { context in
                        Text(context.date.clock(prayer.zone)).font(.system(size: 28, weight: .bold)).foregroundStyle(Theme.ink)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .lineLimit(1)
            }
            .padding(.horizontal, 90)
            .padding(.top, 44)
            Spacer()
        }
        .allowsHitTesting(false)
        .focusable(false)
    }
}
