# 02 · Data and rules

Platform-independent product behavior. Components: items, companion, context, scheduling, applets, attention, tools, browser, onboarding, agent, games, widgets, ongoing, artifacts.

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

`index.ts` exports the pure business API. The desktop host runs it in-process through the JSON `invoke(operation, json)` entry (`platform/electron/src/core.ts`); `scripts/build-native-ui.ts` also bundles it as `shared-core.js`, which Python and fixture checks load (for example `scripts/hermes-frame-validator.ts`). Import each component through `core/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
