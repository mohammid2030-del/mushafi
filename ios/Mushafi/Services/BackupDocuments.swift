import UIKit
import UniformTypeIdentifiers

/// Backup export/import through the Files app (Android used ACTION_CREATE/OPEN_DOCUMENT).
final class BackupDocuments: NSObject, UIDocumentPickerDelegate {
    var onMessage: ((_ ok: Bool, _ message: String) -> Void)?
    var onLoaded: ((_ text: String) -> Void)?
    weak var presenter: WebShellViewController?

    private enum Mode { case export, load }
    private var mode: Mode?
    private static let limit = 1_000_000

    func export(_ text: String?) {
        guard let text, text.utf8.count <= Self.limit else {
            onMessage?(false, "حجم النسخة كبير")
            return
        }
        guard Self.isJSONObject(text) else {
            onMessage?(false, "تعذر تجهيز ملف النسخة")
            return
        }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("backup-export", isDirectory: true)
        let file = folder.appendingPathComponent("Mushafi-backup.json")
        do {
            try? FileManager.default.removeItem(at: folder)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data(text.utf8).write(to: file, options: .completeFileProtection)
        } catch {
            onMessage?(false, "تعذر تجهيز ملف النسخة")
            return
        }
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
        present(picker, mode: .export)
    }

    func importBackup() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
        picker.allowsMultipleSelection = false
        present(picker, mode: .load)
    }

    private func present(_ picker: UIDocumentPickerViewController, mode: Mode) {
        guard let presenter else {
            onMessage?(false, "تعذر فتح مدير الملفات")
            return
        }
        self.mode = mode
        picker.delegate = self
        presenter.topPresenter.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let current = mode
        mode = nil
        switch current {
        case .export:
            onMessage?(true, "حُفظت النسخة الاحتياطية")
        case .load:
            guard let url = urls.first else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= Self.limit,
                  let data = try? Data(contentsOf: url),
                  let text = String(data: data, encoding: .utf8),
                  Self.isJSONObject(text) else {
                onMessage?(false, "تعذر قراءة النسخة أو أن الملف غير صالح")
                return
            }
            onLoaded?(text)
        case .none:
            break
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        mode = nil
    }

    private static func isJSONObject(_ text: String) -> Bool {
        guard let data = text.data(using: .utf8) else { return false }
        return (try? JSONSerialization.jsonObject(with: data)) is [String: Any]
    }
}
