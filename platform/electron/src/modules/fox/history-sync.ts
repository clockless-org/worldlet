import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import type {HarnessExternalEvent,HarnessHistory} from '../../../../../contracts/harness-services.ts';
import {harnessService,isMigrationSource,migrationSession,openClawSessionIs,type MigrationSource} from '../../../../../core/agent/index.ts';
import {channelMessageEvent} from '../../../../../core/ongoing/index.ts';
import {isoSeconds} from '../../files.ts';
import {AGENT,ONGOING,type AgentService,type OngoingService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
import {TEXT_BUDGET} from '../agent-runtime/agent-files.ts';
import {filesHistory,type HistoryOptions} from '../agent-runtime/agent-history.ts';
import {readSelection} from '../agent-runtime/local-harness.ts';
import {readAdopted} from '../agent-runtime/local-memory.ts';
import {boundBytes,broughtTurnId} from './migration.ts';

// The person's Agent keeps talking after setup (a Discord channel, a Telegram DM, a terminal session), so the World
// reads its history again while Worldlet runs instead of only once (core/agent/PORTABILITY.md "History, read
// continuously"). Harness-neutral: it asks each source for the `history` service (contracts/harness-services.ts) and
// never for a Harness by name. The sources are the chosen Harness, the Agent brought at setup and every Agent whose
// conversations the World already keeps. Each one lists the threads written to since it was last checked, and only the
// turns after the thread's cursor are added to `companion_turns`, with the IDs bringing gives them, so nothing comes
// twice and nothing is replaced. Cursors live in `world.sqlite` (`harness_history`). Then Ongoing reads the
// conversations again and the page (and with it the paired phone) is told. A source whose history can be watched
// (`watch`) is checked a moment after its Agent writes, so a channel message arrives within seconds; every few minutes
// each source is checked anyway. A new message in a shared thread that asks something, names a date or mentions
// someone also goes to Attention as a `channel` event (core/ongoing channelMessageEvent), where the Center's
// ordinary synthesis decides whether it needs the person: no model reads it here.

/** How often each source is checked, how much a check re-reads before the last one (a file written during a check),
 * how much text one check adds at most, and how long one check may keep reading. The first check of a source reads
 * its whole history (owner decision 2026-10-08), over as many checks as the limits take, `soon` apart. The history is
 * read on Worldlet's main process, where every website page's input and frames pass too (owner report 2026-10-08:
 * "现在打开网页感觉都很卡"), so a check reads one thread at a time, lets everything else run between them, and stops
 * after `busyMs`; a thread already read since it last changed is not read again. */
export const HISTORY_SYNC={every:5*60_000,soon:60_000,overlap:60_000,bytes:8_000_000,turns:500,busyMs:1500,
 /** A watched source is checked this long after its Agent last wrote (a burst of writes is one check), and while Fox
  * answers it waits this long again. */
 settleMs:2000,busyWaitMs:5000};
/** Whether `session` (as the Harness keeps it) is one of Fox's own, `mine` being the ones the World remembers. OpenClaw
 * keeps Fox's Gateway session under its agent (`agent:<agentId>:<key>`), so its keys match either way and without case
 * (openClawSessionIs, the same rule as its approvals). */
export function ownHarnessSession(source:MigrationSource,mine:ReadonlySet<string>):(session:string)=>boolean {
 if(source!=='openclaw')return session=>mine.has(session);
 return session=>mine.has(session)||[...mine].some(name=>openClawSessionIs(session,name));
}
export type HistoryFor=(source:MigrationSource,options:HistoryOptions)=>HarnessHistory|null;

export function createHistorySync(host:Host,{history=filesHistory,every=HISTORY_SYNC.every,busyMs=HISTORY_SYNC.busyMs,settleMs=HISTORY_SYNC.settleMs,now=()=>Date.now()}:{history?:HistoryFor;every?:number;busyMs?:number;settleMs?:number;now?:()=>number}={}){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 let running:Promise<number>|null=null,timer:ReturnType<typeof setTimeout>|null=null,stopped=false,unfinished=false;
 /** Channel messages found by the check now running, handed to Attention when it ends. */
 let asks:HarnessExternalEvent[]=[];
 /** The chosen Harness, the Agent brought at setup and every Agent the World keeps conversations from or reads. */
 function sources():MigrationSource[] {
  const ledger=store.ledger(),root=host.profile.root;
  const named=[readSelection(root),readAdopted(root),...Object.keys(ledger.companionCounts()),...ledger.historySources()];
  return [...new Set(named)].filter((source):source is MigrationSource=>isMigrationSource(source)&&harnessService(source,'history')!==null);
 }
 /** One check of one source; returns how many turns it added. */
 async function check(source:MigrationSource):Promise<number> {
  const ledger=store.ledger(),mine=ledger.ownHarnessSessions(source);
  // Fox's own sessions stay out: the ones the World remembers, and any run in Worldlet's Agent folders.
  const reader=history(source,{own:ownHarnessSession(source,mine),ownFolders:[path.join(host.profile.root,'agent')]});
  if(!reader)return 0;
  const started=now(),checked=ledger.historyCheckedAt(source);
  // Newest first, so when the World's limit for one Agent's history is reached, its recent threads are the ones kept.
  const threads=(await reader.threads(checked===null?0:checked-HISTORY_SYNC.overlap)).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(!threads.length){ledger.saveHistoryCursor(source,'',null,'',started);return 0;}
  // The same limit as any brought history (TEXT_BUDGET); a check that stops at its own limit carries on next time.
  const total=TEXT_BUDGET-ledger.companionBytes(source);
  let left=Math.min(HISTORY_SYNC.bytes,total),added=0,busy=false,read=false;
  // Only what arrived since the last check can need the person now; a first read is history.
  const fresh=checked===null?Infinity:checked-HISTORY_SYNC.overlap;
  for(const thread of threads){
   if(stopped||left<=0)break;
   // At least one thread a check, so a slow listing (a busy computer) cannot leave nothing read until the clock.
   if(read&&now()-started>=busyMs){busy=true;break;}
   const saved=ledger.historyCursor(source,thread.id);
   // Read through since it last changed: nothing to read again (a thread kept before it was told shared learns it).
   if(saved&&saved.checkedAt>thread.updatedAt+HISTORY_SYNC.overlap){if(saved.shared!==!!thread.shared)ledger.saveHistoryShared(source,thread.id,!!thread.shared);continue;}
   // Turns join the conversation they were brought into, even when its title has changed since.
   let session=saved?.session||ledger.companionSession(broughtTurnId(source,thread.id,'0'))||'';
   let cursor=saved?.cursor??undefined,through=false;read=true;
   // The lines just before a new message, for its context: the conversation's latest kept turns, then this read's.
   const before:string[]=thread.shared&&session?ledger.conversationTurns(source,session,3).map(turn=>turn.text):[];
   for(;;){
    const page=await reader.turns(thread.id,cursor,HISTORY_SYNC.turns);
    session||=migrationSession(source,thread.title||page.title||'');
    const rows=[];
    for(const turn of page.turns){
     const text=boundBytes(turn.text),size=Buffer.byteLength(text);
     if(size>left){left=0;break;}
     left-=size;cursor=turn.id;
     rows.push({id:broughtTurnId(source,thread.id,turn.id),session,role:turn.role,text,createdAt:isoSeconds(new Date(turn.at))});
     if(thread.shared&&turn.role==='user'&&turn.at>=fresh){const event=channelMessageEvent({source,thread:thread.id,title:session,turn:{id:turn.id,text,at:turn.at},before});if(event)asks.push(event);}
     before.push(text);if(before.length>3)before.shift();
    }
    if(rows.length)added+=ledger.addCompanionTurns(source,rows);
    if(left<=0||stopped)break;
    if(page.turns.length<HISTORY_SYNC.turns){through=true;break;}
    await sleep(0);
   }
   // A thread left part-way is read again next time, from its cursor.
   ledger.saveHistoryCursor(source,thread.id,cursor??null,session,through?started:0,!!thread.shared);
   await sleep(0);
  }
  // Checked through: the next check starts here. Stopped at a check's limit: it carries on from the same place, soon.
  if(!stopped&&!busy&&(left>0||total<=HISTORY_SYNC.bytes))ledger.saveHistoryCursor(source,'',null,'',started);
  else unfinished=true;
  return added;
 }
 /** Checks every source, or only `only`. */
 async function sync(only?:readonly MigrationSource[]):Promise<number> {
  if(!own())return 0;
  let added=0;asks=[];
  for(const source of sources()){
   if(stopped)break;
   if(only&&!only.includes(source))continue;
   try{added+=await check(source);}catch(error){host.diagnostics.record(error,'historySync');}
  }
  if(added){
   const ongoing=host.optional<OngoingService>(ONGOING);
   // Ongoing proposals and Attention context read the conversations again; the page, and the paired phone with it,
   // reloads the kept things' latest lines.
   ongoing?.refresh();
   if(asks.length)ongoing?.channelEvents?.(asks);
   host.page.event('worldlet:ongoing',{id:''});
  }
  asks=[];
  return added;
 }
 /** Checks now, or joins the check already running. */
 function run(only?:readonly MigrationSource[]):Promise<number> {
  return running??=sync(only).catch(error=>{host.diagnostics.record(error,'historySync');return 0;}).finally(()=>{running=null;});
 }
 // Watching: each source that can be watched tells the sync when its Agent writes; the sources it named are checked
 // once the writes settle, after any check already running (which may have read before they were written).
 const watching=new Map<MigrationSource,()=>void>(),changed=new Set<MigrationSource>();
 let liveTimer:ReturnType<typeof setTimeout>|null=null,liveSince=0;
 function watch(){
  if(stopped||!own())return;
  const root=host.profile.root;
  for(const source of sources()){
   if(watching.has(source))continue;
   let stop:(()=>void)|undefined;
   try{stop=history(source,{ownFolders:[path.join(root,'agent')]})?.watch?.(()=>wrote(source));}catch(error){host.diagnostics.record(error,'historyWatch');}
   watching.set(source,stop??(()=>{}));
  }
 }
 function wrote(source:MigrationSource){
  if(stopped)return;
  changed.add(source);
  // An Agent that keeps writing is still checked: the wait restarts with each write for at most five settles.
  const at=Date.now();
  if(!liveTimer)liveSince=at;
  else if(at-liveSince>=5*settleMs)return;
  else clearTimeout(liveTimer);
  liveTimer=setTimeout(live,settleMs);
  liveTimer.unref?.();
 }
 async function live(){
  liveTimer=null;
  if(stopped||!changed.size)return;
  // Fox's own turn comes first (its Agent writes to the same history while it answers).
  if(host.optional<AgentService>(AGENT)?.hasInteractiveWork()){liveTimer=setTimeout(live,HISTORY_SYNC.busyWaitMs);liveTimer.unref?.();return;}
  while(running)await running;
  const only=[...changed];changed.clear();
  unfinished=false;
  await run(only);
  // A check stopped at its limit carries on soon, as the clock's would.
  if(unfinished)schedule(Math.min(every,HISTORY_SYNC.soon));
 }
 function schedule(delay=every){
  if(stopped)return;
  if(timer)clearTimeout(timer);
  timer=setTimeout(async()=>{
   timer=null;
   // Fox's own turn comes first.
   if(host.optional<AgentService>(AGENT)?.hasInteractiveWork())return schedule(30_000);
   unfinished=false;
   await run();watch();schedule(unfinished?Math.min(every,HISTORY_SYNC.soon):every);
  },delay);
  timer.unref?.();
 }
 return {
  /** While Worldlet runs: a first check shortly after the World opens, then every few minutes, and a check soon after
   * a watched Agent writes. */
  start(){schedule(20_000);},
  run,
  /** Starts watching every source that can be watched and is not yet (each check does this too). */
  watch,
  stop(){
   stopped=true;if(timer)clearTimeout(timer);timer=null;if(liveTimer)clearTimeout(liveTimer);liveTimer=null;
   for(const stop of watching.values())try{stop();}catch{}
   watching.clear();
  },
  idle:async()=>{while(liveTimer||running){if(running)await running;else await sleep(Math.max(10,settleMs));}return 0;},
 };
}
export type HistorySync=ReturnType<typeof createHistorySync>;
