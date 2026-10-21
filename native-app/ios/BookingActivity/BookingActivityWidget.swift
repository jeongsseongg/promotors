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
                    Text("예약 처리 현황")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.72))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    BookingActivityCard(state: context.state, binding: context.attributes.binding, island: true).padding(.top, 8)
                }
            } compactLeading: {
                Image(systemName: "car.fill").foregroundStyle(.yellow)
            } compactTrailing: {
                if context.state.pendingCount > 0 {
                    Text("대기 \(context.state.pendingCount)").font(.system(size: 12, weight: .bold))
                } else if context.state.startsAt > Date().timeIntervalSince1970 {
                    Text(timerInterval: Date()...Date(timeIntervalSince1970: context.state.startsAt), countsDown: true, showsHours: false)
                        .font(.system(size: 12, weight: .bold)).monospacedDigit().frame(width: 56)
                } else {
                    Text("예약").font(.system(size: 12, weight: .bold))
                }
            } minimal: {
                Image(systemName: "car.fill").foregroundStyle(.yellow)
            }
            .widgetURL(BookingActivityCard.url(context.state.bookingId, binding: context.attributes.binding))
        }
    }
}
