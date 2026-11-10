import UIKit
import WebKit

/// Live broadcast from the Two Holy Mosques (same page as Android's LiveBroadcastView):
/// the support site's player page, which embeds the official Al Aoula (SBA) live stream.
/// Navigation is limited to that page and the official embed.
final class LiveBroadcastViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let cities: Set<String> = ["makkah", "madinah"]
    private static let host = "mushafi-support.mohammedasif241.chatgpt.site"

    private let city: String
    private let dark: Bool
    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private let failure = UILabel()
    private let retry = UIButton(type: .system)

    init(city: String, dark: Bool) {
        self.city = city
        self.dark = dark
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { nil }

    private var pageURL: URL {
        URL(string: "https://\(Self.host)/live/\(city)?theme=\(dark ? "dark" : "light")")!
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { dark ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        let background = dark ? UIColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 1) : UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 1)
        let ink = dark ? UIColor(red: 0.96, green: 0.94, blue: 0.9, alpha: 1) : UIColor(red: 0.08, green: 0.25, blue: 0.2, alpha: 1)
        view.backgroundColor = background
        view.semanticContentAttribute = UiLanguage.isRTL ? .forceRightToLeft : .forceLeftToRight

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsPictureInPictureMediaPlayback = true
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false

        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
        close.tintColor = ink
        close.backgroundColor = ink.withAlphaComponent(0.1)
        close.layer.cornerRadius = 20
        close.accessibilityLabel = UiLanguage.text("إغلاق")
        close.addTarget(self, action: #selector(dismissSelf), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = UiLanguage.text(city == "makkah" ? "بث مباشر مكة المكرمة" : "بث مباشر المدينة المنورة")
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor = ink
        title.translatesAutoresizingMaskIntoConstraints = false

        failure.text = UiLanguage.text("تعذر تحميل البث الآن\nتحقق من اتصالك بالإنترنت وأعد المحاولة.")
        failure.numberOfLines = 0
        failure.textAlignment = .center
        failure.textColor = ink
        failure.isHidden = true
        failure.translatesAutoresizingMaskIntoConstraints = false
        retry.setTitle(UiLanguage.text("إعادة المحاولة"), for: .normal)
        retry.tintColor = ink
        retry.isHidden = true
        retry.addTarget(self, action: #selector(load), for: .touchUpInside)
        retry.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = ink
        spinner.translatesAutoresizingMaskIntoConstraints = false

        for subview in [webView!, close, title, spinner, failure, retry] as [UIView] { view.addSubview(subview) }
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),
            close.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            close.widthAnchor.constraint(equalToConstant: 40),
            close.heightAnchor.constraint(equalToConstant: 40),
            title.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            title.leadingAnchor.constraint(equalTo: close.trailingAnchor, constant: 12),
            title.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -16),
            webView.topAnchor.constraint(equalTo: close.bottomAnchor, constant: 8),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
            failure.centerYAnchor.constraint(equalTo: webView.centerYAnchor, constant: -20),
            failure.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            failure.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            retry.topAnchor.constraint(equalTo: failure.bottomAnchor, constant: 14),
            retry.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
        load()
    }

    @objc private func load() {
        failure.isHidden = true
        retry.isHidden = true
        spinner.startAnimating()
        webView.load(URLRequest(url: pageURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 30))
    }

    @objc private func dismissSelf() {
        webView.loadHTMLString("", baseURL: nil)   // stops playback immediately
        dismiss(animated: true)
    }

    private func allowed(_ url: URL?, mainFrame: Bool) -> Bool {
        guard let url, url.scheme == "https", url.port == nil, let host = url.host else { return url?.absoluteString == "about:blank" || url?.absoluteString == "about:srcdoc" }
        if host == Self.host { return url.path == "/live/\(city)" || !mainFrame }
        // The official embed and the media it loads stay inside the player frame.
        return !mainFrame && (host == "aloula.sba.sa" || host.hasSuffix(".sba.sa") || host.hasSuffix(".aloula.sa"))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let mainFrame = action.targetFrame?.isMainFrame ?? true
        decisionHandler(allowed(action.request.url, mainFrame: mainFrame) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showFailure() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showFailure() }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse, http.statusCode >= 400 {
            decisionHandler(.cancel)
            showFailure()
            return
        }
        decisionHandler(.allow)
    }

    /// Pop-ups (target=_blank) are never opened.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    private func showFailure() {
        spinner.stopAnimating()
        failure.isHidden = false
        retry.isHidden = false
    }
}
