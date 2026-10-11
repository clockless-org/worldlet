import SwiftUI
import WorldletKit

/// The phone in three tabs (owner request 2026-10-11), chosen with the system's segmented control at the top; Fox stays
/// below on every tab and talks about wherever the person is. **Today** is the computer's left side: the date, today's
/// Journal and the Attention Center, with Later below Now. **Applets** lists the Applets that work on the phone, the
/// person's things first (each OpenClaw channel or long conversation is a thing of its own, AppletWorld.swift).
/// **Tasks** is what sits either side of Fox on the computer: what the person's Agent is doing now and its Routines.
/// Tapping a row opens its card; holding it offers Done, Later and Remove. Widgets for now lead Today; one opens over
/// everything.
struct AttentionCenter: View {
    @Environment(AppModel.self) private var model
    let open: (AttentionItem) -> Void
    let openApplet: (PhoneApplet) -> Void
    @State private var tab = Tab.today
    @State private var widget: OpenWidget?
    @State private var entry: JournalEntry?

    enum Tab: String, CaseIterable {
        case today, applets, tasks

        var title: String {
            switch self {
            case .today: "Today"
            case .applets: "Applets"
            case .tasks: "Tasks"
            }
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            Picker("Worldlet", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .frame(width: 252)
            .padding(.top, 6)
            .accessibilityIdentifier("tabs")
            Group {
                switch tab {
                case .today: TodayPage(open: open, openWidget: { widget = OpenWidget(id: $0.id) }, openEntry: { entry = $0 })
                case .applets: AppletList(open: openTile, details: { openApplet($0) })
                case .tasks: TasksPage(openApplet: openApplet)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .fullScreenCover(item: $widget) { WidgetScreen(id: $0.id) }
        .sheet(item: $entry) { JournalSheet(entry: $0) }
        .task {
            if let id = Demo.argument("-widget") { widget = OpenWidget(id: id) }
            if let key = Demo.argument("-applet"), let applet = model.attention.applet(key) { openApplet(applet) }
            if let start = Demo.argument("-page").flatMap(Tab.init(rawValue:)) { tab = start }
        }
    }

    /// A website opens in this app's own browser (owner request 2026-10-07).
    private func openTile(_ applet: PhoneApplet) {
        if let id = applet.widget { widget = OpenWidget(id: id) } else if applet.url != nil { model.browse(applet) } else { openApplet(applet) }
    }
}

/// Today, as the computer's left side shows it (owner request 2026-10-11): the date, today's Journal, then what matters
/// now in the Center's three groups, and further down what can wait (Later), all in one scroll.
private struct TodayPage: View {
    @Environment(AppModel.self) private var model
    let open: (AttentionItem) -> Void
    let openWidget: (PhoneWidget) -> Void
    let openEntry: (JournalEntry) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DateHeader()
                journal
                let widgets = model.activeWidgets
                if !widgets.isEmpty {
                    VStack(spacing: 8) { ForEach(widgets) { widget in WidgetRow(widget: widget, compact: false) { openWidget(widget) } } }
                }
                if !model.computerOnline, model.phase == .paired { ComputerOffline() }
                if let accounts = model.attention.accounts, !accounts.isEmpty {
                    VStack(spacing: 8) { ForEach(accounts) { AccountRow(account: $0) } }
                }
                ForEach(model.attention.nowGroups) { section in
                    GroupSection(title: section.group.title, color: Palette.group(section.group)) {
                        ForEach(section.items) { HUDRow(item: $0, open: open) }
                    }
                }
                if model.attention.now.isEmpty, widgets.isEmpty { empty }
                later
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
    }

    /// Today's Journal: what Fox made and the cards the person closed, newest first; each opens in full.
    @ViewBuilder private var journal: some View {
        let entries = model.attention.journal ?? []
        VStack(alignment: .leading, spacing: 4) {
            Heading(title: "Journal")
            if entries.isEmpty {
                Text("Nothing in your Journal yet today.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.7))
                    .padding(.horizontal, 10)
            }
            ForEach(entries) { entry in
                Button { openEntry(entry) } label: {
                    HStack(alignment: .top, spacing: 9) {
                        Image(systemName: entry.kind == "attention" ? "rectangle.on.rectangle" : "book.closed")
                            .font(.system(size: 15)).foregroundStyle(Palette.lantern)
                            .frame(width: 24, height: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.leading)
                            if let text = entry.text, !text.isEmpty {
                                Text(text).font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.82)).lineLimit(1)
                            }
                        }
                        Spacer(minLength: 6)
                        if let at = FoxDialogueDates.date(entry.at) {
                            Text(at, format: .dateTime.hour().minute()).font(.system(size: 12)).foregroundStyle(Palette.muted.opacity(0.7))
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(RowPress())
                .accessibilityIdentifier("journal-\(entry.id)")
            }
        }
    }

    /// Below Now, what can wait, in the same three groups: rows a little smaller, with a dashed rule in their kind's
    /// colour.
    @ViewBuilder private var later: some View {
        VStack(alignment: .leading, spacing: 12) {
            Heading(title: "Later")
            Text("These can wait. Each moves up when it needs you.")
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
        .padding(.top, 14)
    }

    @ViewBuilder private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            if model.receivedAttention {
                Text("All clear for now.").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                Text("Worldlet moves things here as they become important.").font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85))
            } else {
                Text("Connecting to \(model.computerName.isEmpty ? "your computer" : model.computerName)…")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                Text("Keep Worldlet open on your computer. Today appears here in a moment.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85))
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
    }
}

/// The day at the top of Today, as the computer's left panel heads it: the weekday large, the date below.
private struct DateHeader: View {
    var body: some View {
        TimelineView(.everyMinute) { context in
            VStack(alignment: .leading, spacing: 0) {
                Text(context.date, format: .dateTime.weekday(.wide))
                    .font(.system(size: 28, weight: .bold, design: .rounded)).foregroundStyle(Palette.ink)
                Text(context.date, format: .dateTime.month(.wide).day())
                    .font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.muted.opacity(0.8))
            }
            .padding(.horizontal, 10)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("todayDate")
        }
    }
}

/// A Journal card in full, from Today.
private struct JournalSheet: View {
    let entry: JournalEntry
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text(entry.title).font(.system(size: 22, weight: .bold))
                    HStack(spacing: 6) {
                        if let category = entry.category { Text(category) }
                        if let at = FoxDialogueDates.date(entry.at) { Text(at, format: .dateTime.hour().minute()) }
                    }
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    if let text = entry.text { Text(markdown(text)).font(.system(size: 16)) }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Journal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// What the person's Agent is doing now and what it runs next (owner request 2026-10-11): the cards either side of Fox
/// on the computer (core/tasks task-panel.ts), as lists. A running task's row opens its Applet when the phone has it,
/// otherwise it unfolds what the task has said.
private struct TasksPage: View {
    @Environment(AppModel.self) private var model
    let openApplet: (PhoneApplet) -> Void
    @State private var unfolded: Set<String> = []

    var body: some View {
        let tasks = model.attention.tasks
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Heading(title: "Doing now")
                    if tasks?.now.isEmpty ?? true { quiet("Nothing running right now.") }
                    ForEach(tasks?.now ?? []) { task in running(task) }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Heading(title: "Routines")
                    if tasks?.routines.isEmpty ?? true { quiet("No Routines yet. Ask \(model.conversation.name) to set one up.") }
                    ForEach(tasks?.routines ?? []) { task in routine(task) }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
    }

    private func running(_ task: PhoneTask) -> some View {
        let applet = model.attention.applet(task.applet)
        return Button { tap(task, applet: applet) } label: {
            HStack(alignment: .top, spacing: 10) {
                picture(task, applet: applet)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(task.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(task.when).font(.system(size: 12)).foregroundStyle(Palette.lantern)
                    }
                    if !task.status.isEmpty {
                        Text(task.status).font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.85)).lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    if let progress = task.progress {
                        ProgressView(value: progress).tint(Palette.lantern)
                    } else {
                        ProgressView().progressViewStyle(.linear).tint(Palette.lantern)
                    }
                    if unfolded.contains(task.id), let lines = task.lines {
                        ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                            Text(line).font(.system(size: 12, design: .monospaced)).foregroundStyle(Palette.muted.opacity(0.8))
                        }
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPress())
        .accessibilityIdentifier("task-\(task.id)")
    }

    /// An Applet's task opens its Applet; any other running task unfolds or folds what it has said.
    private func tap(_ task: PhoneTask, applet: PhoneApplet?) {
        if let applet {
            openApplet(applet)
        } else if unfolded.contains(task.id) {
            unfolded.remove(task.id)
        } else {
            unfolded.insert(task.id)
        }
    }

    private func routine(_ task: PhoneTask) -> some View {
        HStack(alignment: .top, spacing: 10) {
            picture(task, applet: nil)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(task.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    Spacer(minLength: 6)
                    Text(task.when).font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.lantern)
                }
                let about = [task.every, task.by].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !about.isEmpty { Text(about).font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.8)).lineLimit(2) }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("routine-\(task.id)")
    }

    /// Fox for Fox's own work, a clock for a routine, the Applet's device for an Applet's task.
    @ViewBuilder private func picture(_ task: PhoneTask, applet: PhoneApplet?) -> some View {
        if let applet {
            AppletGlyph(applet: applet, size: 30)
        } else {
            Image(systemName: task.icon == "clock" ? "clock" : task.icon == "fox" ? "pawprint.fill" : "square.grid.2x2")
                .font(.system(size: 15)).foregroundStyle(Palette.lantern)
                .frame(width: 30, height: 30)
                .background(Palette.ink.opacity(0.1), in: RoundedRectangle(cornerRadius: 9))
        }
    }

    private func quiet(_ text: String) -> some View {
        Text(text).font(.system(size: 13)).foregroundStyle(Palette.muted.opacity(0.7)).padding(.horizontal, 10)
    }
}

/// A heading on Today, Applets and Tasks: small capitals over a faint rule.
struct Heading: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.3)
            .foregroundStyle(Palette.muted.opacity(0.75))
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { Rectangle().fill(Palette.ink.opacity(0.14)).frame(height: 1) }
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
