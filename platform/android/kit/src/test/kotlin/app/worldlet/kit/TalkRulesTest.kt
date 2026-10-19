package app.worldlet.kit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Talk with Fox's pause, quiet and barge-in rules, the same cases as the computer's (scripts/fox-talk-check.ts) and the
 * iPhone's (TalkRulesTests.swift). */
class TalkRulesTest {
    @Test
    fun quietRequests() {
        for (text in listOf("安静点", "be quiet", "闭嘴", "Fox 别说话了", "Shut up!", "安静一点吧。")) assertTrue(TalkRules.quietRequest(text), text)
        for (text in listOf("what is quiet hours", "帮我安静地整理一下邮件", "", "please tell me a long story about being quiet")) assertFalse(TalkRules.quietRequest(text), text)
    }

    @Test
    fun spokenText() {
        assertEquals("Done: see the note", TalkRules.spokenText("**Done**: see [the note](worldlet://x) <worldlet-action>x</worldlet-action>"))
    }

    @Test
    fun pauseEndsAnUtteranceOnlyAfterWords() {
        val pause = TalkPause()
        assertFalse(pause.heard("", 0))
        assertFalse(pause.heard("", 5_000), "silence alone never ends it")
        assertFalse(pause.heard("明天", 5_200))
        assertFalse(pause.heard("明天几点", 6_000))
        assertFalse(pause.heard("明天几点", 7_000), "a short pause keeps listening")
        assertTrue(pause.heard("明天几点", 6_000 + TalkRules.PAUSE_MILLIS))
    }

    @Test
    fun interruptionIgnoresFoxsOwnWords() {
        val reply = "Tomorrow you have two meetings. 明天十点开会"
        assertEquals(null, TalkRules.interruption("", reply))
        assertEquals(null, TalkRules.interruption("tomorrow you have", reply), "Fox's own echo")
        assertEquals(null, TalkRules.interruption("tomorrow stop", reply), "one word is not enough")
        assertEquals("wait stop", TalkRules.interruption("tomorrow you wait stop", reply))
        assertEquals("等一下", TalkRules.interruption("明天十点等一下", reply))
    }
}
