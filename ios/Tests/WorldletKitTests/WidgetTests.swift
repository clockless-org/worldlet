import Foundation
import XCTest
import WorldletKit

/// Widgets on the phone (core/artifacts/README.md): the slot decodes, edits merge key by key the way
/// core/artifacts/widgets.ts merges them, and the `widget` message keeps a removal as an explicit null.
final class WidgetTests: XCTestCase {
    private let slot = #"""
    {"v":1,"at":"2026-10-04T17:00:00.000Z","widgets":[
     {"id":"wgt-abcdefghjk","title":"Getty Center","blurb":"Pavilions and timed stops","color":"#5c7f9e",
      "endsAt":"2026-10-05T01:00:00.000Z","pinned":false,"updatedAt":"2026-10-04T16:00:00.000Z","version":2,
      "page":"<!doctype html><p>Hi</p>","state":{"tram":{"v":"1","at":1700000000000},"gone":{"v":null,"at":1700000000500}}},
     {"id":"wgt-mnpqrstuvw","title":"Packing list","blurb":"","color":"#946e2b","endsAt":"2026-10-06T01:00:00Z",
      "pinned":true,"updatedAt":"2026-10-04T15:00:00.000Z","version":1,"state":{}}]}
    """#

    func testSnapshotDecodes() throws {
        let snapshot = try JSONDecoder().decode(WidgetsSnapshot.self, from: Data(slot.utf8))
        XCTAssertEqual(snapshot.widgets.map(\.id), ["wgt-abcdefghjk", "wgt-mnpqrstuvw"])
        let getty = snapshot.widgets[0]
        XCTAssertEqual(getty.page, "<!doctype html><p>Hi</p>")
        XCTAssertEqual(getty.state["tram"], WidgetStateEntry(v: "1", at: 1_700_000_000_000))
        XCTAssertEqual(getty.state["gone"], WidgetStateEntry(v: nil, at: 1_700_000_000_500), "a removed key decodes with v nil")
        XCTAssertEqual(widgetValues(getty.state), ["tram": "1"])
        XCTAssertEqual(getty.endDate, ISO8601DateFormatter().date(from: "2026-10-05T01:00:00Z"))
        XCTAssertNil(snapshot.widgets[1].page, "a page left out of the slot is nil")
        XCTAssertEqual(snapshot.widgets[1].endDate, ISO8601DateFormatter().date(from: "2026-10-06T01:00:00Z"))
        let before = ISO8601DateFormatter().date(from: "2026-10-04T20:00:00Z")!
        let after = ISO8601DateFormatter().date(from: "2026-10-07T00:00:00Z")!
        XCTAssertTrue(getty.isActive(at: before))
        XCTAssertFalse(getty.isActive(at: after), "it is put away at its end")
        XCTAssertTrue(snapshot.widgets[1].isActive(at: after), "a pinned widget stays")
        // What the app keeps on the device reads back the same.
        let again = try JSONDecoder().decode(WidgetsSnapshot.self, from: JSONEncoder().encode(snapshot))
        XCTAssertEqual(again, snapshot)
    }

    func testMergeNewestWins() {
        let local: WidgetState = [
            "a": WidgetStateEntry(v: "phone", at: 200),
            "b": WidgetStateEntry(v: "phone", at: 100),
            "c": WidgetStateEntry(v: "same", at: 100),
        ]
        let incoming: WidgetState = [
            "a": WidgetStateEntry(v: "computer", at: 150),
            "b": WidgetStateEntry(v: "computer", at: 300),
            "c": WidgetStateEntry(v: "tie", at: 100),
            "d": WidgetStateEntry(v: nil, at: 500),
            "e": WidgetStateEntry(v: "new", at: 50),
        ]
        let merged = mergeWidgetState(local, incoming)
        XCTAssertTrue(merged.changed)
        XCTAssertEqual(merged.state["a"]?.v, "phone", "the phone's newer edit stays")
        XCTAssertEqual(merged.state["b"], WidgetStateEntry(v: "computer", at: 300), "the computer's newer edit wins")
        XCTAssertEqual(merged.state["c"]?.v, "same", "a tie keeps what this side has")
        XCTAssertNil(merged.state["d"], "removing a key this side never had is ignored")
        XCTAssertEqual(merged.state["e"]?.v, "new")
        // A newer removal wins and is kept as a removal, so an older value cannot come back.
        let removed = mergeWidgetState(merged.state, ["b": WidgetStateEntry(v: nil, at: 400)])
        XCTAssertEqual(removed.state["b"], WidgetStateEntry(v: nil, at: 400))
        XCTAssertNil(widgetValues(removed.state)["b"])
        XCTAssertFalse(mergeWidgetState(removed.state, ["b": WidgetStateEntry(v: "old", at: 350)]).changed)
        XCTAssertFalse(mergeWidgetState(local, local).changed, "merging the same entries again changes nothing")
    }

    func testMergeDropsInvalidEntries() {
        let long = String(repeating: "x", count: WidgetLimits.stateValue + 1)
        let merged = mergeWidgetState([:], [
            "": WidgetStateEntry(v: "1", at: 1),
            "big": WidgetStateEntry(v: long, at: 1),
            "neg": WidgetStateEntry(v: "1", at: -1),
            "ok": WidgetStateEntry(v: "1", at: 1.4),
        ])
        XCTAssertEqual(merged.state, ["ok": WidgetStateEntry(v: "1", at: 1)])
    }

    func testStateChanges() {
        let state: WidgetState = [
            "kept": WidgetStateEntry(v: "1", at: 10),
            "edited": WidgetStateEntry(v: "1", at: 10),
            "dropped": WidgetStateEntry(v: "1", at: 10),
            "gone": WidgetStateEntry(v: nil, at: 10),
        ]
        let changes = widgetStateChanges(state, values: ["kept": "1", "edited": "2", "added": "x", "gone": "back"], at: 99)
        XCTAssertEqual(changes, [
            "edited": WidgetStateEntry(v: "2", at: 99),
            "added": WidgetStateEntry(v: "x", at: 99),
            "gone": WidgetStateEntry(v: "back", at: 99),
            "dropped": WidgetStateEntry(v: nil, at: 99),
        ])
        XCTAssertEqual(widgetStateChanges(state, values: ["kept": "1", "edited": "1", "dropped": "1"], at: 99), [:])
    }

    func testWidgetMessageEncodesNull() throws {
        let message = PhoneMessage.widget(id: "m1", widget: "wgt-abcdefghjk", state: [
            "tram": WidgetStateEntry(v: "1", at: 1_700_000_000_123),
            "gone": WidgetStateEntry(v: nil, at: 1_700_000_000_124),
        ])
        let data = try JSONEncoder().encode(message)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["type"] as? String, "widget")
        XCTAssertEqual(json["id"] as? String, "m1")
        XCTAssertEqual(json["widget"] as? String, "wgt-abcdefghjk")
        let state = try XCTUnwrap(json["state"] as? [String: Any])
        let tram = try XCTUnwrap(state["tram"] as? [String: Any])
        XCTAssertEqual(tram["v"] as? String, "1")
        let gone = try XCTUnwrap(state["gone"] as? [String: Any])
        XCTAssertTrue(gone.keys.contains("v"), "a removal keeps its v")
        XCTAssertTrue(gone["v"] is NSNull, "as an explicit null")
        let text = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(text.contains("\"at\":1700000000123"), "whole milliseconds encode as an integer: \(text)")
        struct Sent: Decodable { let type: String; let widget: String; let state: [String: WidgetStateEntry] }
        let sent = try JSONDecoder().decode(Sent.self, from: data)
        XCTAssertEqual(sent.state["tram"], WidgetStateEntry(v: "1", at: 1_700_000_000_123))
        XCTAssertEqual(sent.state["gone"], WidgetStateEntry(v: nil, at: 1_700_000_000_124))
    }

    func testSyncDecodesWidgetsSlot() async throws {
        let link = PairLink(secret: Data(0..<32), name: "Mac")
        let keys = PairKeys(secret: link.secret)
        let snapshot = try JSONDecoder().decode(WidgetsSnapshot.self, from: Data(slot.utf8))
        let box = try keys.seal(snapshot, place: PairKeys.place(slot: "widgets"))
        let relay = FakeRelay()
        relay.answers = [(200, #"{"version":3,"role":"phone","peer":null,"slots":[{"name":"widgets","version":3,"box":"\#(box)"}],"messages":[]}"#)]
        let update = try await PhoneSession(link: link, transport: relay).sync()
        XCTAssertEqual(update.widgets, snapshot)
    }
}
