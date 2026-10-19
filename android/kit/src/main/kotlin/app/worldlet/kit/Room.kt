package app.worldlet.kit

import java.net.URI
import java.security.MessageDigest

/** One WebSocket to the pairing room (agent/phone room.ts); tests replace it. */
interface RoomSocket {
    /** False when the socket is closed. */
    fun send(text: String): Boolean
    fun close()
}

/** Opens room sockets (the app's own WebSocket client; the kit has none): [onMessage] gets each message, [onClosed] is
 * called once when the socket closes or fails. */
fun interface RoomConnector {
    fun open(url: String, protocols: List<String>, onMessage: (String) -> Unit, onClosed: () -> Unit): RoomSocket
}

/** The room's address on the relay and the subprotocols the phone opens it with (agent/phone room.ts roomEntry): the room
 * is named by the hash of both token hashes, and the phone gets in with its own token and the computer's hash. */
fun roomEntry(keys: PairKeys, relay: String): Pair<String, List<String>> {
    fun hex(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
    val desktop = hex(keys.desktopToken)
    val phone = hex(keys.phoneToken)
    val uri = URI(relay.trimEnd('/'))
    val scheme = if (uri.scheme == "http") "ws" else "wss"
    return "$scheme://${uri.rawAuthority}/api/room/${hex("$desktop:$phone")}" to listOf("worldlet-room.v1", "phone.${keys.phoneToken}.$desktop")
}
