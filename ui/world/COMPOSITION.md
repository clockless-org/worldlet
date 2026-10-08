# Sprite world: composition and interaction

Mac, Sample and website share the fixed-view PixiJS 2.5D renderer. Sample changes data, not engine or layout. Visual authority lives only in the [built-in Style Pack](../../resources/styles/builtin/STYLE.md).

## Layer ownership

| Layer | Current representation |
| --- | --- |
| Terrain, architecture and static clouds | Registered painted world plates |
| Applet devices | Independently placed RGBA sprites with ground anchors and alpha hit areas |
| Fox HUD | Shared portrait/rig resources, separate from terrain |
| Sun, moon, stars, weather, water and smoke | Runtime effects following shared environment state |
| Text, original records, controls and embedded websites | Accessible DOM/native content, not painted pixels |

Building/tree cutouts, general foreground occlusion, moving cast shadows and walking Fox remain incomplete. Y sorting alone cannot solve walls and overhangs.

## Placement and views

The live `ui/world/world-layout.ts` owns authored region bounds and slots; `village-sites.ts` and `applet-sprites.ts` derive their runtime data. World packages independently own their normalized full-image bounds, named empty slots and HUD-safe areas. Do not apply the live map's registration transform to another package.

Applet identity and user placement survive reconnects. Capacity must follow actual supported ground, not a rectangle over water or a roof. The existing catalog can be added/removed/repositioned through Fox's panel; general installation of arbitrary new Applets is not implemented.

World covers the viewport independently of Attention Center. Theme scene adapters choose region framing: a theme with `motion.transitions.area: zoom` fits a selected Area and its independent Applets (up to 3×); Village retains the overview. HUD size stays fixed and Back returns to the overview. Native Open/Focus and website Focus follow [Applet presentation](../components/INTERACTION.md#applet-presentation); the style pack does not alter navigation or permissions. No arbitrary camera rotation or free zoom.

Alpha-tested devices have silhouette feedback; transparent padding does not steal clicks. Region feedback belongs to its label, never a tinted rectangular tile. Hover/keyboard focus must remain readable. Click exposed ground to return; drags are not clicks.

## Verification

`village-camera-check.ts` checks bounds/registration; `world-scene-check.ts` covers device composition and navigation. See [art checks](ENVIRONMENT.md#art-quality). Passing fixtures does not certify aesthetic quality, performance or real-account behavior.
