import ActivityKit
import SwiftUI
import WidgetKit

@main
struct BookingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BookingActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("프로모터스").font(.subheadline.bold())
                    Spacer()
                    Text(context.state.pendingCount > 0 ? "수락 대기 \(context.state.pendingCount)건" : "방문 예정 \(context.state.upcomingCount)건")
                        .font(.caption.bold()).foregroundStyle(Color.yellow)
                }
                HStack {
                    Text(context.state.schedule).font(.subheadline.bold())
                    Spacer()
                    if context.state.startsAt > Date().timeIntervalSince1970 {
                        Text(Date(timeIntervalSince1970: context.state.startsAt), style: .relative).font(.subheadline.monospacedDigit())
                    }
                }
                bookingIdentity(context.state)
                bookingActions(context.state, binding: context.attributes.binding)
            }
            .padding(12)
            .foregroundStyle(.white)
            .activityBackgroundTint(Color(red: 0.06, green: 0.12, blue: 0.24))
            .activitySystemActionForegroundColor(.white)
            .widgetURL(link(context.state.bookingId, binding: context.attributes.binding))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text("프로모터스").font(.headline) }
                DynamicIslandExpandedRegion(.trailing) { Text(context.state.pendingCount > 0 ? "대기 \(context.state.pendingCount)" : "방문 \(context.state.upcomingCount)").font(.headline) }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(context.state.branch).font(.caption)
                        Text(context.state.schedule).font(.headline)
                        bookingIdentity(context.state)
                        bookingActions(context.state, binding: context.attributes.binding)
                    }
                }
            } compactLeading: { Image(systemName: "wrench.and.screwdriver") }
              compactTrailing: { Text("\(context.state.pendingCount > 0 ? context.state.pendingCount : context.state.upcomingCount)") }
              minimal: { Image(systemName: "wrench") }
              .widgetURL(link(context.state.bookingId, binding: context.attributes.binding))
        }
    }
    private func bookingIdentity(_ state: BookingActivityAttributes.ContentState) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let customer = state.customerName, !customer.isEmpty {
                Text("\(customer) · \(state.branch)").font(.subheadline.bold()).lineLimit(1)
            } else {
                Text(state.branch).font(.subheadline).lineLimit(1)
            }
            let vehicle = [state.vehicleName, state.vehiclePlate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            if !vehicle.isEmpty { Text(vehicle).font(.caption).lineLimit(1) }
        }
    }
    @ViewBuilder
    private func bookingActions(_ state: BookingActivityAttributes.ContentState, binding: String) -> some View {
        if state.pendingCount > 0, !state.bookingId.isEmpty {
            HStack(spacing: 12) {
                if let accept = link(state.bookingId, binding: binding, action: "accept") { Link(destination: accept) {
                    Text("예약 승인").font(.subheadline.bold()).frame(maxWidth: .infinity).padding(.vertical, 6)
                        .foregroundStyle(Color.black).background(Color.yellow, in: RoundedRectangle(cornerRadius: 12))
                } }
                if let reject = link(state.bookingId, binding: binding, action: "reject") { Link(destination: reject) {
                    Text("거절").font(.subheadline.bold()).frame(maxWidth: .infinity).padding(.vertical, 6)
                        .foregroundStyle(Color.white).background(Color.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                } }
            }
        } else {
            Text("눌러서 예약 정보 확인").font(.caption).foregroundStyle(.secondary)
        }
    }
    private func link(_ id: String, binding: String, action: String? = nil) -> URL? {
        var url = URLComponents(string: "promotors://booking")
        url?.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "binding", value: binding)]
        if let action = action { url?.queryItems?.append(URLQueryItem(name: "action", value: action)) }
        return url?.url
    }
}
