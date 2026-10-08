package app.worldlet.kit

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    /** The widgets for now (core/widgets). */
    val widgets: WidgetsSnapshot? = null,
    /** When the computer last reached the relay (milliseconds since 1970). */
    val computerSeenAt: Double? = null,
)

/** The phone's side of a pairing, against the relay in worker/pairing.ts. It keeps the poll cursor; the app keeps the
 * link in its encrypted store and calls [sync] while it is open. */
class PhoneSession(val link: PairLink, private val transport: RelayTransport = HttpTransport, private val userAgent: String = "Worldlet-Android/1 (phone pairing)") {
    val keys = PairKeys(link.secret)

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
        val query = buildList {
            add("after" to cursor.toString())
            if (wait > 0) add("wait" to minOf(wait, 20).toString())
        }
        val view = WorldletJson.decodeFromString(View.serializer(), request("api/pair/${keys.id}", query = query, timeoutSeconds = wait + 15))
        var update = PhoneUpdate(computerSeenAt = view.peer?.seenAt)
        for (slot in view.slots) {
            val place = PairKeys.slot(slot.name)
            // A box that does not open (or a slot this version does not know) is skipped, never trusted.
            update = when (slot.name) {
                "attention" -> update.copy(attention = runCatching { keys.open(AttentionSnapshot.serializer(), slot.box, place) }.getOrNull())
                "conversation" -> update.copy(conversation = runCatching { keys.open(Conversation.serializer(), slot.box, place) }.getOrNull())
                "live" -> update.copy(live = runCatching { keys.open(LiveTurn.serializer(), slot.box, place) }.getOrNull())
                "desktop" -> update.copy(desktop = runCatching { keys.open(DesktopInfo.serializer(), slot.box, place) }.getOrNull())
                "widgets" -> update.copy(widgets = runCatching { keys.open(WidgetsSnapshot.serializer(), slot.box, place) }.getOrNull())
                else -> update
            }
        }
        cursor = maxOf(cursor, view.version)
        return update
    }

    suspend fun send(message: PhoneMessage) {
        request("api/pair/${keys.id}/messages", "POST", body = box(keys.sealText(message.toJson().toString(), PairKeys.to("desktop"))))
    }

    suspend fun announce(info: PhoneInfo) {
        request("api/pair/${keys.id}/slots/phone", "PUT", body = box(keys.seal(PhoneInfo.serializer(), info, PairKeys.slot("phone"))))
    }

    /** Gives the relay this phone's push token ([platform] "fcm"), so the computer can notify it while it is closed. */
    suspend fun registerPush(platform: String, token: String) {
        request("api/pair/${keys.id}/push", "PUT", body = buildJsonObject { put("platform", platform); put("token", token) })
    }

    /** Stops notifications: the relay forgets this phone's token. */
    suspend fun unregisterPush() {
        try { request("api/pair/${keys.id}/push", "DELETE") } catch (_: RelayException.Ended) {}
    }

    suspend fun unpair() {
        try { request("api/pair/${keys.id}", "DELETE") } catch (_: RelayException.Ended) {}
    }

    private fun box(sealed: String) = buildJsonObject { put("box", sealed) }
}
