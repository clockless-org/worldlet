# 01 · UI

See the [World and Applet sizing standard](DESIGN-STANDARDS.md): 1920 × 1080 reference, 96px overview devices and 120px shelf artwork.

Shared rendering and interaction. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- World: world (the places and the HUD)
- Applets: applets (each Applet's screen beside its real website, games, practice)
- Companion: companion (the companion's face, conversation and voice)
- Attention: attention (what needs the person now, the artifact card and the Journal)
- Frame: frame (start, setup, settings, navigation)
- Style: style (shared controls, tokens and themes)
- Tasks shows in the companion and on Applets; the browser page that hosts this UI is Platform's `platform/web/page/`

This is UI, the top of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know).

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

`index.ts` composes the native application. `frame/` contains application-wide lifecycle, setup, settings and page composition. Applet registrations live in `context/applets/`; visual implementations live here.
