# Environment and placement contract

Chapters:
- [Six customizable regions](#area-taxonomy)
- [Local sky and weather](#sky-and-weather)
- [Background music and ambience](#background-music)
- [Render performance](#render-performance)
- [Art verification](#art-quality)


`ui/theme-packages/village/world.json` owns region bounds, camera centers, labels and named Applet ground slots; `ui/world/world-layout.ts` projects that portable pack for rendering and navigation. Persisted region and slot IDs remain stable.

Current defaults: Home central; Social upper-left; Life upper-right; Games right; Work lower-right; Entertainment at the left dock. Region names and assignments are customizable.

## Uniform five-slot courts

Village 1.7.1 uses the same centered 3+2 arrangement in every court: rear row
left-to-right (1–3), then front row left-to-right (4–5), offset by half a pitch.
Horizontal pitch is 0.048 of the world width (92.16 logical pixels); row pitch is
0.04 of its height (43.2 logical pixels). Each court retains its own location,
with labels centered 0.023 below the front row. These are ground-anchor distances,
not identical silhouette-edge gaps: Applets retain their own optical proportions.
Slot IDs, pin indices, empty places and saved assignments are unchanged. The
shared camera scales all courts uniformly; it does not compress Home separately.

## Design reference: 1920 × 1080

`ui/world/world-design.ts` is the shared 16:9 logical reference for the renderer and art layout. It is not a required physical Mac window size or the source image resolution. The full plate uses these logical coordinates; the pack's inner overview frame leaves additional terrain around the visible world for region centering. Normalized 0–1 anchors remain stable and need no saved-placement migration.

- A 16:9 window scales the whole world uniformly. Background, landmarks, sprites, hit targets and drag positions share the same camera transform.
- Other aspect ratios adjust the visible surrounding terrain using cover framing. They never stretch the image or reflow devices into different slots. Very narrow windows can crop outer regions in overview.
- The HUD stays anchored to the viewport and remains readable; it does not change the world scale.
- Generated texture dimensions (3840 × 2160) describe pixels only. Replacing a texture with higher resolution must not change layout. Retina renderer density is a third, independent setting.
- The previous 1536 × 864 internal basis was rescaled by 1.25, including device/landmark dimensions, river animation and sky projection. This is a coordinate migration, not a zoom or rearrangement.

## Author an environment as a bundle

1. Plan region bounds, open installation surfaces, paths and empty spaces before generation. Coordinates use the shared 1920 × 1080 design reference, normalized to 0–1; the overview is an inner crop of the full plate, retaining terrain on all sides.
2. Include the approved palette/camera references and layout constraints in the image-generation prompt. Reserve each slot's `clearance` rectangle (logical width × height, extending upward from its ground anchor). `surface` describes the support; `width` is displayed sprite width, not a physical footprint.
3. Generate a clean environment without devices or baked labels. Inspect the actual image and register metadata to real ground surfaces. Model-proposed positions are drafts, not proof of usable space. Keep devices off water, roofs and paths.
4. Generate night as an illumination-only edit of accepted daytime geometry. Record the image-to-world transform, verify landmarks, and share slots across both states. See `registered-plate.ts` and the 2.5D production contract.
5. Review actual devices at overview and in the foreground, day/night, then test bounds, separation and navigation. Never silently reuse coordinates after changing generated geometry.

Slots have stable area-seat IDs; user pin indices assign Applets to them, so catalog
reordering cannot move devices. This is build-time metadata, not an automatic
image-analysis or user-device generation service. Clearance is a review constraint,
not collision/occlusion simulation.

Checks: `node scripts/slot-placement-check.ts` covers equal pitches, pin ordering,
drag targets and reload; `node scripts/world-readability-check.ts` captures day,
night, Home zoom and a compact viewport after building the native UI.

<a id="area-taxonomy"></a>
## Six customizable regions

Updated 2026-09-25 following the approved Home + five-region direction, and 2026-10-08 for the regroup (owner request: Create merged into Work, its court became Social, Explore became Entertainment).

| Visible default | Stable region ID | Default landmark |
| --- | --- | --- |
| Home | home | Cottage |
| Work | work | Open forge and tool rail |
| Social | library | Reading nook (Create's landmark until new art) |
| Life | money | Fountain |
| Games | health | Shade tree and bench |
| Entertainment | travel | River landing and boat |

Legacy `people` / `building-people` (Explore, now Entertainment) resolves to `travel` / `building-travel`. No Applet, connected account, source record or grant is removed. Catalog categories may retain their semantic identifiers; the presentation projection canonicalizes membership, including older saved links.

### Independent concerns

Region name, landmark theme, catalog membership and five pinned ground positions are independent. Names do not infer new content or automatically change themes. Theme selection replaces the compact rear-edge landmark; the ground footprint, river and road entrances stay fixed. Ground material itself is not changed by the current theme selector.

The five visible places hold explicitly pinned Applets in their places, and every other place holds the region's most recently used ground-eligible members, the most recent in the first free place (owner request 2026-10-04); never-used members keep catalog order as a stable tie-break. Opening an Applet records its use (`lastUsedAt`); placement updates when returning to the world or editing a region. A moment or ongoing Applet counts its arrival as a use (`arrivedAt`), so it arrives in front. Ground selection is presentation, never an availability or permission boundary.

In Village, every region always shows only its name: no app count, ellipsis or empty-area plus. The whole region is clickable: the name, the region's ground and its landmark sprite (only its painted pixels) open the same shelf. On a window wider than 700 px it docks on the right (about half the window, at most 600 px, over Fox's right column while open) and the camera zooms that area into the World left of it, centred there as far as the plate allows, without entering the area (`frameArea` in `pixi-world.ts`; owner request 2026-10-06); closing it zooms back to the overview. While it is zoomed, every Applet keeps its overview size on screen, and the room the zoom makes holds more of the area's own Applets (owner request 2026-10-08, `extraPlacements` in `slot-placement.ts`): the five places keep their anchors, and the area's other Applets, in the shelf's Recently used order, fill extra places packed around them on the court (the ellipse inside the area's bounds) from the rear row down to just above the name, at the five's spacing divided by the zoom. They fade in with the zoom and out as it zooms back; those that do not fit stay in the shelf. Narrower windows keep the centred shelf and a still camera. Fox stays put. Hovering any of them lights the region's faint glow and underlines its name; devices standing in the region keep their own taps and open their Applets. **On the ground** always shows five places in their actual slot order, including quiet non-interactive placeholders for empty places. Pinned apps keep their places; the rest follow most recent use. Using a previously unselected app makes it eligible to fill an available place on returning to the world; there is no explicit add step.

**Recently used** lists the area's own Applets, the five ground places first and then the rest by most recent use (`lastUsedAt`). An area holds only the person's own Applets (owner Order 2026-10-07): those in the World (`unlockedApplets`, minus removed ones) whose assignment, or else catalog category, is this area. **Recommended** below lists up to eight related catalog Applets not in the World yet ([area-recommend.ts](../../core/applets/area-recommend.ts)): the area's category first, then categories of Applets the person moved in; within them installed on this computer (`installedApplets` keys only, Mac), then visited in Worldlet's browser over 30 days (`visitedSites`: hosts and counts, never Fox), then catalog order; removed Applets are never recommended. Selecting one assigns it to this area and opens it; Place here assigns it without opening; All <area> Applets lists the rest of the category by name. Every own tile has a move button (top left) listing the other areas. Usage frequency (`usage`) is still counted but orders nothing. Legacy profiles without timestamps and never-used apps sort alphabetically after dated apps; do not invent timestamps from counts. Every tile opens directly, without automatically moving an app from another region. The companion Applets tab likewise lists the catalog with Open actions. Fox's public Applet tool covers the full catalog. Account connections, permissions and external desktop-software installation remain separate and may still be required on use.

The shared overview Applet width is 72 logical pixels, retaining per-Applet optical corrections and aspect ratio. Shelf images use a consistent 96 × 88 maximum box instead of the previous 120px height. These are separate controls: changing shelf thumbnails does not resize world devices. Focus content and landmark scale are unchanged.

Resident positions share one spatial order across the world, pins and On the ground: back row 1–3 from left to right, then front row 4–5 from left to right. The shelf mirrors this three-plus-two arrangement; capacity remains five. Notes and Reminders belong to Home by default; explicit personal region assignments remain respected.

Escape or an outside click dismisses the shelf without also navigating Back. Apart from the shelf's area zoom, Village keeps its overview camera. In a theme whose Areas zoom, region names and ground enter a fitted Area view: only that region’s ground Applets remain visible, Attention gives the floor space back, and Manage Applets opens the same shelf. Back returns from an Applet to its entered Area, then from Area to World; clicking bare scenery inside the Area does not leave it. Dragging a scene device onto another region's place changes its membership and pins it there. A displaced or hidden device remains callable through Fox and the shelf. Existing persisted `unlockedApplets` and `hiddenApplets` keys are retained for ground presentation/backward compatibility; they are not an installation prerequisite.

### Storage and scope

In the area shelf, each On the ground place has a pin (shown on hover or focus, and always once pinned) that pins or unpins the Applet standing there; the device's menu offers Pin in this place and Unpin. Dragging a Recently used, Recommended or All app onto any On the ground place also pins it there. Both empty places and occupied tiles accept drops with a quiet highlight. An unpinned app it displaces goes back among the recently used (never hidden or deleted); dragging between resident places swaps a pinned one into the place the dragged app left. Dragging does not open the Applet or request account access.

`ui/world/region-layout.ts` validates these presentation preferences (version 2; version 1 wrote every filled place as a pin, so its pins are not read). The personal World keeps them in its configuration (`onboarding.regionLayout` in `world.sqlite`, the onboarding `regionLayout` operation, saved without a new revision), separate from account grants and content, so they survive restart and come back with a backup; a World without one takes the page's earlier scoped localStorage (`worldlet-regions-v1:<workspace>`) once. The sample world keeps them in that localStorage key. Background data refresh reapplies the same preferences.

This revision deliberately leaves the native source schema and existing stable catalog IDs intact. The visible six-region projection is shared by the app UI; agent APIs that read the underlying catalog still see catalog categories.

### Default Applet membership

Each Applet definition's `region` (`core/applets/definitions/*.ts` and the website catalog JSON in `core/applets/`) is the canonical catalog assignment; `core/applets/regions.ts` holds only area titles and onboarding starters. Stable storage IDs remain unchanged; custom names, assignments and pins take precedence. Onboarding selects all supported detected apps, then fills each area to three curated starters. Explicit unchecks are respected. Each area still shows five devices at most; additional members live in its shelf.

| Area | Includes |
| --- | --- |
| Home | Mail, calendar, reminders, notes, weather, photos and the browser |
| Work | Coding, collaboration, meetings, developer infrastructure, AI assistants, notes, writing, spreadsheets, design, media editing, cloud storage and PDFs |
| Social | Social networks, communities and messaging apps |
| Life | Finance, health, shopping, food, maps and travel |
| Games | Worldlet's own games: 2048, Snake, Minesweeper, Sudoku and Random game (one of the games at worldlet.ai/games) |
| Entertainment | Video, music, podcasts, live streams, short video and Wikipedia |

Games (owner request 2026-10-03) replaced Tools in the same court: its AI assistants moved to Work and its storage, PDF and photo apps to Create (since 2026-10-08, Work and Home).

**The 2026-10-08 regroup** (owner request: the areas follow where people spend their time online). The storage IDs stay: `library` is Social and `travel` is Entertainment. Area layouts are version 3 (`migrateAreaLayout` in `core/applets/regions.ts`, applied whenever a layout is read, in the page and in the host): an Applet the person assigned to Create (`library`) is assigned to Work, Create's pins fill Work's free places in order (in every theme's pins), and a name the person gave Create is dropped, since it named an area that no longer exists; landmark themes, other names and every other assignment are kept. Applets nobody moved follow their new catalog category. A kept Ongoing thing from before the regroup (no `regrouped` mark) reads its `library` as Work and its `travel` (a trip) as Life (`readOngoing`). Each game is its own Applet with the shared game device (`resources/styles/builtin/drafts/games/`). The four boards open in the Village HUD (`fullView.kind: 'game'`, `ui/applets/games.ts`) and run offline. The board is built on open and dropped on close; a moving game draws only while it is on screen and in play, so a closed game never renders or ticks. The fifth place is **Random game** (owner requests 2026-10-03): a website Applet that opens `https://worldlet.ai/games/random/`, which lands in one of the HTML5 games served from website/games, never the one just left; Another game on each page picks again. Breakout lives there. Worlds set up before a game existed get it once (`offerGames` in `core/onboarding/onboarding.ts`, recorded in `offeredGames`); a game the person removes stays removed, and a removed Breakout keeps the Random game away too.

<a id="sky-and-weather"></a>
## Local sky and weather

The desktop app and website preview share `ui/world/environment/world-environment.ts` and `ui/world/environment/celestial.ts`; the HUD binding is `ui/world/world-environment.ts`. The desktop host's location and forecast transport is `platform/electron/src/modules/media/weather.ts`: fixed Open-Meteo requests, Mac location through Chromium geolocation in the host media surface (the macOS location permission), Windows location through the system location service; on other systems location fails explicitly and the person searches for a city. No model generates astronomical positions or weather.

### Location and time

- The upper-right weather button reads **Check weather** before setup and immediately requests device location, without an intermediate window. Denial/unavailability remains an inline HUD status with a detailed tooltip; Fox can search/select a city. The seven-day forecast stays in the Weather Applet. Completing onboarding with Weather explicitly selected requests device location once if no location is saved. The attempt is persisted, including denial, so future launches do not repeat the prompt; retry stays user-initiated. Practice/public previews never request location. After device selection, location can refresh every 15 minutes while this world stays open.
- Forecast requests round coordinates to two decimals (about 1 km). Coordinates are not sent to the chat model by this feature.
- Weather comes from Open-Meteo for that location, refreshed every 30 minutes and marked unavailable after two hours. A failed refresh keeps and names the last known location.
- UTC instants drive astronomy independently of the display timezone or daylight saving. The forecast timezone drives the displayed date and clock.
- Without a location the data authority reports `location-needed`. The presentation layer uses explicitly decorative local-time positions, but still computes the real lunar phase from UTC; it never substitutes a fixed half moon. Location is needed for bearing, altitude and local lunar tilt, not for the global phase.
- Fox uses the shared `weather/search`, `select`, `status` and `clear` implementation. Fox gateway access requires private-context permission. Search returns city/region/country labels and short-lived opaque choices, never coordinates. Ambiguous results require choosing the intended city. Selection persists the place and refreshes the forecast; clearing removes both and invalidates late results. Visual weather/lighting overrides remain separate. Practice cannot change the real location.

### Coordinates

Astronomy Engine 2.1.19 computes topocentric Sun and Moon coordinates, including lunar parallax, light travel, precession and nutation, and standard atmospheric refraction. Moon phase and illuminated fraction come from the same engine, and its license ships with the app.

| Quantity | Convention |
| --- | --- |
| Azimuth | Degrees clockwise from true north: N 0°, E 90°, S 180°, W 270° |
| Altitude | Degrees above the local astronomical horizon |

### What the calculations reach

The sky uses a compressed 360° panorama: north at its seam, east at the left quarter, south in the center, west at the right quarter. Bearings are no longer clamped to an east–west semicircle. Real altitude maps into the available sky band. This is not the compass orientation of the computer screen or an angularly accurate planetarium projection. Discs are deliberately enlarged to 28–48 CSS pixels, independently of world zoom. Bodies hide below the astronomical horizon and when a close-up leaves no sky.

The sun has a defined ivory core, restrained bloom and warmer low-altitude light. The moon uses a 256px procedural material, subtle basin/rim markings and softened single-scattering shading. Its terminator uses the actual illuminated fraction and the Sun's direction on the Moon's local horizontal tangent plane, so tilt follows time/location in either hemisphere. A daytime Moon remains visible with lower contrast when it is above the horizon. The unlit side stays transparent. Neither material is photographic or a precise lunar surface map. The phase convention follows [NASA's explanation](https://science.nasa.gov/moon/top-moon-questions/); positions and illumination use [Astronomy Engine](https://github.com/cosinekitty/astronomy).

Continuous daylight blends painted day/night plates and grades existing device sprites; clouds remain painted and static. Stars are decorative dots, not a projected catalog. Weather does not dim the world; rain, snow and fog have restrained overlays. Non-interactive village lamps and light pools are painted into the backgrounds. `sceneMetrics.environment.mode` is `shared-2.5d-lighting`.

Cast shadows remain baked and snow does not accumulate. See [V12 assets](../../resources/styles/builtin/assets/world/README.md) and the [style contract](../../resources/styles/builtin/STYLE.md).

The calculations reach the HUD and the Weather Applet: the weather text's hover tooltip prints Sun and Moon altitude and bearing together with the lunar phase, solar altitude drives day, twilight and night text styling, and the Weather Applet stage reads the same environment state. Explicit day/night scene previews change scenery lighting only; they do not falsify the astronomical positions or phase.

This remains a stylized world: terrain and weather art are illustrative, and the model ignores the user's buildings, topographic horizon, air pollution, exact pressure and observer elevation. It is not an observatory or an AR alignment instrument.

### Verification

- `scripts/celestial-art-check.ts` covers visible-sky placement across viewport sizes, horizon/close-up hiding, lunar phases and procedural surface variation.
- Day/night/weather rendering, camera replay and hover have no automated check since the RC was held to 20 minutes (owner request 2026-10-05); `scripts/village-lighting-check.ts` keeps the lighting calculations.
- Weather interaction regressions cover location denial, offline, stale and cleared location.
- `scripts/weather-location-check.ts` covers city selection through the shared gateway, HUD updates, persistence/restart, offline/save errors, invalid choices, cancellation, cleared-location races and practice isolation with fixture weather.

<a id="river-fishing"></a>
## River fishing (removed)

River fishing (a fish jumping on the river that opened a fishing game) was removed at the owner's request on 2026-10-04. The river keeps only its drifting highlights (`ui/world/village/village-ambience.ts`); nothing on it can be tapped.

<a id="background-music"></a>
## Background music and ambience

### Direction: free radio plus CC0 field recordings

Worldlet does not run its own composition or audio generation service. Fox turns a request into a radio genre or an ambience selection; the host player handles playback, volume and ducking under voice. Music, ambience and podcasts share exclusive playback: starting one pauses the others and cancels their pending loads. Paused local playheads and podcast bookmarks are retained; prior sources do not automatically restart. There is no paid generation, music subscription, API key or automatic account connection.

| Request | Behavior |
| --- | --- |
| Play some music | First time: the Chillout internet radio genre; afterwards the current selection resumes |
| Rock / jazz / classical / electronic | Search Radio Browser for the genre and connect one playable station |
| Faster / slower / focus music | Hermes maps the wording to a genre tag (for example dance, ambient, lo-fi); no exact BPM is promised |
| Another station | Pick a different station in the current genre |
| Pause / resume / stop music | Control the current channel; a resumed stream returns to live, not to the paused position |
| Ocean, rain or forest sounds | Loop the bundled CC0 field recording offline |
| Turn off background sound | Ambience only; music continues |
| Play offline music | The bundled original tracks, no radio access |
| Quieter / music at 20% | Changes the music volume, not the system volume |

Requests are understood by Hermes and executed through `control_background_music`, using the same exclusive playback policy as the HUD. Volume controls do not switch the selected source. The radio directory receives one short English genre tag, never chat history or private sources. Station content is decided by the broadcaster and may include ads or hosts; Worldlet cannot pick the next song, promise no vocals or a particular artist, and a search hit is not a successful playback.

The selected Agent forwards playback through the cancellable host audio bridge, including before private-context consent. Playback failures remain errors. Run `node scripts/fox-audio-capability-check.ts` for audio dispatch coverage.

### Host playback and honest state

Playback runs in audio elements of the host's media surface, a hidden Chromium view that outlives World reloads and the desktop Companion (`platform/electron/src/modules/media/surface.ts`, `audio.ts`).

- `RadioMusic` with `RadioDirectory` (`audio.ts`, `directory.ts`; Radio Browser directory): uses the directory's dynamic DNS entry with mirror discovery and an identifiable User-Agent; searches by tag, filters unavailable stations and unsupported streams, and only selects HTTPS URLs. After playback really starts it reports one station click as the directory requires; no chat content is reported. Up to three candidates are tried in bounded fashion. States are loading / playing / buffering / paused / stopped / error; the start receipt waits until the player is actually playing and the media is ready.
- `BackgroundMusic`: plays the bundled CC0 ambience and the original offline tracks.
- `WorldAudio`: unifies both music sources and the separate ambience channel. Switching region, Applet or Fox bubble does not interrupt. Recording and live voice each hold a ducking state; playback is restored only when both end, and a paused channel is not resumed by the end of speech.
- Pause, stop and a new selection invalidate older connection requests. Fox cancels by request ID, cancelling only the pending radio connection, never a newer request.
- Music is off by default and the app never contacts the directory or an audio server at startup; access happens only when music is chosen. Audio is never stored as a source, Matter or private content.
- Ambience defaults to 18%, with Village Air selected but stopped. Every launch stays silent, including profiles that previously enabled ambience; only an explicit user playback action starts it. Volume persists across launches. Music defaults to 24% and remembers only its volume; it does not auto-play after restart.
- Under the weather text, a single mute/resume control wears the icon and name of the sound that is currently heard: an ambience glyph for Village Air and other field recordings, a note for music or radio, and a microphone for a podcast. Village Air is the default selection, not automatic playback. Fox selects sounds; clicking the HUD pauses all sounding channels and restores that same mix on the next click, without selecting a track or opening a chooser. Muted sound keeps its name and fades; no Sound off/on text is shown. A station that is still connecting reads Connecting and pulses rather than beating, so nothing in the HUD claims playback before the player is playing. The accessible name carries the same state; failures show a readable error rather than pretending to play.
- `scripts/world-audio-check.ts` covers the current-sound icon and label, muting and restoring the same two-channel mix without a chooser, connecting state, HUD halo and stationary layout.
- Ambience, offline music and radio fade in over about 0.7 s (`SurfaceAudio.fade` in `audio.ts`) and fade out to silence before pausing or releasing the player. Toggle state updates immediately; volume changes and ducking recovery do not interrupt an in-progress fade-out; a quick reverse toggle cancels the old transition and continues from the current volume. Radio fades in only after it is actually playable.

### Sources and licenses

| Source | Origin | Use |
| --- | --- | --- |
| Radio stations | [Radio Browser API](https://api.radio-browser.info/), [docs](https://docs.radio-browser.info/) | Free directory, direct connection to the broadcaster's stream; nothing is downloaded, resold or redistributed. A free directory is not a license to the broadcast content |
| Ocean Shore | [pulswelle, Waves at Baltic Sea shore.wav](https://freesound.org/people/pulswelle/sounds/339517/) | CC0, trimmed, leveled, looped and bundled |
| Soft Rain | [Q.K., Rain_01.wav](https://freesound.org/people/Q.K./sounds/56306/) | CC0, same processing |
| Forest Air | [kyles, forest ambience constant breeze.flac](https://freesound.org/people/kyles/sounds/637559/) | CC0, same processing |
| Village Air and the offline music | Original procedural synthesis | Kept as offline choices; not expanded as an open-ended genre catalog |

Author, source, license link, processing and SHA-256 for the CC0 files are in [`resources/audio/CC0-SOURCES.json`](../../resources/audio/CC0-SOURCES.json). The authoring tool `scripts/import-cc0-ambience.py` downloads the page's public HQ preview within bounds, trims, crossfades, normalizes and encodes. The app never calls the Freesound API, downloads recordings or needs a Freesound account. Mathematical white noise and a coastal recording are different things; the UI does not claim a measured or medical sound source.

### Verification

- `scripts/world-audio-check.ts` (HUD sound control) and `scripts/fox-audio-capability-check.ts` (Agent dispatch) cover the shared side.
- The retired Mac host's in-app checks are not yet ported to Electron: offline assets decoding without silence or clipping, play/pause/resume/stop, switching, ducking, fades and reverse transitions (`--music-check`); no network at startup, connection states, receipts, cancellation and stale results (`--radio-check`); and the network-dependent live check that playback progress advances on a real station (`--radio-live-check`; checking only ready or playing would miss a stalled stream). The Electron audio port has no recorded playback check yet.

Stations change over time; one successful run does not guarantee long-term availability. Tone and long-session comfort still need listening on real speakers or headphones.

### Podcast identity and episode selection

- Apple search ordering is not identity. An exact normalized title or a title with a host suffix is a candidate; adding a publisher can disambiguate. Multiple candidates make Fox ask which one, with canonical `apple:collectionId` choices. A user-selected ID uses Apple's lookup endpoint and verifies the returned ID. Unknown names do not silently become topic recommendations.
- Directory and RSS requests bypass the local HTTP cache and request `Cache-Control: no-cache` revalidation from intermediaries. This checks the latest public feed available from the publisher; it cannot promise a publisher has already released an episode or updated its CDN. No cached or different episode substitutes for a failed refresh.
- The directory reads only that show's RSS, up to 12 MB. All-In's public feed was 4,097,090 bytes at verification, exceeding the old 4 MB limit; previously this was swallowed and playback could fall through to a different show.
- Parse complete RSS items, including titles after enclosures and CDATA; sort by publication date, with numeric time zones. Ignore future, undated and explicit trailer entries. Malformed feeds fail closed. If there is no valid dated episode, do not claim to know the latest.
- `operation: podcast, episode: latest` is the default and always refreshes the directory/feed, bypassing old bookmarks and the already-playing shortcut. `episode: resume` keeps a verified unfinished episode; generic Resume preserves the current podcast channel. Legacy bookmarks without a verified podcast identity are not automatically resumed.
- Normal playback attempts only the selected episode. Failure never advances silently. Explicit Next selects another dated episode from the same show. The receipt carries canonical show ID, show/publisher/episode title and publication timestamp; only real playback yields `playing`.

Verification: the retired Mac host's `--radio-check` covered All-In versus LDS Living ambiguity, publisher/host qualification, unrelated search results, unsorted RSS, CDATA, future/trailer/undated exclusion, malformed feeds and latest bypassing a saved episode, and a live read of All-In's Apple entry and full feed passed. Neither is ported to Electron yet, so the Electron directory (`modules/media/directory.ts`, `audio.ts`) has no recorded check; end-to-end audible content recognition was never performed.

Identity reference: [All-In's Apple listing](https://podcasts.apple.com/ca/podcast/all-in-with-chamath-jason-sacks-friedberg/id1502871393) and the distinct [LDS Living All In listing](https://podcasts.apple.com/us/podcast/all-in/id1439975046).

<a id="render-performance"></a>
## Render performance

**Overall smoothness comes first, especially first entry, exit and continuous interaction; a high frame rate is not a goal by itself.**

### Principles and configuration

The world is one PixiJS WebGL renderer (`ui/world/village/pixi-world.ts`) drawing fixed-direction image layers: V12 day/night landscape plates and 26 device sprites, most of them repainted as `resources/styles/builtin/assets/applets/<key>/peek-logo-v3.png` and resolved by `deviceSource`. `scripts/build-world-assets.ts` writes each image once as a content-named file under `assets/world/` and the payload script names them, so the app reads only its own bundle. Inlining them as data URIs made a 130 MB script the World parsed before it could start (about 1 s on a cloud container) and whose strings stayed in the page's heap for good (about 40 MB of the World's JS heap); the World is same-origin with these files (`worldlet://app`, or `file://` with file access in the checks), so WebGL textures and alpha reads stay origin-clean. There is no Three.js path and no second renderer for Sample or the website demo; Sample supplies data only, and `scripts/source-layout-check.ts` fails any bundle that pulls Three.js back in.

| Item | Current approach | Reason |
| --- | --- | --- |
| Backend | `app.init({preference:['webgl']})` | WebGL is requested explicitly rather than accepting Pixi's implicit Canvas fallback, which a no-WebGL fixture exposed |
| Frame rate | Paced by [`frame-budget.ts`](frame-budget.ts): 60 while anything moves or for 1.5 s after input, 30 once settled, 15 while another window is in front, 5 with motion reduced; Fox's canvas follows the same rule (60 / 30 / 20). A new sky wakes the World for 0.5 s only when it visibly differs (`environmentShifted`), not on the 15 s clock tick that re-sends the same one. `scripts/world-idle-frames-check.ts` holds it | A settled world of still images gains nothing from the display cadence, and drawing every frame kept the renderer and GPU processes busy while nobody used the World |
| Resolution | `resolution: Math.min(devicePixelRatio,2)` with `autoDensity`; textures use linear filtering and generated mipmaps | Retina stays sharp; mipmaps help minification, never magnification |
| Motion | Ambient time — chimney smoke, the Airbnb balloon, the DoorDash study ride — advances only while `prefers-reduced-motion` is off, and camera moves snap instead of easing when it is on | Reduced motion shows a still, readable world, not a slower animation |
| Zoom | The theme scene adapter selects overview-only (Village) or fitted Area framing (a zooming theme, 1.25–3×) from `ui/world/village/village-camera.ts`; reduced motion snaps, otherwise the camera eases; the canvas swallows wheel events | No view exceeds the level its art was authored for; enlarging a painting does not create detail |
| Selection | The selected device moves into a separate foreground layer, at most 300 px or 23 % of the window wide, and one blur filter covers the world behind it | One filter pass over layers already drawn, instead of a second scene |
| Surround | A blurred sky-to-field gradient fills windows taller or wider than the authored image, with `eventMode='none'` | Presentation only: no invented terrain and no extra hit targets |
| Hit testing | Device hit areas read the sprite's own alpha, inside the painted box `scripts/village-art.ts` measures (`box` in the package's `assets/art.json`); the pixels are read back the first time the pointer enters that box. Region hit areas are rectangles from `ui/world/village/village-sites.ts` | A click follows the drawn object without a per-frame geometry pass, and launch no longer reads back and scans every device image |
| Filters per frame | Device shadows are blurred once into a cached texture and re-baked only when their on-screen scale changes; the day plate's scenery tone and day/night grade are one composed color matrix (`colorMatrixProduct`); landmark art has its scenery tone baked into the texture. `scripts/world-idle-frames-check.ts` holds a settled overview to 30 draw calls and 6 render-target switches a frame | Re-blurring 21 shadows every frame was 88 % of an idle World's draw calls (189 draws, 162 target switches a frame before; about 10 and 2 after) |

### Budgets

UI rendering and DOM commits stay on the main thread. Complete host snapshots use
`ui/shell/snapshot-inbox.ts`: pending snapshots are replaceable, consumption is
serialized, and idle scheduling gives input/paint an opportunity before background
refresh (250 ms timeout, timer fallback). In-flight projections check their
generation before committing; callers of superseded snapshots await the replacement.
Commands, approvals, speech and incremental events do not use this lossy queue.

`world-projection.ts` runs source/Core projection and the data-only World/Applet
presentation mapping in a dedicated Worker. The build embeds the exact bundled
program; only the trusted page permits blob workers, which inherit its no-network
CSP and have no Host bridge or DOM. Worker failure is explicit, with no silent
main-thread fallback. Results are detached data, so refresh transfers ownership
instead of deep-copying the whole world again. Sample generation remains separate.

The content store compares desired JSON records against live records and preserves
unchanged page objects. Changed pages remain detached; authoritative refresh resets
optimistic mutations while keeping local edits/trash/undo. Membership/path indexes
and UI commits still run on the main thread; this is not a fully incremental or
preemptive renderer. Worker message cloning and large UI commits remain measurable
costs, not covered by the idle callback's timeout.

Attention keeps unchanged rows and resolves actions against the latest model.
Container size, text scale and font completion invalidate fitting; a hidden panel
is fitted again when shown. Fox replies and artifacts are never split into pages.
An artifact measures once per version it tries (at most its blocks plus three) when it
opens or its room changes, never while it is only shown. Neither change reduces rendering resolution or visual effects.
Focused checks: `scripts/snapshot-inbox-check.ts`, `scripts/snapshot-refresh-check.ts`,
`scripts/attention-idle-check.ts` and `scripts/artifact-fit-check.ts`
(run `npm run build:native-ui` first for full World fixtures). Operation-count checks are not a
60-fps certification. Target 16.7 ms per frame and investigate gaps above 33 ms;
report first entry, repeat entry, return and background-load cases separately.
Additional checks: `scripts/world-projection-worker-check.ts` covers worker parity,
event-loop progress, errors and cancellation; `scripts/content-store-incremental-check.ts`
covers changed-page identity and editing invariants.
`WORLDLET_REFRESH_LOAD=4000 node scripts/snapshot-refresh-check.ts` measures a fictional bulk refresh, not a
real-account workload. The retired Mac host's frame fixture also validated the
exact bundled worker under the packaged CSP; that fixture is not yet ported to
Electron. Device performance on every OS remains a separate acceptance check.

The budget that exists today is source resolution, not frame cost: an image's width must cover its maximum displayed CSS width × device pixel ratio for the view it serves ([2.5D production contract](../../resources/styles/builtin/PRODUCTION.md#resolution-and-zoom)). Every device image carries an alpha channel and at least 300 pixels of source width, and the region tiles plus the landscape reconstruct the base image pixel for pixel ([V6 asset record](../../resources/styles/builtin/assets/world/README.md)).

No whole-product GPU time, memory or energy certification is established here, and none has been measured on the Electron host. Performance measurement is still listed as remaining acceptance work in the V6 asset record, and the numbers that used to stand on this page were measured on the removed Three.js/WebGPU renderer, so they went with it. Idle scheduling lowers the redraw rate of a settled World (see Frame rate above); stopping the ticker entirely is not possible while water, smoke and sky animate. Higher-resolution close views are open work.

### Startup feedback

The shared boot surface and milestones are defined in [onboarding](../onboarding/README.md).
Do not maintain another loader design here. Startup timings are numeric diagnostic
facts, not fabricated percentages or proof that content is ready.

### Verification

- In-app frame measurement (the retired Mac host's `--world-frame-check`) is not yet
  ported to Electron. Its Mac mini M4 runs found that idle long frames came from
  presenting new WebGL frames through Chromium's compositor under GPU load, not from
  scene filters or script, and that stopping the ticker at idle removed them; a
  first-row post-load stall (150–306 ms) was renderer main-thread work independent
  of World filters. Re-measure on Electron before relying on these conclusions.
- `npm run build:native-ui` before any measurement or visual check.
- `scripts/world-scene-check.ts` asserts the `pixi-webgl` renderer and the `layered-2.5d` representation, that every region opens and settles, and that each Applet keeps a place of its own; `scripts/applet-focus-check.ts` waits on the same renderer before measuring the foreground width.
- `scripts/village-camera-check.ts` covers the HUD-safe overview, bounded region edges and an explicit sprite slot for every installed Applet.

### Desktop World presentation

The World page is an ordinary on-screen `WebContentsView` that fills the World
window's content area (`platform/electron/src/world/window.ts`), with website views
as siblings above it. Chromium composites them directly: there is no offscreen
rendering, shared-texture copy or host-side presentation path, so the retired CEF
host's IOSurface/Metal path and its diagnostics no longer apply. The World view runs
with background throttling off. Electron frame pacing, GPU cost and energy are not
yet measured on Mac or Windows.

### Applet transition rendering budget

The World remains capped at 60 rendered frames per second. Entry/exit now clips
background blur to the viewport and uses half-resolution blur buffers; foreground
devices and HTML reading surfaces keep their original resolution. Focus plates
cache only their static blurred edges, and rebuild their rectangular mask only on
resize. Transition blur shaders warm during scene setup, and hovering a device
starts its Focus-plate load. Fully opaque daylight skips the covered night plate.
HTML device lamps batch geometry reads before style writes to avoid repeated
synchronous layout within one frame.

Transition frame times have no automated check since the RC was held to 20 minutes (owner request 2026-10-05). Earlier local runs reduced warm-entry p95 from 34 ms to 18–25 ms; cold asset preparation can still produce a long frame, and there is no all-device or cold-start locked-60-fps guarantee.

<a id="art-quality"></a>
## Art verification

Visual rules and approved references live only in the [Style Pack](../../resources/styles/builtin/STYLE.md). This document describes what checks prove, not a second art direction.

| Check | Scope |
| --- | --- |
| `npm run check:style` | Resource existence, shared lookup, token extraction baseline, supported style identity and world metadata |
| `npm run art:palette` | Coarse grass/water/sky saturation against the approved day target |
| `node scripts/world-asset-source-check.ts` | Lossless bundled live plates preserve source dimensions and decoded pixels |
| `node scripts/village-camera-check.ts` | Bounded authored framing and complete device registration |
| `node scripts/village-lighting-check.ts` | Shared lighting calculations |
| `node scripts/world-scene-check.ts` | Scene composition and routes |

Build the embedded interface before browser checks: `npm run build:native-ui`. Use focused checks for the changed behavior, not automatically the full suite. No real account is needed for art fixtures.

The live renderer uses registered day/night plates, shared sprite grading and separate environment effects. Moving cast shadows, full foreground masks and arbitrary isolated architecture are not implied. No measured frame-time/energy claim follows from an image; see [render performance](ENVIRONMENT.md#render-performance).

Human review still checks style, scale, actual support, useful negative space, night readability and original-content clarity. Generated images cannot certify themselves through a style ID. Never weaken a test just to promote a draft. Private screenshots stay in ignored output, not Git.

## World transition performance

Keep source resolution, Retina density, shadows and transitions unchanged.
Target 16.7ms frame cadence; prioritize gaps over 33ms. RAF cadence includes
browser/GPU scheduling and is not an isolated GPU execution timer. WebKit timer
quantization means a 17ms sample alone is not evidence of a missed refresh.

### Measurement history

The retired Mac CEF host measured transitions in-app (`--world-frame-check`, a
visible 1440×1000 World on a disposable sample store, 3 s per transition, Long
Animation Frame attribution). Its 2026-09-28 runs found p95 16.7–16.8 ms on a DPR 2
Mac with first Mail entry up to 83 ms (about 45 ms of it forced layout), and on an
Apple M4 at DPR 1 every row, idle included, at p95 66.7–133 ms with host
presentation under 5 ms per frame: the idle cost was WebGL scene plus Chromium
compositor GPU work, not transitions or host presentation. Details are in Git
history. These are not Electron results; the frame check is not yet ported, and the
first row of any new measurement should again sample the unchanged World so
transition rows can be compared against idle.

Windows host (2026-09-28, main@f720ad68 plus the D3D11 selection, Playwright
headless Chromium, ANGLE D3D11 on NVIDIA GeForce RTX 4070, driver 32.0.16.1656;
1920 × 1080 viewport at DPR 2; physical display 2560 × 1440 at 59Hz; three runs,
1.8s rows): idle, every return and warm YouTube entry/exit had p95 17ms, worst
17–33ms and 0 frames >34ms. Long frames appeared only on first entries: cold
YouTube 117ms (1–2 frames >34ms), Mail 67–83ms (1–2) and Notes 33ms (0). Unlike
the M4 host, idle does not reproduce the transition long frames, so this GPU has
no steady per-frame scene cost at this size; first-entry preparation remains the
Windows cost. This is headless Chromium, not the desktop host, display
compositor or live accounts; no desktop-host frame check exists on Windows yet.

Historical **WebKit**, not current-engine, baseline, DPR 2 (one run):

| Transition | p95 ms | max ms | gaps >33ms |
| --- | ---: | ---: | ---: |
| Mail first entry | 20 | 147 | 4 |
| Return | 18 | 27 | 0 |
| Mail repeat entry | 18 | 53 | 1 |
| Return | 18 | 29 | 0 |
| Weather first entry | 18 | 38 | 1 |
| Return | 18 | 30 | 0 |

These numbers establish a baseline, not a 60fps pass or causal attribution.
Next: separate decode/upload, CPU scene work and host background scans. Mail
and Weather do not use the lazy website Focus backdrop path; warming those
backdrops alone cannot establish an improvement to this measured Mail path.
Live background-mail load, repeated-run distributions and main Dev acceptance
remain outstanding. No rendering-quality reduction is authorized.

### First optimization pass

- Attention fitting preserves the existing row-removal priority and exact DOM
  result, using binary search rather than up to 120 read/remove/layout cycles.
  `node scripts/attention-fit-check.ts`: 32 height/count/empty-group cases match
  the former algorithm exactly; scroll-height reads fall from 980 to 136.
- The retired Mac host's already-busy Attention Center wake checked its busy flag
  before IO (a fictional SQLite trace measured 10 → 0 record scans while busy).
  Whether the Electron Attention Center (`platform/electron/src/modules/attention/center.ts`)
  keeps that saving is not measured. Core admission/retry policy and the one-second
  busy wait are unchanged.
- Experimental batched texture uploads before world readiness did not improve
  the Mail transitions (first max 99.9ms, repeat 50ms in one run). That experiment
  and an ineffective viewport-cache experiment were removed. Existing image
  decoding, texture quality, shadows and transitions remain unchanged.
- After the retained HUD change, the retired Mac host's Chromium sample maxima were Mail first
  83.3ms, repeat 50.1ms, Notes first 50ms, returns 33.3ms; p95 16.7–16.8ms.
  **No end-to-end frame improvement or stable 60fps pass is established.** Further
  tracing of the transition's frame callback/forced layout is still required.

Validation limits: the full Attention fixture already failed before the busy-wake
change at “Successful Center pass did not acknowledge delivery.” The focused wake
check passes. `attention-column-check.ts` fails its compact date-column assertion;
it loads unchanged CSS and does not import the changed fitting helper. Typecheck
passes. Do not treat either pre-existing coverage gap as a performance acceptance.
