import Foundation
import React
import UIKit
import UserNotifications

@objc(PromotorsPush)
final class PromotorsPush: RCTEventEmitter {
    private static weak var instance: PromotorsPush?
    private var observing = false
    private var registrationEpoch: PushConnectionEpoch?
    private var waiters: [String: (resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)] = [:]

    override init() { super.init(); Self.instance = self }
    @objc override static func requiresMainQueueSetup() -> Bool { true }
    override func supportedEvents() -> [String]! {
        ["pm-notification-open", "pm-push-token-refreshed", "pm-activity-token"]
    }
    override func startObserving() { DispatchQueue.main.async { self.observing = true } }
    override func stopObserving() { DispatchQueue.main.async { self.observing = false } }
    static var hasObservers: Bool { instance?.observing == true }
    static func emit(_ name: String, body: [String: Any]) {
        let context = PushConnectionStore.shared.context()
        let deliver = {
            guard PushConnectionStore.shared.isCurrent(context), let emitter = instance, emitter.observing else { return }
            emitter.sendEvent(withName: name, body: body)
        }
        if Thread.isMainThread { deliver() } else { DispatchQueue.main.async(execute: deliver) }
    }
    private static func permission(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .notDetermined: return "default"
        default: return "denied"
        }
    }
    @objc(getPermissionStatus:rejecter:)
    func getPermissionStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { resolve(Self.permission($0.authorizationStatus)) }
    }
    @objc(requestPermission:rejecter:)
    func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
                if let error { reject("NOTIFICATION_PERMISSION_FAILED", "앱 알림 권한을 확인하지 못했습니다.", error); return }
                UNUserNotificationCenter.current().getNotificationSettings { resolve(Self.permission($0.authorizationStatus)) }
            }
        }
    }
    @objc(getRegistrationToken:rejecter:)
    func getRegistrationToken(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard Self.permission(settings.authorizationStatus) == "granted" else {
                reject("NOTIFICATION_PERMISSION_DENIED", "휴대폰 설정에서 프로모터스 앱 알림을 허용해 주세요.", nil); return
            }
            DispatchQueue.main.async {
                if let cached = PushConnectionStore.shared.token(), UIApplication.shared.isRegisteredForRemoteNotifications { resolve(cached); return }
                let epoch = PushConnectionStore.shared.context(), key = UUID().uuidString
                self.registrationEpoch = epoch; self.waiters[key] = (resolve, reject)
                UIApplication.shared.registerForRemoteNotifications()
                DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
                    guard let waiter = self?.waiters.removeValue(forKey: key) else { return }
                    waiter.reject("APNS_TOKEN_TIMEOUT", "아이폰 알림 기기 등록이 지연되고 있습니다. 연결 상태를 확인하고 다시 시도해 주세요.", nil)
                }
            }
        }
    }
    static func registered(_ data: Data) {
        DispatchQueue.main.async {
            guard let emitter = instance else { return }
            let store = PushConnectionStore.shared
            let epoch = emitter.registrationEpoch ?? store.context()
            let previousToken = store.token()
            let token = data.map { String(format: "%02x", $0) }.joined()
            guard token.count == 64, PushConnectionStore.shared.setToken(token, epoch: epoch) else {
                emitter.failWaiters("SESSION_CHANGED", message: "알림 연결 계정이 변경되었습니다."); return
            }
            let waiters = emitter.waiters; emitter.waiters.removeAll(); emitter.registrationEpoch = nil
            waiters.values.forEach { $0.resolve(token) }
            if previousToken != token, let binding = epoch.binding {
                emit("pm-push-token-refreshed", body: ["binding": binding])
            }
        }
    }
    static func registrationFailed(_ error: Error) {
        DispatchQueue.main.async { instance?.failWaiters("APNS_REGISTRATION_FAILED", message: "아이폰 알림 기기를 등록하지 못했습니다. 다시 시도해 주세요.", error: error) }
    }
    private func failWaiters(_ code: String, message: String, error: Error? = nil) {
        let pending = waiters; waiters.removeAll(); registrationEpoch = nil
        pending.values.forEach { $0.reject(code, message, error) }
    }
    @objc(bindConnection:resolver:rejecter:)
    func bindConnection(_ binding: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard UUID(uuidString: binding) != nil else { reject("INVALID_BINDING", "알림 연결 정보를 확인하지 못했습니다.", nil); return }
        DispatchQueue.main.async {
            let changed = PushConnectionStore.shared.bind(binding), context = PushConnectionStore.shared.context()
            if changed { self.removeDeliveredNotifications() }
            Task { @MainActor in
                guard #available(iOS 16.2, *) else { resolve(nil); return }
                do { try await BookingActivityController.shared.bind(context); resolve(nil) }
                catch { reject("ACTIVITY_BINDING_FAILED", "상시알림 연결을 준비하지 못했습니다.", error) }
            }
        }
    }
    @objc(clearConnection:rejecter:)
    func clearConnection(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            self.failWaiters("SESSION_CHANGED", message: "알림 연결 계정이 변경되었습니다.")
            PushConnectionStore.shared.clear()
            UIApplication.shared.unregisterForRemoteNotifications()
            self.removeDeliveredNotifications()
            Task { @MainActor in
                guard #available(iOS 16.2, *) else { resolve(nil); return }
                do { try await BookingActivityController.shared.clear(); resolve(nil) }
                catch { reject("ACTIVITY_CLEAR_FAILED", "이전 상시알림을 정리하지 못했습니다.", error) }
            }
        }
    }
    private func removeDeliveredNotifications() {
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications(); center.removeAllPendingNotificationRequests()
        if #available(iOS 16.0, *) { center.setBadgeCount(0, withCompletionHandler: nil) }
        else { UIApplication.shared.applicationIconBadgeNumber = 0 }
    }
    @objc(getDeviceId:rejecter:)
    func getDeviceId(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        do { resolve(try PushConnectionStore.shared.deviceId()) }
        catch { reject("DEVICE_STORAGE_FAILED", error.localizedDescription, error) }
    }
    @objc(getConnectionStatus:rejecter:)
    func getConnectionStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let store = PushConnectionStore.shared, permission = Self.permission(settings.authorizationStatus)
            do { resolve(["permission": permission, "connected": permission == "granted" && store.context().binding != nil && store.token() != nil, "deviceId": try store.deviceId()]) }
            catch { reject("DEVICE_STORAGE_FAILED", error.localizedDescription, error) }
        }
    }
    @objc(getInitialTarget:rejecter:)
    func getInitialTarget(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let target = PushConnectionStore.shared.takeTarget() { resolve(target) } else { resolve(NSNull()) }
    }
    @objc(consumeTrustedAction:resolver:rejecter:)
    func consumeTrustedAction(_ nonce: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(PushConnectionStore.shared.consumeTrustedAction(nonce))
    }
    @objc(syncBookingSchedule:resolver:rejecter:)
    func syncBookingSchedule(_ snapshot: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task { @MainActor in
            guard #available(iOS 16.2, *) else { resolve(["supported": false]); return }
            do { resolve(try await BookingActivityController.shared.sync(snapshot)) }
            catch { reject("LIVE_ACTIVITY_FAILED", error.localizedDescription, error) }
        }
    }
    @objc(clearBookingSchedule:rejecter:)
    func clearBookingSchedule(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task { @MainActor in
            do { try await BookingActivityController.shared.clear(); resolve(nil) }
            catch { reject("LIVE_ACTIVITY_CLEAR_FAILED", "상시알림을 정리하지 못했습니다.", error) }
        }
    }
    @objc(getQaConfiguration:rejecter:)
    func getQaConfiguration(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-PM_NATIVE_QA_SCREEN"), arguments.indices.contains(index + 1),
              ["booking", "mypage", "admin", "notifications"].contains(arguments[index + 1]) else { resolve(NSNull()); return }
        let permission = arguments.firstIndex(of: "-PM_NATIVE_QA_PERMISSION").flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        resolve(["screen": arguments[index + 1], "requestOsPermission": permission?.uppercased() == "YES"])
#else
        resolve(NSNull())
#endif
    }
}
