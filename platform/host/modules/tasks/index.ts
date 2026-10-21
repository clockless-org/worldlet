import {contextReads,ledgerContext} from '../../store/context-storage.ts';
import {CONVERSATION_ATTENTION,attentionFromAgent,conversationObservation,conversationsForAttention,ONGOING_LIMITS,ongoingDecide,ongoingKindOf,ongoingTemplate,ongoingRecent,ongoingRefresh,ongoingFromAgent,ongoingCandidates,ongoingTurnText,orderOngoing,readOngoing,validOngoingId,type OngoingThing} from '../../../../agent/tasks/index.ts';
import {contextReader,contextWriter} from '../../../../context/store/index.ts';
import {WorldletError} from '../../files.ts';
import {ONGOING,WORLD_TOOLS,type OngoingService,type WorldToolsService} from '../../services.ts';
import type {Host} from '../../types.ts';
import {installExternalEvents} from './external-events.ts';
import {installHarnessCalls} from './harness-calls.ts';
import {readAgentProfile} from '../companion/agent/agent-profile.ts';
import {readSelection} from '../companion/agent/local-harness.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';

const HOUR=3_600_000;
/** The Attention items the person's Agent picked out at setup that were already made, by Agent: never made twice. */
const AGENT_ATTENTION='agent-attention-seeded';

/** Ongoing things (agent/tasks/README.md). Brought conversations that look like one job carried on are proposed
 * as something worth doing; the person's yes makes one an Applet, listed in the Ongoing Applet and on the phone.
 * The records live in this World's `ongoing` table; the conversations stay where they were brought. */
export function installOngoing(host:Host){
 const {store,page}=host;
 const now=()=>Date.now()/1000;
 const own=()=>store.writable&&!store.sampleEnabled();
 const things=():OngoingThing[]=>{
  if(!own())return [];
  try{return contextReader(store.context()).bodies('ongoing').flatMap(row=>{const thing=readOngoing(row);return thing?[thing]:[];});}
  catch(error){host.diagnostics.record(error,'ongoing');return [];}
 };
 const changed=(id='')=>page.event('worldlet:ongoing',{id});
 const unrecorded=(known:OngoingThing[]):OngoingThing[]=>{
  if(!own())return [];
  try{const ledger=store.ledger();return ongoingCandidates(known,contextReads(ledgerContext(ledger),'conversations').broughtConversations(),now(),c=>contextReads(ledgerContext(ledger),'conversations').ownText(c.source,c.session,60));}
  catch(error){host.diagnostics.record(error,'ongoing');return [];}
 };
 function refresh(){
  if(!own())return;
  try{
   const ledger=store.ledger();
   const {save,forget}=ongoingRefresh(things(),contextReads(ledgerContext(ledger),'conversations').broughtConversations(),now(),c=>contextReads(ledgerContext(ledger),'conversations').ownText(c.source,c.session,60));
   if(save.length||forget.length){contextWriter(store.context(),'world').write('ongoing',{save:save as any[],forget});changed();}
   // The things the chosen Agent said the person handles most (agent/gate/agent-profile.ts) become their own Applets once
   // their conversations are here; a removed one stays removed (agent/tasks ongoingFromAgent).
   const chosen=readSelection(host.profile.root),said=chosen?readAgentProfile(host.profile.root,chosen)?.things??[]:[];
   const keep=said.length?ongoingFromAgent(said,things(),contextReads(ledgerContext(ledger),'conversations').broughtConversations(),now(),c=>contextReads(ledgerContext(ledger),'conversations').ownText(c.source,c.session,60),chosen??undefined):[];
   // The World keeps them; no Agent call writes here (an Agent writes Context only in a call its Grants admitted).
   if(keep.length){contextWriter(store.context(),'world').write('ongoing',{save:keep as any[]});changed();store.changed();}
  }catch(error){host.diagnostics.record(error,'ongoing');}
  observe();
 }
 // Conversations active lately are Attention context too (agent/tasks/attention.ts): what the person promised,
 // waits on or planned there reaches the Center, read by its ordinary synthesis on the person's own model.
 function observe(){
  if(!own()||store.state.cloudConsent!==true)return;
  const center=host.optional<WorldToolsService>(WORLD_TOOLS);
  if(!center)return;
  try{
   const ledger=store.ledger();
   const records=conversationsForAttention(contextReads(ledgerContext(ledger),'conversations').broughtConversations(),now()).flatMap(c=>{
    const value=conversationObservation(c,contextReads(ledgerContext(ledger),'conversations').conversationTurns(c.source,c.session,CONVERSATION_ATTENTION.turns));
    return value?[value]:[];
   });
   if(records.length)center.observeConversations(records);
   seed(center,conversationsForAttention(contextReads(ledgerContext(ledger),'conversations').broughtConversations(),now()));
  }catch(error){host.diagnostics.record(error,'ongoingAttention');}
 }
 // What the chosen Agent picked out for the Center when setup asked it to describe itself (agent/gate/agent-profile.ts
 // `attention`) is there when the World opens, before any synthesis pass, each from a conversation the Center reads.
 function seed(center:WorldToolsService,recent:ReturnType<typeof conversationsForAttention>){
  const chosen=readSelection(host.profile.root),said=chosen?readAgentProfile(host.profile.root,chosen)?.attention??[]:[];
  if(!chosen||!said.length)return;
  const all=readAgentSetting(host.profile.root,AGENT_ATTENTION) as Record<string,string[]>|null,made=new Set(all?.[chosen]??[]);
  const entries=attentionFromAgent(said,recent,now(),chosen).filter(e=>!made.has(e.key));
  if(!entries.length)return;
  const saved=center.seedFromAgent(entries);
  if(saved.length)writeAgentSetting(host.profile.root,AGENT_ATTENTION,{...all,[chosen]:[...made,...saved]} as any);
 }
 // Webhooks, mail triggers and hooks that started the person's own Agent, new channel messages that may need the
 // person, and the phone calls it made or took, stand beside its conversations.
 const external=installExternalEvents(host);
 host.provide<OngoingService>(ONGOING,{refresh,channelEvents:events=>external.channel(events)});
 // Each kept thing is a device of its own in the World (agent/tasks ongoingApplet): the snapshot carries them, and
 // keeping or removing one changes the World, so the page projects it again.
 const extras=store.snapshotExtras;
 store.snapshotExtras=()=>({...extras(),ongoing:things().filter(t=>t.state==='kept').map(({id,source,session,title,where,region,kind})=>({id,source,session,title,where,region,kind}))});

 host.register({
  ongoing:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'list';
   if(operation==='list'){
    const all=orderOngoing(things());
    // `candidates`: every other conversation that looks like a job, waiting or not yet recorded, for the phone's list of
    // things (agent/tasks ongoingCandidates); saying something in one keeps it.
    return {proposals:all.filter(t=>t.state==='proposed'),kept:all.filter(t=>t.state==='kept'),candidates:[...all.filter(t=>t.state==='proposed'),...unrecorded(all)]};
   }
   if(!own())throw new WorldletError('Ongoing things live in your own world. The practice world has none.');
   const id=String(request.id??''),known=things();
   let thing=validOngoingId(id)?known.find(t=>t.id===id):undefined;
   // A thing the phone listed that is not recorded yet: keeping it records it first.
   if(!thing&&validOngoingId(id)){thing=unrecorded(known).find(t=>t.id===id);if(thing&&operation==='keep')contextWriter(store.context(),'person').write('ongoing',{save:[thing as any]});}
   if(!thing)throw new WorldletError('That is not in this world any more.');
   if(operation==='turns'){
    const limit=Math.min(40,Math.max(1,Math.round(Number(request.limit)||12)));
    // What the person and their Agent wrote, without the gateway's reply pointers and thread context (agent/tasks).
    const said=<T extends {text:string}>(rows:T[])=>rows.flatMap(row=>{const text=ongoingTurnText(row.text);return text?[{...row,text}]:[];});
    const turns=said(contextReads(ledgerContext(store.ledger()),'conversations').conversationTurns(thing.source,thing.session,limit));
    // The phone's tile: the latest lines, each with its time.
    const recent=turns.slice(-ONGOING_LIMITS.recent).flatMap(turn=>{const text=ongoingRecent(thing,[turn])[0];return text?[{text,at:turn.createdAt}]:[];});
    // Its panel asks for its page too: a thing of a kind opens on that kind's page, filled from the person's own messages (agent/tasks kinds).
    const kind=ongoingKindOf(thing);
    const template=kind==='general'||request.template!==true?null:ongoingTemplate(kind,said(contextReads(ledgerContext(store.ledger()),'conversations').conversationTurns(thing.source,thing.session,400)),now());
    return {turns,recent,template};
   }
   if(['keep','later','decline'].includes(operation)){
    if(operation==='keep'&&thing.state!=='kept'&&things().filter(t=>t.state==='kept').length>=ONGOING_LIMITS.kept)
     throw new WorldletError(`This world already keeps ${ONGOING_LIMITS.kept} ongoing things. Remove one in the Ongoing Applet first.`);
    const next=ongoingDecide(thing,operation as 'keep'|'later'|'decline',now());
    contextWriter(store.context(),'person').write('ongoing',{save:[next as any]});changed(id);
    if(thing.state==='kept'||next.state==='kept')store.changed();
    // A decided proposal makes room for the next one.
    if(operation!=='keep'||thing.state==='proposed')refresh();
    return {ok:true,thing:next};
   }
   throw new WorldletError('Unknown request.');
  },
 });
 // Bringing an Agent calls refresh() (modules/companion); the clock catches conversations that age into or out of view.
 const clock=setInterval(refresh,HOUR);
 host.onPageLoaded(refresh);
 host.onQuit(()=>clearInterval(clock));
 installHarnessCalls(host);
}
