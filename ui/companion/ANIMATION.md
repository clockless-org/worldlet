# Fox animation and presence

## Current scope

The current scope is **32 authored development performances**. The owner's
2026-10-02 request resumes the full catalog and supersedes the paused 20-draft
scope. All 32 are reachable through the actual development portrait and its
preview controls. Published builds retain the accepted painted renderer;
runtime coverage is not a claim of final artistic or native release acceptance.

| Group | States |
| --- | --- |
| Conversation | idle, greeting, listening, acknowledging, thinking, explaining |
| Work | reading, searching, comparing, planning, drafting, calculating, organizing, creating, working, checking |
| Coordination | awaiting_user, awaiting_service, notifying, urgent, succeeded, blocked |
| Quiet life | looking, grooming, stretching, yawning, sleeping, waking |
| Interaction | pickup, settle, delighted, farewell |

Digital tasks share the supported workstation and its physical lid/carry lifecycle.
Comparison alternates two inspections; planning considers, places and revises;
drafting uses uneven writing bursts and a reread; calculation groups three taps
before checking; organizing selects, moves and groups; creation has a long sweep,
lean-back inspection and precise adjustment; checking scans successive regions
without signaling success. Each has separate phrase timing, head/shoulder acting,
wrist articulation and delayed ear/scarf/tail responses. Registered pupils find
the next target before the head turns; chest, ears, scarf and tail settle on
separate delayed clocks. Gaze blends through interruptions and remains beneath
the eyelids, including fully closed eyes. The screen never acquires
fabricated task output. Pencil/notebook studies remain available in the inspector;
the live drafting performance writes at the workstation.

Rest remains seated: sleep lowers the head into slow breathing, waking leads with
one ear, opens the eyes in sequence and adds a brief recovery blink; a paw covers
the yawn. Pickup tucks the
forepaws with delayed scarf/tail motion; release compresses and settles once.
The existing drag gesture selects pickup/settle when no foreground work owns Fox.
Work/input still wins; movement never cancels an actual task.

Existing aliases (`waving`, `talking`, `happy`) keep their semantic mappings.
`fox-state-catalog.ts` describes the acting; its `art` field records legacy source
studies, not runtime readiness. `anatomyRuntimeState` is the supported-state lookup.

## Rive Fox

The portrait plays the Fox from a Rive file in every channel (owner decisions
2026-10-03: move Fox animation to Rive, change it only through the generator
code, and ship it to release). `scripts/fox-rive/build.py` cuts the approved painting and its
registered underpaint plates into twelve depth layers (tail, body, ears, head,
eyelids, arms, laptop, book, magnifier), gives each a skinned mesh on the
anatomy skeleton (`resources/styles/builtin/drafts/fox-states-v1/anatomy.json`)
and samples the 32 performances in `scripts/fox-rive/performances.py` into
timelines. One state machine, `Fox`, picks the performance from the `state`
number of its view model (`states.json`) and blends from the pose on screen.
The output in [`assets/companion/rive/`](../../resources/styles/builtin/assets/companion/rive/README.md)
is the compiled `fox.riv` and `states.json`. The intermediate `fox.rml` (the Rive
source the editor or MCP can open) and textures are rebuilt locally and not
committed; no Rive account is involved.

`ui/companion/animation/fox-rive.ts` loads it with the Canvas2D low-level runtime and draws
into the existing portrait canvas on the portrait's own frame clock, so the
idle frame budget, hidden-page pause and reduced-motion still pose are
unchanged. Every bundle carries the runtime and file, and the page policy allows
`'wasm-unsafe-eval'` (the runtime is WebAssembly) and `blob:` images (Rive
decodes its textures through blob URLs). If Rive fails to load, the portrait
falls back to the painted renderer; in development the draft anatomy rig below
comes first.
Whole-body moves use the root bone, which pivots on the ground: `hop` (crouch,
take-off, arc with trailing ears and tucked feet, landing squash), `trot`
(walking in place on a diagonal gait), `lean`, `shake` and `cheer` (both paws
overhead) in `scripts/fox-rive/performances.py`. The portrait frames the
artboard with headroom (`FRAME` in `fox-rive.ts`) so a jump or raised paws stay
in view; the artboard does not clip.
Check: `node scripts/fox-rive-check.ts`.

### Companion looks

A look (`core/companion/companion-look.ts`) is a fur color and a scarf color; presets
name a few. `loadRiveFox` keeps the nine character layers Rive embeds (arms, eyelids,
head, ears, body, tail) through a custom asset loader and, for a look, recolors each
one on the page and decodes it into the same image asset, so the rig, meshes and 32
performances are untouched and nothing is recompiled. Fur is the painting's orange
family and the scarf its sage family; cream, white, outlines and props keep their
paint, and head layers keep the dark eye, nose and brow paint. Classic decodes the
painted originals again. The host stores the look in the `worldlet.companionLook`
preference (in World backups) and sends it with `companionProfile` and
`worldlet:companion-appearance`; `ui/companion/companion-look.ts` hands it to every
portrait. The Profile page's picker and Fox (`set_worldlet_preference companion_look`,
only when the person's own words ask for a new look) both set it.

Next: accessories as extra painted layers on the head bone (the rig needs headroom
above the head), then companions designed from a description, repainted in the
reference pose on the person's own Agent and cut into the same layers with the
rig's part masks. Check: `node scripts/companion-look-check.ts`.

## Renderer and state ownership

The approved painted Fox uses original-art mesh deformation, attached eyelid/paw
layers and continuous body controls. An offscreen WebGL mesh feeds the existing
Canvas2D presentation; World rendering remains Pixi. Assets and registration live
in `resources/styles/builtin/assets/companion/`; runtime composition lives in
`ui/companion/animation/fox-anatomy-runtime.ts`, `fox-task-performance.ts` and
`fox-anatomy-performance.ts`. The task detail layer preserves the physical
player's contact points during transitions, then uses registered task key
contacts and lifts. Review pauses stop typing. Prop ownership stays unchanged.
The old articulated and frame-sprite renderers were removed once the Rive Fox shipped; the painted Fox and then the expression atlas are the only fallbacks.

One main conversation drives foreground animation. Explicit task/activity signals
select work; unknown work stays generic. Background Applet jobs animate their own
devices. Animation never invents progress, unread counts, notifications or success.
Acknowledging means accepted; succeeded requires a verified result. Preview and
playful gestures do not send a conversation or change actual task state.

Idle stays quiet. User input and required approvals outrank decorative movement.
Double-click preview and Dev controls use the existing action mapping; they are
not evidence every experimental state is authored. Dragging repositions the Fox
cluster while preserving click/hold semantics; native desktop drag remains host IO.

## Transition and anatomy contract

- Blend from the currently rendered pose, including interrupted blends; preserve
  breathing/tail phase and velocity where practical. Do not reset to idle.
- Same-state updates do not replay a finite performance. A cancelled phrase must
  not begin another reach, wave or emphasis beat. Keep the latest real task target.
- Author reach, release and settle phases for props; retain ownership while
  interrupted. No floating book/laptop, double-face crossfade or whole-body size jump.
- Keep ear roots attached, tips stable, head rigid where required and soles grounded.
  Body initiates gestures; ears/tail follow. Preserve depth and painted overlaps.
- Input must respond immediately; easing must not block typing, speech or quitting.
  Foreground request identity rejects stale outcome gestures.
- Reduced motion uses stable semantic poses. Hidden pages stop rendering and resume
  current state without replaying missed decorative actions.

## Validation and remaining limits

A theme's own companion (`renderer: 'sprite-rig'`, `ui/companion/animation/theme-sprite-rig.ts`) plays one
painted pose per performance state through the same portrait and state owner.

Run `node scripts/fox-catalog-preview.ts` for the standalone 32-state player at
`output/companion-32/index.html` (timeline, slow playback and light/dark review).
The shipped Fox is covered by `fox-rive-check.ts`, `companion-look-check.ts`,
`fox-state-catalog-check.ts`, `fox-animation-schedule-check.ts` and the painted
fallback's `fox-painted*-check.ts`. The draft anatomy rig is a development
fallback only, so its geometry, render and study checks were removed; Git keeps them.

Use the [animation inspector](../../resources/styles/builtin/references/companion/index.html) for rendered review.
Inspect actual HUD size, dark backgrounds, narrow windows, rapid interruptions,
prop handoffs, planted paws and native World/desktop transitions.

The recorded native explanation/acknowledgment run had a 66ms maximum frame gap;
it is not explained by isolated CPU optimization. Cached ear-weight work measured
about 45% less CPU for that microbenchmark only, not whole-product acceleration.
Geometry and sampled frames do not prove natural acting or universal smoothness.
Continuous native interruption/return review and final artistic acceptance remain
open. Historical measurements and earlier scope decisions remain in Git.
New coverage does not establish native frame-rate or final artistic acceptance.
