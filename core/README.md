# 02 · Data and rules

Platform-independent product behavior. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- World: activity
- Applets: applets, browser, games
- Companion: companion
- Attention: attention
- Tasks: scheduling, ongoing (work that runs without the person)
- Artifacts & Journal: artifacts, widgets (everything work produces, kept by day)
- Base: agent, accounts, tools, phone, items, context, onboarding, diagnostics, distribution

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

`index.ts` exports the pure business API. The desktop host runs it in-process through the JSON `invoke(operation, json)` entry (`platform/electron/src/core.ts`); `scripts/build-native-ui.ts` also bundles it as `shared-core.js`, which Python and fixture checks load (for example `scripts/hermes-frame-validator.ts`). Import each component through `core/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
