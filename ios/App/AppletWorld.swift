import SwiftUI
import WorldletKit

/// The Applets tab (owner request 2026-10-11): the Applets that work on the phone, as a list in the computer's own
/// order, grouped by section. The person's things come first: each OpenClaw channel or long conversation that is one job
/// carried on is a thing of its own, found by the computer (core/tasks ongoingCandidates), and the first line said in
/// one makes it an Applet there with its own thread. Then the Applets working now, the connected accounts and the rest.
/// Applets that work only on the computer are not sent. A row's lamp breathes while its Applet works, shows a red dot
/// when it failed and fades when it is off; its badge counts the Now items it holds. A row with a website opens it in
/// this app's own browser (WebBrowser.swift), and holding it opens the Applet's page above Fox; a widget opens its page
/// and a thing its page, where Fox talks in that thing's own thread.
struct AppletList: View {
    @Environment(AppModel.self) private var model
    let open: (PhoneApplet) -> Void
    /// The Applet's page above Fox, for a row that opens its website.
    let details: (PhoneApplet) -> Void

    private let order: [PhoneApplet.Section] = [.jobs, .live, .accounts, .places]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                let applets = model.attention.applets ?? []
                if applets.isEmpty { empty }
                ForEach(order, id: \.self) { section in
                    let rows = applets.filter { $0.section == section }
                    if !rows.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Heading(title: section.title)
                            ForEach(rows) { applet in
                                AppletRow(applet: applet, held: held(applet)) { open(applet) }
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
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
    }

    /// How many Now items this Applet holds.
    private func held(_ applet: PhoneApplet) -> Int { model.attention.now.filter { $0.applet == applet.key }.count }

    @ViewBuilder private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Your Things").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
            Text("They appear here when \(model.computerName.isEmpty ? "your computer" : model.computerName) sends them. Update Worldlet there if this stays empty.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85))
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
    }
}

/// One row of the Applets tab: the Applet's device with its lamp, its name, what it is doing or its status, and when it
/// last said something.
struct AppletRow: View {
    let applet: PhoneApplet
    let held: Int
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                AppletTileFace(applet: applet, held: held, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(applet.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    if let line = applet.line, !line.isEmpty {
                        Text(line).font(.system(size: 13))
                            .foregroundStyle(applet.state == .failed ? Color(hex: 0xF08A84) : Palette.muted.opacity(0.8))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 6)
                if let last = applet.recent?.last, let at = FoxDialogueDates.date(last.at) {
                    Text(at, format: .relative(presentation: .named)).font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.65))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .opacity(applet.state == .off ? 0.5 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("applet-\(applet.key)")
        .accessibilityLabel(applet.title)
        .accessibilityValue([applet.isMine ? "Yours" : nil, applet.line, held > 0 ? "\(held) in Now" : nil].compactMap { $0 }.joined(separator: ", "))
    }
}

/// An Applet's device with its lamp, as its row shows it: a lantern glow that breathes while it works, a red dot when it
/// failed, the count of Now items it holds, and the honey star of the person's own Applet.
struct AppletTileFace: View {
    let applet: PhoneApplet
    let held: Int
    var size: CGFloat = 40
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        AppletGlyph(applet: applet, size: size)
            .background {
                // The device's lamp: a lantern glow behind it that breathes while the Applet works.
                if applet.state == .busy {
                    RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                        .fill(Palette.lantern.opacity(breathe ? 0.12 : 0.3))
                        .overlay(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                            .stroke(Palette.lantern.opacity(breathe ? 0.45 : 0.95), lineWidth: breathe ? 3 : 2))
                        .padding(-2)
                }
            }
            .overlay(alignment: .topTrailing) {
                if applet.state == .failed {
                    Circle().fill(Color(hex: 0xD9534F)).frame(width: 10, height: 10)
                        .overlay(Circle().stroke(Color.black.opacity(0.3), lineWidth: 1))
                        .offset(x: 3, y: -3)
                } else if held > 0 {
                    Text("\(held)")
                        .font(.system(size: 10, weight: .bold).monospacedDigit())
                        .foregroundStyle(Color(hex: 0x3A2C10))
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Palette.group(.needsAction), in: Capsule())
                        .offset(x: 5, y: -5)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                // The person's own Applet carries the honey star its device has on the computer
                // (core/applets/MY-APPLETS.md).
                if applet.isMine {
                    Image(systemName: "star.fill")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(Color(hex: 0xFFFAF0))
                        .frame(width: 14, height: 14)
                        .background(Circle().fill(Color(hex: 0xD9A441)))
                        .overlay(Circle().stroke(Color(hex: 0xFFF8EA), lineWidth: 1.5))
                        .offset(x: 4, y: 4)
                        .accessibilityHidden(true)
                }
            }
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
