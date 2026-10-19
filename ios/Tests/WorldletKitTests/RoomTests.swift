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

final class RoomTests: XCTestCase {
    let secret = Data(0..<32)

    /// The same vector as agent/phone room.ts roomEntry, from the phone's side.
    func testEntryMatchesDesktop() {
        let entry = roomEntry(keys: PairKeys(secret: secret), relay: PairLink.defaultRelay)
        XCTAssertEqual(entry.url.absoluteString, "wss://worldlet.ai/api/room/6ffad7c07348adf279da3f73518e9dbb0035c89a312fd6c43de409549a2fb7a4")
        XCTAssertEqual(entry.protocols, ["worldlet-room.v1", "phone.AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I.cce4c2148009261d6f8db69e4b7ce3f456a739acb9f5d29323a0b6d8faf05b3d"])
        XCTAssertEqual(roomEntry(keys: PairKeys(secret: secret), relay: URL(string: "http://127.0.0.1:8787")!).url.absoluteString.prefix(27), "ws://127.0.0.1:8787/api/roo")
    }

    func testLinkSaysRoom() throws {
        let link = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac&m=room")
        XCTAssertEqual(link.room, true)
        let old = try PairLink(parsing: "worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac")
        XCTAssertNil(old.room)
        XCTAssertEqual(old.inRoom.room, true)
        // A link kept before decodes without it.
        let kept = try JSONDecoder().decode(PairLink.self, from: JSONEncoder().encode(old))
        XCTAssertNil(kept.room)
    }

    private func event(_ value: [String: Any]) -> String {
        String(decoding: try! JSONSerialization.data(withJSONObject: value), as: UTF8.self)
    }

    private func frame(_ value: [String: String]) -> String {
        event(["t": "msg", "from": "desktop", "data": String(decoding: try! JSONSerialization.data(withJSONObject: value), as: UTF8.self)])
    }

    func testRoomSyncSendAndEnd() async throws {
        let keys = PairKeys(secret: secret)
        let room = FakeRoom()
        let session = PhoneSession(link: PairLink(secret: secret, name: "Mac", room: true), transport: FakeRelay(), room: room)
        try await session.announce(PhoneInfo(name: "iPhone", version: "2"))
        let socket = try await connected(room, session)
        socket.deliver(event(["t": "desktop", "online": true]))
        let conversation = Conversation(v: 1, at: "", busy: false, name: "Fox", messages: [Turn(id: "t", role: .fox, text: "Hello", at: "")])
        socket.deliver(frame(["s": "conversation", "b": try keys.seal(conversation, place: PairKeys.place(slot: "conversation"))]))
        var update = PhoneUpdate()
        for _ in 0..<20 where update.conversation == nil { update = try await session.sync(wait: 1) }
        XCTAssertEqual(update.conversation?.messages.first?.text, "Hello", "what the computer sends in the room")
        XCTAssertNotNil(update.computerSeenAt, "a computer in the room is seen now")

        // The phone said its name when the computer came, and a line goes as a sealed message.
        try await session.send(.chat(id: "c1", text: "Hi"))
        struct Out: Decodable { let data: String }
        struct Frame: Decodable { let s: String?; let b: String?; let m: String? }
        let frames = try socket.sent.map { try JSONDecoder().decode(Frame.self, from: Data(try JSONDecoder().decode(Out.self, from: Data($0.utf8)).data.utf8)) }
        XCTAssertEqual(frames.first?.s, "phone")
        XCTAssertEqual(try keys.open(PhoneInfo.self, box: XCTUnwrap(frames.first?.b), place: PairKeys.place(slot: "phone")).name, "iPhone")
        struct Chat: Decodable { let type: String; let text: String }
        XCTAssertEqual(try keys.open(Chat.self, box: XCTUnwrap(frames.last?.m), place: PairKeys.place(to: "desktop")).text, "Hi")

        // The computer leaves: a line cannot go, and nothing waits.
        socket.deliver(event(["t": "desktop", "online": false]))
        _ = try await session.sync(wait: 1)
        do { try await session.send(.chat(id: "c2", text: "Later")); XCTFail("sent with no computer") } catch RelayError.failed {}

        // The computer ends the pairing.
        socket.deliver(frame(["e": try keys.seal(["end": true], place: PairKeys.place(slot: "end"))]))
        var ended = false
        for _ in 0..<20 where !ended {
            do { _ = try await session.sync(wait: 1) } catch RelayError.ended { ended = true }
        }
        XCTAssertTrue(ended)
    }

    func testRelayPairingMovesToTheRoom() async throws {
        let keys = PairKeys(secret: secret)
        let desktop = try keys.seal(["v": AnyCodable(1), "at": AnyCodable(""), "name": AnyCodable("Mac"), "version": AnyCodable("1"), "room": AnyCodable(true)], place: PairKeys.place(slot: "desktop"))
        let relay = FakeRelay()
        relay.answers = [(200, #"{"version":3,"peer":{"seenAt":1},"slots":[{"name":"desktop","version":3,"box":"\#(desktop)"}]}"#)]
        let room = FakeRoom()
        let session = PhoneSession(link: PairLink(secret: secret, name: "Mac"), transport: relay, room: room)
        let isInRoom = await session.inRoom
        XCTAssertFalse(isInRoom)
        let update = try await session.sync()
        XCTAssertEqual(update.desktop?.room, true)
        let moved = await session.inRoom
        XCTAssertTrue(moved, "the computer waits in the room")
        _ = try? await session.sync(wait: 0)
        XCTAssertEqual(room.opened.count, 1, "the next sync goes to the room")
        XCTAssertEqual(relay.requests.count, 1)
    }

    func testLeavingTheRoomWhenPutAway() async throws {
        let room = FakeRoom()
        let session = PhoneSession(link: PairLink(secret: secret, name: "Mac", room: true), transport: FakeRelay(), room: room)
        let socket = try await connected(room, session)
        socket.deliver(event(["t": "desktop", "online": true]))
        _ = try await session.sync(wait: 1)
        await session.leaveRoom()
        socket.deliver(event(["t": "desktop", "online": true]))
        _ = try? await session.sync(wait: 0)
        XCTAssertEqual(room.opened.count, 2, "a sync after coming back opens the room again")
    }

    /// Starts a sync, which opens the room, and returns its socket.
    private func connected(_ room: FakeRoom, _ session: PhoneSession) async throws -> FakeRoomSocket {
        Task { _ = try? await session.sync(wait: 0) }
        for _ in 0..<100 where room.last == nil { try await Task.sleep(nanoseconds: 10_000_000) }
        return try XCTUnwrap(room.last)
    }
}

/// A JSON value for sealing test slots.
struct AnyCodable: Encodable {
    let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
