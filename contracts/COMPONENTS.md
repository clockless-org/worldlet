# Shared UI, pure Core, thin Platform

Chapters:
- [Repository layers and components](#repository-layers)
- [Component interfaces](#component-interfaces)
- [Five-layer architecture audit](#architecture-audit)


Current migration status: layer boundaries are enforced, but behavioral parity is **not complete**. Current gaps are the [parity ratchet](README.md#parity-vectors): Core operations the retired native hosts invoked that the Electron host does not yet route through Core (`electronPending` in [`host-core-usage.json`](fixtures/parity/host-core-usage.json)). Earlier acceptance evidence is historical and remains in Git and PR #161.

This is the implementation standard for the upper three layers. The complete
runtime stack remains **UI → Core → Platform → Harness → Models/Services**.
`contracts/` defines interfaces across those layers; it is not an execution layer.

## Components and interfaces

| Layer | Components / directories | Public interface | Must not own |
| --- | --- | --- | --- |
| UI | `ui/world`, `ui/applets`, `ui/companion`, `ui/attention`, `ui/shell` | Versioned semantic World actions in `contracts/ui.ts`; component functions; host transport | OS branches, provider protocols, independent scheduling policy |
| Core | `core/agent`, `core/applets`, `core/attention`, `core/scheduling`, `core/companion`, `core/context`, `core/items`, `core/browser`, `core/tools`, `core/diagnostics`, `core/onboarding` | Each component's `index.ts`; serialized native entry in `core/index.ts` | DOM, filesystem, clocks, sockets, Electron/Node types, platform conditions |
| Platform | `platform/bridge`, `platform/electron`, `platform/browser`, `platform/local-tools` | `contracts/platform.ts`; shared Core requests/results; negotiated Harness contract | A second copy of onboarding, source processing, retry/priority or model-selection rules |
| Harness | `harness/hermes` or an external adapter | `contracts/harness.ts`, capability discovery, tasks/events/cancellation | World UI implementation or ownership of portable user records |
| Models/Services | `models` and provider APIs | Harness/provider protocols | UI navigation and OS permissions |

Core takes explicit inputs (including time and capability facts) and returns
values/decisions. Platform executes those decisions and reports facts. UI renders
the state and submits commands. These are dependency/ownership boundaries, not
five synchronous calls for every operation.

## Chromium, Electron and CDP

- **Chromium** renders HTML, CSS, JavaScript and the Pixi world.
- **Electron** embeds Chromium on Mac, Windows and Linux. The trusted World and each
  website are separate `WebContentsView`s in one `BaseWindow`
  ([Electron host](../platform/electron/README.md)).
- **CDP** observes and controls a selected browser target. It is a protocol, not
  a renderer or a replacement for normal UI ↔ Core messages.

Do not expose a public debugging port: the host strips `--remote-debugging-*` launch
switches (`platform/electron/src/main.ts`). The browser driver attaches through
`webContents.debugger` to the host-selected page only. Connecting an Agent does not grant
access to every tab, cookies, host methods or arbitrary local files.

## Independent surfaces in one window

```text
Electron BaseWindow / Platform
 ├─ Trusted World WebContentsView (worldlet://app)
 │   ├─ World + HUD + Fox + Applet UI
 │   └─ worldletHost.request → host router → host module → shared Core / IO
 └─ External website WebContentsView (own session partition)
     └─ Website session + CDP browser adapter (no World host bridge)
```

The website is a sibling view positioned over the slot reserved by the World.
It is not a third-party iframe inside the trusted application. This supports
sites that forbid framing and keeps their scripts outside host privileges.
World and website storage contexts are separate. Releasing a website destroys its
page and media session. A page kept for a quick return is hidden with its media paused
and muted ([resume rule](../platform/browser/INTEGRATION.md#resuming-a-website-applet));
neither may leave hidden playback behind. A page the person keeps watching plays visibly as
the World's [picture-in-picture](../platform/browser/INTEGRATION.md#picture-in-picture) window.

Only the packaged main World document gets the host bridge. Main-document
navigation cannot replace it with a website. Subframes cannot send host requests.
File resources are restricted to the packaged UI root after resolving symlinks.
New windows/HTTPS links route to the in-app browser. CSP remains active.

## Agent-operated World

`window.worldletUI` is a versioned semantic interface available in the trusted
World renderer. Its `snapshot()` returns current location and available region /
Applet targets. `dispatch({version:1, action:'activate', id})`, `back` and
`overview` use the same navigation handlers as the UI and the existing tool
gateway. Core validates version, command shape and current target membership.

A Pixi canvas is not a DOM button tree. Agents should use semantic IDs rather
than guess coordinates. CDP is the host transport for observing/invoking this
interface; adding this interface alone does not advertise a new Harness tool.
Existing World tools remain the authorized Agent entry point. Content reads,
account connection, sending mail and purchases retain their existing permissions
and review paths. Navigation must not manufacture approval metadata.

## Review requirements

Use the [architecture audit checklist](../docs/UI-CORE-PLATFORM.md#architecture-audit). Current parity gaps live in the [parity ratchet](README.md#parity-vectors).

## Delivery scope

World/HUD, website and restricted media surfaces are Electron `WebContentsView`s on
every OS. The same trusted live World view moves into the desktop Companion window
(`modules/shell/companion.ts`), preserving its conversation and draft. Shared Core
runs in-process (`platform/electron/src/core.ts`); it is not a UI renderer. OS input,
composition, focus and pixel presentation are IO; World rendering and interaction
decisions stay in shared UI.

Device checks of the Electron app are recorded in their release Issues with explicit
limits; acceptance of the retired native hosts does not carry over. Use [render performance](../ui/world/ENVIRONMENT.md#render-performance)
for current presentation mechanics. Historical repair and acceptance journals
remain in Git and their linked issues rather than duplicating the final record.

<a id="repository-layers"></a>
## Repository layers and components

See the migration status at the [top of this catalog](#shared-ui-pure-core-thin-platform).

Current [component interfaces and browser/runtime audit](COMPONENTS.md#component-interfaces).

The [architecture diagram](../docs/architecture.html) follows the source tree. Runtime layers have explicit owning directories; the independently deployed model API lives at the repository root. Shared contracts and resources are explicit supporting modules, not a catch-all `shared/` folder.

Directory ownership follows the [component table](#components-and-interfaces). Each runtime layer has one root; host modules and subdirectories do not create additional layers.

### Supporting modules

| Directory | Responsibility |
| --- | --- |
| [contracts/](.) | Host/Agent interfaces and shared data shapes; depends only on contracts |
| [resources/](../resources) | Worlds, style pack, media, fonts, original brand assets and distribution resources |
| [scripts/](../scripts) | Build, verification and distribution orchestration; `build-native-ui.ts` builds the common UI |
| website/ | Marketing and fictional demo, consuming reusable UI renderer/resources |
| worker/, migrations/ | Website/download/cloud infrastructure; outside the desktop runtime layers |
| [docs/](../docs) | Product and contributor guidance |

### One component, one owner

- **Applet definitions:** `core/applets/catalog.ts` and `core/applets/definitions/<key>.ts` own identity, capabilities and declared states. `ui/applets/<key>/` owns rendering, panels and logo presentation. Model context and tools can read the catalog without importing UI.
- **Companion:** `core/companion/` owns portable records, validation, recall and prompt rules; `ui/companion/` owns dialogue and animation. Host storage and credential operations remain in the Electron host (`modules/fox/companion.ts`, `src/vault.ts`).
- **Schedules:** `core/scheduling/` owns Worldlet source-check rules and settings policy. The platform supplies consent, app lifecycle and an awake clock. `harness/hermes/routines.py` claims due jobs, runs them and saves results. External backends must advertise and implement equivalent services.
- **Host persistence:** `platform/electron/src/store/world-store.ts`, `store/ledger.ts` and the companion records in `modules/fox/companion.ts` belong to layer 3. Layer 2 owns the rules they apply. They are not listed as a second implementation in `core/`.
- **Local execution:** `platform/local-tools/` supplies speech and coding CLI helpers independently of the selected Harness.
- **Connectors:** Hermes-bound readers/authentication remain in `harness/hermes/`. There is no empty generic connectors folder or claim that these modules are independent. Do not put source connectors in `models/`; that directory owns only the hosted model API.

### Dependency rules

1. `contracts/` depends only on itself. `core/` depends only on core/contracts; no DOM, OS/host APIs or runtime libraries.
2. `ui/` consumes core, contracts and resources. OS communication uses `platform/bridge/`; it cannot import Platform implementations or Harness internals.
3. `platform/` owns permissions, processes, browser integration and persistence. It composes the selected Harness through the negotiated protocol.
4. `harness/` owns backend-specific configuration and execution. Replacing it does not transfer ownership of Worldlet records or bypass host authorization.
5. `models/` holds the independently deployed included-model API; provider configuration that requires Hermes stays with Hermes.
6. `resources/` contains assets and declarations, not executable application logic. `ui/components/style.ts` is the read-only style lookup.

The Electron host is one TypeScript project under `platform/electron/`, with one module per domain (`src/modules/*`); modules do not represent extra product layers. It consumes shared rules through in-process Core (`src/core.ts`) with the same JSON envelope the retired native hosts used. This does not establish complete behavioral parity: the [parity ratchet](README.md#parity-vectors) and device acceptance remain explicit audit items.

For recurring review criteria and the current migration gaps, use [the architecture audit](../docs/UI-CORE-PLATFORM.md#architecture-audit).

### Shared-first implementation rule

Business behavior is shared by default. A new condition, state transition, retry, priority, normalization, report shape or privacy allowlist belongs in `core/`; presentation belongs in `ui/`. Host modules collect OS facts, enforce actual permissions, run processes, persist data and execute shared decisions. They must not invent an alternate product flow. Keep host code small by removing duplicated decisions, not by moving code into another host module.

| Concern | Single rule owner | Host responsibility |
| --- | --- | --- |
| Source completion and retry | `core/scheduling/source-checks.ts` | Clock, authorized read, persist result |
| Queue priority, admission and preemption | `core/scheduling/agent-work.ts` | Reservations, process handles, cancellation and draining |
| Execution deadlines | `core/scheduling/agent-deadline.ts` | Timers and process termination |
| Onboarding transitions | `core/onboarding/onboarding.ts` | Account authorization and persistence |
| Model status and product guidance | `core/companion/model-status.ts`, `conversation-guidance.ts` | Provider facts, capability facts and IO |
| Trace/report projection and privacy | `core/diagnostics/` | OS/build facts, bounded file IO, export picker |
| Conversation/interface state | `ui/companion/`, `core/agent/` | Harness transport and OS lifecycle |

Exercise shared rules through Core fixtures and the golden vectors replayed by in-process Core. Do not add silent host copies as fallbacks when shared code fails. OS API differences remain legitimate. The [parity ratchet](README.md#parity-vectors) keeps the union of Core operations the two retired native hosts invoked and lists those the Electron host does not yet route; device-only limits stay in the owning Issue/PR.

### Migration and compatibility

The old `app/`, `shared/`, `adapters/`, `applets/`, `worlds/` and `services/` source roots are retired. There are no forwarding source modules or compatibility symlinks. Builds and watchers use the new roots. `scripts/build-native-ui.ts` replaces the Mac-owned shared-UI builder.

Installed `WorldletWeb` resource names, Agent profile locations, bundle IDs, host callback names, storage schemas and user data do not change. This is a source-layout migration, not a user-data migration or release.

The proposed open-source scope is `ui/`, `core/`, `platform/`, contracts/resources and adapter examples. Existing external Harnesses need compatible adapters; no license change or repository split is made here.

Validation: `check:source`, `check:style` and `test:core` enforce dependency boundaries, retired source roots, imports, platform contracts and world assets. UI/website builds and `npm run test:electron` exercise the rewritten build paths. Device results belong to the owning Issue/PR; new changes need proportional checks.

### Autonomous service target

The [World runtime target design](../core/applets/RUNTIME.md#target-design-world-runtime-and-autonomous-services) specifies the common task/claim contract, independent resource pools, durable subscriptions and Companion command operations. It is a staged implementation target, not a claim of current host parity. World-owned Core defines scheduling policy and state transitions; the selected Harness executes admitted, leased jobs. The Platform host provides the clock, permissions and transactional storage. Do not introduce a second competing scheduler or move product policy into a Harness-specific prompt.

### Host compatibility

The UI composition root injects one Host transport. Hosts advertise versioned
capabilities; missing v1 flags are false and unknown versions fail explicitly.
Legacy compatibility stays in one resolver. UI flags never replace host
permission, frame/origin or account checks. In-process Core exchanges JSON only and
gets no host IO. Whole-world backups are one SQLite file of the library's files on every
OS (format 2, `modules/shell/backup.ts`); the Mac `WorldBackup.Archive` JSON (format 1) still
restores. Portable companion archives are a different contract.
Shared companion limits and timestamp/UUID policy live in
`contracts/companion-policy.json`; the host imports it directly, and `test:core`
(`scripts/companion-policy.ts`) rejects restated limits. Runtime/installed resource paths and stored IDs stay compatible.

<a id="component-interfaces"></a>
## Component interfaces

### Component map

| Layer/component | Public interface | Responsibility |
| --- | --- | --- |
| UI World | World navigation/placement events and shared renderer | Camera, regions, sprites; never mutate Platform records directly |
| UI Applets | Catalog-driven routes and Peek/Open/Focus | Device presentation and content selection |
| UI Attention | Item projections and explicit item actions | Render Coming Up, Do Something, Worth Knowing |
| UI Companion | Conversation/activity events and Host requests | Dialogue, steering, progress and action presentation |
| Core Applets | `core/applets/index.ts` | Catalog, runtime definitions, read plans, capabilities and device state |
| Core Scheduling | `core/scheduling/index.ts` | Claims, leases, fencing, retries, pools, deliveries and operation outcomes |
| Core Attention | `core/attention/index.ts` | Visibility, relevance inputs, suppression, synthesis budgets |
| Core Activity | `core/activity/index.ts`, `contracts/activity.ts` | Local observation schemas, visit correlation, sampled foreground dwell, snapshot changes and redaction; no IO |
| Core Items | `core/items/index.ts` | Identity, validation, state transitions, evidence projections; `worldHistoryQuery` and `worldHistoryPage` own shared history filtering and bounded retrieval |
| Core Context | `core/context/index.ts` | Source context, validation, schema and layout |
| Core Companion / Agent | `core/companion/index.ts`, `core/agent/index.ts` | Portable memory/history, guidance, model freshness and response classification |
| Core Browser / Tools | `core/browser/index.ts`, `core/tools/index.ts` | Browser action policy and declared tools; no browser IO |
| Core Onboarding / Diagnostics | `core/onboarding/index.ts`, `core/diagnostics/index.ts` | Setup transitions and allowlisted diagnostic projection |
| Platform UI bridge | `platform/bridge/host.ts`, `contracts/platform.ts` | One trusted Host transport; capability discovery |
| Platform Store / ledger | Host-facing Store domain operations; ledger transactions stay internal to domain adapters | Authorization, atomic claims, output writes, delivery acknowledgement and persistence |
| Platform browser | World browser gateway; `platform/browser/README.md` | Selected-page IO, consent, confirmations, cancellation and receipts |
| Platform Agent adapter | `AgentRuntime` (`platform/electron/src/host/services.ts`) / executable protocol, `contracts/agent.ts` | Process lifecycle, protocol negotiation, cancellation and event validation |
| Harness | Agent descriptor + supported operations | Planning and backend-specific execution; no UI/private ledger access |
| Model service | HTTP model API and access/usage operations | Inference access, quota/accounting; no World/Applet policy |

### Browser component implementation map

The [component diagram](../docs/architecture.html) shows logical component groups,
public entry points, and browser/journal execution paths. UI and Core components
have checked public module boundaries. Host modules below live inside the one Electron
project, not separately packaged libraries. Paths are under `platform/electron/src/`.

| Component | Shared owner / interface | Electron effect adapter |
| --- | --- | --- |
| Page presentation | `ui/browser/index.ts`, `contracts/browser-surface.ts` | `modules/browser/device.ts` (panel, layout), `page.ts` (website `WebContentsView`), `surface.ts` (session partitions) |
| [Page resume](../platform/browser/INTEGRATION.md#resuming-a-website-applet) | `core/browser/page-resume.ts`, `platform/bridge/media-hold.js` | `device.ts` keeps, shows and releases pages as `live` lists; kept pages are hidden, muted and media-held |
| [Picture in picture](../platform/browser/INTEGRATION.md#picture-in-picture) | `core/browser/picture-in-picture.ts`, `ui/browser/picture-in-picture.ts`, `platform/bridge/picture-in-picture.js` | `device.ts` places the page as `browserPip` says and lays a transparent press view over it to report a press; Chromium's `AudioFocusEnforcement` (enabled in `main.ts`) keeps one page playing sound |
| Browser action decisions | `core/browser/index.ts`, `core/tools/index.ts` | `device.ts` executes shared decisions |
| Element interaction | Bundled upstream `agent-browser`; `platform/browser/agent_browser.py` transport | `modules/browser/agent.ts` (driver process), `page.ts` (agent CDP transport) |
| Selected-target CDP | Private commands/events; no browser-wide access | `page.ts` through `webContents.debugger`; `Target.*`/`Browser.*` refused |
| World semantic actions | `contracts/ui.ts`, `window.worldletUI.snapshot/dispatch` | Trusted World view (`world/window.ts`) |
| Headless Core execution | Serialized operations in `core/index.ts` | `core.ts`, in-process |
| Durable execution | `contracts/execution.ts`, `core/items/index.ts` | `store/ledger.ts`, `modules/agent-runtime/journal.ts` |

Chromium paints pages; Electron embeds it. CDP controls the selected page;
agent-browser interprets website elements and executes interactions through that
transport. None of these owns Agent planning. World canvas objects instead use
semantic commands, so the Agent does not need to infer sprites from DOM elements.
In-process Core executes rules and does not render a second UI.

Harness tool calls return upward through the authorized Host gateway. Layer order
therefore describes responsibility, not a one-way stack of five function calls.
Provider connectors remain in the Hermes adapter today; a replacement Harness
must implement the capabilities it advertises, not inherit Hermes integrations
implicitly. Schedule settings/claims belong to Core + Host storage, while Harness
executes admitted work. Journal validation/redaction belongs to Core; local file
and SQLite effects belong to Platform.

### Enforced boundary

TypeScript production callers outside a Core component import its `index.ts`.
Implementation modules are private to that component. The serialized composition
root remains `core/index.ts`; the host's `core.ts` consumes its named operations
through `invoke`, not Core implementation files. `contracts/`
remains dependency-free. White-box fixtures may directly test implementation files.

`node scripts/component-boundary-check.ts` checks static imports, re-exports,
import types and dynamic imports in UI, Core, bridge, website and cloud code.
`source-layout-check.ts` includes it and independently checks layer direction,
host globals, host transport access and executable resource files. A public
entry is an explicit supported surface, not permission to bypass host grants.

### Runtime invariants

1. The World runtime owns durable claims. Harness executes admitted work; it must
   not create a competing claim authority for the same Applet job.
2. Claim and run changes are atomic. Every output write checks generation, token,
   enabled state and lease in the same transaction as persistence.
3. Source collection, Applet analysis and Attention publication advance separate
   checkpoints. Attention cannot acknowledge data merely because it was read.
4. Delivery acknowledgement names the consumed revision; stale completion cannot
   consume a newer source revision. Failed inputs may be quarantined independently.
5. Unknown external-write outcomes require inspection. Cancellation is not rollback
   and must never implicitly resend a booking, message or payment.
6. Browser observations are scoped to a page/document generation. Untrusted web
   content never receives the World Host bridge or authority to grant permissions.

### UI entry points

| Public entry | Responsibility |
| --- | --- |
| `ui/world/index.ts` | World renderer, region placement, environment and scene layout |
| `ui/applets/index.ts` | Applet views and specialized content panels |
| `ui/companion/index.ts` | Fox conversation, history, review and companion presentation |
| `ui/attention/index.ts` | Attention presentation, markers, copy and preview |
| `ui/browser/index.ts` | Embedded page panel and outcome inspection UI |
| `ui/onboarding/index.ts` | Setup, arrival and introductory presentation |
| `ui/components/index.ts` | Visual primitives, styles, typography and reader controls |
| `ui/hud/index.ts` | Desktop-app HUD composition |
| `ui/shell/index.ts` | World UI assembly, audio integration and shared UI analytics hooks |
| `ui/practice/index.ts` | Fictional demo presentation |
| `ui/distribution/index.ts` | Download metadata and version presentation |

Keep exported contracts close to their owner. Host requests still use the
Platform bridge; domain rules still use Core public entry points. Do not import
Platform implementation files or Harness internals into these modules. A new
cross-component use requires an intentional named export, rather than reaching
through the boundary into a helper file. Tests may inspect internal helpers;
production roots are checked by `scripts/component-boundary-check.ts`.

Importing public APIs must not mount the application or read `document`.
Call exported mount/setup functions explicitly. The UI gallery has a separate
`gallery-entry.ts`. `npm run test:ui-interfaces` checks import boundaries and
loads public APIs without a DOM. Public APIs do not imply every legacy callback
is strongly typed; generic legacy Host bodies remain subject to runtime validation.

### Host persistence boundary

Window coordinators invoke Store domain operations. Store adapters own ledger
transactions, backup/restore IO and cache invalidation; they apply Core decisions.
`component-boundary-check.ts` rejects direct ledger access and direct Store state
mutation/persistence from the Electron window coordinators (`main.ts`, `world/window.ts`). Source snapshots are
bounded projections; explicit original reads preserve full content. Shared item
and presentation contracts reject unsupported state transitions and malformed data.

<a id="architecture-audit"></a>
## Five-layer architecture audit

<a id="architecture-audit-checklist-for-every-audit"></a>
### Checklist and current status

Apply the [architecture audit checklist](../docs/UI-CORE-PLATFORM.md#architecture-audit); it has one owner. Component
ownership and public APIs live in [component interfaces](COMPONENTS.md#component-interfaces);
repository dependency rules live in [repository layers](../docs/UI-CORE-PLATFORM.md#repository-layers).

Useful checks: `node scripts/source-layout-check.ts`, `node scripts/platform-contract-check.ts`, `npm run check` (architecture gate and types), `npm run test:electron` (host contract, module `check.ts` files, smoke run) and focused shared fixtures. Do not run every fixture for a documentation-only change. Import checks cannot detect semantic duplication in the Electron host or prove device performance.

The migration is not complete while the [parity ratchet](README.md#parity-vectors) lists
Core operations the Electron host has not yet taken over. Do not reuse superseded
pending-device tables as the current task list; historical implementation logs are
available in Git. For each new change, apply the checklist to the affected paths and
record concrete exceptions and required device checks in its issue/PR.

### Activity boundary and coverage

`core/activity/index.ts` exposes `activityEvent`, `activityObserve` and
`activityURL`. `ActivityRecorder` (`platform/electron/src/modules/browser/activity.ts`)
is the only browser activity persistence adapter; the website panel (`device.ts`)
supplies page/focus/clock facts, and website page views (`page.ts`) never open the
ledger. Trusted World clicks/semantic commands use `platform/bridge/activity.ts` and
Host `worldActivity` (`modules/world.ts`), then a Store operation (`WorldStore.recordActivity`). The window coordinator cannot write the
ledger. Component checks enforce those call boundaries.

`platform/bridge/activity-collector.js` is the shared DOM collector. The resource
builder serializes this self-contained function into `browser/activity-observer.js`
for isolated execution in website pages; the trusted World bridge imports
the same function and sends observations through its existing Host transport. Its CDP binding only
reports observations; it does not expose Host requests to websites. It captures
visible text and trusted click targets without reading input values, cookies or
storage. DOM facts remain untrusted content. Platform clocks and Core transitions
produce activity records; this is independent of model consent and PostHog.
Reading the visible text walks the whole document, so it runs at most once a second
and only after the page changed. Only the first reading is one task; later ones run in
slices of a few milliseconds in the page's idle time and report once complete, so
the page's animations and scrolling keep their frames.

The collector reports **document-only coverage**. `activity.capture.gap` records
the count of frame elements and explicitly marks child documents and workers as
unobserved; it does not claim a target inventory or distinguish same-origin frames
from OOPIFs. No child document, worker, or request/response body is read by this
coverage report. Core emits a new coverage gap for each visit or changed frame
count. Same-text SPA URL changes are included in snapshot deduplication. Excluded
observations discard queued interactions, and Core independently suppresses their
content and interactions. Sampled visibility never proves reading or completion.

This remains partial coverage: popup attachment/lifecycle, version-specific target
capabilities, capture pause/resume/delete/retention controls and abrupt-process
reopen acceptance still need implementation or device evidence. The collector's
existing `enabled` callback is a capture gate, not a persistent user control.
Host failure facts use the existing `capture.error` event vocabulary;
they do not infer an external business action's outcome. A renderer exit
(`render-process-gone`) ends the visit as `unavailable`, but is not durable
app-crash recovery evidence. Main-frame load failures and renderer exits share
`browser-error`, so the event does not claim a specific failure cause.

This does not turn every host module into a separate package. Existing component
APIs and the host's Store/Agent/browser modules remain the boundaries; import checks
and the selected host guards are automated, not a proof that all internal coupling
has been eliminated.

Device acceptance of activity capture in the Electron app is not yet ported. The
retired native hosts' activity checks (#235, #234) do not carry over. `node
scripts/activity-check.ts` (Core, in `check:arch`) and `activity-browser-check.ts`
(shared collector in standalone Chromium, in `npm run test:browser`) are fixtures;
they do not certify the shipped website view, real SQLite under load, real accounts
or abrupt process termination. Recording is not lossless: DOM changes immediately
before a close can miss the three-second poll.

Conversation evidence uses `core/items.conversationEntries` and the host's
conversation journal (`platform/electron/src/modules/fox/companion.ts`). It is written at the World/Harness boundary
before request delivery and before streamed text reaches UI. The selected Harness
cannot disable this journal. The portable Companion archive remains a view of
completed visible messages; interrupted streams live in the World ledger.

## Theme packages

`ui/theme-packages/index.ts` is the generated registry of the trusted source packages copied by `theme:import`, one directory per theme. Each package implements the type-only `@worldlet/theme` API exported by `ui/themes/index.ts`. It owns no host data or native IO. See the [build theme contract](../resources/themes/CONTRACT.md).
