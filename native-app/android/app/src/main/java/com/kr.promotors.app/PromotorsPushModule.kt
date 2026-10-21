package kr.promotors.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import kr.promotors.app.push.*
import org.json.JSONObject

class PromotorsPushModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val permissions = PushPermissions(context)
  override fun getName() = "PromotorsPush"

  override fun initialize() { super.initialize(); PushEvents.attach(context) }
  override fun invalidate() { permissions.close(); PushEvents.detach(context); super.invalidate() }

  @ReactMethod fun getPermissionStatus(promise: Promise) { promise.resolve(permissions.status()) }
  @ReactMethod fun requestPermission(promise: Promise) {
    context.runOnUiQueueThread { permissions.request(context.currentActivity, promise) }
  }
  @ReactMethod fun getRegistrationToken(promise: Promise) {
    try { PushTokens.register(context, promise) }
    catch (_: Exception) { promise.reject("PUSH_UNAVAILABLE", "알림 연결을 다시 시도해 주세요.") }
  }
  @ReactMethod fun bindConnection(binding: String, promise: Promise) {
    if (!PushState.bind(context, binding)) promise.reject("INVALID_BINDING", "로그인 후 알림을 다시 연결해 주세요.")
    else promise.resolve(null)
  }
  @ReactMethod fun clearConnection(promise: Promise) { PushTokens.revoke(context, promise) }
  @ReactMethod fun getDeviceId(promise: Promise) { promise.resolve(PushState.deviceId(context)) }
  @ReactMethod fun getConnectionStatus(promise: Promise) {
    promise.resolve(PushEvents.map(JSONObject().put("permission", permissions.status())
      .put("connected", PushState.binding(context) != null && PushState.consented(context) && permissions.status() == "granted")
      .put("deviceId", PushState.deviceId(context))))
  }
  @ReactMethod fun getInitialTarget(promise: Promise) {
    promise.resolve(PushTargets.takeInitial(context)?.let { PushEvents.map(it) })
  }
  @ReactMethod fun syncBookingSchedule(snapshot: ReadableMap, promise: Promise) {
    if (BookingSchedule.sync(context, JSONObject(snapshot.toHashMap()))) promise.resolve(null)
    else promise.reject("STALE_SCHEDULE", "예약 알림 연결을 확인해 주세요.")
  }
  @ReactMethod fun clearBookingSchedule(promise: Promise) { PushNotifications.clearSchedule(context); promise.resolve(null) }
  @ReactMethod fun addListener(eventName: String) { PushEvents.add(eventName) }
  @ReactMethod fun removeListeners(count: Int) { PushEvents.remove(count) }
  @ReactMethod fun showQaNotification(promise: Promise) { promise.resolve(PushQa.showNotification(context)) }
  @ReactMethod fun showQaCustomerNotification(phase: String, promise: Promise) { promise.resolve(PushQa.showCustomer(context, phase)) }
  @ReactMethod fun getQaConfiguration(promise: Promise) {
    if (!BuildConfig.DEBUG || !BuildConfig.QA_BUNDLED) { promise.resolve(null); return }
    val supplied = context.currentActivity?.intent?.getStringExtra("qaScreen")
    val allowed = setOf("booking", "mypage", "admin", "notifications", "updates", "setup", "setup-denied", "inbox", "detail", "customer")
    val preferences = context.getSharedPreferences("promotors_native_qa", 0)
    val screen = if (supplied == null) preferences.getString("screen", null)
      else supplied.takeIf { it in allowed }?.also { preferences.edit().putString("screen", it).apply() }
    // Bundled synthetic QA never requests an FCM token; allow only local card rendering.
    if (screen == "admin" || screen == "customer") PushState.allowRegistration(context)
    promise.resolve(screen?.takeIf { it in allowed }?.let {
      PushEvents.map(JSONObject().put("screen", it)
        .put("requestOsPermission", context.currentActivity?.intent?.getBooleanExtra("requestOsPermission", false) == true))
    })
  }
}
