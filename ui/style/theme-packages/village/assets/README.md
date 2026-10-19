# Village runtime art

The Village's art exactly as the app ships it: World plates and landmarks (lossless WebP), each Area's map (`areas/`, copied from `resources/worlds/village/areas`), every Applet's device (768 px WebP; the Applet's icon in this theme), open pictures, motion sheets and frames, logos, Mail parts and Focus rooms. `art.json` indexes it with each device's painted box; `art.lock.json` ties each file to the authored source it was encoded from.

Do not edit these files by hand. After changing a source under `resources/styles/builtin` or `resources/worlds/village`, run `node scripts/village-art.ts` and commit the result; `npm run check:style` fails while any file is out of date. This tree is the Village theme package's `assets/`.

## Custom Applet presets

`applet-presets/` holds 16 reusable icon/background pairs, declared in `../presentation.json` as `appletPresets`. Host code reads `themeAppletPresets()` for the active theme's metadata and published image URLs. These are art choices for custom Applets; they do not create Applets or connect accounts. The creation picker is not connected yet.

The [source gallery](../../../../../resources/styles/builtin/presets/personal-scenes/README.md) keeps the original PNGs, research and prompts. Regenerate this subset with `node scripts/village-applet-presets.ts`; its own `art.lock.json` records source and encoded hashes. Icons are 768 px transparent WebP; backgrounds retain their original dimensions. Both encoders preserve assets owned by the other.
