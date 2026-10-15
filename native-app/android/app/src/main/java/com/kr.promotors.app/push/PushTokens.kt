package kr.promotors.app.push

import android.content.Context
import com.facebook.react.bridge.Promise
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import kr.promotors.app.BuildConfig

object PushTokens {
  private var tail: Task<Void> = Tasks.forResult(null)

  // Serialize token creation and revocation so a late logout cannot revoke the next account's token.
  @Synchronized fun register(context: Context, promise: Promise) {
    if (BuildConfig.DEBUG && BuildConfig.QA_BUNDLED) {
      promise.reject("QA_TOKEN_DISABLED", "예시 화면에서는 실제 알림 서버에 연결하지 않아요.")
      return
    }
    if (!PushNotifications.permitted(context)) {
      promise.reject("NOTIFICATION_PERMISSION_REQUIRED", "알림 권한을 먼저 허용해 주세요.")
      return
    }
    val generation = PushState.allowRegistration(context)
    val task = tail.continueWithTask {
      synchronized(PushState.lock) {
        if (!PushState.registrationCurrent(context, generation)) {
          return@continueWithTask Tasks.forException<String>(IllegalStateException("CANCELLED"))
        }
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        FirebaseMessaging.getInstance().token
      }
    }
    tail = task.continueWith { null }
    task.addOnCompleteListener { result ->
      synchronized(PushState.lock) {
        if (!PushState.registrationCurrent(context, generation)) {
          promise.reject("CANCELLED", "알림 연결이 취소됐어요.")
        } else if (result.isSuccessful && !result.result.isNullOrBlank()) {
          promise.resolve(result.result)
        } else promise.reject("PUSH_REGISTRATION_FAILED", "알림 연결을 다시 시도해 주세요.")
      }
    }
  }

  @Synchronized fun revoke(context: Context, promise: Promise) {
    PushState.clear(context)
    if (BuildConfig.DEBUG && BuildConfig.QA_BUNDLED) { promise.resolve(null); return }
    try {
      FirebaseMessaging.getInstance().isAutoInitEnabled = false
      val task = tail.continueWithTask { FirebaseMessaging.getInstance().deleteToken() }
      tail = task.continueWith { null }
      task.addOnCompleteListener {
        // The local account binding has already been removed even if the network is unavailable.
        promise.resolve(null)
      }
    } catch (_: Exception) { promise.resolve(null) }
  }
}
