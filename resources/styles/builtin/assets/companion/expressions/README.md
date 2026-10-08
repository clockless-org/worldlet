# Fox companion sprite v1

The portrait's last fallback and an identity reference; the Fox itself plays from [Rive](../rive/README.md).

Transparent 1254 × 1254 RGBA atlas, 16 authored poses, generated with built-in imagegen on 2026-09-18. This replaces the four-expression HUD atlas. No runtime model generation or 3D renderer is required.

## Frames and behavior

| Row | Frames, left to right |
| --- | --- |
| 1 | Idle, blink, speaking, thinking |
| 2 | Listening, happy, surprised, confused |
| 3 | Concerned, satisfied, drowsy, yawning |
| 4 | Sleeping, sleeping breath, stretching, waving |

`ui/companion/companion-frames.ts` is the state mapping. Existing conversation states select idle, listening, speech and thought automatically. Additional expressions are available through the portrait's `data-state`; emotion inference is not introduced. Idle and local-model mode become drowsy after 120 seconds, yawn at 177 seconds, and sleep at 180 seconds. Pointer presses, typing, scrolling, focus and entering Fox wake it; waking stretches for 700ms unless active listening/work takes priority. Busy states never sleep and completion resets inactivity. Static guide text does not count as speaking. Sleeping alternates two poses every 1.8 seconds with a gentle 3.6-second breathing cycle. Speech alternates closed/open mouth every 190ms, not phoneme lip-sync. Every pose has a restrained continuous whole-pose animation: breathing, sway, bob or stretch, authored separately by state in `companionMotion`. These transforms do not independently articulate ears or paws; those require additional frames. This is a HUD expression/pose library, not a directional walking atlas.

The generator returned a slightly irregular grid. Authored column boundaries are `[0,326,642,951,1254]`; row boundaries are `[0,324,640,949,1254]`. Alpha bounds remove transparent gutters; **one shared scale** preserves anatomical size across standing/seated/curled poses. Opaque bounds share a centered baseline at y=310 in the 320px portrait canvas. The atlas is embedded as a data URI for safe alpha reads in WKWebView's local file origin. Reduced motion freezes frames and transforms but still permits semantic sleep/wake changes; hidden documents stop their timer. Existing single-portrait fallback remains available.

## References and generation brief

Identity: the retired v11 `fox-expressions.png` sheet, removed from the tree and recoverable from git history. Style: `resources/styles/builtin/assets/world/palette-reference.png`, governed by `resources/styles/builtin/STYLE.md`. Source generation: `exec-ffe07220-a2fc-4c98-b882-52ea98accff8.png`. Built-in imagegen; requested 2048px square, actual output 1254px square. Do not describe it as a 2K asset.

Prompt: Create a production transparent RGBA 4×4 sprite atlas for the same orange fox, cream muzzle/chest, brown paws, sage scarf, large head and curled tail. Use the world reference's soft matte painted miniature style, muted warm colors and diffuse light. Simplify individual fur hairs; retain rounded volume without plastic sheen or outlines. Same camera, anatomical size and centered ground anchor in all cells; sleeping fox must be naturally lower, never scaled up. Front slightly three-quarter seated view. Row-major states: neutral, blink, speaking, thinking; listening, happy, surprised, confused; concerned, satisfied, drowsy, yawning; curled asleep, same sleeping pose with a gently expanded chest, waking stretch, one-paw wave. No labels, borders, scenery, floor, shadow or decorative symbols. Fully transparent background and clean alpha edges; calm useful app companion.

## Preview and acceptance

The portrait draws this atlas while the Rive Fox loads and if it cannot load.

- TypeScript and native web bundle build passed.
- Browser checks passed for idle blink, changing speech pixels, thought, additional expressions, sleeping breath, leaving sleep for listening, timed idle transitions, active-work precedence, pixel changes for all sixteen poses, reduced motion and viewport fit.
- The rendered gallery was visually inspected on a light sage background for cell clipping, alpha edges and sleeping scale.
- Native Dev restart and world walking integration are not part of this asset acceptance.

Double-click Fox to show a different random expression for four seconds. It also works in the gallery. Real conversation states (listening, speaking, thinking, preparing, transcribing and working) take priority; random poses never modify the conversation state or start voice recording.
