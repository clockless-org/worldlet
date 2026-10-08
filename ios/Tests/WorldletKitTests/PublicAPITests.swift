import Foundation
import XCTest
import WorldletKit

/// The app target sees WorldletKit only through its public API (no @testable): every value the app builds itself
/// (demo data, a pending chat line, a row moved to Later) must have a public initializer.
final class PublicAPITests: XCTestCase {
    func testAppCanBuildModels() {
        let item = AttentionItem(id: "a", ids: ["a"], group: .needsAction, title: "Mail", action: "Reply to Sam",
                                 context: "", start: nil, when: "", level: 3, snoozed: false)
        let snapshot = AttentionSnapshot(v: 1, at: "", now: [item], later: [])
        XCTAssertEqual(snapshot.nowGroups.first?.items, [item])
        let conversation = Conversation(v: 1, at: "", busy: false, name: "Fox",
                                        messages: [Turn(id: "1", role: .fox, text: "Hi", at: "")])
        XCTAssertEqual(conversation.messages.first?.role, .fox)
        XCTAssertEqual(PhoneInfo(name: "iPhone", version: "1.0").v, 1)
        XCTAssertEqual(PhoneMessage.chat(id: "1", text: "Hi"), .chat(id: "1", text: "Hi"))
        let mail = AccountIssue(provider: "gmail", title: "Mail", action: .reconnect)
        XCTAssertEqual(AttentionSnapshot(at: "", now: [], later: [], accounts: [mail]).accounts, [mail])
    }

    func testAccountsDecodeAndConnectEncodes() throws {
        let old = try JSONDecoder().decode(AttentionSnapshot.self, from: Data(#"{"v":1,"at":"","now":[],"later":[]}"#.utf8))
        XCTAssertNil(old.accounts, "a computer without accounts still decodes")
        let new = try JSONDecoder().decode(AttentionSnapshot.self, from: Data(#"{"v":1,"at":"","now":[],"later":[],"accounts":[{"provider":"gmail","title":"Mail","action":"permissions"}]}"#.utf8))
        XCTAssertEqual(new.accounts?.first?.action, .permissions)
        let sent = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.connect(id: "k", provider: "gmail"))) as? [String: String]
        XCTAssertEqual(sent, ["type": "connect", "id": "k", "provider": "gmail"])
    }

    func testDesktopOrderIsOptionalAndOrderEncodes() throws {
        let old = try JSONDecoder().decode(DesktopInfo.self, from: Data(#"{"v":1,"at":"","name":"Studio","version":"1.0"}"#.utf8))
        XCTAssertNil(old.order, "a computer that takes no Orders leaves it out")
        let new = try JSONDecoder().decode(DesktopInfo.self, from: Data(#"{"v":1,"at":"","name":"Studio","version":"1.0","order":true}"#.utf8))
        XCTAssertEqual(new.order, true)
        let sent = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.order(id: "r", said: "Fix it"))) as? [String: String]
        XCTAssertEqual(sent, ["type": "order", "id": "r", "said": "Fix it"])
    }

    func testItemDialogueDecodesAndItemLinesEncode() throws {
        let row = #"{"id":"a","ids":["a"],"group":"needsAction","title":"Mail","action":"Reply","context":"","start":null,"when":"","level":2,"snoozed":false,"fox":{"say":"Want me to help with the next step?","option":"Help me do it","turns":[{"user":"Draft it","text":"Reading the thread","working":true,"at":""}]}}"#
        let item = try JSONDecoder().decode(AttentionItem.self, from: Data(row.utf8))
        XCTAssertEqual(item.fox?.option, "Help me do it")
        XCTAssertEqual(item.fox?.turns.first?.working, true)
        let ask = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.ask(id: "1", text: "Hi", item: "a"))) as? [String: String]
        XCTAssertEqual(ask, ["type": "chat", "id": "1", "text": "Hi", "item": "a"])
        let option = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.option(id: "2", item: "a"))) as? [String: String]
        XCTAssertEqual(option, ["type": "option", "id": "2", "item": "a"])
    }

    /// A website opened in the app's browser: the observer's reports go to the computer in messages that fit a box.
    func testWebReportsBatchAndEncode() throws {
        let at = Date(timeIntervalSince1970: 1_791_090_000)
        XCTAssertNil(WebReport.read(#"{"kind":"text","url":"http://x.com/","text":"a"}"#, at: at), "only https pages")
        XCTAssertNil(WebReport.read(#"{"kind":"shell","url":"https://x.com/"}"#, at: at))
        XCTAssertNil(WebReport.read("not json", at: at))
        let page = try XCTUnwrap(WebReport.read(#"{"kind":"page","url":"https://m.youtube.com/","title":"YouTube"}"#, at: at))
        XCTAssertEqual(page.at, 1_791_090_000)
        let long = try XCTUnwrap(WebReport.read(#"{"kind":"text","url":"https://x.com/","text":""# + String(repeating: "字", count: 50_000) + #""}"#, at: at))
        XCTAssertLessThanOrEqual(long.text!.utf8.count, WebReport.textLimit, "a page's text fits one box")
        var buffer = WebReportBuffer(applet: "youtube")
        buffer.add(page)
        for _ in 0..<3 { buffer.add(long) }
        var n = 0
        let messages = buffer.take(id: { n += 1; return "w\(n)" })
        XCTAssertEqual(messages.count, 3, "about 120 KB each")
        XCTAssertTrue(buffer.pending.isEmpty)
        let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(messages[0])) as? [String: Any])
        XCTAssertEqual(sent["type"] as? String, "web")
        XCTAssertEqual(sent["applet"] as? String, "youtube")
        XCTAssertEqual((sent["records"] as? [[String: Any]])?.first?["kind"] as? String, "page")
    }

    func testCardFieldsAreOptional() throws {
        let row = #"{"id":"a","ids":["a"],"group":"event","title":"Calendar","action":"Dentist","context":"","start":null,"when":"","level":2,"snoozed":false"#
        let old = try JSONDecoder().decode(AttentionItem.self, from: Data((row + "}").utf8))
        XCTAssertNil(old.summary, "a computer without the card fields still decodes")
        let new = try JSONDecoder().decode(AttentionItem.self, from: Data((row + #","fact":"Starts in 2 hr.","summary":"Bring **the form**.","source":"google-calendar","art":"scene-dentist"}"#).utf8))
        XCTAssertEqual([new.fact, new.summary, new.source, new.art], ["Starts in 2 hr.", "Bring **the form**.", "google-calendar", "scene-dentist"])
    }

    func testLiveTurnDecodes() throws {
        let main = try JSONDecoder().decode(LiveTurn.self, from: Data(#"{"v":1,"at":"","id":"turn:1","user":"Hi","steps":["Reading your mail"],"text":"You have","done":false}"#.utf8))
        XCTAssertNil(main.item, "a main-conversation turn has no item")
        XCTAssertEqual(main, LiveTurn(at: "", id: "turn:1", user: "Hi", steps: ["Reading your mail"], text: "You have", done: false))
        let item = try JSONDecoder().decode(LiveTurn.self, from: Data(#"{"v":1,"at":"","id":"turn:2","item":"a","user":"","steps":[],"text":"Done.","done":true}"#.utf8))
        XCTAssertEqual(item.item, "a")
        XCTAssertNil(main.approval, "a computer older than approvals sends none")
    }

    func testApprovalRidesOnTheLiveTurnAndIsAnswered() throws {
        let json = #"{"v":1,"at":"2026-10-08T05:00:00.000Z","id":"turn:3","user":"Clean up","steps":[],"text":"","done":false,"approval":{"id":"acp-1","title":"Hermes Agent asks: Run rm -rf build","detail":"rm -rf build","choices":["always","sudo","once"]}}"#
        let live = try JSONDecoder().decode(LiveTurn.self, from: Data(json.utf8))
        let approval = try XCTUnwrap(live.asking())
        XCTAssertEqual(approval, HarnessApproval(id: "acp-1", title: "Hermes Agent asks: Run rm -rf build", detail: "rm -rf build", choices: [.once, .always, .deny]))
        XCTAssertEqual(approval.choices.map(\.label), ["Allow once", "Always", "Deny"], "the computer's order, an unknown choice left out, Deny always")
        XCTAssertNil(live.asking(answered: ["acp-1"]), "answered on this phone: the card shows the settled line")
        XCTAssertEqual(HarnessApproval.Choice.always.settled, "Allowed. It will not ask again for this.")
        let finished = LiveTurn(at: "", id: "turn:3", user: "", steps: [], text: "Done", done: true, approval: approval)
        XCTAssertNil(finished.asking(), "a finished turn asks nothing")
        let sent = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(live.shown(sent: sent, now: sent.addingTimeInterval(300)), "waiting on the person, it stays")
        XCTAssertFalse(LiveTurn(at: "", id: "t", user: "", steps: [], text: "", done: false).shown(sent: sent, now: sent.addingTimeInterval(300)), "a quiet running turn gives way")
        XCTAssertFalse(live.shown(sent: sent, now: sent.addingTimeInterval(700)))
        let answer = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.approval(id: "m1", approval: "acp-1", choice: .always))) as? [String: String]
        XCTAssertEqual(answer, ["type": "approval", "id": "m1", "approval": "acp-1", "choice": "always"])
    }

    func testAppletWorldDecodesAndAppletLinesEncode() throws {
        let json = #"{"v":1,"at":"","now":[{"id":"a","ids":["a"],"group":"needsAction","title":"Mail","action":"Reply","context":"","start":null,"when":"","level":2,"snoozed":false,"source":"gmail","applet":"gmail"}],"later":[],"applets":[{"key":"gmail","title":"Mail","section":"live","state":"busy","line":"Reading Mail…","recent":[{"text":"Read 3 emails","at":"2026-10-04T05:00:00.000Z"}],"fox":{"say":"","option":"","turns":[{"user":"Any news?","text":"Two replies.","working":false,"at":""}]}},{"key":"widget:wgt-abcdefghij","title":"Getty","section":"live","state":"ready","widget":"wgt-abcdefghij"},{"key":"x","title":"X","section":"garden","state":"glowing"},{"key":"youtube","title":"YouTube","section":"places","state":"ready","url":"https://www.youtube.com/"},{"key":"bad","title":"Bad","section":"places","state":"ready","url":"javascript:alert(1)"}]}"#
        let snapshot = try JSONDecoder().decode(AttentionSnapshot.self, from: Data(json.utf8))
        let mail = try XCTUnwrap(snapshot.applet(snapshot.now.first?.applet))
        XCTAssertEqual([mail.title, mail.line], ["Mail", "Reading Mail…"])
        XCTAssertEqual(mail.state, .busy)
        XCTAssertEqual(snapshot.items(of: mail).map(\.id), ["a"])
        XCTAssertEqual(mail.fox?.turns.first?.text, "Two replies.")
        XCTAssertEqual(snapshot.applets?[1].widget, "wgt-abcdefghij")
        XCTAssertEqual(snapshot.applets?[2].section, .places, "a section from a newer computer reads as In your World")
        XCTAssertEqual(snapshot.applets?[2].state, .off)
        XCTAssertNil(snapshot.applets?[0].url, "a computer older than urls sends none")
        XCTAssertEqual(snapshot.applets?[3].url?.absoluteString, "https://www.youtube.com/", "a tile opens its website")
        XCTAssertNil(snapshot.applets?[4].url, "only an https address opens")
        XCTAssertNil(try JSONDecoder().decode(AttentionSnapshot.self, from: Data(#"{"v":1,"at":"","now":[],"later":[]}"#.utf8)).applets)
        let tell = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.tell(id: "1", text: "Hi", applet: "gmail"))) as? [String: String]
        XCTAssertEqual(tell, ["type": "chat", "id": "1", "text": "Hi", "applet": "gmail"])
        let open = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PhoneMessage.openApplet(id: "2", applet: "gmail"))) as? [String: String]
        XCTAssertEqual(open, ["type": "applet", "id": "2", "applet": "gmail", "action": "open"])
        let live = try JSONDecoder().decode(LiveTurn.self, from: Data(#"{"v":1,"at":"","id":"t","applet":"gmail","user":"Hi","steps":[],"text":"","done":false}"#.utf8))
        XCTAssertEqual(live.applet, "gmail")
    }
}
