import {CONVERSATION_ATTENTION,conversationObservation,conversationsForAttention,ONGOING_LIMITS,ongoingDecide,ongoingKindOf,ongoingTemplate,ongoingRecent,ongoingRefresh,ongoingTurnText,orderOngoing,readOngoing,validOngoingId,type OngoingThing} from '../../../../../core/ongoing/index.ts';
import {WorldletError} from '../../files.ts';
import {ONGOING,WORLD_TOOLS,type OngoingService,type WorldToolsService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
import {installExternalEvents} from './external-events.ts';
import {installHarnessCalls} from './harness-calls.ts';

const HOUR=3_600_000;

/** Ongoing things (core/ongoing/README.md). Brought conversations that look like one job carried on are proposed
 * as something worth doing; the person's yes makes one an Applet, listed in the Ongoing Applet and on the phone.
 * The records live in this World's `ongoing` table; the conversations stay where they were brought. */
export function installOngoing(host:Host){
 const {store,page}=host;
 const now=()=>Date.now()/1000;
 const own=()=>store.writable&&!store.sampleEnabled();
 const things=():OngoingThing[]=>{
  if(!own())return [];
  try{return store.ledger().ongoingRows().flatMap(row=>{const thing=readOngoing(row);return thing?[thing]:[];});}
  catch(error){host.diagnostics.record(error,'ongoing');return [];}
 };
 const changed=(id='')=>page.event('worldlet:ongoing',{id});
 function refresh(){
  if(!own())return;
  try{
   const ledger=store.ledger();
   const {save,forget}=ongoingRefresh(things(),ledger.broughtConversations(),now(),c=>ledger.ownText(c.source,c.session,60));
   if(save.length||forget.length){store.ledger().saveOngoing(save as any[],forget);changed();}
  }catch(error){host.diagnostics.record(error,'ongoing');}
  observe();
 }
 // Conversations active lately are Attention context too (core/ongoing/attention.ts): what the person promised,
 // waits on or planned there reaches the Center, read by its ordinary synthesis on the person's own model.
 function observe(){
  if(!own()||store.state.cloudConsent!==true)return;
  const center=host.optional<WorldToolsService>(WORLD_TOOLS);
  if(!center)return;
  try{
   const ledger=store.ledger();
   const records=conversationsForAttention(ledger.broughtConversations(),now()).flatMap(c=>{
    const value=conversationObservation(c,ledger.conversationTurns(c.source,c.session,CONVERSATION_ATTENTION.turns));
    return value?[value]:[];
   });
   if(records.length)center.observeConversations(records);
  }catch(error){host.diagnostics.record(error,'ongoingAttention');}
 }
 // Webhooks, mail triggers and hooks that started the person's own Agent, new channel messages that may need the
 // person, and the phone calls it made or took, stand beside its conversations.
 const external=installExternalEvents(host);
 host.provide<OngoingService>(ONGOING,{refresh,channelEvents:events=>external.channel(events)});
 // Each kept thing is a device of its own in the World (core/ongoing ongoingApplet): the snapshot carries them, and
 // keeping or removing one changes the World, so the page projects it again.
 const extras=store.snapshotExtras;
 store.snapshotExtras=()=>({...extras(),ongoing:things().filter(t=>t.state==='kept').map(({id,source,session,title,where,region,kind})=>({id,source,session,title,where,region,kind}))});

 host.register({
  ongoing:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'list';
   if(operation==='list'){
    const all=orderOngoing(things());
    return {proposals:all.filter(t=>t.state==='proposed'),kept:all.filter(t=>t.state==='kept')};
   }
   if(!own())throw new WorldletError('Ongoing things live in your own world. The practice world has none.');
   const id=String(request.id??''),thing=validOngoingId(id)?things().find(t=>t.id===id):undefined;
   if(!thing)throw new WorldletError('That is not in this world any more.');
   if(operation==='turns'){
    const limit=Math.min(40,Math.max(1,Math.round(Number(request.limit)||12)));
    // What the person and their Agent wrote, without the gateway's reply pointers and thread context (core/ongoing).
    const said=<T extends {text:string}>(rows:T[])=>rows.flatMap(row=>{const text=ongoingTurnText(row.text);return text?[{...row,text}]:[];});
    const turns=said(store.ledger().conversationTurns(thing.source,thing.session,limit));
    // The phone's tile: the latest lines, each with its time.
    const recent=turns.slice(-ONGOING_LIMITS.recent).flatMap(turn=>{const text=ongoingRecent(thing,[turn])[0];return text?[{text,at:turn.createdAt}]:[];});
    // Its panel asks for its page too: a thing of a kind opens on that kind's page, filled from the person's own messages (core/ongoing kinds).
    const kind=ongoingKindOf(thing);
    const template=kind==='general'||request.template!==true?null:ongoingTemplate(kind,said(store.ledger().conversationTurns(thing.source,thing.session,400)),now());
    return {turns,recent,template};
   }
   if(['keep','later','decline'].includes(operation)){
    if(operation==='keep'&&thing.state!=='kept'&&things().filter(t=>t.state==='kept').length>=ONGOING_LIMITS.kept)
     throw new WorldletError(`This world already keeps ${ONGOING_LIMITS.kept} ongoing things. Remove one in the Ongoing Applet first.`);
    const next=ongoingDecide(thing,operation as 'keep'|'later'|'decline',now());
    store.ledger().saveOngoing([next as any]);changed(id);
    if(thing.state==='kept'||next.state==='kept')store.changed();
    // A decided proposal makes room for the next one.
    if(operation!=='keep'||thing.state==='proposed')refresh();
    return {ok:true,thing:next};
   }
   throw new WorldletError('Unknown request.');
  },
 });
 // Bringing an Agent calls refresh() (modules/fox); the clock catches conversations that age into or out of view.
 const clock=setInterval(refresh,HOUR);
 host.onPageLoaded(refresh);
 host.onQuit(()=>clearInterval(clock));
 installHarnessCalls(host);
}
