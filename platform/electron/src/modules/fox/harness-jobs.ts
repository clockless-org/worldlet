import {AGENT,PHONE,type AgentService,type PhoneService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {harnessService,scheduleElsewhere,scheduleStep,type ScheduleState} from '../../../../../core/agent/index.ts';
import type {HarnessJobRun} from '../../../../../contracts/harness-services.ts';

// The person's scheduled jobs keep running on their own Agent's scheduler (owner goal 2026-10-07: what used to go to
// Telegram now comes to the World and the phone). Whatever Harness Fox talks through, when it declares the `schedule`
// service (core `harnessService`), each new run becomes an Attention item and a phone notification, a stopped
// scheduler is noted once, and Worldlet's own routines leave that Agent's brought copies alone (`elsewhere`). Nothing
// here knows which Harness it is: the adapter hands over the service, Core decides what each run becomes
// (core/agent/harness-schedule.ts). Where it got to is kept per Harness in world.sqlite (`harness-schedule:<id>`).

/** Pages of runs read per poll; a long backlog continues at the next one. */
const PAGES=10;

export function createHarnessJobs(host:Host,{allowed,every=60}:{allowed:()=>boolean;every?:number}){
 const {store}=host;
 const agent=()=>host.optional<AgentService>(AGENT);
 /** Routine key prefixes of brought copies the chosen Harness's own scheduler runs; read at every routine tick. */
 const elsewhere=()=>{const harness=agent()?.harness;return harness?scheduleElsewhere(harness.id,harnessService(harness.id,'schedule')):[];};
 let timer:NodeJS.Timeout|null=null,polling:Promise<void>|null=null;
 async function poll(){
  const service=agent(),harness=service?.harness;
  if(!harness||!allowed()||!store.writable||store.sampleEnabled()||!elsewhere().length)return;
  const schedule=service?.schedule?.();
  if(!schedule)return;
  const key='harness-schedule:'+harness.id,ledger=store.ledger();
  const saved=ledger.setting(key) as ScheduleState|null;
  const [jobs,running]=await Promise.all([schedule.jobs(),schedule.running()]);
  const runs:HarnessJobRun[]=[];
  let cursor=saved?.cursor;
  for(let page=0;page<PAGES;page++){
   const next=await schedule.runs(cursor);
   runs.push(...next.runs);
   if(!next.cursor||next.cursor===cursor)break;
   cursor=next.cursor;
  }
  const step=scheduleStep({harness,state:saved,jobs,runs,cursor,running,start:schedule.start,now:Date.now()});
  let changed=false;
  for(const result of [...step.results,...step.stopped?[step.stopped]:[]]){
   let id='';
   try{id=ledger.upsert([result.item as Row],'harness-schedule')[0]??'';changed=true;}catch(error){host.diagnostics.record(error,'harnessJobs');continue;}
   if(result.push&&id)void host.optional<PhoneService>(PHONE)?.notify({...result.push,open:{item:id},act:{attention:id}}).catch(()=>{});
  }
  if(changed)store.worldChanged();
  if(JSON.stringify(step.state)!==JSON.stringify(saved))ledger.saveSetting(key,step.state as unknown as Row);
 }
 const tick=()=>{if(!polling)polling=poll().catch(error=>host.diagnostics.record(error,'harnessJobs')).finally(()=>{polling=null;});};
 return {
  elsewhere,
  /** Polls now and each minute until `stop`. */
  start(){if(timer)return;tick();timer=setInterval(tick,every*1000);timer.unref?.();},
  stop(){if(timer)clearInterval(timer);timer=null;},
  /** The Harness changed or the computer woke: look again at once. */
  wake:tick,
  poll,
 };
}
