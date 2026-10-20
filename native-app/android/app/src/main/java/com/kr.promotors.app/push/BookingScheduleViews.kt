package kr.promotors.app.push

import android.content.Context
import android.content.res.Configuration
import android.widget.RemoteViews
import kr.promotors.app.R
import org.json.JSONObject

object BookingScheduleViews {
  fun create(context: Context, snapshot: JSONObject, expanded: Boolean): RemoteViews {
    val layout = if (expanded) R.layout.notification_booking_expanded else R.layout.notification_booking_compact
    val views = RemoteViews(context.packageName, layout)
    val dark = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    val foreground = if (dark) 0xFFF1F3F4.toInt() else 0xFF172333.toInt()
    val secondary = if (dark) 0xFFBDC6D5.toInt() else 0xFF667587.toInt()
    val pending = snapshot.optInt("pendingCount", 0).coerceIn(0, 100000)
    val upcoming = snapshot.optInt("upcomingCount", 0).coerceIn(0, 100000)
    val schedule = snapshot.optString("schedule").trim()
    val time = Regex("\\d{1,2}:\\d{2}").findAll(schedule).lastOrNull()?.value ?: "예약 일정"
    val customer = snapshot.optString("customerName").ifBlank { "예약 고객" }
    val vehicle = listOf(snapshot.optString("vehicleName"), snapshot.optString("vehiclePlate"))
      .filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "차량 정보 확인" }
    views.setTextViewText(R.id.booking_time, time)
    views.setTextViewText(R.id.booking_customer, customer)
    views.setTextViewText(R.id.booking_vehicle, vehicle)
    for (id in listOf(R.id.booking_time, R.id.booking_customer, R.id.booking_vehicle)) views.setTextColor(id, foreground)
    if (expanded) {
      views.setTextViewText(R.id.booking_counts, "처리 대기 ${pending}건  ·  방문 예정 ${upcoming}건")
      views.setTextViewText(R.id.booking_date, schedule.substringBeforeLast("·", "").trim())
      views.setTextViewText(R.id.booking_branch, snapshot.optString("branch"))
      for (id in listOf(R.id.booking_counts, R.id.booking_date, R.id.booking_branch)) views.setTextColor(id, secondary)
      views.setTextColor(R.id.booking_link, foreground)
    }
    return views
  }
}
