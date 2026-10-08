package app.worldlet.android.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.worldlet.android.AppModel
import app.worldlet.android.R
import app.worldlet.android.TalkMode
import app.worldlet.android.VoiceInput
import app.worldlet.kit.AttentionGroup
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.HarnessApproval
import app.worldlet.kit.PhoneApplet
import app.worldlet.kit.Turn
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Fox stays at the bottom, as on the computer and the iPhone, as one input bar (owner request 2026-10-04, like Claude's):
 * Fox's portrait is a round button at the bar's left, a little taller than the bar, and opens Settings ([openSettings]);
 * then the line to type, the microphone and Send. At rest the bar is a little shorter and says "Tap to type · hold to
 * speak": a tap on it opens the keyboard, and holding it talks until released, as holding the microphone does. The
 * microphone takes a tap (tap it again, or Send, to send) or a hold (release to send); the words are recognized on this
 * phone only. Send, or the keyboard's send key, sends the line. Fox's dialogue box is above the bar
 * (ui/companion/native-chat.ts). With an item's card open the dialogue is that item's conversation (what Fox says about
 * it, the option it offers and the item's own turns). With an Applet's page open (and no card over it) a paper pill
 * above the bar says "In <Applet>" with a ✕ that closes the page, lines go to that Applet's thread and the dialogue
 * shows it; otherwise the dialogue is the main conversation. A quiet Expand on the dialogue opens the whole conversation
 * as a chat filling the screen above the bar ([chat]); Fold, or Back, returns to the bubble (owner request 2026-10-05).
 * While the computer takes Orders, the team's round bug button stands on its own left of the bar ([OrderButton]).
 * A long press on Fox starts Talk with Fox ([TalkMode]): a spoken conversation until ✕ or another long press ends it.
 */
@Composable
fun FoxDock(model: AppModel, item: AttentionItem?, applet: PhoneApplet? = null, close: () -> Unit = {}, openSettings: () -> Unit = {},
            chat: Boolean = false, onChat: (Boolean) -> Unit = {}) {
    // A card open over the Applet's page takes precedence.
    val inside = if (item == null) applet else null
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val voice = remember { VoiceInput(context.applicationContext) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    var draft by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    var openedAt by remember { mutableStateOf(Instant.now()) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(item?.id, inside?.key) { openedAt = Instant.now(); onChat(false) }
    BackHandler(enabled = chat) { onChat(false) }

    fun say(text: String) = when {
        item != null -> model.say(text, item)
        inside != null -> model.say(text, inside)
        else -> model.say(text)
    }
    fun permitted() = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    val askMicrophone = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) voice.start(false)
    }
    /** The Order button is listening; a short line above the bar after it was used (sent, or nothing heard). */
    var ordering by remember { mutableStateOf(false) }
    var orderHint by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(orderHint) { if (orderHint != null) { delay(3_000); orderHint = null } }
    val talking = remember { TalkMode(context, scope) }
    DisposableEffect(Unit) { onDispose { talking.shutdown() } }
    /** Starts the microphone, or asks for it first (the person holds again once it is allowed). */
    fun microphone(): Boolean {
        if (!permitted()) { askMicrophone.launch(Manifest.permission.RECORD_AUDIO); return false }
        voice.start(true, model.turns.lastOrNull { it.role == Turn.Role.User }?.text)
        return voice.listening
    }
    /** Hold-to-talk; the Order button and Talk with Fox have the microphone while they run. */
    fun listen(): Boolean = if (ordering || talking.on) false else microphone()
    // What was heard goes where a typed line would go now (the open card or Applet), not where it went when the
    // gestures were first set up.
    val heard by rememberUpdatedState<(String) -> Unit> { say(it) }
    val talk = remember { Talk(voice, scope, listen = { listen() }, send = { heard(it) }) }
    fun toggleTalk() {
        if (talking.on) { talking.stop(); return }
        if (ordering || voice.listening) return
        focusManager.clearFocus()
        talking.start(voice, model, listen = { microphone() }, say = { heard(it) })
    }
    fun send() {
        // A recording started by a tap on the microphone is sent by Send too.
        if (talk.tapped) { talk.finish(); return }
        if (draft.isBlank()) return
        say(draft)
        draft = ""
        focusManager.clearFocus()
    }

    /** Order (core/distribution/order.ts, owner request 2026-10-06): one tap listens, the next sends what was heard to the
     * team's Claude as an Order from the computer, never as a line for Fox. Voice only, as on the computer. */
    fun toggleOrder() {
        if (ordering) {
            ordering = false
            scope.launch {
                val said = voice.stop()
                orderHint = when {
                    said.isEmpty() -> "I didn’t catch a task. Tap the bug to try again."
                    model.order(said) -> "Order sent to your computer."
                    else -> "The Order did not reach your computer."
                }
            }
            return
        }
        if (voice.listening || talk.tapped || talking.on) return
        if (!permitted()) { askMicrophone.launch(Manifest.permission.RECORD_AUDIO); return }
        orderHint = null
        voice.start(true, model.turns.lastOrNull { it.role == Turn.Role.User }?.text)
        ordering = voice.listening
    }
    // The computer stopped taking Orders (another channel, or unpaired) while the button listened.
    LaunchedEffect(model.takesOrders) { if (!model.takesOrders && ordering) { ordering = false; voice.stop() } }

    val recentReply = model.turns.lastOrNull { it.role == Turn.Role.Fox }?.let { reply ->
        runCatching { Instant.parse(reply.at) }.getOrNull()?.let { Instant.now().epochSecond - it.epochSecond < 5 * 60 }
    } ?: false
    val typing = focused || draft.isNotEmpty()

    Column(
        Modifier.fillMaxWidth().then(if (chat) Modifier.fillMaxHeight() else Modifier).imePadding().padding(horizontal = 16.dp).padding(bottom = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        AnimatedVisibility(chat || model.demo != null || typing || item != null || inside != null || voice.listening || model.foxWorking || model.streaming != null || recentReply,
            modifier = if (chat) Modifier.weight(1f) else Modifier,
            enter = fadeIn() + expandVertically(expandFrom = Alignment.Bottom), exit = fadeOut() + shrinkVertically(shrinkTowards = Alignment.Bottom)) {
            FoxDialogue(model, item, inside, openedAt, if (voice.listening) voice.transcript else null, chat, onChat)
        }
        AnimatedVisibility(inside != null, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
            // Kept while it fades out, so the pill does not go blank.
            var shown by remember { mutableStateOf(inside) }
            if (inside != null) shown = inside
            shown?.let { AppletContextPill(it, close) }
        }
        AnimatedVisibility(orderHint != null, Modifier.fillMaxWidth(), enter = fadeIn(), exit = fadeOut()) {
            var shown by remember { mutableStateOf("") }
            orderHint?.let { shown = it }
            Text(shown, color = Palette.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.frosted(RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 7.dp).testTag("foxOrderHint"))
        }
        val resting = !typing
        val bar by animateDpAsState(if (resting) 44.dp else 50.dp, label = "bar")
        val haptics = LocalHapticFeedback.current
        Row(
            Modifier.widthIn(max = 460.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AnimatedVisibility(model.takesOrders, enter = fadeIn(), exit = fadeOut()) { OrderButton(ordering) { toggleOrder() } }
            Box(Modifier.weight(1f)) {
                // The bar starts under Fox, which hides its rounded end; Fox stays centred on the bar's bottom line as the line grows.
                Row(
                    Modifier.padding(vertical = (FoxSize - bar) / 2).fillMaxWidth().heightIn(min = bar)
                        .frosted(RoundedCornerShape(bar / 2)).padding(start = FoxSize + 8.dp, end = 6.dp),
                    verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(Modifier.weight(1f).heightIn(min = bar), contentAlignment = Alignment.CenterStart) {
                        Box(Modifier.padding(vertical = 10.dp), contentAlignment = Alignment.CenterStart) {
                            if (draft.isEmpty()) {
                                Text(
                                    when {
                                        talking.phase == TalkMode.Phase.Listening -> if (talking.quiet) "Talk · listening (quiet)" else "Talk · listening…"
                                        talking.phase == TalkMode.Phase.Thinking -> "${model.conversation.name} is thinking…"
                                        talking.phase == TalkMode.Phase.Speaking -> "${model.conversation.name} is speaking · tap the mic to interrupt"
                                        voice.listening -> "Listening…"
                                        resting -> "Tap to type · hold to speak"
                                        else -> item?.let { "Ask about ${it.headline}" } ?: inside?.let { "Ask about ${it.title}" } ?: "Ask ${model.conversation.name} anything"
                                    },
                                    color = Palette.muted.copy(alpha = 0.6f), fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                            BasicTextField(
                                draft, { draft = it }, maxLines = 4,
                                textStyle = TextStyle(color = Palette.ink, fontSize = 16.sp), cursorBrush = SolidColor(Palette.lantern),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { send() }),
                                modifier = Modifier.fillMaxWidth().focusRequester(focus).onFocusChanged { focused = it.isFocused }.testTag("foxMessage"),
                            )
                        }
                        if (resting && !talking.on) {
                            // At rest the bar takes the gesture before the field does: a tap opens the keyboard, a hold talks.
                            val type = { focus.requestFocus(); keyboard?.show(); Unit }
                            Box(
                                Modifier.matchParentSize().holdToTalk(talk, haptics, type)
                                    .semantics { onClick("Type a message to ${model.conversation.name}") { type(); true } }
                                    .testTag("foxBar"),
                            )
                        }
                    }
                    if (talking.on) EndTalkButton(Modifier.padding(bottom = (bar - 36.dp) / 2)) { talking.stop() }
                    TalkButton(talk, talking, if (talking.phase == TalkMode.Phase.Speaking) "Interrupt ${model.conversation.name}" else "Talk to ${model.conversation.name}", Modifier.padding(bottom = (bar - 36.dp) / 2))
                    SendButton(enabled = draft.isNotBlank() || talk.tapped, Modifier.padding(bottom = (bar - 36.dp) / 2)) { send() }
                }
                FoxButton(Modifier.align(Alignment.BottomStart), openSettings, talking.on, "Talk with ${model.conversation.name}") { toggleTalk() }
            }
        }
    }

    (voice.state as? VoiceInput.State.Unavailable)?.let { problem ->
        AlertDialog(
            onDismissRequest = voice::dismissProblem,
            confirmButton = { TextButton(voice::dismissProblem) { Text("OK") } },
            title = { Text("Voice is off") },
            text = { Text(problem.reason) },
        )
    }
}

/** Fox's round button: a little taller than the bar it sits at the left of. */
private val FoxSize = 56.dp
/** The Order button while it listens, as on the computer. */
private val OrderRed = Color(0xFFC2412E)

/** The Order button: round with a bug, on its own left of the bar, red while it listens. */
@Composable
private fun OrderButton(listening: Boolean, toggle: () -> Unit) {
    Box(
        Modifier.size(44.dp).then(if (listening) Modifier.background(OrderRed, CircleShape) else Modifier.frosted(CircleShape))
            .clickable(onClickLabel = if (listening) "Send the Order" else "Start an Order", role = Role.Button, onClick = toggle)
            .semantics { contentDescription = "Order" }
            .testTag("foxOrder"),
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Outlined.BugReport, null, tint = Palette.ink, modifier = Modifier.size(20.dp)) }
}

/**
 * The recording under way, one at a time, whichever control started it: holding the bar or the microphone talks until
 * released, and a tap on the microphone talks until the microphone or Send is tapped. What was heard is sent like a
 * typed line.
 */
private class Talk(val voice: VoiceInput, private val scope: CoroutineScope, private val listen: () -> Boolean, private val send: (String) -> Unit) {
    /** A recording started by a tap on the microphone, which the next tap on it (or Send) sends. */
    var tapped by mutableStateOf(false)

    /** Starts listening; false when the microphone is not allowed yet or voice is off. */
    fun start(): Boolean = listen()

    /** Stops listening and sends what was heard. */
    fun finish() {
        tapped = false
        scope.launch { voice.stop().takeIf { it.isNotEmpty() }?.let(send) }
    }

    /** A tap on the microphone: starts a recording that runs until the next tap, or sends the one under way. */
    fun toggle() {
        if (tapped) finish() else if (start()) tapped = true
    }
}

/** Holding talks until released, as holding the microphone does; a quick tap does [tap] instead. */
private fun Modifier.holdToTalk(talk: Talk, haptics: HapticFeedback, tap: () -> Unit) = pointerInput(talk) {
    awaitEachGesture {
        awaitFirstDown()
        var quick = false
        val up = withTimeoutOrNull(320) { waitForUpOrCancellation().also { quick = true } }
        if (quick) {
            if (up != null) tap()
            return@awaitEachGesture
        }
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        val started = talk.start()
        waitForUpOrCancellation()
        if (started) talk.finish()
    }
}

/** Fox's portrait as a round button at the bar's left, opening Settings; a long press starts or ends Talk with Fox,
 * and a lantern ring shows while Talk is on. */
@Composable
private fun FoxButton(modifier: Modifier, open: () -> Unit, talking: Boolean, talkLabel: String, toggleTalk: () -> Unit) {
    Box(
        // Opaque, so the bar under its right half does not show through.
        modifier.size(FoxSize).shadow(4.dp, CircleShape).frosted(CircleShape, Color(0xFF26302A))
            .then(if (talking) Modifier.border(2.5.dp, Palette.lantern, CircleShape) else Modifier)
            .combinedClickable(onClickLabel = "Open settings", role = Role.Button, onLongClickLabel = if (talking) "End Talk" else talkLabel,
                onLongClick = toggleTalk, onClick = open)
            .semantics { contentDescription = "Open settings" }
            .testTag("foxAvatar"),
        contentAlignment = Alignment.Center,
    ) {
        Image(painterResource(R.drawable.fox), null, Modifier.size(48.dp))
    }
}

/** Ends Talk with Fox. */
@Composable
private fun EndTalkButton(modifier: Modifier, end: () -> Unit) {
    Box(
        modifier.size(36.dp).background(Palette.ink.copy(alpha = 0.12f), CircleShape)
            .clickable(onClickLabel = "End Talk", role = Role.Button, onClick = end)
            .semantics { contentDescription = "End Talk" }.testTag("foxEndTalk"),
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Outlined.Close, null, tint = Palette.ink, modifier = Modifier.size(18.dp)) }
}

/** The microphone, as on the computer: tap to talk and tap again (or Send) to send, or hold and release to send.
 * During Talk with Fox it wears lantern gold, and a tap while Fox speaks interrupts it. */
@Composable
private fun TalkButton(talk: Talk, talking: TalkMode, label: String, modifier: Modifier) {
    val voice = talk.voice
    val scale by animateFloatAsState(if (voice.listening) 1.1f else 1f, label = "mic")
    Box(
        modifier.scale(scale).size(36.dp)
            .background(if (talking.on) Palette.lantern.copy(alpha = 0.75f) else if (voice.listening) Color.Red.copy(alpha = 0.7f) else Color.Transparent, CircleShape)
            .pointerInput(talk) {
                awaitEachGesture {
                    awaitFirstDown()
                    // Talk listens by itself; a press only interrupts Fox's voice.
                    if (talking.on) { talking.interrupt(); waitForUpOrCancellation(); return@awaitEachGesture }
                    val downAt = System.currentTimeMillis()
                    // A second tap while talking sends what was heard.
                    val started = talk.tapped || talk.start()
                    waitForUpOrCancellation()
                    if (!started) return@awaitEachGesture
                    when {
                        talk.tapped -> talk.finish()
                        System.currentTimeMillis() - downAt < 350 -> talk.tapped = true
                        else -> talk.finish()
                    }
                }
            }
            .semantics { contentDescription = label; role = Role.Button; onClick { if (talking.on) talking.interrupt() else talk.toggle(); true } }
            .testTag("foxTalk"),
        contentAlignment = Alignment.Center,
    ) { Icon(if (voice.listening) Icons.Outlined.GraphicEq else Icons.Outlined.Mic, null, tint = Palette.ink, modifier = Modifier.size(20.dp)) }
}

/** Send, filled in lantern gold while there is something to send. */
@Composable
private fun SendButton(enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.size(36.dp).background(if (enabled) Palette.lantern else Palette.ink.copy(alpha = 0.12f), CircleShape)
            .clickable(enabled = enabled, onClickLabel = "Send", role = Role.Button, onClick = onClick)
            .semantics { contentDescription = "Send" }.testTag("foxSend"),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.AutoMirrored.Outlined.Send, null, tint = if (enabled) Palette.forest else Palette.ink.copy(alpha = 0.4f), modifier = Modifier.size(18.dp))
    }
}

/** One card of the dialogue: what the person said (a quiet "You · …" line), then Fox's answer, its current step while
 * it works, or the option it offers. */
private data class DialogueCard(val id: String, val user: String = "", val chosen: Boolean = false, val text: String,
                                val working: Boolean = false, val option: String = "",
                                /** Fox's thinking on a streaming card (its working lines, newest last). */
                                val steps: List<String> = emptyList(),
                                /** A card the computer is still streaming: its steps and words appear as they come. */
                                val live: Boolean = false,
                                /** What the person's own Agent asks while the turn runs: Allow once, Always and Deny on the card. */
                                val approval: HarnessApproval? = null)

/** Fox's dialogue box, drawn as on the computer (ui/attention/attention-preview.css "companion"): a paper card with
 * Fox's name badge and a tail toward Fox, the front card in it, and a quiet Expand on its edge that opens the whole
 * conversation as a chat ([FoxChat]); Fold returns to the bubble (owner request 2026-10-05). */
@Composable
private fun FoxDialogue(model: AppModel, item: AttentionItem?, applet: PhoneApplet?, openedAt: Instant, hearing: String?,
                        chat: Boolean, onChat: (Boolean) -> Unit) {
    val cards = when {
        hearing != null -> listOf(DialogueCard("hearing", hearing.ifEmpty { "…" }, text = "Listening… tap or release to send", working = true))
        item != null -> itemCards(model, item, openedAt)
        applet != null -> appletCards(model, applet)
        else -> mainCards(model)
    }
    if (chat) {
        FoxChat(model, item, cards) { onChat(false) }
        return
    }
    Column(Modifier.widthIn(max = 460.dp).fillMaxWidth().animateContentSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val card = cards.last()
        Box(Modifier.padding(top = 14.dp)) {
            Column(
                Modifier.fillMaxWidth().shadow(8.dp, Bubble).background(Color(0xFFF9F6E4), Bubble)
                    .padding(horizontal = 20.dp).padding(top = 22.dp, bottom = 26.dp).testTag("foxDialogue"),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                CardLines(model, item, card, capped = true)
            }
            NameBadge(model, Modifier.offset(x = 22.dp, y = (-14).dp))
            if (cards.size > 1 || card.text.length > 200) {
                ExpandToggle(expanded = false, modifier = Modifier.align(Alignment.TopEnd).offset(x = (-22).dp, y = (-12).dp)) { onChat(true) }
            }
        }
    }
}

/** Expanded: the whole thread as a chat filling the screen above the bar, its cards stacked with the earlier ones above
 * the latest, newest at the bottom, scrolling; no box around them (owner request 2026-10-05). */
@Composable
private fun FoxChat(model: AppModel, item: AttentionItem?, cards: List<DialogueCard>, fold: () -> Unit) {
    Column(Modifier.fillMaxSize().testTag("foxChat")) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            NameBadge(model)
            Spacer(Modifier.weight(1f))
            ExpandToggle(expanded = true, onClick = fold)
        }
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState(Int.MAX_VALUE)).padding(bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            cards.dropLast(1).forEach { EarlierCard(it) }
            Column(
                Modifier.fillMaxWidth().shadow(8.dp, RoundedCornerShape(20.dp)).background(Color(0xFFF9F6E4), RoundedCornerShape(20.dp)).border(1.dp, Color(0xFFEBE5CC), RoundedCornerShape(20.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                CardLines(model, item, cards.last(), capped = false)
            }
        }
    }
}

/** What a card says: the person's line, then Fox's answer (its working line while it works) and the option it offers.
 * In the bubble a long answer scrolls inside its card; in the expanded chat it is shown whole. */
@Composable
private fun CardLines(model: AppModel, item: AttentionItem?, card: DialogueCard, capped: Boolean) {
    if (card.user.isNotEmpty()) YouLine(card)
    if (card.live) {
        LiveReply(card)
    } else if (card.working) {
        Text(if (card.text.isEmpty()) "Working on it…" else card.text + "…", color = Color(0xFF7B857C), fontSize = 15.sp, fontStyle = FontStyle.Italic)
    } else if (card.text.isNotEmpty()) {
        if (capped) ScrollingReply(card.text) else Reply(card.text)
    }
    card.approval?.let { ApprovalChoices(model, it) }
    if (card.option.isNotEmpty() && item != null) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(card.option, color = Color(0xFF385644), fontSize = 14.sp, fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clickable { model.say(card.option, item, option = true) }.padding(horizontal = 7.dp, vertical = 4.dp).testTag("foxOption"))
        }
    }
}

/** What the person's own Agent asks (contracts/harness-services.ts `approvals`), as the computer's card shows it: the
 * request, its command, and Allow once / Always / Deny in the style of Fox's option; once answered, the settled line. */
@Composable
private fun ApprovalChoices(model: AppModel, approval: HarnessApproval) {
    Column(Modifier.fillMaxWidth().testTag("foxApproval"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(approval.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        if (approval.detail.isNotEmpty()) {
            Text(approval.detail, fontSize = 13.sp, fontFamily = FontFamily.Monospace, maxLines = 6,
                modifier = Modifier.fillMaxWidth().background(Color(0xFFEFEAD3), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 5.dp))
        }
        val settled = model.answered[approval.id]
        if (settled != null) {
            Text(settled.settled, color = Color(0xFF7B857C), fontSize = 14.sp, fontStyle = FontStyle.Italic)
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                for (choice in approval.choices) {
                    Text(choice.label, color = Color(0xFF385644), fontSize = 14.sp, fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable(role = Role.Button) { model.answer(approval, choice) }.padding(horizontal = 7.dp, vertical = 4.dp)
                            .testTag("approval-${choice.wire}"))
                }
            }
        }
    }
}

/** Fox's name on a honey badge. */
@Composable
private fun NameBadge(model: AppModel, modifier: Modifier = Modifier) {
    Text(
        model.conversation.name, color = Color(0xFF4A3413), fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier.shadow(3.dp, RoundedCornerShape(12.dp))
            .background(Color(0xFFF0C27A), RoundedCornerShape(topStart = 13.dp, bottomStart = 10.dp, bottomEnd = 14.dp, topEnd = 11.dp))
            .padding(horizontal = 14.dp, vertical = 4.dp),
    )
}

/** Expand and Fold: a quiet paper tab, muted until pressed (owner request 2026-10-05: not History, not loud). */
@Composable
private fun ExpandToggle(expanded: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        if (expanded) "Fold" else "Expand", color = Color(0xFF6C7A70), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier.background(Color(0xFFFFF9E7), CircleShape).border(1.dp, Color(0xFFE3D9B8), CircleShape)
            .clickable(onClickLabel = if (expanded) "Fold the conversation" else "Expand the conversation", role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 3.dp).testTag("foxExpand"),
    )
}

@Composable
private fun YouLine(card: DialogueCard) {
    Text(
        androidx.compose.ui.text.buildAnnotatedString {
            append("You · ")
            pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold))
            append(if (card.chosen) "↩ " + card.user else card.user)
        },
        color = Color(0xFF203B30).copy(alpha = 0.62f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
    )
}

/** A long reply scrolls inside its card instead of a Show more (owner feedback 2026-10-04); a small down arrow at its
 * foot says more waits below, and leaves once the end is in view. */
@Composable
private fun ScrollingReply(text: String) {
    val scroll = rememberScrollState()
    Box {
        Column(Modifier.heightIn(max = 150.dp).verticalScroll(scroll).testTag("foxReply")) { Reply(text) }
        if (scroll.canScrollForward) {
            Text("▼", color = Color(0xBF2F6B45), fontSize = 9.sp,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = 14.dp).testTag("foxReplyMore"))
        }
    }
}

@Composable
private fun Reply(text: String, maxLines: Int = Int.MAX_VALUE) {
    Text(markdown(text), color = Color(0xFF203B30), fontSize = 15.sp, lineHeight = 22.sp, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}

/** A turn the computer is streaming: Fox's thinking (its latest working line, as the computer's dialogue shows it) and
 * the reply so far, both appearing letter by letter as they arrive. The relay brings the words in bursts a few times a
 * second; the letters in between are revealed smoothly, faster when more are waiting. */
@Composable
private fun LiveReply(card: DialogueCard) {
    val step = card.steps.lastOrNull()
    if (card.working && (step != null || card.text.isEmpty())) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ThinkingDots()
            val size = if (card.text.isEmpty()) 15.sp else 13.sp
            if (step != null) StreamingText(step + if (card.text.isEmpty()) "…" else "", plain = true, color = Color(0xFF7B857C), size = size, italic = true)
            else Text("Thinking…", color = Color(0xFF7B857C), fontSize = 15.sp, fontStyle = FontStyle.Italic)
        }
    }
    if (card.text.isNotEmpty()) {
        Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState(Int.MAX_VALUE)).testTag("foxLive")) {
            StreamingText(card.text, color = Color(0xFF203B30), size = 15.sp)
        }
    }
}

/** Text that types itself out toward [text]. A new text that continues the shown one keeps typing from where it is;
 * any other text starts over. */
@Composable
private fun StreamingText(text: String, plain: Boolean = false, color: Color, size: androidx.compose.ui.unit.TextUnit, italic: Boolean = false) {
    var shown by remember { mutableStateOf(0) }
    var last by remember { mutableStateOf("") }
    LaunchedEffect(text) {
        if (!text.startsWith(last.take(shown))) shown = 0
        last = text
        while (shown < text.length) {
            // About 60 letters a second, catching up within half a second when a burst arrives.
            shown = minOf(text.length, shown + maxOf(1, (text.length - shown) / 15))
            kotlinx.coroutines.delay(16)
        }
    }
    val visible = text.take(shown.coerceAtMost(text.length))
    Text(if (plain) androidx.compose.ui.text.AnnotatedString(visible) else markdown(visible), color = color, fontSize = size,
        lineHeight = size * 1.45f, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal)
}

/** Three dots that pulse while Fox thinks. */
@Composable
private fun ThinkingDots() {
    var beat by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(350); beat = (beat + 1) % 3 } }
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        repeat(3) { i -> Box(Modifier.size(4.dp).background(Color(0xFF7B857C).copy(alpha = if (i == beat) 0.9f else 0.3f), CircleShape)) }
    }
}

/** An earlier card, paler and smaller, stacked above the front one. */
@Composable
private fun EarlierCard(card: DialogueCard) {
    Column(
        Modifier.fillMaxWidth().shadow(4.dp, RoundedCornerShape(20.dp)).background(Color(0xFFF1EFE4), RoundedCornerShape(20.dp))
            .border(1.dp, Color(0xFFEBE5CC), RoundedCornerShape(20.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (card.user.isNotEmpty()) YouLine(card)
        Text(markdown(card.text), color = Color(0xFF203B30), fontSize = 14.sp, lineHeight = 19.sp)
    }
}

/** The dialogue's paper with its tail toward Fox below it, at the start of the bar (the dialogue and the bar are the
 * same width). */
private val Bubble = object : androidx.compose.ui.graphics.Shape {
    override fun createOutline(size: androidx.compose.ui.geometry.Size, layoutDirection: androidx.compose.ui.unit.LayoutDirection, density: androidx.compose.ui.unit.Density): androidx.compose.ui.graphics.Outline {
        val r = with(density) { 20.dp.toPx() }
        val tail = with(density) { 9.dp.toPx() }
        val body = size.height - tail
        val start = with(density) { (FoxSize / 2).toPx() }
        val fox = if (layoutDirection == androidx.compose.ui.unit.LayoutDirection.Rtl) size.width - start else start
        val path = androidx.compose.ui.graphics.Path().apply {
            addRoundRect(androidx.compose.ui.geometry.RoundRect(0f, 0f, size.width, body, androidx.compose.ui.geometry.CornerRadius(r)))
            moveTo(fox - tail, body - 1)
            lineTo(fox + tail, body - 1)
            lineTo(fox, size.height)
            close()
        }
        return androidx.compose.ui.graphics.Outline.Generic(path)
    }
}

private fun itemCards(model: AppModel, item: AttentionItem, openedAt: Instant): List<DialogueCard> {
    val fox = item.fox
    val cards = (fox?.turns ?: emptyList()).mapIndexed { index, turn ->
        DialogueCard("${item.id}:$index", turn.user, turn.user == fox?.option, turn.text, turn.working)
    }.toMutableList()
    // What Fox says as the card opens is the newest line, until a turn of this item starts or ends after it.
    val latest = fox?.turns?.lastOrNull()
    val newer = latest?.let { it.working || (runCatching { Instant.parse(it.at) }.getOrNull() ?: Instant.EPOCH).isAfter(openedAt) } ?: false
    model.streaming?.takeIf { it.item == item.id }?.let { live ->
        // The turn under way streams in place of its working line; a finished one stays until the item's turns have it.
        if (cards.lastOrNull()?.working == true) cards.removeAt(cards.lastIndex)
        if (live.done && cards.lastOrNull()?.text == live.text) return cards
        cards += DialogueCard("live:${live.id}", live.user, live.user == fox?.option, live.text, !live.done, steps = live.steps, live = true, approval = live.asking())
        return cards
    }
    val line = model.itemPending[item.id]
    if (line != null) {
        cards += DialogueCard("${item.id}:pending", line, line == fox?.option, "", working = true)
    } else if (!newer) {
        cards += DialogueCard("${item.id}:say", text = fox?.say ?: say(item.group), option = fox?.option ?: "")
    }
    return cards
}

/** An Applet's own thread as cards (its turns, rendered as an item's are), the turn streaming in it, the line still on
 * its way, or Fox's opening line about the Applet. */
private fun appletCards(model: AppModel, applet: PhoneApplet): List<DialogueCard> {
    val fox = applet.fox
    val cards = (fox?.turns ?: emptyList()).mapIndexed { index, turn ->
        DialogueCard("${applet.key}:$index", turn.user, false, turn.text, turn.working)
    }.toMutableList()
    model.streaming?.takeIf { it.applet == applet.key }?.let { live ->
        // The turn under way streams in place of its working line; a finished one stays until the Applet's turns have it.
        if (cards.lastOrNull()?.working == true) cards.removeAt(cards.lastIndex)
        if (live.done && cards.lastOrNull()?.text == live.text) return cards
        cards += DialogueCard("live:${live.id}", live.user, false, live.text, !live.done, steps = live.steps, live = true, approval = live.asking())
        return cards
    }
    val line = model.appletPending[applet.key]
    when {
        line != null -> cards += DialogueCard("${applet.key}:pending", line, text = "", working = true)
        cards.isEmpty() -> cards += DialogueCard("${applet.key}:say",
            text = fox?.say?.takeIf { it.isNotEmpty() } ?: "We're in ${applet.title}. Ask me anything about it.")
    }
    return cards
}

/** The main conversation as cards: each of Fox's answers with the line the person said before it. */
private fun mainCards(model: AppModel): List<DialogueCard> {
    val cards = mutableListOf<DialogueCard>()
    var asked = ""
    for (turn in model.turns.takeLast(12)) {
        if (turn.role == Turn.Role.User) { asked = turn.text; continue }
        cards += DialogueCard(turn.id, asked, text = turn.text)
        asked = ""
    }
    val live = model.streaming?.takeIf { it.item == null }
    if (live != null) {
        // The turn under way streams word by word; once finished it stays until the conversation has it.
        if (!(live.done && cards.lastOrNull()?.text == live.text)) {
            cards += DialogueCard("live:${live.id}", live.user.ifEmpty { asked }, text = live.text, working = !live.done, steps = live.steps, live = true,
                approval = live.asking())
        }
    } else if (model.foxWorking || asked.isNotEmpty()) cards += DialogueCard("working", asked, text = "", working = true)
    // A request from an item's thread is answered here too: a tapped notification opens this dialogue.
    model.streaming?.takeIf { it.item != null }?.asking()?.let { cards += DialogueCard("approval:${it.id}", text = "", approval = it) }
    if (cards.isEmpty()) {
        cards += DialogueCard("greeting", text = "Hi, I'm ${model.conversation.name}. Ask me anything, or open something in the Center and we'll look at it together.")
    }
    return cards
}

/** What the computer's card says for an item from a computer older than the item dialogue (core/attention/attention-preview.ts). */
private fun say(group: AttentionGroup) = when (group) {
    AttentionGroup.Event -> "Shall we get ready for this?"
    AttentionGroup.NeedsAction -> "Want me to help with the next step?"
    AttentionGroup.Unseen -> "Want to explore what this means?"
}
