# Five-layer architecture

Worldlet primarily owns the upper three layers. Keep product rules shared and the
Platform host thin; the Harness and model service are replaceable through explicit contracts.

| Layer | Repository owner | Responsibility |
| --- | --- | --- |
| UI | `ui/` | Shared Web presentation, navigation, Fox and Applet interactions |
| Core | `core/` | Pure product rules, records, scheduling decisions and validation |
| Platform | `platform/` | Electron desktop shell (and the Node host for computers without a display), permissions, persistence, processes and browser IO |
| Harness | The person's own Agent (`harness/` holds the reference adapter example and the `worldlet` skill) | Agent planning, tool loop and admitted job execution; Worldlet never customizes it |
| Models/services | The person's provider, reached through their Agent | Inference access, quotas and usage; Worldlet provides no model |

`contracts/` supplies interfaces across layers; it is not a sixth runtime layer or
an extra execution hop. Resources contain assets and declarations, not product logic.
See the [diagram](architecture.html).

The product in four layers with their components: UI (`ui/`), Agent and Context (the two halves of `core/`: who does the work through the Gate, and everything the World knows) and Platform (`platform/`): [four-layers.svg](four-layers.svg) ([中文](four-layers.zh.svg)).

<a id="see-do-know"></a>
## Four layers: UI, Agent, Context, Platform

Inside the app there are four layers ([#677](https://github.com/clockless-org/worldlet/issues/677)), in plain words See, Do, Know and Host. UI is `ui/`, Agent and Context are the two halves of today's `core/` (moving to `agent/` and `context/`, [#681](https://github.com/clockless-org/worldlet/issues/681)), and Platform is `platform/`.

| # | Layer | What it is | Code |
| --- | --- | --- | --- |
| 1 | **UI** (See) | What a person sees and touches. Windows (the desktop window, the World in a browser at its own address, the phone: all show the same World), World, Applets, Fox's face and conversation panel, Attention, Journal, Settings (Connectors, Agents, Context, General), Onboarding | `ui/` |
| 2 | **Agent** (Do) | Who does the work. Fox (talks through the person's own Agent), Tasks (routines, checks, drafts, Applet jobs), Asks (handing work to someone and waking them; Agents' questions to the person), Agents (one list of local Agents, cloud Agents and scripts, each with its own identity, revocable). Its edge is the **Gate**, the only door: World tools, per-Agent Grants, approval and an audit of every call | `core/` today, moving to `agent/` |
| 3 | **Context** (Know) | Everything the World knows. Context store (one store, four kinds: Synced, Recorded, Made, Known; [#676](https://github.com/clockless-org/worldlet/issues/676)), Storage, Search, and **Connectors**, its intake: sign-in to Services, sync into Synced, and writes the person approved | `core/` today, moving to `context/` |
| 4 | **Platform** (Host) | The machine: Electron (computers with a screen) or Node (no screen). OS permissions, SQLite and files, the keychain, processes, network, pairing and relay connections. It runs things and makes no product decisions | `platform/` |

Someone asks in UI (or an Agent asks directly) → Agent runs it through the Gate, reading
and writing Context → the result is a Made record (an Artifact) → shown in Attention and kept in the Journal (UI).

Rules:

- Calls go downward only.
- Imports follow the layers: `context/` imports only itself and `contracts/`; `agent/` imports `context/` and `contracts/`;
  `ui/` imports the public `index.ts` of both. Nothing but the Platform imports what is left of `core/` (its shared
  dispatcher and old-path re-exports). `npm run check:arch` enforces this; the few exact exceptions are named in
  [scripts/architecture-boundaries.ts](../scripts/architecture-boundaries.ts).
- UI only reads Context; to change anything it hands the work to Agent.
- Everyone in Agent passes the Gate, Fox included. Agents reach Context only through World tools and their Grants.
- Only Connectors write Synced.
- Work results become Artifacts, reach the person through Attention and stay in the Journal.
- Nothing reads storage except through Context's single entry.
- Nothing is deleted automatically; only a retention period the person sets removes data.

The common record envelope, the single read/write entry with Grants and audit, one search
across all four kinds, and draft and pin state for Made records are next steps
([context/items/STORAGE.md](../context/items/STORAGE.md#four-kinds)).

<a id="folders-by-layer"></a>
### Folders by layer

Every folder of `ui/`, `core/` and `platform/` belongs to exactly one layer; each `core/` folder is in Agent or Context.
`npm run check:docs` fails when a folder is missing or listed twice.

The `core/` folders move one at a time. A moved folder is listed at its new place, and `core/` keeps a
re-export at its old `index.ts` (and at any other file used from outside this repository) until nothing imports it.

| Layer | Folders |
| --- | --- |
| UI | `ui/applets/` `ui/artifacts/` `ui/attention/` `ui/browser/` `ui/companion/` `ui/components/` `ui/distribution/` `ui/games/` `ui/hud/` `ui/onboarding/` `ui/practice/` `ui/shell/` `ui/theme-packages/` `ui/themes/` `ui/web/` `ui/world/` |
| Agent (to `agent/`) | `agent/agent/` `agent/tasks/` `agent/companion/` `agent/tools/` `agent/attention/` `agent/onboarding/` `agent/phone/` `agent/diagnostics/` `agent/distribution/` |
| Context (to `context/`) | `context/context/` `context/items/` `context/artifacts/` `context/activity/` `context/accounts/` `context/applets/` `context/board/` `context/browser/` `context/games/` |
| Platform | `platform/bridge/` `platform/browser/` `platform/distribution/` `platform/electron/` `platform/install/` `platform/local-tools/` `platform/node/` `platform/web-engine/` |

<a id="features"></a>
## Features and the base

Layers cut the product across; features cut it down. Each feature is a vertical
slice with its own UI, Core and (when it needs one) Platform part. Every `ui/` and
`core/` component and every Electron host module (`platform/electron/src/modules/`) belongs to exactly one row below; `npm run check:docs` fails when a
component is missing or listed twice. Which layer each folder is in: [folders by layer](#folders-by-layer). The Node host runs the same Core and the same host modules without a window.

| Feature | What it is | UI | Core | Platform |
| --- | --- | --- | --- | --- |
| World | The place everything sits in: areas, HUD, themes | `ui/world/` `ui/hud/` `ui/themes/` `ui/theme-packages/` | `context/activity/` | `platform/electron/src/modules/world.ts` `platform/electron/src/modules/world-audio/` |
| Applets | Where the person's data and actions live, with the real website beside them | `ui/applets/` `ui/browser/` `ui/games/` `ui/practice/` | `context/applets/` `context/board/` `context/browser/` `context/games/` | `platform/electron/src/modules/applet-art/` `platform/electron/src/modules/applet-tools/` `platform/electron/src/modules/browser/` `platform/electron/src/modules/calendar/` `platform/electron/src/modules/games/` |
| Companion | Fox: the one conversation, voice, memory and what Fox is doing | `ui/companion/` | `agent/companion/` | `platform/electron/src/modules/fox/` `platform/electron/src/modules/voice/` |
| Attention | What needs the person now: ranked, at most nine, each waiting for Done, Send or Later | `ui/attention/` | `agent/attention/` | `platform/electron/src/modules/attention/` |
| Tasks | Work that runs without the person: routines, cron jobs, source checks, background drafts and Applet tasks. Fox starts some, Applets start others; the person's Agent does them | (no folder of its own: its status shows in Fox, on Applets and in the Ongoing Applet) | `agent/tasks/` | `platform/electron/src/modules/tasks/` |
| Artifacts & Journal | What work produces: one artifact for every card, draft, page and brief, shown wherever it is needed (Attention, Fox, Applets), and the Journal that keeps them by day | `ui/artifacts/` | `context/artifacts/` | `platform/electron/src/modules/artifacts/` |
| Agents & Gate | The Agents connected to the World and the one door they pass: the connection to the person's Agent (adapters), World tools over the `worldlet` MCP server (local and remote), per-Agent Grants, approvals and the audit | (no folder of its own: Allow cards show in Attention, Settings › Agents beside Fox) | `agent/agent/` `agent/tools/` | `platform/electron/src/modules/agent-runtime/` |
| Context | Everything the World knows, kept on the person's computer: World items and history, conversation and execution journals, source context, and each connected Service's synced snapshots with the one search over them (`world_context`). Storage and kinds: [context/items/STORAGE.md](../context/items/STORAGE.md#four-kinds) | (no folder of its own: every feature reads it; Settings › Context beside Fox) | `context/context/` `context/items/` | (no host module of its own: `platform/electron/src/store/` persists it) |
| Connectors | Context's intake: sign-in to Services (Google, Notion, GitHub, Linear, PostHog, Cloudflare and the rest) and this computer's own sources, their reads, and writes the person approved | (no folder of its own: Settings › Connectors beside Fox) | `context/accounts/` | `platform/electron/src/modules/sources/` |
| Windows | The same World in another window: a web browser at the World's address and the phone, paired by QR code through the end-to-end encrypted relay | `ui/web/` (the page a web browser opens, [web](../agent/phone/README.md#web)) | `agent/phone/` | `platform/electron/src/modules/phone/` |
| Base | Setup, the app shell, distribution and diagnostics | `ui/shell/` `ui/components/` `ui/onboarding/` `ui/distribution/` | `agent/onboarding/` `agent/diagnostics/` `agent/distribution/` | `platform/electron/src/modules/shell/` `platform/electron/src/modules/media/` (the media surface the World's sound, Fox's voice and Voice Memos share), `contracts/` |

Work flows Companion or Applets → Task → Artifact → Attention → Journal: Fox and
Applets start tasks, each task's result is an artifact, an artifact that needs the
person waits in Attention, and every artifact stays in the Journal. Task results
never reach the person except as artifacts.

Each feature keeps its own styles: the artifact card and the Journal in `ui/artifacts/`, Fox's
conversation card and panel in `ui/companion/`, the Attention card in `ui/attention/`. The artifact
card is built on the Attention card's parts and loads after them (`scripts/build-ui.ts`). Fox's
animation (anatomy, poses, studies and players) is in `ui/companion/animation/`.

## Dependency rules

Core imports only Core and Contracts; Contracts depends only on itself. UI consumes
public Core interfaces and the Host bridge. It cannot reach Platform implementations or
Harness internals. A component exports its supported `index.ts` surface; helpers are
private. Platform code executes shared decisions rather than copying them.

Thin means few independent product decisions, not flat folders or a line-count quota.
OS permission enforcement, transactional persistence and process lifetime remain in the Platform host.
Worldlet owns schedule settings and claim authority; Harness executes admitted jobs.

## Chromium and trust boundaries

One [Electron host](../platform/electron/README.md) serves Mac, Windows and Linux; it
replaced the Swift/CEF and C#/WebView2 hosts (#996). The [Node host](../platform/node/README.md) runs
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
own window while it runs ([host/world-web.ts](../platform/electron/src/host/world-web.ts)). The page is the interface build, served
read-only at `http://127.0.0.1:<port>/world/` by [local-relay.ts](../platform/electron/src/modules/phone/local-relay.ts)
(files inside the build after resolving links, `resolveWorldFile`, and only the types the page loads). Its
`worldletHost` is [web-host.ts](../platform/bridge/web-host.ts), which `resolveHost` picks only when the app gave the
page none; it talks to the host over one WebSocket at `/world/socket`, and the host answers through the same router
([host/web-page.ts](../platform/electron/src/host/web-page.ts)). The trust it gets:

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
  that it is not available in a browser window ([page-features.ts](../agent/tools/page-features.ts)) instead of failing
  on their own.
- **The host refuses them too.** Before the router, a browser's page is refused the actions behind each of these
  features (`WEB_PAGE_ACTIONS`: the native website views and what drives them, YouTube, the World's sound, music
  players, speech and the desktop Companion), with the same reason Fox's tools give, so a page that asks anyway
  reaches nothing on this computer's screen. The list of sites the built-in browser visited stays readable.

The World on another device meets the computer through the pairing room, as a third page with less trust (`ROOM_ALLOWED`): [the World on another device](../agent/phone/README.md#the-world-on-another-device).

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

- [ ] **Ownership:** identify one owner for each changed product rule; distinguish UI behavior, pure Core decisions, Platform effects and Harness execution.
- [ ] **Shared first:** check the Electron host modules for duplicate transitions, priorities, retry/timeout/cache policy, validation, prompts, status wording and privacy rules.
- [ ] **Thin adapters:** each retained Platform decision has an OS/API/security reason. Shared code decides policy; the host still enforces actual permissions and validates untrusted inputs.
- [ ] **Dependency direction:** Core imports only Core/Contracts; Contracts imports only Contracts. UI uses the bridge, not Platform implementations or Harness internals.
- [ ] **Capabilities:** unsupported functionality follows declared host capabilities, not copied product flows or scattered platform-name checks.
- [ ] **State and persistence:** Platform storage applies shared state transitions without losing stable IDs, account ownership or user decisions.
- [ ] **Execution:** compare busy state, queueing, cancellation, deadlines, foreground priority and background recovery. OS-specific process mechanics may differ; product outcomes should not.
- [ ] **Evidence:** trace the host path to the shared implementation. Run focused Core fixtures and the Electron module checks (`npm run test:electron`) for changed rules; list device-only verification separately.
- [ ] **Cleanup:** remove superseded Platform policy and tests that merely preserve its old implementation. Do not retain a silent duplicate as a fallback.
- [ ] **Result:** mark each area pass/partial/fail, cite files, rank remaining work, and distinguish code validation from installed-app acceptance.

Import checks do not prove behavior or performance on a device. The
[parity ratchet](../contracts/README.md#parity-vectors) holds the Core operations the
host must keep invoking (the union both native hosts used before #996). Focused commands live in
[the component catalog](../contracts/COMPONENTS.md#architecture-audit). New changes require
proportional checks and do not inherit blanket real-account or clean-machine acceptance.

## Enforced merge gate

`npm run check:arch` resolves TypeScript imports (including baseUrl aliases,
re-exports, type imports and dynamic imports), checks layer dependencies and public
Core/UI component entry points, and rejects computed imports/CommonJS bypasses.
The policy lives in `scripts/architecture-boundaries.ts`; legacy edges are exact
file pairs with reasons, and unused exceptions fail the check. New components follow
the same rules without registration. The Electron host (`platform/electron`) is in this graph; Python helper internals
are not, and their own checks remain in the gate.

The **Architecture** GitHub check runs this gate and shared type checking on every PR.
It exercises Host request validation and Harness version/capability/correlation and
terminal-state rules using fixtures, without app builds, model calls or accounts.
Main requires this check before merging. Contract changes must update the shared
schema, runtime validator and invalid-input/compatibility fixtures together; breaking
wire changes require explicit version negotiation. Passing this gate does not prove
that no product rule is duplicated in the Electron host: review that with the audit above.

Task/run/event shapes also live in [Contracts](../contracts/README.md#execution-journal).
Their validators and privacy projections run in Core; both Platform adapters persist
results into the existing local journal. Harness output never acquires database or
arbitrary event-write authority.
