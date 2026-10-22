import Foundation

public enum RelayError: LocalizedError, Equatable {
    /// The pairing no longer exists: the computer unpaired, or the pairing is from before the room and cannot meet there.
    case ended
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .ended: "This iPhone is no longer paired. Pair again from Worldlet on your computer."
        case let .failed(message): message
        }
    }
}

/// What one sync brought. Nil fields did not change.
public struct PhoneUpdate: Sendable {
    public var attention: AttentionSnapshot?
    public var conversation: Conversation?
    /// The turn Fox is streaming.
    public var live: LiveTurn?
    public var desktop: DesktopInfo?
    /// The widgets for now (pages may be left out; the app keeps the ones it has).
    public var widgets: WidgetsSnapshot?
    /// When the computer was last in the room (milliseconds since 1970).
    public var computerSeenAt: Double?
}

/// The phone's side of a pairing, in the pairing room (platform/web/README.md#room). It keeps the room socket; the app
/// keeps the link in the Keychain and calls `sync()` while it is open. The computer sends everything it has when the phone
/// arrives, then each change; nothing waits there, so a message goes only while the computer is in the room too. A link
/// kept from before the room (no `room`) cannot meet there: its session is ended from the start.
public actor PhoneSession {
    public let link: PairLink
    public let keys: PairKeys
    private let connector: RoomConnector
    private var socket: RoomSocket?
    /// Counts sockets, so a closed one's last events change nothing.
    private var generation = 0
    /// The computer is in the room; the room said whether it is (`heard`); the computer ended the pairing.
    private var computer = false, heard = false, ended = false
    /// What the computer sent since the last sync, and whether anything came.
    private var collected = PhoneUpdate()
    private var fresh = false
    private var seenAt: Double?
    /// The phone's name, said again each time the computer comes to the room.
    private var info: PhoneInfo?
    private var waiters: [UUID: CheckedContinuation<Void, Never>] = [:]

    public init(link: PairLink, room: RoomConnector = URLSessionRoomConnector()) {
        self.link = link
        keys = PairKeys(secret: link.secret)
        connector = room
        ended = link.room != true
    }

    private struct Event: Decodable { let t: String; let online: Bool?; let from: String?; let data: String? }
    private struct Frame: Codable { var s: String?; var b: String?; var m: String?; var e: String? }
    private struct Out: Encodable { let data: String }
    private struct End: Codable { let end: Bool }

    /// A slot's box, opened into `update`. A box that does not open (or a slot this version does not know) is skipped,
    /// never trusted.
    private func read(slot name: String, box: String, into update: inout PhoneUpdate) {
        let place = PairKeys.place(slot: name)
        switch name {
        case "attention": update.attention = (try? keys.open(AttentionSnapshot.self, box: box, place: place)) ?? update.attention
        case "conversation": update.conversation = (try? keys.open(Conversation.self, box: box, place: place)) ?? update.conversation
        case "live": update.live = (try? keys.open(LiveTurn.self, box: box, place: place)) ?? update.live
        case "widgets": update.widgets = (try? keys.open(WidgetsSnapshot.self, box: box, place: place)) ?? update.widgets
        case "desktop": update.desktop = (try? keys.open(DesktopInfo.self, box: box, place: place)) ?? update.desktop
        default: break
        }
    }

    /// What came from the computer since the last sync. With `wait` (seconds, at most 20) it waits that long for something
    /// to come (or the computer to arrive or leave). The computer counts as seen now while it is in the room.
    public func sync(wait: Int = 0) async throws -> PhoneUpdate {
        if ended { throw RelayError.ended }
        connect()
        // Until the room says whether the computer is there, a first sync waits for it.
        for _ in 0..<50 where !heard { try? await Task.sleep(nanoseconds: 100_000_000) }
        if wait > 0 && !fresh { await waitForNews(seconds: Double(min(wait, 20))) }
        if ended { throw RelayError.ended }
        // No socket left (no network, or the room refused it): the caller backs off before trying again.
        if socket == nil && !fresh { throw RelayError.failed("Worldlet could not reach the pairing room.") }
        fresh = false
        var update = collected
        collected = PhoneUpdate()
        if computer { seenAt = Date().timeIntervalSince1970 * 1000 }
        update.computerSeenAt = seenAt
        return update
    }

    private func connect() {
        guard socket == nil, !ended else { return }
        let (url, protocols) = roomEntry(keys: keys, relay: link.relay)
        let socket = connector.open(url, protocols: protocols)
        self.socket = socket
        heard = false
        generation += 1
        let generation = self.generation
        Task { await self.listen(socket, generation) }
    }

    private func listen(_ socket: RoomSocket, _ generation: Int) async {
        while let text = try? await socket.receive() {
            guard generation == self.generation else { return }
            await handle(text)
        }
        guard generation == self.generation else { return }
        self.socket = nil
        if computer { computer = false; seenAt = Date().timeIntervalSince1970 * 1000 }
        heard = true
        wake()
    }

    private func handle(_ text: String) async {
        guard let event = try? JSONDecoder().decode(Event.self, from: Data(text.utf8)) else { return }
        if event.t == "desktop" {
            computer = event.online == true
            heard = true
            seenAt = Date().timeIntervalSince1970 * 1000
            if computer { try? await introduce() }
            wake()
            return
        }
        guard event.t == "msg", event.from == "desktop", let data = event.data,
              let frame = try? JSONDecoder().decode(Frame.self, from: Data(data.utf8)) else { return }
        if let slot = frame.s, let box = frame.b {
            read(slot: slot, box: box, into: &collected)
            wake()
        } else if let end = frame.e, (try? keys.open(End.self, box: end, place: PairKeys.place(slot: "end"))) != nil {
            ended = true
            socket?.close()
            wake()
        }
    }

    private func frame(_ value: Frame) async throws {
        guard let socket else { throw RelayError.failed(Self.away) }
        let inner = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
        try await socket.send(String(decoding: try JSONEncoder().encode(Out(data: inner)), as: UTF8.self))
    }

    private func introduce() async throws {
        guard let info else { return }
        try await frame(Frame(s: "phone", b: try keys.seal(info, place: PairKeys.place(slot: "phone"))))
    }

    /// Connects when needed and waits until the room says whether the computer is there; throws when it is not.
    private func reachComputer() async throws {
        if ended { throw RelayError.ended }
        connect()
        for _ in 0..<50 where !heard { try? await Task.sleep(nanoseconds: 100_000_000) }
        if ended { throw RelayError.ended }
        guard computer else { throw RelayError.failed(Self.away) }
    }

    static let away = "Your computer is not reachable. Open Worldlet on it and try again."

    private func waitForNews(seconds: Double) async {
        let id = UUID()
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            waiters[id] = continuation
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                await self?.release(id)
            }
        }
    }

    private func release(_ id: UUID) { waiters.removeValue(forKey: id)?.resume() }

    private func wake() {
        fresh = true
        let all = waiters
        waiters = [:]
        for continuation in all.values { continuation.resume() }
    }

    /// Leaves the room while the app is in the background, so the computer knows it is put away and notifies instead.
    /// The next sync comes back.
    public func leaveRoom() {
        socket?.close()
        socket = nil
        generation += 1
        if computer { computer = false; seenAt = Date().timeIntervalSince1970 * 1000 }
        heard = false
    }

    public func send(_ message: PhoneMessage) async throws {
        try await reachComputer()
        try await frame(Frame(m: try keys.seal(message, place: PairKeys.place(to: "desktop"))))
    }

    /// The phone's name, said to the computer now if it is in the room and again each time it comes.
    public func announce(_ info: PhoneInfo) async throws {
        self.info = info
        if computer { try await introduce() }
    }

    /// Where this iPhone's notifications go: the APNs device token in hex, "apns" for App Store and TestFlight builds,
    /// "apns-dev" for debug builds (Apple's sandbox). It goes to the computer in a sealed `push` message, so the relay
    /// keeps none (platform/web/README.md#push); the computer forgets it with the pairing.
    public func registerPush(platform: String, token: String) async throws {
        try await send(.push(id: UUID().uuidString, platform: platform, token: token))
    }

    /// Ends the pairing; the computer hears it if it is in the room now.
    public func unpair() async throws {
        if (try? await reachComputer()) != nil {
            try? await frame(Frame(e: try keys.seal(End(end: true), place: PairKeys.place(slot: "end"))))
        }
        ended = true
        leaveRoom()
    }
}

/// An APNs device token as the computer takes it: lowercase hex.
public func pushTokenHex(_ token: Data) -> String { token.map { String(format: "%02x", $0) }.joined() }
