import FirebaseAuth
import Foundation

/// Port of ChallengeClient.java: Firebase ID tokens go directly to the fixed challenge API,
/// never into the page. Replies arrive at window.onChallengeResponse({requestId,status,data}).
final class ChallengeClient {
    static let shared = ChallengeClient()
    static let base = "https://challenge.mushafi.workers.dev"

    var onReply: (([String: Any]) -> Void)?
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.httpMaximumConnectionsPerHost = 2
        return URLSession(configuration: config)
    }()

    static func validPath(_ path: String) -> Bool {
        ["/v1/profile", "/v1/rooms", "/v1/join", "/v1/queue"].contains(path)
            || path.range(of: "^/v1/room/[a-f0-9-]{36}(/(answer|start|leave))?$", options: .regularExpression) != nil
    }

    static func validMethod(_ method: String, _ path: String) -> Bool {
        guard validPath(path) else { return false }
        if path == "/v1/profile" { return method == "GET" || method == "DELETE" }
        if path.range(of: "^/v1/room/[a-f0-9-]{36}$", options: .regularExpression) != nil { return method == "GET" }
        return method == "POST"
    }

    func request(id: String?, method: String?, path: String?, body: String?) {
        guard let id, id.range(of: "^ch[0-9]{1,12}$", options: .regularExpression) != nil else { return }
        guard let method, let path, Self.validMethod(method, path), let body, body.utf8.count <= 4096 else {
            reply(id, 400, Self.error("طلب منافسة غير صالح"))
            return
        }
        guard CloudSync.isAvailable, let user = Auth.auth().currentUser else {
            reply(id, 401, Self.error("سجّل الدخول للمنافسة"))
            return
        }
        send(user, uid: user.uid, id: id, method: method, path: path, body: body, refreshed: false)
    }

    private func send(_ user: User, uid: String, id: String, method: String, path: String, body: String, refreshed: Bool) {
        user.getIDTokenForcingRefresh(refreshed) { [weak self] token, failure in
            guard let self else { return }
            guard let token, failure == nil else {
                self.reply(id, 401, Self.error("تعذر التحقق من الحساب، أعد تسجيل الدخول"))
                return
            }
            guard Auth.auth().currentUser?.uid == uid else {
                self.reply(id, 401, Self.error("تغيّر الحساب، أعد فتح الغرفة"))
                return
            }
            self.call(token: token, method: method, path: path, body: body) { status, data in
                if status == 401 && !refreshed && Auth.auth().currentUser?.uid == uid {
                    self.send(user, uid: uid, id: id, method: method, path: path, body: body, refreshed: true)
                    return
                }
                guard Auth.auth().currentUser?.uid == uid else {
                    self.reply(id, 401, Self.error("تغيّر الحساب، أعد فتح الغرفة"))
                    return
                }
                self.reply(id, status, data)
            }
        }
    }

    private func call(token: String, method: String, path: String, body: String, done: @escaping (Int, [String: Any]) -> Void) {
        guard let url = URL(string: Self.base + path) else { done(400, Self.error("طلب منافسة غير صالح")); return }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method == "POST" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(body.utf8)
        }
        session.dataTask(with: request) { data, response, failure in
            guard failure == nil, let http = response as? HTTPURLResponse else {
                done(503, Self.error("تعذر الاتصال بخدمة التحدّي، تحقق من الإنترنت وأعد المحاولة"))
                return
            }
            var status = http.statusCode
            var json = Self.error("تعذر الوصول إلى خدمة المنافسات")
            if let data, data.count <= 1_500_000, let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                json = parsed
            } else if status < 400 {
                status = 503
            }
            done(status, json)
        }.resume()
    }

    /// DELETE /v1/profile before the Firebase account is removed (as on Android).
    func eraseProfile(_ user: User, done: @escaping (Bool) -> Void) {
        user.getIDTokenForcingRefresh(true) { [weak self] token, failure in
            guard let self, let token, failure == nil else { DispatchQueue.main.async { done(false) }; return }
            self.call(token: token, method: "DELETE", path: "/v1/profile", body: "{}") { status, _ in
                DispatchQueue.main.async { done((200..<300).contains(status)) }
            }
        }
    }

    private func reply(_ id: String, _ status: Int, _ data: [String: Any]) {
        let payload: [String: Any] = ["requestId": id, "status": status, "data": data]
        DispatchQueue.main.async { self.onReply?(payload) }
    }

    private static func error(_ text: String) -> [String: Any] { ["error": text] }
}
