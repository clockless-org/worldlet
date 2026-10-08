import Foundation
import WorldletKit

/// `-demo` shows a fixed Center and conversation without a computer or network, for the simulator screenshots the iOS
/// workflow takes; `-page later` opens the Later page, `-card <id>` an item's card with Fox's dialogue about it and
/// `-live` a reply Fox is still streaming, `-widget <id>` (for example `wgt-demogetty1`) a widget open, `-page applets`
/// the Applet world and `-applet <key>` (for example `gmail`) an Applet's page.
/// Try the demo on the pairing screen shows the same data without a computer, for anyone without Worldlet on a
/// computer yet (and App Review); leaving it from Settings goes back to pairing.
/// Nothing here is real data, and the demo never contacts the relay.
enum Demo {
    static var enabled = ProcessInfo.processInfo.arguments.contains("-demo")

    /// What Fox says to a line typed in the demo, since no computer runs its turn.
    static let reply = "This is the demo, so I can't act on that. With Worldlet running on your computer, I answer here and your computer does the work."

    /// The value after a launch argument, in the demo only.
    static func argument(_ name: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard enabled, let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private static func at(_ minutes: Double) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(minutes * 60))
    }

    private static func item(_ id: String, _ group: AttentionGroup, _ title: String, _ action: String, _ context: String,
                             start: Double? = nil, level: Int = 2, snoozed: Bool = false, fact: String? = nil,
                             summary: String? = nil, source: String? = nil, art: String? = nil, fox: ItemFox? = nil) -> AttentionItem {
        // Each item's home is the demo Applet that reads its provider.
        let home = ["google-calendar": "google-calendar", "gmail": "gmail", "github": "github"][source ?? ""]
        return AttentionItem(id: id, ids: [id], group: group, title: title, action: action, context: context,
                             start: start.map(at), when: "", level: level, snoozed: snoozed, fact: fact, summary: summary, source: source,
                             art: art, fox: fox, applet: home)
    }

    /// The Applet world: only Applets that work on the phone (owner request 2026-10-07), the person's own first (the
    /// widget for now, a website they made into an Applet, an ongoing thing), then the rest, those at work first.
    static let applets: [PhoneApplet] = [
        PhoneApplet(key: "widget:wgt-demogetty1", title: "Getty Center", section: .live, state: .ready, widget: "wgt-demogetty1", mine: "page"),
        PhoneApplet(key: "site-demotldraw01", title: "tldraw", section: .places, state: .ready, line: "Website", mine: "site", url: URL(string: "https://www.tldraw.com/")),
        PhoneApplet(key: "job-dietdemo0001", title: "#diet-and-health", section: .jobs, state: .ready, line: "OpenClaw · Discord · 42 messages · last yesterday",
                    recent: [.init(text: "You: Lunch was the salmon bowl again", at: at(-1500)), .init(text: "OpenClaw: Logged. You're at 1,350 kcal for the day.", at: at(-1499))], mine: "conversation"),
        PhoneApplet(key: "youtube", title: "YouTube", section: .live, state: .busy, line: "YouTube is working on a task…",
                    recent: [.init(text: "Fox asked YouTube to find the talk Ada mentioned", at: at(-4))], url: URL(string: "https://www.youtube.com/")),
        PhoneApplet(key: "gmail", title: "Mail", section: .live, state: .ready, line: "Connected · 1,000 emails",
                    recent: [.init(text: "Read 12 new emails", at: at(-42)), .init(text: "Fox saved Sam's venue question", at: at(-40))],
                    fox: ItemFox(say: "", option: "", turns: [.init(user: "Anything urgent in my inbox?", text: "Only **Sam's venue question**. He needs a yes by Friday.", working: false, at: at(-30))]),
                    url: URL(string: "https://mail.google.com/mail/u/0/")),
        PhoneApplet(key: "google-calendar", title: "Calendar", section: .live, state: .failed, line: "Its sign-in expired. Reconnect it on your computer.", url: URL(string: "https://calendar.google.com/")),
        PhoneApplet(key: "github", title: "GitHub", section: .live, state: .ready, line: "Website", url: URL(string: "https://github.com/")),
        PhoneApplet(key: "notion", title: "Notion", section: .accounts, state: .ready, line: "Connected · 48 pages", url: URL(string: "https://www.notion.so/")),
        PhoneApplet(key: "google-maps", title: "Maps", section: .places, state: .ready, line: "Website", url: URL(string: "https://www.google.com/maps/")),
        PhoneApplet(key: "stripe", title: "Stripe", section: .places, state: .off, line: "Not connected", url: URL(string: "https://dashboard.stripe.com/")),
    ]

    static let attention = AttentionSnapshot(v: 1, at: at(0), now: [
        item("e1", .event, "Calendar", "Design review with Ada", "Bring the onboarding screenshots.", start: 45, level: 4,
             summary: "Ada moved the review to **this morning** and asked for the onboarding screenshots.\n- **Bring the screenshots** from this morning's build.\n- The invite has the new room.", source: "google-calendar", art: "scene-team-meeting",
             fox: ItemFox(say: "Shall we get ready for this?", option: "Help prepare", turns: [
                 .init(user: "Help prepare", text: "Ada asked for the **onboarding screenshots**. I found them in Downloads from this morning and attached them to the invite. The review moved to **Room 4B**.", working: false, at: at(-3)),
             ])),
        item("e2", .event, "Calendar", "Dentist appointment", "Dr. Lee, 22 Mission St.", start: 60 * 26, level: 2, source: "google-calendar", art: "scene-dental-appointment"),
        item("t1", .needsAction, "Mail", "Reply to Sam about the venue", "Sam needs an answer by Friday to hold the date.", level: 3,
             fact: "Due Friday · 5:00 PM",
             summary: "Sam found a venue for the team dinner and **needs a yes by Friday** to hold the date.\n- It seats 14 and is near the office.\n- **Reply to Sam** with a yes or another date.", source: "gmail", art: "scene-restaurant-booking",
             fox: ItemFox(say: "Want me to help with the next step?", option: "Help me do it", turns: [])),
        item("t2", .needsAction, "GitHub", "Review the pairing pull request", "Two checks passed; one review requested from you.",
             fact: "Found 2 hr. ago", source: "github", art: "do-something"),
        item("u1", .unseen, "Weather", "Rain this afternoon", "Showers from 3 PM; take an umbrella for the walk home.", level: 1,
             fact: "Updated 1 hr. ago", art: "scene-weather-rain"),
    ], later: [
        item("l1", .needsAction, "Reminders", "Renew the passport", "Expires in March.", snoozed: true, fact: "Back tomorrow · 9:00 AM", art: "scene-passport"),
        item("l2", .unseen, "Mail", "Newsletter: spring travel deals", "Fares to Tokyo dropped this week.", fact: "Found yesterday"),
        item("l3", .event, "Calendar", "Book club", "Chapter 7 and 8.", start: 60 * 24 * 5, art: "scene-book-club"),
    ], accounts: [AccountIssue(provider: "google-calendar", title: "Calendar", action: .reconnect)], applets: applets)

    static let conversation = Conversation(v: 1, at: at(0), busy: false, name: "Fox", messages: [
        Turn(id: "1", role: .user, text: "What should I do before the design review?", at: at(-6)),
        Turn(id: "2", role: .fox, text: "Ada asked for the **onboarding screenshots**. They are in your Downloads folder from this morning; I can attach them to the invite.", at: at(-5)),
        Turn(id: "3", role: .user, text: "Yes please, and remind me ten minutes before.", at: at(-2)),
        Turn(id: "4", role: .fox, text: "Done. The screenshots are on the invite, and I'll nudge you at 10:35.", at: at(-1)),
    ])

    static var streaming: Bool { enabled && ProcessInfo.processInfo.arguments.contains("-live") }

    /// `-order` shows the Order button, as a computer that takes Orders does.
    static var order: Bool { enabled && ProcessInfo.processInfo.arguments.contains("-order") }

    static let live = LiveTurn(at: at(0), id: "demo-live", user: "What's on my plate this afternoon?",
                               steps: ["Reading your calendar", "Checking your mail"],
                               text: "You have the **design review** at 10:45, then a quiet afternoon. Sam is waiting on the venue", done: false)

    /// A small widget at the top of Now. A real page carries the computer's prelude (core/widgets widgetDocument); this
    /// one has a few lines that stand in for it: storage from the seed, reported back to the app.
    static let widgets = [PhoneWidget(
        id: "wgt-demogetty1", title: "Getty Center", blurb: "Today's tour: the tram, three pavilions and the garden.",
        color: "#c06a3b", endsAt: at(5 * 60), pinned: false, updatedAt: at(-20), version: 1, page: gettyPage,
        state: ["tram": WidgetStateEntry(v: "1", at: (Date().timeIntervalSince1970 * 1000 - 600_000).rounded())])]

    private static let gettyPage = #"""
    <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <script>(()=>{const m=new Map(Object.entries(((window.__worldletWidgetSeed||{}).state)||{}));
    const h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.worldletWidget;
    const post=()=>{try{if(h)h.postMessage(JSON.stringify({state:Object.fromEntries(m)}));}catch(e){}};
    try{Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>m.has(k)?m.get(k):null,
    setItem:(k,v)=>{m.set(String(k),String(v));post();},removeItem:k=>{m.delete(String(k));post();}}});}catch(e){}})();</script>
    <style>body{font:16px -apple-system,sans-serif;margin:0;padding:20px;background:#f4f0e5;color:#304f40}
    h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#617065}
    label{display:flex;gap:12px;align-items:center;padding:14px;margin:8px 0;background:#fff;border-radius:12px}
    input{width:22px;height:22px;accent-color:#c06a3b}</style></head><body>
    <h1>Getty Center</h1><p>Tick each stop as you go.</p>
    <label><input type="checkbox" data-k="tram"> Tram up the hill</label>
    <label><input type="checkbox" data-k="east"> East Pavilion: Irises</label>
    <label><input type="checkbox" data-k="west"> West Pavilion: decorative arts</label>
    <label><input type="checkbox" data-k="garden"> Central Garden</label>
    <script>for(const b of document.querySelectorAll('input')){b.checked=localStorage.getItem(b.dataset.k)==='1';
    b.onchange=()=>localStorage.setItem(b.dataset.k,b.checked?'1':'0');}</script>
    </body></html>
    """#
}
