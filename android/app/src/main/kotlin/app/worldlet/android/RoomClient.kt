package app.worldlet.android

import app.worldlet.kit.RoomConnector
import app.worldlet.kit.RoomSocket
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** The pairing room (agent/windows/README.md#room) over OkHttp's WebSocket, for the kit's PhoneSession. */
object RoomClient : RoomConnector {
    private val client = OkHttpClient.Builder().pingInterval(30, TimeUnit.SECONDS).build()

    override fun open(url: String, protocols: List<String>, onMessage: (String) -> Unit, onClosed: () -> Unit): RoomSocket {
        val request = Request.Builder().url(url)
            .header("Sec-WebSocket-Protocol", protocols.joinToString(", "))
            .header("User-Agent", "Worldlet-Android/1 (phone pairing)")
            .build()
        val closed = AtomicBoolean(false)
        val done = { if (closed.compareAndSet(false, true)) onClosed() }
        val deliver = onMessage
        val socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) { if (!closed.get()) deliver(text) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null); done() }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { done() }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { done() }
        })
        return object : RoomSocket {
            override fun send(text: String) = !closed.get() && socket.send(text)
            override fun close() { socket.close(1000, null); done() }
        }
    }
}
