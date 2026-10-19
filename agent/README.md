# Agent

Who does the work: Fox, Tasks, Asks, Agents and the Gate, one of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know). Platform-independent product behavior. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- Companion: companion
- Attention: attention
- Tasks: tasks (work that runs without the person)
- Agents & Gate: agents, tools (the Agents connected to the World, World tools, Grants, approvals and audit)
- Windows: windows (the World in a web browser and on the phone)
- Base: onboarding, diagnostics, distribution

Agent imports [Context](../context/README.md) and `contracts/`, nothing else ([layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers)).

[`index.ts`](index.ts) is the serialized entry of the pure business API; it calls both Agent and Context. The desktop host runs it in-process through the JSON `invoke(operation, json)` entry (`platform/electron/src/core.ts`); `scripts/build-native-ui.ts` also bundles it as `shared-core.js`, which Python and fixture checks load (for example `scripts/hermes-frame-validator.ts`). Import each component through `agent/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
