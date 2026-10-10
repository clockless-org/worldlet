# Electron host (layer 03 · Platform)

The desktop app's Platform layer is one Electron host in TypeScript, for macOS,
Windows and Linux. It replaced the Swift/CEF Mac host and the C#/WebView2 Windows
host (#996). Product rules stay in shared `core/` and `ui/`; this host supplies OS
facts, permissions, persistence, processes and browser IO, and executes Core
decisions. See the [five-layer standard](../../docs/UI-CORE-PLATFORM.md).

## Structure

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | App entry: profile, single-instance lock, store, router, page bridge, modules |
| `src/profile.ts` | Library root per channel and checkout (`Worldlet`, `Worldlet Development`, `Worldlet Worktrees/<id>`) |
| `src/world/` | Trusted World window (`BaseWindow` + `WebContentsView`), `worldlet://app` scheme, preload bridge, dev capture |
| `src/host/` | Router (`worldletHost.request`), page bridge (host → page globals/events), service contracts, diagnostics |
| `src/checks/` | Development-only named checks run in the real app with `--check <name>` (`onboarding-flow`) |
| `src/store/` | World store, SQLite ledger (`world.sqlite`: configuration, library tables), Swift-compatible identity encoding |
| `src/core.ts` | Shared Core in-process: the same `invoke(operation, json)` entry JavaScriptCore and Jint used |
| `src/preferences.ts`, `src/vault.ts` | Display/companion preferences (`preferences.json`); credentials encrypted with `safeStorage` |
| `src/resources.ts` | Bundled helpers: Hermes bootstrap, agent-browser, Stripe CLI, imsg (Messages), Google OAuth registration, distribution config |
| `src/modules/agent-runtime` | Harness adapters (Hermes worker, external Agent), model access, execution journal, routines |
| `src/modules/fox` | Fox chat/model actions, World tool host services, conversation and companion records, reset |
| `src/modules/sources` | Connections, Applet content readers, reviews (mail, Notion, Home), imports, onboarding, deletion |
| `src/modules/attention` | World tools, source checks, Applet analysis, Attention synthesis, runtime tasks |
| `src/modules/browser` | Website views, agent-browser over CDP, history, bookmarks, picture-in-picture, YouTube, Stripe |
| `src/modules/media` | World audio, radio/podcasts, Voice Memos, weather, speech in/out, cloud requests, coding sessions |
| `src/modules/shell` | Menus, desktop Companion, updates, diagnostics, feedback, analytics, World backup |
| `distribution/` | Public update feed config, analytics capture key, Mac entitlements, Mac release scripts (`mac/`), Windows installer and Store identity (`windows/`) |

Modules register their own page actions and provide services through the contracts in
`src/host/services.ts`; they never import each other's implementation.

## Trust boundaries

- The World page loads from the privileged `worldlet://app` scheme, which serves only
  the packaged interface root after resolving links. Only the main World document
  (`worldlet://app/index.html`, no query) receives `window.worldletHost`, through a
  `contextBridge` preload; the main process re-checks the sending frame on every request.
- Main-document navigation never replaces the World. `https:` links open in the in-app
  browser or the system browser.
- Websites are sibling `WebContentsView`s with their own session partition, sandboxed,
  with no preload or host bridge. agent-browser reaches only the selected page through
  `webContents.debugger`; there is no remote-debugging port.
- Every request passes the shared Core validators (`itemHostRequest`,
  `browserSurfaceRequest`, `foxHostRequest`, `browserOutcomeRequest`) before a handler
  runs, and is journaled through Core's `worldActionEvent`.

## Data compatibility

The library uses the Mac host's format and file names, so an installed Mac library
opens unchanged: `index.json` (moved into `world.sqlite` on first open), `world.sqlite` (`entries` ledger, `sources`,
`knowledge`, `library_meta`, views from `contracts/storage/world-views.sql`),
`sources/<id>/<revision>.json`, `companion/…`, `agent/<scope>/hermes`. Item identity
hashes reproduce Foundation's sorted `JSONSerialization` bytes. Mac `UserDefaults`
(`worldlet.*`) are imported once into `preferences.json`. Keychain items are not
readable by the new host; affected CLI grants (Stripe, YouTube) ask to reconnect, and
connected folders, Obsidian vaults and the Voice Memos folder must be chosen again.
Website sessions live in `Browser/Electron/Partitions` (`persist:website`; the practice
world uses `persist:website-practice`); sign-ins from the CEF profile do not carry over.
Credentials are kept in `vault.json`, encrypted with `safeStorage`. Windows `world.json`
libraries are not migrated automatically.

## Build, run and package

| Command | Purpose |
| --- | --- |
| `node scripts/build-electron.ts [--out dir]` | Bundle the main process and World preload (`dist/electron`) |
| `npm run dev` / `npm run dev:worktree` | Prepare a Dev candidate; Apply in Dev to launch or replace it (`.local/dev/electron`). On the development host the machine daemon runs the main watcher (`scripts/machine-dev.mjs`) |
| `node scripts/package-electron.ts --platform darwin --arch universal [--sign]` | Package the app (`dist/packages`) |
| `npm run test:electron` | Host contract, module `check.ts` files and an app smoke run |
| `npm run installer:windows` | On Windows: package, then build the NSIS installer (`distribution/windows/installer.nsi`) |

Development launches read `WORLDLET_REPO_ROOT`, `WORLDLET_WEB_ROOT`,
`WORLDLET_UV` and, for linked worktrees, `WORLDLET_WORKTREE_PROFILE`.
`WORLDLET_PROFILE_ROOT` (development only) points a run at a disposable library.
`WORLDLET_CAPTURE=<png>` (development only) waits for the World, evaluates
`WORLDLET_CAPTURE_PROBE` in the page, saves a frame, prints JSON and quits.
Each stage is bounded and caught: a frame is tried three times, with the window restored and
repainted between tries. A stalled or rejected stage is reported under `stalled` with its last
error and the window state, and the run exits 1 (#1045, #1050).
On Windows every run turns off Chromium's native window occlusion. A capture run (this one or
`--window-capture`) then still captures a frame while the display is off or the session is locked (#1057).
Occlusion tracking also sometimes marked the shown, uncovered window occluded, so it never painted
(release smoke, RCs 1085 and 1087).
A capture run also keeps the display awake. Its report lists GPU-process exits under `gpuExits`,
and a failed capture's error names them (#1060).
`--check <name>` (development only; a release build runs only `onboarding-paths`, and only on the RC harness's
disposable library: `src/rc-check.ts`) runs a named check from
`src/checks/` once the World has loaded, prints `PASS`/`FAIL` lines and exits 0 or 1.
`npm run test:onboarding` (Mac gate) runs `--check onboarding-flow` on a disposable library
with the local Codex sign-in and the project Hermes runtime: the first-run journey through
Fox's first browser task and the first win, two real conversations about the mock inbox (Fox
fetches the unread mail and names who needs a reply, then drafts a reply that is shown for review
and cancelled), then the failure detector over the execution
journal, runtime runs, Attention budget and `logs/diagnostics.jsonl` (a kept page released
under memory pressure is the host relieving memory, not a failure). A failure's first line names how many failed and
the first one with its error text; the diagnostics file keeps no error text, so the check reads it from the host's
memory (`diagnostics.recent()`, never written to disk). Its log is
`.local/electron-checks/onboarding-flow.log`; a failed run keeps its library for diagnosis.
`npm run test:onboarding:paths` (no RC gate; the RC package smoke runs it on the signed app) runs `--check onboarding-paths` once per phase
on one disposable library through a local Agent (a fixture OpenClaw when the host has none): quit on the apps page
and resume, Mail starting Google sign-in in the tour and again from the World, the desktop Companion, Reset Fox,
Quit Completely with nothing left running ([details](../../scripts/DEVELOPMENT.md)).
`npm run test:onboarding:options` (advisory, no RC gate since 2026-10-05) runs `--check setup-options` once per way in on setup's
sign-in page, each on a fresh library: mock Google, Codex, and each local Agent brought in from fixture homes, then Fox
answering in the World ([details](../../scripts/DEVELOPMENT.md)).
`npm run test:agent:local` (Mac and Windows gates) runs `--check local-agent-flow`: the practice
world with this computer's Codex CLI as Fox's local Agent, three real conversations judged by the
World tool calls they made and their effects ([local Harnesses](../../core/agent/PORTABILITY.md#world-tools-through-mcp));
without a Codex sign-in it reports SKIP. Its log is `.local/electron-checks/local-agent-flow.log`.

### RC UI review

Owner request 2026-10-02: RC UI should be watchable and reviewed by Codex. When a launcher sets
`WORLDLET_CHECK_FRAMES=<folder>` (`test:onboarding` and `test:agent:local` do, under
`.local/electron-checks/<check>-frames`), `runCheck` (`src/checks/index.ts`) keeps a JPEG of the World view every 1.5 s
when it changed (at most 900, 1280 px wide) and every printed PASS/FAIL/SKIP line with its time in `index.json`.
`capturePage` reads the app's own rendering, so no Screen Recording permission is involved; website panels drawn by
other views are not in the pictures. `npm run test:ui:review` (`scripts/ui-review.ts`, last in the Mac and Windows
gates) sends up to 16 of a fresh run's pictures (the one at each printed step, then evenly spaced) with the steps to
this computer's Codex CLI (`codex exec --sandbox read-only --image … --output-schema`), prints the findings and saves
them to `.local/electron-checks/ui-review.json`. Only a `blocker` (a blank or black World, an error dialog, the main UI
missing or unreadable) fails the gate and so reaches the RC repair flow. `issue` findings (clear visible defects)
go to Gatehouse's requirement inbox as one `rc-ui` item per
run with the pictures they name (up to eight), at most once a day per check and host (`.local/ui-review-reported.json`
beside the host's `.local/machine-service.json`), where the hourly report fixes the clear bugs; `nit` findings stay
in the log. The Codex CLI takes images, not video, so these pictures stand in for a recording of the run.
No pictures, no Codex sign-in or a Codex error is a SKIP. `node scripts/ui-review-check.ts` covers the selection, the
answer shape and a run against a fake CLI.

Signing, publication, the Mac updater and Windows delivery are in [DISTRIBUTION.md](DISTRIBUTION.md);
the desktop Companion window is in [COMPANION.md](COMPANION.md). Development workflow and checks
are in [Development and release](../../scripts/DEVELOPMENT.md).
