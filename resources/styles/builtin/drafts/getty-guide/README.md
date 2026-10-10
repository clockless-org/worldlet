# Getty Center guide pictures

The pictures inside the ready-made [Getty Center guide](../../../../../core/artifacts/README.md#ready-made-applets) (owner request 2026-10-04: "in our own style, with generated images and a 3D look"). A made Applet's page can load nothing from outside itself, so each picture travels in the page as a data URI: `core/artifacts/ready/getty-center-art.ts`, generated here.

- **The miniature** is the campus as a tabletop model on a timber base, in the `cozy-miniature` direction of [STYLE.md](../../STYLE.md): the travertine plateau with the four pavilions, the round Entrance Hall and the Exhibitions Pavilion, the Central Garden's azalea maze in its pool, the cactus promontory, the café umbrellas and the tram climbing from its station. It is a real 3D scene (`scene.html`, three.js 0.169) rendered offline by [scripts/getty-guide/render.mjs](../../../../../scripts/getty-guide/render.mjs), which also writes where each stop lands (`pins.json`) for the page's numbered pins. The layout is simplified, not a survey.
- **Fox** is the waving pose of the registered expression atlas (`assets/companion/expressions`).
- **The stop pictures** are reduced copies of registered Attention scenes (`assets/attention/scenes`: public-transit, museum, gardening, coffee-meetup, exhibition), which were made with the built-in image tool in the same style.

No other image model and no third-party artwork are used.

## Regenerate

1. `npm i --prefix /tmp/three three@0.169`, then link `/tmp/three/node_modules/three` here as `three` (ignored by git).
2. `node scripts/getty-guide/render.mjs` writes `render.png` (ignored) and `pins.json`.
3. `python3 resources/styles/builtin/drafts/getty-guide/compose.py` (Pillow) writes `getty-center-art.ts`. The pictures come to about 74 KB, so the page stays under a made Applet's 120 KB.
