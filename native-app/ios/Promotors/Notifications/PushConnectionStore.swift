import Foundation
import Security

struct PushConnectionEpoch: Equatable {
    let generation: UInt
    let binding: String?
}

final class PushConnectionStore {
    static let shared = PushConnectionStore()
    private let lock = NSLock()
    private let defaults = UserDefaults.standard
    private let bindingKey = "pm-native-push-binding-v1"
    private var generation: UInt = 0
    private var activeBinding: String?
    private var registrationToken: String?
    private var pendingTarget: [String: Any]?
    private var trustedActions: [String: (binding: String, generation: UInt, expires: Date)] = [:]

    private init() {
        if let value = defaults.string(forKey: bindingKey), UUID(uuidString: value) != nil {
            activeBinding = value
        }
    }
    func context() -> PushConnectionEpoch {
        lock.lock(); defer { lock.unlock() }
        return PushConnectionEpoch(generation: generation, binding: activeBinding)
    }
    func isCurrent(_ expected: PushConnectionEpoch) -> Bool { context() == expected }
    @discardableResult func bind(_ binding: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard activeBinding != binding else { return false }
        generation &+= 1; activeBinding = binding
        pendingTarget = nil; trustedActions.removeAll()
        defaults.set(binding, forKey: bindingKey)
        return true
    }
    func clear() {
        lock.lock(); defer { lock.unlock() }
        generation &+= 1; activeBinding = nil; registrationToken = nil
        pendingTarget = nil; trustedActions.removeAll()
        defaults.removeObject(forKey: bindingKey)
    }
    func setToken(_ value: String, epoch: PushConnectionEpoch) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard epoch == PushConnectionEpoch(generation: generation, binding: activeBinding) else { return false }
        registrationToken = value; return true
    }
    func token() -> String? {
        lock.lock(); defer { lock.unlock() }; return registrationToken
    }
    func capture(_ target: [String: Any], trusted: Bool) -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        guard let binding = target["binding"] as? String, binding == activeBinding else { return nil }
        var safe = target
        safe["trustedAction"] = false
        if trusted {
            let nonce = UUID().uuidString
            trustedActions = trustedActions.filter { $0.value.expires > Date() }
            if trustedActions.count > 100 { trustedActions.removeAll() }
            trustedActions[nonce] = (binding, generation, Date().addingTimeInterval(300))
            safe["trustedAction"] = true; safe["actionNonce"] = nonce
        }
        pendingTarget = safe; return safe
    }
    func takeTarget() -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        let target = pendingTarget; pendingTarget = nil; return target
    }
    func consumeTrustedAction(_ nonce: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard let action = trustedActions.removeValue(forKey: nonce) else { return false }
        return action.binding == activeBinding && action.generation == generation && action.expires > Date()
    }
    func deviceId() throws -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "kr.promotors.app.native-device",
            kSecAttrAccount as String: "installation"]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne]) { _, next in next } as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data,
           let value = String(data: data, encoding: .utf8), UUID(uuidString: value) != nil { return value }
        guard status == errSecItemNotFound else { throw PushNativeError.deviceStorage }
        let value = UUID().uuidString
        let entry = query.merging([kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { _, next in next }
        guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw PushNativeError.deviceStorage }
        return value
    }
}

enum PushNativeError: LocalizedError {
    case deviceStorage, binding, activity
    var errorDescription: String? {
        switch self {
        case .deviceStorage: return "기기 정보를 안전하게 저장하지 못했습니다. 앱을 다시 열어 주세요."
        case .binding: return "알림 연결 계정이 변경되었습니다. 다시 로그인해 주세요."
        case .activity: return "상시알림을 표시하지 못했습니다. 휴대폰 설정을 확인해 주세요."
        }
    }
}
