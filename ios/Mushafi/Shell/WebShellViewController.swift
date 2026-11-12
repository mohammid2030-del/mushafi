import UIKit
import WebKit
import WidgetKit

/// Hosts the shared Mushafi web UI full-screen, like Android's MainActivity.
final class WebShellViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private static let darkBackground = UIColor(red: 0x10 / 255, green: 0x10 / 255, blue: 0x13 / 255, alpha: 1)
    private static let lightBackground = UIColor(red: 0xF5 / 255, green: 0xF3 / 255, blue: 0xED / 255, alpha: 1)
    private static let themeKey = "mushafi.launchDark"

    private let bridge = NativeBridge()
    private let assets = AssetSchemeHandler(root: AssetSchemeHandler.bundledRoot())
    private var webView: WKWebView!
    private var launchCover: LaunchCurtain!
    private var backgroundedAt: Date?
    private var lastRouteAt = Date.distantPast
    private var darkTheme: Bool
    private var keyboardVisible = false
    private var launchTimeout: DispatchWorkItem?
    private(set) var windowInsetsJSON = "{\"top\":0,\"bottom\":0,\"density\":1}"

    init() {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: Self.themeKey) != nil {
            darkTheme = defaults.bool(forKey: Self.themeKey)
        } else {
            darkTheme = UITraitCollection.current.userInterfaceStyle == .dark
        }
        super.init(nibName: nil, bundle: nil)
        bridge.shell = self
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = currentBackground

        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: BridgeScript.source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(WeakScriptMessageHandler(bridge), name: BridgeScript.handlerName)

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(assets, forURLScheme: AssetSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.dataDetectorTypes = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        // The app has its own text-size controls; pinch or double-tap zoom only
        // leaves the page stuck half-zoomed.
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        // Top/bottom are edge-to-edge (the page pads itself from the insets we publish);
        // left/right follow the safe area so landscape notches never cover text.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
        ])

        installBackSwipe()

        launchCover = LaunchCurtain(dark: darkTheme, background: currentBackground)
        launchCover.frame = view.bounds
        launchCover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        launchCover.onRetry = { [weak self] in self?.webView.reload() }
        view.addSubview(launchCover)
        launchCover.show()

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow), name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide), name: UIResponder.keyboardWillHideNotification, object: nil)

        center.addObserver(self, selector: #selector(appBecameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appEnteredBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        center.addObserver(self, selector: #selector(publishWidgetState), name: UIApplication.willResignActiveNotification, object: nil)
        AppRouter.shared.onRoute = { [weak self] route in self?.route(route) }
        AppRouter.shared.onPageCallback = { [weak self] name in
            self?.lastRouteAt = Date()
            guard let self, self.pageIsReady else { return }
            self.callbackRaw(name, "")
        }

        let timeout = DispatchWorkItem { [weak self] in self?.pageReady() }
        launchTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: timeout)

        webView.load(URLRequest(url: AssetSchemeHandler.homeURL))
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishInsets()
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            guard let self else { return }
            self.bridge.orientationChanged(self.currentOrientation)
            self.publishInsets()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        bridge.viewDidDisappear()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if previous?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            callback("onNativeSystemThemeChanged", isSystemDark)
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        darkTheme ? .lightContent : .darkContent
    }

    /// While reading the Mushaf the status bar is hidden (like Android's immersive reader),
    /// so the page header no longer sits underneath the clock.
    var readingMode = false {
        didSet {
            guard readingMode != oldValue else { return }
            UIView.animate(withDuration: 0.2) { self.setNeedsStatusBarAppearanceUpdate() }
            setNeedsUpdateOfHomeIndicatorAutoHidden()
        }
    }
    override var prefersStatusBarHidden: Bool { readingMode }
    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }
    override var prefersHomeIndicatorAutoHidden: Bool { readingMode }

    // MARK: - Used by NativeBridge

    /// The app never overrides its interface style, so the trait collection is the system's.
    var isSystemDark: Bool {
        (view.window?.traitCollection ?? traitCollection).userInterfaceStyle == .dark
    }

    var currentOrientation: UIInterfaceOrientation {
        view.window?.windowScene?.interfaceOrientation ?? .portrait
    }

    func pageReady() {
        let firstReady = !pageIsReady
        pageIsReady = true
        launchTimeout?.cancel()
        launchTimeout = nil
        if firstReady {
            // Widget links that arrived before the page could handle them.
            for pending in AppRouter.pageRoutes where AppRouter.shared.consume(pending) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.runPageRoute(pending) }
                break
            }
        }
        launchCover.markReady()
    }

    func applyTheme(dark: Bool) {
        darkTheme = dark
        UserDefaults.standard.set(dark, forKey: Self.themeKey)
        view.backgroundColor = currentBackground
        launchCover?.setTheme(dark: dark, background: currentBackground)
        setNeedsStatusBarAppearanceUpdate()
    }

    func share(_ text: String) {
        let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        topPresenter.present(sheet, animated: true)
    }

    var topPresenter: UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController { top = next }
        return top
    }

    /// Calls `window.<name>(json)` with text that is already JSON (snapshots from services).
    func callbackRaw(_ name: String, _ json: String) {
        let script = "window.\(name)&&window.\(name)(\(json))"
        DispatchQueue.main.async { [weak self] in self?.webView?.evaluateJavaScript(script, completionHandler: nil) }
    }

    /// iOS has no in-app "add widget" API: explain the system gesture instead.
    func showWidgetHelp() {
        let alert = UIAlertController(
            title: UiLanguage.text("ويدجت الشاشة الرئيسية"),
            message: UiLanguage.text("اضغط مطولًا على الشاشة الرئيسية أو شاشة القفل، ثم اختر «تعديل» أو «تخصيص» واضغط (+) وابحث عن مصحفي. ستجد ويدجات الصلاة والعدّاد والتاريخ والقمر والمناسبات والأذكار والآيات وصفحة المصحف بأحجام مختلفة."),
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: UiLanguage.text("حسنًا"), style: .default))
        topPresenter.present(alert, animated: true)
    }

    private var pageIsReady = false

    private func route(_ route: String) {
        lastRouteAt = Date()
        guard pageIsReady else { return }   // the page consumes pending routes itself at start-up
        switch route {
        case "prayer": callbackRaw("openPrayerFromNotification", "")
        case "daily-verse", "daily-dhikr": callbackRaw("openDailyFromWidget", "")
        case "surah": callbackRaw("openSurahFromNotification", "")
        default:
            if AppRouter.pageRoutes.contains(route), AppRouter.shared.consume(route) { runPageRoute(route) }
        }
    }

    /// Opens a section of the web UI for a widget link, only if the page defines the function.
    private func runPageRoute(_ route: String) {
        let script: String
        if route == "reader" {
            script = "typeof showPage==='function'&&showPage(+localStorage.lastPage||1)"
        } else if route.hasPrefix("adhkar-") {
            let group = String(route.dropFirst("adhkar-".count))
            guard ["morning", "evening", "sleep", "quran", "prayer", "sunnah"].contains(group) else { return }
            script = "typeof duaHome==='function'&&duaHome('\(group)')"
        } else {
            return
        }
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    /// Publishes the reading position for the "Mushaf page" widget when the app leaves the foreground.
    @objc private func publishWidgetState() {
        guard pageIsReady, let webView else { return }
        let script = "(function(){try{var l=lastReading();return JSON.stringify({page:l.page,surah:String(l.name||''),juz:l.juz,started:!!localStorage.lastPage})}catch(e){return ''}})()"
        webView.evaluateJavaScript(script) { result, _ in
            guard let text = result as? String, let data = text.data(using: .utf8),
                  let state = try? JSONDecoder().decode(ReadingState.self, from: data) else { return }
            if WidgetStore.save(state) {
                WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.readingKind)
            }
        }
    }

    @objc private func appEnteredBackground() {
        backgroundedAt = Date()
    }

    /// After 10 minutes away the app greets the reader with the opening screen and starts on Home,
    /// like Android (AppForegroundPolicy). A notification or widget link still wins.
    @objc private func appWillEnterForeground() {
        guard let away = backgroundedAt else { return }
        backgroundedAt = nil
        guard Date().timeIntervalSince(away) > 600, pageIsReady, !WakeCallViewController.isShowing else { return }
        launchCover.show(ready: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            guard let self, Date().timeIntervalSince(self.lastRouteAt) > 2 else { return }
            self.callbackRaw("onMushafiResumeHome", "")
        }
    }

    @objc private func appBecameActive() {
        ReminderService.shared.enter()
        PrayerService.shared.refreshAuthorization { [weak self] in
            PrayerService.shared.schedule()
            ReminderService.shared.schedule()
            FajrCompanion.shared.schedule()
            self?.callbackRaw("onPrayerNativeChanged", "")
        }
    }

    /// Calls `window.<name>(args…)` if the page defines it.
    func callback(_ name: String, _ args: Any...) {
        let encoded = args.map(Self.jsonLiteral).joined(separator: ",")
        let script = "window.\(name)&&window.\(name)(\(encoded))"
        if Thread.isMainThread {
            webView?.evaluateJavaScript(script, completionHandler: nil)
        } else {
            DispatchQueue.main.async { [weak self] in self?.webView?.evaluateJavaScript(script, completionHandler: nil) }
        }
    }

    // MARK: - Insets

    private var currentBackground: UIColor {
        darkTheme ? Self.darkBackground : Self.lightBackground
    }

    private func publishInsets() {
        let safe = view.safeAreaInsets
        let bottom = keyboardVisible ? 0 : safe.bottom
        let snapshot = "{\"top\":\(Int(safe.top.rounded())),\"bottom\":\(Int(bottom.rounded())),\"density\":1}"
        guard snapshot != windowInsetsJSON else { return }
        windowInsetsJSON = snapshot
        webView?.evaluateJavaScript("window.onMushafiWindowInsets&&window.onMushafiWindowInsets(\(snapshot))", completionHandler: nil)
    }

    @objc private func keyboardWillShow(_ note: Notification) {
        keyboardVisible = true
        publishInsets()
    }

    @objc private func keyboardWillHide(_ note: Notification) {
        keyboardVisible = false
        publishInsets()
    }

    // MARK: - Navigation (only the app document may load, as on Android)

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if AssetSchemeHandler.isTrusted(url), url?.path == AssetSchemeHandler.homeURL.path {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.load(URLRequest(url: AssetSchemeHandler.homeURL))
    }

    // MARK: - JavaScript dialogs + synchronous bridge

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        if prompt == BridgeScript.syncMarker {
            completionHandler(bridge.handleSync(defaultText ?? "", from: frame))
            return
        }
        guard viewIfLoaded?.window != nil else { completionHandler(nil); return }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "موافق", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        topPresenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard viewIfLoaded?.window != nil else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "موافق", style: .default) { _ in completionHandler() })
        topPresenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard viewIfLoaded?.window != nil else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "موافق", style: .default) { _ in completionHandler(true) })
        topPresenter.present(alert, animated: true)
    }

    /// The page never opens new windows.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        nil
    }

    // MARK: - Helpers

    static func jsonLiteral(_ value: Any) -> String {
        if let bool = value as? Bool { return bool ? "true" : "false" }
        guard JSONSerialization.isValidJSONObject([value]),
              let data = try? JSONSerialization.data(withJSONObject: [value]),
              let text = String(data: data, encoding: .utf8) else { return "null" }
        return String(text.dropFirst().dropLast())   // strip the wrapping [ ]
    }
}


// MARK: - Swipe back (iOS edge gesture)

/// Swiping in from the leading edge goes back, like other iPhone apps (right edge in Arabic and
/// Urdu, left edge otherwise). It runs the same `handleNativeBack()` as Android's back gesture,
/// and the page follows the finger slightly so the gesture feels responsive. Back buttons stay.
extension WebShellViewController: UIGestureRecognizerDelegate {
    private static var backState: (canGoBack: Bool, active: Bool) = (false, false)

    fileprivate func installBackSwipe() {
        for edge in [UIRectEdge.left, .right] {
            let pan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleBackSwipe(_:)))
            pan.edges = edge
            pan.delegate = self
            view.addGestureRecognizer(pan)
        }
    }

    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let pan = gesture as? UIScreenEdgePanGestureRecognizer else { return true }
        guard pageIsReady, presentedViewController == nil else { return false }
        let backEdge: UIRectEdge = UiLanguage.isRTL ? .right : .left
        return pan.edges == backEdge
    }

    @objc fileprivate func handleBackSwipe(_ pan: UIScreenEdgePanGestureRecognizer) {
        let direction: CGFloat = pan.edges == .right ? -1 : 1
        let travel = max(0, pan.translation(in: view).x * direction)
        switch pan.state {
        case .began:
            Self.backState = (false, true)
            let probe = "(function(){try{if(document.querySelector('.first-tour,.verse-sheet,.verse-toolbar,.feature-sheet,.night-select-overlay'))return true;if(typeof activeSheet!=='undefined'&&activeSheet)return true;return !(view==='home'||(view==='onboarding'&&onboardingState&&onboardingState.step===0))}catch(e){return false}})()"
            webView.evaluateJavaScript(probe) { result, _ in Self.backState.canGoBack = (result as? Bool) == true }
        case .changed:
            guard Self.backState.canGoBack else { return }
            let offset = min(travel * 0.45, 110)
            webView.transform = CGAffineTransform(translationX: offset * direction, y: 0)
        case .ended, .cancelled, .failed:
            let velocity = pan.velocity(in: view).x * direction
            let commit = pan.state == .ended && Self.backState.canGoBack && (travel > 90 || velocity > 700)
            Self.backState.active = false
            if commit {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                webView.evaluateJavaScript("typeof window.handleNativeBack==='function'&&window.handleNativeBack()", completionHandler: nil)
            }
            UIView.animate(withDuration: commit ? 0.22 : 0.28, delay: 0, usingSpringWithDamping: 0.9, initialSpringVelocity: 0.4,
                           options: [.allowUserInteraction, .beginFromCurrentState]) {
                self.webView.transform = .identity
            }
        default:
            break
        }
    }
}
