import UserNotifications
import WorldletKit

/// WorldletNotify, the Notification Service Extension. APNs brings the relay's fallback text ("New from your computer")
/// with the computer's sealed content (`p` the pairing id, `b` the box, worker/pairing.ts /notify); this opens it with
/// the pairing key from the shared Keychain group (PairingStore) and shows what the computer said, with where a tap
/// goes as `open` in userInfo (PushTarget) and its buttons as the category (PhonePush.category). A box it cannot open
/// (another pairing, none, or a phone not unlocked since it started) keeps the fallback, without buttons.
final class NotificationService: UNNotificationServiceExtension {
    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return contentHandler(request.content) }
        content.threadIdentifier = "worldlet"
        if let link = PairingStore.load(), let push = PairKeys(secret: link.secret).push(in: content.userInfo) {
            if !push.title.isEmpty { content.title = push.title }
            if !push.body.isEmpty { content.body = push.body }
            if let target = push.target { content.userInfo["open"] = target.userInfo }
            // Its buttons (the app registers the categories): Apple sees only the fallback text, never which ones.
            if let category = push.category { content.categoryIdentifier = category }
        }
        contentHandler(content)
    }
}
