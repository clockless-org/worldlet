import crypto from 'node:crypto';
import type {HarnessCall,HarnessCalls} from '../../../../../contracts/harness-services.ts';
import {harnessChatThread,harnessNoCallsNote} from '../../../../../core/agent/index.ts';
import {HARNESS_CALLS,callAttentionId,callBrief,callLine,callLive,callMatters,callObservation,callOpening,callReportDue,callsForAttention,callThread,externalEventPush,type CallBrief} from '../../../../../core/ongoing/index.ts';
import {WorldletError} from '../../files.ts';
import {AGENT,FOX,PHONE,WORLD_TOOLS,type AgentService,type FoxService,type PhoneService,type WorldToolsService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';

/** Phone calls through the person's own Agent (core/ongoing/harness-calls.ts), from its Harness's `calls` service
 * whichever Harness that is. Each ended call becomes Attention context the Center shows as a World item; once a Worth
 * Knowing item cites a call someone made to the Agent, the paired phone hears of it; a call one of Fox's resident
 * sessions placed is reported back to that thread in one line, once (world.sqlite `harness-calls-reported:<id>`).
 * A Harness with no `calls` service simply has none.
 * Calling from an Applet (core/agent/PORTABILITY.md#calling-from-an-applet): the Applet's Call fills in a brief
 * (`harnessCall` `prepare`), Fox's card shows it to edit (ui/companion/fox-call.ts), and only the person's Call places
 * it through the Harness's `calls.place`; every call in progress, placed here or not, then streams to the page as it
 * changes (`worldlet:harness-call`: its status and transcript), until it ends with how it went. */
export function installHarnessCalls(host:Host){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled()&&store.state.cloudConsent===true;
 // Placing and following calls needs no model: only the person's own world.
 const mine=()=>store.writable&&!store.sampleEnabled();
 const calls=new Map<string,HarnessCall>();
 /** Calls that matter and ended while Worldlet watched, by observation id, waiting for an item that cites them. */
 const pending=new Map<string,number>();
 let stop:(()=>void)|null=null,agentName='',harness='',since=0,observeTimer:ReturnType<typeof setTimeout>|null=null;
 /** Briefs waiting for the person's Call, and the calls placed from them (call id to whom), this run. */
 const offers=new Map<string,CallBrief&{at:number}>(),placed=new Map<string,{who:string;from:string}>();
 const service=():HarnessCalls|null=>host.optional<AgentService>(AGENT)?.harnessCalls?.()??null;
 /** A call as the page follows it: its last lines, and whom the person called when they placed it here. */
 function show(call:HarnessCall){
  const mine=placed.get(call.id);
  if(!mine&&!callLive(call,Date.now()))return;
  host.page.event('worldlet:harness-call',{call:{...call,transcript:call.transcript.slice(-HARNESS_CALLS.liveLines)},who:mine?.who??'',from:mine?.from??'',placed:!!mine});
 }
 function observe(){
  observeTimer=null;
  if(!own())return;
  const center=host.optional<WorldToolsService>(WORLD_TOOLS);
  const recent=callsForAttention([...calls.values()],Date.now());
  if(!center||!recent.length)return;
  try{center.observeConversations(recent.map(call=>callObservation(call,agentName)));}
  catch(error){host.diagnostics.record(error,'harnessCalls');}
 }
 /** Fox's line in the thread that asked for the call, once per call. */
 function report(call:HarnessCall){
  if(!own()||!harness||!call.requestedBy||!callReportDue(call,Date.now()))return;
  const fox=host.optional<FoxService>(FOX);
  if(!fox?.report)return;
  try{
   const ledger=store.ledger(),key='harness-calls-reported:'+harness;
   const done=Array.isArray(ledger.setting(key)?.calls)?(ledger.setting(key)!.calls as unknown[]).map(String):[];
   if(done.includes(call.id))return;
   const thread=callThread(call,ledger.ownHarnessSessionThreads(harness));
   if(thread===null)return;
   if(!fox.report(callLine(call),harnessChatThread(thread)))return;
   ledger.saveSetting(key,{calls:[...done,call.id].slice(-HARNESS_CALLS.reported)});
  }catch(error){host.diagnostics.record(error,'harnessCallReport');}
 }
 function received(call:HarnessCall){
  calls.set(call.id,call);
  if(mine())show(call);
  if(call.outcome==='in-progress')return;
  // One already recorded before Worldlet started watching is shown, not announced.
  if(callMatters(call)&&(call.endedAt||call.startedAt)>=since)pending.set(callAttentionId(call),Date.now());
  report(call);
  // A burst of calls (a first read) is observed once.
  observeTimer??=setTimeout(observe,2000);
 }
 function subscribe(){
  stop?.();stop=null;calls.clear();pending.clear();
  const agent=host.optional<AgentService>(AGENT),source=agent?.harnessCalls?.()??null;
  harness=agent?.harness?.id??'';
  if(!source||!agent)return;
  since=Date.now()-2*60_000;
  void agent.status(agent.home('private')).then(status=>{agentName=typeof status?.name==='string'?status.name:'';}).catch(()=>{});
  try{stop=source.subscribe(received);}catch(error){host.diagnostics.record(error,'harnessCalls');}
 }
 // A Worth Knowing item that cites a pending call goes to the phone once (the same rule as outside events); Worth
 // Doing ones, such as a missed call, reach it through core/phone phoneAttentionPushes already.
 store.onChange(()=>{
  if(!pending.size||!own())return;
  const now=Date.now();
  for(const [id,at] of pending)if(now-at>HARNESS_CALLS.pushWaitMs)pending.delete(id);
  if(!pending.size)return;
  let items:Record<string,any>[]=[];
  try{items=store.worldItems();}catch{return;}
  for(const item of items){
   const push=externalEventPush({...item,title:item.title||'Your Agent had a call'},new Set(pending.keys()));
   if(!push)continue;
   for(const ref of item.sources)if(ref?.provider==='conversations')pending.delete(String(ref.id));
   void host.optional<PhoneService>(PHONE)?.notify(push).catch(error=>host.diagnostics.record(error,'harnessCallPush'));
  }
 });
 host.register({
  harnessCall:async request=>{
   const operation=String(request.operation??'');
   if(!mine())throw new WorldletError('Calls go through your own Agent. The practice world places none.');
   const agent=service(),harnessId=host.optional<AgentService>(AGENT)?.harness?.id??'';
   if(operation==='status'||operation==='prepare'){
    const ready=agent?.place&&agent.placing?agent.placing():{ready:false as const,note:harnessNoCallsNote(harnessId)};
    if(!ready.ready||operation==='status')return ready;
    const brief=callBrief(request);
    if('error' in brief)return {ready:true,error:brief.error};
    const now=Date.now(),id='call-'+crypto.randomUUID();
    for(const [key,offer] of offers)if(now-offer.at>HARNESS_CALLS.offerWaitMs)offers.delete(key);
    offers.set(id,{...brief,at:now});
    return {ready:true,offer:{id,...brief,opening:callOpening(brief)}};
   }
   if(operation==='hangUp'){
    const id=String(request.id??'');
    if(!agent?.hangUp||calls.get(id)?.outcome!=='in-progress')throw new WorldletError('That call is not going on any more.');
    await agent.hangUp(id).catch(error=>{throw new WorldletError(String(error?.message||'Your Agent could not hang up.').slice(0,300));});
    return {ok:true};
   }
   const offer=offers.get(String(request.id??''));
   if(!offer)throw new WorldletError('This call is no longer waiting.');
   if(operation==='cancel'){offers.delete(String(request.id));return {ok:true};}
   if(operation!=='place')throw new WorldletError('Unknown request.');
   // What the person confirmed: the number and name from the Applet, their edits of why and what to ask.
   const brief=callBrief({...offer,why:request.why??offer.why,ask:request.ask??offer.ask});
   if('error' in brief)throw new WorldletError(brief.error);
   if(!agent?.place)throw new WorldletError(harnessNoCallsNote(harnessId));
   offers.delete(String(request.id));
   const result=await agent.place({to:brief.to,message:callOpening(brief)}).catch(error=>{throw new WorldletError(String(error?.message||'Your Agent could not place the call.').slice(0,300));});
   placed.set(result.id,{who:brief.who||brief.to,from:brief.from});
   const known=calls.get(result.id);
   if(known)show(known);
   return {ok:true,id:result.id};
  },
 });
 host.optional<AgentService>(AGENT)?.onChanged?.(reason=>{if(reason==='agent-changed')subscribe();});
 // A reloaded page picks up the calls going on now.
 host.onPageLoaded(()=>{if(!stop)subscribe();else{observe();if(mine())for(const call of calls.values())show(call);}});
 host.onQuit(()=>{stop?.();stop=null;if(observeTimer)clearTimeout(observeTimer);});
}
