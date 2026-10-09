# Basic usage analytics

Worldlet has no separate account service. Before Google sign-in, PostHog uses an anonymous installation identity. After sign-in, `distinct_id` is `google-` plus a 64-hex digest of the normalized mailbox email returned by Google's authenticated own-profile API. The Hermes host derives it in one place (`harness/hermes/google_profile.py`): HMAC-SHA256 keyed by `WORLDLET_ANALYTICS_ID_KEY` when that variable is set in the host's environment, otherwise plain SHA-256 (the value every release so far has used). **Setting the key starts new Person IDs**: each signed-in account appears as a new Person from its next profile refresh (within a day), and earlier events stay on the old Person. No host passes the key yet, so identities are unchanged until the owner opts in. Because derivation runs on the user's device, any key must ship with the app; it prevents dictionary lookup of an email from its ID by anyone without the key, but it is not a server-held secret. The model service only checks the `google-` + 64-hex shape, so either form is accepted. `user_id`, `email` and an available Google `name` populate the Person. The same mailbox joins new desktop activity across devices and OSes. Email address changes produce a different identity; this is account analytics, not authentication or a billing entitlement.

`installation_id` remains a separate random device property. `$identify` links the pre-login anonymous epoch on successful sign-in and retries on activation. Leaving or switching an account rotates that anonymous epoch so one account is never aliased to another. Existing anonymous histories already identified by older releases may not merge; do not force-merge old Persons. Website visitors are not joined.

The packaged release app sends explicit product events on every OS (`platform/electron/src/modules/shell/analytics.ts`), whichever update channel it follows: Alpha, Beta and Production all report, and every event carries that channel as `update_channel` (`alpha`, `beta`); the Dev app, which runs from a checkout, never reports (owner decision 2026-10-06). To find one computer's errors (for example an Order's), filter on its `installation_id`, which the Order names.

| Event | When | Useful metric |
| --- | --- | --- |
| `app_active` | At most once per installation per UTC day, on launch or activation | Daily/weekly/monthly installations that were **opened** (unique `distinct_id`), first-observed installations (first-ever occurrence), platform split. It is not time online and not proof of use: an app left running or opened and closed counts the same |
| `user_engaged` + `engagement_kind` | At most once per identity per UTC day, when a person really used the app: their own key press, click or scroll in the World (`input`), a Fox message they sent (`fox_message`) or an Applet they opened (`applet_open`) | Daily/weekly/monthly people who **used** the app ([real use](#real-use-user_engaged)) |
| `onboarding_completed` | Once after the first-use guide is completed | Setup completion count and conversion from first activity |

Additional events are `onboarding_started`, `onboarding_apps_viewed`, `local_agent_selected` (setup entered with a local Agent instead of Google; since 2026-10-06 with which one, see [bringing an Agent](#bringing-an-agent)), `world_entered`, `applet_opened`, and `google_connection_present` / `google_connection_absent`. The operations `google_connect`, `fox_turn`, `content_read` and `item_update` emit `_started` and `_completed`, `_failed` or `_cancelled`. A completed Fox request is not a verified real-world task completion. An [Applet task](../../docs/FOX-AGENT.md#applet-tasks) Fox hands off emits `applet_task_started` and then `applet_task_completed`, `applet_task_failed` or `applet_task_cancelled` from the host (`runAppletTask` in `platform/electron/src/modules/fox/index.ts`), with the Applet's `applet` key, a `duration_bucket` that also has the longer `15_60s`, `1_5m`, `5_15m` and `over_15m`, and on failure only `error_code`; the task, request, page, URL and result are never sent. A start with no outcome event is a task that hung or whose app quit. Content reads include background requests. Schema 4 separates source-operation kinds and adds `content_opened` for entry into a record reader; this is an open intent, not proof that a person read the content. Applet/reader openings and Applet tasks carry an allowlisted `applet` key (the named connected Applets and every built-in catalog key); custom or unrecognized Applets become `other`. Applet/reader openings and the `google_connect`, `content_read`, `item_update` and source connect/disconnect operations also carry `trigger` (`user` or `background`; [who started an event](#who-started-an-event)).

Release clients send `$identify` per account per active UTC day and after Google connection. Available profile properties include user ID, name, email, platform, app version, connection state and onboarding completion. A fresh Google authorization requests basic identity scopes as well as the explicitly selected content scopes. Existing read-only grants keep working: mailbox email is available; display name is filled only when profile permission is already present. The host caches this small own-account profile locally for one day and deletes it on disconnect. No correspondent identity or mailbox content is used to infer a name.

Events also carry platform, app/build version, OS version, language, distribution channel, session/installation IDs and coarse timing. `$process_person_profile` is true for signed-in accounts and false before login; `$geoip_disable` is always true. The host allows only named product events. No authorization token, connected content, chat, page URL, raw error, recording or autocapture payload is sent. A `_failed` event carries only `error_code`, Core's classification of the failure (`diagnosticError` in `core/diagnostics/report.ts`: offline, timeout, authentication, quota, unavailable, operationFailed, …); the message itself never leaves the device. `app_process_gone` reports a crashed or killed renderer, GPU or helper process as `process_type` plus Electron's `exit_reason` (crashed, oom, killed, …); clean exits are not reported. The website engine (CEF) reports the same way: `web_page` for a page renderer that ended abnormally (CEF's termination status mapped to the same reasons) and `web_engine` for an engine process that stopped without being asked to (`onGone` in `platform/electron/src/modules/browser/engine/process.ts`).

`fox_timing` reports a finished Fox turn (not a steering message): `duration_bucket` from submit to the reply's completion, `timing_outcome` (complete, error, cancelled) and, when known, `first_text_bucket`, `model_bucket` and `tools_bucket`. `first_text_bucket` is send to the first word: the built-in Hermes host's `firstTextMs`, and since 2026-10-08 also a turn in the resident session of the person's own Agent (Hermes Agent, OpenClaw; `harnessTurnTimings`), whose row in `logs/fox-timing.jsonl` adds `sessionMs` (opening the thread's session, near 0 once it was warmed) and the tokens that Agent reported, which never leave the device. `app_startup_timing` reports the time to the revealed World with `first_frame_bucket`. Both carry buckets only (`foxTimingEvent` in `core/diagnostics/fox-timing.ts`); the millisecond rows stay in `logs/fox-timing.jsonl`.

Since 2026-10-07 every `duration_bucket` the World page measures (`fox_turn_*`, `world_tool_*`, `content_read_*`, `google_connect_*`, `source_*`, `item_update_*`) uses the same buckets as `fox_timing` (`timingBucket`): `under_1s`, `1_5s`, `5_15s`, `15_60s`, `1_5m`, `5_15m`, `over_15m`; older builds end at `over_15s`, so a query for "over 15 seconds" sums `over_15s` and the longer buckets. More speed and update events:

| Event | When | Properties |
| --- | --- | --- |
| `applet_opened` | An Applet is entered | `duration_bucket` from the open to the panel's first painted frame (two animation frames; none when the window was hidden), plus `applet` and `trigger` as before |
| `page_load_timing` | A page in the browser device (an Applet's website, the Browser) finished loading its document or failed | `duration_bucket` from the start of loading, `timing_outcome` (`complete`, `error`), `page_engine` (`cef`, `electron`); never the URL or site (`bind` in `platform/electron/src/modules/browser/device.ts`) |
| `update_prepared` | An update finished downloading and verifying and waits for Update, once per Build | `duration_bucket` from the check (Mac) or download (Windows) that found it, `trigger` |
| `update_applied` | The first launch running that Build or newer | `update_wait`: how long it waited for Update (`under_1h`, `1_24h`, `1_7d`, `over_7d`). A `update_prepared` with no `update_applied` is a computer still waiting for its click |
| `update_failed` | A check, download, preparation or install failed, at most once per step per launch | `update_stage` (`check`, `folder`: the app sits in a folder it cannot replace itself in, so it never updates, `download`, `prepare`, `install`; `install` also when the Build did not change after an Update click; Gatehouse shows the stage as the event's code in 错误码 and the 版本 rows); since the releases after 2026-10-09 a Mac `prepare` failure also carries `update_error`, the check that failed: `open` (the disk image did not mount), `contents` (not one app inside), `copy` (unpacking failed), `build` (CFBundleVersion is not the feed's Build), `identity` (another bundle identifier), `signature` (`codesign --verify` failed), `team` (another Developer ID team), `incomplete` (no executable), `disk` (no space left), `timeout` (a step ran out of time) or `other` |
| `app_build_changed` | The first launch of a new Build, however it arrived (Update, a reinstall, a store) | `from_build`: the Build the previous launch ran; the new one is the event's `app_version` |
| `fox_proactive_asked` / `fox_proactive_shown` | Fox's speak-first ask ran / its line was shown | `proactive_moment` (`settled`, `long-stay`, `late`, `browsing`), `proactive_status` (`spoke`, `passed`; asked only); never the line. Before 2026-10-07 the host dropped both events |
| `fox_browse_changed` | Browse with me turned on, or Don't bother chosen, in Fox's card | `fox_browse` (`on`, `off`) |
| `order_sent` / `order_stopped` | An Order (Alpha and Dev only) was sent / ended before it was sent | `order_result`: `woke` (the project took it at once), `stored` (only Gatehouse's inbox has it), `failed` (neither); `order_stop`: `cancelled` (Escape or another stop), `stopped_early` (stopped before the microphone opened), `left_app` (left the app before the microphone opened), `speech_error` (microphone or recognition failed, or no speech heard), `no_speech`, `page_closed`, `other`; never the words. Since the releases after 2026-10-07 |

The update events come from `modules/shell/updates.ts`; the prepared Build stays on the device (`worldlet.update.prepared` in preferences.json). `app_build_changed` names only the previous public Build number (`worldlet.update.lastBuild`).

These events exist only in builds that have them: `update_prepared`, `update_applied` and `update_failed` since Mac 3076, `app_build_changed` since the releases after 2026-10-07. For every build, older ones included, the website counts each update check and installer download per UTC day, file and asking version (`Worldlet/<version>` in the updater's User-Agent; `app` for an updater that names none, `machines` for the release hosts' and Gatehouse's own requests (`WorldletMachines/1`), `other:<product>` with only the User-Agent's first product name for anything else, such as `other:Mozilla`), with no address or installation ID (`worker/update-checks.ts`); Gatehouse shows the last seven days as its 更新检查 source (`source_get` `updates`). A build that checks every hour but never downloads the offered installer is stuck after the check; a build that stops checking is not running or cannot reach worldlet.ai.

## Bringing an Agent

Owner goal 2026-10-06: the target customer already runs an Agent (OpenClaw, Claude Code, Hermes Agent, Codex, pi), so setup reports where such a person gets stuck ([plan](../../ui/onboarding/README.md#a-local-agent-instead-of-google)). Every dimension is allowlisted twice (the World page's `worldlet:product-event` and the host's `safeDimensions`); amounts are buckets (`countBucket` in `core/diagnostics/setup-events.ts`: `0`, `1_9`, `10_99`, `100_999`, `1000_plus`) and the Agent is its public product ID (`local_agent`: `claude-code`, `codex`, `hermes`, `openclaw`, `pi`). No Agent name, conversation title, path, model name or integration name is sent.

| Event | When | Dimensions |
| --- | --- | --- |
| `local_agents_detected` | Setup's first page lists the Agents on this computer | `agents_found` (`0`–`2`, `3_plus`), `recommended_agent` (or `none`) |
| `local_agent_selected` | The chosen Agent answered and Fox switched to it | `local_agent`, `fox_brain` (`built_in`: the built-in Hermes Agent on a Codex sign-in or the Agent's API-key model, with World tools; `agent`: the Agent answers itself on its own sign-in), `duration_bucket` |
| `local_agent_select_failed` | It did not start, is not signed in or did not answer | `local_agent`, `error_code`, `duration_bucket` |
| `agent_bring_completed` | The second page finished bringing it in, integrations included | `local_agent`, `bring_conversations`, `bring_notes`, `bring_skills`, `bring_routines`, `bring_model`, `bring_memory` (`yes`/`no`), `integrations_came_over`, `integrations_reconnect`, `duration_bucket` |
| `agent_bring_failed` | Bringing it in failed | `local_agent`, `error_code`, `duration_bucket` |
| `tour_skipped` | The Tutorial switch turned off in the first run | `tour_step` (`1`–`8`, the [tour's steps](../../ui/onboarding/README.md#after-arrival-guided-tour-then-a-first-useful-task)) |
| `first_win` | The first-value task was settled and celebrated | none |

All are background-shown setup facts except `local_agent_selected` (the person's choice); none counts as 操作 beyond what the [who table](#who-started-an-event) already says. `analytics-insights.json` holds the funnel detected → chosen → brought → World → first Fox reply → first win, broken down by `local_agent`. `node scripts/product-analytics-check.ts` covers the buckets and that no title or path passes.

## Real use (`user_engaged`)

Owner request (2026-10-03): track people really using Worldlet, not the models running by themselves. Three signals answer different questions; never add them together:

| Signal | Means | Does not mean |
| --- | --- | --- |
| `app_active` (在用) | The app was launched or activated that UTC day. Sent at most once per installation per UTC day, so it says "opened that day" | Time online, minutes of use, or that the person did anything |
| `user_engaged` (操作) | A person did something themselves that day | How much they did: it is sent at most once per identity per UTC day |
| `$ai_generation` `workload` | `interactive`: a model call for a person's Fox turn. `background`: Applet tasks, scheduled and other work the app runs by itself (`models/observability.ts`) | That a person was present: background calls run with nobody at the app |

`user_engaged` is sent by the host (`recordUserEngaged` in `platform/electron/src/modules/shell/analytics.ts`), with the same release gating, opt-out, identity and retry (same UUID, timestamp and kind) as `app_active`. `engagement_kind` is allowlisted: `input`, `fox_message`, `applet_open`; anything else becomes `other`. No key, text, coordinates, element, URL or Applet content is sent. Its sources:

- `input`: the host watches the World page's native input (`watchInput`: Electron `before-input-event` key down and `before-mouse-event` mouse down and wheel). Only input while a Worldlet window is focused and no debugger is attached counts (`personInput`). Script-dispatched DOM events (`dispatchEvent`, `element.click()`, `executeJavaScript`) never reach these hooks, so they never count. Mouse moves, releases and hover do not count.
- `fox_message`: the Fox input submitted with the person's own gesture (`reportEngagement` in `ui/companion/native-chat.ts`); greetings and Worldlet-composed requests do not count.
- `applet_open`: an Applet entered with the person's own gesture (`ui/shell/notion-world.ts` visitObject).

The World page reports only with a fresh gesture: Chromium's `navigator.userActivation.isActive`, which only trusted input sets for about five seconds, and never during a Fox tool step (`asFoxAction` in `ui/shell/product-analytics.ts`). The host accepts the page's report only while a Worldlet window is focused, and sends it at most once a day whatever the source. Automation is excluded: remote debugging switches are removed at launch (`platform/electron/src/main.ts`), the Electron checks drive pages through the debugger or scripts, and the agent browser and the CEF browser run in their own processes and views, not the World page. Limits: input inside website panels (the CEF surface and Electron panel views) is not watched; a host `sendInputEvent` into the World page would count, and production code never does this. Practice and sample worlds count like any other world: a person using them is using the app.

### Who started an event

Events that can be started either by the person or by the app carry `trigger`: `user` when the event starts within the person's gesture (`eventTrigger` in `ui/shell/product-analytics.ts`) and outside a Fox tool step, otherwise `background`. An operation decides once when it starts, so its outcome events carry the same trigger. Older builds send no `trigger`. The Gatehouse board's 操作 (`REAL` in `gatehouse/source-posthog.mjs`) counts `user_engaged`, the **user** events below unless `trigger = background`, and the **mixed** events only with `trigger = user`.

| Event | Who | Deciding code |
| --- | --- | --- |
| `user_engaged` | user | `recordUserEngaged`, `watchInput`, `personInput` (`platform/electron/src/modules/shell/analytics.ts`); `reportEngagement` (`ui/shell/product-analytics.ts`) |
| `app_active` | neither: the app ran | `recordActiveDay` (`analytics.ts`); also sent on Google connection events |
| `fox_turn_*` | user: a visible conversation turn the person sent or a Worldlet button they pressed; greetings excluded | `withFoxTurnAnalytics` (`ui/shell/product-analytics.ts`), `submit` (`ui/companion/native-chat.ts`) |
| `onboarding_started`, `onboarding_apps_viewed`, `local_agents_detected`, `local_agent_select_failed`, `agent_bring_completed`, `agent_bring_failed` | background: shown by the setup surface | `ui/onboarding/startup-setup.ts` |
| `tour_skipped`, `first_win` | background: the first-run tour's outcome | `ui/onboarding/world-tour.ts`, `ui/onboarding/first-value.ts` |
| `onboarding_completed`, `local_agent_selected` | user: the person finished setup or chose an Agent | `recordOnboardingCompleted` (`analytics.ts`); `ui/onboarding/startup-setup.ts` |
| `world_entered` | background: the World loaded | `ui/index.ts` |
| `google_connect_*`, `source_connect_*`, `source_disconnect_*`, `item_update_*` | user, with `trigger` (Fox's tool steps and calls after the gesture expired are `background`) | `withProductAnalytics` (`ui/shell/product-analytics.ts`) |
| `content_read_*` | background: includes list refreshes and cache reads; never counted as use | `withProductAnalytics` |
| `applet_opened`, `content_opened` | mixed, by `trigger`: `user` after the person's click, `background` when Fox navigates or the World restores | `visitObject` and `openAppRecord` (`ui/shell/notion-world.ts`) |
| `applet_task_*` | background: Fox's hand-off to an Applet, started from the person's words in a turn | `runAppletTask` (`platform/electron/src/modules/fox/index.ts`) |
| `world_tool_*` | background: Fox's own tool steps | `withToolAnalytics` / `asFoxAction` (`ui/shell/product-analytics.ts`) |
| `external_outcome_confirmed` | user: the confirmed result of a send, Notion write or a browser last step the person let go ahead; no `trigger` | `withProductAnalytics`; review cards in `ui/companion/fox-email-review.ts`, `fox-notion-review.ts`, and the Go ahead in `ui/shell/notion-world.ts` |
| `google_connection_present`, `google_connection_absent` | background: connection state at start | `ui/index.ts` |
| `app_process_gone`, `app_unclean_exit` | background: crashes | `platform/electron/src/modules/shell/index.ts` |
| `$ai_generation`, `model_usage`, `model_request_rejected` | `workload` interactive (a person's Fox turn) or background | Model service (`models/observability.ts`) |

**操作 is undercounted until the client release that sends `user_engaged` and `trigger`.** Older builds send neither, and much real use (reading, moving around the World, opening Applets) sends no event that proves a person started it, so a person on an older build counts as 操作 only through the **user** events above. Expect 操作 to rise as people update; nothing is backfilled.

## Error tracking

Diagnostics go to the same PostHog project; Cloudflare Workers Logs stay off. [Error tracking](https://us.posthog.com/project/625931/error_tracking) receives a `$exception` for uncaught main-process errors (`uncaughtExceptionMonitor`, which leaves Electron's own handling unchanged), uncaught World page errors and unhandled rejections (host action `reportException`), and every error the host records to `logs/diagnostics.jsonl` (`error_area` main / renderer / host; host errors are marked handled). Core's `exceptionReport` keeps only the error type, its `error_code`, an allowlisted `operation` name and stack frames of function name, file basename, line and column; the message, folders, user names and query strings never leave the device. A rejected World item save and a failed Fox setup also carry `error_rule`, a fixed tag classified from the message: the item rule (`itemRule`), or the setup step that stopped (`setupStep`: `setupFiles`, `setupLock`, `setupDownload`, `setupVerify`, `setupExtract`, `setupPython`, `setupDependencies`, `setupValidate`, `setupOther`). The full setup output stays in `runtime/setup.log` in the library. Environmental codes (offline, timeout, authentication, quota, …) are level warning, the rest error. Each distinct exception is sent once per run, at most 30 per run. A run that never reached a clean quit (native crash, force quit, power loss) leaves `logs/running.json`; the next launch reports `app_unclean_exit` with `native_crash` `yes` when Crashpad wrote a crash report during that run, else `no`. The installed app starts Electron's crash reporter with uploads off (`platform/electron/src/main.ts`); its reports stay in `logs/crashes`, newest ten kept, and never leave the device whole: the next launch sends the crashed thread of each new crash as a [native crash](#native-crashes). Local Fox timings and the exportable diagnostics report stay on the device. The ingestion provider still receives the network IP. Disabled/offline and old clients leave gaps; no invented historical backfill is performed.

### Native crashes

A crash of the app's own native code (Chromium, Electron, a `.node` addon) ends the process before any JavaScript can report it. About ten seconds after the next launch, the installed app looks for crash reports written since its last look (a week back the first time; five at most per launch; `reportNativeCrashes` in `platform/electron/src/modules/shell/index.ts`): on macOS the system's own reports of Worldlet's processes in `~/Library/Logs/DiagnosticReports` (`Worldlet-…ips`, `Worldlet Helper (Renderer)-…ips`, already unwound by macOS); on Windows the Crashpad minidumps in `logs/crashes`, of which only the exception code and the crash address are read (`native-crashes.ts`). Core's `nativeCrashReport` (`core/diagnostics/native-crash.ts`) keeps the exception (`EXC_BREAKPOINT`, `EXCEPTION_STACK_BUFFER_OVERRUN`, …), the signal, the crashed process (`Worldlet`, a `Worldlet Helper` or `Worldlet.exe`), the build that crashed, the architecture, the crashing module's public build UUID and up to 40 frames of the crashed thread as module + offset (`Electron Framework+0x90b413c`). A system library's frame may keep the function name macOS gave it; the app's own modules never do, because the nearest export macOS names is not where the crash is. Memory, registers, other threads, paths, thread names and crash annotations never leave the device. It is sent as an unhandled `$exception` with `$exception_level` `fatal`, `error_code` `nativeCrash`, `error_area` `native`, `crash_process`, `crash_signal`, `crash_build`, `crash_arch`, `crash_module_id` and `electron_version`. The same crash gives the same frames on every computer running that build, so PostHog groups it as one issue, and Gatehouse's production errors list its versions by `crash_build`, the builds that crashed rather than the one that reported. A report that fails to send is not retried.

The frames turn into function names and source lines with Electron's published Breakpad symbols for that version: `npm run crash:symbols -- --electron 44.5.1 --platform darwin-arm64 --id <crash_module_id> 0x90b413c 0x45e540` (`scripts/crash-symbols.ts`; Windows: `--platform win32-x64 --module Worldlet.exe`). It downloads the symbols once (about 130 MB) into `~/.cache/worldlet/electron-symbols` and warns when `--id` is not the module those symbols describe. The 2026-10-07 Mac crashes of 3149, 3151 and 3154 read `IconLoader::ReadIcon()` this way (#2164).

Production product analytics is enabled by default; there is no opt-in prompt and collection does not wait for Google sign-in or model/private-content consent. An existing explicit opt-out is respected. Only a packaged release-channel app reports (`releaseBuild` in `modules/shell/release.ts`; a Windows login-item launch counts, `releaseLaunch` in `core/distribution/login-item.ts`, where before 2026-10-06 it sent nothing and skipped updates), and only with a valid key in its bundled `distribution/Analytics.json`; development builds, `WORLDLET_DEV=1` launches and command-line checks do not. Daily activity retries on later activation without blocking startup; one-off product events remain best-effort. Users can disable future reporting in Fox’s **Privacy** controls or with **Share Basic Usage Counts** (app menu on Mac, File menu elsewhere). The opt-out, installation ID, account/anonymous IDs and delivery markers live in the installation's `preferences.json`, outside the world backup, so restoring a world on another device does not duplicate an installation ID. The Electron host imports these values once from the native Mac host's preferences (same `WorldletUsage*` names), so upgraded Mac installations keep their installation and account identity. The retired Windows host's `usage-analytics.json` is not imported; Windows installations start a new installation ID.

Project: [Worldlet (US)](https://us.posthog.com/project/625931/home). Project time zone is `America/Los_Angeles` (Pacific time, with daylight-saving transitions), verified in the live project settings on 2026-09-27. Refresh existing insights to recalculate daily/weekly/monthly buckets. This display/bucketing setting does not change model-service quota reset policy. The public capture key and ingestion host live in `platform/electron/distribution/Analytics.json`; the packager copies it into every package as `<resources>/distribution/Analytics.json`. There is no build-time override. Never use a personal/admin API key. An empty key disables transmission. This configuration does not update already installed apps.

## Dashboard

Primary entry: [Worldlet · Main](https://us.posthog.com/project/625931/dashboard/2132777). Its saved defaults, inventory and metric limitations are recorded below. It combines activity, activation, core usage, reliability and included-model observability.

Use PostHog Trends on `app_active` with **Unique users** for active identities (signed-in accounts plus anonymous users). Count distinct event `installation_id` separately for devices on schema 3; older releases lack that field. Select daily/weekly/monthly intervals, and break down by the event property `platform` when needed. Use **First-ever occurrence** on `app_active` for newly seen identities. This is **first observed**, not newly installed: an existing user first upgrading to a telemetry-enabled version also appears here. Ordinary updates preserve the ID. Never sum daily active counts to estimate unique users. Use `onboarding_completed` unique users for setup completion. The default Starter Dashboard expects `$pageview`, `$autocapture` and session events, which Worldlet deliberately does not send; its zero tiles are unrelated to native activity.

## Verification

Check that a package contains `distribution/Analytics.json` and `build-info.json`, and test on each OS that activity and opt-out work. Live ingestion should be checked with a separately identifiable test installation, never by fabricating production traffic. Privacy changes to the website must be published before broader Windows distribution.

## Acquisition and activation funnel

Website downloads: the download is open to anyone (no invite code since owner decision 2026-10-08). A fresh release installation claims its website download once and sends its opaque download token as `invite_token` (32 hex, never an email; the property keeps its old name) on every event and in `$set_once`; Gatehouse's funnel counts installs that carry one, and the website's own record keeps each download's source (website/README.md, Gatehouse funnel).


Use a seven-day conversion window and unique `distinct_id` throughout:

1. `onboarding_started` → `google_connect_started`: visitors who attempt sign-in.
2. `google_connect_started` → `google_connect_completed`: authorization conversion; compare failed/cancelled events.
3. `onboarding_started` → `onboarding_apps_viewed` → `onboarding_completed` → `world_entered`: setup and entry.
4. `world_entered` → `fox_turn_completed` / `item_update_completed`: engagement (separate insights).
5. Retention: `app_active` → subsequent `app_active`, daily and weekly, broken down by platform/version.

Drop-off means no next event within the conversion window; do not claim a user has left forever or depend on an unreliable quit event. The existing daily chart showed 16 first-observed IDs on 2026-09-25 UTC and 2 on the previous day when inspected; this cannot establish 16 new installations. Its misleading “New installations” title was corrected.

Product events are best-effort and are not backfilled when offline. Activity and completion retry on later relevant calls. Opt-outs, offline use and older builds create measurement gaps. Development and sample activity are excluded. No production events are synthesized during tests.

Run `node scripts/product-analytics-check.ts` for payload exclusion, sample gating, failures, non-blocking reporting and the `trigger` / `user_engaged` reports of the World page. The Electron shell module check (`platform/electron/src/modules/shell/check.ts`, run by `electron-checks.ts modules/shell`) covers `user_engaged` in the host: native input once a day, script-dispatched DOM events, a debugger attached, an unfocused app, moves and releases, retries and opt-out. Device acceptance on each OS remains required.

New event names are unavailable in the PostHog event picker until the first instrumented release reports them. Do not seed production with fake events. `core/diagnostics/analytics-insights.json` contains the exact pending funnel definitions for configuration after ingestion.

## Website channels

[Acquisition dashboard](https://us.posthog.com/project/625931/dashboard/2136428) includes first-seen installations, daily active installations and D1–D7 retention.

App events include platform, version, build, environment, schema version and an allowlisted package channel. `WORLDLET_DISTRIBUTION_CHANNEL` stamps the package at build time (`scripts/package-electron.ts`); absent/invalid values report `unknown`. Supported values: website, homebrew, steam, microsoft-store, mac-app-store, itch, setapp, winget. This is **package origin**, not marketing attribution: a shared website binary distributed through Homebrew still cannot identify that referral.

Website links use allowlisted `utm_source`, `utm_medium`, `utm_campaign` values. Example: `https://worldlet.ai/?utm_source=producthunt&utm_medium=community&utm_campaign=launch`. Sources are defined in `website/analytics.ts`; campaigns: launch, early-preview, demo. Unrecognized values become other/unknown, never arbitrary text. Attribution persists within a browser-tab session; inactivity over 30 minutes starts a new session on the next page load. No personal referrer or query string is transmitted.

Website events are `$pageview`, `download_clicked` and `get_worldlet_clicked` (website analytics); `waitlist_submitted` and `invite_redeemed` went with the invite codes (2026-10-08). A download click is not a completed download or installation. Use the website-only pageview → /download/ pageview → download_clicked funnel and break down by utm_source (a link's source, else the referrer's site as a known name). App and browser IDs are separate; no website-to-app join exists. App persistent events retain their UUID and timestamp on retry for deduplication; one-off events remain best-effort.

Production worldlet.ai only; preview/local hosts do not report. The website respects DNT/GPC and offers an opt-out on /privacy/. Page paths are sanitized categories; no arbitrary referrer, query or form content is sent. Website person profiles are disabled. Run `npm run build:website && node scripts/analytics-check.ts` to check mocked ingestion without production traffic.

App changes need a new app release, website changes need deployment. New event reports cannot backfill older builds. Store visits, wishlists, purchases and refunds remain in each store's own dashboard.

## Model usage and Person visibility (2026-09-25)

Older live clients were inspected sending `$process_person_profile:false`, explaining an empty Persons table. The new native client identifies the account and fills its name/email after authorization or the next successful Gmail read. This requires an updated app, not just a Cloudflare deployment. Legacy grants without profile scopes can supply email but not necessarily a name.

Included-model `model_usage` events use the same app analytics ID via a dedicated HTTP header. Only the exact Worldlet included-model endpoint receives it; names/emails never enter inference headers or prompts. Host consent and non-practice checks control the header. Without it, the Worker retains operational aggregate events under a service ID, without a Person. The header is analytics metadata, **never authorization or budget ownership**; the existing credential still determines limits.

Each usage event contains tier, measured input/output/cached tokens, `total_tokens`, standard tokens and USD cost estimate. To inspect personal consumption, filter `model_usage` to production, group by Person, and sum these numeric properties over the desired date range. Do not count cached tokens twice: they are included in input tokens. Separate `usage_measured=false` retained reservations from measured consumption. User-owned providers are outside the included-service accounting. Interrupted streams now emit an outcome; token/cost measurements remain unknown if the provider did not send usage. PostHog is best-effort; Cloudflare's budget ledger decides allowances. Historical service-level events cannot be reliably assigned to a Person.

Verification: `scripts/person-analytics-check.py` tests account profile safety and actual HTTP header handling with mock transports; `scripts/model-worker-check.ts` checks numeric attribution payloads. The native-host identity/account-switch checks with disposable preferences retired with #996 and are not yet ported to Electron. No production accounts/events are fabricated. Device acceptance on each OS is still required.


## AI Observability (2026-09-26)

Product instrumentation uses the PostHog capture HTTP API directly. It requires the existing public project capture key, not a Codex connector, personal API key or plugin login.

| Signal | Event / fields | Coverage |
| --- | --- | --- |
| Individual model calls | `$ai_generation`: model, provider, tier, streaming, output limit, interactive/background | Included Cloudflare model service |
| Response performance | `$ai_latency`, `$ai_time_to_first_token` in seconds | First content/reasoning/tool delta, not a role-only frame |
| Token/cost accounting | Input/output/cache tokens, explicit USD costs using deployed tier prices | Only provider-reported usage; missing is unknown, never zero or reserved allowance |
| Outcomes | Completed, cancelled, incomplete stream, stream error, provider error | Finalized once on EOF, error or downstream cancel |
| Request rejection | `model_request_rejected`: rate/background-rate/allowance and HTTP status | Authenticated requests rejected before model invocation; not fake generations |
| Person | Existing app analytics identity | Consent-enabled release clients; fallback is service aggregate with no Person |
| Traces/sessions | Per-dispatch random trace UUID; opaque deterministic conversation UUID | Updated Hermes adapter; metadata only goes to the exact included-service endpoints |

`$ai_generation` events create PostHog pseudo-traces automatically. Background jobs do not claim a conversation session. The old `model_usage` event remains for existing dashboards and budget reporting, with `generation_id` linking it to a generation. **Do not sum costs across both event types.** Reservations retained after unavailable usage are only in the budget/custom usage event, not AI measured costs.

Delivery is best-effort through `waitUntil`, with a 3-second timeout and one transient retry using the same event UUID. Stream bytes and backpressure are preserved; telemetry does not wait on the critical inference path. No prompts, completions, private source bodies, tool arguments, provider error messages or raw session names are uploaded. Cloudflare Gateway content logging stays disabled.

Verification: `node scripts/model-worker-check.ts` covers stream fragmentation, cancellation, errors, incomplete/oversized frames, HTTP retries, cached costs, identity, missing usage and separate event UUIDs. `scripts/person-analytics-check.py` verifies per-turn/session headers, opt-out and third-party endpoint isolation. Worker deployment enables generations for existing clients; per-turn/session grouping needs the updated app runtime. BYOK/subscription-provider generation traces and tool-execution spans are not yet instrumented and must not be inferred from included-service totals.

Schema reference: [PostHog manual AI capture](https://posthog.com/docs/ai-observability/installation/manual-capture).

Live acceptance on 2026-09-26: both Worker environments deployed and health returned configured=true. A synthetic **development** Qwen request appeared in PostHog AI Observability Generations under trace `fb9ad174-fc15-4f7e-9d5b-00b9b4fdf07c`: 20 input / 32 output tokens, 1.05 seconds, USD 0.000011738 (UI rounds to 0.000012). The subsequent deployed-parser checks verified Qwen 15/32 and DeepSeek 12/32 with completed SSE streams. Workers AI attaches per-chunk token deltas; only the separate final usage frame is trusted, so interruption before totals remains unmeasured. No user content or fabricated production Person was used.

## Coverage audit (2026-09-26)

The live production sample contained 10 `$ai_generation` events, all marked `workload=background`, while `fox_turn_completed` was empty. This is not evidence of ten missing Fox replies: background generation and user conversation have different units. The inspected recent `app_active` records came from Mac Builds 1054 (schema 2) and 1057 (schema 3); historical events without an environment/build remain unclassified. No historical user actions were synthesized.

Fox turn measurement now surrounds the visible conversation dispatch, before model preparation and direct coding-session routing. It records one started/outcome pair for a user request, including preparation failures and routed replies. Raw `agentChat` calls no longer emit another pair; invitation greetings and practice remain excluded. Background model generations stay in AI Observability. Supplementary input steering an existing turn is not a new completed turn.

Onboarding is recorded only when its real setup surface appears. Returning users do not emit a fictional setup sequence. Resuming with Google already connected emits `onboarding_started` and `onboarding_apps_viewed` but does not fabricate `google_connect_completed`. The Main dashboard's strict Google-sign-in funnel therefore measures fresh authorization paths; use the setup-only funnel described above for resumed setup.

Regression coverage: `scripts/companion-main-session-check.ts` exercises actual Fox UI dispatch with preparation failure and a direct coding-session reply; `scripts/product-analytics-check.ts` checks success/failure/cancellation, private-payload exclusion and no double counting. `scripts/startup-setup-check.ts` runs the bundled UI through cancelled/retried sign-in, resumed selection, world entry and existing-user bypass, asserting telemetry along the way. All use mock hosts, without sending production analytics. Native release delivery and future real new-user conversion remain separate acceptance steps.

## Additional client coverage (schema 4, pending release)

| Signal | Meaning | Limits |
| --- | --- | --- |
| `applet_opened` + `applet` | Enter a catalog Applet | Restore/sample excluded; custom IDs map to other |
| `content_opened` + `applet` | Open an original-record reader | Includes Fox navigation and reopen/retry; does not prove reading or a successful load |
| `content_read_*` + `operation` | Source list, original or Notion fetch outcome | Background/cache reads remain included; never use as a human-read count |
| `item_update_*` + `item_status` | Open/done/dismissed/snoozed transitions | Requested status plus operation outcome; no private item ID |
| `source_connect_*`, `source_disconnect_*` | Non-Google connection and source disconnect outcomes | Google keeps existing events; starts are attempts, not grants |
| `world_tool_*` + `tool_category` | Shared UI World-tool execution started/completed/failed/cancelled | Not Hermes-internal/MCP tool spans; completion is the returned tool outcome, not verified external task completion |

Tool categories are reading, navigation, browser and other. The host independently allowlists event names and dimension values (`safeDimensions`); arbitrary titles, arguments, identifiers, URLs and error text cannot pass through these fields. Events retain existing account attribution, release-only/sample filtering and privacy controls. No additional credentials or plugin are needed.

These additions require a new client release. Included-model generations already report through the service. Hermes Desktop currently returns timing but no standardized provider token totals in its final response, so BYOK/subscription token totals remain unknown; subscription usage must not be billed as an invented API dollar cost. This patch does not claim those missing measurements or fabricate historical events.

Validation: product outcome fixtures, real bundled Fox-dispatch fixture, onboarding browser fixture, TypeScript checks and native UI build passed. On the retired native Mac host, analytics compiled in release mode and its dimension filtering was executed against allowed/private/malformed inputs. The Electron allowlist has no dedicated check yet and still needs device acceptance.

### Confirmed external outcomes

`external_outcome_confirmed` is separate from tool-call completion:

| `outcome_type` | Evidence |
| --- | --- |
| `email_delivery` | Mail send/reconcile returns `sent` |
| `notion_content` | Expected content is read back from Notion |
| `browser_user_confirmation` | User confirms the inspected browser result; not merchant/API verification |

The shared UI hashes a local review/receipt ID with the outcome type into `outcome_key`. The host allows only a 64-character hex key and known outcome types. A durable host marker deduplicates repeat checks; pending capture retries retain their event UUID. No destination, URL, draft, page text or error message is sent by these events. Practice, development and opt-out retain their existing exclusion rules.

Production acceptance remains pending: on 26 September the PostHog connector required reauthentication. Validate receipt deduplication, release/channel attribution and opt-out with actual release events after reconnecting. Code/fixture acceptance is not production ingestion acceptance.

## Main dashboard inventory

The daily product overview is [Worldlet · Main](https://us.posthog.com/project/625931/dashboard/2132777), in PostHog project 625931. It reuses the former Product Overview dashboard rather than creating another competing overview.

Saved defaults: **last 30 days**, event property **environment = production**. Development smoke tests and older events without this property are excluded. These defaults were reloaded and verified in the browser on 2026-09-26.

| Area | Insight | ID |
| --- | --- | --- |
| Activity | Daily active identities | `zeKoCKbD` |
| Acquisition | First-seen identities, not installations/downloads | `tBxdZA0K` |
| Retention | Return after first activity | `06QxaTbb` |
| Activation | Google sign-in to World, sequential 7-day conversion window | `mKJ09jjF` |
| Usage | Fox replies, content reads, item updates, Applet openings | `hSCJdtRs` |
| Reliability | Fox failures, Google failures, model rate/allowance rejections | `P2zxE87O` |
| AI | Generation calls by workload | `dkNEsuo7` |
| AI | Total measured cost in USD | `Hjr9MAKB` |
| AI | Cost by model | `c03Xg5Vb` |
| AI | Generation latency by model, median | `XQKc6bwn` |
| AI | Failed generations | `xHm52etG` |
| AI | Input, output and cached-input tokens | `xLYd1s8x` |

The redundant 7-day activity tile was removed from Main; its underlying saved insight remains available. A “How to read Main” card records the limitations below.

### Interpretation

- Active identities include signed-in accounts and anonymous users. First-seen activity is not new installations; ordinary updates preserve identity. See [identity rules](ANALYTICS.md).
- The onboarding funnel is `onboarding_started → google_connect_completed → onboarding_apps_viewed → onboarding_completed → world_entered`. It requires newer clients. Empty results are missing matching events, not a verified historical zero conversion rate.
- Usage and failure charts count events, not people or failure percentages. A completed Fox reply does not prove a real-world task was completed. Content reads may include background activity.
- AI charts use `$ai_generation` only. Do not add `model_usage` costs to these totals. Cached input is already included in input tokens.
- Measured AI costs exclude unknown usage, retained budget reservations and user-owned provider/subscription costs. AI generation history begins with instrumentation deployment on September 26; it is not backfilled.
- Recent retention cohorts are incomplete. Do not treat future cohort days as measured churn.

The dashboard was configured through the authenticated PostHog web UI. Product data collection does not depend on a Codex connector. No test production events or Persons were created for dashboard setup.
