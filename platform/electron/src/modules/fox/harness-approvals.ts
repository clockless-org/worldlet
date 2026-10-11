import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {WorldletError} from '../../files.ts';
import {approvalGrantFor,approvalThreadLabel,harnessApprovalFeatures,harnessService,isStandingRuleId,readApprovalGrants,rememberApprovalGrant} from '../../../../../core/agent/index.ts';
import type {HarnessApprovalChoice,HarnessApprovalRequest} from '../../../../../contracts/harness-services.ts';

// Standing approvals (owner goal 2026-10-08: approvals better than OpenClaw / Hermes Agent; no Settings section since 2026-10-10): one list of the standing
// rules an Always left in each Harness on this computer, with which agent, when and from which Fox thread it was
// granted, each revoked in one click the Harness's own way (agent-runtime/harness-approvals.ts). The Harness keeps what
// is allowed; the World keeps who said Always and where (world.sqlite setting `approval-grants`, core
// rememberApprovalGrant), from the requests its approval cards showed. Nothing here knows which Harness it is: what each
// keeps and how it forgets is its declared `approvalFeatures` (core/agent/harness-services.ts).

const KEY='approval-grants';
const ASKS=50;
export function createHarnessApprovalRules(host:Host){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const agent=()=>host.optional<AgentService>(AGENT);
 /** Requests shown in this World's approval cards, so an Always is recorded with where it was asked. */
 const asked=new Map<string,{request:HarnessApprovalRequest;harness:string}>();
 return {
  /** An approval card was shown (not in the practice world or setup). */
  asked(request:HarnessApprovalRequest){
   const harness=agent()?.harness?.id;
   if(!own()||!harness||typeof request?.id!=='string')return;
   asked.set(request.id,{request,harness});
   while(asked.size>ASKS)asked.delete(asked.keys().next().value!);
  },
  /** The person answered it: an Always on a Harness that keeps standing rules is remembered with its thread. */
  answered(id:string,choice:HarnessApprovalChoice){
   const ask=asked.get(id);asked.delete(id);
   if(!ask||choice!=='always'||!own()||!harnessApprovalFeatures(ask.harness).rules)return;
   const {request}=ask,rule=request.rule??request.detail;
   if(!rule)return;
   try{const ledger=store.ledger();ledger.saveSetting(KEY,rememberApprovalGrant(ledger.setting(KEY),{harness:ask.harness,agent:request.agent??'',rule,thread:request.thread??'main',at:Date.now(),title:request.title}) as unknown as Row);}
   catch(error){host.diagnostics.record(error,'approvalGrant');}
  },
  /** Every Harness's standing rules here, each with the World's grant when it gave one, and what revoking does. */
  async list():Promise<Row> {
   const service=agent(),grants=own()?readApprovalGrants(store.ledger().setting(KEY)):[];
   const harnesses=await Promise.all((service?.standingRules?.()??[]).map(async({harness,title,rules})=>{
    const features=harnessApprovalFeatures(harness);
    let listed:Row[]=[],error='';
    try{listed=(await rules.list()).slice(0,300).map(rule=>{
     const grant=approvalGrantFor(rule,harness,grants);
     return {...rule,...grant?{grantedAt:rule.grantedAt??grant.at,thread:approvalThreadLabel(grant.thread),inWorld:true}:{}};
    });}catch(e){error=(e as Error)?.message||`${title} did not list its rules.`;}
    return {harness,title,rules:listed,revoke:features.revoke??null,...features.revokeNote?{note:features.revokeNote}:{},...error?{error}:{},inUse:service?.harness?.id===harness};
   }));
   // Fox's Agent answers approvals but keeps its rules where it runs (another computer): said, not hidden.
   const current=service?.harness;
   const elsewhere=current&&harnessService(current.id,'approvals')!==null&&!harnessApprovalFeatures(current.id).rules?current.title:null;
   return {harnesses,...elsewhere?{elsewhere}:{}};
  },
  async revoke(harness:unknown,id:unknown):Promise<Row> {
   if(!own())throw new WorldletError('Change approvals in your own world.');
   const found=agent()?.standingRules?.().find(item=>item.harness===harness);
   if(!found||!isStandingRuleId(id))throw new WorldletError('This rule is no longer there.');
   if(!harnessApprovalFeatures(found.harness).revoke)throw new WorldletError(`${found.title} cannot have its rules revoked from Worldlet.`);
   await found.rules.revoke(id);
   return {ok:true};
  },
 };
}
