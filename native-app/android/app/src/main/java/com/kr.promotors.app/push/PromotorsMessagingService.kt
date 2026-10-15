package kr.promotors.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class PromotorsMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    // Display only after session binding, expiry, permissions and duplicate checks.
    if (message.notification != null) return
    PushNotifications.receive(this, message.data)
  }

  override fun onNewToken(token: String) {
    // Token material is returned only to the explicit JS registration call, never events or logs.
    if (PushState.consented(this)) PushEvents.tokenRefreshed()
  }
}
