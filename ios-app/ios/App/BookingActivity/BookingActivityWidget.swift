import ActivityKit
import SwiftUI
import WidgetKit

@main
struct BookingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BookingActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("프로모터스").font(.headline)
                    Spacer()
                    Text(context.state.pendingCount > 0 ? "수락 대기 \(context.state.pendingCount)건" : "방문 예정 \(context.state.upcomingCount)건")
                        .font(.subheadline.bold()).foregroundStyle(Color.yellow)
                }
                Text(context.state.branch).font(.subheadline).foregroundStyle(.secondary)
                HStack {
                    Text(context.state.schedule).font(.title3.bold())
                    Spacer()
                    if context.state.startsAt > Date().timeIntervalSince1970 {
                        Text(Date(timeIntervalSince1970: context.state.startsAt), style: .relative).font(.subheadline.monospacedDigit())
                    }
                }
                Text("눌러서 예약 일정 확인").font(.caption).foregroundStyle(.secondary)
            }
            .padding(16)
            .foregroundStyle(.white)
            .activityBackgroundTint(Color(red: 0.06, green: 0.12, blue: 0.24))
            .activitySystemActionForegroundColor(.white)
            .widgetURL(link(context.state.bookingId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text("프로모터스").font(.headline) }
                DynamicIslandExpandedRegion(.trailing) { Text(context.state.pendingCount > 0 ? "대기 \(context.state.pendingCount)" : "방문 \(context.state.upcomingCount)").font(.headline) }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(context.state.branch).font(.caption)
                        Text(context.state.schedule).font(.headline)
                        Text("예약 일정 확인").font(.caption)
                    }
                }
            } compactLeading: { Image(systemName: "wrench.and.screwdriver") }
              compactTrailing: { Text("\(context.state.pendingCount > 0 ? context.state.pendingCount : context.state.upcomingCount)") }
              minimal: { Image(systemName: "wrench") }
              .widgetURL(link(context.state.bookingId))
        }
    }
    private func link(_ id: String) -> URL? {
        var url = URLComponents(string: "promotors://booking")
        url?.queryItems = [URLQueryItem(name: "id", value: id)]
        return url?.url
    }
}
