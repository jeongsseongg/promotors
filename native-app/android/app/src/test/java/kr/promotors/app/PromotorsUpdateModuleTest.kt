package kr.promotors.app

import android.app.Application
import android.os.Looper
import androidx.core.content.pm.PackageInfoCompat
import androidx.test.core.app.ApplicationProvider
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager
import com.google.android.play.core.install.model.InstallErrorCode
import java.lang.reflect.Proxy
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class PromotorsUpdateModuleTest {
  private lateinit var context: ReactApplicationContext
  private lateinit var play: FakeAppUpdateManager
  private var currentCode = 0L

  private class Result {
    var value: ReadableMap? = null
    var errorCode: String? = null
    var resolved = 0
    var rejected = 0
    val promise = Proxy.newProxyInstance(Promise::class.java.classLoader, arrayOf(Promise::class.java)) { _, method, arguments ->
      when (method.name) {
        "resolve" -> { value = arguments?.firstOrNull() as? ReadableMap; resolved++ }
        "reject" -> { errorCode = arguments?.firstOrNull() as? String; rejected++ }
      }
      null
    } as Promise
  }

  @Before fun setup() {
    context = BridgeReactContext(ApplicationProvider.getApplicationContext<Application>())
    play = FakeAppUpdateManager(context)
    currentCode = PackageInfoCompat.getLongVersionCode(context.packageManager.getPackageInfo(context.packageName, 0))
    assertTrue("The installed test package must have a real version code", currentCode > 0)
  }

  private fun check(manager: AppUpdateManager = play): Result {
    val result = Result()
    PromotorsUpdateModule(context, manager) { JavaOnlyMap() }.check(result.promise)
    shadowOf(Looper.getMainLooper()).idle()
    return result
  }

  @Test fun onlyAnAvailableNewerPlayVersionIsReportedWithoutStartingAnInstall() {
    play.setUpdateAvailable((currentCode + 1).toInt())
    val result = check()
    assertEquals(1, result.resolved)
    assertEquals(0, result.rejected)
    assertTrue(result.value!!.getBoolean("available"))
    assertEquals((currentCode + 1).toDouble(), result.value!!.getDouble("availableCode"), 0.0)
    assertEquals(currentCode.toDouble(), result.value!!.getDouble("currentCode"), 0.0)
    assertFalse(play.isConfirmationDialogVisible)
    assertFalse(play.isImmediateFlowVisible)
    assertNull(play.typeForUpdateInProgress)
  }

  @Test fun sameOrOlderVersionIsNotAnUpdateEvenWhenPlayMarksItAvailable() {
    for (code in listOf(currentCode, currentCode - 1)) {
      play.setUpdateAvailable(code.toInt())
      val result = check()
      assertFalse(result.value!!.getBoolean("available"))
      assertEquals(code.toDouble(), result.value!!.getDouble("availableCode"), 0.0)
      assertEquals(currentCode.toDouble(), result.value!!.getDouble("currentCode"), 0.0)
    }
  }

  @Test fun noPlayUpdateIsReportedAsUnavailableWithoutInventingAVersion() {
    play.setUpdateNotAvailable()
    val result = check()
    assertFalse(result.value!!.getBoolean("available"))
    assertEquals(0.0, result.value!!.getDouble("availableCode"), 0.0)
    assertEquals(currentCode.toDouble(), result.value!!.getDouble("currentCode"), 0.0)
    assertEquals(0, result.rejected)
  }

  @Test fun failedPlayLookupRejectsRatherThanClaimingTheAppIsCurrent() {
    play.setInstallErrorCode(InstallErrorCode.ERROR_INTERNAL_ERROR)
    val result = check()
    assertNull(result.value)
    assertEquals(0, result.resolved)
    assertEquals(1, result.rejected)
    assertEquals("UPDATE_CHECK_FAILED", result.errorCode)
  }

  @Test fun synchronousSdkFailureAlsoRejectsTheNativePromise() {
    val failing = Proxy.newProxyInstance(AppUpdateManager::class.java.classLoader, arrayOf(AppUpdateManager::class.java)) { _, method, _ ->
      if (method.name == "getAppUpdateInfo") throw IllegalStateException("Synthetic SDK lookup failure")
      null
    } as AppUpdateManager
    val result = check(failing)
    assertEquals(0, result.resolved)
    assertEquals(1, result.rejected)
    assertEquals("UPDATE_CHECK_FAILED", result.errorCode)
  }
}
