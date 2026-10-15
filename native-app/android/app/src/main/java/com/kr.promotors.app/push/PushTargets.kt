package kr.promotors.app.push

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import kr.promotors.app.MainActivity
import org.json.JSONObject
import java.util.UUID

object PushTargets {
  private const val ACTION = "kr.promotors.app.PUSH_OPEN"
  private const val EXTRA = "pm_target_nonce"
  data class Created(val nonce: String, val pendingIntent: PendingIntent)

  fun create(context: Context, notificationId: String?, bookingId: String?, binding: String,
    action: String? = null, now: Long = System.currentTimeMillis() / 1000): Created = synchronized(PushState.lock) {
    val nonce = UUID.randomUUID().toString()
    val target = JSONObject().put("binding", binding).put("expires", now + 86400)
    notificationId?.let { target.put("notificationId", it) }
    bookingId?.takeIf { it.isNotBlank() }?.let { target.put("bookingId", it) }
    val trustedAction = action?.takeIf { it == "accept" || it == "reject" }
    trustedAction?.let { target.put("action", it) }
    target.put("trustedAction", trustedAction != null)
    val targets = load(context)
    val expired = targets.keys().asSequence().filter {
      targets.optJSONObject(it)?.optLong("expires", 0)?.let { expiry -> expiry <= now } != false
    }.toList()
    expired.forEach { targets.remove(it) }
    while (targets.length() >= 120) targets.remove(targets.keys().next())
    targets.put(nonce, target)
    PushState.preferences(context).edit().putString("targets", targets.toString()).commit()
    val intent = Intent(context, MainActivity::class.java).setAction(ACTION)
      .setData(Uri.parse("promotors-internal://notification/$nonce"))
      .putExtra(EXTRA, nonce).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    Created(nonce, PendingIntent.getActivity(context, nonce.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
  }

  private fun load(context: Context): JSONObject = try {
    JSONObject(PushState.preferences(context).getString("targets", "{}").orEmpty())
  } catch (_: Exception) { JSONObject() }

  fun consumeNonce(context: Context, nonce: String, now: Long): JSONObject? = synchronized(PushState.lock) {
    val targets = load(context)
    val target = targets.optJSONObject(nonce) ?: return@synchronized null
    targets.remove(nonce)
    PushState.preferences(context).edit().putString("targets", targets.toString()).commit()
    if (!PushState.consented(context) || target.optString("binding") != PushState.binding(context) ||
      target.optLong("expires", 0) <= now) return@synchronized null
    target
  }

  fun handleOpen(activity: Activity, intent: Intent?) {
    if (intent?.action != ACTION) return
    val nonce = intent.getStringExtra(EXTRA) ?: return
    intent.removeExtra(EXTRA)
    val target = consumeNonce(activity, nonce, System.currentTimeMillis() / 1000) ?: return
    synchronized(PushState.lock) {
      if (target.optString("binding") != PushState.binding(activity)) return
      PushState.preferences(activity).edit().putString("initial_target", target.toString()).commit()
    }
    PushEvents.emitOpen()
  }

  fun takeInitial(context: Context): JSONObject? = synchronized(PushState.lock) {
    val value = PushState.preferences(context).getString("initial_target", null) ?: return@synchronized null
    PushState.preferences(context).edit().remove("initial_target").commit()
    val target = try { JSONObject(value) } catch (_: Exception) { return@synchronized null }
    if (!PushState.consented(context) || target.optString("binding") != PushState.binding(context) ||
      target.optLong("expires", 0) <= System.currentTimeMillis() / 1000) return@synchronized null
    target.remove("expires")
    target
  }
}
