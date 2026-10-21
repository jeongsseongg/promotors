import ActivityKit

@available(iOS 16.2, *)
struct BookingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var pendingCount: Int
        var upcomingCount: Int
        var branch: String
        var schedule: String
        var bookingId: String
        var startsAt: Double
        var customerName: String?
        var vehicleName: String?
        var vehiclePlate: String?
        var audience: String?
        var phase: String?
        var runId: String?
        var stageLabel: String?
        var progress: Int?
        var expiresAt: Double?
    }
    var binding: String
}
