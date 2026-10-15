/** Agent asks (core/agent/GRANTS.md#agent-asks): what an Agent asks the person, or work it leaves for an Agent to take.
 * An ask is posted by one Agent through the `worldlet` MCP server; the host stamps its `agentId` from the token that
 * made the call, never from what the model sent. The person answers it on its Attention card; an Agent reads the
 * answer by polling `asks/read`. An `input` ask is work any Agent with "Can take work" may claim (a lease) and resolve.
 * Hosts own IDs, clocks and storage; Core decides (core/agent/asks.ts). */

/** `ask`: a question for the person, answered with one of its choices or a note. `input`: work an Agent may claim. */
export type AgentAskKind='ask'|'input';
/** `open` until someone acts; `claimed` while an Agent holds its lease; `answered` once the person chose or wrote back;
 * `done` when the person or the claiming Agent finished it; `skipped` when the person dismissed it. */
export type AgentAskStatus='open'|'claimed'|'answered'|'done'|'skipped';
export const AGENT_ASK_KINDS:readonly AgentAskKind[]=Object.freeze(['ask','input']);
export const AGENT_ASK_STATUSES:readonly AgentAskStatus[]=Object.freeze(['open','claimed','answered','done','skipped']);

/** What the person said back. */
export interface AgentAskAnswer {
 /** One of the ask's own choices, exactly. */
 choice?:string;
 note?:string;
 /** ISO instant, host clock. */
 at:string;
}
/** What the claiming Agent reported when it finished. */
export interface AgentAskResolution {
 note:string;
 /** https links to what it made (a pull request, a document). */
 links:string[];
 at:string;
}

export interface AgentAsk {
 /** Host-made, file-name safe. */
 id:string;
 /** The Agent that posted it, host-stamped from its token. */
 agentId:string;
 kind:AgentAskKind;
 title:string;
 body:string;
 /** At most AGENT_ASK_LIMITS.choices; the card shows each as a pill. */
 choices:string[];
 /** One https link the card opens. */
 link?:string;
 status:AgentAskStatus;
 /** The Agent holding the lease, and when it took it (host-stamped). */
 claimedBy?:string;
 claimedAt?:string;
 answer?:AgentAskAnswer;
 resolution?:AgentAskResolution;
 tags:string[];
 /** GitHub drafts this ask carries (core/agent/GRANTS.md#github-drafts), each the posting Agent's own and pending when
  * posted. Answering the ask's `Approve` choice on this computer approves them all, each read again first and refused
  * when its target changed; any other answer leaves them unrun. */
 draftIds?:string[];
 /** 1 when posted; each change adds one. `asks/resolve` names the revision it read and is refused when it changed. */
 revision:number;
 createdAt:string;
 updatedAt:string;
}

export const AGENT_ASK_LIMITS=Object.freeze({
 title:200,body:4000,choices:4,choice:60,link:2000,tags:8,tag:40,note:2000,links:8,
 /** GitHub drafts one ask may carry. */
 drafts:10,
 /** Open or claimed asks one Agent may have posted at once. */
 openPerAgent:20,
 /** Asks one `asks/claim` call may take. */
 claim:10,
 /** How long a claim holds; after it, another Agent may claim the ask again. */
 leaseMinutes:60,
 /** Asks one `asks/read` call returns, newest first. */
 read:50,
});

/** The World gateway targets (`asks/<action>`): each its own Grant target. */
export const AGENT_ASK_TARGET='asks';
export const AGENT_ASK_ACTIONS=Object.freeze({post:'asks/post',read:'asks/read',claim:'asks/claim',resolve:'asks/resolve'} as const);
/** The Attention provider whose items are asks: written by the host, never by a model or a source reader. */
export const AGENT_ASK_PROVIDER='agents';

/** `asks/post` arguments, as the model sends them (any `agentId` is ignored). */
export interface AgentAskPost {kind?:AgentAskKind;title:string;body?:string;choices?:string[];link?:string;tags?:string[];draftIds?:string[]}
/** The choice that approves an ask's GitHub drafts. An ask that carries drafts always offers it; with no choices of its
 * own it offers `Approve` and `Not now`. */
export const ASK_APPROVE_CHOICE='Approve';
export const ASK_DRAFT_CHOICES:readonly string[]=Object.freeze([ASK_APPROVE_CHOICE,'Not now']);
/** `asks/claim`: particular asks, or up to `limit` of the oldest claimable ones. */
export interface AgentAskClaim {ids?:string[];limit?:number}
/** `asks/resolve`. */
export interface AgentAskResolve {id:string;note:string;links?:string[];expectedRevision:number}
/** The person's answer on the Attention card: a choice and an optional note (`answered`), or Done or Dismiss. */
export interface AgentAskReply {id:string;outcome:'answered'|'done'|'skipped';choice?:string;note?:string}
/** What became of one of an ask's GitHub drafts, as `asks/read` shows it. */
export interface AgentAskDraft {id:string;status:string;resultUrl?:string;reason?:string}
