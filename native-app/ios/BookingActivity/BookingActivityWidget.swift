import ActivityKit
import SwiftUI
import WidgetKit

@main
struct BookingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BookingActivityAttributes.self) { context in
            BookingActivityCard(state: context.state, binding: context.attributes.binding)
                .activityBackgroundTint(.white)
                .activitySystemActionForegroundColor(Color(red: 0.03, green: 0.12, blue: 0.33))
                .widgetURL(BookingActivityCard.url(context.state.bookingId, binding: context.attributes.binding))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("프로모터스", systemImage: "wrench.adjustable").font(.system(size: 13, weight: .semibold))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("대기 \(context.state.pendingCount) · 방문 \(context.state.upcomingCount)")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.72))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    BookingActivityCard(state: context.state, binding: context.attributes.binding, island: true).padding(.top, 8)
                }
            } compactLeading: {
                Image(systemName: "wrench.adjustable").foregroundStyle(.yellow)
            } compactTrailing: {
                Text("\(context.state.pendingCount > 0 ? context.state.pendingCount : context.state.upcomingCount)")
                    .font(.system(size: 13, weight: .bold)).monospacedDigit()
            } minimal: {
                Image(systemName: "wrench.adjustable").foregroundStyle(.yellow)
            }
            .widgetURL(BookingActivityCard.url(context.state.bookingId, binding: context.attributes.binding))
        }
    }
}
