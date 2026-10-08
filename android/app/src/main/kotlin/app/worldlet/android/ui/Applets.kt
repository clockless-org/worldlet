package app.worldlet.android.ui

import android.provider.Settings
import android.text.format.DateUtils
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.PhoneApplet
import java.time.Instant
import kotlinx.coroutines.launch

/** The red of a failed lamp. */
private val failedRed = Color(0xFFD9534F)

/**
 * The Applet world, the layer above Now (owner decision 2026-10-03): the World behind the Center comes forward as a
 * grid of the Applets that work on the phone, in the computer's own order (owner request 2026-10-07): the person's own
 * under Yours, then the others, those at work or holding Now items first; Applets that work only on the computer are
 * not sent. A tile breathes a lantern ring while its Applet works, like the device's lamp on the computer, shows a red
 * dot when it failed and fades when it is off; its badge counts the Now items it holds. A tile with a website opens it
 * in this app's own browser (Browser.kt), and a long press opens the Applet's page; a widget's tile opens its page
 * and an ongoing thing's tile its page.
 */
@Composable
fun AppletWorld(model: AppModel, openWidget: (String) -> Unit, openApplet: (PhoneApplet) -> Unit) {
    val applets = model.attention.applets.orEmpty()
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(top = 10.dp, bottom = 24.dp).testTag("appletWorld"),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        if (applets.isEmpty()) {
            Text("Your Applets appear here when your computer sends them.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 14.sp,
                style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp))
        }
        listOf(true, false).forEach { mine ->
            val tiles = applets.filter { (it.mine != null) == mine }
            if (tiles.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Heading(if (mine) "Yours" else "Applets")
                    tiles.chunked(4).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { applet ->
                                AppletCell(model, applet, Modifier.weight(1f), details = { openApplet(applet) }) {
                                    val widget = applet.widget
                                    when {
                                        widget != null -> openWidget(widget)
                                        applet.website != null -> model.browse(applet)
                                        else -> openApplet(applet)
                                    }
                                }
                            }
                            repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

/** A small uppercase heading over a faint rule, like the Center's group headings. */
@Composable
private fun Heading(title: String) {
    Column(Modifier.fillMaxWidth()) {
        Text(title.uppercase(), color = Palette.muted.copy(alpha = 0.75f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.3.sp,
            style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 8.dp).padding(bottom = 6.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.ink.copy(alpha = 0.14f)))
    }
}

/** One Applet in the grid: its tile, its name below, and its marks. A tile with a website offers its page on a long
 * press. */
@Composable
private fun AppletCell(model: AppModel, applet: PhoneApplet, modifier: Modifier, details: () -> Unit, open: () -> Unit) {
    val held = model.attention.now.count { it.applet == applet.key }
    Column(
        modifier.alpha(if (applet.state == PhoneApplet.State.Off) 0.45f else 1f)
            .then(if (applet.website != null) {
                Modifier.combinedClickable(onClickLabel = "Open ${applet.title}", onLongClickLabel = "Details", onLongClick = details, onClick = open)
            } else Modifier.clickable(onClickLabel = "Open the Applet", onClick = open))
            .semantics {
                contentDescription = applet.title
                stateDescription = listOfNotNull(if (applet.mine != null) "Yours" else null, applet.line, if (held > 0) "$held in Now" else null).joinToString(", ")
            }
            .testTag("applet-${applet.key}")
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box {
            AppletTile(model, applet, 52.dp)
            // The person's own Applet carries the honey star its device has on the computer (core/applets/MY-APPLETS.md).
            if (applet.mine != null) {
                Box(
                    Modifier.align(Alignment.BottomEnd).offset(x = 5.dp, y = 5.dp).size(17.dp)
                        .background(Color(0xFFD9A441), CircleShape).border(1.5.dp, Color(0xFFFFF8EA), CircleShape)
                        .testTag("appletMine-${applet.key}"),
                    contentAlignment = Alignment.Center,
                ) { Text("★", color = Color(0xFFFFFAF0), fontSize = 9.sp, fontWeight = FontWeight.Bold) }
            }
            if (applet.state == PhoneApplet.State.Failed) {
                Box(Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-4).dp).size(11.dp).background(failedRed, CircleShape)
                    .border(1.dp, Color.Black.copy(alpha = 0.3f), CircleShape))
            } else if (held > 0) {
                Text(
                    "$held", color = Color(0xFF3A2C10), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-6).dp)
                        .background(Palette.group(app.worldlet.kit.AttentionGroup.NeedsAction), CircleShape)
                        .widthIn(min = 18.dp).padding(horizontal = 5.dp, vertical = 1.dp).testTag("appletBadge-${applet.key}"),
                )
            }
        }
        Text(applet.title, color = Palette.ink, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = TextStyle(shadow = worldShadow))
    }
}

/** An Applet's face: its initial on frosted glass, or a widget's initial on its own colour. While the Applet works a
 * lantern ring breathes around it every 2.4 seconds, as the device's lamp does on the computer; with animations off
 * the ring stays still. */
@Composable
fun AppletTile(model: AppModel, applet: PhoneApplet, size: Dp) {
    val shape = RoundedCornerShape(size * 0.3f)
    val busy = applet.state == PhoneApplet.State.Busy
    val context = LocalContext.current
    val still = remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val breath = if (busy && !still) {
        rememberInfiniteTransition(label = "lamp").animateFloat(
            0.45f, 0.95f, infiniteRepeatable(tween(1200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breath",
        ).value
    } else 0.95f
    val accent = applet.widget?.let { id -> widgetColor(model.widgets.firstOrNull { it.id == id }?.color ?: "") }
    Box(
        Modifier.size(size)
            .then(if (accent != null) Modifier.background(accent, shape).border(1.dp, Palette.ink.copy(alpha = 0.25f), shape) else Modifier.frosted(shape))
            .then(if (busy) Modifier.border(2.dp, Palette.lantern.copy(alpha = breath), shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(applet.initial, color = if (accent != null) Color.White else Palette.ink, fontSize = (size.value * 0.4f).sp, fontWeight = FontWeight.SemiBold)
    }
}

/** What an Applet's lamp says, in a word. */
private fun stateWord(state: PhoneApplet.State) = when (state) {
    PhoneApplet.State.Busy -> "Working"
    PhoneApplet.State.Ready -> "Ready"
    PhoneApplet.State.Failed -> "Needs attention"
    PhoneApplet.State.Off -> "Off"
}

/**
 * An Applet's page on the phone: it rises from the bottom over the Center and stops above Fox, who stays where it is
 * and talks about this Applet. Top to bottom: the Applet with what it is doing, Open (its website) or Open on computer, the items it brought
 * to the Center (each opens its card) and its latest lines from the world log, newest first. Dragging the handle down,
 * Back or the ✕ (here or on the pill above Fox) goes back to where the page was opened from.
 */
@Composable
fun AppletPage(model: AppModel, applet: PhoneApplet, open: (AttentionItem) -> Unit, close: () -> Unit) {
    val scope = rememberCoroutineScope()
    val drag = remember { Animatable(0f) }
    val shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp)
    Column(
        Modifier.fillMaxSize()
            .graphicsLayer { translationY = maxOf(0f, drag.value) }
            .shadow(18.dp, shape)
            .background(Palette.world.copy(alpha = 0.96f), shape)
            .border(1.dp, Palette.ink.copy(alpha = 0.14f), shape)
            .testTag("appletPage"),
    ) {
        // The handle and the header take the drag; the rest scrolls.
        Column(
            Modifier.fillMaxWidth()
                .draggable(rememberDraggableState { delta -> scope.launch { drag.snapTo(maxOf(0f, drag.value + delta)) } }, Orientation.Vertical,
                    onDragStopped = { velocity -> if (drag.value > 240f || velocity > 1500f) close() else drag.animateTo(0f) })
                .padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.width(38.dp).height(5.dp).background(Palette.ink.copy(alpha = 0.35f), CircleShape).testTag("appletHandle"))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppletTile(model, applet, 46.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(applet.title, color = Palette.ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    applet.line?.takeIf { it.isNotEmpty() }?.let {
                        Text(it, color = Palette.muted.copy(alpha = 0.85f), fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    Text(stateWord(applet.state), color = when (applet.state) {
                        PhoneApplet.State.Busy -> Palette.lantern
                        PhoneApplet.State.Failed -> Color(0xFFF08A84)
                        else -> Palette.muted.copy(alpha = 0.7f)
                    }, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                IconButton(onClick = close, modifier = Modifier.size(32.dp).frosted(CircleShape).testTag("appletClose")) {
                    Icon(Icons.Outlined.Close, "Close", tint = Palette.ink, modifier = Modifier.size(16.dp))
                }
            }
            // A website opens in this app's own browser; a moment Applet (a widget) lives on the phone too, so it has nothing
            // to open on the computer.
            if (applet.website != null) {
                TextButton(
                    onClick = { model.browse(applet) },
                    colors = ButtonDefaults.textButtonColors(containerColor = Palette.lantern, contentColor = Palette.forest),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp)
                        .semantics { contentDescription = "Open ${applet.title}" }.testTag("appletWebsite"),
                ) {
                    Icon(Icons.Outlined.OpenInBrowser, null, Modifier.size(16.dp))
                    Text("  Open ${applet.title}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            } else if (applet.widget == null) {
                val opened = applet.key in model.openedApplets
                TextButton(
                    onClick = { model.openOnComputer(applet) }, enabled = model.computerOnline && !opened,
                    colors = ButtonDefaults.textButtonColors(containerColor = Palette.lantern, contentColor = Palette.forest,
                        disabledContainerColor = Palette.lantern.copy(alpha = 0.35f), disabledContentColor = Palette.forest.copy(alpha = 0.7f)),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp)
                        .semantics { contentDescription = "Open ${applet.title} on the computer" }.testTag("appletOpen"),
                ) {
                    Icon(if (opened) Icons.Outlined.Check else Icons.Outlined.Computer, null, Modifier.size(16.dp))
                    Text(if (opened) "  Opened on ${model.computerName.ifEmpty { "your computer" }}" else "  Open on computer", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Column(
            Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val items = model.attention.items(applet)
            val recent = applet.recent.orEmpty().asReversed()
            if (items.isNotEmpty()) {
                PageSection("From here") { items.forEach { HUDRow(model, it, open, later = it.snoozed) } }
            }
            if (recent.isNotEmpty()) {
                PageSection("Recent") {
                    recent.forEach { line ->
                        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(line.text, color = Palette.ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            runCatching { Instant.parse(line.at) }.getOrNull()?.let { at ->
                                Text(DateUtils.getRelativeTimeSpanString(at.toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE).toString(),
                                    color = Palette.muted.copy(alpha = 0.7f), fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
            if (items.isEmpty() && recent.isEmpty()) {
                Text("Nothing from ${applet.title} needs you right now. Ask ${model.conversation.name} below, or open it on your computer.",
                    color = Palette.muted.copy(alpha = 0.85f), fontSize = 14.sp, modifier = Modifier.padding(horizontal = 10.dp))
            }
        }
    }
}

@Composable
private fun PageSection(title: String, rows: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Heading(title)
        rows()
    }
}

/** The paper pill above Fox while an Applet's page is open: Fox is talking about this Applet; ✕ closes the page. */
@Composable
fun AppletContextPill(applet: PhoneApplet, close: () -> Unit) {
    Row(
        Modifier.shadow(4.dp, CircleShape).background(Color(0xFFF9F6E4), CircleShape).padding(start = 14.dp, end = 4.dp).testTag("foxContext"),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("In ${applet.title}", color = Color(0xFF203B30), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 220.dp))
        Box(
            Modifier.size(30.dp).clickable(onClickLabel = "Close ${applet.title}", onClick = close)
                .semantics { contentDescription = "Close ${applet.title}"; role = Role.Button }.testTag("foxContextClose"),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Outlined.Close, null, tint = Color(0xFF203B30), modifier = Modifier.size(14.dp)) }
    }
}
