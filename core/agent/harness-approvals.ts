// What an approval leaves behind (contracts/harness-services.ts `approvals` and HarnessApprovalFeatures): the standing
// rules an Always put in the person's Harness, read from where that Harness keeps them, and what an approved command
// or edit changed, as the Harness reported it when it finished. Shared rules only: reading Hermes Agent's
// `command_allowlist` and OpenClaw's approvals document and automation grants, the document without one rule, the
// World's own record of who granted what and in which thread, and one tracker that ties an approval to the tool call it
// let run (ACP tool-call content for Hermes Agent, the Gateway's tool events for OpenClaw). Running the Harness's CLI and
// its sockets is the host's job (agent-runtime/harness-approvals.ts, harness-sessions.ts). Kept ES-compatible for
// JavaScriptCore and Jint.
import type {HarnessApprovalChoice,HarnessApprovalResult,HarnessChangedFile,HarnessStandingRule} from '../../contracts/harness-services.ts';
import {hermesConfigValues} from './harness-tools.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const clip=(text:string,limit:number)=>text.length>limit?text.slice(0,limit)+'…':text;
const text=(value:unknown)=>typeof value==='string'?value:'';
const time=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.round(value):undefined;
/** A rule's id: short, printable and stable for the same rule (FNV-1a over its parts). */
export function standingRuleId(...parts:string[]):string {
 const joined=parts.join('\u0000');let hash=0x811c9dc5;
 for(let i=0;i<joined.length;i++){hash^=joined.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}
 let second=0x01000193;for(let i=joined.length-1;i>=0;i--){second^=joined.charCodeAt(i);second=Math.imul(second,0x811c9dc5)>>>0;}
 return 'rule-'+hash.toString(16).padStart(8,'0')+second.toString(16).padStart(8,'0');
}
export const isStandingRuleId=(value:unknown):value is string=>typeof value==='string'&&/^rule-[0-9a-f]{16}$/.test(value);

// Standing rules ------------------------------------------------------------------------------------------------

/** Hermes Agent: one profile's `command_allowlist` in its config.yaml, where an Always is saved (tools/approval.py
 * save_permanent_allowlist). Each entry is a dangerous-pattern key (the description its prompt showed), exact command
 * text or a shell glob; Hermes records no time for them. `main`: the profile Fox talks through by default. */
export function hermesStandingRules(yaml:string,agent:string,{main=false}:{main?:boolean}={}):HarnessStandingRule[] {
 const list=hermesConfigValues(yaml).command_allowlist;
 const entries=Array.isArray(list)?[...new Set(list.filter((item:unknown):item is string=>typeof item==='string'&&item.trim()!==''))]:[];
 return entries.slice(0,500).map(entry=>({id:standingRuleId('hermes',agent,entry),allows:clip(entry,300),agent,kind:'command' as const,...main?{main:true}:{}}));
}
/** The allowlist Hermes keeps now (`hermes config get command_allowlist --json --raw`) without `entry`, for `hermes
 * config set command_allowlist <json>`; null when the entry is not there. */
export function hermesAllowlistWithout(current:unknown,entry:string):string[]|null {
 const list=Array.isArray(current)?current.filter((item):item is string=>typeof item==='string'):[];
 return list.includes(entry)?list.filter(item=>item!==entry):null;
}

const ALL_AGENTS='*';
/** OpenClaw: its approvals document (`openclaw approvals get --json`, `.file`), per agent: the allowlist entries an
 * allow-always generated (`source: "allow-always"`: a resolved binary and, since 2026.8.1, its exact arguments in the
 * folder it was approved in) and MCP tool grants (`mcpTools`). Hand-written entries are the person's own policy, not
 * an Always, and stay out. `main`: the agent its document calls `main`, which Fox talks through unless one is chosen. */
export function openClawStandingRules(snapshot:unknown):HarnessStandingRule[] {
 const agents=record(record(record(snapshot).file).agents),rules:HarnessStandingRule[]=[];
 for(const [agent,value] of Object.entries(agents)){
  const entry=record(value),main=agent==='main'||agent===ALL_AGENTS;
  for(const item of (Array.isArray(entry.allowlist)?entry.allowlist:[]).map(record)){
   if(item.source!=='allow-always'||!text(item.pattern).trim())continue;
   const pattern=text(item.pattern).trim(),bound=text(item.argPattern)!=='';
   rules.push({id:standingRuleId('openclaw',agent,'allowlist',text(item.id)||pattern+'\u0000'+text(item.argPattern)),allows:clip(text(item.lastUsedCommand)||pattern,300),agent,kind:'command',
    ...time(item.lastUsedAt)?{lastUsedAt:time(item.lastUsedAt)}:{},note:bound?`${clip(pattern,200)}, with the exact arguments and folder it was approved in`:clip(pattern,200),...main?{main:true}:{}});
  }
  for(const item of (Array.isArray(entry.mcpTools)?entry.mcpTools:[]).map(record)){
   if(item.source!=='allow-always'||!text(item.server)||!text(item.tool))continue;
   rules.push({id:standingRuleId('openclaw',agent,'mcp',text(item.server),text(item.tool)),allows:clip(`${text(item.server)} › ${text(item.tool)}`,300),agent,kind:'tool',
    ...time(item.addedAt)?{grantedAt:time(item.addedAt)}:{},...time(item.lastUsedAt)?{lastUsedAt:time(item.lastUsedAt)}:{},note:'Any arguments',...main?{main:true}:{}});
  }
 }
 return rules.slice(0,500);
}
/** The approvals document without rule `id`, for `openclaw approvals set --stdin` (the documented way to remove a grant:
 * export the document, remove its entry, replace it); empty lists and agents go as `approvals allowlist remove`
 * leaves them. null when the rule is not there. */
export function openClawApprovalsWithout(snapshot:unknown,id:string):Record<string,any>|null {
 const file=JSON.parse(JSON.stringify(record(record(snapshot).file))) as Record<string,any>,agents=record(file.agents);
 for(const [agent,value] of Object.entries(agents)){
  const entry=record(value);
  for(const [key,match] of [['allowlist',(item:Record<string,any>)=>standingRuleId('openclaw',agent,'allowlist',text(item.id)||text(item.pattern).trim()+'\u0000'+text(item.argPattern))],
   ['mcpTools',(item:Record<string,any>)=>standingRuleId('openclaw',agent,'mcp',text(item.server),text(item.tool))]] as const){
   const list=Array.isArray(entry[key])?entry[key] as unknown[]:[];
   const index=list.findIndex(item=>record(item).source==='allow-always'&&match(record(item))===id);
   if(index<0)continue;
   list.splice(index,1);
   if(!list.length)delete entry[key];
   if(!Object.keys(entry).length)delete agents[agent];
   if(!Object.keys(agents).length)delete file.agents;
   file.version=1;
   return file;
  }
 }
 return null;
}
/** OpenClaw's standing grants for automations (`openclaw approvals grants list --json`): an Always on a cron run's
 * approval, bound to that job and its exact command. Only the ones still in force; `grant` is what revoke names. */
export function openClawGrantRules(result:unknown,now=Date.now()):(HarnessStandingRule&{grant:string})[] {
 const grants=Array.isArray(record(result).grants)?record(result).grants.map(record):[];
 return grants.filter(g=>typeof g.grantId==='string'&&g.grantId&&g.revokedAtMs==null&&(g.expiresAtMs==null||Number(g.expiresAtMs)>now)).slice(0,200).map(g=>{
  const agent=text(g.agentId)||'main';
  return {id:standingRuleId('openclaw','grant',g.grantId),grant:g.grantId,allows:clip(text(g.command)||text(g.operationBinding)||'A command',300),agent,kind:'automation' as const,
   ...time(g.createdAtMs)?{grantedAt:time(g.createdAtMs)}:{},...time(g.lastUsedAtMs)?{lastUsedAt:time(g.lastUsedAtMs)}:{},
   note:'Automation '+clip(text(g.cronJobName)||text(g.cronJobId)||'job',80)+(g.expiresAtMs!=null?', until '+new Date(Number(g.expiresAtMs)).toISOString().slice(0,10):''),...agent==='main'?{main:true}:{}};
 });
}

// Who granted it, and where (the World's own record) ----------------------------------------------------------------
// The Harness keeps what is allowed, not who said Always or in which conversation. Worldlet records each Always the
// person gives in the World (world.sqlite setting `approval-grants`) and matches it to the rule it left.

export type ApprovalGrant={harness:string;agent:string;rule:string;thread:string;at:number;title:string};
const GRANTS=200;
export function readApprovalGrants(value:unknown):ApprovalGrant[] {
 const list=Array.isArray(record(value).grants)?record(value).grants.map(record):[];
 return list.filter(g=>typeof g.harness==='string'&&typeof g.rule==='string'&&g.rule&&Number.isFinite(g.at)).slice(0,GRANTS)
  .map(g=>({harness:clip(g.harness,64),agent:typeof g.agent==='string'?clip(g.agent,64):'',rule:clip(g.rule,300),thread:typeof g.thread==='string'?clip(g.thread,240):'main',at:Number(g.at),title:typeof g.title==='string'?clip(g.title,200):''}));
}
/** The record with one more Always, newest first; the same rule granted again keeps its first grant. */
export function rememberApprovalGrant(value:unknown,grant:ApprovalGrant):{grants:ApprovalGrant[]} {
 const grants=readApprovalGrants(value);
 if(grants.some(g=>g.harness===grant.harness&&g.agent===grant.agent&&g.rule===grant.rule))return {grants};
 return {grants:[...readApprovalGrants({grants:[grant]}),...grants].slice(0,GRANTS)};
}
/** A command's program, for a rule kept as a binary path or name (OpenClaw's allowlist). */
const program=(command:string)=>{const first=command.trim().split(/[\s,]+/)[0]??'';return first.replace(/^.*[\\/]/,'').replace(/[*?[\]{}]/g,'').toLowerCase();};
/** The World's grant behind `rule`, when it gave one: the same agent (none: the main one) and the same rule, or for a
 * rule kept as a program the same program. */
export function approvalGrantFor(rule:HarnessStandingRule,harness:string,grants:readonly ApprovalGrant[]):ApprovalGrant|null {
 const own=grants.filter(g=>g.harness===harness&&(g.agent?g.agent===rule.agent||rule.agent===ALL_AGENTS:rule.main===true));
 return own.find(g=>g.rule===rule.allows)??(rule.kind==='command'?own.find(g=>program(g.rule)!==''&&program(g.rule)===program(rule.note??rule.allows)):undefined)??null;
}
/** Where a grant was given, in words: the Fox thread a resident session carries (core harnessSessionThread). */
export function approvalThreadLabel(thread:string):string {
 if(thread.startsWith('applet:')&&thread.length>7)return 'In the '+clip(thread.slice(7),60)+' Applet';
 if(thread.startsWith('item:')&&thread.length>5)return 'On an item’s card';
 return 'In Fox’s main conversation';
}

// What an approved action changed -----------------------------------------------------------------------------------

/** A line diff of one file, small enough for a card: the changed lines with two lines of context, `-` before `+`. */
export function lineDiff(before:string|null,after:string,limit=120):string {
 const a=before===null?[]:before.split('\n'),b=after.split('\n');
 let start=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 let endA=a.length,endB=b.length;while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
 const lines=[...a.slice(Math.max(0,start-2),start).map(line=>' '+line),...a.slice(start,endA).map(line=>'-'+line),...b.slice(start,endB).map(line=>'+'+line),...a.slice(endA,endA+2).map(line=>' '+line)];
 const shown=lines.slice(0,limit);
 if(lines.length>limit)shown.push(`… ${lines.length-limit} more lines`);
 return shown.map(line=>clip(line,400)).join('\n');
}
type Call={files:HarnessChangedFile[];output:string;done:boolean;failed:boolean};
type Watch={id:string;call:string|null;files:HarnessChangedFile[];choice:HarnessApprovalChoice|null};
/** One turn's tool calls and the approvals waiting on them. An approval belongs to the tool call running when it was
 * asked (a Harness asks from inside the call), else the next one that starts; when that call finishes and the person
 * allowed it, its result is reported once. */
export interface ApprovalChanges {calls:Record<string,Call>;order:string[];watches:Watch[];reported:boolean}
/** `reported`: whether this Harness reports the files an action changed (`changes: diffs`) or only its output. */
export const approvalChanges=({reported=true}:{reported?:boolean}={}):ApprovalChanges=>({calls:{},order:[],watches:[],reported});
const running=(state:ApprovalChanges)=>{for(let i=state.order.length-1;i>=0;i--){const call=state.calls[state.order[i]];if(call&&!call.done)return state.order[i];}return null;};
/** A request was put to the person; `call` names its tool call when the Harness says so, `files` what it proposes. */
export function changesAsked(state:ApprovalChanges,id:string,{call=null,files=[]}:{call?:string|null;files?:HarnessChangedFile[]}={}){
 const bound=call&&state.calls[call]&&!state.calls[call].done?call:running(state);
 state.watches.push({id,call:bound,files,choice:null});
 if(state.watches.length>20)state.watches.shift();
}
/** The person's answer; a denied one reports nothing. Returns the result when its call already finished. */
export function changesAnswered(state:ApprovalChanges,id:string,choice:HarnessApprovalChoice|null):HarnessApprovalResult[] {
 const watch=state.watches.find(w=>w.id===id);if(!watch)return [];
 if(!choice||choice==='deny'){state.watches=state.watches.filter(w=>w!==watch);return [];}
 watch.choice=choice;
 return watch.call&&state.calls[watch.call]?.done?settle(state,watch.call):[];
}
/** A tool call started or reported more: its diffs, output and whether it finished (`status` completed or failed). */
export function changesCall(state:ApprovalChanges,id:string,{files=[],output='',status=''}:{files?:HarnessChangedFile[];output?:string;status?:string}):HarnessApprovalResult[] {
 let call=state.calls[id];
 if(!call){
  call=state.calls[id]={files:[],output:'',done:false,failed:false};state.order.push(id);
  if(state.order.length>200)delete state.calls[state.order.shift()!];
  for(const watch of state.watches)if(watch.call===null){watch.call=id;break;}
 }
 for(const file of files){const at=call.files.findIndex(f=>f.path===file.path);if(at>=0)call.files[at]=file;else call.files.push(file);}
 if(output)call.output=clip(output,4000);
 if(status==='completed'||status==='failed'){call.done=true;call.failed=status==='failed';return settle(state,id);}
 return [];
}
function settle(state:ApprovalChanges,id:string):HarnessApprovalResult[] {
 const call=state.calls[id],results:HarnessApprovalResult[]=[];
 for(const watch of state.watches.filter(w=>w.call===id&&w.choice)){
  state.watches=state.watches.filter(w=>w!==watch);
  // What the call reported wins; an edit it reported nothing for keeps the diff its request proposed.
  const files=call.files.length?call.files:call.failed?[]:watch.files;
  results.push({id:watch.id,status:call.failed?'failed':'completed',files:files.slice(0,20),reported:state.reported||files.length>0,...call.output?{output:call.output}:{}});
 }
 return results;
}

/** ACP tool-call content (a `diff` block: path, oldText, newText) as changed files. */
export function acpChangedFiles(content:unknown):HarnessChangedFile[] {
 return (Array.isArray(content)?content.map(record):[]).filter(block=>block.type==='diff'&&typeof block.path==='string'&&block.path&&typeof block.newText==='string').slice(0,20).map(block=>{
  const before=typeof block.oldText==='string'?block.oldText:null;
  return {path:clip(block.path,400),change:before===null?'add' as const:block.newText===''?'delete' as const:'edit' as const,diff:lineDiff(before,block.newText)};
 });
}
const acpText=(content:unknown)=>(Array.isArray(content)?content.map(record):[]).map(block=>block.type==='content'?text(record(block.content).text):block.type==='text'?text(block.text):'').filter(Boolean).join('\n');
/** One ACP `session/update`: a `tool_call` starting or a `tool_call_update`, fed to the tracker. */
export function acpChangesUpdate(state:ApprovalChanges,value:unknown):HarnessApprovalResult[] {
 const update=record(value);
 if((update.sessionUpdate!=='tool_call'&&update.sessionUpdate!=='tool_call_update')||typeof update.toolCallId!=='string'||!update.toolCallId)return [];
 return changesCall(state,update.toolCallId,{files:acpChangedFiles(update.content),output:acpText(update.content)||text(update.rawOutput),status:text(update.status)});
}
/** A `session/request_permission`: its tool call (when it is one the session started) and the edit it proposes. */
export function acpChangesAsked(state:ApprovalChanges,id:string,params:unknown){
 const call=record(record(params).toolCall);
 changesAsked(state,id,{call:typeof call.toolCallId==='string'?call.toolCallId:null,files:acpChangedFiles(call.content)});
}

/** OpenClaw's tool result as text: a string, its text blocks, or the exec details' output. */
function openClawOutput(result:unknown):string {
 if(typeof result==='string')return result;
 const r=record(result),blocks=Array.isArray(r.content)?r.content.map(record).filter(b=>b.type==='text').map(b=>text(b.text)).join('\n'):'';
 const details=record(r.details);
 return blocks||text(details.aggregated)||text(details.output)||'';
}
/** One Gateway `agent` / `session.tool` event for the turn's session (`stream: "tool"`, `data.phase` start, update or
 * result; `stream: "approval"` names the approval's tool call), fed to the tracker. OpenClaw reports an exec's output
 * and exit, never which files it changed. */
export function openClawChangesEvent(state:ApprovalChanges,payload:unknown):HarnessApprovalResult[] {
 const p=record(payload),data=record(p.data);
 if(typeof data.toolCallId!=='string'||!data.toolCallId)return [];
 if(p.stream==='approval'){const watch=state.watches.find(w=>w.id===data.approvalId);if(watch&&state.calls[data.toolCallId])watch.call=data.toolCallId;return [];}
 if(p.stream!=='tool')return [];
 const phase=text(data.phase),exit=record(record(data.result).details).exitCode;
 const output=phase==='result'?openClawOutput(data.result)+(typeof exit==='number'?`\n(exit code ${exit})`:''):'';
 return changesCall(state,data.toolCallId,{output:output.trim(),status:phase==='result'?(data.isError===true?'failed':'completed'):''});
}
