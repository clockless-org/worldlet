import crypto from 'node:crypto';
import {AGENT_AUDIT_KEEP,ASK_REASONS,askApprovesDrafts,answerAsk,askAttentionItem,askItemId,askOpen,claimAsks,postAsk,readAsks,readStoredAsk,resolveAsk} from '../../../../../core/agent/index.ts';
import {AGENT_ASK_TARGET,type AgentAsk} from '../../../../../contracts/agent-asks.ts';
import type {Row} from './types.ts';

// Agent asks (core/agent/GRANTS.md#agent-asks). Core decides; this keeps the records: each ask in the World's ledger
// (`state.agent-asks` in world.sqlite) beside its Attention item (provider `agents`), written together with no model.
// The calling Agent is always the one whose token made the call (world-tool-bridge.ts), never one the model names.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type AskLedger={
 agentAsks():Row[];
 saveAgentAsk(ask:Row,item:Row,origin:'user'|'agent'):void;
 value(bucket:string,id:string):Row|null;
 recordAgentAudit(entry:Row,keep:number):boolean;
};
export interface AgentAsks {
 /** One `agent_asks` call (`asks/post`, `read`, `claim`, `resolve`) by `agentId`, already admitted by its Grants. */
 call(agentId:string,args:Row):Row;
 /** The person's answer on the ask's Attention card (`agentAsk` `answer`): a choice and note, Done or Dismiss. Its
  * Approve on an ask that carries GitHub drafts is `approveDrafts` instead, which only this computer's pages may send
  * (contracts/web-world.ts ROOM_ALLOWED): each draft is approved as on its own card, then the ask is answered. */
 answer(request:Row):Promise<Row>;
}
/** The GitHub drafts an ask may carry (github-drafts.ts): what became of them, and the same Approve as on a draft's own
 * card (read the target again, refuse when it changed, otherwise write once). */
export type AskDrafts={
 summaries(ids:readonly string[]):{id:string;agentId:string;status:string;resultUrl?:string;reason?:string}[];
 approve(id:string):Promise<Row>;
};
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';

export function createAgentAsks({ledger,name,changed,drafts,now=()=>new Date().toISOString(),newId=()=>crypto.randomUUID()}:
 {ledger:()=>AskLedger|null;name:(agentId:string)=>string;changed:()=>void;drafts?:()=>AskDrafts|null;now?:()=>string;newId?:()=>string}):AgentAsks {
 // An ask's drafts as asks/read shows them: the Agent's own only.
 const withDrafts=(ask:AgentAsk)=>ask.draftIds?.length?{...ask,drafts:(drafts?.()?.summaries(ask.draftIds)??[]).filter(d=>d.agentId===ask.agentId).map(({agentId:_agentId,...draft})=>draft)}:ask;
 const load=(db:AskLedger)=>db.agentAsks().flatMap(row=>{const ask=readStoredAsk(row);return ask?[ask]:[];});
 const save=(db:AskLedger,ask:AgentAsk,origin:'user'|'agent')=>db.saveAgentAsk(ask as unknown as Row,askAttentionItem(ask,name(ask.agentId)) as Row,origin);
 const audit=(db:AskLedger,ask:AgentAsk,at:string)=>{
  try{db.recordAgentAudit({at,agentId:ask.agentId,target:AGENT_ASK_TARGET,action:'answer',decision:'allowed',reason:'The person answered this Agent\'s ask in Attention.'},AGENT_AUDIT_KEEP);}catch{}
 };
 // Done or Dismiss on the ask's Attention card through the ordinary item status (a phone, a browser): the ask follows.
 const settle=(db:AskLedger,asks:AgentAsk[],at:string)=>asks.map(ask=>{
  if(!askOpen(ask))return ask;
  const item=db.value('items',askItemId(ask.id));
  if(item?.statusOrigin!=='user'||item.status!=='done'&&item.status!=='dismissed')return ask;
  const next=answerAsk(ask,{id:ask.id,outcome:item.status==='done'?'done':'skipped'},at);
  save(db,next,'user');audit(db,next,at);
  return next;
 });
 return {
  call(agentId,args){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   try{
    const at=now(),{operation,...input}=args??{},asks=settle(db,load(db),at);
    if(operation==='post'){
     const ask=postAsk(asks,agentId,input,newId(),at);
     // The drafts it carries are this Agent's own and still waiting.
     if(ask.draftIds){
      const found=drafts?.()?.summaries(ask.draftIds)??[];
      if(found.length!==ask.draftIds.length||found.some(draft=>draft.agentId!==agentId||draft.status!=='pending'))return {error:ASK_REASONS.drafts};
     }
     save(db,ask,'agent');changed();
     return {ok:true,ask,guidance:'The person sees this in their Attention Center. Read it later with asks/read to get their answer; do not post it again.'};
    }
    if(operation==='read')return {asks:readAsks(asks,agentId,input).map(withDrafts)};
    if(operation==='claim'){
     const claimed=claimAsks(asks,agentId,input,at);
     for(const ask of claimed)save(db,ask,'agent');
     if(claimed.length)changed();
     return {asks:claimed,untrustedContent:true};
    }
    if(operation==='resolve'){
     const ask=resolveAsk(asks.find(item=>item.id===input.id),agentId,input,at);
     save(db,ask,'agent');changed();
     return {ok:true,ask};
    }
    return {error:'Unknown asks operation.'};
   }catch(error){return {error:error instanceof Error&&error.message?error.message:'Could not do that.'};}
  },
  async answer(request){
   const db=ledger();
   if(!db)throw new Error(NOT_READY);
   const reply=Object.fromEntries(['id','outcome','choice','note'].filter(key=>request?.[key]!==undefined).map(key=>[key,request[key]]));
   const ask=settle(db,load(db),now()).find(item=>item.id===reply.id);
   // Checked before any draft is approved: an answer the ask would refuse runs nothing.
   answerAsk(ask,reply,now());
   const approving=askApprovesDrafts(ask!,reply as {outcome:string;choice?:string});
   if(approving!==(request?.operation==='approveDrafts'))throw new Error(approving?ASK_REASONS.local:ASK_REASONS.invalid);
   let results:Row[]|undefined;
   if(approving){
    const owner=drafts?.();
    if(!owner)throw new Error('GitHub drafts are not available here.');
    // Each draft as on its own card. One already settled is left as it is; one that could not be tried (GitHub did
    // not answer, no GitHub App) leaves the ask unanswered, so Approve can be chosen again.
    for(const id of ask!.draftIds??[]){
     const [found]=owner.summaries([id]);
     if(!found||found.agentId!==ask!.agentId||found.status!=='pending')continue;
     await owner.approve(id);
    }
    results=owner.summaries(ask!.draftIds??[]).filter(draft=>draft.agentId===ask!.agentId).map(({agentId:_agentId,...draft})=>draft);
   }
   // Read again: approving took time, and the ask may have changed meanwhile.
   const at=now(),next=answerAsk(settle(db,load(db),at).find(item=>item.id===reply.id),reply,at);
   save(db,next,'user');audit(db,next,at);changed();
   return {ok:true,status:next.status,...results?{drafts:results}:{}};
  },
 };
}
