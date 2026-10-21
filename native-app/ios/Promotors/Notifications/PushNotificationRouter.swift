import Foundation
import UserNotifications

enum PushNotificationRouter {
    static func registerCategories() {
        let accept = UNNotificationAction(identifier: "PM_BOOKING_ACCEPT", title: "예약 승인",
            options: [.foreground, .authenticationRequired])
        let reject = UNNotificationAction(identifier: "PM_BOOKING_REJECT", title: "예약 거절",
            options: [.foreground, .authenticationRequired, .destructive])
        let category = UNNotificationCategory(identifier: "PM_BOOKING_ACTIONS", actions: [accept, reject],
            intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().getNotificationCategories { existing in
            var categories = existing.filter { $0.identifier != category.identifier }
            categories.insert(category)
            UNUserNotificationCenter.current().setNotificationCategories(categories)
        }
    }
    static func belongsToCurrentConnection(_ content: UNNotificationContent) -> Bool {
        guard let binding = content.userInfo["binding"] as? String,
              let active = PushConnectionStore.shared.context().binding else { return false }
        return UUID(uuidString: binding) != nil && binding == active
    }
    static func capture(_ response: UNNotificationResponse) {
        guard response.actionIdentifier != UNNotificationDismissActionIdentifier,
              belongsToCurrentConnection(response.notification.request.content) else { return }
        let content = response.notification.request.content
        let payload = content.userInfo
        guard var target = safeTarget(payload) else { return }
        var trusted = false
        if response.notification.request.trigger is UNPushNotificationTrigger,
           content.categoryIdentifier == "PM_BOOKING_ACTIONS", target["bookingId"] != nil {
            switch response.actionIdentifier {
            case "PM_BOOKING_ACCEPT": target["action"] = "accept"; trusted = true
            case "PM_BOOKING_REJECT": target["action"] = "reject"; trusted = true
            default: break
            }
        }
        deliver(target, trusted: trusted)
    }
    @discardableResult static func captureURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "promotors", ["booking", "repair"].contains(url.host?.lowercased() ?? ""),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let items = components.queryItems ?? []
        guard items.filter({ $0.name == "binding" }).count == 1,
              let binding = items.first(where: { $0.name == "binding" })?.value,
              UUID(uuidString: binding) != nil else { return false }
        var payload: [AnyHashable: Any] = ["binding": binding]
        if let id = items.first(where: { $0.name == "id" })?.value, !id.isEmpty {
            guard validId(id) else { return false }; payload[url.host?.lowercased() == "repair" ? "runId" : "bookingId"] = id
        }
        guard let target = safeTarget(payload) else { return false }
        // URL parameters can never authorize an approval or rejection.
        deliver(target, trusted: false)
        return true
    }
    private static func safeTarget(_ payload: [AnyHashable: Any]) -> [String: Any]? {
        guard let binding = payload["binding"] as? String, UUID(uuidString: binding) != nil else { return nil }
        var target: [String: Any] = ["binding": binding, "trustedAction": false]
        if let id = (payload["id"] ?? payload["notificationId"]) as? String {
            guard validId(id) else { return nil }; target["notificationId"] = id
        }
        if let id = payload["bookingId"] as? String {
            guard validId(id) else { return nil }; target["bookingId"] = id
        }
        if let id = payload["runId"] as? String {
            guard validId(id) else { return nil }; target["runId"] = id
        }
        return target
    }
    private static func validId(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9:_-]{1,128}$", options: .regularExpression) != nil
    }
    private static func deliver(_ target: [String: Any], trusted: Bool) {
        let store = PushConnectionStore.shared, context = PushConnectionStore.shared.context()
        guard let safe = store.capture(target, trusted: trusted), let eventId = safe["nativeEventId"] as? String else { return }
        DispatchQueue.main.async {
            guard store.isCurrent(context), PromotorsPush.hasObservers,
                  let current = store.takeTarget(matching: eventId) else { return }
            PromotorsPush.emit("pm-notification-open", body: current)
        }
    }
}
