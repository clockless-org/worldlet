import SwiftUI
import WorldletKit

/// The Applet world, the layer above Now (owner decision 2026-10-03): the World behind the Center comes forward as a grid
/// of the Applets that work on the phone, in the computer's own order (owner request 2026-10-07): the person's own
/// under Yours, then the others, those at work or holding Now items first; Applets that work only on the computer are
/// not sent. A tile breathes a lantern ring while its Applet works, like the device's lamp on the computer, shows a red
/// dot when it failed and fades when it is off; its badge counts the Now items it holds. A tile with a website opens it
/// in this app's own browser (WebBrowser.swift), and holding it opens the Applet's page above Fox; a widget opens its page
/// and an ongoing thing its page.
struct AppletWorld: View {
    @Environment(AppModel.self) private var model
    let open: (PhoneApplet) -> Void
    /// The Applet's page above Fox, for a tile that opens its website.
    let details: (PhoneApplet) -> Void
    /// Pulled up past its end: back to Now.
    let back: () -> Void
    /// In view: off screen, its tiles are hidden from VoiceOver and UI tests.
    var shown = true
    @State private var content: CGFloat = 0

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: 4)

    var body: some View {
        GeometryReader { view in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    let applets = model.attention.applets ?? []
                    if applets.isEmpty { empty }
                    ForEach([true, false], id: \.self) { mine in
                        let tiles = applets.filter { $0.isMine == mine }
                        if !tiles.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text((mine ? "Yours" : "Applets").uppercased())
                                    .font(.system(size: 11, weight: .semibold))
                                    .tracking(0.3)
                                    .foregroundStyle(Palette.muted.opacity(0.75))
                                    .padding(.horizontal, 8)
                                    .padding(.bottom, 6)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .overlay(alignment: .bottom) { Rectangle().fill(Palette.ink.opacity(0.14)).frame(height: 1) }
                                LazyVGrid(columns: columns, spacing: 14) {
                                    ForEach(tiles) { applet in
                                        AppletTile(applet: applet, held: held(applet)) { open(applet) }
                                            .contextMenu {
                                                if applet.url != nil {
                                                    Button { details(applet) } label: { Label("Details", systemImage: "info.circle") }
                                                }
                                            }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                // Inside the scroll view: iOS 27 does not hide a scroll view's contents from outside it.
                .accessibilityHidden(!shown)
                .background { GeometryReader { box in Color.clear.onAppear { content = box.size.height }.onChange(of: box.size.height) { _, h in content = h } } }
                // Pulled up past the end of the grid (or past its top edge when the grid is short) returns to Now.
                .overlay(alignment: .top) {
                    PullMark(space: "applets") { y in if y < -max(0, content - view.size.height) - 90 { back() } }
                }
            }
            .coordinateSpace(name: "applets")
            .scrollBounceBehavior(.always)
            .scrollIndicators(.hidden)
        }
    }

    /// How many Now items this Applet holds.
    private func held(_ applet: PhoneApplet) -> Int { model.attention.now.filter { $0.applet == applet.key }.count }

    @ViewBuilder private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Your Applets").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
            Text("They appear here when \(model.computerName.isEmpty ? "your computer" : model.computerName) sends them. Update Worldlet there if this stays empty.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85))
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
    }
}

/// One Applet in the grid: its device from the World, as the computer draws it, and its name below.
struct AppletTile: View {
    @Environment(AppModel.self) private var model
    let applet: PhoneApplet
    let held: Int
    let open: () -> Void
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: open) {
            VStack(spacing: 6) {
                AppletGlyph(applet: applet, size: 60)
                    .background {
                        // The device's lamp: a lantern glow behind it that breathes while the Applet works.
                        if applet.state == .busy {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(Palette.lantern.opacity(breathe ? 0.12 : 0.3))
                                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(Palette.lantern.opacity(breathe ? 0.45 : 0.95), lineWidth: breathe ? 3 : 2))
                                .padding(-2)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if applet.state == .failed {
                            Circle().fill(Color(hex: 0xD9534F)).frame(width: 11, height: 11)
                                .overlay(Circle().stroke(Color.black.opacity(0.3), lineWidth: 1))
                                .offset(x: 4, y: -4)
                        } else if held > 0 {
                            Text("\(held)")
                                .font(.system(size: 11, weight: .bold).monospacedDigit())
                                .foregroundStyle(Color(hex: 0x3A2C10))
                                .padding(.horizontal, 5)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(Palette.group(.needsAction), in: Capsule())
                                .offset(x: 6, y: -6)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        // The person's own Applet carries the honey star its device has on the computer
                        // (core/applets/MY-APPLETS.md).
                        if applet.isMine {
                            Image(systemName: "star.fill")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(Color(hex: 0xFFFAF0))
                                .frame(width: 17, height: 17)
                                .background(Circle().fill(Color(hex: 0xD9A441)))
                                .overlay(Circle().stroke(Color(hex: 0xFFF8EA), lineWidth: 1.5))
                                .offset(x: 5, y: 5)
                                .accessibilityHidden(true)
                        }
                    }
                Text(applet.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .opacity(applet.state == .off ? 0.45 : 1)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("applet-\(applet.key)")
        .accessibilityLabel(applet.title)
        .accessibilityValue([applet.isMine ? "Yours" : nil, applet.line, held > 0 ? "\(held) in Now" : nil].compactMap { $0 }.joined(separator: ", "))
        .onAppear { startBreathing() }
        .onChange(of: applet.state) { _, _ in startBreathing() }
    }

    /// The lamp breathes every 2.4 seconds while the Applet works, as on the computer; still under reduced motion.
    private func startBreathing() {
        breathe = false
        guard applet.state == .busy, !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { breathe = true }
    }
}

/// An Applet's face: its device from the World (owner request 2026-10-04: the phone uses Worldlet's own Applet art,
/// Assets.xcassets/Applets, made by scripts/ios-applet-icons.mjs). Moment Applets and ongoing things show their own
/// devices; an Applet the phone has no art for yet (a newer computer) falls back to its initial on glass.
struct AppletGlyph: View {
    let applet: PhoneApplet
    var size: CGFloat = 60

    var body: some View {
        if let icon = UIImage(named: applet.iconName) {
            Image(uiImage: icon)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        } else {
            let shape = RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            Text(String(applet.title.first.map(String.init) ?? "·").uppercased())
                .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                .foregroundStyle(Palette.ink)
                .frame(width: size, height: size)
                .liquidGlass(shape, interactive: false)
        }
    }
}

extension PhoneApplet {
    /// The asset with this Applet's device: `applet-<key>`, `applet-moment` for a Moment Applet and `applet-ongoing`
    /// for a thing brought from another Agent.
    var iconName: String {
        if widget != nil { return "applet-moment" }
        if key.hasPrefix("job-") { return "applet-ongoing" }
        return "applet-" + key
    }
}

/// An Applet's page on the phone: it rises from the bottom over the Center and stops above Fox, who stays where it is
/// and talks about this Applet. Top to bottom: the Applet with what it is doing, Open (its website) or Open on the
/// computer, the items it
/// brought to the Center (each opens its card), and its latest lines from the world log. A swipe down, the close
/// button or the pill's ✕ above Fox goes back to where the page was opened from.
struct AppletPage: View {
    @Environment(AppModel.self) private var model
    let applet: PhoneApplet
    let open: (AttentionItem) -> Void
    let close: () -> Void
    @State private var drag: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Palette.ink.opacity(0.35)).frame(width: 38, height: 5).padding(.top, 8).padding(.bottom, 4)
            header
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 8)
                    .onChanged { drag = max(0, $0.translation.height) }
                    .onEnded { value in
                        if value.translation.height > 90 || value.predictedEndTranslation.height > 260 { close() }
                        else { withAnimation(.snappy) { drag = 0 } }
                    })
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    let items = model.attention.items(of: applet)
                    if !items.isEmpty {
                        section("From here") {
                            ForEach(items) { HUDRow(item: $0, open: open, later: $0.snoozed) }
                        }
                    }
                    if let recent = applet.recent, !recent.isEmpty {
                        section("Recent") {
                            ForEach(Array(recent.reversed().enumerated()), id: \.offset) { _, line in
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    Text(line.text).font(.system(size: 14)).foregroundStyle(Palette.ink)
                                    Spacer(minLength: 6)
                                    if let at = FoxDialogueDates.date(line.at) {
                                        Text(at, format: .relative(presentation: .named)).font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.7))
                                    }
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    if items.isEmpty, applet.recent?.isEmpty ?? true {
                        Text("Nothing from \(applet.title) needs you right now. Ask \(model.conversation.name) below, or open it on your computer.")
                            .font(.system(size: 14)).foregroundStyle(Palette.muted.opacity(0.85))
                            .padding(.horizontal, 10)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)
        }
        // The shadow is the sheet's shape's own, not its contents', so moving the page does not redraw them offscreen.
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26, style: .continuous)
                .fill(Color(hex: 0x1E2A22).opacity(0.94))
                .shadow(color: .black.opacity(0.35), radius: 18, y: -6)
        }
        .overlay(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26, style: .continuous).stroke(Palette.ink.opacity(0.14), lineWidth: 1))
        .offset(y: drag)
        // A container of its own, so its identifier does not replace its buttons' (iOS 27 passes it down to them).
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("appletPage")
    }

    private var header: some View {
        HStack(spacing: 12) {
            AppletGlyph(applet: applet, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(applet.title).font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.ink)
                HStack(spacing: 6) {
                    if applet.state == .busy { ProgressView().controlSize(.mini).tint(Palette.lantern) }
                    Text(status).font(.system(size: 13)).foregroundStyle(applet.state == .failed ? Color(hex: 0xF08A84) : Palette.muted.opacity(0.85))
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if applet.url != nil {
                Button { model.browse(applet) } label: {
                    Label("Open", systemImage: "safari")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Palette.forest)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .tint(Palette.lantern)
                .accessibilityLabel("Open \(applet.title)")
                .accessibilityIdentifier("openWebsite")
            } else if applet.widget == nil {
                let opened = model.openedApplets.contains(applet.key)
                Button { model.openOnComputer(applet) } label: {
                    Label(opened ? "Opened" : "On computer", systemImage: opened ? "checkmark" : "desktopcomputer")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Palette.forest)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .tint(Palette.lantern)
                .disabled(!model.computerOnline || opened)
                .accessibilityLabel("Open \(applet.title) on the computer")
                .accessibilityIdentifier("openOnComputer")
            }
            Button(action: close) {
                Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.ink)
                    .frame(width: 18, height: 18)
            }
            .glassButton()
            .buttonBorderShape(.circle)
            .accessibilityLabel("Close")
            .accessibilityIdentifier("closeApplet")
        }
    }

    private var status: String {
        if let line = applet.line, !line.isEmpty { return line }
        switch applet.state {
        case .busy: return "Working…"
        case .ready: return "Ready"
        case .failed: return "Something went wrong. Check it on your computer."
        case .off: return "Not connected"
        }
    }

    private func section<Rows: View>(_ title: String, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.3)
                .foregroundStyle(Palette.muted.opacity(0.75))
                .padding(.horizontal, 8)
                .padding(.bottom, 4)
            rows()
        }
    }
}

/// ISO 8601 times from the computer, with or without fractional seconds.
enum FoxDialogueDates {
    static func date(_ text: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
