# Painted Fox idle — 2D draft

This fixed-view study retains the approved `assets/companion/rig/fallback.png`
illustration. The approved treatment has now been promoted to the active manifest;
eyelid PNGs live in `assets/companion/painted/`. This folder retains the original
review video and generation provenance. No 3D model, commercial animation software
or third-party rig is used.

## Implementation

- A continuous 64 × 64 WebGL triangle mesh deforms the original image: grounded
  breathing, neck-anchored head motion, small local eye shifts, independent muzzle
  sniff, staggered ear response and delayed tail movement.
- Half-closed and closed eyes are newly painted poses. A feathered eye-only shader
  mask blends those poses; all pixels outside the mask come from the original.
  This is not vertically squeezed eyeballs or a whole-image crossfade.
- The 12-second loop has deterministic timing, with an ordinary blink and a later
  double blink. Reduced motion returns the exact undeformed original pose.
- One indexed GPU draw per frame; three static textures. No 720-frame atlas is
  loaded into the app. The video is a review artifact, not the runtime format.

## Reproduce

```sh
node scripts/fox-painted-check.ts
node scripts/fox-painted-preview.ts
```

Open generated `output/companion/painted-idle.html`. It is self-contained and
offers pause/play, scrubbing and the original reference. `preview.mp4` is a
512 × 512, 60 fps capture of the actual renderer over a neutral background.

## Scope and remaining work

This is a fixed-view **idle** prototype, not the complete action library. It cannot
reveal hidden surfaces, turn the character around or move paws far from their
painted silhouettes. Reading/working will need new aligned poses and separately
painted occluded regions. Blinks currently interpolate three painted poses; final
timing and personality remain subject to visual acceptance. It has not been
integrated or tested inside the desktop app.

## Asset provenance

2026-09-25, built-in Image Gen edits; reference/edit target:
`resources/styles/builtin/assets/companion/rig/fallback.png` (1254 × 1254 RGBA).
Original input remains unchanged. Generated files are preserved unmodified at
the same size with alpha. Only their eye regions are consumed at runtime.

### Closed-eye prompt

Edit target: the attached original Fox character. Produce exactly the same square
transparent image, character placement, size, silhouette, head tilt, eyebrows,
smile, nose, ears, scarf, paws, fur detail, lighting and colors. Change ONLY BOTH
EYES to gently fully closed eyelids during a natural blink. Eyelids should be
orange fur with delicate curved dark lash lines matching the original eye sockets,
not squeezed open eyes, no white sclera or pupils visible. Preserve all other
pixels and the original identity as closely as possible. This is an aligned
animation replacement frame, NOT a redesign. One fox only, no labels, no extra poses.

### Half-eye prompt

Animation in-between edit of the attached exact Fox image. Change ONLY the two eyes
to HALF CLOSED during a blink: upper eyelids of orange fur descend over the upper
HALF of each original eye, partially occluding each iris. Keep the visible lower
iris and lower white portion in the exact original eye sockets, do NOT shrink or
vertically squeeze eyeballs. Same square transparent canvas, identical seated pose,
head tilt, face shape, eyebrows, muzzle, smile, fur, scarf, tail, paws, colors and
lighting. Preserve all non-eye regions as closely as possible. No new character,
no text, no extra poses.
