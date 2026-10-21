package kr.promotors.app.push

import android.app.Application
import android.os.SystemClock
import android.view.View
import android.widget.Chronometer
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class BookingLiveTimerTest {
  private val context = ApplicationProvider.getApplicationContext<Application>()
  private fun snapshot(startsAt: Long) = JSONObject().put("startsAt", startsAt)
    .put("pendingCount", 1).put("upcomingCount", 1).put("schedule", "2026.10.22 · 10:00")
    .put("customerName", "예시 고객").put("vehicleName", "BMW 520d").put("vehiclePlate", "비공개")
  private fun view(source: JSONObject, expanded: Boolean) =
    BookingScheduleViews.create(context, source, expanded).apply(context, FrameLayout(context))
  private fun id(name: String) = context.resources.getIdentifier(name, "id", context.packageName)

  @Test fun bodyTimerUsesReservationEpochInBothNativeSizes() {
    val target = System.currentTimeMillis() / 1000 + 2700
    for (expanded in listOf(false, true)) {
      val root = view(snapshot(target), expanded)
      val timer = root.findViewById<View>(id("booking_countdown"))
      assertTrue("Body must contain a system-managed timer", timer is Chronometer)
      timer as Chronometer
      assertTrue(timer.isCountDown)
      assertEquals(View.VISIBLE, timer.visibility)
      val remaining = timer.base - SystemClock.elapsedRealtime()
      assertTrue("Countdown must use startsAt, not a fixed sample", remaining in 2698000..2701000)
      assertTrue(root.findViewById<TextView>(id("booking_vehicle")).text.contains("BMW 520d"))
    }
  }

  @Test fun alreadyDueOrMissingTimestampDoesNotStartANegativeCountdown() {
    for (target in listOf(0L, System.currentTimeMillis() / 1000 - 10)) {
      val root = view(snapshot(target), true)
      assertEquals(View.GONE, root.findViewById<View>(id("booking_countdown"))?.visibility)
      val status = root.findViewById<TextView>(id("booking_live_status"))?.text?.toString()
      assertEquals(if (target == 0L) "예약 일정 확인" else "예약 시간 도착", status)
      assertTrue(root.findViewById<TextView>(id("booking_time")).text.contains("10:00"))
    }
  }
}
