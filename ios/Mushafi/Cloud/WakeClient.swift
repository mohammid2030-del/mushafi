import UIKit
import UserNotifications
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging

/// صحبة الفجر between Mushafi users (iOS side of WakeClient.java): invites, peers, rings.
/// Incoming rings arrive as time-sensitive notifications with «ردّ» / «رفض» actions.
final class WakeClient: NSObject, MessagingDelegate {
    static let shared = WakeClient()
    static let ringSeconds: TimeInterval = 45
    static let category = "WAKE_CALL", answerAction = "wake.answer", declineAction = "wake.decline"

    /// (callback name, JSON) for the page.
    var onEvent: ((String, String) -> Void)?
    var pendingLink = ""
    var pendingOpen = false

    private var db: Firestore { Firestore.firestore() }
    private var listeners: [String: ListenerRegistration] = [:]
    private var timeouts: [String: DispatchWorkItem] = [:]

    // MARK: - Setup

    func configure(_ application: UIApplication) {
        guard CloudSync.isAvailable else { return }
        Messaging.messaging().delegate = self
        let answer = UNNotificationAction(identifier: Self.answerAction, title: UiLanguage.text("ردّ"), options: [])
        let decline = UNNotificationAction(identifier: Self.declineAction, title: UiLanguage.text("رفض"), options: [.destructive])
        let wake = UNNotificationCategory(identifier: Self.category, actions: [answer, decline], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().getNotificationCategories { existing in
            var all = existing.filter { $0.identifier != Self.category }
            all.insert(wake)
            UNUserNotificationCenter.current().setNotificationCategories(all)
        }
        application.registerForRemoteNotifications()
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        UserDefaults.standard.set(token, forKey: "wake.token")
        publish(token: token)
    }

    private var user: User? { CloudSync.isAvailable ? Auth.auth().currentUser : nil }

    static func displayName(_ u: User?) -> String {
        var n = (u?.displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if n.isEmpty, let email = u?.email { n = String(email.split(separator: "@").first ?? "") }
        if n.isEmpty { n = "مستخدم مصحفي" }
        return String(n.prefix(60))
    }

    private func publish(token: String?) {
        guard let u = user, let token else { return }
        db.collection("wakeProfiles").document(u.uid).setData([
            "name": Self.displayName(u), "token": token, "platform": "ios",
            "language": UiLanguage.current, "updatedAt": FieldValue.serverTimestamp(),
        ])
    }

    // MARK: - Page API

    func status() -> String {
        let u = user
        return json(["signedIn": u != nil, "uid": u?.uid ?? "", "name": u == nil ? "" : Self.displayName(u),
                     "notifications": PrayerService.shared.notificationsAuthorized,
                     "token": !(UserDefaults.standard.string(forKey: "wake.token") ?? "").isEmpty])
    }

    func register() {
        guard user != nil else { return }
        if let token = UserDefaults.standard.string(forKey: "wake.token") { publish(token: token) }
        Messaging.messaging().token { [weak self] token, _ in
            if let token { UserDefaults.standard.set(token, forKey: "wake.token"); self?.publish(token: token) }
        }
    }

    private static let alphabet = Array("abcdefghjkmnpqrstuvwxyz23456789")
    private static func code() -> String { String((0..<10).map { _ in alphabet[Int.random(in: 0..<alphabet.count)] }) }

    func createInvite() {
        guard let u = user else { emit("onWakeInvite", ["error": "signin"]); return }
        let code = Self.code()
        db.collection("wakeInvites").document(code).setData([
            "from": u.uid, "fromName": Self.displayName(u), "createdAt": FieldValue.serverTimestamp(),
            "expiresAt": Timestamp(date: Date().addingTimeInterval(7 * 86400)),
        ]) { [weak self] error in
            if error != nil { self?.emit("onWakeInvite", ["error": "network"]) }
            else { self?.emit("onWakeInvite", ["code": code, "name": Self.displayName(u)]) }
        }
    }

    func acceptInvite(_ raw: String?) {
        guard let u = user else { emit("onWakeAccept", ["error": "signin"]); return }
        let code = (raw ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        guard code.range(of: "^[a-z0-9]{10}$", options: .regularExpression) != nil else { emit("onWakeAccept", ["error": "code"]); return }
        db.collection("wakeInvites").document(code).getDocument { [weak self] snap, error in
            guard let self else { return }
            if error != nil { self.emit("onWakeAccept", ["error": "network"]); return }
            guard let data = snap?.data(), let from = data["from"] as? String else { self.emit("onWakeAccept", ["error": "code"]); return }
            let fromName = data["fromName"] as? String ?? ""
            if let exp = data["expiresAt"] as? Timestamp, exp.dateValue() < Date() { self.emit("onWakeAccept", ["error": "expired"]); return }
            if from == u.uid { self.emit("onWakeAccept", ["error": "self"]); return }
            let batch = self.db.batch()
            batch.setData(["role": "wakesMe", "name": fromName, "invite": code, "since": FieldValue.serverTimestamp()],
                          forDocument: self.db.collection("wakePeers").document(u.uid).collection("list").document(from))
            batch.setData(["role": "canWake", "name": Self.displayName(u), "invite": code, "since": FieldValue.serverTimestamp()],
                          forDocument: self.db.collection("wakePeers").document(from).collection("list").document(u.uid))
            batch.commit { error in
                if error != nil { self.emit("onWakeAccept", ["error": "network"]) }
                else { self.register(); self.emit("onWakeAccept", ["ok": true, "name": fromName]) }
            }
        }
    }

    func peers() {
        guard let u = user else { emit("onWakePeers", ["error": "signin"]); return }
        db.collection("wakePeers").document(u.uid).collection("list").getDocuments { [weak self] q, error in
            if error != nil { self?.emit("onWakePeers", ["error": "network"]); return }
            let list: [[String: Any]] = (q?.documents ?? []).map { d in
                ["uid": d.documentID, "name": d.data()["name"] as? String ?? "", "role": d.data()["role"] as? String ?? "",
                 "since": Int64(((d.data()["since"] as? Timestamp)?.dateValue().timeIntervalSince1970 ?? 0) * 1000)]
            }
            self?.emit("onWakePeers", ["list": list])
        }
    }

    func removePeer(_ peer: String?) {
        guard let u = user, let peer, peer.range(of: "^[A-Za-z0-9]{6,128}$", options: .regularExpression) != nil else { return }
        let batch = db.batch()
        batch.deleteDocument(db.collection("wakePeers").document(u.uid).collection("list").document(peer))
        batch.deleteDocument(db.collection("wakePeers").document(peer).collection("list").document(u.uid))
        batch.commit { [weak self] error in self?.emit("onWakeRemoved", ["uid": peer, "ok": error == nil]) }
    }

    func ring(_ peer: String?, token: String?) {
        let token = token ?? ""
        guard let u = user, let peer, peer.range(of: "^[A-Za-z0-9]{6,128}$", options: .regularExpression) != nil else {
            emitCall(token, "", "failed", "signin"); return
        }
        let ref = db.collection("wakeCalls").document()
        ref.setData(["from": u.uid, "to": peer, "fromName": Self.displayName(u), "state": "ringing",
                     "createdAt": FieldValue.serverTimestamp(), "updatedAt": FieldValue.serverTimestamp()]) { [weak self] error in
            guard let self else { return }
            if let error = error as NSError? {
                self.emitCall(token, "", "failed", error.code == 7 ? "permission" : "network"); return
            }
            self.emitCall(token, ref.documentID, "ringing", nil)
            self.tokens[ref.documentID] = token
            self.relay(ref.documentID)
            self.listeners[ref.documentID] = ref.addSnapshotListener { snap, _ in
                guard let state = snap?.data()?["state"] as? String, state != "ringing" else { return }
                self.stop(ref.documentID)
                self.emitCall(token, ref.documentID, state, nil)
            }
            let work = DispatchWorkItem { ref.updateData(["state": "missed", "updatedAt": FieldValue.serverTimestamp()]) { error in if error == nil { self.relay(ref.documentID) } } }
            self.timeouts[ref.documentID] = work
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.ringSeconds, execute: work)
        }
    }

    func cancel(_ callId: String?) {
        guard let callId, callId.range(of: "^[A-Za-z0-9]{10,40}$", options: .regularExpression) != nil else { return }
        db.collection("wakeCalls").document(callId).updateData(["state": "cancelled", "updatedAt": FieldValue.serverTimestamp()]) { [weak self] error in
            if error == nil { self?.relay(callId) }
        }
    }

    // MARK: - Ring push relay (Cloudflare worker; URL in wakeConfig/endpoint)

    private var endpoint: String?
    private var tokens: [String: String] = [:]

    private func relay(_ callId: String) {
        guard let u = user else { return }
        guard let endpoint else {
            db.collection("wakeConfig").document("endpoint").getDocument { [weak self] snap, _ in
                guard let self else { return }
                if let url = snap?.data()?["url"] as? String,
                   url.range(of: "^https://[a-z0-9.-]+\\.workers\\.dev$", options: .regularExpression) != nil {
                    self.endpoint = url; self.relay(callId)
                } else { self.failRelay(callId) }
            }
            return
        }
        u.getIDToken { [weak self] idToken, error in
            guard let self else { return }
            guard let idToken, error == nil, let url = URL(string: endpoint + "/notify") else { self.failRelay(callId); return }
            var request = URLRequest(url: url, timeoutInterval: 15)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer " + idToken, forHTTPHeaderField: "Authorization")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["callId": callId])
            URLSession.shared.dataTask(with: request) { _, response, error in
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if error != nil || code >= 500 { DispatchQueue.main.async { self.failRelay(callId) } }
            }.resume()
        }
    }

    /// If the relay can't be reached while ringing, report it instead of waiting.
    private func failRelay(_ callId: String) {
        guard listeners[callId] != nil else { return }
        let token = tokens.removeValue(forKey: callId) ?? ""
        stop(callId)
        db.collection("wakeCalls").document(callId).updateData(["state": "cancelled", "updatedAt": FieldValue.serverTimestamp()])
        emitCall(token, callId, "failed", "relay")
    }

    private func stop(_ id: String) {
        listeners.removeValue(forKey: id)?.remove()
        timeouts.removeValue(forKey: id)?.cancel()
    }

    // MARK: - Being woken

    func respond(_ callId: String?, _ state: String, completion: (() -> Void)? = nil) {
        guard CloudSync.isAvailable, user != nil, let callId, callId.range(of: "^[A-Za-z0-9]{10,40}$", options: .regularExpression) != nil,
              ["answered", "declined"].contains(state) else { completion?(); return }
        db.collection("wakeCalls").document(callId).updateData(["state": state, "updatedAt": FieldValue.serverTimestamp()]) { _ in completion?() }
    }

    // MARK: - Helpers

    private func emitCall(_ token: String, _ callId: String, _ state: String, _ reason: String?) {
        var j: [String: Any] = ["token": token, "callId": callId, "state": state]
        if let reason { j["reason"] = reason }
        emit("onWakeCall", j)
    }

    private func emit(_ name: String, _ payload: [String: Any]) {
        let text = json(payload)
        DispatchQueue.main.async { self.onEvent?(name, text) }
    }

    private func json(_ object: [String: Any]) -> String {
        (try? JSONSerialization.data(withJSONObject: object)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    func consumeLink() -> String {
        defer { pendingLink = ""; pendingOpen = false }
        if !pendingLink.isEmpty { return pendingLink }
        return pendingOpen ? "open" : ""
    }
}
