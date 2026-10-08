# Agent skills

Skills that an Agent the person already runs (OpenClaw, Hermes Agent) can install, so the Agent itself can set up Worldlet.

- [worldlet](worldlet/SKILL.md): installs the signed Worldlet app with the one-line installer and opens it connected to this Agent (`--agent openclaw|hermes`, passed on to the app as `--connect=<id>`).

The SKILL.md format is the one both Agents read: frontmatter `name` and `description` (at most 60 characters, Hermes Agent's index budget; see `SKILL_LIMITS` in `core/agent/harness-skills.ts`), then the steps. Publishing to ClawHub or a Hermes skill index is a release step done by the owner.
