import {setTimeout as sleep} from 'node:timers/promises';
import {AGENT,ONGOING,type AgentService,type OngoingService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {readOlderHermes,TEXT_BUDGET,type HermesCursor,type HermesWindowResult} from '../agent-runtime/agent-files.ts';
import {broughtConversations} from './migration.ts';
import type {Companion} from './companion.ts';

// A large Agent history comes in by time (owner request 2026-10-06: "大的 DB 就是按照时间来读最近的 然后慢慢的
// 后台来处理远期的"). Bringing Hermes Agent copies its recent conversations at once (`HERMES_RECENT` in
// agent-files.ts), so setup and the World never wait on an 18 GB `state.db`; this then brings the older ones, newest
// first, a window at a time (`HERMES_OLDER`) with a pause between, while Worldlet is open. Where it got to is kept in
// the World (`brought-older`), so a restart carries on; bringing the Agent again starts over. It stops at the same
// limit as any brought history (TEXT_BUDGET), and the World log says how far it got.

export interface OlderHistory {
 id:'hermes';cursor:HermesCursor;
 /** Conversations brought so far in the background, how many are left, and the text brought in all (with the recent part). */
 brought:number;remaining:number;bytes:number;
 status:'bringing'|'complete'|'partial';startedAt:number;
}
const BUCKET='brought-older';
/** A World log line every this many conversations, and when it ends. */
const LOG_EVERY=500;

export function createOlderHistory(host:Host,companion:Companion,{read=readOlderHermes,pause=4}:{read?:(cursor:HermesCursor,left:number)=>HermesWindowResult|null;pause?:number}={}){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 let running:Promise<void>|null=null,stopped=false;
 const current=():OlderHistory|null=>{try{return own()?(store.ledger().find(BUCKET,'hermes') as unknown as OlderHistory)??null:null;}catch{return null;}};
 const save=(value:OlderHistory)=>store.ledger().put(BUCKET,value.id,value as unknown as Row);
 const log=(value:OlderHistory)=>store.recordHistory({id:`brought-older:${value.startedAt}:${value.brought}:${value.status}`,kind:'brought.older',at:Date.now()/1000,actor:'world',agent:value.id,status:value.status,brought:value.brought,remaining:value.remaining});
 /** One window, synchronously: read, add, save, so a bring starting over never sees half of one. */
 function step(value:OlderHistory):OlderHistory {
  const window=read(value.cursor,Math.max(0,TEXT_BUDGET-value.bytes));
  // Hermes Agent is no longer on this computer: what came stays.
  if(!window)return {...value,status:'partial'};
  if(window.conversations.length)companion.addImportedHistory(value.id,{conversations:broughtConversations(value.id,window.conversations)});
  const done=!window.next;
  return {...value,cursor:window.next??value.cursor,brought:value.brought+window.conversations.length,remaining:window.remaining,bytes:value.bytes+window.bytes,
   status:done?(window.truncated||window.problems.length?'partial':'complete'):'bringing'};
 }
 async function loop(){
  while(!stopped){
   const value=current();
   if(!value||value.status!=='bringing')return;
   // Fox's own turn comes first.
   if(host.optional<AgentService>(AGENT)?.hasInteractiveWork()){await sleep(pause*1000);continue;}
   let next:OlderHistory;
   try{next=step(value);}
   catch(error){host.diagnostics.record(error,'olderHistory');next={...value,status:'partial'};}
   // Read, step and save share one turn of the event loop, so a bring starting over (reset, then start) never
   // interleaves with a window.
   save(next);
   if(next.status!=='bringing'||Math.floor(next.brought/LOG_EVERY)>Math.floor(value.brought/LOG_EVERY))log(next);
   if(next.status!=='bringing'){host.optional<OngoingService>(ONGOING)?.refresh();return;}
   await sleep(pause*1000);
  }
 }
 function run(){
  if(running||stopped||!own())return;
  running=loop().catch(error=>host.diagnostics.record(error,'olderHistory')).finally(()=>{running=null;});
 }
 return {
  /** Bringing the Agent again starts over: what an earlier run was bringing is forgotten first. */
  reset(id:string){if(id==='hermes'&&own())try{store.ledger().delete(BUCKET,'hermes');}catch{}},
  /** After a bring: the older part, if any, starts coming. */
  start(id:string,older:{cursor:HermesCursor;remaining:number;bytes:number}|undefined){
   if(id!=='hermes'||!older||!own())return;
   const value:OlderHistory={id:'hermes',cursor:older.cursor,brought:0,remaining:older.remaining,bytes:older.bytes,status:'bringing',startedAt:Date.now()};
   save(value);log(value);run();
  },
  /** When the World opens: carry on where a restart left off. */
  resume:run,
  /** For the companion panel and checks: where it got to. */
  progress:current,
  stop(){stopped=true;},
  /** Checks wait for the background run. */
  idle:()=>running??Promise.resolve(),
 };
}
export type OlderHistoryRunner=ReturnType<typeof createOlderHistory>;
