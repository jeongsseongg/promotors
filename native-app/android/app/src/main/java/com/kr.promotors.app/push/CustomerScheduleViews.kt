package kr.promotors.app.push

import android.content.Context
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import kr.promotors.app.R
import org.json.JSONObject

object CustomerScheduleViews {
  private val phases = listOf("confirmed", "visit", "repair", "completed")
  fun title(s: JSONObject): String = when (s.optString("phase")) {
    "confirmed" -> "예약이 확정되었어요"
    "visit" -> "방문을 기다리고 있어요"
    "repair" -> "내 차 정비 중"
    "completed" -> "정비가 완료되었어요"
    else -> "예약 내역 확인"
  }
  fun create(context: Context, s: JSONObject, expanded: Boolean): RemoteViews {
    val v = RemoteViews(context.packageName, if (expanded) R.layout.notification_customer_expanded else R.layout.notification_customer_compact)
    v.setTextViewText(R.id.customer_title, title(s))
    val vehicle = listOf(s.optString("vehicleName"), s.optString("vehiclePlate")).filter { it.isNotBlank() }.joinToString(" · ")
    v.setTextViewText(R.id.customer_vehicle, vehicle)
    val stage = phases.indexOf(s.optString("phase")).coerceAtLeast(0)
    val remaining = s.optLong("startsAt") * 1000 - System.currentTimeMillis()
    val running = stage < 2 && remaining > 0
    v.setViewVisibility(R.id.customer_countdown, if (running) View.VISIBLE else View.GONE)
    v.setChronometerCountDown(R.id.customer_countdown, true)
    v.setChronometer(R.id.customer_countdown, SystemClock.elapsedRealtime() + remaining.coerceAtLeast(0), null, running)
    if (expanded) {
      v.setTextViewText(R.id.customer_stage, if (running) "방문까지 남은 시간" else s.optString("stageLabel"))
      v.setProgressBar(R.id.customer_progress, 100, s.optInt("progress").coerceIn(0, 100), false)
      v.setTextViewText(R.id.customer_steps, "예약 확정   ·   방문 예정   ·   정비 진행   ·   완료")
      v.setTextViewText(R.id.customer_branch, listOf(s.optString("branch"), s.optString("schedule")).filter { it.isNotBlank() }.joinToString(" · "))
      v.setTextViewText(R.id.customer_link, if (s.optString("runId").isBlank()) "예약 정보 확인  ›" else "정비내역·사진 보기  ›")
    }
    return v
  }
}
