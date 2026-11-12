import AVFoundation
import CoreText
import FirebaseFirestore
import UIKit
import UserNotifications

/// Full-screen incoming ring for صحبة الفجر (iOS twin of Android's WakeCallActivity).
/// Shown when the ring notification is tapped, or straight away if the app is open.
final class WakeCallViewController: UIViewController {
    private static weak var current: WakeCallViewController?

    private let callId: String
    private let name: String
    private var player: AVAudioPlayer?
    private var listener: ListenerRegistration?
    private var finished = false

    // MARK: - Presenting

    /// Shows the ring screen if that call is still ringing.
    static func show(callId: String?, name: String?) {
        guard let callId, callId.range(of: "^[A-Za-z0-9]{10,40}$", options: .regularExpression) != nil else { return }
        if let shown = current, shown.callId == callId { return }
        Firestore.firestore().collection("wakeCalls").document(callId).getDocument { snap, _ in
            let data = snap?.data() ?? [:]
            guard data["state"] as? String == "ringing" else { return }
            if let created = (data["createdAt"] as? Timestamp)?.dateValue(),
               Date().timeIntervalSince(created) > WakeClient.ringSeconds + 5 { return }
            let caller = (name?.isEmpty == false ? name : data["fromName"] as? String) ?? ""
            DispatchQueue.main.async { present(callId: callId, name: caller, tries: 8) }
        }
    }

    /// On a cold launch the app window may not be ready yet, so wait for it briefly.
    private static func present(callId: String, name: String, tries: Int) {
        guard current == nil else { return }
        guard let top = topController(), top.view.window != nil, !top.isBeingPresented, !top.isBeingDismissed else {
            if tries > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { present(callId: callId, name: name, tries: tries - 1) } }
            return
        }
        let vc = WakeCallViewController(callId: callId, name: name)
        vc.modalPresentationStyle = .fullScreen
        vc.modalTransitionStyle = .crossDissolve
        current = vc
        top.present(vc, animated: true)
    }

    /// Closes the ring screen when the call ended elsewhere.
    static func close(callId: String?) {
        guard let shown = current, callId == nil || shown.callId == callId else { return }
        shown.finish(nil)
    }

    static var isShowing: Bool { current != nil }

    private static func topController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first
        var top = window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    init(callId: String, name: String) {
        self.callId = callId
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.name = trimmed.isEmpty ? UiLanguage.text("صحبة الفجر") : trimmed
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        Self.current = self
        Self.registerFonts()
        view.semanticContentAttribute = UiLanguage.isRTL ? .forceRightToLeft : .forceLeftToRight
        buildUI()
        startRinging()
        listener = Firestore.firestore().collection("wakeCalls").document(callId).addSnapshotListener { [weak self] snap, _ in
            guard let state = snap?.data()?["state"] as? String, state != "ringing" else { return }
            self?.finish(nil)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + WakeClient.ringSeconds + 5) { [weak self] in self?.finish(nil) }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        cleanUp()
    }

    // MARK: - UI

    private let gold = UIColor(red: 0.902, green: 0.812, blue: 0.604, alpha: 1)
    private let ink = UIColor(red: 0.957, green: 0.918, blue: 0.824, alpha: 1)
    private let pulse = UIView()
    private let gradient = CAGradientLayer()

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        gradient.frame = view.bounds
    }

    private func buildUI() {
        gradient.colors = [UIColor(red: 0.043, green: 0.043, blue: 0.063, alpha: 1),
                           UIColor(red: 0.090, green: 0.086, blue: 0.122, alpha: 1),
                           UIColor(red: 0.165, green: 0.149, blue: 0.200, alpha: 1)].map(\.cgColor)
        gradient.frame = view.bounds
        view.layer.insertSublayer(gradient, at: 0)

        let kicker = label(UiLanguage.text("صحبة الفجر"), size: 15, color: gold, weight: .bold)

        let orb = UIView()
        pulse.backgroundColor = gold.withAlphaComponent(0.18)
        pulse.layer.cornerRadius = 100
        let face = label(Self.initials(name), size: 44, color: UIColor(red: 0.129, green: 0.106, blue: 0.071, alpha: 1), weight: .bold)
        let faceBg = CAGradientLayer()
        faceBg.colors = [UIColor(red: 0.941, green: 0.863, blue: 0.682, alpha: 1), UIColor(red: 0.788, green: 0.643, blue: 0.373, alpha: 1)].map(\.cgColor)
        faceBg.startPoint = CGPoint(x: 0, y: 0); faceBg.endPoint = CGPoint(x: 1, y: 1)
        faceBg.frame = CGRect(x: 0, y: 0, width: 128, height: 128)
        faceBg.cornerRadius = 64
        face.layer.insertSublayer(faceBg, at: 0)
        face.layer.cornerRadius = 64
        face.clipsToBounds = true
        for v in [pulse, face] { v.translatesAutoresizingMaskIntoConstraints = false; orb.addSubview(v) }

        let who = label(name, size: 30, color: ink, weight: .bold)
        who.numberOfLines = 2
        let sub = label(UiLanguage.text("يصحّيك للفجر"), size: 17, color: ink.withAlphaComponent(0.78), weight: .regular)
        let verse = label("﴿وَقُرْآنَ الْفَجْرِ إِنَّ قُرْآنَ الْفَجْرِ كَانَ مَشْهُودًا﴾", size: 19, color: gold.withAlphaComponent(0.75), weight: .regular)
        if let quran = Self.quranFont { verse.font = UIFont(name: quran, size: 21) }
        verse.numberOfLines = 0

        let decline = button(UiLanguage.text("رفض"), bg: UIColor(red: 0.706, green: 0.333, blue: 0.247, alpha: 1), fg: .white, symbol: "phone.down.fill") { [weak self] in self?.finish("declined") }
        let answer = button(UiLanguage.text("ردّ"), bg: gold, fg: UIColor(red: 0.129, green: 0.106, blue: 0.071, alpha: 1), symbol: "phone.fill") { [weak self] in self?.finish("answered") }
        let row = UIStackView(arrangedSubviews: [decline, answer])
        row.axis = .horizontal
        row.spacing = 90
        row.alignment = .top

        for v in [kicker, orb, who, sub, verse, row] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            kicker.topAnchor.constraint(equalTo: g.topAnchor, constant: 60),
            kicker.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            orb.topAnchor.constraint(equalTo: kicker.bottomAnchor, constant: 36),
            orb.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            orb.widthAnchor.constraint(equalToConstant: 200), orb.heightAnchor.constraint(equalToConstant: 200),
            pulse.centerXAnchor.constraint(equalTo: orb.centerXAnchor), pulse.centerYAnchor.constraint(equalTo: orb.centerYAnchor),
            pulse.widthAnchor.constraint(equalToConstant: 200), pulse.heightAnchor.constraint(equalToConstant: 200),
            face.centerXAnchor.constraint(equalTo: orb.centerXAnchor), face.centerYAnchor.constraint(equalTo: orb.centerYAnchor),
            face.widthAnchor.constraint(equalToConstant: 128), face.heightAnchor.constraint(equalToConstant: 128),
            who.topAnchor.constraint(equalTo: orb.bottomAnchor, constant: 26),
            who.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), who.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            sub.topAnchor.constraint(equalTo: who.bottomAnchor, constant: 6),
            sub.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            verse.topAnchor.constraint(equalTo: sub.bottomAnchor, constant: 22),
            verse.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), verse.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            row.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            row.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -48),
        ])

        if !UIAccessibility.isReduceMotionEnabled {
            pulse.transform = CGAffineTransform(scaleX: 0.7, y: 0.7)
            UIView.animate(withDuration: 1.6, delay: 0, options: [.repeat, .curveEaseOut]) {
                self.pulse.transform = CGAffineTransform(scaleX: 1.05, y: 1.05)
                self.pulse.alpha = 0
            }
        }
    }

    private func label(_ text: String, size: CGFloat, color: UIColor, weight: UIFont.Weight) -> UILabel {
        let l = UILabel()
        l.text = text
        l.textColor = color
        l.textAlignment = .center
        l.font = Self.uiFont.flatMap { UIFont(name: $0, size: size) }.map { weight == .bold ? Self.bold($0) : $0 } ?? .systemFont(ofSize: size, weight: weight)
        l.adjustsFontForContentSizeCategory = false
        return l
    }

    private func button(_ title: String, bg: UIColor, fg: UIColor, symbol: String, action: @escaping () -> Void) -> UIView {
        let circle = UIButton(type: .custom)
        circle.backgroundColor = bg
        circle.layer.cornerRadius = 38
        circle.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 30, weight: .semibold)), for: .normal)
        circle.tintColor = fg
        circle.accessibilityLabel = title
        circle.addAction(UIAction { _ in action() }, for: .touchUpInside)
        circle.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([circle.widthAnchor.constraint(equalToConstant: 76), circle.heightAnchor.constraint(equalToConstant: 76)])
        let caption = label(title, size: 15, color: ink.withAlphaComponent(0.86), weight: .bold)
        caption.isAccessibilityElement = false
        let stack = UIStackView(arrangedSubviews: [circle, caption])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 10
        return stack
    }

    private static func initials(_ name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        let a = words.first?.first.map(String.init) ?? "؟"
        let b = words.count > 1 ? (words[1].first.map(String.init) ?? "") : ""
        return a + b
    }

    // MARK: - Fonts from the shared web assets

    private static var uiFont: String?
    private static var quranFont: String?
    private static var fontsRegistered = false

    private static func registerFonts() {
        guard !fontsRegistered else { return }
        fontsRegistered = true
        uiFont = register("ui-arabic")
        quranFont = register("quran")
    }

    private static func register(_ file: String) -> String? {
        guard let url = Bundle.main.url(forResource: file, withExtension: "ttf", subdirectory: "assets"),
              let provider = CGDataProvider(url: url as CFURL), let font = CGFont(provider) else { return nil }
        CTFontManagerRegisterGraphicsFont(font, nil)
        return font.postScriptName as String?
    }

    private static func bold(_ font: UIFont) -> UIFont {
        font.fontDescriptor.withSymbolicTraits(.traitBold).map { UIFont(descriptor: $0, size: font.pointSize) } ?? font
    }

    // MARK: - Sound

    private func startRinging() {
        guard let url = Bundle.main.url(forResource: "wake-ring", withExtension: "caf") else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        player = try? AVAudioPlayer(contentsOf: url)
        player?.numberOfLoops = -1
        player?.play()
    }

    // MARK: - Ending

    private func finish(_ state: String?) {
        guard !finished else { return }
        finished = true
        cleanUp()
        Self.clearNotifications(callId)
        if let state {
            WakeClient.shared.respond(callId, state)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
        let thanks = state == "answered"
        presentingViewController?.dismiss(animated: true) {
            if thanks { WakeCallViewController.toast(UiLanguage.text("جزاك الله خيرًا، قم للصلاة")) }
        }
    }

    /// Removes this call's ring banner from Notification Center.
    static func clearNotifications(_ callId: String) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { notes in
            let ids = notes.filter { ($0.request.content.userInfo["callId"] as? String) == callId && ($0.request.content.userInfo["type"] as? String) == "wake" }
                .map(\.request.identifier)
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
    }

    private func cleanUp() {
        player?.stop(); player = nil
        listener?.remove(); listener = nil
        if Self.current === self { Self.current = nil }
    }

    private static func toast(_ text: String) {
        guard let top = topController() else { return }
        let alert = UIAlertController(title: nil, message: text, preferredStyle: .alert)
        top.present(alert, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) { alert.dismiss(animated: true) }
    }
}
