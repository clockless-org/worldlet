package app.worldlet.kit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Hold-to-talk hears the language the person speaks to Fox, not only the phone's (Kelvin, 2026-10-04: speech other
 * than English was misheard on the phone). The same cases as the iPhone's SpeechLanguageTests.swift. */
class SpeechLanguageTest {
    @Test
    fun scriptNamesTheLanguage() {
        assertEquals("zh", SpeechLanguage.languageOf("帮我打开日历"))
        assertEquals("zh", SpeechLanguage.languageOf("打开 Gmail 看看"))
        assertEquals("ja", SpeechLanguage.languageOf("カレンダーを開いて"))
        assertEquals("ja", SpeechLanguage.languageOf("日本語のテスト"))
        assertEquals("ko", SpeechLanguage.languageOf("달력 열어줘"))
        assertEquals("ru", SpeechLanguage.languageOf("Открой календарь"))
        assertNull(SpeechLanguage.languageOf("Open my calendar"))
    }

    @Test
    fun lastLineDecidesEvenOnAnEnglishPhone() {
        assertEquals("zh-CN", SpeechLanguage.tag("明天有什么安排", listOf("en-US")))
        assertEquals("zh-TW", SpeechLanguage.tag("明天有什么安排", listOf("en-US", "zh-Hant-TW")))
        assertEquals("ja-JP", SpeechLanguage.tag("カレンダー", listOf("en-US")))
    }

    @Test
    fun otherwiseThePhonesFirstLanguage() {
        assertEquals("zh-CN", SpeechLanguage.tag(null, listOf("zh-Hans-CN", "en-US")))
        assertEquals("es-MX", SpeechLanguage.tag("Open my calendar", listOf("es-MX", "en-US")))
        assertEquals("en-GB", SpeechLanguage.tag(null, listOf("en-GB")))
        assertEquals("en-US", SpeechLanguage.tag(null, emptyList()))
    }
}
