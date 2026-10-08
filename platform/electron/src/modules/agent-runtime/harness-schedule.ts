import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {afterScheduleCursor,hermesScheduleJob,hermesScheduleRun,openClawScheduleJob,openClawScheduleRun,scheduleCursor,scheduleRunsAfter,type LocalHarnessId} from '../../../../../core/agent/index.ts';
import type {HarnessJobRun,HarnessSchedule} from '../../../../../contracts/harness-services.ts';
import {directories,hermesJobs,inside,json,readFile} from './agent-files.ts';
import {discoverHermes} from './hermes-files.ts';
import {openClawState} from './local-memory.ts';
import {scheduledJobs} from './openclaw-files.ts';

// The `schedule` Harness service in mode `files` (contracts/harness-services.ts): the person's jobs run on their own
// Agent's scheduler, and Worldlet reads each run's result from that Agent's folder, read-only like every other reader
// here. What the records mean is Core's `harness-schedule`; the World's consumer (fox/harness-jobs.ts) never asks
// which Harness this is.

/** Runs per call; the consumer calls again with the returned cursor. */
const PAGE=50;
const alive=(pid:unknown)=>{
 if(typeof pid!=='number'||!Number.isInteger(pid)||pid<=0)return false;
 try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException)?.code==='EPERM';}
};
const nonNull=<T>(values:(T|null)[])=>values.filter((value):value is T=>value!==null);

/** OpenClaw: automations in `state/openclaw.sqlite` `cron_jobs` (older `cron/jobs.json`); runs in `task_runs`
 * (runtime `cron`, 2026.9+), before that `cron_run_logs`, and before SQLite `cron/runs/<job>.jsonl`. Its scheduler runs
 * inside its Gateway, which publishes `tmp/openclaw-<uid>/gateway.state.lock` (role `gateway`, its pid) while it runs. */
export function openClawSchedule(home=os.homedir(),environment=process.env):HarnessSchedule {
 const state=openClawState(home,environment);
 const database=path.join(state,'state','openclaw.sqlite');
 const open=()=>{
  if(!fs.existsSync(database)||!inside(database,state))return null;
  const db=new DatabaseSync(database,{readOnly:true,timeout:2000} as any);
  db.exec('PRAGMA trusted_schema=OFF');
  return db;
 };
 const sqliteRuns=(cursor?:string):{runs:HarnessJobRun[];cursor?:string}|null=>{
  let db:DatabaseSync|null=null;
  try{
   db=open();
   if(!db)return null;
   const tables=new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map(row=>row.name));
   if(tables.has('task_runs')){
    const bar=cursor?cursor.indexOf('|'):-1,at=bar>0?Number(cursor!.slice(0,bar)):-1,id=bar>0?cursor!.slice(bar+1):'';
    const rows=db.prepare(`SELECT task_id,source_id,status,ended_at,error,terminal_summary,detail_json FROM task_runs WHERE runtime='cron' AND ended_at IS NOT NULL AND source_id IS NOT NULL
     AND (ended_at>? OR (ended_at=? AND task_id>?)) ORDER BY ended_at,task_id LIMIT ?`).all(at,at,id,PAGE) as any[];
    // Running and cancelled rows are skipped, yet the cursor passes them, so each row is read once.
    const last=rows[rows.length-1];
    return {runs:nonNull(rows.map(row=>openClawScheduleRun({id:row.task_id,job:row.source_id,at:Number(row.ended_at),status:row.status,summary:row.terminal_summary,error:row.error,detail:json(row.detail_json)}))),
     ...last?{cursor:scheduleCursor({at:Number(last.ended_at),id:String(last.task_id)})}:cursor?{cursor}:{}};
   }
   if(tables.has('cron_run_logs')){
    const rows=db.prepare('SELECT * FROM cron_run_logs ORDER BY ts LIMIT 20000').all() as any[];
    return scheduleRunsAfter(nonNull(rows.map(row=>{const entry=json(row.entry_json)??{};return openClawScheduleRun({id:row.run_id??entry.runId??`${row.job_id}:${row.ts}:${row.seq??0}`,job:row.job_id,at:Number(row.ts),status:row.status??entry.status,summary:row.summary??entry.summary,error:row.error??entry.error,detail:entry});})),cursor,PAGE);
   }
   return null;
  }catch{return null;}
  finally{try{db?.close();}catch{}}
 };
 const fileRuns=(cursor?:string)=>{
  const folder=path.join(state,'cron','runs'),runs:HarnessJobRun[]=[];
  let names:string[]=[];try{names=fs.readdirSync(folder).filter(name=>name.endsWith('.jsonl')).slice(0,500);}catch{}
  for(const name of names)for(const line of readFile(state,path.join(folder,name),16_000_000).split('\n')){
   const entry=json(line);
   if(entry?.action!=='finished')continue;
   const run=openClawScheduleRun({id:entry.runId??`${entry.jobId}:${entry.ts}`,job:entry.jobId,at:entry.ts,status:entry.status,summary:entry.summary,error:entry.error,detail:entry});
   if(run)runs.push(run);
  }
  return scheduleRunsAfter(runs,cursor,PAGE);
 };
 return {
  start:'openclaw gateway install',
  async jobs(){return nonNull(scheduledJobs(state).map(openClawScheduleJob));},
  async runs(cursor){return sqliteRuns(cursor)??fileRuns(cursor);},
  async running(){
   if(!fs.existsSync(state))return false;
   const uid=typeof process.getuid==='function'?process.getuid():undefined;
   const file=path.join(state,'tmp',uid===undefined?'openclaw':'openclaw-'+uid,'gateway.state.lock');
   if(!fs.existsSync(file))return false;
   const lock=json(readFile(state,file,64_000));
   // A lock this version cannot read: say nothing rather than claim the Gateway stopped.
   if(!lock||typeof lock!=='object')return null;
   return lock.role==='gateway'&&alive(lock.pid);
  },
 };
}

/** Hermes Agent: jobs in `cron/jobs.json`; each run's document in `cron/output/<job>/<YYYY-MM-DD_HH-MM-SS>.md` (Hermes
 * saves one for every run, delivered or not); its ticker (`hermes gateway`) writes `cron/ticker_heartbeat` each minute. */
export function hermesSchedule(home=os.homedir(),environment=process.env):HarnessSchedule {
 const root=()=>discoverHermes(home,environment);
 /** A heartbeat older than three ticks means the ticker stopped. */
 const STALE=180;
 return {
  start:'hermes gateway install',
  async jobs(){const base=root();return base?nonNull(hermesJobs(base).map(hermesScheduleJob)):[];},
  async runs(cursor){
   const base=root();
   if(!base)return {runs:[],...cursor?{cursor}:{}};
   const output=path.join(base,'cron','output'),found:{id:string;at:number;job:string;file:string}[]=[];
   for(const job of directories(output).slice(0,500)){
    let names:string[]=[];try{names=fs.readdirSync(path.join(output,job)).filter(name=>name.endsWith('.md'));}catch{}
    for(const file of names){
     let at=0;try{const info=fs.lstatSync(path.join(output,job,file));if(!info.isFile())continue;at=Math.round(info.mtimeMs);}catch{continue;}
     const candidate={id:job+'/'+file,at,job,file};
     if(afterScheduleCursor(candidate,cursor))found.push(candidate);
    }
   }
   const page=found.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,PAGE),last=page[page.length-1];
   return {runs:nonNull(page.map(entry=>hermesScheduleRun(entry.job,entry.file,entry.at,readFile(base,path.join(output,entry.job,entry.file))))),
    ...last?{cursor:scheduleCursor(last)}:cursor?{cursor}:{}};
  },
  async running(){
   const base=root();
   if(!base)return false;
   const stamp=Number(readFile(base,path.join(base,'cron','ticker_heartbeat'),64).trim());
   return Number.isFinite(stamp)&&stamp>0&&Date.now()/1000-stamp<STALE;
  },
 };
}

/** The Harnesses whose own scheduler Worldlet reads (`schedule: 'files'` in core/agent/harness-services.ts). */
export const HARNESS_SCHEDULES:Partial<Record<LocalHarnessId,(home?:string,environment?:NodeJS.ProcessEnv)=>HarnessSchedule>>={openclaw:openClawSchedule,hermes:hermesSchedule};
