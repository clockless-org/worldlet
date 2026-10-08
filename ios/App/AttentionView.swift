import SwiftUI
import WorldletKit

/// The Attention Center in three layers, one above the other (owner decision 2026-10-03): the **Applet world** on top,
/// **Now** in the middle, where the app opens, and **Later** below. Swiping down on Now brings the Applet world down;
/// swiping up turns to Later. Later's list and the Applet world scroll on their own; pulling Later down past its top, or
/// the Applet world up past its end, comes back to Now. The tabs at the top go to any layer. Tapping a row opens its
/// card; holding it offers Done, Later and Remove. The computer settles the item and sends the new Center. Widgets for
/// now lead Now and are moment Applets in the Applet world; one opens over everything.
struct AttentionCenter: View {
    @Environment(AppModel.self) private var model
    let open: (AttentionItem) -> Void
    let openApplet: (PhoneApplet) -> Void
    @State private var page = Layer.now
    @State private var widget: OpenWidget?
    /// Now is too long for the screen even as titles, so it scrolls and turns the layer itself at either end.
    @State private var nowScrolls = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Layer: String, CaseIterable {
        case applets, now, later
        var index: Int { Self.allCases.firstIndex(of: self)! }
    }

    var body: some View {
        VStack(spacing: 6) {
            PageTabs(page: page) { turn(to: $0) }
                .zIndex(1)
            GeometryReader { box in
                let height = box.size.height
                // The finger's drag lives in LayerStack, so following it moves the layers without rebuilding them.
                LayerStack(index: page.index, height: height, swipes: page == .now && !nowScrolls, turn: { turn(to: $0) }) {
                    // Only the layer in view takes touches and is read out; the others show only while one slides in.
                    AppletWorld(open: openTile, details: { openApplet($0) }, back: { turn(to: .now) }, shown: page == .applets).frame(height: height)
                        .allowsHitTesting(page == .applets)
                    NowPage(open: open, openWidget: { widget = OpenWidget(id: $0.id) }, scrolls: $nowScrolls, turn: turn(to:), shown: page == .now)
                        .frame(height: height, alignment: .top)
                        // A Now taller than its layer must not show through Later or the Applet world.
                        .clipped()
                        .contentShape(Rectangle())
                        .allowsHitTesting(page == .now)
                    LaterPage(open: open, back: { turn(to: .now) }, shown: page == .later).frame(height: height)
                        .allowsHitTesting(page == .later)
                }
                .accessibilityScrollAction { edge in
                    if edge == .top, page != .applets { turn(to: page == .later ? .now : .applets) }
                    if edge == .bottom, page != .later { turn(to: page == .applets ? .now : .later) }
                }
            }
        }
        .fullScreenCover(item: $widget) { WidgetScreen(id: $0.id) }
        .task {
            if let id = Demo.argument("-widget") { widget = OpenWidget(id: id) }
            if let key = Demo.argument("-applet"), let applet = model.attention.applet(key) { openApplet(applet) }
            guard let start = Demo.argument("-page").flatMap(Layer.init(rawValue:)) else { return }
            try? await Task.sleep(for: .milliseconds(300))
            turn(to: start)
        }
    }

    /// A website opens in this app's own browser (owner request 2026-10-07).
    private func openTile(_ applet: PhoneApplet) {
        if let id = applet.widget { widget = OpenWidget(id: id) } else if applet.url != nil { model.browse(applet) } else { openApplet(applet) }
    }

    private func turn(to target: Layer) {
        // A little bounce as the layer slides in, while the segmented control moves its selection.
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.45, dampingFraction: 0.82)) {
            page = target
        }
    }
}

/// The three layers stacked one above the other, moved as one: the layer in view sits in the frame, and on Now the
/// finger pulls the Applet world down or Later up. Only the offset changes while the finger moves, so the pages inside
/// are not rebuilt and laid out again for every frame of a swipe.
private struct LayerStack<Layers: View>: View {
    let index: Int
    let height: CGFloat
    /// Now is in view and does not scroll on its own, so a vertical swipe turns the layer.
    let swipes: Bool
    let turn: (AttentionCenter.Layer) -> Void
    @ViewBuilder let layers: Layers
    @State private var drag: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) { layers }
            .offset(y: -CGFloat(index) * height + drag)
            .frame(height: height, alignment: .top)
            .clipped()
            .gesture(swipe, including: swipes ? .all : .subviews)
    }

    /// Down shows the Applet world coming down, up shows Later rising; a short or slow swipe springs back.
    private var swipe: some Gesture {
        DragGesture(minimumDistance: 14)
            .onChanged { value in
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                drag = value.translation.height
            }
            .onEnded { value in
                let travel = value.predictedEndTranslation.height
                let target: AttentionCenter.Layer? = travel > height * 0.3 || value.translation.height > 90 ? .applets
                    : travel < -height * 0.3 || value.translation.height < -90 ? .later : nil
                withAnimation(target == nil ? .snappy : reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.45, dampingFraction: 0.82)) {
                    drag = 0
                }
                if let target { turn(target) }
            }
    }
}

/// The three layers as the system's segmented control at the top (owner request 2026-10-04: native controls): the
/// Applet world's grid mark, then Now and Later with how many they hold. On iOS 26 and later its selection is the
/// system's own drop of Liquid Glass, flowing to the next segment as the layer slides in.
private struct PageTabs: View {
    let page: AttentionCenter.Layer
    let choose: (AttentionCenter.Layer) -> Void

    var body: some View {
        Picker("Attention Center", selection: Binding(get: { page }, set: { choose($0) })) {
            Image(systemName: "square.grid.2x2").accessibilityLabel("Applets").tag(AttentionCenter.Layer.applets)
            Text("Now").tag(AttentionCenter.Layer.now)
            Text("Later").tag(AttentionCenter.Layer.later)
        }
        .pickerStyle(.segmented)
        .frame(width: 252)
        .padding(.top, 6)
        .accessibilityIdentifier("layerTabs")
    }
}

/// What matters now, in the Center's three groups.
private struct NowPage: View {
    @Environment(AppModel.self) private var model
    let open: (AttentionItem) -> Void
    let openWidget: (PhoneWidget) -> Void
    @Binding var scrolls: Bool
    let turn: (AttentionCenter.Layer) -> Void
    /// In view: off screen, its rows are hidden from VoiceOver and UI tests.
    var shown = true
    @State private var length: CGFloat = 0

    var body: some View {
        // Now is one screen, so a swipe up always turns to Later. A long Now first drops its rows' second line,
        // then the reasons, as the computer trims what does not fit. If even the titles are too tall (a small
        // iPhone, a busy day), they scroll, and pulling past the top or the end turns to the Applet world or Later.
        ViewThatFits(in: .vertical) {
            content(.full)
            content(.oneLine)
            content(.titles)
            scrolling
        }
        .padding(.bottom, 8)
    }

    private var scrolling: some View {
        GeometryReader { view in
            ScrollView {
                content(.titles)
                    .background { GeometryReader { box in Color.clear.onAppear { length = box.size.height }.onChange(of: box.size.height) { _, h in length = h } } }
                    .overlay(alignment: .top) {
                        PullMark(space: "now") { y in
                            if y > 90 { turn(.applets) } else if y < -max(0, length - view.size.height) - 90 { turn(.later) }
                        }
                    }
            }
            .coordinateSpace(name: "now")
            .scrollBounceBehavior(.always)
            .scrollIndicators(.hidden)
        }
        .onAppear { scrolls = true }
        .onDisappear { scrolls = false }
    }

    private func content(_ fit: HUDRow.Fit) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            let widgets = model.activeWidgets
            if !widgets.isEmpty {
                VStack(spacing: 8) { ForEach(widgets) { widget in WidgetRow(widget: widget, compact: fit != .full) { openWidget(widget) } } }
            }
            if !model.computerOnline, model.phase == .paired { ComputerOffline() }
            if let accounts = model.attention.accounts, !accounts.isEmpty {
                VStack(spacing: 8) { ForEach(accounts) { AccountRow(account: $0) } }
            }
            ForEach(model.attention.nowGroups) { section in
                GroupSection(title: section.group.title, color: Palette.group(section.group)) {
                    ForEach(section.items) { HUDRow(item: $0, open: open, fit: fit) }
                }
            }
            if model.attention.now.isEmpty, widgets.isEmpty { empty }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(!shown)
    }

    @ViewBuilder private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            if model.receivedAttention {
                Text("All clear for now.").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                Text("Worldlet moves things here as they become important.").font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85))
            } else {
                Text("Connecting to \(model.computerName.isEmpty ? "your computer" : model.computerName)…")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                Text("Keep Worldlet open on your computer. The Attention Center appears here in a moment.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85))
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
    }
}

/// What can wait, in the same three groups as Now: rows a little smaller and closer together, with a dashed rule
/// in their kind's colour, but just as readable. A quiet note says what Later is. The list scrolls freely.
private struct LaterPage: View {
    @Environment(AppModel.self) private var model
    let open: (AttentionItem) -> Void
    /// Pulled down past the top: back to Now.
    let back: () -> Void
    /// In view: off screen, its rows are hidden from VoiceOver and UI tests.
    var shown = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("These can wait. Each moves up to Now when it needs you.")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.6))
                    .padding(.horizontal, 10)
                if model.attention.later.isEmpty {
                    Text("Nothing is waiting.").font(.system(size: 14)).foregroundStyle(Palette.muted.opacity(0.85))
                        .padding(.horizontal, 10)
                }
                ForEach(AttentionGroup.allCases, id: \.self) { group in
                    let items = model.attention.later.filter { $0.group == group }
                    if !items.isEmpty {
                        GroupSection(title: group.title, color: Palette.group(group), spacing: 0) {
                            ForEach(items) { HUDRow(item: $0, open: open, later: true) }
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
            // Inside the scroll view: iOS 27 does not hide a scroll view's contents from outside it.
            .accessibilityHidden(!shown)
            .overlay(alignment: .top) { PullMark(space: "later") { if $0 > 90 { back() } } }
        }
        .coordinateSpace(name: "later")
        .scrollBounceBehavior(.always)
        .scrollIndicators(.hidden)
    }
}

/// How far a list is pulled past its top: a zero-height mark at the top of its content, read in the list's own
/// coordinate space (positive while the list bounces down).
struct PullMark: View {
    let space: String
    let pulled: (CGFloat) -> Void

    var body: some View {
        GeometryReader { mark in
            Color.clear.onChange(of: mark.frame(in: .named(space)).minY) { _, y in pulled(y) }
        }
        .frame(height: 0)
    }
}

/// A group heading in its kind's colour over a faint rule, then its rows.
private struct GroupSection<Rows: View>: View {
    let title: String
    let color: Color
    var spacing: CGFloat = 4
    @ViewBuilder let rows: Rows

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.3)
                .foregroundStyle(color)
                .padding(.horizontal, 8)
                .padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .bottom) { Rectangle().fill(color.opacity(0.22)).frame(height: 1) }
            rows
        }
    }
}

/// One Center row: the kind's mark, what to do, then when (in the kind's colour) and why.
struct HUDRow: View {
    @Environment(AppModel.self) private var model
    let item: AttentionItem
    let open: (AttentionItem) -> Void
    var later = false
    var fit = Fit.full

    /// How much of the row a crowded page keeps: two lines of facts, one, or the title and time only.
    enum Fit { case full, oneLine, titles }

    var body: some View {
        let color = Palette.group(item.group)
        Button { open(item) } label: {
            HStack(alignment: .top, spacing: 9) {
                KindMark(group: item.group)
                    .stroke(color, style: StrokeStyle(lineWidth: 1.7 * (later ? 18 : 22) / 24, lineCap: .round, lineJoin: .round))
                    .frame(width: later ? 18 : 22, height: later ? 18 : 22)
                    .frame(width: 24, height: later ? 20 : 21)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.headline)
                        .font(.system(size: later ? 15 : 16, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.leading)
                    facts(color: color)
                        .font(.system(size: 14))
                        .lineSpacing(1)
                        .lineLimit(fit == .full ? 2 : 1)
                        .multilineTextAlignment(.leading)
                        .opacity(0.82)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, later ? 6 : 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPress())
        .overlay(alignment: .leading) {
            if later {
                VerticalRule()
                    .stroke(color.opacity(0.55), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                    .frame(width: 2)
            }
        }
        .contextMenu {
            Button(item.group == .needsAction ? "Done" : "Got it", systemImage: "checkmark") { model.act(item, .done) }
            if !item.snoozed { Button("Later", systemImage: "clock") { model.act(item, .later) } }
            Button("Remove", systemImage: "trash", role: .destructive) { model.act(item, .remove) }
        }
        .accessibilityHint("\(item.group.title). Opens the card.")
    }

    private func facts(color: Color) -> Text {
        let time = item.timeLine
        let reason = fit == .titles && time != nil ? "" : item.context.isEmpty ? (item.title == item.headline ? "" : item.title) : item.context
        var line = Text("")
        if let time { line = Text(time).foregroundColor(color).fontWeight(.semibold) }
        if !reason.isEmpty { line = line + Text(time == nil ? reason : " · " + reason).foregroundColor(Palette.muted) }
        return line
    }
}

private struct VerticalRule: Shape {
    func path(in rect: CGRect) -> Path {
        Path { $0.move(to: CGPoint(x: rect.midX, y: rect.minY)); $0.addLine(to: CGPoint(x: rect.midX, y: rect.maxY)) }
    }
}

private struct RowPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Color(hex: 0xE3E5E5).opacity(configuration.isPressed ? 0.16 : 0), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// The kind's marker, the same outlines the computer draws (ui/attention/icon.ts, a 24-unit box):
/// Coming Up a diamond, Worth Doing a rounded square, Worth Knowing a circle.
struct KindMark: Shape {
    let group: AttentionGroup

    func path(in rect: CGRect) -> Path {
        let u = min(rect.width, rect.height) / 24
        let o = CGPoint(x: rect.midX - 12 * u, y: rect.midY - 12 * u)
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: o.x + x * u, y: o.y + y * u) }
        switch group {
        case .event:
            var path = Path()
            path.move(to: p(12, 2.6))
            path.addLine(to: p(21.4, 12))
            path.addLine(to: p(12, 21.4))
            path.addLine(to: p(2.6, 12))
            path.closeSubpath()
            return path
        case .needsAction:
            return Path(roundedRect: CGRect(origin: p(3.2, 3.2), size: CGSize(width: 17.6 * u, height: 17.6 * u)), cornerRadius: 2.6 * u)
        case .unseen:
            return Path(ellipseIn: CGRect(origin: p(3, 3), size: CGSize(width: 18 * u, height: 18 * u)))
        }
    }
}

extension AttentionItem {
    /// The row's time line. An event's start is recomputed here, so "Starts in 40 min" stays true while the row sits on
    /// the phone; otherwise the computer's own line (Due, Found, Back …) is shown as it wrote it.
    var timeLine: String? {
        if let start = startDate, group == .event, !snoozed {
            let clock = Calendar.current.isDateInToday(start) ? start.formatted(date: .omitted, time: .shortened)
                : start.formatted(.dateTime.month(.abbreviated).day().hour().minute())
            let short = RelativeDateTimeFormatter()
            short.unitsStyle = .short
            let relative = short.localizedString(for: start, relativeTo: Date())
            return (start > Date() ? "Starts " : "Started ") + relative + " · " + clock
        }
        if let fact, !fact.isEmpty { return fact }
        if let start = startDate {
            return start.formatted(.dateTime.month(.abbreviated).day().hour().minute())
        }
        return when.isEmpty ? nil : when
    }
}

/// An account the computer cannot read: connect it on the computer, or have the computer open its sign-in now.
struct AccountRow: View {
    @Environment(AppModel.self) private var model
    let account: AccountIssue

    var body: some View {
        let opened = model.openedOnComputer.contains(account.provider)
        HStack(spacing: 10) {
            Image(systemName: account.action == .permissions ? "lock.shield" : "exclamationmark.circle")
                .font(.system(size: 18))
                .foregroundStyle(Palette.lantern)
            VStack(alignment: .leading, spacing: 2) {
                Text("Connect \(account.title) on your computer").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.85)
                Text(opened ? "Opened on \(model.computerName.isEmpty ? "your computer" : model.computerName). Finish there."
                     : account.action == .permissions ? "Worldlet needs access again to read it." : "Its sign-in expired, so Worldlet can't read it.")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.85))
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
            Spacer(minLength: 6)
            if !opened {
                Button("Open") { model.connect(account) }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.forest)
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .tint(Palette.lantern)
                    .disabled(!model.computerOnline)
                    .accessibilityLabel("Open \(account.title) sign-in on the computer")
            }
        }
        .padding(10)
        .background(Palette.ink.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink.opacity(0.16), lineWidth: 1))
    }
}

struct ComputerOffline: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "moon.zzz").foregroundStyle(Palette.muted)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(model.computerName.isEmpty ? "Your computer" : model.computerName) is away")
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                Text("Open Worldlet on it to bring this up to date. Messages you send wait until then.")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.85))
                if let seen = model.computerSeenAt {
                    Text("Last updated \(seen.formatted(.relative(presentation: .named)))")
                        .font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.85))
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.ink.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if Demo.enabled {
                    Section {
                        Button("Leave the demo") {
                            dismiss()
                            Task { await model.unpair() }
                        }
                    } footer: {
                        Text("This is sample data. Pair with Worldlet on your computer to see your own.")
                    }
                } else {
                    Section("Computer") {
                        LabeledContent("Paired with", value: model.computerName.isEmpty ? "Your computer" : model.computerName)
                        LabeledContent("Status", value: model.computerOnline ? "Connected" : "Away")
                    }
                }
                Section {
                    if !Demo.enabled {
                        Button("Unpair this iPhone", role: .destructive) {
                            dismiss()
                            Task { await model.unpair() }
                        }
                    }
                } footer: {
                    Text("Messages between this iPhone and your computer are end-to-end encrypted. Worldlet passes them along but cannot read them.")
                }
                Section { LabeledContent("Version", value: AppModel.appVersion) }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
