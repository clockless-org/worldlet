# Agent adapters

The desktop host (`platform/electron/src/modules/agent-runtime/`) consumes these adapter sources. The host owns process launch, installation, credential storage and final authorization; adapters consume the shared World tool protocol and never import the host.

- [example/](example/README.md): independent executable example of the Agent protocol, with no Hermes dependency.
- [skills/](skills/README.md): skills an Agent the person already runs (OpenClaw, Hermes Agent) installs so it can set up Worldlet itself with the [one-line installer](../platform/install/README.md).

World tool definitions remain in `core/tools/`; wire types remain in `contracts/`. Framework-specific model configuration belongs to its adapter.

Worldlet has no built-in Hermes since the owner decisions of 2026-10-09: a person's own Hermes Agent reaches the World through the `worldlet` MCP server like any other Agent ([no Agent](../core/agent/PORTABILITY.md#no-agent)). Build/check commands must resolve repository sources from this directory, never from an installed user's profile.
