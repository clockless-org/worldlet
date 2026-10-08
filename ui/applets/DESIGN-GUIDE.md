# Applet design guide

Device sizing follows the [World and Applet sizing standard](../DESIGN-STANDARDS.md): 84px wide at World overview, approximately 212px in a Region, and a 120 × 120px shelf container.

Default controls and materials follow the [built-in UI standard](../../resources/styles/builtin/UI.md).

This is the design handbook for making Worldlet Applets. It records the product decisions, not a claim that every animation or integration already exists. Start here before designing a device or implementing its interaction. This ordinary repository document is the authoring entry point; no Create Applet skill is used. Implementation steps live in [Implementation guide](IMPLEMENTATION-GUIDE.md). The Factory workflow remains future work.

Implementation fields, compatibility and route details live in [Applet presentation](../components/INTERACTION.md#applet-presentation). Current acceptance lives in [Applet review](../components/INTERACTION.md#applet-presentation-acceptance-contract). If older studies disagree with this handbook, follow this handbook for Applet design; keep serialized IDs compatible.

## 1. What an Applet is

An Applet turns an application's useful functions into a dimensional, interactive installation in a small world. It is useful first and playful second. It must communicate both **what application this is** and **what work it does**.

**Applet is the World UX; its backend is replaceable.** API, CLI, MCP, plugins,
local system services and websites can power the same device, separately or in
combination. Peek → Open → Focus describes presentation, not a connection type.
Preserve device identity, installed position and familiar interaction when a
provider changes. Backend capability determines which actions are available;
it does not dictate the visual language. See the
[backend-independent contract](IMPLEMENTATION-GUIDE.md#backend-independent-applet-contract).

Identity comes first: start with the original icon or mascot and make that shape a dimensional village object. Function comes second, expressed by one or two small working attachments or by the logo itself becoming a mechanism. Do not start with a generic machine and add a small badge. YouTube’s recognizable play screen and Netflix’s ribbon N theater are the benchmarks. Keep the village map and installed positions unchanged when replacing artwork.

Mail, Calendar, Notes and Reminders are generic functional Applets in Home. Their names do not carry Gmail or Apple branding; connection and authorization text still identifies the actual provider. Branded Applets retain original, sourced publisher icons for identity UI. Generated sprite adaptations are not replacements for those official icons.

### Facing and perceived size

Use one consistent gentle oblique view: the branded front faces toward screen-left, with its right side and top visible, about 18–22° sideways and 25° downward. Keep the camera roll at zero and the device upright on a level ground plane. This is a viewing direction, not a sideways lean. Never alternate left-facing and right-facing devices in a batch. This also applies to every base, including Weather: the front edge slopes gently down toward screen-right and the right side recedes upward. A left-looking mascot does not compensate for an opposite-facing plinth. Re-render opposite views instead of mirroring sprites: original letters, asymmetric logos and functional markings must stay correct. The branded front remains dominant, but the top and a narrow side must clearly show depth. Avoid both head-on logo panels and exaggerated 45° isometric views. Integrate the mark through painted ceramic, enamel, relief or functional openings, sharing the device’s material, perspective and lighting; do not make it look like a pristine sticker.

Every ground Applet should have a visible, compact village-style base, including mascots and Mac application launchers. Use a low warm timber plinth with rounded wooden edges and restrained brass fasteners; keep the base entirely wood, without stone or ivory edging. An existing functional dock, cabinet or platform may serve as the base without adding another tier. Match its perspective and light to the device, show physical contact and soft contact shading, and anchor the base's underside to the saved ground slot. Aim for roughly 8–12% of total device height, only wide enough to support the silhouette. Keep the logo dominant; avoid oversized pedestals, floating objects, grass islands and decorative clutter. Replacing or adding a base must not move the installed slot. Keynote, Docker, QQ, Calendar and Notes demonstrate this grounding treatment.

The shared language is material, finish, light and grounded proportions. Base silhouettes vary by purpose. Shape the support around the application's function: a dock/cradle for Docker, lectern foot for Keynote, flip-calendar stand for Calendar, writing tray for Notes and a small conversational platform for QQ. Functional drawers, paper slots, cradles or controls may be integrated into the base; preserve variation without adding unrelated decoration.

Calibrate visible main-body mass across a batch, not raw PNG width. Use alpha-weighted 5–95% bounds to reduce the influence of thin antennas/handles, scale uniformly with a full-silhouette size cap, and share the same foot baseline. Never stretch the logo. This geometric starting point still needs small-scale visual inspection. Persist silhouette-specific optical corrections in `scripts/calibrate-applet-scale.ts`, not placement coordinates. For example, Obsidian uses a 0.82 correction because its tall solid crystal reads oversized; rebuilding the scale manifest must preserve that correction.

### Authored status lamp

When generating new Applet artwork, reserve one small, physically integrated
lamp socket in the visible front of its base. Use the current Discord device's
lamp as the accepted reference for scale, placement and subtlety. Follow the
base's perspective rather than forcing every sprite to a guessed screen-center
coordinate. Do not add a floating HUD dot, an oversized glow, or extra lamps.
Keep the socket's neutral/off material separate from its future emission, and
record a normalized artwork anchor and emission mask alongside the asset so
runtime colors can align to the actual socket at every zoom level.

The approved states are off (signed out and unusable), white (signed in or usable without login),
deeply breathing white with a Running label (processing; every 2.4 seconds, so running reads from the overview) and red (error); unread saved findings have no
lamp state. See [Attention Center](../../core/attention/README.md#deferred-device-lamps)
for priority. The current generic dot overlay is hidden.
All 112 built-in Applet sprites, including Mac application launchers, author
this socket directly into the sprite: a small brass rim around a charcoal-black, unlit lens. Keep the existing device,
logo, functional props and timber base intact. The socket belongs at the center
of the visible front face, following its perspective; it is not necessarily at
the horizontal center of the PNG. Do not paint a glow into the artwork.

The style pack's `applet-lamps.json` records each updated Applet's `center` and
`radius` in normalized full-texture coordinates (top-left origin), with
`defaultState: "off"`. These describe the black lens, excluding its brass rim.
Runtime emission uses this authored ellipse and the same sprite transform,
including ground/region zoom and foreground devices. Mail’s separate Open/Focus
image uses its contained image bounds. Use white and red lens colors with a
small soft halo, no scaling pulse, and steady white with a Running label under reduced motion.
Red requires a visible exclamation, explanation and a keyboard-accessible
action to inspect the failure. Yellow and green are suppressed. New Applet artwork must register its socket before shipping. The generic dot overlay stays
hidden; authored scene backgrounds do not receive guessed lamp positions.

### Brand and purpose acceptance

At **84px overview width**, the original application must be recognizable without its name. The dimensional logo or mascot should dominate roughly **three quarters of the visible mass**; functional elements support it. This supersedes the earlier half-logo/half-function rule. Preserve the original silhouette, proportions, negative spaces and color relationships. Use matte enamel, painted wood, cloth or relief to fit the village, without inventing a different mark. Do not mute identifying colors into unrelated hues. A pin can stand over a small map; a circular Spotify mark can itself be a speaker; an Instagram icon can itself become a camera. Avoid repeated tiny logos, large desks and decorative machinery that obscure the identity. Generic Mail, Calendar, Notes, Reminders, Browser and Meetings retain their functional unbranded identities.

Artwork replacement does not authorize changing the five installed positions, their ordering, camera, terrain, landmarks or user-dragged placement. Keep readable source icons in identity UI separate from these generated sculptural interpretations.

The same device-art standard applies to Applets that launch a Mac application directly. Their launch route is not a reason to use a flat icon or omit functional detail. Keep inactive launcher artwork in the style library without silently enabling or installing the corresponding application. See the [complete identity rollout](../../resources/styles/builtin/drafts/logo-rollout/README.md) for generation provenance and size reviews.

Review a contact sheet at actual overview size and at Region size before replacement. A generated brand interpretation is not an official publisher icon; onboarding and identity UI still use sourced originals. See [recognition audit](../../resources/styles/builtin/drafts/brand-readable/AUDIT.md).

Before approving a Peek device, check both questions at Region scale: can someone recognize the original application identity, and can they infer its purpose from the object? Preserve the publisher mark’s distinctive silhouette and colors while adapting materials to the village. Keep sourced official logos for identity UI; a painted interpretation is not an official logo asset.

Entertainment and Social examples: YouTube is a cinema with its play mark, X a post/broadcast stand, TikTok a portrait-video station with its musical note, and Discord a shared conversation station with Clyde. Browser is the deliberate generic exception: a small globe on a stand, without a magnifying glass or extra machinery. Do not decorate these devices with invented unread counts, posts or connection signals. Website-only Applets go directly from Peek to Focus; site login remains on the real website.

## 2. Three presentation states

Spell the names **Peek, Open, Focus**. Not Peak, Pick, Brief, Full View or Detail. They describe how content is presented, not account state, readiness or macOS fullscreen.

| State | User question | What appears | Next action |
| --- | --- | --- | --- |
| **Peek** | What is happening here? | A compact device grounded in its Region; useful physical state and an attention marker when warranted | Click the device |
| **Open** | What is inside? | The same installation enlarged and unfolded into selectable contents | Select an envelope, event, note, task, repository or session |
| **Focus** | Let me read or work on this | A readable live surface on the left roughly two-thirds; the selected Open item at the top, its Peek device in the middle, and Fox below on the right third | Read, navigate content, or ask Fox to act |

Native route: **Peek → Open → Focus**. Website route: **Peek → Focus**. Do not insert an empty or decorative Open when no useful native interaction exists.

### Peek: information in the device

- Keep the device fully visible before connection. No packaging box or separate lock badge. If a lock is useful, integrate it into the object.
- Convey state through the object: mailbox lid/flag/envelopes, today's date on the calendar face, a visible note leaf, task cards or an observed working mechanism. A status subtitle is not a substitute.
- Under the device, use only its name. No extra emoji, logo, Building/Ready label or status sentence. Open/Focus titles may use an existing icon; omit it when unavailable.
- Within a Region, use the shared Attention Center marker above the device. Prefer the most important active finding. Leave clear air above the silhouette; on hover the marker gently lifts. Do not invent attention for an empty account.
- Hover and selection should be subtle, consistent and meaningful. No debug rectangles or oversized selection rings.

### Open: unfold useful content

The enlarged device must reveal selectable information, not just become a larger picture. Contents should feel associated with the installation: letters emerging from a mailbox, agenda pages, notebook leaves, hanging reminders, repository folios, session work pieces.

Provide enough spacing to read and select the contents. Prefer one complete view; long lists and reading content may use one bounded scroll area with fixed navigation and primary actions. Use pages, steps or details when they match independent tasks, not as an automatic overflow fix. Never clip records, hide only the scrollbar or shrink an unlimited inventory to fit. Third-party websites retain their own scrolling. Attention markers continue above the relevant item, with the same meaning and priority; hovering lifts the marker, and clicking it selects that item.

An opening animation should connect Peek to Open. Use independently animated parts or authored frames where appropriate. A simple transition is acceptable until those assets are made; do not claim a rigged mechanism exists when only the plate scales.

### Focus: readable information, selected object

Every built-in Applet, including native readers and offline games, has an individual immersive landscape (owner request 2026-10-06). Native contents remain interactive above that backdrop. The right side holds **both the selected item from Open and its parent Peek device**: item above, device in the middle, Fox below. Place Previous / Next controls outside the selected item, immediately to its left and right, never inside or over its content. Mail is the exception: email switching lives above the left reader, without duplicate controls at right. Use these controls to browse within the same Applet without returning to Open; update the original content and Fox context together, and disable controls at the loaded boundaries. Mail uses the selected envelope at right and readable letter paper at left; the other Applets use surfaces suited to their content.

For websites, load the real site on the left. Each built-in Applet has a dedicated full-screen painted backdrop: make the entire canvas a continuous inhabitable themed place, with foreground, middle ground, distant environment, ground materials and coherent natural light. The left two-thirds also carry that environment; reduce detail and contrast only where live content needs readability. The owner rejected enlarged icons or devices placed on generic grass (2026-10-06). Never use a right-third image with a visible vertical seam. The setting must follow each product’s actual use: indoor, outdoor and open spaces should vary naturally across the catalog. Do not reuse a furnished room, desk, conference table or hall as a universal template; the owner explicitly rejected that approach (2026-10-06). A logo on a board does not establish a use case. Make the right-third activity immediately legible; the left environment supports it at lower contrast. Use a close viewpoint from the activity itself: a chair at the cinema, a place at the meeting table, or the planning desk. Keep complete primary equipment inside x=69–97%, y=16–62% of the source; reserve the lower right for Fox. New `immersive.webp` plates use `scene-fit`: the painting fills the whole window at one uniform scale and is right-aligned; nothing is blurred and no window edge is left bare (owner Order, 2026-10-07: blurred left, top and bottom margins read as a fault). When its manually recorded `composition.json` subject boundary would sit under the reader seam (`max(33.333%, 464px)` companion lane), the painting moves right by at most its outer 3% so primary equipment (to 97%) stays whole. Bind these measurements to encoded asset hashes; re-review them after changing artwork. Never stretch architectural details or the primary scene, blur any part of it, or add a zoom push. Inspect source art and actual live-content boundaries separately; a generation prompt is not evidence that its safe area was followed. At compact widths (800px or less), the existing single-column layout takes priority over the decorative background. Load each backdrop on entry rather than decoding the whole catalog at startup. Native Open, Focus and Web use the same Applet backdrop; content and navigation remain separate. The current 118-item generation, integration, visual-review and interaction statuses are tracked independently in `resources/styles/builtin/references/immersive/use-cases.json`. `coverage.json` and `near-scenes.json` are historical evidence for superseded directions and must not be used as acceptance for the current use-case scenes. YouTube's Peek cinema screen and Focus scenery must describe the same device.

Keep the browser clipped inside its frame. Use restrained painted materials matching the village and balanced outer spacing. No extra Worldlet address/navigation toolbar or close X; preserve website controls. Leaving Focus pauses and mutes media; the page is kept briefly for a quick return and then unloaded, and sign-in data is retained ([resuming a website Applet](../../platform/browser/INTEGRATION.md#resuming-a-website-applet)). The one exception is the person's own choice: while a video plays, Picture in picture right of the title in the top bar keeps only that video playing in a window in the World's right third, clear of Fox, its dialogue and the footer; the person can resize it, it waits out of sight inside other Applets, and one page plays sound at a time ([picture in picture](../../platform/browser/INTEGRATION.md#picture-in-picture)). While Fox drives a website page on a host that draws pages at any size, the page moves to a task picture-in-picture window at the World's bottom-right and Fox keeps working there; pressing it returns to the Applet ([task picture in picture](../../platform/browser/INTEGRATION.md#task-picture-in-picture)). A blocked embed needs an honest system-browser alternative through Fox.

## 3. Fox owns task actions

Reply, draft, complete, reschedule, edit and other task actions belong with Fox, not a second toolbar on the content sheet. Fox provides only relevant, supported actions for the current selection. Render dialogue actions as bold underlined text at the lower right, using the same font size as the message. Reading controls such as scrolling, pagination and item selection may stay with the content. Continuous reading should scroll; item changes may use pagination.

The Fox portrait, bubble and action arrangement keep their styling and dimensions when moving from the center to the right. At most three actions on each side; center a lone action vertically. A short context-aware invitation may accompany entry into Focus without overwriting an ongoing conversation.

Keep setup guidance separate from conversation state. Clear stale item/session routing on exit. A message sent while a Codex session is selected must reach that session; navigating away must not silently keep that destination. Operational status belongs inside the dialogue, not the Fox name badge. Do not expose internal errors such as `[response interrupted]`, or add World updated / Back to app / Continue setup banners.

## 4. Navigation and composition

- World fills the window. Attention Center overlays it and may be empty; never shrink the world to reserve a permanent sidebar lane.
- Region and Applet zooms follow the fixed camera direction, progressively moving closer. No free rotation. Returning follows the actual entry path: World → Focus returns to World; Region → Open → Focus returns to Open.
- In a Region, clicking exposed scenery returns to World. Inside Applet Open or Focus, background Region and Applet hit targets are disabled. Clicking exposed backdrop acts as Back (owner request 2026-10-05), one step at a time like Back, Fox Back and Escape; it never selects the Region or Applet behind it.
- Use one centered context title. No title at World overview, no Region emoji, no duplicate headings or badges.
- Keep installable device slots clear in open-air Regions. Applets must fit without colliding with neighboring objects or labels; future installation/removal must not require a newly painted whole world.

## 5. Shared 2.5D art and spatial rules

The original approved target is the color/style authority. Follow the [style and lighting contract](../../resources/styles/builtin/STYLE.md): soft painted dimensional forms, restrained color, quiet materials, readable silhouettes. Do not drift toward saturated toy renders, photorealism or flat paper cutouts.

Use PixiJS sprites and live UI; do not reintroduce Three.js. A device can comprise a body, moving parts, contact/cast shadows, content slots, attention markers and hit areas. Use independent elements when they need motion, interaction or occlusion; stable distant scenery can remain in a background plate.

Every asset must specify:

| Property | Requirement |
| --- | --- |
| Camera | Match the world's fixed elevated viewing direction and projection |
| Scale | Measure the intended ground footprint, not the transparent PNG bounds |
| Anchor | Register the actual ground contact point and content slots |
| Placement | Fit an explicit Region slot with label, marker and neighboring-object clearance |
| Lighting | Match light direction, palette and time/weather treatment; avoid conflicting baked shadows |
| Grounding | Natural alpha edges, contact shadow, appropriate overlap and depth order |
| Resolution | Supply enough detail for the accepted zoom; use matched higher-resolution variants where needed |
| Motion | Calm idle, hover, opening and real-work states; respect reduced motion |

Inspect the sprite **in the actual scene at World, Region and foreground scale**, not only on a transparent preview. Check for halos, jagged edges, floating shadows, mismatched sharpness and incorrect object proportions. Keep moving parts and all resolution variants registered to the same anchors.

Generate art without baked-in readable records, dates or UI buttons. Those belong to live data. Record reference images, prompts, provenance, dimensions and asset version in the repo. Make closer views or detail studies before production when the concept is insufficiently resolved.

## 6. Content is useful, source-backed and honest

Fox may organize the content displayed in Open instead of copying noisy original titles. Use a short action/fact title, brief context (at most two visible lines), and the real date/status when relevant. Follow the precise field budgets in [Core Applet content](../../core/applets/INTEGRATIONS.md#core-applet-content).

Keep provider IDs, source IDs, timestamps, evidence and original links separate from rewritten text. Focus distinguishes a Fox summary from the original. If there is no summary, show the original honestly. Never merge records solely because their titles match.

Do not fabricate items, counts, dates or progress. Distinguish loaded records from remote totals. Empty is valid. Completed/dismissed items stop asking for attention. Working animation must follow an observed task, stop on completion/failure/cancellation, and not imply another tool is running merely because saved history exists.

Sample replaces data only. It uses the same navigation, renderer and interaction contract, with explicit fictional records and no private connector calls.

## 7. Reference designs

| Applet | Peek device and useful cue | Open contents | Focus selection |
| --- | --- | --- | --- |
| Mail | Mailbox; lid, flag and visible letters convey mail state | Selectable envelopes with Fox-organized priorities | Envelope at right; original letter at left |
| Calendar | Calendar face showing the real date | Readable agenda / seven-day timeline | Event card at right; event details at left |
| Notes | Notebook with meaningful visible leaf state | Selectable note leaves | Selected leaf at right; original note at left |
| Reminders | Task device with visible card state | Actionable task cards | Selected task at right; original details at left |
| GitHub | Octocat repository archive, branch rails and review tray | Repositories with useful identity and state | Repository folio at right; metadata, PRs and issues at left |
| Codex | Terminal-cloud code production line | Sessions with project and observed status | Selected session at right; conversation at left |
| Claude Code | Asterisk drafting/review workbench | Sessions with project and truthful saved/live state | Selected session at right; supported conversation content at left |
| Notion | N-spine page archive with index leaves | Authorized page folios | Original page at left; selected folio and device at right |
| Obsidian | Purple crystal linking notebook leaves | Notes from the selected local vault | Original Markdown at left; selected leaf and device at right |
| YouTube | Recognizable cinema screen | Skipped until a useful native Open exists | Real website at left; related cinema scenery at right |

These are design intentions. [Core content](../../core/applets/INTEGRATIONS.md#core-applet-content) and [Work Applets](../../core/applets/INTEGRATIONS.md#work-applets) record actual capabilities and gaps, including incomplete physical Peek animation and provider-specific session execution limits.

## 8. Authoring and acceptance checklist

Before code, write the Applet's one-line purpose, identity reference, functional device concept, Region slot, three states (or explicit web-only route), content budget and Fox actions. Review a board showing the states together. Then prepare registered assets and connect real data through the existing authorized browser, CLI, MCP or native adapter.

- [ ] Brand and function are both recognizable; it is not a pure icon statue.
- [ ] Palette, camera, footprint, grounding and zoom resolution fit the world.
- [ ] Peek communicates through physical state; no status subtitle or duplicate icon.
- [ ] Open has readable selectable contents, or is honestly skipped.
- [ ] Focus displays the correct original; the right column retains item, parent device and Fox, with working Previous / Next item navigation.
- [ ] Attention follows the actual finding through device and item levels.
- [ ] Fox owns supported task actions and receives only the current context.
- [ ] Back, inert Applet backgrounds, direct entry and re-entry preserve the actual route.
- [ ] Disconnected, empty, loading, failed and cancelled states work without invented progress.
- [ ] Long histories are bounded/paginated; decoding cannot freeze the Mac UI.
- [ ] Exiting a website stops audio unless the person chose picture in picture; permissions and sign-in remain separate from availability.
- [ ] Sample and real data share the same behavior; reduced motion and keyboard access work.
- [ ] Document what was visually checked, fixture-tested and tested with a real account separately.

A completed picture or working link does not make an Applet **Ready**. Ready requires the promised behavior to pass acceptance; remaining gaps must stay explicit.

### Coding-device motion and allowance

Codex and Claude Code should look productive while a session is actually running: moving conveyor/work pieces or drafting parts, not a permanently spinning decorative icon. Pause for user input, stop on completion, failure or stale signals, and respect reduced motion. Saved history does not prove live execution.

Show one compact battery above each coding device for the remaining **weekly account allowance**, with reset time available on hover/accessibility text. It is a percentage, not a token count or context-window meter. Use provider-reported seven-day windows, never an assumed secondary window. Missing or expired data is unknown, not empty/full; show an unfilled dashed indicator. Claude's optional local hooks/statusLine may supply this data while retaining existing user configuration and excluding conversation bodies.

The coding battery is part of the Peek device assembly, sharing its position, scale, visibility and lighting across World, Region, Open and Focus. It is not a fixed HUD badge. Device motion uses registered moving parts: conveyor rollers and articulated tools, with quieter idle/hover motion and stronger observed working motion. Moving overlay strokes alone do not meet this requirement.

## Native / Web presentation switch

Hybrid Applets expose a Native / Web switch in the Applet's [top bar](../components/INTERACTION.md#top-bar), right of the title, in Open and Focus: a capsule of two icon buttons, the chosen view lit. Native is the simplified reader; Web replaces the left content with the original website inside the same Applet. Preserve the selected native item on return. Never navigate to Browser merely to open the original, and do not duplicate the toggle with a globe or “View original” action. Switching away unloads the browser content and media but retains sign-in. Local-only Applets such as Obsidian do not offer their marketing website as an equivalent Web mode. Keep editing actions with Fox.

## Health, Travel and Money

Use the [route and capability matrix](../../core/applets/INTEGRATIONS.md#health-travel-money-applets). Native readers require a working, authorized data path. A published MCP is not enough if the client or account is ineligible. Stripe customer folios and PayPal merchant invoices use native Open/Focus; the remaining seven devices open websites directly. Never present decorative activity marks or coins as live health/financial measurements.

### Open conversation clearance

In Open, Fox, its dialogue and actions occupy the lower-right area, retaining the same styling as Focus. Keep selectable contents to the left and the device above the conversation area. Long replies expand above Fox, including over the device, and paginate only after using the safe available height. World and Region retain the centred companion; the world background always fills the window.

Mail Focus places previous/next email controls above the left reader. These switch selected emails; the separate paper-page controls only turn pages within the current email. Do not duplicate email switching on the right-hand device.

## Device motion contract

Every authored animation uses the optional typed `motion` field in the Applet definition; see [motion format](MOTION.md). Do not add per-Applet animation switches to the shared renderer. Omitted motion means a static device, not a fabricated running state. Keep the foundation and contact shadow still while mechanisms move. Idle and hover motion are decorative; stronger working motion requires observed activity. Reduced Motion restores the neutral pose.

### Fixed placement and conversation space

Applets occupy authored world slots. Users may add or remove an Applet, but cannot drag it or select another location. An empty Region shows one translucent add marker at its center; occupied Regions show none. Ignore legacy placement overrides when drawing the world.

In Open and Focus, Fox stays on the right. Its dialogue may expand upward over the foreground device to the safe top margin. Prefer readable paragraphs in that available height before introducing another page. Very long text still paginates to stay inside the window. World overview devices stay still; interaction and observed work may animate them within their Applet context.

### Mail stationery

Open letters show the addressed front: original subject, actual sender and received date when available. Do not put text over the envelope flap or use unread status as a sender. Missing metadata stays absent. Open is a single Needs Attention pinboard: a fixed 3 × 3 grid of at most nine attention threads. Each envelope has a restrained paper material, a pin, sender stamp, concise subject and relative time. Thread stacks are allowed; category bins, scrolling and pagination are not. All other mail is available through Web.

Focus uses matching warm paper, quiet sage accents, a clear sender/recipient card and readable paragraphs. The current source remains unmodified. Previous/next email controls flank the subject title; page controls below the body use small triangles and a single combined `current / total` count, including attachment pages. Do not display internal labels such as “Original letter” or duplicate section counters.

Mail Open and Focus place a quiet info button below the device; hover or keyboard focus reveals the connected mailbox identity and reading status. Do not repeat the account as a permanent header. Sample is explicitly separate. An empty attention board is not an empty mailbox: guide people to Web for all mail, distinguish waiting, failed and empty reads, and never imply that a saved connection proves current API access.

Mail Focus reflows original prose and preserves paragraph boundaries, link labels/targets and attachment metadata. Never substitute a summary for the original. Explicit original reads must not silently use discovery excerpts or omit older thread messages; oversized originals report the limitation. Keep at most two contextual Mail actions at Fox, without repeating those actions in its guide bubble.

The Mail envelope and Focus header share sender identity, avatar treatment, paper colors and typography. A sender's portrait is a real public picture: their own Gravatar, else the sending organization's verified BIMI logo or website icon (never for personal mail domains such as gmail.com); otherwise their initials on a muted village tint. Never invent a portrait. The Focus header groups subject, sender, recipient and relative received time, with exact time available on hover. The body is preprocessed into readable paragraphs without replacing original wording.

Mail envelope attention markers sit above the envelope, centered. Show concise Fox-curated subjects where available; retain the source subject on hover in both Open and Focus. Native Mail has no Archive or Updates category boxes. Sender labels must stand out from recipient metadata. Dates are relative; unavailable or ambiguous dates say “Time unavailable” rather than inventing a timestamp.

Mail retains its village backdrop when switching Native / Web. Only the left content changes. Open devices share an upper-right anchor, leaving the lower right for Fox.

The Mail Open board is a full-size wall noticeboard with a thin rim and generous letter area. Empty boards show only a few unused pins, without empty-state sentences or Web hints; connection status stays with Fox and device info. Sender avatars occupy the envelope postage stamp.

Mail’s empty board shows nine softly aged envelope impressions and pinholes, without empty-state sentences or Web hints. Needs Attention is painted directly on the plaque, paired with a visually hidden accessible heading.

### Discover Applets from Browser

When generic Browser visits a recognized service, offer one contextual shortcut beside the device: Add [name] to World if absent, or Open [name] Applet if already installed. Adding persists through the ordinary Applet installation path, then opens the Applet's declared native route when available. It does not grant account access. Match service hostnames, not page titles, query strings or lookalike domains; clear the offer after navigation to an unrelated site. Do not repeat this shortcut inside an Applet's own Web mode.

### Mail Focus reading exception

Mail Focus uses the shared Village HUD reading surface (warm paper by day, deep forest with light ink at night), a distinct sender/subject header, and continuous vertical scrolling for the original. This supersedes the previous paper-page pagination rule: preserve inline images, links, tables and attachment metadata in reading order. Older thread messages may be collapsed individually with sender and time visible. Do not claim raw HTML fidelity when the source adapter only provides Markdown/text. Fox dock action typography and spacing are identical in Native and Web modes.

On-ground slots are persistent spatial memory: five fixed residents per region. Usage, last-open time, connection status, visibility and catalog refresh must not reorder or compact them. Initialize vacant positions once and persist them; only explicit user arrangement changes occupied positions. Recency sorting is allowed in the panel's Recently used list beyond the ground, never on the ground.

The presentation switch uses the shared Worldlet W mark for Native and a globe for Web, with accessible labels and selected-state feedback: the chosen view is lit on the darker frosted control. It stays outside the panel clipping boundary.

### Hover identification

Identify ground devices with a compact cursor-adjacent tooltip: white semibold UI text on a dark translucent surface, bounded to the window and noninteractive. Hide it on pointer leave, click and navigation. Do not require users to search below a device for its name. Keyboard focus retains the accessible device name and caption. Weather is reached from the upper-right HUD, not a duplicate ground installation; its forecast remains available.

### Ground discovery badges

Reuse the approved golden sculpted exclamation (`mailParts.attention`) centered directly above the device's visible silhouette, with a clear gap when saved actionable findings exist. Do not show white dots, ellipses or availability markers above devices. Content availability, processing and connection state belong to the base lamp. Runtime failures use a separate exclamation and action label; they are not saved Attention findings. Category diamonds/triangles belong to Attention Center and individual records, not ground devices. Preserve the separate base lamp for runtime state. Empty or merely connected Applets do not acquire fabricated findings; after onboarding, badges appear as real content arrives. Completed and snoozed findings do not produce an exclamation.

Hovering a ground device gives its exclamation one gentle upward bounce; it does not loop. Respect reduced motion. Align against opaque artwork bounds, not transparent image padding.

### Distinct Home silhouettes

Mail uses a sage village postbox with a small blue enamel envelope plaque; Calendar uses a terracotta-header flip calendar with a date grid; Notes uses a pale-yellow sticky-note pad in a shallow oak writing tray with a curled corner and pencil; Reminders uses separate cream task cards in a wooden rack with colored round pegs. Shared timber bases, left-facing perspective and a single inset base lamp unify these devices without making their paper surfaces interchangeable. Do not bake current dates or account data into artwork.

Every copy of a device sprite—including Applet pages, catalog cards and region shelves—uses the same live base-lamp state and registered texture socket as its ground device. HTML copies must not remain permanently black or infer login from navigation. Hidden or removed copies must not leave floating lamps. Decorative scenery plates are not device sprites.

For these four Home Applets, the countryside object is the primary silhouette; familiar system icon cues are integrated accents: a blue enamel envelope plaque, red calendar header, yellow sticky paper, and colored reminder pegs. Use matte wood, paper, enamel and restrained brass. Avoid a large rounded-square app tile mounted on a plinth, shiny plastic, or decorative clutter. A user should recognize both the function and a useful object belonging in the village. Balance apparent mass and the dominant silhouette dimension together; sparse vertical logos must not tower over their neighbors. Preserve authored proportions and ground positions.

Base lamp emission uses one shared glass-lens surface in Pixi and HTML: dark curved rim, colored luminous core, small upper-left reflection and restrained falloff over the bezel. Keep the registered socket centre fixed; only the transparent halo extends beyond the lens. Off leaves the original black glass visible. Processing white breathes deeply every 2.4 seconds; other states stay steady.

## Home readers and responsive layouts

Treat the approved Peek image as the material and shape reference for Open and
Focus. Mail unfolds envelopes and letters; Calendar keeps its red binding and
two brass rings; Notes keeps its yellow notebook binding; Reminders keeps the
timber clipboard, sage rails and colored task dots. Do not replace approved
Peek devices while refining their readers. The Home design studies and image
prompts live in `resources/styles/builtin/references/home-readers/`.

Keep live titles, source metadata and controls in HTML. Mail identity comes
from original headers, never a Fox summary. Show the sender's initials when no
public picture exists. Display sender upper left, portrait upper right, concise
subject centrally and relative time lower right on envelopes. Preserve the
complete original in Focus; writes and reply preparation stay with Fox.

Respond to available space by reflowing, not shrinking the whole Applet. Wide
Calendar has Day/Week/Month; narrow Week becomes vertical day sections and
Month opens an individual day from its compact cells. Notes reduces to one
column. Maintain readable text and 44px control targets. Long source collections
use one bounded content scroll, leaving navigation and Fox accessible.
