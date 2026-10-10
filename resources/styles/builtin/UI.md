# Built-in UI standard

World and device dimensions follow the [UI sizing standard](../../../ui/DESIGN-STANDARDS.md): 1920 × 1080 design reference; 96px overview Applet width.

`tokens.json` (the Village theme package) owns palette, type and spacing. `controls.css` owns interaction
materials. Native Applets and marketing consume the same pack. Do not create a
per-Applet palette or draw text and controls into bitmap assets.

Desktop Focus readers use equal 64px top, left and bottom outer gutters. Mail
and Weather align their visible inner surfaces to that same boundary. The right
lane remains reserved for the Applet device and Companion; narrow layouts retain
their stacked spacing. Settings live in a Companion Panel tab, with no separate
world gear. Existing account, data, recovery and update actions keep their native
behavior and confirmations; the settings body scrolls beneath the fixed tabs.

| Role | Default | Use |
| --- | --- | --- |
| Forest | #315F48 | Primary content action, selected state |
| Paper | #F4F0E5 | Reading surfaces |
| Ink | #203B30 | Body copy on light surfaces |
| Honey | #EDC47D | Fox identity, restrained emphasis |
| Content frost | Charcoal at 76% + blur | High-contrast glass variant |
| Scene glass | Warm white at 9% + 12px blur | World/Fox controls, no raised shadow |

Companion configuration and Area editing share `.ui-hud-panel`: the same paper
material, forest ink, subtle asymmetric corners, 24px padding (16px on narrow
windows), 14px controls and 44px targets. Keep these reading panels on stable
paper at night as well. Companion tabs use a quiet selected fill with no baseline
or selected underline. Each panel keeps one bounded content scroller below its
fixed navigation; Area placement may temporarily lower the panel while dragging.

## Default Applet contract

World devices use their registered artwork sockets for live light; no art
regeneration is required. Ready is steady white; observed reading, syncing, connecting
or running sessions breathe white deeply every 2.4 seconds, with no label: the companion panel's History page says what the Applet is doing. Disconnected/unknown sockets
remain dark. Yellow and green are suppressed: unread saved findings leave the lamp
white, with no notice of their own; Attention Center is where they are read. Red
failures have a visible exclamation, explanation and a real keyboard-accessible action,
shared across Peek/Open/Focus. No action means neutral white, never color alone.
Notices of neighbouring devices (Mail and Calendar share Home) stack with a small gap
instead of overlapping; each keeps its own action and none is merged away.
Applet labels follow hover/focus (or Region view), never transient work state.
Above each device, saved Attention items use the same source IDs as Attention
Center. A new item pops the shape once; refreshes retain the node and do not
replay it. Completed/snoozed findings clear the marker when none remain. Multiple
findings share one priority shape; connection setup and routine reads do not
invent Attention items. Reduced Motion keeps the lamp and shapes static.

### Fit first, scroll deliberately

Prefer a complete first view, not a blanket ban on scrolling. World overview,
Loading and short settings should fit without scrolling. Continuous reading,
history, app catalogs and search results use one bounded content scroll area;
keep titles, search/navigation and primary actions outside it. Avoid whole-panel
and nested vertical scrolling. Never clip records, hide only the scrollbar or
shrink readable text to force a fit. Preserve keyboard focus and return position.

Show all seven forecast days together; scroll the content in smaller windows.
Use task steps for onboarding, with scrolling inside long selections. Pagination
is appropriate for independent items, dates and large server datasets, not
arbitrary groups of three days or four apps. Wide source tables may scroll
horizontally to preserve structure. Third-party websites retain their behavior.
Check small windows, large text, last-item access and fixed actions.

New native Applets use `appletSurface({title, subtitle})` from the shared
primitives. Append live content to `body` and actions to `footer`; use
`emptyState` for an empty collection. The default is warm paper by day and
deep forest with light ink at night. A small generated lantern, stone and leaf
corner ties it to Village without framing every control in artwork. Primary
buttons keep a thin edge and forest fill, not a thick wooden frame.
See the [accepted HUD references and provenance](references/village-hud/README.md).
The gallery's interactive Notes specimen and `ui/applets/weather/panel.ts`
demonstrate the shared shell. Native source/document readers share the shell via
`ui/components/text-reader.ts`: Notes, Calendar, Reminders, Notion, Obsidian,
Voice Memos transcripts, Stripe/PayPal records, GitHub and coding conversations.
Mail uses `appletSurface` directly, with the original subject in its standard
header and sender/recipient metadata in the scrolling body. It has no separate
avatar card or inset stationery. Thread and attachment anatomy remain intact.
One body scrolls beneath the fixed title; source
text, links, record identity and event handlers are not copied or rewritten.
Asynchronous source updates inherit the same controls. Browser and video-player
surfaces are excluded; third-party web pages retain their own UI. Native games
also use their own composition: a compact title and score, a freestanding board
or scene, then separate actions. They do not inherit the reading shell or a
corner close button; Applet navigation remains discoverable. External websites keep a stationary, gently grained timber
rim outside the host viewport, with no ornament covering their content.

Use `actionButton` from `ui/components/primitives/components.ts`. Default
`material: 'content'` supports `primary`, `secondary`, `quiet` and `danger`.
Use one primary action per decision. `material: 'glass'` is for scene overlays,
not reading content. Task actions still belong to Fox, not competing toolbars.

Standard buttons and icon hit areas are 44px high. Button labels stay on one
line; shorten labels first, then ellipsize with the full label available as a
tooltip and accessible name. This does not apply to rich list rows or document
content. Dialogue actions use underlined text without a filled button, blur or
raised shadow. Applets share tokens and primitives, not the entire scene HUD:
reading surfaces stay quiet, with solid emphasis reserved for a primary action.

Use `.ui-pane` for surfaces, `.ui-input` on labelled inputs, `.ui-choice` for
selectable cards and `notice` for feedback. Invalid inputs need `aria-invalid`
and an associated explanation. Destructive actions need explicit labels, not
just color. Embedded provider pages and logos keep their original identity.

Content corners are subtly asymmetric. Fox dialogue keeps its organic mask and
paper artwork. Live scene controls use a faint transparent wash, crisp SVGs and
single-line labels, without prominent rings or raised shadows. Panel entry sits
in the message bar below Fox. Hit areas remain
at least 44px even for smaller glyphs.

Controls have hover, press, keyboard focus, disabled and async busy states.
Reduced motion stops spinners; reduced transparency uses opaque fallbacks.
Night reading surfaces use light ink, except painted paper (Mail's stationery and the Home Notes,
Reminders and Calendar pages), which keeps day ink; scene controls remain transparent. Scene
buttons, launcher, region controls and input share the same fill, edge and blur
tokens. Below Fox is one 44px-tall message bar (owner decision 2026-10-04): the field,
then the microphone and Send. At rest it is 256px and reads “Click to type · hold to
speak”; typing widens it to 320px over 220ms (reduced motion: immediately). A click on
the bar types, a hold speaks. Clicking Fox types too; a 44px settings circle on Fox's left
opens the Companion panel (owner feedback 2026-10-04). Send matches the microphone. Dragging Fox never
starts speech. Desktop adds a matching home icon left of the bar for Back to World,
without a duplicate dock action. Native crop measurement follows the bar's width.
drafts survive dismissal. Speech supports click-to-start/send and hold-to-speak,
with a waveform rather than partial transcript text. Thinking uses head dots;
observed work/status text appears above the head, never in the input.
The bar uses the shared glass variant so they remain
legible when dragged over light documents. Reduced transparency removes blur.
The controls of an Applet's [top bar](../../../ui/components/INTERACTION.md#top-bar)
(Back, World, the Applet's actions, Picture in picture, the Native / Web switch) wear the same dark glass.
User-dragged positions persist across navigation and restart, clamped only to
the visible window. Initial layout anchors apply only before a user drags Fox;
there is no reset-to-origin action. Companion remains accessible inside Applets.

The native build's `ui-gallery.html` is the live specimen: palette, materials,
buttons, loading, disabled, inputs, errors, cards, tasks and empty states.
Check at 375px, landscape, large text and night when adding primitives.

System navigation (Fox controls, Back, World and applet chrome) uses a restrained
translucent glass material with a thin light edge. The private `--system-glass-*`
tokens do not restyle content surfaces. Reduced transparency and unsupported
backdrop filtering use opaque fills; focus rings and 44px targets remain.

The approved #1563 design uses two [imagegen country resources](assets/hud/country/README.md):
a nine-slice paper/wood stationery backing for Mail, and a shallow oak/sage rail
for game titles. Mail's live sender metadata has
a quiet letter-header tint; text, links and its single body scroller remain HTML.
No shared
outer panel surrounds the game scene and controls. Buttons and frames keep distinct material roles.
