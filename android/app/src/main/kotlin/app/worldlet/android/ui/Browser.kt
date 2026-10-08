package app.worldlet.android.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.worldlet.android.AppModel
import app.worldlet.kit.PhoneApplet

private val paper = Color(0xFFF9F6E4)
private val paperInk = Color(0xFF203B30)

/**
 * An Applet's website, opened in this app rather than a browser or the site's own app (owner request 2026-10-07: "不要
 * 跳转，在我们自己的app里做"): a bar with ✕, the page's title, back, forward and reload, and the page below. Sign-ins
 * made here stay on this phone, in this app's own website storage. What happens on the page goes to the computer,
 * which keeps it in the World by its browser's rules (core/phone/README.md); the observer is the computer's own
 * (assets/web-record.js, made by scripts/phone-web-record.mjs). Back goes back in the page, then closes it.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebBrowser(model: AppModel, applet: PhoneApplet, close: () -> Unit) {
    val context = LocalContext.current
    val observer = remember { runCatching { context.assets.open("web-record.js").bufferedReader().use { it.readText() } }.getOrNull() }
    var title by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var back by remember { mutableStateOf(false) }
    var forward by remember { mutableStateOf(false) }
    val web = remember {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // The observer reports here; a page that imitates it can only add to its own site's recording.
            addJavascriptInterface(object {
                @JavascriptInterface fun record(text: String) = model.recordWeb(applet.key, text)
            }, "WorldletAndroid")
            webViewClient = object : WebViewClient() {
                // Web pages only; a link to another app (mail, phone, an app's own scheme) stays unopened.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.scheme?.lowercase() !in setOf("https", "http")
                override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { loading = true }
                override fun onPageFinished(view: WebView, url: String?) {
                    loading = false
                    title = view.title.orEmpty()
                    back = view.canGoBack(); forward = view.canGoForward()
                    if (observer != null && url?.startsWith("https://") == true) view.evaluateJavascript(observer, null)
                }
                override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                    back = view.canGoBack(); forward = view.canGoForward()
                }
            }
            applet.website?.let(::loadUrl)
        }
    }
    DisposableEffect(web) {
        onDispose {
            model.flushWeb()
            web.stopLoading()
            web.destroy()
        }
    }
    BackHandler { if (web.canGoBack()) web.goBack() else close() }
    Column(Modifier.fillMaxSize().background(paper).safeDrawingPadding().testTag("browser")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = close, modifier = Modifier.testTag("browserClose")) { Icon(Icons.Outlined.Close, "Close", tint = paperInk) }
            Text(title.ifEmpty { applet.title }, color = paperInk, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(horizontal = 4.dp))
            IconButton(onClick = { web.goBack() }, enabled = back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = paperInk.copy(alpha = if (back) 1f else 0.35f)) }
            IconButton(onClick = { web.goForward() }, enabled = forward) { Icon(Icons.AutoMirrored.Outlined.ArrowForward, "Forward", tint = paperInk.copy(alpha = if (forward) 1f else 0.35f)) }
            IconButton(onClick = { web.reload() }) { Icon(Icons.Outlined.Refresh, "Reload", tint = paperInk) }
        }
        Box(Modifier.fillMaxWidth().weight(1f)) {
            AndroidView({ web }, Modifier.fillMaxSize().testTag("browserPage"))
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp).align(Alignment.TopCenter), color = paperInk)
        }
    }
}
