package kr.promotors.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kr.promotors.app.R
import org.json.JSONArray
import org.json.JSONObject

object PushNotifications {
  private const val ALERT_CHANNEL = "promotors_reservations_v1"
  private const val SCHEDULE_CHANNEL = "promotors_schedule_v1"
  private const val SCHEDULE_TAG = "promotors_booking_schedule"

  fun permitted(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
      Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
    return NotificationManagerCompat.from(context).areNotificationsEnabled()
  }

  fun channels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val sound = Uri.parse("android.resource://${context.packageName}/${R.raw.precision_check}")
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    val alert = NotificationChannel(ALERT_CHANNEL, "예약 및 앱 알림", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "새 예약과 예약 변경, 정비 소식을 알려드려요."
      setSound(sound, attributes)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
      enableVibration(true)
    }
    val schedule = NotificationChannel(SCHEDULE_CHANNEL, "예약 일정 상시알림", NotificationManager.IMPORTANCE_LOW).apply {
      description = "처리 대기와 방문 예정 일정을 계속 확인해요."
      setSound(null, null)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
    }
    manager.createNotificationChannels(listOf(alert, schedule))
  }

  private fun base(context: Context, channel: String): NotificationCompat.Builder {
    val public = NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.drawable.ic_stat_promotors).setContentTitle("프로모터스")
      .setContentText("앱에서 예약 알림을 확인해 주세요.").build()
    return NotificationCompat.Builder(context, channel).setSmallIcon(R.drawable.ic_stat_promotors)
      .setLargeIcon(BitmapFactory.decodeResource(context.resources, R.drawable.promotors_logo))
      .setColor(0xFF14245F.toInt()).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(public).setCategory(NotificationCompat.CATEGORY_EVENT)
  }

  fun receive(context: Context, data: Map<String, String>, now: Long = System.currentTimeMillis() / 1000): Boolean =
    synchronized(PushState.lock) {
      val payload = PushPayload.parse(data, PushState.binding(context), now) ?: return@synchronized false
      if (!PushState.consented(context) || !permitted(context)) return@synchronized false
      val delivered = delivered(context)
      if ((0 until delivered.length()).any { delivered.optString(it) == payload.id }) return@synchronized false
      channels(context)
      val bookingId = payload.booking?.optString("id")?.takeIf { it.isNotEmpty() }
      val intent = PushTargets.create(context, payload.id, bookingId, payload.binding, now = now)
      val builder = base(context, ALERT_CHANNEL).setContentTitle(payload.title).setContentText(payload.body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(payload.body)).setAutoCancel(true)
        .setContentIntent(intent.pendingIntent).setWhen(payload.issuedAt * 1000)
        .setPriority(NotificationCompat.PRIORITY_HIGH).setTimeoutAfter(86400000)
      addBookingActions(context, builder, payload, bookingId, now)
      if (Build.VERSION.SDK_INT < 26) {
        builder.setSound(Uri.parse("android.resource://${context.packageName}/${R.raw.precision_check}"))
      }
      try { NotificationManagerCompat.from(context).notify(payload.id, 0, builder.build()) }
      catch (_: SecurityException) { return@synchronized false }
      delivered.put(payload.id)
      val recent = JSONArray()
      for (index in (delivered.length() - 100).coerceAtLeast(0) until delivered.length()) recent.put(delivered.get(index))
      PushState.preferences(context).edit().putString("delivered_ids", recent.toString()).commit()
      payload.booking?.optJSONObject("snapshot")?.let { showSchedule(context, it, payload.binding) }
      true
    }

  private fun delivered(context: Context): JSONArray = try {
    JSONArray(PushState.preferences(context).getString("delivered_ids", "[]"))
  } catch (_: Exception) { JSONArray() }

  private fun addBookingActions(context: Context, builder: NotificationCompat.Builder,
    payload: PushPayload, bookingId: String?, now: Long) {
    if (payload.booking?.optBoolean("pending") != true || bookingId == null) return
    for ((action, label) in listOf("accept" to "예약 승인", "reject" to "예약 거절")) {
      val target = PushTargets.create(context, payload.id, bookingId, payload.binding, action, now)
      builder.addAction(NotificationCompat.Action.Builder(0, label, target.pendingIntent)
        .setAuthenticationRequired(true).build())
    }
  }

  fun showSchedule(context: Context, snapshot: JSONObject, binding: String) = synchronized(PushState.lock) {
    if (binding != PushState.binding(context) || !PushState.consented(context)) return@synchronized
    val pending = snapshot.optInt("pendingCount", 0).coerceIn(0, 100000)
    val upcoming = snapshot.optInt("upcomingCount", 0).coerceIn(0, 100000)
    if (pending + upcoming == 0) { clearSchedule(context); return@synchronized }
    if (!permitted(context)) return@synchronized
    channels(context)
    val booking = snapshot.optString("bookingId").takeIf { it.isNotBlank() }
    val intent = PushTargets.schedule(context, booking, binding)
    val identity = listOf("customerName", "vehicleName", "vehiclePlate")
      .map { snapshot.optString(it) }.filter { it.isNotBlank() }.joinToString(" · ")
    val line = listOf(snapshot.optString("branch"), snapshot.optString("schedule"), identity)
      .filter { it.isNotBlank() }.joinToString("\n")
    val builder = base(context, SCHEDULE_CHANNEL)
      .setContentTitle("처리 대기 ${pending}건 · 방문 예정 ${upcoming}건")
      .setContentText(line).setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setLargeIcon(null as android.graphics.Bitmap?).setShowWhen(false)
      .setCustomContentView(BookingScheduleViews.create(context, snapshot, false))
      .setCustomBigContentView(BookingScheduleViews.create(context, snapshot, true))
      .setContentIntent(intent.pendingIntent).setOngoing(true).setOnlyAlertOnce(true)
      .setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW).setTimeoutAfter(86400000)
    try { NotificationManagerCompat.from(context).notify(SCHEDULE_TAG, 0, builder.build()) }
    catch (_: SecurityException) { return@synchronized }
  }

  fun clearSchedule(context: Context) {
    PushTargets.clearSchedule(context)
    NotificationManagerCompat.from(context).cancel(SCHEDULE_TAG, 0)
  }
}
