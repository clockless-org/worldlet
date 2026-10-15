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
