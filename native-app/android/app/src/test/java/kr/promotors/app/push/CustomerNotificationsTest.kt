package kr.promotors.app.push
import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class CustomerNotificationsTest {
  private val context = ApplicationProvider.getApplicationContext<Application>()
  private val binding = "11111111-1111-4111-8111-111111111111"
  private fun snapshot(phase: String) = JSONObject().put("binding", binding).put("active", true)
    .put("audience", "customer").put("phase", phase).put("progress", 70).put("runId", "own-run")
    .put("bookingId", "own-booking").put("stageLabel", "입고 점검 확인 완료").put("vehicleName", "예시 차량")
    .put("pendingCount", 0).put("upcomingCount", 0)
    .put("expiresAt", System.currentTimeMillis() / 1000 + 7200)
  private fun connect(): NotificationManager {
    context.getSharedPreferences("promotors_push", 0).edit().clear().commit()
    shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    PushState.allowRegistration(context); PushState.bind(context, binding)
    return context.getSystemService(NotificationManager::class.java).also { it.cancelAll() }
  }
  @Test fun customerOngoingHasNoAdminActionsAndSurvivesZeroAdminCounts() {
    val manager = connect()
    assertTrue(BookingSchedule.sync(context, snapshot("repair")))
    val notification = manager.activeNotifications.single().notification
    assertEquals("내 차 정비 중", notification.extras.getString(Notification.EXTRA_TITLE))
    assertTrue(notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertTrue(notification.actions.isNullOrEmpty())
    assertFalse(notification.publicVersion.extras.toString().contains("예시 차량"))
    val intent = shadowOf(notification.contentIntent).savedIntent
    val nonce = intent.getStringExtra("pm_target_nonce")!!
    val target = PushTargets.consumeNonce(context, nonce, System.currentTimeMillis() / 1000)!!
    assertEquals("own-run", target.optString("runId"))
    assertFalse(target.optBoolean("trustedAction"))
    PushState.clear(context)
    assertTrue(manager.activeNotifications.isEmpty())
  }
  @Test fun completedCardCanBeDismissedAndHasFiniteLifetime() {
    val manager = connect(); assertTrue(BookingSchedule.sync(context, snapshot("completed")))
    val n = manager.activeNotifications.single().notification
    assertEquals("정비가 완료되었어요", n.extras.getString(Notification.EXTRA_TITLE))
    assertEquals(0, n.flags and Notification.FLAG_ONGOING_EVENT)
    assertTrue(n.timeoutAfter in 1..7200000)
  }
  @Test fun collapsedCustomerCardFitsTheSystemSlotAndKeepsItsTimerVisible() {
    val parent = FrameLayout(context)
    val source = snapshot("visit").put("startsAt", System.currentTimeMillis() / 1000 + 2700)
    val root = CustomerScheduleViews.create(context, source, false).apply(context, parent)
    parent.addView(root)
    val density = context.resources.displayMetrics.density
    parent.measure(View.MeasureSpec.makeMeasureSpec((360*density).toInt(), View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec((240*density).toInt(), View.MeasureSpec.AT_MOST))
    parent.layout(0, 0, parent.measuredWidth, parent.measuredHeight)
    assertTrue("Collapsed Android custom content must fit 48dp", root.measuredHeight <= (48*density).toInt())
    val timerId = context.resources.getIdentifier("customer_countdown", "id", context.packageName)
    val timer = root.findViewById<View>(timerId)
    assertEquals(View.VISIBLE, timer.visibility)
    assertTrue(timer.bottom <= (timer.parent as View).height)
  }
  @Test fun repairViewShowsFourStagesAndNeverARepairCountdown() {
    val root = CustomerScheduleViews.create(context, snapshot("repair"), true).apply(context, FrameLayout(context))
    val texts = (0 until (root as android.view.ViewGroup).childCount).mapNotNull { (root.getChildAt(it) as? TextView)?.text?.toString() }.joinToString(" ")
    assertTrue(texts.contains("정비 진행")); assertTrue(texts.contains("정비내역·사진 보기"))
    val timerId = context.resources.getIdentifier("customer_countdown", "id", context.packageName)
    assertEquals(View.GONE, root.findViewById<View>(timerId).visibility)
  }
}
