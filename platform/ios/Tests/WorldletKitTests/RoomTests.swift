import Foundation
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import WorldletKit

/// A room socket whose incoming messages the test sends, and which records what the phone sent.
final class FakeRoomSocket: RoomSocket, @unchecked Sendable {
    private let lock = NSLock()
    private var inbox: [String] = []
    private var waiting: CheckedContinuation<String, Error>?
    private var closed = false
    private(set) var sent: [String] = []

    func deliver(_ text: String) {
        lock.lock()
        if let waiting { self.waiting = nil; lock.unlock(); waiting.resume(returning: text); return }
        inbox.append(text)
        lock.unlock()
    }

    func send(_ text: String) async throws {
        lock.lock(); defer { lock.unlock() }
        sent.append(text)
    }

    func receive() async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if !inbox.isEmpty { let text = inbox.removeFirst(); lock.unlock(); continuation.resume(returning: text); return }
            if closed { lock.unlock(); continuation.resume(throwing: URLError(.networkConnectionLost)); return }
            waiting = continuation
            lock.unlock()
        }
    }

    func close() {
        lock.lock()
        closed = true
        let waiting = self.waiting
        self.waiting = nil
        lock.unlock()
        waiting?.resume(throwing: URLError(.networkConnectionLost))
    }
}

final class FakeRoom: RoomConnector, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var opened: [(url: URL, protocols: [String], socket: FakeRoomSocket)] = []
    var last: FakeRoomSocket? { lock.lock(); defer { lock.unlock() }; return opened.last?.socket }
    func open(_ url: URL, protocols: [String]) -> RoomSocket {
        let socket = FakeRoomSocket()
        lock.lock(); opened.append((url, protocols, socket)); lock.unlock()
        return socket
    }
}

/// A room event as the room sends it (`desktop` online, or a `msg`).
func roomEvent(_ value: [String: Any]) -> String {
    String(decoding: try! JSONSerialization.data(withJSONObject: value), as: UTF8.self)
}

/// A frame the computer sent through the room.
func roomFrame(_ value: [String: String]) -> String {
    roomEvent(["t": "msg", "from": "desktop", "data": String(decoding: try! JSONSerialization.data(withJSONObject: value), as: UTF8.self)])
}

/// Starts a sync, which opens the room, and returns its socket.
func connectedRoom(_ room: FakeRoom, _ session: PhoneSession) async throws -> FakeRoomSocket {
    Task { _ = try? await session.sync(wait: 0) }
    for _ in 0..<100 where room.last == nil { try await Task.sleep(nanoseconds: 10_000_000) }
    return try XCTUnwrap(room.last)
}

/// What the phone sent through the room, each frame unwrapped.
struct SentFrame: Decodable { let s: String?; let b: String?; let m: String?; let e: String? }
func sentFrames(_ socket: FakeRoomSocket) throws -> [SentFrame] {
    struct Out: Decodable { let data: String }
    return try socket.sent.map { try JSONDecoder().decode(SentFrame.self, from: Data(try JSONDecoder().decode(Out.self, from: Data($0.utf8)).data.utf8)) }
}

final class RoomTests: XCTestCase {
    let secret = Data(0..<32)

    /// The same vector as agent/app room.ts roomEntry, from the phone's side.
    func testEntryMatchesDesktop() {
        let entry = roomEntry(keys: PairKeys(secret: secret), relay: PairLink.defaultRelay)
        XCTAssertEqual(entry.url.absoluteString, "wss://worldlet.ai/api/room/6ffad7c07348adf279da3f73518e9dbb0035c89a312fd6c43de409549a2fb7a4")
        XCTAssertEqual(entry.protocols, ["worldlet-room.v1", "phone.AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I.cce4c2148009261d6f8db69e4b7ce3f456a739acb9f5d29323a0b6d8faf05b3d"])
        XCTAssertEqual(roomEntry(keys: PairKeys(secret: secret), relay: URL(string: "http://127.0.0.1:8787")!).url.absoluteString.prefix(27), "ws://127.0.0.1:8787/api/roo")
    }

    func testLinkSaysRoom() throws {
        let link = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac&m=room")
        XCTAssertEqual(link.room, true)
        let kept = try JSONDecoder().decode(PairLink.self, from: JSONEncoder().encode(link))
        XCTAssertEqual(kept, link, "the kept link reads back")
    }

    /// A code or a kept link from before the room is refused or ended: the old relay API is gone.
    func testOlderPairingIsRefusedAndEnded() async throws {
        XCTAssertThrowsError(try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac")) {
            XCTAssertEqual($0 as? PairingError, .olderComputer)
            XCTAssertEqual($0.localizedDescription, "This code is from an older Worldlet. Update Worldlet on your computer and pair again.")
        }
        // A link kept before the room decodes without it.
        let old = try JSONDecoder().decode(PairLink.self, from: JSONEncoder().encode(PairLink(secret: secret, name: "Mac", room: false)))
        XCTAssertNil(old.room)
        let room = FakeRoom()
        let session = PhoneSession(link: old, room: room)
        do { _ = try await session.sync(); XCTFail("expected ended") } catch { XCTAssertEqual(error as? RelayError, .ended) }
        do { try await session.send(.chat(id: "c", text: "Hi")); XCTFail("expected ended") } catch { XCTAssertEqual(error as? RelayError, .ended) }
        do { try await session.registerPush(platform: "apns", token: "00"); XCTFail("expected ended") } catch { XCTAssertEqual(error as? RelayError, .ended) }
        try await session.unpair()
        XCTAssertTrue(room.opened.isEmpty, "nothing is opened for it")
    }

    func testRoomSyncSendAndEnd() async throws {
        let keys = PairKeys(secret: secret)
        let room = FakeRoom()
        let session = PhoneSession(link: PairLink(secret: secret, name: "Mac"), room: room)
        try await session.announce(PhoneInfo(name: "iPhone", version: "2"))
        let socket = try await connectedRoom(room, session)
        socket.deliver(roomEvent(["t": "desktop", "online": true]))
        let conversation = Conversation(v: 1, at: "", busy: false, name: "Fox", messages: [Turn(id: "t", role: .fox, text: "Hello", at: "")])
        socket.deliver(roomFrame(["s": "attention", "b": "AAAA"]))
        socket.deliver(roomFrame(["s": "conversation", "b": try keys.seal(conversation, place: PairKeys.place(slot: "conversation"))]))
        let live = LiveTurn(at: "", id: "turn:1", user: "Hi", steps: ["Thinking"], text: "Hel", done: false)
        socket.deliver(roomFrame(["s": "live", "b": try keys.seal(live, place: PairKeys.place(slot: "live"))]))
        var update = PhoneUpdate()
        for _ in 0..<20 where update.live == nil {
            let next = try await session.sync(wait: 1)
            update.conversation = next.conversation ?? update.conversation
            update.attention = next.attention ?? update.attention
            update.live = next.live
            update.computerSeenAt = next.computerSeenAt
        }
        XCTAssertEqual(update.conversation?.messages.first?.text, "Hello", "what the computer sends in the room")
        XCTAssertEqual(update.live, live)
        XCTAssertNil(update.attention, "a box that does not open is skipped")
        XCTAssertNotNil(update.computerSeenAt, "a computer in the room is seen now")

        // The phone said its name when the computer came, and a line goes as a sealed message.
        try await session.send(.chat(id: "c1", text: "Hi"))
        let frames = try sentFrames(socket)
        XCTAssertEqual(frames.first?.s, "phone")
        XCTAssertEqual(try keys.open(PhoneInfo.self, box: XCTUnwrap(frames.first?.b), place: PairKeys.place(slot: "phone")).name, "iPhone")
        struct Chat: Decodable { let type: String; let text: String }
        XCTAssertEqual(try keys.open(Chat.self, box: XCTUnwrap(frames.last?.m), place: PairKeys.place(to: "desktop")).text, "Hi")

        // The computer leaves: a line cannot go, and nothing waits.
        socket.deliver(roomEvent(["t": "desktop", "online": false]))
        _ = try await session.sync(wait: 1)
        do { try await session.send(.chat(id: "c2", text: "Later")); XCTFail("sent with no computer") } catch RelayError.failed {}

        // The computer ends the pairing.
        socket.deliver(roomFrame(["e": try keys.seal(["end": true], place: PairKeys.place(slot: "end"))]))
        var ended = false
        for _ in 0..<20 where !ended {
            do { _ = try await session.sync(wait: 1) } catch RelayError.ended { ended = true }
        }
        XCTAssertTrue(ended)
    }

    func testLeavingTheRoomWhenPutAway() async throws {
        let room = FakeRoom()
        let session = PhoneSession(link: PairLink(secret: secret, name: "Mac"), room: room)
        let socket = try await connectedRoom(room, session)
        socket.deliver(roomEvent(["t": "desktop", "online": true]))
        _ = try await session.sync(wait: 1)
        await session.leaveRoom()
        socket.deliver(roomEvent(["t": "desktop", "online": true]))
        _ = try? await session.sync(wait: 0)
        XCTAssertEqual(room.opened.count, 2, "a sync after coming back opens the room again")
    }
}
