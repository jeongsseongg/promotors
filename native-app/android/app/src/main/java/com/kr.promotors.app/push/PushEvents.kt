package kr.promotors.app.push

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference
import org.json.JSONObject

object PushEvents {
  private var context = WeakReference<ReactApplicationContext>(null)
  private var listeners = 0

  @Synchronized fun attach(value: ReactApplicationContext) { context = WeakReference(value) }
  @Synchronized fun detach(value: ReactApplicationContext) {
    if (context.get() === value) { context.clear(); listeners = 0 }
  }
  @Synchronized fun add(name: String) { listeners++ }
  // NativeEventEmitter supplies only a count on removal, never an event name.
  @Synchronized fun remove(count: Int) { listeners = (listeners - count.coerceAtLeast(0)).coerceAtLeast(0) }

  fun emitOpen() {
    val active = synchronized(this) { context.get()?.takeIf { listeners > 0 } } ?: return
    active.runOnJSQueueThread {
      if (!active.hasActiveReactInstance()) return@runOnJSQueueThread
      synchronized(PushState.lock) {
        val target = PushTargets.takeInitial(active) ?: return@synchronized
        active.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("pm-notification-open", map(target))
      }
    }
  }

  fun tokenRefreshed() {
    val active = synchronized(this) { context.get()?.takeIf { listeners > 0 } } ?: return
    active.runOnJSQueueThread {
      if (active.hasActiveReactInstance() && PushState.consented(active)) {
        active.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("pm-push-token-refreshed", Arguments.createMap())
      }
    }
  }

  fun map(value: JSONObject) = Arguments.createMap().apply {
    value.keys().forEach { key ->
      when (val item = value.opt(key)) {
        is String -> putString(key, item)
        is Boolean -> putBoolean(key, item)
        is Number -> putDouble(key, item.toDouble())
      }
    }
  }
}
