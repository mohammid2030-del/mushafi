import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import GoogleSignIn
import UIKit

/// Port of CloudSyncController.java: Apple or Google identity and per-UID transactional
/// sync of the same Firestore document Android uses (users/{uid}/mushafi/state).
/// Tokens never cross the WebView bridge; the page only sees the snapshot JSON.
final class CloudSync: NSObject {
    static let shared = CloudSync()

    /// True once Firebase was configured from GoogleService-Info.plist.
    static var isAvailable: Bool { FirebaseApp.app() != nil }

    static func configureIfPossible() {
        guard FirebaseApp.app() == nil,
              Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else { return }
        FirebaseApp.configure()
    }

    /// Receives the snapshot JSON on the main thread (→ window.onNativeCloud).
    var onState: ((String) -> Void)?
    weak var presenter: UIViewController?

    private var auth: Auth { Auth.auth() }
    private var db: Firestore { Firestore.firestore() }
    private let prefs = UserDefaults.standard
    private var device = ""
    private var stateHandle: NSObjectProtocol?
    private var listener: ListenerRegistration?

    private var uid = "", status = "signedOut", error = "", pending = "", remote = ""
    private var pendingBaseline = CloudMerge.empty
    private var remoteRevision: Int64 = 0, pendingBase: Int64 = 0, lastSync: Int64 = 0, generation: Int64 = 0
    private var initialized = false, writing = false, loginBusy = false
    private var deleteBusy = false, deletionSucceeded = false, accountRemoved = false
    private var deleteError = ""

    private enum ApplePurpose { case signIn, deleteAccount }
    private var applePurpose = ApplePurpose.signIn
    private var appleNonce = ""

    private override init() { super.init() }

    func start() {
        guard Self.isAvailable, stateHandle == nil else { return }
        if let id = prefs.string(forKey: "cloud.device") {
            device = id
        } else {
            device = UUID().uuidString.lowercased()
            prefs.set(device, forKey: "cloud.device")
        }
        stateHandle = auth.addStateDidChangeListener { [weak self] _, _ in
            DispatchQueue.main.async { self?.accountChanged(force: false) }
        }
    }

    // MARK: - Keys / helpers

    private func key(_ suffix: String, _ user: String? = nil) -> String { "cloud.\(user ?? uid)_\(suffix)" }
    private static var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    private func active(_ user: String, _ gen: Int64) -> Bool {
        generation == gen && uid == user && auth.currentUser?.uid == user
    }

    private func document(_ user: String) -> DocumentReference {
        db.collection("users").document(user).collection("mushafi").document("state")
    }

    private func clearKeys(of user: String) {
        let prefix = "cloud.\(user)_"
        for name in prefs.dictionaryRepresentation().keys where name.hasPrefix(prefix) {
            prefs.removeObject(forKey: name)
        }
    }

    // MARK: - Account state

    private func accountChanged(force: Bool) {
        if deleteBusy { return }
        let next = auth.currentUser?.uid ?? ""
        if !force && next == uid && (!next.isEmpty || status == "signedOut") { emit(); return }
        generation += 1
        listener?.remove()
        listener = nil
        uid = next
        writing = false
        initialized = false
        remote = ""
        remoteRevision = 0
        error = ""
        pending = uid.isEmpty ? "" : (prefs.string(forKey: key("pending")) ?? "")
        pendingBase = uid.isEmpty ? 0 : Int64(prefs.integer(forKey: key("base")))
        pendingBaseline = uid.isEmpty ? CloudMerge.empty
            : (prefs.string(forKey: key("basePayload")) ?? prefs.string(forKey: key("ackPayload")) ?? CloudMerge.empty)
        lastSync = uid.isEmpty ? 0 : Int64(prefs.integer(forKey: key("lastSync")))
        status = uid.isEmpty ? "signedOut" : "connecting"
        if !uid.isEmpty && prefs.bool(forKey: key("deletePending")) {
            status = "deletionPending"
            emit()
            return
        }
        emit()
        guard !uid.isEmpty else { return }
        let user = uid, gen = generation
        listener = document(user).addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, failure in
            guard let self, self.active(user, gen) else { return }
            if let failure {
                self.status = "error"
                self.error = Self.explain(failure)
                self.emit()
                return
            }
            guard let snapshot, !snapshot.metadata.hasPendingWrites else { return }
            if snapshot.metadata.isFromCache {
                if !self.initialized { self.status = "offline"; self.emit() }
                return
            }
            if !snapshot.exists && (self.remoteRevision > 0 || self.prefs.integer(forKey: self.key("lastSync", user)) > 0) {
                self.removedOnAnotherDevice(user)
                return
            }
            self.initialized = true
            self.remote = snapshot.exists ? ((snapshot.get("payload") as? String) ?? "") : ""
            self.remoteRevision = (snapshot.get("revision") as? NSNumber)?.int64Value ?? 0
            if self.writing { self.status = "syncing"; self.emit(); return }
            if !self.pending.isEmpty {
                if self.pending == self.remote { self.acknowledge(); return }
                self.flush()
            } else {
                self.status = self.remote.isEmpty ? "empty" : "ready"
                self.error = ""
                if !self.remote.isEmpty {
                    self.lastSync = Self.nowMs
                    self.prefs.set(self.lastSync, forKey: self.key("lastSync"))
                }
                self.emit()
            }
        }
    }

    // MARK: - Sign in

    /// provider: "apple" or "google".
    func signIn(_ provider: String) {
        guard Self.isAvailable, !loginBusy, !deleteBusy else { return }
        deletionSucceeded = false
        accountRemoved = false
        loginBusy = true
        error = ""
        emit()
        if provider == "apple" {
            startApple(.signIn)
        } else {
            googleCredential { [weak self] credential, message in
                guard let self else { return }
                guard let credential else { self.loginFinished(message); return }
                self.auth.signIn(with: credential) { _, failure in
                    self.loginFinished(failure == nil ? "" : "تعذر الدخول بقوقل. تحقق من الاتصال وإعدادات الحساب ثم أعد المحاولة.")
                }
            }
        }
    }

    private func loginFinished(_ message: String) {
        DispatchQueue.main.async {
            self.loginBusy = false
            self.error = message
            self.emit()
        }
    }

    private func googleCredential(_ done: @escaping (AuthCredential?, String) -> Void) {
        guard let clientID = FirebaseApp.app()?.options.clientID, let presenter = topPresenter() else {
            done(nil, "تسجيل قوقل غير مهيأ في هذا الإصدار.")
            return
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, failure in
            if let failure {
                let cancelled = (failure as NSError).code == -5   // kGIDSignInErrorCodeCanceled
                done(nil, cancelled ? "" : "تعذر فتح تسجيل قوقل. تحقق من الاتصال ثم أعد المحاولة.")
                return
            }
            guard let user = result?.user, let idToken = user.idToken?.tokenString else {
                done(nil, "تعذر قراءة نتيجة تسجيل قوقل. أعد المحاولة.")
                return
            }
            done(GoogleAuthProvider.credential(withIDToken: idToken, accessToken: user.accessToken.tokenString), "")
        }
    }

    private func startApple(_ purpose: ApplePurpose) {
        applePurpose = purpose
        appleNonce = Self.randomNonce()
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = purpose == .signIn ? [.fullName, .email] : []
        request.nonce = Self.sha256(appleNonce)
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    private func topPresenter() -> UIViewController? {
        var top = presenter
        while let next = top?.presentedViewController { top = next }
        return top
    }

    // MARK: - Sync

    func push(_ payload: String?, revision: Int64, owner: String?, baseline: String?) {
        guard let payload, CloudMerge.valid(payload), revision >= 0 else { return }
        if let baseline, !baseline.isEmpty, !CloudMerge.valid(baseline) { return }
        guard owner == uid, !uid.isEmpty, !deleteBusy, !prefs.bool(forKey: key("deletePending")),
              auth.currentUser?.uid == uid, pending != payload else { return }
        if pending.isEmpty || revision > pendingBase {
            if let baseline, !baseline.isEmpty {
                pendingBaseline = baseline
            } else if revision == remoteRevision && !remote.isEmpty {
                pendingBaseline = remote
            } else {
                pendingBaseline = prefs.string(forKey: key("ackPayload")) ?? CloudMerge.empty
            }
        }
        pending = payload
        pendingBase = max(revision, pendingBase)
        prefs.set(pending, forKey: key("pending"))
        prefs.set(CloudMerge.nextOperation(prefs, device: device), forKey: key("op"))
        prefs.set(pendingBaseline, forKey: key("basePayload"))
        prefs.set(pendingBase, forKey: key("base"))
        error = ""
        status = "pending"
        emit()
        DispatchQueue.main.async { self.flush() }
    }

    private func flush() {
        guard !deleteBusy, !uid.isEmpty, !prefs.bool(forKey: key("deletePending")),
              !pending.isEmpty, !writing, initialized else { return }
        let user = uid, input = pending, baseline = pendingBaseline, gen = generation, device = self.device
        var op = prefs.string(forKey: key("op")) ?? ""
        if op.isEmpty { op = CloudMerge.nextOperation(prefs, device: device) }
        prefs.set(op, forKey: key("op"))
        writing = true
        status = "syncing"
        emit()
        let ref = document(user)
        let deleteFlag = key("deletePending", user)
        let background = beginBackgroundWork()

        db.runTransaction({ (transaction, errorPointer) -> Any? in
            if UserDefaults.standard.bool(forKey: deleteFlag) {
                errorPointer?.pointee = NSError(domain: "mushafi.cloud", code: 10)
                return nil
            }
            let existing: DocumentSnapshot
            do { existing = try transaction.getDocument(ref) } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
            let current = (existing.get("revision") as? NSNumber)?.int64Value ?? 0
            let server = existing.get("payload") as? String
            if CloudMerge.applied(server, op) { return ["revision": current, "payload": server ?? ""] }
            guard let merged = try? CloudMerge.record(CloudMerge.merge(baseline: baseline, local: input, remote: server), remote: server, operation: op),
                  CloudMerge.valid(merged) else {
                errorPointer?.pointee = NSError(domain: "mushafi.cloud", code: 3)
                return nil
            }
            let next = current + 1
            transaction.setData(["payload": merged, "revision": next, "updatedAt": FieldValue.serverTimestamp(), "device": device], forDocument: ref)
            return ["revision": next, "payload": merged]
        }) { [weak self] result, failure in
            DispatchQueue.main.async {
                defer { self?.endBackgroundWork(background) }
                guard let self, self.active(user, gen) else { return }
                self.writing = false
                if let failure {
                    self.status = "error"
                    self.error = Self.explain(failure)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                        if self.active(user, gen) && !self.pending.isEmpty { self.retry() }
                    }
                    self.emit()
                    return
                }
                let values = result as? [String: Any]
                let revision = (values?["revision"] as? NSNumber)?.int64Value ?? 0
                let merged = (values?["payload"] as? String) ?? ""
                self.lastSync = Self.nowMs
                self.prefs.set(revision, forKey: self.key("ackRevision"))
                self.prefs.set(merged, forKey: self.key("ackPayload"))
                self.prefs.set(input, forKey: self.key("ackInput"))
                self.prefs.set(self.lastSync, forKey: self.key("lastSync"))
                if self.remoteRevision <= revision {
                    self.remote = merged
                    self.remoteRevision = revision
                }
                if self.pending == input && op == (self.prefs.string(forKey: self.key("op")) ?? "") {
                    self.pending = ""
                    self.pendingBase = self.remoteRevision
                    self.pendingBaseline = self.remote
                    self.prefs.removeObject(forKey: self.key("pending"))
                    self.prefs.removeObject(forKey: self.key("op"))
                    self.prefs.removeObject(forKey: self.key("basePayload"))
                    self.prefs.set(self.pendingBase, forKey: self.key("base"))
                    self.status = "synced"
                    self.error = ""
                } else {
                    self.pendingBase = revision
                    self.pendingBaseline = self.pending == input ? baseline : input
                    self.prefs.set(revision, forKey: self.key("base"))
                    self.prefs.set(self.pendingBaseline, forKey: self.key("basePayload"))
                    self.status = "pending"
                }
                self.emit()
                if !self.pending.isEmpty { self.flush() }
            }
        }
    }

    private func acknowledge() {
        let input = pending
        pending = ""
        pendingBase = remoteRevision
        pendingBaseline = remote
        lastSync = Self.nowMs
        prefs.removeObject(forKey: key("pending"))
        prefs.removeObject(forKey: key("op"))
        prefs.removeObject(forKey: key("basePayload"))
        prefs.set(remoteRevision, forKey: key("base"))
        prefs.set(lastSync, forKey: key("lastSync"))
        prefs.set(remoteRevision, forKey: key("ackRevision"))
        prefs.set(remote, forKey: key("ackPayload"))
        prefs.set(input, forKey: key("ackInput"))
        status = "synced"
        error = ""
        emit()
    }

    func retry() {
        guard !deleteBusy, !uid.isEmpty, !prefs.bool(forKey: key("deletePending")) else { return }
        auth.currentUser?.reload { [weak self] failure in
            guard let self, let failure = failure as NSError? else { return }
            if failure.code == 17011 || failure.code == 17005 {   // user not found / disabled
                DispatchQueue.main.async {
                    self.accountRemoved = true
                    try? self.auth.signOut()
                    self.accountChanged(force: true)
                }
            }
        }
        if writing { emit(); return }
        accountChanged(force: true)
    }

    func resolve(local: Bool, owner: String?) {
        guard owner == uid, !deleteBusy, !uid.isEmpty, !prefs.bool(forKey: key("deletePending")), initialized else { return }
        error = ""
        if local {
            flush()
        } else {
            pending = ""
            pendingBase = remoteRevision
            prefs.removeObject(forKey: key("pending"))
            prefs.set(pendingBase, forKey: key("base"))
            status = remote.isEmpty ? "empty" : "ready"
            emit()
        }
    }

    func signOut() {
        guard !deleteBusy else { return }
        generation += 1
        try? auth.signOut()
        GIDSignIn.sharedInstance.signOut()
        disableDeviceReminders()
        accountChanged(force: false)
    }

    func matchesAck(_ payload: String?) -> Bool {
        guard let user = auth.currentUser, let payload else { return false }
        return payload == prefs.string(forKey: key("ackPayload", user.uid))
    }

    func acknowledgeDeletion() {
        deletionSucceeded = false
        accountRemoved = false
        if uid.isEmpty { status = "signedOut" }
    }

    private func removedOnAnotherDevice(_ user: String) {
        generation += 1
        listener?.remove()
        listener = nil
        clearKeys(of: user)
        uid = ""
        pending = ""
        remote = ""
        remoteRevision = 0
        initialized = false
        writing = false
        accountRemoved = true
        try? auth.signOut()
        status = "signedOut"
        disableDeviceReminders()
        emit()
    }

    /// Same as Android: leaving an account turns off this device's prayer alerts.
    private func disableDeviceReminders() {
        var settings = PrayerSettings.load()
        settings.set("enabled", false)
        settings.save()
        PrayerService.shared.schedule()
    }

    // MARK: - Account deletion (fresh re-authentication, Apple token revocation)

    func deleteAccount() {
        guard let user = auth.currentUser, !deleteBusy, !loginBusy else { return }
        deleteBusy = true
        deleteError = ""
        generation += 1
        writing = false
        listener?.remove()
        listener = nil
        status = "deleting"
        emit()
        let providers = user.providerData.map(\.providerID)
        if providers.contains("apple.com") {
            startApple(.deleteAccount)
        } else if providers.contains("google.com") {
            googleCredential { [weak self] credential, message in
                guard let self else { return }
                guard let credential else {
                    self.deletionFailed(message.isEmpty ? "أُلغي التحقق؛ لم تكتمل عملية الحذف." : message)
                    return
                }
                user.reauthenticate(with: credential) { _, failure in
                    if failure != nil {
                        self.deletionFailed("لم يتم حذف الحساب. اختر حساب قوقل نفسه للتحقق من الملكية ثم أعد المحاولة.")
                    } else {
                        self.eraseAccount(user)
                    }
                }
            }
        } else {
            eraseAccount(user)
        }
    }

    private func eraseAccount(_ user: User) {
        ChallengeClient.shared.eraseProfile(user) { [weak self] ok in
            guard let self else { return }
            if ok { self.eraseCloudAccount(user) } else {
                self.deletionFailed("لم تكتمل إزالة بيانات المنافسات. تحقق من الاتصال ثم أعد تأكيد الحذف.")
            }
        }
    }

    private func eraseCloudAccount(_ user: User) {
        DispatchQueue.main.async {
            let userId = user.uid
            guard userId == self.uid, self.auth.currentUser?.uid == userId else {
                self.deletionFailed("تغيرت جلسة الحساب؛ أعد تأكيد الحذف.")
                return
            }
            self.prefs.set(true, forKey: self.key("deletePending", userId))
            self.db.waitForPendingWrites { failure in
                if failure != nil { self.deletionFailed("تعذر إنهاء المزامنة قبل الحذف. أعد المحاولة عند توفر الاتصال."); return }
                self.document(userId).delete { failure in
                    if failure != nil {
                        self.deletionFailed("لم تكتمل إزالة بيانات السحابة. تحقق من الاتصال وقواعد خدمة المزامنة ثم أعد محاولة الحذف.")
                        return
                    }
                    self.prefs.set("cloudErased", forKey: self.key("deleteStage", userId))
                    user.delete { failure in
                        if failure != nil {
                            self.deletionFailed("حُذفت بيانات المزامنة، ولم يكتمل حذف الحساب. أعد تأكيد الدخول لإكمال الحذف. المزامنة موقوفة لحماية عملية الحذف.")
                        } else {
                            self.finishAccountDeletion(userId)
                        }
                    }
                }
            }
        }
    }

    private func deletionFailed(_ message: String) {
        DispatchQueue.main.async {
            self.deleteBusy = false
            self.deleteError = message
            if !self.uid.isEmpty && self.prefs.bool(forKey: self.key("deletePending")) {
                self.status = "deletionPending"
                self.initialized = false
                self.emit()
            } else {
                self.accountChanged(force: true)
                self.deleteError = message
                self.emit()
            }
        }
    }

    private func finishAccountDeletion(_ userId: String) {
        DispatchQueue.main.async {
            self.generation += 1
            self.listener?.remove()
            self.listener = nil
            self.clearKeys(of: userId)
            self.uid = ""
            self.pending = ""
            self.remote = ""
            self.remoteRevision = 0
            self.pendingBase = 0
            self.lastSync = 0
            self.initialized = false
            self.writing = false
            self.deleteBusy = false
            self.deleteError = ""
            self.deletionSucceeded = true
            self.status = "deleted"
            try? self.auth.signOut()
            GIDSignIn.sharedInstance.signOut()
            self.disableDeviceReminders()
            self.emit()
        }
    }

    // MARK: - Snapshot

    func snapshotJSON() -> String {
        if let current = auth.currentUser?.uid, current != uid {
            return CloudMerge.serialize(["uid": current, "status": "connecting", "initialized": false])
        }
        var j: [String: Any] = [
            "deleteBusy": deleteBusy, "deleteError": deleteError, "deletionSucceeded": deletionSucceeded,
            "accountRemoved": accountRemoved, "deletionPending": !uid.isEmpty && prefs.bool(forKey: key("deletePending")),
            "status": status, "error": error, "revision": remoteRevision, "pendingBase": pendingBase,
            "lastSync": lastSync, "pending": !pending.isEmpty, "initialized": initialized, "loginBusy": loginBusy,
            "uid": uid,
            "ackInputPayload": uid.isEmpty ? "" : (prefs.string(forKey: key("ackInput")) ?? ""),
            "ackRevision": uid.isEmpty ? 0 : prefs.integer(forKey: key("ackRevision")),
            "providers": ["apple", "google"],
        ]
        if let user = auth.currentUser {
            j["name"] = user.displayName ?? ""
            j["email"] = user.email ?? ""
        }
        if !remote.isEmpty { j["remotePayload"] = remote }
        if !pending.isEmpty { j["pendingPayload"] = pending }
        return CloudMerge.serialize(j)
    }

    private func emit() {
        let json = snapshotJSON()
        let session = generation
        DispatchQueue.main.async {
            guard session == self.generation else { return }
            self.onState?(json)
        }
    }

    private static func explain(_ failure: Error) -> String {
        let error = failure as NSError
        if error.domain == "FIRFirestoreErrorDomain" {
            if error.code == 7 { return "تعذر الوصول إلى بيانات حسابك. أعد تسجيل الدخول، وإذا استمرت المشكلة أعد المحاولة لاحقًا." }
            if error.code == 5 || error.code == 9 { return "خدمة المزامنة غير جاهزة الآن. بياناتك محفوظة على جهازك؛ أعد المحاولة لاحقًا." }
        }
        return "تعذرت المزامنة الآن. بياناتك محفوظة على هذا الجهاز وستُعاد المحاولة عند الاتصال."
    }

    // MARK: - Background time so a write started before leaving the app can finish

    private func beginBackgroundWork() -> UIBackgroundTaskIdentifier {
        UIApplication.shared.beginBackgroundTask(withName: "mushafi-sync") {}
    }

    private func endBackgroundWork(_ id: UIBackgroundTaskIdentifier) {
        if id != .invalid { UIApplication.shared.endBackgroundTask(id) }
    }

    // MARK: - Nonce

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        if SecRandomCopyBytes(kSecRandomDefault, length, &bytes) != errSecSuccess {
            return UUID().uuidString + UUID().uuidString
        }
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Sign in with Apple

extension CloudSync: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        presenter?.view.window ?? UIWindow()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = apple.identityToken, let idToken = String(data: tokenData, encoding: .utf8) else {
            appleFailed("تعذر قراءة نتيجة تسجيل الدخول بأبل. أعد المحاولة.")
            return
        }
        let credential = OAuthProvider.appleCredential(withIDToken: idToken, rawNonce: appleNonce, fullName: apple.fullName)
        switch applePurpose {
        case .signIn:
            auth.signIn(with: credential) { [weak self] _, failure in
                self?.loginFinished(failure == nil ? "" : "تعذر الدخول بأبل. تحقق من الاتصال ثم أعد المحاولة.")
            }
        case .deleteAccount:
            guard let user = auth.currentUser else { deletionFailed("تغيرت جلسة الحساب؛ أعد تأكيد الحذف."); return }
            user.reauthenticate(with: credential) { [weak self] _, failure in
                guard let self else { return }
                if failure != nil {
                    self.deletionFailed("لم يتم حذف الحساب. استخدم حساب أبل نفسه للتحقق من الملكية ثم أعد المحاولة.")
                    return
                }
                // Apple requires revoking the Sign in with Apple token when the account is deleted.
                if let code = apple.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) {
                    self.auth.revokeToken(withAuthorizationCode: code) { _ in self.eraseAccount(user) }
                } else {
                    self.eraseAccount(user)
                }
            }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as NSError).code == ASAuthorizationError.canceled.rawValue
        appleFailed(cancelled ? "" : "تعذر فتح تسجيل الدخول بأبل. أعد المحاولة.")
    }

    private func appleFailed(_ message: String) {
        switch applePurpose {
        case .signIn: loginFinished(message)
        case .deleteAccount: deletionFailed(message.isEmpty ? "أُلغي التحقق؛ لم تكتمل عملية الحذف." : message)
        }
    }
}
