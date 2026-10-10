# agent-browser adapter

## Ownership

```text
Hermes → Worldlet tool gateway → agent-browser → private CDP relay → selected website view
```

Upstream [agent-browser](https://github.com/vercel-labs/agent-browser) owns page
observation, accessibility references, element resolution and interaction. Worldlet
owns view selection, context consent, sensitive-field protection and durable
outcome receipts. Clicks, fills and submits run without an approval prompt (#408). The existing Hermes gateway is retained so these controls cannot
be bypassed by enabling an unrestricted shell/browser toolset. No new Agent loop.

- `core/browser/agent-browser.ts`: pure snapshot projection and action policy.
- `core/browser/driver-flow.ts`: the shared command sequence (see [Shared driver boundary](#shared-driver-boundary)).
- `platform/electron/src/modules/browser/agent.ts`: driver process, document-generation
  checks, ordered driver commands and cancellation. `page.ts` relays CDP to the selected
  page through `webContents.debugger`.
- `agent_browser.py`: stdio/WebSocket transport and upstream provider handshake.
  It uses `websockets` from the already provisioned Hermes Python runtime, without
  loading Hermes or a user's profile. There is no scraping or interaction engine here.
- `driver.json`: the pinned upstream release (0.38.1) and SHA-256 per platform.
  `scripts/package-agent-browser.ts` downloads and verifies the binary into
  `.local/browser-driver` (executable; a worktree reuses the primary checkout's copy) and
  `scripts/package-electron.ts` ships it in the app's resources. Development hosts run it
  from that cache: `scripts/build-electron.ts` prepares it (warning when offline) and
  `npm run test:onboarding` fails without it. `WORLDLET_AGENT_BROWSER` overrides the path.
  No end-user Node/npm install.

## Connection and lifecycle

Each page's driver gets a temporary owner-only socket directory and a loopback WebSocket
listener on a random port with a 256-bit secret path. Browser-origin handshakes and
wrong paths are rejected. The endpoint is provided only to the trusted local
provider child, never returned to Hermes, page JavaScript or user diagnostics.
The driver uses upstream `directPage` mode. The host relays only the selected page's
own CDP commands and events; `Target.*`, `Browser.*` and session-scoped commands are
refused instead of allowing discovery, creation or closing of unrelated tabs. There is
no remote-debugging port (see [Website views](INTEGRATION.md#native-browser)).
Credentials from Worldlet's process environment are not inherited by the driver.
The page keeps its website partition and cookies.

Connect the provider once. Repeating `-p worldlet` on every CLI call reconnects and
clears upstream refs. Subsequent calls use the same session. Before each command the driver checks
its connection with `Browser.getVersion`; the transport answers that probe itself
(`local_reply`), naming no real browser. Refusing it, as before 2026-10-04, made the driver
reconnect, launch the provider again and re-enable every domain on every command: about
0.1 s per command on Linux and over a second per click, snapshot or fill (a click is
prepare plus action, around 16 commands). With one connection a click takes under
0.1 s of driver time.

Each Fox step is also a model round trip, which costs far more than the driver. So `open`,
and a `click` or `scroll` that leaves no receipt, wait for the page to load (up to 8 s)
and return it as `page`, a fresh snapshot with its own `documentId` and refs, that Fox acts
on directly instead of asking for another snapshot (`device.ts` `withPageAfter`). A page
that is still loading, private or a sign-in page comes back without `page`. Receipt steps
keep their outcome inspection instead. A step on a page that is still loading waits for
it too. A snapshot's text already names every control with its `[ref=…]`, so `elements`
lists only controls the 24,000-character text cut off, which made a typical snapshot about
45% smaller.

If its socket is lost,
the adapter fails instead of auto-launching another Chrome. Navigation invalidates
refs; a popup opening or closing, closing the page or cancelling stops its driver.
A command that does not answer within 40 seconds stops the driver too; killing only a
CLI client would leave the action running.

## Scope and evidence

The gateway covers snapshot, fill, click, submit, page/scoped scrolling, navigation,
preparation and outcome inspection. It does not expose all upstream CLI commands:
shell/eval, cookie export, file upload and arbitrary tab management are not Agent
tools. This is deliberate product mediation, not an alternate driver.

Checks: `node scripts/agent-browser-policy-check.ts`, `python3
scripts/agent-browser-transport-check.py` (both in `npm run test:browser`) and
`npm run check:contracts` (`browser-driver-flow-check`). The real-page driver fixture of
the retired Mac host (bundled binary against fictional HTTPS pages in a disposable
profile) is not yet ported to Electron, so the Electron relay has no recorded
real-page or device acceptance yet. Cross-origin iframe workflows, real provider
login/task success, Intel and Windows device execution, and a signed release
containing this host need separate acceptance. A successful click is never evidence
that a refund, booking or payment completed.

## Shared driver boundary

`core/browser/driver-flow.ts` sequences snapshot, attribute observation, prepare,
fill, click, submit and scroll. The host executes the resulting argv and returns
responses to Core. The legacy injected DOM automation is not the driver. The Python
transport handles Unix socket / Windows port lifecycle and uses bounded portable
stdin reads. See [contract and acceptance limits](../../contracts/HARNESS.md).

Core owns the input decisions: fill accepts `textbox`, `searchbox` and input-backed
editable comboboxes, and rejects select-only, readonly, disabled and sensitive fields.
`browser/submit` focuses the current editable ref and uses upstream `press Enter`, with
a durable unverified receipt, consumed refs and post-action inspection; it cannot send
arbitrary key combinations. Explicit non-submitting Search/Find buttons open without an
external-action receipt. Loading or unavailable pages do not tell the person to sign in.
A closed browser snapshot returns an instruction to open a URL explicitly instead of
silently navigating.

Browser outcome cards wait behind an active Fox task rather than taking over mid-work,
and direct people to the visible result page instead of raw accessibility-tree text.

### Visible control feedback

By owner decision, Fox's pointer is visible throughout an operation: it glides to each
control Fox clicks, fills or focuses, presses, and rests there until the next step.

While Fox works, the panel's own frame turns into moving colors that glow inward over the
page edge (owner feedback 2026-10-04). The glow's strength depends only on the distance from
the page's edge, so it is equally deep along the sides and round the corners; stacked
blurs of the frame had made the corners glow twice (#1619). It reaches right into the corners,
so no sliver of the page shows between the glow and the frame (owner report 2026-10-04). The page's one status is a small card grown from its top
edge: it lists Fox's steps, the plain words Fox says for each browser action and the steps it
says in words (`do`), ticking each once Fox moves on, with "Thinking…" in its heading between
steps; when Fox's turn ends it says Done (or that Fox stopped) and shows the start of Fox's
reply as the result in the same place for a few seconds once the person sees the page, also
after returning from the World ([steps](../../core/browser/fox-steps.ts)). Fox's bubble does not
repeat any of it.

The card and the pointer are drawn by the host (`modules/browser/glow.ts`) in a
transparent, non-focusable child window over the page that ignores the mouse, so they
add nothing to the website's document, survive page loads and follow the World window
when it moves or resizes. The host declares `browserFoxOverlay`; a host without it insets
the page inside the colored ring, labelled with the step Fox is on. Fox's control belongs
to its turn, not to one rendering of the panel: a World refresh that re-renders the
open page keeps the card, the pointer and the frame's turn until the turn ends or the
90-second quiet timeout (#967, `ui/browser/browser-device.ts`). Before a click, fill or
focus the host asks agent-browser for the control's box and glides the pointer there;
reduced motion places it without gliding. `node scripts/browser-fox-glow-check.ts`
covers the World side with a faked host and renders the overlay page (`glow-page.ts`) to check
that the glow reaches every corner; the Electron overlay over a real page has no automated check
and no recorded visual acceptance yet.

### Picture-in-picture page style (#919)

When the person keeps a website Applet's video playing in the World's
[picture-in-picture window](INTEGRATION.md#picture-in-picture) (#919, #950), the shared
`platform/bridge/picture-in-picture.js` runs in the page's isolated world. It marks the
playing video and adopts a constructed stylesheet that leaves only that video showing,
filling the page's viewport; returning to the Applet or closing the window removes both.
It is cosmetic: no host bridge, no credentials, no page content
read or sent, and nothing it does authorizes an action. Its offer probe answers one boolean,
whether a large video plays. Agent commands never reach the window's page: it is not the
visible page, and Fox's session on it ends when it leaves the panel.

### Direct browser actions — 2026-09-29 (#408)

By owner decision, clicks, fills and submits run directly: no Fox approval prompt
or approval timeout. `browserElementPolicy` in `core/browser/agent-browser.ts` is
the only consequential-control rule; it decides only which actions leave an
unverified receipt (`receipt`; a submit intent always does). While Fox drives a page
the host overlay above shows Fox's steps and pointer. A task linked to an
uninspected receipt blocks its next consequential action; a fresh snapshot on the
same site (or `outcome`) inspects it, so a multi-step flow such as cancel-then-confirm
continues, while the same control on the same page never repeats. Sensitive fields
remain blocked in the Core fill policy. Model-initiated navigation to an address the
user did not give is refused once page, mail or note text entered the turn, and an
address with query or fragment data always is, because the address itself can carry
private data. Before anything was read, a plain address for a site the person asked
for opens (owner decision 2026-10-08: "打开apple developer网站" was refused).

### Trusted UI tool waits

A World tool can await trusted UI work, such as the automatic element check before a click, before issuing a browser command. Nothing asks the person (#671). Its call to the World page uses Core's foreground Agent deadline (`agentRequestDeadline`), rather than the 15-second page timeout (`platform/electron/src/modules/fox/index.ts`). Ordinary page inspections retain their short timeout.

## Evidence history

Live and fixture runs on 2026-09-27/28 used the retired Mac CEF host: public GitHub
search, follow and compare (partial pass), an editable combobox fill, Enter submit, a
25-step task in one Hermes turn, and a fictional comparison → policy → request →
confirmation flow. They led to the Core rules above, Worldlet-owned Hermes profiles
moving from 20 to 90 turns with a 600-second interactive deadline, the resident Hermes
idle deadline renewing only on correlated activity, the model service accepting up to
4,096 messages and 16,384 output tokens on M/L, and full (not compact) accessibility
snapshots marked incomplete when truncated. Details are in Git history and the owning
Issues/PRs. That evidence does not carry over to the Electron host; uninterrupted
real-site task completion, fresh-user Google setup and Windows device verification
remain open.
