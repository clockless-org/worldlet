# Agent adapters

The desktop host (`platform/electron/src/modules/agent-runtime/`) consumes these adapter sources. The host owns process launch, installation, credential storage and final authorization; adapters consume the shared World tool protocol and never import the host.

- `hermes/`: official Python integration and pinned runtime manifest. Build tooling copies it into `WorldletWeb/hermes/` on both platforms; installed paths and user profiles do not change with source layout.
- [example/](example/README.md): independent executable example of the Agent protocol, with no Hermes dependency.
- [skills/](skills/README.md): skills an Agent the person already runs (OpenClaw, Hermes Agent) installs so it can set up Worldlet itself with the [one-line installer](../platform/install/README.md).

World tool definitions remain in `core/tools/`; wire types remain in `contracts/`. Framework-specific model configuration belongs to its adapter. The same Hermes Python code supports both hosts; `runtime_platform.py` contains the small runtime OS helpers.

Run `node scripts/build-hermes.ts` after source changes. `node scripts/world-gateway-check.ts` verifies the shared TypeScript/Python World tool contract. Build/check commands must resolve repository sources from this directory, never from an installed user's profile.
