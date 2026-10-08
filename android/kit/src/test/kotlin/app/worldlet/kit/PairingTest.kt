package app.worldlet.kit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PairingTest {
    private val secret = ByteArray(32) { it.toByte() }

    /** The same vector as scripts/phone-pairing-check.ts and the iPhone's PairingTests.swift: every side must derive
     * identical ids, tokens and keys. */
    @Test
    fun derivationMatchesDesktop() {
        val keys = PairKeys(secret)
        assertEquals("5gImJiJSofcAENRFNwk-eA", keys.id)
        assertEquals("ExL6gIXW76sr5OnyNNudNIVl5ItyYXrGmzcD2mv4-ZY", keys.desktopToken)
        assertEquals("AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I", keys.phoneToken)
    }

    @Test
    fun linkParsing() {
        val link = PairLink.parse("worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Kelvin%E2%80%99s+Mac")
        assertTrue(link.secret.contentEquals(secret))
        assertEquals("https://worldlet.ai", link.relay)
        assertEquals("Kelvin’s Mac", link.name)
        val local = PairLink.parse("worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=x&r=http%3A%2F%2F127.0.0.1%3A8787")
        assertEquals("http://127.0.0.1:8787", local.relay)
        fun reason(text: String) = assertFailsWith<PairingException> { PairLink.parse(text) }.reason
        assertEquals(PairingException.Reason.NotWorldlet, reason("https://worldlet.ai"))
        assertEquals(PairingException.Reason.NeedsUpdate, reason("worldlet://pair?v=2&s=AAEC"))
        assertEquals(PairingException.Reason.Incomplete, reason("worldlet://pair?v=1&s=AAEC"))
        assertEquals(PairingException.Reason.UnknownRelay, reason("worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&r=http%3A%2F%2Fevil.example"))
        // The stored link round-trips.
        assertEquals(link, WorldletJson.decodeFromString(PairLink.serializer(), WorldletJson.encodeToString(PairLink.serializer(), link)))
    }

    /** A box the desktop sealed (WebCrypto, core/phone/pairing.ts) opens here, and only in its own place. */
    @Test
    fun opensDesktopBox() {
        val keys = PairKeys(secret)
        val box = "KvY1jbTWsmixcULkEw9_MqP93SnK3epd-wIVvqzLF2VCnWuLZrDxqr01u0VOxXgWXSnRdVcGvt-5HyPO5EBaWbuADs5AXD7CKqoG2hYWmX78EqC8gjALgz6uEGmLN9njJ9LF5tOxgRPmF6uj5DroQlggl86hpGmVWdn28in7DqQnIZfI87A02GUSe7ZWeMHfZ35XS23COXHILSLli7fB7W0T0O8QVZQEKjRCzwg_EAZbdJS-VDJ3M54CxKKzW4LCgkhH6ywdYczpLYBJejlhjhVSlTK9sAo-Nm4XGtrI46wXPXywqinFEmxqFdSVmjxKOkjtapkgZvxZzJnloVUNTik4Jv2P3Cay6UKSovPNReVKB2imwypZTnp-WlwI4Dxe"
        val snapshot = keys.open(AttentionSnapshot.serializer(), box, PairKeys.slot("attention"))
        assertEquals(1, snapshot.now.size)
        val item = snapshot.now[0]
        assertEquals("item-1", item.id)
        assertEquals(AttentionGroup.Event, item.group)
        assertEquals("Join planning", item.headline)
        assertEquals("9:30 AM · in 47m", item.`when`)
        assertEquals("2026-10-03T16:30:00Z", item.start?.let { java.time.Instant.parse(it).toString() })
        assertEquals(listOf(AttentionGroup.Event), snapshot.nowGroups.map { it.first })
        assertFailsWith<Exception> { keys.open(AttentionSnapshot.serializer(), box, PairKeys.slot("conversation")) }
        assertFailsWith<Exception> { PairKeys(ByteArray(32) { 9 }).open(AttentionSnapshot.serializer(), box, PairKeys.slot("attention")) }
    }

    @Test
    fun sealRoundTripAndMessageShapes() {
        val keys = PairKeys(secret)
        val box = keys.sealText(PhoneMessage.Attention("item-1", AttentionAction.Later).toJson().toString(), PairKeys.to("desktop"))
        val raw = Json.parseToJsonElement(keys.openText(box, PairKeys.to("desktop"))).jsonObject
        assertEquals(listOf("attention", "item-1", "later"), listOf("type", "id", "action").map { raw[it]!!.jsonPrimitive.content })
        fun flat(m: PhoneMessage) = m.toJson().mapValues { it.value.jsonPrimitive.content }
        assertEquals(mapOf("type" to "chat", "id" to "c1", "text" to "Hi"), flat(PhoneMessage.Chat("c1", "Hi")))
        assertEquals(mapOf("type" to "chat", "id" to "1", "text" to "Hi", "item" to "a"), flat(PhoneMessage.Ask("1", "Hi", "a")))
        assertEquals(mapOf("type" to "option", "id" to "2", "item" to "a"), flat(PhoneMessage.Option("2", "a")))
        assertEquals(mapOf("type" to "connect", "id" to "k", "provider" to "gmail"), flat(PhoneMessage.Connect("k", "gmail")))
        // A line said inside an Applet's page carries the Applet and no item; opening an Applet on the computer.
        assertEquals(mapOf("type" to "chat", "id" to "3", "text" to "Hi", "applet" to "mail"), flat(PhoneMessage.Tell("3", "Hi", "mail")))
        assertEquals(mapOf("type" to "applet", "id" to "4", "applet" to "mail", "action" to "open"), flat(PhoneMessage.OpenApplet("4", "mail")))
        assertEquals(mapOf("type" to "order", "id" to "r", "said" to "Fix it"), flat(PhoneMessage.Order("r", "Fix it")))
    }

    @Test
    fun desktopOrderIsOptional() {
        assertEquals(false, WorldletJson.decodeFromString(DesktopInfo.serializer(), """{"v":1,"at":"","name":"Studio","version":"1.0"}""").order)
        assertEquals(true, WorldletJson.decodeFromString(DesktopInfo.serializer(), """{"v":1,"at":"","name":"Studio","version":"1.0","order":true}""").order)
    }

    @Test
    fun liveTurnDecodes() {
        val keys = PairKeys(secret)
        val box = keys.sealText("""{"v":1,"at":"2026-10-03T23:50:00.000Z","id":"turn-1","item":"t1","user":"Draft it","steps":["Reading the thread"],"text":"Sam asked","done":false}""", PairKeys.slot("live"))
        val live = keys.open(LiveTurn.serializer(), box, PairKeys.slot("live"))
        assertEquals(LiveTurn(1, "2026-10-03T23:50:00.000Z", "turn-1", "t1", "Draft it", listOf("Reading the thread"), "Sam asked", false), live)
        assertNull(WorldletJson.decodeFromString(LiveTurn.serializer(), """{"v":1,"at":"","id":"m","user":"","steps":[],"text":"Hi","done":true}""").item, "a main-conversation turn has no item")
        val inside = WorldletJson.decodeFromString(LiveTurn.serializer(), """{"v":1,"at":"","id":"a","applet":"mail","user":"Anything new?","steps":[],"text":"","done":false}""")
        assertEquals("mail", inside.applet, "a turn asked inside an Applet names it")
        assertNull(inside.item)
        assertNull(inside.approval, "a computer older than approvals sends none")
    }

    @Test
    fun approvalRidesOnTheLiveTurnAndIsAnswered() {
        val live = WorldletJson.decodeFromString(LiveTurn.serializer(), """{"v":1,"at":"","id":"turn:3","user":"Clean up","steps":[],"text":"","done":false,"approval":{"id":"acp-1","title":"Hermes Agent asks: Run rm -rf build","detail":"rm -rf build","choices":["always","sudo","once"]}}""")
        val approval = live.asking()!!
        assertEquals(listOf("acp-1", "Hermes Agent asks: Run rm -rf build", "rm -rf build"), listOf(approval.id, approval.title, approval.detail))
        assertEquals(listOf("Allow once", "Always", "Deny"), approval.choices.map { it.label }, "the computer's order, an unknown choice left out, Deny always")
        assertEquals(listOf(HarnessApproval.Choice.Deny), HarnessApproval("x", "t").choices, "Deny is always there")
        assertNull(live.asking(setOf("acp-1")), "answered on this phone: the card shows the settled line")
        assertNull(live.copy(done = true).asking(), "a finished turn asks nothing")
        assertEquals(200, live.copy(approval = approval.copy(title = "t".repeat(500))).asking()!!.title.length)
        assertEquals("Allowed. It will not ask again for this.", HarnessApproval.Choice.Always.settled)
        assertTrue(live.shown(300), "waiting on the person, it stays")
        assertEquals(false, live.copy(approval = null).shown(300), "a quiet running turn gives way")
        assertEquals(false, live.shown(700))
        val sent = PhoneMessage.Approval("m1", "acp-1", HarnessApproval.Choice.Always).toJson().mapValues { it.value.jsonPrimitive.content }
        assertEquals(mapOf("type" to "approval", "id" to "m1", "approval" to "acp-1", "choice" to "always"), sent)
    }

    @Test
    fun webReportsBatchAndEncode() {
        assertNull(WebReport.read("""{"kind":"text","url":"http://x.com/","text":"a"}""", 0), "only https pages")
        assertNull(WebReport.read("""{"kind":"shell","url":"https://x.com/"}""", 0))
        assertNull(WebReport.read("not json", 0))
        val page = WebReport.read("""{"kind":"page","url":"https://m.youtube.com/","title":"YouTube"}""", 1_791_090_000_000)!!
        assertEquals(1_791_090_000.0, page.at)
        val long = WebReport.read("""{"kind":"text","url":"https://x.com/","text":"${"字".repeat(50_000)}"}""", 0)!!
        assert(long.text!!.toByteArray().size <= WebReport.TEXT_LIMIT) { "a page's text fits one box" }
        val buffer = WebReportBuffer("youtube")
        buffer.add(page); repeat(3) { buffer.add(long) }
        var n = 0
        val messages = buffer.take { "w${++n}" }
        assertEquals(3, messages.size, "about 120 KB each")
        assertEquals(0, buffer.size)
        val sent = messages[0].toJson()
        assertEquals("web", sent["type"]?.jsonPrimitive?.content)
        assertEquals("youtube", sent["applet"]?.jsonPrimitive?.content)
        assertEquals("page", sent["records"]?.jsonArray?.first()?.jsonObject?.get("kind")?.jsonPrimitive?.content)
        assertNull(sent["records"]?.jsonArray?.first()?.jsonObject?.get("text"), "absent fields are left out")
    }

    @Test
    fun appletWorldDecodes() {
        val old = WorldletJson.decodeFromString(AttentionSnapshot.serializer(), """{"v":1,"at":"","now":[],"later":[],"accounts":[]}""")
        assertNull(old.applets, "a computer without the Applet world still decodes")
        val json = """{"v":1,"at":"","now":[{"id":"a","ids":["a"],"group":"needsAction","title":"Mail","action":"Reply","context":"","start":null,"when":"","level":2,"snoozed":false,"applet":"mail"}],"later":[{"id":"b","ids":["b"],"group":"unseen","title":"News","action":"","context":"","start":null,"when":"","level":1,"snoozed":true}],"accounts":[],
            "applets":[{"key":"widget:wgt-abcdefghij","title":"Getty Center today","section":"live","state":"ready","widget":"wgt-abcdefghij"},
            {"key":"mail","title":"Mail","section":"live","state":"busy","line":"Reading Mail…","recent":[{"text":"Saved Sam's venue question","at":"2026-10-03T20:00:00.000Z"}],"fox":{"say":"","option":"","turns":[{"user":"Anything new?","text":"Only Sam.","working":false,"at":""}]}},
            {"key":"notion","title":"Notion","section":"accounts","state":"off"},
            {"key":"future","title":"Future","section":"orbit","state":"glowing"},
            {"key":"youtube","title":"YouTube","section":"places","state":"ready","url":"https://www.youtube.com/"},
            {"key":"bad","title":"Bad","section":"places","state":"ready","url":"javascript:alert(1)"}]}"""
        val snapshot = WorldletJson.decodeFromString(AttentionSnapshot.serializer(), json)
        val applets = snapshot.applets.orEmpty()
        assertEquals(listOf("widget:wgt-abcdefghij", "mail", "notion", "future", "youtube", "bad"), applets.map { it.key })
        assertNull(applets[1].website, "a computer older than urls sends none")
        assertEquals("https://www.youtube.com/", applets[4].website, "a tile opens its website")
        assertNull(applets[5].website, "only an https address opens")
        assertEquals("wgt-abcdefghij", applets[0].widget)
        val mail = snapshot.applet("mail")!!
        assertEquals(PhoneApplet.Section.Live, mail.section)
        assertEquals(PhoneApplet.State.Busy, mail.state)
        assertEquals("Reading Mail…", mail.line)
        assertEquals("Saved Sam's venue question", mail.recent?.single()?.text)
        assertEquals("Only Sam.", mail.fox?.turns?.single()?.text)
        assertEquals(PhoneApplet.State.Off, snapshot.applet("notion")?.state)
        // A section or lamp from a newer computer reads as In your World and off.
        assertEquals(PhoneApplet.Section.Places to PhoneApplet.State.Off, applets[3].section to applets[3].state)
        assertEquals("mail", snapshot.now.single().applet)
        assertNull(snapshot.later.single().applet, "an item without a home has no applet")
        assertEquals(listOf("a"), snapshot.items(mail).map { it.id })
        assertNull(snapshot.applet(null))
        assertNull(snapshot.applet("missing"))
    }

    @Test
    fun optionalFieldsDecode() {
        val old = WorldletJson.decodeFromString(AttentionSnapshot.serializer(), """{"v":1,"at":"","now":[],"later":[]}""")
        assertNull(old.accounts, "a computer without accounts still decodes")
        val new = WorldletJson.decodeFromString(AttentionSnapshot.serializer(), """{"v":1,"at":"","now":[],"later":[],"accounts":[{"provider":"gmail","title":"Mail","action":"permissions"}]}""")
        assertEquals(AccountIssue.Action.Permissions, new.accounts?.first()?.action)
        val row = """{"id":"a","ids":["a"],"group":"needsAction","title":"Mail","action":"Reply","context":"","start":null,"when":"","level":2,"snoozed":false,"fox":{"say":"Want me to help with the next step?","option":"Help me do it","turns":[{"user":"Draft it","text":"Reading the thread","working":true,"at":""}]},"fact":"Due Friday","summary":"Bring **the form**.","source":"gmail","art":"scene-dentist","future":1}"""
        val item = WorldletJson.decodeFromString(AttentionItem.serializer(), row)
        assertEquals("Help me do it", item.fox?.option)
        assertEquals(true, item.fox?.turns?.first()?.working)
        assertEquals(listOf("Due Friday", "Bring **the form**.", "gmail", "scene-dentist"), listOf(item.fact, item.summary, item.source, item.art))
    }
}

/** A relay that answers like worker/pairing.ts for one pairing, enough to drive the session's cursor and errors. */
class SessionTest {
    @Test
    fun syncAdvancesCursorAndEnds() = runTest {
        val link = PairLink(ByteArray(32) { it.toByte() }, name = "Mac")
        val keys = PairKeys(link.secret)
        val conversation = Conversation(busy = true, messages = listOf(Turn("t", Turn.Role.Fox, "Hello")))
        val box = keys.seal(Conversation.serializer(), conversation, PairKeys.slot("conversation"))
        val requests = mutableListOf<RelayRequest>()
        val answers = ArrayDeque(listOf(
            200 to """{"version":7,"role":"phone","peer":{"seenAt":1700000000000},"slots":[{"name":"conversation","version":7,"box":"$box"},{"name":"attention","version":6,"box":"AAAA"}],"messages":[]}""",
            200 to """{"version":7,"role":"phone","peer":null,"slots":[],"messages":[]}""",
            404 to """{"error":"gone"}""",
        ))
        val session = PhoneSession(link, { requests += it; answers.removeFirst() })
        val first = session.sync()
        assertEquals(conversation, first.conversation)
        assertNull(first.attention, "a box that does not open is skipped")
        assertEquals(1_700_000_000_000.0, first.computerSeenAt)
        assertEquals("https://worldlet.ai/api/pair/${keys.id}?after=0", requests[0].url)
        assertEquals("Bearer ${keys.phoneToken}", requests[0].headers["Authorization"])
        session.sync(wait = 20)
        assertEquals("https://worldlet.ai/api/pair/${keys.id}?after=7&wait=20", requests[1].url)
        assertEquals(35_000, requests[1].timeoutMillis)
        assertFailsWith<RelayException.Ended> { session.sync() }
    }
}
