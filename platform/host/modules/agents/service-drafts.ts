import crypto from 'node:crypto';
import {AGENT_AUDIT_KEEP,SERVICE_DRAFT_MESSAGES,SERVICE_DRAFT_REASONS,makeServiceDraft,readServiceDraftCreate,readServiceDraftTarget,readServiceDrafts,readStoredServiceDraft,serviceDraftAttentionItem,
 serviceDraftChange,serviceDraftItemId,serviceDraftPending,settleServiceDraft,writeServiceDraft,type ServiceDraftIO} from '../../../../agent/gate/index.ts';
import {SERVICE_DRAFT_PROVIDERS,serviceDraftTarget,type ServiceDraft,type ServiceDraftProvider} from '../../../../contracts/service-drafts.ts';
import type {AgentAuditEntry} from '../../../../contracts/agent-identity.ts';
import type {McpSession} from '../../../../context/connectors/index.ts';
import type {PosthogRequest} from '../../../../agent/gate/index.ts';
import type {PosthogSettings} from '../../../../context/connectors/index.ts';
import {contextReader,contextWriter} from '../../../../context/store/index.ts';
import {ledgerContext} from '../../store/context-storage.ts';
import type {Row} from './types.ts';

// PostHog and Notion drafts (agent/gate/GRANTS.md#posthog-and-notion-drafts), as GitHub drafts are kept
// (github-drafts.ts). Core decides and plans each read and write; this keeps the records and lends Core the World's own
// connections: each draft in the World's ledger (`state.service-drafts` in world.sqlite) beside its Attention item
// (provider `agents`), PostHog's requests over the personal API key the World keeps (sources/service-source.ts) and
// Notion's over the World's Notion connection (sources/mcp-source.ts). The key and the Notion sign-in never reach this
// module, an Agent, a page, an audit entry, a log or an event; every error here is one of Core's or this module's own
// sentences, never a message that could carry a request.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type ServiceDraftLedger={
 serviceDrafts():Row[];
 saveServiceDraft(draft:Row,item:Row,origin:'user'|'agent'):void;
 value(bucket:string,id:string):Row|null;
 recordAgentAudit(entry:Row,keep:number):boolean;
};
/** The World's connections, opened for one draft: PostHog's settings and request function, and a Notion session the
 * module closes when done. Either is null when that Service is not connected. */
export type ServiceDraftConnections={
 posthog():{settings:PosthogSettings;request:PosthogRequest}|null;
 notion():(McpSession&{close():Promise<void>})|null;
};
export interface ServiceDrafts {
 /** One `service_drafts` call (`<provider>-drafts/create` or `read`; `provider` set by the gateway) by `agentId`,
  * already admitted by its Grants. */
 call(agentId:string,args:Row):Promise<Row>;
 /** The person chose Approve on the draft's card (`serviceDraft` `approve`): read the target again, refuse when it
  * changed, otherwise write once. */
 approve(id:unknown):Promise<Row>;
 /** The person chose Dismiss (`serviceDraft` `dismiss`): nothing is written. */
 dismiss(id:unknown):Row;
 /** What became of these drafts, for the asks that carry them (agent-asks.ts). */
 summaries(ids:readonly string[]):{id:string;agentId:string;service:ServiceDraftProvider;status:string;resultUrl?:string;reason?:string}[];
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';
const error=(message:string):never=>{throw new Error(message);};
const own=(value:unknown)=>value instanceof Error&&value.message?value.message:'Could not do that.';

export function createServiceDrafts({ledger,connections,name,changed,now=()=>new Date().toISOString(),newId=()=>crypto.randomUUID()}:
 {ledger:()=>ServiceDraftLedger|null;connections:()=>ServiceDraftConnections|null;name:(agentId:string)=>string;changed:()=>void;now?:()=>string;newId?:()=>string}):ServiceDrafts {
 const load=(db:ServiceDraftLedger)=>contextReader(ledgerContext(db)).bodies('service-drafts').flatMap(row=>{const draft=readStoredServiceDraft(row);return draft?[draft]:[];});
 // Through the one way in to Context (#676): who writes decides whether the item's status is the person's or the Agent's.
 const save=(db:ServiceDraftLedger,draft:ServiceDraft,origin:'user'|'agent')=>contextWriter(ledgerContext(db),origin==='user'?{by:'person'}:{by:'agent',id:draft.agentId})
  .write('service-drafts',{save:[draft as unknown as Row],with:{item:serviceDraftAttentionItem(draft,name(draft.agentId)) as Row}});
 const audit=(db:ServiceDraftLedger,draft:ServiceDraft,action:string,decision:AgentAuditEntry['decision'],reason:string,at:string)=>{
  try{db.recordAgentAudit({at,agentId:draft.agentId,target:serviceDraftTarget(draft.provider),action,decision,reason:[...reason].slice(0,300).join('')},AGENT_AUDIT_KEEP);}catch{}
 };
 // Done or Dismiss on the draft's card through the ordinary item status (a phone, a browser on another device): the
 // draft is dismissed. Approving needs this computer (`serviceDraft`), so neither writes anything.
 const settle=(db:ServiceDraftLedger,drafts:ServiceDraft[],at:string)=>drafts.map(draft=>{
  if(!serviceDraftPending(draft))return draft;
  const item=contextReader(ledgerContext(db)).get('attention-items',serviceDraftItemId(draft.id))?.body;
  if(item?.statusOrigin!=='user'||item.status!=='done'&&item.status!=='dismissed')return draft;
  const next=settleServiceDraft(draft,'dismissed',at);
  save(db,next,'user');audit(db,next,'dismiss','allowed','The person settled this draft\'s card without approving it; nothing was written.',at);
  return next;
 });
 /** The one Service's connection for `run`, its errors in Core's or this module's words only. */
 async function using<T>(provider:ServiceDraftProvider,run:(io:ServiceDraftIO)=>Promise<T>):Promise<T> {
  const open=connections();
  if(provider==='posthog'){
   const posthog=open?.posthog()??null;
   if(!posthog)return error(SERVICE_DRAFT_MESSAGES.posthogMissing);
   // A request PostHog did not answer says so in the host's own words (service-source.ts), never with the key.
   return run({posthog:{settings:posthog.settings,request:async(method,path,body)=>{try{return await posthog.request(method,path,body);}catch(failure){throw new Error(own(failure));}}}});
  }
  const session=open?.notion()??null;
  if(!session)return error(SERVICE_DRAFT_MESSAGES.notionMissing);
  // A Notion call that fails (signed out, not answering) is said here, in this module's words.
  const notion:McpSession={
   callTool:async(tool,args,timeout)=>{try{return await session.callTool(tool,args,timeout);}catch{throw new Error(SERVICE_DRAFT_MESSAGES.unreadable('notion'));}},
   listTools:async()=>{try{return await session.listTools();}catch{throw new Error(SERVICE_DRAFT_MESSAGES.unreadable('notion'));}},
  };
  try{return await run({notion});}finally{void session.close().catch(()=>{});}
 }
 const running=new Set<string>();

 return {
  async call(agentId,args){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   try{
    const at=now(),{operation,...input}=args??{},drafts=settle(db,load(db),at);
    const provider=input.provider as ServiceDraftProvider;
    if(!SERVICE_DRAFT_PROVIDERS.includes(provider))return {error:'Unknown Service for drafts.'};
    if(operation==='read'){const {provider:_provider,...filter}=input;return {drafts:readServiceDrafts(drafts,agentId,provider,filter),untrustedContent:true};}
    if(operation!=='create')return {error:'Unknown drafts operation.'};
    // Checked before the Service is asked anything.
    const create=readServiceDraftCreate(input);
    const {target}=await using(provider,io=>readServiceDraftTarget(io,create));
    if(!target)return {error:SERVICE_DRAFT_MESSAGES.notFound(provider)};
    const draft=makeServiceDraft(drafts,agentId,input,target,newId(),now());
    save(db,draft,'agent');changed();
    return {ok:true,draft,untrustedContent:true,guidance:'The person sees this in their Attention Center and approves or dismisses it. Nothing is written until they approve. Read it later with read to see what happened; do not draft it again.'};
   }catch(failure){return {error:own(failure)};}
  },
  async approve(id){
   const db=ledger();
   if(!db)error(NOT_READY);
   const key=typeof id==='string'?id:'';
   if(running.has(key))error(SERVICE_DRAFT_MESSAGES.busy);
   running.add(key);
   try{
    const drafts=settle(db!,load(db!),now()),draft=drafts.find(item=>item.id===key);
    if(!draft)return error(SERVICE_DRAFT_REASONS.missing);
    if(!serviceDraftPending(draft))error(SERVICE_DRAFT_REASONS.settled);
    const outcome=await using(draft.provider,async io=>{
     // Read again, through the World's connection, right before writing: anything not as it was refuses the draft.
     const found=await readServiceDraftTarget(io,{provider:draft.provider,write:draft.write,target:draft.target.id,
      ...draft.provider==='posthog'&&draft.write==='flag.set'?{flag:{id:draft.target.id}}:{},...draft.provider==='notion'?{page:draft.target.id}:{}});
     const change=serviceDraftChange(draft,found.target);
     if(change)return {status:'stale' as const,reason:change};
     return writeServiceDraft(io,draft,found.raw);
    });
    const at=now(),title=draft.provider==='posthog'?'PostHog':'Notion';
    if(outcome.status==='stale'){
     const next=settleServiceDraft(draft,'stale',at,{reason:outcome.reason});
     save(db!,next,'user');audit(db!,next,'approve','denied',`The person approved, but the target changed in ${title}: `+outcome.reason,at);changed();
     return {ok:true,status:'stale',reason:outcome.reason};
    }
    if(outcome.status==='failed'){
     const next=settleServiceDraft(draft,'failed',at,{reason:outcome.reason});
     save(db!,next,'user');audit(db!,next,'approve','denied','The person approved; '+outcome.reason,at);changed();
     return {ok:true,status:'failed',reason:outcome.reason};
    }
    const next=settleServiceDraft(draft,'written',at,{resultUrl:outcome.url});
    save(db!,next,'user');audit(db!,next,'approve','allowed',`The person approved; written in ${title}: `+outcome.url,at);changed();
    return {ok:true,status:'written',url:outcome.url};
   }finally{running.delete(key);}
  },
  dismiss(id){
   const db=ledger();
   if(!db)error(NOT_READY);
   if(running.has(String(id)))error(SERVICE_DRAFT_MESSAGES.busy);
   const at=now(),drafts=settle(db!,load(db!),at),draft=drafts.find(item=>item.id===id);
   const next=settleServiceDraft(draft,'dismissed',at);
   save(db!,next,'user');audit(db!,next,'dismiss','allowed','The person dismissed this draft; nothing was written.',at);changed();
   return {ok:true,status:'dismissed'};
  },
  summaries(ids){
   const db=ledger();
   if(!db)return [];
   const drafts=settle(db,load(db),now());
   return ids.flatMap(id=>{const draft=drafts.find(item=>item.id===id);
    return draft?[{id,agentId:draft.agentId,service:draft.provider,status:draft.status,...draft.resultUrl?{resultUrl:draft.resultUrl}:{},...draft.reason?{reason:draft.reason}:{}}]:[];});
  },
 };
}
