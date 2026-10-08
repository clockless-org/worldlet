# Shared world

The [UI sizing standard](../DESIGN-STANDARDS.md) defines the 1920 × 1080 world reference and 96px overview Applet width. Runtime constants live in `world-design.ts`.

`pixi-world.ts` is the single world renderer for Mac, Sample preset data and the website demo. It uses PixiJS WebGL, an authored landscape, region tiles and interactive device sprites. `village-sites.ts` owns normalized reference-image anchors; `pixi-stage.ts` presents accessible saved content. `sample-data.ts` constructs fictional data, not a different scene implementation.

Consumers supply their DOM host, lifecycle and interactions. Assets are packaged by `scripts/build-world-assets.ts` for both builds. No Three.js, procedural mesh renderer or engine fallback remains. Asset quality limits and production rules are in `resources/styles/builtin/PRODUCTION.md`.

`world-layout.ts` is the environment manifest: registered plate sources, Region bounds/titles and named device slots. `village-sites.ts` and `applet-sprites.ts` derive their data from it. See `ui/world/ENVIRONMENT.md` for generation-time placement and validation rules.
