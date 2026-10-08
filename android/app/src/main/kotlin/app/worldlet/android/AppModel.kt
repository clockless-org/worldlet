package app.worldlet.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worldlet.kit.AccountIssue
import app.worldlet.kit.AttentionAction
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.AttentionSnapshot
import app.worldlet.kit.Conversation
import app.worldlet.kit.HarnessApproval
import app.worldlet.kit.LiveTurn
import app.worldlet.kit.PairLink
import app.worldlet.kit.PairingException
import app.worldlet.kit.PhoneApplet
import app.worldlet.kit.PhoneInfo
import app.worldlet.kit.PhoneMessage
import app.worldlet.kit.PhoneSession
import app.worldlet.kit.PhoneUpdate
import app.worldlet.kit.PushTarget
import app.worldlet.kit.RelayException
import app.worldlet.kit.Turn
import app.worldlet.kit.PhoneWidget
import app.worldlet.kit.WidgetState
import app.worldlet.kit.WebReport
import app.worldlet.kit.WebReportBuffer
import app.worldlet.kit.WidgetsSnapshot
import app.worldlet.kit.cleanWidgetState
import app.worldlet.kit.mergeWidgetState
import app.worldlet.kit.widgetEdit
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The app's whole state, as the iPhone's AppModel keeps it: the pairing, the last Attention Center and conversation
 * the computer sent, and the chat lines this phone sent that the computer has not shown yet. While the app is in the
 * foreground it keeps one long poll waiting at the relay, which answers the moment the computer sends a change, so the
 * Center and Fox's replies arrive as they happen.
 */
class AppModel(
    private val store: PairingStore?,
    private val deviceName: String,
    private val appVersion: String,
    demo: Demo.Options? = null,
    private val widgetStore: WidgetStore? = null,
    /** This phone's notification token (Push.kt), null while notifications are off; absent in a build without push. */
    private val pushToken: (suspend () -> String?)? = null,
) : ViewModel() {
    enum class Phase { Unpaired, Connecting, Paired }

    /** The sample Center and conversation instead of a computer: from a debuggable launch's extras, or Try the demo on
     * the pairing screen. */
    var demo by mutableStateOf(demo); private set

    var phase by mutableStateOf(Phase.Unpaired); private set
    var computerName by mutableStateOf(""); private set
    /** The computer takes Orders (its desktop slot says `order`), so the dock shows the Order button. */
    var takesOrders by mutableStateOf(false); private set
    var attention by mutableStateOf(AttentionSnapshot.Empty); private set
    var conversation by mutableStateOf(Conversation.Empty); private set
    var pending by mutableStateOf(listOf<Turn>()); private set
    /** The turn Fox is streaming on the computer (its thinking and the reply so far), shown word by word. */
    var live by mutableStateOf<LiveTurn?>(null); private set
    /** The approvals answered from this phone, with the choice, until the computer's live turn no longer asks. */
    val answered = mutableStateMapOf<String, HarnessApproval.Choice>()
    /** A line said (or an option chosen) on an item's card that the computer has not shown in that item's turns yet. */
    val itemPending = mutableStateMapOf<String, String>()
    /** A line said inside an Applet's page that the computer has not shown in that Applet's thread yet. */
    val appletPending = mutableStateMapOf<String, String>()
    /** Applets this phone opened on the computer a moment ago, so the button can say so. */
    var openedApplets by mutableStateOf(setOf<String>()); private set
    /** In demo mode nothing leaves the phone: the messages it would have sent are kept here for the UI tests. */
    val demoSent = mutableListOf<PhoneMessage>()
    var computerSeenAt by mutableStateOf<Instant?>(null); private set
    var receivedAttention by mutableStateOf(false); private set
    /** Accounts whose sign-in this phone opened on the computer, so the row can say so. */
    var openedOnComputer by mutableStateOf(setOf<String>()); private set
    var error by mutableStateOf<String?>(null)
    /** A pairing link opened while this phone follows another computer: it replaces that pairing only once the person
     * confirms ([replacePairing]). */
    var replacement by mutableStateOf<PairLink?>(null); private set
    /** The widgets for now (core/widgets), newest first: each with its page (kept from an earlier slot when the latest
     * one left it out) and this phone's merged state. Kept on the device so they open while the computer sleeps. */
    var widgets by mutableStateOf(listOf<PhoneWidget>()); private set
    /** Where a tapped notification opens the app (MainActivity): HomeScreen opens it and calls [opened]. */
    var target by mutableStateOf<PushTarget?>(null); private set
    /** This build notifies (it has Firebase) and this is a real pairing, so the app asks once to show notifications. */
    val notifies: Boolean get() = pushToken != null && demo == null
    /** Where each widget's page was scrolled, while the app runs, so a page reloaded for a change opens where it was. */
    val widgetScroll = ConcurrentHashMap<String, Int>()

    private var session: PhoneSession? = null
    /** The pairing this phone follows, so opening its own link again changes nothing. */
    private var link: PairLink? = null
    private var loop: Job? = null
    /** Widget saves run one after another, off the main thread, in the order they were made. */
    private val saving = Dispatchers.IO.limitedParallelism(1)

    init {
        val demo = demo
        if (demo != null) loadDemo(demo) else {
            store?.load()?.let { link ->
                widgets = widgetStore?.load()?.widgets.orEmpty()
                start(link)
            }
        }
    }

    /** Try the demo: the fixed sample Center and conversation, with no computer and no network. Leaving it from
     * Settings (unpair) goes back to pairing; it is not kept, so the app opens on pairing next time. */
    fun startDemo() {
        if (phase != Phase.Unpaired) return
        error = null
        val options = Demo.Options(tried = true)
        demo = options
        loadDemo(options)
    }

    private fun loadDemo(options: Demo.Options) {
        phase = Phase.Paired
        computerName = "Studio Mac"
        computerSeenAt = Instant.now()
        attention = Demo.attention()
        conversation = Demo.conversation()
        if (options.live) live = Demo.live()
        widgets = Demo.widgets()
        receivedAttention = true
        takesOrders = options.order
    }

    /** The computer reached the relay recently (it checks in at least every 15 seconds while Worldlet runs). When it
     * is away the phone keeps showing what it sent last. */
    val computerOnline: Boolean
        get() = demo != null || computerSeenAt?.let { Instant.now().epochSecond - it.epochSecond < 90 } ?: false

    val foxWorking: Boolean get() = conversation.busy || pending.isNotEmpty() || streaming?.done == false

    /** The streaming turn while it is worth showing: running (unless the computer went quiet mid-turn), or finished and
     * not yet in the conversation the computer sends next; one waiting on an approval stays (LiveTurn.shown). */
    val streaming: LiveTurn?
        get() {
            val live = live ?: return null
            if (live.done) return live
            val at = runCatching { Instant.parse(live.at) }.getOrNull() ?: return null
            return live.takeIf { it.shown(Instant.now().epochSecond - at.epochSecond) }
        }

    /** Fox's conversation as shown: the computer's turns, then this phone's lines still on their way. */
    val turns: List<Turn> get() = conversation.messages + pending

    // Pairing

    /** A pairing link from the scanner, the clipboard or the camera. While paired, a link to another computer only asks
     * first: any app or page can open a `worldlet://pair` link. */
    fun pair(text: String) {
        try {
            val link = PairLink.parse(text)
            if (phase != Phase.Unpaired) {
                val current = this.link
                if (current == null || !current.secret.contentEquals(link.secret) || current.relay != link.relay) replacement = link
                return
            }
            store?.save(link)
            start(link)
        } catch (e: PairingException) {
            error = e.message
        }
    }

    /** The person chose to follow the other computer: this pairing ends on the relay and everything it brought (the
     * Center, the conversation, widgets and the edits made to them) goes before the new one starts. */
    fun replacePairing(link: PairLink) {
        replacement = null
        unpair()
        store?.save(link)
        start(link)
    }

    fun keepPairing() {
        replacement = null
    }

    private fun start(link: PairLink) {
        val session = PhoneSession(link)
        this.session = session
        this.link = link
        computerName = link.name
        phase = Phase.Connecting
        error = null
        viewModelScope.launch { runCatching { session.announce(PhoneInfo(name = deviceName, version = appVersion)) } }
        resume()
    }

    /** The relay forgets this phone's notification token first, so nothing more is sent to it. */
    fun unpair() {
        val session = this.session
        demo = null
        forget()
        viewModelScope.launch {
            runCatching { session?.unregisterPush() }
            runCatching { session?.unpair() }
        }
    }

    /** Gives the relay this phone's notification token, or takes it back while notifications are off, so the computer
     * notifies only a phone that shows them: once each time the pairing connects, and after the person answers the ask. */
    fun syncPush() {
        val session = session ?: return
        val token = pushToken ?: return
        if (demo != null) return
        viewModelScope.launch { runCatching { token()?.let { session.registerPush("fcm", it) } ?: session.unregisterPush() } }
    }

    fun show(target: PushTarget) { if (demo == null) this.target = target }
    fun opened() { target = null }

    private fun forget() {
        loop?.cancel()
        loop = null
        session = null
        link = null
        store?.delete()
        phase = Phase.Unpaired
        attention = AttentionSnapshot.Empty
        conversation = Conversation.Empty
        pending = emptyList()
        live = null
        answered.clear()
        itemPending.clear()
        appletPending.clear()
        openedApplets = emptySet()
        computerSeenAt = null
        takesOrders = false
        receivedAttention = false
        widgets = emptyList()
        widgetScroll.clear()
        target = null
        widgetStore?.let { store -> viewModelScope.launch(saving) { store.delete() } }
    }

    // Polling

    fun resume() {
        if (session == null) return
        loop?.cancel()
        loop = viewModelScope.launch {
            while (isActive) {
                // The first poll answers at once (it completes the pairing); later ones wait at the relay for news.
                val ok = sync(if (phase == Phase.Paired) 20 else 0)
                if (!ok) delay(3_000)
            }
        }
    }

    fun pause() {
        loop?.cancel()
        loop = null
    }

    /** One poll; false when it failed, so the loop backs off before trying again. */
    private suspend fun sync(wait: Int): Boolean {
        val session = session ?: return false
        try {
            val update = session.sync(wait)
            if (this.session !== session) return false
            apply(update)
            if (phase == Phase.Connecting) {
                phase = Phase.Paired
                syncPush()
            }
            error = null
            return true
        } catch (e: CancellationException) {
            throw e
        } catch (e: RelayException.Ended) {
            // An answer for a pairing that was already replaced or unpaired ends nothing.
            if (this.session !== session) return false
            forget()
            error = e.message
        } catch (e: Exception) {
            error = e.message ?: "Worldlet could not reach your computer."
        }
        return false
    }

    private fun apply(update: PhoneUpdate) {
        update.computerSeenAt?.let { computerSeenAt = Instant.ofEpochMilli(it.toLong()) }
        update.desktop?.name?.takeIf { it.isNotEmpty() }?.let { computerName = it }
        update.desktop?.let { takesOrders = it.order }
        update.attention?.let { snapshot ->
            attention = snapshot
            receivedAttention = true
            // A line waits until the item's own turns show it.
            for ((id, line) in itemPending.toMap()) {
                val item = (snapshot.now + snapshot.later).firstOrNull { it.id == id }
                if (item == null || item.fox?.turns?.any { it.user == line } == true) itemPending.remove(id)
            }
            for ((key, line) in appletPending.toMap()) {
                val applet = snapshot.applet(key)
                if (applet == null || applet.fox?.turns?.any { it.user == line } == true) appletPending.remove(key)
            }
        }
        val streamed = update.live
        if (streamed != null) {
            live = streamed
            // The line this phone sent is on the streaming card now.
            if (streamed.item == null && streamed.applet == null) pending.indexOfFirst { it.text == streamed.user }.takeIf { it >= 0 }?.let { i -> pending = pending.filterIndexed { j, _ -> j != i } }
            streamed.item?.let { if (itemPending[it] == streamed.user) itemPending.remove(it) }
            streamed.applet?.let { if (appletPending[it] == streamed.user) appletPending.remove(it) }
        } else if (live?.done == true && (update.conversation != null || update.attention != null)) {
            // The finished reply has reached the conversation (or the item's turns) the computer sent after it.
            live = null
        }
        update.widgets?.let(::receive)
        update.conversation?.let { conversation ->
            // A line this phone sent is shown once the computer's conversation has it.
            val users = conversation.messages.takeLast(20).filter { it.role == Turn.Role.User }.map { it.text }.toMutableList()
            pending = pending.filterNot { turn -> users.remove(turn.text) }
            this.conversation = conversation
        }
    }

    // Widgets

    /** The computer's widgets slot: widgets no longer listed leave; a listed one keeps the page this phone has when
     * the slot left it out for the same version, and its state merges newest-wins, so this phone's own newer edits
     * stay. Those edits the computer does not have yet (sent while it slept, or crossing this slot) are sent again. */
    private fun receive(snapshot: WidgetsSnapshot) {
        val mine = widgets.associateBy { it.id }
        val ahead = mutableListOf<Pair<String, WidgetState>>()
        widgets = snapshot.widgets.map { remote ->
            val local = mine[remote.id]
            val theirs = cleanWidgetState(remote.state)
            val state = mergeWidgetState(local?.state.orEmpty(), theirs).state
            val newer = state.filter { (key, entry) -> theirs[key]?.let { entry.at > it.at } ?: (entry.v != null) }
            if (newer.isNotEmpty()) ahead += remote.id to newer
            remote.copy(page = remote.page ?: local?.takeIf { it.version == remote.version }?.page, state = state)
        }
        saveWidgets()
        for ((id, state) in ahead) send(PhoneMessage.Widget(UUID.randomUUID().toString(), id, state))
    }

    /** The widget's page reported all of its storage: the keys that changed are stamped with this phone's clock (or
     * just after the newest write they replace, when this clock is behind it), kept, and sent to the computer. */
    fun widgetChanged(id: String, values: Map<String, String>) {
        val widget = widgets.firstOrNull { it.id == id } ?: return
        val changes = widgetEdit(widget.state, values, System.currentTimeMillis().toDouble())
        if (changes.isEmpty()) return
        widgets = widgets.map { if (it.id == id) it.copy(state = cleanWidgetState(it.state + changes)) else it }
        saveWidgets()
        send(PhoneMessage.Widget(UUID.randomUUID().toString(), id, changes))
    }

    private fun saveWidgets() {
        if (demo != null) return
        val store = widgetStore ?: return
        val snapshot = WidgetsSnapshot(at = Instant.now().toString(), widgets = widgets)
        viewModelScope.launch(saving) { store.save(snapshot) }
    }

    // Actions

    private fun send(message: PhoneMessage, failed: () -> Unit = {}) {
        if (demo != null) demoSent += message
        val session = session ?: return
        viewModelScope.launch {
            try { session.send(message) } catch (e: CancellationException) { throw e } catch (e: Exception) {
                failed()
                error = e.message
            }
        }
    }

    fun say(text: String) {
        val line = text.trim()
        if (line.isEmpty() || (session == null && demo == null)) return
        if (demoReply(line)) return
        val id = UUID.randomUUID().toString()
        pending = pending + Turn(id, Turn.Role.User, line, Instant.now().toString())
        send(PhoneMessage.Chat(id, line)) { pending = pending.filterNot { it.id == id } }
    }

    /** A line said with an item's card open, or the option Fox offers there ([option] true): it joins that item's
     * conversation on the computer, which opens the same card. */
    fun say(text: String, about: AttentionItem, option: Boolean = false) {
        val line = text.trim()
        if (line.isEmpty() || (session == null && demo == null)) return
        if (demoReply(line)) return
        itemPending[about.id] = line
        val id = UUID.randomUUID().toString()
        send(if (option) PhoneMessage.Option(id, about.id) else PhoneMessage.Ask(id, line, about.id)) { itemPending.remove(about.id) }
    }

    /** Allow once, Always or Deny on what the person's own Agent asks (the card in Fox's dialogue): the computer answers
     * its Harness with it. The card shows the settled line at once; a failed send brings the buttons back. */
    fun answer(approval: HarnessApproval, choice: HarnessApproval.Choice) {
        if (approval.id in answered || (session == null && demo == null)) return
        answered[approval.id] = choice
        send(PhoneMessage.Approval(UUID.randomUUID().toString(), approval.id, choice)) { answered.remove(approval.id) }
    }

    /** A line said inside an Applet's page: the computer opens that Applet, so the line joins its thread there. */
    fun say(text: String, inside: PhoneApplet) {
        val line = text.trim()
        if (line.isEmpty() || (session == null && demo == null)) return
        if (demoReply(line)) return
        appletPending[inside.key] = line
        send(PhoneMessage.Tell(UUID.randomUUID().toString(), line, inside.key)) { appletPending.remove(inside.key) }
    }

    /** Sends what was said with the Order button as an Order from the computer (core/phone `order`), never a line for
     * Fox; false when it did not reach the relay. */
    suspend fun order(said: String): Boolean {
        val line = said.trim()
        if (line.isEmpty()) return false
        val message = PhoneMessage.Order(UUID.randomUUID().toString(), line)
        if (demo != null) { demoSent += message; return true }
        val session = session ?: return false
        return try { session.send(message); true } catch (e: CancellationException) { throw e } catch (e: Exception) {
            error = e.message
            false
        }
    }

    /** In the demo someone tried, no computer runs Fox's turn: Fox answers every line with the same note, in the main
     * conversation, as the iPhone's demo does. */
    private fun demoReply(line: String): Boolean {
        if (demo?.tried != true) return false
        val at = Instant.now().toString()
        conversation = conversation.copy(at = at, messages = conversation.messages + listOf(
            Turn(UUID.randomUUID().toString(), Turn.Role.User, line, at),
            Turn(UUID.randomUUID().toString(), Turn.Role.Fox, Demo.REPLY, at),
        ))
        return true
    }

    /** The Applet whose website is open in this app's own browser (owner request 2026-10-07: no jump to another app). */
    var browsing by mutableStateOf<PhoneApplet?>(null); private set
    /** Opens an Applet's website here; one with no website opens nothing. */
    fun browse(applet: PhoneApplet?) { browsing = applet?.takeIf { it.website != null } }

    // The observer's reports per Applet, sent every ten seconds and when the page closes; messages the relay did not
    // take yet (no network) go again with the next ones, the oldest dropped past 40.
    private val webBuffers = mutableMapOf<String, WebReportBuffer>()
    private val webOutbox = ArrayDeque<PhoneMessage>()
    private var webTimer: Job? = null
    private var webSending = false

    /** One report from the page observer, as its JSON (from the page's bridge, on any thread). */
    fun recordWeb(applet: String, json: String) {
        val at = System.currentTimeMillis()
        viewModelScope.launch(Dispatchers.Main) {
            if (session == null) return@launch
            val report = WebReport.read(json, at) ?: return@launch
            webBuffers.getOrPut(applet) { WebReportBuffer(applet) }.add(report)
            if (webTimer == null) webTimer = viewModelScope.launch { delay(10_000); webTimer = null; flushWeb() }
        }
    }

    fun flushWeb() {
        val session = session ?: run { webBuffers.clear(); return }
        webBuffers.values.forEach { webOutbox.addAll(it.take()) }
        webBuffers.clear()
        while (webOutbox.size > 40) webOutbox.removeFirst()
        if (webSending || webOutbox.isEmpty()) return
        webSending = true
        viewModelScope.launch {
            try {
                while (webOutbox.isNotEmpty()) {
                    session.send(webOutbox.first())
                    webOutbox.removeFirst()
                }
            } catch (e: CancellationException) { throw e } catch (_: Exception) {
                // Kept for the next flush.
            } finally { webSending = false }
        }
    }

    /** Opens the Applet on the computer, where the person carries on. */
    fun openOnComputer(applet: PhoneApplet) {
        openedApplets = openedApplets + applet.key
        send(PhoneMessage.OpenApplet(UUID.randomUUID().toString(), applet.key)) { openedApplets = openedApplets - applet.key }
    }

    /** Opens the account's sign-in on the computer; the person finishes it there. */
    fun connect(account: AccountIssue) {
        openedOnComputer = openedOnComputer + account.provider
        send(PhoneMessage.Connect(UUID.randomUUID().toString(), account.provider)) { openedOnComputer = openedOnComputer - account.provider }
    }

    /** Done, Later or Remove, as on the computer's card. The row leaves at once; the next snapshot has the truth. */
    fun act(item: AttentionItem, action: AttentionAction) {
        val keep = { it: AttentionItem -> it.id != item.id }
        val moved = if (action == AttentionAction.Later) listOf(item.copy(snoozed = true)) else emptyList()
        attention = attention.copy(now = attention.now.filter(keep), later = attention.later.filter(keep) + moved)
        send(PhoneMessage.Attention(item.id, action))
    }
}
