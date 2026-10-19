import {randomUUID} from 'node:crypto';
import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {WorldletError} from '../../files.ts';
import {harnessReadOnlyNote,readJobChange,readJobCreate,readSkillChange,skillLastRuns} from '../../../../../agent/gate/index.ts';
import type {HarnessJobChange,HarnessJobCreate,HarnessJobRun,HarnessSkillChange} from '../../../../../contracts/harness-services.ts';

// Settings › Agents › Your Agent › Skills and Routines (owner plan 2026-10-11, PR 2; “做”): each Agent on this computer
// that declares `skills` or `schedule`, Fox's or not, with what it keeps (each job's plain time, where its results go
// and its newest result; each skill with when it last ran), and a change run only as that Agent's own command
// (agent-runtime/harness-schedule-controls.ts, harness-skills.ts). A change is two steps, like connections: `preview`
// returns the exact command and a one-time confirmation; only `change` with that confirmation runs it, so what runs is
// what the person saw and confirmed. Nothing here knows which Harness it is: whether one can be changed is whether its
// service offers `change`. Never in the practice world; never a job's prompt or a skill's steps on the page. The page
// names the change `change` (pause, resume, run, remove; disable, enable, remove): `action` is the host action's own name.
// Memory (PR 3, owner decision 2026-10-11): what each Agent remembers, read only; forgetting is a request in Fox's
// conversation, which the page sends for the Agent in use (agent/gate/harness-memory.ts memoryForgetRequest).

const CONFIRM_MS=5*60_000;
type Pending<C>={harness:string;change:C;command:string;until:number};
function confirmations<C>(){
 const pending=new Map<string,Pending<C>>();
 return {
  add(harness:string,change:C,command:string){
   for(const [key,item] of pending)if(item.until<Date.now())pending.delete(key);
   const confirm=randomUUID();pending.set(confirm,{harness,change,command,until:Date.now()+CONFIRM_MS});return confirm;
  },
  take(confirm:unknown):Pending<C> {
   const item=typeof confirm==='string'?pending.get(confirm):undefined;
   if(typeof confirm==='string')pending.delete(confirm);
   if(!item||item.until<Date.now())throw new WorldletError('Confirm the change again.');
   return item;
  },
 };
}

export function createHarnessControls(host:Host){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const agent=()=>host.optional<AgentService>(AGENT);
 const schedules=()=>agent()?.harnessSchedules?.()??[];
 const skillSets=()=>agent()?.harnessSkillSets?.()??[];
 const jobs=confirmations<HarnessJobChange|{create:HarnessJobCreate}>(),skills=confirmations<HarnessSkillChange>();
 /** The Agent Fox talks through, so the page can say when it keeps none of these. */
 const inUse=()=>{const harness=agent()?.harness;return harness?{harness:harness.id,title:harness.title}:null;};
 const gone=()=>new WorldletError('This Agent is no longer on this computer.');
 const read=<T>(value:unknown,reader:(value:unknown)=>T)=>{try{return reader(value);}catch(e){throw new WorldletError((e as Error).message);}};

 const schedule={
  /** Every Agent's jobs, its scheduler's state and each job's newest result; one that fails says why. */
  async list():Promise<Row> {
   const current=agent()?.harness?.id;
   return {current:inUse(),harnesses:own()?await Promise.all(schedules().map(async({harness,title,schedule})=>{
    let listed:Row[]=[],running:boolean|null=null,error='';
    try{
     const [jobs,state,latest]=await Promise.all([schedule.jobs(),schedule.running().catch(()=>null),schedule.latest?.().catch(()=>[] as HarnessJobRun[])??Promise.resolve([] as HarnessJobRun[])]);
     const last=new Map(latest.map(run=>[run.job,run] as const));
     running=state;
     listed=jobs.slice(0,200).map(job=>{const run=last.get(job.id);return {id:job.id,name:job.name,kind:job.kind,paused:job.paused,when:job.when,...job.delivery?{delivery:job.delivery}:{},
      ...run?{last:{at:run.at,status:run.status}}:{}};});
    }catch(e){error=(e as Error)?.message||`${title} did not list its scheduled tasks.`;}
    // Results come to the World (Attention, the phone) for the Agent Fox talks through (fox/harness-jobs.ts).
    return {harness,title,jobs:listed,running,...schedule.startScheduler?{canStart:true}:{},changes:!!schedule.change,creates:!!schedule.create,inUse:current===harness,...error?{error}:{}};
   })):[]};
  },
  /** Starts an Agent's stopped scheduler with its own command, on the person's own Start. */
  async start(harness:unknown):Promise<Row> {
   if(!own())throw new WorldletError('Change scheduled tasks in your own world.');
   const found=schedules().find(item=>item.harness===harness);if(!found)throw gone();
   if(!found.schedule.startScheduler)throw new WorldletError(`Start it in ${found.title} itself.`);
   await found.schedule.startScheduler();
   return {ok:true};
  },
  async preview(harness:unknown,request:Row):Promise<Row> {
   if(!own())throw new WorldletError('Change scheduled tasks in your own world.');
   const found=schedules().find(item=>item.harness===harness);if(!found)throw gone();
   if(!found.schedule.preview||!found.schedule.change)throw new WorldletError(`${found.title}’s scheduled tasks can be changed only in ${found.title} itself.`);
   // A new one (`change: create`) or a change to one job, each previewed as the Agent's own command.
   if(request.change==='create'){
    if(!found.schedule.previewCreate||!found.schedule.create)throw new WorldletError(`Set one up in ${found.title} itself.`);
    const job=read(request.job,readJobCreate),command=await found.schedule.previewCreate(job);
    return {command,confirm:jobs.add(found.harness,{create:job},command)};
   }
   const change=read({job:request.job,action:request.change,schedule:request.schedule,name:request.name,prompt:request.prompt},readJobChange),command=await found.schedule.preview(change);
   return {command,confirm:jobs.add(found.harness,change,command)};
  },
  async change(confirm:unknown):Promise<Row> {
   if(!own())throw new WorldletError('Change scheduled tasks in your own world.');
   const item=jobs.take(confirm),found=schedules().find(entry=>entry.harness===item.harness);if(!found)throw gone();
   if('create' in item.change)await found.schedule.create!(item.change.create);
   else await found.schedule.change!(item.change);
   return {ok:true,command:item.command};
  },
 };

 const skill={
  /** Every Agent's own skills, each with when it last ran (its own record or the World's synced turns). */
  async list():Promise<Row> {
   const current=agent()?.harness?.id;
   if(!own())return {current:inUse(),harnesses:[]};
   let runs=new Map<string,number>();
   try{runs=skillLastRuns((store.ledger() as unknown as {skillTurns():{role:string;text:string;at:number}[]}).skillTurns());}catch(error){host.diagnostics.record(error,'harnessSkills');}
   return {current:inUse(),harnesses:await Promise.all(skillSets().map(async({harness,title,skills})=>{
    let listed:Row[]=[],error='';
    try{listed=(await skills.list()).slice(0,300).map(s=>{const at=Math.max(s.lastUsedAt??0,runs.get(s.name.toLowerCase())??0);
     return {name:s.name,description:s.description,lastRanAt:at||null,...s.enabled!==undefined?{enabled:s.enabled}:{},removable:!!s.removable&&!!skills.change};});}
    catch(e){error=(e as Error)?.message||`${title} did not list its skills.`;}
    const note=skills.change?'':harnessReadOnlyNote(harness,'skills');
    return {harness,title,skills:listed,changes:!!skills.change,inUse:current===harness,...note?{note}:{},...error?{error}:{}};
   }))};
  },
  async preview(harness:unknown,request:Row):Promise<Row> {
   if(!own())throw new WorldletError('Change skills in your own world.');
   const found=skillSets().find(item=>item.harness===harness);if(!found)throw gone();
   if(!found.skills.preview||!found.skills.change)throw new WorldletError(`${found.title}’s skills can be changed only in ${found.title} itself.`);
   const change=read({skill:request.skill,action:request.change},readSkillChange);
   let command:string;
   try{command=await found.skills.preview(change);}catch(e){throw new WorldletError((e as Error)?.message||'It cannot be changed now.');}
   return {command,confirm:skills.add(found.harness,change,command)};
  },
  async change(confirm:unknown):Promise<Row> {
   if(!own())throw new WorldletError('Change skills in your own world.');
   const item=skills.take(confirm),found=skillSets().find(entry=>entry.harness===item.harness);if(!found)throw gone();
   try{await found.skills.change!(item.change);}catch(e){throw new WorldletError((e as Error)?.message||'It did not work.');}
   return {ok:true,command:item.command};
  },
 };
 const memories=()=>agent()?.harnessMemories?.()??[];
 const memory={
  /** `harnessMemory`: every Agent's memory entries, each with its file; never in the practice world. */
  async list():Promise<Row> {
   const current=agent()?.harness?.id;
   return {current:inUse(),harnesses:own()?await Promise.all(memories().map(async({harness,title,memory})=>{
    let entries:Row[]=[],error='';
    try{entries=(await memory.list()).slice(0,300) as unknown as Row[];}catch(e){error=(e as Error)?.message||`${title} did not show its memory.`;}
    return {harness,title,entries,inUse:current===harness,...error?{error}:{}};
   })):[]};
  },
 };
 /** `harnessSchedule` and `harnessSkills`: `list` (the default), `preview` a change, or the confirmed `change`. */
 const route=(service:typeof schedule|typeof skill)=>(request:Row)=>request.operation==='preview'?service.preview(request.harness,request):request.operation==='change'?service.change(request.confirm):service.list();
 return {schedule,skill,memory,scheduleRequest:(request:Row)=>request.operation==='start'?schedule.start(request.harness):route(schedule)(request),skillRequest:route(skill),memoryRequest:()=>memory.list()};
}
