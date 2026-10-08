package app.worldlet.kit

/**
 * Which language hold-to-talk listens for. The recognizer hears one language at a time, and without a language it
 * used the phone's, so Mandarin on an English phone was heard as English. The rule matches the desktop's
 * (ui/companion/speech-language.ts) and the iPhone's (WorldletKit SpeechLanguage.swift): the last line the person
 * said or typed to Fox, when its script names a language; otherwise the phone's first preferred language.
 */
object SpeechLanguage {
    /** The language a line is written in, when its script says so; Latin text could be many languages, so null. */
    fun languageOf(text: String): String? {
        var found: String? = null
        var index = 0
        while (index < text.length) {
            val point = text.codePointAt(index)
            index += Character.charCount(point)
            when (point) {
                in 0x3040..0x30FF, in 0x31F0..0x31FF -> return "ja"
                in 0xAC00..0xD7AF, in 0x1100..0x11FF, in 0x3130..0x318F -> return "ko"
                in 0x4E00..0x9FFF, in 0x3400..0x4DBF, in 0xF900..0xFAFF, in 0x20000..0x2FA1F -> found = found ?: "zh"
                in 0x0400..0x04FF -> found = found ?: "ru"
                in 0x0600..0x06FF -> found = found ?: "ar"
                in 0x0E00..0x0E7F -> found = found ?: "th"
                in 0x0590..0x05FF -> found = found ?: "he"
                in 0x0900..0x097F -> found = found ?: "hi"
                in 0x0370..0x03FF -> found = found ?: "el"
            }
        }
        return found
    }

    /**
     * The recognizer's language tag (e.g. "zh-CN"), from [lastLine] (the person's latest line to Fox) and [preferred],
     * the phone's language tags, most preferred first (e.g. "en-US", "zh-Hans-CN").
     */
    fun tag(lastLine: String?, preferred: List<String>): String {
        val wanted = lastLine?.let(::languageOf) ?: preferred.firstOrNull()?.let { parts(it).first } ?: "en"
        preferred.map(::parts).firstOrNull { it.first == wanted && it.second != null }?.let { return "${it.first}-${it.second}" }
        return defaults[wanted] ?: wanted
    }

    private val defaults = mapOf("zh" to "zh-CN", "ja" to "ja-JP", "ko" to "ko-KR", "ru" to "ru-RU", "ar" to "ar-SA",
        "th" to "th-TH", "he" to "he-IL", "hi" to "hi-IN", "el" to "el-GR", "en" to "en-US")

    /** "zh-Hans-CN" → ("zh", "CN"); "en" → ("en", null). */
    private fun parts(tag: String): Pair<String, String?> {
        val pieces = tag.replace('_', '-').split('-')
        val region = pieces.drop(1).firstOrNull { (it.length == 2 && it.all(Char::isLetter)) || (it.length == 3 && it.all(Char::isDigit)) }
        return pieces.first().lowercase() to region?.uppercase()
    }
}
