import SwiftUI
import WorldletKit

/// The card a row opens: the computer's card (docs/ATTENTION-CENTER.md "Brief card composition") drawn the iOS way.
/// It slides down from the top on paper with the item's illustration across its head, the kind, title, when and where
/// it came from, the saved brief, and the person's own controls at its foot: one prominent outcome (Done for a task,
/// Got it otherwise), Later (tomorrow) and Dismiss (the item stays). Each sends the card flying the way it points
/// (Later up, Dismiss left, Done right) and brings down the next item's card. The close button, a swipe up or a tap
/// anywhere beside it closes it.
struct AttentionCard: View {
    @Environment(AppModel.self) private var model
    let item: AttentionItem
    let next: (AttentionItem?) -> Void
    /// Opens the Applet the item came from; the card gives way to its page.
    var openApplet: (PhoneApplet) -> Void = { _ in }
    @State private var drag: CGFloat = 0
    /// Where the card is flying off to after a choice: Later up, Dismiss left, Done right.
    @State private var fly: CGSize = .zero

    var body: some View {
        let accent = Palette.accent(item.group)
        VStack(spacing: 0) {
            // Short cards keep their own height; a long brief scrolls inside the card, its buttons staying put.
            ViewThatFits(in: .vertical) {
                content(accent: accent)
                ScrollView { content(accent: accent) }.scrollBounceBehavior(.basedOnSize)
            }
            footer(accent: accent)
        }
        .background(Palette.paper)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color(hex: 0xB4A17D).opacity(0.25)))
        // The shadow is the card's shape's own, so the card flies and follows the finger without redrawing offscreen.
        .background {
            RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Palette.paper)
                .shadow(color: .black.opacity(0.28), radius: 24, y: 12)
        }
        // The card is paper: its controls keep their light look over the dark world.
        .environment(\.colorScheme, .light)
        .offset(y: min(0, drag))
        .offset(fly)
        .rotationEffect(.degrees(Double(fly.width) / 30), anchor: .bottom)
        .opacity(fly == .zero ? 1 : 0.2)
        .gesture(DragGesture(minimumDistance: 12)
            .onChanged { drag = $0.translation.height }
            .onEnded { value in
                if value.translation.height < -80 || value.predictedEndTranslation.height < -200 { next(nil) }
                else { withAnimation(.snappy) { drag = 0 } }
            })
    }

    private func content(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Hero(name: item.art ?? Self.defaultArt(item.group))
                .overlay(alignment: .topTrailing) {
                    Button { next(nil) } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.primary)
                            .frame(width: 16, height: 16)
                    }
                    .glassButton()
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Close")
                    .padding(12)
                }
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    KindMark(group: item.group)
                        .stroke(accent, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                        .frame(width: 14, height: 14)
                    Text(item.group.title).font(.footnote.weight(.semibold))
                }
                .foregroundStyle(accent)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(accent.opacity(0.12), in: Capsule())
                Text(item.headline)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Palette.paperInk)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 4) {
                    if let time = item.timeLine { Label(time, systemImage: "clock") }
                    if let source = item.source, !source.isEmpty {
                        Label(Self.providerName(source), systemImage: Self.providerSymbol(source))
                    }
                }
                .font(.subheadline)
                .foregroundStyle(Palette.paperFoot)
                if let home = model.attention.applet(item.applet) {
                    // The item's home: its Applet's page takes the card's place.
                    Button { openApplet(home) } label: {
                        HStack(spacing: 6) {
                            AppletGlyph(applet: home, size: 22)
                            Text("From \(home.title)")
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold))
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Palette.paperInk)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .tint(Palette.paperInk)
                    .accessibilityLabel("Open \(home.title)")
                    .accessibilityIdentifier("cardApplet")
                }
                if !brief.isEmpty {
                    Divider().overlay(Palette.paperFoot.opacity(0.2)).padding(.vertical, 4)
                    Brief(text: brief).foregroundStyle(Palette.paperInk)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 8)
        }
    }

    /// The saved brief, or the row's own reason from an older computer.
    private var brief: String {
        if let summary = item.summary, !summary.isEmpty { return summary }
        return item.context
    }

    private func footer(accent: Color) -> some View {
        HStack(spacing: 10) {
            if !item.snoozed {
                Button("Later") { leave(CGSize(width: 0, height: -900)) { settle(.later) } }
                    .buttonStyle(.bordered)
            }
            Button("Dismiss") { leave(CGSize(width: -600, height: 40)) { next(following) } }
                .buttonStyle(.bordered)
            Button { leave(CGSize(width: 600, height: 40)) { settle(.done) } } label: {
                Text(item.group == .needsAction ? "Done" : "Got it").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .controlSize(.large)
        .tint(accent)
        .fontWeight(.semibold)
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 20)
    }

    /// The card flies off the way its choice points, then the next item's card comes down.
    private func leave(_ to: CGSize, then: @escaping () -> Void) {
        guard fly == .zero else { return }
        withAnimation(.easeIn(duration: 0.28)) { fly = to }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) { then() }
    }

    /// The item after this one in its list, for Dismiss: the card closes, the item stays, and the next one opens.
    private var following: AttentionItem? {
        let list = item.snoozed ? model.attention.later : model.attention.now
        guard let index = list.firstIndex(where: { $0.id == item.id }), index + 1 < list.count else { return nil }
        return list[index + 1]
    }

    private func settle(_ action: AttentionAction) {
        let list = item.snoozed ? model.attention.later : model.attention.now
        let index = list.firstIndex { $0.id == item.id }
        model.act(item, action)
        let rest = item.snoozed ? model.attention.later.filter { $0.snoozed } : model.attention.now
        if let index, !rest.isEmpty { next(rest[min(index, rest.count - 1)]) } else { next(nil) }
    }

    static func defaultArt(_ group: AttentionGroup) -> String {
        switch group {
        case .event: "coming-up"
        case .needsAction: "do-something"
        case .unseen: "worth-knowing"
        }
    }

    static func providerName(_ id: String) -> String {
        let known = ["gmail": "Gmail", "google-calendar": "Google Calendar", "github": "GitHub", "outlook": "Outlook",
                     "apple-calendar": "Calendar", "apple-reminders": "Reminders", "notion": "Notion", "slack": "Slack"]
        return known[id] ?? id.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }

    static func providerSymbol(_ id: String) -> String {
        if id.contains("mail") || id == "outlook" { return "envelope" }
        if id.contains("calendar") { return "calendar" }
        if id.contains("reminder") { return "checklist" }
        if id == "github" { return "chevron.left.forwardslash.chevron.right" }
        return "app"
    }
}

/// The item's painted illustration across the top of the card, fading softly into the paper below it.
private struct Hero: View {
    let name: String

    var body: some View {
        let picture = UIImage(named: name) ?? UIImage(named: "worth-knowing")
        Color.clear
            .frame(height: 190)
            .frame(maxWidth: .infinity)
            .overlay {
                if let picture { Image(uiImage: picture).resizable().scaledToFill() }
            }
            .clipped()
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [Palette.paper.opacity(0), Palette.paper], startPoint: .top, endPoint: .bottom)
                    .frame(height: 36)
            }
            .accessibilityHidden(true)
    }
}

/// The brief's Markdown: paragraphs and bullet points, with bold key points in the body colour.
private struct Brief: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                if block.bullet {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•")
                        Text(Self.inline(block.text))
                    }
                } else {
                    Text(Self.inline(block.text))
                }
            }
        }
        .font(.system(size: 16))
        .lineSpacing(4)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var blocks: [(bullet: Bool, text: String)] {
        text.components(separatedBy: "\n").compactMap { raw in
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty else { return nil }
            for marker in ["- ", "* ", "• "] where line.hasPrefix(marker) { return (true, String(line.dropFirst(marker.count))) }
            if line.hasPrefix("#") { return (false, "**" + line.drop { $0 == "#" || $0 == " " } + "**") }
            return (false, line)
        }
    }

    static func inline(_ text: String) -> AttributedString { markdown(text) }
}
