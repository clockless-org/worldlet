# Theme Packs

A Theme Pack describes how Worldlet presents the shared product: where things are, how they look and
how they move. It never owns data. Mail keeps its ID, accounts, messages and background tasks whatever
room shows it; the person's area names, Applet membership and last use are the same in every theme.

**Themes are static packages of the one [Theme contract](CONTRACT.md).** Worldlet bundles one, the Village
(`ui/theme-packages/village/`); there is no theme picker. A theme is pictures, sounds, fonts and JSON
([What the theme declares](CONTRACT.md#what-the-theme-declares)); the host draws the World and the Applet pages.
The companion and the loading and first-use pages are not part of a theme.

The data-only ThemePack described below is the host's own look: Village's shared assets (companion rig, HUD
material, sounds, world declarations) that every theme draws over. It is not a theme API:
`ui/themes/theme-registry.ts` holds the one pack.

## The parts

| Part | Field | What it holds |
| --- | --- | --- |
| Space | `space` | The world (`world.json` in the theme package; painted plates in `resources/worlds/<id>/`), scenes, rooms (one per product group), entrances, connections, hit areas and placement slots |
| Layout | `layout` | Content areas in the overview, a room and reading, and the companion's safe area in each |
| HUD | `hud` | Colors, type, material, borders, icons and short transitions, from the theme's Style Pack (`style.json` and `tokens.json` in the theme package; painted sources in `resources/styles/<id>/`) |
| Applet presentation | `applets` | Each Applet's Peek/Open/Focus art; an Applet without its own stands in the theme's generic room (`fallback`) |
| Motion and sound | `motion` | Ambient loops with their stop rules, the cue each business event plays, its reduced-motion form and sounds |
| Companion | `companion` | Its own rig and portrait, a mapping from the shared performance states (`ui/companion/animation/fox-state-catalog.ts`) to the rig's, a still fallback pose for states it lacks, and where it perches (`stable` or a repository PNG/WebP path per overview/room/reading context) |
| Surfaces | `surfaces` | The rest of the shared UI: `tokens` (CSS custom properties named `--theme-*`, plain values only), `fonts` (display and label font files with their license), `skin` (ten nine-slice HUD pieces: `attention`, `note`, `nameplate`, `back`, `bubble`, `panel`, `log`, `button`, `card`, `frame`) and `startup` (the loading picture, or the companion portrait) |

Motion also holds `transitions` (`area`: `zoom` or `shared`; `room`: `fade`, `door` or `shared`; `ms`) and `sound`
(`events` per business event and `ambient` per ambient loop, as audio files).

Optional `motion.sound.presentation` selects one ambient loop per place: `overview`
and `room` are defaults, `areas` maps stable region IDs, and `applets` maps stable
Applet IDs. Each value names a key in `sound.ambient`; `labels` gives every loop a
short `title` and an icon (`breeze`, `wave`, `tree` or `flame`). The build packages
these files in a native audio catalogue. UI sends a `theme:<pack>:<loop>` ID, never
a path. One native ambience channel owns playback, mute, volume and voice ducking;
scene changes neither start a stopped channel nor replace an explicit music,
podcast or ambience choice. Automatic theme ambience suspends when its scene is
hidden or inactive. Short event sounds follow that channel's mute and gain. See
[audio ownership](../audio/README.md#theme-ambience).

Any surface may be `shared`, which leaves the shared look (Village's) in place. `ui/themes/theme-surfaces.ts`
applies the rest: tokens and pieces become `--theme-*` properties with `data-theme-skin`, `data-theme-fonts` and
`data-theme-room-transition` on `<html>`, which `ui/themes/theme-surfaces.css` keys on; fonts load through
`FontFace`; the loading picture is set before the World starts; sounds play only while World sounds are on
(asking Fox turns them on or off). Attention pictures and Mail parts come from the theme's Style Pack; the build ships a theme's
own Attention pictures under `attention/<theme>/`. A preview with no theme-specific scene uses its
themed category illustration when supplied. Sprite-rig companion perches are bundled as images and
rendered underneath the character.

Every pack also has a `record`: its name, `origin` (`original`, `licensed` or `fan`), asset source and license,
so an IP collaboration and an original theme can be told apart.

## Rules

- **Data ownership is independent of the room.** A theme maps product groups to rooms; it does not move,
  rename or hide data.
- **Business events are separate from animations.** Core reports what happened (`applet.arrived`,
  `mail.received`, `task.working`, `task.succeeded`, `task.failed`, `task.cancelled`); the theme picks the
  cue. A cue plays once per real event (`ui/themes/theme-events.ts`): reading old mail or re-entering a
  room never replays it. A failure or cancel stops the work where it is and never plays the success cue;
  the validator rejects a pack that maps either to it.
- **Slot placement is stored per theme.** Pinned places are indices into one theme's slots, so they are
  kept per theme (`ui/themes/theme-placements.ts`). Village keeps them in the layout's `pins`, as before
  themes existed; another theme's wait in `themePins`.
- **Data only.** A pack is JSON validated by `ui/themes/theme-pack.ts`; paths stay inside the repository.
  The renderer half (camera, light, ambient motion) is trusted code registered per theme in
  `ui/world/theme-scene.ts`.

## Pack fields

Themes are [theme packages](CONTRACT.md). The fields below describe the host's pack.

A theme can register `applets.deviceEffects[deviceImagePath]` against each original image, including
Area-specific replacements. `lamp` gives the normalized center and radii of its runtime signal;
`idle` gives a separately registered center, radii, color and supported accent (`orbit`, `bubbles`,
`writing`, `glow` or `glint`). These coordinates survive transparent padding, alpha crops and scaling.
They change presentation only; the shared lamp states still own runtime health. Another theme never
inherits Village's lamp coordinates. HTML copies sharing device art identify their owner with
`data-applet` or `data-applet-id`; image equality alone cannot choose a signal owner.

A theme can register `applets.roomLayouts[focusImagePath]` for a shared room, with
`applets.focusLayouts[appletKey]` taking precedence for an individual Applet. Each layout contains
`content`, a normalized rectangle inside its Focus plate. The renderer projects it through the actual scene camera into
`--reading-x/y/width/height` and sets `data-reading-surface` on the World only while that plate is
shown. Theme CSS can put live content on an authored surface, such as a painted mail board,
without baking records or click targets into an image. Missing layouts retain shared reader geometry.

A room layout may also declare `ambience`: bounded light, dust, motes, ripples or stars in the same
plate coordinates. Validation rejects fields outside the plate or overlapping its live content. The
renderer scales these fields with the painting and pauses their local clock when hidden, inactive,
motion is off or reduced motion is requested. These fields never communicate business state.

A Focus layout can register a `delivery` for the shared `mail.received` event: a packaged silent
alpha WebM (`src`), normalized `bounds` clear of live content, `duration` (at most 20 seconds),
`shadow.bounds` and its `contact` interval in seconds, and `foreground` rectangles copied from the
same plate above the actor. The room compositor loads the video on demand, preserves its registered
size after decoder metadata changes, and follows the room's camera. The caller deduplicates source
evidence. Entry never plays it; hidden/inactive windows, reduced motion, motion-off, navigation,
narrow-layout fallback and theme destruction discard it without replay. A decoder failure leaves
Mail usable. Only Gmail's Focus room can play a delivery; other Applets have none.
