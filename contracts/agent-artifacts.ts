/** Agent artifacts (core/agent/GRANTS.md#agent-artifacts): an artifact an Agent saves to the person's Journal on its own,
 * outside any Fox turn (an hourly summary from a Scheduled routine), and that the person and other Agents read
 * again. Each is an ordinary `answer` artifact (core/artifacts/artifacts.ts) in the World's `artifacts` table, its
 * `agentId` host-stamped from the token that saved it, never from what the model sent. Hosts own IDs, clocks and
 * storage; Core decides (core/agent/agent-artifacts.ts). */

/** The World gateway targets (`agent-artifacts/<action>`), each its own Grant target. Only an Agent's own "Can save
 * to your Journal" and "Can read Agents' Journal artifacts" Grants name them; a Fox turn's Grant never does. */
export const AGENT_ARTIFACT_TARGET='agent-artifacts';
export const AGENT_ARTIFACT_ACTIONS=Object.freeze({save:'agent-artifacts/save',read:'agent-artifacts/read'} as const);

export const AGENT_ARTIFACT_LIMITS=Object.freeze({
 /** Artifacts one Agent keeps: saving another forgets that Agent's oldest. Fox's and other Agents' artifacts are never
  * forgotten for it beyond the World's own limit (ARTIFACT_LIMITS.artifacts). */
 perAgent:48,
 /** A key: a short stable name, such as `hourly-2026-10-17T07`. */
 key:64,
 query:200,
 readDefault:10,
 readMax:50,
});

/** `agent-artifacts/save`: a title, a Markdown body and an optional one-sentence brief, within ARTIFACT_LIMITS. With a
 * `key`, saving again with the same key by the same Agent replaces that artifact instead of adding one. */
export interface AgentArtifactSave {title:string;body:string;brief?:string;key?:string}
/** `agent-artifacts/read`: artifacts saved by Agents (never Fox's own or Attention cards), newest first, optionally of one
 * Agent (`agent`, its ID) and with every word of `query` in the title. */
export interface AgentArtifactRead {agent?:string;query?:string;limit:number}
/** One artifact as `agent-artifacts/read` returns it. */
export interface AgentArtifactView {id:string;agentId:string;title:string;brief?:string;body:string;
 /** ISO instant of its last save (host clock). */
 savedAt:string}
