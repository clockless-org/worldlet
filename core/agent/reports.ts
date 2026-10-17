import {AGENT_LIVENESS,AGENT_REPORT_LIMITS,AGENT_REPORT_STATUSES,AGENT_RUN_STATUSES,type AgentListEntry,type AgentLiveness,type AgentReport,type AgentReportRun,type AgentReportStatus,type AgentReportWork,type AgentRunStatus} from '../../contracts/agent-reports.ts';
import {AGENT_ID_PATTERN,type AgentIdentity} from '../../contracts/agent-identity.ts';
import {looksSecret} from './agent-profile.ts';
import {agentRevoked} from './grants.ts';

/** Agent reports (contracts/agent-reports.ts, core/agent/GRANTS.md#agent-reports). Pure: hosts supply the stored
 * reports, the identities, the calling Agent's ID (from its token) and the clock, and save what comes back. Every
 * refusal throws an Error whose message the Agent is shown. */

export const REPORT_REASONS=Object.freeze({
 invalid:'This report is not valid.',
 secret:'Reports may not hold passwords, tokens or keys. Name the thing instead.',
 control:'Reports may not hold control characters or line breaks.',
 link:'A link must be one https address.',
 capacity:'Capacity is slots (1 to 100) and busy (0 to slots).',
});

const L=AGENT_REPORT_LIMITS;
const MINUTE=60_000;
// C0 and C1 controls, DEL and line breaks, and the bidirectional overrides that can make a line read differently from
// what it holds: a report is one-line text everywhere.
const CONTROL=/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const RUN_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(REPORT_REASONS.invalid);};

/** One line of clean text, or a refusal: control characters and anything that looks like a credential are refused. */
function text(value:unknown,limit:number,required=false):string {
 if(value===undefined||value===null||value===''){if(required)fail(REPORT_REASONS.invalid);return '';}
 if(typeof value!=='string')return fail(REPORT_REASONS.invalid);
 if(CONTROL.test(value))fail(REPORT_REASONS.control);
 const clean=value.trim();
 if(required&&!clean||[...clean].length>limit)fail(REPORT_REASONS.invalid);
 if(looksSecret(clean))fail(REPORT_REASONS.secret);
 return clean;
}
function link(value:unknown):string {
 if(typeof value!=='string'||[...value].length>L.link||!/^https:\/\/[^\s/?#@\\]+(?:[/?#][^\s\\]*)?$/i.test(value)||CONTROL.test(value)||looksSecret(value))return fail(REPORT_REASONS.link);
 return value;
}
function list<T>(value:unknown,limit:number,item:(entry:unknown)=>T):T[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>limit)return fail(REPORT_REASONS.invalid);
 return value.map(item);
}
const when=(value:unknown):string|undefined=>value===undefined?undefined:instant(value)?new Date(value).toISOString():fail(REPORT_REASONS.invalid);

function readWork(input:unknown):AgentReportWork {
 const value=record(input);only(value,['title','url','state','since']);
 const work:AgentReportWork={title:text(value.title,L.title,true)};
 if(value.url!==undefined)work.url=link(value.url);
 const state=text(value.state,L.state);if(state)work.state=state;
 const since=when(value.since);if(since)work.since=since;
 return work;
}
function readRun(input:unknown):AgentReportRun {
 const value=record(input);only(value,['id','title','status','url','startedAt','finishedAt']);
 if(typeof value.id!=='string'||!RUN_ID.test(value.id)||!AGENT_RUN_STATUSES.includes(value.status as AgentRunStatus))fail(REPORT_REASONS.invalid);
 const run:AgentReportRun={id:value.id as string,title:text(value.title,L.title,true),status:value.status as AgentRunStatus};
 if(value.url!==undefined)run.url=link(value.url);
 const started=when(value.startedAt),finished=when(value.finishedAt);
 if(started)run.startedAt=started;if(finished)run.finishedAt=finished;
 return run;
}

/** `agents/report`: the calling Agent's new report, replacing its last. `agentId` (the caller's own, from its token)
 * and `now` (the host's clock) are stamped; an `agentId` or `reportedAt` the model sent is dropped. An `observedAt`
 * later than the host's clock by more than AGENT_REPORT_LIMITS.aheadMinutes is refused; one not given is `now`. */
export function makeAgentReport(agentId:string,input:unknown,now:string):AgentReport {
 if(!AGENT_ID_PATTERN.test(agentId)||!instant(now))fail(REPORT_REASONS.invalid);
 const value={...record(input)};delete value.agentId;delete value.reportedAt;
 only(value,['status','summary','work','runs','capacity','role','tags','ttlMinutes','observedAt']);
 if(!AGENT_REPORT_STATUSES.includes(value.status as AgentReportStatus))fail(REPORT_REASONS.invalid);
 const ttl=value.ttlMinutes===undefined?L.ttlDefault:value.ttlMinutes;
 if(typeof ttl!=='number'||!Number.isInteger(ttl)||ttl<L.ttlMin||ttl>L.ttlMax)fail(REPORT_REASONS.invalid);
 const observed=when(value.observedAt)??new Date(now).toISOString();
 if(Date.parse(observed)>Date.parse(now)+L.aheadMinutes*MINUTE)fail(REPORT_REASONS.invalid);
 const tags=list(value.tags,L.tags,entry=>text(entry,L.tag,true).toLowerCase());
 if(new Set(tags).size!==tags.length)fail(REPORT_REASONS.invalid);
 const runs=list(value.runs,L.runs,readRun);
 if(new Set(runs.map(run=>run.id)).size!==runs.length)fail(REPORT_REASONS.invalid);
 const report:AgentReport={agentId,status:value.status as AgentReportStatus,summary:text(value.summary,L.summary),work:list(value.work,L.work,readWork),runs,tags,
  ttlMinutes:ttl as number,observedAt:observed,reportedAt:new Date(now).toISOString()};
 if(value.capacity!==undefined){
  const capacity=record(value.capacity);only(capacity,['slots','busy']);
  const {slots,busy}=capacity;
  if(!Number.isInteger(slots)||!Number.isInteger(busy)||(slots as number)<1||(slots as number)>L.slots||(busy as number)<0||(busy as number)>(slots as number))fail(REPORT_REASONS.capacity);
  report.capacity={slots:slots as number,busy:busy as number};
 }
 const role=text(value.role,L.role).toLowerCase();if(role)report.role=role;
 return report;
}

/** How a report reads at `now`: live within its time to live, then stale for AGENT_REPORT_LIMITS.staleTtls more of
 * them, then offline; offline at once when it said so, and with no report. Measured from when the host received it. */
export function agentLiveness(report:AgentReport|null|undefined,now:string):AgentLiveness {
 if(!report||report.status==='offline'||!instant(now))return 'offline';
 const age=Date.parse(now)-Date.parse(report.reportedAt),ttl=report.ttlMinutes*MINUTE;
 return age<ttl?'live':age<ttl*(1+L.staleTtls)?'stale':'offline';
}

/** `agents/list`: every Agent the person has not revoked, with how its report reads now, newest report first and Agents
 * with none last; optionally only the IDs it names, or one liveness. */
export function listAgents(identities:readonly AgentIdentity[],reports:readonly AgentReport[],input:unknown,now:string):AgentListEntry[] {
 const value=record(input);only(value,['ids','liveness']);
 if(value.liveness!==undefined&&!AGENT_LIVENESS.includes(value.liveness as AgentLiveness))fail(REPORT_REASONS.invalid);
 const ids=list(value.ids,50,entry=>typeof entry==='string'&&AGENT_ID_PATTERN.test(entry)?entry:fail(REPORT_REASONS.invalid));
 const at=(entry:AgentListEntry)=>entry.report?Date.parse(entry.report.reportedAt):0;
 return identities.filter(identity=>!agentRevoked(identity,now)&&(!ids.length||ids.includes(identity.id))).map(identity=>{
  const report=reports.find(item=>item.agentId===identity.id);
  return {id:identity.id,name:identity.name,harness:identity.harness,kind:identity.kind,liveness:agentLiveness(report,now),...report?{report}:{}} as AgentListEntry;
 }).filter(entry=>value.liveness===undefined||entry.liveness===value.liveness).sort((a,b)=>at(b)-at(a));
}

/** A stored report, checked; null when it is not one. */
export function readStoredReport(value:unknown):AgentReport|null {
 const v=record(value);
 if(typeof v.agentId!=='string'||!AGENT_ID_PATTERN.test(v.agentId)||!instant(v.reportedAt))return null;
 try{
  const report=makeAgentReport(v.agentId,{status:v.status,summary:v.summary,work:v.work,runs:v.runs,role:v.role,tags:v.tags,ttlMinutes:v.ttlMinutes,observedAt:v.observedAt,...v.capacity===undefined?{}:{capacity:v.capacity}},v.reportedAt);
  return {...report,reportedAt:new Date(v.reportedAt).toISOString()};
 }catch{return null;}
}
