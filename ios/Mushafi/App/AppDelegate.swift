import AVFoundation
import BackgroundTasks
import UIKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let refreshTask = "com.mohammedasif.mushafi.refresh"

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Recitation keeps playing with the silent switch on and in the background.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])

        CloudSync.configureIfPossible()   // needs GoogleService-Info.plist; the app works without it
        CloudSync.shared.start()

        UNUserNotificationCenter.current().delegate = self
        PrayerService.shared.refreshAuthorization { PrayerService.shared.schedule(); ReminderService.shared.schedule() }

        _ = BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshTask, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            Self.handleRefresh(task)
        }
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        Self.scheduleRefresh()
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // MARK: - Background refresh: keep ~4 days of prayer notifications queued

    static func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTask)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 3600)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handleRefresh(_ task: BGAppRefreshTask) {
        scheduleRefresh()
        task.expirationHandler = { task.setTaskCompleted(success: false) }
        DispatchQueue.main.async {
            PrayerSource.refresh(PrayerSettings.load()) { _ in
                PrayerService.shared.schedule()
                ReminderService.shared.schedule()
                FajrCompanion.shared.schedule()
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { task.setTaskCompleted(success: true) }
            }
        }
    }

    // MARK: - Notifications

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        switch info["open"] as? String {
        case "prayer":
            DispatchQueue.main.async { AppRouter.shared.open("prayer") }
        case "daily":
            DispatchQueue.main.async {
                ReminderService.shared.pendingDaily = (info["kind"] as? String ?? "", info["item"] as? String ?? "")
                AppRouter.shared.notifyPage("openDailyReminderFromNotification")
            }
        case "fajr":
            let list = info["list"] as? String ?? ""
            DispatchQueue.main.async {
                if list.range(of: "^[a-z0-9]{1,16}$", options: .regularExpression) != nil {
                    FajrCompanion.shared.pendingLaunch = list
                    AppRouter.shared.notifyPage("fajrCheckLaunch")
                }
            }
        case "khatma":
            DispatchQueue.main.async {
                ReminderService.shared.pendingKhatma = true
                AppRouter.shared.notifyPage("openKhatmaFromNotification")
            }
        default:
            break
        }
        completionHandler()
    }
}
