import Foundation
import Security
import WorldletKit

/// The pairing link (with its secret) lives in the Keychain, readable after the first unlock and never synced to
/// other devices: a new phone pairs again. The app and its Notification Service Extension (WorldletNotify) both read it:
/// their entitlements share the keychain access group `$(AppIdentifierPrefix)app.worldlet.ios`, the app's own group,
/// where it always kept the link, so a pairing made before notifications needs no move. These queries name no group,
/// so they search every group the target has, and the app adds to its first one, that shared group.
enum PairingStore {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "ai.worldlet.pairing",
        kSecAttrAccount as String: "computer",
    ]

    static func load() -> PairLink? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(PairLink.self, from: data)
    }

    static func save(_ link: PairLink) {
        delete()
        guard let data = try? JSONEncoder().encode(link) else { return }
        var q = query
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
