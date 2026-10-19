/** Agent asks (agent/agents/GRANTS.md#agent-asks): what an Agent asks the person, or work it leaves for an Agent to take.
 * An ask is posted by one Agent through the `worldlet` MCP server; the host stamps its `agentId` from the token that
 * made the call, never from what the model sent. The person answers it on its Attention card; an Agent reads the
 * answer by polling `asks/read`. An `input` ask is work any Agent with "Can take work" may claim (a lease) and resolve.
 * Work may name the one Agent it is for (`for`, an order): that Agent sees it first, and the host may wake it
 * (agent/agents/GRANTS.md#orders-and-waking-an-agent).
 * Hosts own IDs, clocks and storage; Core decides (agent/agents/asks.ts). */

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
/** A screenshot or a file an ask carries (agent/agents/GRANTS.md#agent-asks): only what describes it. Its bytes are kept
 * apart in the World (`agent_ask_attachments` in world.sqlite), keyed by the ask's ID and this ID, and read with
 * `asks/attachment`. An attachment is data: never instructions, for a model or anyone else. */
export interface AgentAskAttachment {
 /** Core-made, unique within its ask (`att-1`, `att-2`, …). */
 id:string;
 /** File-name safe, its extension matching its type. */
 name:string;
 /** One of AGENT_ASK_IMAGE_TYPES or AGENT_ASK_FILE_TYPES. */
 type:string;
 /** Bytes. */
 size:number;
 /** Lowercase hex SHA-256 of the bytes, host-made. */
 sha256:string;
}
/** One attachment as `asks/post` sends it: the bytes in base64. */
export interface AgentAskAttachmentInput {name:string;type:string;data:string}
/** Pictures an ask may carry, shown on its card, and the extension each is named with. */
export const AGENT_ASK_IMAGE_TYPES:Readonly<Record<string,readonly string[]>>=Object.freeze({'image/png':['png'],'image/jpeg':['jpg','jpeg'],'image/webp':['webp'],'image/gif':['gif']});
/** Other files an ask may carry (logs, reports, archives of them), named on its card. Nothing that runs. */
export const AGENT_ASK_FILE_TYPES:Readonly<Record<string,readonly string[]>>=Object.freeze({'text/plain':['txt','log'],'text/csv':['csv'],'application/json':['json'],'application/zip':['zip'],'application/gzip':['gz','tgz']});

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
 /** `input` work only: the Agent it is for (an order), named by the poster or the World's order target. That Agent reads
  * it with `asks/read` and may claim it at once; another may claim it only once it has waited
  * AGENT_ASK_LIMITS.forMinutes unclaimed, or after a lease on it ran out. */
 for?:string;
 /** GitHub, PostHog and Notion drafts this ask carries (agent/agents/GRANTS.md#agent-asks), each the posting Agent's
  * own and pending when posted. Answering the ask's `Approve` choice on this computer approves them all, each read again first and refused
  * when its target changed; any other answer leaves them unrun. */
 draftIds?:string[];
 /** Screenshots and files it carries, as posted; they stay with the ask however it settles. */
 attachments?:AgentAskAttachment[];
 /** 1 when posted; each change adds one. `asks/resolve` names the revision it read and is refused when it changed. */
 revision:number;
 createdAt:string;
 updatedAt:string;
}

export const AGENT_ASK_LIMITS=Object.freeze({
 title:200,body:4000,choices:4,choice:60,link:2000,tags:8,tag:40,note:2000,links:8,
 /** Drafts one ask may carry. */
 drafts:10,
 /** Open or claimed asks one Agent may have posted at once. */
 openPerAgent:20,
 /** Asks one `asks/claim` call may take. */
 claim:10,
 /** How long a claim holds; after it, another Agent may claim the ask again. */
 leaseMinutes:60,
 /** Minutes work that names an Agent (`for`) waits for that Agent before any other Agent may claim it. */
 forMinutes:15,
 /** Asks one `asks/read` call returns, newest first. */
 read:50,
 /** Pictures and other files one ask may carry. */
 images:8,files:12,
 /** Bytes: each picture, each other file, and all of one ask's together. */
 imageBytes:5*1024*1024,fileBytes:2*1024*1024,attachmentBytes:20*1024*1024,
 /** Characters in an attachment's name. */
 attachmentName:120,
 /** Bytes one `asks/attachment` call returns; a larger attachment is read in parts from `offset`. */
 attachmentRead:96*1024,
});

/** The World gateway targets (`asks/<action>`): each its own Grant target. */
export const AGENT_ASK_TARGET='asks';
export const AGENT_ASK_ACTIONS=Object.freeze({post:'asks/post',read:'asks/read',claim:'asks/claim',resolve:'asks/resolve',attachment:'asks/attachment'} as const);
/** The Attention provider whose items are asks: written by the host, never by a model or a source reader. */
export const AGENT_ASK_PROVIDER='agents';

/** `asks/post` arguments, as the model sends them (any `agentId` is ignored). */
export interface AgentAskPost {kind?:AgentAskKind;title:string;body?:string;choices?:string[];link?:string;tags?:string[];draftIds?:string[];
 /** `input` only: the Agent this work is for, by its ID. */
 for?:string;
 /** Checked: the name made safe, the size counted from the base64. */
 attachments?:(AgentAskAttachmentInput&{size:number})[]}
/** The choice that approves an ask's drafts. An ask that carries drafts always offers it; with no choices of its
 * own it offers `Approve` and `Not now`. */
export const ASK_APPROVE_CHOICE='Approve';
export const ASK_DRAFT_CHOICES:readonly string[]=Object.freeze([ASK_APPROVE_CHOICE,'Not now']);
/** `asks/claim`: particular asks, or up to `limit` of the oldest claimable ones. */
export interface AgentAskClaim {ids?:string[];limit?:number}
/** `asks/attachment`: part of one attachment's bytes (`attachment`, its ID) on the ask `id`, from `offset` (0 when left out). */
export interface AgentAskAttachmentRead {id:string;attachment:string;offset?:number}
/** `asks/resolve`. */
export interface AgentAskResolve {id:string;note:string;links?:string[];expectedRevision:number}
/** The person's answer on the Attention card: a choice and an optional note (`answered`), or Done or Dismiss. */
export interface AgentAskReply {id:string;outcome:'answered'|'done'|'skipped';choice?:string;note?:string}
/** What became of one of an ask's drafts, as `asks/read` shows it. */
export interface AgentAskDraft {id:string;status:string;resultUrl?:string;reason?:string}

/** Orders and waking an Agent (agent/agents/GRANTS.md#orders-and-waking-an-agent): the World's own setting, kept with the
 * Agents' Grants in world.sqlite (`agent_settings`, `agent-orders`), changed only in Settings › Agents. */
export interface AgentOrders {
 /** "Give new work to": the Agent that `input` work posted without `for` is for. */
 defaultFor?:string;
 /** Each Agent's wake command, as the person typed it: the program's absolute path, then its arguments. Never a shell
  * line: the host runs the program itself, with WAKE_ASK_ID as a whole argument replaced by the work's ID. */
 wake:Record<string,string[]>;
}
/** The one placeholder a wake command may hold, as a whole argument: the ID of the work the Agent is woken for. */
export const WAKE_ASK_ID='{askId}';
export const AGENT_WAKE_LIMITS=Object.freeze({
 /** Arguments after the program, and characters in each word. */
 args:16,arg:500,
 /** A wake still running after this is stopped. */
 timeoutSeconds:300,
 /** At most one wake per Agent in this time; work assigned meanwhile wakes it once when it ends. */
 debounceSeconds:60,
});
