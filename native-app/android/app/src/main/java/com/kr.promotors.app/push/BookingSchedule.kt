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
    if (source.optString("audience") == "customer") {
      val phase = source.optString("phase")
      if (phase !in setOf("confirmed", "visit", "repair", "completed", "cancelled")) return null
      result.put("audience", "customer").put("phase", phase)
      for ((key, limit) in mapOf("runId" to 128, "stageLabel" to 50)) {
        val value = source.opt(key)
        if (value != null && value !== JSONObject.NULL && value !is String) return null
        result.put(key, PushPayload.text(source.optString(key), limit))
      }
      if (source.has("active") && source.opt("active") !is Boolean) return null
      result.put("active", source.optBoolean("active", false))
      for (key in listOf("progress", "expiresAt")) {
        val value = source.opt(key)
        if (value !is Number || !value.toDouble().isFinite() || value.toDouble() < 0) return null
        result.put(key, value.toLong().coerceAtMost(if (key == "progress") 100L else 4_102_444_800L))
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
