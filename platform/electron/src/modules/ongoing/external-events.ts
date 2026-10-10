import type {HarnessExternalEvent} from '../../../../../contracts/harness-services.ts';
import {EXTERNAL_EVENTS,externalEventAttentionId,externalEventMatters,externalEventObservation,externalEventPush,externalEventsForAttention} from '../../../../../core/tasks/index.ts';
import {AGENT,PHONE,WORLD_TOOLS,type AgentService,type PhoneService,type WorldToolsService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';

/** External events (core/tasks/external-events.ts): webhooks, mail triggers and hooks that started the person's own
 * Agent, from its Harness's `events` service whichever Harness that is, and new channel messages that may need the
 * person, handed over by the history sync as it reads them (`channel`). Each becomes Attention context the Center
 * shows as a World item; once a Worth Knowing item cites one that matters, the paired phone hears of it. A Harness
 * with no `events` service simply has none. Returns where channel messages are handed over. */
export function installExternalEvents(host:Host):{channel(events:HarnessExternalEvent[]):void}{
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled()&&store.state.cloudConsent===true;
 const events=new Map<string,HarnessExternalEvent>(),channel=new Map<string,HarnessExternalEvent>();
 /** Events that matter and arrived while Worldlet watched, by observation id, waiting for an item that cites them. */
 const pending=new Map<string,number>();
 let stop:(()=>void)|null=null,agentName='',since=0,observeTimer:ReturnType<typeof setTimeout>|null=null;
 function observe(){
  observeTimer=null;
  if(!own())return;
  const center=host.optional<WorldToolsService>(WORLD_TOOLS);
  const recent=externalEventsForAttention([...events.values(),...channel.values()],Date.now());
  if(!center||!recent.length)return;
  try{center.observeConversations(recent.map(event=>externalEventObservation(event,agentName)));}
  catch(error){host.diagnostics.record(error,'externalEvents');}
 }
 function received(event:HarnessExternalEvent){
  events.set(event.id,event);
  // One already recorded before Worldlet started watching is shown, not announced.
  if(externalEventMatters(event)&&event.at>=since)pending.set(externalEventAttentionId(event),Date.now());
  // A burst of events (a first read) is observed once.
  observeTimer??=setTimeout(observe,2000);
 }
 function subscribe(){
  stop?.();stop=null;events.clear();pending.clear();
  const agent=host.optional<AgentService>(AGENT),source=agent?.harnessEvents?.()??null;
  if(!source||!agent)return;
  since=Date.now()-2*60_000;
  void agent.status(agent.home('private')).then(status=>{agentName=typeof status?.name==='string'?status.name:'';}).catch(()=>{});
  try{stop=source.subscribe(received);}catch(error){host.diagnostics.record(error,'externalEvents');}
 }
 // A Worth Knowing item that cites a pending event goes to the phone once (core/phone notify keeps it quiet while the
 // phone is open, during setup and in the practice world).
 store.onChange(()=>{
  if(!pending.size||!own())return;
  const now=Date.now();
  for(const [id,at] of pending)if(now-at>EXTERNAL_EVENTS.pushWaitMs)pending.delete(id);
  if(!pending.size)return;
  let items:Record<string,any>[]=[];
  try{items=store.worldItems();}catch{return;}
  for(const item of items){
   const push=externalEventPush(item,new Set(pending.keys()));
   if(!push)continue;
   for(const ref of item.sources)if(ref?.provider==='conversations')pending.delete(String(ref.id));
   void host.optional<PhoneService>(PHONE)?.notify(push).catch(error=>host.diagnostics.record(error,'externalEventPush'));
  }
 });
 host.optional<AgentService>(AGENT)?.onChanged?.(reason=>{if(reason==='agent-changed')subscribe();});
 host.onPageLoaded(()=>{if(!stop)subscribe();else observe();});
 host.onQuit(()=>{stop?.();stop=null;if(observeTimer)clearTimeout(observeTimer);});
 return {channel(found){
  if(!own())return;
  let added=false;
  for(const event of found){
   if(event?.source!=='channel'||channel.has(event.id))continue;
   channel.set(event.id,event);added=true;
   pending.set(externalEventAttentionId(event),Date.now());
  }
  // The week's newest are kept; older ones have left the Center's reading anyway.
  for(const id of [...channel.keys()].slice(0,Math.max(0,channel.size-EXTERNAL_EVENTS.events*2)))channel.delete(id);
  if(added)observeTimer??=setTimeout(observe,2000);
 }};
}
