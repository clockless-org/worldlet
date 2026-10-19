import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

/// One WebSocket to the pairing room (agent/phone room.ts); tests replace it.
public protocol RoomSocket: Sendable {
    func send(_ text: String) async throws
    /// The next message; throws once the socket closed.
    func receive() async throws -> String
    func close()
}

/// Opens room sockets; tests replace it.
public protocol RoomConnector: Sendable {
    func open(_ url: URL, protocols: [String]) -> RoomSocket
}

public struct URLSessionRoomConnector: RoomConnector {
    public init() {}
    public func open(_ url: URL, protocols: [String]) -> RoomSocket {
        let task = URLSession.shared.webSocketTask(with: url, protocols: protocols)
        // A slot is at most about 300 KB (the room's own limit).
        task.maximumMessageSize = 1 << 20
        task.resume()
        return URLSessionRoomSocket(task: task)
    }
}

private struct URLSessionRoomSocket: RoomSocket, @unchecked Sendable {
    let task: URLSessionWebSocketTask
    func send(_ text: String) async throws { try await task.send(.string(text)) }
    func receive() async throws -> String {
        switch try await task.receive() {
        case let .string(text): return text
        case let .data(data): return String(decoding: data, as: UTF8.self)
        @unknown default: return ""
        }
    }
    func close() { task.cancel(with: .normalClosure, reason: nil) }
}

/// The room's address on the relay and the subprotocols the phone opens it with (agent/phone room.ts roomEntry): the room
/// is named by the hash of both token hashes, and the phone gets in with its own token and the computer's hash.
public func roomEntry(keys: PairKeys, relay: URL) -> (url: URL, protocols: [String]) {
    func hex(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }
    let desktop = hex(keys.desktopToken), phone = hex(keys.phoneToken)
    var parts = URLComponents(url: relay, resolvingAgainstBaseURL: false)!
    parts.scheme = parts.scheme == "http" ? "ws" : "wss"
    parts.path = "/api/room/" + hex(desktop + ":" + phone)
    return (parts.url!, ["worldlet-room.v1", "phone.\(keys.phoneToken).\(desktop)"])
}
