# Village personal Applet scenes

Sixteen reusable icon/background pairs for custom Applets. Their optimized WebP copies are bundled in the public repository’s Village SIM through the optional `appletPresets` section of Theme contract v3. No provider accounts, actions or data are implied by selecting a picture. The current World and existing Applets are unchanged.

[Visual catalog](index.html) · [Machine-readable catalog and exact prompts](catalog.json) · [Village style authority](../../STYLE.md)

## Selection

Reviewed on 2026-10-11. The [OpenClaw showcase](https://docs.openclaw.ai/start/showcase) includes grocery shopping, morning briefings, fitness integrations, transport, accounting, job search and home automation. [Hermes community stories](https://hermes-agent.nousresearch.com/docs/user-stories) include fitness coaching, pantry-based meals, sleep summaries, reminders, research, personal memory and project tracking.

These curated examples establish plausible uses, not market share, customer frequency or a top-16 ranking. Weight management, meal planning and travel were explicit product requests. Outdoor activities, home care, gardening and language practice extend those workflows to provide visual breadth. Budgeting adapts accounting examples to household use. Each catalog entry distinguishes documented evidence from a design extension.

## Use the assets

- Host code reads `themeAppletPresets()` from `ui/themes/index.ts`, selects a stable preset ID, and uses the returned `icon` and `background` URLs. The original PNG paths remain in `catalog.json` for authoring.
- Icons are transparent PNGs. Keep their proportions and full base; do not flatten against a white background. Their little brass inset is decorative artwork, not a live status indicator.
- Backgrounds have no baked-in data, labels or controls. Layer real Applet content above the left side; keep the lower right available for Fox and speech.
- `layout` records normalized composition guidance, not a runtime API. At narrow widths, reflow content instead of blindly cropping an assumed safe region.
- Import through the existing [Applet implementation](../../../../../ui/applets/IMPLEMENTATION-GUIDE.md) and [Theme contract](../../../../themes/CONTRACT.md) when integrating a custom Applet. The 16 picture pairs are bundled; an Applet creation picker is not connected yet.
- These are single lighting plates. Sleep is intentionally an evening scene; the remaining presets are day scenes. No day/night pairs or animation masks are supplied.

## Rebuild the SIM assets

Run `node scripts/village-applet-presets.ts` after changing source pictures or catalog metadata. It encodes transparent icons at 768 px and backgrounds at their original size, updates the package presentation and source lock, and records source/output hashes in `assets/applet-presets/art.lock.json`. `npm run check:style` checks those hashes. The authoring gallery, prompts and original PNGs stay here; only the optimized pictures and preset metadata ship in the app.

## Catalog

| Preset | Typical use | Icon | Background |
| --- | --- | --- | --- |
| **Weight balance**<br>`weight-balance` | Track weight trends, measurements and personal goals | <img src="weight-balance/icon.png" width="100" alt="Weight balance icon"> | <a href="weight-balance/background.png"><img src="weight-balance/background.png" width="320" alt="Weight balance background"></a> |
| **Meal planner**<br>`meal-planner` | Plan weekly meals and reuse pantry ingredients | <img src="meal-planner/icon.png" width="100" alt="Meal planner icon"> | <a href="meal-planner/background.png"><img src="meal-planner/background.png" width="320" alt="Meal planner background"></a> |
| **Workout plan**<br>`fitness` | Plan workouts and record progress | <img src="fitness/icon.png" width="100" alt="Workout plan icon"> | <a href="fitness/background.png"><img src="fitness/background.png" width="320" alt="Workout plan background"></a> |
| **Sleep & recovery**<br>`sleep` | Review sleep records and plan wind-down routines | <img src="sleep/icon.png" width="100" alt="Sleep & recovery icon"> | <a href="sleep/background.png"><img src="sleep/background.png" width="320" alt="Sleep & recovery background"></a> |
| **Travel planner**<br>`travel` | Compare destinations and organize itineraries | <img src="travel/icon.png" width="100" alt="Travel planner icon"> | <a href="travel/background.png"><img src="travel/background.png" width="320" alt="Travel planner background"></a> |
| **Outdoor adventures**<br>`outdoor` | Prepare walks, hikes, weather checks and packing lists | <img src="outdoor/icon.png" width="100" alt="Outdoor adventures icon"> | <a href="outdoor/background.png"><img src="outdoor/background.png" width="320" alt="Outdoor adventures background"></a> |
| **Shopping list**<br>`shopping` | Collect grocery needs and compare purchases | <img src="shopping/icon.png" width="100" alt="Shopping list icon"> | <a href="shopping/background.png"><img src="shopping/background.png" width="320" alt="Shopping list background"></a> |
| **Household budget**<br>`budget` | Categorize expenses, monitor budgets and bill dates | <img src="budget/icon.png" width="100" alt="Household budget icon"> | <a href="budget/background.png"><img src="budget/background.png" width="320" alt="Household budget background"></a> |
| **Home care**<br>`home-care` | Schedule chores, maintenance and household tasks | <img src="home-care/icon.png" width="100" alt="Home care icon"> | <a href="home-care/background.png"><img src="home-care/background.png" width="320" alt="Home care background"></a> |
| **Garden planner**<br>`garden` | Plan planting, watering and seasonal garden work | <img src="garden/icon.png" width="100" alt="Garden planner icon"> | <a href="garden/background.png"><img src="garden/background.png" width="320" alt="Garden planner background"></a> |
| **Daily planner**<br>`daily-planner` | Collect today's schedule, priorities and reminders | <img src="daily-planner/icon.png" width="100" alt="Daily planner icon"> | <a href="daily-planner/background.png"><img src="daily-planner/background.png" width="320" alt="Daily planner background"></a> |
| **Reading & research**<br>`reading` | Save reading, summarize sources and gather research | <img src="reading/icon.png" width="100" alt="Reading & research icon"> | <a href="reading/background.png"><img src="reading/background.png" width="320" alt="Reading & research background"></a> |
| **Language practice**<br>`language` | Practice conversation, vocabulary and study routines | <img src="language/icon.png" width="100" alt="Language practice icon"> | <a href="language/background.png"><img src="language/background.png" width="320" alt="Language practice background"></a> |
| **Personal journal**<br>`journal` | Capture reflections, memories and daily notes | <img src="journal/icon.png" width="100" alt="Personal journal icon"> | <a href="journal/background.png"><img src="journal/background.png" width="320" alt="Personal journal background"></a> |
| **Job search**<br>`job-search` | Compare openings, track applications and prepare interviews | <img src="job-search/icon.png" width="100" alt="Job search icon"> | <a href="job-search/background.png"><img src="job-search/background.png" width="320" alt="Job search background"></a> |
| **Project planner**<br>`project-planner` | Track milestones, tasks and next actions | <img src="project-planner/icon.png" width="100" alt="Project planner icon"> | <a href="project-planner/background.png"><img src="project-planner/background.png" width="320" alt="Project planner background"></a> |

## Provenance and generation

Generated with the built-in imagegen tool; its underlying model identifier is not exposed. Original outputs are preserved as PNGs. Exact prompts, reference identities and scenario rationale live in `catalog.json`; output hashes and dimensions live in `assets.lock.json`. Input hashes tie references to the artwork used at generation time.

Reference roles: the current Village day map is the background style reference, not a target to edit; TripIt and Strava devices supply icon material, base and camera references. Their brand identities are not copied. New icons use generic functional objects rather than third-party logos.

Visual acceptance covers recognizability, family consistency, scene variety, unobstructed margins and alpha. These assets do not establish tested layout fit for every future Applet or narrow screen.
