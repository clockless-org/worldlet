# Worldlet built-in Style Pack

**cozy-miniature@1.0.0** is the only supported style; it is the style of the Village [Theme Pack](../../themes/README.md), the only theme. World, Applets, Fox and application HUD use its shared inventory/tokens. There is no theme picker.

Start with [STYLE.md](STYLE.md): the currently used World, Applet and Fox images are the visual authority, not historical concepts or a new generation. Day/night references resolve directly to the live 4K pair.

The [HUD material family](assets/hud/README.md) is shared by world controls,
Companion, panels and the desktop pet. It uses generated paper material and
clean interior windows into the button atlas. The [design masters](drafts/hud-v1/README.md)
retain their provenance; their raw alpha gutters are not displayed in production.

The pack's descriptions live in the Village theme package with the rest of the Village's: [`style.json`](../../../ui/theme-packages/village/style.json) (stable ID, references and explicit resource inventory) and [`tokens.json`](../../../ui/theme-packages/village/tokens.json) (World colors, HUD/dialogue/reading/typography/motion values). This folder keeps the painted sources they name.

```text
builtin/
  STYLE.md           One style/lighting/production contract
  references/        Historical concepts, retained only for provenance
  assets/
    world/           Registered live terrain and shared device sprites
    ui/applets/         Applet Peek/Open/Focus art and parts
    companion/       Fox portraits, expressions, animations and rig
    brand/           Product mark master and generated exports
```

`../../../ui/components/style.ts` freezes the pack and resolves an Applet's presentation. Native/web asset builders use the same inventory; native additionally loads Open, Focus and companion art. Missing assets fail explicitly rather than guessing filenames. Brand helpers/native icon exporters read the pack's existing mark master.

World-specific painted plates belong in `resources/worlds/<id>/`; their description (style dependency, coordinates and provenance) is the theme package's `world.json`. They are not new styles. The live inventory explicitly selects the Village 1.7 day/night plates (`day-six-regions-sunburst-4k.png` and `night-six-regions-sunburst-4k.png`). Applet, Fox and HUD resources are unchanged. The manifest references the World Pack's canonical images without duplicating them.

Appearance assets are now physically co-located here. Functional Applet logic, renderer algorithms, component behavior, permissions and user records remain outside the pack. Existing component CSS and procedural lighting algorithms have not been turned into arbitrary data-driven themes.

Original third-party provider logos remain with their Applet identity/source records, not as recolorable theme artwork. The pack references the YouTube source logo explicitly; the product's own mark master lives here under `assets/brand/`.

Run `npm run check:style`, `npm run check:types` and relevant build/render checks when changing consumed resources. Palette checks are coarse diagnostics; always compare against the targets in context.
