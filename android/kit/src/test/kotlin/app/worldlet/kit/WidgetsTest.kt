package app.worldlet.kit

import java.time.Instant
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The widget rules of core/widgets/widgets.ts (checked there by scripts/widgets-check.ts), as the phone applies them. */
class WidgetsTest {
    private fun e(v: String?, at: Double) = WidgetStateEntry(v, at)

    @Test
    fun snapshotDecodesFromTheComputer() {
        val keys = PairKeys(ByteArray(32) { it.toByte() })
        val json = """{"v":1,"at":"2026-10-04T17:00:00.000Z","widgets":[
            {"id":"wgt-abcdefghij","title":"Getty today","blurb":"Stops and art","color":"#7a5c3e","endsAt":"2026-10-05T01:00:00.000Z","pinned":false,"updatedAt":"2026-10-04T16:00:00.000Z","version":2,"page":"<!doctype html><p>Hi</p>","state":{"stop:1":{"v":"done","at":1759600000000},"stop:2":{"v":null,"at":1759600000500},"bad":{"v":3,"at":1}}},
            {"id":"wgt-klmnopqrst","title":"Packing","blurb":"","color":"#5c7f9e","endsAt":"2026-10-06T01:00:00.000Z","pinned":true,"updatedAt":"2026-10-03T16:00:00.000Z","version":1,"state":{}}]}"""
        val box = keys.sealText(json, PairKeys.slot("widgets"))
        val snapshot = keys.open(WidgetsSnapshot.serializer(), box, PairKeys.slot("widgets"))
        assertEquals(listOf("wgt-abcdefghij", "wgt-klmnopqrst"), snapshot.widgets.map { it.id })
        val getty = snapshot.widgets[0]
        assertEquals(2, getty.version)
        assertEquals("<!doctype html><p>Hi</p>", getty.page)
        assertEquals(e("done", 1_759_600_000_000.0), getty.state["stop:1"])
        assertEquals(e(null, 1_759_600_000_500.0), getty.state["stop:2"])
        assertEquals(mapOf("stop:1" to "done"), widgetValues(cleanWidgetState(getty.state)), "a malformed entry is dropped, a removed one hidden")
        assertNull(snapshot.widgets[1].page, "a page left out of the slot is absent")
        assertTrue(snapshot.widgets[1].pinned)
    }

    @Test
    fun storedSnapshotKeepsExplicitNulls() {
        val snapshot = WidgetsSnapshot(at = "x", widgets = listOf(PhoneWidget("wgt-abcdefghij", "T", state = mapOf("a" to e(null, 5.0), "b" to e("1", 6.0)))))
        val text = WorldletJson.encodeToString(WidgetsSnapshot.serializer(), snapshot)
        assertTrue("\"a\":{\"v\":null,\"at\":5}" in text, text)
        assertEquals(snapshot, WorldletJson.decodeFromString(WidgetsSnapshot.serializer(), text))
    }

    @Test
    fun mergeNewestWins() {
        val local = mapOf("a" to e("1", 100.0), "b" to e("x", 200.0), "c" to e("keep", 300.0))
        val incoming = mapOf(
            "a" to e("2", 150.0), // newer: wins
            "b" to e("y", 200.0), // tie: local stays
            "c" to e(null, 250.0), // older removal: ignored
            "d" to e(null, 400.0), // removal of a key never seen: ignored
            "e" to e("new", 50.0), // a new key
        )
        val (state, changed) = mergeWidgetState(local, incoming)
        assertTrue(changed)
        assertEquals(mapOf("a" to e("2", 150.0), "b" to e("x", 200.0), "c" to e("keep", 300.0), "e" to e("new", 50.0)), state)
        assertFalse(mergeWidgetState(state, mapOf("a" to e("old", 10.0))).changed)
        val removed = mergeWidgetState(state, mapOf("c" to e(null, 301.0))).state
        assertEquals(e(null, 301.0), removed["c"], "a newer removal is kept as a removal")
        assertEquals(mapOf("a" to "2", "b" to "x", "e" to "new"), widgetValues(removed))
    }

    @Test
    fun changesFromAReport() {
        val state = mapOf("a" to e("1", 1.0), "b" to e("2", 1.0), "gone" to e(null, 1.0))
        val changes = widgetStateChanges(state, mapOf("a" to "1", "b" to "3", "c" to "new"), 99.0)
        assertEquals(mapOf("b" to e("3", 99.0), "c" to e("new", 99.0)), changes)
        assertEquals(mapOf("a" to e(null, 99.0), "b" to e(null, 99.0)), widgetStateChanges(state, emptyMap(), 99.0), "keys now missing become removals")
        assertEquals(emptyMap(), widgetStateChanges(state, mapOf("a" to "1", "b" to "2"), 99.0))
    }

    @Test
    fun editsStampAfterTheNewestWriteWhenTheClockIsBehind() {
        val state = mapOf("a" to e("1", 500.0), "b" to e("2", 100.0))
        assertEquals(mapOf("b" to e("3", 900.0)), widgetEdit(state, mapOf("a" to "1", "b" to "3"), 900.0), "a clock ahead stamps with itself")
        assertEquals(mapOf("a" to e("x", 501.0), "b" to e("3", 501.0)), widgetEdit(state, mapOf("a" to "x", "b" to "3"), 200.0), "a clock behind stamps just after the newest write it replaces")
        assertEquals(mapOf("c" to e("new", 50.0)), widgetEdit(state, mapOf("a" to "1", "b" to "2", "c" to "new"), 50.0), "a new key has nothing to be behind")
        assertEquals(emptyMap(), widgetEdit(state, mapOf("a" to "1", "b" to "2"), 50.0))
    }

    @Test
    fun documentRemovesWebRtcFirst() {
        val script = "<script>$WIDGET_NO_WEBRTC</script>"
        assertEquals("<!DOCTYPE html>$script<meta charset=utf-8><script>page()</script>", widgetDocument("<!DOCTYPE html><meta charset=utf-8><script>page()</script>"))
        assertEquals("\n <!doctype html>$script<p>hi", widgetDocument("\n <!doctype html><p>hi"))
        assertEquals("$script<p>no doctype</p>", widgetDocument("<p>no doctype</p>"))
        listOf("RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel").forEach { assertTrue(it in WIDGET_NO_WEBRTC, it) }
    }

    @Test
    fun widgetMessageWritesNullsExplicitly() {
        val message = PhoneMessage.Widget("m1", "wgt-abcdefghij", mapOf("a" to e("on", 1_759_600_000_123.0), "b" to e(null, 1_759_600_000_124.0)))
        val json = message.toJson()
        assertEquals(listOf("widget", "m1", "wgt-abcdefghij"), listOf("type", "id", "widget").map { json[it]!!.jsonPrimitive.content })
        val state = json["state"]!!.jsonObject
        assertEquals("on", state["a"]!!.jsonObject["v"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, state["b"]!!.jsonObject["v"])
        assertTrue("\"b\":{\"v\":null,\"at\":1759600000124}" in json.toString(), json.toString())
    }

    @Test
    fun reportsAndSeed() {
        assertEquals(WidgetReport(state = mapOf("a" to "1")), WidgetReport.read("""{"state":{"a":"1","n":2}}"""))
        assertEquals(WidgetReport(scroll = 120), WidgetReport.read("""{"scroll":119.6}"""))
        assertEquals(WidgetReport(error = "Boom"), WidgetReport.read("""{"error":"Boom"}"""))
        assertNull(WidgetReport.read("not json"))
        assertEquals("""{"state":{"a":"1"},"scroll":40}""", widgetSeed(mapOf("a" to "1"), 40))
    }

    @Test
    fun untilLine() {
        val zone = ZoneId.of("America/Los_Angeles")
        val now = Instant.parse("2026-10-04T17:00:00Z") // 10:00 AM in Los Angeles
        fun until(end: String, pinned: Boolean = false) = widgetUntil(PhoneWidget("wgt-abcdefghij", "T", endsAt = end, pinned = pinned), now, zone)
        assertEquals("Until 6:00 PM", until("2026-10-05T01:00:00Z"))
        assertEquals("Until tomorrow 9:00 AM", until("2026-10-05T16:00:00Z"))
        assertEquals("Until Oct 9", until("2026-10-09T16:00:00Z"))
        assertEquals("Pinned", until("2026-10-05T01:00:00Z", pinned = true))
        assertTrue(PhoneWidget("wgt-abcdefghij", "T", endsAt = "2026-10-05T01:00:00Z").active(now))
        assertFalse(PhoneWidget("wgt-abcdefghij", "T", endsAt = "2026-10-04T16:00:00Z").active(now))
    }
}
