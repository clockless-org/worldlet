import Foundation
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

// Phone pairing protocol v1, the iPhone half of core/phone/pairing.ts (see core/phone/README.md). The QR code carries a
// 32-byte secret; HKDF-SHA256 turns it into the relay pairing id, one bearer token per side and the AES-256-GCM key
// that seals every payload. scripts/phone-pairing-check.ts and PairingTests.swift pin the same test vector.
public enum PairingError: LocalizedError, Equatable {
    case notWorldlet, needsUpdate, incomplete, unknownRelay

    public var errorDescription: String? {
        switch self {
        case .notWorldlet: "This is not a Worldlet pairing code."
        case .needsUpdate: "Update Worldlet to pair with this computer."
        case .incomplete: "This pairing code is incomplete."
        case .unknownRelay: "This pairing code names an unknown relay."
        }
    }
}

public enum Base64URL {
    public static func encode(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public static func decode(_ text: String) -> Data? {
        guard text.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else { return nil }
        var s = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        s += String(repeating: "=", count: (4 - s.count % 4) % 4)
        return Data(base64Encoded: s)
    }
}

/// `worldlet://pair?v=1&s=<secret>&n=<computer name>[&r=<relay origin>]`
public struct PairLink: Equatable, Codable, Sendable {
    public static let protocolVersion = "1"
    public static let defaultRelay = URL(string: "https://worldlet.ai")!

    public let secret: Data
    public let relay: URL
    public let name: String

    public init(secret: Data, relay: URL = PairLink.defaultRelay, name: String) {
        self.secret = secret
        self.relay = relay
        self.name = name
    }

    public init(parsing text: String) throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: trimmed), parts.scheme == "worldlet", parts.host == "pair" else {
            throw PairingError.notWorldlet
        }
        // The desktop writes the query with URLSearchParams, which encodes a space as "+".
        let query = Dictionary((parts.percentEncodedQueryItems ?? []).map {
            ($0.name, ($0.value ?? "").replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? "")
        }, uniquingKeysWith: { a, _ in a })
        guard query["v"] == PairLink.protocolVersion else { throw PairingError.needsUpdate }
        guard let secret = Base64URL.decode(query["s"] ?? ""), secret.count == 32 else { throw PairingError.incomplete }
        var relay = PairLink.defaultRelay
        if let r = query["r"], !r.isEmpty {
            guard let url = URL(string: r), let host = url.host,
                  url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(host)),
                  url.path.isEmpty, url.query == nil else { throw PairingError.unknownRelay }
            relay = url
        }
        self.init(secret: secret, relay: relay, name: String((query["n"] ?? "").prefix(64)))
    }
}

public struct PairKeys: Sendable {
    public static let salt = Data("worldlet-pair-v1".utf8)

    public let id: String
    public let desktopToken: String
    public let phoneToken: String
    let key: SymmetricKey

    public init(secret: Data) {
        func derive(_ info: String, _ count: Int) -> Data {
            let key = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: secret), salt: PairKeys.salt,
                                             info: Data(info.utf8), outputByteCount: count)
            return key.withUnsafeBytes { Data($0) }
        }
        id = Base64URL.encode(derive("id", 16))
        desktopToken = Base64URL.encode(derive("desktop", 32))
        phoneToken = Base64URL.encode(derive("phone", 32))
        key = SymmetricKey(data: derive("key", 32))
    }

    /// "slot:attention", "to:desktop": the additional data binds a box to its pairing and place.
    public static func place(slot name: String) -> String { "slot:\(name)" }
    public static func place(to role: String) -> String { "to:\(role)" }

    private func aad(_ place: String) -> Data { Data("\(id)|\(place)".utf8) }

    /// base64url(12-byte nonce | ciphertext | 16-byte tag), the same layout as WebCrypto's AES-GCM on the desktop.
    public func seal<T: Encodable>(_ value: T, place: String) throws -> String {
        let box = try AES.GCM.seal(try JSONEncoder().encode(value), using: key, nonce: AES.GCM.Nonce(), authenticating: aad(place))
        return Base64URL.encode(box.combined!)
    }

    public func open<T: Decodable>(_ type: T.Type, box: String, place: String) throws -> T {
        guard let data = Base64URL.decode(box) else { throw PairingError.incomplete }
        let plain = try AES.GCM.open(try AES.GCM.SealedBox(combined: data), using: key, authenticating: aad(place))
        return try JSONDecoder().decode(type, from: plain)
    }

    /// A notification's sealed content: place "push" (additional data `<id>|push`), as the relay's /notify takes it.
    public static let pushPlace = "push"

    public func openPush(box: String) throws -> PhonePush { try open(PhonePush.self, box: box, place: PairKeys.pushPlace) }

    /// The content of an APNs payload (`p` the pairing id, `b` the box); nil when it is another pairing's or does not open.
    public func push(in userInfo: [AnyHashable: Any]) -> PhonePush? {
        guard userInfo["p"] as? String == id, let box = userInfo["b"] as? String else { return nil }
        return try? openPush(box: box)
    }
}
