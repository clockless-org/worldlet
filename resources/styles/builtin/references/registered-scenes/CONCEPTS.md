# Village image-generated Applet concepts

These raster design studies establish the visual target. They are not HTML screenshots or working applications. All displayed records and conversations are fictional. Text, calculations and game positions are illustrative and must be validated during implementation.

| Collection | Backgrounds | Effects | Runtime integration |
| --- | ---: | ---: | --- |
| Core applications and games | 24/24 | 24/24 | 🟡 Design study |
| Generic scenes | 16/16 | 16/16 | 🟡 Design study |
| Branded applications and games | 100/100 | 100/100 | 🟡 Design study |

Each pair shows the current registered background followed by an earlier image-generated effect. The effects retain their original proportions and are visual references, not screenshots of the current runtime. Backgrounds reserve approximately 80% canvas height for content while preserving their original horizontal layout. Website Applets use their original sites in the host browser surface.

Build the searchable local gallery with `node scripts/applet-concept-gallery.ts --complete`, serve the repository root and open `/output/applet-concept-gallery/`. Rebuild this document and the hash manifest with `--write-docs`.

## Implementation guidance

- Keep the left content surface large, continuous and close to front-facing. Use a normalized region relative to the source image, with a measured inner safe inset.
- Build the right side around useful objects related to the application: filing cabinets, instruments, travel equipment, books, tools or food. Match the existing icon and preserve the Village world style.
- Treat the scene and frame as artwork. Render dynamic text, controls and records as HTML inside the surface; use images for thumbnails, textures and small illustrations.
- Match paper, linen, wood and brass shading to the scene lighting. Do not bake interactive text into the runtime background.
- Measure companion placement against the host HUD. Rich scenery does not imply that its entire right-hand area is safe for a dialogue panel.
- Check text contrast, overflow, keyboard focus, empty and loading states, and different viewport sizes when implementing HTML. A concept image does not establish these behaviors.

See [the scene inventory](README.md), [generation direction](concept-direction.json), and [asset manifest](concept-manifest.json). Prompts and provenance are stored beside each generated image.

## Core applications and games

### Calendar

<img src="../../../../../ui/theme-packages/village/assets/devices/google-calendar.webp" alt="Calendar icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Calendar background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-calendar/background.webp) | ![Calendar effect](concepts/google-calendar/effect.webp) |

### Mail

<img src="../../../../../ui/theme-packages/village/assets/devices/gmail.webp" alt="Mail icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Mail background](../../../../../ui/theme-packages/village/assets/applet-scenes/gmail/background.webp) | ![Mail effect](concepts/gmail/effect.webp) |

### Notes

<img src="../../../../../ui/theme-packages/village/assets/devices/apple-notes.webp" alt="Notes icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Notes background](../../../../../ui/theme-packages/village/assets/applet-scenes/apple-notes/background.webp) | ![Notes effect](concepts/apple-notes/effect.webp) |

### Reminders

<img src="../../../../../ui/theme-packages/village/assets/devices/apple-reminders.webp" alt="Reminders icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Reminders background](../../../../../ui/theme-packages/village/assets/applet-scenes/apple-reminders/background.webp) | ![Reminders effect](concepts/apple-reminders/effect.webp) |

### Files

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/files/icon.webp" alt="Files icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Files background](../../../../../ui/theme-packages/village/assets/applet-scenes/files/background.webp) | ![Files effect](concepts/files/effect.webp) |

### Weather

<img src="../../../../../ui/theme-packages/village/assets/devices/weather.webp" alt="Weather icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Weather background](../../../../../ui/theme-packages/village/assets/applet-scenes/weather/background.webp) | ![Weather effect](concepts/weather/effect.webp) |

### Meetings

<img src="../../../../../ui/theme-packages/village/assets/devices/meetings.webp" alt="Meetings icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Meetings background](../../../../../ui/theme-packages/village/assets/applet-scenes/meetings/background.webp) | ![Meetings effect](concepts/meetings/effect.webp) |

### Voice Memos

<img src="../../../../../ui/theme-packages/village/assets/devices/voice-memos.webp" alt="Voice Memos icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Voice Memos background](../../../../../ui/theme-packages/village/assets/applet-scenes/voice-memos/background.webp) | ![Voice Memos effect](concepts/voice-memos/effect.webp) |

### Messages

<img src="../../../../../ui/theme-packages/village/assets/devices/messages.webp" alt="Messages icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Messages background](../../../../../ui/theme-packages/village/assets/applet-scenes/messages/background.webp) | ![Messages effect](concepts/messages/effect.webp) |

### Browser

<img src="../../../../../ui/theme-packages/village/assets/devices/browser.webp" alt="Browser icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Browser background](../../../../../ui/theme-packages/village/assets/applet-scenes/browser/background.webp) | ![Browser effect](concepts/browser/effect.webp) |

### Maps

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/maps/icon.webp" alt="Maps icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Maps background](../../../../../ui/theme-packages/village/assets/applet-scenes/maps/background.webp) | ![Maps effect](concepts/maps/effect.webp) |

### Clock

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/clock/icon.webp" alt="Clock icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Clock background](../../../../../ui/theme-packages/village/assets/applet-scenes/clock/background.webp) | ![Clock effect](concepts/clock/effect.webp) |

### Contacts

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/contacts/icon.webp" alt="Contacts icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Contacts background](../../../../../ui/theme-packages/village/assets/applet-scenes/contacts/background.webp) | ![Contacts effect](concepts/contacts/effect.webp) |

### Photos

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/photos/icon.webp" alt="Photos icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Photos background](../../../../../ui/theme-packages/village/assets/applet-scenes/photos/background.webp) | ![Photos effect](concepts/photos/effect.webp) |

### Music

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/music/icon.webp" alt="Music icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Music background](../../../../../ui/theme-packages/village/assets/applet-scenes/music/background.webp) | ![Music effect](concepts/music/effect.webp) |

### News

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/news/icon.webp" alt="News icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![News background](../../../../../ui/theme-packages/village/assets/applet-scenes/news/background.webp) | ![News effect](concepts/news/effect.webp) |

### Podcasts

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/podcasts/icon.webp" alt="Podcasts icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Podcasts background](../../../../../ui/theme-packages/village/assets/applet-scenes/podcasts/background.webp) | ![Podcasts effect](concepts/podcasts/effect.webp) |

### Stocks

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/stocks/icon.webp" alt="Stocks icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Stocks background](../../../../../ui/theme-packages/village/assets/applet-scenes/stocks/background.webp) | ![Stocks effect](concepts/stocks/effect.webp) |

### 2048

<img src="../../../../../ui/theme-packages/village/assets/devices/game-2048.webp" alt="2048 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![2048 background](../../../../../ui/theme-packages/village/assets/applet-scenes/game-2048/background.webp) | ![2048 effect](concepts/game-2048/effect.webp) |

### Snake

<img src="../../../../../ui/theme-packages/village/assets/devices/snake.webp" alt="Snake icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Snake background](../../../../../ui/theme-packages/village/assets/applet-scenes/snake/background.webp) | ![Snake effect](concepts/snake/effect.webp) |

### Minesweeper

<img src="../../../../../ui/theme-packages/village/assets/devices/minesweeper.webp" alt="Minesweeper icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Minesweeper background](../../../../../ui/theme-packages/village/assets/applet-scenes/minesweeper/background.webp) | ![Minesweeper effect](concepts/minesweeper/effect.webp) |

### Sudoku

<img src="../../../../../ui/theme-packages/village/assets/devices/sudoku.webp" alt="Sudoku icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Sudoku background](../../../../../ui/theme-packages/village/assets/applet-scenes/sudoku/background.webp) | ![Sudoku effect](concepts/sudoku/effect.webp) |

### Gomoku

<img src="../../../../../ui/theme-packages/village/assets/applet-scenes/gomoku/icon.webp" alt="Gomoku icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Gomoku background](../../../../../ui/theme-packages/village/assets/applet-scenes/gomoku/background.webp) | ![Gomoku effect](concepts/gomoku/effect.webp) |

### Random Game

<img src="../../../../../ui/theme-packages/village/assets/devices/random-game.webp" alt="Random Game icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Random Game background](../../../../../ui/theme-packages/village/assets/applet-scenes/random-game/background.webp) | ![Random Game effect](concepts/random-game/effect.webp) |


## Generic scenes

### Weight balance

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/weight-balance/icon.webp" alt="Weight balance icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Weight balance background](../../../../../ui/theme-packages/village/assets/applet-presets/weight-balance/background.webp) | ![Weight balance effect](concepts/weight-balance/effect.webp) |

### Meal planner

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/meal-planner/icon.webp" alt="Meal planner icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Meal planner background](../../../../../ui/theme-packages/village/assets/applet-presets/meal-planner/background.webp) | ![Meal planner effect](concepts/meal-planner/effect.webp) |

### Workout plan

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/fitness/icon.webp" alt="Workout plan icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Workout plan background](../../../../../ui/theme-packages/village/assets/applet-presets/fitness/background.webp) | ![Workout plan effect](concepts/fitness/effect.webp) |

### Sleep & recovery

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/sleep/icon.webp" alt="Sleep & recovery icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Sleep & recovery background](../../../../../ui/theme-packages/village/assets/applet-presets/sleep/background.webp) | ![Sleep & recovery effect](concepts/sleep/effect.webp) |

### Travel planner

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/travel/icon.webp" alt="Travel planner icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Travel planner background](../../../../../ui/theme-packages/village/assets/applet-presets/travel/background.webp) | ![Travel planner effect](concepts/travel/effect.webp) |

### Outdoor adventures

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/outdoor/icon.webp" alt="Outdoor adventures icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Outdoor adventures background](../../../../../ui/theme-packages/village/assets/applet-presets/outdoor/background.webp) | ![Outdoor adventures effect](concepts/outdoor/effect.webp) |

### Shopping list

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/shopping/icon.webp" alt="Shopping list icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Shopping list background](../../../../../ui/theme-packages/village/assets/applet-presets/shopping/background.webp) | ![Shopping list effect](concepts/shopping/effect.webp) |

### Household budget

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/budget/icon.webp" alt="Household budget icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Household budget background](../../../../../ui/theme-packages/village/assets/applet-presets/budget/background.webp) | ![Household budget effect](concepts/budget/effect.webp) |

### Home care

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/home-care/icon.webp" alt="Home care icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Home care background](../../../../../ui/theme-packages/village/assets/applet-presets/home-care/background.webp) | ![Home care effect](concepts/home-care/effect.webp) |

### Garden planner

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/garden/icon.webp" alt="Garden planner icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Garden planner background](../../../../../ui/theme-packages/village/assets/applet-presets/garden/background.webp) | ![Garden planner effect](concepts/garden/effect.webp) |

### Daily planner

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/daily-planner/icon.webp" alt="Daily planner icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Daily planner background](../../../../../ui/theme-packages/village/assets/applet-presets/daily-planner/background.webp) | ![Daily planner effect](concepts/daily-planner/effect.webp) |

### Reading & research

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/reading/icon.webp" alt="Reading & research icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Reading & research background](../../../../../ui/theme-packages/village/assets/applet-presets/reading/background.webp) | ![Reading & research effect](concepts/reading/effect.webp) |

### Language practice

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/language/icon.webp" alt="Language practice icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Language practice background](../../../../../ui/theme-packages/village/assets/applet-presets/language/background.webp) | ![Language practice effect](concepts/language/effect.webp) |

### Personal journal

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/journal/icon.webp" alt="Personal journal icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Personal journal background](../../../../../ui/theme-packages/village/assets/applet-presets/journal/background.webp) | ![Personal journal effect](concepts/journal/effect.webp) |

### Job search

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/job-search/icon.webp" alt="Job search icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Job search background](../../../../../ui/theme-packages/village/assets/applet-presets/job-search/background.webp) | ![Job search effect](concepts/job-search/effect.webp) |

### Project planner

<img src="../../../../../ui/theme-packages/village/assets/applet-presets/project-planner/icon.webp" alt="Project planner icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Project planner background](../../../../../ui/theme-packages/village/assets/applet-presets/project-planner/background.webp) | ![Project planner effect](concepts/project-planner/effect.webp) |


## Branded applications and games

### GitHub

<img src="../../../../../ui/theme-packages/village/assets/devices/github.webp" alt="GitHub icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![GitHub background](../../../../../ui/theme-packages/village/assets/applet-scenes/github/background.webp) | ![GitHub effect](brands/github/effect.webp) |

### Codex

<img src="../../../../../ui/theme-packages/village/assets/devices/codex.webp" alt="Codex icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Codex background](../../../../../ui/theme-packages/village/assets/applet-scenes/codex/background.webp) | ![Codex effect](brands/codex/effect.webp) |

### Claude Code

<img src="../../../../../ui/theme-packages/village/assets/devices/claude-code.webp" alt="Claude Code icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Claude Code background](../../../../../ui/theme-packages/village/assets/applet-scenes/claude-code/background.webp) | ![Claude Code effect](brands/claude-code/effect.webp) |

### Notion

<img src="../../../../../ui/theme-packages/village/assets/devices/notion.webp" alt="Notion icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Notion background](../../../../../ui/theme-packages/village/assets/applet-scenes/notion/background.webp) | ![Notion effect](brands/notion/effect.webp) |

### Obsidian

<img src="../../../../../ui/theme-packages/village/assets/devices/obsidian.webp" alt="Obsidian icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Obsidian background](../../../../../ui/theme-packages/village/assets/applet-scenes/obsidian/background.webp) | ![Obsidian effect](brands/obsidian/effect.webp) |

### Plaid

<img src="../../../../../ui/theme-packages/village/assets/devices/plaid.webp" alt="Plaid icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Plaid background](../../../../../ui/theme-packages/village/assets/applet-scenes/plaid/background.webp) | ![Plaid effect](brands/plaid/effect.webp) |

### Stripe

<img src="../../../../../ui/theme-packages/village/assets/devices/stripe.webp" alt="Stripe icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Stripe background](../../../../../ui/theme-packages/village/assets/applet-scenes/stripe/background.webp) | ![Stripe effect](brands/stripe/effect.webp) |

### PayPal

<img src="../../../../../ui/theme-packages/village/assets/devices/paypal.webp" alt="PayPal icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![PayPal background](../../../../../ui/theme-packages/village/assets/applet-scenes/paypal/background.webp) | ![PayPal effect](brands/paypal/effect.webp) |

### Todoist

<img src="../../../../../ui/theme-packages/village/assets/devices/todoist.webp" alt="Todoist icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Todoist background](../../../../../ui/theme-packages/village/assets/applet-scenes/todoist/background.webp) | ![Todoist effect](brands/todoist/effect.webp) |

### Linear

<img src="../../../../../ui/theme-packages/village/assets/devices/linear.webp" alt="Linear icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Linear background](../../../../../ui/theme-packages/village/assets/applet-scenes/linear/background.webp) | ![Linear effect](brands/linear/effect.webp) |

### Supabase

<img src="../../../../../ui/theme-packages/village/assets/devices/supabase.webp" alt="Supabase icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Supabase background](../../../../../ui/theme-packages/village/assets/applet-scenes/supabase/background.webp) | ![Supabase effect](brands/supabase/effect.webp) |

### Docker

<img src="../../../../../ui/theme-packages/village/assets/devices/docker.webp" alt="Docker icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Docker background](../../../../../ui/theme-packages/village/assets/applet-scenes/docker/background.webp) | ![Docker effect](brands/docker/effect.webp) |

### Google Drive

<img src="../../../../../ui/theme-packages/village/assets/devices/google-drive.webp" alt="Google Drive icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Google Drive background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-drive/background.webp) | ![Google Drive effect](brands/google-drive/effect.webp) |

### Google Docs

<img src="../../../../../ui/theme-packages/village/assets/devices/google-docs.webp" alt="Google Docs icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Google Docs background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-docs/background.webp) | ![Google Docs effect](brands/google-docs/effect.webp) |

### Google Sheets

<img src="../../../../../ui/theme-packages/village/assets/devices/google-sheets.webp" alt="Google Sheets icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Google Sheets background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-sheets/background.webp) | ![Google Sheets effect](brands/google-sheets/effect.webp) |

### Google Slides

<img src="../../../../../ui/theme-packages/village/assets/devices/google-slides.webp" alt="Google Slides icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Google Slides background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-slides/background.webp) | ![Google Slides effect](brands/google-slides/effect.webp) |

### Oura Ring

<img src="../../../../../ui/theme-packages/village/assets/devices/oura.webp" alt="Oura Ring icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Oura Ring background](../../../../../ui/theme-packages/village/assets/applet-scenes/oura/background.webp) | ![Oura Ring effect](brands/oura/effect.webp) |

### Strava

<img src="../../../../../ui/theme-packages/village/assets/devices/strava.webp" alt="Strava icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Strava background](../../../../../ui/theme-packages/village/assets/applet-scenes/strava/background.webp) | ![Strava effect](brands/strava/effect.webp) |

### Fitbit

<img src="../../../../../ui/theme-packages/village/assets/devices/fitbit.webp" alt="Fitbit icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Fitbit background](../../../../../ui/theme-packages/village/assets/applet-scenes/fitbit/background.webp) | ![Fitbit effect](brands/fitbit/effect.webp) |

### Google Maps

<img src="../../../../../ui/theme-packages/village/assets/devices/google-maps.webp" alt="Google Maps icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Google Maps background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-maps/background.webp) | ![Google Maps effect](brands/google-maps/effect.webp) |

### Airbnb

<img src="../../../../../ui/theme-packages/village/assets/devices/airbnb.webp" alt="Airbnb icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Airbnb background](../../../../../ui/theme-packages/village/assets/applet-scenes/airbnb/background.webp) | ![Airbnb effect](brands/airbnb/effect.webp) |

### TripIt

<img src="../../../../../ui/theme-packages/village/assets/devices/tripit.webp" alt="TripIt icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![TripIt background](../../../../../ui/theme-packages/village/assets/applet-scenes/tripit/background.webp) | ![TripIt effect](brands/tripit/effect.webp) |

### X

<img src="../../../../../ui/theme-packages/village/assets/devices/x.webp" alt="X icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![X background](../../../../../ui/theme-packages/village/assets/applet-scenes/x/background.webp) | ![X effect](brands/x/effect.webp) |

### YouTube

<img src="../../../../../ui/theme-packages/village/assets/devices/youtube.webp" alt="YouTube icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![YouTube background](../../../../../ui/theme-packages/village/assets/applet-scenes/youtube/background.webp) | ![YouTube effect](brands/youtube/effect.webp) |

### TikTok

<img src="../../../../../ui/theme-packages/village/assets/devices/tiktok.webp" alt="TikTok icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![TikTok background](../../../../../ui/theme-packages/village/assets/applet-scenes/tiktok/background.webp) | ![TikTok effect](brands/tiktok/effect.webp) |

### Discord

<img src="../../../../../ui/theme-packages/village/assets/devices/discord.webp" alt="Discord icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Discord background](../../../../../ui/theme-packages/village/assets/applet-scenes/discord/background.webp) | ![Discord effect](brands/discord/effect.webp) |

### DoorDash

<img src="../../../../../ui/theme-packages/village/assets/devices/doordash.webp" alt="DoorDash icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![DoorDash background](../../../../../ui/theme-packages/village/assets/applet-scenes/doordash/background.webp) | ![DoorDash effect](brands/doordash/effect.webp) |

### Wordle

<img src="../../../../../ui/theme-packages/village/assets/devices/wordle.webp" alt="Wordle icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Wordle background](../../../../../ui/theme-packages/village/assets/applet-scenes/wordle/background.webp) | ![Wordle effect](brands/wordle/effect.webp) |

### Connections

<img src="../../../../../ui/theme-packages/village/assets/devices/nyt-connections.webp" alt="Connections icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Connections background](../../../../../ui/theme-packages/village/assets/applet-scenes/nyt-connections/background.webp) | ![Connections effect](brands/nyt-connections/effect.webp) |

### Slither.io

<img src="../../../../../ui/theme-packages/village/assets/devices/slither-io.webp" alt="Slither.io icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Slither.io background](../../../../../ui/theme-packages/village/assets/applet-scenes/slither-io/background.webp) | ![Slither.io effect](brands/slither-io/effect.webp) |

### Agar.io

<img src="../../../../../ui/theme-packages/village/assets/devices/agar-io.webp" alt="Agar.io icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Agar.io background](../../../../../ui/theme-packages/village/assets/applet-scenes/agar-io/background.webp) | ![Agar.io effect](brands/agar-io/effect.webp) |

### Krunker

<img src="../../../../../ui/theme-packages/village/assets/devices/krunker-io.webp" alt="Krunker icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Krunker background](../../../../../ui/theme-packages/village/assets/applet-scenes/krunker-io/background.webp) | ![Krunker effect](brands/krunker-io/effect.webp) |

### skribbl.io

<img src="../../../../../ui/theme-packages/village/assets/devices/skribbl-io.webp" alt="skribbl.io icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![skribbl.io background](../../../../../ui/theme-packages/village/assets/applet-scenes/skribbl-io/background.webp) | ![skribbl.io effect](brands/skribbl-io/effect.webp) |

### Infinite Craft

<img src="../../../../../ui/theme-packages/village/assets/devices/infinite-craft.webp" alt="Infinite Craft icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Infinite Craft background](../../../../../ui/theme-packages/village/assets/applet-scenes/infinite-craft/background.webp) | ![Infinite Craft effect](brands/infinite-craft/effect.webp) |

### Little Alchemy 2

<img src="../../../../../ui/theme-packages/village/assets/devices/little-alchemy-2.webp" alt="Little Alchemy 2 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Little Alchemy 2 background](../../../../../ui/theme-packages/village/assets/applet-scenes/little-alchemy-2/background.webp) | ![Little Alchemy 2 effect](brands/little-alchemy-2/effect.webp) |

### Cookie Clicker

<img src="../../../../../ui/theme-packages/village/assets/devices/cookie-clicker.webp" alt="Cookie Clicker icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Cookie Clicker background](../../../../../ui/theme-packages/village/assets/applet-scenes/cookie-clicker/background.webp) | ![Cookie Clicker effect](brands/cookie-clicker/effect.webp) |

### Lichess

<img src="../../../../../ui/theme-packages/village/assets/devices/lichess.webp" alt="Lichess icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Lichess background](../../../../../ui/theme-packages/village/assets/applet-scenes/lichess/background.webp) | ![Lichess effect](brands/lichess/effect.webp) |

### Drive Mad

<img src="../../../../../ui/theme-packages/village/assets/devices/drive-mad.webp" alt="Drive Mad icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Drive Mad background](../../../../../ui/theme-packages/village/assets/applet-scenes/drive-mad/background.webp) | ![Drive Mad effect](brands/drive-mad/effect.webp) |

### Subway Surfers

<img src="../../../../../ui/theme-packages/village/assets/devices/subway-surfers.webp" alt="Subway Surfers icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Subway Surfers background](../../../../../ui/theme-packages/village/assets/applet-scenes/subway-surfers/background.webp) | ![Subway Surfers effect](brands/subway-surfers/effect.webp) |

### Sekai

<img src="../../../../../ui/theme-packages/village/assets/devices/sekai.webp" alt="Sekai icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Sekai background](../../../../../ui/theme-packages/village/assets/applet-scenes/sekai/background.webp) | ![Sekai effect](brands/sekai/effect.webp) |

### Sketch Racer

<img src="../../../../../ui/theme-packages/village/assets/devices/sekai-sketch-racer.webp" alt="Sketch Racer icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Sketch Racer background](../../../../../ui/theme-packages/village/assets/applet-scenes/sekai-sketch-racer/background.webp) | ![Sketch Racer effect](brands/sekai-sketch-racer/effect.webp) |

### 3D UNO!

<img src="../../../../../ui/theme-packages/village/assets/devices/sekai-3d-uno.webp" alt="3D UNO! icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![3D UNO! background](../../../../../ui/theme-packages/village/assets/applet-scenes/sekai-3d-uno/background.webp) | ![3D UNO! effect](brands/sekai-3d-uno/effect.webp) |

### Devil Level: 50 Trolls

<img src="../../../../../ui/theme-packages/village/assets/devices/sekai-devil-level.webp" alt="Devil Level: 50 Trolls icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Devil Level: 50 Trolls background](../../../../../ui/theme-packages/village/assets/applet-scenes/sekai-devil-level/background.webp) | ![Devil Level: 50 Trolls effect](brands/sekai-devil-level/effect.webp) |

### Pokémon Showdown

<img src="../../../../../ui/theme-packages/village/assets/devices/pokemon-showdown.webp" alt="Pokémon Showdown icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Pokémon Showdown background](../../../../../ui/theme-packages/village/assets/applet-scenes/pokemon-showdown/background.webp) | ![Pokémon Showdown effect](brands/pokemon-showdown/effect.webp) |

### ChatGPT

<img src="../../../../../ui/theme-packages/village/assets/devices/chatgpt.webp" alt="ChatGPT icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![ChatGPT background](../../../../../ui/theme-packages/village/assets/applet-scenes/chatgpt/background.webp) | ![ChatGPT effect](brands/chatgpt/effect.webp) |

### Claude

<img src="../../../../../ui/theme-packages/village/assets/devices/claude.webp" alt="Claude icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Claude background](../../../../../ui/theme-packages/village/assets/applet-scenes/claude/background.webp) | ![Claude effect](brands/claude/effect.webp) |

### Gemini

<img src="../../../../../ui/theme-packages/village/assets/devices/gemini.webp" alt="Gemini icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Gemini background](../../../../../ui/theme-packages/village/assets/applet-scenes/gemini/background.webp) | ![Gemini effect](brands/gemini/effect.webp) |

### Perplexity

<img src="../../../../../ui/theme-packages/village/assets/devices/perplexity.webp" alt="Perplexity icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Perplexity background](../../../../../ui/theme-packages/village/assets/applet-scenes/perplexity/background.webp) | ![Perplexity effect](brands/perplexity/effect.webp) |

### DeepSeek

<img src="../../../../../ui/theme-packages/village/assets/devices/deepseek.webp" alt="DeepSeek icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![DeepSeek background](../../../../../ui/theme-packages/village/assets/applet-scenes/deepseek/background.webp) | ![DeepSeek effect](brands/deepseek/effect.webp) |

### WhatsApp

<img src="../../../../../ui/theme-packages/village/assets/devices/whatsapp.webp" alt="WhatsApp icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![WhatsApp background](../../../../../ui/theme-packages/village/assets/applet-scenes/whatsapp/background.webp) | ![WhatsApp effect](brands/whatsapp/effect.webp) |

### Telegram

<img src="../../../../../ui/theme-packages/village/assets/devices/telegram.webp" alt="Telegram icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Telegram background](../../../../../ui/theme-packages/village/assets/applet-scenes/telegram/background.webp) | ![Telegram effect](brands/telegram/effect.webp) |

### Slack

<img src="../../../../../ui/theme-packages/village/assets/devices/slack.webp" alt="Slack icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Slack background](../../../../../ui/theme-packages/village/assets/applet-scenes/slack/background.webp) | ![Slack effect](brands/slack/effect.webp) |

### Microsoft Teams

<img src="../../../../../ui/theme-packages/village/assets/devices/teams.webp" alt="Microsoft Teams icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Microsoft Teams background](../../../../../ui/theme-packages/village/assets/applet-scenes/teams/background.webp) | ![Microsoft Teams effect](brands/teams/effect.webp) |

### Zoom

<img src="../../../../../ui/theme-packages/village/assets/devices/zoom.webp" alt="Zoom icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Zoom background](../../../../../ui/theme-packages/village/assets/applet-scenes/zoom/background.webp) | ![Zoom effect](brands/zoom/effect.webp) |

### Dropbox

<img src="../../../../../ui/theme-packages/village/assets/devices/dropbox.webp" alt="Dropbox icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Dropbox background](../../../../../ui/theme-packages/village/assets/applet-scenes/dropbox/background.webp) | ![Dropbox effect](brands/dropbox/effect.webp) |

### OneDrive

<img src="../../../../../ui/theme-packages/village/assets/devices/onedrive.webp" alt="OneDrive icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![OneDrive background](../../../../../ui/theme-packages/village/assets/applet-scenes/onedrive/background.webp) | ![OneDrive effect](brands/onedrive/effect.webp) |

### Word

<img src="../../../../../ui/theme-packages/village/assets/devices/microsoft-word.webp" alt="Word icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Word background](../../../../../ui/theme-packages/village/assets/applet-scenes/microsoft-word/background.webp) | ![Word effect](brands/microsoft-word/effect.webp) |

### Excel

<img src="../../../../../ui/theme-packages/village/assets/devices/microsoft-excel.webp" alt="Excel icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Excel background](../../../../../ui/theme-packages/village/assets/applet-scenes/microsoft-excel/background.webp) | ![Excel effect](brands/microsoft-excel/effect.webp) |

### PowerPoint

<img src="../../../../../ui/theme-packages/village/assets/devices/microsoft-powerpoint.webp" alt="PowerPoint icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![PowerPoint background](../../../../../ui/theme-packages/village/assets/applet-scenes/microsoft-powerpoint/background.webp) | ![PowerPoint effect](brands/microsoft-powerpoint/effect.webp) |

### Figma

<img src="../../../../../ui/theme-packages/village/assets/devices/figma.webp" alt="Figma icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Figma background](../../../../../ui/theme-packages/village/assets/applet-scenes/figma/background.webp) | ![Figma effect](brands/figma/effect.webp) |

### Canva

<img src="../../../../../ui/theme-packages/village/assets/devices/canva.webp" alt="Canva icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Canva background](../../../../../ui/theme-packages/village/assets/applet-scenes/canva/background.webp) | ![Canva effect](brands/canva/effect.webp) |

### Spotify

<img src="../../../../../ui/theme-packages/village/assets/devices/spotify.webp" alt="Spotify icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Spotify background](../../../../../ui/theme-packages/village/assets/applet-scenes/spotify/background.webp) | ![Spotify effect](brands/spotify/effect.webp) |

### Apple Music

<img src="../../../../../ui/theme-packages/village/assets/devices/apple-music.webp" alt="Apple Music icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Apple Music background](../../../../../ui/theme-packages/village/assets/applet-scenes/apple-music/background.webp) | ![Apple Music effect](brands/apple-music/effect.webp) |

### Reddit

<img src="../../../../../ui/theme-packages/village/assets/devices/reddit.webp" alt="Reddit icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Reddit background](../../../../../ui/theme-packages/village/assets/applet-scenes/reddit/background.webp) | ![Reddit effect](brands/reddit/effect.webp) |

### Instagram

<img src="../../../../../ui/theme-packages/village/assets/devices/instagram.webp" alt="Instagram icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Instagram background](../../../../../ui/theme-packages/village/assets/applet-scenes/instagram/background.webp) | ![Instagram effect](brands/instagram/effect.webp) |

### LinkedIn

<img src="../../../../../ui/theme-packages/village/assets/devices/linkedin.webp" alt="LinkedIn icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![LinkedIn background](../../../../../ui/theme-packages/village/assets/applet-scenes/linkedin/background.webp) | ![LinkedIn effect](brands/linkedin/effect.webp) |

### Amazon

<img src="../../../../../ui/theme-packages/village/assets/devices/amazon.webp" alt="Amazon icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Amazon background](../../../../../ui/theme-packages/village/assets/applet-scenes/amazon/background.webp) | ![Amazon effect](brands/amazon/effect.webp) |

### Netflix

<img src="../../../../../ui/theme-packages/village/assets/devices/netflix.webp" alt="Netflix icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Netflix background](../../../../../ui/theme-packages/village/assets/applet-scenes/netflix/background.webp) | ![Netflix effect](brands/netflix/effect.webp) |

### Outlook

<img src="../../../../../ui/theme-packages/village/assets/devices/outlook.webp" alt="Outlook icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Outlook background](../../../../../ui/theme-packages/village/assets/applet-scenes/outlook/background.webp) | ![Outlook effect](brands/outlook/effect.webp) |

### Apple Podcasts

<img src="../../../../../ui/theme-packages/village/assets/devices/apple-podcasts.webp" alt="Apple Podcasts icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Apple Podcasts background](../../../../../ui/theme-packages/village/assets/applet-scenes/apple-podcasts/background.webp) | ![Apple Podcasts effect](brands/apple-podcasts/effect.webp) |

### Google Photos

<img src="../../../../../ui/theme-packages/village/assets/devices/google-photos.webp" alt="Google Photos icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Google Photos background](../../../../../ui/theme-packages/village/assets/applet-scenes/google-photos/background.webp) | ![Google Photos effect](brands/google-photos/effect.webp) |

### Pinterest

<img src="../../../../../ui/theme-packages/village/assets/devices/pinterest.webp" alt="Pinterest icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Pinterest background](../../../../../ui/theme-packages/village/assets/applet-scenes/pinterest/background.webp) | ![Pinterest effect](brands/pinterest/effect.webp) |

### Facebook

<img src="../../../../../ui/theme-packages/village/assets/devices/facebook.webp" alt="Facebook icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Facebook background](../../../../../ui/theme-packages/village/assets/applet-scenes/facebook/background.webp) | ![Facebook effect](brands/facebook/effect.webp) |

### Threads

<img src="../../../../../ui/theme-packages/village/assets/devices/threads.webp" alt="Threads icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Threads background](../../../../../ui/theme-packages/village/assets/applet-scenes/threads/background.webp) | ![Threads effect](brands/threads/effect.webp) |

### CapCut

<img src="../../../../../ui/theme-packages/village/assets/devices/capcut.webp" alt="CapCut icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![CapCut background](../../../../../ui/theme-packages/village/assets/applet-scenes/capcut/background.webp) | ![CapCut effect](brands/capcut/effect.webp) |

### Uber

<img src="../../../../../ui/theme-packages/village/assets/devices/uber.webp" alt="Uber icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Uber background](../../../../../ui/theme-packages/village/assets/applet-scenes/uber/background.webp) | ![Uber effect](brands/uber/effect.webp) |

### Uber Eats

<img src="../../../../../ui/theme-packages/village/assets/devices/uber-eats.webp" alt="Uber Eats icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Uber Eats background](../../../../../ui/theme-packages/village/assets/applet-scenes/uber-eats/background.webp) | ![Uber Eats effect](brands/uber-eats/effect.webp) |

### Booking.com

<img src="../../../../../ui/theme-packages/village/assets/devices/booking.webp" alt="Booking.com icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Booking.com background](../../../../../ui/theme-packages/village/assets/applet-scenes/booking/background.webp) | ![Booking.com effect](brands/booking/effect.webp) |

### 飞书

<img src="../../../../../ui/theme-packages/village/assets/devices/feishu.webp" alt="飞书 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![飞书 background](../../../../../ui/theme-packages/village/assets/applet-scenes/feishu/background.webp) | ![飞书 effect](brands/feishu/effect.webp) |

### 哔哩哔哩

<img src="../../../../../ui/theme-packages/village/assets/devices/bilibili.webp" alt="哔哩哔哩 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![哔哩哔哩 background](../../../../../ui/theme-packages/village/assets/applet-scenes/bilibili/background.webp) | ![哔哩哔哩 effect](brands/bilibili/effect.webp) |

### 小红书

<img src="../../../../../ui/theme-packages/village/assets/devices/xiaohongshu.webp" alt="小红书 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![小红书 background](../../../../../ui/theme-packages/village/assets/applet-scenes/xiaohongshu/background.webp) | ![小红书 effect](brands/xiaohongshu/effect.webp) |

### 百度网盘

<img src="../../../../../ui/theme-packages/village/assets/devices/baidu-netdisk.webp" alt="百度网盘 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![百度网盘 background](../../../../../ui/theme-packages/village/assets/applet-scenes/baidu-netdisk/background.webp) | ![百度网盘 effect](brands/baidu-netdisk/effect.webp) |

### Twitch

<img src="../../../../../ui/theme-packages/village/assets/devices/twitch.webp" alt="Twitch icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Twitch background](../../../../../ui/theme-packages/village/assets/applet-scenes/twitch/background.webp) | ![Twitch effect](brands/twitch/effect.webp) |

### Microsoft Copilot

<img src="../../../../../ui/theme-packages/village/assets/devices/copilot.webp" alt="Microsoft Copilot icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Microsoft Copilot background](../../../../../ui/theme-packages/village/assets/applet-scenes/copilot/background.webp) | ![Microsoft Copilot effect](brands/copilot/effect.webp) |

### Adobe Acrobat

<img src="../../../../../ui/theme-packages/village/assets/devices/acrobat.webp" alt="Adobe Acrobat icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Adobe Acrobat background](../../../../../ui/theme-packages/village/assets/applet-scenes/acrobat/background.webp) | ![Adobe Acrobat effect](brands/acrobat/effect.webp) |

### Wikipedia

<img src="../../../../../ui/theme-packages/village/assets/devices/wikipedia.webp" alt="Wikipedia icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Wikipedia background](../../../../../ui/theme-packages/village/assets/applet-scenes/wikipedia/background.webp) | ![Wikipedia effect](brands/wikipedia/effect.webp) |

### 豆包

<img src="../../../../../ui/theme-packages/village/assets/devices/doubao.webp" alt="豆包 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![豆包 background](../../../../../ui/theme-packages/village/assets/applet-scenes/doubao/background.webp) | ![豆包 effect](brands/doubao/effect.webp) |

### 淘宝

<img src="../../../../../ui/theme-packages/village/assets/devices/taobao.webp" alt="淘宝 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![淘宝 background](../../../../../ui/theme-packages/village/assets/applet-scenes/taobao/background.webp) | ![淘宝 effect](brands/taobao/effect.webp) |

### 支付宝

<img src="../../../../../ui/theme-packages/village/assets/devices/alipay.webp" alt="支付宝 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![支付宝 background](../../../../../ui/theme-packages/village/assets/applet-scenes/alipay/background.webp) | ![支付宝 effect](brands/alipay/effect.webp) |

### 抖音

<img src="../../../../../ui/theme-packages/village/assets/devices/douyin.webp" alt="抖音 icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![抖音 background](../../../../../ui/theme-packages/village/assets/applet-scenes/douyin/background.webp) | ![抖音 effect](brands/douyin/effect.webp) |

### PostHog

<img src="../../../../../ui/theme-packages/village/assets/devices/posthog.webp" alt="PostHog icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![PostHog background](../../../../../ui/theme-packages/village/assets/applet-scenes/posthog/background.webp) | ![PostHog effect](brands/posthog/effect.webp) |

### Cloudflare

<img src="../../../../../ui/theme-packages/village/assets/devices/cloudflare.webp" alt="Cloudflare icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Cloudflare background](../../../../../ui/theme-packages/village/assets/applet-scenes/cloudflare/background.webp) | ![Cloudflare effect](brands/cloudflare/effect.webp) |

### Vercel

<img src="../../../../../ui/theme-packages/village/assets/devices/vercel.webp" alt="Vercel icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Vercel background](../../../../../ui/theme-packages/village/assets/applet-scenes/vercel/background.webp) | ![Vercel effect](brands/vercel/effect.webp) |

### Netlify

<img src="../../../../../ui/theme-packages/village/assets/devices/netlify.webp" alt="Netlify icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Netlify background](../../../../../ui/theme-packages/village/assets/applet-scenes/netlify/background.webp) | ![Netlify effect](brands/netlify/effect.webp) |

### Firebase

<img src="../../../../../ui/theme-packages/village/assets/devices/firebase.webp" alt="Firebase icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Firebase background](../../../../../ui/theme-packages/village/assets/applet-scenes/firebase/background.webp) | ![Firebase effect](brands/firebase/effect.webp) |

### Sentry

<img src="../../../../../ui/theme-packages/village/assets/devices/sentry.webp" alt="Sentry icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Sentry background](../../../../../ui/theme-packages/village/assets/applet-scenes/sentry/background.webp) | ![Sentry effect](brands/sentry/effect.webp) |

### Railway

<img src="../../../../../ui/theme-packages/village/assets/devices/railway.webp" alt="Railway icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Railway background](../../../../../ui/theme-packages/village/assets/applet-scenes/railway/background.webp) | ![Railway effect](brands/railway/effect.webp) |

### Render

<img src="../../../../../ui/theme-packages/village/assets/devices/render.webp" alt="Render icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Render background](../../../../../ui/theme-packages/village/assets/applet-scenes/render/background.webp) | ![Render effect](brands/render/effect.webp) |

### GitLab

<img src="../../../../../ui/theme-packages/village/assets/devices/gitlab.webp" alt="GitLab icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![GitLab background](../../../../../ui/theme-packages/village/assets/applet-scenes/gitlab/background.webp) | ![GitLab effect](brands/gitlab/effect.webp) |

### Jira

<img src="../../../../../ui/theme-packages/village/assets/devices/jira.webp" alt="Jira icon" width="96">

| Background | Image-generated effect |
| --- | --- |
| ![Jira background](../../../../../ui/theme-packages/village/assets/applet-scenes/jira/background.webp) | ![Jira effect](brands/jira/effect.webp) |
