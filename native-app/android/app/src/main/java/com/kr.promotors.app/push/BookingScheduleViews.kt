package kr.promotors.app.push

import android.content.Context
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import kr.promotors.app.R
import org.json.JSONObject

object BookingScheduleViews {
  fun create(context: Context, snapshot: JSONObject, expanded: Boolean): RemoteViews {
    val layout = if (expanded) R.layout.notification_booking_expanded else R.layout.notification_booking_compact
    val views = RemoteViews(context.packageName, layout)
    val pending = snapshot.optInt("pendingCount", 0).coerceIn(0, 100000)
    val upcoming = snapshot.optInt("upcomingCount", 0).coerceIn(0, 100000)
    val schedule = snapshot.optString("schedule").trim()
    val time = Regex("\\d{1,2}:\\d{2}").findAll(schedule).lastOrNull()?.value ?: "예약 일정"
    val customer = snapshot.optString("customerName").ifBlank { "예약 고객" }
    val vehicle = listOf(snapshot.optString("vehicleName"), snapshot.optString("vehiclePlate"))
      .filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "차량 정보 확인" }
    val target = snapshot.optLong("startsAt", 0) * 1000
    val remaining = target - System.currentTimeMillis()
    val running = target > 0 && remaining > 0
    views.setViewVisibility(R.id.booking_countdown, if (running) View.VISIBLE else View.GONE)
    views.setChronometerCountDown(R.id.booking_countdown, true)
    views.setChronometer(R.id.booking_countdown, SystemClock.elapsedRealtime() + remaining.coerceAtLeast(0), null, running)
    views.setTextViewText(R.id.booking_live_status, when {
      target <= 0 -> "예약 일정 확인"
      !running -> "예약 시간 도착"
      else -> "예약 시간까지"
    })
    views.setTextViewText(R.id.booking_time, time)
    views.setTextViewText(R.id.booking_customer, customer)
    views.setTextViewText(R.id.booking_vehicle, vehicle)
    if (expanded) {
      views.setTextViewText(R.id.booking_counts, "처리 대기 ${pending}건  ·  방문 예정 ${upcoming}건")
      views.setTextViewText(R.id.booking_date, schedule.substringBeforeLast("·", "").trim())
      views.setTextViewText(R.id.booking_branch, snapshot.optString("branch"))
      views.setViewVisibility(R.id.booking_progress, if (target > 0) View.VISIBLE else View.GONE)
      views.setProgressBar(R.id.booking_progress, 3600, (3600 - remaining / 1000).coerceIn(0, 3600).toInt(), false)
    }
    return views
  }
}
