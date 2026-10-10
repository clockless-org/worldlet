# Worldlet desktop distribution

The [Electron host](README.md) is packaged by `scripts/package-electron.ts` for every OS. This
file owns how those packages are signed, published and updated: the Mac sections first, then
[Windows](#windows). Device acceptance of the Electron builds is recorded per release; earlier
native-host acceptance does not carry over.

Every package (Mac, Windows and Linux) has two Electron fuses turned off, so the shipped app ignores `NODE_OPTIONS` and refuses `--inspect` arguments; `RunAsNode` stays on because the World tool bridge runs the app as Node (`ELECTRON_RUN_AS_NODE`). `scripts/electron-fuses.ts` flips them with `@electron/fuses` in packager's per-architecture hook, before packager merges, signs or edits Windows resources, so signing always covers the flipped binary. `scripts/mac-app-info-check.ts` holds the values and the call site.

Mac Worldlet is distributed directly from the website as a **Developer ID signed, notarized and stapled DMG** containing a separately notarized app. It is not an App Store release. Building and publishing happens on a release Mac with `npm run release:local`; see [Development and release](../../scripts/DEVELOPMENT.md) for the script and the checks it runs.

The public Mac download is one universal DMG for Apple silicon and Intel. Both existing Sparkle feeds point to that same installer. Fresh-machine installation and full automatic-upgrade acceptance remain separate from publication verification.

## Current public release

| | |
| --- | --- |
| Release | 2026.9.28 / Build 1072; exact publication evidence in Issue #189 |
| Platform | Apple silicon (arm64) or a macOS 14-compatible Intel Mac (x86_64), macOS 14.0 or later |
| Website | https://worldlet.clockless.workers.dev/ (`/download/` has install instructions) |
| Update feed | https://worldlet.ai/downloads/appcast.xml (`platform/electron/distribution/Updates.json`). Earlier builds read the same feed through `worldlet.clockless.workers.dev`, which forwards to it; newer builds read it directly, so a network that blocks `workers.dev` can still check for updates. |
| Installers | One `Worldlet-<version>-<build>-macos-universal.dmg`, ULMO (LZMA) compressed |
| Bundle ID | `app.worldlet.mac`, app name `Worldlet` |
| Signature | `Developer ID Application: Chuan Ren (N9KJV72CSL)` |
| Runtime | Hardened Runtime and library validation on; no App Sandbox |
| Archive | Private GitHub Release `v<version>-b<build>` with DMG, checksum, notary log, appcast and `release-identity.json` |

`worldlet.dev` serves the same installer bucket and is used for Google OAuth branding; the workers.dev origin is the default in documentation. Existing Apple silicon apps retain `/downloads/appcast.xml`; Intel apps use `/downloads/appcast-intel.xml`. Both feeds currently publish the same universal DMG, and the download page shows one Mac download. Legacy chip-specific entries remain subject to the release retention policy. `node scripts/mac-release-check.ts` covers both states, hostnames, invalid domains and failed feeds. Intel first-run and update acceptance on Intel hardware remains outstanding.

## Version names

The official release version is `vYYYY.MMDD.BUILD`, for example `v2026.0928.1076`. Native/npm metadata uses numeric `2026.928.1076` without a prefix or leading zero. The date uses America/Los_Angeles; `CFBundleVersion` is the Build and determines Sparkle update order. Every platform shares one Build sequence (owner request 2026-10-04): an RC's Build is its commit's position on main (`git rev-list --count`), the same number the iPhone and Android builds of that commit carry, so `v2026.1004.2716` on Mac, Windows, iOS (App Store version `2026.1004.2716`, build `2716`) and Android all name one commit; a retried RC on a commit whose number is taken takes the next free one. Builds go up to 65535, the Microsoft Store's limit. GitHub tags and release titles use the official version. Download paths keep the compatible native-version-plus-build shape; old releases/tags stay immutable. Website and app HUD use the same public version. The product remains **Early Preview**.

## Installation and updates

1. Download and open the DMG.
2. Drag Worldlet onto the Applications shortcut in the installer window (or copy it to `~/Applications`).
3. Open Worldlet. The world opens immediately; Fox uses included Hermes model access by default. No on-device model fallback is offered; users may optionally connect a supported cloud provider. Worldlet prepares Hermes in the background, using compatible Python already on the Mac or downloading an app-owned Python 3.12 and pinned agent dependencies. Internet is needed for this first setup, not Node, Xcode or a user-managed Python installation. Codex sign-in is optional and only needed for coding delegation.
4. Worldlet checks the feed on launch and hourly while it runs. A signed update is downloaded and verified in the background; when it is ready Fox shows an **Update** capsule. Clicking it starts a fresh check, then installs and relaunches. Progress and retry stay in the capsule; idle or up-to-date states show none. A manual check is under **Worldlet → Check for Updates** in the menu bar. Fox's agent tools cannot trigger an update.

Updating replaces the app bundle only; `~/Library/Application Support/Worldlet/` is preserved.

### Update channels

Owner request 2026-10-04: **Settings › Updates** chooses which builds an installed copy follows, on Mac and Windows. The installed version (`2026.MMDD.BUILD`) and its channel always show under the Settings list; the phone apps show their version in their own Settings. The channels are the release stages ([`update-channel.ts`](../../core/distribution/update-channel.ts)):

| Channel | Stage | Builds | Feed |
| --- | --- | --- | --- |
| Dev | 开发 | every merge to main | the development Mac's Dev app only, from its checkout ([Dev channel](../../scripts/DEVELOPMENT.md)); an installed copy cannot follow it |
| Alpha | 内测 | each RC that passed its checks, package smoke and update acceptance on 01/02, about hourly | `/downloads/appcast-alpha.xml` (Mac), `/downloads/windows-alpha.json` (Windows); installers under `/downloads/alpha/` |
| Beta | 公测 | the releases at 00:00, 08:00 and 16:00 Pacific; the default | the release feeds above and `windows-preview.json` |
| Production | 正式 | each release, the same as Beta (owner request 2026-10-06) | the same feeds as Beta |

Alpha carries the RC package's exact bytes, the same ones a release publishes hours later. When an RC passes, `scripts/release-alpha.mjs` (called by `machine-candidate.mjs` on its release host) uploads the installer and checksum under `alpha/` in the release bucket, then replaces the Alpha feed with that one build: on the Mac the package's own Sparkle item, signature checked against the published key, its URL moved under `/downloads/alpha/`. A newer Alpha build already published wins, a release that started meanwhile goes first, and a failure is noted on the RC record (`alpha`, shown on the RC in Gatehouse's releases view) without failing the RC. The release feeds are never touched. An app on Alpha also reads the release feed and takes whichever names the newer Build, so Alpha is never behind Beta even when a passed RC never reached the Alpha feed. Alpha installers the feed no longer names are removed after three days by `release-retention.mjs`. Like the release feeds, these are not invite-gated.

Following a less stable channel only changes the feed. Following a more stable one (Alpha to Beta) installs that channel's newest build at the next update even when its Build is lower, then carries on from it. A prepared or downloaded update from the previous channel is dropped. The choice (`worldlet.update.channel`) belongs to this computer and is not part of World backups. A Microsoft Store or Steam copy is updated by its store and shows no choice. The phone apps keep their store tracks: Alpha is TestFlight's internal group and Play internal testing, Beta TestFlight's external group (public link) and Play open testing, Production the App Store and Google Play.

**Who can switch** (owner request 2026-10-05). Worldlet has no accounts, so "the owner" is a computer enrolled with Gatehouse: the installed app finds that machine's credential where the development Mac's daemon copies it (`<library base>/Worldlet Internal/machine-service.json`, [`machine-credential.ts`](src/modules/shell/machine-credential.ts)), the same check that shows the Order button. Only there does Settings › Updates show the switcher; the host refuses a channel change from any other copy whatever the page asks. Everyone else sees the channel they follow with no choice, and follows Beta: a copy that followed Alpha moves back to Beta at its next update check, installing Beta's newest even when its Build is lower. Enrolling or removing the credential takes effect within a minute, without a restart. The Dev app never switches: it follows main from its checkout, an installed copy never follows Dev, and neither shows a way across.

The Alpha feeds themselves stay public, like the release feeds. Gating them would put a machine-token check on the website Worker and the RC hosts' feed reads for builds that are the same signed bytes Beta publishes hours later; the app-side gate already keeps every copy off Alpha except the owner's.

The Dev app and an installed copy run side by side on the development Mac: different bundle identifiers (`app.worldlet.mac.dev`, `app.worldlet.mac`) and one library each (`Worldlet Development`, `Worldlet`). Switching channels never touches the library: Alpha, Beta and Production are one installed copy with one `Worldlet` library. Daily personal use belongs in the installed copy following Alpha; the Dev app carries changes merged to main before any RC has checked them. Development sessions test their own changes on per-worktree libraries (`Worldlet Worktrees/<id>`), not on either.

### Update path from the native app

The appcast format, feed URLs and Ed25519 public key are unchanged
([`Updates.json`](distribution/Updates.json)). Installed Swift/CEF apps update to the Electron
app through their embedded Sparkle 2.10, like any other release. On first launch the Electron
app opens the same library and imports the native app's display, companion, audio, analytics and
update preferences from UserDefaults into `preferences.json` once, so the analytics installation
identity and a pending update request carry over. It cannot read the native app's Keychain
items or security-scoped bookmarks, and Chromium profiles differ: Stripe and YouTube grants ask
to reconnect, connected folders, Obsidian vaults and the Voice Memos folder must be chosen again,
and websites need a new sign-in (see [data compatibility](README.md#data-compatibility)).

### Electron updater

The Electron app does not embed Sparkle. [`modules/shell/updates.ts`](src/modules/shell/updates.ts)
(`MacUpdates`) reads the same appcast (`intelFeedURL` on x64, `feedURL` otherwise) and acts only in
a packaged release build launched without arguments:

1. Skip informational items, builds not newer than the installed `CFBundleVersion` and items whose
   `minimumSystemVersion` exceeds this macOS; take the newest remaining build.
2. Download the DMG into `<library>/updates/`, refusing a size other than the published length.
   Verify the Sparkle Ed25519 signature over the archive bytes with the committed public key before
   anything is opened. A connection that sends nothing for 60 seconds is dropped and the download
   tried once more on a fresh one (Windows installers likewise); before 2026-10-08 a stalled
   download held the whole 30-minute limit and the next try waited for the hourly check.
3. Mount the DMG read-only, copy its single `.app` into `<library>/updates/staged/<build>/`, then
   require the published Build, the same bundle identifier, `codesign --verify --deep --strict` and
   the same Developer ID team as the running app.
4. Only now does **Update** appear. A click applies exactly that prepared build at once, with no
   check or download in between (owner Order 2026-10-07: a click used to re-check, download a newer
   Alpha for minutes and then restart unannounced): while Worldlet quits, the bundle is swapped by
   rename (copying across volumes when needed) and relaunched. An ordinary quit installs a prepared
   update without relaunching. The replaced bundle and leftover downloads are removed on the next
   launch.

Steps 1–3 run in the background at launch and hourly. A newer build found while one is prepared is
downloaded and prepared beside it without changing the button, then replaces it; until then Update
keeps applying the prepared one, and a failure there leaves it ready. After the relaunch, an
unchanged Build shows **Retry update**, which prepares again; a changed Build never continues into
another install without a click. Fox's **Update Worldlet** button (an out-of-date app) applies a
prepared build the same way, or prepares the newest and then installs it. An app in a folder it
cannot write to asks the person to install the current DMG.

#### RC update acceptance (#1140)

After its final-artifact smoke and permission check, a Mac RC package runs
`scripts/rc-update-acceptance-mac.mjs`, which updates the published release to the package through
this updater, unattended:

1. Download the DMG that the live appcast names newest, check its length and Ed25519 signature, and
   copy its app into a temporary folder. A connection dropped mid-download (`terminated`) or a 5xx
   answer is retried from the start, up to four attempts 10, 20 and 30 s apart, since the download
   origin ignores Range; a 4xx is not retried. The RC Build must be newer than the published Build,
   or the run fails (`RC Build … is not newer than the published Build …`).
2. Rename `~/Library/Application Support/Worldlet` aside, run the installed app once through the
   release smoke so it creates its data, and add a marker file to that data.
3. Serve a loopback feed whose only item is the package's own appcast item, signature included, with
   the archive moved to `http://127.0.0.1:<port>/`. Launch the installed app with
   `--update-feed <feed> --relaunch-capture <png>` ([`update-acceptance.ts`](src/modules/shell/update-acceptance.ts)).
   That launch configures the updater despite its arguments, accepts only a loopback `http` feed,
   installs what it offers as if Update had been clicked and relaunches into `--window-capture <png>`.
   The published key, Build, bundle identifier, code signature and team checks all still apply.
   An update that ends without installing writes `<png>.update.json` with the updater state and quits.
4. The relaunched app must run from the temporary install, report the RC version and Build, pass the
   release smoke verdict on its capture and still have the first run's data and marker. An `index.json`
   the RC moved into `world.sqlite` (#1532) counts as kept when `index.json.before-database` and the
   database's configuration row are there.
5. Stop the app, remove the temporary install and the test profile, and rename the real profile back.
   A profile left aside by an interrupted run is restored first; the test profile in its place is
   kept as `Worldlet.rc-update-acceptance-stale-<time>`.

Evidence goes to `<out>/update/` (`update.json` with versions and timings, `relaunch.png`,
`relaunch.json`, `published/`, `feed.xml` and `update-app.log`), and the result appears in the RC
package log. A failure fails the RC result `package` with `RC update acceptance failed: …`. A
published app without the override (every release before the first one that carries it) cannot be
pointed at a loopback feed. That run is recorded as `skipped` and passes; the next RC after such a
release runs the full acceptance. Published builds from Quit Completely (#1690) until the relaunch fix
(RC d2139330) end Electron's relauncher with the other stray children when they quit, so they install
the update but never reopen it: their bundled main has the stray scan but not `startPendingRelaunch`.
From such an app the acceptance checks that the install holds the RC Build, reopens it itself into
`--window-capture` after 20 s and judges it the same way, noting this in `update.json` (`reopened`).
A relaunch the app asks for while quitting (an installed update, the Messages and Voice Memos restarts)
starts only after the strays are ended (`relaunchAfterQuit` in `host/quit.ts`).
Checks: `node scripts/rc-update-acceptance-mac-check.mjs`.

Apps through 0.35.3 / Build 138 embed the retired update hostname and cannot update automatically; install the current DMG manually once, after which updates follow the Worldlet feed. Native builds with the old prepared-update stall install a downloaded update when quit completely; otherwise install the current DMG once.

## Release credentials

Nothing in this section is stored in the repository, the app or the website.

| Credential | Where it lives | Used by |
| --- | --- | --- |
| Developer ID Application certificate and private key | Login keychain of the release Mac | `package-electron.ts --sign` (`WORLDLET_SIGN_IDENTITY`), DMG signing |
| `worldlet-notary` notarytool profile (App Store Connect API key) | Login keychain | App and DMG notarization |
| Sparkle Ed25519 private key | Login keychain, account `app.worldlet.mac` (or `WORLDLET_SPARKLE_KEY_FILE`) | `sparkle-key-check.sh`, `generate_appcast`, `sign_update --verify` |
| `gh` session | Local CLI auth | GitHub archive |
| R2 S3 object read/write credentials | Owner-only release environment | Universal DMG, checksum and both feeds: S3 upload and full-byte verification (no Wrangler sign-in) |
| Google Desktop OAuth client registration | `WORLDLET_GOOGLE_CLIENT_FILE` or `.local/google-oauth-client.json` | Bundled as `resources/GoogleOAuthClient.json`; see [Development and release](../../scripts/DEVELOPMENT.md) |

### Universal DMG S3 credentials

The 300 MiB constraint belongs to Wrangler/the management API, not Worldlet.
The [R2 S3 API supports single uploads up to 5 GiB](https://developers.cloudflare.com/r2/objects/upload-objects/).
Use one streamed `PutObject` for the universal DMG; do not impose a product size
cap or require multipart simply because it exceeds Wrangler's limit.

Release preflight requires `WORLDLET_R2_ENDPOINT` (the account's HTTPS R2 S3
endpoint), `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`; a temporary credential
also needs `AWS_SESSION_TOKEN`. Configure them only in the release host's
owner-only environment, scoped to object read/write in the existing
`worldlet-releases` bucket. Never put credentials in the repository, app, Issue,
command arguments or logs. Wrangler OAuth alone is not an S3 credential. The
read probe does not establish write permission; publication verifies that.

`scripts/r2-object-upload.mjs` uses the pinned S3 SDK with bounded memory.
`If-None-Match: *` prevents overwrites, including races after the initial object
check. Content-MD5 protects the upload, and a complete remote download must match
local SHA-256 before feed publication. An identical existing object may be
reused only after full-byte verification. A conflicting object is never replaced.
A failed/uncertain request can be retried with the exact same bytes; no blind
stream retry or multipart upload is performed. The checksum is uploaded the same
way; both feeds are replaced with `--put-feed` and read back in full. Transport errors do not relax signing, notarization or update checks.

### Notarization profile

Use a dedicated App Store Connect **team API key** with the Developer role (Users and Access → Integrations → App Store Connect API → Team Keys). Save the one-time `.p8` download outside the repository in a private directory; record the non-secret Key ID and Issuer ID separately. Register it once:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun notarytool store-credentials worldlet-notary \
  --key /absolute/private/path/AuthKey_KEYID.p8 \
  --key-id KEYID --issuer ISSUER_UUID
```

`release-local.sh` checks that the profile exists before doing anything else. No app-specific password is needed.

### Sparkle key

`platform/electron/distribution/Updates.json` stores only the public key, the feed URL, the R2 bucket name and the keychain account name. The private key stays in the developer's login keychain. Before any build or release commit, `platform/electron/distribution/mac/sparkle-key-check.sh` (run by `release-local.sh` and `release.sh`) signs a probe with the key that will actually sign the feed (`WORLDLET_SPARKLE_KEY_FILE` when set, otherwise the keychain account) and verifies it against the committed public key; a mismatch stops the release. Back the key up securely and import the same key on any future build machine; never generate a new one per release. `WORLDLET_SPARKLE_KEY_FILE` can point at an exported key file instead of the keychain.

The Sparkle command-line tools (`generate_appcast`, `sign_update`) come from the official Sparkle 2.10.0 release archive: `scripts/sparkle-tools.ts` downloads it, checks its pinned SHA-256 and unpacks the tools under `.local/sparkle/2.10.0/`. The Electron app itself does not embed Sparkle.

## What a release produces and validates

`platform/electron/distribution/mac/release.sh --notarize`, invoked by `release-local.sh`, prepares one universal Mac app and installer; `release-local.sh` then checks the local release identity and runs `publish-release.py`.

1. `scripts/package-electron.ts --platform darwin --arch universal --sign --no-notarize` builds the release interface and host, stages each CPU slice's resources (Hermes `uv` bootstrap, Stripe CLI, agent-browser, the pinned imsg release for Messages, `GoogleOAuthClient.json`, distribution config, build info), merges the Mach-O pairs into one universal app and signs it with Hardened Runtime and [`entitlements.mac.plist`](distribution/entitlements.mac.plist). Both `uv` slices must match the official PyPI uv 0.12.15 digests, Google OAuth registration is required when signing, and the Hermes source archive checksum is pinned. The interpreter and Hermes packages are downloaded after launch and are never included in the DMG. `release.sh` copies the app to `dist/universal/`, verifies its signature and runs `bundle-portability.py`, which rejects nonportable loader paths and Mach-Os whose minimum OS exceeds the advertised minimum.
2. The app ZIP is submitted to Apple with the `worldlet-notary` profile; the ticket is stapled and `spctl` assesses the app.
3. `package-dmg.sh` mounts a blank read-write image (staged on the system disk when it has room) and copies the app into it once (#1109), with an Applications symlink and a large-icon drag window with a dashed arrow, writes the window layout directly with hash-pinned `ds_store` / `mac_alias` wheels (`pip --require-hashes`) in `.local/dmg-tools` (no Finder or Apple Events dependency), then converts to ULMO (LZMA). DMG packaging enforces no product-size cap; publication uses the R2 S3 transport.
4. The single DMG is signed, notarized, stapled and assessed. An existing version/build in `dist/releases/universal/` is refused.
5. `generate_appcast` signs the final stapled DMG for Sparkle and writes its checksum; nothing may mutate the DMG afterwards.
6. `publish-release.py` mounts the DMG read-only and validates its app (signature, both CPU slices, loader paths, minimum OS, update URL and public key, Applications symlink, background, `.DS_Store`), verifies the Sparkle signature, checks both live feeds, uploads the DMG and its checksum with S3 PutObject, then updates both feeds through S3 and reads each back (Wrangler only without S3 credentials). The S3 uploader downloads the entire remote object and compares SHA-256 before a feed may change.
7. `scripts/verify-published-release.ts` fetches both public feeds, checks their shared installer URL and compares the published checksum with the local one.

Only the universal DMG, its checksum and the two appcasts are uploaded. Source, user data, private keys, notarization logs and unpublished installers never leave the Mac.

### Release smoke

`node scripts/release-smoke-mac.mjs --app <Worldlet.app> --version <x.y.z> --build <n> --out <dir>` launches a built app and checks that its World paints (#987). For a release, point it at the notarized, stapled `dist/universal/Worldlet.app`: `package-dmg.sh` copies those bytes into the DMG.

1. Info.plist must name the expected version (`CFBundleShortVersionString`) and Build (`CFBundleVersion`). Otherwise nothing launches. With `--quit-running` (the release pipeline passes it on 02), a running copy of the same bundle identifier is sent SIGTERM and then SIGKILL; a copy that still runs fails the smoke. Other apps, including Worldlet Dev, are never touched.
2. The app runs with `--window-capture <out>/window.png` (`platform/electron/src/world/window-capture.ts`). It waits up to 90 s for its World view, then up to 20 s for the World's first painted frame (counted with Chromium frame subscription), plus 3 s. It captures the World view with `capturePage`, which reads the app's own rendering, so no Screen Recording permission is involved and a launch from the release daemon or over SSH meets no prompt. It writes the PNG and `window.json` (window size, painted World frames, times), then quits.
3. The smoke applies the shared rule in `scripts/window-pixels.mjs` to the content area. It passes only when the content is not blank, the World painted at least one frame and the app quit within 30 s of the capture.

The smoke writes `smoke.json`, `window.png`, `window.json` and `app.log`, and exits 0 only on a pass. A release build always uses `~/Library/Application Support/Worldlet`, so run it with no other copy of the app running; the app refuses to capture beside one. `--after <s>` captures a fixed time after the window appears instead (a diagnostic). Checks: `node scripts/release-smoke-mac-check.mjs` (arguments, identity, verdicts and `smoke.json`, on any OS).

### Release permission check

`node scripts/release-permissions-mac.mjs --app <Worldlet.app> --out <dir> [--quit-running]` answers the app's macOS permission prompts through System Events (#1142). The RC package step runs it on 02 after the smoke, against the app inside the mounted DMG. For Calendars and Reminders it resets the service with `tccutil` and opens the app on a fresh profile that keeps the installation folders (`runtime`, `speech`, `model-access`) with `--permission-probe <service> <report>.json` (`platform/electron/src/world/permission-probe.ts`). It uses `open -n -W`, so macOS holds Worldlet responsible for the request rather than the node that runs the check (#1168). It then checks that the prompt shows the Info.plist usage description, takes a screenshot and clicks **Allow**, then repeats with **Don't Allow**. Location is left out: on macOS 27 `tccutil` cannot reset it, and the Dev-mock journey covers it (#1168).

- **Allow** must reach the granted path.
- **Don't Allow** must show the page's explanation and leave the feature off.
- Every run must quit cleanly without a crash report.

The OS prompt is a system prompt, not an app approval card. The probe only runs the same World action a person would.

Afterwards the services are reset again and `~/Library/Application Support/Worldlet` is restored. The script writes `permissions.json` and per-cycle screenshots, reports and logs, and exits 0 only when all four cycles pass.

It needs Accessibility and Screen Recording for the node that runs it, plus Automation of System Events. Without them it fails at once with "re-grant Accessibility to <node path> on 02". The grant and how to renew it after a node upgrade are in OPERATIONS.md. Checks: `node scripts/release-permissions-mac-check.mjs`.

### Open at Login

Issue #1229. The setting is the app menu's **Open at Login** checkbox (the Worldlet menu on Mac, File on Windows) and Fox's `login` guide. Both use the `loginItem` host action (`platform/electron/src/modules/shell/login-item.ts`), which is backed by `app.setLoginItemSettings`/`getLoginItemSettings`. The status mapping is shared in `core/distribution/login-item.ts`:

- **enabled:** the system will open Worldlet at login.
- **requires-approval:** registered, but the person still has to allow it. On macOS 13+ SMAppService reports this until Worldlet is allowed in System Settings → General → Login Items. On Windows it means the Run entry was turned off in Task Manager or Settings → Apps → Startup.
- **disabled:** not registered.
- **unsupported:** a Dev build, Linux or a Microsoft Store package. These never touch the system's login items.

The Mac registers the app itself through SMAppService (`type: 'mainAppService'`). Windows writes a Run entry for the installed executable with `--opened-at-login`. The status is read again whenever the World window gains focus, so a change made in System Settings shows up. macOS may show its own "Background item added" notification; Worldlet adds no prompt of its own. Fox offers the setting once after onboarding ([onboarding](../../ui/onboarding/README.md#after-onboarding-open-worldlet-at-login-1229)).

**Quiet start.** A launch by the login item (Mac `wasOpenedAtLogin`, Windows `--opened-at-login`) opens the World minimized with `showInactive()`, so nothing takes focus. Opening Worldlet again restores it.

The NSIS uninstaller does not remove the Run entry. A leftover entry points at a missing executable, and Windows skips it.

### Release login item check (Mac)

`node scripts/release-login-item-mac.mjs --app <Worldlet.app> --out <dir> [--quit-running]` checks that `openAtLogin` round-trips in the packaged app. The RC package step runs it on 02 after the permission check, against the app inside the mounted DMG. It opens the app through LaunchServices with `--login-item-check <report>.json` (`platform/electron/src/world/login-item-check.ts`). The app turns Open at Login on and then off again through the same `loginItem` action as the setting, and reads `app.getLoginItemSettings()` back after each step. If the item was on to begin with, the app turns it on again, then quits.

It passes when:

- turning it on registers the item (`openAtLogin` true; status `enabled`, or `requires-approval` while System Settings still asks);
- turning it off removes it again;
- the app ran as the Release channel, restored what it found and quit cleanly.

It writes `login-item.json` (the verdict), `login-item-app.json` and `login-item.log`, and exits 0 only on a pass. Checks: `node scripts/release-login-item-mac-check.mjs` (in `pr-checks`).

### Release Fox setup check (Mac)

`node scripts/release-fox-setup-mac.mjs --bootstrap <HermesBootstrap> --out <dir>` runs the first Fox setup that a brand-new Mac does. The RC package step runs it on 02 after the login item check, against `Worldlet.app/Contents/Resources/HermesBootstrap` inside the mounted DMG. It bundles the app's own `platform/electron/src/modules/agent-runtime/installation.ts`, with Electron stubbed, and calls `HermesInstallation.prepare()`. The installer starts exactly as the app starts it, including its working directory. The run uses a temporary HOME whose path has spaces, like `Application Support`, and only the system PATH. No user, Homebrew or uv-managed Python is visible, so setup downloads and verifies the source, installs the app-owned Python and packages, and validates them.

It passes when:

- setup reaches `.ready` and reports `runtime-ready`;
- the app-owned Python was installed, which proves the fresh-Mac path ran;
- nothing was written outside `~/Library/Application Support/Worldlet`, the release library whose `runtime/` folder holds the runtime (no `~/.hermes`, no `~/.local/bin`).

A fresh install takes about half a minute and downloads about 0.5 GB. The temporary HOME is removed afterwards. The check writes `fox-setup.json` (the verdict), `fox-setup-app.json` and, after a failure, the installer's `setup.log`. It exits 0 only on a pass. Checks: `node scripts/release-fox-setup-mac-check.mjs` (in `pr-checks`).

The source download from codeload.github.com retries for minutes. RC d7e2bc2b (2026-10-03) failed because GitHub answered 429 four times in 7 s and setup gave up. `install.sh` now runs curl with `--retry 8 --retry-max-time 420`, so curl waits 1, 2, 4… s between attempts or follows Retry-After. The Linux and Windows `download()` in `installation.ts` waits the same way after a 429, a 5xx or a network error.

Why: on 2026-10-03 every fresh Mac install of 1100 and 1113 failed with "Fox could not finish setup" about 9 s after the first Google connection (#1408). Machines that already had a runtime never ran the installer, so no check saw it.

### No retained candidates or resume (#991)

A release attempt that fails (build, notarization, packaging, the final-artifact smoke or upload) ends there. Its isolated checkout is removed, and the next release slot builds again from the selected verified source. The one retained artifact is an **RC package** (#1102): an RC whose checks passed builds, notarizes and smokes the package with its own Build and keeps it under `.local/rc-packages/` on its release host, and the release that selects that RC publishes those bytes (RC package). Notarization submissions are still bound to their artifact hash, so a retried wait never resubmits silently. Publication still validates the app inside a read-only mount of the exact DMG before upload.

## Immutability and rollback rules

`platform/electron/distribution/mac/release_feed.py` decides whether a publication may proceed after downloading the live feed. That download (and the published-checksum read) retries any curl error three times, including TLS and connection resets that plain `--retry` treats as final:

| Live feed state | Result |
| --- | --- |
| No items at all | Rejected: the Worker's placeholder for a missing feed object; `WORLDLET_ALLOW_EMPTY_FEED=1` only for a first release |
| No entry for this build | Publish; older entries are kept in the feed so earlier apps still update |
| Same build, identical URL, length and Sparkle signature | Retry: the remaining steps continue, nothing is re-uploaded |
| Same build, different bytes | Rejected: published bytes are never replaced |
| A newer build already published | Rejected: a release cannot roll clients back |

Recompressing or otherwise changing a DMG is allowed only before publication and requires a new DMG signature, notarization, stapling, checksum and Sparkle signature. To ship a fix, publish a new build; the previous installer URL stays usable. The GitHub archive follows the same rule: `archive-github-release.ts` refuses a tag that belongs to a different commit and only resumes an unfinished draft.

## Open items

- A user on another Mac once reported Apple's "could not verify ... free of malware" message on a freshly downloaded native-host installer; it was never reproduced or conclusively diagnosed. `bundle-portability.py` still guards loader paths and minimum OS. Fresh-machine acceptance of the Electron installer, including macOS 14 and Intel hardware, is pending.
- Automatic update from an installed native release to the Electron app, and from one Electron release to the next, is not yet accepted on a device. On Windows, every RC from now on runs the Electron-to-Electron update unattended on 01 (#1141, [Windows preview update manifest](#windows-preview-update-manifest)). It counts once a published Build carries the test hook and an RC's `update.json` passes.

References: [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [Sparkle publishing](https://sparkle-project.org/documentation/publishing/), [Apple API key management](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api).

### Dedicated release-host keychain

A release host may keep Developer ID and the `worldlet-notary` profile in a separate `worldlet-release.keychain-db`. Add it to the user keychain search list without replacing other keychains. Store its random unlock secret outside Git with owner-only permissions. Unlock it in the same session that starts release work, then export `WORLDLET_NOTARY_KEYCHAIN` to its absolute path. Preflight and app/DMG submissions pass this keychain explicitly; the user login keychain stays unchanged. Do not log passwords or pass them in Issue comments. `WORLDLET_SPARKLE_KEY_FILE` can point to the existing exported update key, also outside Git and owner-only. Never generate a replacement Sparkle key.

## Windows

The Windows app is this Electron host packaged for x64
(`node scripts/package-electron.ts --platform win32 --arch x64`, output
`dist/packages/Worldlet-win32-x64`). It bundles its own Chromium, so it needs neither
WebView2 nor .NET on the user's computer. Three channels share that payload:

| Channel | Artifact | Updates | Website role |
| --- | --- | --- | --- |
| Microsoft Store | MSIX from [`windows-msix.ts`](../../scripts/windows-msix.ts) | Store only | Primary Windows link (homepage, blog, `/download/`) |
| Direct preview | Unsigned NSIS EXE plus `windows-preview.json` | Built-in updater | Secondary direct installer on `/download/`; `/downloads/latest` still returns the EXE |
| Steam | SteamPipe configuration from [`windows-steam.ts`](../../scripts/windows-steam.ts) | Steam only | None; not published |

`WORLDLET_DISTRIBUTION_CHANNEL` (`website-preview`, `microsoft-store` or `steam`) is
recorded in `build-info.json` / `build-identity.json`, so each channel needs its own
package run from the same commit. A Store or Steam build (or any process with Store
package identity) reports "Updates are managed by …" and never runs the EXE updater
([`updates.ts`](src/modules/shell/updates.ts)).

**Signing.** Every Windows artifact is unsigned: the installer metadata, the manifest
and the updater all require `signed: false`, and `package-electron.ts --sign` signs
only Mac builds. Publishing unsigned website previews is an owner-authorized policy;
keep the unsigned labeling and possible Windows warnings. Signing (Azure Artifact
Signing account readiness, application/uninstaller/installer signatures, timestamps)
and the updater migration it requires are open; see the
[release guidelines](../../docs/RELEASE-GUIDELINES.md). The Store signs its own package.

**Acceptance.** Device acceptance of the Electron Windows build is pending: clean
Windows 10 and Windows 11 installation, first-run Hermes preparation, sign-in, update
from the native preview and Store install are not yet recorded for it. Windows 11
evidence from the retired C#/WebView2 host (#128, #150, #190, #523) does not carry over.
A native-preview library written as `world.json` is not migrated automatically.
ARM64 Windows builds are not produced.

### Windows requirements

- **End users:** native x64 Windows 10 version 1809 (build 17763) or later, enforced
  by the installer and the MSIX `MinVersion`. Internet is needed for first-run Fox
  setup, sign-in, connected services and cloud AI.
- **Build and release host:** Node 22.19+ with the repository lockfile; a Python 3
  interpreter for [`bundle-hermes-windows.py`](../../scripts/bundle-hermes-windows.py)
  (`WORLDLET_SETUP_PYTHON`, else `python`; the Microsoft Store alias is not enough),
  and `python3` for Google registration staging; network access to fetch the pinned uv
  0.12.15 wheel; NSIS 3.12 for the EXE installer; the Windows SDK 10.0.26100.0
  `makeappx.exe` for MSIX (`WORLDLET_WINDOWS_SDK_BIN` overrides the default
  `C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64`). No .NET SDK or
  runtime is needed. Releases also need Git, `gh`, R2 S3 credentials or Wrangler OAuth,
  and Microsoft Edge for the Playwright download-page check.
- **Google registration:** packaging bundles `GoogleOAuthClient.json` from
  `WORLDLET_GOOGLE_CLIENT_FILE` or `.local/google-oauth-client.json` (the release job
  defaults to the latter). The MSIX and Steam generators refuse a payload without it;
  the EXE installer builder does not check for it.
- `npm run version:windows` reserves the next independent Windows Build from the live
  manifest without advancing the Mac Build.

### Windows installer

`npm run installer:windows` (on Windows) packages the app, then
[`windows-installer.ts`](../../scripts/windows-installer.ts) compiles
[`installer.nsi`](distribution/windows/installer.nsi) with NSIS 3.12: the official
`nsis-3.12.zip` extracted so `.local/tools/nsis-3.12/makensis.exe` exists, or
`WORLDLET_MAKENSIS`. Other NSIS versions are refused; nothing from NSIS is installed on
the user's computer. `node scripts/windows-installer.ts [--payload dir]` reuses an
existing package.

Output is `dist/windows-installers/Worldlet-<version>-<build>-windows-x64-unsigned.exe`
with `.sha256` and `.json` (build identity, installer source commit/dirty state, file
count, `signed: false`). An existing installer is never overwritten. The payload may not
contain links.

The installer is current-user and never elevates. It installs to the fixed
`%LOCALAPPDATA%\Programs\Worldlet\app` (`/D` is ignored), adds a Start menu shortcut and
an Installed Apps entry (`app.worldlet.windows`), and serializes setup/uninstall with a
named mutex. It refuses to replace a running app rather than terminating it; `/WAITPID=<pid>`
waits up to 30 seconds for that process to exit, then up to 30 more for the app's helper
processes to release `Worldlet.exe`, and writes its outcome (`installed …` or `failed: …`) to
`setup-result.txt` beside itself, which the RC update acceptance reports. An upgrade extracts the new payload to
staging first, runs the previous uninstaller's exact file inventory, then moves the staged
files; an interrupted first install resumes from its `installing.id` marker. Directory
links are rejected before any removal. Uninstall removes only recorded files, the
shortcut and registration, never recursively; unknown files and the library under
`%LOCALAPPDATA%\Worldlet` (world, Hermes profiles, credentials, downloaded runtime) stay.

For an isolated test, `node scripts/windows-installer.ts --test-id <12 hex>` builds
`…-test-<id>.exe` with its own `Worldlet Installer Test <id>` folder, shortcut and
registry identity. `python scripts/windows-installer-check.py <test exe>` refuses
production installers and used paths, then checks concurrent and in-use rejection, the
installed resources and `--host-contract-check`, `/WAITPID` upgrade, interrupted
extraction recovery, real self-uninstall and preservation of fixture data and unknown
files. The contract check loads host modules without a window; it is not UI, first-run
or clean-machine acceptance.

**First-launch Hermes preparation** (removed on 2026-10-09 with the built-in Hermes; since then the package's
`HermesBootstrap` folder carries only `uv.exe` and its SHA-256, for Worldlet's own tools Python). Before that the package carried
a bootstrap: `uv.exe` with its SHA-256, `runtime.json`, the Hermes source ZIP SHA-256 and `windows-requirements.txt`.
When Fox first needs Hermes, the app prepares it in the background under
`<library>\runtime\hermes-<manifest digest>`: it checks the bootstrap against the
bundled interface manifest, downloads the pinned Hermes revision and verifies its hash,
installs uv-managed Python 3.12.14 (never the system Python), syncs the frozen
dependencies, installs the hash-pinned binary wheels, validates imports and versions,
then writes a `.ready` marker. A lock directory holding the owner PID serializes app
instances (15-minute wait; a dead owner's lock is reclaimed). A failure leaves the world
usable and the next request retries, replacing only that runtime directory. An explicit
development Python or external Agent configuration bypasses the download.

### Windows preview update manifest

`https://worldlet.ai/downloads/windows-preview.json` is unchanged from the native
preview: `formatVersion: 1`, `version`, `build`, `architecture: "x64"`, `signed: false`,
`url` (`/downloads/Worldlet-<version>-<build>-windows-x64-unsigned.exe`), `size` (at most
300 MiB), `sha256` and `googleSignIn`. Installed native previews read the same file;
their update to the Electron installer has not been accepted on a device.

[`windows-release.ts`](src/modules/shell/windows-release.ts) holds discovery and
verification without Electron, so release scripts run the shipped code under Node. A
direct-channel release build checks at launch and hourly (15 s, 16 KB, no redirects) and
downloads a newer Build in the background at once: the EXE streams into `<library>\updates`
with size and SHA-256 checks. Only then does **Update** appear (owner Order 2026-10-07); a
newer Build found meanwhile downloads beside the ready one without changing the button. A
click re-verifies the file, refuses while an Agent task or recording is active, starts the
installer silently with `/S /WAITPID=<pid> /RESTARTAPP` and quits; the installer replaces the
app and reopens it (`RestartApp` in [`installer.nsi`](distribution/windows/installer.nsi)),
and a failed silent install reopens the version still installed, its reason in
`setup-result.txt`. An installer from before `/RESTARTAPP` installs silently without
reopening. Quit Completely
spares that installer (`outliveQuit` in [`quit.ts`](src/host/quit.ts)), and an installer
whose parent is the `/WAITPID` process restarts itself outside the app's process tree first,
because Build 2792 ends every child it spawned on quit (RC 2800 run 61030789). That restart came too late inside the full installer, after NSIS's CRC pass over the whole file (RC 2834, #1804), so the published EXE is a small launcher ([`launcher.nsi`](distribution/windows/launcher.nsi), no CRC pass of its own) that restarts first, then runs the real installer with its CRC check, passing arguments, exit code and `setup-result.txt` through. The installer skips NSIS's whole-file CRC pass so that restart comes first (#1804); the updater's SHA-256 and the Authenticode signature cover integrity. Started by
anything else, `/WAITPID` stays synchronous. Leftover installers are removed at the next start.

RC update acceptance (#1141): `WORLDLET_WINDOWS_UPDATE_TEST` is a test-only override. The
updater honors it only when it is `http://127.0.0.1:<port>/downloads/windows-preview.json`
(`windowsUpdateTest`) and the app runs on a `WorldletUpdateAcceptance-<8 hex>` profile, so a
published build on a normal profile ignores it. With it, the app checks that loopback
manifest at launch, downloads from the same origin and installs unattended (`/S
/WAITPID=<pid>`). A silent install does not relaunch the app. After the release smoke on 01,
`rc-update-acceptance-windows.mjs` uses the hook
so that the published build updates itself to the RC package. It then relaunches the app and
checks the version, Build, painted window and kept profile data. See the
RC Package row. The check is skipped until a published
Build contains the hook.

The website's [`windows-release.ts`](../../ui/distribution/windows-release.ts) validates
the same manifest and shows the direct link only for an available, valid artifact;
`node scripts/windows-release-check.ts` covers routes, manifest refusal, unavailable
artifacts and mobile layout. The manifest is always uploaded last.

### Windows release handoff

Scripted releases ship only a commit whose Windows gate already passed on 01
(`worldlet/rc-windows`); see
release selection.
The Windows gate is the shared suites plus `test:electron` (`scripts/gate.mjs`). The
Windows branch of `release-job.mjs` then runs, in a job
worktree: `npm ci`; preflight (R2 S3 or Wrangler, Python, NSIS); Build reservation and the
identity commit (no PR: the release is marked by its `windows-v…` tag); `check:types`; `installer:windows` with `website-preview`; the final-artifact
smoke on that exact installer (`release-smoke.mjs`, #987; `windows-installer-check.py` is a
manual tool no release or RC runs); `publishWindows`; `verifyPublished`; then
Store packaging and submission, reported separately. A retained candidate publishes with
the same bytes through `scripts/release-resume.mjs`.

`publishWindows` requires the acceptance record and a clean, unsigned, hash-matching
candidate with a newer Build. It uploads the EXE and checksum (S3 with no-overwrite, or
Wrangler after confirming no different public bytes), verifies the full public download,
archives the bytes in a draft `windows-v…` GitHub Release, confirms the live manifest is
still the baseline, publishes the manifest, then runs the shipped updater's discovery,
download and hash check and the download-page links in Edge before publishing the
archive. Retention cleanup failure does not undo a verified publication.

**Installation recovery.** A release stopped at `install-upgrade-test` can rerun its
original test installer without rebuilding:
`node scripts/release-windows-install-resume.mjs <checkout> <issue> <session> <source SHA> <candidate SHA> <unsigned EXE SHA-256> <test EXE SHA-256> <absolute Python>`.
It runs only on the designated Windows host under the release lock, requires the stopped
checkpoint, clean candidate checkout, RC evidence and both installer hashes and
identities, waits up to 30 minutes for a running RC to yield at a command boundary, logs
under `.local/installer-recovery/`, and retains the candidate only after a successful
check with unchanged bytes. It never publishes or records acceptance. Synthetic coverage:
`windows-installer-support-check.py` and `release-windows-install-resume-check.mjs`.

**Coordinated desktop gate (dormant).** `runGates` accepts a `windowsCoordination`
option ([`windows-release-coordination.mjs`](../../scripts/windows-release-coordination.mjs)):
it writes a `preparing` discovery record under `.worldlet-task/windows-check/`, strips
inherited `WORLDLET_WINDOWS_CHECK_*` variables from every gate command and passes them
only to `test:electron`, after validating a host-written, finite (at most five minutes)
`cu-binding.json` for a live, authorized native CU worker.
[`windows-check-coordination.ts`](../../scripts/windows-check-coordination.ts) defines the
per-stage request, lease and READY records. When a binding is present, `test:electron`
publishes the gate record (fingerprinting the Electron binary and the built
`dist/electron/main.cjs`) and runs its windowed smoke stage through it. No scheduled job
passes the option, and the READY broker that answered it was removed as unused (#1007),
so a coordinated run is not available today. Records are coordination, not OS permission
or desktop evidence. Focused checks:
`windows-release-coordination-check.mjs`, `windows-check-coordination-check.ts`.

### Microsoft Store and Steam

**Microsoft Store.** Listing <https://apps.microsoft.com/detail/9P608B0R3F0Z>; identity in
[`store-identity.json`](distribution/windows/store-identity.json) (package
`21585RenKelvin.Worldlet`, publisher display name `RenKelvin`). Do not infer the publisher
from an Azure identity or company name. The last recorded live package, `2026.1054.0.0`
(#523), was built by the retired native host; no Electron package is recorded live.

The RC package carries the Store MSIX of the same commit (a release without an RC package
packages it after the EXE with `microsoft-store` and `node scripts/windows-msix.ts`). After
the EXE is published and verified, the release job runs
`node scripts/windows-store-submit.mjs --package <msix> --record <job>/store-delivery.json`.
Without Store API credentials (`not-configured`) it hands the MSIX to 01's Partner Center
Playwright upload, which uploads it with `scripts/partner-center-upload.mjs` (its own
signed-in Chrome profile) and submits it for certification
(Store submission on 01, owner
decision 2026-10-02; 2026.1089 was submitted this way on 2026-10-02, #1161, and the owner chose "以后自动提交"). A Store
failure never blocks or rolls back the EXE. The MSIX is full-trust (`runFullTrust`,
microphone), version `<year>.<Windows Build>.0.0`, from a clean current commit, written
unsigned to `dist/windows-msix/store-*.msix` with SHA-256 and metadata. `--test` builds an
isolated `Worldlet.MSIXTest` identity; the Electron host has no separate test library, so
test it in a disposable Windows account. Packaging success is not installed-package
acceptance or certification.

`windows-store-submit.mjs [--dry-run] [--package file.msix] [--record file.json]` verifies
the package hash and identity, then records the live and pending submissions separately.
States: `not-configured`, `dry-run`, `pending-other` (another submission pending; left
untouched), `saved`, `submitted`, `certification`, `certified`, `live`, `superseded`,
`failed`. Only `live` counts as published. It clones the last published submission, so
the listing and pricing carry over (edit listing copy in Partner Center), replaces the x64
package, commits and returns once pre-processing starts. It never makes a first submission
or edits a submission it did not create. Credentials: `WORLDLET_STORE_TENANT_ID`,
`WORLDLET_STORE_CLIENT_ID`, `WORLDLET_STORE_CLIENT_SECRET` (an Entra ID application with
the Partner Center Manager role, granted only by the account owner), from the environment
or the release host's `.local/release-env.json`. Clean-device Store install, launch,
sign-in and Store update remain manual for each package.

**Steam.** `node scripts/windows-steam.ts <App ID> <Depot ID>` writes SteamPipe
`app.vdf`, `depot.vdf` and `candidate.json` (Preview=1) under `dist/windows-steam/` for a
clean current payload packaged with `steam`. It rejects links, development credentials and
Steam overrides in the payload, and never logs in, uploads or activates a branch. No
Steamworks App ID exists yet; account status is on the
[distribution dashboard](../distribution/index.html). Steam account and depot steps are in [Steam](../STEAM.md).

### Microsoft Store listing (English)

Canonical Store listing copy for the Electron app. Partner Center must match it; change the
copy here first. The public listing observed on 2026-09-30 (#587) had one feature line, two
screenshots, no release notes and no copyright. Entering this copy, the screenshots and the
package in Partner Center, and certification, are tracked in #1161.

**Name:** Worldlet

**Short description:** A personal AI world for your work, ideas and everyday tasks.

**Description:** Organize your work and life in a small personal world. Talk with Fox,
connect supported sources such as Google and Notion, and keep local notes, files and tasks
close at hand. The Attention Center brings reminders and follow-ups from supported sources
into view.

Explore a built-in sample world, organize your own local library, and use connected
services when you choose. Your local library stays on your computer; connected services and
cloud AI require an internet connection and your permission. AI responses may be inaccurate
and should be reviewed.

First use requires an internet connection to prepare the assistant runtime. Optional
provider services may require their own accounts. Screenshots show fictional sample data.

**Product features** (one per Partner Center line):

- A personal world with Home, Work, Social, Life, Games and Entertainment regions
- Fox, an AI companion whose conversation follows the place you are in
- Applets bring mail, calendar, notes, files and websites into one world
- Attention Center: Coming Up, Worth Doing and Worth Knowing from your sources
- Local notes and files stay in your library on this PC
- Connect Google and other supported services only when you choose
- Day and night world with optional background music
- Optional voice dictation using your microphone
- Privacy controls let you turn off usage reporting

**Release notes:** the feature-area notes of the Windows Build that produced the package,
prefixed with its version, for example `Windows Build 1068 (2026.929.1068)`. Leave them
empty rather than invent notes.

**Screenshots:** the five PNGs in
[`store-screenshots/`](distribution/windows/store-screenshots/), in this order:
`01-day-overview.png` (day world), `02-fox.png` (Fox), `03-attention-preview.png`
(Attention preview), `04-open-applet.png` (an open Notes Applet) and `05-night.png` (night
world). Each is 2403 × 1302 (above the 1366 × 768 minimum), uploaded as captured, with no
resizing, cropping, painting or conversion. Their
[`manifest.json`](distribution/windows/store-screenshots/manifest.json) records the source
commit, app version, the scripted step for each scene, size and SHA-256. They show only the
built-in fictional sample world in a disposable profile, never personal data or native-host
imagery. To replace them, capture from the same route: build the UI with
`WORLDLET_BUILD_CHANNEL=release` (footer shows `worldlet.ai` and the version, not the
branch and hash), run Electron with `WORLDLET_WINDOW_TITLE=Worldlet` and `WORLDLET_CAPTURE`
(page pixels from `capturePage`: no OS title bar or cursor) on a profile whose
`preferences.json` enables `worldlet.sampleEnabled`, and for night seed the saved scene
lighting in `environment.json`. Then update the manifest.

**Category:** Productivity. **Languages:** English (United States).

**System requirements:** Windows 10 version 1809 (build 17763) or later, x64. Additional
requirements text: "Internet connection required for first-use setup, sign-in, connected
services and cloud AI." No memory or graphics minimum is declared because none has been
measured.

**Copyright:** © 2026 Worldlet (the packaged `appCopyright`). **Privacy:**
<https://worldlet.ai/privacy/> · **Website:** <https://worldlet.ai/> · **Support:**
<https://worldlet.ai/help/>

**Age rating:** generated by the IARC questionnaire, not set by the publisher. The live
listing shows ESRB Teen ("Diverse Content: Discretion Advised", "Unrestricted Internet",
"Users Interact"); submission 1 also generated Microsoft 12+. These answers are truthful:
Worldlet opens arbitrary websites where people interact and shows AI-generated text. The app
has no age gate and the listing shows no publisher minimum age. The website's under-13
statements in the Privacy Policy and Terms are an owner legal decision, not a Store setting.

**Package and source:** the Store package is only the MSIX that the release job builds with
`scripts/windows-msix.ts` from the commit of a published, verified Windows Build (see
above): full-trust x64, version `<year>.<Windows Build>.0.0`, identity from
`store-identity.json`. Never upload an ad hoc or local build. The listing copy and
screenshots describe the app at that build; recapture the screenshots when the visible UI
changes. Account access, submission and certification are tracked in #1161.

**Reviewer notes:** A full-trust Electron desktop application with a bundled Chromium and a
bootstrap for its Python/Hermes assistant runtime. First use needs internet access to
prepare that runtime. Microphone access supports optional dictation. Provider access
requires user authorization. Give reproducible reviewer steps without personal account
credentials, and do not claim unsupported provider integrations.
