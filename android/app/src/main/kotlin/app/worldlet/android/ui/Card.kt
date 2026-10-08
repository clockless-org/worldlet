package app.worldlet.android.ui

import android.annotation.SuppressLint
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Article
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel
import app.worldlet.android.R
import app.worldlet.kit.AttentionAction
import app.worldlet.kit.AttentionGroup
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.PhoneApplet
import kotlinx.coroutines.launch

/**
 * The card a row opens: the computer's card (docs/ATTENTION-CENTER.md "Brief card composition"), as the iPhone draws
 * it. It slides down from the top on paper with the item's illustration across its head, the kind, title, when and
 * where it came from, the saved brief, and the person's own controls at its foot: one prominent outcome (Done for a
 * task, Got it otherwise), Later and Dismiss (the item stays). Each sends the card flying the way it points (Later
 * up, Dismiss left, Done right) and brings down the next item's card. The close button, a swipe up or a tap anywhere
 * beside it closes it. When the item's home Applet is in the Applet world, "From <Applet> ›" by the source opens that
 * Applet's page in the card's place.
 */
@Composable
fun AttentionCard(model: AppModel, item: AttentionItem, modifier: Modifier = Modifier, openApplet: (PhoneApplet) -> Unit = {}, next: (AttentionItem?) -> Unit) {
    val accent = Palette.accent(item.group)
    val scope = rememberCoroutineScope()
    val drag = remember { Animatable(0f) }
    val flyX = remember { Animatable(0f) }
    val flyY = remember { Animatable(0f) }
    val shape = RoundedCornerShape(28.dp)

    fun leave(x: Float, y: Float, then: () -> Unit) {
        if (flyX.value != 0f || flyY.value != 0f) return
        scope.launch {
            launch { flyX.animateTo(x, tween(280)) }
            flyY.animateTo(y, tween(280))
            then()
        }
    }

    /** The item after this one in its list, for Dismiss: the card closes, the item stays, and the next one opens. */
    fun following(): AttentionItem? {
        val list = if (item.snoozed) model.attention.later else model.attention.now
        val index = list.indexOfFirst { it.id == item.id }
        return if (index >= 0 && index + 1 < list.size) list[index + 1] else null
    }

    fun settle(action: AttentionAction) {
        val list = if (item.snoozed) model.attention.later else model.attention.now
        val index = list.indexOfFirst { it.id == item.id }
        model.act(item, action)
        val rest = if (item.snoozed) model.attention.later.filter { it.snoozed && it.id != item.id } else model.attention.now
        next(if (index >= 0 && rest.isNotEmpty()) rest[minOf(index, rest.size - 1)] else null)
    }

    Column(
        modifier
            .graphicsLayer {
                translationY = minOf(0f, drag.value) + flyY.value
                translationX = flyX.value
                rotationZ = flyX.value / 30f / density
                transformOrigin = TransformOrigin(0.5f, 1f)
                alpha = if (flyX.value == 0f && flyY.value == 0f) 1f else 0.6f
            }
            .shadow(24.dp, shape)
            .clip(shape)
            .background(Palette.paper)
            .border(1.dp, Color(0x40B4A17D), shape)
            .draggable(rememberDraggableState { delta -> scope.launch { drag.snapTo(drag.value + delta) } }, Orientation.Vertical,
                onDragStopped = { velocity -> if (drag.value < -200f || velocity < -1500f) next(null) else drag.animateTo(0f) })
            .testTag("card-${item.id}"),
    ) {
        // A long brief scrolls inside the card, its buttons staying put.
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            Box {
                Hero(item.art ?: defaultArt(item.group))
                IconButton(
                    onClick = { next(null) },
                    colors = IconButtonDefaults.iconButtonColors(containerColor = Color.White.copy(alpha = 0.75f), contentColor = Palette.paperInk),
                    modifier = Modifier.align(Alignment.TopEnd).padding(10.dp).size(34.dp).testTag("cardClose"),
                ) { Icon(Icons.Outlined.Close, "Close", Modifier.size(16.dp)) }
            }
            Column(Modifier.padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    Modifier.background(accent.copy(alpha = 0.12f), CircleShape).padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    KindMark(item.group, accent, 14.dp, weight = 2f)
                    Text(item.group.title, color = accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                Text(item.headline, color = Palette.paperInk, fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 28.sp)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    item.timeLine(LocalContext.current)?.let { Fact(Icons.Outlined.Schedule, it) }
                    item.source?.takeIf { it.isNotEmpty() }?.let { Fact(providerIcon(it), providerName(it)) }
                }
                model.attention.applet(item.applet)?.let { home ->
                    Text(
                        "From ${home.title} ›", color = accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(CircleShape).background(accent.copy(alpha = 0.10f))
                            .clickable(onClickLabel = "Open ${home.title}") { openApplet(home) }
                            .padding(horizontal = 12.dp, vertical = 6.dp).testTag("cardApplet"),
                    )
                }
                val brief = item.summary?.takeIf { it.isNotEmpty() } ?: item.context
                if (brief.isNotEmpty()) {
                    HorizontalDivider(Modifier.padding(vertical = 4.dp), color = Palette.paperFoot.copy(alpha = 0.2f))
                    Brief(brief)
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 12.dp, bottom = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val outline = ButtonDefaults.outlinedButtonColors(contentColor = accent)
            if (!item.snoozed) {
                OutlinedButton({ leave(0f, -2400f) { settle(AttentionAction.Later) } }, colors = outline, modifier = Modifier.testTag("cardLater")) { Text("Later", fontWeight = FontWeight.SemiBold) }
            }
            OutlinedButton({ leave(-1600f, 100f) { next(following()) } }, colors = outline, modifier = Modifier.testTag("cardDismiss")) { Text("Dismiss", fontWeight = FontWeight.SemiBold) }
            Button(
                { leave(1600f, 100f) { settle(AttentionAction.Done) } },
                colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Color.White),
                modifier = Modifier.weight(1f).testTag("cardDone"),
            ) { Text(if (item.group == AttentionGroup.NeedsAction) "Done" else "Got it", fontWeight = FontWeight.SemiBold) }
        }
    }
}

@Composable
private fun Fact(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, null, tint = Palette.paperFoot, modifier = Modifier.size(16.dp))
        Text(text, color = Palette.paperFoot, fontSize = 14.sp)
    }
}

/** The item's painted illustration across the top of the card, fading softly into the paper below it. */
@SuppressLint("DiscouragedApi")
@Composable
private fun Hero(name: String) {
    val context = LocalContext.current
    val id = remember(name) {
        context.resources.getIdentifier(name.replace('-', '_'), "drawable", context.packageName).takeIf { it != 0 } ?: R.drawable.worth_knowing
    }
    Box(Modifier.fillMaxWidth().height(190.dp)) {
        Image(painterResource(id), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(36.dp).background(Brush.verticalGradient(listOf(Palette.paper.copy(alpha = 0f), Palette.paper))))
    }
}

/** The brief's Markdown: paragraphs and bullet points, with bold key points. */
@Composable
private fun Brief(text: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        text.lines().map { it.trim() }.filter { it.isNotEmpty() }.forEach { line ->
            val bullet = listOf("- ", "* ", "• ").firstOrNull { line.startsWith(it) }
            val body = when {
                bullet != null -> line.removePrefix(bullet)
                line.startsWith("#") -> "**" + line.trimStart('#', ' ') + "**"
                else -> line
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (bullet != null) Text("•", color = Palette.paperInk, fontSize = 16.sp)
                Text(markdown(body), color = Palette.paperInk, fontSize = 16.sp, lineHeight = 24.sp)
            }
        }
    }
}

fun defaultArt(group: AttentionGroup) = when (group) {
    AttentionGroup.Event -> "coming-up"
    AttentionGroup.NeedsAction -> "do-something"
    AttentionGroup.Unseen -> "worth-knowing"
}

fun providerName(id: String): String {
    val known = mapOf("gmail" to "Gmail", "google-calendar" to "Google Calendar", "github" to "GitHub", "outlook" to "Outlook",
        "apple-calendar" to "Calendar", "apple-reminders" to "Reminders", "notion" to "Notion", "slack" to "Slack")
    return known[id] ?: id.split('-').joinToString(" ") { part -> part.replaceFirstChar { it.uppercase() } }
}

private fun providerIcon(id: String): ImageVector = when {
    "mail" in id || id == "outlook" -> Icons.Outlined.Email
    "calendar" in id -> Icons.Outlined.CalendarMonth
    "reminder" in id -> Icons.Outlined.Checklist
    id == "github" -> Icons.Outlined.Code
    else -> Icons.AutoMirrored.Outlined.Article
}
