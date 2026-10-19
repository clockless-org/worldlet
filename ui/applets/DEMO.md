# Recording the sample-world demo

Chapters:
- [Kelvin Ren: the sample world](#sample-persona)


## Scope

The September 19 teleprompter is demonstrated using the existing Applets, Fox,
readers and review controls. Sample changes the data and write destination, not
the renderer. Its 129 fictional originals contain no private account information.
Natural-language requests still run through Hermes and the configured model;
they are not matched against a prerecorded script.

Before recording, restart **Worldlet Dev**, select the practice world in settings,
and verify Fox can answer. Restarting the app restores the preset records and
six Attention items; reloading the web view preserves this session's changes.
A model connection is required for voice/text requests. A local button path is
provided for the two review flows so a slow model does not block rehearsal.

## Shot order

| Shot | Say or do | Expected result |
| --- | --- | --- |
| Overview | Show the full village and Attention Center | Coming Up: two meetings; Worth Doing: Tennis with Sam; Worth Knowing: three updates. No private sources. |
| Code | Work → Codex → Review navigation → Review result | Running/waiting session cards, empty usage bar, selected conversation and a prepared result. Result becomes Completed for this session. This is not a live CLI run or measured token usage. |
| Media | “Take me to TikTok.” Then press Back to return | The normal embedded TikTok website opens and unloads on exit. Network, login and feed availability belong to TikTok. |
| Mail | “Check my unread emails.” | Fox opens the Mail Applet, reads the authored unread originals and summarizes the important message in the Fox bubble while leaving the Mail overview open. It does not select or mark an individual message read just for summarizing. |
| Notes | “Pull up my Japan travel plan from Notion.” | The Notion Applet opens the selected original. The dinner note names Maple Table, 19:00, station meetup 18:45 and alex@example.com. |
| Across Applets | “Grab that dinner spot from my Notion notes and shoot an email to Alex.” | Fox must read the original first, then show recipient, subject and full draft. Click Send to record it in Mail · Sent from Fox. No external message. Alternatively open the dinner note and click Email Alex. |
| Context | Return Home, then enter Work | The active region/Applet context follows the view; no new chat is required. |
| Atmosphere | “Make this scene rainy.” / “Play village ambience.” / “Play some lo-fi.” | Scene rain uses set_scene_weather; actual forecast is unchanged. Audio uses the existing global controls. “Restore the actual weather” clears the visual override. Online streams require network. |
| Recall | “What was that research paper I browsed last week?” | Retrieve the saved Browsing history note: Generative Agents: Interactive Simulacra of Human Behavior, with its original arXiv URL. It is an authored history example, not a claim of access to the viewer's browser history. |
| Design → Codex | “Grab the latest design doc from Notion and let Codex implement it.” | Fox reads the latest authored Applet navigation design. A local handoff session opens with the original and request; it explicitly reports no live CLI or generated code. The earlier timer design remains separately available, with its bounded prototype controls. |
| Keep / share prototype | Return to the coding session → Copy HTML | Copies a self-contained working timer to the Mac clipboard; save as quiet-timer.html to keep or share. This is one product-owned template inside Codex, not installation of a new world device or a general Applet generator. |
| Shopping recall | “What shoes was I looking at last week? Open the page.” | Fox finds the authored Allbirds Tree Runner NZ visit and opens its exact URL in Browser. Current site contents are live and network-dependent; the saved visit is fictional. |
| Companion | “Call yourself Vox and wave.” / “Vox, go to sleep.” | Name badge changes and the existing painted rig waves/sleeps. A later user interaction wakes it. No replacement avatar or custom speech output is implied. |
| Synthesis | Click Tennis with Sam | The plan opens with linked Sam email, weather, movement and court records. Fox shows Saturday, Court 2, 10–11 AM, $20 and sam.okafor@example.com. |
| Confirm | Confirm outing → View plan | One local record gains calendar start, booking and invitation state. The task disappears; re-entering cannot book it again. Not now leaves it unchanged. |
| Replay | Restart the app | Sent practice mail, completed code review and confirmed tennis return to their initial preset state. |

Dates follow the recording day. Saturday advances to the following week after
10 AM on Saturday, so the proposed slot is never already over. The first meeting
starts 30 minutes after the world is initialized.

## Teleprompter corrections before public recording

| Existing claim | Accurate wording / boundary |
| --- | --- |
| Interactive 3D gadgets | Dimensional 2.5D Applets; the runtime uses PixiJS sprites. |
| Codex runs jobs and monitors tokens in this shot | These are prepared session states; usage is deliberately empty. Use a connected personal-world session to demonstrate real execution. |
| Build, share and remix directly in the browser | The recording can demonstrate a local working timer prototype and copy its HTML. General generation, world installation, public publishing and remix are still incomplete. |
| Remembers everything / records all browser history | Personal mode now records eligible Worldlet browser visits and can recall them by date/keywords. This sample walkthrough still uses an authored saved paper. Other-browser history and complete capture are not supported; see BROWSER-DEVICE.md. |
| Fully customizable avatar and voice | Naming, existing expressions and speaking-style preferences work. Avatar upload/generation and custom speech output are not complete. |
| Works while the computer sleeps | Worldlet can check sources while running and awake. OS-sleep execution is not supported; say “while I am away, with my Mac awake.” |
| Swap any agent harness | Hermes is the bundled engine; a general runtime harness selector is not shipped. |
| One click books and invites Sam | One click commits the prepared practice scenario. Real court booking/invitation transport is not connected. |
| Repo is open source | Repository is currently private. Public release/license is a separate decision. |
| Cloud calls anonymize all data | Local storage and scoped context are implemented; do not promise universal anonymization. |
| Wordlet.ai | Use the product's Worldlet spelling and the download address documented in README. Verify the public URL before recording the outro. |

## Acceptance evidence

`npm run test:demo` builds the bundle and checks the authored sources, one-confirm
semantics, all 25 Applet routes and the complete practice walkthrough. The browser
walkthrough drives the real UI with a mock host bridge/model: it exercises the
actual Hermes tool callback, source-before-draft enforcement, draft review,
local send receipt, weather override, task completion and a subsequent unrelated
save that must not resurrect completed tasks. It also asserts no host email,
private content or coding-session transport is called. The Notion→Codex path now also rejects delegation before the source is read, checks the timer controls and HTML export, and verifies Vox naming/sleep/wave. It exposed a real Attention Center race: refreshing rows between pointer-down and click discarded the click. HUD refresh now waits until the gesture finishes.

`node scripts/fox-execution-check.ts` separately covers the personal-world email
review and Claude session route. `python3 scripts/hermes-check.py` checks the real
pinned Hermes runtime with a local model fixture. These checks do not establish
live model quality, microphone transcription, TikTok feed availability or online
lo-fi playback; rehearse those on the recording Mac before capturing video.

## Recording readiness

- [x] Fictional Mail/Calendar/Notes/Reminders, six Attention items, context navigation.
- [x] Source-backed reviewed email, tennis confirmation, restart reset contracts.
- [x] Design → Codex → working timer → copy standalone HTML (bounded template).
- [x] Shoes and research-paper history retrieval with exact saved URLs.
- [x] Companion name and expression controls in the practice world.
- [x] Real configured Hermes model on Worldlet Dev: the exact Notion→Codex request found/read the brief and opened the job; Try prototype and Start/Pause worked in the then-current WebKit host (not re-run on Electron). Shoe recall opened Browser. The old public product URL redirected to a collection, so the authored record now uses the verified Tree Runner NZ product URL.
- [ ] Rehearse microphone input before recording. These live checks used typed requests, not a guarantee about every model or transcription result.
- [ ] Check current All-In playback, live websites and network immediately before recording. Do not replace an unavailable requested show with another one.
- [ ] General Applet creation/installation, custom avatar and speech output remain product work, even though the narrower prototype demonstrates the direction.
- [ ] Public repository/license, universal PII removal and OS-sleep execution are not established by this demo.

The private teleprompter and its original Notion data are not copied into the repository.

## Front walkthrough V4 practice tools

The sample world exposes `run_practice_iteration` for a Calendar engineering-design meeting → Notion implementation document → prepared Codex result → local GitHub PR review artifact. It stays in world view and uses visible handoff signals through Fox. All artifacts are authored practice data, stored in sample UI state; no external service is written and no coding CLI is run. Cancellation clears the running indicator.

`practice_applet` creates, shows or hides one functional checklist template with one to eight short items. Clicking the device opens editable checkboxes; hiding preserves checks. It is deliberately labeled a local checklist template, not a universal code generator or public Applets Hub implementation. The device/panel appears only in overview. Sample reset and dataset-version changes clear sample UI state.

`set_scene_lighting` previews day/night over 2.4 seconds, or returns to actual daylight. It never changes the real clock, forecast or location. Night preview is explicitly labeled. Scene lighting does not start background audio.

Manual acceptance on 2026-09-21: voice-created Recording kit, checked Microphone and Camera, voice-hid the device with checks retained; voice-ran the complete local iteration without opening an Applet; voice-switched day→night→day at native 2560×1440.

## Execution boundaries

Practice actions mutate fictional local records only. Personal-world email uses
an immutable reviewed draft, separately requested send scope and a final Send
click; only an API receipt means sent. Account changes invalidate review. Unknown
send outcomes require inspection, never automatic retry. Podcast resume retains
exact episode identity and position; it does not autoplay on restart. Claude Code
continuation uses the selected project and ordinary SDK permissions, never a
blanket bypass. Notion-to-email follows the same reader and mail review gates.

Offline execution fixtures (`mail-actions-check.py`, `claude-session-check.py`,
`fox-execution-check.ts`, `tennis-demo-check.ts`) do not establish real delivery,
merchant booking or network playback. The product blueprint
owns unfinished feature scope; do not maintain another completion table here.

<a id="sample-persona"></a>
## Kelvin Ren: the sample world

Dataset `kelvin-v2` is **an entirely fictional week in the life of Kelvin Ren**, founder of Clockless, a three-person Shanghai studio building Worldlet. It holds **127 original English notes** in **17 Matters across the seven regions**, and **six visible attention items** (two meetings, one task, three updates). The authored source is [`ui/world/sample-persona.json`](../world/sample-persona.json), loaded by `ui/world/sample-persona.ts`. It is independent of every private source. No real mailbox, repository, bank account, customer or person is represented; email addresses use example.com.

Sample Mode is the **Sample world** switch in Settings (bottom right), default off and persisted as `worldlet.sampleEnabled`. The marketing site's preview (`website/demo`) renders the same world without the desktop app. It is never shown implicitly to real users, and private source connectors refuse to read personal data while it is on. Website Applets still open their normal public website; they may require login.

### The week

Kelvin is 34 and lives with his partner Yiwen and a cat called Tofu. The next three weeks hold everything the app is for: Worldlet 0.36 ships in nine days with one blocker open; Sam Okafor of Northwind Ventures meets him on Thursday and has sent four questions; two designer candidates need a decision by Friday; the Tokyo Dev Summit talk is in thirteen days, followed by two quiet days in Kyoto with a stay still to choose; his parents arrive from Chengdu in three weeks. Every date is an offset from today (`dates` in the JSON; `{{today}}`, `{{departure}}` and so on in the text), so the flight is always twelve days out and the dentist always four. `{{day:key}}` gives the weekday of a date, so a meeting three days out is "before Monday" on a Friday and never "before Thursday"; weekday words that stay literal are routines, not events.

| Region | Matters | What is in them |
| --- | --- | --- |
| Home | Flat & everyday · Family & friends · Journal · Parents' visit | The lease renewal offer, plants and the cat, Yiwen's birthday, the parents' week, a journal |
| Work | Worldlet 0.36 · Seed round · Designer hire · Reading & research · Writing & talks | Release plan, the stage-exit crash, PRs, release triage, pilot feedback, Codex and Claude Code sessions, the deck, the numbers Sam asked for, two candidates; reading notes, a paper measured, the Obsidian vault, the summit talk outline, a blog draft, an X thread |
| Social | Pilot community | The pilot Discord, X mentions, office hours |
| Life | Company finances · Personal budget · Tokyo & Kyoto · Lake weekend · Travel memories | Runway at 14 months, 38 pre-orders on Stripe, contractor payouts on PayPal, burn, rent, subscriptions; the summit trip with its route, calendar, flights and the Kyoto stay to choose; a camping weekend; places kept |
| Games | Movement & sleep | Runs on Strava, sleep from the ring, steps, the dentist (the sample's older health Matter still stands in this court) |
| Entertainment | Watching & listening | Talks queued, saved clips |

### What the Applets hold

Native Applets use fictional records. Website Applets retain their real website entry. No private connector is claimed to be connected. A note names the Applet it came from (`applet`) and the Matter it belongs to (`matter`); the note is owned by the Matter and listed by the Applet. The attention candidates are authored in the same contract every Applet publishes through — a title of at most four words, a context of at most 64 characters, a summary Fox says when the item is opened, and an exact quote from the note it was read from — and are projected into the world by `projectWorldItems`, the same code a real world uses. So Home's four stages stand their items up (letters on the postbox, days on the Calendar track, notes on the line, slats on the Reminders board), the Attention Center holds the week in its three groups, and website Applets open their declared browser routes.

Settling an item in the sample — done, read, dismissed — is local and remembered: statuses live in the desktop host's session memory beside the Kyoto stay and decisions. Restarting the app clears them; reloading the World page does not.

Try asking Fox:

- "Who am I, and what matters this week?"
- "What did Sam ask for, and which answers are ready?"
- "What is blocking the 0.36 release? Open the issue."
- "Compare the two Kyoto stays."
- "What do my parents like to eat?"
- "Add a reminder to leave the spare key for Leo."

These are questions about fictional records. Prices, balances, confirmations and project states are authored scenario values, not live facts. Choosing a stay or approving a sample invoice books, pays and sends nothing.

### Storage and isolation

The JSON is bundled into the app build. `sample-persona.ts` attaches the notes to the fixed room hierarchy, resolves relative dates at load, replaces every earlier seed note, and projects the items. `ui/world/apps-matters.ts` reads each note's Matter from the data and gives each region's Matters the authored slots in the order the data lists them. The fictional profile is exposed to Fox through `inspect_world`; detailed records are read through the existing retrieval tools; in sample mode Fox's prompt says that the world is fiction.

Practice edits are kept in the desktop host's World store memory (`sampleUI`, saved through the `saveSampleUI` presentation request in `platform/electron/src/store/world-store.ts`), tagged with the dataset version. Every new app session, and a backup restore or reset, starts with the seed. Legacy `sample-ui.json` files are ignored. Real-source storage and connection credentials are separate.

The sample **never loads or merges a private archive**. Never copy personal imports, screenshots or credentials into this fixture or a distributed bundle. Kelvin, Clockless and everyone around them are authored fiction; the founder's name is the only thing borrowed, and the file is the place to change it.

### Validation

`node scripts/sample-persona-check.ts` (part of `npm run test:ui`) reads the data the way the app does and checks ownership, English content, resolved dates, complete related-note links, the attention contract with every quote present in its note, a stage's worth of items for each of Home's four, sample content and a Sample status for every Applet, the trip binding, and that a settled item comes back settled. `node scripts/sample-world-check.ts` drives the built world with the switch on: the panel's three groups, the four stages, settling an item and finding it settled after a web-view reload, the record lists of the other Applets, the trip diorama, the tour and the decision. Native checks verify that the sample rejects accidental private-archive inclusion and ignores old overlays.

### Recording scenario

See [Demo walkthrough](DEMO.md) for the exact shot order, local write boundaries and acceptance. One task is Saturday tennis with Sam, supported by four original records. Notion includes dinner details for Alex; confirmed practice drafts go into the Mail outbox. A saved Browser note supports last-week paper recall. Codex and Claude Code expose prepared running/waiting/completed session states, with no real CLI execution. All practice mutations reset on app restart.


## Repeatable browser research task

In the sample world's Worth Doing section, open **Plan a museum afternoon**
and choose **Help me do it**. The original fictional email specifies two adults,
a $120 admission budget, next Saturday afternoon, and transit from the Ferry Building.

Fox should read the source request, open the built-in Browser, inspect both official
museum websites, compare current hours/prices/transit, and save a note with source
links and a recommendation. Unknown or date-dependent prices must remain explicit.
No checkout, reservation, or message is authorized. The task is complete only when
the saved comparison exists; a tool invocation alone is not success. Reset the
sample world to repeat. Website availability and live model latency are external
dependencies; the deterministic browser-driver fixture separately verifies the
multi-page control path.
