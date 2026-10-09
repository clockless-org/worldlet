# Development and release

Chapters:
- [Companion feedback](#feedback)


Worldlet ships one desktop app built on the [Electron host](../platform/electron/README.md) for Mac, Windows and Linux; the trusted PixiJS world/HUD and website panels are separate Chromium views. The source repository is [clockless-org/worldlet](https://github.com/clockless-org/worldlet); the primary website is [worldlet.ai](https://worldlet.ai/). Development commands are the same on every OS; signing and publication are in [desktop distribution](../platform/electron/DISTRIBUTION.md). GitHub Actions dispatches release-check Issues; release hosts perform builds and publication.

## Daily development

The shared interface lives in `ui/`, product rules in `core/`, and the desktop host in `platform/electron/`. Cross-layer interfaces live in `contracts/`, artwork and bundled media in `resources/`, and Agent integrations in `harness/`. Root `npm run dev` prepares main-backed Dev candidates; `npm run dev:worktree` prepares isolated feature candidates; `npm run build` builds the interface and host without launching; `npm test` runs shared app checks. Website commands use the `:website` suffix.

```sh
npm ci
npm run setup:hermes
npm run dev:worktree   # or npm run dev from the primary checkout on main
```

Requirements: Node.js 22.19+ (`package.json` `engines`) and Python 3.11–3.13 for the Hermes runtime and helper checks. The installed app needs macOS 14.0+ (Apple silicon or a compatible Intel Mac), x64 Windows 10 or later, or x64 Linux. Xcode and .NET are not needed to develop; a Mac release host needs Xcode command-line tools for signing, notarization and the DMG background (see Machine automation). No on-device inference fallback is offered; Fox uses Hermes model access.

`npm run dev` / `npm run dev:worktree` (`scripts/dev-electron.ts`) run **Worldlet Dev**: each candidate is a host bundle (`scripts/build-electron.ts`) plus an interface build, prepared under `.local/dev/electron/` and launched with Electron from `node_modules`. On Mac it runs as **Worldlet Dev.app**, a renamed copy of Electron.app under `.local/dev/electron/runtime/` with the DEV icon, the Dev name and the checkout's bundle identifier (`app.worldlet.mac.dev`, or `…dev.wt<id>` in a linked worktree), rebuilt only when Electron, the icon or that identity changes. It is signed with the Mac's Developer ID Application or Apple Development certificate when there is one (`WORLDLET_DEV_SIGN_IDENTITY` or `WORLDLET_SIGN_IDENTITY` picks another, `-` forces ad hoc), so microphone and screen recording grants survive rebuilds; an ad hoc signature loses them at every rebuild. Opening that .app directly (Finder, Dock, Spotlight) starts the last launched Dev build: its `Contents/Resources/app` launcher reads the app directory and `WORLDLET_*` environment from `.local/dev/electron/launch.json`, written at each launch, instead of showing Electron's welcome page. It never builds an installer, signs, notarizes or uploads. First microphone, speech and location use still need system approval; the app only requests undecided permissions and never resets a denial.

- Main prepares a candidate after a relevant clean committed change. Feature previews also prepare candidates after edits. Neither changes the currently running app or its web resources.
- Host and web resources are prepared together. A new build shows at the right end of the lower-right Development line; choose **Apply** there when ready. Until then the app and unfinished input stay as they are.
- Ctrl-C stops only the watcher. An existing app is adopted without restarting, swapping resources or opening a duplicate window. Closing an app does not authorize a future automatic launch.
- `npm run dev:worktree -- --check` prepares an isolated candidate for `HEAD` without applying or opening it. In the primary checkout, while another process holds the shared integration lock (the main watcher mid-build, a machine sync or a release job), it waits up to 20 minutes. A linked worktree uses its own candidate lock (`.local/dev-candidate.lock`), so it never waits for main's builds or releases. It exits non-zero unless it prepared that candidate, including on timeout or interruption (`node scripts/dev-lock-wait-check.ts`).
- `npm run dev:windows` is the same flow on Windows; `npm run build:windows` and `npm run test:windows` wrap the build and the Electron suite there.
- Website: `npm run dev:website`, then `http://127.0.0.1:8766/` (`/demo/` for the renderer-only preview).

### Worktrees: test independently, integrate into main

GitHub `origin/main` is the cross-machine source of truth. Keep the primary workspace/thread on `main` and only fast-forward it from origin. Main accepts changes through GitHub PRs (squash); direct pushes, force pushes and deletion are blocked, including for administrators.

No dedicated `dev` integration branch is required. Features are developed and tested independently, then pushed as issue-linked PRs. Agents are authorized to review and squash-merge completed PRs after proportional checks and required GitHub checks pass, without waiting for human review. Failures or conflicts must be resolved first; never bypass protection. The owner accepts behavior by using the latest main-backed app.

On the development host (03) the machine daemon owns the primary main watcher (#1070): every tick it keeps one supervised `scripts/dev-electron.ts --main --supervised` running the current watcher code, restarts it when that code changes on main, replaces a watcher started by hand, and backs off five minutes after a failed start; the release hosts (01/02) never run one. The supervised watcher runs `npm ci` when `package-lock.json` changed, at start when no Dev app runs or otherwise during Apply, after the old app stopped, because the Dev app runs from `node_modules/electron`. Its log is `.local/dev/electron-watcher.log`; `.local/dev-watcher-off` opts the host out. Elsewhere, run `npm run dev` from any checkout to launch the primary main watcher by hand. Run `npm run machine:daemon` once per host to fast-forward clean main and publish operational status every minute. It never merges PRs or discards local changes. Existing dev checkouts and their isolated profiles are preserved until safely retired.

The primary checkout is guarded (2026-10-03): the Dev watcher and each development-host daemon tick install a post-checkout hook from `scripts/primary-guard.mjs` (an unrelated earlier hook is kept as `post-checkout.local` and still runs). A branch checkout in the primary checkout switches straight back to main with a real `git checkout main`, so main's tree is restored and `git status` stays clean, and fails with a pointer to `git worktree add`; the branch it created is kept. There is no `reference-transaction` guard: Git updates the index and working tree before the HEAD transaction, so refusing there left main with the other branch's files staged (#1525). The installer moves any such hook to `reference-transaction.disabled`. Linked worktrees, file checkouts and detached HEADs are unaffected, and CI clones never install it. `WORLDLET_PRIMARY_GUARD_OFF=1` skips it for one command.

Each linked checkout gets a stable path-derived identity. Renaming its branch preserves that profile; moving/recreating the checkout at a different path creates a different profile.

| Resource | Primary checkout | Linked worktree |
| --- | --- | --- |
| Library / Hermes memory and credentials | Existing `Worldlet Development` | `Worldlet Worktrees/<id>` (`WORLDLET_WORKTREE_PROFILE`) |
| Credential vault entries | `app.worldlet.context.dev` | `app.worldlet.context.dev.wt<id>` |
| Preferences / website storage | `preferences.json` and `Browser/Electron` in that library | The same, in the worktree library |
| App title / HUD | Main / revision | Branch, checkout ID and revision |
| Build, logs and runtime installation | Checkout-local | Checkout-local |
| Website port | 8766 | Stable port derived from checkout path; `PORT` overrides |

This isolates Worldlet-owned state, not the machine or external accounts. Codex/Claude CLI discovery, OS Notes/Reminders permissions and external services are still real shared resources. Use Sample or disposable accounts for writes. New worktrees do not inherit the main profile's model keys, account grants or personal data. Set up the model and connections in Fox separately. The optional Google Desktop registration can be supplied using `WORLDLET_GOOGLE_CLIENT_FILE`; it is app registration, not a user's tokens. Before first launch, install Node dependencies with `npm ci` and prepare the pinned Hermes runtime with `npm run setup:hermes`. The watcher does not repair a runtime that may be in use by the current app.

Run in the feature worktree:

```sh
npm ci
npm run dev:worktree  # optional isolated preview
# Commit, review and run proportional checks.
git push -u origin HEAD
gh pr create --base main  # link the task Issue
# After checking the diff and required checks:
gh pr merge --squash
# Primary checkout:
git pull --ff-only origin main
npm run dev
```

Legacy `npm run merge dev` and worktree merge commands fail with migration guidance. Do not rebase onto or merge an old dev branch into a feature PR.

The watcher defers during integration and prepares candidates while holding the existing integration lock, so a fast-forward cannot mix source commits during a build. Documentation, Windows, website and model-service-only changes leave the candidate alone. Other changes prepare host and web outputs without publishing them. Restart a watcher after changing its implementation; never start a second watcher for the same checkout.

### TypeScript

Every `.ts` file is what runs: esbuild bundles the interface and the website, wrangler builds the worker, and Node 22 runs the scripts by stripping types (`node scripts/sample-world-check.ts`). That sets two rules the compiler enforces — only erasable syntax (`erasableSyntaxOnly`: `as` casts; no enums, namespaces or parameter properties) and `import type` for types (`verbatimModuleSyntax`) — and one `check:source` enforces: relative specifiers name the file on disk with its real extension (`node scripts/ts-specifiers.ts --check`; without `--check` it rewrites them after a rename). `scripts/fixtures/pre-fingerprint-sw.js` stays JavaScript on purpose: it is a past service worker served verbatim to a browser.

`npm run check:types` runs five programs: the root (`ui/shell`, `shared`, `applets`, `website` and `types/`, against the DOM lib), `worker/` (Cloudflare Workers types), `scripts/` (Node types; `scripts/types/` declares the globals the checks plant on the page and the two Workers globals `serve-website` touches), `models/` and `platform/electron/` (the desktop host). `npm run check` runs it after `check:arch`. The programs are `strict` with `noImplicitAny` and `strictNullChecks` off: narrow a type where its meaning has settled, and keep the `[key: string]: any` index signatures on the world shapes in `contracts/world.ts` until their last dynamic reader is gone.

| | Development | Installed release |
| --- | --- | --- |
| Channel | `dev` (`WORLDLET_DEV=1` or an unpackaged launch) | `release` (packaged) |
| Local library (Mac) | `~/Library/Application Support/Worldlet Development` | `~/Library/Application Support/Worldlet` |
| Local library (Windows / Linux) | `%LOCALAPPDATA%\Worldlet Development` / `~/.local/share/Worldlet Development` | `%LOCALAPPDATA%\Worldlet` / `~/.local/share/Worldlet` |
| Credential vault entries | `app.worldlet.context.dev` | `app.worldlet.context` |
| Updates | Off; Dev candidates instead | Signed appcast (Mac) or preview manifest (Windows) |

Production imports and connections are never copied into the development library. The dev HUD shows a `Worldlet.dev` link and `Development · <short rev>`; the window title is `Worldlet Dev` (with the branch for a linked worktree). Release builds show the calendar date and build number, for example `v2026.09.23 · Build 1034`. The build number orders same-day updates; neither channel shows a build timestamp in the HUD. A development build reports the version of the commit it runs, `YYYY.MMDD.<main commit count>` dated by that commit (Pacific time), in diagnostics and Tell Claude, rather than the last identity committed to `release.json`; a shallow checkout keeps `release.json` (`devBuildInfo`, `scripts/build-info.ts`).

### Fox model and Hermes

Models come from one catalog, [`contracts/model-sources.json`](../contracts/model-sources.json). The host picks a source ID and hands it to the Harness (`WORLDLET_MODEL_SOURCE`, plus that source's credential); the Harness maps each task tier (S, M, background-M, L, XL) to the source's model (`harness/hermes/model_tiers.py`). Changing a model is an edit to the catalog. A model the person connects in Fox (an API key or a compatible endpoint), or the API-key model a local Agent brings, is their own source. Worldlet assigns its tiers itself, never asking the person (owner request 2026-10-07: "不要用户分配 我们智能分配"): S work (single source checks, derivations, browser picks) runs on the newest small model that provider offers right now, found in Hermes' live, cached model catalog with Hermes' own fast-model families, never a nano or lite one and preferring the vendor of their model on a mixed catalog such as OpenRouter (`small_model` in `model_tiers.py`); an own Codex account uses the `local-codex` S model. Chat, setup and the Center keep the model they chose, and L/XL have no caller yet. Their own model stands behind the small one in Hermes' fallback chain, so a small model the provider refuses (retired, or not on their plan) never fails the work and is not asked again until Fox restarts. A provider with no small model, or a catalog that cannot be read, keeps their model for everything.

Worldlet provides no model of its own (owner decision 2026-10-05), so the catalog has one source:

| Source | Used by | Endpoint |
| --- | --- | --- |
| `local-codex` | Every build, unless the person's own provider is configured | This computer's Codex sign-in |

The `worldlet` source (the `worldlet-model` Worker), its free daily charge behind the person's own model (`WORLDLET_FALLBACK_SOURCE`) and `WORLDLET_DEV_MODEL` are retired; the Worker is paused (`MODEL_PAUSED` `all`, model service) and the app no longer enrolls an installation token with it. A Hermes profile saved on the retired service (or the earliest OpenCode Go DeepSeek default) is replaced by the host's source like a fresh one (`retired` in `model_tiers.py`), and a `fallback_providers` entry the free charge left behind is dropped (`energy_fallback`); `python3 scripts/energy-fallback-check.py` covers both.

Codex is a model layer, not an Agent (owner decision 2026-10-02): the built-in Hermes Agent stays and every tier is paid by the person's own Codex sign-in (`~/.codex/auth.json`, or `CODEX_HOME`); `agent/model-source.json` in the World library records only that setup chose it. With no Codex sign-in and no provider of the person's own, Fox says it needs an AI on this computer (`codex_local_missing`, [model failures](../ui/companion/model-failure.ts)). An Agent chosen at setup (Claude Code, Hermes Agent, OpenClaw, pi) runs through the built-in Agent when there is a Codex sign-in or it brings an API-key model, and otherwise answers for Fox itself on its own sign-in (`LocalHarnessAdapter`). The `local-codex` tiers:

| Tier | Codex model | Reasoning |
| --- | --- | --- |
| S | `gpt-5.6-luna` | low |
| M | `gpt-5.6-terra` | low |
| L | `gpt-5.6-sol` | high |
| XL | `gpt-6-astra` | high |

The sign-in is read-only to Worldlet. Codex refresh tokens are single-use, so Worldlet never refreshes, copies or rotates them; the Codex app keeps its own session. If the sign-in is missing or expired, Fox reports that it is not ready; open Codex to renew it. A model the user connects in Fox, or an attached Hermes profile, is unaffected. `python3 scripts/model-sources-check.py` (part of `npm run test:hermes`) checks the catalog against the host, the tier routing, the move off the retired service and the read-only boundary without an account. See [Model onboarding](../ui/companion/CONVERSATION.md#model-onboarding).

Hermes (pinned 0.21.3) runs as an app-owned resident process. The conversation and model connection stay warm; background source reads use a separate lane in the same profile. Idle processes retire after 10 minutes (`platform/electron/src/modules/agent-runtime/hermes-worker.ts`). Cancellation, crashes and model configuration changes rebuild the affected process. The agent-runtime module check (`npm run test:electron`) covers the resident Hermes transport with deterministic fixtures; `python3 scripts/hermes-latency.py` benchmarks local overhead without private data. See [Fox agent](../ui/companion/CONVERSATION.md).

The development runtime remains project-local and pinned to Python 3.12 for reproducible tests. A release app instead contains a signed `uv` bootstrap and a SHA-256-pinned Hermes source archive identity. It installs Hermes after opening the world, in the library's `runtime/` folder (Mac `~/Library/Application Support/Worldlet/runtime/`, Linux `~/.local/share/Worldlet/runtime/`, Windows `%LOCALAPPDATA%\Worldlet\runtime\`), selecting an existing compatible Python 3.11–3.13 or downloading app-owned Python 3.12. The app checks imports before marking that runtime ready. Model configuration and Hermes profiles remain separate. This avoids shipping the developer's Python environment or asking users to install Python themselves.

### Google OAuth client bundling

Development and release builds ship the same Google Desktop OAuth client registration. `scripts/google-oauth-bundle.py` reads `WORLDLET_GOOGLE_CLIENT_FILE` or, when unset, `.local/google-oauth-client.json`, and writes only the registration fields (client ID, secret, fixed auth/token URIs); `scripts/package-electron.ts` ships them as `resources/GoogleOAuthClient.json` in the package (`Contents/Resources/` on Mac). No user access token, refresh token or history is ever bundled. A signed package (`--sign` passes `--required`) refuses to package without a registration; an unsigned or development build without one simply has no Google connection. The credential file is not committed. Bundling a registration does not mean any account is authorized; see [Google OAuth review](../harness/hermes/GOOGLE-OAUTH-REVIEW.md).

### Mock Google onboarding rehearsal

While OAuth verification is pending, development builds show **Use mock Google (Dev)** under the Google button. The shared onboarding shows it only when the host snapshot reports `mockGoogleAvailable`, which the host sets only for the `dev` channel; a packaged release never does. The host skips its OAuth flow for this request, and passes `WORLDLET_MOCK_GOOGLE_ALLOWED=1` only to a development Hermes home. Dev profiles are separate libraries (`Worldlet Development` or a per-worktree profile), so the rehearsal never touches production onboarding state or real grants. It connects Mail and Calendar to a fictional account without OAuth: `harness/hermes/mock_google.py` replaces only the Google API client, so collection, S/M analysis, Fox reads and Applets run on real code and the included model. A per-profile `mock_google.json` marker in the Hermes home keeps it on; a real Google sign-in or disconnect removes it. The fictional inbox links three rehearsal pages on `https://demo.worldlet.test`: a clinic booking (`/brightsmile`), a streaming-trial cancellation with a retention step (`/streambox`) and a utility bill whose payment Fox hands back to the person: it refuses the payment button on its own, and the site stops at the card form anyway (`/citywater`). Reply drafts can be prepared for review; sending stays refused. After onboarding, the built-in Sample world is reachable as usual; it uses its own fictional persona and does not read the mock account.

**What the mock covers:** Gmail threads (paging, search, discovery, originals, reply drafts) and Calendar events for one fictional account, read through the real harness readers. **What it does not cover:** real Google OAuth (consent, tokens, scope grants, refresh or revocation), Google Drive, sending mail, Apple EventKit/Reminders/Notes or any other native permission, and real-account data. Passing it certifies none of those.

In Dev builds the website module serves the rehearsal pages from `dist/WorldletWeb/demo/` by intercepting `https://demo.worldlet.test/*` on the selected page (`platform/electron/src/modules/browser/page.ts`), so Fox can complete either end to end on every OS. To rehearse again, reset the development profile. Checks: `python3 scripts/mock-google-check.py` and `node scripts/demo-site-check.ts`.

The Mac gate lists `test:onboarding`: the whole first-run journey in a fresh profile on real code (mock sign-in, apps, tour, Attention results, Fox's first suggestion finished in the browser under its glow with no approval prompt, the confirmation and the first win), failing on any failed Agent, runtime or execution run, Attention budget error or persisted diagnostics failure. A rejected item save (`worldItemSave`) counts as self-corrected only when a later save of the same tool in that run was accepted and the run succeeded. `npm run test:onboarding` (`scripts/onboarding-check.ts`) builds the host, launches it with `--check onboarding-flow` (`platform/electron/src/checks/onboarding-flow.ts`) on a disposable library with this computer's Codex sign-in and the project Hermes runtime, and keeps a failed run's library for diagnosis. This Electron port is new; earlier passes were on the retired Swift app and do not carry over. Fixtures are not real-account acceptance. On the Mac the journey ends by closing the World: Fox stays on the desktop with its one-time Back to World / Quit Completely hint, and Back to World restores the window (advisory until it has passed on 02).

`test:onboarding:paths` (no RC gate since 2026-10-05, RCs within 20 minutes: the RC package smoke runs it on the signed app, see below; `scripts/onboarding-paths.ts`, check `platform/electron/src/checks/onboarding-paths.ts`, #1492): the first-run paths besides the mock-Google journey, entered through a local Agent (Codex first; the launcher always adds a fixture OpenClaw from `scripts/setup-fixtures.ts`, first on `PATH` and in `OPENCLAW_STATE_DIR`, so a host without an Agent still walks every path), one launch per phase on one fresh library, each ending with Quit Completely and failing if any process is left running with that library. `choose`: a local Agent on the sign-in page, then quit on the apps page. `resume`: the relaunch opens on the apps page; Enter my world; the tour's Mail step starts Google sign-in (`google_connect_started`, never `google_connect_failed`); Cancel; Not now, the tour ends, and opening Mail from the World starts Google sign-in again; Cancel; closing the World keeps Fox on the desktop and Back to World restores it; Reset Fox returns to the sign-in page. `after-reset`: the relaunch stays on the sign-in page. The development build gets the Google Desktop registration from `WORLDLET_GOOGLE_CLIENT_FILE`, or from `.local/google-oauth-client.json` in this checkout or the primary checkout; without one, sign-in fails at once. A SKIP fails (finding no Agent to choose means the fixture was not found). Mail from the World, and the desktop Companion off the Mac (the same code runs there, COMPANION.md), print `ADVISORY FAIL` until they have passed on 01 and 02; then `MAIL_AGAIN_BLOCKING` and `COMPANION_ELSEWHERE_BLOCKING` in the check turn on. The RC package smoke runs the same paths on the signed app (`--app <Worldlet.app|Worldlet.exe> --out <dir>`): a release build opens a disposable library only for the release check, in a fresh `worldlet-rc-*` folder in the temporary folder holding the launcher's one-time token (`platform/electron/src/rc-check.ts`); the launcher writes it before every phase, since Reset Fox removes it with the rest of the library. A failure fails the RC (`BLOCKING` in the launcher; advisory until the RC repairs #1536 and #1542 got it passing).

`test:onboarding:options` (advisory, no RC gate since 2026-10-05, RCs within 20 minutes; `scripts/setup-options.ts`, check `platform/electron/src/checks/setup-options.ts`, #1503): every way in on setup's sign-in page, through the development build's real UI, one launch on one fresh library per option, each ending with Quit Completely with nothing left running. `google`: Use mock Google (Dev). `codex`: Continue with Codex, which makes this computer's Codex sign-in Fox's model (its history is brought into the disposable library like any Agent's; SKIP without a Codex sign-in). `openclaw`, `claude-code`, `pi`, `hermes`: the Agent is found and brought in on setup's second page from fixture homes (`scripts/setup-fixtures.ts`) that the launcher passes through the Agents' own variables (`OPENCLAW_STATE_DIR`, `CLAUDE_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `HERMES_HOME`) and a `PATH` with fixture commands first, so this computer's own Agents are never read; world.sqlite (`companion_turns`, `companion_notes`, `brought_skills`, `brought_routines`) and the companion profile must hold what it brought. Each option then enters the World, and Fox must answer: after a bring, a question only that Agent's memory answers (tried twice, on this computer's model source). Options that would not finish within 26 minutes are reported as not run. `node scripts/setup-options.ts <option…>` runs a subset; `scripts/setup-fixtures-check.ts` (PR checks) proves the fixtures and the launcher's judging without the app. It reports `ADVISORY FAIL` and passes until it has passed on 01 and 02; then `BLOCKING` in the launcher turns on.

### Independent website

`website/` is the marketing site and its on-demand iframe demo (`website/demo/`). Reusable rendering and fictional data live in `ui/world/`; the desktop World page source is `ui/shell/`. Neither imports the other's entrypoint; `node scripts/source-layout-check.ts` (`npm run check:source`) enforces this. `scripts/build-website.ts` builds the homepage, renderer-only `/demo/`, `/download/`, `/help/`, `/privacy/`, `/terms/` and the `/explore/` content library; the desktop interface is built by `scripts/build-native-ui.ts`. The demo performs no AI, source, microphone, location or authentication requests. `npm run test:website` validates the site; `npm run deploy:website` publishes it, and Cloudflare Workers Builds also builds it on push to `main`. Desktop publication never deploys website assets.

## Checks

| Command | Covers |
| --- | --- |
| `npm run check:syntax` | Whole-tree syntax, dependency-free (`scripts/quick-check.py`) |
| `npm run gate` | This host's full gate (nightly and release checks, `scripts/gate.mjs`): `check`, `check:docs`, `check:source` (source layout and specifiers), `check:style`, `test:ci` (all operational and focused trust checks), `test`, `test:harness:portable`, `test:ui`, then `test:electron` on every OS and, on Mac, `test:harness`, `test:hermes` and `test:onboarding` (see [mock Google rehearsal](#mock-google-onboarding-rehearsal) for its port), and on Mac and Windows `test:agent:local` (Fox on this computer's Codex CLI in the practice world; SKIP without a Codex sign-in), then `test:ui:review` ([RC UI review](../platform/electron/README.md#rc-ui-review)). The Hermes suites use `WORLDLET_HERMES_PYTHON` or the checkout's `npm run setup:hermes` interpreter, which must be at the `runtime.json` revision and import `jsonschema`; otherwise they fail with the reason. Its directory leads `PATH` for those suites only. The onboarding suites need the same runtime (without it Mail's Google sign-in ends in "Fox setup files are missing"); a release host without a valid one runs `setup:hermes` from the gate checkout with `WORLDLET_HERMES_CHECKOUT=<primary checkout>`, which installs it into that checkout's `.local`, and reports `hermes-runtime` |
| `npm run test:electron` | The Electron host suite (`scripts/electron-checks.ts`): host contract (every action the shared UI sends is registered), each module's `check.ts` under Electron's Node or a windowless main process, and an app smoke run that opens the World on a fresh library and answers the core requests. Name filters run a subset, for example `node scripts/electron-checks.ts module:browser`. Disposable libraries only; no real account or model |
| `npm run test:ui` | `scripts/test-ui.mjs`: `build:native-ui`, then the 161 World/Applet/Fox fixture checks it lists. The 157 independent ones run four at a time, three on Windows (`WORLDLET_TEST_UI_CONCURRENCY=<n>`; `1` runs them one by one), longest first. On 01, four at a time pushed world startup past the 15–30 s waits of `fox-mac-controls-check` and `voice-memos-check` (2026-10-01). A page from `withBrowser` or `launchTestBrowser` (`scripts/browser-test.ts`) that loads the built World (`worldUrl()`) waits up to 2 minutes for its startup to end (`waitForWorld`: the loader gone, showing setup or showing a failure) after each `goto` and `reload`, so a check's own waits start once the World is up (Mac RC, 2026-10-05). The few that judge timing against the clock (`world-idle-frames-check`) or share a fake microphone (`microphone-choice-check`, the Meetings checks) run alone afterwards. An RC finishes within 20 minutes (owner request 2026-10-05): checks of how the World looks or moves were removed, and the Applet checks open a representative few Applets, not every one. Every check runs even after one fails: one line per check with PASS/FAIL and its time, then each failed check's full output. Node runs as `process.execPath` and Python as `python3`, without a shell. On 03 (M4 Pro, 12 cores, 2026-10-01) it took 4 min 04 s–4 min 19 s over three runs instead of 8 min 08 s serially. A check joins the parallel list only if it shares nothing with the others: its own headless browser (no OS window, focus or user defaults), `dist/WorldletWeb` read-only, an ephemeral port, and temp files and screenshot names of its own. `node scripts/test-ui-check.mjs` (in `test:ci`) checks the runner |
| `node scripts/run-steps.mjs <script>…` | Runs a script's `&&` chain four at a time (three on Windows) instead of one by one; a step after a nested `npm run` waits for it. `npm test` (`test:core`), `test:hermes` and `test:website` use it so an RC finishes within 20 minutes (owner request 2026-10-05); `npm run test:core` still runs the chain one by one |
| `npm run test:hermes`, `:routines`, `:steer`, `:desktop` | Hermes adapter, routines, steering and desktop JSON-RPC backend. `hermes-check.py` also replays every frame of every Hermes run through the bundled Core `harnessReceive` (`scripts/hermes-frame-validator.ts`); a frame Core rejects fails the check with its scenario |

### Host check flags

The app binary answers `--host-contract-check` (prints its registered actions, services and capabilities without opening a window or touching a real library) and `--smoke-check`; `npm run test:electron` runs both. Development launches also accept `--check <name>` for the named checks in `platform/electron/src/checks/` (currently `onboarding-flow`); release builds refuse it. Development launches read `WORLDLET_REPO_ROOT`, `WORLDLET_WEB_ROOT`, `WORLDLET_HERMES_PYTHON` and `WORLDLET_PROFILE_ROOT`; `WORLDLET_CAPTURE=<png>` saves a World frame and quits (see the [Electron host](../platform/electron/README.md#build-run-and-package)). A packaged release ignores them and uses its bundled resources and prepared Hermes installation. The retired Swift app's device flags (`--browser-check`, `--youtube-check`, `--stripe-check`, `--attention-center-check`, `--world-interaction-check`, `--update-ui-check` and others) have no Electron equivalent yet beyond the module checks; their device evidence does not carry over. Release builds also accept `--window-capture <png> [--after <s>]` for the [release smoke](../platform/electron/DISTRIBUTION.md#release-smoke): the real app on its own data captures its World view once painted, writes the PNG and a JSON report, then quits.

### Verification notes for agents

- **Fresh linked worktree:** run `npm ci` first. Desktop-app worktrees copy `node_modules` from the primary checkout when they are created, so it lags `package-lock.json` (missing `tsc`, wrong `@types/node`).
- **Hermes checks** (`test:hermes`, `test:harness`, `hermes-check.py`) need Python 3.11–3.13 with `jsonschema`. On a Mac whose `python3` is 3.9, set `WORLDLET_HERMES_PYTHON=.local/hermes-source/.venv/bin/python3` and put that `bin` first on `PATH`; otherwise the checks fail with errors such as `asyncio has no attribute timeout`.
- **Host only:** `node scripts/build-electron.ts` rebuilds the main process and preload into `dist/electron` in seconds; `npm run build:native-ui` refreshes `dist/WorldletWeb`.
- **Electron suite subset:** `node scripts/electron-checks.ts host-contract smoke module:shell` runs only the named checks; failures print the last lines of output.
- **Dev candidate:** `npm run dev:worktree -- --check` prepares a candidate for the committed `HEAD`, so commit first.
- **Chained suites stop at the first failure** (`&&`). When one check goes red, run the rest individually before assuming only one is broken. `test:ui` is not chained: it runs every check and lists every failure.
- **zsh:** do not start a word with `=` in one-liners (`echo =====` is an equals-expansion error).

## Nightly review

The nightly review and fix window is defined in Nightly review.

## GitHub Actions and release:local

GitHub Actions runs only lightweight workflows; none builds, signs or publishes an app:

- [`architecture.yml`](../.github/workflows/architecture.yml): the required **Architecture** check on every PR and merge group. `check:pr` runs every check (owner 2026-10-05; the Fast checks and Operational checks jobs run beside it): the complete `check` (architecture, types, syntax), then source, contracts, docs and style. That covers the five-project TypeScript checks, resolved layer/public-component/native IO boundaries and import-specifier syntax (`architecture-check`, `check:source`), plus fast Harness/browser safety contracts (`check:contracts`, `browser-surface-contract-check`). `check:source` owns the component scan; it is not invoked a second time. No Electron, native build, installer or model review runs in PR CI. The selection regression always runs. Since #1188 and #1225 (owner decision 2026-10-01: PR checks run only fast checks; the RC runs everything) the Architecture job also runs `check:docs`, `check:style`, the browser-free part of `npm test` (`scripts/test-fast.mjs`: the node/python checks of `test:core` and `test:worktrees` that launch no browser, UI build or Electron) and `pr-checks.mjs --all` (every operational/trust check, no browser). Since owner decision 2026-10-04 (Actions spend jumped from about $3 to about $60 a day once PRs ran the UI core checks as twelve jobs) pull request CI runs on Linux only, only these basic checks, and must finish within three minutes of a push: they run as three parallel jobs (`Static checks`: `check:pr`, `check:docs`, `check:style`; `Fast tests`: `test-fast.mjs`; `Operational checks`: `pr-checks-check`, `pr-checks.mjs`, `pr-checks.mjs --all`) and the required **Architecture** job only aggregates them. Their checkouts skip the media files (`*.png`, `*.webp`, `*.mp4`, `*.m4a`, `*.wav`, about 770 MB of the 800 MB tree; fetching them cost about 30 s per job and up to 153 s on 2026-10-05) and put an empty file at each skipped path, because these checks only test that media files exist; a check that reads image bytes runs in the RC. No UI test (`test:ui`, `test:ui:core`), iPhone or Android build and no macOS or Windows runner runs on a pull request; they run in the RC. `npm run ci:time [-- --hours N]` (`scripts/ci-time.mjs`) reports the push-to-Architecture time (p50/p90/max, runs over 3:00) and the billed minutes by runner OS; the project's hourly report carries it. `pr-checks.mjs` without `--all` runs a load smoke: every changed `.mjs/.cjs/.js` under `scripts/`, `gatehouse/` or `platform/` must parse (`node --check`), and the daemon's modules (`loadModules`, plus `machine-tick.ts`) must import, because hosts run main's automation directly. The operational and trust checks it lists run in full only as `npm run test:ci` (`--all`) in every RC, whose failure files an `rc-failure` Issue. Deleted/renamed paths participate and no workflow path filter hides the required check. Feature owners run behavior-specific focused checks. Both release/nightly gates retain the complete `check` (including history/runtime/parity behavior), docs/source/style, `test:ci` operational group and platform suites before immutable candidate acceptance and post-upload verification.
- `nightly-review.yml`: dispatches the nightly review lanes.

There are no production Secrets in Actions. `npm run release:local` (`scripts/release-isolated.sh`) is the only release path and runs on the designated Mac release host. It freezes local `main` at invocation, or the commit given by `-- --commit <sha>`, in a new linked worktree and installs Node dependencies there with `npm ci` from the committed lockfile. That checkout has its own `node_modules` and `dist`, so the main Dev watcher cannot delete release outputs and no other checkout's modules are shipped. In order it:

1. Checks preconditions: macOS, pinned commit and clean isolated checkout, Developer ID identity and `worldlet-notary` profile present in the keychain, a Google OAuth registration, `gh` authenticated, R2 S3 credentials readable, and the Sparkle key that will sign the feed (`WORLDLET_SPARKLE_KEY_FILE`, else the keychain) matching the committed public key (`platform/electron/distribution/mac/sparkle-key-check.sh`).
2. Computes the next Mac version/build above `release.json` and both live Sparkle feeds (`scripts/release-local.py`). A feed without any `<item>` (the Worker's placeholder when the R2 object is missing) stops the release instead of counting as "no prior release"; set `WORLDLET_ALLOW_EMPTY_FEED=1` only for a genuinely first release into a new feed. It also refuses a source whose release is already published: a source that is itself a published `Release v… / Build …` commit, or a source that already carries a live release's `v…` tag. Windows has its own `platformBuilds.windows` counter and `npm run version:windows` allocator.
3. Runs `check:types`. The release worker has already run this host's full gate (`npm run gate` list) on the release source before this script starts.
4. Commits the version/build bump to `release.json`, `package.json` and `package-lock.json` in the isolated worktree (the identity commit that is built). It pushes no branch and opens no PR (owner decision 2026-10-04: "统一用git tag"); each release is marked by its git tag, `v<label>` (Mac) or `windows-v<label>` (Windows), on the source commit on main, created with its GitHub Release archive (#1129). `release-identity.json` in the archive records the identity commit.
5. Runs `platform/electron/distribution/mac/release.sh --notarize`: `scripts/package-electron.ts --arch universal --sign` builds and signs one universal app, then the script notarizes the app and DMG and generates the Sparkle signature with the pinned Sparkle tools. Nothing is public yet.
6. Runs `scripts/release-identity-check.ts --native-only` against those local build outputs, then `platform/electron/distribution/mac/publish-release.py`, which preflights both feeds and uploads the immutable DMG before updating both legacy feed URLs, then `scripts/verify-published-release.ts` (both feed entries and the one installer checksum).
7. Archives the universal DMG, checksum, notary log, both appcasts and `release-identity.json` as a private GitHub Release with `scripts/archive-github-release.ts`.

`npm run release:local -- --check` runs preconditions against an isolated worktree and prints the computed next version/build without building, committing or publishing. `npm run release:local -- --commit <sha>` releases that exact source commit, even if other checkouts advance later. A failed run keeps its worktree for diagnosis until the next run starts, which removes it, so a host retains at most one; a successful run removes its own. The active worktree is locked with its process ID, so a concurrent run never removes it. Release output never shares the main checkout's `dist`.

### Release identity

The committed `release.json` (`version`, `build`, `platformBuilds`, `builtAt`) is the release baseline. New app versions are `YYYY.MDD.BUILD`; the official label is `vYYYY.MMDD.BUILD`. Legacy archives retain their original tags. `build` remains the Mac compatibility field; `platformBuilds.mac` and `.windows` are independent. `scripts/build-info.ts` selects the target platform for package and embedded UI metadata and fails if `release.json` and `package.json` versions differ. `dist/releases/release-identity.json` records `{version, build, builtAt, sourceCommit}` for a specific Mac release and is archived alongside the DMG.

### Credentials, all local

Everything the release needs is already on the releasing Mac: the `Developer ID Application: Chuan Ren (N9KJV72CSL)` identity and the `worldlet-notary` notarytool profile (login keychain), the Sparkle private key (`generate_keys --account app.worldlet.mac`, keychain-resident), the `gh` session and R2 S3 credentials, and the Google OAuth registration above. None of these touch the repository. Setup details are in [Mac distribution](../platform/electron/DISTRIBUTION.md).

## Hosting and publication

The primary origin is `https://worldlet.ai`. `wrangler.jsonc` declares apex and `www` custom domains for `worldlet.ai`, `worldlet.dev` and `worldlet.io`. The Worker runs before static assets and sends permanent 308 redirects from every website alias, including `worldlet.clockless.workers.dev`, preserving paths and query strings. `/downloads/` redirects also resolve to the same release bucket. `/api` and `/api/*` remain on the requested origin for installed-client credentials and WebSocket compatibility. Local previews are not redirected. Canonical metadata and public download links use the primary origin. `scripts/canonical-domain-check.ts` verifies these boundaries.

A developer Mac builds; Cloudflare R2 (bucket `worldlet-releases`, see [Name migration](#name-migration)) hosts one universal Mac installer and both existing Sparkle appcasts, served by the `worldlet` Worker under `/downloads/`. The private GitHub Release is an internal archive, not a customer download link. Keep the repository private.

Publication (`publish-release.py`) mounts the DMG read-only and validates the enclosed app's signature, portability, feed URL and public key, verifies the Sparkle signature, then downloads the live feed and applies the ordering rules in `release_feed.py`: a newer published build rejects the release, identical bytes for an existing build are a permitted replay, different bytes for an existing build are rejected. It uploads the immutable DMG and checksum before replacing the appcast. Cloudflare publication and GitHub archival are separate operations, and `release:local` cannot resume between them: every run commits a new build, so a re-run would publish a duplicate build (it refuses instead, see step 2). If a run stops after publication, finish it in the kept worktree it prints, with the same environment: re-run `publish-release.py` on the same DMG if a feed was not updated (identical bytes are a permitted retry), then `node scripts/verify-published-release.ts`, `python3 scripts/release-local.py write-identity <version> <build> <release sha>` (it reuses the committed `builtAt`, so re-archiving writes identical bytes), and `scripts/archive-github-release.ts` with `GITHUB_REPOSITORY`, `GITHUB_SHA`, `RELEASE_TAG`, `RUNNER_TEMP` and `GH_TOKEN` set as `release-local.sh` sets them. Finally remove the worktree. `archive-github-release.ts` refuses a tag that belongs to a different commit.

The `worldlet` Worker's other routes are the anonymous feedback inbox and the access-code session (`/api/auth/*`). It runs no model (owner decision 2026-10-05): it has no Workers AI binding, and the website demo's sample chat, transcription and live speech (`/api/chat`, `/api/transcribe`, `/api/speech/stream`, once metered by `SAMPLE_AI_LIMIT` and `SAMPLE_AI_DAILY_LIMIT`) answer `410` with `code` `worldlet_no_hosted_models`. `scripts/no-hosted-models-check.ts` covers this. The Worker has no scheduled job: the feedback endpoint sweeps expired `rate_limits` rows.

The earlier cloud accounts, private space, connector sync and context pipeline are retired: their routes return 410, and the five-minute cron and the `alading-context-pipeline` Workflow are no longer deployed. Their D1 tables (`users`, `workspaces`, `sessions`, `sources`, `knowledge`, `connectors`, `jobs` and related rows) and `alading-private` R2 objects are retained, not deleted. They are sealed with `ALADDIN_DATA_SECRET` (HKDF info `alading-private-v1`, salt = workspace ID, AES-GCM; the removed `worker/private-core.ts` in the repository's history has the exact scheme). Keep that secret until a decision is made about exporting or deleting that data.

Installed apps check the feed on launch and hourly. The app downloads and verifies a signed update in the background; Fox shows **Update** only when it is prepared, and one click installs and relaunches. The updater never restarts the app before that click; failed downloads keep the app running and show Retry update. See [desktop distribution](../platform/electron/DISTRIBUTION.md#electron-updater) for the updater and the update path from the native app.

## Name migration

The Cloudflare service was renamed from `alading` to `worldlet` in place; the old Worker and endpoint were removed and must not be recreated. Mac releases through 0.35.3 / Build 138 embed the retired API and update URLs and cannot update automatically; they must be reinstalled from the current download. Release artifacts now use `worldlet-releases`; public `/downloads/` URLs stay unchanged. The old release bucket is a temporary rollback copy until the migration and next publication are verified. Remaining legacy database/private-storage names, encryption context and local storage keys contain retained data and require explicit data migration before removal. They are not current product branding.

### Blog and homepage media

The first viewport is an edge-to-edge, locally hosted 90-second marketing film (`website/public/marketing/intro-hero.mp4`, optimized from the approved Panda M6 film). `website/hero-film.ts` starts muted, respects reduced motion and data-saving preferences, pauses off-screen, and provides explicit pause and restart-with-sound controls. When listening, the video uses `contain` to preserve the complete demo frame. The preview background uses `cover` without stretching. All primary actions use the shared brand green.

The shared world renderer and fictional Applet previews remain below the film. Homepage Mac chip choices resolve validated release feeds directly to installers; `/download/` remains the fallback. Windows is coming soon, with no invented installer link.

`website/blog/article.md` owns the five-section written walkthrough; `website/blog/images/` contains optimized approved frames. `/blog/your-ai-deserves-more-than-a-chatbot/` hosts the short introduction and `/blog/worldlet-walkthrough/` hosts the ten-minute video and full illustrated guide. `website/blog/content.ts` records the verified YouTube IDs; `scripts/build-blog.ts` renders the index, both posts, redirects and sitemap. Blog videos load privacy-enhanced YouTube iframes only on Play. Keep the `strict-origin-when-cross-origin` referrer policy for player identification. No YouTube requests occur before playback. Earlier Explore and agent-worded article URLs redirect to the current pages.

### Included-model access without password prompts

The app-issued installation token is stored in the installation's library as `model-access/installation.token` (for example `~/Library/Application Support/Worldlet/model-access/`). Until 2026-10-04 it sat beside the libraries in `Worldlet Model Access/<app-id>.model-access/`, the native Mac app's location; it moves in once on first use, so an updated app keeps its token. On Mac and Linux it is an owner-only plain file (0700 directory, 0600 file); on Windows the same file is encrypted with the user's DPAPI key through `safeStorage`. It is a revocable Worldlet credential, not an upstream provider key, and same-user processes can read it; it never involves a login-Keychain dialog. Concurrent first launches cannot enroll two tokens (hard-link into place). World backups and resets neither carry nor delete it ([installation folders](../core/items/STORAGE.md#physical-locations-and-preservation)). The native app's one-time legacy Keychain lookup is not ported. User-owned provider/OAuth secrets use the [credential vault](../platform/electron/README.md#structure).

`platform/electron/src/modules/agent-runtime/check.ts` (`npm run test:electron`) exercises the token file with disposable directories and no network.

### Deferred Dev updates

The watcher prepares complete host and web pairs under `.local/dev/electron/candidates/<id>/`, keeping the same profile. `build:native-ui` receives `WORLDLET_UI_BUILD_PUBLISH_DIR` only for that isolated web output; the running app and its web resources remain untouched. Preparation failures leave the current pair running. Main only builds clean committed changes; feature worktrees also respond to edits. A failed source SHA is not retried in a tight loop.

The lower-right footer line shows the running build: `Development · <workspace> · <revision> · <age>`, where the age is how long ago that commit was made (refreshed each minute). A prepared newer build is appended at the right end of that same line, in the same type: `… · New build <revision> · <age> Apply`, again with that commit's age (the watcher records `committedAt` with the candidate). Nothing needs dismissing; it stays until the build is applied or superseded, and a click on it never counts as a click on the footer (which goes home) or away from Fox. **Apply** explicitly requests the exact displayed candidate (`.dev-apply.json`), stops only this checkout's app and swaps both host and web before reopening. Stale candidate IDs and offline watchers refuse the request. Swap/reported launch failures restore both old outputs; failed recovery keeps backups for investigation. Superseded unused candidates are removed after a newer safe pair is published to the status file; directories containing previous app/web backups are retained for recovery. Release builds expose no update-file access, and hosts without this Dev capability show no notice. The app does not reload in response to `.dev-reload` changes.

**First migration:** an already-running older UI cannot acquire this notice without loading new code. Keep it intact while preparing; when the user explicitly agrees to restart, `npm run dev -- --apply-ready` submits one request to the existing watcher's current candidate. It does not start another watcher. This is also the explicit first-launch path in a fresh checkout with no running app. Normal future updates use the in-app button. A watcher replacement adopts an existing exact-path app without stopping it; stopping the watcher also leaves it open. A legacy paused watcher must be retired by the coordinator without invoking its old app-stopping shutdown handler, and without touching unrelated preview processes.

`node scripts/dev-deferred-update-check.ts` verifies preparation/adoption isolation, explicit IDs, offline/expired/busy refusal, host/web rollback and safe candidate coalescing with disposable fixtures. `node scripts/dev-build-ui-check.ts` verifies the Apply capsule shows only how many commits the running app is behind ("Apply · 3 commits behind"), Apply, input retention and Fox retention against a mocked Host bridge; it never restarts a product. Actual window readiness, OS permissions and preservation of real user input remain device acceptance. A LaunchServices request alone is not that evidence.


## Retired cloud context pipeline (2026-09-27)

The Cloudflare account `Clockless` no longer has the `alading-context-pipeline`
Workflow. Deletion returned success and a subsequent GET returned 404. The
`worldlet` Worker has no Cron Triggers (`schedules: []`); keep `workflows: []` and
`triggers.crons: []` in the root Wrangler config so later deployments do not
recreate the old pipeline or five-minute sweep. This cleanup did not redeploy the
Worker or delete its data stores.

Live binding inspection across the account's seven Workers found namespace
`103411` only on `worldlet.SAMPLE_AI_LIMIT` (30 requests per 60 seconds). That
limiter left the config on 2026-10-05 with the sample AI routes, so the namespace is free again. The model service uses
103401–103406. No Notion/Google OAuth secret names were present on the live
`worldlet` Worker, so no optional secret deletion was necessary. This is a
point-in-time deployed-binding audit, not a reservation against future changes.
The unrelated `dader` Worker retains its one-minute cron.

Some legacy cloud connector code still exists in this checkout; it is not proof
that its OAuth secrets or scheduler are deployed. Compare live configuration
before any future website/Worker release; do not restore the retired resources.

## Embedded Chromium

Electron supplies Chromium; there is no separate browser runtime to build. The trusted World, website Applets (`persist:website`, practice `persist:website-practice`), the restricted media player and the control-indicator overlay are separate `WebContentsView`s and sessions, stored under the library's `Browser/Electron/`. See the [Electron host trust boundaries](../platform/electron/README.md#trust-boundaries) and [browser integration](../platform/browser/README.md).

Website permission prompts are decided by the host (`platform/electron/src/modules/browser/surface.ts`): full screen, sanitized clipboard writes and pointer lock are allowed; location and camera/microphone go through the World's own consent; everything else is denied. The camera, microphone, Bluetooth (passkeys from a nearby phone), location, Calendar, Reminders and Apple Events usage strings are defined once in `scripts/mac-app-info.ts`: the Mac package declares them, and the Dev/worktree app writes the same strings into its copy of Electron.app, whose cached bundle is rebuilt and ad hoc signed again when they change (`node scripts/mac-app-info-check.ts`, part of `npm run test:worktrees`).

The shipped agent path is Hermes → World tool gateway → the selected website page through `webContents.debugger` (no remote-debugging port; launch `--remote-debugging-*` switches are stripped). Playwright is a development UI-test dependency, not the runtime browser controller. `scripts/hermes-check.py --browser-smoke` exercises real Hermes gateway dispatch with a local model and fixture platform replies; `scripts/browser-automation-check.ts` verifies the shared automation rules. These checks do not prove arbitrary provider login, cross-origin iframe controls or live-model task completion, and the retired Swift app's real-Chromium `--browser-check` / `--browser-automation-check` evidence does not carry over to Electron. Validate on the actual destination before promising general browser autonomy.

## Local diagnostics

Each Worldlet profile owns a `logs/` directory in its library. Dev on Mac uses `~/Library/Application Support/Worldlet Development/logs/`; worktrees use their separate profile roots.

- `fox-timing.jsonl`: request timing, numeric counts and completion/error/cancellation outcomes. No message text.
- `diagnostics.jsonl`: persistent failures for Hermes chat, connection and Applet-content operations. Core-projected records: allowlisted time, area, operation, error category, numeric code/domain and validated request UUID only. No raw error messages, email bodies, source URLs or credentials. The file rotates at 1 MB, keeping one previous file; directory/file permissions are 0700/0600. Logging failures never block the operation.
- Settings → Troubleshoot → Save diagnostics exports the existing allowlisted session report. Persistent log export is not yet included.

Hermes' own `agent/.../hermes/logs/` files are separate raw runtime logs and may contain conversation material. Do not publish them without review.

<a id="feedback"></a>
## Companion feedback

Feedback lives in Fox's Companion panel, as its last tab. It has no world device, Area, slot, badge or unsolicited popup. The final section also hosts curated release notes from `ui/shell/release-notes.ts`; an empty list shows an honest empty state, not invented announcements.

### Submission

- In Feedback, hold the Fox below the panel and release to prepare a review card. Tap/keyboard activation can also start and finish dictation. The existing speech pipeline only fills a draft; it does not submit a chat or send feedback automatically. **Type instead / Edit words** is a collapsed fallback, not the default form. Closing the panel, leaving the window or navigating away cancels dictation.
- **Send feedback** is explicit consent to send the reviewed text and bundled app version/build. No email field, automatic screenshots, audio attachment, chat history, source content, device identifier or analytics event is included in the voice-first panel. The receiver remains compatible with older clients supplying an optional reply email. Existing cloud transcription fallback may process audio separately, as disclosed beside the review card.
- The draft survives panel rerenders, closing/reopening and failed requests for the current app session. It is not persisted across app restarts. Successful receipt clears it. Unchanged retries reuse an ID; edits create a new ID. There is no background sending.
- The host `feedback` action (`platform/electron/src/modules/shell/diagnostics.ts`) posts to the fixed HTTPS endpoint from the main process, without website or account cookies. It requires `confirmed: true`, validates size and checks the returned ID before acknowledging delivery.

### Cloudflare inbox

`POST /api/feedback` is an anonymous write-only Worker route. `migrations/0003_feedback.sql` creates a separate D1 table with `id`, `created_at` and JSON `body` (text, contact, version, status). There is no public list/read endpoint or embedded admin credential. PostHog remains unchanged.

The endpoint accepts at most 4,000 UTF-16 text units and 24 KB of JSON, validates optional email/version, and rejects cross-origin browser submissions. D1's existing rate limiter allows 30 valid attempts per network IP per day-window; a date-scoped hash, not raw IP, is held in the rate-limit table; each submission first deletes expired rate-limit rows (the Worker has no scheduled sweep). Cloudflare still handles request IP/metadata. This is a bounded public inbox, not authenticated sender identity; operational abuse controls may be strengthened later.

Only a successful database write/verified idempotent receipt returns success. Database failures and an undeployed endpoint preserve the UI draft and show failure, never fake delivery.

### Operations

Before enabling real receipt, apply `0003_feedback.sql` to the existing D1 binding and deploy the Worker. These are separate from merging code and require deployment authorization. Use Cloudflare's authenticated D1 console to review submissions; no standalone admin UI or email notification is included in this first version.

```sql
SELECT id, datetime(created_at / 1000, 'unixepoch') AS received,
       json_extract(body, '$.text') AS feedback,
       json_extract(body, '$.contact') AS reply_to,
       json_extract(body, '$.version') AS app_version,
       json_extract(body, '$.status') AS status
FROM feedback ORDER BY created_at DESC LIMIT 100;
```

Handle feedback as private support correspondence. Restrict database access; do not publish exports or place messages in analytics. Retain only while needed for support and applicable obligations; deletion/access requests use the receipt ID and the published support address. Release notes are edited in source and shipped with the next app build; remote announcements are not yet implemented.

### Checks

- `node scripts/feedback-check.ts`: real in-memory SQLite schema, deduplication, validation, size/rate limits and write-only access.
- `node scripts/feedback-ui-check.ts`: fictional browser bridge, failure/retry, draft preservation, confirmation, dictation and responsive layout.
- `npm run check:types` covers the host action. These checks do not prove microphone permissions or production delivery.
