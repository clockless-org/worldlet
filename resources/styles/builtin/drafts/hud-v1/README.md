# HUD asset family — draft 1

Status: design family selected for live integration on 2026-09-25. This extends
the single cozy-miniature style, not a second theme. See the
[production material implementation](../../assets/hud/README.md); raw transparent
masters still have the edge limitations documented below.

## Visual standard

- Warm ivory matte surfaces, deep moss-green symbols, honey reserved for selected
  or primary actions. Derive final colors from the existing pack tokens.
- Front-facing, gently rounded silhouettes; very shallow shading from upper left.
- No metallic rings, ornate frames, thick bevels, glossy plastic or noisy grain.
- Same optical glyph weight and scale across close, navigation, panel and media.
- Small controls remain quiet beside Fox. Larger surfaces share the same finish.
- Do not paint titles, user content or translated text into assets.

## Inventory

`buttons.png`: original generated 4 × 4 atlas, row-major order:

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | Close | Back | Forward | Add |
| 2 | Confirm | More | Panel | Back to World |
| 3 | Previous / up | Next / down | Microphone | Send |
| 4 | Play | Pause | Sound | Refresh |

`surfaces.png`: companion blank surface family; geometry and intended use are
specified in its generation prompt. Keep copy as runtime text.

`review-board.png`: opaque visual review board with representative labels and
states. It is not a runtime texture; text on this board is illustrative only.

Both source sheets are 1254 × 1254 PNGs with alpha. Visual inspection found stray
alpha flecks and colored edge fringes. One targeted generation cleanup improved
the button gutters but did not eliminate the issue; the surface retry was not
selected. These are **design masters, not production-ready transparent sprites**.
The opaque review board communicates the family without claiming alpha readiness.
Its input-bar send glyph differs from the atlas (paper-plane versus upward arrow);
use the atlas's upward-arrow meaning consistently when preparing final controls.
The state samples illustrate direction only, not tested interactive states.

## Implementation contract

- Use real semantic buttons with accessible names, keyboard activation and focus
  indicators. Images are decorative, not the interactive element.
- Target 32–36 logical pixels for compact circular artwork, with at least 44 × 44
  logical pixels of non-overlapping hit area. Inspect at both 1× and Retina 2×.
- Share one base treatment. Hover increases surface light slightly; pressed lowers
  the apparent elevation without moving adjacent controls. Selected uses a honey
  accent; disabled is both visually subdued and semantically disabled.
- Keep artwork ungraded by world day/night or weather. Verify legibility against
  both terrain plates. Do not assume image generation establishes contrast ratios.
- Asset alpha must be checked before slicing or production registration. Do not
  use painted checkerboards or remove backgrounds by color-key guesses.
- Final glyphs may use matching vector overlays for sharpness and state changes;
  the approved material artwork remains the common visual base.
- Stretch panels only through validated nine-slice insets, never by stretching
  rounded corners. Determine exact crop bounds from accepted source artwork.

## Provenance

Created 2026-09-25 using the built-in image generation tool. Exact model/version
is not exposed by that tool. Prompts are retained alongside original output.
References: current `resources/worlds/village/images/day-six-regions.png` and
`resources/styles/builtin/assets/companion/rig/fallback.png`; style only, not edit
targets. UI planning used ui-ux-pro-max, with the existing pack taking precedence
over unrelated generic palette recommendations.

Before promotion: review shapes at actual size, day/night contrast, alpha edges,
icon meaning, hover/press/focus/disabled states, and a composed Companion preview.
Register accepted assets explicitly through the built-in pack and its builders.
