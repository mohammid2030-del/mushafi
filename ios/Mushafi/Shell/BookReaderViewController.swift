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

    private var document: PDFDocument?
    private let pageLabel = UILabel()
    private let message = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private let action = UIButton(type: .system)
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
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

    override var prefersStatusBarHidden: Bool { reading && !barShown }
    override var prefersHomeIndicatorAutoHidden: Bool { reading && !barShown }

    private let bar = UIStackView()
    private let barBack = UIView()
    private let stage = UIView()
    private let status = UIStackView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = bg
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
        for v in [close, title, pageLabel] { bar.addArrangedSubview(v) }
        bar.spacing = 10; bar.alignment = .center
        close.widthAnchor.constraint(equalToConstant: 44).isActive = true
        close.heightAnchor.constraint(equalToConstant: 44).isActive = true
        barBack.backgroundColor = surface
        barBack.layer.shadowColor = UIColor.black.cgColor; barBack.layer.shadowOpacity = 0.12; barBack.layer.shadowRadius = 6; barBack.layer.shadowOffset = .zero

        stage.backgroundColor = bg
        stage.semanticContentAttribute = .forceLeftToRight
        for direction in [UISwipeGestureRecognizer.Direction.left, .right] {
            let swipe = UISwipeGestureRecognizer(target: self, action: #selector(swiped(_:)))
            swipe.direction = direction
            stage.addGestureRecognizer(swipe)
        }
        stage.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped(_:))))
        stage.isHidden = true

        message.textColor = ink; message.font = .systemFont(ofSize: 15); message.numberOfLines = 0; message.textAlignment = .center
        progress.progressTintColor = gold; progress.trackTintColor = gold.withAlphaComponent(0.2)
        action.tintColor = gold
        action.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        action.addAction(UIAction { [weak self] _ in self?.actionHandler?() }, for: .touchUpInside)
        for v in [message, progress, action] { status.addArrangedSubview(v) }
        status.axis = .vertical; status.spacing = 18; status.alignment = .center
        progress.widthAnchor.constraint(equalToConstant: 220).isActive = true

        for v in [stage, status, barBack, bar] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stage.topAnchor.constraint(equalTo: view.topAnchor), stage.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stage.leadingAnchor.constraint(equalTo: view.leadingAnchor), stage.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.topAnchor.constraint(equalTo: g.topAnchor, constant: 4),
            bar.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 8),
            bar.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            barBack.topAnchor.constraint(equalTo: view.topAnchor), barBack.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: 4),
            barBack.leadingAnchor.constraint(equalTo: view.leadingAnchor), barBack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            status.centerXAnchor.constraint(equalTo: view.centerXAnchor), status.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            status.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -64),
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
        stage.isHidden = true
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

    // MARK: - Reading: page by page like the Mushaf, filling the screen
    // Each page's white margins are trimmed and the page (two side by side on a wide screen) fills the screen,
    // stretched at most a quarter. Swipe or tap an edge to turn; tap the middle for the bar. Night: dark page,
    // white text, gold for coloured text (Quran verses, headings).

    private var reading = false
    private var barShown = true
    private var rtlBook = true
    private var start = 0
    private var twoUp = false
    private var laidOutSize: CGSize = .zero
    private var pageViews: [UIImageView] = []
    private var crops: [Int: CGRect] = [:]
    private let cache = NSCache<NSNumber, UIImage>()
    private let renderQueue = DispatchQueue(label: "mushafi.book.render", qos: .userInitiated)
    private var pageCount: Int { document?.pageCount ?? 0 }

    private func open(_ file: URL) {
        guard let doc = PDFDocument(url: file), doc.pageCount > 0 else {
            BookStore.delete(id)
            show(UiLanguage.text("تعذر فتح الكتاب"), busy: false, button: UiLanguage.text("إعادة المحاولة")) { [weak self] in self?.download() }
            return
        }
        message.text = nil; progress.isHidden = true; action.isHidden = true; status.isHidden = true
        document = doc
        cache.totalCostLimit = 160 * 1024 * 1024
        rtlBook = ((book["title"] as? String) ?? "").range(of: "\\p{Arabic}", options: .regularExpression) != nil || UiLanguage.isRTL
        if let page = BookStore.find(id)?["page"] as? Int, page > 0, page < doc.pageCount { start = page }
        reading = true
        stage.isHidden = false
        laidOutSize = .zero
        view.setNeedsLayout()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { [weak self] in
            guard let self, self.reading, self.barShown else { return }
            self.showBar(false)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard reading, stage.bounds.size != laidOutSize, stage.bounds.width > 0 else { return }
        laidOutSize = stage.bounds.size
        layoutSpread()
    }

    private var step: Int { twoUp ? 2 : 1 }

    private func showBar(_ show: Bool) {
        barShown = show
        UIView.animate(withDuration: 0.2) {
            self.bar.alpha = show ? 1 : 0
            self.barBack.alpha = show ? 1 : 0
            self.setNeedsStatusBarAppearanceUpdate()
        }
        setNeedsUpdateOfHomeIndicatorAutoHidden()
    }

    /// The whole page fills the screen: fitted, then stretched up to a quarter more in the other direction.
    private func fit(_ aspect: CGFloat, box: CGSize) -> CGSize {
        var w = box.width, h = w * aspect
        if h > box.height { h = box.height; w = h / aspect }
        return CGSize(width: min(box.width, w * 1.25), height: min(box.height, h * 1.25))
    }

    private func aspect(of index: Int) -> CGFloat {
        guard let page = document?.page(at: index) else { return 1.414 }
        let b = page.bounds(for: .mediaBox)
        let c = crops[index] ?? CGRect(x: 0, y: 0, width: 1, height: 1)
        return (c.height * b.height) / max(1, c.width * b.width)
    }

    private func layoutSpread() {
        guard pageCount > 0 else { return }
        let size = stage.bounds.size, gap: CGFloat = 3
        twoUp = pageCount > 1 && size.width > size.height * 1.1
        if twoUp { start -= start % 2 }
        start = max(0, min(start, pageCount - 1))
        pageViews.forEach { $0.removeFromSuperview() }
        pageViews = []
        let box = CGSize(width: twoUp ? (size.width - gap) / 2 : size.width, height: size.height)
        for k in 0..<step {
            let index = start + k
            let v = UIImageView()
            v.contentMode = .scaleToFill
            v.backgroundColor = dark ? UIColor(red: 0.09, green: 0.09, blue: 0.106, alpha: 1) : .white
            v.tag = index
            let s = fit(aspect(of: index), box: box)
            // first page on the right for Arabic books
            let slotX: CGFloat = twoUp ? ((k == 0) == rtlBook ? box.width + gap : 0) : 0
            v.frame = CGRect(x: slotX + (box.width - s.width) / 2, y: (size.height - s.height) / 2, width: s.width, height: s.height)
            v.isHidden = index >= pageCount
            v.isAccessibilityElement = true
            v.accessibilityLabel = UiLanguage.text("صفحة") + " " + UiLanguage.number(index + 1)
            stage.addSubview(v)
            pageViews.append(v)
            if index < pageCount { load(index, into: v, box: box) }
        }
        updateLabel()
        for k in 1...step { prefetch(start + step - 1 + k, box: box); prefetch(start - k, box: box) }
    }

    private func load(_ index: Int, into v: UIImageView, box: CGSize) {
        let width = Int(min(box.width * UIScreen.main.scale, 2400))
        if let img = cache.object(forKey: NSNumber(value: index)), img.size.width * img.scale >= CGFloat(width) * 0.9 { show(img, index: index, in: v, box: box); return }
        render(index, width: width) { [weak self, weak v] img in
            guard let self, let v, let img, v.tag == index, v.superview != nil else { return }
            self.show(img, index: index, in: v, box: box)
        }
    }

    private func show(_ img: UIImage, index: Int, in v: UIImageView, box: CGSize) {
        v.image = img
        let s = fit(img.size.height / max(1, img.size.width), box: box)
        let center = CGPoint(x: v.frame.midX, y: stage.bounds.height / 2)
        v.frame = CGRect(x: center.x - s.width / 2, y: center.y - s.height / 2, width: s.width, height: s.height)
    }

    private func prefetch(_ index: Int, box: CGSize) {
        guard index >= 0, index < pageCount, cache.object(forKey: NSNumber(value: index)) == nil else { return }
        render(index, width: Int(min(box.width * UIScreen.main.scale, 2400))) { _ in }
    }

    private func render(_ index: Int, width: Int, done: @escaping (UIImage?) -> Void) {
        guard let doc = document else { done(nil); return }
        let night = dark, known = crops[index]
        renderQueue.async { [weak self] in
            guard let self, let page = doc.page(at: index) else { DispatchQueue.main.async { done(nil) }; return }
            let crop = known ?? Self.measureCrop(page)
            let b = page.bounds(for: .mediaBox)
            let cw = crop.width * b.width, ch = crop.height * b.height
            let scale = CGFloat(width) / max(1, cw)
            let pw = width, ph = max(1, Int((ch * scale).rounded()))
            guard let ctx = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: pw * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { DispatchQueue.main.async { done(nil) }; return }
            ctx.setFillColor(UIColor.white.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: pw, height: ph))
            ctx.interpolationQuality = .high
            ctx.scaleBy(x: scale, y: scale)
            // PDF space has its origin at the bottom left; crop.minY is measured from the top.
            ctx.translateBy(x: -crop.minX * b.width - b.minX, y: -(1 - crop.maxY) * b.height - b.minY)
            page.draw(with: .mediaBox, to: ctx)
            if night, let data = ctx.data { Self.nightPage(data.bindMemory(to: UInt8.self, capacity: pw * ph * 4), count: pw * ph) }
            let img = ctx.makeImage().map { UIImage(cgImage: $0, scale: UIScreen.main.scale, orientation: .up) }
            DispatchQueue.main.async {
                self.crops[index] = crop
                if let img { self.cache.setObject(img, forKey: NSNumber(value: index), cost: pw * ph * 4) }
                done(img)
            }
        }
    }

    /// The printed area of a page (anything not near-white), from a small preview, as fractions measured from the top left.
    private static func measureCrop(_ page: PDFPage) -> CGRect {
        let b = page.bounds(for: .mediaBox)
        let sw = 240, sh = max(1, Int((CGFloat(sw) * b.height / max(1, b.width)).rounded()))
        guard let ctx = CGContext(data: nil, width: sw, height: sh, bitsPerComponent: 8, bytesPerRow: sw * 4,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        ctx.setFillColor(UIColor.white.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: sw, height: sh))
        let s = CGFloat(sw) / max(1, b.width)
        ctx.scaleBy(x: s, y: s); ctx.translateBy(x: -b.minX, y: -b.minY)
        page.draw(with: .mediaBox, to: ctx)
        guard let data = ctx.data?.bindMemory(to: UInt8.self, capacity: sw * sh * 4) else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        var l = sw, t = sh, r = -1, btm = -1
        for y in 0..<sh { for x in 0..<sw {
            let o = (y * sw + x) * 4
            if data[o] < 236 || data[o + 1] < 236 || data[o + 2] < 236 { l = min(l, x); r = max(r, x); t = min(t, y); btm = max(btm, y) }
        } }
        // bitmap rows run top to bottom in memory
        if r < 0 || r - l < sw / 4 || btm - t < sh / 4 { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        let mx = CGFloat(sw) * 0.03, my = CGFloat(sh) * 0.02
        let L = max(0, CGFloat(l) - mx) / CGFloat(sw), T = max(0, CGFloat(t) - my) / CGFloat(sh)
        let R = min(CGFloat(sw), CGFloat(r + 1) + mx) / CGFloat(sw), B = min(CGFloat(sh), CGFloat(btm + 1) + my) / CGFloat(sh)
        return CGRect(x: L, y: T, width: R - L, height: B - T)
    }

    /// Night page: dark paper, white text, gold for coloured text.
    private static func nightPage(_ p: UnsafeMutablePointer<UInt8>, count: Int) {
        let pr: Float = 0x17, pg: Float = 0x17, pb: Float = 0x1b
        let tr: Float = 0xf2, tg: Float = 0xec, tb: Float = 0xe0
        let gr: Float = 0xe6, gg: Float = 0xc4, gb: Float = 0x78
        for i in 0..<count {
            let o = i * 4
            let r = Float(p[o]), g = Float(p[o + 1]), b = Float(p[o + 2])
            let chroma = max(r, g, b) - min(r, g, b)
            let ink = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255
            if chroma > 48 && ink > 0.1 {
                let k = min(1, max(ink, chroma / 255) * 2.2)
                p[o] = UInt8(pr + (gr - pr) * k); p[o + 1] = UInt8(pg + (gg - pg) * k); p[o + 2] = UInt8(pb + (gb - pb) * k)
            } else {
                p[o] = UInt8(pr + (tr - pr) * ink); p[o + 1] = UInt8(pg + (tg - pg) * ink); p[o + 2] = UInt8(pb + (tb - pb) * ink)
            }
            p[o + 3] = 255
        }
    }

    private func turn(_ direction: Int) {
        let next = start + direction * step
        guard next >= 0, next < pageCount else { return }
        let out: CGFloat = ((direction > 0) == rtlBook ? 1 : -1) * stage.bounds.width * 0.35
        UIView.animate(withDuration: 0.14, animations: {
            self.pageViews.forEach { $0.transform = CGAffineTransform(translationX: out, y: 0); $0.alpha = 0 }
        }, completion: { _ in
            self.start = next
            self.layoutSpread()
            self.pageViews.forEach { $0.transform = CGAffineTransform(translationX: -out, y: 0); $0.alpha = 0 }
            UIView.animate(withDuration: 0.18) { self.pageViews.forEach { $0.transform = .identity; $0.alpha = 1 } }
        })
    }

    private func updateLabel() {
        guard pageCount > 0 else { return }
        let first = UiLanguage.number(start + 1)
        let shown = twoUp && start + 1 < pageCount ? first + "–" + UiLanguage.number(start + 2) : first
        pageLabel.text = shown + " / " + UiLanguage.number(pageCount)
    }

    @objc private func swiped(_ gesture: UISwipeGestureRecognizer) {
        turn((gesture.direction == .right) == rtlBook ? 1 : -1)
    }

    @objc private func tapped(_ gesture: UITapGestureRecognizer) {
        let x = gesture.location(in: stage).x, w = stage.bounds.width
        if x < w / 5 { turn(rtlBook ? 1 : -1) }
        else if x > w * 4 / 5 { turn(rtlBook ? -1 : 1) }
        else { showBar(!barShown) }
    }

    private func close() {
        task?.cancel()
        if reading, pageCount > 0 { BookStore.setPage(id, page: start, pages: pageCount) }
        dismiss(animated: true) { [onClose] in onClose?() }
    }
}
