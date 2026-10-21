import fs from 'node:fs';
import path from 'node:path';
import {openAgentDatabase,type AgentDatabase} from './agent-database.ts';
import {commandLine,commandReason,harnessService,hermesJobCommand,hermesJobCreateCommand,hermesScheduleRun,jobChangeDone,jobChangeOffered,openClawJobCommand,openClawJobCreateCommand,openClawScheduleRun,type LocalHarnessId} from '../../../../../agent/gate/index.ts';
import type {HarnessJobChange,HarnessJobCreate,HarnessJobRun,HarnessSchedule} from '../../../../../contracts/harness-services.ts';
import {WorldletError} from '../../../files.ts';
import {directories,inside,json,readFile} from './agent-files.ts';
import {runHarnessCommand} from './harness-approvals.ts';
import {HARNESS_SCHEDULES} from './harness-schedule.ts';
import {discoverHermes} from './hermes-files.ts';
import {openClawState} from './local-memory.ts';
import type {HarnessEnvironment,LocalHarnessInstall} from './local-harness.ts';

// Settings › Agents › Your Agent › Routines (owner plan 2026-10-11, PR 2): the person's jobs as their Agent's own
// scheduler keeps them (the read-only `files` readers of harness-schedule.ts), each with its newest result, and Pause,
// Resume, Run now or Remove, each run as the Agent's own command after the person confirmed it (fox/harness-controls.ts):
// Hermes Agent's `hermes cron pause|resume|run|remove` in its home, OpenClaw's `openclaw cron disable|enable|run|rm`
// (agent/gate/harness-controls.ts says where each was checked). Worldlet never writes either Agent's job files itself;
// after a command the jobs are read again, so what the page says is what the Agent now has.

type Run=typeof runHarnessCommand;
const nonNull=<T>(values:(T|null)[])=>values.filter((value):value is T=>value!==null);
/** The newest run of each job among pages of `runs`, for a store with no faster way to say it. */
async function newestByPaging(schedule:HarnessSchedule,pages=40):Promise<HarnessJobRun[]> {
 const newest=new Map<string,HarnessJobRun>();
 let cursor:string|undefined;
 for(let page=0;page<pages;page++){
  const next=await schedule.runs(cursor);
  for(const run of next.runs)if((newest.get(run.job)?.at??-1)<=run.at)newest.set(run.job,run);
  if(!next.cursor||next.cursor===cursor||!next.runs.length)break;
  cursor=next.cursor;
 }
 return [...newest.values()];
}
/** Hermes Agent: the newest run document in each job's `cron/output/<job>/`. */
function hermesLatest(root:string):HarnessJobRun[] {
 const output=path.join(root,'cron','output'),runs:(HarnessJobRun|null)[]=[];
 for(const job of directories(output).slice(0,500)){
  let newest:{file:string;at:number}|null=null;
  let names:string[]=[];try{names=fs.readdirSync(path.join(output,job)).filter(name=>name.endsWith('.md'));}catch{}
  for(const file of names){
   try{const info=fs.lstatSync(path.join(output,job,file));if(info.isFile()&&(!newest||info.mtimeMs>newest.at))newest={file,at:Math.round(info.mtimeMs)};}catch{}
  }
  if(newest)runs.push(hermesScheduleRun(job,newest.file,newest.at,readFile(root,path.join(output,job,newest.file))));
 }
 return nonNull(runs);
}
/** OpenClaw: the newest finished `task_runs` row of each automation (2026.9+); null for an older store. */
function openClawLatest(state:string):HarnessJobRun[]|null {
 const database=path.join(state,'state','openclaw.sqlite');
 if(!fs.existsSync(database)||!inside(database,state))return null;
 let db:AgentDatabase|null=null;
 try{
  db=openAgentDatabase(database);db.exec('PRAGMA trusted_schema=OFF');
  if(!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_runs'`).get())return null;
  // SQLite returns the other columns of the row that holds max().
  const rows=db.prepare(`SELECT task_id,source_id,status,max(ended_at) AS ended_at,error,terminal_summary,detail_json FROM task_runs WHERE runtime='cron' AND ended_at IS NOT NULL AND source_id IS NOT NULL
   AND status NOT IN ('running','queued','cancelled') GROUP BY source_id LIMIT 500`).all() as any[];
  return nonNull(rows.map(row=>openClawScheduleRun({id:row.task_id,job:row.source_id,at:Number(row.ended_at),status:row.status,summary:row.terminal_summary,error:row.error,detail:json(row.detail_json)})));
 }catch{return null;}
 finally{try{db?.close();}catch{}}
}

/** The schedule of the person's `install` Agent with its newest results and its own commands for a change; null when
 * it declares no `schedule`. `run` is the Agent's command line (a fake in checks). */
export function harnessScheduleControls(install:LocalHarnessInstall,environment:HarnessEnvironment,{run=runHarnessCommand,settle=[300,700,1500]}:{run?:Run;settle?:number[]}={}):HarnessSchedule|null {
 const read=harnessService(install.id,'schedule')?HARNESS_SCHEDULES[install.id as LocalHarnessId]?.(environment.home||undefined,environment.env):null;
 if(!read)return null;
 const hermes=install.id==='hermes';
 const root=()=>hermes?discoverHermes(environment.home||undefined,environment.env):openClawState(environment.home||undefined,environment.env);
 const args=(change:HarnessJobChange)=>hermes?hermesJobCommand(change):openClawJobCommand(change);
 const plan=async(change:HarnessJobChange)=>{
  const job=(await read.jobs()).find(item=>item.id===change.job);
  if(!job)throw new WorldletError(`${install.title} no longer has this scheduled task.`);
  if(!jobChangeOffered(job,change.action))throw new WorldletError(change.action==='pause'?'It is paused already.':'It is running already.');
  return job;
 };
 return {
  ...read,
  jobs:()=>read.jobs(),runs:cursor=>read.runs(cursor),running:()=>read.running(),
  async latest(){
   const base=root();
   if(!base)return [];
   return (hermes?hermesLatest(base):openClawLatest(base))??newestByPaging(read);
  },
  // The scheduler's own install command (`hermes gateway install`, `openclaw gateway install`), which also starts it and
  // keeps it running when the computer starts; only on the person's own Start in Settings › Agents › Your Agent › Routines.
  ...read.start?{async startScheduler(){
   const base=root();
   if(hermes&&!base)throw new WorldletError(`${install.title}’s home was not found on this computer.`);
   const result=await run(install,environment,read.start!.split(' ').slice(1),{env:hermes?{HERMES_HOME:base!}:{},timeout:120_000});
   if(result.code!==0)throw new WorldletError(`${install.title} did not start it: `+(commandReason(result.stderr+'\n'+result.stdout)||(result.code===null?'it did not answer in time':'it stopped with code '+result.code)));
   for(const wait of [...settle,3000,5000]){if(await read.running().catch(()=>null)!==false)return;await new Promise(resolve=>setTimeout(resolve,wait));}
  }}:{},
  async preview(change){await plan(change);return commandLine(hermes?'hermes':'openclaw',args(change));},
  async previewCreate(job:HarnessJobCreate){return commandLine(hermes?'hermes':'openclaw',hermes?hermesJobCreateCommand(job):openClawJobCreateCommand(job));},
  async create(job:HarnessJobCreate){
   const base=root();
   if(hermes&&!base)throw new WorldletError(`${install.title}’s home was not found on this computer.`);
   const before=new Set((await read.jobs()).map(item=>item.id));
   const result=await run(install,environment,hermes?hermesJobCreateCommand(job):openClawJobCreateCommand(job),{env:hermes?{HERMES_HOME:base!}:{},timeout:90_000});
   const reason=()=>commandReason(result.stderr+'\n'+result.stdout)||(result.code===null?'it did not answer in time':'it stopped with code '+result.code);
   if(result.code!==0)throw new WorldletError(`${install.title} did not set it up: ${reason()}`);
   // Read back: a job it did not have before, with this name.
   for(let attempt=0;!(await read.jobs()).some(item=>!before.has(item.id)&&item.name===job.name);attempt++){
    if(attempt>=settle.length)throw new WorldletError(`${install.title} did not set it up: ${reason()}`);
    await new Promise(resolve=>setTimeout(resolve,settle[attempt]));
   }
  },
  async change(change){
   await plan(change);
   const base=root();
   if(hermes&&!base)throw new WorldletError(`${install.title}’s home was not found on this computer.`);
   // A run may do its whole job before the command returns (Hermes Agent runs it there and then); the others are quick.
   const result=await run(install,environment,args(change),{env:hermes?{HERMES_HOME:base!}:{},timeout:change.action==='run'?15*60_000:90_000});
   const reason=()=>commandReason(result.stderr+'\n'+result.stdout)||(result.code===null?'it did not answer in time':'it stopped with code '+result.code);
   if(result.code!==0)throw new WorldletError(`${install.title} did not do it: ${reason()}`);
   // OpenClaw's Gateway saves the change itself, a moment after it answers.
   for(let attempt=0;!jobChangeDone(await read.jobs(),change);attempt++){
    if(attempt>=settle.length)throw new WorldletError(`${install.title} did not do it: ${reason()}`);
    await new Promise(resolve=>setTimeout(resolve,settle[attempt]));
   }
  },
 };
}
