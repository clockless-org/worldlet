package app.worldlet.kit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** A room whose messages the test delivers, recording what the phone sent. */
private class FakeRoom : RoomConnector {
    class Socket(val url: String, val protocols: List<String>, val deliver: (String) -> Unit, val closed: () -> Unit) : RoomSocket {
        val sent = mutableListOf<String>()
        var open = true
        override fun send(text: String): Boolean { if (open) sent += text; return open }
        override fun close() { if (open) { open = false; closed() } }
    }
    val opened = mutableListOf<Socket>()
    override fun open(url: String, protocols: List<String>, onMessage: (String) -> Unit, onClosed: () -> Unit): RoomSocket =
        Socket(url, protocols, onMessage, onClosed).also { opened += it }
}

class RoomTest {
    private val secret = ByteArray(32) { it.toByte() }
    private val keys = PairKeys(secret)

    private fun event(build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = buildJsonObject(build).toString()
    private fun frame(value: JsonObject) = event { put("t", "msg"); put("from", "desktop"); put("data", value.toString()) }
    private fun sentFrames(socket: FakeRoom.Socket) = socket.sent.map { Json.parseToJsonElement(Json.parseToJsonElement(it).jsonObject["data"]!!.jsonPrimitive.content).jsonObject }

    /** The same vector as agent/phone room.ts roomEntry, from the phone's side. */
    @Test
    fun entryMatchesDesktop() {
        val (url, protocols) = roomEntry(keys, "https://worldlet.ai")
        assertEquals("wss://worldlet.ai/api/room/6ffad7c07348adf279da3f73518e9dbb0035c89a312fd6c43de409549a2fb7a4", url)
        assertEquals(listOf("worldlet-room.v1", "phone.AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I.cce4c2148009261d6f8db69e4b7ce3f456a739acb9f5d29323a0b6d8faf05b3d"), protocols)
        assertTrue(roomEntry(keys, "http://127.0.0.1:8787").first.startsWith("ws://127.0.0.1:8787/api/room/"))
    }

    @Test
    fun linkSaysRoom() {
        assertTrue(PairLink.parse("worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac&m=room").room)
        val old = PairLink.parse("worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac")
        assertFalse(old.room)
        assertFalse(WorldletJson.decodeFromString(PairLink.serializer(), """{"secret":"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8","name":"Mac"}""").room, "a link kept before")
    }

    @Test
    fun syncSendAndEndInTheRoom() = runTest {
        val room = FakeRoom()
        val session = PhoneSession(PairLink(secret, name = "Mac", room = true), { error("no relay") }, room = room)
        session.announce(PhoneInfo(name = "Pixel", version = "2"))
        assertEquals(null, session.sync().computerSeenAt, "the room has not said the computer is there")
        val socket = room.opened.single()
        assertEquals(roomEntry(keys, "https://worldlet.ai").first, socket.url)
        socket.deliver(event { put("t", "desktop"); put("online", true) })
        val conversation = Conversation(v = 1, at = "", busy = false, name = "Fox", messages = listOf(Turn(id = "t", role = Turn.Role.Fox, text = "Hello", at = "")))
        socket.deliver(frame(buildJsonObject { put("s", "conversation"); put("b", keys.seal(Conversation.serializer(), conversation, PairKeys.slot("conversation"))) }))
        val update = session.sync(wait = 1)
        assertEquals("Hello", update.conversation?.messages?.single()?.text, "what the computer sends in the room")
        assertNotNull(update.computerSeenAt, "a computer in the room is seen now")

        // The phone said its name when the computer came; a line goes as a sealed message.
        session.send(PhoneMessage.Chat("c1", "Hi"))
        val frames = sentFrames(socket)
        assertEquals("phone", frames.first()["s"]!!.jsonPrimitive.content)
        assertEquals("Pixel", WorldletJson.decodeFromString(PhoneInfo.serializer(), keys.openText(frames.first()["b"]!!.jsonPrimitive.content, PairKeys.slot("phone"))).name)
        assertEquals("Hi", Json.parseToJsonElement(keys.openText(frames.last()["m"]!!.jsonPrimitive.content, PairKeys.to("desktop"))).jsonObject["text"]!!.jsonPrimitive.content)

        // The computer leaves: a line cannot go, and nothing waits.
        socket.deliver(event { put("t", "desktop"); put("online", false) })
        session.sync(wait = 1)
        assertFailsWith<RelayException.Failed> { session.send(PhoneMessage.Chat("c2", "Later")) }

        // The computer ends the pairing.
        socket.deliver(frame(buildJsonObject { put("e", keys.sealText("""{"end":true}""", PairKeys.slot("end"))) }))
        assertFailsWith<RelayException.Ended> { session.sync(wait = 1) }
        assertFalse(socket.open)
    }

    @Test
    fun relayPairingMovesToTheRoom() = runTest {
        val desktop = keys.sealText("""{"v":1,"at":"","name":"Mac","version":"1","room":true}""", PairKeys.slot("desktop"))
        val requests = mutableListOf<RelayRequest>()
        val room = FakeRoom()
        val session = PhoneSession(PairLink(secret, name = "Mac"), { requests += it; 200 to """{"version":3,"peer":{"seenAt":1},"slots":[{"name":"desktop","version":3,"box":"$desktop"}]}""" }, room = room)
        assertFalse(session.inRoom)
        assertEquals(true, session.sync().desktop?.room)
        assertTrue(session.inRoom, "the computer waits in the room")
        runCatching { session.sync() }
        assertEquals(1, room.opened.size, "the next sync goes to the room")
        assertEquals(1, requests.size)
        // Without a room client (an older build of the app's code), the relay stays.
        assertFalse(PhoneSession(PairLink(secret, name = "Mac", room = true), { requests += it; 200 to "{}" }).inRoom)
    }

    @Test
    fun leavingTheRoomWhenPutAway() = runTest {
        val room = FakeRoom()
        val session = PhoneSession(PairLink(secret, name = "Mac", room = true), { error("no relay") }, room = room)
        runCatching { session.sync() }
        room.opened.single().deliver(event { put("t", "desktop"); put("online", true) })
        session.sync(wait = 1)
        session.leaveRoom()
        assertFalse(room.opened.single().open)
        runCatching { session.sync() }
        assertEquals(2, room.opened.size, "a sync after coming back opens the room again")
    }
}
