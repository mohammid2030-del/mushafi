import UIKit
import WebKit

/// إحسان — التبرع السريع عبر رابط شراكة مصحفي.
///
/// The donor's amount and field are sent to Ehsan's quick-donation form (the same request its own
/// page sends). Ehsan answers with a payment link; its app view (`fromApp=True`) opens inside
/// Mushafi under Mushafi's own header. No script is injected into Ehsan's page, so Apple Pay stays available.
enum EhsanDonation {
    static let page = URL(string: "https://ehsan.sa/FastDonation/023544911AA3B6BE973774424665F484C3CFDFFF283D6D744E12A20EA020BFE8350C0E567D258DBD42EAE85D79436847")!
    private static let fallbackSource = "be25a516-2952-5226-c999-3a252423e046"
    static let fields: Set<String> = ["publicOpportunity", "tanfeethQuickDonation", "AwkaafQuickDonation", "mosqueCareQuickDonation"]
    static let agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

    static func donate(amount: Int, field: String, from shell: WebShellViewController) {
        guard (1...1_000_000).contains(amount), fields.contains(field) else { shell.callback("onEhsanDonate", false); return }
        let lang = UiLanguage.current == "ar" ? "ar-SA" : "en-US"
        prepare(amount: amount, field: field, lang: lang) { payment in
            DispatchQueue.main.async {
                let dark = UserDefaults.standard.bool(forKey: "mushafi.launchDark")
                let sheet = EhsanPayViewController(url: payment ?? page, dark: dark)
                shell.topPresenter.present(sheet, animated: true)
                shell.callback("onEhsanDonate", payment != nil)
            }
        }
    }

    /// Reads the partner source from Ehsan's page, sends the choice, and turns Ehsan's answer into its in-app payment view.
    private static func prepare(amount: Int, field: String, lang: String, done: @escaping (URL?) -> Void) {
        var get = URLRequest(url: page, timeoutInterval: 20)
        get.setValue(agent, forHTTPHeaderField: "User-Agent")
        get.setValue("ar-SA", forHTTPHeaderField: "Accept-Language")
        URLSession.shared.dataTask(with: get) { data, _, _ in
            var source = fallbackSource
            if let html = data.flatMap({ String(data: $0, encoding: .utf8) }),
               let r = html.range(of: #"name="FastDonationSource"\s+value="[0-9a-fA-F-]{36}""#, options: .regularExpression) {
                let match = String(html[r])
                if let v = match.range(of: #"[0-9a-fA-F-]{36}"#, options: .regularExpression) { source = String(match[v]) }
            }
            let boundary = "----Mushafi\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
            var body = ""
            for (k, v) in [("CartItems[0][Amount]", String(amount)), ("CartItems[0][InitiativeType]", field), ("FastDonationSource", source)] {
                body += "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n"
            }
            body += "--\(boundary)--\r\n"
            var post = URLRequest(url: URL(string: "https://ehsan.sa/QuickDonate")!, timeoutInterval: 20)
            post.httpMethod = "POST"
            post.httpBody = body.data(using: .utf8)
            post.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            post.setValue(page.absoluteString, forHTTPHeaderField: "Referer")
            post.setValue("https://ehsan.sa", forHTTPHeaderField: "Origin")
            post.setValue(agent, forHTTPHeaderField: "User-Agent")
            post.setValue("ar-SA", forHTTPHeaderField: "Accept-Language")
            post.setValue("application/json, text/plain, */*", forHTTPHeaderField: "Accept")
            URLSession.shared.dataTask(with: post) { data, _, _ in
                guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      json["isSuccess"] as? Bool == true, let link = json["redirectToUrl"] as? String,
                      let url = URL(string: link), url.scheme == "https", url.host?.lowercased() == "ehsan.sa",
                      url.path.lowercased().hasPrefix("/payment") else { done(nil); return }
                appView(of: url, lang: lang, done: done)
            }.resume()
        }.resume()
    }

    /// Ehsan's /Payment link redirects to eps.ehsan.sa with `fromApp=False`; the same page with `fromApp=True` is its app view.
    private static func appView(of payment: URL, lang: String, done: @escaping (URL?) -> Void) {
        let stopper = RedirectStopper()
        let session = URLSession(configuration: .ephemeral, delegate: stopper, delegateQueue: nil)
        var req = URLRequest(url: payment, timeoutInterval: 20)
        req.setValue(agent, forHTTPHeaderField: "User-Agent")
        session.dataTask(with: req) { _, response, _ in
            session.finishTasksAndInvalidate()
            var target: URL? = nil
            if let http = response as? HTTPURLResponse, let loc = http.value(forHTTPHeaderField: "Location"),
               let url = URL(string: loc, relativeTo: payment)?.absoluteURL, url.scheme == "https",
               let host = url.host?.lowercased(), host == "eps.ehsan.sa" || host == "ehsan.sa" {
                target = url
            } else if let id = URLComponents(url: payment, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "TransactionId" })?.value {
                target = URL(string: "https://eps.ehsan.sa/payment/authenticate?transactionId=\(id)&token=")
            }
            guard let found = target, var parts = URLComponents(url: found, resolvingAgainstBaseURL: false) else { done(payment); return }
            var items = (parts.queryItems ?? []).filter { $0.name != "fromApp" && $0.name != "lang" }
            items.append(URLQueryItem(name: "fromApp", value: "True"))
            items.append(URLQueryItem(name: "lang", value: lang))
            parts.queryItems = items
            done(parts.url ?? payment)
        }.resume()
    }

    private final class RedirectStopper: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    }
}

/// Ehsan's payment page under Mushafi's own header (title, secure line, Ehsan logo, close).
final class EhsanPayViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let url: URL
    private let dark: Bool
    private let web: WKWebView
    private let progress = UIProgressView(progressViewStyle: .bar)
    private var observer: NSKeyValueObservation?

    init(url: URL, dark: Bool) {
        self.url = url
        self.dark = dark
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: config)
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
        overrideUserInterfaceStyle = dark ? .dark : .light
        if let sheet = sheetPresentationController { sheet.detents = [.large()]; sheet.prefersGrabberVisible = true; sheet.preferredCornerRadius = 26 }
    }
    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        let teal1 = UIColor(red: 0.039, green: 0.541, blue: 0.447, alpha: 1), teal3 = UIColor(red: 0.051, green: 0.227, blue: 0.388, alpha: 1)
        view.backgroundColor = dark ? UIColor(white: 0.07, alpha: 1) : UIColor(red: 0.97, green: 0.95, blue: 0.91, alpha: 1)

        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        let logoBox = GradientView(colors: [teal1, teal3])
        logoBox.layer.cornerRadius = 12
        logoBox.clipsToBounds = true
        logoBox.translatesAutoresizingMaskIntoConstraints = false
        let logo = UIImageView()
        if let file = Bundle.main.url(forResource: "ehsan-logo-white", withExtension: "png", subdirectory: "assets") { logo.image = UIImage(contentsOfFile: file.path) }
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        logoBox.addSubview(logo)

        let title = UILabel()
        title.text = UiLanguage.text("إتمام التبرع")
        title.font = .systemFont(ofSize: 17, weight: .heavy)
        title.textColor = .label
        let lock = UIImageView(image: UIImage(systemName: "lock.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 10, weight: .semibold)))
        lock.tintColor = .secondaryLabel
        let sub = UILabel()
        sub.text = UiLanguage.text("منصة إحسان · دفع آمن")
        sub.font = .systemFont(ofSize: 12, weight: .medium)
        sub.textColor = .secondaryLabel
        let subRow = UIStackView(arrangedSubviews: [lock, sub])
        subRow.spacing = 4
        subRow.alignment = .center
        let texts = UIStackView(arrangedSubviews: [title, subRow])
        texts.axis = .vertical
        texts.alignment = UiLanguage.isRTL ? .trailing : .leading
        texts.semanticContentAttribute = UiLanguage.isRTL ? .forceRightToLeft : .forceLeftToRight
        subRow.semanticContentAttribute = texts.semanticContentAttribute
        texts.spacing = 2

        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .bold)), for: .normal)
        close.tintColor = .label
        close.backgroundColor = UIColor.label.withAlphaComponent(0.08)
        close.layer.cornerRadius = 17
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        for v in [logoBox, texts, close] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false; header.addSubview(v) }
        let line = UIView()
        line.backgroundColor = UIColor.label.withAlphaComponent(0.1)
        line.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(line)

        progress.progressTintColor = teal1
        progress.trackTintColor = .clear
        progress.translatesAutoresizingMaskIntoConstraints = false
        web.translatesAutoresizingMaskIntoConstraints = false
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.customUserAgent = EhsanDonation.agent
        view.addSubview(web)
        view.addSubview(progress)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor, constant: 14),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 64),
            logoBox.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            logoBox.widthAnchor.constraint(equalToConstant: 40), logoBox.heightAnchor.constraint(equalToConstant: 40),
            logo.centerXAnchor.constraint(equalTo: logoBox.centerXAnchor), logo.centerYAnchor.constraint(equalTo: logoBox.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 28), logo.heightAnchor.constraint(equalToConstant: 28),
            texts.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            close.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            close.widthAnchor.constraint(equalToConstant: 34), close.heightAnchor.constraint(equalToConstant: 34),
            line.leadingAnchor.constraint(equalTo: header.leadingAnchor), line.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            line.bottomAnchor.constraint(equalTo: header.bottomAnchor), line.heightAnchor.constraint(equalToConstant: 1),
            progress.topAnchor.constraint(equalTo: header.bottomAnchor),
            progress.leadingAnchor.constraint(equalTo: view.leadingAnchor), progress.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.topAnchor.constraint(equalTo: header.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        let rtl = UiLanguage.isRTL
        NSLayoutConstraint.activate(rtl ? [
            logoBox.rightAnchor.constraint(equalTo: header.rightAnchor, constant: -16),
            texts.rightAnchor.constraint(equalTo: logoBox.leftAnchor, constant: -10),
            close.leftAnchor.constraint(equalTo: header.leftAnchor, constant: 16),
        ] : [
            logoBox.leftAnchor.constraint(equalTo: header.leftAnchor, constant: 16),
            texts.leftAnchor.constraint(equalTo: logoBox.rightAnchor, constant: 10),
            close.rightAnchor.constraint(equalTo: header.rightAnchor, constant: -16),
        ])
        title.textAlignment = rtl ? .right : .left
        observer = web.observe(\.estimatedProgress, options: [.new]) { [weak self] w, _ in
            self?.progress.setProgress(Float(w.estimatedProgress), animated: true)
            self?.progress.isHidden = w.estimatedProgress >= 1
        }
        web.load(URLRequest(url: url))
    }

    @objc private func closeTapped() { dismiss(animated: true) }

    // Only web pages load inside; anything else (bank or wallet apps) is handed to the system.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let target = action.request.url, let scheme = target.scheme?.lowercased() else { decisionHandler(.cancel); return }
        if scheme == "https" || scheme == "about" || scheme == "blob" || scheme == "data" { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        UIApplication.shared.open(target)
    }

    // Pages that open a new window (3-D Secure, receipts) stay in the same sheet.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil { webView.load(action.request) }
        return nil
    }

    private final class GradientView: UIView {
        private let colors: [UIColor]
        init(colors: [UIColor]) { self.colors = colors; super.init(frame: .zero) }
        required init?(coder: NSCoder) { nil }
        override class var layerClass: AnyClass { CAGradientLayer.self }
        override func layoutSubviews() {
            super.layoutSubviews()
            let g = layer as! CAGradientLayer
            g.colors = colors.map(\.cgColor)
            g.startPoint = CGPoint(x: 0, y: 0)
            g.endPoint = CGPoint(x: 1, y: 1)
        }
    }
}
