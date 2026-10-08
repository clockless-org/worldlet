import Foundation
import Observation
import UIKit
import UserNotifications
import WorldletKit

/// The app's whole state: the pairing, the last Attention Center and conversation the computer sent, and the chat lines
/// this phone sent that the computer has not shown yet. While the app is open it keeps one long poll waiting at the
/// relay, which answers the moment the computer sends a change, so the Center and Fox's replies arrive as they happen.
@MainActor @Observable
final class AppModel {
    enum Phase { case unpaired, connecting, paired }

    private(set) var phase: Phase = .unpaired
    private(set) var computerName = ""
    /// The computer takes Orders (its desktop slot says `order`), so the dock shows the Order button.
    private(set) var takesOrders = false
    private(set) var attention = AttentionSnapshot.empty
    private(set) var conversation = Conversation.empty
    private(set) var pending: [Turn] = []
    /// The turn Fox is streaming on the computer (its thinking and the reply so far), shown word by word.
    private(set) var live: LiveTurn?
    /// A line said (or an option chosen) on an item's card that the computer has not shown in that item's turns yet.
    private(set) var itemPending: [String: String] = [:]
    /// A line said inside an Applet's page that the computer has not shown in that Applet's thread yet.
    private(set) var appletPending: [String: String] = [:]
    private(set) var computerSeenAt: Date?
    private(set) var receivedAttention = false
    /// The widgets for now as the computer last sent them, each with this phone's own edits merged in and the page it
    /// has; kept on the device, so a widget still opens while the computer sleeps.
    private(set) var widgets: [PhoneWidget] = []
    /// Where each widget's page was scrolled, while the app runs, so a page reloaded for a change opens where it was.
    @ObservationIgnored var widgetScroll: [String: Double] = [:]
    /// Widget keys edited here whose message has not reached the relay yet (no network); sent again on the next poll.
    private var widgetUnsent: [String: Set<String>] = [:]
    var error: String?
    /// A pairing link opened while this iPhone follows another computer: it replaces that pairing only once the person
    /// confirms (`replacePairing`).
    private(set) var replacement: PairLink?

    private var session: PhoneSession?
    /// The pairing this iPhone follows, so opening its own link again changes nothing.
    private var link: PairLink?
    private var keys: PairKeys?
    private var loop: Task<Void, Never>?

    /// The shared Worldlet version, 2026.1004.2716 like the desktop (scripts/machine-testflight.mjs).
    static let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"

    init() {
        if Demo.enabled {
            loadDemo()
            return
        }
        if let link = PairingStore.load() {
            if let stored = WidgetStore.load() {
                widgets = stored.widgets
                widgetUnsent = stored.unsent.mapValues { Set($0) }
            }
            start(link)
        }
    }

    /// Try the demo: the fixed sample Center and conversation, with no computer and no network.
    func startDemo() {
        Demo.enabled = true
        error = nil
        loadDemo()
    }

    private func loadDemo() {
        phase = .paired
        computerName = "Studio Mac"
        computerSeenAt = Date()
        attention = Demo.attention
        conversation = Demo.conversation
        if Demo.streaming { live = Demo.live }
        widgets = Demo.widgets
        receivedAttention = true
        takesOrders = Demo.order
    }

    /// The computer reached the relay recently (it checks in at least every 15 seconds while Worldlet runs).
    /// When it is away the phone keeps showing what it sent last.
    var computerOnline: Bool {
        if Demo.enabled { return true }
        guard let computerSeenAt else { return false }
        return Date().timeIntervalSince(computerSeenAt) < 90
    }

    var foxWorking: Bool { conversation.busy || !pending.isEmpty || (streaming.map { !$0.done } ?? false) }

    /// The streaming turn while it is worth showing: running (unless the computer went quiet mid-turn), or finished and
    /// not yet in the conversation the computer sends next. A finished one also gives way after two minutes, in case the
    /// conversation never changes (the computer only sends it when it does); one waiting on an approval stays.
    var streaming: LiveTurn? {
        guard let live, let at = Turn.parse(live.at), live.shown(sent: at) else { return nil }
        return live
    }

    /// The approvals answered from this phone, with the choice, until the computer's live turn no longer asks.
    private(set) var answered: [String: HarnessApproval.Choice] = [:]

    /// Fox's conversation as shown: the computer's turns, then this phone's lines still on their way.
    var turns: [Turn] { conversation.messages + pending }

    // MARK: Pairing

    /// A pairing link from the scanner, the pasteboard or the Camera app. While paired, a link to another computer only
    /// asks first: any page could open a `worldlet://pair` link.
    func pair(with text: String) {
        do {
            let link = try PairLink(parsing: text)
            guard phase == .unpaired else {
                if link.secret != self.link?.secret || link.relay != self.link?.relay { replacement = link }
                return
            }
            PairingStore.save(link)
            start(link)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The person chose to follow the other computer: this pairing ends on the relay and everything it brought (the
    /// Center, the conversation, widgets and their unsent edits) goes before the new one starts.
    func replacePairing(with link: PairLink) {
        replacement = nil
        let old = session
        forget()
        Task { try? await old?.unpair() }
        PairingStore.save(link)
        start(link)
    }

    func keepPairing() {
        replacement = nil
    }

    private func start(_ link: PairLink) {
        let session = PhoneSession(link: link)
        self.session = session
        self.link = link
        keys = PairKeys(secret: link.secret)
        computerName = link.name
        phase = .connecting
        error = nil
        Task { try? await session.announce(PhoneInfo(name: UIDevice.current.name, version: Self.appVersion)) }
        // A launch in the background (a notification's button) does not poll: the relay would think the app is showing,
        // and the computer would hold back the notification with Fox's answer. Coming to the front resumes.
        if UIApplication.shared.applicationState != .background { resume() }
    }

    func unpair() async {
        let session = self.session
        forget()
        Demo.enabled = false
        try? await session?.unpair()
    }

    private func forget() {
        loop?.cancel()
        loop = nil
        session = nil
        link = nil
        keys = nil
        opening = nil
        askNotifications = false
        UserDefaults.standard.removeObject(forKey: Self.sentPushKey)
        PairingStore.delete()
        phase = .unpaired
        attention = .empty
        conversation = .empty
        pending = []
        live = nil
        answered = [:]
        itemPending = [:]
        appletPending = [:]
        computerSeenAt = nil
        takesOrders = false
        receivedAttention = false
        widgets = []
        widgetUnsent = [:]
        widgetScroll = [:]
        WidgetStore.delete()
    }

    // MARK: Polling

    func resume() {
        guard session != nil else { return }
        loop?.cancel()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                // The first poll answers at once (it completes the pairing); later ones wait at the relay for news.
                let ok = await self.sync(wait: self.phase == .paired ? 20 : 0)
                if !ok { try? await Task.sleep(for: .seconds(3)) }
            }
        }
    }

    func pause() {
        loop?.cancel()
        loop = nil
    }

    /// One poll; false when it failed, so the loop backs off before trying again.
    @discardableResult
    func sync(wait: Int = 0) async -> Bool {
        guard let session else { return false }
        do {
            let update = try await session.sync(wait: wait)
            guard self.session === session else { return false }
            apply(update)
            if phase == .connecting {
                phase = .paired
                setUpNotifications()
            }
            error = nil
            if !widgetUnsent.isEmpty { sendUnsentWidgetEdits() }
            return true
        } catch RelayError.ended {
            // An answer for a pairing that was already replaced or unpaired ends nothing.
            guard self.session === session else { return false }
            forget()
            error = RelayError.ended.localizedDescription
        } catch is CancellationError {
        } catch let failure as URLError where failure.code == .cancelled {
        } catch {
            self.error = error.localizedDescription
        }
        return false
    }

    private func apply(_ update: PhoneUpdate) {
        if let seen = update.computerSeenAt { computerSeenAt = Date(timeIntervalSince1970: seen / 1000) }
        if let desktop = update.desktop, !desktop.name.isEmpty { computerName = desktop.name }
        if let desktop = update.desktop { takesOrders = desktop.order == true }
        if let snapshot = update.attention {
            attention = snapshot
            receivedAttention = true
            if opening != nil { openingChecked = true }
            // A line waits until the item's own turns show it.
            for (id, line) in itemPending {
                let item = (snapshot.now + snapshot.later).first { $0.id == id }
                if item == nil || item?.fox?.turns.contains(where: { $0.user == line }) == true { itemPending[id] = nil }
            }
            for (key, line) in appletPending {
                let applet = snapshot.applet(key)
                if applet == nil || applet?.fox?.turns.contains(where: { $0.user == line }) == true { appletPending[key] = nil }
            }
        }
        if let live = update.live {
            self.live = live
            // The line this phone sent is on the streaming card now.
            if live.item == nil, let index = pending.firstIndex(where: { $0.text == live.user }) { pending.remove(at: index) }
            if let item = live.item, itemPending[item] == live.user { itemPending[item] = nil }
            if let applet = live.applet, appletPending[applet] == live.user { appletPending[applet] = nil }
        } else if live?.done == true, update.conversation != nil || update.attention != nil {
            // The finished reply has reached the conversation (or the item's turns) the computer sent after it.
            live = nil
        }
        if let snapshot = update.widgets { applyWidgets(snapshot) }
        if let conversation = update.conversation {
            // A line this phone sent is shown once the computer's conversation has it.
            var users = conversation.messages.suffix(20).filter { $0.role == .user }.map(\.text)
            pending.removeAll { turn in
                guard let index = users.firstIndex(of: turn.text) else { return false }
                users.remove(at: index)
                return true
            }
            self.conversation = conversation
        }
    }

    // MARK: Notifications

    /// The relay's platform for this build's APNs token: Apple's sandbox for debug builds.
    #if DEBUG
    static let pushPlatform = "apns-dev"
    #else
    static let pushPlatform = "apns"
    #endif
    private static let askedKey = "notificationsAsked"
    /// The pairing, platform and token the relay last took, so a token is sent again only when one of them changes.
    private static let sentPushKey = "pushSent"

    /// Asks once, after pairing, whether to turn notifications on (HomeView's alert, before the system's own question).
    var askNotifications = false
    @ObservationIgnored private var pushToken: String?
    /// Where a tapped notification goes; HomeView opens it once the Center has what it names.
    var opening: PushTarget?
    /// A Center snapshot came since the tap, so an item or Applet still missing from it is gone.
    private(set) var openingChecked = false

    /// Each time a pairing connects (and so after every launch and a new pairing): register with APNs when allowed,
    /// which brings the token (`registered`), or ask once when the person has not been asked.
    private func setUpNotifications() {
        guard !Demo.enabled else { return }
        Task {
            switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
            case .notDetermined: askNotifications = !UserDefaults.standard.bool(forKey: Self.askedKey)
            case .denied: break
            default:
                sendPushToken()
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func allowNotifications(_ allow: Bool) {
        askNotifications = false
        UserDefaults.standard.set(true, forKey: Self.askedKey)
        guard allow else { return }
        Task {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    /// The APNs device token (AppDelegate). The relay gets it once per pairing, and again when it changes.
    func registered(token: Data) {
        pushToken = pushTokenHex(token)
        sendPushToken()
    }

    private func sendPushToken() {
        guard let session, let keys, let token = pushToken, phase == .paired else { return }
        let sent = "\(keys.id) \(Self.pushPlatform) \(token)"
        guard UserDefaults.standard.string(forKey: Self.sentPushKey) != sent else { return }
        Task {
            // A failure is tried again with the token the next launch brings.
            guard (try? await session.registerPush(platform: Self.pushPlatform, token: token)) != nil, self.session === session else { return }
            UserDefaults.standard.set(sent, forKey: Self.sentPushKey)
        }
    }

    /// A tapped notification: the target the extension put in its userInfo, or, when the extension could not open the
    /// box (it had no pairing then), the box opened here.
    func openNotification(_ target: PushTarget?, pair: String?, box: String?) {
        guard !Demo.enabled, let keys else { return }
        let opened = pair == keys.id ? box.flatMap { try? keys.openPush(box: $0) } : nil
        guard let target = target ?? opened?.target else { return }
        openingChecked = false
        opening = target
    }

    /// A notification's button (Done, Later, Reply, Allow once, Deny; core/phone/README.md, Push › Actions), answered
    /// without bringing the app up: the box opens again with this pairing's keys, and the same message as the app's own
    /// button goes to the computer. When it cannot go, the notification comes back with its buttons and says so.
    func answerNotification(_ button: PushAction, text: String?, pair: String?, box: String?) async {
        guard !Demo.enabled, let keys, let session, pair == keys.id, let box, let push = try? keys.openPush(box: box),
              let message = push.message(for: button, text: text) else { return }
        if case let .approval(_, approval, choice) = message { answered[approval] = choice }
        do { try await session.send(message) } catch {
            if case let .approval(_, approval, _) = message { answered[approval] = nil }
            let content = UNMutableNotificationContent()
            content.title = push.title
            content.body = "Not sent. Check your connection and try again."
            content.threadIdentifier = "worldlet"
            content.userInfo = ["p": keys.id, "b": box]
            if let category = push.category { content.categoryIdentifier = category }
            try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: push.id, content: content, trigger: nil))
        }
    }

    /// HomeView found no such item or Applet: once a snapshot has come since the tap, it is gone and nothing opens.
    func openingMissing() {
        if openingChecked { opening = nil }
    }

    // MARK: Actions

    func send(_ text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let session else { if Demo.enabled { demoReply(to: text) }; return }
        let id = UUID().uuidString
        pending.append(Turn(id: id, role: .user, text: text, at: ISO8601DateFormatter().string(from: Date())))
        Task {
            do { try await session.send(.chat(id: id, text: text)) } catch {
                pending.removeAll { $0.id == id }
                self.error = error.localizedDescription
            }
        }
    }

    /// A line said with an item's card open, or the option Fox offers there (`option` true): it joins that item's
    /// conversation on the computer, which opens the same card.
    func say(_ text: String, about item: AttentionItem, option: Bool = false) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let session else { if Demo.enabled { demoReply(to: text) }; return }
        itemPending[item.id] = text
        let id = UUID().uuidString
        Task {
            do {
                try await session.send(option ? .option(id: id, item: item.id) : .ask(id: id, text: text, item: item.id))
            } catch {
                itemPending[item.id] = nil
                self.error = error.localizedDescription
            }
        }
    }

    /// A line said inside an Applet's page: the computer opens that Applet, so the line joins its thread there.
    func say(_ text: String, in applet: PhoneApplet) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let session else { if Demo.enabled { demoReply(to: text) }; return }
        appletPending[applet.key] = text
        let id = UUID().uuidString
        Task {
            do { try await session.send(.tell(id: id, text: text, applet: applet.key)) } catch {
                appletPending[applet.key] = nil
                self.error = error.localizedDescription
            }
        }
    }

    /// Sends what was said with the Order button as an Order from the computer (core/phone `order`), never a line for
    /// Fox; false when it did not reach the relay.
    func order(_ said: String) async -> Bool {
        let said = said.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty, let session else { return false }
        do {
            try await session.send(.order(id: UUID().uuidString, said: said))
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    /// In the demo Fox answers every line with the same note, in the main conversation.
    private func demoReply(to text: String) {
        let at = ISO8601DateFormatter().string(from: Date())
        conversation = Conversation(v: conversation.v, at: at, busy: false, name: conversation.name, messages: conversation.messages + [
            Turn(id: UUID().uuidString, role: .user, text: text, at: at),
            Turn(id: UUID().uuidString, role: .fox, text: Demo.reply, at: at),
        ])
    }

    // MARK: Websites in the app's own browser

    /// The Applet whose website is open in this app's browser (owner request 2026-10-07: no jump to Safari).
    var browsing: PhoneApplet?
    /// Opens an Applet's website here; one with no website opens nothing.
    func browse(_ applet: PhoneApplet) { if applet.url != nil { browsing = applet } }

    /// The observer's reports per Applet, sent every ten seconds and when the page closes.
    @ObservationIgnored private var webBuffers: [String: WebReportBuffer] = [:]
    /// Messages the relay did not take yet (no network); sent again with the next ones, the oldest dropped past 40.
    @ObservationIgnored private var webOutbox: [PhoneMessage] = []
    @ObservationIgnored private var webTimer: Task<Void, Never>?

    func recordWeb(applet: String, json: String) {
        guard session != nil, let report = WebReport.read(json, at: Date()) else { return }
        webBuffers[applet, default: WebReportBuffer(applet: applet)].add(report)
        guard webTimer == nil else { return }
        webTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            self?.webTimer = nil
            self?.flushWeb()
        }
    }

    func flushWeb() {
        guard let session else { webBuffers = [:]; return }
        for key in webBuffers.keys { webOutbox += webBuffers[key]?.take() ?? [] }
        webBuffers = [:]
        if webOutbox.count > 40 { webOutbox.removeFirst(webOutbox.count - 40) }
        let sending = webOutbox
        webOutbox = []
        guard !sending.isEmpty else { return }
        Task {
            for (index, message) in sending.enumerated() {
                do { try await session.send(message) } catch {
                    webOutbox = Array(sending[index...]) + webOutbox
                    return
                }
            }
        }
    }

    /// Applets this phone opened on the computer a moment ago, so the button can say so.
    private(set) var openedApplets: Set<String> = []

    /// Opens the Applet on the computer, where the person carries on.
    func openOnComputer(_ applet: PhoneApplet) {
        guard let session else { return }
        openedApplets.insert(applet.key)
        Task {
            do { try await session.send(.openApplet(id: UUID().uuidString, applet: applet.key)) } catch {
                self.error = error.localizedDescription
            }
            try? await Task.sleep(for: .seconds(4))
            openedApplets.remove(applet.key)
        }
    }

    /// Accounts whose sign-in this phone opened on the computer, so the row can say so.
    private(set) var openedOnComputer: Set<String> = []

    /// Opens the account's sign-in on the computer; the person finishes it there.
    func connect(_ account: AccountIssue) {
        guard let session else { return }
        openedOnComputer.insert(account.provider)
        Task {
            do { try await session.send(.connect(id: UUID().uuidString, provider: account.provider)) } catch {
                openedOnComputer.remove(account.provider)
                self.error = error.localizedDescription
            }
        }
    }

    /// Allow once, Always or Deny on what the person's own Agent asks (the card in Fox's dialogue): the computer answers
    /// its Harness with it. The card shows the settled line at once; a failed send brings the buttons back.
    func answer(_ approval: HarnessApproval, _ choice: HarnessApproval.Choice) {
        guard answered[approval.id] == nil else { return }
        answered[approval.id] = choice
        guard let session else { return }
        Task {
            do { try await session.send(.approval(id: UUID().uuidString, approval: approval.id, choice: choice)) } catch {
                answered[approval.id] = nil
                self.error = error.localizedDescription
            }
        }
    }

    /// Done, Later or Remove, as on the computer's card. The row leaves at once; the next snapshot has the truth.
    func act(_ item: AttentionItem, _ action: AttentionAction) {
        guard session != nil || Demo.enabled else { return }
        let keep: (AttentionItem) -> Bool = { $0.id != item.id }
        let moved = action == .later ? [item] : []
        attention = AttentionSnapshot(v: attention.v, at: attention.at, now: attention.now.filter(keep),
                                      later: attention.later.filter(keep) + moved, accounts: attention.accounts ?? [],
                                      applets: attention.applets)
        guard let session else { return }
        Task {
            do { try await session.send(.attention(id: item.id, action: action)) } catch { self.error = error.localizedDescription }
        }
    }

    // MARK: Widgets

    /// The widgets shown at the top of Now: those still for now, even when the computer is away and has not put the
    /// finished ones away yet.
    var activeWidgets: [PhoneWidget] { widgets.filter { $0.isActive(at: Date()) } }

    /// The computer's slot: its widgets, newest first. A page it left out is kept from the same version here; its state
    /// merges into this phone's newest-wins, so edits made here and not yet merged there stay. A widget missing from the
    /// slot has ended (or was deleted) and goes.
    private func applyWidgets(_ snapshot: WidgetsSnapshot) {
        let known = Dictionary(widgets.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        widgets = snapshot.widgets.map { incoming in
            var widget = incoming
            if let mine = known[incoming.id] {
                if widget.page == nil, mine.version == widget.version { widget.page = mine.page }
                widget.state = mergeWidgetState(mine.state, incoming.state).state
            } else {
                widget.state = cleanWidgetState(incoming.state)
            }
            return widget
        }
        let ids = Set(widgets.map(\.id))
        widgetUnsent = widgetUnsent.filter { ids.contains($0.key) }
        saveWidgets()
    }

    /// The open widget's page reported all of its storage: the changed keys are stamped with this phone's clock, kept,
    /// and sent to the computer. Returns the values the widget holds now.
    @discardableResult
    func editWidget(_ id: String, values: [String: String]) -> [String: String] {
        guard let index = widgets.firstIndex(where: { $0.id == id }) else { return values }
        let state = widgets[index].state
        let now = (Date().timeIntervalSince1970 * 1000).rounded()
        var changes = widgetStateChanges(state, values: values, at: now)
        guard !changes.isEmpty else { return widgetValues(state) }
        // A clock behind the other side's would lose the merge there; stamp just after the newest write instead.
        let newest = changes.keys.compactMap { state[$0]?.at }.max() ?? 0
        if newest >= now { changes = widgetStateChanges(state, values: values, at: newest + 1) }
        var next = state
        for (key, entry) in changes { next[key] = entry }
        widgets[index].state = next
        saveWidgets()
        send(changes, of: id)
        return widgetValues(next)
    }

    private func send(_ changes: WidgetState, of id: String) {
        guard let session, !changes.isEmpty else { return }
        Task {
            do { try await session.send(.widget(id: UUID().uuidString, widget: id, state: changes)) } catch {
                guard self.session === session else { return }
                widgetUnsent[id, default: []].formUnion(changes.keys)
                saveWidgets()
            }
        }
    }

    /// Sends the current entries of keys whose message did not get out; the computer merges them idempotently.
    private func sendUnsentWidgetEdits() {
        let unsent = widgetUnsent
        widgetUnsent = [:]
        for (id, keys) in unsent {
            guard let widget = widgets.first(where: { $0.id == id }) else { continue }
            var changes = WidgetState()
            for key in keys { if let entry = widget.state[key] { changes[key] = entry } }
            send(changes, of: id)
        }
        saveWidgets()
    }

    private func saveWidgets() {
        guard !Demo.enabled, session != nil else { return }
        WidgetStore.save(WidgetStore.Stored(widgets: widgets, unsent: widgetUnsent.mapValues { $0.sorted() }))
    }
}

/// The last widgets slot with this phone's own edits, in a file in Application Support (pages can be 120 KB each),
/// so widgets open after a relaunch while the computer sleeps. Left out of backups; deleted when the iPhone is unpaired.
enum WidgetStore {
    struct Stored: Codable {
        var widgets: [PhoneWidget]
        var unsent: [String: [String]]
    }

    private static var url: URL? {
        guard let folder = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                        appropriateFor: nil, create: true) else { return nil }
        return folder.appendingPathComponent("widgets.json")
    }

    static func load() -> Stored? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Stored.self, from: data)
    }

    static func save(_ stored: Stored) {
        guard var url, let data = try? JSONEncoder().encode(stored) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        // Like the pairing (a ThisDeviceOnly Keychain item), it stays on this iPhone: never in a backup or on a new phone.
        // An atomic write replaces the file, so the flag is set again after each one.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    static func delete() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
