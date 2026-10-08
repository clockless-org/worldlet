package app.worldlet.kit

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.put

// The payloads the desktop seals for the phone and the messages the phone sends back. They mirror
// core/phone/payloads.ts (and the iPhone's Models.swift); change them together.

val WorldletJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

@Serializable
enum class AttentionGroup(val title: String) {
    @SerialName("event") Event("Coming Up"),
    @SerialName("needsAction") NeedsAction("Worth Doing"),
    @SerialName("unseen") Unseen("Worth Knowing"),
}

@Serializable
data class AttentionItem(
    val id: String,
    val ids: List<String> = listOf(id),
    val group: AttentionGroup,
    val title: String,
    val action: String,
    val context: String,
    val start: String? = null,
    val `when`: String = "",
    val level: Int = 1,
    val snoozed: Boolean = false,
    /** The row's time line as the computer's Center writes it ("Due tomorrow · 5:00 PM", "Back tomorrow"). */
    val fact: String? = null,
    /** The card's saved brief, in Markdown. */
    val summary: String? = null,
    /** The provider the item came from (gmail, google-calendar, …). */
    val source: String? = null,
    /** The card's illustration: a picture the app bundles (scene-<id>, coming-up, do-something or worth-knowing). */
    val art: String? = null,
    /** Fox's dialogue on this item's card; absent from computers older than it. */
    val fox: ItemFox? = null,
    /** The key of the Applet the item came from, its home in the Applet world; absent when the World has none and
     * from computers older than it. */
    val applet: String? = null,
) {
    /** The line the Center shows first: what to do, or the item's own title. */
    val headline: String get() = action.ifEmpty { title }
}

/** Fox's dialogue on an item's card, as the computer shows it: the line Fox says when the card opens, the one option
 * it offers, and the item's own latest turns (newest last). */
@Serializable
data class ItemFox(val say: String, val option: String, val turns: List<FoxTurn> = emptyList()) {
    /** [user] is what the person said (or the option they chose), empty for a line Fox said on its own; [text] is
     * Fox's answer, or its current step while [working]. */
    @Serializable
    data class FoxTurn(val user: String, val text: String, val working: Boolean = false, val at: String = "")
}

/** An account the computer cannot read until the person reconnects it (or allows access) on the computer. The phone
 * never signs in; it can only ask the computer to open the sign-in. */
@Serializable
data class AccountIssue(val provider: String, val title: String, val action: Action) {
    @Serializable
    enum class Action { @SerialName("reconnect") Reconnect, @SerialName("permissions") Permissions }
}

/** One Applet in the Applet world, the layer above Now (core/phone/payloads.ts PhoneApplet): where the grid shows it,
 * its lamp, what it is doing or its status ([line]), its latest world log lines ([recent], newest last), the widget a
 * moment Applet opens (its key is `widget:<id>`), its own thread of Fox's conversation, and where one of the person's
 * own Applets came from ([mine]: `site`, `page` or `conversation`; null for a built-in one), so its tile carries the mark
 * its device has on the computer. [url] is the website its tile opens (owner request 2026-10-07); null for a moment
 * Applet or an ongoing thing, which open their own page, and from computers older than this field. */
@Serializable
data class PhoneApplet(
    val key: String,
    val title: String,
    val section: Section = Section.Places,
    val state: State = State.Off,
    val line: String? = null,
    val recent: List<Line>? = null,
    val widget: String? = null,
    val fox: ItemFox? = null,
    val mine: String? = null,
    val url: String? = null,
) {
    /** The website the tile opens: only an https address. */
    val website: String? get() = url?.takeIf { it.startsWith("https://") }

    /** A section or lamp this app does not know yet (from a newer computer) reads as "In your World" and off. */
    @Serializable(with = SectionSerializer::class)
    enum class Section(val title: String) {
        /** Working now, holding Now items, or a widget for now. */
        Live("Working now"),
        /** A connected account. */
        Accounts("Accounts"),
        /** A conversation brought from another Agent that the person made into an Applet (its key is `job-…`). */
        Jobs("Ongoing"),
        /** Every other Applet in the World. */
        Places("In your World"),
    }

    @Serializable(with = StateSerializer::class)
    enum class State { Busy, Ready, Failed, Off }

    @Serializable
    data class Line(val text: String, val at: String = "")

    /** The initial letter its tile shows. */
    val initial: String get() = title.trim().firstOrNull()?.uppercase() ?: "?"
}

/** Reads an enum by its lowercase name, falling back to [fallback] for a value a newer computer may send. */
private open class LenientEnum<T : Enum<T>>(name: String, private val values: List<T>, private val fallback: T) : KSerializer<T> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor(name, PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: T) = encoder.encodeString(value.name.lowercase())
    override fun deserialize(decoder: Decoder): T = decoder.decodeString().let { wire -> values.firstOrNull { it.name.lowercase() == wire } ?: fallback }
}
private object SectionSerializer : LenientEnum<PhoneApplet.Section>("app.worldlet.kit.PhoneApplet.Section", PhoneApplet.Section.entries, PhoneApplet.Section.Places)
private object StateSerializer : LenientEnum<PhoneApplet.State>("app.worldlet.kit.PhoneApplet.State", PhoneApplet.State.entries, PhoneApplet.State.Off)

@Serializable
data class AttentionSnapshot(
    val v: Int = 1,
    val at: String = "",
    val now: List<AttentionItem> = emptyList(),
    val later: List<AttentionItem> = emptyList(),
    /** Absent from computers older than this field. */
    val accounts: List<AccountIssue>? = null,
    /** The Applet world; absent from computers older than it. */
    val applets: List<PhoneApplet>? = null,
) {
    /** Now, in the Center's group order; empty groups are left out. */
    val nowGroups: List<Pair<AttentionGroup, List<AttentionItem>>>
        get() = AttentionGroup.entries.mapNotNull { group -> now.filter { it.group == group }.takeIf { it.isNotEmpty() }?.let { group to it } }

    /** The Applet with this key, if the computer sent it. */
    fun applet(key: String?): PhoneApplet? = key?.let { k -> applets?.firstOrNull { it.key == k } }

    /** The items whose home is this Applet: Now first, then Later. */
    fun items(of: PhoneApplet): List<AttentionItem> = (now + later).filter { it.applet == of.key }

    companion object { val Empty = AttentionSnapshot() }
}

@Serializable
data class Turn(val id: String, val role: Role, val text: String, val at: String = "") {
    @Serializable
    enum class Role { @SerialName("user") User, @SerialName("fox") Fox }
}

@Serializable
data class Conversation(
    val v: Int = 1,
    val at: String = "",
    val busy: Boolean = false,
    val name: String = "Fox",
    val messages: List<Turn> = emptyList(),
) {
    companion object { val Empty = Conversation() }
}

/** The person's own Agent asks before it acts (core/phone/payloads.ts PhoneApproval, contracts/harness-services.ts
 * `approvals`): a dangerous command of Hermes Agent's, an exec request of OpenClaw's. It rides on the running turn; the
 * phone answers with [PhoneMessage.Approval], the same three choices as Fox's card on the computer. [offered] is what
 * the computer sent; [choices] the buttons. */
@Serializable
data class HarnessApproval(
    val id: String,
    val title: String,
    /** The command or input it asks about; empty when it says none. */
    val detail: String = "",
    @SerialName("choices") val offered: List<String> = emptyList(),
) {
    /** The buttons and settled lines, as on the computer (ui/companion/fox-harness-approval.ts). */
    enum class Choice(val wire: String, val label: String, val settled: String) {
        Once("once", "Allow once", "Allowed once."),
        Always("always", "Always", "Allowed. It will not ask again for this."),
        Deny("deny", "Deny", "Denied."),
    }

    /** In the computer's order: a choice this version does not know is left out, and Deny is always there. */
    val choices: List<Choice> get() = Choice.entries.filter { it == Choice.Deny || it.wire in offered }

    /** Clamped as core/phone `phoneLive()` does, so a long line never fills the card. */
    fun clamped() = copy(id = id.take(120), title = title.take(200), detail = detail.take(2000))
}

/** The turn Fox is on now, as it streams (core/phone/payloads.ts PhoneLive): [steps] are its thinking, newest last,
 * and [text] the reply so far. [item] is the Attention item whose card the turn was asked from, [applet] the Applet
 * whose page it was asked in; both null for the main conversation. [done] marks the finished reply; [approval] is what
 * the person's own Agent asks while it runs (absent from older computers and once answered or expired). */
@Serializable
data class LiveTurn(
    val v: Int = 1,
    val at: String = "",
    val id: String,
    val item: String? = null,
    val user: String = "",
    val steps: List<String> = emptyList(),
    val text: String = "",
    val done: Boolean = false,
    val applet: String? = null,
    val approval: HarnessApproval? = null,
) {
    /** What the turn asks the person now: its approval while it runs, unless this phone already answered it. */
    fun asking(answered: Set<String> = emptySet()): HarnessApproval? =
        approval?.clamped()?.takeIf { !done && it.id.isNotEmpty() && it.id !in answered }

    /** Whether the phone still shows this turn [seconds] after the computer sent it: a finished reply until the
     * conversation has it, a running one for 90 seconds, and one waiting on an approval for ten minutes (the computer
     * declines an unanswered request then), so a tapped notification still finds it. */
    fun shown(seconds: Long): Boolean = done || seconds < if (approval != null) 600 else 90
}

/** The computer's own slot. `order` is true while it takes Orders (core/phone PhoneDesktop): the dock shows its Order
 * button. Absent from computers that don't. */
@Serializable
data class DesktopInfo(val v: Int = 1, val at: String = "", val name: String = "", val version: String = "", val order: Boolean = false)

/** The phone's own slot: the desktop shows its name in its phone page. */
@Serializable
data class PhoneInfo(val v: Int = 1, val name: String, val version: String)

/** A notification the computer sends while this phone is closed (core/phone/payloads.ts PhonePush), sealed for the
 * place "push" and carried by the relay to Firebase Messaging as `{p: pairing id, b: box}`. [open] is where a tap on it
 * opens the app; [target] reads it. */
@Serializable
data class PhonePush(
    val v: Int = 1,
    val id: String,
    val at: Double = 0.0,
    val kind: Kind = Kind.Task,
    val title: String,
    val body: String = "",
    val open: Open? = null,
    /** The notification's own buttons; null from older computers and for a push with none. */
    val act: Act? = null,
) {
    /** A kind a newer computer sends reads as a task report. */
    @Serializable(with = PushKindSerializer::class)
    enum class Kind { Attention, Fox, Routine, Task }

    @Serializable
    data class Open(val item: String? = null, val applet: String? = null, val conversation: Boolean? = null)

    /** Where a tap opens the app: the item's card first, then the Applet's page, then Fox's dialogue. */
    val target: PushTarget? get() = open?.let { o ->
        o.item?.takeIf { it.isNotEmpty() }?.let(PushTarget::Item) ?: o.applet?.takeIf { it.isNotEmpty() }?.let(PushTarget::Applet)
            ?: PushTarget.Conversation.takeIf { o.conversation == true }
    }

    /** What the buttons answer (core/phone/payloads.ts PhonePushAct): [attention] an item's id (Done, Later), [reply] an
     * inline reply where [open] points, [approval] a request's id (Allow once when [once], and Deny). */
    @Serializable
    data class Act(val attention: String? = null, val reply: Boolean? = null, val approval: String? = null, val once: Boolean? = null)

    /** The buttons on the notification, in the order they show; the first set the push carries, as core/phone reads it. */
    val actions: List<PushAction> get() = act?.let { a ->
        when {
            !a.attention.isNullOrEmpty() -> listOf(PushAction.Done, PushAction.Later)
            a.reply == true -> listOf(PushAction.Reply)
            !a.approval.isNullOrEmpty() -> if (a.once == true) listOf(PushAction.Allow, PushAction.Deny) else listOf(PushAction.Deny)
            else -> emptyList()
        }
    } ?: emptyList()

    /** The sealed message a button sends the computer, the same one the app's own button sends: an item's Done or Later, a
     * line said where the notification opens (the item's card, the Applet's page or the conversation; [text] trimmed,
     * none when empty), or the approval's answer. Null for a button this push does not offer. */
    fun message(action: PushAction, text: String? = null, id: String = java.util.UUID.randomUUID().toString()): PhoneMessage? {
        if (action !in actions) return null
        val a = act ?: return null
        return when (action) {
            PushAction.Done -> PhoneMessage.Attention(a.attention!!, AttentionAction.Done)
            PushAction.Later -> PhoneMessage.Attention(a.attention!!, AttentionAction.Later)
            PushAction.Allow -> PhoneMessage.Approval(id, a.approval!!, HarnessApproval.Choice.Once)
            PushAction.Deny -> PhoneMessage.Approval(id, a.approval!!, HarnessApproval.Choice.Deny)
            PushAction.Reply -> {
                val line = text?.trim()?.take(4000)?.takeIf { it.isNotEmpty() } ?: return null
                when (val target = target) {
                    is PushTarget.Item -> PhoneMessage.Ask(id, line, target.id)
                    is PushTarget.Applet -> PhoneMessage.Tell(id, line, target.key)
                    else -> PhoneMessage.Chat(id, line)
                }
            }
        }
    }

    /** Clamped as core/phone `phonePush()` does, so a long line never reaches the shade. */
    fun clamped() = copy(title = title.trim().take(TITLE_LIMIT), body = body.trim().take(BODY_LIMIT),
        act = act?.let { it.copy(attention = it.attention?.take(200), approval = it.approval?.take(120)) })

    /** core/phone/payloads.ts PHONE_PUSH_LIMITS. */
    companion object { const val TITLE_LIMIT = 80; const val BODY_LIMIT = 240 }
}

private object PushKindSerializer : LenientEnum<PhonePush.Kind>("app.worldlet.kit.PhonePush.Kind", PhonePush.Kind.entries, PhonePush.Kind.Task)

/** A button on a notification (core/phone/README.md, Push › Actions); [label] is what it says. */
enum class PushAction(val wire: String, val label: String) {
    Done("done", "Done"), Later("later", "Later"), Reply("reply", "Reply"), Allow("allow", "Allow once"), Deny("deny", "Deny");

    companion object { fun of(wire: String?) = entries.firstOrNull { it.wire == wire } }
}

/** Where a tapped notification opens the app, carried in the launch intent's extras ([extras], [read]). */
sealed interface PushTarget {
    data class Item(val id: String) : PushTarget
    data class Applet(val key: String) : PushTarget
    data object Conversation : PushTarget

    val extras: Map<String, String> get() = when (this) {
        is Item -> mapOf(ITEM to id)
        is Applet -> mapOf(APPLET to key)
        Conversation -> mapOf(CONVERSATION to "1")
    }

    companion object {
        const val ITEM = "push.item"
        const val APPLET = "push.applet"
        const val CONVERSATION = "push.conversation"

        /** The target in an intent's extras ([extra] reads one string extra); null for an ordinary launch. */
        fun read(extra: (String) -> String?): PushTarget? =
            extra(ITEM)?.takeIf { it.isNotEmpty() }?.let(::Item) ?: extra(APPLET)?.takeIf { it.isNotEmpty() }?.let(::Applet)
                ?: Conversation.takeIf { extra(CONVERSATION) == "1" }
    }
}

@Serializable
enum class AttentionAction { @SerialName("done") Done, @SerialName("later") Later, @SerialName("remove") Remove }

/** What the phone may ask: a chat line for Fox, Done / Later / Remove on a Center item, opening an account's sign-in
 * or an Applet on the computer, the entries the person changed in a widget, or an Order. */
sealed interface PhoneMessage {
    val id: String

    data class Chat(override val id: String, val text: String) : PhoneMessage
    /** A line said with an item's card open: it joins that item's conversation on the computer. */
    data class Ask(override val id: String, val text: String, val item: String) : PhoneMessage
    /** A line said inside an Applet's page: the computer opens that Applet, so the line joins its thread there. */
    data class Tell(override val id: String, val text: String, val applet: String) : PhoneMessage
    /** Opens the Applet on the computer, where the person carries on. */
    data class OpenApplet(override val id: String, val applet: String) : PhoneMessage
    /** The option Fox offers on an item's card. */
    data class Option(override val id: String, val item: String) : PhoneMessage
    data class Attention(override val id: String, val action: AttentionAction) : PhoneMessage
    data class Connect(override val id: String, val provider: String) : PhoneMessage
    /** The entries the person changed in a widget on the phone, stamped with this phone's clock; the computer merges
     * them newest-wins (core/widgets mergeWidgetState). */
    data class Widget(override val id: String, val widget: String, val state: WidgetState) : PhoneMessage
    /** What the person said with the Order button: the computer sends it to the team's Claude as an Order, never to Fox. */
    data class Order(override val id: String, val said: String) : PhoneMessage
    /** What happened on a website opened in this app's own browser (owner request 2026-10-07): the page observer's
     * reports, which the computer keeps in its World by its own recording rules. */
    data class Web(override val id: String, val applet: String, val records: List<WebReport>) : PhoneMessage
    /** The person's answer to the approval riding on the live turn (core/phone PhoneMessage `approval`). */
    data class Approval(override val id: String, val approval: String, val choice: HarnessApproval.Choice) : PhoneMessage

    fun toJson(): JsonObject = buildJsonObject {
        when (val m = this@PhoneMessage) {
            is Chat -> { put("type", "chat"); put("id", m.id); put("text", m.text) }
            is Ask -> { put("type", "chat"); put("id", m.id); put("text", m.text); put("item", m.item) }
            is Tell -> { put("type", "chat"); put("id", m.id); put("text", m.text); put("applet", m.applet) }
            is OpenApplet -> { put("type", "applet"); put("id", m.id); put("applet", m.applet); put("action", "open") }
            is Option -> { put("type", "option"); put("id", m.id); put("item", m.item) }
            is Attention -> { put("type", "attention"); put("id", m.id); put("action", m.action.name.lowercase()) }
            is Connect -> { put("type", "connect"); put("id", m.id); put("provider", m.provider) }
            is Order -> { put("type", "order"); put("id", m.id); put("said", m.said) }
            is Approval -> { put("type", "approval"); put("id", m.id); put("approval", m.approval); put("choice", m.choice.wire) }
            is Web -> {
                put("type", "web"); put("id", m.id); put("applet", m.applet)
                put("records", kotlinx.serialization.json.JsonArray(m.records.map { WorldletJson.encodeToJsonElement(WebReport.serializer(), it) }))
            }
            is Widget -> {
                put("type", "widget"); put("id", m.id); put("widget", m.widget)
                put("state", JsonObject(m.state.mapValues { it.value.toJson() }))
            }
        }
    }
}

/**
 * One report from the page observer (platform/bridge/web-record.js, copied to assets/web-record.js) on a website opened
 * in this app's browser, with this phone's time in seconds (core/phone/payloads.ts PhoneWebRecord). The observer never
 * reports passwords, card numbers or one-time codes, and says `private` when a page shows such a field.
 */
@Serializable
data class WebReport(
    val at: Double,
    val kind: String,
    val url: String,
    val title: String? = null,
    val text: String? = null,
    val field: String? = null,
    val value: String? = null,
    val label: String? = null,
    val href: String? = null,
    val fields: List<String>? = null,
) {
    /** How much of a sealed message this report takes, roughly. */
    val size: Int get() = 120 + listOfNotNull(url, title, text, value, label, href).sumOf { it.toByteArray().size } + (fields?.sumOf { it.toByteArray().size + 4 } ?: 0)

    companion object {
        val kinds = setOf("page", "text", "text-more", "input", "click", "submit", "private")
        /** A page's text is cut to this many bytes, so one report always fits a sealed box. */
        const val TEXT_LIMIT = 90_000

        /** The observer's JSON, stamped with [atMillis]; null for anything else. */
        fun read(json: String, atMillis: Long): WebReport? {
            val row = runCatching { WorldletJson.parseToJsonElement(json) }.getOrNull() as? JsonObject ?: return null
            fun text(key: String) = (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
            val kind = text("kind") ?: return null
            val url = text("url") ?: return null
            if (kind !in kinds || !url.lowercase().startsWith("https://")) return null
            val fields = (row["fields"] as? kotlinx.serialization.json.JsonArray)?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { p -> p.isString }?.content }
            return WebReport(atMillis / 1000.0, kind, url, text("title")?.take(300), text("text")?.let(::cut), text("field"), text("value"),
                text("label")?.take(200), text("href"), fields)
        }

        private fun cut(text: String): String {
            val bytes = text.toByteArray()
            if (bytes.size <= TEXT_LIMIT) return text
            return String(bytes, 0, TEXT_LIMIT, Charsets.UTF_8).trimEnd('\uFFFD')
        }
    }
}

/** Reports waiting to go to the computer, for one Applet's page. [take] cuts them into messages that each fit one
 * sealed box (at most 300 reports and about 120 KB). */
class WebReportBuffer(val applet: String) {
    private val pending = mutableListOf<WebReport>()
    val size: Int get() = pending.size

    fun add(report: WebReport) { pending += report }

    fun take(id: () -> String = { java.util.UUID.randomUUID().toString() }): List<PhoneMessage> {
        val messages = mutableListOf<PhoneMessage>()
        var batch = mutableListOf<WebReport>()
        var bytes = 0
        for (report in pending) {
            if (batch.isNotEmpty() && (batch.size >= 300 || bytes + report.size > 120_000)) {
                messages += PhoneMessage.Web(id(), applet, batch)
                batch = mutableListOf()
                bytes = 0
            }
            batch += report
            bytes += report.size
        }
        if (batch.isNotEmpty()) messages += PhoneMessage.Web(id(), applet, batch)
        pending.clear()
        return messages
    }
}
