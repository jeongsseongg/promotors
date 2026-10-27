import CoreFoundation
import Foundation

enum NativeQaConfiguration {
    static var value: [String: Any]? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-PM_NATIVE_QA_SCREEN"),
              arguments.indices.contains(index + 1),
              ["home", "booking", "mypage", "admin", "notifications", "updates", "setup", "setup-denied", "inbox", "detail", "customer", "login", "guest-booking", "admin-mypage", "branches", "work-detail", "branch-accounts"].contains(arguments[index + 1]) else { return nil }
        let permission = arguments.firstIndex(of: "-PM_NATIVE_QA_PERMISSION")
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        return ["screen": arguments[index + 1], "requestOsPermission": permission?.uppercased() == "YES"]
#else
        return nil
#endif
    }
    static func readyReport(_ supplied: NSDictionary) -> [String: Any]? {
        guard let configuration = value, let screen = configuration["screen"] as? String,
              supplied["screen"] as? String == screen,
              let requests = supplied["operationalRequests"] as? NSNumber,
              CFGetTypeID(requests) != CFBooleanGetTypeID(), requests.doubleValue == 0 else { return nil }
        return ["screen": screen, "nativeViews": true, "operationalRequests": 0]
    }
    static var isAllowed: Bool { value != nil }
}
