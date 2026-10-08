# World and Applet sizing

This is the shared UI sizing standard. Use it with the [Applet design guide](applets/DESIGN-GUIDE.md) and [built-in UI materials](../resources/styles/builtin/UI.md). World geometry and camera behavior are specified in the [layout contract](world/ENVIRONMENT.md).

## World reference

**1920 × 1080, 16:9** is the design and visual acceptance viewport. `world/world-design.ts` owns this constant; do not introduce another logical design size in individual components.

The actual app window is resizable. The scene scales uniformly, preserving relative positions, sizes, road connections and installation slots. Different aspect ratios change the visible terrain crop, not Applet layout. Keep surrounding terrain beyond the default overview for region centering. HUD text and controls use their own readable viewport sizing.

Texture pixels are independent: a 3840 × 2160 background provides more detail but does not double the size of the world or its devices. Device pixel ratio affects sharpness, not logical placement.

## Applet device sizes

Prefer a complete first view. Long reading and collections may use one bounded
content scroll area with fixed navigation/actions; avoid nested scrolling.
Use steps or pagination when they match the task, preserving text and every
record. See the [scrolling contract](../resources/styles/builtin/UI.md#fit-first-scroll-deliberately).

These sizes describe the dimensional **device Sprite**, not the publisher's flat logo. World values are measured at the 1920 × 1080 reference viewport. Gallery and foreground values are CSS-pixel containers with responsive limits.

| Presentation | Standard | Behavior |
| --- | --- | --- |
| World / Peek | **84px wide** | Preserve image aspect ratio. This is the full texture box; use consistently calibrated main-body mass and ground baseline, with limited transparent padding. |
| Region expanded shelf | **Up to 64 × 48px image container** | Ground slots, Recently used, Recommended and All share one continuous content area; preserve artwork proportions and labels. |
| Generic foreground device, Open | **Up to 300px wide** | Limited to 23% of viewport width. Custom unfolded Applet compositions follow their own content layout. |
| Generic foreground device, Focus | **Up to 230px wide** | Limited to 19% of viewport width, leaving room for content and Fox. Painted Focus scenery and Mail's custom stage are separate compositions. |

`APPLET_OVERVIEW_WIDTH` is the runtime source for the 84px standard. The renderer converts it through the reference overview camera into world units, then uses one transform for sprites, shadows, labels and pointer hit-testing. Changing the background's overscan must not silently alter this standard.

## Artwork and interaction rules

- Keep the original device proportions. A tall mailbox and a broad workbench do not need identical heights; balance their apparent visual weight during composition review.
- Ground devices at their contact point. Normalize transparent margins during asset authoring rather than shrinking the visible artwork inside a large invisible canvas.
- Review the silhouette at 84px and detail at the foreground sizes. Supply enough source detail for a 2× display there; target at least 512px across the visible device, with a 1024px master preferred. Never claim that enlarging a small source adds detail.
- Keep names, counts and status indicators separate from image assets. They are not included in the 84px width.
- Avoid a permanent card, border or pedestal around every device. Hover and keyboard focus provide restrained emphasis; do not alter slot placement.
- Empty regions show a plus without a region name. Nonempty regions show their installed count; opening it presents the foreground shelf without moving Fox or the camera.
- Preserve original publisher logos in onboarding and app selection. Flat-logo controls follow their shared component sizing; the Sprite dimensions above do not apply to them.

## World visual hierarchy

- Keep the authored daytime palette: scenery saturation is unchanged. Apply only a mild contrast reduction (terrain −0.10; landmarks −0.08); ambient night/weather color remains independent.
- Device contact shadows are soft ground ellipses (opacity 0.44), not pedestals or permanent selection outlines. Hover still reveals the silhouette.
- Each court uses three evenly spaced rear slots and two centered front slots. Keep non-interactive landmarks in their original composition; the Work furnace is slightly farther back to clear the device rows. The manifest owns slot anchors; `region-landmarks.ts` owns separate decoration anchors.
- Branded device identity must survive the 84px overview. Follow the Applet design guide's function-first identity rule: recognizable tool, recognizable brand, proportionate integrated marks.

### Per-device optical correction

The 84px texture-box width is a baseline, not a promise of equal perceived mass. `scripts/calibrate-applet-scale.ts` measures alpha area and the central 5–95% silhouette of every static Peek, using YouTube as the reference. `APPLET_OPTICAL_SCALE` applies a bounded 0.75–1.20 correction with a dominant-body-dimension cap shared by the sprite, hit mask, shadow and label bounds. Additional visual adjustments reduce Notion, Obsidian and WeChat. Sparse tall marks must not be enlarged beyond the common body envelope just to match opaque area. Inspect a contact sheet and the scene after calibration; geometry alone cannot guarantee perceptual equality. Open/Focus uses its own layout size while retaining these relative corrections. All Applet device artwork currently uses static Peek images, including Mail/Calendar/Notes/Reminders and coding devices; do not substitute old animated atlases.
