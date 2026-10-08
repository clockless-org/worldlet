package app.worldlet.android.ui

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import app.worldlet.android.AppModel
import app.worldlet.android.R
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.PhoneApplet
import app.worldlet.kit.PushTarget

/** One screen, like the computer's world: the Attention Center over the world, and Fox resident at the bottom. */
@Composable
fun HomeScreen(model: AppModel) {
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var chat by rememberSaveable { mutableStateOf(false) }
    var cardId by rememberSaveable { mutableStateOf<String?>(null) }
    // The Applet whose page is open, and the card it was opened from (its chip), which comes back when the page closes.
    var appletKey by rememberSaveable { mutableStateOf<String?>(null) }
    var appletFrom by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        model.demo?.card?.let { cardId = it }
        model.demo?.applet?.let { appletKey = it }
    }
    // A tapped notification opens its item's card, its Applet's page or Fox's dialogue, over whatever was open.
    LaunchedEffect(model.target) {
        val target = model.target ?: return@LaunchedEffect
        showSettings = false
        appletFrom = null
        cardId = (target as? PushTarget.Item)?.id
        appletKey = (target as? PushTarget.Applet)?.key
        chat = target == PushTarget.Conversation
        model.opened()
    }
    // The open card's item as the computer last sent it, so its dialogue stays current while the card is open.
    var lastCard by remember { mutableStateOf<AttentionItem?>(null) }
    val open = cardId?.let { id -> (model.attention.now + model.attention.later).firstOrNull { it.id == id } ?: lastCard?.takeIf { it.id == id } }
    if (open != null) lastCard = open
    // The same for the open Applet; it also keeps the page drawn while it slides away.
    var lastApplet by remember { mutableStateOf<PhoneApplet?>(null) }
    val applet = appletKey?.let { key -> model.attention.applet(key) ?: lastApplet?.takeIf { it.key == key } }
    if (applet != null) lastApplet = applet

    fun openApplet(target: PhoneApplet, from: String?) {
        appletFrom = from
        appletKey = target.key
        cardId = null
    }
    fun closeApplet() {
        appletKey = null
        appletFrom?.let { cardId = it }
        appletFrom = null
    }

    Box(Modifier.fillMaxSize()) {
        WorldBackdrop()
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            // Fox's expanded chat takes the Center's room; the Center waits under it, unchanged.
            Box(Modifier.weight(1f).fillMaxWidth().alpha(if (chat) 0f else 1f)) {
                AttentionCenter(model, initialPage = model.demo?.page, open = { cardId = it.id }, openApplet = { openApplet(it, null) })
                ComputerButton(model, Modifier.align(Alignment.TopEnd).padding(end = 16.dp, top = 4.dp)) { showSettings = true }
                AppletLayer(model, applet, lastApplet, open = { cardId = it.id }, close = ::closeApplet)
                CardLayer(model, open, show = { cardId = it?.id }, openApplet = { openApplet(it, open?.id) })
            }
            FoxDock(model, open, applet, close = ::closeApplet, openSettings = { showSettings = true }, chat = chat, onChat = { chat = it })
        }
        // An Applet's website opens over everything, in this app's own browser.
        model.browsing?.let { site -> key(site.key) { WebBrowser(model, site) { model.browse(null) } } }
    }
    // Back closes the Applet's page (a card open over it closes first by its own controls).
    BackHandler(enabled = applet != null && open == null) { closeApplet() }
    if (showSettings) SettingsSheet(model) { showSettings = false }
    NotificationAsk(model)
}

/** An Applet's page rises from the bottom over the Center, which dims behind it, and stops above Fox, which stays in
 * view below it. A tap on the dimmed Center above it closes it. */
@Composable
private fun AppletLayer(model: AppModel, applet: PhoneApplet?, last: PhoneApplet?, open: (AttentionItem) -> Unit, close: () -> Unit) {
    AnimatedVisibility(applet != null, enter = fadeIn(), exit = fadeOut()) {
        Box(
            Modifier.fillMaxSize()
                .background(Color.Black.copy(alpha = 0.35f))
                .clickable(remember { MutableInteractionSource() }, indication = null, onClickLabel = "Close the Applet") { close() },
        )
    }
    AnimatedVisibility(
        applet != null,
        modifier = Modifier.padding(top = 52.dp),
        enter = slideInVertically(tween(340)) { it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(260)) { it } + fadeOut(tween(200)),
    ) {
        (applet ?: last)?.let { shown -> AppletPage(model, shown, open, close) }
    }
}

/** The open card slides down from the top over the Center, which dims behind it; Fox stays below, talking about the
 * item. A tap anywhere beside the card closes it. */
@Composable
private fun CardLayer(model: AppModel, open: AttentionItem?, show: (AttentionItem?) -> Unit, openApplet: (PhoneApplet) -> Unit) {
    AnimatedVisibility(open != null, enter = fadeIn(), exit = fadeOut()) {
        Box(
            Modifier.fillMaxSize()
                .background(Color.Black.copy(alpha = 0.45f))
                .clickable(remember { MutableInteractionSource() }, indication = null, onClickLabel = "Close the card") { show(null) }
                .testTag("cardScrim"),
        )
    }
    AnimatedContent(
        targetState = open?.id,
        transitionSpec = { (slideInVertically(tween(380)) { -it } + fadeIn(tween(220))) togetherWith fadeOut(tween(160)) },
        label = "card",
    ) { id ->
        val item = if (id == open?.id) open else null
        if (item != null) {
            AttentionCard(model, item, Modifier.padding(horizontal = 12.dp).padding(top = 4.dp, bottom = 16.dp), openApplet = openApplet, next = show)
        } else {
            Box(Modifier)
        }
    }
}

/** The world behind everything, dimmed the way the computer softens it behind the Center so its text stays readable. */
@Composable
fun WorldBackdrop() {
    Box(Modifier.fillMaxSize().background(Palette.world)) {
        Image(
            painterResource(R.drawable.world), contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().then(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Modifier.blur(9.dp) else Modifier),
        )
        Box(Modifier.fillMaxSize().background(Color(0xFF10291E).copy(alpha = 0.5f)))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(0.5f), Color.Black.copy(0.42f), Color.Black.copy(0.3f)))))
    }
}

/** The frosted look of the computer's controls: a dark translucent fill under a faint light rim. */
fun Modifier.frosted(shape: Shape, tint: Color? = null) =
    background(tint ?: Color.Black.copy(alpha = 0.32f), shape)
        .background(Palette.ink.copy(alpha = 0.06f), shape)
        .border(1.dp, Palette.ink.copy(alpha = 0.18f), shape)

/** The computer this phone follows, as a round button with a dot that says whether it is connected (green) or away;
 * it opens Settings. */
@Composable
private fun ComputerButton(model: AppModel, modifier: Modifier, open: () -> Unit) {
    val name = model.computerName.ifEmpty { "your computer" }
    val status = when {
        model.phase == AppModel.Phase.Connecting -> "Connecting to $name"
        model.computerOnline -> "Connected to $name"
        else -> "$name is away"
    }
    Box(
        modifier.size(40.dp).frosted(CircleShape).clickable(onClickLabel = "Settings", onClick = open)
            .semantics { contentDescription = "Settings"; stateDescription = status }.testTag("settings"),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Outlined.Computer, contentDescription = null, tint = Palette.ink, modifier = Modifier.size(18.dp))
        Box(
            Modifier.align(Alignment.BottomEnd).offset(x = (-7).dp, y = (-7).dp).size(9.dp)
                .background(if (model.computerOnline) Color(0xFF6FD08C) else Color(0xFF9AA39C), CircleShape)
                .border(1.dp, Color.Black.copy(alpha = 0.35f), CircleShape),
        )
    }
}

