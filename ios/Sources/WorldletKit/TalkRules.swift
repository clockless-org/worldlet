import Foundation

/// Talk with Fox (owner parity plan item 7): a spoken conversation in the Fox dock. The rules match the computer's
/// (core/companion/fox-talk.ts) and Android's (kit TalkRules.kt): an utterance ends when the recognizer's words stop
/// changing for `pause`, a short "be quiet" (安静点, 别说话, shut up…) keeps Talk going without reading replies aloud,
/// the voice reads the reply without Markdown marks or link targets, and words of the person's own heard while Fox
/// speaks interrupt it (`interruption`).
public enum TalkRules {
    /// Seconds the words must stay the same before the utterance is sent (a little longer than the computer's 1.1 s,
    /// since the recognizer's partial results arrive late).
    public static let pause: TimeInterval = 1.2

    /// A short request to stop talking; a longer message is a conversation, not a mute (core/companion/fox-proactive.ts).
    public static func quietRequest(_ text: String) -> Bool {
        let value = text.lowercased()
            .replacingOccurrences(of: "[\\s,，.。!！~～]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty, value.count <= 24 else { return false }
        let joined = value.replacingOccurrences(of: " ", with: "")
        return matches(joined, "^(fox|小狐狸)?(你)?(先)?(别|不要|不用)(再)?(说话|打扰我?|吵|插嘴|主动说话?)(了|啦|吧)?$")
            || matches(joined, "^(fox|小狐狸)?(安静|闭嘴|少说)(点|一点|一下|些|两句)?(吧|啦)?$")
            || matches(value, "^(please )?(shut up|be quiet|quiet|stop talking|stop interrupting|leave me alone)( please)?$")
    }

    /// What the voice reads: the reply without Worldlet's markup, link targets or Markdown marks.
    public static func spokenText(_ text: String) -> String {
        text.replacingOccurrences(of: "<worldlet[^>]*>[\\s\\S]*?</worldlet[^>]*>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\[([^\\]]+)\\]\\([^)]+\\)", with: "$1", options: .regularExpression)
            .replacingOccurrences(of: "[`#*_]", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Barge-in: what the recognizer heard while Fox spoke, from the first word that is not Fox's own (an echo the
    /// phone's echo cancellation let through); nil until at least two words, or two CJK characters, are the person's.
    public static func interruption(_ heard: String, reply: String) -> String? {
        let own = Set(words(in: reply).map(\.1))
        let said = words(in: heard)
        guard let first = said.firstIndex(where: { !own.contains($0.1) }),
              said[first...].filter({ !own.contains($0.1) }).count >= 2 else { return nil }
        return String(heard[said[first].0.lowerBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static let word = try! NSRegularExpression(pattern: "\\p{Han}|[[\\p{L}\\p{N}']&&[^\\p{Han}]]+")

    private static func words(in text: String) -> [(Range<String.Index>, String)] {
        word.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
            Range(match.range, in: text).map { ($0, text[$0].lowercased()) }
        }
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
}

/// Follows the recognizer's words during one utterance and says when the person stopped.
public struct TalkPause {
    private var words = ""
    private var changedAt: Date?

    public init() {}

    /// The words heard so far at `now`; true once there are words and they have not changed for `TalkRules.pause`.
    public mutating func heard(_ transcript: String, at now: Date) -> Bool {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if text != words || changedAt == nil {
            words = text
            changedAt = now
            return false
        }
        guard !words.isEmpty, let changedAt else { return false }
        return now.timeIntervalSince(changedAt) >= TalkRules.pause
    }
}
