package kr.promotors.app.push

import android.content.Context
import org.json.JSONObject

object BookingSchedule {
  fun clean(source: JSONObject): JSONObject? {
    val result = JSONObject()
    for (key in listOf("pendingCount", "upcomingCount", "startsAt")) {
      val value = source.opt(key)
      if (value != null && value !== JSONObject.NULL) {
        if (value !is Number || !value.toDouble().isFinite() || value.toDouble() < 0) return null
        val maximum = if (key == "startsAt") 4_102_444_800L else 100_000L
        result.put(key, value.toLong().coerceAtMost(maximum))
      }
    }
    val fields = mapOf("branch" to 60, "schedule" to 40, "bookingId" to 128,
      "customerName" to 60, "vehicleName" to 80, "vehiclePlate" to 30)
    for ((key, length) in fields) {
      val value = source.opt(key)
      if (value != null && value !== JSONObject.NULL) {
        if (value !is String) return null
        result.put(key, PushPayload.text(value, length))
      }
    }
    return result
  }

  fun sync(context: Context, source: JSONObject): Boolean = synchronized(PushState.lock) {
    val binding = source.optString("binding")
    if (binding != PushState.binding(context) || !PushState.consented(context)) return@synchronized false
    if (source.has("active") && source.opt("active") !is Boolean) return@synchronized false
    if (source.opt("active") == false) {
      PushNotifications.clearSchedule(context)
      return@synchronized true
    }
    val snapshot = clean(source) ?: return@synchronized false
    PushNotifications.showSchedule(context, snapshot, binding)
    true
  }
}
