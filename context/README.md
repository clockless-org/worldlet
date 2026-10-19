# Context

Everything the World knows, in one hub: the Store, the Applets' records and the Connectors, one of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know). Platform-independent product behavior. Components, by [feature](../docs/UI-CORE-PLATFORM.md#features):

- Store: store (the hub: every record, history, artifacts and made games; [storage and its four kinds](store/STORAGE.md#four-kinds))
- Applets: applets (the catalog, each Applet's records and the World log)
- Connectors: connectors (Services in and out: sign-in, what they sync, Service presets and the board, approved writes)

Context imports only itself and `contracts/` ([layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers)); [Agent](../agent/README.md) reads and writes it. Import each component through `context/<component>/index.ts`; cross-component implementation imports are rejected by `scripts/component-boundary-check.ts`. No DOM, Node, UI, OS or Harness dependencies are allowed.
