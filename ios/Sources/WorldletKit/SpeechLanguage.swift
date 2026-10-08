import Foundation

/// Which language hold-to-talk listens for. The recognizer hears one language at a time, and the app's own language
/// (`Locale.current`, English while the app has only English text) made it hear Mandarin as English. The rule matches
/// the desktop's (ui/companion/speech-language.ts) and Android's (kit SpeechLanguage.kt): the last line the person
/// said or typed to Fox, when its script names a language; otherwise the phone's first preferred language.
public enum SpeechLanguage {
    /// The language a line is written in, when its script says so; Latin text could be many languages, so nil.
    public static func language(of text: String) -> String? {
        var found: String?
        for scalar in text.unicodeScalars {
            switch scalar.value {
            case 0x3040...0x30FF, 0x31F0...0x31FF: return "ja"
            case 0xAC00...0xD7AF, 0x1100...0x11FF, 0x3130...0x318F: return "ko"
            case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0xF900...0xFAFF, 0x20000...0x2FA1F: found = found ?? "zh"
            case 0x0400...0x04FF: found = found ?? "ru"
            case 0x0600...0x06FF: found = found ?? "ar"
            case 0x0E00...0x0E7F: found = found ?? "th"
            case 0x0590...0x05FF: found = found ?? "he"
            case 0x0900...0x097F: found = found ?? "hi"
            case 0x0370...0x03FF: found = found ?? "el"
            default: continue
            }
        }
        return found
    }

    /// The recognizer locale, as an identifier from `supported` (e.g. "zh-CN"), or nil when none fits.
    /// - Parameters:
    ///   - lastLine: the person's latest line to Fox, if any.
    ///   - preferred: `Locale.preferredLanguages`, most preferred first (e.g. "en-US", "zh-Hans-CN").
    ///   - supported: the recognizer's locale identifiers ("zh_CN" or "zh-CN").
    public static func locale(lastLine: String?, preferred: [String], supported: [String]) -> String? {
        let available = supported.map { $0.replacingOccurrences(of: "_", with: "-") }
        let wanted = lastLine.flatMap(language(of:)) ?? preferred.first.map { parts($0).language } ?? "en"
        var candidates = preferred.map(parts).filter { $0.language == wanted }.compactMap { part in
            part.region.map { "\(part.language)-\($0)" }
        }
        if let usual = defaults[wanted] { candidates.append(usual) }
        for candidate in candidates {
            if let match = available.first(where: { $0.caseInsensitiveCompare(candidate) == .orderedSame }) { return match }
        }
        return available.first { parts($0).language == wanted }
    }

    private static let defaults = ["zh": "zh-CN", "ja": "ja-JP", "ko": "ko-KR", "ru": "ru-RU", "ar": "ar-SA",
                                   "th": "th-TH", "he": "he-IL", "hi": "hi-IN", "el": "el-GR", "en": "en-US",
                                   "es": "es-ES", "fr": "fr-FR", "de": "de-DE", "pt": "pt-BR", "it": "it-IT"]

    /// "zh-Hans-CN" → ("zh", "CN"); "en" → ("en", nil).
    private static func parts(_ identifier: String) -> (language: String, region: String?) {
        let pieces = identifier.replacingOccurrences(of: "_", with: "-").split(separator: "-").map(String.init)
        let region = pieces.dropFirst().first { piece in
            (piece.count == 2 && piece.allSatisfy(\.isLetter)) || (piece.count == 3 && piece.allSatisfy(\.isNumber))
        }
        return ((pieces.first ?? "").lowercased(), region?.uppercased())
    }
}
