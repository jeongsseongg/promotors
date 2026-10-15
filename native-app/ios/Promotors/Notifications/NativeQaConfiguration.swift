import Foundation

enum NativeQaConfiguration {
    static var value: [String: Any]? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-PM_NATIVE_QA_SCREEN"),
              arguments.indices.contains(index + 1),
              ["booking", "mypage", "admin", "notifications"].contains(arguments[index + 1]) else { return nil }
        let permission = arguments.firstIndex(of: "-PM_NATIVE_QA_PERMISSION")
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        return ["screen": arguments[index + 1], "requestOsPermission": permission?.uppercased() == "YES"]
#else
        return nil
#endif
    }
    static var isAllowed: Bool { value != nil }
}
