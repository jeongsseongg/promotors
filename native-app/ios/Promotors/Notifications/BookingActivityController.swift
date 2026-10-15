import ActivityKit
import Foundation

@available(iOS 16.2, *)
@MainActor
final class BookingActivityController {
    static let shared = BookingActivityController()
    private typealias Outcome = Result<[String: Bool], Error>
    private var operation: Task<Outcome, Never>?
    private var generation: UInt = 0
    private var tokenTasks: [Task<Void, Never>] = []
    private var observedActivities = Set<String>()
    private var observedContext: PushConnectionEpoch?
    private var startObserved = false

    private func enqueue(_ context: PushConnectionEpoch,
                         action: @escaping (UInt) async throws -> [String: Bool]) async throws -> [String: Bool] {
        generation &+= 1
        let ticket = generation, previous = operation
        let next = Task { @MainActor () -> Outcome in
            if let previous { _ = await previous.value }
            guard self.current(context, ticket: ticket) else { return .success(["stale": true]) }
            do { return .success(try await action(ticket)) }
            catch { return .failure(error) }
        }
        operation = next
        return try await next.value.get()
    }
    private func current(_ context: PushConnectionEpoch, ticket: UInt) -> Bool {
        generation == ticket && PushConnectionStore.shared.isCurrent(context)
    }
    private func stopObservers() {
        tokenTasks.forEach { $0.cancel() }; tokenTasks.removeAll()
        observedActivities.removeAll(); startObserved = false; observedContext = nil
    }
    func bind(_ context: PushConnectionEpoch) async throws {
        if observedContext != context { stopObservers() }
        _ = try await enqueue(context) { ticket in
            for activity in Activity<BookingActivityAttributes>.activities where activity.attributes.binding != context.binding {
                await activity.end(nil, dismissalPolicy: .immediate)
                guard self.current(context, ticket: ticket) else { return ["stale": true] }
            }
            self.observedContext = context
            if #available(iOS 17.2, *) { self.observeStart(context) }
            return ["supported": true]
        }
    }
    func sync(_ values: NSDictionary) async throws -> [String: Bool] {
        let context = PushConnectionStore.shared.context()
        guard let binding = values["binding"] as? String, binding == context.binding else { throw PushNativeError.binding }
        let state = BookingActivityAttributes.ContentState(
            pendingCount: max(0, min(10000, (values["pendingCount"] as? NSNumber)?.intValue ?? 0)),
            upcomingCount: max(0, min(10000, (values["upcomingCount"] as? NSNumber)?.intValue ?? 0)),
            branch: Self.text(values["branch"], limit: 80), schedule: Self.text(values["schedule"], limit: 100),
            bookingId: Self.text(values["bookingId"], limit: 160),
            startsAt: Self.timestamp(values["startsAt"]),
            customerName: Self.text(values["customerName"], limit: 60),
            vehicleName: Self.text(values["vehicleName"], limit: 80),
            vehiclePlate: Self.text(values["vehiclePlate"], limit: 30))
        let active = values["active"] as? Bool == true && state.pendingCount + state.upcomingCount > 0
        return try await enqueue(context) { ticket in
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return ["supported": true, "enabled": false] }
            for activity in Activity<BookingActivityAttributes>.activities where !active || activity.attributes.binding != binding {
                await activity.end(nil, dismissalPolicy: .immediate)
                guard self.current(context, ticket: ticket) else { return ["stale": true] }
            }
            if active {
                let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(300))
                if let activity = Activity<BookingActivityAttributes>.activities.first(where: { $0.attributes.binding == binding }) {
                    await activity.update(content)
                    self.observe(activity, context: context)
                } else {
                    let activity = try Activity.request(attributes: BookingActivityAttributes(binding: binding), content: content, pushType: .token)
                    self.observe(activity, context: context)
                }
            }
            guard self.current(context, ticket: ticket) else { return ["stale": true] }
            if #available(iOS 17.2, *) { self.observeStart(context) }
            return ["supported": true, "enabled": true]
        }
    }
    func clear() async throws {
        stopObservers()
        let context = PushConnectionStore.shared.context()
        _ = try await enqueue(context) { ticket in
            for activity in Activity<BookingActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
                guard self.current(context, ticket: ticket) else { return ["stale": true] }
            }
            return ["supported": true]
        }
    }
    private func observe(_ activity: Activity<BookingActivityAttributes>, context: PushConnectionEpoch) {
        guard observedActivities.insert(activity.id).inserted else { return }
        if let token = activity.pushToken { emit(token, kind: "update", context: context) }
        tokenTasks.append(Task { @MainActor in
            for await token in activity.pushTokenUpdates {
                guard PushConnectionStore.shared.isCurrent(context), !Task.isCancelled else { return }
                self.emit(token, kind: "update", context: context)
            }
        })
    }
    @available(iOS 17.2, *)
    private func observeStart(_ context: PushConnectionEpoch) {
        guard !startObserved, context.binding != nil else { return }
        startObserved = true
        if let token = Activity<BookingActivityAttributes>.pushToStartToken { emit(token, kind: "start", context: context) }
        tokenTasks.append(Task { @MainActor in
            for await activity in Activity<BookingActivityAttributes>.activityUpdates where activity.attributes.binding == context.binding {
                guard PushConnectionStore.shared.isCurrent(context), !Task.isCancelled else { return }
                self.observe(activity, context: context)
            }
        })
        tokenTasks.append(Task { @MainActor in
            for await token in Activity<BookingActivityAttributes>.pushToStartTokenUpdates {
                guard PushConnectionStore.shared.isCurrent(context), !Task.isCancelled else { return }
                self.emit(token, kind: "start", context: context)
            }
        })
    }
    private func emit(_ token: Data, kind: String, context: PushConnectionEpoch) {
        guard PushConnectionStore.shared.isCurrent(context), let binding = context.binding else { return }
        PromotorsPush.emit("pm-activity-token", body: ["kind": kind, "binding": binding,
            "token": token.map { String(format: "%02x", $0) }.joined()])
    }
    private static func text(_ value: Any?, limit: Int) -> String { String((value as? String ?? "").prefix(limit)) }
    private static func timestamp(_ value: Any?) -> Double {
        let value = (value as? NSNumber)?.doubleValue ?? 0
        return value.isFinite && value >= 0 ? value : 0
    }
}
