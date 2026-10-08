# Applet motion formats

`AppletDefinition.motion` is the typed animation contract in `contracts/world.ts`. One player drives visible devices in World, Region, Open and Focus. This is an implementation specification, not an agent skill.

## Authored frame sprites (version 2)

Use this format for opening lids, turning pages and other changes that reveal surfaces or change perspective. Never simulate those actions by stretching one illustration.

```ts
motion: {
  version: 2, kind: 'sprite-frames',
  columns: 3, rows: 2, frames: 6, fps: 8, ambient: false
}
```

Register the atlas as `motion` beside the Applet's other artwork in the built-in style manifest. Cells run left-to-right, then top-to-bottom. Each cell has the same transparent canvas, perspective, scale and ground anchor. Frame zero is neutral; the final frame is the presented pose. Keep all changing parts inside the canvas. No baked status text or fictional account data.

| State | Playback |
| --- | --- |
| Rest | Neutral pose; World overview is still |
| Hover | Play toward presented pose |
| Leave | Reverse toward neutral |
| Open / Focus | Present the authored device pose |
| Observed work | Forward/reverse cycle while the observed work signal exists |
| Reduced Motion | Neutral frame, including the DOM Mail presentation |
| Hidden / disposed | Stop updating / release animation resources |

The DOM Mail device shares the frame clock with the Pixi renderer. Reading Mail does not loop the lid animation. Weather only responds to interaction; its pose is not a measured wind bearing.

### Home assets

| Applet | Authored action |
| --- | --- |
| Mail | Flag lifts, lid opens, envelope emerges |
| Calendar | A page curls and turns around the binding |
| Notes | Quill lifts while a notebook page turns |
| Reminders | Cards fan forward and the bell swings |
| Weather | Rooster and arrow turn above the stationary sundial |

Sources, transparent atlases and preparation instructions live in [Home animation assets](../../resources/styles/builtin/assets/animations/home/README.md). These are six-pose animations; future smoother actions can increase frame count without introducing a new Applet-specific player. Inspect the actual rendered size, not just the source sheet. Generated frames can vary slightly; check stationary paint and ground registration before accepting a replacement.

## Painted rigs (version 1)

The existing Codex and Claude Code devices retain `kind: 'painted-rig'`: normalized `joints` deform small local regions, optional `rollers` rotate circular samples, and `idle`, `hover`, `speed` control amplitude and timing. This supports small mechanical movements, not unpainted interiors or large perspective changes. Stronger coding-device movement uses actual session state; saved history is not evidence of running work.

## Acceptance

Check World/Region grounding, hover and reverse, Open/Focus, true work versus idle, original data readability, Reduced Motion and cleanup. Run `node scripts/applet-motion-check.ts` after building the native UI. Fixture checks do not establish real-account behavior. Keep this contract independent of account connectors and source content.

## Motion refinement target

Peek, Open and Focus remain the three product presentations. They do not require three unrelated animation sets. Use six behavior categories: rest, content/attention pose, hover response, opening, closing and observed work. Rest and attention can be still poses. Focus reuses the presented device; do not restart an opening action whenever source text refreshes.

The current six-pose Home atlas is a coarse first pass. Do not claim that slowing it down, duplicating frames or crossfading silhouettes creates fully authored smooth motion. Target 12–16 distinct poses for a brief hover response, 24–36 for unfolding, and 24–48 for a work cycle, adjusted to the mechanism and duration. Closing needs its own timing and may reuse opening poses only when the mechanism permits it. Keep a fixed base, coherent perspective and stable paint. Use anticipation, acceleration, a short hold and settling; avoid constant-speed ping-pong. Idle does not play work loops. Validate one Mail action at actual display size before regenerating all devices.
