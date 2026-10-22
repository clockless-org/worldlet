package app.worldlet.kit

import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

sealed class RelayException(message: String) : IOException(message) {
    /** The pairing no longer exists: the computer unpaired, or it is a pairing from before the pairing room. */
    data object Ended : RelayException("This phone is no longer paired. Pair again from Worldlet on your computer.") {
        private fun readResolve(): Any = Ended
    }
    class Failed(message: String) : RelayException(message)
}

/** What one sync brought. Null fields did not change. */
data class PhoneUpdate(
    val attention: AttentionSnapshot? = null,
    val conversation: Conversation? = null,
    /** The turn Fox is streaming. */
    val live: LiveTurn? = null,
    val desktop: DesktopInfo? = null,
    /** The widgets for now (context/store). */
    val widgets: WidgetsSnapshot? = null,
    /** When the computer was last in the room (milliseconds since 1970). */
    val computerSeenAt: Double? = null,
)

/** The phone's side of a pairing, in the pairing room (platform/web/README.md#room) on the link's relay host, through
 * [room]. It keeps the room socket; the app keeps the link in its encrypted store and calls [sync] while it is open. The
 * computer sends everything it has when the phone arrives, then each change; nothing waits there, so a message goes only
 * while the computer is in the room too. A link from before the pairing room (no `m=room`) has nowhere to meet: its
 * session is ended from the start, so the app asks to pair again. */
class PhoneSession(
    val link: PairLink,
    private val room: RoomConnector,
) {
    val keys = PairKeys(link.secret)

    private val lock = Any()
    private var socket: RoomSocket? = null
    /** Counts sockets, so a closed one's last events change nothing. */
    private var generation = 0
    /** The computer is in the room; the room said whether it is ([heard]); the pairing ended (the computer ended it, the
     * phone unpaired, or the link is not a room link). */
    private var computer = false
    private var heard = false
    private var ended = !link.room
    /** What the computer sent since the last sync, and whether anything came. */
    private var collected = PhoneUpdate()
    private var fresh = false
    private var seenAt: Double? = null
    /** The phone's name, said again each time the computer comes to the room. */
    @Volatile
    private var info: PhoneInfo? = null
    private val news = MutableStateFlow(0)

    /** A slot's box, opened into [update]. A box that does not open (or a slot this version does not know) is skipped,
     * never trusted. */
    private fun read(name: String, box: String, update: PhoneUpdate): PhoneUpdate {
        val place = PairKeys.slot(name)
        return when (name) {
            "attention" -> runCatching { keys.open(AttentionSnapshot.serializer(), box, place) }.getOrNull()?.let { update.copy(attention = it) }
            "conversation" -> runCatching { keys.open(Conversation.serializer(), box, place) }.getOrNull()?.let { update.copy(conversation = it) }
            "live" -> runCatching { keys.open(LiveTurn.serializer(), box, place) }.getOrNull()?.let { update.copy(live = it) }
            "desktop" -> runCatching { keys.open(DesktopInfo.serializer(), box, place) }.getOrNull()?.let { update.copy(desktop = it) }
            "widgets" -> runCatching { keys.open(WidgetsSnapshot.serializer(), box, place) }.getOrNull()?.let { update.copy(widgets = it) }
            else -> null
        } ?: update
    }

    /** What came from the computer since the last sync; the first one opens the room. With [wait] (seconds, at most 20)
     * it waits for something to come (or the computer to arrive or leave). The computer counts as seen now while it is in
     * the room. Throws [RelayException.Ended] once the pairing ended. */
    suspend fun sync(wait: Int = 0): PhoneUpdate {
        if (ended) throw RelayException.Ended
        connect()
        // Until the room says whether the computer is there, a first sync waits for it.
        repeat(50) { if (!synchronized(lock) { heard }) delay(100) }
        val start = news.value
        if (wait > 0 && !synchronized(lock) { fresh }) withTimeoutOrNull(minOf(wait, 20) * 1000L) { news.first { it != start } }
        synchronized(lock) {
            if (ended) throw RelayException.Ended
            // No socket left (no network, or the room refused it): the caller backs off before trying again.
            if (socket == null && !fresh) throw RelayException.Failed("Worldlet could not reach the pairing room.")
            fresh = false
            if (computer) seenAt = System.currentTimeMillis().toDouble()
            val update = collected.copy(computerSeenAt = seenAt)
            collected = PhoneUpdate()
            return update
        }
    }

    private fun connect() {
        synchronized(lock) {
            if (socket != null || ended) return
            heard = false
            val current = ++generation
            val (url, protocols) = roomEntry(keys, link.relay)
            socket = room.open(url, protocols, { text -> handle(text, current) }, { closed(current) })
        }
    }

    private fun closed(current: Int) {
        synchronized(lock) {
            if (current != generation) return
            socket = null
            if (computer) { computer = false; seenAt = System.currentTimeMillis().toDouble() }
            heard = true
        }
        wake()
    }

    private fun handle(text: String, current: Int) {
        val event = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return
        fun field(o: JsonObject, key: String) = (o[key] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
        if (synchronized(lock) { current != generation }) return
        when (field(event, "t")) {
            "desktop" -> {
                val online = (event["online"] as? kotlinx.serialization.json.JsonPrimitive)?.content == "true"
                synchronized(lock) { computer = online; heard = true; seenAt = System.currentTimeMillis().toDouble() }
                if (online) introduce()
                wake()
            }
            "msg" -> {
                if (field(event, "from") != "desktop") return
                val frame = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(field(event, "data") ?: return) as JsonObject }.getOrNull() ?: return
                val slot = field(frame, "s")
                val box = field(frame, "b")
                val end = field(frame, "e")
                if (slot != null && box != null) {
                    synchronized(lock) { collected = read(slot, box, collected) }
                    wake()
                } else if (end != null && runCatching { keys.openText(end, PairKeys.slot("end")) }.isSuccess) {
                    val open = synchronized(lock) { ended = true; socket }
                    open?.close()
                    wake()
                }
            }
        }
    }

    private fun wake() {
        synchronized(lock) { fresh = true }
        news.update { it + 1 }
    }

    private fun frame(value: JsonObject): Boolean {
        val open = synchronized(lock) { socket } ?: return false
        return open.send(buildJsonObject { put("data", value.toString()) }.toString())
    }

    private fun introduce() {
        val info = info ?: return
        frame(buildJsonObject { put("s", "phone"); put("b", keys.seal(PhoneInfo.serializer(), info, PairKeys.slot("phone"))) })
    }

    /** Connects when needed and waits until the room says whether the computer is there; throws when it is not. */
    private suspend fun reachComputer() {
        if (ended) throw RelayException.Ended
        connect()
        repeat(50) { if (!synchronized(lock) { heard }) delay(100) }
        if (ended) throw RelayException.Ended
        if (!synchronized(lock) { computer }) throw RelayException.Failed(AWAY)
    }

    /** Leaves the room while the app is in the background, so the computer knows it is put away and notifies instead.
     * The next sync comes back. */
    fun leaveRoom() {
        val open = synchronized(lock) {
            val open = socket
            socket = null
            generation++
            if (computer) { computer = false; seenAt = System.currentTimeMillis().toDouble() }
            heard = false
            open
        }
        open?.close()
    }

    suspend fun send(message: PhoneMessage) {
        reachComputer()
        if (!frame(buildJsonObject { put("m", keys.sealText(message.toJson().toString(), PairKeys.to("desktop"))) })) throw RelayException.Failed(AWAY)
    }

    /** The phone's name, said now if the computer is in the room and again each time it comes. */
    fun announce(info: PhoneInfo) {
        this.info = info
        if (synchronized(lock) { computer }) introduce()
    }

    /** Gives this phone's push token ([platform] "fcm") to the computer in a sealed message; the computer wakes the
     * phone while it is closed (platform/web/README.md#push). */
    suspend fun registerPush(platform: String, token: String) {
        send(PhoneMessage.Push(java.util.UUID.randomUUID().toString(), platform, token))
    }

    /** Stops notifications: the computer forgets this phone's token, if it can be reached. */
    suspend fun unregisterPush() {
        runCatching { send(PhoneMessage.Push(java.util.UUID.randomUUID().toString(), "", "")) }
    }

    suspend fun unpair() {
        // The computer hears it if it is in the room now.
        if (runCatching { reachComputer() }.isSuccess) frame(buildJsonObject { put("e", keys.sealText("""{"end":true}""", PairKeys.slot("end"))) })
        synchronized(lock) { ended = true }
        leaveRoom()
    }

    private companion object {
        const val AWAY = "Your computer is not reachable. Open Worldlet on it and try again."
    }
}
