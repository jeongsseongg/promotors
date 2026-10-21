import ActivityKit
import SwiftUI

@available(iOS 16.2, *)
struct BookingActivityCard: View {
    let state: BookingActivityAttributes.ContentState
    let binding: String
    var island = false
    private var ink: Color { island ? .white : Color(red: 0.03, green: 0.12, blue: 0.33) }
    private var secondary: Color { island ? .white.opacity(0.72) : Color(red: 0.40, green: 0.46, blue: 0.53) }
    private var time: String { state.schedule.split(separator: "·").last.map { String($0).trimmingCharacters(in: .whitespaces) } ?? "예약 일정" }
    private var date: String { state.schedule.contains("·") ? String(state.schedule.split(separator: "·")[0]).trimmingCharacters(in: .whitespaces) : "" }
    private var appointment: Date { Date(timeIntervalSince1970: state.startsAt) }
    static func url(_ id: String, binding: String) -> URL? {
        var url = URLComponents(string: "promotors://booking")
        url?.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "binding", value: binding)]
        return url?.url
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !island {
                HStack {
                    Label("프로모터스", systemImage: "car.fill").font(.system(size: 13, weight: .bold))
                    Spacer()
                    Text("예약 일정").font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(ink.opacity(0.06), in: Capsule())
                }
            }
            countdown
            if state.startsAt > 0 {
                VStack(spacing: 6) {
                    ProgressView(timerInterval: appointment.addingTimeInterval(-3600)...appointment, countsDown: false) {
                        EmptyView()
                    } currentValueLabel: { EmptyView() }
                    .tint(Color(red: 0.91, green: 0.71, blue: 0.08))
                    HStack {
                        Text("1시간 전")
                        Spacer()
                        Text("예약 \(time)")
                    }.font(.system(size: 11, weight: .medium)).foregroundStyle(secondary)
                }.accessibilityLabel("예약 1시간 전부터의 시간 진행")
            }
            VStack(alignment: .leading, spacing: 4) {
                Text((state.customerName ?? "").isEmpty ? "예약 고객" : (state.customerName ?? ""))
                    .font(.system(size: 16, weight: .bold)).lineLimit(1)
                Text([state.vehicleName, state.vehiclePlate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(secondary).lineLimit(2)
            }.privacySensitive()
            HStack(spacing: 8) {
                Text("처리 대기 \(state.pendingCount)건 · 방문 예정 \(state.upcomingCount)건")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(secondary).lineLimit(1)
                Spacer(minLength: 0)
                if let url = Self.url(state.bookingId, binding: binding) {
                    Link("예약 확인 ›", destination: url).font(.system(size: 13, weight: .bold))
                }
            }
        }.padding(island ? 0 : 16).foregroundStyle(ink)
    }
    private var countdown: some View {
        HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(state.startsAt > 0 ? "예약 시간까지" : "예약 일정 확인")
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
                if state.startsAt > Date().timeIntervalSince1970 {
                    Text(timerInterval: Date()...appointment, countsDown: true)
                        .font(.system(size: 38, weight: .bold, design: .rounded)).monospacedDigit()
                        .multilineTextAlignment(.leading)
                } else {
                    Text(state.startsAt > 0 ? "예약 시간 도착" : time).font(.system(size: 25, weight: .bold))
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 4) {
                Text(time).font(.system(size: 19, weight: .bold)).monospacedDigit()
                Text(date).font(.system(size: 11)).foregroundStyle(secondary)
                Text(state.branch).font(.system(size: 11)).foregroundStyle(secondary).lineLimit(1)
            }.padding(.bottom, 4)
        }
    }
}
