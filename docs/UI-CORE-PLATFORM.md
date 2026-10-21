# Architecture: four layers, 20 components

Inside the app there are four layers, UI, Agent, Context and Platform, and 20 components; each component is one folder.
Outside it are the person's own Agent (the Harness: planning, the tool loop and admitted jobs; Worldlet never customizes
it, and `harness/` holds the reference adapter example and the `worldlet` skill) and the person's own models, reached
through that Agent (Worldlet provides none). `contracts/` holds the interfaces between layers; `resources/` holds assets
and declarations, not product logic.

Pictures: the layers and their components, [four-layers.svg](four-layers.svg) ([中文](four-layers.zh.svg)); each
component's folder in every layer, [layers-and-components.svg](layers-and-components.svg) ([中文](layers-and-components.zh.svg)).

<a id="see-do-know"></a>
## Four layers: UI, Agent, Context, Platform

Inside the app there are four layers ([#677](https://github.com/clockless-org/worldlet/issues/677)), in plain words See, Do, Know and Host. UI is `ui/`, Agent is `agent/` and Context is `context/` (together they were once `core/`, [#681](https://github.com/clockless-org/worldlet/issues/681)), and Platform is `platform/`.

| # | Layer | What it is | Code |
| --- | --- | --- | --- |
| 1 | **UI** (See) | Every screen and its interaction logic, one codebase that every window shows. World (`ui/world/`: places, HUD), Applets (`ui/applets/`: each Applet's screen beside its real website, games, practice), Companion (`ui/companion/`: face, conversation, voice), Attention (`ui/attention/`: what needs the person now, the artifact card and the Journal), Frame (`ui/frame/`: start, setup, settings, navigation), Style (`ui/style/`: shared controls, tokens and themes) | `ui/` |
| 2 | **Agent** (Do) | Who does the work. Companion (`agent/companion/`: turns through the person's own Agent, memory, setup), Tasks (`agent/tasks/`: routines, checks, drafts), Applets (`agent/applets/`: running Applets, driving the browser), Attention (`agent/attention/`: deciding and ranking what needs the person), Gate (`agent/gate/`: every Agent, its Grants, World tools, approvals and audit, local and remote MCP), App rules (`agent/app/`: what the app reports, update channels). Everyone, the companion included, passes the Gate | `agent/` |
| 3 | **Context** (Know) | Everything the World knows, in one hub on the person's own machine. Store (`context/store/`: the hub; every record, history, artifacts and made games; one way in and out and one search, `context/store/context.ts`, #676), Applets (`context/applets/`: the catalog, each Applet's records and the World log), Connectors (`context/connectors/`: Services in and out, what they sync, Service presets and the board). Four kinds of record live in the Store: Synced, Recorded, Made, Known ([#676](https://github.com/clockless-org/worldlet/issues/676)) | `context/` |
| 4 | **Platform** (Host) | Where the World runs and every window that reaches it. Host (`platform/host/`: the shared host Desktop and Server both run: router, host modules, storage, vault, the relay link), Desktop (`platform/desktop/`: Electron around the Host, the window, OS permissions, updates, installers), Server (`platform/server/`: Node around the Host, no screen), Web (`platform/web/`: how a page talks to its host, the page a browser opens, pairing), Phone (`platform/ios/`, `platform/android/`). It runs things and makes no product decisions | `platform/` |

Someone asks in UI (or an Agent asks directly) → Agent runs it through the Gate, reading
and writing Context → the result is a Made record (an Artifact) → shown in Attention and kept in the Journal (UI).

Rules:

- Calls go downward only.
- Imports follow the layers: `context/` imports only itself and `contracts/`; `agent/` imports `context/` and `contracts/`;
  `ui/` imports the public `index.ts` of both. `npm run check:arch` enforces this; the few exact exceptions are named in
  [scripts/architecture-boundaries.ts](../scripts/architecture-boundaries.ts).
- The operations repository uses this repository only through [`api/`](../api/README.md). Nothing here imports `api/`,
  and moving or renaming a folder means updating `api/`, never the operations repository.
- UI only reads Context; to change anything it hands the work to Agent.
- Everyone in Agent passes the Gate, Fox included. Agents reach Context only through World tools and their Grants.
- Only Connectors write Synced.
- Work results become Artifacts, reach the person through Attention and stay in the Journal.
- Nothing reads storage except through Context's single entry.
- Nothing is deleted automatically; only a retention period the person sets removes data.

The record envelope, the single read/write entry (`contextReader`, `contextWriter`, and `connectorWriter` for Synced) and
one search across all four kinds are in `context/store/context.ts` ([one way in](../context/store/STORAGE.md#one-way-in));
`npm run check:arch` enforces that UI only reads and only Connectors write Synced. Routing the remaining domains with
Grants and audit, one database with content-addressed files, and draft and pin state for Made records are next steps.

<a id="folders-by-layer"></a>
### Folders by layer

Every folder of `ui/`, `agent/`, `context/` and `platform/` belongs to exactly one layer.
`npm run check:docs` fails when a folder is missing or listed twice.

The shared dispatcher the Platform calls is `agent/index.ts`, since it calls both Agent and Context.

| Layer | Folders |
| --- | --- |
| UI | `ui/world/` `ui/applets/` `ui/companion/` `ui/attention/` `ui/frame/` `ui/style/` | Every screen and its interaction logic, one codebase every window shows |
| Agent (`agent/`) | `agent/companion/` `agent/applets/` `agent/attention/` `agent/tasks/` `agent/gate/` `agent/app/` |
| Context (`context/`) | `context/store/` `context/applets/` `context/connectors/` |
| Platform | `platform/host/` `platform/desktop/` `platform/server/` `platform/web/` `platform/ios/` `platform/android/` `platform/bridge/` `platform/browser/` `platform/distribution/` `platform/install/` `platform/local-tools/` `platform/web-engine/` |

<a id="features"></a>
## Components across the layers

Most components have a part in more than one layer: the screen in UI, the rules in Agent or Context, and the host side
in Platform. Each row is one component with its folder in every layer. Every `ui/`, `agent/` and `context/` folder and
every host module (`platform/host/modules/`) is in exactly one row; `npm run check:docs` fails when one is missing or
listed twice. Which layer each folder is in: [folders by layer](#folders-by-layer). Desktop (`platform/desktop/`) and
Server (`platform/server/`) both run the shared Host (`platform/host/`).

| Component | What it does | UI | Agent and Context | Platform |
| --- | --- | --- | --- | --- |
| World | The places, HUD and themes the person moves through | `ui/world/` | (none: the World log is part of Context's applets) | `platform/host/modules/world/` |
| Applets | The person's data and actions, each beside its real website; the Agent runs them and drives the browser | `ui/applets/` | `agent/applets/` `context/applets/` | `platform/host/modules/applets/` |
| Companion | The one conversation, voice and memory, through the person's own Agent | `ui/companion/` | `agent/companion/` | `platform/host/modules/companion/` |
| Attention | What needs the person now, at most nine, and the Journal of everything work produced | `ui/attention/` | `agent/attention/` | `platform/host/modules/attention/` |
| Tasks | Work without the person: routines, checks, drafts, Applet jobs | (none: its status shows on the companion and on Applets) | `agent/tasks/` | `platform/host/modules/tasks/` |
| Gate | Every Agent that reaches the World, its Grants, World tools, approvals and audit; local and remote MCP | (none: its pages are in the Frame's Settings) | `agent/gate/` | `platform/host/modules/gate/` |
| Store | The hub: every record, one way in and out, one search | (none: every component reads it) | `context/store/` | (none of its own: `platform/host/store/` persists it) |
| Connectors | Services in and out: sign-in, what they sync, Service presets and the board, approved writes | (none: its page is in the Frame's Settings) | `context/connectors/` | `platform/host/modules/connectors/` |
| App | The app around it all: start, setup, settings, shared controls and themes, what it reports, updates | `ui/frame/` `ui/style/` | `agent/app/` | `platform/host/modules/app/` |
| Windows | The same World in another window: a browser at its link, the phones | (none: every window shows the same UI) | (none) | `platform/host/modules/windows/` (the host side; `platform/web/`, `platform/ios/` and `platform/android/` are the windows) |

Work flows Companion or Applets → Task → Artifact → Attention → Journal: Fox and
Applets start tasks, each task's result is an artifact, an artifact that needs the
person waits in Attention, and every artifact stays in the Journal. Task results
never reach the person except as artifacts.

Each feature keeps its own styles: the artifact card and the Journal in `ui/attention/`, Fox's
conversation card and panel in `ui/companion/`, the Attention card in `ui/attention/`. The artifact
card is built on the Attention card's parts and loads after them (`scripts/build-ui.ts`). Fox's
animation (anatomy, poses, studies and players) is in `ui/companion/animation/`.

## Dependency rules

Context imports only Context and Contracts; Agent imports Agent, Context and Contracts; Contracts depends only on itself. UI consumes
public Agent and Context interfaces and the Host bridge. It cannot reach Platform implementations or
Harness internals. A component exports its supported `index.ts` surface; helpers are
private. Platform code executes shared decisions rather than copying them.

Thin means few independent product decisions, not flat folders or a line-count quota.
OS permission enforcement, transactional persistence and process lifetime remain in the Platform host.
Worldlet owns schedule settings and claim authority; Harness executes admitted jobs.

## Chromium and trust boundaries

One [Electron host](../platform/desktop/README.md) serves Mac, Windows and Linux; it
replaced the Swift/CEF and C#/WebView2 hosts (#996). The [Node host](../platform/server/README.md) runs
its modules that need no window for Linux and computers without a display, and shows the same World page in a web
browser on that computer (below); it reuses those modules through a small `electron` stand-in rather than holding
product rules of its own. The shared World UI is a separate
Chromium view from external website/media views. Only the trusted packaged World
(`worldlet://app/index.html`) receives the Host bridge, through a `contextBridge`
preload; the main process re-checks the sending frame. Website scripts never receive
host privileges and run in their own session partition.

<a id="the-world-in-a-web-browser"></a>
**The World in a web browser.** There is one UI: the host serves the same World page to a browser on the same
computer ([contracts/web-world.ts](../contracts/web-world.ts)), the Node host as its only page and the app beside its
own window while it runs ([host/world-web.ts](../platform/host/world-web.ts)). The page is the interface build, served
read-only at `http://127.0.0.1:<port>/world/` by [local-relay.ts](../platform/host/modules/windows/local-relay.ts)
(files inside the build after resolving links, `resolveWorldFile`, and only the types the page loads). Its
`worldletHost` is [web-host.ts](../platform/bridge/web-host.ts), which `resolveHost` picks only when the app gave the
page none; it talks to the host over one WebSocket at `/world/socket`, and the host answers through the same router
([host/web-page.ts](../platform/host/web-page.ts)). The trust it gets:

- **Same computer only.** The server listens on 127.0.0.1 and answers only requests addressed to `127.0.0.1` or
  `localhost` on its port by name (the `Host` header), so a website cannot reach it through a name it points at
  127.0.0.1. The socket also requires the page's own origin (`Origin`).
- **A token.** The socket opens only with the World's 32-byte random token, offered as a WebSocket subprotocol and
  compared in constant time. The token travels in the link's fragment (`/world/#t=<token>`), which a browser never
  sends to a server; the page keeps it for the tab and takes it out of the address. The host keeps it in the vault and
  writes the link only to an owner-only file, never to stdout.
- **Less than the app.** Before the router, the host refuses `WEB_DENIED`: the pairing secrets and pairing or unpairing
  another device (a pairing's status, as a reply or an event, comes without its link), local data deletion, restore and the library backup, and
  the local tools that read other programs' files. The page also gets no web capture (`analyticsConfig`), so it loads
  no PostHog client and sends nothing to `/ingest`; the host serves no ingest route for it.
- **Its own policy.** The World document is served with the web variant of the page's Content-Security-Policy as a
  header (`worldWebCsp`), and the app window's meta tag (`WORLD_PAGE_CSP`, which the build writes and the window keeps
  unchanged) is taken out of it, since a meta policy can only add to a header's. `connect-src` allows only the page's
  own origin and its socket (`ws://<host>/world/socket`); YouTube's pictures are not allowed, and no other site may
  frame the page.
- **One page at a time.** A newer page takes over and the older one says the World is open in another tab.
- **Beside the app's window.** In the app, the window's World page and a browser's do not take the World from each
  other (`createPagePair`). The window stays the World's page; a browser's page is an extra one, and the takeover
  rule above holds among browser tabs only. Events and the World's snapshot reach both pages. Calls only a window
  answers (its native views, menus, sound, voice, the desktop Companion) reach the window. A call about work a page
  started (a Fox turn, an Applet task, a cloud stream, named by the `id` or `streamId` of its request or the `id` the
  host answered) goes back to that page. Anything else goes to the window while its page is loaded, else to the
  browser's (Run in background loads no window page). A browser tab coming and going is not the window's page
  loading or reloading, so it never stops the window's sound, voice or Fox turn. It does get what any page gets
  pushed when it comes (`onPageConnected`, beside the window's own `onPageLoaded`): the calls going on now, for one.

**What a browser window cannot do.** Some of the app window's features have no browser equivalent. The socket's
handshake names them (`WEB_PAGE_FEATURES`), and the page turns those `HostFeatures` off whatever the snapshot says
([features.ts](../platform/bridge/features.ts) `pageFeatures`). The app's own page hears no such flags and is
unchanged. The page flags (`websitePages`, `youtube`, `worldAudio`, `voice`, `desktopCompanion`) are on when a host
leaves them out, unlike the host services, which fail closed: every app window has them.

- **Websites and the Browser** open in a new tab instead of a native view over the panel.
- **Hidden:** YouTube (the World leaves it out and the catalog does not offer it), the World's sound and music
  players, the microphone (speaking to Fox, Talk, dictation and spoken replies), the desktop Companion window, and the
  corner room the Mac keeps for its window buttons.
- **Fox's tools** that need one of these (the built-in browser, YouTube, the World's sound, music players) answer
  that it is not available in a browser window ([page-features.ts](../agent/gate/page-features.ts)) instead of failing
  on their own.
- **The host refuses them too.** Before the router, a browser's page is refused the actions behind each of these
  features (`WEB_PAGE_ACTIONS`: the native website views and what drives them, YouTube, the World's sound, music
  players, speech and the desktop Companion), with the same reason Fox's tools give, so a page that asks anyway
  reaches nothing on this computer's screen. The list of sites the built-in browser visited stays readable.

The World on another device meets the computer through the pairing room, as a third page with less trust (`ROOM_ALLOWED`): [the World on another device](../platform/web/README.md#the-world-on-another-device).

CDP controls a selected target; it is not a renderer, authorization bypass or general
component API. Agent-operated World navigation uses versioned semantic actions through
the same handlers as user interaction. Releasing a website destroys its page/media; leaving one keeps
at most two recent pages hidden, media paused, under the shared [resume rule](../platform/browser/INTEGRATION.md#resuming-a-website-applet),
unless the person keeps one playing as the World's [picture-in-picture](../platform/browser/INTEGRATION.md#picture-in-picture) window.

<a id="repository-layers"></a>
## Components and public interfaces

The [component catalog](../contracts/COMPONENTS.md) maps directories, exported APIs,
runtime invariants and Platform persistence operations. The [Harness wire contract](../contracts/HARNESS.md)
defines negotiation, capabilities, correlated events and cancellation. Unsupported
capabilities fail explicitly; no silent Platform or Harness-specific alternate flow.

<a id="architecture-audit"></a>
## Audit checklist

This is the single audit checklist; other documents link here.

- [ ] **Ownership:** identify one owner for each changed product rule; distinguish UI behavior, pure Agent and Context decisions, Platform effects and Harness execution.
- [ ] **Shared first:** check the Electron host modules for duplicate transitions, priorities, retry/timeout/cache policy, validation, prompts, status wording and privacy rules.
- [ ] **Thin adapters:** each retained Platform decision has an OS/API/security reason. Shared code decides policy; the host still enforces actual permissions and validates untrusted inputs.
- [ ] **Dependency direction:** Context imports only Context/Contracts, Agent only Agent/Context/Contracts; Contracts imports only Contracts. UI uses the bridge, not Platform implementations or Harness internals.
- [ ] **Capabilities:** unsupported functionality follows declared host capabilities, not copied product flows or scattered platform-name checks.
- [ ] **State and persistence:** Platform storage applies shared state transitions without losing stable IDs, account ownership or user decisions.
- [ ] **Execution:** compare busy state, queueing, cancellation, deadlines, foreground priority and background recovery. OS-specific process mechanics may differ; product outcomes should not.
- [ ] **Evidence:** trace the host path to the shared implementation. Run focused Agent and Context fixtures and the Electron module checks (`npm run test:electron`) for changed rules; list device-only verification separately.
- [ ] **Cleanup:** remove superseded Platform policy and tests that merely preserve its old implementation. Do not retain a silent duplicate as a fallback.
- [ ] **Result:** mark each area pass/partial/fail, cite files, rank remaining work, and distinguish code validation from installed-app acceptance.

Import checks do not prove behavior or performance on a device. The
[parity ratchet](../contracts/README.md#parity-vectors) holds the shared Agent and Context operations the
host must keep invoking (the union both native hosts used before #996). Focused commands live in
[the component catalog](../contracts/COMPONENTS.md#architecture-audit). New changes require
proportional checks and do not inherit blanket real-account or clean-machine acceptance.

## Enforced merge gate

`npm run check:arch` resolves TypeScript imports (including baseUrl aliases,
re-exports, type imports and dynamic imports), checks layer dependencies and public
UI, Agent and Context component entry points (each component's `index.ts`), the Context rules (UI only reads; only
Connectors write Synced), and rejects computed imports/CommonJS bypasses.
The policy lives in `scripts/architecture-boundaries.ts`; legacy edges are exact
file pairs with reasons, and unused exceptions fail the check. New components follow
the same rules without registration. The Electron host (`platform/desktop`) is in this graph; Python helper internals
are not, and their own checks remain in the gate.

The **Architecture** GitHub check runs this gate and shared type checking on every PR.
It exercises Host request validation and Harness version/capability/correlation and
terminal-state rules using fixtures, without app builds, model calls or accounts.
Main requires this check before merging. Contract changes must update the shared
schema, runtime validator and invalid-input/compatibility fixtures together; breaking
wire changes require explicit version negotiation. Passing this gate does not prove
that no product rule is duplicated in the Electron host: review that with the audit above.

Task/run/event shapes also live in [Contracts](../contracts/README.md#execution-journal).
Their validators and privacy projections run in Agent and Context; both Platform adapters persist
results into the existing local journal. Harness output never acquires database or
arbitrary event-write authority.
