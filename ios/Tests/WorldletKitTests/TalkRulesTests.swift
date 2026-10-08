import XCTest
import WorldletKit

/// Talk with Fox's pause, quiet and barge-in rules, the same cases as the computer's (scripts/fox-talk-check.ts) and Android's
/// (kit TalkRulesTest).
final class TalkRulesTests: XCTestCase {
    func testQuietRequests() {
        for text in ["安静点", "be quiet", "闭嘴", "Fox 别说话了", "Shut up!", "安静一点吧。"] {
            XCTAssertTrue(TalkRules.quietRequest(text), text)
        }
        for text in ["what is quiet hours", "帮我安静地整理一下邮件", "", "please tell me a long story about being quiet"] {
            XCTAssertFalse(TalkRules.quietRequest(text), text)
        }
    }

    func testSpokenText() {
        XCTAssertEqual(TalkRules.spokenText("**Done**: see [the note](worldlet://x) <worldlet-action>x</worldlet-action>"), "Done: see the note")
    }

    func testPauseEndsAnUtteranceOnlyAfterWords() {
        let start = Date(timeIntervalSince1970: 1_000)
        var pause = TalkPause()
        XCTAssertFalse(pause.heard("", at: start))
        XCTAssertFalse(pause.heard("", at: start.addingTimeInterval(5)), "silence alone never ends it")
        XCTAssertFalse(pause.heard("明天", at: start.addingTimeInterval(5.2)))
        XCTAssertFalse(pause.heard("明天几点", at: start.addingTimeInterval(6)))
        XCTAssertFalse(pause.heard("明天几点", at: start.addingTimeInterval(7)), "a short pause keeps listening")
        XCTAssertTrue(pause.heard("明天几点", at: start.addingTimeInterval(6 + TalkRules.pause)))
    }

    func testInterruptionIgnoresFoxsOwnWords() {
        let reply = "Tomorrow you have two meetings. 明天十点开会"
        XCTAssertNil(TalkRules.interruption("", reply: reply))
        XCTAssertNil(TalkRules.interruption("tomorrow you have", reply: reply), "Fox's own echo")
        XCTAssertNil(TalkRules.interruption("tomorrow stop", reply: reply), "one word is not enough")
        XCTAssertEqual(TalkRules.interruption("tomorrow you wait stop", reply: reply), "wait stop")
        XCTAssertEqual(TalkRules.interruption("明天十点等一下", reply: reply), "等一下")
    }
}
