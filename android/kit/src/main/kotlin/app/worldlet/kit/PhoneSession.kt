package app.worldlet.kit

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** One relay request, as the transport sends it; tests replace the transport. */
data class RelayRequest(val method: String, val url: String, val headers: Map<String, String>, val body: String?, val timeoutMillis: Int)

fun interface RelayTransport {
    suspend fun send(request: RelayRequest): Pair<Int, String>
}

/** The platform's own HTTP client, so the kit needs no networking library. */
object HttpTransport : RelayTransport {
    override suspend fun send(request: RelayRequest): Pair<Int, String> = withContext(Dispatchers.IO) {
        val connection = URI(request.url).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = request.method
            connection.connectTimeout = 15_000
            connection.readTimeout = request.timeoutMillis
            request.headers.forEach { (k, v) -> connection.setRequestProperty(k, v) }
            if (request.body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(request.body.toByteArray()) }
            }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            connection.disconnect()
        }
    }
}

sealed class RelayException(message: String) : IOException(message) {
    /** The pairing no longer exists: the computer unpaired, or the relay forgot an idle pairing. */
    data object Ended : RelayException("This phone is no longer paired. Pair again from Worldlet on your computer.") {
        private fun readResolve(): Any = Ended
    }
    class Failed(message: String) : RelayException(message)
}

/** What one poll brought. Null fields did not change. */
data class PhoneUpdate(
    val attention: AttentionSnapshot? = null,
    val conversation: Conversation? = null,
    /** The turn Fox is streaming. */
    val live: LiveTurn? = null,
    val desktop: DesktopInfo? = null,
    /** The widgets for now (context/artifacts). */
    val widgets: WidgetsSnapshot? = null,
    /** When the computer last reached the relay (milliseconds since 1970). */
    val computerSeenAt: Double? = null,
)

/** The phone's side of a pairing, against the relay in worker/pairing.ts or in the pairing room (platform/web/README.md#room,
 * through [room]). It keeps the poll cursor or the room socket; the app keeps the link in its encrypted store and calls
 * [sync] while it is open. A relay pairing moves to the room once the computer's desktop slot says `room` ([inRoom] then
 * turns true, and the app keeps the link that says so). In the room the computer sends everything it has when the phone
 * arrives, then each change; nothing waits there, so a message goes only while the computer is in the room too. */
class PhoneSession(
    val link: PairLink,
    private val transport: RelayTransport = HttpTransport,
    private val userAgent: String = "Worldlet-Android/1 (phone pairing)",
    private val room: RoomConnector? = null,
) {
    val keys = PairKeys(link.secret)

    /** The pairing meets in the room. */
    @Volatile
    var inRoom = link.room && room != null
        private set
    private val lock = Any()
    private var socket: RoomSocket? = null
    /** Counts sockets, so a closed one's last events change nothing. */
    private var generation = 0
    /** The computer is in the room; the room said whether it is ([heard]); the computer ended the pairing. */
    private var computer = false
    private var heard = false
    private var ended = false
    /** What the computer sent since the last sync, and whether anything came. */
    private var collected = PhoneUpdate()
    private var fresh = false
    private var seenAt: Double? = null
    /** The phone's name, said again each time the computer comes to the room. */
    @Volatile
    private var info: PhoneInfo? = null
    private val news = MutableStateFlow(0)

    @Volatile
    var cursor = 0
        private set

    @Serializable
    private data class SlotRow(val name: String, val version: Int = 0, val box: String)

    @Serializable
    private data class Peer(val seenAt: Double? = null)

    @Serializable
    private data class View(val version: Int, val peer: Peer? = null, val slots: List<SlotRow> = emptyList())

    @Serializable
    private data class Failure(val error: String? = null)

    private suspend fun request(path: String, method: String = "GET", query: List<Pair<String, String>> = emptyList(), body: JsonObject? = null, timeoutSeconds: Int = 20): String {
        val base = link.relay.trimEnd('/') + "/" + path
        val url = if (query.isEmpty()) base else base + "?" + query.joinToString("&") { (k, v) -> "$k=" + URLEncoder.encode(v, "UTF-8") }
        val headers = mapOf(
            "Authorization" to "Bearer ${keys.phoneToken}",
            "Content-Type" to "application/json",
            "User-Agent" to userAgent,
        )
        val (status, text) = transport.send(RelayRequest(method, url, headers, body?.toString(), timeoutSeconds * 1000))
        if (status == 404) throw RelayException.Ended
        if (status !in 200..299) {
            val error = runCatching { WorldletJson.decodeFromString(Failure.serializer(), text).error }.getOrNull()
            throw RelayException.Failed(error ?: "Worldlet could not reach your computer ($status).")
        }
        return text
    }

    /** One poll. The first poll after scanning completes the pairing on the computer. With [wait] (seconds, at most 20)
     * the relay holds the request until the computer sends something new, so changes arrive as they happen. */
    suspend fun sync(wait: Int = 0): PhoneUpdate {
        if (inRoom) return roomSync(wait)
        val query = buildList {
            add("after" to cursor.toString())
            if (wait > 0) add("wait" to minOf(wait, 20).toString())
        }
        val view = WorldletJson.decodeFromString(View.serializer(), request("api/pair/${keys.id}", query = query, timeoutSeconds = wait + 15))
        var update = PhoneUpdate(computerSeenAt = view.peer?.seenAt)
        for (slot in view.slots) update = read(slot.name, slot.box, update)
        cursor = maxOf(cursor, view.version)
        // The computer waits in the room: the pairing moves there.
        if (update.desktop?.room == true && room != null) inRoom = true
        return update
    }

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

    // The room

    /** What came from the computer since the last sync. With [wait] it waits up to that many seconds for something to
     * come (or the computer to arrive or leave). The computer counts as seen now while it is in the room. */
    private suspend fun roomSync(wait: Int): PhoneUpdate {
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
        val connector = room ?: return
        synchronized(lock) {
            if (socket != null || ended) return
            heard = false
            val current = ++generation
            val (url, protocols) = roomEntry(keys, link.relay)
            socket = connector.open(url, protocols, { text -> handle(text, current) }, { closed(current) })
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
        if (inRoom) {
            reachComputer()
            if (!frame(buildJsonObject { put("m", keys.sealText(message.toJson().toString(), PairKeys.to("desktop"))) })) throw RelayException.Failed(AWAY)
            return
        }
        request("api/pair/${keys.id}/messages", "POST", body = box(keys.sealText(message.toJson().toString(), PairKeys.to("desktop"))))
    }

    suspend fun announce(info: PhoneInfo) {
        this.info = info
        if (inRoom) {
            if (synchronized(lock) { computer }) introduce()
            return
        }
        request("api/pair/${keys.id}/slots/phone", "PUT", body = box(keys.seal(PhoneInfo.serializer(), info, PairKeys.slot("phone"))))
    }

    /** Gives this phone's push token ([platform] "fcm") to whoever wakes it while it is closed. With [direct] (the
     * computer's desktop slot says `push`) it goes to the computer in a sealed message and the relay's registration is
     * removed, so the relay keeps none (platform/web/README.md#push); otherwise the relay keeps it, as older computers need. */
    suspend fun registerPush(platform: String, token: String, direct: Boolean = false) {
        if (!direct) {
            request("api/pair/${keys.id}/push", "PUT", body = buildJsonObject { put("platform", platform); put("token", token) })
            return
        }
        send(PhoneMessage.Push(java.util.UUID.randomUUID().toString(), platform, token))
        if (!inRoom) runCatching { unregisterPush() }
    }

    /** Stops notifications: the relay forgets this phone's token, and with [direct] the computer too. */
    suspend fun unregisterPush(direct: Boolean = false) {
        if (direct) runCatching { send(PhoneMessage.Push(java.util.UUID.randomUUID().toString(), "", "")) }
        // A pairing in the room has no relay registration.
        if (inRoom) return
        try { request("api/pair/${keys.id}/push", "DELETE") } catch (_: RelayException.Ended) {}
    }

    suspend fun unpair() {
        if (inRoom) {
            // The computer hears it if it is in the room now.
            if (runCatching { reachComputer() }.isSuccess) frame(buildJsonObject { put("e", keys.sealText("""{"end":true}""", PairKeys.slot("end"))) })
            synchronized(lock) { ended = true }
            leaveRoom()
            return
        }
        try { request("api/pair/${keys.id}", "DELETE") } catch (_: RelayException.Ended) {}
    }

    private fun box(sealed: String) = buildJsonObject { put("box", sealed) }

    private companion object {
        const val AWAY = "Your computer is not reachable. Open Worldlet on it and try again."
    }
}
