# Home authored sprite animations

Generated September 23, 2026 with the image-generation tool, using each existing built-in device as the visual reference. No user records or external account content were supplied.

## Inputs and intent

- Mail: `assets/world/devices/gmail.png` — flag, opening lid, emerging envelope.
- Calendar: `assets/world/devices/google-calendar.png` — page curling around the binding.
- Notes: `assets/world/devices/apple-notes.png` — lifted quill and turning page.
- Reminders: `assets/world/devices/apple-reminders.png` — fanning cards and swinging bell.
- Weather: `assets/applets/weather/peek.png` — rotating rooster and arrow.

Common generation brief: preserve the reference's sage, ivory and wood palette, fixed miniature camera and device identity. Produce six consecutive poses in a 3-column, 2-row sheet; keep the foundation stationary and every frame the same size. No labels, captions or new HUD. Background cleanup pass replaces empty space with uniform magenta, preserving all authored device poses.

`*-source.png` retains the keyed generation output. The corresponding `<key>.png` is the transparent runtime atlas. The build also extracts cells for Mail's HTML presentation. These are implementation assets, not new world-style reference targets.

## Reproduce preparation

From the repository root:

```sh
node scripts/prepare-home-motion.ts gmail google-calendar apple-notes apple-reminders weather
```

Preparation removes the magenta matte, cleans edge spill, aligns ground contact across cells and adds uniform safety padding. This is deterministic technical processing, not an additional generated painting. Retain sources when updating assets so alignment and transparency can be reviewed.

## Review limits

Six authored poses give a readable complete action, not high-frame-rate cinematic animation. Inspect edge matte, fixed bases and pose transitions in the running app. Do not use whole-image wobble to hide frame drift. Future revisions should improve artwork in this same contract rather than fork the renderer.
