package app.worldlet.kit

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.put

// The payloads the desktop seals for the phone and the messages the phone sends back. They mirror
// platform/web/payloads.ts (and the iPhone's Models.swift); change them together.

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
    /** The key of the Applet the item came from, its home in the Applets tab; absent when the World has none and
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

/** One Applet in the phone's Applets tab (platform/web/payloads.ts PhoneApplet): the section the list shows it in,
 * its lamp, what it is doing or its status ([line]), its latest world log lines ([recent], newest last), the widget a
 * moment Applet opens (its key is `widget:<id>`), its own thread of Fox's conversation, and where one of the person's
 * own Applets came from ([mine]: `site`, `page` or `conversation`; null for a built-in one), so its row carries the mark
 * its device has on the computer. [url] is the website its row opens (owner request 2026-10-07); null for a moment
 * Applet or a thing, which open their own page, and from computers older than this field. */
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

    /** A section or lamp this app does not know yet (from a newer computer) reads as "More" (the rest) and off. */
    @Serializable(with = SectionSerializer::class)
    enum class Section(val title: String) {
        /** Working now, holding Now items, or a widget for now. */
        Live("Working now"),
        /** A connected account. */
        Accounts("Accounts"),
        /** Things: a conversation brought from another Agent, kept as an Applet or not yet (its key is `job-…`); a line said
         * inside one on the phone makes it an Applet on the computer (owner request 2026-10-11). */
        Jobs("Things"),
        /** Every other Applet in the World. */
        Places("More"),
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

/** One card of the computer's Task panel (platform/web/payloads.ts PhoneTask): [name] and [status] are the card's words,
 * [when] its time text ("In progress", "Tomorrow 6:00 AM"), [icon] its picture (`fox`, `clock` or an Applet's key),
 * [progress] how far it is (0 to 1) when the computer knows, [applet] the phone Applet the row opens, [every] and [by]
 * how often a routine runs and who runs it, and [lines] what a running task said, newest last. */
@Serializable
data class PhoneTask(
    val id: String,
    val name: String,
    val status: String = "",
    val `when`: String = "",
    val icon: String = "fox",
    val progress: Double? = null,
    val applet: String? = null,
    val every: String? = null,
    val by: String? = null,
    val lines: List<String>? = null,
) {
    /** [progress] kept within 0 to 1; null when the computer does not know how far it is. */
    val fraction: Float? get() = progress?.takeIf { it.isFinite() }?.coerceIn(0.0, 1.0)?.toFloat()
}

/** Doing now (newest first) and Routines (soonest first), as the computer orders them. */
@Serializable
data class PhoneTasks(val now: List<PhoneTask> = emptyList(), val routines: List<PhoneTask> = emptyList())

/** One of today's Journal cards (platform/web/payloads.ts PhoneJournalEntry): an answer Fox showed or an Attention card
 * the person closed, with its brief or body as [text] and, for an Attention card, its [category] ("Worth Knowing"). */
@Serializable
data class JournalEntry(
    val id: String,
    val title: String,
    @Serializable(with = JournalKindSerializer::class) val kind: Kind = Kind.Answer,
    val at: String = "",
    val text: String? = null,
    val category: String? = null,
) {
    /** A kind a newer computer sends reads as an answer. */
    enum class Kind { Answer, Attention }
}

private object JournalKindSerializer : LenientEnum<JournalEntry.Kind>("app.worldlet.kit.JournalEntry.Kind", JournalEntry.Kind.entries, JournalEntry.Kind.Answer)

/** Reads a JSON value with [inner], or null when it does not read, so one field a newer computer changed never loses the
 * whole snapshot. */
@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
private open class OrNull<T : Any>(private val inner: KSerializer<T>) : KSerializer<T?> {
    override val descriptor: SerialDescriptor = inner.descriptor.nullable
    override fun serialize(encoder: Encoder, value: T?) {
        if (value == null) encoder.encodeNull() else encoder.encodeSerializableValue(inner, value)
    }
    override fun deserialize(decoder: Decoder): T? {
        val json = decoder as? JsonDecoder ?: return decoder.decodeSerializableValue(inner)
        val element = json.decodeJsonElement()
        if (element is JsonNull) return null
        return runCatching { json.json.decodeFromJsonElement(inner, element) }.getOrNull()
    }
}
private object TasksOrNull : OrNull<PhoneTasks>(PhoneTasks.serializer())
private object JournalOrNull : OrNull<List<JournalEntry>>(ListSerializer(JournalEntry.serializer()))

@Serializable
data class AttentionSnapshot(
    val v: Int = 1,
    val at: String = "",
    val now: List<AttentionItem> = emptyList(),
    val later: List<AttentionItem> = emptyList(),
    /** Absent from computers older than this field. */
    val accounts: List<AccountIssue>? = null,
    /** The Applets tab's Applets; absent from computers older than it. */
    val applets: List<PhoneApplet>? = null,
    /** The computer's Task panel for the Tasks tab (owner request 2026-10-11); null from older computers, and when what a
     * newer one sends does not read, so the rest of the Center still shows. */
    @Serializable(with = TasksOrNull::class) val tasks: PhoneTasks? = null,
    /** Today's Journal cards for the Today tab, newest first; null as [tasks] is. */
    @Serializable(with = JournalOrNull::class) val journal: List<JournalEntry>? = null,
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

/** The person's own Agent asks before it acts (platform/web/payloads.ts PhoneApproval, contracts/harness-services.ts
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

    /** Clamped as agent/app `phoneLive()` does, so a long line never fills the card. */
    fun clamped() = copy(id = id.take(120), title = title.take(200), detail = detail.take(2000))
}

/** The turn Fox is on now, as it streams (platform/web/payloads.ts PhoneLive): [steps] are its thinking, newest last,
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

/** The computer's own slot. `order` is true while it takes Orders (agent/app PhoneDesktop): the dock shows its Order
 * button. `push` is true when the computer keeps this phone's notification token itself, so the relay keeps none, and
 * `room` when it waits in the pairing room, where the pairing then moves. All are absent from computers that don't. */
@Serializable
data class DesktopInfo(val v: Int = 1, val at: String = "", val name: String = "", val version: String = "", val order: Boolean = false, val push: Boolean = false, val room: Boolean = false)

/** The phone's own slot: the desktop shows its name in its phone page. */
@Serializable
data class PhoneInfo(val v: Int = 1, val name: String, val version: String)

/** A notification the computer sends while this phone is closed (platform/web/payloads.ts PhonePush), sealed for the
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

    /** What the buttons answer (platform/web/payloads.ts PhonePushAct): [attention] an item's id (Done, Later), [reply] an
     * inline reply where [open] points, [approval] a request's id (Allow once when [once], and Deny). */
    @Serializable
    data class Act(val attention: String? = null, val reply: Boolean? = null, val approval: String? = null, val once: Boolean? = null)

    /** The buttons on the notification, in the order they show; the first set the push carries, as agent/app reads it. */
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

    /** Clamped as agent/app `phonePush()` does, so a long line never reaches the shade. */
    fun clamped() = copy(title = title.trim().take(TITLE_LIMIT), body = body.trim().take(BODY_LIMIT),
        act = act?.let { it.copy(attention = it.attention?.take(200), approval = it.approval?.take(120)) })

    /** platform/web/payloads.ts PHONE_PUSH_LIMITS. */
    companion object { const val TITLE_LIMIT = 80; const val BODY_LIMIT = 240 }
}

private object PushKindSerializer : LenientEnum<PhonePush.Kind>("app.worldlet.kit.PhonePush.Kind", PhonePush.Kind.entries, PhonePush.Kind.Task)

/** A button on a notification (platform/web/README.md, Push › Actions); [label] is what it says. */
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
     * them newest-wins (context/store mergeWidgetState). */
    data class Widget(override val id: String, val widget: String, val state: WidgetState) : PhoneMessage
    /** What the person said with the Order button: the computer sends it to the team's Claude as an Order, never to Fox. */
    data class Order(override val id: String, val said: String) : PhoneMessage
    /** What happened on a website opened in this app's own browser (owner request 2026-10-07): the page observer's
     * reports, which the computer keeps in its World by its own recording rules. */
    data class Web(override val id: String, val applet: String, val records: List<WebReport>) : PhoneMessage
    /** The person's answer to the approval riding on the live turn (agent/app PhoneMessage `approval`). */
    data class Approval(override val id: String, val approval: String, val choice: HarnessApproval.Choice) : PhoneMessage
    /** One part of a photo or file attached with "+" (owner request 2026-10-12; agent/app PhoneMessage `file`): [data]
     * is a slice of the whole file's base64, sent before the line that names [file]. */
    data class File(override val id: String, val file: String, val part: Int, val parts: Int, val name: String, val mime: String, val data: String) : PhoneMessage
    /** A line with attached files (each sent before as [File] parts), in the main conversation, an item's card ([item])
     * or an Applet's page ([applet]). */
    data class Attach(override val id: String, val text: String, val files: List<String>, val item: String? = null, val applet: String? = null) : PhoneMessage
    /** This phone's notification token for a computer that keeps it (agent/app PhoneMessage `push`); empty takes it back. */
    data class Push(override val id: String, val platform: String, val token: String) : PhoneMessage

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
            is Push -> { put("type", "push"); put("id", m.id); put("platform", m.platform); put("token", m.token) }
            is Approval -> { put("type", "approval"); put("id", m.id); put("approval", m.approval); put("choice", m.choice.wire) }
            is File -> {
                put("type", "file"); put("id", m.id); put("file", m.file); put("part", m.part); put("parts", m.parts)
                put("name", m.name); put("mime", m.mime); put("data", m.data)
            }
            is Attach -> {
                put("type", "chat"); put("id", m.id); put("text", m.text)
                put("files", kotlinx.serialization.json.JsonArray(m.files.map { kotlinx.serialization.json.JsonPrimitive(it) }))
                if (m.item != null) put("item", m.item) else if (m.applet != null) put("applet", m.applet)
            }
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
 * in this app's browser, with this phone's time in seconds (platform/web/payloads.ts PhoneWebRecord). The observer never
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

/** A photo or file attached with "+": split into [PhoneMessage.File] parts that each fit a sealed box (agent/app
 * PHONE_LIMITS `filePart`, base64 characters), sent before the line that names [file]. */
class PhoneAttachment(val name: String, val mime: String, val bytes: ByteArray, val file: String = java.util.UUID.randomUUID().toString().replace("-", "")) {
    fun messages(id: () -> String): List<PhoneMessage.File> {
        val encoded = java.util.Base64.getEncoder().encodeToString(bytes)
        val parts = maxOf(1, (encoded.length + PART_SIZE - 1) / PART_SIZE)
        return (0 until parts).map { part ->
            PhoneMessage.File(id(), file, part, parts, name, mime, encoded.substring(part * PART_SIZE, minOf(encoded.length, (part + 1) * PART_SIZE)))
        }
    }

    companion object {
        const val PART_SIZE = 150_000
        const val MAX_BYTES = 1_500_000
        const val MAX_COUNT = 3
    }
}
