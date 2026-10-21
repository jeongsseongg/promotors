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
  fun showCustomer(context: Context, phase: String): Boolean {
    if (!BuildConfig.DEBUG || !BuildConfig.QA_BUNDLED || phase !in setOf("confirmed", "visit", "repair", "completed")) return false
    val binding = PushState.binding(context) ?: return false
    val now = System.currentTimeMillis() / 1000
    context.getSystemService(android.app.NotificationManager::class.java).cancelAll()
    PushState.preferences(context).edit().remove("delivered_ids").commit()
    val snapshot = JSONObject().put("audience", "customer").put("active", true).put("phase", phase)
      .put("progress", when (phase) { "confirmed" -> 0; "visit" -> 33; "repair" -> 77; else -> 100 })
      .put("stageLabel", "입고 점검 확인 완료").put("bookingId", "qa-pending")
      .put("runId", if (phase in setOf("repair", "completed")) "qa-run" else "")
      .put("startsAt", if (phase in setOf("confirmed", "visit")) now + 2700 else 0)
      .put("expiresAt", if (phase == "completed") now + 7200 else 0)
      .put("branch", "프로모터스 안산점").put("schedule", "방문 일정 예시")
      .put("vehicleName", "BMW 520d").put("vehiclePlate", "차량번호 비공개")
      .put("pendingCount", 0).put("upcomingCount", 0)
    val customer = JSONObject().put("title", "예시 · " + CustomerScheduleViews.title(snapshot))
      .put("body", "테스트 알림 · 실제 발송 없음 · 본인 정비 내역으로 이동").put("snapshot", snapshot)
    return PushNotifications.receive(context, mapOf("id" to "44444444-4444-4444-8444-444444444444",
      "binding" to binding, "category" to "repair", "issuedAt" to "$now", "expiresAt" to "${now+300}",
      "title" to customer.getString("title"), "body" to customer.getString("body"), "customer" to customer.toString()), now)
  }

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
      .put("startsAt", now + 3600).put("bookingId", "qa-pending")
      .put("branch", "프로모터스 예시 지점").put("schedule", schedule)
      .put("customerName", "예시 고객").put("vehicleName", "예시 차량").put("vehiclePlate", "비공개")
    // The ongoing card has its own QA scenario; its ticking clock prevents a System UI idle dump.
    val booking = JSONObject(snapshot.toString()).put("id", "qa-pending").put("pending", true)
    return PushNotifications.receive(context, mapOf(
      "id" to UUID.randomUUID().toString(), "binding" to binding, "category" to "booking",
      "issuedAt" to "$now", "expiresAt" to "${now + 300}",
      "title" to "새 예약이 들어왔어요 · 예시", "body" to "$schedule\n예시 고객 · 예시 차량 · 비공개\n예시 알림이에요. 실제 예약은 변경되지 않아요.",
      "booking" to booking.toString(),
    ), now)
  }
}
