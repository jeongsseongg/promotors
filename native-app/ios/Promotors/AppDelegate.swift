import UIKit
import UserNotifications
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?
    var reactNativeDelegate: ReactNativeDelegate?
    var reactNativeFactory: RCTReactNativeFactory?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        PushNotificationRouter.registerCategories()
        let delegate = ReactNativeDelegate()
        let factory = RCTReactNativeFactory(delegate: delegate)
        delegate.dependencyProvider = RCTAppDependencyProvider()
        reactNativeDelegate = delegate; reactNativeFactory = factory
        window = UIWindow(frame: UIScreen.main.bounds)
        factory.startReactNative(withModuleName: "Promotors", in: window, launchOptions: launchOptions)
        return true
    }
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PromotorsPush.registered(deviceToken)
    }
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PromotorsPush.registrationFailed(error)
    }
    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        PushNotificationRouter.captureURL(url)
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        completion(PushNotificationRouter.belongsToCurrentConnection(notification.request.content) ? [.banner, .list, .sound] : [])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completion: @escaping () -> Void) {
        PushNotificationRouter.capture(response); completion()
    }
}
class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
    override func sourceURL(for bridge: RCTBridge) -> URL? { bundleURL() }
    override func bundleURL() -> URL? {
#if DEBUG
        if let bundled = Bundle.main.url(forResource: "main", withExtension: "jsbundle") { return bundled }
        return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
        return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
    }
}
