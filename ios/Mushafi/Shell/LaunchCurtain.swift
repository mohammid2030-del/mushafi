import UIKit
import WebKit

/// The opening "جارٍ تجهيز مصحفك" screen (iOS twin of Android's LaunchScreen):
/// shown at a cold start and again after a long time in the background.
/// It stays at least `duration` and until the app page is ready, then fades out.
final class LaunchCurtain: UIView, WKNavigationDelegate {
    static let duration: TimeInterval = 5
    static let giveUp: TimeInterval = 30

    private let presentation: WKWebView
    private var presentationReady = false
    private var pageReady = false
    private var started = Date()
    private var timer: Timer?
    private var dark: Bool
    private var language = ""
    private(set) var isShowing = false
    var onDismissed: (() -> Void)?
    var onRetry: (() -> Void)?
    private let retry = UIButton(type: .system)

    init(dark: Bool, background: UIColor) {
        self.dark = dark
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AssetSchemeHandler(root: AssetSchemeHandler.bundledRoot()), forURLScheme: AssetSchemeHandler.scheme)
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.dataDetectorTypes = []
        presentation = WKWebView(frame: .zero, configuration: config)
        super.init(frame: .zero)
        backgroundColor = background
        accessibilityLabel = UiLanguage.text("جارٍ فتح مصحفي")
        isAccessibilityElement = false

        presentation.isOpaque = false
        presentation.backgroundColor = .clear
        presentation.scrollView.backgroundColor = .clear
        presentation.scrollView.isScrollEnabled = false
        presentation.isUserInteractionEnabled = false
        presentation.alpha = 0
        presentation.navigationDelegate = self
        presentation.frame = bounds
        presentation.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(presentation)

        retry.setTitle(UiLanguage.text("إعادة المحاولة"), for: .normal)
        retry.isHidden = true
        retry.translatesAutoresizingMaskIntoConstraints = false
        retry.addAction(UIAction { [weak self] _ in self?.show(); self?.onRetry?() }, for: .touchUpInside)
        addSubview(retry)
        NSLayoutConstraint.activate([
            retry.centerXAnchor.constraint(equalTo: centerXAnchor),
            retry.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -60),
        ])
        load()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private func load() {
        language = UiLanguage.current
        presentationReady = false
        presentation.alpha = 0
        var parts = URLComponents(url: AssetSchemeHandler.homeURL, resolvingAgainstBaseURL: false)!
        parts.path = parts.path.replacingOccurrences(of: "index.html", with: "startup-loading.html")
        parts.queryItems = [URLQueryItem(name: "lang", value: language), URLQueryItem(name: "dark", value: dark ? "1" : "0")]
        if let url = parts.url { presentation.load(URLRequest(url: url)) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("launchTheme(\(dark))", completionHandler: nil)
        webView.callAsyncJavaScript("await document.fonts.ready; return 1", arguments: [:], in: nil, in: .page) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                guard let self else { return }
                self.presentationReady = true
                UIView.animate(withDuration: 0.15) { self.presentation.alpha = 1 }
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.scheme == AssetSchemeHandler.scheme ? .allow : .cancel)
    }

    func setTheme(dark: Bool, background: UIColor) {
        self.dark = dark
        backgroundColor = background
        presentation.evaluateJavaScript("typeof launchTheme==='function'&&launchTheme(\(dark))", completionHandler: nil)
    }

    /// Starts (or restarts) the curtain. `ready` says whether the app page is already loaded.
    func show(ready: Bool = false) {
        if UiLanguage.current != language { load() }
        pageReady = ready
        started = Date()
        retry.isHidden = true
        presentation.isHidden = false
        alpha = 1
        isHidden = false
        isShowing = true
        superview?.bringSubviewToFront(self)
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in self?.tick() }
    }

    func markReady() { pageReady = true }

    private func tick() {
        let time = Date().timeIntervalSince(started)
        if presentationReady {
            presentation.evaluateJavaScript("launchProgress(\(Int(time * 1000)),\(pageReady))", completionHandler: nil)
        }
        if time >= Self.duration, pageReady, presentationReady || time >= Self.duration + 3 {
            timer?.invalidate(); timer = nil
            UIView.animate(withDuration: 0.5, animations: { self.alpha = 0 }) { _ in
                self.isHidden = true
                self.isShowing = false
                self.onDismissed?()
            }
            return
        }
        if time >= Self.giveUp, !pageReady {
            timer?.invalidate(); timer = nil
            presentation.isHidden = true
            retry.isHidden = false
        }
    }
}
