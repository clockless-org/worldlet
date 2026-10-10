# 01 · UI

See the [World and Applet sizing standard](DESIGN-STANDARDS.md): 1920 × 1080 reference, 96px overview devices and 120px shelf artwork.

Shared rendering and interaction. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- World: world, hud, themes, theme-packages
- Applets: applets, browser, games, practice
- Companion: companion
- Attention: attention (the Attention Center, Journal and card system)
- Base: shell, components, onboarding, distribution

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

`index.ts` composes the native application. `shell/` contains application-wide lifecycle, media and page composition. Applet registrations live in `core/applets/`; visual implementations live here.
