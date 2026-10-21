#if DEBUG
import SwiftUI
import UIKit

@available(iOS 16.2, *)
@MainActor
enum NativeQaActivityRenderer {
    static func capture() throws {
        guard NativeQaConfiguration.isAllowed else { return }
        let appointment = Date().addingTimeInterval(45 * 60)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
        formatter.dateFormat = "yyyy.MM.dd · HH:mm"
        let state = BookingActivityAttributes.ContentState(pendingCount: 1, upcomingCount: 1,
            branch: "프로모터스 안산점", schedule: formatter.string(from: appointment), bookingId: "qa-pending", startsAt: appointment.timeIntervalSince1970,
            customerName: "예시 고객", vehicleName: "BMW 520d", vehiclePlate: "차량번호 비공개")
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        for (name, island) in [("lock", false), ("island", true)] {
            let card = BookingActivityCard(state: state, binding: "00000000-0000-4000-8000-000000000015", island: island)
            let bounds = UIHostingController(rootView: card).sizeThatFits(in: CGSize(width: 360, height: 1000))
            guard bounds.height <= 160 else { throw CocoaError(.coderInvalidValue) }
            NSLog("PROMOTORS_NATIVE_QA_ACTIVITY_HEIGHT %@ %.1f", name, bounds.height)
            let view = VStack(spacing: 0) {
                card.padding(island ? 16 : 0)
                Text("테스트 화면 · 실제 발송 없음").font(.system(size: 11))
                    .foregroundStyle(island ? Color.white.opacity(0.7) : Color.gray).padding(.bottom, 8)
            }.frame(width: 360)
                .background(island ? Color.black : Color.white)
                .environment(\.colorScheme, .light)
            try render(view).write(to: directory.appendingPathComponent("qa-activity-" + name + ".png"), options: .atomic)
        }
        NSLog("PROMOTORS_NATIVE_QA_ACTIVITY_RENDERED")
    }
    private static func render<Content: View>(_ content: Content) throws -> Data {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else { throw CocoaError(.coderInvalidValue) }
        let host = UIHostingController(rootView: content.ignoresSafeArea())
        host.overrideUserInterfaceStyle = .light
        let size = host.sizeThatFits(in: CGSize(width: 360, height: 1000))
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = host
        window.windowLevel = .alert + 1
        window.isHidden = false
        defer { window.isHidden = true }
        host.view.frame = window.bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        let format = UIGraphicsImageRendererFormat(); format.scale = 3
        var drawn = false
        let png = UIGraphicsImageRenderer(size: size, format: format).pngData { _ in
            drawn = host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
        }
        guard drawn else { throw CocoaError(.fileWriteUnknown) }
        return png
    }
}
#endif
