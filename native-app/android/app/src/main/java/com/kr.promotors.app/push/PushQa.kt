package kr.promotors.app.push

import android.content.Context
import kr.promotors.app.BuildConfig
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

object PushQa {
  fun showNotification(context: Context): Boolean {
    if (!BuildConfig.DEBUG || !BuildConfig.QA_BUNDLED || !PushNotifications.permitted(context)) return false
    PushState.allowRegistration(context)
    val binding = PushState.binding(context) ?: "11111111-1111-4111-8111-111111111111"
    if (!PushState.bind(context, binding)) return false
    val now = System.currentTimeMillis() / 1000
    val schedule = SimpleDateFormat("yyyy.MM.dd · HH:mm", Locale.KOREAN).apply {
      timeZone = TimeZone.getTimeZone("Asia/Seoul")
    }.format(Date((now + 3600) * 1000))
    val snapshot = JSONObject().put("pendingCount", 1).put("upcomingCount", 1)
      .put("startsAt", now + 3600).put("bookingId", "example-booking")
      .put("branch", "프로모터스 예시 지점").put("schedule", schedule)
      .put("customerName", "예시 고객").put("vehicleName", "예시 차량").put("vehiclePlate", "비공개")
    val booking = JSONObject(snapshot.toString()).put("id", "example-booking")
      .put("pending", true).put("snapshot", snapshot)
    return PushNotifications.receive(context, mapOf(
      "id" to UUID.randomUUID().toString(), "binding" to binding, "category" to "booking",
      "issuedAt" to "$now", "expiresAt" to "${now + 300}",
      "title" to "새 예약이 들어왔어요 · 예시", "body" to "$schedule\n예시 고객 · 예시 차량 · 비공개\n예시 알림이에요. 실제 예약은 변경되지 않아요.",
      "booking" to booking.toString(),
    ), now)
  }
}
