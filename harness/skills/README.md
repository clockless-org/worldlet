# Agent skills

Skills that an Agent the person already runs (OpenClaw, Hermes Agent) can install, so the Agent itself can set up Worldlet.

- [worldlet](worldlet/SKILL.md): installs the headless Worldlet service with the one-line installer, connected to this Agent (`--agent openclaw|hermes|pi|claude-code|codex`), and opens the World in the browser; a computer that already has the Worldlet app only opens it (`--connect=<id>`). After setup the Agent asks for the World's browser link (`world/link` over the `worldlet` MCP server, [platform/web/README.md](../../platform/web/README.md#web)) and sends it to the person, so they can open their World from any browser while the computer is on.

The SKILL.md format is the one both Agents read: frontmatter `name` and `description` (at most 60 characters, Hermes Agent's index budget; see `SKILL_LIMITS` in `agent/gate/harness-skills.ts`), then the steps. Publishing to ClawHub or a Hermes skill index is a release step done by the owner.
