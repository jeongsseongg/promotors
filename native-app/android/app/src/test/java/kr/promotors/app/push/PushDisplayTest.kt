package kr.promotors.app.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class PushDisplayTest {
  private lateinit var context: Application
  private lateinit var manager: NotificationManager
  private val binding = "11111111-1111-4111-8111-111111111111"

  @Before fun setup() {
    context = ApplicationProvider.getApplicationContext()
    context.getSharedPreferences("promotors_push", 0).edit().clear().commit()
    manager = context.getSystemService(NotificationManager::class.java)
    manager.cancelAll()
    shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    PushState.allowRegistration(context)
    PushState.bind(context, binding)
    assertTrue(PushNotifications.permitted(context))
  }

  private fun data(): Map<String, String> {
    val now = System.currentTimeMillis() / 1000
    return mapOf("id" to "22222222-2222-4222-8222-222222222222", "binding" to binding,
      "category" to "booking", "issuedAt" to "$now", "expiresAt" to "${now + 300}",
      "title" to "새 예약이 접수됐어요", "body" to "예시 고객 · 예시 차량 · 비공개",
      "booking" to """{"id":"example","pending":true}""")
  }

  @Test fun nativeNotificationContainsBookingActionsWithoutExposingPrivateContentPublicly() {
    assertTrue(PushNotifications.receive(context, data()))
    val notification = manager.activeNotifications.single().notification
    assertEquals("예시 고객 · 예시 차량 · 비공개", notification.extras.getString(Notification.EXTRA_TEXT))
    assertEquals(listOf("예약 승인", "예약 거절"), notification.actions.map { it.title.toString() })
    assertTrue(notification.actions.all { it.isAuthenticationRequired })
    assertEquals(Notification.VISIBILITY_PRIVATE, notification.visibility)
    assertFalse(notification.publicVersion.extras.getString(Notification.EXTRA_TEXT)!!.contains("예시 고객"))
    assertTrue(notification.actions.all { shadowOf(it.actionIntent).savedIntent.component?.className == "kr.promotors.app.MainActivity" })
    assertFalse(PushNotifications.receive(context, data()))
    assertEquals(1, manager.activeNotifications.size)
  }

  @Test fun oldBindingAndLoggedOutSnapshotCannotRepaintTheOngoingCard() {
    val snapshot = JSONObject().put("binding", binding).put("active", true)
      .put("pendingCount", 1).put("upcomingCount", 2).put("startsAt", System.currentTimeMillis() / 1000 + 3600)
      .put("bookingId", "example").put("customerName", "예시 고객").put("vehicleName", "예시 차량").put("vehiclePlate", "비공개")
    assertTrue(BookingSchedule.sync(context, snapshot))
    val notification = manager.activeNotifications.single().notification
    assertEquals("처리 대기 1건 · 방문 예정 2건", notification.extras.getString(Notification.EXTRA_TITLE))
    assertTrue(notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertTrue(notification.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0)
    PushState.clear(context)
    assertEquals(0, manager.activeNotifications.size)
    assertFalse(BookingSchedule.sync(context, snapshot))
    assertFalse(PushNotifications.receive(context, data()))
    assertEquals(0, manager.activeNotifications.size)
  }

  @Test fun ordinaryTapIsNotApprovalAndClearedScheduleDoesNotLeaveAnotherCard() {
    val target = PushTargets.create(context, "22222222-2222-4222-8222-222222222222", "example", binding)
    val accepted = PushTargets.consumeNonce(context, target.nonce, System.currentTimeMillis() / 1000)!!
    assertFalse(accepted.optBoolean("trustedAction"))
    assertFalse(accepted.has("action"))
    val source = JSONObject().put("binding", binding).put("pendingCount", 1).put("upcomingCount", 0)
    assertTrue(BookingSchedule.sync(context, source))
    assertEquals(1, manager.activeNotifications.size)
    source.put("pendingCount", 0)
    assertTrue(BookingSchedule.sync(context, source))
    assertEquals(0, manager.activeNotifications.size)
  }
}
