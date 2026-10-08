import SwiftUI
import WebKit
import WorldletKit

/// Widgets on the phone (core/widgets/README.md): a page made for the moment, at the top of Now until its end. Tapping
/// one opens it over everything in a sandboxed web view: no network, no stored website data, no navigation, the page
/// loaded from a string. Its local storage is Worldlet's: the page starts from the stored values and reports them as
/// they change, and the app merges them with the computer's, newest edit wins.
struct OpenWidget: Identifiable {
    let id: String
}

/// A widget at the top of Now: its accent, title, blurb and how long it is for.
struct WidgetRow: View {
    let widget: PhoneWidget
    var compact = false
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 10) {
                // The Moment Applet's device from the World, as in the Applet world.
                Image("applet-moment")
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .frame(width: 38, height: 38)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(widget.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
                    if !compact, !widget.blurb.isEmpty {
                        Text(widget.blurb)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.muted.opacity(0.85))
                            .lineLimit(1)
                    }
                    Text(widget.until())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Palette.muted.opacity(0.75))
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.muted.opacity(0.6))
            }
            .padding(10)
            .background(Palette.ink.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(widget.accent.opacity(0.55), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("widget-row")
        .accessibilityHint("Applet. Opens it.")
    }
}

/// An open widget: the system's navigation bar with its name and Done, and the page below.
struct WidgetScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let id: String
    /// The web view's network block could not be set up, so the page is not shown at all.
    @State private var unsafe = false

    var body: some View {
        let widget = model.widgets.first { $0.id == id }
        // The system's navigation bar with the Applet's name and Done (owner request 2026-10-04: native controls).
        NavigationStack {
            Group {
                if let widget, widget.page != nil, !unsafe {
                    WidgetWebView(widget: widget, model: model, refused: { unsafe = true })
                        .ignoresSafeArea(edges: .bottom)
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "desktopcomputer")
                            .font(.system(size: 28))
                            .foregroundStyle(Palette.paperFoot)
                        Text(widget == nil ? "This Applet's moment is over." : "Open it on your computer")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Palette.paperInk)
                        if widget != nil {
                            Text(unsafe ? "This iPhone could not close it off from the network, so it stays shut here. Worldlet keeps your progress in sync."
                                        : "It is too large to send to this iPhone. Worldlet keeps your progress in sync.")
                                .font(.system(size: 14))
                                .foregroundStyle(Palette.paperFoot)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle(widget?.title ?? "Applet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Palette.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                        .accessibilityIdentifier("widget-close")
                }
            }
            .background(Palette.paper.ignoresSafeArea())
        }
        .tint(Palette.forest)
        .environment(\.colorScheme, .light)
    }
}

/// The widget's page in a WKWebView. The seed (stored values and where it was scrolled) is set before the page's own
/// code runs; the page's reports come back through the `worldletWidget` message handler. When a change from the
/// computer alters the values the page has, it is loaded again with the new seed, where it was scrolled.
struct WidgetWebView: UIViewRepresentable {
    let widget: PhoneWidget
    let model: AppModel
    /// The content rule list could not be compiled: the page never loads.
    let refused: () -> Void

    func makeCoordinator() -> WidgetWebCoordinator { WidgetWebCoordinator(model: model, id: widget.id, refused: refused) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Nothing the page stores outlives it; its storage is the app's (the seed and the reports).
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.dataDetectorTypes = []
        configuration.userContentController.add(WeakScriptHandler(context.coordinator), name: WidgetWebCoordinator.channel)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.accessibilityIdentifier = "widget-page"
        context.coordinator.attach(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.show(widget)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: WidgetWebCoordinator) {
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: WidgetWebCoordinator.channel)
        webView.configuration.userContentController.removeAllUserScripts()
    }
}

@MainActor
final class WidgetWebCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let channel = "worldletWidget"

    /// Every http(s) and ws(s) load is blocked; the page itself comes from a string (about:blank) and needs none.
    private static let offlineRules = #"[{"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}},{"trigger":{"url-filter":"^wss?://.*"},"action":{"type":"block"}}]"#
    private static var compiledRules: WKContentRuleList?

    /// Run in every frame before the page's own code: WebRTC connects past the content rules (ICE, STUN and TURN are not
    /// loads), so its constructors are taken out of the page's window for good.
    private static let noWebRTC = #"for(const k of["RTCPeerConnection","webkitRTCPeerConnection","RTCDataChannel"]){try{delete window[k]}catch(e){}try{Object.defineProperty(window,k,{value:undefined,writable:false,configurable:false})}catch(e){}}"#

    private let model: AppModel
    private let id: String
    private let refused: () -> Void
    private weak var webView: WKWebView?
    /// The rule list is in place. Until it is the page does not load, and when it cannot be compiled it never does.
    private var ready = false
    /// The page and values loaded (or about to be): a different page, or values that differ from what the page last
    /// reported, load it again.
    private var shownPage: String?
    private var shownValues: [String: String] = [:]

    init(model: AppModel, id: String, refused: @escaping () -> Void) {
        self.model = model
        self.id = id
        self.refused = refused
        super.init()
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
        if let rules = Self.compiledRules {
            webView.configuration.userContentController.add(rules)
            ready = true
            return
        }
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "worldlet-widget-offline",
                                                                encodedContentRuleList: Self.offlineRules) { [weak self] rules, _ in
            Task { @MainActor in
                if let rules { Self.compiledRules = rules }
                self?.rulesReady(rules)
            }
        }
    }

    private func rulesReady(_ rules: WKContentRuleList?) {
        guard let webView, !ready else { return }
        // Without the rules nothing would stop the page's loads: it stays shut rather than open to the network.
        guard let rules else { return refused() }
        webView.configuration.userContentController.add(rules)
        ready = true
        if shownPage != nil { load() }
    }

    func show(_ widget: PhoneWidget) {
        guard let page = widget.page else { return }
        let values = widgetValues(widget.state)
        if page == shownPage, values == shownValues { return }
        shownPage = page
        shownValues = values
        if ready { load() }
    }

    private func load() {
        guard let webView, let page = shownPage else { return }
        let seed: [String: Any] = ["state": shownValues, "scroll": model.widgetScroll[id] ?? 0]
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: Self.noWebRTC, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        controller.addUserScript(WKUserScript(source: Self.seedScript(seed), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.loadHTMLString(page, baseURL: nil)
    }

    /// `window.__worldletWidgetSeed = {"state":{…},"scroll":n};`, with the values JSON-encoded.
    private static func seedScript(_ seed: [String: Any]) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: seed)) ?? Data(#"{"state":{}}"#.utf8)
        let json = String(decoding: data, as: UTF8.self)
            .replacingOccurrences(of: "<", with: "\\u003c")
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "window.__worldletWidgetSeed=\(json);"
    }

    // MARK: Reports

    /// `{"state":{…all values…}}`, `{"scroll":n}` or `{"error":"…"}` (ignored), as a JSON string.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.channel, message.frameInfo.isMainFrame, let text = message.body as? String,
              let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)),
              let report = object as? [String: Any] else { return }
        if let state = report["state"] as? [String: Any] {
            var values: [String: String] = [:]
            for (key, value) in state { if let value = value as? String { values[key] = value } }
            // What the widget holds now, so the update this edit brings does not load the page again.
            shownValues = model.editWidget(id, values: values)
        } else if let scroll = report["scroll"] as? Double, scroll.isFinite {
            model.widgetScroll[id] = max(0, min(1_000_000, scroll.rounded()))
        }
    }

    // MARK: Sandbox

    /// Only the page itself (about:blank, and jumps within it) loads; links and every other navigation are refused.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let own = url == nil || url?.scheme?.lowercased() == "about"
        decisionHandler(own && navigationAction.targetFrame?.isMainFrame != false ? .allow : .cancel)
    }

    /// No new windows.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if ready { load() }
    }
}

/// The user content controller keeps its message handler strongly; this proxy keeps the coordinator weakly, so the web
/// view, its configuration and the coordinator do not keep one another alive.
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

extension PhoneWidget {
    /// The widget's accent from its "#rrggbb" color.
    var accent: Color {
        var hex = color.trimmingCharacters(in: .whitespaces)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return Color(hex: 0x5C7F9E) }
        return Color(hex: value)
    }

    /// How its end reads beside its name, as on the computer (core/widgets widgetUntil): "Pinned", "Until 6:00 PM",
    /// "Until tomorrow 9:00 AM", "Until Oct 9".
    func until(now: Date = Date()) -> String {
        if pinned { return "Pinned" }
        guard let end = endDate else { return "For now" }
        let calendar = Calendar.current
        let time = end.formatted(date: .omitted, time: .shortened)
        if calendar.isDate(end, inSameDayAs: now) { return "Until \(time)" }
        if let tomorrow = calendar.date(byAdding: .day, value: 1, to: now), calendar.isDate(end, inSameDayAs: tomorrow) {
            return "Until tomorrow \(time)"
        }
        return "Until " + end.formatted(.dateTime.month(.abbreviated).day())
    }
}
