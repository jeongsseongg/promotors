package kr.promotors.app.push

import android.app.NotificationManager
import android.content.Context
import java.util.UUID

object PushState {
  val lock = Any()
  fun preferences(context: Context) = context.getSharedPreferences("promotors_push", Context.MODE_PRIVATE)
  fun validBinding(value: String?) = value != null &&
    Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").matches(value)

  fun deviceId(context: Context): String = synchronized(lock) {
    val saved = preferences(context).getString("device_id", null)
    if (saved != null) saved else UUID.randomUUID().toString().also {
      preferences(context).edit().putString("device_id", it).commit()
    }
  }

  fun binding(context: Context): String? = synchronized(lock) {
    preferences(context).getString("binding", null)
  }

  fun generation(context: Context): Long = synchronized(lock) {
    preferences(context).getLong("generation", 0)
  }

  fun consented(context: Context): Boolean = synchronized(lock) {
    preferences(context).getBoolean("consented", false)
  }

  fun allowRegistration(context: Context): Long = synchronized(lock) {
    preferences(context).edit().putBoolean("consented", true).commit()
    generation(context)
  }

  fun registrationCurrent(context: Context, generation: Long): Boolean = synchronized(lock) {
    consented(context) && generation(context) == generation
  }

  fun isCurrent(context: Context, binding: String, generation: Long): Boolean = synchronized(lock) {
    registrationCurrent(context, generation) && binding(context) == binding
  }

  fun bind(context: Context, binding: String): Boolean = synchronized(lock) {
    if (!validBinding(binding) || !consented(context)) return@synchronized false
    if (binding(context) != binding) {
      clearNotices(context)
      preferences(context).edit().putLong("generation", generation(context) + 1)
        .putString("binding", binding).commit()
    }
    true
  }

  fun clear(context: Context) = synchronized(lock) {
    preferences(context).edit().remove("binding").putBoolean("consented", false)
      .putLong("generation", generation(context) + 1).commit()
    clearNotices(context)
  }

  private fun clearNotices(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancelAll()
    preferences(context).edit().remove("targets").remove("initial_target")
      .remove("delivered_ids").commit()
  }
}
