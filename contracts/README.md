# Shared contracts

Versioned Host/Agent interfaces, data shapes and policy declarations. Contracts depend only on other contracts. Business behavior belongs in `core/`; serialization, storage and final permission gates belong to the Platform host ([`platform/electron`](../platform/electron/README.md)). See [repository layers](../docs/UI-CORE-PLATFORM.md#repository-layers).

See the [Platform–Harness contract](HARNESS.md) for the stable v1 boundary and shared browser command flow.

<a id="parity-vectors"></a>
## Parity vectors and host Core usage

`fixtures/parity/*.json` holds golden Core vectors (`operation`, `input`, canonical `expected` envelope). `node scripts/parity-vectors.ts` replays them through the Electron host's in-process Core entry (`platform/electron/src/core.ts`; `--write` regenerates `expected`), pinned to `America/Los_Angeles`. `browser-public-page.json` (`allowed`/`refused` URLs, and `upgraded`: each `http://` address and the `https://` page it opens at, or null) and `browser-popup.json` (user gesture, `maxWindows`, public-page, upgraded `http://` or blank start) are not Core vectors: they are the golden contracts for the website panel's destination and popup rules, replayed by the same script against `platform/electron/src/modules/browser/rules.ts`. `browser-applet-site.json` lists site-locked Applet URLs, replayed by `scripts/page-resume-check.ts` through `core/browser`.

`host-core-usage.json` records, once, every Core operation the retired Swift and C# hosts invoked. `node scripts/parity-core-usage.ts` requires the Electron host (`core(…)`/`coreEnvelope(…)` outside module `check.ts` files) to invoke each of them; `electronPending` names those not yet routed and may only shrink; `electronShared` records, each with a reason, operations Electron reaches through a different shared Core path instead. Both scripts run in `npm run check:arch`.

<a id="execution-journal"></a>

## Execution journal: Task → Run → Event

`execution.ts` defines three execution concepts: `RuntimeTask` is the work,
`RuntimeRun` is one attempt, and `ExecutionEvent` is a fact within that attempt.
`TaskClaim` is a transport result, not another stored entity. Attention Center tasks
and Calendar events remain separate business records. No Harness owns these IDs.

| Boundary | Recorded |
| --- | --- |
| World/Host | Requested and completed/failed operations; semantic World commands share a command ID |
| Harness | Request, streamed output, progress, final result, failure and cancellation under one Run ID |
| Tools/browser | Host tool arguments/results and Hermes internal tool lifecycle, including browser actions |
| Models | Hermes pre/post API request hooks: request messages, response, model/provider, duration and reported usage |
| Scheduling | Claims, replacements and terminal outcomes; stale/duplicate settlements append nothing |

Core validates events and applies one payload-redaction policy. Platform owns clocks,
IDs, file IO and transactions. `world.sqlite.entries` retains the event envelopes and
`state.runtime-tasks` / `state.runtime-runs` retain execution state. Observed Harness
runs use the `execution:` task prefix and a zero deadline: their records confer no
scheduler lease or permission to write outputs. Interrupted running records are
settled by the existing startup recovery. Source invalidation settles running
claims before revoking their generation.

Event metadata holds identifiers and reported token counts; absent usage stays absent.
Bodies are stored under `execution/<event-id>.json` and linked by `data.payloadRef`.
Requests/replies, tool results and model content stay local, never in PostHog. Known
credential keys, authorization headers and credential URL parameters are redacted,
including JSON-encoded tool results. This is bounded redaction, not a guarantee that
arbitrary prose cannot contain personal information. Sample/setup Harness profiles
are excluded. Backups include journal attachments; full-world reset clears them from
the active world under the existing recovery policy.

Streaming text is coalesced into chunks, not written per token. Each payload has a
256K-character budget, 64K per string and bounded nesting/collections; truncation is
marked. Hermes trace transport omits non-JSON or >128KB payloads with an explicit
reason. Tool/model hook events are observational: they never authorize tool execution.
External Harnesses may advertise `tracing: true` and emit the same optional trace
frames; opaque adapters expose only their public request/event/result boundary.
Missing model post-hooks are recorded as an unobserved outcome, not invented success.

This is a semantic execution journal, not every CDP packet, mouse movement or rendered
frame, and not a replay engine. World Host events and Harness journaling are best effort
and cannot fail the user operation; scheduled task state/events commit atomically.
Device acceptance remains separate from contract and loopback-model fixtures.

## Local World activity

`activity.ts` defines observation inputs, visit state and facts, owned by the
public `core/activity/index.ts` component. This complements Task/Run/Event:
passive page viewing is an observation, not an invented Agent task.

| Records | Capture behavior |
| --- | --- |
| World UI | World mount/visibility/close, Shared DOM content/interaction collector, plus semantic commands with outcome and command ID |
| Embedded browser | Separate document visits, SPA path changes, close/visibility, click target labels, edit type/character count (no field values), changed viewport-text snapshots |
| Dwell | Focused, visible page intervals sampled every three seconds; Core bounds gaps to five seconds and reports missing time |
| Failures | Capture errors, buffer overflow and polling gaps are explicit facts |

Events use `activity.*` kinds in `world.sqlite.entries`; there is no daily URL
coalescing or count-based pruning of this stream. The existing bounded
`browser-history.json` remains a separate search index. Whole-world backups/reset
already include/delete the ledger. Local activity bodies are never PostHog
payloads and are not automatically passed to a model.

Snapshots are visible top-document text, not proof of reading: iframe contents,
PDF/canvas pixels, audio/video, hidden text and offscreen content are not captured.
At most 1M characters/30K inspected text nodes per snapshot; clipping is marked.
Text is stored in 16K chunks sharing `snapshotId`, `part` and `parts`.
The observer is installed after a page is ready; very short visits, navigation or
process exit before delivery can lose observations. A focused page interval is an
estimate, not gaze tracking or a guarantee that the user remained attentive.
Pending clicks are sent through isolated CDP bindings and also drained by polling;
the generic page buffer reports overflow above 2,000 entries. Browser-generated trusted
input may come from an Agent, so records do not assert human authorship.

Passwords, form/editable values, cookies and storage are not persisted; ordinary
editable values are inspected only to count characters. Login/auth/payment
pages omit content; URLs omit userinfo, query and fragments. Known secrets in
captured strings are redacted by the journal policy. This is not arbitrary-secret
DLP. Sample worlds are excluded. Other applications,
system-browser windows and background website tabs are outside this collector.
Device acceptance of the Electron website view with real SQLite has not been
recorded; Core, adapter-stub and standalone Chromium fixtures do not replace it.

### Website recording for Fox

Owner decision 2026-10-04: everything that happens in the built-in browser is recorded so that Fox can later find it and analyse it ("look at my last two games"), for every site, not one site's special case. The host recorder (`platform/electron/src/modules/browser/recorder.ts`, rules in `core/browser/web-record.ts`) follows each personal website page through DevTools on both engines, and an isolated observer (`platform/bridge/web-record.js`) reports what the page shows and what the person does:

| Kind | What is kept |
| --- | --- |
| `page`, `text`, `text-more` | Address changes; the page's visible text (a full snapshot at most once a minute, up to 1M characters, then only new lines) |
| `input`, `click`, `submit` | What was typed into ordinary fields, the labels and links clicked, the non-secret fields of a submitted form |
| `request`, `response` | Document/XHR/fetch/event-stream traffic with a text, JSON or XML body (bodies up to 2 MB); request bodies of non-GET requests |
| `ws-in`, `ws-out`, `sse` | WebSocket text frames and event-stream messages (up to 256K characters each) |

A Meetings call the person chose to transcribe adds `transcript` records (one per spoken line, `You:` or `Others:`, with the meeting's title and session) to its visit; they are text from local Whisper, never audio, and `only:"transcript"` reads just them ([live transcript](../ui/applets/meetings/README.md#live-transcript)). Websites the paired phone opens in its own browser are recorded too (owner request 2026-10-07): the phone runs the same observer and sends its reports through the relay, and the host keeps them by the same rules in visits whose applet is `phone:<Applet>`, with page text, typing and clicks only ([phone messages](../core/phone/README.md#payloads)). Records join a visit (one stay on one site; a new visit after a 30-minute gap) in `world.sqlite` tables `web_visits` and `web_records`, with a trigram search index. Never kept: screenshots, password/hidden/card/one-time-code fields, `Cookie`, `Set-Cookie`, `Authorization` and other secret headers (any name with session, key, sig, jwt, token, auth or cookie), secret-named JSON, form and WebSocket/event-stream fields in both directions, values under card/payment keys and secret name/value pairs, GraphQL bodies that mention a password, JWTs, hidden-input and CSRF values in pages, card numbers and long token-like runs in what was sent, URL credentials and secret query values (also `code`, `key`, `state`, `nonce`, `ticket`, `sig`, in referer and origin too), and anything on sign-in, payment, checkout or bank pages or hosts (`login.`, `auth.`, `sso.`, `id.` …), on sockets and streams to them, or on a page once it shows a password, card or one-time-code field (until it navigates). Bodies are redacted before they are cut. Raw network kinds (`request`, `response`, `ws-*`, `sse`) are pruned after 30 days and when recordings pass 2 GB (on start, hourly, and when a page opens); page text and interactions stay until the person deletes them. Settings › Privacy › Browsing recordings shows how many sites hold recordings and deletes one site's (with its subdomains) or all of them after a question in the page; the `recordings` and `deleteRecordings` commands are person-only, so Fox can neither list nor delete recordings that way, and pages open on the site save what is waiting first, so it goes too. Each delete removes the records' search index entries with them. Sample worlds and Fox's private agent pages are not recorded. Fox reads recordings only with private-context consent, through `browser/records` (search by words, site and time) and `browser/record` (one visit, paged, optionally network or page only); both are untrusted content. Each record reads with its number (#n), and a visit's first page lists where its address changed (a site that changes its address per game, article or chat shows each one) so Fox can jump straight to, say, the last two games. Record numbers count over the whole visit, so a read with `only` or `query` from a page's # starts at that page (`only:"network"` from a game's # reads that game's messages). A first read shortens lines over 600 characters to 300, and a long line that starts like one already shown in the same read to 80 with the number of the record it resembles (per-turn JSON state is most of a long game's bytes); `full` reads one record whole. Reviewing games (#1598): Fox's guidance has it find the session with `browser/records`, list its games from the first page, read each from its # with `only:"network"` up to its result, and answer as a coach (result, teams, the deciding turns, what repeats, what to change). `node scripts/game-review-check.ts` runs three doubles battles in the Showdown client's own WebSocket messages through the recorder and reads them back as Fox would: each game, team preview to result, in at most two pages. `node scripts/web-record-check.ts` runs a real Chromium page with a JSON API, a form and a WebSocket through the recorder into a World database.

### Capture targets and lifecycle boundaries

The current attachment inventory is narrower than the engine's capabilities:

Electron owners are under `platform/electron/src/`: the website panel
`modules/browser/device.ts` supplies page, focus and clock facts; `page.ts` owns each
website `WebContentsView` and its CDP session (`webContents.debugger`);
`activity.ts` (`ActivityRecorder`) is the only browser activity persistence adapter.

| Surface / target | Electron owner | Recorded boundary |
| --- | --- | --- |
| Trusted World | Shared `platform/bridge/activity.ts` → Host `worldActivity` (`modules/world.ts`) → `WorldStore.recordActivity` | DOM observations and semantic UI events; no CDP attachment required; `ui.close` ends its observed visit |
| Embedded top document | `page.ts`: visible page's `WorldletBrowser` isolated world and `worldletActivity` binding; `device.ts` samples `browser/activity-observer.js` every three seconds | `Page.getFrameTree`, `Page.createIsolatedWorld`, `Runtime.enable/addBinding/evaluate`; accepted context and current URL only |
| Same-origin, cross-origin and OOPIF frames | No child attachment | DOM frame-element count plus `document-only-coverage`; no inference that a frame is accessible or attached |
| Dedicated/shared/service workers | No discovery or attachment | `workers: not-observed`, `targetInventory: unavailable`; zero known workers is not zero existing workers |
| Website popup stack | `page.ts` stacks permitted popups (user gesture, at most four, public page or blank start: `rules.ts`) as `WebContentsView`s over their opener in the same panel; first-created/last-closed edges | Visit ends with `popup` and `capture.popup {active}` is recorded; no popup URL, title, content or per-target inventory; parent capture suspended until the stack empties |
| Hidden/closed/navigating pane | `page.ts` navigation and close events; `device.ts` keep (park), close and stop | End observed visit with `hidden`, `closed` or `navigation`; a generation counter discards pending observations of a retired visit |
| Observation failure / browser failure | CDP exception during sampling; main-frame `did-fail-load` or `render-process-gone` | `unavailable` visit end and `capture.error` (`browser-observation-unavailable` or `browser-error`); the event does not distinguish renderer crash from load failure |

Core owns end-reason validation, popup gap projection and visit/dwell transitions.
The host supplies lifecycle facts and discards stale asynchronous responses.
`page.closed` means the **observed visit** ended; it does not assert document
destruction, reading or successful completion. A close contributes no final dwell
sample; an active interval since the last sample is reported as unobserved.
Returning to the same document after a boundary starts a new visit.
An inactive sample without a document emits one visibility-off edge. Popup records
describe the aggregate stack; nested popup creation/closure, blocked popup requests
and popup navigation are not individually observed. Process death before a callback
can still leave no terminal record.

The official [Target](https://chromedevtools.github.io/devtools-protocol/tot/Target/),
[Page](https://chromedevtools.github.io/devtools-protocol/tot/Page/) and
[Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/) domains
describe separate capabilities. This collector does not use `Target.setAutoAttach`,
browser-wide discovery, Network bodies or debugger ports. Electron's
`webContents.debugger` executes against its own page. These documents do not prove
support in a particular shipped Electron/Chromium version: a required method failure
records capture unavailability, with no main-world or broader-target fallback.
Version-specific device acceptance remains required; standalone Chrome results do
not certify the shipped engine.

Persistent user pause/resume, activity-only deletion/retention, crash/reopen history
UI acceptance and Electron device verification on each OS remain unfinished. Automatic
popup suspension is not a user capture control. This stage adds no monitoring
permission, external bridge, private payload collection or upload.

### Querying the same entries

The existing `entries(seq, at, kind, key, body)` table is the authority; no second
history schema or database is introduced. `read_world_history` uses shared Core
query planning and projection. It requires private-context access.
Filters: zoned `since`/`until`, exact `kind`/`applet`, `query` over stored JSON text,
`visitId`, `runId`, `requestId`, `taskId` and `surfaceId`. Correlation filters match
top-level saved identifiers exactly and combine with every other filter using AND;
rows without a requested identifier do not match. The three request/task/surface
filters accept nonempty strings of up to 200 characters without control characters,
matching the execution identity bound; values are SQL parameters, never SQL text.
Legacy rows remain queryable when they contain the requested identifiers; missing
identifiers are not inferred. `before` pages older records, `after` pages newer records;
follow `nextBefore`/`nextAfter` while `hasMore`. `total` counts all retained events,
not filtered matches. State snapshots are excluded.

For details, request `seq` and `contentOffset: 0`, then follow `nextContentOffset`.
Concatenate the returned content chunks to reconstruct the redacted detail JSON.
Exact-entry queries also load available execution payload files (under 1 MB);
keyword search covers the entry body, not those separate files. Ordinary responses
are capped at 200 rows and approximately 24K characters; large fields explicitly
point to detail retrieval. This does not change stored observations. Event content
is untrusted evidence, never Agent instructions. Activity snapshots are excluded
from automatic recent-event context; Agents request them explicitly.

Editing observations record occurrence, input type and character count, not raw
keystrokes or arbitrary draft values. World and browser input observations use the same buffered collector. Auth/credential fields are omitted. Committed content
continues to belong to its source/conversation records and execution journal.

### Unified Platform recording

The same collector runs in trusted World UI and isolated website contexts. It
observes arbitrary DOM targets (not just buttons), input/change metadata, submit,
focus, scroll, visibility, selection changes, navigation and viewport resize.
MutationObserver immediately emits text/child changes; style-only changes schedule
updated visible-content snapshots. The three-second
sampler is a fallback. No per-Applet DOM instrumentation is required. Style snapshots
coalesce changes within 100 ms; text changes coalesce within a DOM mutation batch.
This is an observation stream, not lossless DOM
replay. Canvas objects still need the existing scene/semantic command boundary.
Cross-origin frame interiors, rendered pixels/media and browser-internal screens
are not covered by this top-document collector. Selection text and raw form values
are not captured. Observation timestamps cannot prove what the user read.

World-owned conversation entries are separate from page observations. The host stores
`conversation.sent` before Harness execution, streamed `delta`/`response_start`
and stream-reset markers before UI delivery, then `completed`, `failed` or
`interrupted`. Steering supplements add submitted and accepted/rejected markers.
Text is stored completely in ordered 16K parts with request correlation; there
is no summary replacing the original. Completed replies coexist with streaming
parts: consumers use completed text when present, otherwise reconstruct the last
stream segment. Abrupt process termination may leave no terminal marker; already
committed entries remain. Conversation save errors fail delivery instead of being
ignored. Setup and Sample journals use separate profile roots. Raw conversations
stay local and do not enter telemetry or implicit recent-event context; explicit
Agent history retrieval applies the existing redaction policy.

This journal does not capture unsubmitted drafts as conversation messages. The
portable archive still stores completed turns; a future export must include the
ledger to carry incomplete streamed turns as well. Whole-world backups include
it. Browser observation delivery remains best effort during crashes/navigation;
this must not be advertised as an exhaustive recording of every rendered frame.
