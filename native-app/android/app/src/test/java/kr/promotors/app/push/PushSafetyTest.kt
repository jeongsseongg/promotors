package kr.promotors.app.push

import android.app.Application
import android.app.NotificationManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class PushSafetyTest {
  private lateinit var context: Application
  private val binding = "11111111-1111-4111-8111-111111111111"
  private val now = 1_792_000_000L

  @Before fun reset() {
    context = ApplicationProvider.getApplicationContext()
    context.getSharedPreferences("promotors_push", 0).edit().clear().commit()
    context.getSystemService(NotificationManager::class.java).cancelAll()
  }

  private fun data() = mapOf(
    "id" to "22222222-2222-4222-8222-222222222222", "binding" to binding,
    "category" to "booking", "issuedAt" to "$now", "expiresAt" to "${now + 300}",
    "title" to "새 예약이 접수됐어요", "body" to "예시 고객 · 예시 차량 · 비공개",
    "booking" to """{"id":"sample","pending":true,"vehiclePlate":"비공개"}""",
  )

  @Test fun correctBindingAndBoundedLifetimeAreRequiredBeforeDisplay() {
    assertNotNull(PushPayload.parse(data(), binding, now))
    assertNull(PushPayload.parse(data(), null, now))
    assertNull(PushPayload.parse(data(), "33333333-3333-4333-8333-333333333333", now))
    assertNull(PushPayload.parse(data(), binding, now + 301))
    assertNull(PushPayload.parse(data() + ("issuedAt" to "${now + 61}"), binding, now))
    assertNull(PushPayload.parse(data() + ("expiresAt" to "${now + 301}"), binding, now))
  }

  @Test fun hostilePayloadCannotPassAsATrustedBooking() {
    assertNull(PushPayload.parse(data() + ("booking" to "not-json"), binding, now))
    assertNull(PushPayload.parse(data() + ("id" to "forged"), binding, now))
    assertNull(PushPayload.parse(data() + ("category" to "unknown"), binding, now))
    val payload = PushPayload.parse(data() + ("body" to ("가".repeat(500) + "\u202E")), binding, now)!!
    assertTrue(payload.body.codePointCount(0, payload.body.length) <= 240)
    assertFalse(payload.body.contains('\u202E'))
    assertNull(PushPayload.parse(data() + ("booking" to """{"id":"sample","pending":"true"}"""), binding, now))
  }

  @Test fun clearingConnectionInvalidatesInFlightDeliveryAndPreservesDeviceIdentity() {
    val id = PushState.deviceId(context)
    val generation = PushState.allowRegistration(context)
    assertTrue(PushState.bind(context, binding))
    val active = PushState.generation(context)
    assertTrue(PushState.isCurrent(context, binding, active))
    PushState.clear(context)
    assertFalse(PushState.isCurrent(context, binding, active))
    assertFalse(PushState.registrationCurrent(context, generation))
    assertFalse(PushState.bind(context, binding))
    assertEquals(id, PushState.deviceId(context))
  }

  @Test fun forgedAndReplayedNotificationIntentsCannotReachAnAction() {
    PushState.allowRegistration(context)
    PushState.bind(context, binding)
    val payload = PushPayload.parse(data(), binding, now)!!
    val pending = PushTargets.create(context, payload.id, "sample", binding, "accept", now)
    assertNull(PushTargets.consumeNonce(context, "forged", now))
    val accepted = PushTargets.consumeNonce(context, pending.nonce, now)!!
    assertEquals("accept", accepted.optString("action"))
    assertTrue(accepted.optBoolean("trustedAction"))
    assertEquals("sample", accepted.optString("bookingId"))
    assertNull(PushTargets.consumeNonce(context, pending.nonce, now))
  }

  @Test fun logoutRejectsAlreadyCreatedActionsAndClearsDeliveredCards() {
    PushState.allowRegistration(context)
    PushState.bind(context, binding)
    val pending = PushTargets.create(context, null, "sample", binding, "reject", now)
    PushState.clear(context)
    assertNull(PushTargets.consumeNonce(context, pending.nonce, now))
    assertNull(PushTargets.takeInitial(context))
    assertEquals(0, context.getSystemService(NotificationManager::class.java).activeNotifications.size)
  }
}
