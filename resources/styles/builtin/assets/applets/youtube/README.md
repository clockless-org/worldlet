# YouTube Focus scenery

`focus-day.png` is a continuous full-screen painted scene, generated with imagegen on 2026-09-18. References: `resources/styles/builtin/references/youtube-web/peek-focus-concept.png` for cinema identity and `resources/styles/builtin/assets/world/palette-reference.png` for the original color/material target.

Brief: landscape outdoor cinema, details concentrated in the right third and quiet meadow across the left two-thirds, sage screen and timber posts, two stools, grounded paving, restrained planting, distant blue hills, quiet foreground for the existing Fox HUD. No UI, text, Fox or generated branding. The official YouTube logo is composed at normalized `(0.8, 0.378)` by `ui/world/pixi-focus.ts`.

This is scenery for Focus, not an interactive Open scene. It fills the entire viewport with a right-aligned cover crop, eliminating the vertical seam; the live website overlays the left two-thirds. Focus keeps the authored bright colors for readability; but this asset does not have separately authored night/weather variants or physically changing lamp emission yet. Every browser Applet now has its own close-up; see `docs/art-direction/browser-focus/`.

The full-screen revision uses the earlier portrait cinema as its imagegen reference. Desktop browser left/bottom margins match the context title’s 24px top inset; the browser starts at 64px below the title, with a thin warm paper/stone rim. Native geometry is rounded inward and bounded to the rim; CSS transforms do not animate the independent native web view. The scenery fades in with a gentle push-in; a feathered peripheral blur keeps the cinema, Fox and website clear. Reduced motion skips the push-in.
