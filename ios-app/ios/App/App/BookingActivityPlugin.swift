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
    private static var openedBooking: String?
    private var tokenTasks: [Task<Void, Never>] = []
    private var observedActivities = Set<String>()
    private var startObserved = false
    public override func load() {
        Self.instance = self
        if let id = Self.openedBooking { self.open(id) }
    }
    static func capture(_ url: URL) {
        guard url.scheme == "promotors", url.host == "booking",
              let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "id" })?.value,
              !id.isEmpty, id.count <= 128 else { return }
        openedBooking = id
        instance?.open(id)
    }
    private func open(_ id: String) {
        notifyListeners("bookingOpen", data: ["id": id], retainUntilConsumed: true)
        Self.openedBooking = nil
    }
    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["supported": false]); return }
        guard let binding = call.getString("binding"), !binding.isEmpty else { call.reject("ACCOUNT_BINDING_REQUIRED"); return }
        let state = BookingActivityAttributes.ContentState(
            pendingCount: call.getInt("pendingCount") ?? 0, upcomingCount: call.getInt("upcomingCount") ?? 0,
            branch: call.getString("branch") ?? "프로모터스", schedule: call.getString("schedule") ?? "",
            bookingId: call.getString("bookingId") ?? "", startsAt: call.getDouble("startsAt") ?? 0)
        Task { @MainActor in
            do {
                for activity in Activity<BookingActivityAttributes>.activities where activity.attributes.binding != binding {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["supported": true, "enabled": false]); return }
                if state.pendingCount + state.upcomingCount == 0 {
                    for activity in Activity<BookingActivityAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
                } else {
                    let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(300))
                    if let current = Activity<BookingActivityAttributes>.activities.first {
                        await current.update(content)
                        observe(current, binding: binding)
                    } else {
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
                observe(activity, binding: binding)
            }
        })
        tokenTasks.append(Task { @MainActor in
            for await token in Activity<BookingActivityAttributes>.pushToStartTokenUpdates {
                notifyListeners("activityToken", data: ["kind": "start", "binding": binding,
                    "token": token.map { String(format: "%02x", $0) }.joined()], retainUntilConsumed: true)
            }
        })
    }
    @objc func clear(_ call: CAPPluginCall) {
        tokenTasks.forEach { $0.cancel() }; tokenTasks.removeAll()
        observedActivities.removeAll(); startObserved = false
        Self.openedBooking = nil
        Task { @MainActor in
            if #available(iOS 16.2, *) {
                for activity in Activity<BookingActivityAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
            }
            call.resolve()
        }
    }
}
