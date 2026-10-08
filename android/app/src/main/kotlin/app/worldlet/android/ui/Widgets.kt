package app.worldlet.android.ui

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.worldlet.android.AppModel
import app.worldlet.kit.PhoneWidget
import app.worldlet.kit.WidgetReport
import app.worldlet.kit.widgetDocument
import app.worldlet.kit.widgetSeed
import app.worldlet.kit.widgetUntil
import app.worldlet.kit.widgetValues
import java.io.ByteArrayInputStream
import java.time.Instant
import java.time.ZoneId

/** A widget's accent (`#rrggbb`), or the computer's default slate blue. */
fun widgetColor(hex: String): Color {
    val rgb = hex.removePrefix("#").takeIf { it.length == 6 }?.toLongOrNull(16) ?: 0x5C7F9E
    return Color(0xFF000000 or rgb)
}

/** A widget for now at the top of Now: its accent, name, one line about it and how long it lasts. Tapping opens it. */
@Composable
fun WidgetRow(widget: PhoneWidget, open: () -> Unit) {
    val accent = widgetColor(widget.color)
    val light = lerp(accent, Palette.ink, 0.55f)
    val shape = RoundedCornerShape(14.dp)
    val until = widgetUntil(widget, Instant.now(), ZoneId.systemDefault())
    Row(
        Modifier.fillMaxWidth()
            .frosted(shape, tint = accent.copy(alpha = 0.28f))
            .clickable(onClickLabel = "Open the Applet", onClick = open)
            .testTag("widget-row")
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        Box(Modifier.width(4.dp).height(38.dp).background(light, CircleShape))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(widget.title, color = Palette.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (widget.blurb.isNotEmpty()) {
                Text(widget.blurb, color = Palette.muted.copy(alpha = 0.85f), fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (until.isNotEmpty()) Text(until, color = light, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Palette.muted.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
    }
}

/** The open widget over everything: its name and a close button on top, its page below. A widget whose page has not
 * reached this phone opens on the computer instead. */
@Composable
fun WidgetScreen(model: AppModel, widget: PhoneWidget, close: () -> Unit) {
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Palette.paper).safeDrawingPadding().testTag("widget-view")) {
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(10.dp).background(widgetColor(widget.color), CircleShape))
                Text(widget.title, color = Palette.paperInk, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconButton(
                    onClick = close,
                    colors = IconButtonDefaults.iconButtonColors(contentColor = Palette.paperInk),
                    modifier = Modifier.testTag("widgetClose"),
                ) { Icon(Icons.Outlined.Close, "Close") }
            }
            HorizontalDivider(color = Palette.paperFoot.copy(alpha = 0.2f))
            val page = widget.page
            if (page != null) {
                WidgetPage(model, widget, page)
            } else {
                Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(Icons.Outlined.Computer, null, tint = Palette.paperFoot, modifier = Modifier.size(28.dp))
                    Text("Open it on your computer", color = Palette.paperInk, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("This Applet's page is too large to send to the phone right now.", color = Palette.paperFoot, fontSize = 14.sp,
                        textAlign = TextAlign.Center, style = TextStyle(lineHeight = 20.sp))
                }
            }
        }
    }
}

/**
 * The widget's page in a sandboxed web view (core/widgets/README.md, Sandbox): no network, file or content access,
 * navigation and new windows refused, loaded from a string with no base URL, WebRTC taken out of its window before its
 * own code runs ([widgetDocument]). Its only channel is `WorldletAndroid`:
 * `seed()` gives the stored values and scroll, `post(json)` reports all of its storage, its scroll or an error. When
 * the computer's edits change what the page shows, it reloads where it was scrolled.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun WidgetPage(model: AppModel, widget: PhoneWidget, page: String) {
    val values = widgetValues(widget.state)
    val bridge = remember(widget.id) { WidgetBridge(model, widget.id) }
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.apply {
                    javaScriptEnabled = true
                    blockNetworkLoads = true
                    allowFileAccess = false
                    allowContentAccess = false
                    domStorageEnabled = false
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(false)
                    setGeolocationEnabled(false)
                }
                webViewClient = SandboxClient
                addJavascriptInterface(bridge, "WorldletAndroid")
            }
        },
        update = { view -> bridge.show(view, page, values) },
        onRelease = { view -> view.stopLoading(); view.destroy() },
        modifier = Modifier.fillMaxSize().testTag("widget-web"),
    )
}

/** Refuses every navigation, and answers any request that would leave the page with an empty 403. */
private object SandboxClient : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val scheme = request.url.scheme?.lowercase()
        if (scheme == "data" || scheme == "blob" || scheme == "about") return null
        return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    }
}

/** `WorldletAndroid` in the page. Its methods run on the web view's own thread; what they change is handed to the main
 * thread. */
private class WidgetBridge(private val model: AppModel, private val id: String) {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var seedJson = "{\"state\":{}}"
    /** What the page holds now: the values it was loaded with or last reported (main thread only). */
    private var shown: Map<String, String>? = null
    private var loaded: String? = null

    /** Loads the page again when it is new, or when the stored values differ from what the page last reported (an
     * edit from the computer). */
    fun show(view: WebView, page: String, values: Map<String, String>) {
        if (page == loaded && values == shown) return
        loaded = page
        shown = values
        seedJson = widgetSeed(values, model.widgetScroll[id] ?: 0)
        view.loadDataWithBaseURL(null, widgetDocument(page), "text/html", "utf-8", null)
    }

    @JavascriptInterface
    fun seed(): String = seedJson

    @JavascriptInterface
    fun post(json: String) {
        val report = WidgetReport.read(json) ?: return
        main.post {
            report.state?.let { values ->
                shown = values
                model.widgetChanged(id, values)
            }
            report.scroll?.let { model.widgetScroll[id] = it }
        }
    }
}
