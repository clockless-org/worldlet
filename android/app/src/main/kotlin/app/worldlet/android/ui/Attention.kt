package app.worldlet.android.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel
import app.worldlet.kit.AccountIssue
import app.worldlet.kit.AttentionAction
import app.worldlet.kit.AttentionGroup
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.PhoneApplet
import java.time.Instant
import kotlinx.coroutines.launch

/** Text over the world keeps a soft shadow so it reads on any part of the painting. */
internal val worldShadow = Shadow(Palette.inkShadow, Offset(0f, 1.5f), 3f)

/**
 * The Attention Center as the computer shows it (docs/ATTENTION-CENTER.md), in three layers stacked top to bottom
 * (owner decision 2026-10-03): the Applet world, Now (where it opens) and Later, with their tabs at the top. Swiping
 * down on Now while its content is at the top rises to the Applet world, and swiping up turns to Later; from Later a
 * swipe down at the top of its list, and from the Applet world a swipe up, come back to Now. Each page scrolls on its
 * own and hands the gesture to the pager only at its end. Tapping a row opens its card; a long press offers Done,
 * Later and Remove. The computer settles the item and sends the new Center. The widgets for now (core/artifacts) lead
 * Now; tapping one, or its tile in the Applet world, opens its page over everything.
 */
@Composable
fun AttentionCenter(model: AppModel, initialPage: String?, open: (AttentionItem) -> Unit, openApplet: (PhoneApplet) -> Unit) {
    val pager = rememberPagerState(initialPage = centerPage(initialPage)) { 3 }
    val scope = rememberCoroutineScope()
    var widgetId by rememberSaveable { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(top = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        PageTabs(pager.currentPage) { scope.launch { pager.animateScrollToPage(it) } }
        VerticalPager(pager, Modifier.fillMaxSize().padding(top = 6.dp).testTag("centerPager"), beyondViewportPageCount = 1) { page ->
            when (page) {
                APPLETS -> AppletWorld(model, openWidget = { widgetId = it }, openApplet = openApplet)
                NOW -> NowPage(model, open) { widgetId = it }
                else -> LaterPage(model, open)
            }
        }
    }
    model.widgets.firstOrNull { it.id == widgetId }?.let { widget -> WidgetScreen(model, widget) { widgetId = null } }
}

private const val APPLETS = 0
private const val NOW = 1
private const val LATER = 2

/** The layer the Center opens on: Now, unless demo mode asks for the Applet world or Later. */
private fun centerPage(name: String?) = when (name) {
    "applets" -> APPLETS
    "later" -> LATER
    else -> NOW
}

/** The Applet world, Now and Later as one frosted capsule at the top, with no counts (owner decision 2026-10-04); the
 * selected one is lit. */
@Composable
private fun PageTabs(page: Int, choose: (Int) -> Unit) {
    Row(Modifier.frosted(CircleShape).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Tab("Applets", page == APPLETS, "tabApplets", Icons.Outlined.GridView) { choose(APPLETS) }
        Tab("Now", page == NOW, "tabNow") { choose(NOW) }
        Tab("Later", page == LATER, "tabLater") { choose(LATER) }
    }
}

@Composable
private fun Tab(title: String, on: Boolean, tag: String, icon: ImageVector? = null, choose: () -> Unit) {
    val fill by animateColorAsState(if (on) Palette.leaf.copy(alpha = 0.75f) else Color.Transparent, label = "tab")
    val tint = if (on) Palette.ink else Palette.muted.copy(alpha = 0.75f)
    Row(
        Modifier.background(fill, CircleShape)
            .combinedClickable(role = Role.Tab, onClick = choose)
            .semantics { selected = on; contentDescription = title }
            .testTag(tag)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon != null) Icon(icon, null, tint = tint, modifier = Modifier.size(15.dp))
        Text(title, color = tint, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** What matters now: the widgets for now first, then the Center's three groups. */
@Composable
private fun NowPage(model: AppModel, open: (AttentionItem) -> Unit, openWidget: (String) -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(top = 10.dp, bottom = 8.dp).testTag("nowPage"),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val widgets = model.widgets.filter { it.active(Instant.now()) }
        if (widgets.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { widgets.forEach { widget -> WidgetRow(widget) { openWidget(widget.id) } } }
        }
        if (!model.computerOnline && model.phase == AppModel.Phase.Paired) ComputerOffline(model)
        model.attention.accounts?.takeIf { it.isNotEmpty() }?.let { accounts ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { accounts.forEach { AccountRow(model, it) } }
        }
        model.attention.nowGroups.forEach { (group, items) ->
            GroupSection(group) { items.forEach { HUDRow(model, it, open) } }
        }
        if (model.attention.now.isEmpty()) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val name = model.computerName.ifEmpty { "your computer" }
                Text(if (model.receivedAttention) "All clear for now." else "Connecting to $name…", color = Palette.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, style = TextStyle(shadow = worldShadow))
                Text(
                    if (model.receivedAttention) "Worldlet moves things here as they become important." else "Keep Worldlet open on your computer. The Attention Center appears here in a moment.",
                    color = Palette.muted.copy(alpha = 0.85f), fontSize = 13.sp, style = TextStyle(shadow = worldShadow),
                )
            }
        }
    }
}

/** What can wait: lighter rows that keep their own kind's colour, with a dashed rule. The list scrolls freely; a
 * swipe down at its top goes back to Now. */
@Composable
private fun LaterPage(model: AppModel, open: (AttentionItem) -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize().testTag("laterPage"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Can wait. An item moves up to Now when it needs you.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 12.sp,
                style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 10.dp))
        }
        if (model.attention.later.isEmpty()) {
            item { Text("Nothing is waiting.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 14.sp, modifier = Modifier.padding(horizontal = 10.dp)) }
        }
        items(model.attention.later, key = { it.id }) { HUDRow(model, it, open, later = true) }
    }
}

/** A group heading in its kind's colour over a faint rule, then its rows. */
@Composable
private fun GroupSection(group: AttentionGroup, rows: @Composable () -> Unit) {
    val color = Palette.group(group)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Column(Modifier.fillMaxWidth()) {
            Text(group.title.uppercase(), color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.3.sp,
                style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 8.dp).padding(bottom = 6.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(color.copy(alpha = 0.22f)))
        }
        rows()
    }
}

/** One Center row: the kind's mark, what to do, then when (in the kind's colour) and why. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HUDRow(model: AppModel, item: AttentionItem, open: (AttentionItem) -> Unit, later: Boolean = false) {
    val color = Palette.group(item.group)
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    var menu by remember { mutableStateOf(false) }
    Box(Modifier.alpha(if (later) 0.72f else 1f)) {
        Row(
            Modifier.fillMaxWidth()
                .combinedClickable(
                    onClickLabel = "Open the card",
                    onLongClickLabel = "More actions",
                    onLongClick = { haptics.performHapticFeedback(HapticFeedbackType.LongPress); menu = true },
                    onClick = { open(item) },
                )
                .testTag("row-${item.id}")
                .padding(horizontal = 10.dp, vertical = if (later) 7.dp else 9.dp),
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Box(Modifier.width(24.dp).height(if (later) 20.dp else 21.dp), contentAlignment = Alignment.Center) {
                KindMark(item.group, color, if (later) 18.dp else 22.dp)
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(item.headline, color = Palette.ink, fontSize = if (later) 14.sp else 16.sp,
                    fontWeight = if (later) FontWeight.Medium else FontWeight.SemiBold, style = TextStyle(shadow = worldShadow))
                val time = item.timeLine(context)
                val reason = item.context.ifEmpty { if (item.title == item.headline) "" else item.title }
                if (time != null || reason.isNotEmpty()) {
                    Text(
                        buildAnnotatedString {
                            if (time != null) withStyle(SpanStyle(color = color, fontWeight = FontWeight.SemiBold)) { append(time) }
                            if (reason.isNotEmpty()) withStyle(SpanStyle(color = Palette.muted)) { append(if (time == null) reason else " · $reason") }
                        },
                        fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.alpha(0.82f),
                        style = TextStyle(shadow = worldShadow),
                    )
                }
            }
        }
        if (later) {
            Canvas(Modifier.width(2.dp).matchParentSize().padding(vertical = 2.dp)) {
                drawLine(color.copy(alpha = 0.55f), Offset(1.dp.toPx(), 0f), Offset(1.dp.toPx(), size.height), 2.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())))
            }
        }
        DropdownMenu(menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text(if (item.group == AttentionGroup.NeedsAction) "Done" else "Got it") },
                leadingIcon = { Icon(Icons.Outlined.Check, null) }, onClick = { menu = false; model.act(item, AttentionAction.Done) })
            if (!item.snoozed) {
                DropdownMenuItem(text = { Text("Later") }, leadingIcon = { Icon(Icons.Outlined.Schedule, null) },
                    onClick = { menu = false; model.act(item, AttentionAction.Later) })
            }
            DropdownMenuItem(text = { Text("Remove") }, leadingIcon = { Icon(Icons.Outlined.Delete, null) },
                onClick = { menu = false; model.act(item, AttentionAction.Remove) })
        }
    }
}

/** The kind's marker, the same outlines the computer draws (ui/attention/icon.ts, a 24-unit box): Coming Up a
 * diamond, Worth Doing a rounded square, Worth Knowing a circle. */
@Composable
fun KindMark(group: AttentionGroup, color: Color, size: Dp, weight: Float = 1.7f) {
    Canvas(Modifier.size(size)) {
        val u = this.size.minDimension / 24f
        val stroke = Stroke(width = weight * u, cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (group) {
            AttentionGroup.Event -> drawPath(Path().apply {
                moveTo(12 * u, 2.6f * u); lineTo(21.4f * u, 12 * u); lineTo(12 * u, 21.4f * u); lineTo(2.6f * u, 12 * u); close()
            }, color, style = stroke)
            AttentionGroup.NeedsAction -> drawRoundRect(color, Offset(3.2f * u, 3.2f * u), Size(17.6f * u, 17.6f * u), CornerRadius(2.6f * u), style = stroke)
            AttentionGroup.Unseen -> drawCircle(color, 9 * u, style = stroke)
        }
    }
}

/** An account the computer cannot read: connect it on the computer, or have the computer open its sign-in now. */
@Composable
private fun AccountRow(model: AppModel, account: AccountIssue) {
    val opened = account.provider in model.openedOnComputer
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier.fillMaxWidth().background(Palette.ink.copy(alpha = 0.09f), shape).border(1.dp, Palette.ink.copy(alpha = 0.16f), shape).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(if (account.action == AccountIssue.Action.Permissions) Icons.Outlined.Lock else Icons.Outlined.ErrorOutline, null, tint = Palette.lantern, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Connect ${account.title} on your computer", color = Palette.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                when {
                    opened -> "Opened on ${model.computerName.ifEmpty { "your computer" }}. Finish there."
                    account.action == AccountIssue.Action.Permissions -> "Worldlet needs access again to read it."
                    else -> "Its sign-in expired, so Worldlet can't read it."
                },
                color = Palette.muted.copy(alpha = 0.85f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (!opened) {
            TextButton(
                onClick = { model.connect(account) }, enabled = model.computerOnline,
                colors = ButtonDefaults.textButtonColors(containerColor = Palette.lantern, contentColor = Palette.forest),
                modifier = Modifier.heightIn(min = 32.dp).semantics { contentDescription = "Open ${account.title} sign-in on the computer" },
            ) { Text("Open", fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        }
    }
}

@Composable
private fun ComputerOffline(model: AppModel) {
    Row(
        Modifier.fillMaxWidth().background(Palette.ink.copy(alpha = 0.09f), RoundedCornerShape(12.dp)).padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.Bedtime, null, tint = Palette.muted, modifier = Modifier.size(18.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("${model.computerName.ifEmpty { "Your computer" }} is away", color = Palette.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text("Open Worldlet on it to bring this up to date. Messages you send wait until then.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 12.sp)
            model.computerSeenAt?.let { seen ->
                val ago = android.text.format.DateUtils.getRelativeTimeSpanString(seen.toEpochMilli(), Instant.now().toEpochMilli(), android.text.format.DateUtils.MINUTE_IN_MILLIS)
                Text("Last updated $ago", color = Palette.muted.copy(alpha = 0.85f), fontSize = 12.sp)
            }
        }
    }
}
