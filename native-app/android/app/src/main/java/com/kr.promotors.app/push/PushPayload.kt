package kr.promotors.app.push

import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

data class PushPayload(
  val id: String, val binding: String, val category: String, val issuedAt: Long,
  val title: String, val body: String, val booking: JSONObject?,
) {
  companion object {
    fun text(value: String, limit: Int): String {
      val clean = value.replace(Regex("[\\p{Cc}\\p{Cf}]"), " ").trim()
      return if (clean.codePointCount(0, clean.length) <= limit) clean
        else clean.substring(0, clean.offsetByCodePoints(0, limit))
    }

    fun parse(data: Map<String, String>, currentBinding: String?, now: Long): PushPayload? {
      val binding = data["binding"] ?: return null
      if (!PushState.validBinding(binding) || binding != currentBinding) return null
      val id = data["id"] ?: return null
      if (!PushState.validBinding(id)) return null
      val issued = data["issuedAt"]?.toLongOrNull() ?: return null
      val expires = data["expiresAt"]?.toLongOrNull() ?: return null
      if (issued < now - 300 || issued > now + 60 || expires <= now || expires <= issued) return null
      if (expires - issued > 300) return null
      val category = data["category"] ?: return null
      if (category !in setOf("booking", "repair", "reminders", "marketing", "test")) return null
      if (category == "marketing") {
        val hour = Instant.ofEpochSecond(now).atZone(ZoneId.of("Asia/Seoul")).hour
        if (hour !in 8..20) return null
      }
      val booking = parseBooking(data["booking"]) ?: return null
      val title = text(data["title"].orEmpty(), 80).ifEmpty { "프로모터스" }
      val body = text(data["body"].orEmpty(), 240).ifEmpty { "앱에서 새 알림을 확인해 주세요." }
      return PushPayload(id, binding, category, issued, title, body, booking.takeIf { it.length() > 0 })
    }

    private fun parseBooking(raw: String?): JSONObject? {
      if (raw.isNullOrBlank()) return JSONObject()
      if (raw.length > 4096) return null
      return try {
        val source = JSONObject(raw)
        val result = JSONObject()
        val keys = mapOf("id" to 128, "branch" to 60, "schedule" to 40,
          "customerName" to 60, "vehicleName" to 80, "vehiclePlate" to 30)
        keys.forEach { (key, max) ->
          if (source.has(key) && !source.isNull(key)) {
            val value = source.opt(key)
            if (value !is String) return null
            result.put(key, text(value, max))
          }
        }
        if (source.has("pending")) {
          if (source.opt("pending") !is Boolean) return null
          result.put("pending", source.getBoolean("pending"))
        }
        if (source.has("snapshot")) {
          val snapshot = source.optJSONObject("snapshot") ?: return null
          result.put("snapshot", BookingSchedule.clean(snapshot) ?: return null)
        }
        result
      } catch (_: Exception) { null }
    }
  }
}
