import Foundation
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import WorldletKit

final class PairingTests: XCTestCase {
    let secret = Data(0..<32)

    /// The same vector as scripts/phone-pairing-check.ts: both sides must derive identical ids, tokens and keys.
    func testDerivationMatchesDesktop() {
        let keys = PairKeys(secret: secret)
        XCTAssertEqual(keys.id, "5gImJiJSofcAENRFNwk-eA")
        XCTAssertEqual(keys.desktopToken, "ExL6gIXW76sr5OnyNNudNIVl5ItyYXrGmzcD2mv4-ZY")
        XCTAssertEqual(keys.phoneToken, "AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I")
    }

    func testLinkParsing() throws {
        let link = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Kelvin%E2%80%99s+Mac")
        XCTAssertEqual(link.secret, secret)
        XCTAssertEqual(link.relay, URL(string: "https://worldlet.ai")!)
        XCTAssertEqual(link.name, "Kelvin’s Mac")
        let local = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=x&r=http%3A%2F%2F127.0.0.1%3A8787")
        XCTAssertEqual(local.relay.absoluteString, "http://127.0.0.1:8787")
        XCTAssertThrowsError(try PairLink(parsing: "https://worldlet.ai")) { XCTAssertEqual($0 as? PairingError, .notWorldlet) }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=2&s=AAEC")) { XCTAssertEqual($0 as? PairingError, .needsUpdate) }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=1&s=AAEC")) { XCTAssertEqual($0 as? PairingError, .incomplete) }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&r=http%3A%2F%2Fevil.example")) {
            XCTAssertEqual($0 as? PairingError, .unknownRelay)
        }
    }

    /// A box the desktop sealed (WebCrypto, core/phone/pairing.ts) opens here, and only in its own place.
    func testOpensDesktopBox() throws {
        let keys = PairKeys(secret: secret)
        let box = "KvY1jbTWsmixcULkEw9_MqP93SnK3epd-wIVvqzLF2VCnWuLZrDxqr01u0VOxXgWXSnRdVcGvt-5HyPO5EBaWbuADs5AXD7CKqoG2hYWmX78EqC8gjALgz6uEGmLN9njJ9LF5tOxgRPmF6uj5DroQlggl86hpGmVWdn28in7DqQnIZfI87A02GUSe7ZWeMHfZ35XS23COXHILSLli7fB7W0T0O8QVZQEKjRCzwg_EAZbdJS-VDJ3M54CxKKzW4LCgkhH6ywdYczpLYBJejlhjhVSlTK9sAo-Nm4XGtrI46wXPXywqinFEmxqFdSVmjxKOkjtapkgZvxZzJnloVUNTik4Jv2P3Cay6UKSovPNReVKB2imwypZTnp-WlwI4Dxe"
        let snapshot = try keys.open(AttentionSnapshot.self, box: box, place: PairKeys.place(slot: "attention"))
        XCTAssertEqual(snapshot.now.count, 1)
        let item = snapshot.now[0]
        XCTAssertEqual(item.id, "item-1")
        XCTAssertEqual(item.group, .event)
        XCTAssertEqual(item.headline, "Join planning")
        XCTAssertEqual(item.when, "9:30 AM · in 47m")
        XCTAssertEqual(item.startDate, ISO8601DateFormatter().date(from: "2026-10-03T16:30:00Z"))
        XCTAssertEqual(snapshot.nowGroups.map(\.group), [.event])
        XCTAssertThrowsError(try keys.open(AttentionSnapshot.self, box: box, place: PairKeys.place(slot: "conversation")))
        XCTAssertThrowsError(try PairKeys(secret: Data(repeating: 9, count: 32)).open(AttentionSnapshot.self, box: box, place: PairKeys.place(slot: "attention")))
    }

    func testSealRoundTripAndMessageShape() throws {
        let keys = PairKeys(secret: secret)
        let box = try keys.seal(PhoneMessage.attention(id: "item-1", action: .later), place: PairKeys.place(to: "desktop"))
        struct Raw: Decodable { let type: String; let id: String; let action: String }
        let raw = try keys.open(Raw.self, box: box, place: PairKeys.place(to: "desktop"))
        XCTAssertEqual([raw.type, raw.id, raw.action], ["attention", "item-1", "later"])
        let json = String(decoding: try JSONEncoder().encode(PhoneMessage.chat(id: "c1", text: "Hi")), as: UTF8.self)
        XCTAssertTrue(json.contains("\"type\":\"chat\"") && json.contains("\"text\":\"Hi\""))
    }
}

/// A relay that answers like worker/pairing.ts for one pairing, enough to drive the session's cursor and errors.
final class FakeRelay: RelayTransport, @unchecked Sendable {
    var requests: [URLRequest] = []
    var answers: [(Int, String)] = []
    func send(_ request: URLRequest) async throws -> (Data, Int) {
        requests.append(request)
        let (status, body) = answers.isEmpty ? (200, "{}") : answers.removeFirst()
        return (Data(body.utf8), status)
    }
}

final class SessionTests: XCTestCase {
    func testSyncAdvancesCursorAndEnds() async throws {
        let link = PairLink(secret: Data(0..<32), name: "Mac")
        let keys = PairKeys(secret: link.secret)
        let conversation = Conversation(v: 1, at: "", busy: true, name: "Fox", messages: [Turn(id: "t", role: .fox, text: "Hello", at: "")])
        let box = try keys.seal(conversation, place: PairKeys.place(slot: "conversation"))
        let live = LiveTurn(at: "", id: "turn:1", user: "Hi", steps: ["Thinking"], text: "Hel", done: false)
        let liveBox = try keys.seal(live, place: PairKeys.place(slot: "live"))
        let relay = FakeRelay()
        relay.answers = [
            (200, #"{"version":7,"role":"phone","peer":{"seenAt":1700000000000},"slots":[{"name":"conversation","version":7,"box":"\#(box)"},{"name":"attention","version":6,"box":"AAAA"},{"name":"live","version":5,"box":"\#(liveBox)"}],"messages":[]}"#),
            (200, #"{"version":7,"role":"phone","peer":null,"slots":[],"messages":[]}"#),
            (404, #"{"error":"gone"}"#),
        ]
        let session = PhoneSession(link: link, transport: relay)
        let first = try await session.sync()
        XCTAssertEqual(first.conversation, conversation)
        XCTAssertNil(first.attention, "a box that does not open is skipped")
        XCTAssertEqual(first.live, live)
        XCTAssertEqual(first.computerSeenAt, 1_700_000_000_000)
        XCTAssertEqual(relay.requests[0].url?.absoluteString, "https://worldlet.ai/api/pair/\(keys.id)?after=0")
        XCTAssertEqual(relay.requests[0].value(forHTTPHeaderField: "Authorization"), "Bearer \(keys.phoneToken)")
        _ = try await session.sync(wait: 20)
        XCTAssertEqual(relay.requests[1].url?.query, "after=7&wait=20")
        XCTAssertEqual(relay.requests[1].timeoutInterval, 35)
        do { _ = try await session.sync(); XCTFail("expected ended") } catch { XCTAssertEqual(error as? RelayError, .ended) }
    }
}
