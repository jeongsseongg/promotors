import ActivityKit
import SwiftUI

@available(iOS 16.2, *)
struct BookingActivityCard: View {
    let state: BookingActivityAttributes.ContentState
    let binding: String
    var island = false
    private var ink: Color { island ? .white : Color(red: 0.03, green: 0.12, blue: 0.33) }
    private var secondary: Color { island ? .white.opacity(0.72) : Color(red: 0.40, green: 0.46, blue: 0.53) }
    private var pending: Bool { state.pendingCount > 0 }
    private var time: String { state.schedule.split(separator: "·").last.map { String($0).trimmingCharacters(in: .whitespaces) } ?? "예약 일정" }
    private var day: String { state.schedule.split(separator: "·").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? "" }
    private var appointment: Date { Date(timeIntervalSince1970: state.startsAt) }
    static func url(_ id: String, binding: String) -> URL? {
        var url = URLComponents(string: "promotors://booking")
        url?.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "binding", value: binding)]
        return url?.url
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center) {
                Text(pending ? "승인 대기 \(state.pendingCount)건" : "승인 대기 없음")
                    .font(.system(size: pending ? 22 : 17, weight: .bold))
                Spacer(minLength: 4)
                Text("방문 예정 \(state.upcomingCount)건").font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(ink.opacity(0.06), in: Capsule())
            }
            HStack(spacing: 8) {
                Text((state.customerName ?? "").isEmpty ? "예약 고객" : (state.customerName ?? ""))
                    .font(.system(size: 14, weight: .bold))
                Text([state.vehicleName, state.vehiclePlate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(secondary)
            }.lineLimit(1).privacySensitive()
            countdown
            if state.startsAt > 0 {
                ProgressView(timerInterval: appointment.addingTimeInterval(-3600)...appointment, countsDown: false) {
                    EmptyView()
                } currentValueLabel: { EmptyView() }
                .tint(Color(red: 0.91, green: 0.71, blue: 0.08))
                .accessibilityLabel("예약 1시간 전부터의 시간 진행")
            }
            HStack(spacing: 8) {
                Text(state.branch).font(.system(size: 11)).foregroundStyle(secondary).lineLimit(1)
                Spacer(minLength: 0)
                if let url = Self.url(state.bookingId, binding: binding) {
                    Link(pending ? "승인·거절하기 ›" : "예약 확인 ›", destination: url)
                        .font(.system(size: 13, weight: .bold))
                }
            }
        }.padding(island ? 0 : 12).foregroundStyle(ink)
    }
    private var countdown: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(state.startsAt > 0 ? "해당 예약까지" : "예약 일정 확인")
                .font(.system(size: 11, weight: .medium)).foregroundStyle(secondary)
            if state.startsAt > Date().timeIntervalSince1970 {
                Text(timerInterval: Date()...appointment, countsDown: true)
                    .font(.system(size: 22, weight: .bold, design: .rounded)).monospacedDigit()
                    .multilineTextAlignment(.leading).frame(width: 104).minimumScaleFactor(0.8)
            } else {
                Text(state.startsAt > 0 ? "시간 도착" : time).font(.system(size: 17, weight: .bold))
            }
            Spacer(minLength: 0)
            Text("\(day) \(time)").font(.system(size: 11, weight: .semibold)).monospacedDigit()
        }
    }
}
