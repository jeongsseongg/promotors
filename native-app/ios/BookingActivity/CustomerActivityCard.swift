import ActivityKit
import SwiftUI

@available(iOS 16.2, *)
struct CustomerActivityCard: View {
    let state: BookingActivityAttributes.ContentState
    let binding: String
    var island = false
    private var ink: Color { island ? .white : Color(red: 0.03, green: 0.12, blue: 0.33) }
    private var muted: Color { ink.opacity(0.65) }
    private var stage: Int { ["confirmed", "visit", "repair", "completed"].firstIndex(of: state.phase ?? "") ?? 0 }
    private var title: String { ["예약이 확정되었어요", "방문을 기다리고 있어요", "내 차 정비 중", "정비가 완료되었어요"][stage] }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.system(size: 20, weight: .bold))
                Spacer(minLength: 4)
                Image(systemName: stage == 3 ? "checkmark.circle.fill" : "car.fill")
                    .font(.system(size: 24)).foregroundStyle(stage == 3 ? Color.green : Color.yellow)
            }
            Text([state.vehicleName, state.vehiclePlate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.system(size: 13, weight: .medium)).lineLimit(1).privacySensitive()
            if stage < 2 && state.startsAt > Date().timeIntervalSince1970 {
                let now = Date(), end = Date(timeIntervalSince1970: state.startsAt)
                HStack(spacing: 8) {
                    Text("방문까지").font(.system(size: 12)).foregroundStyle(muted)
                    Text(timerInterval: min(now, end)...end, countsDown: true)
                        .font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit().frame(width: 110)
                    Spacer(minLength: 0)
                }
            } else {
                Text(state.stageLabel ?? "앱에서 최신 내역을 확인하세요")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(muted).lineLimit(1)
            }
            ProgressView(value: Double(state.progress ?? 0), total: 100).tint(.yellow)
            HStack(spacing: 0) {
                ForEach(Array(["예약 확정", "방문 예정", "정비 진행", "완료"].enumerated()), id: \.offset) { index, label in
                    Text(label).font(.system(size: 10, weight: index == stage ? .bold : .regular))
                        .foregroundStyle(index <= stage ? ink : muted.opacity(0.5))
                        .frame(maxWidth: .infinity, alignment: index == 0 ? .leading : index == 3 ? .trailing : .center)
                }
            }
            HStack {
                Text(state.branch).font(.system(size: 11)).foregroundStyle(muted).lineLimit(1)
                Spacer(minLength: 4)
                Text((state.runId ?? "").isEmpty ? "예약 확인 ›" : "정비내역·사진 보기 ›").font(.system(size: 12, weight: .bold))
            }
        }.padding(island ? 0 : 12).foregroundStyle(ink)
    }
}
