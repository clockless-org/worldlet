# 02 · Data and rules

Platform-independent product behavior. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- World: activity
- Applets: applets, board, browser, games
- Companion: companion
- Attention: attention
- Tasks: tasks (work that runs without the person)
- Artifacts & Journal: artifacts (everything work produces, kept by day)
- Agents & Gate: agent, tools (the Agents connected to the World, World tools, Grants, approvals and audit)
- Context: context, items (everything the World knows; [storage and its four kinds](../context/items/STORAGE.md#four-kinds))
- Connectors: accounts (sign-in to Services, their reads and approved writes)
- Windows: phone (the World in a web browser and on the phone)
- Base: onboarding, diagnostics, distribution

Two of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know) live here, moving to their own folders: Agent (Fox, Tasks, Asks, Agents and the Gate) and Context (the Context store and its Connectors). Which folder is in which: [folders by layer](../docs/UI-CORE-PLATFORM.md#folders-by-layer).

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

The pure business API's serialized entry is [`agent/index.ts`](../agent/index.ts) (it calls both Agent and Context). The desktop host runs it in-process through the JSON `invoke(operation, json)` entry (`platform/electron/src/core.ts`); `scripts/build-native-ui.ts` also bundles it as `shared-core.js`, which Python and fixture checks load (for example `scripts/hermes-frame-validator.ts`). Import each component through `agent/<component>/index.ts` or `context/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
