# Embedded browser

Entertainment holds the TikTok browsing Applet and the YouTube Applet; Social holds the X and Discord browsing Applets. Website Applets fill the left two-thirds panel; the Applet model and Fox stay on the right. Navigation uses the website or Fox; World returns to the world. There is no permanent Worldlet toolbar over the page. A blocked sign-in shows a short explanation and an explicit external-browser action above the page.

YouTube opens youtube.com in this panel; its player and queue are Fox's tooling, see [YouTube Applet](../../core/applets/INTEGRATIONS.md#youtube-applet). The [Google sign-in refusal](#google-sign-in-refusal) below applies to YouTube and any other website panel. Discord specifics are in [Discord Applet](INTEGRATION.md#discord).

<a id="native-browser"></a>
## Website views

Website panels run on the [CEF website engine](../web-engine/README.md) (#1170). It is a separate process with Chrome's own layer, which Google's sign-in accepts where it refuses Electron's views (#1089). Each page renders windowless; the host draws its frames in a trusted surface view placed over the World view, at the rect the World page reserves. Input goes back to the engine (`platform/electron/src/modules/browser/device.ts`, `engine/`). Where the engine is not built, or with `WORLDLET_WEB_ENGINE=electron`, the panels are sibling `WebContentsView`s instead (`page.ts`), sandboxed with no preload or host bridge. Both engines keep one page contract, so every rule below holds on either. The panel follows the DOM-measured viewport; it does not launch an external browser window.

On the CEF engine, website state lives in request contexts under `<library>/Browser/CEF`: `Website` for the personal world and `Practice` for the practice world. On Electron's views it lives in session partitions, `persist:website` for the personal world and `persist:website-practice` for the practice world, under `<library>/Browser/Electron/Partitions`. The two keep the same cookies, so a sign-in on one holds on the other (owner report 2026-10-08, [cookies](../web-engine/README.md#cookies)); other browser storage stays per engine. Release, main Dev and linked-worktree libraries stay separate. Sign-ins from the retired CEF profile (`Browser/Chromium/Default`) and earlier WebKit cookies/passwords are not carried over; people sign in again. Worldlet's API connector grants, sources and conversations are unchanged. The dedicated YouTube player is its own `WebContentsView` in the same website partition, independent of generic website panels.

The YouTube Applet's official player and queue (`platform/electron/src/modules/browser/youtube.ts`, Fox's tooling) are not a website panel, and they stay on Electron.
- **Why.** The Applet holds no YouTube account (`ui/applets/youtube/panel.ts`, [Google OAuth review](../../docs/GOOGLE-OAUTH-REVIEW.md)), so the player is an Electron view in its own account-less session and plays only public links. The CEF engine's signed-in contexts would give it the person's account.
- **youtube.com itself** runs in the panel on the engine, signed in once the person signs in there.

Popups share their opener's session and stack over it inside the same panel. Back closes a popup when it has no back history. Releasing a page destroys its browser view, including scripts/media, without closing the Worldlet window; leaving a website Applet may first keep it hidden (see [Resuming a website Applet](#resuming-a-website-applet)), or keep it playing as the World's [picture in picture](#picture-in-picture) window when the person chooses that. Browser state persists separately from live views. HTTPS public destinations are allowed; local files, loopback/IP literal destinations, credentials in URLs and nonstandard ports are refused. A page stacks at most four popups. A link the person follows into a refused place (an app link such as `mailto:`, a non-public address, a fifth window) is never silent: the panel says where it led and why, and the World's activity record and diagnostics keep its scheme and host, never its path (`linkRefusedMessage`, owner report 2026-10-06). A page that fails to load records its network error code and host the same way, so an Order made on it carries them. An engine change does not establish Google embedded-login or passkey support.

**A slow or stalled engine (owner Orders 2026-10-07 on 3084).** The engine ignores every message for a page it has not made yet, so the host sends a page's load, place and visibility once the engine reports it `created`, however long that takes on a busy computer; before, a load sent during a slow start was dropped and the page stayed blank. A shown page that has drawn nothing for 12 seconds (`ENGINE_STALL` in `engine/page.ts`) means the engine stalled: the host ends it, a new one starts and the page loads its address again, at most once every two minutes. A page still blank after that says it could not load instead of staying white, and a kept page whose engine ended reopens when it comes back. Diagnostics record a `webEngineStall` row with the outcome only.

**Video formats (#950, #973, #1174).** Website panels run the standard CEF build, which has no proprietary codecs: H.264/AAC-only video (X's, and HLS) does not play there, while YouTube's VP9/Opus does. The owner decided not to build Worldlet's own CEF with H.264/AAC (2026-10-02, and again 2026-10-06); the build script stays ([Worldlet's own CEF build](../web-engine/README.md#worldlets-own-cef-build-h264aac)). Electron's own views (the fallback, and the YouTube player) play H.264 and AAC, so **the X Applet's pages run on Electron's views** even where CEF is built (owner decision 2026-10-06, `ELECTRON_VIEW_APPLETS`, `pageEngine` in `engine/process.ts`). The Douyin Applet does too: its videos are H.264, and in the CEF panel its security check left the page blank or on "浏览器版本过低" (owner Order 2026-10-06 on 2915); people sign in to Douyin there (its QR code works). The Twitch Applet does too: its streams are H.264/AAC only, and in the CEF panel the player said "This video is either unavailable or not supported in this browser (Error #4000)" (owner Order 2026-10-07 on 3039). Every other site moves by itself (owner Order 2026-10-07, 越自动越好): each CEF page's main world gets a document-start script before its first load (`platform/bridge/video-formats.js`; the page starts blank and Back never returns there) that only counts what the page was told about H.264/AAC/HLS, what video it set up or played, and video that failed for want of a playable stream (a sound that fails, such as a game's music, does not count: Pokémon Showdown moved for it and lost its sign-in, owner report 2026-10-07). When `core/browser/video-formats.ts` says the page needs those formats (nothing played, and either a stream failed or the page was refused one at least five seconds ago while showing a video the size a person watches; YouTube's VP9 fallback never counts), the panel reopens the page at the same address on Electron's views and the World remembers the site (`video-formats-v2` records, up to 200; the first version's records, which included sites moved for a sound, were dropped on 2026-10-07), so it opens there at once next time. The host's log notes the move; it is not reported as an error. The same trade-offs as X apply to a moved site: its sign-in is separate and Google sign-in is refused there. Its sign-in lives in the Electron partition (`persist:website`), so people sign in to X once more; Google refuses its sign-in there (#1089), so X's "Sign in with Google" does not work in the Applet (a password or Sign in with Apple does). The task picture in picture's scaled display and Fox's page beside the desktop Companion are CEF features, so X's pages are shown unscaled and stop when the World window leaves. x.com opened in the Browser Applet stays on CEF.

Location requests are answered only for Google Maps pages; Chromium's location provider then answers after the OS grants it. Meeting websites (Google Meet, Zoom, Teams) get camera/microphone with no question from Worldlet (owner request 2026-10-07); Worldlet asks the OS for that device (macOS asks the person once; Windows' privacy switch is read) and, when it is off, says where to turn it on. On the CEF engine the site's Permissions API then reads the device as granted. Other permission and desktop capture requests are denied (`surface.ts`, `device.ts`, `media-access.ts`). These paths need real-device permission acceptance on Electron.

Fox uses the Worldlet gateway and private-context gate. The host calls
`browserDriverStart` / `browserDriverNext` in `core/browser/driver-flow.ts`, then
executes the returned commands through the pinned agent-browser runtime and
`platform/browser/agent_browser.py` (`modules/browser/agent.ts`). Its DevTools IO
attaches through `webContents.debugger` to the selected page only (`page.ts`). The
host owns no second browser command policy.

The driver transport is local, authenticated and restricted to the selected page;
it is not a general remote-debugging endpoint. `platform/electron/src/main.ts` removes
`--remote-debugging-port`, `--remote-debugging-pipe`, `--remote-debugging-address` and
`--remote-allow-origins` from the launch command line in release and Dev alike, so no
debugging port exists. The visible website view runs with background throttling off: Fox
finishes browser tasks while the person may be in another app, and its steps wait on the
page's animation frames; kept (hidden) pages are throttled. Manual check on a built Mac app:
launch `Worldlet.app/Contents/MacOS/Worldlet --remote-debugging-port=9222`, then
`lsof -nP -iTCP:9222 -sTCP:LISTEN` must print nothing (not yet recorded for Electron).
External pages receive no World host bridge. The DOM adapter still supports page reading/bookmark observation;
it is no longer the primary click/fill automation driver. Snapshot references,
sensitive-field filtering and consequential-action review remain shared rules.
Arbitrary cross-origin frame coverage and real-account task success are not
established by the engine change.

## Resuming a website Applet

Opening a website Applet again (YouTube, X, TikTok, Netflix, Browser, the Web view of a
scene Applet and every other Applet with a website) shows the page the person left, not
its start page. The rule is shared: `core/browser/page-resume.ts` decides, the Browser
panel (`ui/browser/browser-device.ts`) applies it, and the host only keeps, shows and
releases pages as the `browserShow`/`browserHide` requests say (`contracts/browser-surface.ts`;
`platform/electron/src/modules/browser/device.ts`).

- **Live page.** Leaving (Back to the World, another Applet, a dialog over the panel)
  keeps the page hidden with its media paused and muted. The most recently left Applets keep
  their page for ten minutes; returning shows it exactly as it was (scroll, form input, video
  position). Each live page costs a renderer process, so how many stay live is the host's
  [page budget](#several-pages-at-once), which counts the picture-in-picture window too: two
  pages on a machine below 16 GB.
- **Remembered page.** When the live page was released (older, over the budget, memory pressure or a
  restart), the Applet opens its last remembered page instead. At most 48 Applets keep one address each, in
  the World page's local storage on this device, never in analytics or anything Fox receives
  (the World backup does not include browser storage).
- **Memory pressure.** Electron has no memory-pressure event, so while a page is kept the
  host samples memory every 30 seconds (`PAGE_MEMORY` in `core/browser/page-resume.ts`,
  read by `platform/electron/src/modules/browser/memory.ts`): memory the system can hand out
  and the app's footprint, the working sets of `app.getAppMetrics()` plus the CEF engine's
  whole process tree (from `ps`; Electron's metrics leave it out). On macOS available memory
  comes from `vm_stat` (free, inactive, speculative and purgeable pages; Electron's free
  memory counts free pages only, which macOS keeps near zero) and the kernel's pressure level
  (`kern.memorystatus_vm_pressure_level`); elsewhere from `process.getSystemMemoryInfo()`.
  While the system reports warn or critical pressure, available memory is below 512 MB or 5%
  of the total, whichever is smaller, or the footprint is above 3 GB, each reading releases
  the oldest kept page; returning to it opens the remembered page. The visible and the
  picture-in-picture page are never released. Diagnostics record a `keptPageRelease` row
  with the reason (`lowMemory` or `appFootprint`), never the page or its address.
- **Idle engine.** With no CEF page left the engine ends after five minutes (`ENGINE_IDLE_MS` in
  `engine/process.ts`), giving back its browser and GPU processes; the next page starts a new one. A page
  opened while it is ending waits for it to end. An Order's `metrics.json` carries the engine's memory
  (`webEngineMemoryMB`) and the reading pages are managed by (`pages`).
- **No sound by itself.** A returning live page and a freshly opened remembered page
  (`hold`) run the shared media hold (`platform/bridge/media-hold.js`): playing media is
  paused and anything the site starts stays paused until the person's first real pointer,
  key or wheel input on the page; after that the site behaves normally (a feed may
  autoplay its next video). The page stays muted until the hold is in place. Media inside
  embedded frames or shadow roots is not held; it is silent only until then. A start page
  or a page Fox opens plays as Chromium's autoplay policy decides, as before.
- **What counts.** Only public HTTPS pages the person reached in that Applet. Site-locked
  Applets (X, YouTube, TikTok, Airbnb, Google Maps) keep only their own site; sign-in,
  OAuth and callback pages are skipped. A page Fox opened or reached is Fox's and is not
  remembered as the person's. A restored page is not an address "given by the user":
  it never enters the navigation gate's trusted or mentioned addresses.
- **Worlds stay apart.** The practice world remembers pages only for its session and
  never reads the real world's; switching worlds releases every live page, and the host
  keys live pages by world. An address the host refuses is forgotten and the start page
  opens.

Checks: `node scripts/page-resume-check.ts` (rule, bounds, parity vectors) and
`node scripts/applet-resume-check.ts` (World UI with a faked bridge, and the media hold in
Chromium); `npm run test:electron -- modules/browser` drives the memory-pressure release
with injected readings (order, protected pages, diagnostics). The real-page kept-page check of the retired Mac host (kept, returned, held,
released, practice isolation) is not yet ported to Electron; device acceptance of kept
pages on Electron is pending.

## Focus

Every website page opens in Focus (owner request 2026-10-05). The rule is shared: `core/browser/page-focus.ts`
decides what Focus does on a page (`pageFocusPlan`), the host applies it on each page load
(`platform/electron/src/modules/browser/device.ts`) by evaluating `browser/page-focus.js`
(`platform/bridge/page-focus.ts`, bundled with Readability by the native UI build) in the page's isolated world, and
the Browser panel shows the switch after Back (`ui/browser/browser-device.ts`).

- **Articles.** Off app-style sites and sites people work in, a page that Readability finds readable and whose article
  has at least 900 characters shows only that article: a reader page over the site's page, in a closed shadow root,
  with the page underneath kept still. The article's markup is made inert (no scripts, handlers or script addresses).
  A page with an editor (a `contenteditable` region, a focused text field) stays the page. A page that fills in its
  article after load gets one more look 1.5 s later unless the person already moved on it, and a single-page site's
  new address drops the old article and looks again.
- **Hidden parts.** Ads and cookie walls everywhere, and each app-style site's own parts (`FOCUS_SITES`: YouTube's
  related column and Shorts shelves, X's sidebar, Reddit's and Zhihu's side columns, Bilibili's recommendations…), by
  one style rule per selector. A selector that does not parse, or that would hide the whole page, is skipped.
- **The person's choice.** The switch sends `focus` with `on`; the site's choice is a `site-focus` record in the World
  (`world.sqlite`, at most 400 sites, the oldest choice going first). Turning Focus off removes the reader page and the
  style rule, so the page is exactly as the site drew it. The practice world applies the choice to the open page only.
- **Rules Fox writes.** When the person presses Clean up beside Fox on a website page (`FOCUS_RULES_REQUEST`), or
  asks Fox to clean up the site open now, Fox reads its outline
  (`browse_web` `outline`: the page's parts with a CSS selector, position, share of the page's text and opening words,
  measured without Focus's rules, private-context consent required, untrusted content) and saves the parts to hide
  (`browse_web` `focus` with `hide`). They replace the site's earlier saved rules in its `site-focus` record, apply at
  once and on every later visit, and keep the site's page (no article). Each is one plain selector; anything that could
  escape its style rule or hide the whole page is refused. Fox writes rules only when asked; it never turns Focus on
  or off.
- **Fox.** Fox works on the site's own page: Fox's first browser step on a page turns Focus off there, and pages
  loading within 90 s of Fox's last step open without it. The switch then reads as off while Fox works; pressing it
  turns Focus back on. Fox cannot turn Focus on or off.
- **Limits.** No model is involved. Article extraction is Readability's heuristic, so some pages (galleries, forums,
  live blogs) may show less than their main content; the switch shows the whole page. Site rules follow each site's
  current markup and need updating when a site changes it.
  Frames and shadow roots inside the page are not reached by the rules.

## Picture in picture

While a website Applet's page plays a video, **Picture in picture** (#919) appears in
the Applet's [top bar](../../ui/components/INTERACTION.md#top-bar), right of the title, as the
same kind of control as Back (#951). Choosing it goes back as Back does, but the page is not
hidden: it keeps playing, with its sound, as a window in the World's right third that shows
only the video (#950). Leaving any other way (Back, World, another Applet) works as before.
The rule is shared: `core/browser/picture-in-picture.ts` decides which Applets offer it, where the window shows,
its size and where it may go; the Browser panel (`ui/browser/browser-device.ts`, with the offer
and the window's frame in `ui/browser/picture-in-picture.ts`) applies it; the host only places,
shows and hides the page as `browserPip` says (`contracts/browser-surface.ts`;
`platform/electron/src/modules/browser/device.ts`) and runs the shared page script.

- **Offer.** Applets whose own view is their website (`fullView.kind: 'web'`: YouTube, TikTok,
  X, Netflix, Twitch, Browser and the rest), while the host reports a playing video: the
  biggest playing one, at least 200 px wide and an eighth of the page, so a hover preview
  does not count. The host probes every three seconds while the panel shows, so the offer
  can trail the start of playback by that much. Never while Fox drives the page, and only on
  hosts that declare `browserPictureInPicture` (the Electron host does, on every OS).
- **The window.** 16:9 in a paper frame whose bar holds a resize grip, the Applet's name and
  Close. By default the frame is the World's right third with 16 pt all round. Dragging the
  grip (the frame's top-left corner) or its arrow keys resizes it, from 240 pt of video up to
  half the World; the size is kept on this device as a share of the World's width. The window
  moves up past anything it would cover (Fox, its dialogue, the footer, an open panel), and
  where that leaves no room it narrows, down to 240 pt; below that it draws nothing and keeps
  playing until room returns. It appears in place: nothing shrinks or animates, with or without
  reduced motion.
- **Only in the World.** The window shows in the World and its regions. Inside an Applet,
  content or search it waits out of sight, still playing, and returns when the person is back
  in the World.
- **One sound at a time.** When a page starts audible media (the person plays a video in X, for
  example), the page playing before it pauses, so the window never talks over the Applet the
  person opened. Chromium does this itself: the host enables its audio focus
  (`AudioFocusEnforcement`, `platform/electron/src/main.ts`). Muted autoplay, short
  sounds (which only lower the others) and WebAudio cues such as the World's take no part.
- **One window.** Choosing it on another page, for example X's video while YouTube is in the
  window, moves the window to that page; the previous page is left like any page the person
  leaves, hidden, paused and muted, live for a quick return. The page already in the window
  stays as it is.
- **Only the video.** The page keeps its document. The shared page script
  (`platform/bridge/picture-in-picture.js`, in the page's isolated world) marks the playing
  video and adopts a constructed stylesheet that makes it fill the page's viewport and hides
  the rest; an added `<style>` element would fall to a site's `style-src` policy. Returning or
  closing removes both, and a new document in the window gets them again. It is cosmetic only:
  it reads no content, sends nothing and has no bridge or authority. Videos inside embedded
  frames or shadow roots are not found, so such pages are not offered.
- **Return and close.** Pressing the window (a transparent catcher view lies over the page,
  which takes no input there), its name or its **Back** button opens the Applet, and the same page returns to the panel at full
  size, still playing, on the platform it had. Close leaves the page as any page the person
  leaves: hidden, media paused and muted, live for a quick return. While it shows, the window's
  page is live and takes one of the two live places. A world switch, a World page reload or
  the window detaching into the desktop Companion closes it.
- **Not Chromium's own picture in picture.** Chromium's picture-in-picture feature opens a
  separate floating window rather than one inside the World beside Fox; it is not used, and
  the owner does not want that window.

Checks: `node scripts/picture-in-picture-check.ts` (rule, size, placement, live places),
`node scripts/applet-pip-check.ts` (World UI with a faked bridge: offer, the right third clear
of Fox, its dialogue and the footer, resizing and the kept size, waiting out of sight in
another Applet, switching to another site's video, return, close, a host without the feature;
and the page script in Chromium's isolated world under a strict `style-src` policy) and the
browser surface contract check. The real-page picture-in-picture step of the retired Mac
host is not yet ported to Electron: the window over real pages, the catcher, audio focus
pausing the window's sound and the return at full size still need Electron device acceptance.

## Several pages at once

Several website pages can be alive and shown together (#1176). On the CEF engine each page renders and takes
input on its own, and Fox's agent-browser relay is per page.
- **Budget** (`core/browser/budget.ts`, `browserBudget`). The host reads its memory and sends the budget with
  its capabilities (`browserBudget`). The panel keeps pages live by it (`livePagePlan`).
  - Live pages, the kept pages and the picture-in-picture window: two below 16 GB of memory, four from
    16 GB, six from 32 GB. Never more than free memory holds at 350 MB each, and never fewer than one.
  - Concurrent Fox browser tasks: one below 16 GB, two from 16 GB. Fox's gateway drives the panel's visible
    page, one page per turn; the engine can run two drivers on separate pages at once.
  - An older host that sends no budget keeps the earlier bound, two pages and one task. Memory pressure
    still releases kept pages as above.
- **One sound at a time.** Pages share audio focus (the engine enables Chromium's `AudioFocusEnforcement`):
  a page that starts playing pauses the one that was playing.
- **Tabs in the Browser** (owner request 2026-10-07: booking flights and hotels needs several pages;
  `core/browser/browser-tabs.ts`, `ui/browser/browser-device.ts`). Only the generic Browser has them; website
  Applets keep one page. Each tab is its own kept page under an Applet-like key (`browser`, `browser--2`…), sent
  as `applet` in `browserShow` and listed in `live`, so the budget above decides which tabs stay alive: picking a
  live tab shows its page as it was, a released one opens again at its last address (`hold`). Up to eight tabs;
  closing the active tab moves to its right-hand neighbour, and the last one leaves a fresh tab on the home page.
  The host treats a tab's page as the Browser's (`tabApplet`: engine choice, recordings). Fox, the page reports,
  Home, Back, Forward and Refresh act on the tab in view; the strip rests while Fox works on the page. Each tab's
  last address and title are kept on the device (`worldlet-browser-tabs-v1`, the practice world in memory only);
  after the Browser's 30 minutes away the tabs start again as one tab on the home page. The File menu's keys:
  ⌘T / Ctrl+T new tab, ⌘W / Ctrl+W close tab (⌘W still closes the window outside the Browser; Close Window is
  ⇧⌘W), ⌘⇧] ⌘⇧[ / Ctrl+Tab Ctrl+Shift+Tab next and previous.
  - A link for a new tab (`target=_blank`, a middle or ⌘-click) opens the next tab (owner request 2026-10-08): in
    front, or behind the page for a background click; at eight tabs a notice asks to close one. The page's engine
    decides by the window's disposition (`rules.ts` `opensAsTab`, the engine's `OpensAsTab`, parity fixture
    `browser-tab.json`): only in a Browser tab's page (`tabs` on `create`), with the person's click, to a public
    page that is not an account sign-in page. It reports `tab` instead of opening a popup; Electron's fallback views
    do the same in `setWindowOpenHandler`. A window the page sizes itself (`window.open` with a width, as sign-in
    windows are) still stacks over its opener as a popup, and website Applets keep their popups.
- **Not built.** A separate window that shows one page on its own (optional in #1176).

Checks:
- `node scripts/page-resume-check.ts`: the budget tiers, free-memory cap and bounds, and the live-page plan
  under a budget.
- `node scripts/browser-tabs-check.ts`: tab keys, add up to eight, select and step, close hand-over and the last
  tab, remembered addresses and labels, stored tabs revalidated. `node scripts/browser-tabs-ui-check.ts` (in
  `test:ui`) drives the strip and the menu's keys through the World UI with a faked host.
- `node scripts/applet-task-pip-check.ts`: Fox works on a copy of the page in the panel's corner, and its page goes out of sight with a badge when the person leaves.
- The engine check (`npm run test:electron -- modules/browser/engine`):
  - two pages render and take typing each on its own;
  - two Fox drivers run at once on separate pages, each answered by its own page;
  - the second page's sound pauses the first's.

## Task picture in picture

Fox's pages stay in their Applet (owner feedback 2026-10-02, replacing the window of #1175). Picture in
picture at the World's bottom-right is for videos only. Hosts that declare `browserTaskPictureInPicture` (the CEF website engine, which draws
a page as a texture at any size) keep Fox's page working when the person leaves; elsewhere leaving
hides the page as before. The Browser panel (`ui/browser/browser-device.ts`) applies it.

- **Fox's copy (owner request 2026-10-09).** When Fox starts working on the page in view, it gets a copy
  of that page in the panel's top-right corner, and the person keeps their own page and goes on using
  it (`FOX_COPY`, `foxCopyPlacement` in `core/browser/picture-in-picture.ts`).
  - The host opens the copy at the page's address on the same CEF engine, so it has the same cookies
    and sign-in, and plays it muted.
  - The copy keeps the panel's size as its layout size and is drawn smaller, about a third of the
    panel's width, so the site lays out as it does for the person.
  - Fox's steps go to the copy, including pages Fox opens. Fox's glow, pointer and steps card are
    drawn over the copy, never over the person's page.
  - A transparent overlay takes the copy's input. A press brings Fox's page into the panel in place of
    the person's, which closes, and Fox goes on there. Once Fox's turn has ended, a close control also
    shows; it closes the copy and leaves the person's page as it is.
  - Each layout carries `copy` while it lasts ([contract](../../contracts/browser-surface.ts)).
  - Without a copy, Fox drives the person's page in the panel as before. That happens when the page
    runs on Electron's views (X, Douyin, Twitch) or the panel is narrower than 720 pixels.

- **Still Fox's, over its device.** If the person leaves the Applet while Fox works, Fox's page (its
  copy, which takes the person's page's place) is never hidden. A small live screen sits over that Applet's device in the World, with a tail pointing
  down at it (owner decision 2026-10-02, `ui/browser/applet-task-screen.ts`), and the panel sends
  `browserLayout` with the screen's slot as `rect`, the panel's size as `page` and `press`. The page
  keeps its layout size, so Fox's references stay valid, and its next steps reach it; the engine
  draws it smaller at about 15 frames a second (`pageFrameRate`, [web engine](../web-engine/README.md)).
  Where the device is not drawn (another Region, an Applet open) or the screen would cover Fox, its
  dialogue or a panel, the screen hides and the rect is zero: the engine renders the page at 4 frames
  a second, never none, so the animation frames Fox's steps wait on keep running. The screen follows
  the device every frame while it moves and a few times a second while it is still.
- **What Fox is doing.** The screen's bar says the step Fox is on ("Opening youtube.com…", "Filling in
  the form…", "Thinking…"), from `worldlet:fox-step` (`{text, applet?}`: the conversation's turn, or
  an [Applet task](../../docs/FOX-AGENT.md#applet-tasks) naming its Applet); "Fox is working" until
  the first step (owner decision 2026-10-03).
- **Back to the Applet.** A press on the page in the screen (the host reports it) or on the screen's
  bar opens the Applet, and the page returns to the panel at the same size while
  Fox keeps working. The panel also announces `worldlet:fox-task` (`{applet, working}`).
- **After the turn.** When Fox's turn ends with the page out of sight, it is left like any page the
  person left (kept for a while, paused), the screen goes and a green check stays over the
  device until the person opens the Applet (pressing the mark opens it). An exclamation over a device
  means something needs fixing, never done.
- **Only browser work gets a screen.** Work without a page (reading mail, syncing) shows on the
  device's lamp and in the History page ([Applet runtime](../../core/applets/RUNTIME.md)).
- **Fox's page, wherever the person is.** Fox's view guard refuses relative actions once the person
  changes views (`ui/companion/companion-ai.ts`). Fox's steps on its held page are exempt: the page
  out of sight, or the one the person took back into the panel during the turn (`foxPageHeld`).
  Moving around the World therefore does not stop Fox. Opening another website Applet does: that
  Applet's page is the person's.
- **Beside the desktop Companion.** Closing or minimizing the World window stops website pages
  ([desktop Companion](../electron/COMPANION.md)), except Fox's own page: one out of sight, or one
  Fox is driving in the panel.
  - That page moves into a window of its own beside the Companion's window, placed by
    `desktopTaskPictureInPicturePlacement` (`platform/electron/src/modules/browser/task-window.ts`).
    It keeps its size there, and Fox keeps working.
  - While the World is away, the panel's layouts only tell the host whether Fox is working; Fox's
    steps card follows the page.
  - Pressing the window brings the World back with the page's Applet. Once Fox's turn has ended, a
    close control there leaves the page, and the World's window ends with it.
  - Fox's steps on its held page do not reopen the World. Any other way back puts the page where
    the World last placed it.
  - Other pages open again when the World returns.

Checks:
- `node scripts/applet-task-pip-check.ts`: the World UI with a faked bridge. It covers the page
  staying in the panel, leaving it out of sight at its size with the badge, Fox's next steps, the
  badge's return, leaving it after the turn, the World away for the desktop Companion, ordinary
  pages opening again after it, and a host without the feature.
- `node scripts/companion-main-session-check.ts`: Fox's steps on its held page pass the view guard
  and do not reopen the World from the desktop, and relative actions are still refused.
- `node scripts/picture-in-picture-check.ts`: the window's shape, frame rates and the placement
  beside the Companion.
- `npm run test:onboarding` on the CEF engine: Fox's first task with real Fox, finished in the
  Applet's panel.
- The engine check (`npm run test:electron -- modules/browser/engine`):
  - shown smaller, the page keeps its size and reports presses instead of taking clicks;
  - Fox's driver clicks a page element at the page's own coordinates;
  - the frame rate follows `pageFrameRate`;
  - through the panel's own device and real windows, Fox's page moves beside the Companion and back
    with its press and close.
- `npm run test:electron -- modules/shell`: the Companion tells the panel when it is out and back.
- The browser surface contract check.

## Saving X posts

A genuine user click on an X bookmark control starts observation; only a subsequent `removeBookmark` state counts as bookmarked. A failed or synthetic click saves nothing. This depends on X's current DOM and may need maintenance; no X API sync or full-account backfill is claimed.

Asking Fox to save captures the open post, or the post whose text is selected, locally without adding an X bookmark. Both paths use the source ingestion system with origin `x-bookmark`, the canonical post URL as external ID and a content-derived revision; repeated saves deduplicate. Nothing real enters the fictional sample bundle. Removing an X bookmark does not delete an already captured local source. On success a small spark travels from the reader toward Fox with an accessible "Saved to Fox" announcement; no model call is involved.

## Fox tools

Two browser tools are defined in `worker/companion-tools.ts`, emitted into the Hermes `tools.json` by `scripts/build-hermes.ts`, and executed in `ui/shell/notion-world.ts`:

| Tool | Scope | Operations |
| --- | --- | --- |
| `browse_web` | The X reading terminal (`ui/browser/browser-device.ts`) | `read`, `open` (an X post or profile URL), `scroll`, `back`, `forward`, `home`, `bookmarks`, `save`, `saved` (query local captures) |
| `automate_browser` | Any public HTTPS page in the embedded panel (agent-browser via `core/browser/driver-flow.ts`) | `open`, `snapshot`, `do` (steps in words, each control picked by the small model tier), `click`, `fill`, `submit`, `scroll`, `back`, `forward`; actions run directly except the last step, which asks once, and consequential ones leave a receipt |

Neither tool offers arbitrary JavaScript, posting, direct messages, likes, account settings or credential access. Real account content is never treated as sample data: any agent read requires private-context consent, even while the sample world is open. `automate_browser` limits are described in Search, browser and routines.

## Website authentication

Users authenticate directly in the visible website. Safari/Chrome logins do not transfer to the website partition. Password AutoFill, passkeys and provider-specific login/popups require separate real-account acceptance.

**Passkeys on Electron's views** (owner report 2026-10-08: LinkedIn's passkey sign-in stopped working). Passkeys and phone (QR) passkeys work on the CEF engine, whose Chromium draws their dialogs; Electron's views draw none, so a passkey request there fails. A site moved to Electron's views for its video (LinkedIn's feed) also signed in there. Every document on Electron's views gets a small watch in its own world (`platform/bridge/passkey-watch.js`) that reports a passkey request (`navigator.credentials.get` or `create` with `publicKey`, the email field's passkey suggestion included) and lets it go on. The host then reopens the page on the engine at the same address, where the person signs in. Its video pages open on Electron's views again afterwards, signed in alike ([cookies](../web-engine/README.md#cookies)).

**Google sign-in on Electron's views** (owner 2026-10-08: "先不自己编，做最佳实现"). Google refuses account sign-in in Electron's views (#1089) and accepts it on the CEF engine. When a main-frame navigation on Electron's views starts at `accounts.google.com` (`googleSignInPage`, `core/browser/sign-in.ts`), the host reopens the page on the engine before Google judges the browser. A page's own sign-in reopens at Google's address, so the return to the site finishes there. A sign-in popup (Sign in with Google on X), whose opener waits for it, reopens its opener page on the engine instead, and a notice asks the person to choose Sign in with Google again. For three minutes afterwards the page's video does not move it back to Electron's views. When it does move back, the sign-in goes along ([cookies](../web-engine/README.md#cookies)). Without a CEF build for the host, Google's refusal page and the system-browser offer stay as before.

**Saved sign-ins** (owner request 2026-10-07; `core/browser/saved-logins.ts`, `platform/bridge/login-watch.js`, `platform/electron/src/modules/browser/logins.ts`). Chrome's password manager and autofill belong to its `//chrome` layer, which the windowless CEF panel does not draw, so the World keeps sign-ins itself. Every website page's isolated world gets a small watch, the built-in browser's own. It reports three things: that the page shows a sign-in form, an account typed on its own step (an email page before the password page, kept by the host for five minutes), and the account and password when the person signs in. A sign-in is a trusted submit, Enter, or a press on a form's submit button or a button named like Log in, Sign in, Next or 登录, with a password typed. A form-less dialog such as Pokémon Showdown's counts; a show-password eye and one-time codes do not. A sign-in is saved without asking (owner 2026-10-08: "password 不用问 自动存"), and a changed password replaces the saved one; a short notice says **Password saved for AshK on play.pokemonshowdown.com**. On a site's sign-in form, a button per saved account (**Fill in AshK**) fills it in, as typing would. Passwords are encrypted with the system keychain's key (Electron `safeStorage`) into the World's `saved-logins` records. Only the host decrypts them, to fill a page or compare a new sign-in. They never reach the World UI, Fox (every `login*` browser command refuses an agent caller) or the recordings. Account sign-in hosts (`SIGN_IN_HOSTS`) stay uninspected, and the practice world keeps none. Settings › General lists each saved site and account, without the password, with **Delete**. A record another computer's keychain made cannot be opened, and filling it says to delete it. Worldlet's system-browser OAuth grant for Mail/Calendar is independent. See [website sign-in](INTEGRATION.md#sign-in-acceptance).

## Verification

- `npm run test:browser`: shared activity collection, Applet matching, bridge snapshot, Browser focus and outcome inspection (Playwright Chromium or pure modules, no Electron host), the agent-browser policy and the Python transport.
- `npm run test:browser:automation`: page automation through the World UI with a faked host: ordinary clicks and a search run directly, the last step asks once (Not now clicks nothing), also after reading a page, and nothing asks afterwards.
- `npm run test:ui` includes `applet-focus-check`, which enters a representative few Applets (YouTube, Airbnb and the Browser among the websites) and returns, `applet-resume-check`, which leaves and re-enters website Applets and reloads the World, `applet-pip-check`, which takes a playing page into picture in picture and back, and `browser-fox-glow-check`.
- `npm run test:electron`: the host contract registers every browser action the UI sends.

The real-page checks of the retired Mac host (`--browser-check`, `--browser-automation-check`: real pages in the panel, panel geometry, a covered window that keeps rendering, kept pages, picture in picture, the control indicator, driver fixtures) are not yet ported to Electron. Until they are, Electron browser behavior beyond the shared fixtures above is not established.

Real X login and a real bookmark require signing in inside the panel; fixture checks do not establish that a real-account bookmark succeeded.

## Consequential action receipts

A consequential click now records a local **unverified** receipt *before* dispatch. A successful click is not a completed purchase, cancellation, booking or message. Repeating the same document/control attempt is rejected. After dispatch the shared UI performs bounded, read-only result inspection; failures or cancellation never repeat the click.

Nothing is asked after the click (owner decision 2026-10-03). The only question comes before it: the last step that pays, orders, sends, submits, books, confirms, cancels a plan, grants access or deletes shows **Go ahead** / **Not now** in Fox (`browserFinalStep`, [conversation safety](../../ui/companion/CONVERSATION.md)). The site's own confirmation page for that step (*Confirm cancellation* after *Cancel free trial*) runs on the same Go ahead (`browserFollowThrough`), so it is not asked twice. After a Go ahead the UI inspects the result page and, once it is inspected, records the receipt as confirmed through `browserOutcomeAction`, which completes a linked task. Other consequential clicks keep their unverified receipt and their task stays open; Fox states what the page shows. `browser/receipts` restores records after interruption; `browser/outcome` with `receiptId` reads the current page again. An optional exact `taskId` on the click links a saved task. Completion is **user confirmed** by the Go ahead, not a merchant-verified receipt; a Go ahead whose result page shows a failure still settles the task, and Fox says so. Host confirmation rechecks the visible result origin and refuses to overwrite a linked task changed since the action. Unknown results leave Attention unchanged.

Receipts retain the control label, HTTPS origin, timestamps and optional task reference/snapshot. They do not retain page bodies, URL queries, cookies or credentials. Result-page text is transient evidence shown to Fox/the user. Clearing source/item data also clears these receipt records conservatively. The host persists receipts as `browser-actions` records in the World ledger and uses the shared begin/observe/resolve decisions. Redirects to another origin require returning to the original service's result page before confirmation.

Validation: `npm run test:browser-receipts` covers the shared begin/observe/resolve decisions; shared inspection fixtures cover retries, failure and cancellation without replaying a click. The host-level fixtures of the retired native hosts (durable pending records, double-attempt refusal, origin mismatch, direct user completion, task-version checks, deletion) are not yet ported to Electron. None of these establish installed-app or merchant acceptance; merchant-specific completion detection and refund/cancellation acceptance remain open.

## Sign-in acceptance

### Apple browser Passkey application

- [Managed entitlement requirements](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.web-browser.public-key-credential)
- [Application](https://developer.apple.com/contact/request/macos-browsers-passkeys/)
- Production bundle: `app.worldlet.mac`; main development bundle: `app.worldlet.mac.dev`.
- An organization Account Holder must apply. Review the real form after sign-in.
- Before claiming browser eligibility, implement and verify HTTP/HTTPS URL
  registration and incoming-link handling, plus the required URL/search/bookmark
  entry experience. The current HTTPS panel alone does not establish eligibility.
- After approval, enable the capability on the correct App IDs, install matching
  provisioning profiles, integrate them into both signing paths, then test the
  actual signed bundle. Merely adding an entitlement plist key is insufficient.

Draft description (not submitted): Worldlet is a macOS workspace with a
user-operated web browsing surface presented through website Applets. We want
users to authenticate directly with websites using system-managed passkeys,
without giving the companion Agent access to credentials. Please advise whether
this browsing experience qualifies for the macOS browser passkey capability.

### Account acceptance

1. Open a top-level Google website in Worldlet and sign in manually. Verify
   YouTube and Maps reuse the account where Google supports it.
2. Close the Applet, reopen it, quit/relaunch Worldlet, and recheck the account.
3. Exercise Sign in with Apple/Google popup open, focus, back, refresh, success,
   cancel and window.close; the originating website must remain usable.
4. On a username/password field, check AutoFill availability and perform
   user-confirmed filling. Do not log form values or authentication cookies.
5. After Apple approval, test Touch ID passkeys and security keys on the signed
   app. Separately verify Google accepts the browser; Apple approval alone does
   not establish Google compatibility.

Do not claim a system-browser login transfers a session into the embedded Chromium profile.

<a id="google-sign-in-refusal"></a>
### Google sign-in refusal (#1089)

Google can refuse account sign-in in a website panel. After the account name it shows its own "Couldn't sign you in. This browser or app may not be secure" page (`accounts.google.com/v3/signin/rejected`, formerly `/signin/v2/deniedsigninrejected`). The owner reproduced it on Dev main 3b2dd98 (Electron); the earlier CEF host could sign in. Google does not publish how it decides which browsers are embedded, and it requires browsers to identify themselves truthfully. Worldlet does not disguise the panel as Chrome or another browser: a partial disguise is inconsistent, and Google's reaction to it cannot be checked.

**Engine identity (#1089).** Measured on Linux with Electron 44.5.1 (Chromium 152.0.7977.130), loopback pages, no account:

- Electron sends no UA client hint headers (`Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`) at all: not with its default user agent, not with the panel's user-agent override, not after an `Accept-CH` opt-in. The missing headers are Electron's, not caused by the override. Pages still read `navigator.userAgentData` (brands `Not?A_Brand` 24 and `Chromium` 152, no Google Chrome brand). Chromium browsers send those three headers on every secure request.
- Electron's user agent names Electron, the app and the full Chromium version (`Chrome/152.0.7977.130`). Chromium's own user agent, which the CEF host used unchanged, has no embedder token and a reduced version (`Chrome/152.0.0.0`).
- The panel attached DevTools and ran `Runtime.enable` and its isolated observers on every loaded page, including Google's sign-in pages. The CEF host attached DevTools too, so this alone is not an established cause.

Website sessions now present the engine consistently (`core/browser/client-hints.ts`, `surface.ts`): Chromium's reduced user agent, and the three default hint headers on HTTPS (and loopback) requests, built from the same brands, mobile flag and platform the page's JavaScript reports. Headers the engine sends itself are left alone. High-entropy hints (full version list, platform version, architecture) are not sent as headers; pages still read them from JavaScript. Account sign-in pages (`accounts.google.com`, `appleid.apple.com`) are never inspected: as the main frame starts there the page's DevTools session detaches, so no `Runtime` domain, isolated observer, activity capture or agent runs on them, and the next ordinary page is inspected again (`page.ts`).

Whether these differences are what Google judges is a hypothesis: it is not established which signal triggered the reported refusal, and nothing here was checked against Google. The owner's real-account sign-in on Mac Dev 65112c9, which includes these changes, still ended on the refusal page.

**Electron compared with the former CEF host (#1089).** `node scripts/browser-engine-probe.ts --engine <binary>` opens one loopback page in the website session and in each given engine. The page reports its own facts back over HTTP, with no DevTools, account or external network. Measured on Linux on 2026-10-02:

- Engines: Electron 44.5.1 (Chromium 152); the CEF build the Mac host pinned, 154.0.28+g564dd6c (Chromium 154.0.8037.58), as `cefsimple` in Alloy and Chrome style; and a stock Chromium 141.

| Fact | Electron website session | CEF 154 (both styles) and Chromium 141 |
| --- | --- | --- |
| `window.chrome` | `{}` | `app`, `csi`, `loadTimes` |
| `Notification.permission`; `permissions.query` for notifications, geolocation, storage-access | `denied`; `denied`, `denied`, `denied` | `default`; `prompt`, `prompt`, `granted` |
| `navigator.languages`, `Accept-Language` | `en-US`, `en-US` | CEF `en-US, en`, `en-US,en;q=0.9` |
| User agent, `Sec-CH-UA` headers, `navigator.webdriver`, plugins, FedCM, conditional mediation | Chromium form, sent, `false`, 5, present, available | the same |
| Platform authenticator | unavailable | unavailable on Linux |

- **`window.chrome`.** It comes from Chrome's own renderer layer (`//chrome`), which CEF runs in both styles and Electron does not include. Electron cannot provide these objects without imitating Chrome, which this section excludes.
- **Permission states.** Electron's permission check handler can only answer yes or no. The panel answers no for anything not granted, so pages read `denied` where a Chromium browser reads `prompt`.
- **Passkeys on Mac.** The owner saw a passkey offer after sign-in on the CEF host. That points to Chrome's Mac platform authenticator, which Electron reports as unavailable. This was not measured on macOS: run the probe there with the CEF Mac build (#1120).
- **Cookies.** Electron keeps cookies without an expiry only for the session (CEF had `persist_session_cookies`); Google's account cookies carry expiries.

Which of these Google weighs is not published. The `//chrome` layer is the one difference that separates Electron from both the former host and Chromium, and it cannot be closed truthfully inside Electron.

Worldlet still does not block Google up front. It recognizes the refusal page (`core/browser/sign-in.ts`). The page stays visible. Fox says Google doesn't allow signing in from the built-in browser and that YouTube videos still play signed out. One explicit **Open YouTube in your browser ↗** action (the Applet's title) sits beside the page. Nothing opens by itself. The action opens the Applet's site in the system browser, never Google's sign-in page, and it leaves with the next page or when the person leaves the Applet; a later refusal shows it again. Diagnostics record `google-sign-in-rejected` without the URL. A step of an account sign-in page that fails to load (for example a form page Google will not resubmit, or a stopped engine) gets its own message instead of the generic “ask Fox to retry”: start the sign-in again, or sign in in the browser, with the same browser action. Every load failure records its network error code and host, never the path, as `unavailable net <code> <host>` (owner report 2026-10-02, where the cause could not be read back).

Signing in through the system browser does not sign the panel in. The panel's session stays signed out, so signed-in YouTube (subscriptions, history, Watch later, comments) works only in the system browser.

Checks:
- `node scripts/browser-sign-in-check.ts`: the rule and the World UI action, with a faked bridge.
- `npm run test:electron -- modules/browser`: the host turns the refusal URL into the error and the YouTube destination; a real website session on a loopback page sends the user agent and hint headers its JavaScript reports; a page starting toward a sign-in host loses its DevTools session until the next page.
- `node scripts/browser-engine-probe.ts --engine <binary>`: a measurement, not a pass/fail check. It prints the engine facts above for the website session and each given engine, and lists the facts that differ.

Neither check signs in to Google. Whether Google still refuses sign-in in the panel, and whether a sign-in that Google accepts persists across restarts (Account acceptance step 2), needs a manual run with a real account on each platform (#1120). The client-hint platform values for macOS and Windows are derived the same way but were measured only on Linux.

## Browsing memory

Worldlet remembers eligible pages visited in its embedded browser, starting with
this version. It does not import Safari/Chrome history or reconstruct visits made
before recording began. Sample mode neither captures nor returns personal history.

### Capture and local storage

While the browser window is visible, a three-second timer checks the loaded main
page, including single-page-app URL/title changes. It records the HTTPS URL,
title, actual visit time and up to 6,000 characters of rendered text/image alt
text. Form values, scripts, hidden text, cookies and browser storage are not read.
Short visits that finish before the timer and content rendered only in images,
canvas, closed shadow trees or subframes may be missed. There is no claim of a
complete browsing archive or visual image understanding.

Sign-in, checkout, account/message routes, known private mail/workspace hosts,
credential-bearing URLs and pages with password inputs are excluded. This is a
conservative exclusion policy, not a general sensitive-data classifier. Eligible
page snippets may still contain personal information. Tracking parameters are
removed; product query parameters and functional fragments remain.

`browser-history.json` lives in the library root (`<library>/browser-history.json`),
outside the repository. Atomic writes retain at most 10,000 page/day records. Repeated
captures of the same URL on the same local day update its latest snapshot;
visits on different days remain independently searchable. Restart preserves the
history. Clearing all local Worldlet data includes this file. There is currently
no separate browsing-history management screen. Capturing locally does not call
a model, create Attention items or send page text to a server.

### Fox retrieval

`browse_web(operation: history)` is available without opening a browser panel.
It requires the existing private-context consent before returning snippets to
Fox/the configured model. `after` is inclusive, `before` exclusive; date-only
values use the computer's local timezone. Results include actual visit timestamps, original
URLs, titles, excerpts, total, current time and timezone. Twelve distinct URLs
are returned per page; `offset` retrieves more. Keywords are OR-ranked, with
title/URL matches weighted above body matches; Fox can translate/expand terms or
inspect all records in a date range. There is no embedding index in this version.

Example: “Open the green shirt I looked at last week.” Fox searches last week's
visits with terms such as `green shirt linen jacket`; when ambiguous it should
show candidates or ask for one detail. It opens the chosen **returned URL** using
`browse_web(operation: open)`: inside an Applet the page opens there, elsewhere
over the World with its own Back (the Browser Applet is only its own entry, and
it starts on its home page, Google unless changed in Settings › General, after
30 minutes away; `core/browser/browser-home.ts`). It must not invent a prior
visit or replace recall with a fresh web-search result. Returned page content is
untrusted reference material, never instructions.

### Recall verification

- `node scripts/browser-history-check.ts`: the real UI/Hermes tool bridge, with a
  mock model/host transport, searches a date range and opens the exact returned
  clothing URL in Browser Focus. This does not measure a live model's interpretation.
- `npm run check:types`. No external purchase or account write occurs.
- The retired Mac host's real-page capture fixture (timer capture, password exclusion,
  query preservation, dedup, restart persistence, consent, sample isolation) is not yet
  ported to Electron.

## Discord

The `app-discord` website Applet opens `https://discord.com/app` in the shared
Chromium panel. There is no Discord API/MCP/bot integration or background message
reader. User sign-in belongs to Discord; closing the panel stops page/media while
retaining the website profile. Brand provenance is in `ui/applets/brand-assets.json`.

On request Fox starts from the selected server/channel, reads actual loaded content
and scrolls channel/message panes separately. A summary is not full-history access
or permission to send messages. Sensitive fields and private-context gates remain
shared. Voice/video and real-channel end-to-end acceptance are not established by
the website route. Use the shared browser fixture and Applet route checks.

## Cross-Applet outcome requirements

Mail → Browser → Attention remains a product goal, not a restored onboarding tour.
Discover a useful obligation from actual sources; inspect the official service;
show consequences and obtain explicit approval before a consequential action.

- Search bounded candidate metadata, then fetch original threads and newer
  confirmations. A receipt proves a charge, not usage or an unwanted subscription.
- Prefer a short supported action with verified eligibility. Price protection,
  earned rewards and unwanted renewals are candidates, not promised savings.
- Distinguish requested, submitted, confirmed and actually received outcomes.
  A local item marked done is not an external result or proof money was recovered.
- Before sending a write, persist its attempt; after uncertainty, inspect rather
  than resubmit. Link the result to exact source/task identities and retain receipts.
- No suitable finding is a valid result. Do not invent a task to populate the UI.
- Merchant-specific cancellation/refund execution and service-confirmed receipts
  still need real-account acceptance. Generic browser fixtures do not establish it.

Prior research considered Target price adjustments and directly billed Spotify
cancellation; neither is an accepted integration. Recheck current eligibility,
fees and account terms before acting. The research and retired tour implementation
remain in Git; the blueprint owns product priorities.
