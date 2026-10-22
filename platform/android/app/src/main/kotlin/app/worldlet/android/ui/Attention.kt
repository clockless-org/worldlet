package app.worldlet.android.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel
import app.worldlet.kit.AccountIssue
import app.worldlet.kit.AttentionAction
import app.worldlet.kit.AttentionGroup
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.JournalEntry
import app.worldlet.kit.PhoneApplet
import java.time.Instant
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Text over the world keeps a soft shadow so it reads on any part of the painting. */
internal val worldShadow = Shadow(Palette.inkShadow, Offset(0f, 1.5f), 3f)

/**
 * The Attention Center as three tabs chosen with the capsule at the top or a swipe sideways (owner requests 2026-10-11
 * and 10-12, replacing the Applet world, Now and Later layers): **Today**, where it opens, is one scroll from the date and
 * today's Journal through Now to Later; **Applets** lists the World's Applets; **Tasks** is what the person's Agent is
 * doing now and its Routines. Fox stays below on every tab. Tapping a row opens its card; a long press offers Done,
 * Later and Remove, and the computer settles the item and sends the new Center. The widgets for now (context/store)
 * lead Now; tapping one, or its row in Applets, opens its page over everything.
 */
@Composable
fun AttentionCenter(model: AppModel, initialPage: String?, open: (AttentionItem) -> Unit, openApplet: (PhoneApplet) -> Unit) {
    // The tabs are pages side by side: a swipe left or right moves between them, as a tap on the capsule does (owner
    // request 2026-10-12).
    val pager = rememberPagerState(initialPage = centerTab(initialPage)) { 3 }
    val scope = rememberCoroutineScope()
    var widgetId by rememberSaveable { mutableStateOf<String?>(null) }
    // Each tab keeps where it was scrolled while another is shown.
    val todayScroll = rememberScrollState()
    val appletsScroll = rememberScrollState()
    val tasksScroll = rememberScrollState()
    Column(Modifier.fillMaxSize().padding(top = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        PageTabs(pager.targetPage) { scope.launch { pager.animateScrollToPage(it) } }
        HorizontalPager(pager, Modifier.fillMaxSize().padding(top = 6.dp).testTag("centerPager"), verticalAlignment = Alignment.Top) { page ->
            when (page) {
                APPLETS -> AppletList(model, appletsScroll, openWidget = { widgetId = it }, openApplet = openApplet)
                TASKS -> TasksPage(model, tasksScroll, openApplet)
                else -> TodayPage(model, todayScroll, open) { widgetId = it }
            }
        }
    }
    model.widgets.firstOrNull { it.id == widgetId }?.let { widget -> WidgetScreen(model, widget) { widgetId = null } }
}

private const val TODAY = 0
private const val APPLETS = 1
private const val TASKS = 2

/** The tab the Center opens on: Today, unless demo mode asks for Applets or Tasks (`now` and `later`, the old layers,
 * are both on Today now). */
private fun centerTab(name: String?) = when (name) {
    "applets" -> APPLETS
    "tasks" -> TASKS
    else -> TODAY
}

/** Today, Applets and Tasks as one frosted capsule at the top, with no counts (owner decision 2026-10-04); the
 * selected one is lit. */
@Composable
private fun PageTabs(tab: Int, choose: (Int) -> Unit) {
    Row(Modifier.frosted(CircleShape).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Tab("Today", tab == TODAY, "tabToday") { choose(TODAY) }
        Tab("Things", tab == APPLETS, "tabApplets") { choose(APPLETS) }
        Tab("Tasks", tab == TASKS, "tabTasks") { choose(TASKS) }
    }
}

@Composable
private fun Tab(title: String, on: Boolean, tag: String, choose: () -> Unit) {
    val fill by animateColorAsState(if (on) Palette.leaf.copy(alpha = 0.75f) else Color.Transparent, label = "tab")
    val tint = if (on) Palette.ink else Palette.muted.copy(alpha = 0.75f)
    Text(
        title, color = tint, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.background(fill, CircleShape)
            .clickable(role = Role.Tab, onClick = choose)
            .semantics { selected = on; contentDescription = title }
            .testTag(tag)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

/**
 * Today, one scroll (owner request 2026-10-11): the weekday and date as the computer's left panel shows them, today's
 * Journal (each entry opens in a sheet), then what Now held (widgets for now, the computer away, accounts to connect,
 * the three groups) and, further down, Later.
 */
@Composable
private fun TodayPage(model: AppModel, scroll: ScrollState, open: (AttentionItem) -> Unit, openWidget: (String) -> Unit) {
    var entryId by rememberSaveable { mutableStateOf<String?>(null) }
    Column(
        Modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 14.dp).padding(top = 6.dp, bottom = 24.dp).testTag("todayPage"),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        DayHeader()
        Journal(model.attention.journal.orEmpty()) { entryId = it.id }
        NowSection(model, open, openWidget)
        LaterSection(model, open)
    }
    model.attention.journal?.firstOrNull { it.id == entryId }?.let { entry -> JournalSheet(entry) { entryId = null } }
}

/** The day as the computer's left panel writes it: the weekday large, the date small under it. */
@Composable
private fun DayHeader() {
    val today = LocalDate.now()
    val locale = Locale.getDefault()
    val date = DateTimeFormatter.ofPattern(android.text.format.DateFormat.getBestDateTimePattern(locale, "MMMMd"), locale)
    Column(Modifier.padding(horizontal = 10.dp).testTag("todayDate"), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        Text(today.format(DateTimeFormatter.ofPattern("EEEE", locale)), color = Palette.ink, fontSize = 30.sp, fontWeight = FontWeight.Bold,
            style = TextStyle(shadow = worldShadow))
        Text(today.format(date), color = Palette.muted.copy(alpha = 0.85f), fontSize = 15.sp, fontWeight = FontWeight.Medium,
            style = TextStyle(shadow = worldShadow))
    }
}

/** A small uppercase heading over a faint rule, like the Center's group headings but in the world's own ink. */
@Composable
internal fun Heading(title: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        Text(title.uppercase(), color = Palette.muted.copy(alpha = 0.75f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.3.sp,
            style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 8.dp).padding(bottom = 6.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.ink.copy(alpha = 0.14f)))
    }
}

/** Today's Journal cards, newest first: each row its title, time and one line; a computer that sends none (or an older
 * one) leaves one quiet line. */
@Composable
private fun Journal(entries: List<JournalEntry>, open: (JournalEntry) -> Unit) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Heading("Journal")
        if (entries.isEmpty()) {
            Text("Nothing in your Journal yet today.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 14.sp,
                style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp).testTag("journalEmpty"))
        }
        entries.forEach { entry ->
            Column(
                Modifier.fillMaxWidth().clickable(onClickLabel = "Open the entry") { open(entry) }.testTag("journal-${entry.id}")
                    .padding(horizontal = 10.dp, vertical = 7.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(entry.title, color = Palette.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        style = TextStyle(shadow = worldShadow), modifier = Modifier.weight(1f, fill = false))
                    journalTime(context, entry)?.let { Text(it, color = Palette.muted.copy(alpha = 0.7f), fontSize = 12.sp, style = TextStyle(shadow = worldShadow)) }
                }
                entry.text?.lineSequence()?.map { it.trim().trimStart('#', '-', '*', '•', ' ') }?.firstOrNull { it.isNotEmpty() }?.let { line ->
                    Text(markdown(line), color = Palette.muted.copy(alpha = 0.85f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        style = TextStyle(shadow = worldShadow))
                }
            }
        }
    }
}

/** The entry's time of day on this phone's clock. */
private fun journalTime(context: android.content.Context, entry: JournalEntry): String? =
    runCatching { Instant.parse(entry.at) }.getOrNull()?.let { android.text.format.DateUtils.formatDateTime(context, it.toEpochMilli(), android.text.format.DateUtils.FORMAT_SHOW_TIME) }

/** A Journal entry in full, on paper in a bottom sheet: its title, time and category, then its text. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JournalSheet(entry: JournalEntry, close: () -> Unit) {
    val context = LocalContext.current
    ModalBottomSheet(close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.paper) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 16.dp).navigationBarsPadding().testTag("journalSheet"),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(entry.title, color = Palette.paperInk, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            val meta = listOfNotNull(journalTime(context, entry), entry.category?.takeIf { it.isNotEmpty() }).joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, color = Palette.paperFoot, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            entry.text?.takeIf { it.isNotBlank() }?.let { Brief(it) }
        }
    }
}

/** What Now held: the widgets for now first, the computer away, accounts to connect, then the Center's three groups. */
@Composable
private fun NowSection(model: AppModel, open: (AttentionItem) -> Unit, openWidget: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("nowSection"), verticalArrangement = Arrangement.spacedBy(14.dp)) {
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

/** What can wait, under its own heading below Now: lighter rows that keep their own kind's colour, with a dashed rule. */
@Composable
private fun LaterSection(model: AppModel, open: (AttentionItem) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 10.dp).testTag("laterSection"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Heading("Later")
        Text("Can wait. An item moves up to Now when it needs you.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 12.sp,
            style = TextStyle(shadow = worldShadow), modifier = Modifier.padding(horizontal = 10.dp))
        if (model.attention.later.isEmpty()) {
            Text("Nothing is waiting.", color = Palette.muted.copy(alpha = 0.85f), fontSize = 14.sp, modifier = Modifier.padding(horizontal = 10.dp))
        }
        model.attention.later.forEach { HUDRow(model, it, open, later = true) }
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
