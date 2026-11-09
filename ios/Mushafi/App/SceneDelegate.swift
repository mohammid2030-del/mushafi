import GoogleSignIn
import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebShellViewController()
        window.makeKeyAndVisible()
        self.window = window
        connectionOptions.urlContexts.forEach { handle($0.url) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        URLContexts.forEach { handle($0.url) }
    }

    private func handle(_ url: URL) {
        if AppRouter.shared.handle(url) { return }
        _ = GIDSignIn.sharedInstance.handle(url)   // Google sign-in redirect
    }
}
