package app.worldlet.kit

/**
 * Talk with Fox (owner parity plan item 7): a spoken conversation in the Fox dock. The rules match the computer's
 * (core/companion/fox-talk.ts) and the iPhone's (WorldletKit TalkRules.swift): an utterance ends when the recognizer's
 * words stop changing for [PAUSE_MILLIS], a short "be quiet" (安静点, 别说话, shut up…) keeps Talk going without reading
 * replies aloud, the voice reads the reply without Markdown marks or link targets, and words of the person's own heard
 * while Fox speaks interrupt it ([interruption]).
 */
object TalkRules {
    /** How long the words must stay the same before the utterance is sent (the recognizer's partials arrive late). */
    const val PAUSE_MILLIS = 1_200L

    private val separators = Regex("[\\s,，.。!！~～]+")
    private val dont = Regex("^(fox|小狐狸)?(你)?(先)?(别|不要|不用)(再)?(说话|打扰我?|吵|插嘴|主动说话?)(了|啦|吧)?$")
    private val hush = Regex("^(fox|小狐狸)?(安静|闭嘴|少说)(点|一点|一下|些|两句)?(吧|啦)?$")
    private val english = Regex("^(please )?(shut up|be quiet|quiet|stop talking|stop interrupting|leave me alone)( please)?$")

    /** A short request to stop talking; a longer message is a conversation, not a mute (core/companion/fox-proactive.ts). */
    fun quietRequest(text: String): Boolean {
        val value = text.lowercase().replace(separators, " ").trim()
        if (value.isEmpty() || value.codePointCount(0, value.length) > 24) return false
        val joined = value.replace(" ", "")
        return dont.matches(joined) || hush.matches(joined) || english.matches(value)
    }

    private val word = Regex("\\p{IsHan}|[\\p{L}\\p{N}'&&[^\\p{IsHan}]]+")

    /**
     * Barge-in: what the recognizer heard while Fox spoke, from the first word that is not Fox's own (an echo the
     * phone's echo cancellation let through); null until at least two words, or two CJK characters, are the person's.
     */
    fun interruption(heard: String, reply: String): String? {
        val own = word.findAll(reply).map { it.value.lowercase() }.toSet()
        val said = word.findAll(heard).toList()
        val first = said.indexOfFirst { it.value.lowercase() !in own }
        if (first < 0 || said.drop(first).count { it.value.lowercase() !in own } < 2) return null
        return heard.substring(said[first].range.first).trim()
    }

    /** What the voice reads: the reply without Worldlet's markup, link targets or Markdown marks. */
    fun spokenText(text: String): String = text
        .replace(Regex("<worldlet[^>]*>[\\s\\S]*?</worldlet[^>]*>"), "")
        .replace(Regex("\\[([^\\]]+)\\]\\([^)]+\\)"), "$1")
        .replace(Regex("[`#*_]"), "")
        .trim()
}

/** Follows the recognizer's words during one utterance and says when the person stopped. */
class TalkPause {
    private var words = ""
    private var changedAt: Long? = null

    /** The words heard so far at [now] (milliseconds); true once there are words that have not changed for the pause. */
    fun heard(transcript: String, now: Long): Boolean {
        val text = transcript.trim()
        val since = changedAt
        if (text != words || since == null) {
            words = text
            changedAt = now
            return false
        }
        return words.isNotEmpty() && now - since >= TalkRules.PAUSE_MILLIS
    }
}
