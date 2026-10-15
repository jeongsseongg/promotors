import ActivityKit
import SwiftUI
import WidgetKit

@main
struct BookingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BookingActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("프로모터스").font(.headline)
                    Spacer()
                    Text(status(context.state)).font(.subheadline.bold()).foregroundStyle(.yellow)
                }
                HStack {
                    Text(context.state.schedule).font(.subheadline.bold())
                    Spacer()
                    if context.state.startsAt > Date().timeIntervalSince1970 {
                        Text(Date(timeIntervalSince1970: context.state.startsAt), style: .relative)
                            .font(.caption.monospacedDigit())
                    }
                }
                identity(context.state)
                detailsLink(context.state.bookingId, binding: context.attributes.binding)
            }
            .padding(16)
            .foregroundStyle(.white)
            .activityBackgroundTint(Color(red: 0.03, green: 0.09, blue: 0.24))
            .activitySystemActionForegroundColor(.white)
            .widgetURL(link(context.state.bookingId, binding: context.attributes.binding))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("프로모터스", systemImage: "wrench.and.screwdriver").font(.subheadline.bold())
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(status(context.state)).font(.subheadline.bold()).foregroundStyle(.yellow)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(context.state.schedule).font(.headline)
                        identity(context.state)
                        detailsLink(context.state.bookingId, binding: context.attributes.binding)
                    }
                }
            } compactLeading: {
                Image(systemName: "wrench.and.screwdriver").foregroundStyle(.yellow)
            } compactTrailing: {
                Text("\(context.state.pendingCount > 0 ? context.state.pendingCount : context.state.upcomingCount)")
            } minimal: {
                Image(systemName: "wrench").foregroundStyle(.yellow)
            }
            .widgetURL(link(context.state.bookingId, binding: context.attributes.binding))
        }
    }
    private func status(_ state: BookingActivityAttributes.ContentState) -> String {
        state.pendingCount > 0 ? "처리 대기 \(state.pendingCount)건" : "방문 예정 \(state.upcomingCount)건"
    }
    private func identity(_ state: BookingActivityAttributes.ContentState) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            let customer = [state.customerName, state.branch].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            Text(customer).font(.subheadline.bold()).lineLimit(2)
            let vehicle = [state.vehicleName, state.vehiclePlate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            if !vehicle.isEmpty { Text(vehicle).font(.subheadline).lineLimit(2) }
        }
    }
    @ViewBuilder
    private func detailsLink(_ id: String, binding: String) -> some View {
        if let url = link(id, binding: binding) {
            Link(destination: url) {
                Text("예약 정보 확인").font(.subheadline.bold())
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                    .foregroundStyle(.black)
                    .background(.yellow, in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }
    private func link(_ id: String, binding: String) -> URL? {
        var url = URLComponents(string: "promotors://booking")
        url?.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "binding", value: binding)]
        return url?.url
    }
}
