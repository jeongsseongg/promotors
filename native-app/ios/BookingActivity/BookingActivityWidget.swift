import ActivityKit
import SwiftUI
import WidgetKit

@main
struct BookingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BookingActivityAttributes.self) { context in
            BookingActivityCard(state: context.state, binding: context.attributes.binding)
                .activityBackgroundTint(.white)
                .activitySystemActionForegroundColor(PromotorsActivityPalette.navy)
                .widgetURL(BookingActivityCard.url(context.state.bookingId, binding: context.attributes.binding, runId: context.state.runId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("프로모터스", systemImage: "wrench.adjustable").font(.system(size: 13, weight: .semibold))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.audience == "customer" ? "내 차의 정비 현황" : "예약 처리 현황")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.72))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    BookingActivityCard(state: context.state, binding: context.attributes.binding, island: true).padding(.top, 8)
                }
            } compactLeading: {
                HStack(spacing: 3) {
                    Image(systemName: "car.fill").foregroundStyle(PromotorsActivityPalette.yellow).font(.system(size: 10))
                    Text(context.state.audience == "customer" ? (context.state.phase == "completed" ? "완료" : "내 차") : "대기 \(context.state.pendingCount)").font(.system(size: 11, weight: .bold))
                }
            } compactTrailing: {
                Text(context.state.audience == "customer" ? (context.state.phase == "repair" ? "정비 중" : context.state.phase == "completed" ? "정비 완료" : "방문 예정") : "방문 \(context.state.upcomingCount)").font(.system(size: 12, weight: .semibold))
            } minimal: {
                Image(systemName: "car.fill").foregroundStyle(PromotorsActivityPalette.yellow)
            }
            .widgetURL(BookingActivityCard.url(context.state.bookingId, binding: context.attributes.binding, runId: context.state.runId))
        }
    }
}
