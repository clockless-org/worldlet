# Fixed-view 2.5D production contract

The [built-in Style Pack](STYLE.md) owns visual direction. This document owns production mechanics, not an alternative style.

Use authored images with a spatial scene and fixed oblique camera. Runtime 3D models are not required. Generate objects in context before extraction; arbitrary isolated PNGs are not automatically ready to place.

| Resource | Required when |
| --- | --- |
| Composed master | Every new world or installation |
| Clean ground plate | A painted object must be removed or independently moved |
| Object RGBA | Independent selection or animation |
| Contact/cast shadow | Needed to establish support; separate moving parts from static shadows |
| Foreground mask | Walls/grass/branches must cover an object |
| Placement metadata | Ground anchor, footprint, intended screen size and depth |
| Detail variant | Maximum intended zoom exceeds real source resolution |

Split layers only when interaction requires them. Preserve geometry and source provenance. Ground contact, not image center or transparent padding, defines placement. Door/path dimensions establish plausible scale. Rotating a flat sprite is not a new camera view or a directional animation.

## Resolution and zoom

Source width must cover maximum CSS display width × device pixel ratio. Upscaling does not create authored detail. Registered detail variants must match landmarks before blending; a feathered edge cannot hide displaced walls.

World generation must preserve named regions, supported device ground and HUD clearance. Day/night variants share camera and geometry. Check registration before crossfade; do not infer night from day acceptance. Cast shadows baked into a painting cannot physically rotate with a runtime color filter.

Inspect overview and maximum intended close view with real existing device artwork: silhouettes, ground contact, seams, alpha fringes, overlap, doorway clearance and readability. Keep permission/source behavior unchanged during art replacement. Product/connector acceptance is separate from visual acceptance.
