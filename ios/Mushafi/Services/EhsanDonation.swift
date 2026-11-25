import UIKit
import SafariServices
import WebKit

/// إحسان — التبرع السريع عبر رابط شراكة مصحفي.
///
/// Way 1: the donor's amount and field are sent to Ehsan's quick-donation form (the same request
/// its own page sends), and Ehsan's payment page opens inside the app in a Safari sheet.
/// Way 2 (test build): Ehsan's quick-donation page opens in an in-app sheet and is filled in for the donor.
enum EhsanDonation {
    static let page = URL(string: "https://ehsan.sa/FastDonation/023544911AA3B6BE973774424665F484C3CFDFFF283D6D744E12A20EA020BFE8350C0E567D258DBD42EAE85D79436847")!
    private static let fallbackSource = "be25a516-2952-5226-c999-3a252423e046"
    static let fields: Set<String> = ["publicOpportunity", "tanfeethQuickDonation", "AwkaafQuickDonation", "mosqueCareQuickDonation"]
    private static let teal = UIColor(red: 0.04, green: 0.42, blue: 0.44, alpha: 1)
    private static let agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

    static func donate(amount: Int, field: String, way: Int, from shell: WebShellViewController) {
        guard (1...1_000_000).contains(amount), fields.contains(field) else { shell.callback("onEhsanDonate", false); return }
        if way == 2 {
            DispatchQueue.main.async {
                let sheet = EhsanPageViewController(amount: amount, field: field)
                shell.topPresenter.present(UINavigationController(rootViewController: sheet), animated: true)
                shell.callback("onEhsanDonate", true)
            }
            return
        }
        prepare(amount: amount, field: field) { payment in
            DispatchQueue.main.async {
                if let payment {
                    showSafari(payment, from: shell)
                    shell.callback("onEhsanDonate", true)
                } else {
                    showSafari(page, from: shell)
                    shell.callback("onEhsanDonate", false)
                }
            }
        }
    }

    private static func showSafari(_ url: URL, from shell: WebShellViewController) {
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = teal
        safari.dismissButtonStyle = .close
        safari.modalPresentationStyle = .pageSheet
        shell.topPresenter.present(safari, animated: true)
    }

    /// Opens Ehsan's page (for its cookies and partner source), then sends the choice; Ehsan answers with its payment link.
    private static func prepare(amount: Int, field: String, done: @escaping (URL?) -> Void) {
        var get = URLRequest(url: page, timeoutInterval: 20)
        get.setValue(agent, forHTTPHeaderField: "User-Agent")
        get.setValue("ar-SA", forHTTPHeaderField: "Accept-Language")
        URLSession.shared.dataTask(with: get) { data, _, _ in
            var source = fallbackSource
            if let html = data.flatMap({ String(data: $0, encoding: .utf8) }),
               let r = html.range(of: #"name="FastDonationSource"\s+value="([0-9a-fA-F-]{36})""#, options: .regularExpression) {
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
                done(url)
            }.resume()
        }.resume()
    }
}

/// Way 2: Ehsan's quick-donation page in an in-app sheet, filled in with the donor's choice.
final class EhsanPageViewController: UIViewController, WKNavigationDelegate {
    private let amount: Int
    private let field: String
    private var filled = false
    private let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    private let spinner = UIActivityIndicatorView(style: .medium)

    init(amount: Int, field: String) { self.amount = amount; self.field = field; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "إحسان"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .close, target: self, action: #selector(close))
        navigationItem.rightBarButtonItem = UIBarButtonItem(customView: spinner)
        web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        spinner.startAnimating()
        web.load(URLRequest(url: EhsanDonation.page))
    }

    @objc private func close() { dismiss(animated: true) }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = action.request.url?.scheme?.lowercased() ?? ""
        decisionHandler(scheme == "https" || scheme == "about" ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        guard !filled, webView.url?.path.lowercased().hasPrefix("/fastdonation") == true else { return }
        filled = true
        let script = """
        (function(){
          var tab=[].slice.call(document.querySelectorAll('.qd-btn-select')).find(function(e){return e.dataset.type==='\(field)'});
          if(tab)tab.click();
          var i=document.getElementById('qd_amount');
          if(i){i.focus();i.value='\(amount)';['input','change','keyup','blur'].forEach(function(t){i.dispatchEvent(new Event(t,{bubbles:true}))});}
          setTimeout(function(){
            var b=[].slice.call(document.querySelectorAll('#qd-formPage button, #qd-formPage [type=submit]')).find(function(e){return /تبرع الآن/.test(e.textContent)});
            if(b)b.click();
          },500);
        })();
        """
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { webView.evaluateJavaScript(script, completionHandler: nil) }
    }
}
