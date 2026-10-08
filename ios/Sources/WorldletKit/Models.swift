import Foundation

// The payloads the desktop seals for the phone and the messages the phone sends back. They mirror
// core/phone/payloads.ts; change both together.

public enum AttentionGroup: String, Codable, Sendable, CaseIterable {
    case event, needsAction, unseen

    public var title: String {
        switch self {
        case .event: "Coming Up"
        case .needsAction: "Worth Doing"
        case .unseen: "Worth Knowing"
        }
    }
}

public struct AttentionItem: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let ids: [String]
    public let group: AttentionGroup
    public let title: String
    public let action: String
    public let context: String
    public let start: String?
    public let when: String
    public let level: Int
    public let snoozed: Bool
    /// The row's time line as the computer's Center writes it ("Due tomorrow · 5:00 PM", "Back tomorrow").
    /// This field and the two below are absent from computers older than them.
    public let fact: String?
    /// The card's saved brief, in Markdown.
    public let summary: String?
    /// The provider the item came from (gmail, google-calendar, …).
    public let source: String?
    /// The card's illustration: a picture the app bundles (scene-<id>, coming-up, do-something or worth-knowing).
    public let art: String?
    /// Fox's dialogue on this item's card; absent from computers older than it.
    public let fox: ItemFox?
    /// The key of the Applet the item came from, its home in the Applet world; absent when the World has none.
    public let applet: String?

    public init(id: String, ids: [String], group: AttentionGroup, title: String, action: String, context: String,
                start: String?, when: String, level: Int, snoozed: Bool,
                fact: String? = nil, summary: String? = nil, source: String? = nil, art: String? = nil, fox: ItemFox? = nil,
                applet: String? = nil) {
        self.id = id
        self.ids = ids
        self.group = group
        self.title = title
        self.action = action
        self.context = context
        self.start = start
        self.when = when
        self.level = level
        self.snoozed = snoozed
        self.fact = fact
        self.summary = summary
        self.source = source
        self.art = art
        self.fox = fox
        self.applet = applet
    }

    /// The line the Center shows first: what to do, or the item's own title.
    public var headline: String { action.isEmpty ? title : action }

    public var startDate: Date? {
        guard let start else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: start) ?? ISO8601DateFormatter().date(from: start)
    }
}

/// Fox's dialogue on an item's card, as the computer shows it: the line Fox says when the card opens, the one option it
/// offers, and the item's own latest turns (newest last).
public struct ItemFox: Codable, Hashable, Sendable {
    public struct Turn: Codable, Hashable, Sendable {
        /// What the person said (or the option they chose); empty for a line Fox said on its own.
        public let user: String
        /// Fox's answer, or its current step while `working`.
        public let text: String
        public let working: Bool
        public let at: String

        public init(user: String, text: String, working: Bool, at: String) {
            self.user = user
            self.text = text
            self.working = working
            self.at = at
        }
    }

    public let say: String
    public let option: String
    public let turns: [Turn]

    public init(say: String, option: String, turns: [Turn]) {
        self.say = say
        self.option = option
        self.turns = turns
    }
}

/// One group of Now, as the Center lists it.
public struct AttentionSection: Identifiable, Sendable, Equatable {
    public let group: AttentionGroup
    public let items: [AttentionItem]
    public var id: AttentionGroup { group }
}

/// An account the computer cannot read until the person reconnects it (or allows access) on the computer. The phone
/// never signs in; it can only ask the computer to open the sign-in.
public struct AccountIssue: Codable, Identifiable, Hashable, Sendable {
    public enum Action: String, Codable, Sendable { case reconnect, permissions }
    public let provider: String
    public let title: String
    public let action: Action
    public var id: String { provider }

    public init(provider: String, title: String, action: Action) {
        self.provider = provider
        self.title = title
        self.action = action
    }
}

/// One Applet in the Applet world, the layer above Now (core/phone/payloads.ts PhoneApplet): where the grid shows it,
/// its lamp, what it is doing or its status, its latest world log lines (newest last), the widget a moment Applet opens,
/// its own thread of Fox's conversation, and where one of the person's own Applets came from (`site`, `page` or
/// `conversation`; absent for a built-in one), so its tile carries the mark its device has on the computer.
public struct PhoneApplet: Codable, Identifiable, Hashable, Sendable {
    public enum Section: String, Codable, Sendable, CaseIterable {
        /// Working now, holding Now items, or a widget for now.
        case live
        /// A connected account.
        case accounts
        /// A conversation brought from another Agent that the person made into an Applet (its key is `job-…`).
        case jobs
        /// Every other Applet in the World.
        case places

        public var title: String {
            switch self {
            case .live: "Working now"
            case .accounts: "Accounts"
            case .jobs: "Ongoing"
            case .places: "In your World"
            }
        }
    }

    public enum State: String, Codable, Sendable { case busy, ready, failed, off }

    public struct Line: Codable, Hashable, Sendable {
        public let text: String
        public let at: String

        public init(text: String, at: String) {
            self.text = text
            self.at = at
        }
    }

    public let key: String
    public let title: String
    public let section: Section
    public let state: State
    public let line: String?
    public let recent: [Line]?
    public let widget: String?
    public let fox: ItemFox?
    public let mine: String?
    /// The website the tile opens on the phone (owner request 2026-10-07); absent for a moment Applet or an ongoing
    /// thing, which open their own page, and from computers older than this field.
    public let url: URL?
    public var id: String { key }
    /// One of the person's own Applets, not a built-in one.
    public var isMine: Bool { mine != nil }

    public init(key: String, title: String, section: Section, state: State, line: String? = nil, recent: [Line]? = nil,
                widget: String? = nil, fox: ItemFox? = nil, mine: String? = nil, url: URL? = nil) {
        self.key = key
        self.title = title
        self.section = section
        self.state = state
        self.line = line
        self.recent = recent
        self.widget = widget
        self.fox = fox
        self.mine = mine
        self.url = url
    }

    private enum Keys: String, CodingKey { case key, title, section, state, line, recent, widget, fox, mine, url }

    /// A section or lamp this app does not know yet (from a newer computer) reads as "In your World" and off.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        key = try c.decode(String.self, forKey: .key)
        title = try c.decode(String.self, forKey: .title)
        section = (try? c.decode(Section.self, forKey: .section)) ?? .places
        state = (try? c.decode(State.self, forKey: .state)) ?? .off
        line = try c.decodeIfPresent(String.self, forKey: .line)
        recent = try c.decodeIfPresent([Line].self, forKey: .recent)
        widget = try c.decodeIfPresent(String.self, forKey: .widget)
        fox = try c.decodeIfPresent(ItemFox.self, forKey: .fox)
        mine = try? c.decodeIfPresent(String.self, forKey: .mine)
        // Only an https address opens; anything else leaves the tile on its page.
        url = (try? c.decodeIfPresent(String.self, forKey: .url)).flatMap { URL(string: $0) }.flatMap { $0.scheme == "https" ? $0 : nil }
    }
}

public struct AttentionSnapshot: Codable, Sendable, Equatable {
    public let v: Int
    public let at: String
    public let now: [AttentionItem]
    public let later: [AttentionItem]
    /// Absent from computers older than this field.
    public let accounts: [AccountIssue]?
    /// The Applet world; absent from computers older than it.
    public let applets: [PhoneApplet]?

    public init(v: Int = 1, at: String, now: [AttentionItem], later: [AttentionItem], accounts: [AccountIssue] = [],
                applets: [PhoneApplet]? = nil) {
        self.v = v
        self.at = at
        self.now = now
        self.later = later
        self.accounts = accounts
        self.applets = applets
    }

    /// The Applet with this key, if the computer sent it.
    public func applet(_ key: String?) -> PhoneApplet? {
        guard let key else { return nil }
        return applets?.first { $0.key == key }
    }

    /// The items whose home is this Applet: Now first, then Later.
    public func items(of applet: PhoneApplet) -> [AttentionItem] {
        (now + later).filter { $0.applet == applet.key }
    }

    public static let empty = AttentionSnapshot(v: 1, at: "", now: [], later: [])

    /// Now, in the Center's group order; empty groups are left out.
    public var nowGroups: [AttentionSection] {
        AttentionGroup.allCases.compactMap { group in
            let items = now.filter { $0.group == group }
            return items.isEmpty ? nil : AttentionSection(group: group, items: items)
        }
    }
}

public struct Turn: Codable, Identifiable, Hashable, Sendable {
    public enum Role: String, Codable, Sendable { case user, fox }
    public let id: String
    public let role: Role
    public let text: String
    public let at: String

    public init(id: String, role: Role, text: String, at: String) {
        self.id = id
        self.role = role
        self.text = text
        self.at = at
    }
}

public struct Conversation: Codable, Sendable, Equatable {
    public let v: Int
    public let at: String
    public let busy: Bool
    public let name: String
    public let messages: [Turn]

    public init(v: Int = 1, at: String, busy: Bool, name: String, messages: [Turn]) {
        self.v = v
        self.at = at
        self.busy = busy
        self.name = name
        self.messages = messages
    }

    public static let empty = Conversation(v: 1, at: "", busy: false, name: "Fox", messages: [])
}

/// The person's own Agent asks before it acts (core/phone/payloads.ts PhoneApproval, contracts/harness-services.ts
/// `approvals`): a dangerous command of Hermes Agent's, an exec request of OpenClaw's. It rides on the running turn; the
/// phone answers with `PhoneMessage.approval`, the same three choices as Fox's card on the computer.
public struct HarnessApproval: Codable, Sendable, Equatable {
    public enum Choice: String, Codable, Sendable, CaseIterable {
        case once, always, deny

        /// The button, as on the computer (ui/companion/fox-harness-approval.ts).
        public var label: String {
            switch self {
            case .once: "Allow once"
            case .always: "Always"
            case .deny: "Deny"
            }
        }

        /// The line the card keeps once answered.
        public var settled: String {
            switch self {
            case .once: "Allowed once."
            case .always: "Allowed. It will not ask again for this."
            case .deny: "Denied."
            }
        }
    }

    public let id: String
    public let title: String
    /// The command or input it asks about; empty when it says none.
    public let detail: String
    /// In the computer's order; Deny is always there.
    public let choices: [Choice]

    public init(id: String, title: String, detail: String = "", choices: [Choice]) {
        self.id = id
        self.title = title
        self.detail = detail
        self.choices = Choice.allCases.filter { $0 == .deny || choices.contains($0) }
    }

    private enum Keys: String, CodingKey { case id, title, detail, choices }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        // A choice this version does not know is left out, never shown as a button that cannot be answered.
        let raw = (try? c.decodeIfPresent([String].self, forKey: .choices)) ?? []
        self.init(id: String(try c.decode(String.self, forKey: .id).prefix(120)), title: String(try c.decode(String.self, forKey: .title).prefix(200)),
                  detail: String(((try? c.decodeIfPresent(String.self, forKey: .detail)) ?? "").prefix(2000)),
                  choices: raw.compactMap(Choice.init(rawValue:)))
    }
}

/// The turn Fox is on now, as it streams (core/phone/payloads.ts PhoneLive): `steps` are its thinking, newest last, and
/// `text` the reply so far. `item` is the Attention item whose card the turn was asked from; nil for the main
/// conversation. `done` marks the finished reply; `approval` is what the person's own Agent asks while it runs.
public struct LiveTurn: Codable, Sendable, Equatable {
    public let v: Int
    public let at: String
    public let id: String
    public let item: String?
    /// The Applet the turn was asked in (its thread); nil elsewhere and from older computers.
    public let applet: String?
    public let user: String
    public let steps: [String]
    public let text: String
    public let done: Bool
    /// Absent from computers older than approvals, and once the request is answered or expired.
    public let approval: HarnessApproval?

    public init(v: Int = 1, at: String, id: String, item: String? = nil, applet: String? = nil, user: String, steps: [String],
                text: String, done: Bool, approval: HarnessApproval? = nil) {
        self.v = v
        self.at = at
        self.id = id
        self.item = item
        self.applet = applet
        self.user = user
        self.steps = steps
        self.text = text
        self.done = done
        self.approval = approval
    }

    /// What the turn asks the person now: its approval while it runs, unless this phone already answered it.
    public func asking(answered: Set<String> = []) -> HarnessApproval? {
        guard !done, let approval, !approval.id.isEmpty, !answered.contains(approval.id) else { return nil }
        return approval
    }

    /// Whether the phone still shows this turn, `sent` being its `at`: a finished reply for two minutes, a running one
    /// for 90 seconds after the computer last sent it, and one waiting on an approval for ten minutes (the computer
    /// declines an unanswered request then), so a tapped notification still finds it.
    public func shown(sent: Date, now: Date = Date()) -> Bool {
        now.timeIntervalSince(sent) < (done ? 120 : approval != nil ? 600 : 90)
    }
}

public struct DesktopInfo: Codable, Sendable, Equatable {
    public let v: Int
    public let at: String
    public let name: String
    public let version: String
    /// True while the computer takes Orders (core/phone PhoneDesktop `order`): the dock shows its Order button. Absent
    /// from computers that don't.
    public let order: Bool?
}

/// The phone's own slot: the desktop shows its name in Settings.
public struct PhoneInfo: Codable, Sendable {
    public let v: Int
    public let name: String
    public let version: String

    public init(name: String, version: String) {
        v = 1
        self.name = name
        self.version = version
    }
}

public enum AttentionAction: String, Codable, Sendable { case done, later, remove }

/// What the phone may ask: a chat line for Fox, Done / Later / Remove on a Center item, opening an account's sign-in on
/// the computer, the entries the person changed in a widget, or an Order.
public enum PhoneMessage: Encodable, Sendable, Equatable {
    case chat(id: String, text: String)
    /// A line said with an item's card open: it joins that item's conversation on the computer.
    case ask(id: String, text: String, item: String)
    /// A line said inside an Applet's page: the computer opens that Applet, so it joins the Applet's thread.
    case tell(id: String, text: String, applet: String)
    /// Open this Applet on the computer.
    case openApplet(id: String, applet: String)
    /// The option Fox offers on an item's card.
    case option(id: String, item: String)
    case attention(id: String, action: AttentionAction)
    case connect(id: String, provider: String)
    /// The entries the person changed in a widget on the phone, stamped with the phone's clock; the computer merges
    /// them newest-wins (core/widgets mergeWidgetState), so sending one again is harmless.
    case widget(id: String, widget: String, state: WidgetState)
    /// What the person said with the Order button: the computer sends it to the team's Claude as an Order, never to Fox.
    case order(id: String, said: String)
    /// What happened on a website opened in this app's own browser (owner request 2026-10-07): the page observer's
    /// reports, which the computer keeps in its World by its own recording rules.
    case web(id: String, applet: String, records: [WebReport])
    /// The person's answer to the approval riding on the live turn (core/phone PhoneMessage `approval`).
    case approval(id: String, approval: String, choice: HarnessApproval.Choice)

    private enum Keys: String, CodingKey { case type, id, text, item, applet, action, provider, widget, state, said, records, approval, choice }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case let .chat(id, text):
            try c.encode("chat", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(text, forKey: .text)
        case let .ask(id, text, item):
            try c.encode("chat", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(text, forKey: .text)
            try c.encode(item, forKey: .item)
        case let .tell(id, text, applet):
            try c.encode("chat", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(text, forKey: .text)
            try c.encode(applet, forKey: .applet)
        case let .openApplet(id, applet):
            try c.encode("applet", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(applet, forKey: .applet)
            try c.encode("open", forKey: .action)
        case let .option(id, item):
            try c.encode("option", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(item, forKey: .item)
        case let .attention(id, action):
            try c.encode("attention", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(action, forKey: .action)
        case let .connect(id, provider):
            try c.encode("connect", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(provider, forKey: .provider)
        case let .widget(id, widget, state):
            try c.encode("widget", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(widget, forKey: .widget)
            try c.encode(state, forKey: .state)
        case let .order(id, said):
            try c.encode("order", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(said, forKey: .said)
        case let .web(id, applet, records):
            try c.encode("web", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(applet, forKey: .applet)
            try c.encode(records, forKey: .records)
        case let .approval(id, approval, choice):
            try c.encode("approval", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(approval, forKey: .approval)
            try c.encode(choice, forKey: .choice)
        }
    }
}

// MARK: Notifications

/// What one notification says (core/phone/payloads.ts PhonePush), sealed by the computer with place "push" and carried
/// as `b` in the APNs payload, so Apple and the relay see only the fallback text. `open` is where a tap goes.
public struct PhonePush: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case attention, fox, routine, task }
    public struct Open: Codable, Sendable, Equatable {
        public let item: String?
        public let applet: String?
        public let conversation: Bool?

        public init(item: String? = nil, applet: String? = nil, conversation: Bool? = nil) {
            self.item = item
            self.applet = applet
            self.conversation = conversation
        }
    }

    /// What the notification's own buttons answer (core/phone/payloads.ts PhonePushAct): `attention` an item's id (Done,
    /// Later), `reply` an inline reply where `open` points, `approval` a request's id (Allow once when `once`, and Deny).
    public struct Act: Codable, Sendable, Equatable {
        public let attention: String?
        public let reply: Bool?
        public let approval: String?
        public let once: Bool?

        public init(attention: String? = nil, reply: Bool? = nil, approval: String? = nil, once: Bool? = nil) {
            self.attention = attention
            self.reply = reply
            self.approval = approval
            self.once = once
        }
    }

    public let v: Int
    public let id: String
    /// When the computer sent it (milliseconds since 1970).
    public let at: Double
    /// Nil for a kind this version does not know; the notification still shows.
    public let kind: Kind?
    public let title: String
    public let body: String
    public let open: Open?
    /// Nil from older computers and for a notification without buttons.
    public let act: Act?

    public init(v: Int = 1, id: String, at: Double, kind: Kind?, title: String, body: String, open: Open? = nil, act: Act? = nil) {
        self.v = v
        self.id = id
        self.at = at
        self.kind = kind
        self.title = title
        self.body = body
        self.open = open
        self.act = act
    }

    private enum Keys: String, CodingKey { case v, id, at, kind, title, body, open, act }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        v = try c.decode(Int.self, forKey: .v)
        id = try c.decode(String.self, forKey: .id)
        at = try c.decode(Double.self, forKey: .at)
        kind = try? c.decodeIfPresent(Kind.self, forKey: .kind)
        // PHONE_PUSH_LIMITS: the computer clamps them already; a longer one is cut here, never trusted to fit.
        title = String(try c.decode(String.self, forKey: .title).prefix(80))
        body = String(try c.decode(String.self, forKey: .body).prefix(240))
        open = try? c.decodeIfPresent(Open.self, forKey: .open)
        act = try? c.decodeIfPresent(Act.self, forKey: .act)
    }

    public var target: PushTarget? { open.flatMap(PushTarget.init(open:)) }

    /// The notification category its buttons come from (the app registers them, PushAction.categories); nil for none.
    /// The first set the push carries counts, as core/phone reads it.
    public var category: String? {
        guard let act else { return nil }
        if let item = act.attention, !item.isEmpty { return PushAction.attentionCategory }
        if act.reply == true { return PushAction.replyCategory }
        if let approval = act.approval, !approval.isEmpty { return act.once == true ? PushAction.approvalCategory : PushAction.denyCategory }
        return nil
    }

    /// The sealed message a button sends the computer, the same one the app's own button sends: an item's Done or Later, a
    /// line said where the notification opens (the item's card, the Applet's page or the conversation; nil when `text` is
    /// empty), or the approval's answer. Nil for a button this notification does not offer.
    public func message(for action: PushAction, text: String? = nil, id: String = UUID().uuidString) -> PhoneMessage? {
        guard let category, PushAction.buttons[category]?.contains(action) == true, let act else { return nil }
        switch action {
        case .done: return .attention(id: act.attention ?? "", action: .done)
        case .later: return .attention(id: act.attention ?? "", action: .later)
        case .allow: return .approval(id: id, approval: act.approval ?? "", choice: .once)
        case .deny: return .approval(id: id, approval: act.approval ?? "", choice: .deny)
        case .reply:
            let line = String((text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(4000))
            guard !line.isEmpty else { return nil }
            switch target {
            case let .item(item)?: return .ask(id: id, text: line, item: item)
            case let .applet(applet)?: return .tell(id: id, text: line, applet: applet)
            default: return .chat(id: id, text: line)
            }
        }
    }
}

/// A button on a notification (core/phone/README.md, Push › Actions); the raw value is its action identifier.
public enum PushAction: String, CaseIterable, Sendable {
    case done = "worldlet.done", later = "worldlet.later", reply = "worldlet.reply", allow = "worldlet.allow", deny = "worldlet.deny"

    public static let attentionCategory = "worldlet.attention"
    public static let replyCategory = "worldlet.reply"
    public static let approvalCategory = "worldlet.approval"
    public static let denyCategory = "worldlet.approval.deny"
    /// Each category's buttons, in the order they show.
    public static let buttons: [String: [PushAction]] = [
        attentionCategory: [.done, .later], replyCategory: [.reply], approvalCategory: [.allow, .deny], denyCategory: [.deny],
    ]

    public var label: String {
        switch self {
        case .done: "Done"
        case .later: "Later"
        case .reply: "Reply"
        case .allow: "Allow once"
        case .deny: "Deny"
        }
    }
}

/// Where tapping a notification opens the app: an item's card, an Applet's page or Fox's dialogue.
public enum PushTarget: Equatable, Sendable {
    case item(String)
    case applet(String)
    case conversation

    /// The first of item, applet and conversation that is set.
    public init?(open: PhonePush.Open) {
        if let item = open.item, !item.isEmpty { self = .item(item) }
        else if let applet = open.applet, !applet.isEmpty { self = .applet(applet) }
        else if open.conversation == true { self = .conversation }
        else { return nil }
    }

    /// The `open` entry the Notification Service Extension adds to the notification's userInfo.
    public init?(userInfo: [AnyHashable: Any]) {
        guard let open = userInfo["open"] as? [String: Any] else { return nil }
        self.init(open: PhonePush.Open(item: open["item"] as? String, applet: open["applet"] as? String,
                                       conversation: open["conversation"] as? Bool))
    }

    public var userInfo: [String: Any] {
        switch self {
        case let .item(id): ["item": id]
        case let .applet(key): ["applet": key]
        case .conversation: ["conversation": true]
        }
    }
}

// MARK: Website recording

/// One report from the page observer (platform/bridge/web-record.js, copied to App/web-record.js) on a website opened
/// in this app's browser, with this phone's time in seconds (core/phone/payloads.ts PhoneWebRecord). The observer
/// never reports passwords, card numbers or one-time codes, and says `private` when a page shows such a field.
public struct WebReport: Codable, Hashable, Sendable {
    public var at: Double
    public var kind: String
    public var url: String
    public var title: String?
    public var text: String?
    public var field: String?
    public var value: String?
    public var label: String?
    public var href: String?
    public var fields: [String]?

    public static let kinds: Set<String> = ["page", "text", "text-more", "input", "click", "submit", "private"]
    /// A page's text is cut to this many bytes, so one report always fits a sealed box.
    public static let textLimit = 90_000

    /// The observer's JSON, stamped with `at`; nil for anything else.
    public static func read(_ json: String, at: Date) -> WebReport? {
        guard var report = try? JSONDecoder().decode(Observed.self, from: Data(json.utf8)).report(at: at) else { return nil }
        guard kinds.contains(report.kind), report.url.lowercased().hasPrefix("https://") else { return nil }
        report.title = report.title.map { String($0.prefix(300)) }
        report.label = report.label.map { String($0.prefix(200)) }
        if let text = report.text, text.utf8.count > textLimit {
            report.text = String(decoding: Data(text.utf8.prefix(textLimit)), as: UTF8.self).trimmingCharacters(in: CharacterSet(charactersIn: "\u{FFFD}"))
        }
        return report
    }

    /// How much of a sealed message this report takes, roughly.
    /// (Summed from a list: one long `+` chain is too slow for the Linux compiler to type-check.)
    var size: Int {
        let strings: [String?] = [url, title, text, value, label, href]
        let size: Int = strings.reduce(120) { (sum: Int, s: String?) in sum + (s?.utf8.count ?? 0) }
        let fieldSize: Int = (fields ?? []).reduce(0) { (sum: Int, f: String) in sum + f.utf8.count + 4 }
        return size + fieldSize
    }

    private struct Observed: Decodable {
        let kind: String
        let url: String?
        let title: String?
        let text: String?
        let field: String?
        let value: String?
        let label: String?
        let href: String?
        let fields: [String]?

        func report(at: Date) -> WebReport? {
            guard let url else { return nil }
            return WebReport(at: (at.timeIntervalSince1970 * 1000).rounded() / 1000, kind: kind, url: url, title: title, text: text,
                             field: field, value: value, label: label, href: href, fields: fields)
        }
    }
}

/// Reports waiting to go to the computer, for one Applet's page. `take` cuts them into messages that each fit one
/// sealed box (at most 300 reports and about 120 KB).
public struct WebReportBuffer: Sendable {
    public let applet: String
    public private(set) var pending: [WebReport] = []

    public init(applet: String) { self.applet = applet }

    public mutating func add(_ report: WebReport) { pending.append(report) }

    public mutating func take(id: () -> String = { UUID().uuidString }) -> [PhoneMessage] {
        var messages: [PhoneMessage] = [], batch: [WebReport] = [], size = 0
        for report in pending {
            if !batch.isEmpty, batch.count >= 300 || size + report.size > 120_000 {
                messages.append(.web(id: id(), applet: applet, records: batch))
                batch = []
                size = 0
            }
            batch.append(report)
            size += report.size
        }
        if !batch.isEmpty { messages.append(.web(id: id(), applet: applet, records: batch)) }
        pending = []
        return messages
    }
}

// MARK: Widgets

/// One key a widget keeps through its local storage (core/widgets WidgetStateEntry): its value, nil once removed, and
/// when it was written (milliseconds since 1970), so the computer and the phone merge edits key by key, newest wins.
public struct WidgetStateEntry: Codable, Hashable, Sendable {
    public let v: String?
    public let at: Double

    public init(v: String?, at: Double) {
        self.v = v
        self.at = at
    }

    private enum Keys: String, CodingKey { case v, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        v = try c.decodeIfPresent(String.self, forKey: .v)
        at = try c.decode(Double.self, forKey: .at)
    }

    /// A removed key is sent as `"v":null` (never left out), and a whole-millisecond time as an integer.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        if let v { try c.encode(v, forKey: .v) } else { try c.encodeNil(forKey: .v) }
        if at.isFinite, at.rounded() == at, abs(at) < 9e15 { try c.encode(Int64(at), forKey: .at) } else { try c.encode(at, forKey: .at) }
    }
}

public typealias WidgetState = [String: WidgetStateEntry]

/// What a widget may keep (core/widgets WIDGET_LIMITS): keys, one value and all of it, in UTF-16 code units.
public enum WidgetLimits {
    public static let stateKeys = 300
    public static let stateValue = 4000
    public static let stateTotal = 100_000
    public static let key = 200
}

/// A widget for now (core/phone/payloads.ts PhoneWidget): a page made for the moment. `page` is the whole document with
/// the widget prelude and no seed (the phone injects its stored values); it is nil when the computer's slot had no room
/// for it, and the phone keeps the page it already has for the same version.
public struct PhoneWidget: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let blurb: String
    /// The accent color, "#rrggbb".
    public let color: String
    /// When its moment is over (ISO 8601); it leaves Now then, unless pinned.
    public let endsAt: String
    public let pinned: Bool
    public let updatedAt: String
    public let version: Int
    public var page: String?
    public var state: WidgetState

    public init(id: String, title: String, blurb: String, color: String, endsAt: String, pinned: Bool, updatedAt: String,
                version: Int, page: String?, state: WidgetState) {
        self.id = id
        self.title = title
        self.blurb = blurb
        self.color = color
        self.endsAt = endsAt
        self.pinned = pinned
        self.updatedAt = updatedAt
        self.version = version
        self.page = page
        self.state = state
    }

    public var endDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: endsAt) ?? ISO8601DateFormatter().date(from: endsAt)
    }

    /// For now until its end, or for as long as it is pinned. The phone puts it away on time even while the computer
    /// sleeps and cannot send the slot without it.
    public func isActive(at now: Date) -> Bool {
        if pinned { return true }
        guard let end = endDate else { return true }
        return now < end
    }
}

/// The `widgets` slot: the active widgets, newest first.
public struct WidgetsSnapshot: Codable, Sendable, Equatable {
    public let v: Int
    public let at: String
    public let widgets: [PhoneWidget]

    public init(v: Int = 1, at: String, widgets: [PhoneWidget]) {
        self.v = v
        self.at = at
        self.widgets = widgets
    }

    public static let empty = WidgetsSnapshot(v: 1, at: "", widgets: [])
}

/// A widget state, cleaned as core/widgets readWidgetState cleans it: valid keys and values within the limits, times
/// rounded to whole milliseconds; anything else is dropped. Keys are taken in order so the limits cut the same keys
/// every time.
public func cleanWidgetState(_ state: WidgetState) -> WidgetState {
    var clean = WidgetState()
    var total = 0
    for key in state.keys.sorted() {
        guard let entry = state[key], !key.isEmpty, key.utf16.count <= WidgetLimits.key,
              entry.at.isFinite, entry.at >= 0 else { continue }
        if let v = entry.v, v.utf16.count > WidgetLimits.stateValue { continue }
        total += key.utf16.count + (entry.v?.utf16.count ?? 0)
        if total > WidgetLimits.stateTotal || clean.count >= WidgetLimits.stateKeys { break }
        clean[key] = WidgetStateEntry(v: entry.v, at: entry.at.rounded())
    }
    return clean
}

/// The values the page sees (removed keys left out).
public func widgetValues(_ state: WidgetState) -> [String: String] {
    var values: [String: String] = [:]
    for (key, entry) in state { if let v = entry.v { values[key] = v } }
    return values
}

/// The page reported all of its storage: the entries that changed since `state`, stamped `at` (milliseconds since
/// 1970). A key the page no longer has becomes a removal (`v` nil).
public func widgetStateChanges(_ state: WidgetState, values: [String: String], at: Double) -> WidgetState {
    var changes = WidgetState()
    for (key, value) in values where state[key]?.v != value { changes[key] = WidgetStateEntry(v: value, at: at) }
    for (key, entry) in state where entry.v != nil && values[key] == nil { changes[key] = WidgetStateEntry(v: nil, at: at) }
    return cleanWidgetState(changes)
}

/// Merges the other side's entries key by key (core/widgets mergeWidgetState): the newer write wins, on a tie the
/// stored value stays, and a removal of a key this side never had is ignored.
public func mergeWidgetState(_ state: WidgetState, _ incoming: WidgetState) -> (state: WidgetState, changed: Bool) {
    var merged = state
    var changed = false
    for (key, entry) in cleanWidgetState(incoming) {
        if let current = merged[key] {
            if current.at >= entry.at { continue }
        } else if entry.v == nil {
            continue
        }
        merged[key] = entry
        changed = true
    }
    return (cleanWidgetState(merged), changed)
}
