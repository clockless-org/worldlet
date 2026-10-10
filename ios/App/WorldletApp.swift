import SwiftUI
import UserNotifications
import WorldletKit

@main
struct WorldletApp: App {
    /// The delegate owns the model, so APNs tokens and notification taps reach it.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var scenePhase
    private var model: AppModel { delegate.model }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Palette.forest)
                // Scanning the computer's code with the Camera app opens worldlet://pair?… here.
                .onOpenURL { model.pair(with: $0.absoluteString) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.resume() } else if phase == .background { model.pause() }
        }
    }
}

/// Notifications (README.md › Notifications): the APNs token goes to the relay through the model; a tap opens what the
/// notification names, and its buttons answer from the shade (AppModel.answerNotification); one that arrives while the
/// app is open shows nothing, since the live Center and Fox already do.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    lazy var model = AppModel()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().setNotificationCategories(Self.categories)
        return true
    }

    /// The buttons each category shows (PushAction.buttons; the extension picks the category). Reply and Allow once ask
    /// to unlock the iPhone first, so nobody answers the person's Agent from a locked screen; none brings the app up.
    static var categories: Set<UNNotificationCategory> {
        Set(PushAction.buttons.map { category, buttons in
            UNNotificationCategory(identifier: category, actions: buttons.map(action), intentIdentifiers: [], options: [])
        })
    }

    private static func action(_ button: PushAction) -> UNNotificationAction {
        switch button {
        case .reply:
            return UNTextInputNotificationAction(identifier: button.rawValue, title: button.label, options: [.authenticationRequired],
                                                 textInputButtonTitle: "Send", textInputPlaceholder: "Reply")
        case .allow: return UNNotificationAction(identifier: button.rawValue, title: button.label, options: [.authenticationRequired])
        case .deny: return UNNotificationAction(identifier: button.rawValue, title: button.label, options: [.destructive])
        case .done, .later: return UNNotificationAction(identifier: button.rawValue, title: button.label, options: [])
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        model.registered(token: deviceToken)
    }

    /// No token (the Simulator, no network): notifications stay off until the next launch registers again.
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let target = PushTarget(userInfo: info), pair = info["p"] as? String, box = info["b"] as? String
        if let button = PushAction(rawValue: response.actionIdentifier) {
            // iOS keeps the app awake until the handler is called, so the message is out first.
            let text = (response as? UNTextInputNotificationResponse)?.userText
            Task { @MainActor in
                await self.model.answerNotification(button, text: text, pair: pair, box: box)
                completionHandler()
            }
            return
        }
        Task { @MainActor in self.model.openNotification(target, pair: pair, box: box) }
        completionHandler()
    }
}

/// Colors from the built-in cozy-miniature style (ui/theme-packages/village/tokens.json and UI.md), the same values the
/// computer's world uses, so the phone reads as the same Worldlet.
enum Palette {
    static let paper = Color(hex: 0xF4F0E5)
    static let forest = Color(red: 0.208, green: 0.255, blue: 0.196)
    static let leaf = Color(red: 0.365, green: 0.420, blue: 0.290)
    static let lantern = Color(red: 0.851, green: 0.718, blue: 0.353)

    /// Text over the world (--ui-matter-ink, --ui-matter-muted) and its soft shadow.
    static let ink = Color(hex: 0xFFF9E9)
    static let muted = Color(hex: 0xF4EEDC)
    static let inkShadow = Color(hex: 0x253326).opacity(0.5)

    /// Text on the paper card (--hud-paper-ink) and its quieter footer.
    static let paperInk = Color(hex: 0x304F40)
    static let paperFoot = Color(hex: 0x617065)

    /// The Center's three kinds over the world (--ui-hud-event, --ui-hud-task, --ui-hud-update):
    /// Coming Up blue, Worth Doing yellow, Worth Knowing green.
    static func group(_ group: AttentionGroup) -> Color {
        switch group {
        case .event: Color(hex: 0xA5D4DC)
        case .needsAction: Color(hex: 0xEDC47D)
        case .unseen: Color(hex: 0xB1D3AB)
        }
    }

    /// The same kinds on the paper card, darker so they read on paper (ui/attention/attention-preview.css).
    static func accent(_ group: AttentionGroup) -> Color {
        switch group {
        case .event: Color(hex: 0x28718A)
        case .needsAction: Color(hex: 0x946E2B)
        case .unseen: Color(hex: 0x557955)
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.phase {
        case .unpaired:
            PairView()
        case .connecting, .paired:
            HomeView()
        }
    }
}

/// One screen, like the computer's world: the Attention Center over the world, and Fox resident at the bottom in its
/// input bar (a tap on Fox opens Settings, as the computer button does). An Applet's page rises over the Center and
/// stops above Fox; an item's card comes down over both.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var showSettings = false
    @State private var card: AttentionItem?
    @State private var applet: PhoneApplet?
    /// Fox's conversation expanded into a chat over the Center (FoxDock's Expand).
    @State private var chat = false

    var body: some View {
        VStack(spacing: 0) {
            AttentionCenter(open: { show($0) }, openApplet: { enter($0) })
                .overlay(alignment: .topTrailing) { ComputerButton { showSettings = true }.padding(.trailing, 16) }
                .padding(.top, 4)
                .overlay(alignment: .bottom) { appletLayer }
                .overlay(alignment: .top) { cardLayer }
                // Scrolling the Center puts the keyboard away.
                .scrollDismissesKeyboard(.immediately)
                // The expanded chat takes the Center's room; the Center waits under it, unchanged.
                .opacity(chat ? 0 : 1)
                .allowsHitTesting(!chat)
                .accessibilityHidden(chat)
            FoxDock(item: open, applet: inside, leaveApplet: { enter(nil) }, blank: { if card != nil { show(nil) } },
                    openPanel: { showSettings = true }, chat: $chat)
                .layoutPriority(chat ? 1 : 0)
        }
        .background { WorldBackdrop() }
        // The world is dark behind everything, so glass and system controls take their dark look.
        .environment(\.colorScheme, .dark)
        .sheet(isPresented: $showSettings) { SettingsView() }
        // An Applet's website opens over everything, in this app's own browser.
        .fullScreenCover(item: browsing) { WebBrowserScreen(applet: $0) }
        // A pairing link for another computer (scanned, pasted or opened from anywhere) replaces this one only when the
        // person says so.
        .alert("Pair with another computer?", isPresented: replacing, presenting: model.replacement) { link in
            Button("Pair with \(link.name.isEmpty ? "it" : link.name)", role: .destructive) { model.replacePairing(with: link) }
            Button("Keep \(currentName)", role: .cancel) { model.keepPairing() }
        } message: { link in
            Text("Pair with \(link.name.isEmpty ? "the other computer" : link.name) instead of \(currentName)? This iPhone unpairs from \(currentName) and clears what it brought, Applets included.")
        }
        // Asked once after pairing, before the system's own question (owner goal 2026-10-07: what used to reach
        // Telegram now reaches this iPhone).
        .alert("Turn on notifications?", isPresented: askingNotifications) {
            Button("Not now", role: .cancel) { model.allowNotifications(false) }
            Button("Turn On") { model.allowNotifications(true) }
        } message: {
            Text("\(currentName) can tell you here when something new needs you or Fox has answered, while Worldlet is closed.")
        }
        .onChange(of: model.opening, initial: true) { _, _ in openTarget() }
        .onChange(of: model.attention) { _, _ in openTarget() }
        .onChange(of: model.openingChecked) { _, _ in openTarget() }
        .onAppear {
            guard Demo.enabled else { return }
            if let id = Demo.argument("-card") { card = (model.attention.now + model.attention.later).first { $0.id == id } }
        }
    }

    private var askingNotifications: Binding<Bool> {
        Binding(get: { model.askNotifications }, set: { if !$0 && model.askNotifications { model.allowNotifications(false) } })
    }

    /// A tapped notification's target: the item's card, the Applet's page, or Fox's dialogue expanded. One the Center
    /// does not have yet waits for the next snapshot (the app may just have opened).
    private func openTarget() {
        guard let target = model.opening else { return }
        var item: AttentionItem?, found: PhoneApplet?
        switch target {
        case let .item(id):
            item = (model.attention.now + model.attention.later).first { $0.id == id }
            if item == nil { return model.openingMissing() }
        case let .applet(key):
            found = model.attention.applet(key)
            if found == nil { return model.openingMissing() }
        case .conversation: break
        }
        model.opening = nil
        showSettings = false
        model.browsing = nil
        enter(found)
        chat = target == .conversation
        if let item { show(item) }
    }

    private var browsing: Binding<PhoneApplet?> {
        Binding(get: { model.browsing }, set: { model.browsing = $0 })
    }

    private var replacing: Binding<Bool> {
        Binding(get: { model.replacement != nil }, set: { if !$0 { model.keepPairing() } })
    }

    private var currentName: String { model.computerName.isEmpty ? "your computer" : model.computerName }

    /// The open card's item as the computer last sent it, so its dialogue stays current while the card is open.
    private var open: AttentionItem? {
        guard let card else { return nil }
        return (model.attention.now + model.attention.later).first { $0.id == card.id } ?? card
    }

    /// The open Applet as the computer last sent it, so its lamp, lines and thread stay current while its page is open.
    private var inside: PhoneApplet? {
        guard let applet else { return nil }
        return model.attention.applet(applet.key) ?? applet
    }

    /// The Applet's page rises from the bottom and leaves the top of the Center showing, so where it came from stays in view.
    @ViewBuilder private var appletLayer: some View {
        GeometryReader { box in
            ZStack(alignment: .bottom) {
                if let inside {
                    AppletPage(applet: inside, open: { show($0) }, close: { enter(nil) })
                        .id(inside.key)
                        .frame(height: box.size.height * 0.86)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
    }

    private func enter(_ next: PhoneApplet?) {
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
            card = nil
            applet = next
        }
    }

    /// The open card slides down from the top over the Center, which blurs and dims behind it; Fox stays below,
    /// talking about the item. A tap anywhere beside the card closes it.
    @ViewBuilder private var cardLayer: some View {
        GeometryReader { box in
            ZStack(alignment: .top) {
                if card != nil {
                    Rectangle()
                        .fill(.ultraThinMaterial)
                        .overlay(Color.black.opacity(0.28))
                        .environment(\.colorScheme, .dark)
                        .ignoresSafeArea(edges: .top)
                        .contentShape(Rectangle())
                        .onTapGesture { show(nil) }
                        .accessibilityLabel("Close the card")
                        .accessibilityAddTraits(.isButton)
                        .transition(.opacity)
                }
                if let card = open {
                    AttentionCard(item: card, next: { show($0) }, openApplet: { enter($0) })
                        .id(card.id)
                        .frame(maxHeight: box.size.height - 16)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                        .transition(.asymmetric(insertion: .move(edge: .top).combined(with: .opacity), removal: .opacity))
                }
            }
        }
    }

    private func show(_ item: AttentionItem?) {
        withAnimation(.snappy(duration: 0.4)) { card = item }
    }
}

/// The world behind everything, dimmed the way the computer softens it behind the Center so its text stays readable.
struct WorldBackdrop: View {
    var body: some View {
        Image("World")
            .resizable()
            .scaledToFill()
            // world.jpg is blurred already: a live blur over the whole screen cost every frame of a swipe.
            .overlay(Color(hex: 0x10291E).opacity(0.54))
            .overlay(LinearGradient(colors: [.black.opacity(0.5), .black.opacity(0.42), .black.opacity(0.3)],
                                    startPoint: .top, endPoint: .bottom))
            .background(Color(hex: 0x1E2A22))
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}

/// The computer this iPhone follows, as a round button with a dot that says whether it is connected (green) or away;
/// it opens Settings.
private struct ComputerButton: View {
    @Environment(AppModel.self) private var model
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            Image(systemName: "desktopcomputer")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.ink)
                .frame(width: 26, height: 26)
        }
        .glassButton()
        .buttonBorderShape(.circle)
        .overlay(alignment: .bottomTrailing) {
            Circle()
                .fill(model.computerOnline ? Color(hex: 0x6FD08C) : Color(hex: 0x9AA39C))
                .frame(width: 9, height: 9)
                .overlay(Circle().stroke(Color.black.opacity(0.35), lineWidth: 1))
                .offset(x: -5, y: -5)
                .allowsHitTesting(false)
        }
        .accessibilityLabel("Settings")
        .accessibilityValue(status)
    }

    private var status: String {
        let name = model.computerName.isEmpty ? "your computer" : model.computerName
        if model.phase == .connecting { return "Connecting to \(name)" }
        return model.computerOnline ? "Connected to \(name)" : "\(name) is away"
    }
}

extension View {
    /// Apple's Liquid Glass where the system has it (iOS 26 and later), and the frosted look of the computer's controls
    /// before that.
    /// (The glass needs the iOS 26 SDK, so an older Xcode builds the frosted look only.)
    @ViewBuilder func liquidGlass<S: Shape>(_ shape: S, tint: Color? = nil, interactive: Bool = true) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, *) {
            self.glassEffect((tint.map { Glass.regular.tint($0) } ?? .regular).interactive(interactive), in: shape)
        } else {
            frosted(shape, tint: tint)
        }
        #else
        frosted(shape, tint: tint)
        #endif
    }

    private func frosted<S: Shape>(_ shape: S, tint: Color?) -> some View {
        background(tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.ultraThinMaterial), in: shape)
            .background(Color.black.opacity(0.28), in: shape)
            .overlay(shape.stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            .environment(\.colorScheme, .dark)
    }

    /// Glass shapes inside blend and flow into one another (iOS 26 and later).
    @ViewBuilder func glassContainer(spacing: CGFloat) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, *) { GlassEffectContainer(spacing: spacing) { self } } else { self }
        #else
        self
        #endif
    }
}

/// The system's button for round and capsule controls over the world (owner request 2026-10-04: native controls):
/// Liquid Glass on iOS 26 and later, the bordered button before that.
extension View {
    @ViewBuilder func glassButton() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, *) { buttonStyle(.glass) } else { buttonStyle(.bordered).tint(Palette.ink) }
        #else
        buttonStyle(.bordered).tint(Palette.ink)
        #endif
    }
}
