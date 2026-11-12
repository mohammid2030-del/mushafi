import PDFKit
import UIKit

/// Reads a book (PDF) from الكتب: downloads it once, keeps it on the device, remembers the page.
/// iOS twin of Android's BookReaderActivity, using PDFKit (zoom and smooth scrolling built in).
final class BookReaderViewController: UIViewController, URLSessionDownloadDelegate {
    private let book: [String: Any]
    private let id: String
    private let source: URL
    private let dark: Bool
    var onClose: (() -> Void)?

    private let pdfView = PDFView()
    private let pageLabel = UILabel()
    private let message = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private let action = UIButton(type: .system)
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private var pageObserver: NSObjectProtocol?
    private var actionHandler: (() -> Void)?

    private var bg: UIColor { dark ? UIColor(red: 0.063, green: 0.063, blue: 0.075, alpha: 1) : UIColor(red: 0.961, green: 0.953, blue: 0.929, alpha: 1) }
    private var surface: UIColor { dark ? UIColor(red: 0.106, green: 0.106, blue: 0.125, alpha: 1) : UIColor(red: 1, green: 0.992, blue: 0.973, alpha: 1) }
    private var ink: UIColor { dark ? UIColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1) : UIColor(red: 0.129, green: 0.235, blue: 0.192, alpha: 1) }
    private var gold: UIColor { dark ? UIColor(red: 0.902, green: 0.812, blue: 0.604, alpha: 1) : UIColor(red: 0.541, green: 0.416, blue: 0.173, alpha: 1) }

    init?(book: [String: Any], dark: Bool) {
        var b = book
        if let n = b["id"] as? NSNumber { b["id"] = n.stringValue }
        if let n = b["bookId"] as? NSNumber { b["bookId"] = n.stringValue }
        guard let id = b["id"] as? String, BookStore.validId(id), let text = b["url"] as? String, BookStore.trusted(text), let url = URL(string: text) else { return nil }
        self.book = b; self.id = id; self.source = url; self.dark = dark
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var preferredStatusBarStyle: UIStatusBarStyle { dark ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = surface
        view.semanticContentAttribute = UiLanguage.isRTL ? .forceRightToLeft : .forceLeftToRight

        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
        close.tintColor = ink
        close.accessibilityLabel = UiLanguage.text("إغلاق")
        close.addAction(UIAction { [weak self] _ in self?.close() }, for: .touchUpInside)
        let title = UILabel()
        title.text = book["title"] as? String
        title.textColor = ink
        title.font = .systemFont(ofSize: 15, weight: .semibold)
        title.lineBreakMode = .byTruncatingTail
        pageLabel.textColor = gold
        pageLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
        pageLabel.setContentHuggingPriority(.required, for: .horizontal)
        let bar = UIStackView(arrangedSubviews: [close, title, pageLabel])
        bar.spacing = 10; bar.alignment = .center
        close.widthAnchor.constraint(equalToConstant: 44).isActive = true
        close.heightAnchor.constraint(equalToConstant: 44).isActive = true

        let body = UIView(); body.backgroundColor = bg
        pdfView.backgroundColor = bg
        pdfView.autoScales = true
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.pageShadowsEnabled = true
        pdfView.isHidden = true

        message.textColor = ink; message.font = .systemFont(ofSize: 15); message.numberOfLines = 0; message.textAlignment = .center
        progress.progressTintColor = gold; progress.trackTintColor = gold.withAlphaComponent(0.2)
        action.tintColor = gold
        action.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        action.addAction(UIAction { [weak self] _ in self?.actionHandler?() }, for: .touchUpInside)
        let status = UIStackView(arrangedSubviews: [message, progress, action])
        status.axis = .vertical; status.spacing = 18; status.alignment = .center
        progress.widthAnchor.constraint(equalToConstant: 220).isActive = true

        for v in [bar, body] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        for v in [pdfView, status] { v.translatesAutoresizingMaskIntoConstraints = false; body.addSubview(v) }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: g.topAnchor, constant: 4),
            bar.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 8),
            bar.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            body.topAnchor.constraint(equalTo: bar.bottomAnchor, constant: 4),
            body.leadingAnchor.constraint(equalTo: view.leadingAnchor), body.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            body.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            pdfView.topAnchor.constraint(equalTo: body.topAnchor), pdfView.bottomAnchor.constraint(equalTo: body.bottomAnchor),
            pdfView.leadingAnchor.constraint(equalTo: g.leadingAnchor), pdfView.trailingAnchor.constraint(equalTo: g.trailingAnchor),
            status.centerXAnchor.constraint(equalTo: body.centerXAnchor), status.centerYAnchor.constraint(equalTo: body.centerYAnchor),
            status.widthAnchor.constraint(lessThanOrEqualTo: body.widthAnchor, constant: -64),
        ])

        let file = BookStore.file(id)
        if FileManager.default.fileExists(atPath: file.path), BookStore.find(id) != nil { open(file) } else { download() }
    }

    // MARK: - Download

    private func show(_ text: String, busy: Bool, button: String?, _ handler: (() -> Void)?) {
        message.text = text
        progress.isHidden = !busy
        progress.progress = 0
        action.isHidden = button == nil
        action.setTitle(button, for: .normal)
        actionHandler = handler
    }

    private func download() {
        pdfView.isHidden = true
        show(UiLanguage.text("جارٍ تنزيل الكتاب…"), busy: true, button: UiLanguage.text("إلغاء")) { [weak self] in self?.close() }
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        self.session = session
        var request = URLRequest(url: source, timeoutInterval: 30)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        task = session.downloadTask(with: request)
        task?.resume()
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        let f = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        progress.setProgress(Float(f), animated: true)
        message.text = UiLanguage.text("جارٍ تنزيل الكتاب…") + "  " + UiLanguage.number(Int(f * 100)) + "٪"
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let target = BookStore.file(id)
        let finalURL = downloadTask.response?.url?.absoluteString
        guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200, BookStore.trusted(finalURL),
              let head = try? FileHandle(forReadingFrom: location).readData(ofLength: 5), String(data: head, encoding: .ascii)?.hasPrefix("%PDF") == true else { return }
        try? FileManager.default.removeItem(at: target)
        if (try? FileManager.default.moveItem(at: location, to: target)) != nil {
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            var url = target; try? url.setResourceValues(values)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        session.finishTasksAndInvalidate(); self.session = nil
        if (error as NSError?)?.code == NSURLErrorCancelled { return }
        let file = BookStore.file(id)
        if error == nil, FileManager.default.fileExists(atPath: file.path) {
            BookStore.put(book)
            open(file)
        } else {
            show(UiLanguage.text("تعذر تنزيل الكتاب؛ تحقق من الاتصال ثم أعد المحاولة"), busy: false, button: UiLanguage.text("إعادة المحاولة")) { [weak self] in self?.download() }
        }
    }

    // MARK: - Reading

    private func open(_ file: URL) {
        guard let document = PDFDocument(url: file), document.pageCount > 0 else {
            BookStore.delete(id)
            show(UiLanguage.text("تعذر فتح الكتاب"), busy: false, button: UiLanguage.text("إعادة المحاولة")) { [weak self] in self?.download() }
            return
        }
        message.text = nil; progress.isHidden = true; action.isHidden = true
        pdfView.document = document
        pdfView.isHidden = false
        if let page = BookStore.find(id)?["page"] as? Int, page > 0, page < document.pageCount, let p = document.page(at: page) { pdfView.go(to: p) }
        pageObserver = NotificationCenter.default.addObserver(forName: .PDFViewPageChanged, object: pdfView, queue: .main) { [weak self] _ in self?.updateLabel() }
        updateLabel()
    }

    private func updateLabel() {
        guard let doc = pdfView.document, let page = pdfView.currentPage else { return }
        pageLabel.text = UiLanguage.number(doc.index(for: page) + 1) + " / " + UiLanguage.number(doc.pageCount)
    }

    private func close() {
        task?.cancel()
        if let doc = pdfView.document, let page = pdfView.currentPage { BookStore.setPage(id, page: doc.index(for: page), pages: doc.pageCount) }
        if let pageObserver { NotificationCenter.default.removeObserver(pageObserver) }
        dismiss(animated: true) { [onClose] in onClose?() }
    }
}
