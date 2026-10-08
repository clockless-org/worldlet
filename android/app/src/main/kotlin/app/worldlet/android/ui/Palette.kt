package app.worldlet.android.ui

import android.content.Context
import android.text.format.DateUtils
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import app.worldlet.kit.AttentionGroup
import app.worldlet.kit.AttentionItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Colors from the built-in cozy-miniature style (resources/styles/builtin/tokens.json and UI.md), the same values the
 * computer's world and the iPhone app use, so the phone reads as the same Worldlet. */
object Palette {
    val paper = Color(0xFFF4F0E5)
    val forest = Color(0xFF354132)
    val leaf = Color(0xFF5D6B4A)
    val lantern = Color(0xFFD9B75A)
    val world = Color(0xFF1E2A22)

    /** Text over the world (--ui-matter-ink, --ui-matter-muted) and its soft shadow. */
    val ink = Color(0xFFFFF9E9)
    val muted = Color(0xFFF4EEDC)
    val inkShadow = Color(0x80253326)

    /** Text on the paper card (--hud-paper-ink) and its quieter footer. */
    val paperInk = Color(0xFF304F40)
    val paperFoot = Color(0xFF617065)

    /** The Center's three kinds over the world (--ui-hud-event, --ui-hud-task, --ui-hud-update):
     * Coming Up blue, Worth Doing yellow, Worth Knowing green. */
    fun group(group: AttentionGroup) = when (group) {
        AttentionGroup.Event -> Color(0xFFA5D4DC)
        AttentionGroup.NeedsAction -> Color(0xFFEDC47D)
        AttentionGroup.Unseen -> Color(0xFFB1D3AB)
    }

    /** The same kinds on the paper card, darker so they read on paper (ui/attention/attention-preview.css). */
    fun accent(group: AttentionGroup) = when (group) {
        AttentionGroup.Event -> Color(0xFF28718A)
        AttentionGroup.NeedsAction -> Color(0xFF946E2B)
        AttentionGroup.Unseen -> Color(0xFF557955)
    }
}

fun AttentionItem.startInstant(): Instant? = start?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** The row's time line. An event's start is recomputed here, so "Starts in 40 min" stays true while the row sits on
 * the phone; otherwise the computer's own line (Due, Found, Back …) is shown as it wrote it. */
fun AttentionItem.timeLine(context: Context): String? {
    val start = startInstant()
    val zone = ZoneId.systemDefault()
    fun clock(at: Instant): String {
        val local = at.atZone(zone)
        return if (local.toLocalDate() == LocalDate.now(zone)) local.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
        else DateUtils.formatDateTime(context, at.toEpochMilli(), DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_ABBREV_MONTH or DateUtils.FORMAT_NO_YEAR)
    }
    if (start != null && group == AttentionGroup.Event && !snoozed) {
        val now = System.currentTimeMillis()
        val relative = DateUtils.getRelativeTimeSpanString(start.toEpochMilli(), now, DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE).toString().replaceFirstChar { it.lowercase() }
        return (if (start.toEpochMilli() > now) "Starts " else "Started ") + relative + " · " + clock(start)
    }
    if (!fact.isNullOrEmpty()) return fact
    if (start != null) return clock(start)
    return `when`.ifEmpty { null }
}

/** Fox writes Markdown; inline bold, italics, code and links render, block syntax stays as plain lines. */
fun markdown(text: String, strong: Color? = null): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val rest = text.substring(i)
        fun span(open: String, close: String, style: SpanStyle): Boolean {
            if (!rest.startsWith(open)) return false
            val end = rest.indexOf(close, open.length)
            if (end <= open.length) return false
            withStyle(style) { append(rest.substring(open.length, end)) }
            i += end + close.length
            return true
        }
        val link = Regex("^\\[([^\\]]+)]\\(([^)\\s]+)\\)").find(rest)
        when {
            span("**", "**", SpanStyle(fontWeight = FontWeight.Bold, color = strong ?: Color.Unspecified)) -> {}
            span("`", "`", SpanStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)) -> {}
            (rest.startsWith("*") || rest.startsWith("_")) && span(rest.take(1), rest.take(1), SpanStyle(fontStyle = FontStyle.Italic)) -> {}
            link != null -> {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(link.groupValues[1]) }
                i += link.value.length
            }
            else -> { append(text[i]); i++ }
        }
    }
}
