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
    static func url(_ id: String, binding: String) -> URL? {
        var url = URLComponents(string: "promotors://booking")
        url?.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "binding", value: binding)]
        return url?.url
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !island {
                HStack {
                    Label("프로모터스", systemImage: "wrench.adjustable").font(.system(size: 13, weight: .bold))
                    Spacer(minLength: 8)
                    Text("대기 \(state.pendingCount) · 방문 \(state.upcomingCount)")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(time).font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit()
                Text(date).font(.system(size: 13)).foregroundStyle(secondary)
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text((state.customerName ?? "").isEmpty ? "예약 고객" : (state.customerName ?? ""))
                    .font(.system(size: 17, weight: .bold)).lineLimit(2)
                Text([state.vehicleName, state.vehiclePlate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 15, weight: .medium)).lineLimit(2)
            }.privacySensitive()
            HStack(alignment: .center, spacing: 8) {
                Text(state.branch).font(.system(size: 12)).foregroundStyle(secondary).lineLimit(1)
                Spacer(minLength: 4)
                if let url = Self.url(state.bookingId, binding: binding) {
                    Link(destination: url) {
                        HStack(spacing: 4) {
                            Text("예약 정보 확인").font(.system(size: 13, weight: .semibold))
                            Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                        }
                    }
                }
            }
        }
        .padding(island ? 0 : 16)
        .foregroundStyle(ink)
    }
}
