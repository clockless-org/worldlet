# Village 1.7.0 — six modular courts

Home plus Work, Social, Life, Games and Entertainment (the river landing). Social is the former Create court and Entertainment the former Explore (2026-10-08). Thirty fixed places: five per court. Independent compact landmarks occupy the rear edge; roads, stone bridge, river and ground remain stable when users change a landmark theme.

## Artwork

- `images/day-six-regions-sunburst-4k.png` and `images/night-six-regions-sunburst-4k.png`: native **3840 × 2160**, official OpenAI Images Edit API, `gpt-image-2.5-sunburst`, `quality=high`. Day refines the prior quiet plate; night relights the new day plate. No post-generation upscaling or geometric warping. Exact prompts and sanitized request metadata are retained in `drafts/sunburst-4k/`.
- `images/landmarks/atlas.png`: original transparent 3 × 2 generated atlas. Six PNGs are extracted cells, trimmed without recoloring. Runtime keeps applet devices separate.
- `prompts/*six-regions.txt`: exact bridge, clean-base, landmark and night prompts.
- `drafts/six-regions/day-bridge.png`: terrain reference with bridge and baked landmarks, before extracting modular landmarks.
- `revisions/manifest-1.5.0.json`: prior seven-court coordinates, preserved for reference. Prior day/night 4K source files remain available.

Built-in image generation on 2026-09-25. Starting authority: the previously live `images/day-preserve-terrain-4k.png`, followed by the accepted six-court draft. Generated output IDs: bridge `38136f5f-1b1f-4a71-850c-78f83cd6070b`; clean day `188ed3af-aae4-40f4-af99-22fd2b96e76c`; landmark atlas `39db352c-883d-4404-9645-4bb440af2fe0`; night `f6eb5c61-9f04-4de5-b7b7-408dfaa4a7f3`.

The 1.6.1 revision clarifies low stone terrace edges and reduces grass detail and background contrast. The previous six-court plates remain as references. Exact refinement prompts are in `prompts/day-six-regions-quiet.txt` and `prompts/night-six-regions-quiet.txt`. Day output: `f9f5cd03-9255-4f96-ae5d-524d2d26966d`; night output: `11523b08-67eb-499a-b949-c1a522dcc2da`. That historical revision was 1672 × 941. Revision 1.7 replaces it with native 4K outputs without changing normalized placements. Independent landmark sprites use restrained saturation and contrast, with no blur; interactive Applets retain their original appearance.

## Runtime

The World's description is the Village theme package's [`world.json`](../../../ui/theme-packages/village/world.json); its image paths are relative to this folder, which keeps the painted plates. It drives the six installation courts and overview. `ui/world/village/region-landmarks.ts` owns rear anchors for the independent landmark sprites. The day/night terrain layers share coordinates; landmarks receive ambient tint, while interactive Applets remain readable. New plates have basic visual review; this is not a claim of final high-resolution nighttime art acceptance.

Region names, memberships, usage and pins are per-profile UI preferences, not artwork data. See [region customization](../../../ui/world/ENVIRONMENT.md#area-taxonomy). No user data or credentials are in these files. The region count opens an in-place shelf with frequently used Applets first and Add applets below; empty regions show a plus. Old People navigation resolves to Entertainment.

## Focused validation

`npm run test:applets` covers the region shelf, overflow Applets and five-place capacity through the full native UI fixture (hud-panels, empty-area-drop, slot-placement, popular-applets-ui). Type checking and native UI build cover the changed modules. No real accounts are contacted by this fixture.
