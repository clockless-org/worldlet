import Foundation
import XCTest
@testable import WorldletKit

final class PairingTests: XCTestCase {
    let secret = Data(0..<32)

    /// The same vector as scripts/phone-payloads-check.ts: both sides must derive identical ids, tokens and keys.
    func testDerivationMatchesDesktop() {
        let keys = PairKeys(secret: secret)
        XCTAssertEqual(keys.id, "5gImJiJSofcAENRFNwk-eA")
        XCTAssertEqual(keys.desktopToken, "ExL6gIXW76sr5OnyNNudNIVl5ItyYXrGmzcD2mv4-ZY")
        XCTAssertEqual(keys.phoneToken, "AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I")
    }

    func testLinkParsing() throws {
        let link = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Alex%E2%80%99s+Mac&m=room")
        XCTAssertEqual(link.secret, secret)
        XCTAssertEqual(link.relay, URL(string: "https://worldlet.ai")!)
        XCTAssertEqual(link.name, "Alex’s Mac")
        XCTAssertEqual(link.room, true)
        let local = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=x&r=http%3A%2F%2F127.0.0.1%3A8787&m=room")
        XCTAssertEqual(local.relay.absoluteString, "http://127.0.0.1:8787")
        XCTAssertThrowsError(try PairLink(parsing: "https://worldlet.ai")) { XCTAssertEqual($0 as? PairingError, .notWorldlet) }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=2&s=AAEC")) { XCTAssertEqual($0 as? PairingError, .needsUpdate) }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=1&s=AAEC")) { XCTAssertEqual($0 as? PairingError, .incomplete) }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&r=http%3A%2F%2Fevil.example&m=room")) {
            XCTAssertEqual($0 as? PairingError, .unknownRelay)
        }
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=x")) {
            XCTAssertEqual($0 as? PairingError, .olderComputer, "a code without m=room is from the old relay API")
        }
    }

    /// A box the desktop sealed (WebCrypto, platform/web/pairing.ts) opens here, and only in its own place.
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
