import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Sends one relay request; tests replace it.
public protocol RelayTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, Int)
}

public struct URLSessionTransport: RelayTransport {
    public init() {}
    public func send(_ request: URLRequest) async throws -> (Data, Int) {
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
}

public enum RelayError: LocalizedError, Equatable {
    /// The pairing no longer exists: the computer unpaired, or the relay forgot an idle pairing.
    case ended
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .ended: "This iPhone is no longer paired. Pair again from Worldlet on your computer."
        case let .failed(message): message
        }
    }
}

/// What one poll brought. Nil fields did not change.
public struct PhoneUpdate: Sendable {
    public var attention: AttentionSnapshot?
    public var conversation: Conversation?
    /// The turn Fox is streaming.
    public var live: LiveTurn?
    public var desktop: DesktopInfo?
    /// The widgets for now (pages may be left out; the app keeps the ones it has).
    public var widgets: WidgetsSnapshot?
    /// When the computer last reached the relay (milliseconds since 1970).
    public var computerSeenAt: Double?
}

/// The phone's side of a pairing, against the relay in worker/pairing.ts. It keeps the poll cursor; the app keeps the
/// link in the Keychain and calls `sync()` while it is open.
public actor PhoneSession {
    public let link: PairLink
    public let keys: PairKeys
    private let transport: RelayTransport
    private var cursor = 0

    public init(link: PairLink, transport: RelayTransport = URLSessionTransport()) {
        self.link = link
        keys = PairKeys(secret: link.secret)
        self.transport = transport
    }

    private struct SlotRow: Decodable { let name: String; let version: Int; let box: String }
    private struct View: Decodable {
        struct Peer: Decodable { let seenAt: Double? }
        let version: Int
        let peer: Peer?
        let slots: [SlotRow]
    }
    private struct Failure: Decodable { let error: String? }
    private struct Box: Encodable { let box: String }

    private func request(_ path: String, method: String = "GET", query: [URLQueryItem] = [], body: Encodable? = nil,
                         timeout: TimeInterval = 20) async throws -> Data {
        var parts = URLComponents(url: link.relay.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query }
        var r = URLRequest(url: parts.url!)
        r.httpMethod = method
        r.timeoutInterval = timeout
        r.setValue("Bearer \(keys.phoneToken)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("Worldlet-iOS/1 (phone pairing)", forHTTPHeaderField: "User-Agent")
        if let body { r.httpBody = try JSONEncoder().encode(body) }
        let (data, status) = try await transport.send(r)
        if status == 404 { throw RelayError.ended }
        guard (200..<300).contains(status) else {
            throw RelayError.failed((try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "Worldlet could not reach your computer (\(status)).")
        }
        return data
    }

    /// One poll. The first poll after scanning completes the pairing on the computer. With `wait` (seconds, at most 20)
    /// the relay holds the request until the computer sends something new, so changes arrive as they happen.
    public func sync(wait: Int = 0) async throws -> PhoneUpdate {
        var query = [URLQueryItem(name: "after", value: String(cursor))]
        if wait > 0 { query.append(URLQueryItem(name: "wait", value: String(min(wait, 20)))) }
        let data = try await request("api/pair/\(keys.id)", query: query, timeout: TimeInterval(wait) + 15)
        let view = try JSONDecoder().decode(View.self, from: data)
        var update = PhoneUpdate(computerSeenAt: view.peer?.seenAt)
        for slot in view.slots {
            let place = PairKeys.place(slot: slot.name)
            // A box that does not open (or a slot this version does not know) is skipped, never trusted.
            switch slot.name {
            case "attention": update.attention = try? keys.open(AttentionSnapshot.self, box: slot.box, place: place)
            case "conversation": update.conversation = try? keys.open(Conversation.self, box: slot.box, place: place)
            case "live": update.live = try? keys.open(LiveTurn.self, box: slot.box, place: place)
            case "widgets": update.widgets = try? keys.open(WidgetsSnapshot.self, box: slot.box, place: place)
            case "desktop": update.desktop = try? keys.open(DesktopInfo.self, box: slot.box, place: place)
            default: break
            }
        }
        cursor = max(cursor, view.version)
        return update
    }

    public func send(_ message: PhoneMessage) async throws {
        _ = try await request("api/pair/\(keys.id)/messages", method: "POST",
                              body: Box(box: try keys.seal(message, place: PairKeys.place(to: "desktop"))))
    }

    public func announce(_ info: PhoneInfo) async throws {
        _ = try await request("api/pair/\(keys.id)/slots/phone", method: "PUT",
                              body: Box(box: try keys.seal(info, place: PairKeys.place(slot: "phone"))))
    }

    /// Where the relay sends this iPhone's notifications: the APNs device token in hex, "apns" for App Store and
    /// TestFlight builds, "apns-dev" for debug builds (Apple's sandbox).
    public func registerPush(platform: String, token: String) async throws {
        _ = try await request("api/pair/\(keys.id)/push", method: "PUT", body: PushToken(platform: platform, token: token))
    }

    public func unregisterPush() async throws {
        do { _ = try await request("api/pair/\(keys.id)/push", method: "DELETE") } catch RelayError.ended {}
    }

    /// Stops the notifications first (the relay drops them with the pairing too; this says so without relying on it).
    public func unpair() async throws {
        try? await unregisterPush()
        do { _ = try await request("api/pair/\(keys.id)", method: "DELETE") } catch RelayError.ended {}
    }
}

private struct PushToken: Encodable { let platform: String; let token: String }

/// An APNs device token as the relay takes it: lowercase hex.
public func pushTokenHex(_ token: Data) -> String { token.map { String(format: "%02x", $0) }.joined() }
