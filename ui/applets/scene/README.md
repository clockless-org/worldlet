# Applet scenes

The shared renderer that draws an Applet inside its theme scene. Three parts, each owning one thing:

| Part | Owns | Where |
| --- | --- | --- |
| Theme | The painting, the regions measured on it (`primary`, `secondary`, each `paper`, `board` or `screen`), the companion's quiet space, and how each material looks: ink, muted text, lines, accent, buttons, fill and fonts | `presentation.json` `appletScenes` and `sceneMaterials` ([Theme contract](../../../resources/themes/CONTRACT.md#registered-backgrounds-and-live-html)) |
| Applet | Its records and actions: what is listed, what a button does | `ui/applets/<key>/` |
| Renderer | Placing the painting at one uniform scale, one live element per region, the material as CSS variables, and the shared controls | `applet-scene.ts`, `applet-scene.css` |

`mountAppletScene(host, key)` fills `host` with the active theme's scene for `key` and returns its regions. The Applet renders into `scene.primary.element` (and any secondary region) with the shared controls: `.scene-head`, `.scene-title`, `.scene-meta`, `.scene-list`, `.scene-item`, `.scene-button` (`data-kind="primary"` for the accent one) and `.scene-empty`. Its own stylesheet arranges content and reads `--scene-*` variables; it never names a colour, a font or a coordinate. A theme without a painting for `key` gets one plain sheet of paper in the same place, so the Applet needs no second code path. When the painted primary region would be narrower than 420 px (a narrow window), the renderer lays a readable sheet of the material over the painting instead and leaves the shell's readers in their usual narrow place, as the contract allows.

With `shell` given, the shell element receives the primary region and companion rectangles (`--applet-scene-primary-left`, `-top`, `-width`, `-height`, and the same for `companion`) and the primary material, so a shell surface outside the scene, such as an Applet's reader, can sit on the same painted region. `source` replaces the theme's scene with given package files, as the scene check does.

Applets on the renderer (`ui/world/pixi-stage.ts` `SCENE_APPLETS`): Mail, its letters and its reader; Notes, whose notes lie on the painted notebook and open in the shared reader; Calendar, whose day, week and month views (`ui/applets/home-open.ts`) lie on the painted page while its secondary regions show today's date, and whose events open in the shared reader. The rest follow one Applet at a time.
