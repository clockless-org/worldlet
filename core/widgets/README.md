# Moment Applets

A **moment Applet** is an Applet Fox makes for one moment of the person's day (owner requests 2026-10-04: "situational generative UI", then "no widget concept, it is just an Applet; Fox can find new Applets"). Kelvin took friends to the Getty Center and had an Agent write a tour guide as one HTML page: a map of the pavilions, timed stops with Done and Undo, and artworks to tick off. It took a minute to make and was useless once the day was over, but opening it meant leaving for a browser. In Worldlet the person asks Fox ("make me a guide for the Getty today"), and a new Applet named "Getty Center 导览" arrives on the Home ground beside their other Applets, leads the Attention Center's Now and stands in the paired phone's Applet world, where ticking a box on one shows on the other. When its moment is over it leaves.

A made Applet is one of the person's own Applets ([Applets and artifacts](../applets/MY-APPLETS.md)), with their mark on its device, and the most interactive kind of [artifact](../artifacts/README.md): it is listed with the others in the Journal page of Fox's panel, where one whose moment is over can be kept and opened again. There is no Widgets Applet and the person never meets the word widget. In code and storage a made Applet's record is still called a widget (`core/widgets`, the `widgets` table, the phone's `widgets` slot).

## Flow

1. The person says what they need to Fox, anywhere ("帮我做个今天 Getty 的导览", "a packing list for Tahoe this weekend", "a timer board for tonight's dinner"). Fox's guidance (`conversationGuidance`) tells it to make an Applet for such a request rather than answer with a long text.
2. Fox calls `make_applet` (World target `moments/make`) with their words and when the moment ends. Only the person's own words this turn can start it. The host hands the work to an [Applet task](../../docs/FOX-AGENT.md#applet-tasks) of the maker (`MOMENT_MAKER`, which has no device of its own): it runs beside the conversation, which never waits.
3. In that task Fox's model writes **one self-contained HTML page** and sends it with `save_applet` (`moments/save`), with a title (the Applet's name), a one-line blurb, an accent color and `endsAt`, when it stops being useful. Its description is the contract: inline script and style only, nothing from the network, phone-first (360–430 px wide, also fine in a wider window), and everything the person checks, marks or types kept in `localStorage`.
4. The host checks the page (`checkWidgetSource`, the Game Factory's offline rules), then loads it out of sight at phone size (390 × 844) for a few seconds: it must load, draw something other than a blank screen and survive a tap without a script error (`widgetTrialProblems`). Problems go back to the model, which fixes them and saves again.
5. A page that passes is kept and the World changes: the new Applet's device arrives on the Home ground (`momentApplets` in the host's snapshot, built into Applets by `momentApplet` beside the catalog's), it leads Now, it goes to the paired phone, and Fox says the new Applet is ready. Asking Fox to change it calls `make_applet` with `replaces` (the model reads the page with `read_applet`); its state stays.

A page may keep what it shows as data apart from its markup, which Fox updates later with `update_applet_data` without rewriting the page ([data and page](../applets/MY-APPLETS.md#data-and-page)).

`list_made_applets` (`moments/list`) lets Fox name and change earlier ones, including those whose moment is over. Making one runs on whatever charges the world (Worldlet provides none of its own): it is one short page.

## Ready-made Applets

Some moment Applets are written and checked here instead of by Fox's model (`READY_APPLETS`, `core/widgets/ready/`), so they arrive at once and work the same every time (owner request 2026-10-04: "make the Getty guide Applet; when I ask Fox, recommend it directly"). Fox's guidance names each one and the place it is for; whenever the person mentions that place, Fox recommends it first in one short line and adds it with `make_applet` and `ready` (at once if they asked for a guide). The host saves the page as a made Applet without an Applet task, lasting the rest of the local day unless an end is given; one already in the World for now is not added twice, but takes the current page if its own is older, keeping what was ticked. A ready-made page is drawn in Worldlet's style and carries its pictures inside it ([the Getty guide's](../../resources/styles/builtin/drafts/getty-guide/README.md)).

| Key | Applet | What it holds |
| --- | --- | --- |
| `getty-center` | Getty Center 导览 | The campus as a tilting miniature with a numbered pin for each stop, Fox saying what is now, ten timed stops from the tram to the descent with Done and Undo, thirteen artworks by pavilion that turn over when seen, tips and a note |

## Its moment

Each made Applet has an end (`endsAt`, at most two weeks away; twelve hours when the model gives none). Until then it is **for now**: its device stands on the Home ground (always there, never waiting to be unlocked), it leads Now (computer and phone) and its tile is in the phone's Applet world. Opening it shows its page with its end, **Keep it**, **Ask Fox to change it** and **Delete**. At its end it is put away: it leaves the World, Now and the phone, and is forgotten 30 days later; until then Fox can still list it and bring it back by changing it. **Keep it** (pin) keeps it with no end; **Delete** removes it at once (asking first), from the panel or from its device's menu.

## State and sync

The page keeps what the person does through ordinary `localStorage`. A prelude (`widgetDocument`) placed before the page's own code replaces local storage with Worldlet's: it starts from the stored values and reports all of them whenever they change. The host keeps each key with the time it was written (`WidgetState`, `{key: {v, at}}`, `v` null once removed), so the computer and the phone merge edits key by key and the newer write wins (`mergeWidgetState`). Session storage is in memory only. Scroll position is remembered while the app runs, so a page reloaded for a change from the other side opens where it was.

| Where | Seed (stored values) | Reports |
| --- | --- | --- |
| Computer | written into the page by `widgetDocument(html, seed)` | console lines starting with `WIDGET_REPORT` |
| iPhone | `window.__worldletWidgetSeed = {state, scroll}` from a `WKUserScript` at document start | `webkit.messageHandlers.worldletWidget.postMessage(json)` |
| Android | `WorldletAndroid.seed()` returns `{"state":{…},"scroll":n}` (a `@JavascriptInterface`) | `WorldletAndroid.post(json)` |

A report is a JSON string: `{"state":{key:value,…}}` (all values), `{"scroll":n}` or `{"error":"…"}`.

## Sandbox

A made Applet's page is untrusted code and never sees World data, accounts or credentials.

- **Computer**: its own `WebContentsView` laid over the rect its Applet panel reserves, sandboxed, without Node or a preload, in the Game Factory's in-memory session where every request that is not the page itself (`data:`) or something it made (`blob:`) is cancelled. Navigation and new windows are refused. The only channel back is the report lines above.
- **Phones**: a web view with a non-persistent data store and no network (iPhone: a content rule list blocks every load, and a page whose rule list cannot be compiled is not shown; Android: `blockNetworkLoads`, no file or content access), navigation refused, the page loaded from a string with no base URL. WebRTC, which connects past those blocks, is taken out of the page's window before its own code runs (`RTCPeerConnection`, `webkitRTCPeerConnection`, `RTCDataChannel`).
- **Everywhere**: the policy `WIDGET_POLICY` (inline code only, no connections, frames, workers or forms) and the static check refuse network code before a page is ever kept.

## Phone

The computer publishes the slot `widgets` ([phone payloads](../phone/README.md#payloads)): the made Applets for now, newest first, at most six, each with `id`, `title`, `blurb`, `color`, `endsAt`, `pinned`, `updatedAt`, `version`, `state` and `page` (the document with the prelude and no seed). Pages ride along while the sealed box stays under the relay's limit; the oldest page is left out first, and the phone keeps the page it already has for that version. The phone keeps the last slot on the device, so a made Applet works at the museum while the computer sleeps at home. Each is its own tile in the phone's Applet world.

When the person changes something on the phone, the phone stamps the changed keys with its clock, keeps them, and sends a `widget` message `{type:"widget", id, widget, state}` with only those entries; it applies the computer's later slot by the same newest-wins merge, so its own unsent or newer edits stay. The computer merges the message, saves it and publishes the slot again.

## Storage

Local first: made Applets stay in this World and never go to a server. Each one's record (JSON), page and state are a `page` row of the person's own Applets in `world.sqlite` ([one table](../applets/MY-APPLETS.md#one-table)); a replaced page is not kept. At most 40 per World. The practice world has none.

## Checks

`node scripts/widgets-check.ts` (in `test:core`) checks the rules here: records and ends, housekeeping, state merging, the prelude's storage and reports in a page, the static rules, the phone payload's budget and message, the World's Applet for each, and the tools' gates. `node scripts/widgets-ui-check.ts` (in `test:ui`) checks the World page: the device on the Home ground, the row leading Now, the page opening over the sandboxed view, Keep it and Delete, and each ready-made page at phone size: it draws, keeps what was ticked and reports a tick.
