# Painted Fox

Approved technical route and next production scope:
[Fox animation plan](../../../../../../ui/companion/ANIMATION.md).

The approved original-art 2D treatment is the default portrait renderer. The
built-in manifest registers the original `rig/fallback.png` plus the half-closed
and closed eyelid paintings here. The original illustration is not regenerated.
Generation prompts and provenance remain in `../../../drafts/fox-painted-idle/README.md`.

`ui/companion/animation/fox-painted-idle.ts` keeps the original pixels outside feathered eye
patches and continuously deforms a 64 × 64 mesh. `fox-painted-actions.ts` layers
seated body-weight shifts, shoulder raises, forepaw flexes, head gestures and tail
motion over it. `fox-pose-transition.ts` preserves pose and velocity on interrupted
state changes (420 ms normally, 180 ms for listening, 750 ms for rest). Real work interrupts previews,
and reduced motion shows a static semantic pose. There are no added dialogue
messages. World and desktop pet use the same portrait component.

These are restrained seated gestures: waving is a paw greeting, stretching is a
seated shoulder stretch, and reading/working are posture cues. This single-view
painting cannot produce a full raised arm, a walk, or hidden body surfaces.
Those require separately authored, registered poses rather than stretching the
existing pixels farther.

The renderer uses an offscreen WebGL mesh and the existing 640 px 2D presentation
canvas, preserving HUD hit targets and drag behavior. GPU context loss shows the
original still. Unmount releases GPU resources. Asset payloads are local data URLs
for native file origins; no service or model is called per frame.

Checks: `node scripts/fox-painted-check.ts` after `npm run build:native-ui`.
