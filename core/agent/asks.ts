import {AGENT_ASK_KINDS,AGENT_ASK_LIMITS,AGENT_ASK_PROVIDER,AGENT_ASK_STATUSES,type AgentAsk,type AgentAskClaim,type AgentAskKind,type AgentAskPost,type AgentAskReply,type AgentAskResolve,type AgentAskStatus} from '../../contracts/agent-asks.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import type {WorldItem} from '../../contracts/world.ts';
import {looksSecret} from './agent-profile.ts';

/** Agent asks (contracts/agent-asks.ts, core/agent/GRANTS.md#agent-asks). Pure: hosts supply the stored asks, the
 * calling Agent's ID (from its token), new IDs and the clock, and save what comes back. Every refusal throws an Error
 * whose message the Agent or the page is shown. */

export const ASK_REASONS=Object.freeze({
 invalid:'This ask is not valid.',
 secret:'Asks may not hold passwords, tokens or keys. Name the thing instead.',
 control:'Asks may not hold control characters.',
 link:'A link must be one https address.',
 full:`This Agent already has ${AGENT_ASK_LIMITS.openPerAgent} open asks. Wait for the person to answer some first.`,
 missing:'No such ask.',
 notYours:'This ask was not claimed by this Agent.',
 stale:'This ask changed since it was read. Read it again before resolving it.',
 settled:'This ask is already settled.',
 choice:'Choose one of the ask\'s own choices.',
});

/** An ask ID: host-made, file-name safe. */
export const ASK_ID_PATTERN=/^[a-z0-9][a-z0-9-]{7,63}$/;
const LEASE_MS=AGENT_ASK_LIMITS.leaseMinutes*60_000;
// C0 controls (except tab and line breaks, allowed in multi-line text only), DEL, C1 controls, and the bidirectional
// overrides that can make a card read differently from what it holds.
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const LINE_BREAK=/[\t\r\n]/;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const count=(value:string)=>[...value].length;
const fail=(reason:string):never=>{throw new Error(reason);};

/** Clean text, or a refusal: control characters and anything that looks like a credential are refused, never kept. */
function text(value:unknown,limit:number,{multiline=false,required=false}={}):string {
 if(value===undefined||value===null||value===''){if(required)fail(ASK_REASONS.invalid);return '';}
 if(typeof value!=='string')return fail(ASK_REASONS.invalid);
 if(CONTROL.test(value)||!multiline&&LINE_BREAK.test(value))fail(ASK_REASONS.control);
 const clean=value.replace(/\r\n?/g,'\n').trim();
 if(required&&!clean||count(clean)>limit)fail(ASK_REASONS.invalid);
 if(looksSecret(clean))fail(ASK_REASONS.secret);
 return clean;
}
/** One https link with a host and no user name or password, or a refusal. */
export function askLink(value:unknown):string {
 if(typeof value!=='string'||count(value)>AGENT_ASK_LIMITS.link||!/^https:\/\/[^\s/?#@\\]+(?:[/?#][^\s\\]*)?$/i.test(value)||CONTROL.test(value)||looksSecret(value))return fail(ASK_REASONS.link);
 return value;
}
function list(value:unknown,limit:number,item:(entry:unknown)=>string):string[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>limit)return fail(ASK_REASONS.invalid);
 const items=value.map(item);
 if(new Set(items).size!==items.length)fail(ASK_REASONS.invalid);
 return items;
}
const only=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(ASK_REASONS.invalid);};

/** `asks/post` arguments, checked. An `agentId` the model sent is dropped: the host stamps the caller's own. */
export function readAskPost(input:unknown):AgentAskPost {
 const value={...record(input)};delete value.agentId;
 only(value,['kind','title','body','choices','link','tags']);
 const kind=value.kind===undefined?'ask':value.kind;
 if(!AGENT_ASK_KINDS.includes(kind as AgentAskKind))fail(ASK_REASONS.invalid);
 const post:AgentAskPost={kind:kind as AgentAskKind,title:text(value.title,AGENT_ASK_LIMITS.title,{required:true})};
 const body=text(value.body,AGENT_ASK_LIMITS.body,{multiline:true});if(body)post.body=body;
 const choices=list(value.choices,AGENT_ASK_LIMITS.choices,entry=>text(entry,AGENT_ASK_LIMITS.choice,{required:true}));if(choices.length)post.choices=choices;
 if(value.link!==undefined)post.link=askLink(value.link);
 const tags=list(value.tags,AGENT_ASK_LIMITS.tags,entry=>text(entry,AGENT_ASK_LIMITS.tag,{required:true}).toLowerCase());if(tags.length)post.tags=tags;
 return post;
}

/** Whether an ask still waits on someone: the person, or an Agent holding it. */
export const askOpen=(ask:AgentAsk)=>ask.status==='open'||ask.status==='claimed';

/** A new ask from `agentId` (the caller's own, from its token). Refused when the input is not valid or this Agent
 * already has AGENT_ASK_LIMITS.openPerAgent open asks. */
export function postAsk(asks:readonly AgentAsk[],agentId:string,input:unknown,id:string,now:string):AgentAsk {
 if(!AGENT_ID_PATTERN.test(agentId)||!ASK_ID_PATTERN.test(id)||!instant(now))fail(ASK_REASONS.invalid);
 const post=readAskPost(input);
 if(asks.filter(ask=>ask.agentId===agentId&&askOpen(ask)).length>=AGENT_ASK_LIMITS.openPerAgent)fail(ASK_REASONS.full);
 if(asks.some(ask=>ask.id===id))fail(ASK_REASONS.invalid);
 return {id,agentId,kind:post.kind??'ask',title:post.title,body:post.body??'',choices:post.choices??[],...post.link?{link:post.link}:{},
  status:'open',tags:post.tags??[],revision:1,createdAt:now,updatedAt:now};
}

/** `asks/read`: the caller's own asks (posted by it, or claimed by it), newest first, optionally of one status or the
 * IDs it names. Another Agent's asks are never returned. */
export function readAsks(asks:readonly AgentAsk[],agentId:string,input:unknown={}):AgentAsk[] {
 const value=record(input);only(value,['status','ids']);
 if(value.status!==undefined&&!AGENT_ASK_STATUSES.includes(value.status as AgentAskStatus))fail(ASK_REASONS.invalid);
 const ids=list(value.ids,AGENT_ASK_LIMITS.read,entry=>typeof entry==='string'&&ASK_ID_PATTERN.test(entry)?entry:fail(ASK_REASONS.invalid));
 return asks.filter(ask=>(ask.agentId===agentId||ask.claimedBy===agentId)&&(value.status===undefined||ask.status===value.status)&&(!ids.length||ids.includes(ask.id)))
  .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,AGENT_ASK_LIMITS.read);
}

/** Whether an Agent may claim this ask now: `input` work that is open, or whose lease ran out. */
export function askClaimable(ask:AgentAsk,now:string):boolean {
 if(ask.kind!=='input')return false;
 if(ask.status==='open')return true;
 return ask.status==='claimed'&&(!instant(ask.claimedAt)||Date.parse(ask.claimedAt)+LEASE_MS<=Date.parse(now));
}
/** `asks/claim`: the named asks, or the oldest claimable ones, at most AGENT_ASK_LIMITS.claim. Returns only the asks it
 * claimed, each with a new lease and revision; a named ask that is not claimable now is left out. */
export function claimAsks(asks:readonly AgentAsk[],agentId:string,input:unknown,now:string):AgentAsk[] {
 if(!AGENT_ID_PATTERN.test(agentId)||!instant(now))fail(ASK_REASONS.invalid);
 const value=record(input);only(value,['ids','limit']);
 const ids=list(value.ids,AGENT_ASK_LIMITS.claim,entry=>typeof entry==='string'&&ASK_ID_PATTERN.test(entry)?entry:fail(ASK_REASONS.invalid));
 const limit=value.limit===undefined?AGENT_ASK_LIMITS.claim:value.limit;
 if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>AGENT_ASK_LIMITS.claim)fail(ASK_REASONS.invalid);
 return asks.filter(ask=>(!ids.length||ids.includes(ask.id))&&askClaimable(ask,now))
  .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).slice(0,limit as number)
  .map(ask=>({...ask,status:'claimed',claimedBy:agentId,claimedAt:now,revision:ask.revision+1,updatedAt:now}));
}

/** `asks/resolve`, by the Agent holding the claim: done, with its note and links. Refused when another Agent holds it
 * (or nobody does), and when `expectedRevision` is not the ask's revision now. */
export function resolveAsk(ask:AgentAsk|null|undefined,agentId:string,input:unknown,now:string):AgentAsk {
 const value=record(input);only(value,['id','note','links','expectedRevision']);
 if(!ask||ask.id!==value.id)return fail(ASK_REASONS.missing);
 if(ask.status!=='claimed'||ask.claimedBy!==agentId)fail(ASK_REASONS.notYours);
 if(value.expectedRevision!==ask.revision)fail(ASK_REASONS.stale);
 const resolve:AgentAskResolve={id:ask.id,note:text(value.note,AGENT_ASK_LIMITS.note,{multiline:true,required:true}),links:list(value.links,AGENT_ASK_LIMITS.links,askLink),expectedRevision:ask.revision};
 return {...ask,status:'done',resolution:{note:resolve.note,links:resolve.links??[],at:now},revision:ask.revision+1,updatedAt:now};
}

/** The person's answer on the ask's Attention card: one of its choices and an optional note, or Done, or Dismiss.
 * Only an ask still open (or claimed) takes one. */
export function readAskReply(input:unknown):AgentAskReply {
 const value=record(input);only(value,['id','outcome','choice','note']);
 if(typeof value.id!=='string'||!ASK_ID_PATTERN.test(value.id)||!['answered','done','skipped'].includes(value.outcome as string))fail(ASK_REASONS.invalid);
 const reply:AgentAskReply={id:value.id as string,outcome:value.outcome as AgentAskReply['outcome']};
 const choice=text(value.choice,AGENT_ASK_LIMITS.choice),note=text(value.note,AGENT_ASK_LIMITS.note,{multiline:true});
 if(choice)reply.choice=choice;if(note)reply.note=note;
 if(reply.outcome==='answered'&&!choice&&!note)fail(ASK_REASONS.invalid);
 if(reply.outcome!=='answered'&&choice)fail(ASK_REASONS.invalid);
 return reply;
}
export function answerAsk(ask:AgentAsk|null|undefined,input:unknown,now:string):AgentAsk {
 const reply=readAskReply(input);
 if(!ask||ask.id!==reply.id)return fail(ASK_REASONS.missing);
 if(!askOpen(ask))fail(ASK_REASONS.settled);
 if(reply.choice!==undefined&&!ask.choices.includes(reply.choice))fail(ASK_REASONS.choice);
 const answer={...reply.choice?{choice:reply.choice}:{},...reply.note?{note:reply.note}:{},at:now};
 return {...ask,status:reply.outcome,...reply.outcome==='skipped'&&!reply.note?{}:{answer},revision:ask.revision+1,updatedAt:now};
}

/** A stored ask, checked; null when it is not one. */
export function readStoredAsk(value:unknown):AgentAsk|null {
 const v=record(value);
 if(typeof v.id!=='string'||!ASK_ID_PATTERN.test(v.id)||typeof v.agentId!=='string'||!AGENT_ID_PATTERN.test(v.agentId)||!AGENT_ASK_KINDS.includes(v.kind as AgentAskKind)
  ||!AGENT_ASK_STATUSES.includes(v.status as AgentAskStatus)||typeof v.title!=='string'||!v.title||typeof v.body!=='string'
  ||!Number.isInteger(v.revision)||(v.revision as number)<1||!instant(v.createdAt)||!instant(v.updatedAt))return null;
 const strings=(items:unknown)=>Array.isArray(items)?items.filter((item):item is string=>typeof item==='string'):[];
 const ask:AgentAsk={id:v.id,agentId:v.agentId,kind:v.kind as AgentAskKind,title:v.title,body:v.body,choices:strings(v.choices).slice(0,AGENT_ASK_LIMITS.choices),
  status:v.status as AgentAskStatus,tags:strings(v.tags),revision:v.revision as number,createdAt:v.createdAt,updatedAt:v.updatedAt};
 if(typeof v.link==='string')ask.link=v.link;
 if(typeof v.claimedBy==='string'&&AGENT_ID_PATTERN.test(v.claimedBy))ask.claimedBy=v.claimedBy;
 if(instant(v.claimedAt))ask.claimedAt=v.claimedAt;
 const answer=record(v.answer),resolution=record(v.resolution);
 if(instant(answer.at))ask.answer={...typeof answer.choice==='string'?{choice:answer.choice}:{},...typeof answer.note==='string'?{note:answer.note}:{},at:answer.at};
 if(instant(resolution.at)&&typeof resolution.note==='string')ask.resolution={note:resolution.note,links:strings(resolution.links),at:resolution.at};
 return ask;
}

/** The World item ID of an ask's Attention card. */
export const askItemId=(askId:string)=>'ask-'+askId;
const ITEM_STATUS:Record<AgentAskStatus,'open'|'done'|'dismissed'>={open:'open',claimed:'open',answered:'done',done:'done',skipped:'dismissed'};
/** The ask as an Attention item (provider `agents`), written by the host with no model: a task when it offers choices,
 * otherwise an update. It carries the posting Agent's ID, so the card names which Agent asks, and the ask's own ID,
 * revision and choices, so the card answers this ask and no other. `agentName` is the name the person knows it by. */
export function askAttentionItem(ask:AgentAsk,agentName:string):WorldItem {
 let name=ask.agentId;try{name=text(agentName,80)||ask.agentId;}catch{}
 const kind=ask.choices.length?'task':'update';
 const context=[...(ask.body||ask.title)].slice(0,1200).join(''),reason=[...(name+(ask.kind==='input'?' left work for Agents':' asks you'))].slice(0,56).join('');
 // Written by the host, not a model: its content is final as it stands (attentionContentVersion 1), and the card shows it.
 return {id:askItemId(ask.id),provider:AGENT_ASK_PROVIDER,kind,status:ITEM_STATUS[ask.status],title:ask.title,context,reason,summary:context,attentionContentVersion:1,
  ...kind==='task'?{attentionReason:[...(name+' asks you to choose.')].slice(0,600).join('')}:{},
  sources:[{provider:AGENT_ASK_PROVIDER,id:ask.id,quote:[...ask.title].slice(0,1000).join(''),...ask.link?{url:ask.link}:{}}],
  agentId:ask.agentId,agentName:name,askId:ask.id,askKind:ask.kind,askRevision:ask.revision,askStatus:ask.status,askChoices:[...ask.choices],
  ...ask.answer?.choice?{askChoice:ask.answer.choice}:{},createdAt:ask.createdAt,updatedAt:ask.updatedAt};
}
