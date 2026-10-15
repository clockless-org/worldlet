# Theme contract (v3)

A theme is **static**: pictures, sounds, fonts and JSON. It holds no code and no stylesheet, and nothing in it runs. The main repository draws the World and every Applet page itself and reads from the theme only what this contract declares (owner decision 2026-10-10: "Theme 都是静态资源，不要让它去靠什么 render 什么东西了").

Worldlet bundles one theme, the Village, in `ui/theme-packages/village/`; there is no theme picker. The main repository owns the executable [TypeScript contract](../../ui/themes/build-theme-contract.ts), the [import validator](../../scripts/build-theme-source.ts) and the [registry](../../ui/themes/build-theme.ts). Packages are bundled into the app; nothing is downloaded at runtime.

```mermaid
flowchart LR
  T[theme.json and presentation.json] --> R[Host registry]
  A[assets: pictures, sounds, fonts] --> R
  J[Other JSON: art index, lamp positions] --> R
  R --> W[Host World renderer: Village or measured map]
  R --> H[Host HUD, sounds and Applet pictures]
```

## Package and validation

```text
package/
  theme.json          # contractVersion: 3, id, title, assets, presentation, optional updatedAt
  presentation.json   # tokens, fonts, optional worldMap, hud, sound, icons, weatherIcons, artifact, appletPresets, appletScenes and sceneMaterials
  assets/             # every picture, sound, font and licence the JSON names
  *.json              # other data the host's World code reads (the Village's lamps.json, assets/art.json)
```

`theme.json` fixes `assets: "assets"` and `presentation: "presentation.json"`; any other field is refused. `presentation.json` holds only `tokens`, `fonts`, `worldMap`, `hud`, `sound`, `icons`, `weatherIcons`, `artifact`, `appletPresets`, `appletScenes` and `sceneMaterials`. Image registration records painted surface bounds; executable layouts, viewport CSS and placement of host controls remain the host’s responsibility.

Themes do not have release version numbers. Optional `updatedAt` records the last source modification as a UTC timestamp (for example, `2026-10-10T07:10:00Z`); it is informational. `contractVersion` alone controls compatibility; source hashes identify the copied contents.

The importer accepts only static files (`json`, `png`, `webp`, `jpg`, `svg`, fonts, `mp3`, `m4a`, `wav`, `ogg`, `webm`, `txt`, `md`) and rejects code, stylesheets, symlinks, unresolved LFS pointers and any `assets/...` path a JSON file names that the package does not ship. Validated bytes replace `ui/theme-packages/<id>` atomically. The import writes the package's `index.ts`, which imports its JSON for the host (the manifest, the presentation and every other JSON file by package path, which the host reads through `themeData`), records hashes in `source-lock.json` and regenerates `ui/theme-packages/index.ts`. A failed import keeps the previous copy, and builds remove stale output assets.

## What the theme declares

| Field | What the host does with it |
| --- | --- |
| `tokens` | The theme's type and colours: `bodyFont`, `displayFont`, `bodySize` (at least 12), `titleSize`, `ink`, `paper`, `accent`, `focus`, `radius`, `controlHeight` (at least 32). |
| `fonts` | Bundled font files, each with its `license` file and optional `family` name. Family defaults to the filename without its extension. Shared fonts use an empty list. |
| `hud.skin` (optional) | Nine-slice pictures for the shared HUD pieces `attention`, `note`, `back`, `log`, `button`, `card` and `frame`: `image` (`png`, `webp` or `svg`), `slice` insets in image pixels and drawn `width` in CSS pixels (at most 64). |
| `sound.events` (optional) | An audio file per business event: `applet.arrived`, `mail.received`, `task.working`, `task.succeeded`, `task.failed`, `task.cancelled`. |
| `icons` (optional) | The theme's picture of an Applet by Applet key (`png`, `webp` or `svg`). The host shows it everywhere it pictures that Applet: the World, lists, history, the world log and the first-use gathering. |
| `appletPresets` (optional) | Reusable icon/background pairs for custom Applets, with a unique `id`, `title`, `description`, `category`, `icon` and `background`. Both images are package-local `png`, `webp` or `svg` files. |
| `appletScenes` (optional) | Backgrounds keyed by Applet key, with measured image registration for live HTML surfaces. |
| `sceneMaterials` (optional) | How Applet content looks on each region material (`paper`, `board`, `screen`): colours `ink`, `muted`, `line`, `accent`, `accentInk`, `control`, `controlInk` and `fill` (`#rrggbb` or `#rrggbbaa`), and font stacks `bodyFont` and `displayFont`. A role left out comes from `tokens`. |
| `artifact` (optional) | How the theme's Artifacts look, as static files ([Artifacts](#artifacts)). |

Anything left out keeps the shared look, sounds and pictures.

### Bundled fonts

The host registers each bundled font with the browser as the declared `family`, or the filename without its extension when omitted (`assets/fonts/Display.woff2` becomes `Display`). Reference that name in `tokens.bodyFont`, `tokens.displayFont` or a scene material's font stack. Family names use letters, digits, spaces, underscores, periods or hyphens; omit CSS quotes and fallback names from `family` itself.

Fonts load from published package URLs, even before the built World environment exists. The system fallback paints during loading. Repeated requests share one face per family/URL; a failed request can be retried through `prepareBuildThemeFonts()`. If the first family in `tokens.displayFont` names a bundled face, the host also assigns that face to its shared display and label roles. Packages without bundled fonts retain the shared HUD font declarations.

### Custom Applet art presets

The host reads `themeAppletPresets()` from `ui/themes/index.ts`. It returns the active theme's entries with `icon` and `background` resolved to published URLs; a theme without presets returns an empty list. IDs are stable within the theme. Presets are art choices, not Applet keys: they neither register providers nor create Applets, authorize actions or connect user data. The host owns selection, responsive layout and live HTML content.

The Village bundles 16 pairs under `assets/applet-presets/`, declared in `presentation.json`. The [source catalog](../styles/builtin/presets/personal-scenes/README.md) contains the full visual gallery and research. An Applet creation picker is not connected yet. For example, host code can read `themeAppletPresets().find(p => p.id === 'meal-planner')` and use its image URLs.

### Measured World maps

Optional `worldMap` in `presentation.json` supplies one background, its encoded `imageSize` and `sha256`, and an `areas` record keyed by existing host area IDs. Each entry has a normalized `anchor: [x,y]`, optional display `title` and `description`, and optional local `map` artwork for the area view. Import validates the World image bytes and dimensions. It never registers Applets, capabilities or navigation actions.

The shared `ui/world/world-map.ts` renderer applies one contain transform and publishes area anchors to the host's accessible buttons. Area views retain the real catalog and navigation. The shared HUD offers real Attention categories in a collapsible rail so entrances remain clear; Escape closes the rail and restores focus. Packages without `worldMap` keep the Village renderer. Selecting an imported package remains a private build-time choice; importing alone does not change the public default. Village-specific fallback data is explicitly read from the bundled Village package, independently of selected presentation data.

### Registered backgrounds and live HTML

`themeAppletScene(appletKey)` returns an optional Applet-bound background with its published URL and `registration`. Reusable `appletPresets` can also carry `registration`. An Applet's icon still comes from `icons` using the same key; a generic preset carries its own icon. No registration means the existing host presentation continues.

| Registration field | Meaning |
| --- | --- |
| `imageSize` | Final encoded image width and height in pixels. |
| `sha256` | SHA-256 of those exact encoded background bytes. Import rejects a stale hash or size. |
| `regions` | Nonoverlapping painted blank surfaces. Each has a unique `id`, `role` (`primary` or `secondary`), normalized `rect: [x,y,width,height]`, and `material` (`paper`, `board`, `screen`). Exactly one primary is required. |
| `webFrame` (optional) | Extracted alpha asset (`mask`) and normalized `source` / `target` bounds. The host takes its alpha only, sampling colours from the original scene. A click-through foreground covers the website seam with the complete painted frame. |
| `webEdge` (optional) | Clockwise `top`, `right`, `bottom`, `left` sample arrays (2–64 values per side, 0–3 source pixels). Original background pixels overlap the outer edge of a live website; the host scales them down with the scene and caps enlargement. No input capture or website styling. |
| `companion` | A separate normalized rectangle describing quiet painted clearance. The shared host chooses the companion layout from this clearance; it grants no theme control over Fox behavior or artwork. |

Coordinates start at the image's upper-left and stay within 0–1. They are measured from the finished picture, not guessed from a generation prompt. `fitThemeScene(registration, width, height)` applies one centered, uniform contain transform to the painting, every region and companion clearance. Do not crop the background independently. The host chooses its responsive presentation and may switch to a normal readable page on narrow viewports instead of shrinking interactive text.

Desktop Applet artwork and layout should target these usable dimensions (design guidance, not a schema-enforced threshold):

| Dimension | Target |
| --- | --- |
| Usable content height | About 80% of the Applet viewport height |
| Usable content width | About 70% of the Applet viewport width |
| Remaining right-hand space | Place Fox and its conversation here, aligned with the scene; avoid an unused gap between the Applet and companion |

Measure the live HTML or website area after navigation, padding and decorative frame insets, not the outer painted board. Keep the main content on the left. Arrange frames and props around this area rather than reducing it; preserve irregular paper edges as foreground detail without covering usable controls. For an existing scene with a short clearance below its paper, the host can use a compact composer strip: Fox remains clickable, local introductory copy appears on input focus, and real replies, notices and actions remain visible. Check the complete composition with the actual companion and reply visible. These are approximate desktop targets; retain readable responsive fallbacks on narrow windows. Existing scenes may need revision to meet them.

Keep dates, messages, task state and controls out of the bitmap. The host supplies real HTML and trusted data inside those surfaces. A Calendar can have a main event surface and a separate small date surface. Regions grant no capabilities, execute no code and bind no provider data themselves. Embedded external websites still require the host's browser surface and cannot acquire this appearance from artwork alone.

The host draws registered scenes with one shared renderer, [ui/applets/scene](../../ui/applets/scene/README.md): it lays the painting out with `fitThemeScene`, puts a live HTML element on every region and gives each region its `sceneMaterials` entry as CSS variables. An Applet fills the regions with its records and the shared controls and names no coordinate, colour or font, so a theme changes how an Applet looks without a change to the Applet. Mail is drawn this way; the other Applets keep their current pages until they move over, and the preset picker has not adopted registered surfaces yet.

The [Village scene library](../styles/builtin/references/registered-scenes/README.md) includes the inventory and an interactive preview with fictional data.

#### Background, live content and foreground frame

New and revised framed Applet artwork must deliver these parts together, for both App-bound scenes and reusable presets:

| Deliverable | Requirement |
| --- | --- |
| Background | Complete scene with a blank, front-facing content surface and its physical frame. Match the World and icon; keep dynamic text and controls out of the bitmap. |
| Foreground mask | PNG or lossless WebP with genuine alpha: retain the frame, pins, bindings and a thin irregular paper lip; clear the content opening and surrounding scenery. No painted white or checkerboard substitute for transparency. |
| Registration | Measure the usable `regions`, `companion` and `webFrame` on the final art. Package the mask with the background and include both in the source lock. |
| Composed preview | Show content underneath the foreground, with Fox and a reply visible. Check seams, usable area and unobstructed controls at desktop and narrower sizes. A background-only image is not acceptance evidence for the completed composition. |

The layer order is **background → live page → extracted foreground**, with navigation and companion outside the content aperture. For external websites the host keeps its isolated rectangular browser surface and places a click-through foreground above it. The mask supplies alpha only; visible foreground pixels come from the original background, preserving its exact colours and lighting. Do not restyle the external site to imitate paper. The same composition is the art standard for HTML Applets; its host renderer must implement the foreground before claiming that scene is integrated.

Extract the foreground from the final background during scene production, not as a later cleanup task. Prefer identical canvas dimensions and alignment: `source: [0,0,1,1]`, `target: [0,0,1,1]`. If extraction shifts the frame, measure and register its aperture explicitly instead of guessing a crop. Do not crop or scale the background, content and foreground independently. Recheck registration and hashes whenever the painting changes.

The live page should extend just under the inner rim, with no additional matte, rounded inset, padding or CSS border between it and the painted frame. Preserve the irregular paper edge as a thin overlap; it must not hide controls or reduce the approximately 70% width / 80% height usable-area targets above. The transparent asset is decorative and must never capture pointer, keyboard or accessibility focus. Release it when leaving the scene or entering the compact fallback.

`webFrame` remains optional in the schema for existing scenes and intentionally frameless themes. Its presence declares a working foreground, not an unfinished placeholder. Import checks that the registered mask crop contains both a fully transparent opening and an opaque rim; visual review still establishes their correct shape and alignment. The bundled Village library supplies masks for all 140 core, generic and branded selections; other themes may intentionally remain frameless. See the [production workflow](../styles/builtin/references/registered-scenes/README.md#frame-production-workflow).

### Artifacts

An Artifact is a card Fox puts in front of the person ([core/artifacts](../../core/artifacts/README.md)). The theme says how it looks; the host makes it. The section holds no template, stylesheet or script, only files a person or a model reads:

| Field | What it is |
| --- | --- |
| `style` | Design rules for an Artifact in this theme (`.md` under `assets/`): material, layout, type, colour, illustration, interaction and acceptance |
| `prompt` | The prompt the host's generator receives with the content, the room it has and the capabilities the host gives (`.md`) |
| `references` | 1 to 6 pictures of finished Artifacts, each with its `role`; the first is the visual standard |
| `materials` (optional) | Up to 12 pictures a generated Artifact may place, each with an `id` and its `usage` |
| `colors` (optional) | `#rrggbb` per colour role: `paper`, `ink`, `brass` and one accent per tone (`moss`, `teal`, `honey`, `sage`, `clay`, `plum`) |

The host reads it with `themeArtifact()` (`ui/themes/build-theme.ts`). The same look serves both ways the host makes an Artifact: filling its own card with the words Fox wrote, and having the Agent write a whole page, which the host shows isolated. A theme without the section keeps the host's card. Brand logos (the HUD title bar, picture-in-picture) stay the host's.

Assets at `assets/...` are published to `theme-assets/<id>/...`; the host resolves them with `themeAssetURL`.

Not part of a theme: how the World and Applet pages are drawn (the host's code), the companion (Fox, its rig and portrait, where it stands, its reply bubble, panel and nameplate), and the loading and first-use pages.

## The Village

The Village package is the one description of the Village: its art in `assets/` (`art.json` indexes it; `scripts/village-art.ts` encodes it from the painted sources), `lamps.json` (where each device's lamp sits), Applet `icons` for every catalog Applet, and the host's pack of it: `pack.json` (space, layout, motion, companion and surfaces; `ui/themes/theme-pack.ts`), `style.json` and `tokens.json` (its Style Pack; `ui/components/style.ts`) and `world.json` (areas, slots and plates; `ui/world/world-pack.ts`). The painted sources these name stay in `resources/styles/builtin` and `resources/worlds/village`. The animated Pixi World that draws it is the host's code in `ui/world/village/` (`village-world.ts` behind the host's World mount, `ui/world/world-renderer.ts`). Its Applets open in the host's own Applet pages, and the host draws the pins, lamp labels, lamps on device pictures and the zoom between World and Applet. Its Artifact look is in `assets/artifact/` ([the style pack](../../ui/theme-packages/village/assets/artifact/README.md)), declared in `presentation.json`. One folder in the package is reference material the host does not read and the app does not ship (only `assets/` is published): `areas/` (painted day and night close views of the six places, not used yet).

## Checking a package

```sh
npm run theme:source-check -- /path/to/your-theme
npm run theme:import -- /path/to/your-theme
npm run test:theme-source
```

`theme:import` replaces the bundled package with a checked copy.

## Compatibility

Contract v3 is frozen. `ui/themes/frozen/contract-v3.d.ts` holds its declarations and `scripts/fixtures/theme-contract-v3/` is a package that uses every part of it. `node scripts/theme-contract-check.ts` runs in PR CI (`npm run check:contracts`) and fails when a change would break a package written against v3: the frozen manifest and presentation must still be accepted, no frozen field may be removed, and the frozen package must still validate.

An additive, optional change passes; refresh the snapshot in the same PR with `node scripts/theme-contract-check.ts --freeze`. Anything else needs contract v4 with its own snapshot and frozen package. Incompatible versions fail at import before copying.

Contract v2 let a package ship code (`renderWorld`, `renderApplet`) and a stylesheet. It was retired on 2026-10-10 when themes became static; no package uses it.

The old data-only `ThemePack` (`ui/themes/theme-pack.ts`) only describes the Village's source art and companion; it is not a theme API.

### Weather condition pictures

`presentation.weatherIcons` optionally maps WMO condition codes (decimal keys such as `3` or `61`) to package-local PNG, WebP or SVG pictures. The shared Weather panel uses these for both current conditions and forecast days. Missing conditions, or an image that fails to load, keep the shared weather artwork. These pictures never supply forecast values or change condition labels. The supported keys are `THEME_WEATHER_CODES` in the contract.
