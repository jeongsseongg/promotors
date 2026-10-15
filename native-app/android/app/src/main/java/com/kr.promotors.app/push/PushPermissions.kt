package kr.promotors.app.push

import android.Manifest
import android.app.Activity
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class PushPermissions(private val context: Context) : PermissionListener {
  private var pending: Promise? = null
  private val requestCode = 6407

  fun status(): String {
    if (PushNotifications.permitted(context)) return "granted"
    val asked = PushState.preferences(context).getBoolean("permission_asked", false)
    return if (Build.VERSION.SDK_INT >= 33 && !asked) "default" else "denied"
  }

  fun request(activity: Activity?, promise: Promise) {
    if (Build.VERSION.SDK_INT < 33 || status() == "granted") { promise.resolve(status()); return }
    if (pending != null) { promise.reject("PERMISSION_REQUEST_PENDING", "알림 권한을 확인하고 있어요."); return }
    val current = activity as? PermissionAwareActivity
    if (current == null) { promise.reject("ACTIVITY_UNAVAILABLE", "앱 화면에서 다시 시도해 주세요."); return }
    pending = promise
    PushState.preferences(context).edit().putBoolean("permission_asked", true).commit()
    current.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), requestCode, this)
  }

  override fun onRequestPermissionsResult(code: Int, permissions: Array<String>, grantResults: IntArray): Boolean {
    if (code != requestCode) return false
    pending?.resolve(status())
    pending = null
    return true
  }

  fun close() { pending?.reject("CANCELLED", "알림 권한 확인이 취소됐어요."); pending = null }
}
