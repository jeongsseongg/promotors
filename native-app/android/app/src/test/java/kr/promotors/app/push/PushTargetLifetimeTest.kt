package kr.promotors.app.push

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.app.PendingIntent
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
class PushTargetLifetimeTest {
  private lateinit var context: Application
  private lateinit var manager: NotificationManager
  private val binding = "11111111-1111-4111-8111-111111111111"
  private val noticeId = "22222222-2222-4222-8222-222222222222"

  @Before fun setup() {
    context = ApplicationProvider.getApplicationContext()
    PushState.preferences(context).edit().clear().commit()
    manager = context.getSystemService(NotificationManager::class.java)
    manager.cancelAll()
    shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    PushState.allowRegistration(context)
    PushState.bind(context, binding)
  }

  private fun snapshot(id: String = "synthetic-booking") = JSONObject()
    .put("binding", binding).put("active", true).put("pendingCount", 1).put("upcomingCount", 0)
    .put("bookingId", id).put("customerName", "예시 고객").put("vehiclePlate", "비공개")

  private fun nonce(intent: PendingIntent): String =
    shadowOf(intent).savedIntent.getStringExtra("pm_target_nonce")!!

  private fun scheduleIntent(): PendingIntent = manager.activeNotifications
    .single { it.tag == "promotors_booking_schedule" }.notification.contentIntent

  @Test fun unchangedScheduleRefreshDoesNotEvictVisibleOrdinaryNotificationActions() {
    val now = System.currentTimeMillis() / 1000
    assertTrue(PushNotifications.receive(context, mapOf("id" to noticeId, "binding" to binding,
      "category" to "booking", "issuedAt" to "$now", "expiresAt" to "${now + 300}",
      "title" to "예시 예약", "body" to "예시 고객 · 비공개",
      "booking" to """{"id":"synthetic-booking","pending":true}""")))
    val notification = manager.activeNotifications.single().notification
    val ordinary = listOf(notification.contentIntent) + notification.actions.map { it.actionIntent }
    repeat(128) { assertTrue(BookingSchedule.sync(context, snapshot())) }
    assertTrue(manager.activeNotifications.any { it.tag == noticeId })
    ordinary.forEach { assertNotNull(PushTargets.consumeNonce(context, nonce(it), now)) }
  }

  @Test fun unchangedScheduleReusesItsTargetAndBookingChangeReplacesOnlyThatTarget() {
    assertTrue(BookingSchedule.sync(context, snapshot()))
    val first = nonce(scheduleIntent())
    repeat(4) { assertTrue(BookingSchedule.sync(context, snapshot())) }
    assertEquals(first, nonce(scheduleIntent()))
    val ordinary = PushTargets.create(context, noticeId, "synthetic-booking", binding, "accept")
    assertTrue(BookingSchedule.sync(context, snapshot("synthetic-next-booking")))
    val next = nonce(scheduleIntent())
    assertNotEquals(first, next)
    val now = System.currentTimeMillis() / 1000
    assertNull(PushTargets.consumeNonce(context, first, now))
    assertNotNull(PushTargets.consumeNonce(context, ordinary.nonce, now))
    assertEquals("synthetic-next-booking", PushTargets.consumeNonce(context, next, now)?.getString("bookingId"))
  }

  @Test fun scheduleAndOrdinaryTargetsRemainSingleUseAndLogoutRemovesBoth() {
    val now = System.currentTimeMillis() / 1000
    val ordinary = PushTargets.create(context, noticeId, "synthetic-booking", binding, "reject")
    assertTrue(PushTargets.consumeNonce(context, ordinary.nonce, now)!!.getBoolean("trustedAction"))
    assertNull(PushTargets.consumeNonce(context, ordinary.nonce, now))
    assertTrue(BookingSchedule.sync(context, snapshot()))
    val first = nonce(scheduleIntent())
    assertNotNull(PushTargets.consumeNonce(context, first, now))
    assertNull(PushTargets.consumeNonce(context, first, now))
    assertTrue(BookingSchedule.sync(context, snapshot()))
    val renewed = nonce(scheduleIntent())
    assertNotEquals(first, renewed)
    PushState.clear(context)
    assertNull(PushTargets.consumeNonce(context, renewed, now))
    assertEquals(0, manager.activeNotifications.size)
  }
}
