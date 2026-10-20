#if DEBUG
import SwiftUI
import UIKit

@available(iOS 16.2, *)
@MainActor
enum NativeQaActivityRenderer {
    static func capture() throws {
        guard NativeQaConfiguration.isAllowed else { return }
        let state = BookingActivityAttributes.ContentState(pendingCount: 1, upcomingCount: 1,
            branch: "프로모터스 안산점", schedule: "2026.10.22 · 10:00", bookingId: "qa-pending", startsAt: 0,
            customerName: "예시 고객", vehicleName: "BMW 520d", vehiclePlate: "차량번호 비공개")
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        for (name, island) in [("lock", false), ("island", true)] {
            let view = VStack(spacing: 0) {
                BookingActivityCard(state: state, binding: "00000000-0000-4000-8000-000000000015", island: island)
                    .padding(island ? 16 : 0)
                Text("테스트 화면 · 실제 발송 없음").font(.system(size: 11))
                    .foregroundStyle(island ? Color.white.opacity(0.7) : Color.gray).padding(.bottom, 8)
            }.frame(width: 360)
                .background(island ? Color.black : Color.white)
                .environment(\.colorScheme, .light)
            let renderer = ImageRenderer(content: view)
            renderer.scale = 3
            guard let png = renderer.uiImage?.pngData() else { throw CocoaError(.fileWriteUnknown) }
            try png.write(to: directory.appendingPathComponent("qa-activity-" + name + ".png"), options: .atomic)
        }
        NSLog("PROMOTORS_NATIVE_QA_ACTIVITY_RENDERED")
    }
}
#endif
