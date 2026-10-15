# Applet scenes

The shared renderer that draws an Applet inside its theme scene. Three parts, each owning one thing:

| Part | Owns | Where |
| --- | --- | --- |
| Theme | The painting, the regions measured on it (`primary`, `secondary`, each `paper`, `board` or `screen`), the companion's quiet space, and how each material looks: ink, muted text, lines, accent, buttons, fill and fonts | `presentation.json` `appletScenes` and `sceneMaterials` ([Theme contract](../../../resources/themes/CONTRACT.md#registered-backgrounds-and-live-html)) |
| Applet | Its records and actions: what is listed, what a button does | `ui/applets/<key>/` |
| Renderer | Placing the painting at one uniform scale, one live element per region, the material as CSS variables, and the shared controls | `applet-scene.ts`, `applet-scene.css` |

`mountAppletScene(host, key)` fills `host` with the active theme's scene for `key` and returns its regions. The Applet renders into `scene.primary.element` (and any secondary region) with the shared controls: `.scene-head`, `.scene-title`, `.scene-meta`, `.scene-list`, `.scene-item`, `.scene-button` (`data-kind="primary"` for the accent one) and `.scene-empty`. Its own stylesheet arranges content and reads `--scene-*` variables; it never names a colour, a font or a coordinate. A theme without a painting for `key` gets one plain sheet of paper in the same place, so the Applet needs no second code path. When the painted primary region would be narrower than 420 px (a narrow window), the renderer lays a readable sheet of the material over the painting instead and leaves the shell's readers in their usual narrow place, as the contract allows.

Lists keep their natural height inside the scrolling region. Do not let a flex parent shrink the grid: rows can retain their control height while their text spills into the next row or the source-scope footer. Verify long two-line lists and the last item through scrolling.

With `shell` given, the shell element receives the primary region and companion rectangles (`--applet-scene-primary-left`, `-top`, `-width`, `-height`, and the same for `companion`) and the primary material, so a shell surface outside the scene, such as an Applet's reader, can sit on the same painted region. `source` replaces the theme's scene with given package files, as the scene check does.

Every scene Applet the active theme paints a scene for, its own or its family's, draws on the renderer (`ui/world/pixi-stage.ts`), so switching themes needs no code change: Mail, its letters and its reader; Notes and Reminders, whose notes and tasks lie on the painted notebook and list board and open in the shared reader; Calendar, whose day, week and month views (`ui/applets/home-open.ts`) lie on the painted page while its secondary regions show today's date, and whose events open in the shared reader. Web Applets (`ui/browser/browser-device.ts`) and games (`ui/shell/notion-world.ts`) mount their scene behind the content panel with `createPanelScene` (`panel-scene.ts`), and the panel takes its primary region: the native page follows it, and a game's board shrinks to the board region. An Applet the theme did not paint borrows its family's scene (`scene-family.ts`: Spotify the music scene, Google Maps the maps scene, web games the game booth); a website in no family takes the Browser scene. The host keeps that table, so a theme only paints pictures. Meetings draws its calls in the primary region. Messages, Voice Memos and native Applets without an Open view of their own list their items with `renderSceneList` (`scene-list.ts`). Branded website Applets—including GitHub, Notion, Stripe, Todoist and Google Drive—open the original site directly; their existing source readers remain available to Fox and Attention. A declared web route takes precedence over legacy named readers.

For registered websites, optional `registration.webEdge` supplies a narrow irregular foreground. `scene.paperEdge(rect)` projects original background pixels relative to the actual browser viewport. The native host paints this in a transparent, click-through child window above the external page; compact layouts, task picture in picture and website fullscreen omit it. This preserves painted paper edges without injecting CSS into the website or changing its layout.

`registration.webFrame` can replace the procedural narrow overlap with a complete extracted frame. Its transparent mask has normalized source and target bounds; the shared canvas combines its alpha with the original painting's colours. The native foreground spans the scene, while the website remains a rectangular usable surface beneath the inner paper rim. Framed websites have no extra CSS padding, corner rounding or inset shadow: register the page up to the extracted aperture so the foreground overlaps the seam rather than exposing a second empty mat. The theme asset resolver publishes the mask alongside the background.

This is the standard composition for framed artwork: background → live content → extracted foreground. Deliver the mask with the map, following the [theme contract](../../../resources/themes/CONTRACT.md#background-live-content-and-foreground-frame) and [production workflow](../../../resources/styles/builtin/references/registered-scenes/README.md#frame-production-workflow). `mountAppletScene` automatically mounts the shared `mountSceneFrame` canvas above local HTML and shell readers. It uses the same original-pixel alpha composition as the isolated native browser overlay. Both are click-through, track the registered image placement and disappear in compact layouts. Existing unframed scenes continue using their current presentation.

Scene-to-shell placement uses layout coordinates, independent of the entrance zoom. Local Applet foregrounds animate with their painting, so a resize or layout during entry cannot leave a displaced rim or companion lane.

On desktop, a registered frame also aligns Fox and its reply to the theme's companion rectangle. The Applet shelf uses the resulting lane boundary, so the painting, webpage and companion do not independently reserve conflicting widths. Reply cards shrink within that lane; narrow-window and compact fallback layouts keep the shell's existing behavior.

Desktop layout target: live content should use about **70% of the Applet viewport width and 80% of its height**, measured after navigation, padding and frame insets. The remaining right-hand space should actually accommodate Fox and its reply, with no redundant reserved lane between them and the Applet. Verify the full composition with the companion visible; retain the readable narrow-window fallback. See the [theme design guidance](../../../resources/themes/CONTRACT.md#registered-backgrounds-and-live-html).

Weather mounts the same measured panel scene as games. Its shared `createWeatherPanel` shows current conditions, seven selectable day cards and persistent details in board mode; unpainted panels retain the list/detail layout. The sample world supplies explicitly illustrative forecast data; personal weather continues to use the environment controller for location, refresh and stale/error states. Weather illustrations are optional static WMO-code pictures from `presentation.weatherIcons`; condition labels and values remain host-owned.

Reminders can bind five measured regions: the primary task list and secondary `navigation`, `details`, `heading` and `status` surfaces. Categories, search, list filters, completion status, selection and explicit original-record routing remain shared host behavior. Without all four visible secondary regions it uses the single-sheet board. Distributed boards with navigation and details use a 280 px primary-width fallback threshold; other scenes retain 420 px. The stage rerenders on layout-mode changes and disconnects its observer on disposal. Reminder view state and focused controls survive record refreshes. No checkbox writes to the source; adding a reminder invokes the existing Fox preparation callback.

A painted scene with a companion clearance at least 360 px wide, under 100 px high and below its primary paper uses the host’s compact composer strip. Geometry is cleared on scene disposal or compact fallback. The strip folds only local introductory copy while idle; input focus, real replies, notices and actions retain the real chat surface.

A measured `quad` on a region maps its HTML to a convex paper plane through `scene-plane.ts`. The background and bounding region retain the same contain scale; CSS inverse-maps pointer coordinates. Compact fallback uses an ordinary rectangle. Shared Mail can bind `navigation`, `letters`, `heading`, `actions` and `status` secondary regions while its primary contains the selected original, with the same data and callbacks as its single-sheet view. Switching letters turns the outgoing HTML page, marks its controls inert, removes duplicate IDs and respects reduced motion.

Calendar can bind `heading`, `toolbar`, `details` and `status` secondary regions. Its book layout retains seven accessible days with horizontal scrolling and a persistent event inspector; date modes, local writes and synced-original routing stay host-owned. `pointer-plane.ts` inverse-maps real browser geometry for drag input, including ancestor perspective and scrolling. A continuous event grab offset is snapped only after the pointer moves, avoiding an extra quarter-hour shift.

Notes may use `heading`, `index` and `status` secondary regions around its primary
reader. This distributed book uses the same 280 px reading threshold as a board
with separate navigation/details; the normal single-sheet threshold remains
420 px. The Applet still owns search, folders, original reading, clipboard and
Fox preparation. The regions carry no executable theme behavior.


Games can distribute their live panel across `heading`, primary board and
`controls` regions. `createGamePanel.setScene` moves the existing controls, keeps
the current board state and restores the ordinary panel when those regions are
unavailable. Its layout observer disconnects on navigation. The shell applies
the primary projection to HTML only; native web views retain rectangular bounds.
Optional `empty-cell` and `tile` sprite crops supply artwork, while `GameHost.metrics`
supplies live score values and the game's directional callbacks own movement.

Games may expose named `parts` for a subtitle, keypad, tools or legend. The shared panel moves those existing nodes to matching regions, sends reset to an optional `restart` region, and restores each part to its original parent on fallback. Rules and input handlers stay in the game. Disposal removes moved controls and stops the game clock.

For a framed page with a short bottom composer, the shelf uses the space left of the page instead of treating the composer as a side column. World navigation sits directly above the bottom composer, clear of the native page and foreground. Ordinary side-column frames keep their existing geometry.
