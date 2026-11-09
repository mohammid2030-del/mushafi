import UIKit
import WebKit

/// Hosts the shared Mushafi web UI full-screen, like Android's MainActivity.
final class WebShellViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private static let darkBackground = UIColor(red: 0x10 / 255, green: 0x10 / 255, blue: 0x13 / 255, alpha: 1)
    private static let lightBackground = UIColor(red: 0xF5 / 255, green: 0xF3 / 255, blue: 0xED / 255, alpha: 1)
    private static let themeKey = "mushafi.launchDark"

    private let bridge = NativeBridge()
    private let assets = AssetSchemeHandler(root: AssetSchemeHandler.bundledRoot())
    private var webView: WKWebView!
    private let launchCover = UIView()
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

        launchCover.backgroundColor = currentBackground
        launchCover.frame = view.bounds
        launchCover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(launchCover)

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow), name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide), name: UIResponder.keyboardWillHideNotification, object: nil)

        center.addObserver(self, selector: #selector(appBecameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        AppRouter.shared.onRoute = { [weak self] route in self?.route(route) }

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

    // MARK: - Used by NativeBridge

    /// The app never overrides its interface style, so the trait collection is the system's.
    var isSystemDark: Bool {
        (view.window?.traitCollection ?? traitCollection).userInterfaceStyle == .dark
    }

    var currentOrientation: UIInterfaceOrientation {
        view.window?.windowScene?.interfaceOrientation ?? .portrait
    }

    func pageReady() {
        pageIsReady = true
        launchTimeout?.cancel()
        launchTimeout = nil
        guard launchCover.superview != nil else { return }
        UIView.animate(withDuration: 0.2, animations: { self.launchCover.alpha = 0 }) { _ in
            self.launchCover.removeFromSuperview()
        }
    }

    func applyTheme(dark: Bool) {
        darkTheme = dark
        UserDefaults.standard.set(dark, forKey: Self.themeKey)
        view.backgroundColor = currentBackground
        if launchCover.superview != nil { launchCover.backgroundColor = currentBackground }
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
            message: UiLanguage.text("اضغط مطولًا على مساحة فارغة في الشاشة الرئيسية، ثم اضغط زر الإضافة (+) وابحث عن مصحفي لإضافة الصلاة القادمة أو التاريخ أو آية وذكر اليوم."),
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: UiLanguage.text("حسنًا"), style: .default))
        topPresenter.present(alert, animated: true)
    }

    private var pageIsReady = false

    private func route(_ route: String) {
        guard pageIsReady else { return }   // the page consumes pending routes itself at start-up
        switch route {
        case "prayer": callbackRaw("openPrayerFromNotification", "")
        case "daily-verse", "daily-dhikr": callbackRaw("openDailyFromWidget", "")
        case "surah": callbackRaw("openSurahFromNotification", "")
        default: break
        }
    }

    @objc private func appBecameActive() {
        PrayerService.shared.refreshAuthorization { [weak self] in
            PrayerService.shared.schedule()
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
