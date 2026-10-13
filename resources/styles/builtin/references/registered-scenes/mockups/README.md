# Village Applet design mockups

40 rendered compositions pair the approved background with purpose-specific HTML. All content is fictional. Most buttons illustrate a proposed interface. Calendar navigation, Mail drafts, editable Notes and reminder/shopping lists retain local preview interactions; these pictures do not imply connected data or completed production applications.

| Collection | Mockups | Status |
| --- | ---: | --- |
| Core applications | 18 | 🟢 Rendered |
| Games | 6 | 🟢 Rendered |
| Generic scenes | 16 | 🟢 Rendered |

The parent [scene library](../README.md) supplies blank backgrounds, icons and registered regions. The [capture manifest](manifest.json) records screenshot dimensions and source/output hashes.

## Reproduce

Serve the repository root on port 8787, then run:

```sh
node scripts/applet-scene-preview.ts
node scripts/applet-scene-mockups.ts
node scripts/applet-scene-mockups.ts --check
```

The exporter checks all 40 compositions for failed image loads, browser errors and content overflowing the primary registered region. Use `SCENE_PREVIEW_URL` to select a different local preview server. The gallery displays these exports, while selecting a scene displays its actual HTML composition.

## HTML implementation

The background owns the room, board, frame and lighting. The registered primary surface owns a normal HTML layout; secondary surfaces can carry a date, progress or next action. `fitThemeScene` applies the same image-to-viewport transform to every layer. `mountSceneFrame` then samples the original painting through the extracted alpha mask above the HTML, preserving its physical edge without blocking pointer input. Do not independently use `background-size: cover` and viewport percentages for the content.

| Layer | Implementation | Changes with data |
| --- | --- | --- |
| Environment | Existing scene background and icon | Theme selection |
| Physical details | Transparent paper card, linen button and image prints from the [material catalog](../mockup-materials/manifest.json) | Selected theme asset |
| Content | DOM text, lists, images, CSS Grid/Flex, SVG charts | Titles, dates, messages, amounts, attachments |
| Controls | HTML buttons, inputs and scrollable content | Applet actions and state |
| Foreground frame | Original painting pixels through the registered transparent mask | Theme selection and viewport geometry |
| Companion | Reserved region from registration | Host-managed conversation |

The preview uses actual image-backed HTML controls and six different illustrated sample photos. It does not flatten text into the painting. Photo subjects follow the sample content: a garden invitation, orchard notes, a meal plan, travel postcards, reading and an album library. Soft contact shadows, modest paper rotation and material edges connect those layers to the board without rotating the working surface itself.

The heading stays outside the scrollable body. The **Long-content test** replaces the fictional sample with long, wrapping entries so the same surface can be checked for overflow and scrolling. Production renderers should insert external strings with `textContent`, validate image URLs and supply loading, empty, error and selected states through the Applet model. The static sample templates contain only authored fictional content; they are not a production renderer for untrusted HTML.

These compositions are implementation studies, not a second Applet runtime. In production, reuse shared `ui/applets` renderers and actions, read semantic data from Core, and obtain art/regions/material tokens from the Theme. Keep account access in the existing adapters. External websites remain separate browser surfaces; theme their surrounding frame without injecting CSS into third-party pages. Narrow production screens need a readable stacked content mode; this gallery scales the scene for artwork review only.

The [material catalog](../mockup-materials/manifest.json) preserves all eight generation prompts, the reference image, original PNGs, WebP derivatives and hashes. Assets were made with built-in image generation. `scripts/applet-scene-mockups.ts --check` verifies both the material hashes and the exported compositions.

## Core applications

### Calendar

![Calendar design mockup](google-calendar.webp)

### Mail

![Mail design mockup](gmail.webp)

### Notes

![Notes design mockup](apple-notes.webp)

### Reminders

![Reminders design mockup](apple-reminders.webp)

### Files

![Files design mockup](files.webp)

### Weather

![Weather design mockup](weather.webp)

### Meetings

![Meetings design mockup](meetings.webp)

### Voice Memos

![Voice Memos design mockup](voice-memos.webp)

### Messages

![Messages design mockup](messages.webp)

### Browser

![Browser design mockup](browser.webp)

### Maps

![Maps design mockup](maps.webp)

### Clock

![Clock design mockup](clock.webp)

### Contacts

![Contacts design mockup](contacts.webp)

### Photos

![Photos design mockup](photos.webp)

### Music

![Music design mockup](music.webp)

### News

![News design mockup](news.webp)

### Podcasts

![Podcasts design mockup](podcasts.webp)

### Stocks

![Stocks design mockup](stocks.webp)

## Games

### 2048

![2048 design mockup](game-2048.webp)

### Snake

![Snake design mockup](snake.webp)

### Minesweeper

![Minesweeper design mockup](minesweeper.webp)

### Sudoku

![Sudoku design mockup](sudoku.webp)

### Gomoku

![Gomoku design mockup](gomoku.webp)

### Random Game

![Random Game design mockup](random-game.webp)

## Generic scenes

### Weight balance

![Weight balance design mockup](weight-balance.webp)

### Meal planner

![Meal planner design mockup](meal-planner.webp)

### Workout plan

![Workout plan design mockup](fitness.webp)

### Sleep & recovery

![Sleep & recovery design mockup](sleep.webp)

### Travel planner

![Travel planner design mockup](travel.webp)

### Outdoor adventures

![Outdoor adventures design mockup](outdoor.webp)

### Shopping list

![Shopping list design mockup](shopping.webp)

### Household budget

![Household budget design mockup](budget.webp)

### Home care

![Home care design mockup](home-care.webp)

### Garden planner

![Garden planner design mockup](garden.webp)

### Daily planner

![Daily planner design mockup](daily-planner.webp)

### Reading & research

![Reading & research design mockup](reading.webp)

### Language practice

![Language practice design mockup](language.webp)

### Personal journal

![Personal journal design mockup](journal.webp)

### Job search

![Job search design mockup](job-search.webp)

### Project planner

![Project planner design mockup](project-planner.webp)
