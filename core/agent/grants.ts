import {AGENT_ID_PATTERN,type AgentAuditEntry,type AgentIdentity,type Grant} from '../../contracts/agent-identity.ts';
import {SERVICE_ACTIONS,SERVICE_PROVIDERS} from '../../contracts/services.ts';
import {AGENT_ASK_ACTIONS,AGENT_ASK_TARGET} from '../../contracts/agent-asks.ts';
import {BOARD_ACTIONS,BOARD_TARGET} from '../../contracts/board.ts';
import {CONVERSATION_ACTIONS,CONVERSATION_TARGET} from '../../contracts/conversations.ts';
import {TRACKED_LINK_ACTIONS,TRACKED_LINK_TARGET} from '../../contracts/tracked-links.ts';
import {GITHUB_DRAFT_ACTIONS,GITHUB_DRAFT_TARGET} from '../../contracts/github-drafts.ts';
import {AGENT_REPORT_ACTIONS,AGENT_REPORT_TARGET} from '../../contracts/agent-reports.ts';
import {grantedActions,worldActions,type WorldAction} from '../tools/index.ts';
import {turnGuardedWrite,turnWriteAdmission} from './turn-trust.ts';
import {HERMES_CHANNEL_LINK_TOOL,HERMES_CHANNEL_READ_ONLY,HERMES_CHANNEL_TOOLS,hermesChannelTrust} from './hermes-server.ts';

/** Per-Agent Grants (core/agent/GRANTS.md). Pure: hosts supply the identity, its Grants, the turn's own admission and
 * the clock, and record the result as an audit entry. The turn rule (turn-trust.ts) always comes first: a Grant never
 * admits a write the turn has refused. */

/** How many audit entries the ledger keeps per Agent, newest first. */
export const AGENT_AUDIT_KEEP=200;

/** What the turn rule decided about this call: `writeDecision` or `turnWriteAdmission` in turn-trust.ts. Absent when
 * the call has no turn of its own to consult. */
export type TurnAdmission={allowed:boolean;reason?:string;error?:string};
export type GrantDecisionInput={
 identity:AgentIdentity|null|undefined;
 grants:readonly Grant[];
 target:string;
 action:string;
 /** Whether this call writes: the host's own classification (turnGuardedWrite and the gateway's write actions). */
 writes:boolean;
 turn?:TurnAdmission;
 /** ISO instant. */
 now:string;
};
export type GrantDecision={decision:'allowed'|'denied'|'asked';grantId?:string;reason?:string};

export const GRANT_REASONS=Object.freeze({
 unknown:'This Agent is not known to Worldlet.',
 revoked:'The person revoked this Agent\'s access.',
 none:'No Grant covers this.',
 readOnly:'This Agent may only read here.',
 once:'Each write under this Grant needs the person\'s confirmation.',
 turn:'The turn rule refused this write.',
});

/** Whether one `target/action` pattern covers this call. `*` matches any run of characters, including `/`. Matched
 * without a regular expression: each fixed part in turn, leftmost first, so a pattern of many `*` cannot backtrack. */
export function grantPatternMatches(pattern:string,target:string,action:string):boolean {
 if(typeof pattern!=='string'||!pattern.includes('/'))return false;
 const text=target+'/'+action,parts=pattern.split('*'),first=parts[0],last=parts[parts.length-1];
 if(parts.length===1)return text===pattern;
 if(text.length<first.length+last.length||!text.startsWith(first)||!text.endsWith(last))return false;
 let at=first.length;const end=text.length-last.length;
 for(const part of parts.slice(1,-1)){
  const found=text.indexOf(part,at);
  if(found<0||found+part.length>end)return false;
  at=found+part.length;
 }
 return true;
}
const before=(at:string|undefined,now:string)=>typeof at==='string'&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=Date.parse(now);
/** A Grant counts until it is revoked or its expiry passes. */
export function grantActive(grant:Grant,now:string):boolean {
 return !before(grant.revokedAt,now)&&!before(grant.expiresAt,now);
}
export function agentRevoked(identity:AgentIdentity,now:string):boolean {
 return before(identity.revokedAt,now);
}

/** The decision for one call by one Agent. Order: an unknown or revoked Agent is denied; then the turn rule (a write it
 * refuses stays refused, whatever the Grants say); then the Grants: a standing Grant allows, a `once` Grant allows reads
 * and asks for writes, a `read` Grant never covers a write, and nothing matching denies. */
export function grantDecision(input:GrantDecisionInput):GrantDecision {
 const {identity,target,action,writes,turn,now}=input;
 if(!identity||!AGENT_ID_PATTERN.test(identity.id))return {decision:'denied',reason:GRANT_REASONS.unknown};
 if(agentRevoked(identity,now))return {decision:'denied',reason:GRANT_REASONS.revoked};
 if(writes&&turn&&!turn.allowed)return {decision:'denied',reason:turn.error||turn.reason||GRANT_REASONS.turn};
 const matching=(input.grants||[]).filter(grant=>grant.agentId===identity.id&&grantActive(grant,now)
  &&Array.isArray(grant.targets)&&grant.targets.some(pattern=>grantPatternMatches(pattern,target,action)));
 if(!matching.length)return {decision:'denied',reason:GRANT_REASONS.none};
 const covering=writes?matching.filter(grant=>grant.access==='write'):matching;
 if(!covering.length)return {decision:'denied',grantId:matching[0].id,reason:GRANT_REASONS.readOnly};
 const standing=covering.find(grant=>grant.duration==='standing');
 if(standing||!writes)return {decision:'allowed',grantId:(standing??covering[0]).id};
 return {decision:'asked',grantId:covering[0].id,reason:GRANT_REASONS.once};
}

/** Whether any active Grant of this Agent names this target at all, for `describe_world_tools`: an Agent sees only the
 * targets it may reach. */
export function grantCoversTarget(agentId:string,grants:readonly Grant[],target:string,actions:readonly string[],now:string):boolean {
 return grants.some(grant=>grant.agentId===agentId&&grantActive(grant,now)&&grant.targets.some(pattern=>actions.some(action=>grantPatternMatches(pattern,target,action))));
}

/** The audit entry for one decision. */
export function agentAuditEntry(agentId:string,target:string,action:string,result:GrantDecision,at:string):AgentAuditEntry {
 const entry:AgentAuditEntry={at,agentId,target,action,decision:result.decision};
 if(result.grantId)entry.grantId=result.grantId;
 if(result.reason)entry.reason=[...result.reason].slice(0,300).join('');
 return entry;
}
/** The audit entries to keep: the newest `keep` per Agent, newest first. */
export function keepAgentAudit(entries:readonly AgentAuditEntry[],keep=AGENT_AUDIT_KEEP):AgentAuditEntry[] {
 const counts=new Map<string,number>();
 return [...entries].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).filter(entry=>{
  const seen=counts.get(entry.agentId)??0;counts.set(entry.agentId,seen+1);return seen<keep;
 });
}

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const instant=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
/** A stored identity, checked; null when it is not one. */
export function readAgentIdentity(value:unknown):AgentIdentity|null {
 const v=record(value);
 if(typeof v.id!=='string'||!AGENT_ID_PATTERN.test(v.id)||typeof v.name!=='string'||!v.name.trim()||typeof v.harness!=='string'||!v.harness
  ||(v.kind!=='local'&&v.kind!=='remote')||!instant(v.createdAt))return null;
 const identity:AgentIdentity={id:v.id,name:v.name.trim().slice(0,80),harness:v.harness.slice(0,40),kind:v.kind,createdAt:v.createdAt as string};
 if(instant(v.lastSeenAt))identity.lastSeenAt=v.lastSeenAt as string;
 if(instant(v.revokedAt))identity.revokedAt=v.revokedAt as string;
 return identity;
}
/** A stored Grant, checked; null when it is not one. */
export function readGrant(value:unknown):Grant|null {
 const v=record(value);
 const targets=Array.isArray(v.targets)?v.targets.filter((t):t is string=>typeof t==='string'&&t.includes('/')&&t.length<=120):[];
 if(typeof v.id!=='string'||!v.id||typeof v.agentId!=='string'||!AGENT_ID_PATTERN.test(v.agentId)||!targets.length
  ||(v.access!=='read'&&v.access!=='write')||(v.duration!=='standing'&&v.duration!=='once')||!instant(v.grantedAt))return null;
 const grant:Grant={id:v.id,agentId:v.agentId,targets,access:v.access,duration:v.duration,grantedAt:v.grantedAt as string};
 if(instant(v.expiresAt))grant.expiresAt=v.expiresAt as string;
 if(instant(v.revokedAt))grant.revokedAt=v.revokedAt as string;
 // An ask Grant names today's ask targets, so one given before `asks/attachment` existed covers it too.
 for(const kind of ASK_GRANT_KINDS)if(grant.id===askGrantId(grant.agentId,kind))grant.targets=askGrantTargets(kind);
 return grant;
}

// The standing `worldlet` MCP server (platform world-tool-bridge.ts): each Agent reaches it with its own token, and every
// call is decided here before it runs.

/** Whether a resolved World tool call writes, for a Grant's access: the turn rule's guarded writes, and handing work to
 * an Applet task (it then writes on its own runtime). */
export function worldCallWrites(tool:string,args:Record<string,unknown>={}):boolean {
 return turnGuardedWrite({type:'tool',name:tool,args})!==null||tool==='start_applet_task';
}

/** An Agent's default Grants: what a call outside any Fox turn could do before Grants existed (core/agent/hermes-server.ts
 * HERMES_CHANNEL_TOOLS: reads and a draft for the person's review, as a standing read Grant; and the World's browser link,
 * as a standing write Grant). Hosts write them again each run so new Applet sources are covered; a revoked one stays
 * revoked. */
export function channelDefaultGrants(agentId:string,grantedAt:string,actions:WorldAction[]=worldActions()):Grant[] {
 const targets=(tools:readonly string[])=>[...new Set(actions.filter(a=>tools.includes(a.tool)).map(a=>a.target+'/'+a.action))];
 return [
  {id:agentId+'-channel-read',agentId,targets:targets(HERMES_CHANNEL_TOOLS),access:'read',duration:'standing',grantedAt},
  {id:agentId+'-channel-link',agentId,targets:targets([HERMES_CHANNEL_LINK_TOOL]),access:'write',duration:'standing',grantedAt},
 ];
}
/** A Worldlet Service's read targets (contracts/services.ts SERVICE_ACTIONS: `github/list`, `github/read`…): all that
 * "Can read <Service>" in Settings › Agent › Access grants. Empty for anything that is not a Service. */
export function serviceReadTargets(provider:string):string[] {
 if(typeof provider!=='string'||!SERVICE_PROVIDERS.includes(provider))return [];
 return Object.keys(SERVICE_ACTIONS[provider]).map(operation=>provider+'/'+operation);
}
/** The one Grant ID "Can read <Service>" gives an Agent, so turning it off and on again replaces the same Grant. */
export const serviceGrantId=(agentId:string,provider:string)=>agentId+'-service-'+provider;
/** The standing read Grant for one Service, or null when `provider` is not a Service or the Agent ID is not one. Hosts
 * build it from the Service's name only: a page never supplies targets. Never part of the default Grants. */
export function serviceReadGrant(agentId:string,provider:string,grantedAt:string):Grant|null {
 const targets=serviceReadTargets(provider);
 if(!targets.length||typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:serviceGrantId(agentId,provider),agentId,targets,access:'read',duration:'standing',grantedAt};
}
/** Whether this Agent's "Can read <Service>" Grant is active. */
export function serviceGranted(agentId:string,grants:readonly Grant[],provider:string,now:string):boolean {
 const id=serviceGrantId(agentId,provider);
 return serviceReadTargets(provider).length>0&&grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can read <Service>" on (`grant`) or off (`ungrant`) in Settings. */
export function serviceGrantAuditEntry(agentId:string,provider:string,granted:boolean,at:string):AgentAuditEntry {
 return {at,agentId,target:provider,action:granted?'grant':'ungrant',decision:'allowed',grantId:serviceGrantId(agentId,provider),
  reason:granted?'The person let this Agent read this Service in Settings.':'The person stopped this Agent reading this Service in Settings.'};
}
/** "Can ask you" (`ask`: post and read its own asks) and "Can take work" (`work`: claim and resolve input asks) in
 * Settings › Agent › Access (contracts/agent-asks.ts). Never part of the default Grants, and never given by a Fox turn. */
export type AskGrantKind='ask'|'work';
export const ASK_GRANT_KINDS:readonly AskGrantKind[]=Object.freeze(['ask','work']);
export function askGrantTargets(kind:string):string[] {
 // Both read an ask's attachments: the Agent that posted it, and the one that claimed it (core/agent/asks.ts decides which).
 return kind==='ask'?[AGENT_ASK_ACTIONS.post,AGENT_ASK_ACTIONS.read,AGENT_ASK_ACTIONS.attachment]:kind==='work'?[AGENT_ASK_ACTIONS.claim,AGENT_ASK_ACTIONS.resolve,AGENT_ASK_ACTIONS.attachment]:[];
}
export const askGrantId=(agentId:string,kind:string)=>agentId+'-asks-'+kind;
/** The standing Grant for one of the two, or null for anything else. Hosts build it from the kind only. Access is
 * `read`: an ask only shows something to the person, as a draft for review does, and is not a guarded write. */
export function askGrant(agentId:string,kind:string,grantedAt:string):Grant|null {
 const targets=askGrantTargets(kind);
 if(!targets.length||typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:askGrantId(agentId,kind),agentId,targets,access:'read',duration:'standing',grantedAt};
}
export function askGranted(agentId:string,grants:readonly Grant[],kind:string,now:string):boolean {
 const id=askGrantId(agentId,kind);
 return askGrantTargets(kind).length>0&&grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can ask you" or "Can take work" on or off in Settings. */
export function askGrantAuditEntry(agentId:string,kind:string,granted:boolean,at:string):AgentAuditEntry {
 const what=kind==='work'?'take work':'ask';
 return {at,agentId,target:AGENT_ASK_TARGET,action:(granted?'grant-':'ungrant-')+kind,decision:'allowed',grantId:askGrantId(agentId,kind),
  reason:granted?`The person let this Agent ${what} in Settings.`:`The person stopped this Agent being able to ${what} in Settings.`};
}

/** "Can see your board" (`read`: board/read) and "Can set up your board" (`define`: board/define) in Settings › Agent ›
 * Access (core/board/README.md). Never part of the default Grants, and never given by a Fox turn. */
export type BoardGrantKind='read'|'define';
export const BOARD_GRANT_KINDS:readonly BoardGrantKind[]=Object.freeze(['read','define']);
export function boardGrantTargets(kind:string):string[] {
 return kind==='read'?[BOARD_ACTIONS.read]:kind==='define'?[BOARD_ACTIONS.define]:[];
}
export const boardGrantId=(agentId:string,kind:string)=>agentId+'-board-'+kind;
/** The standing Grant for one of the two, or null for anything else. Access is `read`: defining changes only what the
 * person's own board shows, which they can see and change back, and is not a guarded write. */
export function boardGrant(agentId:string,kind:string,grantedAt:string):Grant|null {
 const targets=boardGrantTargets(kind);
 if(!targets.length||typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:boardGrantId(agentId,kind),agentId,targets,access:'read',duration:'standing',grantedAt};
}
export function boardGranted(agentId:string,grants:readonly Grant[],kind:string,now:string):boolean {
 const id=boardGrantId(agentId,kind);
 return boardGrantTargets(kind).length>0&&grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can see your board" or "Can set up your board" on or off in Settings. */
export function boardGrantAuditEntry(agentId:string,kind:string,granted:boolean,at:string):AgentAuditEntry {
 const what=kind==='define'?'set up the board':'see the board';
 return {at,agentId,target:BOARD_TARGET,action:(granted?'grant-':'ungrant-')+kind,decision:'allowed',grantId:boardGrantId(agentId,kind),
  reason:granted?`The person let this Agent ${what} in Settings.`:`The person stopped this Agent being able to ${what} in Settings.`};
}
/** "Can draft GitHub changes" in Settings › Agent › Access (core/agent/GRANTS.md#github-drafts): `github-drafts/create`
 * and `github-drafts/read`. Never part of the default Grants, and never given by a Fox turn. Access is `read`: a draft
 * only shows the person a change, and nothing is written to GitHub until they approve it on its card. */
export const githubDraftGrantTargets=():string[]=>[GITHUB_DRAFT_ACTIONS.create,GITHUB_DRAFT_ACTIONS.read];
export const githubDraftGrantId=(agentId:string)=>agentId+'-github-drafts';
export function githubDraftGrant(agentId:string,grantedAt:string):Grant|null {
 if(typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:githubDraftGrantId(agentId),agentId,targets:githubDraftGrantTargets(),access:'read',duration:'standing',grantedAt};
}
export function githubDraftGranted(agentId:string,grants:readonly Grant[],now:string):boolean {
 const id=githubDraftGrantId(agentId);
 return grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can draft GitHub changes" on or off in Settings. */
export function githubDraftGrantAuditEntry(agentId:string,granted:boolean,at:string):AgentAuditEntry {
 return {at,agentId,target:GITHUB_DRAFT_TARGET,action:granted?'grant':'ungrant',decision:'allowed',grantId:githubDraftGrantId(agentId),
  reason:granted?'The person let this Agent draft GitHub changes in Settings.':'The person stopped this Agent drafting GitHub changes in Settings.'};
}
/** "Can save conversations" (`add`: conversations/add) and "Can search conversations" (`search`: conversations/search)
 * in Settings › Agent › Access (core/agent/GRANTS.md#conversation-archive). Never part of the default Grants, and never
 * given by a Fox turn. Access is `read`: saving only adds to the archive the person's Agents search, and changes nothing
 * the person sees or relies on. */
export type ConversationGrantKind='add'|'search';
export const CONVERSATION_GRANT_KINDS:readonly ConversationGrantKind[]=Object.freeze(['add','search']);
export function conversationGrantTargets(kind:string):string[] {
 return kind==='add'?[CONVERSATION_ACTIONS.add]:kind==='search'?[CONVERSATION_ACTIONS.search]:[];
}
export const conversationGrantId=(agentId:string,kind:string)=>agentId+'-conversations-'+kind;
/** The standing Grant for one of the two, or null for anything else. Hosts build it from the kind only. */
export function conversationGrant(agentId:string,kind:string,grantedAt:string):Grant|null {
 const targets=conversationGrantTargets(kind);
 if(!targets.length||typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:conversationGrantId(agentId,kind),agentId,targets,access:'read',duration:'standing',grantedAt};
}
export function conversationGranted(agentId:string,grants:readonly Grant[],kind:string,now:string):boolean {
 const id=conversationGrantId(agentId,kind);
 return conversationGrantTargets(kind).length>0&&grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can save conversations" or "Can search conversations" on or off in Settings. */
export function conversationGrantAuditEntry(agentId:string,kind:string,granted:boolean,at:string):AgentAuditEntry {
 const what=kind==='add'?'save conversations':'search conversations';
 return {at,agentId,target:CONVERSATION_TARGET,action:(granted?'grant-':'ungrant-')+kind,decision:'allowed',grantId:conversationGrantId(agentId,kind),
  reason:granted?`The person let this Agent ${what} in Settings.`:`The person stopped this Agent being able to ${what} in Settings.`};
}
/** "Can see your tracked links" (`read`: links/read) and "Can keep your tracked links" (`save`: links/save) in Settings ›
 * Agent › Access (core/agent/GRANTS.md#tracked-links). Never part of the default Grants, and never given by a Fox turn.
 * Access is `read`: a row only changes the person's own table, which they can see and change back, and is not a guarded
 * write. */
export type LinkGrantKind='read'|'save';
export const LINK_GRANT_KINDS:readonly LinkGrantKind[]=Object.freeze(['read','save']);
export function linkGrantTargets(kind:string):string[] {
 return kind==='read'?[TRACKED_LINK_ACTIONS.read]:kind==='save'?[TRACKED_LINK_ACTIONS.save]:[];
}
export const linkGrantId=(agentId:string,kind:string)=>agentId+'-links-'+kind;
/** The standing Grant for one of the two, or null for anything else. Hosts build it from the kind only. */
export function linkGrant(agentId:string,kind:string,grantedAt:string):Grant|null {
 const targets=linkGrantTargets(kind);
 if(!targets.length||typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:linkGrantId(agentId,kind),agentId,targets,access:'read',duration:'standing',grantedAt};
}
export function linkGranted(agentId:string,grants:readonly Grant[],kind:string,now:string):boolean {
 const id=linkGrantId(agentId,kind);
 return linkGrantTargets(kind).length>0&&grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can see your tracked links" or "Can keep your tracked links" on or off. */
export function linkGrantAuditEntry(agentId:string,kind:string,granted:boolean,at:string):AgentAuditEntry {
 const what=kind==='save'?'keep your tracked links':'see your tracked links';
 return {at,agentId,target:TRACKED_LINK_TARGET,action:(granted?'grant-':'ungrant-')+kind,decision:'allowed',grantId:linkGrantId(agentId,kind),
  reason:granted?`The person let this Agent ${what} in Settings.`:`The person stopped this Agent being able to ${what} in Settings.`};
}
/** "Can report its work" (`report`: agents/report) and "Can see other Agents" (`list`: agents/list) in Settings › Agent
 * › Access (core/agent/GRANTS.md#agent-reports). Never part of the default Grants, and never given by a Fox turn. Access
 * is `read`: a report only changes what the person and other Agents see of this Agent, and is not a guarded write. */
export type ReportGrantKind='report'|'list';
export const REPORT_GRANT_KINDS:readonly ReportGrantKind[]=Object.freeze(['report','list']);
export function reportGrantTargets(kind:string):string[] {
 return kind==='report'?[AGENT_REPORT_ACTIONS.report]:kind==='list'?[AGENT_REPORT_ACTIONS.list]:[];
}
export const reportGrantId=(agentId:string,kind:string)=>agentId+'-agents-'+kind;
export function reportGrant(agentId:string,kind:string,grantedAt:string):Grant|null {
 const targets=reportGrantTargets(kind);
 if(!targets.length||typeof agentId!=='string'||!AGENT_ID_PATTERN.test(agentId))return null;
 return {id:reportGrantId(agentId,kind),agentId,targets,access:'read',duration:'standing',grantedAt};
}
export function reportGranted(agentId:string,grants:readonly Grant[],kind:string,now:string):boolean {
 const id=reportGrantId(agentId,kind);
 return reportGrantTargets(kind).length>0&&grants.some(grant=>grant.id===id&&grant.agentId===agentId&&grantActive(grant,now));
}
/** The audit entry for the person turning "Can report its work" or "Can see other Agents" on or off in Settings. */
export function reportGrantAuditEntry(agentId:string,kind:string,granted:boolean,at:string):AgentAuditEntry {
 const what=kind==='list'?'see other Agents':'report its work';
 return {at,agentId,target:AGENT_REPORT_TARGET,action:(granted?'grant-':'ungrant-')+kind,decision:'allowed',grantId:reportGrantId(agentId,kind),
  reason:granted?`The person let this Agent ${what} in Settings.`:`The person stopped this Agent being able to ${what} in Settings.`};
}
/** Targets only the calling Agent's own Grants decide: what it reaches is its own (its asks, its GitHub drafts, its
 * report) or the person's board, conversation archive, tracked links and Agents, so a Fox turn's Grant, which covers everything else,
 * never covers them. */
export const OWN_GRANT_TARGETS:readonly string[]=Object.freeze([AGENT_ASK_TARGET,BOARD_TARGET,GITHUB_DRAFT_TARGET,CONVERSATION_TARGET,TRACKED_LINK_TARGET,AGENT_REPORT_TARGET]);

/** While a Fox turn holds the standing server, its Agent's calls go to that turn (world-tool-bridge.ts standingTurn), as
 * they did before Grants: a call the turn's own stream announced is Fox's and runs under the turn's trust; any other
 * write waits for the person on the approval card. */
export function foxTurnGrant(agentId:string,own:boolean,grantedAt:string):Grant {
 return {id:own?'fox-turn':'fox-turn-other',agentId,targets:['*/*'],access:'write',duration:own?'standing':'once',grantedAt};
}

export type StandingCall={identity:AgentIdentity|null|undefined;grants:readonly Grant[];target:string;action:string;tool:string;args:Record<string,unknown>;
 /** The Fox turn the call goes to, and whether that turn announced it; null: a call of its own outside any Fox turn. */
 foxTurn:{own:boolean}|null;now:string};
/** What a refused call outside any Fox turn is told, by an Agent other than Hermes Agent (Claude Code or Codex,
 * registered by the Node host): the same as HERMES_CHANNEL_READ_ONLY, without naming a Hermes channel. */
export const STANDING_OUTSIDE_TURN='This came from outside a conversation with Fox in Worldlet: only reading, preparing a draft for the person to review in Worldlet and getting the World\'s browser link run here. Anything that changes the World needs the person\'s confirmation: ask them to do it with Fox in Worldlet.';
/** One standing-server call's decision. Inside a Fox turn the turn's trust applies when it runs. Outside any turn the
 * call is a turn of its own (hermesChannelTrust: untrusted, except the browser link); with nobody to ask, an `asked`
 * write is refused, and every refusal but a revoked or unknown Agent's says what such a call may do
 * (HERMES_CHANNEL_READ_ONLY for Hermes Agent, STANDING_OUTSIDE_TURN for another). */
export function standingCallDecision(call:StandingCall):GrantDecision {
 const {identity,target,action,tool,args,foxTurn,now}=call,writes=worldCallWrites(tool,args);
 // Asks and the board: only the Agent's own Grants decide them, never a Fox turn's.
 if(foxTurn&&!OWN_GRANT_TARGETS.includes(target)){
  const grants=identity?[...call.grants,foxTurnGrant(identity.id,foxTurn.own,now)]:[];
  return grantDecision({identity,grants,target,action,writes,now});
 }
 const turn=turnWriteAdmission(hermesChannelTrust({name:tool}),{type:'tool',name:tool,args});
 const result=grantDecision({identity,grants:call.grants,target,action,writes,turn,now});
 if(result.decision==='allowed'||result.reason===GRANT_REASONS.revoked||result.reason===GRANT_REASONS.unknown)return result;
 return {decision:'denied',...result.grantId?{grantId:result.grantId}:{},reason:identity?.harness==='hermes'?HERMES_CHANNEL_READ_ONLY:STANDING_OUTSIDE_TURN};
}
/** The actions `describe_world_tools` lists for this Agent: those its Grants (with the Fox turn's, when one holds the
 * server) name. */
export function standingActions(actions:WorldAction[],identity:AgentIdentity|null|undefined,grants:readonly Grant[],foxTurn:boolean,now:string):WorldAction[] {
 if(!identity||agentRevoked(identity,now))return [];
 const own=grants.filter(grant=>grant.agentId===identity.id&&grantActive(grant,now));
 const active=foxTurn?[...own,foxTurnGrant(identity.id,false,now)]:own;
 return grantedActions(actions,(target,action)=>(OWN_GRANT_TARGETS.includes(target)?own:active).some(grant=>grant.targets.some(pattern=>grantPatternMatches(pattern,target,action))));
}
