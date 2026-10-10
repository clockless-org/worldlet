# Village runtime art

The Village's art exactly as the app ships it: World plates and landmarks (lossless WebP), every Applet's device (768 px WebP; the Applet's icon in this theme), open pictures, motion sheets and frames, logos, Mail parts and Focus rooms. `art.json` indexes it with each device's painted box; `art.lock.json` ties each file to the authored source it was encoded from.

Do not edit these files by hand. After changing a source under `resources/styles/builtin` or `resources/worlds/village`, run `node scripts/village-art.ts` and commit the result; `npm run check:style` fails while any file is out of date. This tree is the Village theme package's `assets/`.
