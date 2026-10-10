# Live world resources

The live 4K day/night pair below is now the [visual authority](../../STYLE.md). Earlier concept images remain provenance only.

`world-day-lamps.png` and `world-night-lamps.png` remain here as palette inputs (`npm run art:palette`). The registered native 4K overlay is the Village `day-six-regions-sunburst-4k.png` / `night-six-regions-sunburst-4k.png` pair selected by the manifest; the older `world-*-sunburst-4k.png` copies were removed (recoverable in Git).

Live logical extent is `[-384,-256,2304,1536]`; `ui/theme-packages/village/registered-plate.ts` registers the 4K overlay. Do not apply this transform to portable Village packages. Shared device sprites are under `devices/`; per-Applet art is in the adjacent Applets directory.

Original lamp reduction and night assets were built-in image edits on 2026-09-18. Native 4K pair generation was recorded as GPT Image 2.5 Sunburst max, not enlargement; measured day/night registration was 1.09px median, source-to-new global registration 5.20px. These records are provenance, not new measurements. Historical intermediate/source experiment details remain recoverable in Git.

The current scene blends registered day/night plates and grades objects from one environment state. Clouds remain painted; celestial bodies and precipitation are separate. HUD/source content stay readable. Cast shadows are baked; independent architecture occlusion and walking Fox remain incomplete.

Archived ESRGAN enlargements, intermediate sun-removal/time-of-day studies and the unused DoorDash bridge experiment were removed during cleanup. They are not runtime dependencies. Existing rejected Village variants remain in that world's revision record until a replacement is accepted.
