package kr.promotors.app.qa

import android.app.Activity
import android.app.Instrumentation
import android.app.UiAutomation
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.util.Xml
import android.view.accessibility.AccessibilityNodeInfo
import org.xmlpull.v1.XmlSerializer
import java.io.StringWriter

// A separate test APK reads the real OS tree without waiting for a ticking timer to become idle.
// It targets itself, leaving the app and its notification process untouched.
class CaptureInstrumentation : Instrumentation() {
  private var notificationSurface = false
  override fun onCreate(arguments: Bundle?) {
    notificationSurface = arguments?.getString("surface") == "notifications"
    super.onCreate(arguments); start()
  }
  override fun onStart() {
    try {
      val automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
      automation.serviceInfo = automation.serviceInfo.apply {
        flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
      }
      var root = visibleRoot(automation)
      for (attempt in 0 until 10) {
        if (root != null) break
        SystemClock.sleep(200)
        root = visibleRoot(automation)
      }
      checkNotNull(root) { "No active native window" }
      val target = StringWriter()
      val xml = Xml.newSerializer()
      xml.setOutput(target)
      xml.startDocument("UTF-8", true)
      xml.startTag(null, "hierarchy")
      node(xml, root)
      xml.endTag(null, "hierarchy")
      xml.endDocument()
      finish(Activity.RESULT_OK, Bundle().apply { putString("stream", "PM_XML_BEGIN" + target + "PM_XML_END") })
    } catch (failure: Exception) {
      finish(Activity.RESULT_CANCELED, Bundle().apply { putString("stream", failure.toString()) })
    }
  }
  private fun visibleRoot(automation: UiAutomation): AccessibilityNodeInfo? {
    if (!notificationSurface) return automation.rootInActiveWindow
    // The launcher can remain the active accessibility window behind the visible shade.
    return automation.windows.mapNotNull { it.root }
      .filter { it.packageName?.toString() == "com.android.systemui" && it.isVisibleToUser }
      .maxByOrNull { Rect().also(it::getBoundsInScreen).let { bounds -> bounds.width().toLong() * bounds.height() } }
      ?: automation.rootInActiveWindow
  }
  private fun node(xml: XmlSerializer, source: AccessibilityNodeInfo) {
    if (!source.isVisibleToUser) return
    val bounds = Rect(); source.getBoundsInScreen(bounds)
    xml.startTag(null, "node")
    for ((key, value) in mapOf("text" to source.text, "content-desc" to source.contentDescription,
        "resource-id" to source.viewIdResourceName, "class" to source.className, "package" to source.packageName)) {
      xml.attribute(null, key, value?.toString() ?: "")
    }
    xml.attribute(null, "bounds", "[${bounds.left},${bounds.top}][${bounds.right},${bounds.bottom}]")
    for (index in 0 until source.childCount) source.getChild(index)?.let { node(xml, it) }
    xml.endTag(null, "node")
  }
}
