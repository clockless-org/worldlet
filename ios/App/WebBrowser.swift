import SwiftUI
import WebKit
import WorldletKit

/// An Applet's website, opened in this app rather than Safari or the site's own app (owner request 2026-10-07: "不要跳转，
/// 在我们自己的app里做"): the system's navigation bar with the page's title and Done, the page, and back, forward and
/// reload below. Sign-ins made here stay on this iPhone, in this app's own website storage. What happens on the page
/// goes to the computer, which keeps it in the World by its browser's rules (core/phone/README.md); the observer runs
/// in a script world of its own, so the page can neither see nor imitate it.
struct WebBrowserScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let applet: PhoneApplet
    @State private var page = BrowserState()

    var body: some View {
        NavigationStack {
            Group {
                if let url = applet.url {
                    BrowserWebView(url: url, applet: applet.key, model: model, state: page)
                        .ignoresSafeArea(edges: .bottom)
                }
            }
            .navigationTitle(page.title.isEmpty ? applet.title : page.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Palette.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                        .accessibilityIdentifier("browser-close")
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { page.webView?.goBack() } label: { Image(systemName: "chevron.backward") }
                        .disabled(!page.canGoBack)
                        .accessibilityLabel("Back")
                        .accessibilityIdentifier("browser-back")
                    Button { page.webView?.goForward() } label: { Image(systemName: "chevron.forward") }
                        .disabled(!page.canGoForward)
                        .accessibilityLabel("Forward")
                    Spacer()
                    if page.loading { ProgressView().controlSize(.small) }
                    Button { page.webView?.reload() } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Reload")
                }
            }
            .background(Palette.paper.ignoresSafeArea())
        }
        .tint(Palette.forest)
        .environment(\.colorScheme, .light)
        // What the page did goes to the computer as soon as it closes.
        .onDisappear { model.flushWeb() }
    }
}

/// What the bars show of the page, and the page their buttons move.
@Observable
final class BrowserState {
    var title = ""
    var canGoBack = false
    var canGoForward = false
    var loading = false
    @ObservationIgnored weak var webView: WKWebView?
}

struct BrowserWebView: UIViewRepresentable {
    let url: URL
    let applet: String
    let model: AppModel
    let state: BrowserState

    func makeCoordinator() -> BrowserCoordinator { BrowserCoordinator(applet: applet, model: model, state: state) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // The app's own website storage, so a site stays signed in here between visits.
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let controller = configuration.userContentController
        if let observer = BrowserCoordinator.observer {
            controller.addUserScript(WKUserScript(source: observer, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient))
            controller.add(WeakScriptHandler(context.coordinator), contentWorld: .defaultClient, name: BrowserCoordinator.channel)
        }
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.accessibilityIdentifier = "browser-page"
        context.coordinator.attach(webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: BrowserCoordinator) {
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: BrowserCoordinator.channel, contentWorld: .defaultClient)
        webView.configuration.userContentController.removeAllUserScripts()
        coordinator.detach()
    }
}

@MainActor
final class BrowserCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let channel = "worldletRecord"
    /// The computer's page observer (App/web-record.js, made by scripts/phone-web-record.mjs).
    static let observer: String? = Bundle.main.url(forResource: "web-record", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }

    private let applet: String
    private let model: AppModel
    private let state: BrowserState
    private weak var webView: WKWebView?
    private var watching: [NSKeyValueObservation] = []

    init(applet: String, model: AppModel, state: BrowserState) {
        self.applet = applet
        self.model = model
        self.state = state
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
        state.webView = webView
        watching = [
            webView.observe(\.title) { [weak self] view, _ in Task { @MainActor in self?.state.title = view.title ?? "" } },
            webView.observe(\.canGoBack) { [weak self] view, _ in Task { @MainActor in self?.state.canGoBack = view.canGoBack } },
            webView.observe(\.canGoForward) { [weak self] view, _ in Task { @MainActor in self?.state.canGoForward = view.canGoForward } },
            webView.observe(\.isLoading) { [weak self] view, _ in Task { @MainActor in self?.state.loading = view.isLoading } },
        ]
    }

    func detach() { watching = [] }

    /// One report from the observer, as its JSON.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.channel, message.frameInfo.isMainFrame, let text = message.body as? String else { return }
        model.recordWeb(applet: applet, json: text)
    }

    /// A link that opens a new window opens here instead.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }

    /// Web pages only; a link to another app (mail, phone, an app's own scheme) stays unopened, so the person stays here.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = navigationAction.request.url?.scheme?.lowercased() ?? ""
        decisionHandler(["https", "http", "about", "blob", "data"].contains(scheme) ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}
