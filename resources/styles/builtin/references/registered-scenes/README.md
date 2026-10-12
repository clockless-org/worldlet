# Village Applet scene library

| Collection | Asset groups | Registered HTML surfaces | Existing art awaiting registration |
| --- | ---: | ---: | ---: |
| Core | 14 | 🟢 4 | 🟡 10 |
| Generic scenes | 16 | 🟢 16 | 0 |
| Brand-specific products and external games | 100 | 0 | 🟡 100 |
| Total existing art selections | 130 | 20 | 110 |

Counts describe curated artwork, not connected accounts or working provider integrations. The runtime catalog still has 118 Applets. The art library selects 114 of them and adds 16 reusable scenes; four explicit exclusions are listed below. The generated [SIM inventory](../../../../../ui/theme-packages/village/scene-library.json) contains each icon, background, collection and registration status, plus planned core additions and exclusions. Regenerate it with `node scripts/village-scene-library.ts` after changing the catalog.

## Core tools and planned additions

The nine existing everyday tools are Mail, Calendar, Notes, Reminders, Weather, Meetings, Voice Memos, Messages and Browser. Weather remains a core tool. The five core games are 2048, Snake, Minesweeper, Sudoku and Random Game. Classification follows purpose, not a provider key such as `gmail`.

| Next core tool | Intended use | Status |
| --- | --- | --- |
| Files | Browse local files, downloads and Agent-created documents; offer document preview | 🔴 Planned; no dedicated icon, registered background or runtime Applet yet |
| Clock | World time, alarms, timers and stopwatch; optional focus timer | 🔴 Planned; no dedicated icon, registered background or runtime Applet yet |

After both additions are implemented, the everyday tool count becomes 11 and the core art count becomes 16 including games. The planned total is 132 art groups (16 core + 16 generic + 100 branded); the status table above counts existing selections only.

Ongoing is an internal type for persistent conversations brought from other Agents, not an everyday tool to place by itself. It is not installed by default. A kept conversation should use a generic scene matching its actual subject, such as meal planning, travel or a project. Its runtime mechanism and fallback art remain available, but its standalone art group is excluded from this curated library. See [ongoing conversations](../../../../../core/tasks/README.md#ongoing-things).

Artifact, Journal and Settings are system surfaces outside the Applet count. The reusable personal-journal preset is a separate art choice.

## The 100 branded selections

Keep the branded collection at 100 groups. Exclude three narrow external mini-games with overlapping coverage: Rogue AI Tic-Tac-Toe (`sekai-rogue-ai-tic-tac-toe`), Mixing Colors (`sekai-mixing-colors`) and Roller Coaster Builder (`sekai-roller-coaster`). The main Sekai entry remains. This is an editorial art selection based on scope overlap, not a measured usage ranking; it does not remove runtime Applets or existing user installations.

## iPhone comparison

Apple's current US [iPhone 17 specification](https://www.apple.com/iphone-17/specs/) lists 48 built-in apps, counted on 2026-10-11. This device/region-specific list includes Apple's creative apps and system utilities; it is not a target count for Worldlet.

| Comparison | Worldlet position |
| --- | --- |
| Mail, Calendar, Notes, Reminders, Weather, Voice Memos, Messages, Safari | Eight existing tool counterparts; Browser corresponds to Safari |
| Files, Clock | The two confirmed next tools above |
| Journal, Settings | Existing system surfaces, counted separately |
| Maps, Music, Podcasts, Photos, TV, Pages, Numbers, Keynote | Related branded entries exist (Google Maps, Apple Music, Apple Podcasts, Google Photos, Netflix, Google Docs/Sheets/Slides); listing does not imply feature parity or a connected account |
| Games | Five core games plus branded web games |
| Calculator, Contacts, Translate, Books, Preview, Freeform | Useful remaining everyday-tool candidates; document preview can start inside Files |
| Camera, Phone, FaceTime, Compass, Measure, Magnifier, Find My, Watch | Primarily phone, hardware or device-ecosystem functions; lower priority for this desktop art library |
| App Store, Fitness, GarageBand, Health, Home, iMovie, iTunes Store, News, Passwords, Shortcuts, Stocks, Tips, Wallet | Other Apple built-ins; some overlap with generic scenes, branded entries or Agent capabilities, but are not equivalent standalone core tools |

Prioritize Files and Clock now. Calculator and Contacts are the clearest next candidates if the everyday toolkit expands again. Meetings is Worldlet-specific and should not be treated as the equivalent of FaceTime.

## Design and integration

Match the Village world and each existing icon's recognizable objects, palette and materials. The icon's display base stays in the icon; the background expands those objects into a functional place. Brand-specific scenes must integrate recognizable product identity meaningfully, without sacrificing usable space. Vary the environment by activity: orchard, kitchen, trail, greenhouse, library, guildhall or workshop.

Every updated background has blank painted surfaces for live HTML, a large primary region on the left and quiet lower-right companion clearance. Calendar and eight generic scenes also have a separate auxiliary surface. Paper texture and frames are baked into the image; dates, labels, task state and controls are HTML. Surface coordinates were measured on the final image, with conservative insets around rings, props and perspective edges. The World map and existing Applet icons are unchanged.

The [Theme contract](../../../../themes/CONTRACT.md#registered-backgrounds-and-live-html) describes `appletScenes` and optional preset `registration`. It includes image dimensions, an encoded-image hash, named primary/secondary regions, material hints and companion clearance. The host keeps responsibility for data, actions, typography, responsive behavior and browser isolation.

This package update supplies art, metadata, validation and shared transform helpers. Production Applet readers and the custom-Applet picker have not adopted the new registered surfaces yet. The preview below demonstrates HTML alignment and local interactions with fictional data; it is not a live account connection.

## Interactive preview

```sh
node scripts/applet-scene-preview.ts
python3 -m http.server 8787 --bind 127.0.0.1
```

Open `/output/applet-scene-preview/` on that local server. Switch between the 20 updated scenes, compare the icon, show registration guides or hide HTML. Calendar changes weeks, Mail selects letters and opens a reply draft, Notes saves a local session draft, and lists support adding and completing items. All image and HTML regions use the same uniform transform. Narrow views remain a design preview; production should use a readable responsive page when the scene no longer provides sufficient space.

## Core scenes

### Calendar

<img src="../../../../../ui/theme-packages/village/assets/devices/google-calendar.webp" width="100" alt="Calendar icon">

![Calendar background](google-calendar/background.png)

### Mail

<img src="../../../../../ui/theme-packages/village/assets/devices/gmail.webp" width="100" alt="Mail icon">

![Mail background](gmail/background.png)

### Notes

<img src="../../../../../ui/theme-packages/village/assets/devices/apple-notes.webp" width="100" alt="Notes icon">

![Notes background](apple-notes/background.png)

### Reminders

<img src="../../../../../ui/theme-packages/village/assets/devices/apple-reminders.webp" width="100" alt="Reminders icon">

![Reminders background](apple-reminders/background.png)

## Generic scenes

### Weight balance

Track weight trends, measurements and personal goals.

<img src="../../presets/personal-scenes/weight-balance/icon.png" width="100" alt="Weight balance icon">

![Weight balance background](../../presets/personal-scenes/weight-balance/background.png)

### Meal planner

Plan weekly meals and reuse pantry ingredients.

<img src="../../presets/personal-scenes/meal-planner/icon.png" width="100" alt="Meal planner icon">

![Meal planner background](../../presets/personal-scenes/meal-planner/background.png)

### Workout plan

Plan workouts and record progress.

<img src="../../presets/personal-scenes/fitness/icon.png" width="100" alt="Workout plan icon">

![Workout plan background](../../presets/personal-scenes/fitness/background.png)

### Sleep & recovery

Review sleep records and plan wind-down routines.

<img src="../../presets/personal-scenes/sleep/icon.png" width="100" alt="Sleep & recovery icon">

![Sleep & recovery background](../../presets/personal-scenes/sleep/background.png)

### Travel planner

Compare destinations and organize itineraries.

<img src="../../presets/personal-scenes/travel/icon.png" width="100" alt="Travel planner icon">

![Travel planner background](../../presets/personal-scenes/travel/background.png)

### Outdoor adventures

Prepare walks, hikes, weather checks and packing lists.

<img src="../../presets/personal-scenes/outdoor/icon.png" width="100" alt="Outdoor adventures icon">

![Outdoor adventures background](../../presets/personal-scenes/outdoor/background.png)

### Shopping list

Collect grocery needs and compare purchases.

<img src="../../presets/personal-scenes/shopping/icon.png" width="100" alt="Shopping list icon">

![Shopping list background](../../presets/personal-scenes/shopping/background.png)

### Household budget

Categorize expenses, monitor budgets and bill dates.

<img src="../../presets/personal-scenes/budget/icon.png" width="100" alt="Household budget icon">

![Household budget background](../../presets/personal-scenes/budget/background.png)

### Home care

Schedule chores, maintenance and household tasks.

<img src="../../presets/personal-scenes/home-care/icon.png" width="100" alt="Home care icon">

![Home care background](../../presets/personal-scenes/home-care/background.png)

### Garden planner

Plan planting, watering and seasonal garden work.

<img src="../../presets/personal-scenes/garden/icon.png" width="100" alt="Garden planner icon">

![Garden planner background](../../presets/personal-scenes/garden/background.png)

### Daily planner

Collect today's schedule, priorities and reminders.

<img src="../../presets/personal-scenes/daily-planner/icon.png" width="100" alt="Daily planner icon">

![Daily planner background](../../presets/personal-scenes/daily-planner/background.png)

### Reading & research

Save reading, summarize sources and gather research.

<img src="../../presets/personal-scenes/reading/icon.png" width="100" alt="Reading & research icon">

![Reading & research background](../../presets/personal-scenes/reading/background.png)

### Language practice

Practice conversation, vocabulary and study routines.

<img src="../../presets/personal-scenes/language/icon.png" width="100" alt="Language practice icon">

![Language practice background](../../presets/personal-scenes/language/background.png)

### Personal journal

Capture reflections, memories and daily notes.

<img src="../../presets/personal-scenes/journal/icon.png" width="100" alt="Personal journal icon">

![Personal journal background](../../presets/personal-scenes/journal/background.png)

### Job search

Compare openings, track applications and prepare interviews.

<img src="../../presets/personal-scenes/job-search/icon.png" width="100" alt="Job search icon">

![Job search background](../../presets/personal-scenes/job-search/background.png)

### Project planner

Track milestones, tasks and next actions.

<img src="../../presets/personal-scenes/project-planner/icon.png" width="100" alt="Project planner icon">

![Project planner background](../../presets/personal-scenes/project-planner/background.png)

## Sources and reproducibility

The built-in image-generation tool created these backgrounds. [Core prompts and measured regions](catalog.json) retain the original request, icon references and refinements. [Generic prompts and registrations](../../presets/personal-scenes/catalog.json) retain original and updated background prompts. Source PNG hashes are in the generic source lock; runtime WebP source/output hashes are in each package art lock.

```sh
node scripts/village-registered-scenes.ts
node scripts/village-applet-presets.ts
node scripts/village-scene-library.ts
npm run check:style
```

Encoding preserves source aspect ratios. Replacing a background requires re-measuring its regions before encoding; import rejects registrations tied to different encoded bytes or dimensions.
