package app.worldlet.kit

import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Notifications (core/phone/README.md, push): a box the relay hands Firebase Messaging opens with the pairing keys, in
 * the place "push" only, and the phone registers its token with the relay. */
class PushTest {
    private val secret = ByteArray(32) { it.toByte() }
    private val keys = PairKeys(secret)

    /** Sealed the way the desktop's WebCrypto does it: nonce | ciphertext | tag, additional data `<id>|<place>`, with
     * the shared test vector's key, independent of [PairKeys.sealText]. */
    private fun seal(json: String, place: String = "push"): String {
        val nonce = ByteArray(12) { (it * 7).toByte() }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(PairKeys.hkdf(secret, "key", 32), "AES"), GCMParameterSpec(128, nonce))
        cipher.updateAAD("5gImJiJSofcAENRFNwk-eA|$place".toByteArray())
        return Base64.getUrlEncoder().withoutPadding().encodeToString(nonce + cipher.doFinal(json.toByteArray()))
    }

    @Test
    fun opensPushBox() {
        val box = seal("""{"v":1,"id":"p1","at":1791090000000,"kind":"attention","title":"Dentist at 3:00 PM","body":"Bring the form.","open":{"item":"e1"},"later":true}""")
        val push = keys.openPush(mapOf("p" to keys.id, "b" to box))!!
        assertEquals(PhonePush(1, "p1", 1_791_090_000_000.0, PhonePush.Kind.Attention, "Dentist at 3:00 PM", "Bring the form.", PhonePush.Open(item = "e1")), push)
        assertEquals(PushTarget.Item("e1"), push.target)
        assertNull(keys.openPush(mapOf("p" to "someone-else", "b" to box)), "another pairing's push is not opened")
        assertNull(keys.openPush(mapOf("p" to keys.id, "b" to seal("""{"v":1,"id":"p1","title":"x"}""", "slot:attention"))), "only the place push")
        assertNull(PairKeys(ByteArray(32) { 9 }).openPush(mapOf("p" to keys.id, "b" to box)), "another key")
        assertNull(keys.openPush(mapOf("p" to keys.id)))
        assertNull(keys.openPush(mapOf("p" to keys.id, "b" to seal("""{"v":1,"id":"p1","title":"  "}"""))), "nothing to show")
    }

    @Test
    fun pushShapesAndTargets() {
        fun read(json: String) = keys.openPush(mapOf("p" to keys.id, "b" to seal(json)))!!
        val long = read("""{"v":1,"id":"f","at":0,"kind":"fox","title":" ${"T".repeat(100)} ","body":"${"b".repeat(300)}","open":{"conversation":true}}""")
        assertEquals(80 to 240, long.title.length to long.body.length, "clamped like phonePush()")
        assertEquals(PhonePush.Kind.Fox, long.kind)
        assertEquals(PushTarget.Conversation, long.target)
        assertEquals(PushTarget.Applet("mail"), read("""{"v":1,"id":"r","at":0,"kind":"routine","title":"Morning brief","body":"","open":{"applet":"mail"}}""").target)
        assertEquals(PushTarget.Item("a"), read("""{"v":1,"id":"r","at":0,"kind":"fox","title":"Fox","body":"","open":{"item":"a","applet":"mail"}}""").target, "the card first")
        val future = read("""{"v":1,"id":"n","at":0,"kind":"orbit","title":"New","body":""}""")
        assertEquals(PhonePush.Kind.Task to null, future.kind to future.target, "an unknown kind reads as a task; no target opens the app as it was")
        // Through a launch intent's extras and back.
        for (target in listOf(PushTarget.Item("e1"), PushTarget.Applet("mail"), PushTarget.Conversation)) assertEquals(target, PushTarget.read(target.extras::get))
        assertNull(PushTarget.read { null })
        assertNull(PushTarget.read(mapOf(PushTarget.ITEM to "", PushTarget.CONVERSATION to "0")::get))
    }

    @Test
    fun buttonsSendTheAppsOwnMessages() {
        fun read(json: String) = keys.openPush(mapOf("p" to keys.id, "b" to seal(json)))!!
        val item = read("""{"v":1,"id":"a","at":0,"kind":"attention","title":"Reply to Ada","open":{"item":"i1"},"act":{"attention":"i1"}}""")
        assertEquals(listOf(PushAction.Done, PushAction.Later), item.actions)
        assertEquals(PhoneMessage.Attention("i1", AttentionAction.Done), item.message(PushAction.Done))
        assertEquals(PhoneMessage.Attention("i1", AttentionAction.Later), item.message(PushAction.Later))
        assertNull(item.message(PushAction.Allow), "only the buttons it offers")
        val fox = read("""{"v":1,"id":"f","at":0,"kind":"fox","title":"Fox","body":"Here is the plan.","open":{"item":"i1"},"act":{"reply":true}}""")
        assertEquals(listOf(PushAction.Reply), fox.actions)
        assertEquals(PhoneMessage.Ask("r", "Send it", "i1"), fox.message(PushAction.Reply, "  Send it ", "r"), "said on the item's card")
        assertNull(fox.message(PushAction.Reply, "   ", "r"), "nothing to say")
        assertEquals(PhoneMessage.Tell("r", "Thanks", "gmail"), fox.copy(open = PhonePush.Open(applet = "gmail")).message(PushAction.Reply, "Thanks", "r"))
        assertEquals(PhoneMessage.Chat("r", "Thanks"), fox.copy(open = PhonePush.Open(conversation = true)).message(PushAction.Reply, "Thanks", "r"))
        val asks = read("""{"v":1,"id":"q","at":0,"kind":"fox","title":"Run a command","body":"rm -rf ./build","open":{"conversation":true},"act":{"approval":"exec-7","once":true}}""")
        assertEquals(listOf(PushAction.Allow, PushAction.Deny), asks.actions)
        assertEquals("""{"type":"approval","id":"m","approval":"exec-7","choice":"once"}""", asks.message(PushAction.Allow, id = "m")!!.toJson().toString())
        assertEquals(PhoneMessage.Approval("m", "exec-7", HarnessApproval.Choice.Deny), asks.message(PushAction.Deny, id = "m"))
        assertEquals(listOf(PushAction.Deny), asks.copy(act = PhonePush.Act(approval = "exec-7")).actions, "Deny alone when Allow once is not offered")
        assertEquals(emptyList(), read("""{"v":1,"id":"n","at":0,"kind":"task","title":"Done","act":{"run":"x"}}""").actions, "an unknown set has no buttons")
        assertEquals(emptyList(), read("""{"v":1,"id":"n","at":0,"kind":"task","title":"Done"}""").actions)
        for (action in PushAction.entries) assertEquals(action, PushAction.of(action.wire))
        // The push goes into the button's intent as JSON and comes back whole.
        assertEquals(asks, WorldletJson.decodeFromString(PhonePush.serializer(), WorldletJson.encodeToString(PhonePush.serializer(), asks)))
    }

    @Test
    fun registersWithRelay() = runTest {
        val requests = mutableListOf<RelayRequest>()
        val answers = ArrayDeque(listOf(200 to """{"ok":true}""", 200 to """{"ok":true}""", 404 to """{"error":"gone"}"""))
        val session = PhoneSession(PairLink(secret, name = "Mac"), { requests += it; answers.removeFirst() })
        session.registerPush("fcm", "token:abc_123-XYZ")
        assertEquals("PUT", requests[0].method)
        assertEquals("https://worldlet.ai/api/pair/${keys.id}/push", requests[0].url)
        assertEquals("Bearer ${keys.phoneToken}", requests[0].headers["Authorization"])
        val body = Json.parseToJsonElement(requests[0].body!!).jsonObject
        assertEquals(mapOf("platform" to "fcm", "token" to "token:abc_123-XYZ"), body.mapValues { it.value.jsonPrimitive.content })
        session.unregisterPush()
        assertEquals("DELETE" to "https://worldlet.ai/api/pair/${keys.id}/push", requests[1].method to requests[1].url)
        session.unregisterPush() // a pairing that already ended has no token to forget
    }
}
