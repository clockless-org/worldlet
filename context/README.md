# Context

Everything the World knows: the Context store and its Connectors, one of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know). Platform-independent product behavior. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- World: activity
- Applets: applets, board, browser, games
- Artifacts & Journal: artifacts (everything work produces, kept by day)
- Context: sources, items (everything the World knows; [storage and its four kinds](items/STORAGE.md#four-kinds))
- Connectors: accounts (sign-in to Services, their reads and approved writes)

Context imports only itself and `contracts/` ([layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers)); [Agent](../agent/README.md) reads and writes it. Import each component through `context/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
