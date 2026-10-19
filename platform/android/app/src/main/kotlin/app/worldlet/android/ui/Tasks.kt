package app.worldlet.android.ui

import android.provider.Settings
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Image
import androidx.compose.foundation.ScrollState
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel
import app.worldlet.android.R
import app.worldlet.kit.PhoneApplet
import app.worldlet.kit.PhoneTask

/**
 * The Tasks tab (owner request 2026-10-11): the computer's Task panel, the cards either side of Fox. Doing now is what
 * the person's Agent is working on, newest first, each with a thin bar (how far it is when the computer knows, else
 * moving); a row whose Applet is on the phone opens that Applet's page, and any other opens to show what the task has
 * said. Routines are its scheduled jobs, soonest first, with when each runs next. A computer older than this slot
 * shows the same empty lines as one with nothing to show.
 */
@Composable
fun TasksPage(model: AppModel, scroll: ScrollState, openApplet: (PhoneApplet) -> Unit) {
    val tasks = model.attention.tasks
    Column(
        Modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 14.dp).padding(top = 10.dp, bottom = 24.dp).testTag("tasksPage"),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Heading("Doing now")
            val now = tasks?.now.orEmpty()
            if (now.isEmpty()) Quiet("Nothing running right now.", "tasksNowEmpty")
            now.forEach { task -> RunningRow(model, task, model.attention.applet(task.applet), openApplet) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Heading("Routines")
            val routines = tasks?.routines.orEmpty()
            if (routines.isEmpty()) Quiet("No Routines yet. Ask ${model.conversation.name} to set one up.", "routinesEmpty")
            routines.forEach { RoutineRow(it) }
        }
    }
}

@Composable
private fun Quiet(text: String, tag: String) {
    Text(text, color = Palette.muted.copy(alpha = 0.85f), fontSize = 14.sp, style = TextStyle(shadow = worldShadow),
        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp).testTag(tag))
}

/** A task at work: its picture, name and status over a thin bar. Its lines open under it when it has no Applet here. */
@Composable
private fun RunningRow(model: AppModel, task: PhoneTask, applet: PhoneApplet?, openApplet: (PhoneApplet) -> Unit) {
    var expanded by rememberSaveable(task.id) { mutableStateOf(false) }
    val lines = task.lines.orEmpty()
    val fraction = task.fraction
    Column(
        Modifier.fillMaxWidth().animateContentSize()
            .clickable(onClickLabel = if (applet != null) "Open ${applet.title}" else if (expanded) "Hide what it said" else "Show what it said") {
                if (applet != null) openApplet(applet) else expanded = !expanded
            }
            .semantics(mergeDescendants = true) { stateDescription = listOfNotNull(task.status.ifEmpty { null }, fraction?.let { "${(it * 100).toInt()}%" }).joinToString(", ") }
            .testTag("task-${task.id}")
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val glyph = applet ?: model.attention.applet(task.icon)
            if (glyph != null) AppletGlyph(model, glyph, 36.dp) else FoxGlyph(36.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(task.name, color = Palette.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = TextStyle(shadow = worldShadow))
                val status = task.status.ifEmpty { task.`when` }
                if (status.isNotEmpty()) {
                    Text(status, color = Palette.muted.copy(alpha = 0.85f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, style = TextStyle(shadow = worldShadow))
                }
            }
        }
        TaskBar(fraction, Modifier.padding(start = 48.dp).testTag("taskBar-${task.id}"))
        if (expanded && applet == null) {
            Column(Modifier.padding(start = 48.dp).testTag("taskLines-${task.id}"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (lines.isEmpty()) Text("Nothing said yet.", color = Palette.muted.copy(alpha = 0.7f), fontSize = 13.sp)
                lines.forEach { Text(it, color = Palette.ink.copy(alpha = 0.9f), fontSize = 13.sp, style = TextStyle(shadow = worldShadow)) }
            }
        }
    }
}

/** A thin lantern bar: filled as far as the task is, or moving when the computer does not know (still, half full, while
 * animations are off). */
@Composable
private fun TaskBar(fraction: Float?, modifier: Modifier) {
    val context = LocalContext.current
    val still = remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val bar = modifier.fillMaxWidth().height(3.dp).clip(CircleShape)
    val track = Palette.ink.copy(alpha = 0.14f)
    when {
        fraction != null -> LinearProgressIndicator(progress = { fraction }, modifier = bar, color = Palette.lantern, trackColor = track, drawStopIndicator = {}, gapSize = 0.dp)
        still -> LinearProgressIndicator(progress = { 0.5f }, modifier = bar, color = Palette.lantern.copy(alpha = 0.6f), trackColor = track, drawStopIndicator = {}, gapSize = 0.dp)
        else -> LinearProgressIndicator(modifier = bar, color = Palette.lantern, trackColor = track, gapSize = 0.dp)
    }
}

/** A Routine: a clock, its name and when it runs next, and how often and by whom under them. */
@Composable
private fun RoutineRow(task: PhoneTask) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = task.name }.testTag("routine-${task.id}")
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).frosted(CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Schedule, null, tint = Palette.ink, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(task.name, color = Palette.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = TextStyle(shadow = worldShadow))
            val how = listOfNotNull(task.every?.takeIf { it.isNotEmpty() }, task.by?.takeIf { it.isNotEmpty() }).joinToString(" · ")
            if (how.isNotEmpty()) {
                Text(how, color = Palette.muted.copy(alpha = 0.85f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, style = TextStyle(shadow = worldShadow))
            }
        }
        if (task.`when`.isNotEmpty()) {
            Text(task.`when`, color = Palette.muted.copy(alpha = 0.85f), fontSize = 12.sp, fontWeight = FontWeight.Medium, style = TextStyle(shadow = worldShadow))
        }
    }
}

/** Fox's portrait in a frosted circle, for what Fox itself is doing. */
@Composable
private fun FoxGlyph(size: Dp) {
    Box(Modifier.size(size).frosted(CircleShape).clip(CircleShape), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.fox), null, Modifier.size(size - 4.dp))
    }
}
