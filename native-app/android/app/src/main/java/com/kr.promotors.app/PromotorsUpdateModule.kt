package kr.promotors.app

import androidx.core.content.pm.PackageInfoCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability

class PromotorsUpdateModule(
  private val context: ReactApplicationContext,
  private val manager: AppUpdateManager? = null,
  private val createMap: () -> WritableMap = { Arguments.createMap() },
) : ReactContextBaseJavaModule(context) {
  override fun getName() = "PromotorsUpdates"

  @ReactMethod fun check(promise: Promise) {
    try {
      val installed = context.packageManager.getPackageInfo(context.packageName, 0)
      val currentCode = PackageInfoCompat.getLongVersionCode(installed)
      val play = manager ?: AppUpdateManagerFactory.create(context)
      play.appUpdateInfo.addOnSuccessListener { info ->
        try {
          val storeAvailable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
          val availableCode = if (storeAvailable) info.availableVersionCode().toLong() else 0L
          promise.resolve(createMap().apply {
            putBoolean("available", storeAvailable && availableCode > currentCode)
            putDouble("availableCode", availableCode.toDouble())
            putDouble("currentCode", currentCode.toDouble())
          })
        } catch (error: Exception) {
          failed(promise, error)
        }
      }.addOnFailureListener { error -> failed(promise, error) }
    } catch (error: Exception) {
      failed(promise, error)
    }
  }

  private fun failed(promise: Promise, error: Exception) {
    promise.reject("UPDATE_CHECK_FAILED", "구글 플레이 업데이트를 확인하지 못했습니다.", error)
  }
}
