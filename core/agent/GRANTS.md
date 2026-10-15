# Agent identity, Grants and audit

Every Agent that reaches the World through the `worldlet` MCP server is its own identity, with its own list of Grants and its own audit trail. Anyone running Worldlet can see which Agent did what, give one Agent more or less than another, and revoke one without touching the rest.

The shapes are in [`contracts/agent-identity.ts`](../../contracts/agent-identity.ts); the decision is in [`grants.ts`](grants.ts); `node scripts/agent-grants-check.ts` checks both.

## Identity

An `AgentIdentity` has a stable ID (lowercase letters, digits and `-`; it names the Agent's endpoint file and its ledger rows), the name the person knows it by, its Harness (`hermes`, `openclaw`, `claude-code`, `codex`, `pi` or another adapter's ID), whether it runs on this computer (`local`) or another (`remote`), when it was created and last seen, and when it was revoked. A revoked Agent's calls are denied.

## Grants

A `Grant` gives one Agent a list of World gateway `target/action` patterns (`items/query`, `items/*`, `applet:*/launch`, `*/*`; `*` matches anything, including `/`) with:

- **access**: `read` covers reads only; `write` covers reads and writes. The host says whether a call writes (the turn rule's guarded writes and the gateway's write actions).
- **duration**: `standing` runs without asking until it is revoked or expires; `once` lets reads run and sends each write to the person's approval card (Allow once or Deny).
- optional `expiresAt` and `revokedAt`: a Grant past either counts for nothing.

`grantDecision` decides one call, in this order:

1. An unknown or revoked Agent is **denied**.
2. **The turn rule comes first** ([`turn-trust.ts`](turn-trust.ts)): a write the turn has refused, because untrusted content entered it, stays refused whatever the Grants say, with the turn rule's own words. A Grant never widens what a turn may do.
3. With no active Grant of this Agent matching the call, it is **denied**. A write matched only by `read` Grants is denied.
4. A matching `standing` Grant **allows**. Under a `once` Grant a read is **allowed** and a write is **asked**.

`describe_world_tools` lists only the targets one of the Agent's Grants names (`grantCoversTarget`).

## Audit

Each decision becomes one `AgentAuditEntry` (`at`, `agentId`, `target`, `action`, `decision`: `allowed`, `denied` or `asked`, the `grantId` that decided and a short `reason`), kept in the ledger as `agent.audit`. `keepAgentAudit` keeps the newest `AGENT_AUDIT_KEEP` entries per Agent, so a busy Agent never pushes out another's history.

## Who saved what

World items, artifacts and the Attention items built from them carry an optional `agentId`: the Agent that saved them. Hosts stamp it from the token that made the call (`prepareWorldItem` and `mergeArtifact` take it as an argument). A model never sets it: an `agentId` in what a model sends is dropped, and a saved record keeps the Agent that first saved it.

## The standing MCP server

The `worldlet` MCP server registered in an Agent's profile (World tools on Hermes, [PORTABILITY.md](PORTABILITY.md#world-tools-on-hermes)) is where Grants are enforced, on the Electron host and the [Node host](../../platform/node/README.md) alike (`agent-runtime/world-tool-bridge.ts`, `agent-runtime/agent-access.ts`):

- **Its own token and endpoint file.** Each run, each Agent gets a new token, written with the endpoint to `worldlet-mcp-endpoint.<agentId>.json` in its profile (owner-only, removed on quit). Only the token's SHA-256 hash is kept, in the vault (`agent-token:<agentId>`); a call is identified by its token, and an unknown token is answered as if Worldlet were closed. Identities and Grants are kept with Fox's setup choices (`agent_settings`, `agent-access`), so they follow the World and its backups.
- **Default Grants.** An Agent's default Grants are what a call outside any Fox turn could do before Grants existed (`HERMES_CHANNEL_TOOLS` in [`hermes-server.ts`](hermes-server.ts)): a standing `read` Grant for reads and a draft for the person's review, and a standing `write` Grant for `world/link`. They are written again each run so new Applet sources are covered (`channelDefaultGrants`). Worldlet Services (`read_service`: `github/list`, `github/read`, `github/search`, [INTEGRATIONS.md](../applets/INTEGRATIONS.md#github-service); `posthog/query`, `posthog/read`, [PostHog](../applets/INTEGRATIONS.md#posthog-service); `cloudflare/read`, [Cloudflare](../applets/INTEGRATIONS.md#cloudflare-service)) are never in the default Grants, since a Service can return other people's text or personal data: an Agent reads one only through a Grant the person gives it, and a call its Grant admits outside a Fox turn runs its read as the default reads do.
- **Calls.** Outside any Fox turn, a call is a turn of its own that starts untrusted (except the browser link), so the turn rule refuses its writes first. Any refusal but a revoked or unknown Agent's says what such a call may do: `HERMES_CHANNEL_READ_ONLY` for Hermes Agent, `STANDING_OUTSIDE_TURN` (which names no Hermes channel) for another Agent such as Claude Code or Codex. `channelToolReply` (Fox's module) checks the same Grants again before it runs anything. While a Fox turn holds the server, Hermes Agent's calls go to the turn as before (Fox's turns run on Hermes Agent; another Agent's calls are always its own, under its own Grants) (`foxTurnGrant`): reads run, a write the turn's own stream announced runs, and any other write goes to the approval card, which names the Agent (`asked`) (`standingCallDecision`).
- **Discovery.** `describe_world_tools` lists only the targets the Agent's Grants name (`standingActions`).
- **Audit.** Every call's decision is appended to the ledger as `agent.audit`, keyed by the Agent, and only its newest `AGENT_AUDIT_KEEP` entries stay. Last use is stamped on the identity at most once a minute.
- **Revoke.** Revoking an Agent stamps `revokedAt` on it and its Grants, deletes its token hash and removes its endpoint files, so its registered server answers that Worldlet is not open. It stays revoked across runs.
- **Upgrading.** A Hermes Agent registered before per-Agent tokens names the profile's single `worldlet-mcp-endpoint.json`. On the first run after the upgrade, Hermes Agent becomes the `hermes` identity with the default Grants, and that file holds the same token for that run. Its registered entry is outdated, so `hermes mcp add` saves the new file's path and its gateway restarts. The old file goes on quit.

`node scripts/harness-sessions-check.ts` checks the token, the files, migration, default Grants, discovery, audit and revoke against a fixture Hermes Agent.

## Settings › Agent › Access

The Access part of Settings › Agent ([`ui/companion/agent-access.ts`](../../ui/companion/agent-access.ts), host action `agentAccess` in `agent-runtime/index.ts`) lists each Agent, the one used most recently first. For each it shows where it runs, its last use (or when it was revoked), its active Grants in plain words, and its five newest audit entries. Revoke asks once more in the page and then calls `agentAccess` `revoke`. That stamps `revokedAt`, deletes the Agent's token hash and removes its endpoint files. The page names places in the World and what was allowed. It never shows tokens, endpoints or MCP. `node scripts/your-agent-ui-check.ts` checks the list and Revoke.
