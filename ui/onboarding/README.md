# Onboarding

## Current entry: bring your Agent, or Google then your apps (2026-09-25, local Agents 2026-10-02, three pages 2026-10-05)

Normal boot shows only a centered walking Fox, using the registered sprite frames. Branding, progress bars and status copy are hidden; delayed/failed startup exposes recovery controls. Reduced Motion holds a neutral frame. The Google and Applet setup pages remain separate from this minimal boot state.

First use stays on the loading surface for three pages (owner request 2026-10-05): your agent, bringing it in, your apps. Three bars on top, each labelled (Your agent, Bring it in, Your apps), show the current page in forest, earlier ones lighter and later ones pale; the Google path skips the second. Completed users and the practice world bypass setup.

The three pages share one fixed frame (owner request 2026-10-06, `ui/shell/world-startup.css`): the bars, Fox, the heading and the line under it stay at the same place on every page; the page's own part sits below with generous room and scrolls inside itself if it must; one big button of the same size sits at the same place at the bottom (Continue, Continue, Enter my World), with a status line above it and a small **Back** under it, whose room is kept even where there is nothing to go back to.

| Page | Surface | Result |
| --- | --- | --- |
| 1. Give your agent a World | Fox, “Give your agent a World” with the line “Bring the agent you have”, then, after clear room, two groups with clear room between them (owner requests 2026-10-04, 2026-10-06): **Bring your local agent**, one square tile per supported local Agent in a single row (owner request 2026-10-05), named by its own declared name when it has one (Nova, read from its memory) with the Harness and what it holds underneath (“OpenClaw · 6 conversations”); the found ones come first in the order Hermes Agent, OpenClaw, pi, Codex, Claude Code, and the first found is picked for the person (forest, with a check; owner request 2026-10-06), then those not installed, greyed and dashed with “Not on this computer”; then **Bring your cloud agent**: shorter Continue with Google and Continue with ChatGPT side by side, both Coming soon and greyed for everyone (Muse is gone; owner request 2026-10-05: Worldlet provides no model, so a Google sign-in alone gives Fox nothing to run on). With no Agent here, the page says so and offers **Check again** (detects once more, after an install) and **Use an API key** (a Provider, Model ID and API key form; Connect gives the built-in Hermes that model through `modelConfigure` and opens page 2 with nothing to bring; the key is never kept in the draft; owner decision 2026-10-07: setup never dead-ends); the development build's Use mock Google (Dev) still rehearses the Google path | Clicking a tile picks it; the page's one big **Continue** brings the picked Agent and opens page 2. Cancellation or failure stays here with its error; there is no Skip. Language follows the system without a separate screen. |
| 2. Bringing <Agent> into your World (local Agent) | The line “From <product> on this computer. It stays as it is.”, then the Agent's card, read while the person watches (owner request 2026-10-05): a light sweeps its portrait while its name, personality, what it knows about the person and its model resolve one by one (each shimmers as “reading…” until then). Under it there is no list (owner request 2026-10-06): one line with three hopping dots flashes what is happening (reading its memory, packing its conversations, folding its notes, teaching Fox its skills, then each conversation title in turn, then checking its connections; one line under Reduce Motion) and ends on what moved in (“Nova moved in with 3 conversations · 31 notes · 2 skills.”). The integrations still come over ([its integrations](../../core/agent/PORTABILITY.md#bringing-its-integrations)) | Continue turns on once the bring finished and everything is shown, and opens page 3; Back returns to page 1 once the copy is done. If copying fails the page says so and setup continues. The original Agent stays as it is. A relaunch here shows what already came over without bringing it again. |
| 3. Apps | “Bring your apps into your World” with the line “Found on this computer. Click one to leave it out.”, then only the apps the host found installed here, each a small tile with a check (owner request 2026-10-06: no search, bookmarks, Add more apps or Show all); a click leaves an app out or brings it back. Without detected apps (Windows, or none found) the page says Fox brings a few popular apps and shows the chosen ones, games left out. Each tile's tooltip gives the full name and a one-line purpose (`purpose` beside the catalog data in `core/applets/`, in Chinese, Japanese or Spanish from `ui/onboarding/setup-purposes.ts`). The big button reads **Enter my World** | YouTube, X, TikTok, Netflix, DoorDash, Instagram and Reddit are selected by default alongside supported detected local apps, and the curated starters fill each of the six regions to at least three; they arrive without being shown on this page. Explicit selections and unchecks persist. Connected Mail and Calendar are always included. Back returns to page 2 on the Agent path (nothing is brought again); the Google path has no Back here. |

Entry saves the selection, gathers every selected app's icon (shown tiles fly from their place, the starters not shown come in from the middle) into a spacious formation, then transforms them one by one into painted devices with a brief golden glow on the setup surface. The transformation uses the final overview device size. The setup background dissolves in soft, irregular painted-mist patches over 2 seconds while the world settles from 108% to its final scale over 3.2 seconds with a long, soft ease-out (`ui/shell/world-reveal.ts`, `.world-arriving` in `world-startup.css`), filling the window throughout, with no edge or frame around it (owner feedback 2026-10-02). Those same devices follow staggered curved 3-second paths to live camera-projected ground slots (not hidden Sprite bounds), so the first lands as the zoom settles; landed devices keep following their live slots until the last one lands, then ease into place without bouncing. Contact shadows fade in over 850 ms with slightly stronger grounding as the celebration begins; Overflow devices shrink into the combined region-name/count bubble. Destinations remain empty until landing, including during background snapshot updates. Fox says “Welcome to your personal world!” after landing, followed by about ten staggered sky fireworks over ~3.5 seconds: rockets rise from near the ground at varied horizontal positions and burst level with the distant mountains (10–18% from the top of the window), against the darker ridges rather than the pale sky, in several colour families (gold, rose, teal, violet, white) and shapes (peony, ring, willow trails, crackling glitter, small multi-bursts). The centered “Welcome ♥”, placed in the upper third of the window, then rises from the mountain foot: its sparks start along the lower part of the window, climb through the sky to assemble the text and dissolve into falling embers; the whole celebration lasts under eight seconds (`ui/shell/world-celebration*.ts`). Both canvases draw at CSS-pixel resolution and batch their sparks into a few paths per frame (no per-spark shadow blur), so the welcome holds 60 fps. Reduce Motion skips travel and the zoom, and uses a brief quiet celebration. Terms and Privacy are not on these pages (owner decision 2026-10-02); they live on the website. A fixed help area below the Google button explains browser sign-in and the conditional Advanced → Go to Worldlet (unsafe) path once the host reports that it opened Google consent. A still-valid grant is reused without a browser, so until then the button reads Connecting to Google… and the help stays empty; see [Google sign-in stages](#google-sign-in-stages). Confirmed native Mail and Calendar connections advance setup even if the original sign-in reply is interrupted; a failed or cancelled request without confirmed connections never advances. Cancel and cancellation/error feedback share one fixed slot, and the Dev build's mock Google link keeps its room while signing in, so the heading and Fox stay still. Google consent bypasses included-model preparation and Agent bootstrap. Entry completes without returning to the boot screen. Immediately after Google sign-in (or resuming an already connected setup), native background work starts checking Mail then Calendar while the user selects apps, saving findings progressively into Attention Center. Setup dispatch is deduplicated within the page; entering does not restart successful dispatch. If dispatch fails, entry retries it. Available results appear on world entry, while slower reads continue without blocking navigation. Periodic checks continue while the app is open; no source result gates entry. App selection does not import accounts or local content. Native app icons come from NSWorkspace. Windows does not advertise native app discovery or unsupported background checks.

### A local Agent instead of Google

When the host finds an Agent Harness already installed on this computer (Claude Code, Codex, Hermes Agent, OpenClaw or pi), page 1 enables its row in **Bring your local agent** (`agentHarness` `detect`, which also reports each Agent's declared name and how much history it has). Page 1 lists the found ones first in the order Hermes Agent, OpenClaw, pi, Codex, Claude Code and picks the first of them for the person, in forest (owner request 2026-10-06; the host's own `recommended` is no longer used here); then the supported Agents the host did not find, greyed with a dashed outline and a tooltip saying they aren't installed on this computer, so people know they are supported. Each tile's accessible name is the Agent's product name, with `aria-pressed` for the pick. Continue asks the host to `select` the picked one: the host proves the Harness starts and answers one short turn before Fox switches to it, then setup saves context consent and opens page 2 without Google sign-in. A Harness that is not signed in, or does not answer in time, leaves the person on page 1 with its error. Codex is a model layer, not an Agent layer (owner decision 2026-10-02): choosing it checks the Codex CLI starts and is signed in, then keeps the built-in Hermes Agent, with connections, background checks, routines and memory, and runs every model tier on the person's own Codex sign-in (`agent/model-source.json`, [model sources](../../scripts/DEVELOPMENT.md#fox-model-and-hermes)). Hermes Agent, OpenClaw and pi are the person's own Agents: the host proves the chosen one answers one short turn, and from then on it answers for Fox itself, on its own sign-in, model and memory, with World tools (owner decision 2026-10-07: connect the person's Agent rather than copy it; `connected` in the reply), while background checks, Applet tasks and routines run on the built-in Hermes whenever it has a model (a Codex sign-in here, or an API key such as the one the Agent brings; [background work](../../core/agent/PORTABILITY.md#background-work-while-fox-talks-through-a-local-agent)). Claude Code keeps the built-in Hermes Agent the same way as Codex when Fox has a model for it; otherwise it answers for Fox itself on its own sign-in (owner decision 2026-10-05: Worldlet provides no model). Page 2 then brings the chosen Agent, Codex included, through one flow (owner request 2026-10-04: choosing an Agent brings it, with no separate question): `localAgent` `adopt` copies the name, persona, About you, long-term memory and an API-key model into Fox ([local Agent's name and memory](../../core/agent/PORTABILITY.md#bringing-a-local-agents-name-and-memory)) and its conversations, notes, skills and scheduled jobs into the World ([the rest of a local Agent](../../core/agent/PORTABILITY.md#bringing-the-rest-of-a-local-agent)), without touching the original, and returns the conversation titles page 2 shows arriving. `agentIntegrations` `port` then reads the integrations (MCP servers) the Agent was connected to and moves those it holds a usable token for into the built-in Hermes connection; the rest are listed as reconnect or stays ([its integrations](../../core/agent/PORTABILITY.md#bringing-its-integrations)). A finished bring is saved in the draft, so a reload resumes page 2 without bringing twice. Every Agent answering for Fox itself gets World tools ([World tools through MCP](../../core/agent/PORTABILITY.md#world-tools-through-mcp)), so no tile says Chat only any more; a connected Agent's brought API-key model only runs background work, so page 2 does not say Fox now runs on it. Without Google there are no Mail/Calendar background checks; the world tour's Mail step guides the person to sign in with Google so Fox reads mail and calendar (page 3; Microsoft mail is not supported yet). Recommendation, detection and the turn itself are described in [local Harnesses](../../core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup). After setup, Settings › Model lists the detected Agents under **On this computer** with Use and Stop using (`agentHarness` `select`, `localAgent` `adopt` and `agentIntegrations` `port`, or `clear`), so Fox can switch at any time; account connections stay with the built-in Hermes whichever is used. The setup check covers this path with a fixture host; real sign-ins of each Harness are verified on devices.

Under the local Agents, **My Agent is on another computer** opens a box for the code Worldlet on that computer shows (its Mobile page, **Pair another computer**); **Connect** pairs with it (`agentHarness` `pair`) and goes to the apps page, and Fox's conversation then runs on that computer's Agent ([another computer's Agent](../../core/phone/README.md#another-computers-agent)). A pairing that ended there returns setup to page 1.

Unfinished setup resumes from actual Google connection state or the host's saved Agent choice, never from a stale page number. Credentials are not stored in the UI draft. The shared setup copy supports English, Chinese, Japanese and Spanish; general world localization remains incomplete.

Verification: `node scripts/startup-setup-check.ts` covers the greyed Google, the development mock sign-in with retry, persisted choices, background-check dispatch and completed-user bypass with mocked accounts. Real Google authorization still requires native acceptance.

A packaged app prepares its bundled Hermes runtime on first use (`platform/electron/src/modules/agent-runtime/installation.ts`). Google and Notion connection requests wait for that preparation and continue authorization without requiring model setup or reopening the app; retrying a connection retries failed preparation. On a fresh installation the browser may still wait for runtime dependencies to finish installing; instant OAuth independent of that runtime is not yet implemented. The retired Windows host's `--google-source-check` covered delayed preparation, duplicate requests and cancellation; no Electron check covers that path yet, and none authorizes a real account.

### Google sign-in stages

Google consent opens in the browser only when the saved grant cannot be reused; Reconnect on a healthy connection opens none. Hosts that declare `googleSignInStages` dispatch `worldlet:google-sign-in` to the World page (`contracts/platform.ts`): `browser` only after they asked the system browser to open consent, then `verifying`. The desktop host reports `browser` when Hermes hands over the consent address (`platform/electron/src/modules/agent-runtime/hermes.ts`); the contract also allows a `preparing` stage, which the current host does not send. Setup and Fox's connect guide (Google, Mail, Calendar and Drive) start with a neutral Connecting line and show the browser steps only during `browser`. The desktop host's `browser` stage also carries the consent address it opened (`{stage:'browser',url}`); when it is Google's own authorization page (`googleAuthorizationUrl` in `core/agent/auth-handoff.ts`), both surfaces add Open again, which asks the host to open the same address in the default browser (`openSystemBrowser`), and Copy link, for a browser that never came up (owner meetings 2026-10-02/03). Cancel stays available throughout, and a stage never replaces a guide Fox has said since. Hosts without the capability keep the browser steps from the start. `node scripts/google-connection-check.ts` covers both surfaces with fixtures, including both fallback actions; the agent-runtime Electron module check covers the host opening consent and passing the same address with `browser`; the retired native hosts' reuse/consent and stage-order checks have not been ported to Electron. None authorizes a real account.

## Retired Mail-first tour

The former World → Meet Mail → Attention Center guided tour is removed. Opening or reconnecting Mail never starts a tutorial or locks navigation, including profiles with an old unfinished journey checkpoint. Mail reading, background checks and Attention Center findings remain independent capabilities.

Setup Fox stays still rather than using a rigid-body sway. Bookmark discovery is an explicit one-click action inside Your websites, using locally accessible browser bookmark files without a file picker. Unavailable browser files do not produce a persistent warning banner.

### World entry visuals and available Applets

The icon-to-device transformation uses the overview Applet size and per-device optical correction, scaled with the window. Welcome and its heart dissolve into individual drifting, falling embers before cleanup. Local-launch-only entries are excluded from the catalog; native content integrations remain available.

Applet landing keeps its flying image until the settled world sprite has rendered, then crossfades the overlay. Running Applets show three small dots above the device; names do not acquire Reading/Syncing/Working suffixes. Source-level included-model checks use S; cross-source Attention synthesis uses background M.

The app search field scrolls with the gallery. Arrival uses compositor transforms rather than per-frame width/height changes, sharing one scene-metrics read across all devices per frame.

## After arrival: guided tour, then a first useful task

Fox stays out of the arrival and the welcome (owner feedback 2026-10-02): its bubble, its picture and
the buttons beside it are hidden while devices land and the celebration plays (about seven
seconds), then Fox comes in where it always stands for the tour's hello (owner feedback 2026-10-04: no hop to the middle of the window).
Fox fades in already at its place, with no move or growth that could make it jump (owner request 2026-10-06), and
the tour's **Settings** button beside it fades in with it: it never shows during the arrival or the welcome, ahead of Fox.
The welcome's “Welcome ♥” rises to about a fifth of the way down the window, high in the sky just under the fireworks
(owner request 2026-10-06; `FINALE` in `ui/shell/world-celebration-finale.ts`). Then comes an eight-step guided tour with a spotlight (owner design 2026-10-02, revised from the owner's walkthrough the same day,
`ui/onboarding/world-tour.ts`, `ui/onboarding/first-value.ts`, `ui/onboarding/tour-spotlight.ts`,
`ui/onboarding/tour-lock.ts`). Until it is over only the tour responds (owner request 2026-10-04):
between spotlight steps (Fox still reading, Fox busy, nothing found yet) a clear layer keeps the
World, its corner controls and Fox's input from taking clicks, focus or typing, while Fox's bubble
still works. The **Tutorial** switch, the last line of the World's top-right corner under the sound
line, is on throughout, above the spotlight, and is the one way out (owner Order 2026-10-07; it was
Skip tutorial in a Settings menu beside Fox from 2026-10-05). Turning it off finishes the journey at
once (`journeyStage=finish`), frees the World, and a note on the switch says the tutorial can be
turned back on there. Settings beside Fox steps aside while the tour runs, and otherwise opens
Settings directly, on its Settings tab, with no menu between. Esc does nothing in the first run. The World dims, with soft,
feathered edges, around two lit areas: one around Fox, its ears, its bubble and the bubble's name
tag together, and one around what Fox explains (none when that is Fox itself). Every choice is made at Fox, so
the two look different (owner request 2026-10-06): Fox's area wears a solid, still, warm amber ring, and what Fox
explains a soft, breathing golden halo rather than a hard ring, except the card (step 6): its paper art fills it, so the
light is cut to the card's own edge with no margin, feathering or halo around it (owner feedback 2026-10-02, #1617),
while Fox stays where it always stands with its bubble above it (owner feedback 2026-10-06: Fox moving up under the
card read as a jump). The box glides from one target to the next, also from
the tour's last box to first value's first (the whole Attention Center down to the one item). Fox bolds only the word a step teaches and the Applet it names (“This is your **Applet**, **Mail**”). While it shows only the bubble's controls respond: the World, its Applets
and Fox's input take no clicks, focus or typing, and the World's devices and regions neither light up nor show their names on hover. On the card (step 6) the card's source links work too: Source opens Mail or the page, the spotlight lifts there and the card comes back on return. The card's own **Done** (**Got it** for something to know) works as well and settles the item as the first win, while its Dismiss and Later are hidden until the tour is over (owner request 2026-10-04: the card could not be clicked, only Fox). A step that only tells moves on with **Continue**,
a click anywhere (blank space included), Enter, Space or →; a step that asks the person to use
something moves on only when they use it. In Fox's bubble every choice is an underlined word, like every other choice Fox offers, never a filled button
(owner feedback 2026-10-06): the step's main action (**Continue**, **Connect Mail**, **Show me**, **Do it for me**,
**Show pairing code**) in Fox's link colour, a second choice (**Not now**, **Change my name**, **Not yet**) muted
beside it. Fox, its bubble, its buttons, the tour's Settings and the dimmed World come in as one fade for the hello
(owner feedback 2026-10-06: Fox flashed on entry when the World darkened in one frame and the bubble popped in after Fox).
While the Center waits for what was connected to be read, it shows three hopping dots instead of a line of text.

| Step | Box | Fox says / the person does |
| --- | --- | --- |
| 1. Hello | none; Fox comes in where it always stands, in its circle | “Welcome! This is your World. Everything you have can live here now.” |
| 2. Fox | Fox, in its circle | Who Fox is, always working for the person; the **Change my name** action under the bubble shows a name field that renames Fox (`companion_name`); **Save** returns to Fox's introduction under the new name, and **Continue** moves on |
| 3. Applets | Mail when it is not connected, else an Applet whose lights blink (Mail first) | Not connected: Fox's bubble offers **Connect Mail** (or a click on Mail), which starts Google's sign-in right from the World without opening the Mail Applet (owner feedback 2026-10-06: people did not know how to leave it), with the step back when the sign-in ends, or **Not now**, which keeps the choice with the person and moves on (owner request 2026-10-06: the choice is made at Fox). Otherwise: the blinking lights mean it is working (Mail collects new mail); every Applet is a real app |
| 4. Attention Center | the whole Center | What it keeps; pick anything and Fox takes care of it. With nothing connected it only says the Center fills up once mail or calendar is connected |
| 5. Pick | the item Fox picked | **Show me** (or a click on it): its card opens in the middle and the box glides to it |
| 6. Card | the card | “Can I do this for you?” **Do it for me** beside Fox opens the page full size in its Applet, where Fox works and the person can step in (an update offers **Continue**); the card's own **Done** or **Got it** settles it there |
| 7. Done? | none | When Fox's turn ends, “Is it done?” **Mark it done** celebrates the first win |
| 8. Phone (owner request 2026-10-06) | none; the code sits in Fox's bubble, lit with Fox | Last, never right after the first win's fireworks (owner feedback 2026-10-06): a couple of minutes later, at the first calm moment (the World in front, Fox idle and saying nothing else, no card open); or a few seconds after Fox says there is nothing to do yet: “you can also use me on your phone”. Until pairing starts, the bubble shows the iPhone app's download code (`phoneApps` in `ui/distribution/phone-release.ts`, today the TestFlight public beta) for the phone's camera; **Show pairing code** asks the host to start [pairing](../../core/phone/README.md#pairing) (`phonePair` `start`) and the code becomes the `worldlet://pair` link the phone app scans; when the host reports the phone (`worldlet:phone-status`) Fox says it is paired, with **Continue**. **Not now** (or the Tutorial switch turned off) ends it (ending a code nobody scanned); pairing stays in Fox's panel under Mobile. Nothing reaches the relay before Show pairing code, a click elsewhere does not move on, and a host without phone pairing leaves the step out. The journey is already finished, so this step is not saved and a restart does not bring it back |

Steps 1–4 persist as `journeyStage=world-tour` and resume at the same step; a place opened another
way lifts the spotlight until the person is back in the overview. Continue on step 4 hands over to
`first-value` at once. Existing completed profiles and retired Mail-tour checkpoints do not restart it.

**Replay on demand** (#1327). Once the first run is behind the person (the profile is completed and
the journey is past first value), the **Tutorial** switch in the World's top-right corner is off, and
turning it on replays the tour (owner Order 2026-10-07: back in the corner, as a switch; from
2026-10-05 it was an entry in a Settings menu beside Fox). It shows steps 1–4 and the phone again with the same spotlight,
and only tells: Mail that is not connected is described, never offered for sign-in, and the phone step, last, only says where pairing lives, with no codes; the journey
stage, setup, accounts and Applets are left as they are; the last Continue just ends it. Turning
the switch off ends a replay too, and so does Esc; either restores input. While a replay
runs the switch is on, so a second one cannot start. While Fox is working, the replay waits (a note beside the switch
says so) and starts once Fox is idle; during an unfinished first task it asks to finish that first.

Setup completion means the world can open, not that a useful task has been completed.
Shared Core selects one already published, source-backed, unsnoozed task (preferring one
with a verified website Fox can finish) or update. An account chore that needs the person signed in
on a website (review a sign-in, reset a password, verify it's you; `firstValueNeedsSignIn`) comes
last, since a new world is signed in nowhere and Fox couldn't show its work. A bill or invoice to pay
(`firstValueNeedsPayment`, read from the item's title, reason and action) comes next to last: Fox never
pays, so it could only hand the page back. Fox prefers a row the Center shows, since what does not
fit on screen waits under Later where step 5 cannot box it; only when a held item is something Fox can
finish better (say, the one task with a verified website) does Fox pick it, and step 5 turns the Center to its Later page so
the box surrounds its Later row. Turning the page does not change the Center's focus. It does not read an inbox itself,
manufacture fallback news, or override the Center's relevance decision. Someone who brought an Agent
already has work in progress (owner request 2026-10-06: the target customer already uses OpenClaw,
Claude Code or Hermes Agent): with no such item yet, Fox starts with what the person keeps talking about with it, the
[theme](../../core/ongoing/README.md#themes) the Center shows in Worth Doing. Step 5 boxes its row,
Fox names it (“You keep talking about what you eat with OpenClaw: “#diet-and-health”, … Want me to pull
what matters out of it and put it on one page?”), and **Show me** (or a click on the row) asks Fox for
the theme's artifact; the artifact Fox shows is the first win (owner request 2026-10-07: an artifact, not
an Applet). The finished journey names no item, as the host holds none for it. When Fox shows none (no model,
or the turn failed) the tour ends without a first win and the World is free. Without either, Fox says it is
still reading and keeps the Center boxed for up to a minute (two while a source is still being
read, five while the host's Attention is still turning what it read into items). With nothing connected
(**Not now** on Gmail) nothing will arrive to wait for: only a brought Agent's conversations, which reach the Center
within fifteen seconds of the World opening, so after the tour's first half Fox does not wait or say it is reading at all
(owner request 2026-10-06: Fox never hangs on an empty Center). Then the tour ends (`journeyStage=finish`) and the World is the person's, with Fox
saying it will show how it helps once something comes in, instead of staying locked until an item
arrives (owner request 2026-10-06), and the phone step closes the tour.

For a task with a verified website, the page opens at once and Fox says it is on it. While Fox
drives the page, the page's own frame turns into moving colors that glow inward over the page edge, with a small card grown from the top
edge that lists Fox's steps, ticking each as Fox moves on, and then Fox's result ("Fox is working on this page" before its first step; [steps card](../../platform/browser/README.md#visible-control-feedback), #1619). That card is the one place the page's status shows (owner feedback 2026-10-02): Fox's bubble only invites the person to watch or step in. Fox's pointer stays visible on the
page the whole time and glides to each control Fox uses. The page stays full size in its Applet:
Fox's pages never shrink into picture in picture, which is for videos. If the person goes back to the
World meanwhile, Fox keeps working on the page, which shows live in a small screen over the Applet's
device and opens it again on a click ([task pages](../../platform/browser/INTEGRATION.md#task-picture-in-picture)).
While Fox works during the tour, a note beside Back (the website page itself can't be dimmed) says
Back shrinks the page into their world while Fox keeps going. The host draws the page above all HTML,
so the note widens to stay above the page's top edge rather than losing its lower half under it. The ordinary Agent/tool gateway reads current sources; website steps such as
ordinary clicks, form filling and reading run directly, and the last step that books, confirms,
submits, sends or pays asks once, **Go ahead** or **Not now**, before it runs (owner decision
2026-10-03; multi-step flows such as cancel-then-confirm continue once the previous step's page was
inspected), and the item's verified
source links open without a navigation prompt. Payment details and passwords are never entered; when
a step needs the person, Fox does the rest and hands off in one plain sentence.

Nothing is confirmed afterwards. The person's **Go ahead** on the last step is their confirmation:
once Fox has inspected the result page, the receipt is recorded as confirmed and the item completes
with `completedBy: 'fox'`, and the first win follows Fox's reply. A successful Agent turn alone is
not task completion: when Fox's turn ends with the item still open (Fox could not finish, or took no
last step), Fox says **It’s still open.** with **Mark it done** (the person's decision, recorded
with `completedBy: 'fox'`, the item action's `by`, accepted only with `done`) and **Not yet**; the
card's own **Done** records it without. Settling the journey item returns to the world and records the first
win with a celebration. The tour resumes its step after visiting a place, and shows again if a
place's greeting replaced it. The persisted review/running/outcome stages allow return after
restart; interrupted operations are never replayed automatically. Empty results leave the world
usable while normal background Applet jobs continue. For rehearsal without OAuth, see
[mock Google](../../scripts/DEVELOPMENT.md#mock-google-onboarding-rehearsal).

`world-tour-check.ts` walks every step in the bundled World (the phone a couple of minutes after the first win on a moved clock, and with nothing
connected the tour moving on without a wait) and replays the tour from the
Tutorial switch in the corner (keyboard and pointer, one tour at a time, turned off, Esc, wide and narrow
windows), checks the lock between steps, the card's own Done under the spotlight, and the switch, on, in
the top-right corner over the corner's own during the first run.

Closing the window before onboarding is over (setup, then this tour) quits Worldlet instead of
leaving Fox on the desktop, and minimizing only minimizes (owner request 2026-10-04,
`platform/electron/src/modules/shell/companion.ts`); the next launch resumes at the same step.
`onboarding-first-value-check.ts` verifies selection, retry, the still-open choice and the first win after a Go ahead, which waits for Fox's reply.
`onboarding-first-value-world-check.ts` exercises late Attention publication and the
actual bundled world/preview. Both use fictional records, not real-account acceptance.

If a resumed task has disappeared, been dismissed or become stale, Fox offers another
item instead of opening a broken preview. An outcome can still be acknowledged after
its source leaves the Center. Unmounting cancels arrival timers and removes event
listeners so a replaced world cannot write duplicate journey progress.

## After onboarding: open Worldlet at login (#1229)

Once setup, the tour and the first task are behind the person, Worldlet turns on Open at Login
by itself and Fox says so in one line, "Worldlet now opens quietly when you log in.", with
**Don't open at login** beside it (`ui/onboarding/login-item-offer.ts`). It does not ask first
(owner request 2026-10-07: do things for the person instead of asking when they can be undone).
After the first win it waits ten seconds so the celebration keeps its moment; on a later launch
it waits until the world has settled. It happens only on an idle overview: never during setup,
inside a place, while Fox is replying or over another guide, and never in the practice world.
It is skipped when Open at Login is already on, awaiting approval, or unsupported (a Dev build).
It happens once (`loginItem` `offered`, stored per computer); afterwards only the setting changes
it: Fox's `login` guide ("Open Worldlet at login") or the app menu's **Open at Login**. Fox repeats
the system's status truthfully, including when macOS still needs approval in System Settings →
General → Login Items. Worldlet itself shows no further prompt.
[Distribution](../../platform/electron/DISTRIBUTION.md#open-at-login) describes the host and the
quiet start. `node scripts/login-item-check.ts` covers the status mapping, the offer's timing and
finality, the guide and the quiet-start wiring with a fake clock and DOM.
