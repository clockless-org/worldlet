# Website engine (CEF)

Website panels run on **CEF**: Chromium with its own `//chrome` layer, in a separate engine process
inside the Electron host (owner decision 2026-10-01, #1170). Electron keeps the shell, the World,
the HUD and Fox. Google refuses a fresh account sign-in in Electron's own views. On the same
machine and account it accepts CEF 154 (#1089). Electron lacks Chrome's layer: `window.chrome` is
empty and Chrome's passkey support is missing. Imitating that layer inside Electron is excluded.

Electron's website views (`platform/electron/src/modules/browser/page.ts`) remain the fallback. They
serve wherever the engine is not built, and wherever `WORLDLET_WEB_ENGINE=electron` is set.

## Architecture

```text
Electron main ──spawn, stdin/stdout──▶ Worldlet Web (CEF, windowless pages)
     ▲   │ frame messages                     │ OnAcceleratedPaint
     │   ▼                                    ▼
     │  sharedTexture.importSharedTexture ◀── shared GPU surface (IOSurface / NT handle)
     │   │
     │   ▼
 surface view (trusted, sandboxed) ── draws frames, sends input ──▶ engine
```

- **Engine process.** `Worldlet Web` (`src/`) runs every website page of the app.
  - The host spawns it on first use (`engine/process.ts`) and ends it on quit.
  - If the host goes away, the engine sees its stdin close and exits.
  - Personal and practice worlds use separate request contexts under `<library>/Browser/CEF`
    (`Website`, `Practice`).
  - Nothing is imported from the Electron partitions.
  - Cookies are encrypted with Chromium's key in the macOS keychain (`Chromium Safe Storage`). A
    packaged engine creates that item on first use; when another Chromium-based app made it first,
    macOS asks once, and Always Allow holds across updates because the engine is signed with the app.
    Development builds (main Dev, worktrees, checks) use Chromium's mock keychain instead
    (`--worldlet-mock-keychain`): their engine is signed ad hoc on every build, so the keychain
    would ask again after each one. The mock keychain answers with one fixed key, so sign-ins still
    last across launches; the cookies are only not protected by the keychain.
- **No other way in.** Launch switches never reach Chromium: the engine reads its own `--worldlet-*`
  switches and passes Chromium only the executable. Remote-debugging and profile switches are
  removed whatever added them. The engine has no TCP listener. Development checks may add
  `--worldlet-fake-media` (Chromium's fake camera and microphone, `WORLDLET_WEB_FAKE_MEDIA=1`).
- **Windowless pages and frames** (`src/frames_*`). Each page renders windowless (Alloy style)
  into GPU shared textures.
  - CEF lends a frame's texture only during `OnAcceleratedPaint`, so the engine copies it into a
    ring of three surfaces it owns. It then sends a `frame` message naming the slot.
  - The host imports the slot with Electron's `sharedTexture`, hands it to the surface view and
    acknowledges the slot once every reference is released.
  - A frame that finds every slot busy is dropped, and the page repaints when one frees.
  - Linux (#1178) uses CEF's software frames instead (`OnPaint`): the engine writes each frame's
    BGRA pixels into a ring of shared-memory slots (`/dev/shm/worldlet-web-<pid>-…`, `src/frames_linux.cc`),
    the host reads the slot, acknowledges it and the surface view draws the pixels on a canvas.
    A newer frame replaces one still waiting to be drawn. GPU frames through dmabuf are not built.
- **Handing surfaces to the host.**
  - macOS: the engine sends each surface's Mach port, once per slot and size, to a service the host
    registers (`addon/surfaces_mac.mm`). The host accepts it only from the engine's process.
  - Windows: the engine duplicates each surface's NT handle into the host process and closes it
    there when the slot is replaced.
  - Linux: nothing is handed over; the host opens the engine's shared-memory slot by name and
    removes any the engine leaves behind when it exits.
- **Display is independent of the page.** A page's layout size never depends on where or how large
  it shows. A surface can show a page smaller (picture-in-picture, #1175) or in several places
  (#1176) without the page reflowing under Fox.
- **Frame clock.** The engine issues each shown page's frames itself (CEF external begin frames), at
  the rate the host sets for where the page shows (`pageFrameRate` in
  `core/browser/picture-in-picture.ts`): in the panel the display's refresh rate, 60 to 120 a second
  (120 on a ProMotion or other 120 Hz screen, as in the person's own browser; Linux's software frames
  stay at 60), 15 in the task window, and 4 while that window waits out of sight. A hidden page gets
  none. The engine accepts up to 120.
  - Why: Chromium's own display-driven frames do not keep a lower windowless rate on macOS once
    input arrives.
  - In the panel, a page that changes every frame gets the full rate. An animation-frame loop that changes
    nothing gets about every other one, because Chromium finishes such a frame only near its
    deadline.
  - On macOS each frame wakes on a strict timer (`PostFrameTask` in `src/frames_mac.mm`). The
    engine's ordinary delayed tasks are coalesced by the system and can wake tens of milliseconds
    late, which held a panel page near 17 frames a second (#1239).
  - On Windows each frame wakes on a high-resolution waitable timer from a thread of its own
    (`src/frames_win.cc`). The engine's ordinary delayed tasks wake on the 15.6 ms system timer
    tick, which held a panel page at 50 to 59 frames a second, at the edge of what the engine check
    allows.
- **Surface view** (`platform/electron/src/modules/browser/engine/surface*.ts`). This is a trusted,
  sandboxed view at the panel's rect; no website loads there.
  - It draws frames and the `<select>` popup widget onto canvases.
  - It forwards the person's input in page coordinates: mouse, wheel, keys with native key codes
    (`keys.ts`), input-method compositions, and the Edit menu's commands.
  - On macOS a key that types no text (Backspace, Delete, arrows, Tab, Escape, F-keys) carries
    AppKit's character for it. CEF reads a key event without a character as a modifier change, which
    counts as a press even on key up, so Backspace deleted two characters before.
  - It shows the page's cursor and tooltip, and keeps an input method's candidates beside the
    composed text.
- **Same contract as the Electron views.**
  - `CefPageView` (`engine/page.ts`) has the `PageView` contract, so `BrowserDevice`, the
    picture-in-picture rule and Fox's gateway are engine-independent.
  - Popups stack over their opener in one panel.
  - DevTools reaches only the visible page: the panel's own commands, plus Fox's agent-browser
    commands remapped. `Target.*` and `Browser.*` are refused.
- **Rules.** Product rules stay in shared code. Chromium decides navigations and popups
  synchronously, so the engine answers those in `src/policy.cc`. That code is identical to
  `rules.ts` and checked against `contracts/fixtures/parity`. An `http://` page on a public host
  opens at its `https://` address, as Chrome upgrades it, once per address so a site that sends it
  back is not upgraded in a loop: Xiaohongshu's QR sign-in returns to `http://www.xiaohongshu.com`,
  and refusing that left a white page after the scan (owner report 2026-10-05).
- **Sign-in pages stay unobserved** (#1089). From the first navigation to an account sign-in page,
  the engine disables the DevTools domains the host or Fox enabled. It keeps that page's events to
  itself and refuses new commands until the page leaves.
- **The host answers the engine's questions** (`ask`):
  - JavaScript dialogs and file choosers become native dialogs over the World window;
  - downloads save straight into Downloads with no save dialog (a taken name gets a number, `download-path.ts`) and report progress as the Electron views did;
  - camera, microphone and location follow `BrowserDevice.permission`; once the host allows a
    camera or microphone, the engine records it for that site, so the site's Permissions API reads
    `granted`, as in Chrome. Every new page still asks the host first.
  - Leaving a page is never held up by `beforeunload`. Websites get no context menu and no web
    notifications.

## Protocol

Messages are length-prefixed (4-byte little-endian) UTF-8 JSON objects with a type `t`.

| Direction | `t` | Fields |
| --- | --- | --- |
| host → engine | `create` | `id`, `scope` (`personal`/`practice`), `url`, `hidden`, geometry: `w`, `h`, `scale`, `view`, `window`, `screen`, `available` (rects as `[x,y,w,h]` in points) |
| host → engine | `resize`, `show`, `focus`, `load`, `nav` (`back`, `forward`, `reload`, `stop`), `mute`, `fps`, `repaint`, `close` | `id` plus the change |
| host → engine | `mouse`, `key`, `ime`, `edit` | input for page `id`, in its CSS pixels; CEF event flags in `m` |
| host → engine | `devtools` | `id`, `m`: one DevTools protocol message |
| host → engine | `ack` | `id`, `k` (0 view, 1 popup widget), `s` (slot) |
| host → engine | `answer`, `policy`, `quit` | `q` and the answer; rule fixtures; end |
| host → engine | `cookies`, `set-cookies` | `q`, `scope`: every cookie of that world's storage, answered as `cookies`; `scope`, `set`, `remove`: cookies to set and delete ([Cookies](#cookies)) |
| engine → host | `ready` | `cef`, `chromium` |
| engine → host | `created`, `popup` (`opener`, `url`), `closed` | page lifecycle |
| engine → host | `tab` | `url`, `background`: a link for a new tab in a Browser tab's page (`tabs` on `create`) |
| engine → host | `navigate`, `address`, `loading`, `loaded`, `failed`, `title`, `fullscreen`, `gone`, `shield` | page state |
| engine → host | `refused` | `kind` (`navigation`, `popup`), `reason` (`address`, `popups`), `scheme`, `host`: a link the person followed that the rules kept out |
| engine → host | `frame` | `id`, `k`, `s`, `g` (generation), `w`, `h`, `f`; Windows adds `handle` on a new slot |
| engine → host | `widget`, `cursor`, `tooltip`, `ime` | presentation for the surface |
| engine → host | `devtools`, `download`, `ask` | protocol traffic, download progress, questions |

### Cookies

Each engine keeps its own cookie storage, so a sign-in on Electron's views (the X, Douyin and Twitch Applets, a site
moved there for its video) did not reach the engine's pages, nor the other way (owner report 2026-10-08). The host's
`cookie-bridge.ts` keeps the two alike for each world, by the rules in `core/browser/cookie-sync.ts`. A cookie that
Electron's storage sets or deletes goes to the engine at once, or when the engine next runs. The engine has no cookie
events, so the host reads its cookies (`cookies`) after a page loads and every half minute while a page shows, and
makes the changes since the last look in Electron's storage. A just-started engine has nothing to compare with: each
side then only gains the cookies it lacks, so a stale copy never replaces a fresh sign-in. A page opens once the
engine has Electron's cookies, waiting at most 1.5 seconds. Other browser storage stays per engine, except when a page
moves between the engines (video, passkey, Google sign-in) and stays on its origin. The host then reads the site's
`localStorage` from the old page, at most 2 MB, and the new page's first document gets the same copy before the site's
own scripts run (`core/browser/storage-carry.ts`). IndexedDB stays per engine.

## Building

`node scripts/build-web-engine.ts [--arch arm64|x64] [--force]` builds the engine.

- **Inputs.** It downloads the pinned CEF minimal distribution once and builds with CMake.
  - Worldlet's own CEF build with H.264/AAC (#1174) is used once `cef.json` pins it by SHA-256 under
    `codecs`. On a Mac that needs both architectures, so a universal app merges two engines of the
    same build.
  - Otherwise it uses the standard build (SHA-1 checked), the one the retired Mac host pinned.
  - `WORLDLET_CEF_STANDARD=1` keeps the standard build.
  - The engine records which build it is in `web-engine.json` (`codecs`).
- **Output.** It assembles `Worldlet Web.app` on macOS (with the helper apps and the host's
  `worldlet_surfaces.node`) or `Worldlet Web\` on Windows.
- **Cache.** Built engines live in the machine cache by source stamp (`WorldletBuild/WebEngine`);
  `.local/web-engine/<platform>-<arch>` links to the entry. Worktrees, Dev candidates and
  release-candidate runs with the same sources share one build.
- **Development builds.** `scripts/build-electron.ts` builds the engine on macOS, Windows and Linux; a
  failed build leaves the panels on Electron's views and prints why. `WORLDLET_SKIP_WEB_ENGINE=1`
  skips it.
- **Toolchains.**
  - macOS: Xcode command-line tools, plus a private CMake if none is installed.
  - Windows: Visual Studio with the C++ tools; its bundled CMake and Ninja run in the vcvars64
    environment.
  - Linux x64: CMake, Make and a C++ compiler. The engine lives in `worldlet-web/` (no space: Chromium
    splits its sandbox helper's path at spaces). Chromium's sandbox needs user namespaces or its
    setuid helper `chrome-sandbox`; the build prints the commands for the helper. An app started
    with `--no-sandbox` (as root in a container) starts the engine without the sandbox too.

### Worldlet's own CEF build (H.264/AAC)

`node scripts/build-cef.ts [--arch arm64|x64] [--pin]` builds Worldlet's own CEF minimal
distribution with proprietary codecs (#1174). The standard CEF build has no H.264/AAC, so
H.264/AAC-only video (X) does not play on it. The owner deferred this build on 2026-10-02 and
dropped it again on 2026-10-06 (the build overran 02's 16 GB), moving the X Applet to Electron's
views instead: no archive is pinned, so engines use the standard build.

- **Source.** It runs CEF's own `automate-git.py`, taken from the pinned CEF commit (`cef.json`
  `codecs.cef`: branch 8037, Chromium 154.0.8037.58), with depot_tools.
- **Build settings.** Release build with `codecs.gn`: `proprietary_codecs=true`,
  `ffmpeg_branding=Chrome`, an official build without PGO profiles and without symbols.
- **Where.** The source and builds live in the machine cache (`WorldletBuild/CEFSource`, about
  100 GB). Each architecture takes several hours. The build shares the host with RCs and releases,
  so it runs at background priority with a fixed job count: half the cores and at most one job per
  4 GB of memory, 4 on 02 (`--jobs N` or `WORLDLET_CEF_JOBS` overrides). With autoninja's default
  of every core, 02 ran out of memory, WindowServer stopped and its watchdog panicked the kernel
  (2026-10-06). On a Mac or Linux it also stops while the host's RC or release runs (their state
  files in the checkout's `.local/`, or `--host <checkout>` when the script runs from a copy) and
  continues afterwards. On a Mac the build uses Xcode through `DEVELOPER_DIR` and leaves the system's
  selection alone.
- **Output.** It leaves `cef_binary_<version>_<platform>_minimal_codecs.tar.bz2` beside the
  downloaded distributions and prints its SHA-256. `--pin` writes the SHA-256 into `cef.json`.
- **Shipping.** Upload the archive to `codecs.source` (a release of this repository) before
  shipping, so other machines download the same bytes.

## Checks

`npm run test:electron -- modules/browser/engine` runs on a disposable profile with the development
rehearsal site. It uses no network and no account. It checks that:

- the engine's URL, popup and new-tab rules match the parity fixtures;
- cookies set, changed and deleted in either the engine's storage or Electron's reach the other;
- a page's pixels reach the panel through the shared surfaces, with Chrome's own layer present and
  the panel's size;
- typing, an input-method composition and a click reach the page;
- a popup stacks over its opener and Back closes it; in a Browser tab's page a link for a new tab is reported
  as `tab` instead, while a window the page sizes itself still stacks;
- a link the rules keep out (an app link, a window to a non-public address) is reported, not silent;
- Fox's DevTools relay refuses browser-wide commands;
- shown smaller (task picture in picture), the page keeps its size and takes presses instead of
  clicks, Fox's driver still clicks its elements at the page's own coordinates, and frames follow
  `pageFrameRate` in the panel, the window and out of sight;
- a one-second H.264/AAC clip (`platform/browser/fixtures/h264-aac.mp4`) plays on Worldlet's own
  CEF build, and the standard build reports that it cannot play it;
- through the panel's own device and real windows, Fox's page moves beside the desktop Companion
  and back;
- two pages render and take input each on its own, two Fox drivers run at once on separate pages,
  and one page plays sound at a time.

On macOS and Windows a missing engine fails the check; elsewhere the check reports it and passes.

## Not yet established

- **Owner acceptance.** A fresh real-account Google sign-in on the Mac engine passed (#1089,
  2026-10-02). Persistence after relaunch on a signed release and "Sign in with Google" popups are
  not yet checked.
- **Video formats** (#1174): the own codec build is not used, so H.264/AAC-only video does not play in the
  engine. The X, Douyin and Twitch Applets run on Electron's views instead, and any other page that needs those formats moves there by itself ([video formats](../browser/INTEGRATION.md#native-browser)).
- **Linux** (#1178): the engine checks pass under Xvfb with software frames; GPU frames (dmabuf),
  real-device acceptance and the packaged Linux app are not established.
- **Later features:** iCloud Keychain passkeys (#1177, the entitlement request). Several pages at once
  ([integration](../browser/INTEGRATION.md#several-pages-at-once), #1176) and the task picture in
  picture ([integration](../browser/INTEGRATION.md#task-picture-in-picture), #1175) use the engine's
  independent pages and scaled display. A separate window for one page is not built.
- **Accessibility.** VoiceOver and Narrator do not yet read pages in the engine.
- **Input.** Drag and drop into pages and trackpad pinch-zoom are not forwarded.
