package app.worldlet.kit

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.descriptors.element
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

// Widgets (core/widgets/README.md): pages made for the moment that the computer sends in the `widgets` slot. These are
// the rules core/widgets/widgets.ts applies to their state, so the computer and the phone merge edits the same way.

/** The widget limits the phone applies (core/widgets/widgets.ts WIDGET_LIMITS). */
object WidgetLimits {
    const val STATE_KEYS = 300
    const val STATE_KEY = 200
    const val STATE_VALUE = 4000
    const val STATE_TOTAL = 100_000
}

/** One key of a widget's local storage: its value (null once removed) and when it was written (milliseconds since
 * 1970). Always written as `{"v":…,"at":…}` with `v` explicit, even when null; an entry that does not read as one
 * (no time, a value that is not a string) decodes with a time of NaN and is dropped by [cleanWidgetState]. */
@Serializable(with = WidgetStateEntry.Serializer::class)
data class WidgetStateEntry(val v: String?, val at: Double) {
    fun toJson(): JsonObject = buildJsonObject {
        put("v", if (v == null) JsonNull else JsonPrimitive(v))
        // Whole milliseconds read as an integer, as JavaScript writes them.
        put("at", if (at.isFinite() && at == Math.rint(at) && Math.abs(at) < 9e15) JsonPrimitive(at.toLong()) else JsonPrimitive(at))
    }

    object Serializer : KSerializer<WidgetStateEntry> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("app.worldlet.kit.WidgetStateEntry") {
            element<String?>("v")
            element<Double>("at")
        }

        override fun serialize(encoder: Encoder, value: WidgetStateEntry) {
            val json = encoder as? JsonEncoder ?: error("A widget's state is JSON only.")
            json.encodeJsonElement(value.toJson())
        }

        override fun deserialize(decoder: Decoder): WidgetStateEntry {
            val json = decoder as? JsonDecoder ?: error("A widget's state is JSON only.")
            return read(json.decodeJsonElement())
        }

        fun read(element: JsonElement): WidgetStateEntry {
            val row = element as? JsonObject ?: return WidgetStateEntry(null, Double.NaN)
            val at = (row["at"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull ?: Double.NaN
            return when (val v = row["v"]) {
                null, JsonNull -> WidgetStateEntry(null, at)
                is JsonPrimitive -> if (v.isString) WidgetStateEntry(v.content, at) else WidgetStateEntry(null, Double.NaN)
                else -> WidgetStateEntry(null, Double.NaN)
            }
        }
    }
}

typealias WidgetState = Map<String, WidgetStateEntry>

/** A widget for now, as the computer sends it (core/phone/payloads.ts PhoneWidget). [page] is the whole document with
 * the widget prelude but no seed; it is absent when the slot had no room for it, and the phone keeps the page it
 * already has for that version. Times are ISO dates. */
@Serializable
data class PhoneWidget(
    val id: String,
    val title: String,
    val blurb: String = "",
    val color: String = "#5c7f9e",
    val endsAt: String = "",
    val pinned: Boolean = false,
    val updatedAt: String = "",
    val version: Int = 1,
    val page: String? = null,
    val state: Map<String, WidgetStateEntry> = emptyMap(),
) {
    /** For now until its end, or for as long as it is pinned; after that it leaves the phone. */
    fun active(now: Instant): Boolean {
        if (pinned) return true
        val end = runCatching { Instant.parse(endsAt) }.getOrNull() ?: return true
        return now.isBefore(end)
    }
}

/** The `widgets` slot: the active widgets, newest first. */
@Serializable
data class WidgetsSnapshot(val v: Int = 1, val at: String = "", val widgets: List<PhoneWidget> = emptyList()) {
    companion object { val Empty = WidgetsSnapshot() }
}

/** A state cleaned as the computer cleans it (readWidgetState): valid keys and values within the limits, times
 * rounded to whole milliseconds; anything else is dropped. */
fun cleanWidgetState(state: Map<String, WidgetStateEntry>): WidgetState {
    val clean = LinkedHashMap<String, WidgetStateEntry>()
    var total = 0
    for ((key, entry) in state.entries.take(WidgetLimits.STATE_KEYS * 2)) {
        if (key.isEmpty() || key.length > WidgetLimits.STATE_KEY) continue
        if (!entry.at.isFinite() || entry.at < 0) continue
        val v = entry.v
        if (v != null && v.length > WidgetLimits.STATE_VALUE) continue
        total += key.length + (v?.length ?: 0)
        if (total > WidgetLimits.STATE_TOTAL || clean.size >= WidgetLimits.STATE_KEYS) break
        clean[key] = WidgetStateEntry(v, Math.round(entry.at).toDouble())
    }
    return clean
}

/** The values the page sees (removed keys left out). */
fun widgetValues(state: WidgetState): Map<String, String> =
    state.entries.mapNotNull { (key, entry) -> entry.v?.let { key to it } }.toMap(LinkedHashMap())

/** The page reported all of its storage: the entries that changed since [state], stamped [at]. A key the page no
 * longer has becomes `v = null`. */
fun widgetStateChanges(state: WidgetState, values: Map<String, String>, at: Double): WidgetState {
    val changes = LinkedHashMap<String, WidgetStateEntry>()
    for ((key, value) in values) if (state[key]?.v != value) changes[key] = WidgetStateEntry(value, at)
    for ((key, entry) in state) if (entry.v != null && key !in values) changes[key] = WidgetStateEntry(null, at)
    return cleanWidgetState(changes)
}

/** The changes a report from the page makes, stamped at [now]; when this phone's clock is behind the newest write they
 * replace, they are stamped just after it instead, so the other side's merge does not drop them (as the iPhone does). */
fun widgetEdit(state: WidgetState, values: Map<String, String>, now: Double): WidgetState {
    val changes = widgetStateChanges(state, values, now)
    val newest = changes.keys.mapNotNull { state[it]?.at }.maxOrNull() ?: return changes
    return if (newest >= now) widgetStateChanges(state, values, newest + 1) else changes
}

/** What [mergeWidgetState] made: the merged state and whether anything in it changed. */
data class WidgetMerge(val state: WidgetState, val changed: Boolean)

/** Merges the other side's entries key by key: the newer write wins; on a tie the stored value stays, and a removal
 * of a key this side never had is ignored. */
fun mergeWidgetState(state: WidgetState, incoming: Map<String, WidgetStateEntry>): WidgetMerge {
    val merged = LinkedHashMap(state)
    var changed = false
    for ((key, entry) in cleanWidgetState(incoming)) {
        val current = merged[key]
        if (current != null && current.at >= entry.at) continue
        if (current == null && entry.v == null) continue
        merged[key] = entry
        changed = true
    }
    return WidgetMerge(cleanWidgetState(merged), changed)
}

/** One report from a widget's page (core/widgets/widgets.ts readWidgetReport): all of its storage, where it is
 * scrolled, or a script error. */
data class WidgetReport(val state: Map<String, String>? = null, val scroll: Int? = null, val error: String? = null) {
    companion object {
        fun read(text: String): WidgetReport? {
            val row = runCatching { WorldletJson.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return null
            val state = row["state"]
            if (state is JsonObject) {
                val values = LinkedHashMap<String, String>()
                for ((key, value) in state.entries.take(WidgetLimits.STATE_KEYS)) {
                    if (value is JsonPrimitive && value.isString && key.length <= WidgetLimits.STATE_KEY && value.content.length <= WidgetLimits.STATE_VALUE) values[key] = value.content
                }
                return WidgetReport(state = values)
            }
            val scroll = (row["scroll"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
            if (scroll != null && scroll.isFinite()) return WidgetReport(scroll = Math.round(scroll.coerceIn(0.0, 1e6)).toInt())
            val error = (row["error"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (error != null) return WidgetReport(error = error.take(300))
            return null
        }
    }
}

/** What a page starts from (`WorldletAndroid.seed()`): its stored values and where it was scrolled. */
fun widgetSeed(values: Map<String, String>, scroll: Int): String = buildJsonObject {
    put("state", JsonObject(values.mapValues { JsonPrimitive(it.value) }))
    put("scroll", scroll)
}.toString()

/** Taken out of the page's window before its own code runs: WebRTC reaches the network past `blockNetworkLoads` and
 * the request filter (ICE, STUN and TURN are not loads), so its constructors are removed for good. */
const val WIDGET_NO_WEBRTC = "for(const k of[\"RTCPeerConnection\",\"webkitRTCPeerConnection\",\"RTCDataChannel\"]){try{delete window[k]}catch(e){}try{Object.defineProperty(window,k,{value:undefined,writable:false,configurable:false})}catch(e){}}"

/** The page as the phone loads it: [WIDGET_NO_WEBRTC] as its first script, just after a leading doctype (where the
 * computer puts the prelude, core/widgets/widgets.ts), so it runs before anything of the page's. */
fun widgetDocument(page: String): String {
    val script = "<script>$WIDGET_NO_WEBRTC</script>"
    val doctype = Regex("^\\s*<!doctype[^>]*>", RegexOption.IGNORE_CASE).find(page) ?: return script + page
    return doctype.value + script + page.substring(doctype.value.length)
}

/** How the end reads beside a widget's name (core/widgets/widgets.ts widgetUntil): "Pinned", "Until 6:00 PM",
 * "Until tomorrow 9:00 AM", "Until Oct 9". */
fun widgetUntil(widget: PhoneWidget, now: Instant, zone: ZoneId): String {
    if (widget.pinned) return "Pinned"
    val end = runCatching { Instant.parse(widget.endsAt) }.getOrNull()?.atZone(zone) ?: return ""
    val today = now.atZone(zone).toLocalDate()
    val time = end.format(DateTimeFormatter.ofPattern("h:mm a", Locale.US))
    return when (end.toLocalDate()) {
        today -> "Until $time"
        today.plusDays(1) -> "Until tomorrow $time"
        else -> "Until " + end.format(DateTimeFormatter.ofPattern("MMM d", Locale.US))
    }
}
