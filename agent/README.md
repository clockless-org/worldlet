# Agent

Who does the work: the companion, Tasks, Applets, Attention and the Gate, one of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know). Platform-independent product behavior. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- Companion: companion (turns through the person's own Agent, memory, setup)
- Tasks: tasks (work that runs without the person: routines, checks, drafts)
- Applets: applets (running Applets and driving the browser for them)
- Attention: attention (deciding and ranking what needs the person)
- Gate: gate (every Agent, its Grants, World tools, approvals and audit; local and remote MCP)
- App rules: base (what the app reports, update channels)

Agent imports [Context](../context/README.md) and `contracts/`, nothing else ([layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers)).

[`index.ts`](index.ts) is the serialized entry of the pure business API; it calls both Agent and Context. The desktop host runs it in-process through the JSON `invoke(operation, json)` entry (`platform/electron/src/core.ts`); `scripts/build-native-ui.ts` also bundles it as `shared-core.js`, which Python and fixture checks load (for example `scripts/hermes-frame-validator.ts`). Import each component through `agent/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
