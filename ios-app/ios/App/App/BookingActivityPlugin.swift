import ActivityKit
import Capacitor

class BookingBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BookingActivityPlugin())
    }
}

@objc(BookingActivityPlugin)
public class BookingActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BookingActivityPlugin"
    public let jsName = "BookingActivity"
    public let pluginMethods = [CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
                                CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)].compactMap { $0 }
    private static weak var instance: BookingActivityPlugin?
    private static var openedBooking: (id: String, action: String?, binding: String?)?
    private let stateLock = NSLock()
    private var generation: UInt = 0
    private var activeBinding: String?
    private var tokenTasks: [Task<Void, Never>] = []
    private var observedActivities = Set<String>()
    private var startObserved = false
    private var observedBinding: String?
    public override func load() {
        Self.instance = self
        if let booking = Self.openedBooking { self.open(booking.id, action: booking.action, binding: booking.binding) }
    }
    static func capture(_ url: URL) {
        guard url.scheme == "promotors", url.host == "booking",
              let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "id" })?.value,
              !id.isEmpty, id.count <= 128 else { return }
        let action = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "action" })?.value
        let requestedAction = ["accept", "reject"].contains(action ?? "") ? action : nil
        let binding = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "binding" })?.value
        openedBooking = (id, requestedAction, binding)
        instance?.open(id, action: requestedAction, binding: binding)
    }
    private func open(_ id: String, action: String?, binding: String?) {
        var data: [String: Any] = ["id": id]
        if let binding = binding, !binding.isEmpty, let action = action {
            let trusted = isActive(binding) || systemActivityMatches(id, binding: binding)
            data["action"] = action; data["trustedAction"] = trusted; data["binding"] = binding
        }
        /* AUTH_RECHECK: JavaScript must match this binding to the restored current account. */
        notifyListeners("bookingOpen", data: data, retainUntilConsumed: true)
        Self.openedBooking = nil
    }
    private func systemActivityMatches(_ id: String, binding: String) -> Bool {
        stateLock.lock(); let mayRestore = activeBinding == nil; stateLock.unlock()
        guard mayRestore else { return false }
        if #available(iOS 16.2, *) {
            return Activity<BookingActivityAttributes>.activities.contains {
                $0.attributes.binding == binding && $0.content.state.bookingId == id
            }
        }
        return false
    }
    private func advance(_ binding: String?) -> UInt {
        stateLock.lock(); defer { stateLock.unlock() }
        generation &+= 1; activeBinding = binding
        return generation
    }
    private func isCurrent(_ binding: String?, generation expected: UInt) -> Bool {
        stateLock.lock(); defer { stateLock.unlock() }
        return generation == expected && activeBinding == binding
    }
    private func isActive(_ binding: String) -> Bool {
        stateLock.lock(); defer { stateLock.unlock() }
        return activeBinding == binding
    }
    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["supported": false]); return }
        guard let binding = call.getString("binding"), !binding.isEmpty else { call.reject("ACCOUNT_BINDING_REQUIRED"); return }
        let state = BookingActivityAttributes.ContentState(
            pendingCount: call.getInt("pendingCount") ?? 0, upcomingCount: call.getInt("upcomingCount") ?? 0,
            branch: call.getString("branch") ?? "프로모터스", schedule: call.getString("schedule") ?? "",
            bookingId: call.getString("bookingId") ?? "", startsAt: call.getDouble("startsAt") ?? 0,
            customerName: call.getString("customerName"), vehicleName: call.getString("vehicleName"),
            vehiclePlate: call.getString("vehiclePlate"))
        let currentGeneration = advance(binding)
        Task { @MainActor in
            do {
                guard isCurrent(binding, generation: currentGeneration) else { call.resolve(["stale": true]); return }
                if observedBinding != binding {
                    tokenTasks.forEach { $0.cancel() }; tokenTasks.removeAll()
                    observedActivities.removeAll(); startObserved = false; observedBinding = binding
                }
                for activity in Activity<BookingActivityAttributes>.activities where activity.attributes.binding != binding {
                    await activity.end(nil, dismissalPolicy: .immediate)
                    guard isCurrent(binding, generation: currentGeneration) else { call.resolve(["stale": true]); return }
                }
                guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["supported": true, "enabled": false]); return }
                if state.pendingCount + state.upcomingCount == 0 {
                    for activity in Activity<BookingActivityAttributes>.activities {
                        await activity.end(nil, dismissalPolicy: .immediate)
                        guard isCurrent(binding, generation: currentGeneration) else { call.resolve(["stale": true]); return }
                    }
                } else {
                    let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(300))
                    if let current = Activity<BookingActivityAttributes>.activities.first(where: { $0.attributes.binding == binding }) {
                        await current.update(content)
                        guard isCurrent(binding, generation: currentGeneration) else { call.resolve(["stale": true]); return }
                        observe(current, binding: binding)
                    } else {
                        guard isCurrent(binding, generation: currentGeneration) else { call.resolve(["stale": true]); return }
                        let activity = try Activity.request(attributes: BookingActivityAttributes(binding: binding), content: content, pushType: .token)
                        observe(activity, binding: binding)
                    }
                }
                if #available(iOS 17.2, *) { observeStart(binding: binding) }
                call.resolve(["supported": true, "enabled": true])
            } catch { call.reject("LIVE_ACTIVITY_START_FAILED") }
        }
    }
    @available(iOS 16.2, *)
    private func observe(_ activity: Activity<BookingActivityAttributes>, binding: String) {
        guard observedActivities.insert(activity.id).inserted else { return }
        tokenTasks.append(Task { @MainActor in
            for await token in activity.pushTokenUpdates {
                guard isActive(binding), !Task.isCancelled else { return }
                notifyListeners("activityToken", data: ["kind": "update", "binding": binding,
                    "token": token.map { String(format: "%02x", $0) }.joined()], retainUntilConsumed: true)
            }
        })
    }
    @available(iOS 17.2, *)
    private func observeStart(binding: String) {
        guard !startObserved else { return }
        startObserved = true
        tokenTasks.append(Task { @MainActor in
            for await activity in Activity<BookingActivityAttributes>.activityUpdates where activity.attributes.binding == binding {
                guard isActive(binding), !Task.isCancelled else { return }
                observe(activity, binding: binding)
            }
        })
        tokenTasks.append(Task { @MainActor in
            for await token in Activity<BookingActivityAttributes>.pushToStartTokenUpdates {
                guard isActive(binding), !Task.isCancelled else { return }
                notifyListeners("activityToken", data: ["kind": "start", "binding": binding,
                    "token": token.map { String(format: "%02x", $0) }.joined()], retainUntilConsumed: true)
            }
        })
    }
    @objc func clear(_ call: CAPPluginCall) {
        let currentGeneration = advance(nil)
        Self.openedBooking = nil
        Task { @MainActor in
            guard isCurrent(nil, generation: currentGeneration) else { call.resolve(); return }
            tokenTasks.forEach { $0.cancel() }; tokenTasks.removeAll()
            observedActivities.removeAll(); startObserved = false; observedBinding = nil
            if #available(iOS 16.2, *) {
                for activity in Activity<BookingActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                    guard isCurrent(nil, generation: currentGeneration) else { call.resolve(); return }
                }
            }
            call.resolve()
        }
    }
}
