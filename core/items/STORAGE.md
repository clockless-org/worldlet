# World-owned storage

Chapters:
- [World, Fox and Hermes: interaction and persistent items](#world-interaction)
- [World tools](#world-tools)


The upper three layers own product logic and durable user data. Organize data by **business domain**, not by Agent, Harness, model, or the Applet displaying it. Layer 02 defines rules and portable shapes; layer 03 performs local persistence. Harnesses execute requests and contribute results through contracts.

## One durable copy, several appropriate formats

SQLite is the business database. JSON is appropriate for small configuration and portable archives; original content and attachments remain files. Replacing a Harness must not require rebuilding Attention, user decisions, source checks, identity, or visible conversations from its transcripts.

| Domain | Current World-owned storage | Responsibility |
| --- | --- | --- |
| Attention | `world.sqlite`: `state.items`, `state.reviews` | Model-processed Title, Reason, Summary, time/place, source references, user decisions |
| Source collection | `state.checks`, `state.attention-context` | Check settings/cursors; bounded, expiring source facts |
| Execution | `state.runs`, `state.attention-budget` | Check outcomes, synthesis acknowledgements and budgets |
| History | Non-`state.*` rows in `entries` | Local product events and references |
| Companion | `world.sqlite`: `companion_profile` per scope (`private`, `setup`, `sample`): `profile` (identity, personality, memory checkpoint in the portable `worldlet.companion` shape), `memory-edits`, `session` | Who Fox is and what it remembers; earlier `companion/profile.json`, `memory-edits.json` and `imported.json` move in once. A companion import keeps the previous one as `companion-before-import-<id>.json` |
| Conversations | `world.sqlite`: `companion_turns` (source `fox` or the Agent it was brought from; `thread` the context it was said in), `companion_notes`; derived trigram search index | Fox's visible conversation and every brought one in one format; an Agent's own notes. One Harness session covers the whole World, so each turn keeps its thread: for Fox the place and view it was asked from (the chat's context key, `''` for turns from before), for a brought turn its own conversation. Search: Fox's own first, then brought, newest first. The index is left out of backups and rebuilt when missing. Earlier `companion/history/*.json` and `companion/<agent>/*.json` move in once and stay as `*.before-database` |
| Website recordings | `world.sqlite` tables `web_visits` (one stay on one site) and `web_records` (page text, typing, clicks, network bodies, WebSocket and event-stream messages); derived trigram search index | What happened in the built-in browser, for Fox to find and analyse ([website recording](../../contracts/README.md#website-recording-for-fox)). Raw network records leave after 30 days or past 2 GB; text and interactions stay until deleted |
| Chat by place | `world.sqlite`: `companion_cards` (one card per turn: question, steps, answer, tagged with its thread), `companion_views` (each place's last reply) | What Fox's chat shows place by place; earlier `conversation-recall.json` moves in once and stays as `*.before-database` |
| Browsing history | `world.sqlite`: `browser_visits` | Pages visited inside Worldlet (bounded by Core); earlier `browser-history.json` moves in once |
| Brought Agents | `world.sqlite`: `brought_skills` (Markdown files by Agent and folder), `brought_routines` | Another Agent's skills and routines, copied into the Harness ([details](../agent/PORTABILITY.md#bringing-the-rest-of-a-local-agent)); earlier `companion/brought/<agent>.json` moves in once |
| World configuration | `world.sqlite` `world_settings` (`configuration`: the library state, earlier `index.json`; `overlay`: the page's layout edits, `environment`: weather; earlier `overlay.json` and `environment.json` move in once) | Connections, onboarding, user layout and environment; Sources/Knowledge arrays are empty compatibility fields. An `index.json` found beside the database (an older backup brought it back) is the newer copy and moves in again. A library whose `world.sqlite` is gone opens read-only |
| Sources | SQLite `sources` table plus immutable `sources/` files | Source metadata, ID, version and original-file reference |
| Knowledge | SQLite `knowledge` table | Validated merged results, linked to source ID/version and processing version |
| Derived cache | `cache/knowledge/`; legacy `knowledge/` remains readable | Disposable per-chunk analysis; never the authority for formal Knowledge |
| Made games | `world.sqlite`: `made_games` (record and page), `made_game_versions`; earlier `games/<id>/` moves in once | Games the [Game Factory](../games/README.md) made: the page, its title, the person's words, versions and best score |
| Moment Applets | `world.sqlite` table `widgets`: record, page and state per made Applet | Applets Fox made for one moment ([Moment Applets](../widgets/README.md)): title, end, pin, the person's words, the page and what was ticked, merged with the phone |
| Artifacts | `world.sqlite` table `artifacts`: one record per artifact | Every card Fox showed ([Artifacts](../artifacts/README.md)): an Attention card's title, category and summary (its World item stays the truth), and each explanation Fox showed in conversation with its Markdown, chart and size |
| Ongoing things | `world.sqlite` table `ongoing`: one record per thing | Brought conversations Fox proposed or the person made into Applets ([Ongoing things](../ongoing/README.md)): the conversation's name, the person's answer and its counts; the conversation itself stays in `companion_turns` |
| Execution journal | `world.sqlite`: history rows in `entries` and their payloads in `execution_payloads` (keyed by the id in the `execution/<id>.json` reference the event keeps); earlier `execution/` files move in once | Each Agent run, tool call and result, redacted by Core. Streamed text is saved at least once a second, so a crash loses at most the last second of a reply |
| Email drafts | `world.sqlite`: `mail_reviews`; earlier `mail/reviews.json` moves in once | [Saved email reviews](#saved-email-reviews) |
| Codex coding tasks | `world.sqlite`: `coding_tasks` (record and the files it made); earlier `agent/private/codex/<id>/task.json` moves in once | Code Fox delegated to Codex. The task folder's `files/` is the copy Show in Finder opens, written again from the database when missing |
| Orders | `world.sqlite`: `orders` | Every task sent with Order (Alpha and Dev): the words, the place, and whether Gatehouse and the project got it. The pictures go only to Gatehouse |
| YouTube queue | `world.sqlite` `world_settings` 'youtube'; earlier `youtube.json` moves in once | The YouTube Applet's queue and position (the practice world keeps `youtube-sample.json`) |
| World preferences | `world.sqlite` `world_settings` 'preferences' (`platform/electron/src/preferences.ts`); earlier values in `preferences.json` move in once | Fox's name, style and look, spoken replies and voice, text size, Attention focus, the World's sound and podcast places |
| Fox's setup choices | `world.sqlite` `agent_settings` (`local-harness`, `adopted-agent`, `model-source`, `energy`) | Which local Harness or Agent setup chose, whether Fox's model is the person's own Codex sign-in, the free-charge fallback. They follow the person, backups included (`platform/electron/src/store/agent-settings.ts`); earlier `agent/<name>.json` move in once |
| Host preferences | `preferences.json` (installation-level) | What belongs to this computer: practice mode, volumes, update channel, Open at Login, analytics identity. Never in World backups |
| Built-in content | Bundled `resources/worlds/` and `resources/styles/` | Shipped scenes and artwork, not personal records |

Everything that moved into the database stays beside it as `<name>.before-database` as a safety copy and is removed a month after the move (`platform/electron/src/store/leftovers.ts`).

**Moving to another computer** (owner decision 2026-10-05: "如果换台机器，要能够完全还原"). Everything that happens in the World is recorded in `world.sqlite`, and a World backup restored into a fresh profile on another computer brings it all back: conversations, items, Applets, games, drafts, settings, history and recordings. Only what belongs to a computer or an account stays behind: sign-ins kept in the system keychain (`vault.json`) and website sign-ins (`Browser/`), which the restored World asks for again; this computer's own preferences; logs and diagnostics; caches that are rebuilt; and the installation folders. The practice and setup worlds have their own databases and do not travel. Hermes's own records (its `state.db` and sessions) are not needed to restore the World. `npm run test:electron -- shell/restore` (`platform/electron/src/modules/shell/restore/check.ts`, part of every host's RC) makes a lived-in World, backs it up, restores it into a fresh profile and compares every table, original and World preference.

Connected providers remain the authority for remote originals. A bounded source context cache is not a full email/calendar mirror. Private/setup/practice scopes remain separate. Credentials and permissions are separate from portable content; changing a Harness does not grant account access.

Local deletion is separate from disconnecting an account and from resetting Fox.
The shared `localDataDeletion` host capability gates the HUD and source controls.
One rule, `core/items/local-deletion.ts`, decides every deletion: deleting one provider's data,
one saved item, or all saved World content. `localDeletionRequest` validates the request, words
the confirmation and names the scoped buckets; `localDeletionSources` names the library sources
of a provider (by origin or by a connection of that provider); `localDeletionRecord` decides,
for each stored record, whether it stays, is trimmed or is removed. The Electron host confirms
in a native dialog (`platform/electron/src/modules/sources/local.ts`; single-item deletion
from the World needs no dialog), then `WorldStore.deleteLocalContent` and
`WorldLedger.deleteLocalContent` apply the rule in one transaction: every revision of every
scoped bucket, not only the current one; running and queued runtime work of the affected
owners is invalidated; the trimmed library is saved; and the library-relative directories to
remove (the World layout, per-source copies and caches) are recorded as a pending
`local-deletion-files` row. The files are removed after the commit, and a removal that fails or
is interrupted stays recorded and is retried when the ledger next opens.

Mixed-source items retain their other evidence. Connections, preferences, companion
memory/conversations and product event history remain; external originals are never deleted.
`node scripts/local-deletion-check.ts` checks the Core rule with synthetic data, and
`npm run test:electron -- module:store` checks provider, single-item and all-content deletion
on a disposable library, including a restart with pending file cleanup. Device acceptance of
the dialog remains pending.

## SQLite: entries plus domain views

The history/state ledger table is named `entries`, not `interest`. Formal library records have dedicated `sources` and `knowledge` tables. It contains `seq`, `at`, `kind`, `key`, and JSON `body`. State revisions use `state.<bucket>`; the highest sequence for a `(kind,key)` is the current value. Ordinary updates preserve prior revisions; explicit deletion and replacement of expiring context remove the corresponding rows. Execution bookkeeping is bounded instead: each finished source check keeps only the current revision of every `state.checks` and `state.runs` row, and each provider keeps its newest 100 run receipts (a still-running receipt is never removed). Items, reviews and product history are unaffected.

Read-only views make the business domains explicit without creating a second mutable copy:

| View | Content |
| --- | --- |
| `world_state` | Latest state per bucket/key, including future buckets |
| `attention_items`, `attention_reviews` | Current Attention and review records |
| `attention_context`, `attention_budget` | Current source facts and synthesis bookkeeping |
| `source_checks`, `execution_runs` | Collection rules and execution results |
| `world_history` | Product events, excluding state revisions |

The shared definition is [`contracts/storage/world-views.sql`](../../contracts/storage/world-views.sql), generated into `contracts/storage/world-views.ts` by `node scripts/world-storage-schema.ts` and imported by the host's SQLite ledger (`platform/electron/src/store/ledger.ts`). Views and library tables are added when opening a writable database; existing schema-v3 backups remain compatible. `sources` indexes stable ID/revision; `knowledge` links to its source with a foreign key and records source/processing versions. JSON bodies retain the portable record fields. `library_meta` records completion of the one-time migration.

### Library migration and incremental updates

On first open, the host commits legacy Sources/Knowledge into SQLite in one transaction. It then hydrates the in-memory application state from SQLite and writes a compact configuration with `libraryStorageVersion: 1` and empty compatibility arrays. The database marker prevents importing stale JSON again after a crash between the DB commit and configuration replacement. A migrated configuration without its database/marker is rejected, never opened as an empty writable library. Failed transactions preserve previous rows.

Only changed records are upserted; unchanged saves add no history. Each mutation and its `library.saved`/`library.deleted` metadata event commit together. The journal contains IDs/versions, not duplicated original text or Knowledge bodies. The formal database is authoritative; in-memory arrays remain the existing UI interface. Source version changes invalidate dependent local Attention without changing its ID or user dismissal status; outdated Knowledge is removed by source update paths. Existing processing skips unchanged source/processing versions, with per-chunk cache reuse for interrupted work. No new model call is introduced by migration.

Original paths keep the Mac host's layout (`sources/<id>/<revision>.json`); the database keeps the file reference. Backup includes the database and originals, and validates the library before restore. A backup is one SQLite file (format 2: a `files` manifest with each file's size and SHA-256, and the files in 16 MB `chunks`), so a World of any size up to 64 GB travels; it is staged on disk while it is made or checked, never held in memory. The Mac `WorldBackup.Archive` JSON (format 1, at most 120 MB) still restores, and its World preferences go into the restored database; reset includes the new original files. Old backups without a library marker are migrated on open. New chunk caches are excluded from portable backup and can be regenerated. Clearing source content also clears its cache; deleting a source does not leave formal Knowledge behind.

## Durable memory and replaceable execution

The adapter contract includes `checkpointCompanion`. The Hermes implementation reads its durable soul/user/long-term memory into the World-owned companion profile when the private archive is accessed, including before a chat, after a recorded reply, and before companion/World backup export. These reads require no model call.

Hermes remains the live memory writer while selected. `memoryAuthority` identifies that writer; it does **not** mean the only copy lives in the runtime. World saves the complete supported memory records, not prompt excerpts. The replacement external adapter can use the saved checkpoint in its bounded prompt, paged recall and portable export without opening Hermes. Hermes itself does not receive duplicate prompt injection. Reads fail atomically: invalid/oversized memory keeps the previous saved copy and the next archive access retries. Missing runtime/files preserve their last saved records; a valid empty memory file clears that kind. Setup and practice never checkpoint private memory.

This is a durable checkpoint, not a live synchronization service for arbitrary third-party memory stores. New adapters with their own memory must implement conversion/checkpointing; unknown `adapter:*` authorities still require explicit transfer. Updates made outside World after the last checkpoint are not guaranteed to be captured. Importing World-owned memory into Hermes remains the existing explicit import operation, with runtime shutdown and rollback; shared attached profiles are never overwritten automatically. Internal reasoning, token caches and runtime tool transcripts are disposable execution data, not World records.

## Physical locations and preservation

The library root comes from `platform/electron/src/profile.ts`. The release library is `Worldlet/`, main development uses `Worldlet Development/`, and linked worktrees use `Worldlet Worktrees/<profile>/`, under `~/Library/Application Support/` on Mac, `%LOCALAPPDATA%\` on Windows and `$XDG_DATA_HOME` (default `~/.local/share/`) on Linux. `WORLDLET_PROFILE_ROOT` overrides the root for development runs only. All table/file paths above are relative to that root. The format is the Mac host's on every OS (`world.sqlite`, earlier `index.json`, `sources/<id>/<revision>.json`, `companion/…`, `agent/<scope>/hermes`), so an installed Mac library opens unchanged.

Everything Worldlet keeps on the computer is in that one folder; the installed app itself is separate (`/Applications/Worldlet.app` on Mac, `%LOCALAPPDATA%\Programs\Worldlet` on Windows). Installation-level files sit beside the World data and are excluded from World backups (`platform/electron/src/modules/shell/backup.ts`):

| File | Content |
| --- | --- |
| `preferences.json` | This computer's preferences: practice mode, volumes, update channel, Open at Login and analytics (`platform/electron/src/preferences.ts`); the World's own preferences are in `world.sqlite`. The Mac host's `worldlet.*` UserDefaults and analytics identity are imported once, the first time the file is created. |
| `vault.json` | Small credentials (CLI grants, client secrets) encrypted with Electron `safeStorage` (Keychain-backed key on Mac, DPAPI on Windows, libsecret on Linux); owner-only, deleted by reset (`platform/electron/src/vault.ts`). |
| `Browser/Electron/` | Chromium data. Website sessions live in `Browser/Electron/Partitions`: `persist:website` (personal) and `persist:website-practice` (practice). |
| `Browser/CEF/` | The CEF website engine's cache and website sign-ins (`platform/electron/src/modules/browser/engine/process.ts`). |
| `logs/` | Owner-only diagnostics and Fox timing logs, each rotated once past 1 MB. |
| `updates/` | Mac update downloads and the staged app. |
| `runtime/` | Fox's Hermes program: Python, its packages and the uv cache (`agent-runtime/installation.ts`). Windows `runtime/hermes-<digest>/`, Mac and Linux `runtime/<revision>-<digest>/`. |
| `speech/` | Local dictation packages and the Whisper model (`media/speech.ts`), created the first time someone speaks to Fox. |
| `model-access/` | This installation's anonymous model-service token (`agent-runtime/model-access.ts`): an owner-only file on Mac and Linux, DPAPI-encrypted on Windows. |

`runtime/`, `speech/` and `model-access/` belong to the installation (`INSTALLATION_FOLDERS` in `platform/electron/src/files.ts`): Reset keeps them, and backups neither carry nor replace them. A release on Mac and Linux takes them from its own library (`installationRoot`), even when an RC check opens a disposable one. Until 2026-10-04 the Mac kept them beside the library in `Worldlet Runtime`, `Worldlet Speech` and `Worldlet Model Access`, and Windows kept its token in `Worldlet Model Access`. On first use the token and the speech folder move in. The runtime's virtual environment records absolute paths, so it is installed again in `runtime/`, reusing the old uv download cache, and the old folder is removed once the new runtime is ready. `scripts/installation-folders-check.ts` checks this on the release layout.

Migration limits from the native hosts: Windows `world.json` libraries are not migrated automatically. Keychain items of the native Mac host are not readable, so Stripe and YouTube CLI grants ask to reconnect. Folder, Obsidian vault and Voice Memos folder grants were security-scoped bookmarks and must be chosen again; the Electron host stores the chosen path. CEF website sign-ins do not carry over, so people sign in to websites again.

Do not copy personal libraries or credentials into development worktrees. Back up SQLite with its snapshot API (`VACUUM INTO`) rather than copying a live WAL database file. World backup includes supported configuration/content and companion files; it deliberately excludes credentials and requires renewed account authorization after restore.

Verification: `python3 scripts/world-storage-check.py` checks domain separation, revisions, deletion and idempotent view creation in disposable SQLite. The native legacy-migration fixture (`scripts/library-storage-check.py`) and the companion checkpoint fixtures in `scripts/shared-core-native-check.py` retired with #996 and are not yet ported to Electron. These do not contact real accounts or establish third-party adapter acceptance.

## Saved email reviews

The host stores at most 20 immutable reviewed drafts in the World's database (`mail_reviews` in `world.sqlite`; before 2026-10-05 `mail/reviews.json`, which moves in once), scoped to the Agent home that prepared them, named inside the library so the scope still matches on another computer. An attempted-send marker is written before dispatch; confirmation remains until the UI acknowledges it. Mail → Saved drafts opens the review in Fox after restart. An attempted draft offers delivery checking, never another Send. Corrupt or unsupported storage fails without replacing the drafts. Removing a saved review cannot recall a sent email; delivery receipts remain for duplicate protection. Clearing Gmail data or all saved content deletes the reviews.

Reviews travel with World backups. The send receipts that stop a duplicate send (`runtime-operations`) are in the same database, so a restored draft always arrives with its receipt, and a draft whose send was attempted only checks delivery. The Electron host (`platform/electron/src/modules/sources/reviews.ts`) is the same on every OS; the retired Windows host's DPAPI-encrypted `mail/reviews.dpapi` is not read. Sending still needs the Google grant, which a restored World asks for again.

Offline acceptance: `node scripts/mail-review-recovery-check.ts` checks restored drafts cannot resend. The Swift store fixture (restart, attempt/confirmation state, backend isolation, cancellation/acknowledgement, limits, permissions, corrupt-file preservation) and the native `--world-tools-check` review cases retired with #996 and are not yet ported to Electron. These checks are not live Gmail or visual packaged-app acceptance.

## Source deletion and session-only Applet content

Deleting provider data also clears that provider’s temporary Applet inventory, originals and activity. Clearing saved world content clears all such caches, including accumulated foreground Mail pages. Grants remain connected; a subsequent explicit read can retrieve the source again. Per-provider and global content revisions reject Applet reads that began before deletion, including Notion and local Apple refreshes. Reauthorization and disconnection invalidate the same session caches. Deleting a provider or a local source also removes its evidence from ledger history: surviving items' past `state.items` revisions, their `attention-backup` copies and `reviews` rows are rewritten without that source's links and quotes, and a revision left with nothing else is deleted. This is source-content deletion, not companion-memory forgetting: checkpoint, conversation and Harness-memory deletion needs its own explicit lifecycle.

Acceptance: on the retired native Mac host, `--attention-center-check` and `--world-interaction-check` verified with fictional data that forgotten provider and local-source quotes leave no past item, backup or review revision while other evidence stays, covering provider isolation, retained connection configuration, late Calendar/Notion replies after deletion, fresh reads and Mail accumulation after clearing. On Electron, the store check covers the ledger side (every revision of items, backups and reviews; retained connections); the Applet-session and late-reply cases are not yet ported, and none establishes deletion across every Agent memory/transcript.

Backup validation (`platform/electron/src/modules/shell/backup.ts`) also checks each source ID and blob reference, read from SQLite for migrated libraries or the index for legacy backups: the original must be present inside that source’s archived directory and decode as an Original. Duplicate IDs, traversal and missing originals reject the archive before replacement. Direct original reads resolve filesystem links and reject targets outside the source directory. The native `--feature-audit-check` for hostile references, symlink escape and readable originals before/after restore is not yet ported to Electron.

## Portability boundaries checked on 26 Sep 2026

| Artifact | Current contract | Not established |
| --- | --- | --- |
| Companion archive | Supported identity, personality, memory and visible-history archive import/export with validation | Unknown Agent/schema conversion and general private runtime migration |
| World backup | The Mac host's archive format (version 1, SQLite with the configuration made portable, and allowed original files; older backups carry `index.json`), written and restored by the Electron host on every OS | Device acceptance on each OS |
| Retired Windows backup | `worldlet.windows.backup` version 1, `world.json`, SQLite and its allowed files | Import into the Electron host; not supported |
| Task continuity | Local item ID, normalized current evidence and retained identity hashes | Universal cross-host historical identity matching |

The retired Mac and Windows hosts derived different evidence hashes: Mac applied case-insensitive folding, while Windows applied uppercase normalization, and their serialization differed. The Electron host reproduces the Mac encoding byte for byte (`WorldLedger.identity` in `platform/electron/src/store/ledger.ts`, `store/swift-json.ts`), so Mac libraries keep their identities and Windows-derived hashes do not match. A source-derived ASCII fixture for provider `gmail`, kind `task`, source `thread:fixture`, quote `Please reply` produces different hashes. This is a code-level comparison, not a Windows runtime test. Recomputing the current record's identity lets a host retain that record's saved ID, but an older hash-only alias cannot be translated without its original evidence.

Before offering migration of Windows libraries, define one canonical identity encoding (normalization, alias source IDs, sort order and byte serialization) in shared Core, test golden vectors, and convert history-derived aliases while retaining existing IDs and decisions. The ledger retains historical `state.items` bodies, except that a forgotten provider or local source is removed from history as well (see Source deletion above); its public history API excludes those state records, so a migration must deliberately read validated item revisions rather than use the general conversation/event history endpoint. Missing historical evidence must remain an explicit migration limitation, never a guess that work was completed. This audit does not change archive formats or claim cross-platform import support.

## World history

The local `world.sqlite` journal keeps the existing single `entries` table:
`seq`, `at`, `kind`, `key`, and JSON `body`. No new table or columns are needed.
Automatic 40,000-row trimming is removed. This also protects older current-state
rows from falling out of the journal. Explicit user deletion/reset remains available;
previously trimmed history cannot be recovered by this change.

### Events

- Existing host bridge actions are requests, not proof of successful execution.
  Their identifier-only payload remains allowlisted; credentials and source bodies
  are not copied into history. History polling itself is excluded.
- `conversation.message` is appended after a personal companion turn is saved. It
  carries actor, message ID, session key and at most 240 characters of preview;
  the full message remains in the companion archive. Sample/setup conversations
  do not enter personal history. These events are excluded from automatic recent
  history context, since the conversation already supplies them.
- `applet.activity` records the outcome of validated shared World source-result,
  findings, review, update, archive, check-configuration and meeting-decision tools.
  Body contains operation, outcome, run reference and optional record count, not
  mail content. A read means records were read, not that a reply was sent.
- `applet.check` records background-check start and final completion/error. Legacy
  events are not retroactively promoted to successful outcomes. This is not an
  exhaustive operating-system activity log or capture of all external Agent tools.
- `applet.task` records a task Fox handed to an Applet starting and ending (complete,
  failed or cancelled), keyed by the Applet. The task's words and result stay in Fox's
  conversation, not here.

### Identity and durability (v1)

- Identity is `(kind, key, body.id)` (`worldHistoryIdentityVersion = 1`). Every
  history producer appends through `WorldLedger.append`, which runs the shared Core
  `worldEventAppend` operation. That operation skips an identity that is already
  stored, so a retried append is a no-op. Only `state.*` revisions and the
  transactional `library.*` metadata journal use the raw `record` insert.
  Content never defines identity: two events with equal bodies and distinct ids
  are both kept. The non-unique `entries_event_identity` index serves the lookup.
- `at` is the original event time. `body.observedAt` is when this device saved the
  row. `seq` orders only this device's ledger; it is not a global order.
- Legacy rows written before v1 stay unchanged. They may lack an id or
  `observedAt`, or repeat an id; the page marks them `legacy: true` and uses
  `legacy:<seq>` as their id. New appends do not dedupe against them.
- Run and task state commit in the same transaction as their event. The execution
  payload file is written first and removed if the commit fails; a crash between
  them leaves an unreferenced file, never an event pointing at nothing.
- Stream text is buffered and flushed on each non-delta event and on the terminal
  event. A killed process loses the unflushed text; this is not lossless. On the
  next start, runtime-task recovery settles runs that were still running as
  `task.interrupted` (`process_interrupted`) with deterministic id
  `<runId>:interrupted`. The page labels such rows with a `gap`, and recovery does
  not replay external writes.
- Sample, setup and private conversations use separate ledgers, so identities
  never cross scopes.
- A best-effort history save that fails never fails the action it describes. The
  Electron host reports it to `logs/diagnostics.jsonl` as operation
  `worldHistory:<kind>` (`WorldStore.historyFailure`) instead of dropping it silently.

### Producer coverage (Electron)

| Producer | Persisted `kind` / key / id | Query and UI consumers |
| --- | --- | --- |
| Page bridge actions (`WorldStore.recordWorldAction`) | `world.action`; key Applet ID; id from the request ID and phase | History page, `read_world_history`, Fox recent context |
| User UI and browser navigation/lifecycle (`ActivityRecorder`) | `activity` kinds such as `ui.click`, `ui.submit`, page observations; key surface ID; Core-assigned id, batched in one transaction | History page, `visitId`/`surfaceId` filters; excluded from Fox recent context |
| Personal companion turns (`fox/companion.ts`) | `conversation.message`; key session; id message ID | History page; excluded from Fox recent context |
| Fox World tool outcomes (`attention/tools.ts`) | `applet.activity`; key provider; a new id per outcome (complete, failed, cancelled), item reference as `targetId` | History page, `runId` filter, Fox recent context |
| Background checks (`attention/center.ts`) | `applet.check`; key provider; ids `<runId>:started` and `<runId>:finished` | History page, `runId` filter |
| Applet tasks (`fox/index.ts`) | `applet.task`; key Applet; ids `<taskId>:started` and `<taskId>:finished` (status complete, failed or cancelled; no task text) | World log, History page |
| Attention synthesis (`attention/center.ts`) | `attention.synthesis`; key `center`; id `<runId>:finished` | History page, `runId` filter |
| Runtime tasks and execution journal | `task.*`, run events, `<runId>:interrupted`; appended in the run's transaction | History page with `taskId`/`runId` filters and gap labels |

Known gaps: `library.*` metadata rows have no event id and are shown as legacy
records. A revision-based id would merge a legitimate save, delete and re-save of
the same revision, so they stay unchanged. Repeated tool calls are separate
events and are not merged. Not covered: tools inside Hermes or other external
Agents, monitoring outside Worldlet's own surfaces, a cross-device order and
lossless capture. Device/capture acceptance belongs to #690, and installation and
account acceptance belong to #1021.

Privacy and deletion: Core decides which fields are kept (`contracts/world-event-policy.json`
and the activity redaction). Sample and setup content stays out of personal history.
Deleting a provider or local source rewrites its `state.*` evidence (see Source
deletion). Event rows keep only allowlisted identifiers and statuses, and
conversation previews follow the conversation lifecycle, so source deletion does
not remove them.

### Companion UI

History is the final full-width tab after Profile, Abilities, Applets and Feedback.
It shows exact local dates/times, plain-text previews and explicit outcome labels.
Each row identifies its source with an existing Applet device image (or semantic
fallback icon), a user symbol or Fox portrait. Source names remain accessible text.
New rows enter with brief staggered motion and shift existing rows down without
rebuilding them; reduced motion disables the animation. There is no fake activity
or idle marquee. The Latest control stays above the feed while browsing old rows.
The trusted host `worldHistory` read returns 50 entries per page with sequence
cursors (not offsets). State snapshots stay out of the display. Sample mode does
not expose the personal history.

While the panel is open and the document visible, it polls every two seconds.
Older-page reading is preserved; new activity enables a Latest button instead of
moving the reader. Closing stops polling and invalidates in-flight responses.
Only one page is rendered, independently of database size. Failed refreshes keep
the existing rows and offer retry. Storage has no automatic count/age cap, but
disk space is finite; the journal remains best-effort and does not fail user work.



Focused checks: `scripts/world-history-query-check.ts` and `scripts/world-history-ui-check.ts` verify cursor paging, safe rendering, restart and dismissal with fictional records. `scripts/world-history-durability-check.ts` covers duplicate appends, payload/commit crashes, truncated streams, failed writes, state rollback, restart paging, legacy rows and scope isolation. `npm run test:electron -- module:store` checks that the Electron producers above ignore retried ids, keep distinct outcomes, report failed saves and survive a restart without legacy rows.

<a id="world-interaction"></a>
## World, Fox and Hermes: interaction and persistent items

Presentation follows [Peek → Open → Focus](../../ui/components/INTERACTION.md#applet-presentation).
Worldlet owns durable source, item and event records; Fox is the conversational
entry point. The selected Harness owns execution through the negotiated contract.
Portable companion identity and memory checkpoints remain Worldlet-owned; live
backend memory is distinct. See [Agent portability](../agent/PORTABILITY.md).

The storage sections above own schema, history retention and profile paths. Source
collection is model-independent; isolated analysis and Attention synthesis use the
selected model. Original snapshots and extracted items are different records;
source reads must not silently become conversation memory or item completion.

### Tool contract

| Tool | Behavior |
| --- | --- |
| `read_world_source` | Read a connected source; returns bounded records and stages this turn's evidence |
| `query_world_items` | Query persistent items and check schedules |
| `upsert_world_items` | After a read, add or update grounded items; an empty array means nothing important was found |
| `review_world_item` | Reassess an item against this turn's originals as actionable / resolved / uncertain; user done or dismissed states are preserved |
| `update_world_item` | Set local status at the user's request; never modifies the remote task |
| `archive_world_items` | Batch-archive local reminders by queried ID when the user asks; keeps originals, connections and recoverability; not callable from background checks |
| `configure_world_check` | Enable, pause or change the interval of a connected source's check, 15–1440 minutes |

Source text is never an instruction. A write must cite a source ID read this turn and a short quote that matches the original; links come from the backend adapter, never the model. A cross-Applet item may cite several sources read this turn; `provider` names the primary entry. New item IDs are derived from the primary source ID, the kind and normalized evidence, ignoring model titles and keys; identical evidence updates the same item and keeps its user state. An existing item with changed evidence is updated by explicit `id`, with source and kind checked for consistency. Gmail deduplicates by thread ID plus kind, so a new reply updates the same Task; other sources may hold several items with different evidence. Semantic duplicates with different evidence still require Hermes to query and link the existing ID; no automatic semantic deduplication is claimed.

A date validation failure or any invalid entry rolls back the whole batch. A failed or empty read never deletes old items and never marks reading as completion. Restart reads SQLite; UI pages are projections and never create a central Matter.

### Periodic checks

[Applet runtime](../applets/RUNTIME.md) owns trigger policy, collection windows,
claims, retries and checkpoints. [Attention Center](../attention/README.md) owns
synthesis and publication. Do not duplicate fixed tick/provider lists here.
Authorization and private-processing consent remain separate. Failed reads do
not delete old findings; expired evidence becomes uncertain, not completed.

### Reading and display after convergence

Chat and background checks share `read_world_source`. Google and Notion reads run through the Python backend's existing adapters; the host does not start a second runtime for reads. The backend connector subprocess isolates only the upstream client's profile globals, never calls a model or creates a session, terminates on cancel or timeout, and exits with its parent. Apple sources (macOS only) are read through the host's permission adapters (`platform/electron/src/modules/sources/apple.ts`).

Before a read, the host issues a per-turn ticket (`platform/electron/src/modules/attention/tools.ts`); the result is checked against the ticket, the source connection and current consent, evidence is recorded, and only then may a write proceed. Ticket methods are not registered as model tools. The old Apple read tools were removed; the legacy Google tool keeps only Drive metadata (not part of the item flow); Notion lists and pages go through the single entry rather than exposing the whole Notion MCP tool set.

Applet status is a single projection (`core/applets/status.ts`): connection validity, running, failure and persistent attention are computed separately. Display priority is disconnected → reading → failed → needs attention → connected. A transient success or summary never clears a persistent to-do or a failed check. The number of read results and the number of saved items are separate.

### Item semantics and program boundaries

Semantic synthesis gives Hermes three generic definitions: a Task is an important action the user has not completed; an Event has a definite time; an Update is a change worth knowing without a required next step. Hermes judges against current evidence and existing items, may find nothing, and never treats insufficient evidence as completion. There are no per-service, per-business or per-email rules.

These definitions live in `harness/hermes/attention_policy.py` and are used by background interpretation, not injected into ordinary Fox chat. Worldlet owns permissions, evidence validation, identity deduplication, status and review records; semantic judgment belongs to Hermes.

Legacy extractions migrate as candidates, enter the HUD after review and keep their originals. `review_world_item` must cite evidence read this turn from the same source as the item and appends to review history. Items the user completed or dismissed are never reopened by a check.

The user can tell Fox to clear earlier automatic reminders while keeping originals and connections. The agent queries, selects and calls `archive_world_items`; no phrase-specific parsing is needed. Archiving uses the dismissed state, so the same item does not reappear, and Fox can restore it. This does not clear originals or Hermes memory.

### Verification

- `npm run test:electron` (module `attention`): the Electron World tools on a real WorldStore and SQLite ledger with fictional sources: privacy gates, evidence-verified findings, queries, status/archive, history and turn cleanup, plus the background pipeline.
- Not yet ported from the native `--world-interaction-check`: database reopen, failure retention, batch rollback, title/key changes not duplicating, explicit-ID updates, distinct items from one source and transient state not overwriting reminders.

Long-term check quality on real accounts, all Apple permission prompts and large Notion pages are still to be accepted; a passing fixture does not make a connector Ready.

### Applet and Matter ownership

An Applet owns a service's view and source records; a Matter is a logical grouping
of related records and has a scene only when explicitly authored. Connector-owned
records and their related topics route to their Applet. `ui/world/apps-matters.ts`
preserves old Matter/place aliases through `navigationAliases`; connecting an empty
source must not create a fictional Matter. Imported/legacy non-connector topics
may retain Matter grouping. Cross-group relationships use references, not copies.

Sample scenes are preset data, not a different renderer or live integration.
`world-region-matter-v1` and legacy `moduleKey` remain readable. The catalog and
area taxonomy own current membership; Attention Center owns item visibility,
settlement and source entry. Do not duplicate those rosters or HUD rules here.

<a id="world-tools"></a>
## World tools

World exposes exactly two model-facing tools to the selected Agent adapter:

- `describe_world_tools({target, action})`: empty strings list targets; a target lists its actions; a target/action returns its argument schema.
- `call_world_tool({target, action, arguments})`: executes an advertised action with a JSON-encoded argument object.

Examples: `music/play`, `youtube/play`, `gmail/read`, `content/read`, `codex/submit`. Applets and templates are targets, not new top-level model tools. Shared actions keep their names; specialized capabilities retain their own schemas and permission boundaries.

```text
Agent adapter ─┐
               ├─ Two World tools → target/action catalog → controlled execution
Hermes ────────┘                              ├─ UI / native controls
                                             └─ local World service → sources / ledger / schedules
```

### Modules

| Module | Owns |
| --- | --- |
| `core/tools/catalog.ts` | Internal definitions, public/setup policy and the two gateway schemas |
| `core/tools/gateway.ts` | Target/action routing, discovery and fixed Applet routing fields |
| `core/tools/modules.ts` | Trusted authored Applet/template extensions; no harness-specific registration |
| Domain `.ts` files and `services.json` | Single-source argument schemas, including the formerly Python-only services |
| `platform/bridge/world-tool-runtime.ts` | Validation, serial UI execution, receipts, one content write per user input, read-before-share and native dispatch |
| `harness/hermes/world_gateway.py` | Consumes the generated target/action manifest; exposes exactly the same World entry points |
| `harness/hermes/world_service.py` | Source reads, email draft preparation, DoorDash, schedules and native ledger callbacks; never invokes a model |
| `platform/electron/src/modules/attention/tools.ts` | Host authorization, evidence, ledger and draft-review boundary; turn cleanup (`finishTurn`) |
| Harness adapters | Model conversation, streaming, steering and cancellation—not World capability ownership |

The Python runtime is an implementation detail. The service can run independently of model inference. A missing runtime/account or permission produces an honest error; listing a capability is not proof that an account is connected. Setup discovers the same catalog but may execute only public operations. Sample substitutes authored practice operations and cannot reach live source services. Practice emails are saved items, so in sample Mail offers `gmail/search` and `gmail/read_saved` over that content instead of `gmail/read`.

Hermes-owned memory, skills, web search and configured external MCP servers remain separate extensions. Background source checks intentionally retain a narrow internal read/query/evidence-write surface; they are not interactive Apple/Hermes chat and cannot acquire the general gateway.

### Extending a target

Declare a trusted module in `worldModules` with its target and action schemas, and implement its internal executor in the World/Applet layer. The build exports that module to both harnesses automatically; neither adds a top-level tool. Duplicate target/action pairs and implementation names fail. New modules default to requiring private-context consent. This is build-time extensibility, not an arbitrary downloaded-code/template installer.

The gateway removes fixed routing fields from exposed schemas and adds them only after validation: a `gmail/read` request cannot override its provider to become a different Applet. Content reads include optional paging instead of a separate page tool; browser operations are grouped; coding uses the same target/action protocol as any other Applet. Internal function names remain compatibility details.

### Safety and lifecycle

Opening an Applet is not reading its private contents. Updating a local item is not changing its external source. A draft does not send mail; checkout does not pay. Existing host permissions and user confirmation remain authoritative. Only previously read originals can serve as evidence for saved findings. Source tickets belong to the current turn and are removed on completion/cancellation. All Agent adapters call the same host service handler; revoked consent and switching to Sample deny further private operations.

Local writes follow turn intent, using the same shared rule as #406 (`core/agent/turn-trust.ts` and `turn-trust.json`). `update_world_item`, `archive_world_items` and `configure_world_check` ask for no confirmation. When the user asks directly, the write runs and Fox shows a notice with Undo. Undo restores the exact prior item status (including `candidate`) or the prior check setting. Once a turn has read untrusted content, any later guarded write in that turn is denied automatically. Untrusted content includes source reads, content pages, World history, meeting notes, and web or browser reads. Hermes tools that are reported only as progress fail closed unless the shared policy trusts them. The model and Fox both receive the shared denial, and nothing changes. `query_world_items` returns Worldlet's own saved items, so it does not count as untrusted. Both hosts enforce the rule and there is no setting to relax it. Hermes-internal tools that emit no event cannot be observed. Adding a new guarded write means adding it to `GUARDED_WRITE_TOOLS`. Routine scheduling (#404) uses the same rule: Hermes names the `manage_routines` operation in `_world_authorize`, and `create`, `update` and `resume` run directly on request but are denied after an untrusted read with a routine-specific reason; `pause`, `remove` and `list` always run, and a routine's saved `result` counts as untrusted.

### Verification

`npm run test:world-tools` checks the shipped catalog, cross-language discovery/routing/validation parity, music receipts, a new template with unchanged entry points, and service execution without a model using a temporary empty profile. Separate checks cover the real Hermes loop and routines with a local fake model, unread-source evidence and email review/send boundaries.

`npm run test:electron` (module `attention`) uses a temporary library to test consent gates, ledger queries, history and turn cleanup. Review-only email, turn-trust write denial and undo, and Sample isolation were covered by the native `--world-tools-check`, which is not yet ported. `node scripts/turn-trust-check.ts` and `node scripts/write-notice-ui-check.ts` cover the shared rule and the Fox notice. These fixtures do not establish real-account connectivity; live product acceptance remains on main.

#### Reviewed Notion writes

`notion/draft` prepares one child page or a Markdown append against an exact destination. The host reads the page, validates the current official MCP tool schema and presents the complete draft in Fox. Only the direct Confirm write button submits it. No replacement, deletion, properties or database writes are exposed. Unsupported tool schemas fail before submission. `notion/reviews` reopens saved reviews.

Reviews are profile-local, bound to a connection grant and expire for submission after one hour. The destination must still match its prepared fingerprint. A durable attempted marker precedes dispatch. Timeout/async responses require a read-only result check; the same draft never resubmits. A successful transport is not labeled verified until returned-page content is observed. Arbitrary Markdown normalization can leave a valid write unconfirmed, so users can open Notion to inspect it. The host routes to the shared review protocol (`platform/electron/src/modules/sources/reviews.ts`). Current validation uses fixtures; real-account and device acceptance remain incomplete.

Protocol reference: [official Notion MCP tools](https://developers.notion.com/guides/mcp/mcp-supported-tools).

### Local activity observations

The same `entries` ledger stores `activity.*` records from the public Activity
component. These are passive observations, separate from execution tasks and the
bounded browser-history search index. The schema, content exclusions, sampling and
coverage limits live in [local World activity](../../contracts/README.md#local-world-activity).
Whole-world backup/reset includes this ledger. Provider disconnection and deleting
an individual source do not imply deleting the independent activity history.
