# Village Area maps

Twelve painted close views of the six Village places, a day and a night plate for each. Entering an Area opens its map full screen with the Area's Applets laid out over it, five to a row (`enterArea` in `ui/shell/notion-world.ts`). `node scripts/village-art.ts` copies them into the theme package as `assets/areas/` and indexes them in `assets/art.json` under `areas`; the shell reads them through `themeAreaMap` (`ui/world/theme-scene.ts`). To replace a map, change its file here and run the encoder. The World's Area ids are the landmark keys: `library` is Social, `money` is Life, `health` is Games and `travel` is Entertainment.

| Area | Day | Night |
| --- | --- | --- |
| Home | [home-day.webp](home-day.webp) | [home-night.webp](home-night.webp) |
| Work | [work-day.webp](work-day.webp) | [work-night.webp](work-night.webp) |
| Library | [library-day.webp](library-day.webp) | [library-night.webp](library-night.webp) |
| Money | [money-day.webp](money-day.webp) | [money-night.webp](money-night.webp) |
| Health | [health-day.webp](health-day.webp) | [health-night.webp](health-night.webp) |
| Travel | [travel-day.webp](travel-day.webp) | [travel-night.webp](travel-night.webp) |

![Home by day](home-day.webp)

## How they were made

Generated with an image model on 2026-10-09 and encoded here as 1672 × 941 WebP (quality 90). The World overview, landmarks and map geometry were not changed.

- **Direction:** immersive close views of the original village places. Rounded crafted 3D greenery, pale sandstone paving, a blue river and distant mountains, the original black lanterns. Rich foliage, masonry, tools and water around a clear foreground. No baked interface, people or text.
- **Composition:** elevated three-quarter view with the landmark toward the back and a large clear foreground where live Applets could stand (roughly x 18–82%, y 46–89%). Each keeps its landmark's identity and the village materials.
- **References:** the day World plate and each Area's landmark (`../assets/landmarks/<area>.webp`).
- **Night:** the exact day composition and landmark geometry under blue ambient light, with warm light from the existing lanterns, windows or hearth.
