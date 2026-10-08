import Foundation
import XCTest
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import WorldletKit

final class PushTests: XCTestCase {
    let secret = Data(0..<32)

    /// Seals like the computer's WebCrypto (core/phone/pairing.ts sealBox): the shared vector's key from HKDF, additional
    /// data `<id>|push`, base64url(nonce | ciphertext | tag). Built here so the test does not lean on PairKeys.seal.
    private func sealPush(_ json: String) throws -> String {
        let key = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: secret), salt: Data("worldlet-pair-v1".utf8),
                                         info: Data("key".utf8), outputByteCount: 32)
        let box = try AES.GCM.seal(Data(json.utf8), using: key, authenticating: Data("5gImJiJSofcAENRFNwk-eA|push".utf8))
        return Base64URL.encode(box.combined!)
    }

    func testOpensPushBox() throws {
        let keys = PairKeys(secret: secret)
        let box = try sealPush(#"{"v":1,"id":"p1","at":1791504000000,"kind":"fox","title":"Fox","body":"Done: the trip is booked.","open":{"conversation":true},"extra":1}"#)
        let push = try keys.openPush(box: box)
        XCTAssertEqual(push, PhonePush(id: "p1", at: 1_791_504_000_000, kind: .fox, title: "Fox", body: "Done: the trip is booked.",
                                       open: PhonePush.Open(conversation: true)))
        XCTAssertEqual(push.target, .conversation)
        XCTAssertThrowsError(try keys.open(PhonePush.self, box: box, place: PairKeys.place(slot: "push")), "only place push opens it")
        XCTAssertThrowsError(try PairKeys(secret: Data(repeating: 9, count: 32)).openPush(box: box))
    }

    /// A box the desktop sealed with WebCrypto (core/phone/pairing.ts sealBox(keys, 'push', …), the shared test vector).
    func testOpensDesktopPushBox() throws {
        let box = "NXbWmeDoP9KSc1t5IfsA6v8H3oKMTIaFarv2JFBzi5kcP8-ArxwPFaZXsi5NeiEBQFPq4qTreDA4A3lT4qpNTPN1rF3t5y_AJfCU4qL4julqls0JVaGzZIMUxXnhFOU4WW8cxLsndfk9IomPAdR4ZqPHoZoEw4UWzE59d8G6QBx2iiJprNUOLz6sfXFdW6Fi1gpZa_sTdvE_zCxoNWUcP7Fg-oAAuOs"
        let push = try PairKeys(secret: secret).openPush(box: box)
        XCTAssertEqual([push.id, push.title, push.body], ["push-1", "Reply to Sam", "He asked about Friday."])
        XCTAssertEqual(push.kind, .attention)
        XCTAssertEqual(push.target, .item("item-1"))
    }

    func testPayloadUnknownKindAndLimits() throws {
        let keys = PairKeys(secret: secret)
        let long = String(repeating: "x", count: 500)
        let box = try sealPush(#"{"v":1,"id":"p2","at":1,"kind":"later-kind","title":"\#(long)","body":"\#(long)"}"#)
        let payload: [AnyHashable: Any] = ["aps": ["mutable-content": 1], "p": keys.id, "b": box]
        let push = try XCTUnwrap(keys.push(in: payload))
        XCTAssertNil(push.kind, "an unknown kind still shows")
        XCTAssertEqual([push.title.count, push.body.count], [80, 240])
        XCTAssertNil(push.target)
        XCTAssertNil(keys.push(in: ["p": "another-pairing", "b": box]), "another pairing's push is not opened")
        XCTAssertNil(keys.push(in: ["p": keys.id, "b": "AAAA"]))
    }

    func testTargets() {
        XCTAssertEqual(PushTarget(open: .init(item: "i", applet: "gmail", conversation: true)), .item("i"), "the item comes first")
        XCTAssertEqual(PushTarget(open: .init(applet: "gmail", conversation: true)), .applet("gmail"))
        XCTAssertNil(PushTarget(open: .init(item: "", conversation: false)))
        for target in [PushTarget.item("i"), .applet("gmail"), .conversation] {
            XCTAssertEqual(PushTarget(userInfo: ["open": target.userInfo]), target, "the extension's userInfo reads back")
        }
        XCTAssertEqual(PushTarget(userInfo: ["open": NSDictionary(dictionary: ["conversation": NSNumber(value: true)])]), .conversation)
        XCTAssertNil(PushTarget(userInfo: ["p": "x"]))
    }

    /// The notification's buttons (core/phone/README.md, Push › Actions) send the app's own messages.
    func testButtonsSendTheAppsOwnMessages() throws {
        let keys = PairKeys(secret: secret)
        func read(_ json: String) throws -> PhonePush { try keys.openPush(box: sealPush(json)) }
        let item = try read(#"{"v":1,"id":"a","at":0,"kind":"attention","title":"Reply to Ada","body":"","open":{"item":"i1"},"act":{"attention":"i1"}}"#)
        XCTAssertEqual(item.category, PushAction.attentionCategory)
        XCTAssertEqual(item.message(for: .done), .attention(id: "i1", action: .done))
        XCTAssertEqual(item.message(for: .later), .attention(id: "i1", action: .later))
        XCTAssertNil(item.message(for: .allow), "only the buttons it offers")
        let fox = try read(#"{"v":1,"id":"f","at":0,"kind":"fox","title":"Fox","body":"Here is the plan.","open":{"item":"i1"},"act":{"reply":true}}"#)
        XCTAssertEqual(fox.category, PushAction.replyCategory)
        XCTAssertEqual(fox.message(for: .reply, text: "  Send it ", id: "r"), .ask(id: "r", text: "Send it", item: "i1"))
        XCTAssertNil(fox.message(for: .reply, text: "   ", id: "r"), "nothing to say")
        let asks = try read(#"{"v":1,"id":"q","at":0,"kind":"fox","title":"Run a command","body":"rm -rf ./build","open":{"conversation":true},"act":{"approval":"exec-7","once":true}}"#)
        XCTAssertEqual(asks.category, PushAction.approvalCategory)
        XCTAssertEqual(asks.message(for: .allow, id: "m"), .approval(id: "m", approval: "exec-7", choice: .once))
        XCTAssertEqual(asks.message(for: .deny, id: "m"), .approval(id: "m", approval: "exec-7", choice: .deny))
        XCTAssertNil(asks.message(for: .reply, text: "Thanks", id: "m"))
        let denyOnly = try read(#"{"v":1,"id":"q","at":0,"kind":"fox","title":"Run","body":"","act":{"approval":"exec-8"}}"#)
        XCTAssertEqual(denyOnly.category, PushAction.denyCategory, "Deny alone when Allow once is not offered")
        XCTAssertNil(denyOnly.message(for: .allow))
        XCTAssertNil(try read(#"{"v":1,"id":"n","at":0,"kind":"task","title":"Done","body":"","act":{"run":"x"}}"#).category, "an unknown set has no buttons")
        XCTAssertNil(try read(#"{"v":1,"id":"n","at":0,"kind":"task","title":"Done","body":""}"#).category)
    }

    func testRegisterAndUnpairCallTheRelay() async throws {
        let link = PairLink(secret: secret, name: "Mac")
        let relay = FakeRelay()
        relay.answers = [(200, #"{"ok":true}"#), (200, #"{"ok":true}"#), (404, #"{"error":"gone"}"#)]
        let session = PhoneSession(link: link, transport: relay)
        let token = pushTokenHex(Data([0x00, 0xab, 0x10, 0xff]))
        XCTAssertEqual(token, "00ab10ff")
        try await session.registerPush(platform: "apns-dev", token: token)
        try await session.unpair()
        let id = PairKeys(secret: secret).id
        XCTAssertEqual(relay.requests.map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" },
                       ["PUT /api/pair/\(id)/push", "DELETE /api/pair/\(id)/push", "DELETE /api/pair/\(id)"])
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(relay.requests[0].httpBody)) as? [String: String]
        XCTAssertEqual(body, ["platform": "apns-dev", "token": "00ab10ff"])
        XCTAssertEqual(relay.requests[0].value(forHTTPHeaderField: "Authorization"), "Bearer \(PairKeys(secret: secret).phoneToken)")
    }
}
