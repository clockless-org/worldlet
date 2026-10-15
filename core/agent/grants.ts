import {AGENT_ID_PATTERN,type AgentAuditEntry,type AgentIdentity,type Grant} from '../../contracts/agent-identity.ts';

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

const escape=(part:string)=>part.replace(/[.+?^${}()|[\]\\]/g,'\\$&');
/** Whether one `target/action` pattern covers this call. `*` matches any run of characters, including `/`. */
export function grantPatternMatches(pattern:string,target:string,action:string):boolean {
 if(typeof pattern!=='string'||!pattern.includes('/'))return false;
 return new RegExp('^'+pattern.split('*').map(escape).join('.*')+'$').test(target+'/'+action);
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
 return grant;
}
