/// Where model-written Markdown is bold. Briefs and replies often put `**` right against Chinese text or punctuation
/// ("**时间：**10月5日", "请在**周五（10月9日）**前回复"), where CommonMark's flanking rules, and so
/// `AttributedString(markdown:)`, leave the asterisks as literal text (owner report 2026-10-04). Any closed pair on one
/// line whose text starts with a non-space is bold here, as on the computer (ui/components/markdown.ts); asterisks
/// inside backticks or escaped with a backslash stay as they are. The app renders each segment's other inline syntax.
public func strongSegments(_ text: String) -> [(text: String, strong: Bool)] {
    let chars = Array(text)
    var segments: [(text: String, strong: Bool)] = []
    var plain = ""
    // The index of the `**` that closes the pair opened at `start`, on the same line and outside code, or nil.
    func close(from start: Int) -> Int? {
        var i = start, code = false
        while i < chars.count, chars[i] != "\n" {
            if chars[i] == "\\" { i += 2; continue }
            if chars[i] == "`" { code.toggle() }
            if !code, chars[i] == "*", i + 1 < chars.count, chars[i + 1] == "*",
               i + 2 >= chars.count || chars[i + 2] != "*" { return i }
            i += 1
        }
        return nil
    }
    var i = 0, code = false
    while i < chars.count {
        let c = chars[i]
        if c == "\\", i + 1 < chars.count { plain.append(c); plain.append(chars[i + 1]); i += 2; continue }
        if c == "`" { code.toggle() }
        if c == "\n" { code = false }
        if !code, c == "*", i + 1 < chars.count, chars[i + 1] == "*", i + 2 < chars.count, !chars[i + 2].isWhitespace,
           let end = close(from: i + 2), end > i + 2 {
            if !plain.isEmpty { segments.append((plain, false)); plain = "" }
            segments.append((String(chars[(i + 2)..<end]), true))
            i = end + 2
            continue
        }
        plain.append(c)
        i += 1
    }
    if !plain.isEmpty { segments.append((plain, false)) }
    return segments
}
