/** Per-Agent identity, Grants and audit (core/agent/GRANTS.md). Each Agent that reaches the World through the
 * `worldlet` MCP server has its own identity; what it may call is a list of Grants; every decision is one audit
 * entry. Hosts own identities, tokens, clocks and storage; Core decides (core/agent/grants.ts). A model never names
 * its own Agent ID: hosts stamp it from the token that made the call. */

/** A stable, file-name safe Agent ID: it names the Agent's endpoint file and its ledger rows. */
export const AGENT_ID_PATTERN=/^[a-z0-9][a-z0-9-]{0,62}$/;
export type AgentKind='local'|'remote';

export interface AgentIdentity {
 id:string;
 /** What the person calls it ("Hermes Agent", "Claude Code on the Mac mini"). */
 name:string;
 /** The Harness behind it: hermes, openclaw, claude-code, codex, pi, or another adapter's ID. */
 harness:string;
 kind:AgentKind;
 /** ISO instants, host clock. */
 createdAt:string;
 lastSeenAt?:string;
 /** Set when the person revokes it; a revoked Agent's calls are denied and its token is gone. */
 revokedAt?:string;
}

export type GrantAccess='read'|'write';
/** `standing`: runs without asking until revoked or expired. `once`: reads run, and each write asks the person on the
 * approval card (Allow once or Deny). */
export type GrantDuration='standing'|'once';

export interface Grant {
 id:string;
 agentId:string;
 /** World gateway `target/action` patterns; `*` matches any run of characters, so `items/*`, `applet:*\/launch`
  * and `*\/*` are valid. */
 targets:string[];
 /** `write` covers reads too; `read` covers reads only. */
 access:GrantAccess;
 duration:GrantDuration;
 grantedAt:string;
 expiresAt?:string;
 revokedAt?:string;
}

export type AgentAuditDecision='allowed'|'denied'|'asked';
/** One decision about one call, kept in the ledger as `agent.audit` (newest N per Agent). */
export interface AgentAuditEntry {
 at:string;
 agentId:string;
 target:string;
 action:string;
 decision:AgentAuditDecision;
 /** The Grant that allowed or asked, when one did. */
 grantId?:string;
 /** Why, in a few words, when it was denied or asked. */
 reason?:string;
}
