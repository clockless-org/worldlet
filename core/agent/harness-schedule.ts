// Scheduled jobs that run on the person's own Agent (owner goal 2026-10-07: "以前信息推到 telegram，现在推到我们的
// mobile app"). Shared rules for the `schedule` Harness service (contracts/harness-services.ts): how OpenClaw's and
// Hermes Agent's own records read as jobs and runs (the adapters' `files` readers, agent-runtime/harness-schedule.ts),
// and, the same for every Harness, how a new run becomes an Attention item and a phone notification and which
// brought copies Worldlet's own routines leave to the Harness. Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessJob,HarnessJobKind,HarnessJobRun,HarnessServiceMode} from '../../contracts/harness-services.ts';
import {processedAttentionContent} from '../attention/index.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const clip=(value:string,limit:number)=>[...value].length>limit?[...value].slice(0,limit-1).join('').trimEnd()+'…':value;
const firstLine=(value:string)=>clip(value.replace(/\s+/g,' ').trim(),60);
const ms=(value:unknown):number|null=>{
 const n=typeof value==='string'&&/^\d+(\.\d+)?$/.test(value.trim())?Number(value):value;
 if(typeof n==='number'&&Number.isFinite(n)&&n>0)return n<1e12?Math.round(n*1000):Math.round(n);
 const parsed=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(parsed)?parsed:null;
};
/** Replies that mean "nothing to say": OpenClaw's NO_REPLY/HEARTBEAT_OK and Hermes Agent's [SILENT]. */
const SILENT=/^(\[SILENT\]|SILENT|NO_REPLY|HEARTBEAT_OK)$/i;
const silentText=(value:string)=>{const lines=value.trim().split('\n').map(line=>line.trim()).filter(Boolean);return !lines.length||SILENT.test(lines[0])||SILENT.test(lines[lines.length-1]);};

// OpenClaw (`cron_jobs` / `task_runs` in `state/openclaw.sqlite`; older `cron_run_logs` and `cron/runs/<job>.jsonl`) ---

/** An OpenClaw automation as a Harness job; its monitor jobs (heartbeat) are OpenClaw's own machinery. */
export function openClawScheduleJob(job:unknown):HarnessJob|null {
 const value=record(job),schedule=record(value.schedule),payload=record(value.payload),delivery=record(value.delivery);
 const id=text(value.id);
 if(!id||payload.kind==='heartbeat')return null;
 const prompt=payload.kind==='agentTurn'?text(payload.message):payload.kind==='systemEvent'?text(payload.text):'';
 const kind:HarnessJobKind=record(value.trigger).script?'condition':payload.kind==='script'?'script':prompt?'prompt':'command';
 const when=schedule.kind==='cron'&&text(schedule.expr)?{cron:text(schedule.expr)}:schedule.kind==='every'&&Number(schedule.everyMs)>0?{everySeconds:Math.round(Number(schedule.everyMs)/1000)}
  :schedule.kind==='at'&&ms(schedule.at)?{at:ms(schedule.at)!}:null;
 // Jobs started by another program (on exit, a stream) have no clock time; their runs still come back.
 if(!when)return null;
 const mode=text(delivery.mode),channel=text(delivery.channel);
 return {id,name:clip(text(value.name)||text(value.description)||firstLine(prompt)||'OpenClaw job',120),kind,paused:value.enabled===false,when,
  ...prompt?{prompt:clip(prompt,8000)}:{},...text(value.agentId)?{agent:text(value.agentId)}:{},
  ...mode==='none'?{}:mode==='webhook'?{delivery:'webhook'}:channel&&channel!=='last'?{delivery:channel}:{}};
}
/** One finished OpenClaw run: a `task_runs` row (runtime `cron`; `detail` its parsed `detail_json`), an older
 * `cron_run_logs` row or a `cron/runs/*.jsonl` line, read into one shape by the host. Running and cancelled runs are none. */
export function openClawScheduleRun(entry:{id:unknown;job:unknown;at:unknown;status?:unknown;summary?:unknown;error?:unknown;detail?:unknown}):HarnessJobRun|null {
 const detail=record(entry.detail),id=text(entry.id),job=text(entry.job),at=ms(entry.at);
 if(!id||!job||at===null)return null;
 const status=text(entry.status),inner=text(detail.status);
 if(['running','queued','cancelled'].includes(status))return null;
 const output=text(entry.summary)||text(detail.summary)||text(entry.error)||text(detail.error);
 const failed=['failed','timed_out','lost','error'].includes(status)&&inner!=='skipped'||inner==='error';
 const silent=!failed&&(inner==='skipped'||['silent','empty','heartbeat'].includes(text(detail.deliverySuppressionReason))||silentText(output));
 return {id,job,at,status:failed?'failed':silent?'silent':'ok',output:clip(output,16000)};
}

// Hermes Agent (`cron/jobs.json`, `cron/output/<job>/<YYYY-MM-DD_HH-MM-SS>.md`, `cron/ticker_heartbeat`) ----------------

/** A Hermes Agent cron job as a Harness job. */
export function hermesScheduleJob(job:unknown):HarnessJob|null {
 const value=record(job),schedule=record(value.schedule),origin=record(value.origin);
 const id=text(value.id),prompt=text(value.prompt);
 if(!id)return null;
 const kind:HarnessJobKind=value.monitor_script||value.monitor_url?'condition':value.script||value.no_agent?'script':'prompt';
 const when=schedule.kind==='cron'&&text(schedule.expr)?{cron:text(schedule.expr)}:schedule.kind==='interval'&&Number(schedule.minutes)>0?{everySeconds:Math.round(Number(schedule.minutes)*60)}
  :schedule.kind==='once'&&ms(schedule.run_at)?{at:ms(schedule.run_at)!}:null;
 if(!when)return null;
 const deliver=text(value.deliver),delivery=deliver==='origin'?text(origin.platform):deliver;
 return {id,name:clip(text(value.name)||firstLine(prompt)||'Hermes job',120),kind,paused:value.enabled===false||value.state==='paused',when,
  ...prompt?{prompt:clip(prompt,8000)}:{},...delivery&&delivery!=='local'&&delivery!=='worldlet'?{delivery}:{}};
}
/** One Hermes Agent run document (`# Cron Job: <name>`, a `(FAILED)` title or `**Status:** BLOCKED` when it did not
 * finish, its answer under `## Response`; `[SILENT]` when the job chose to say nothing). `at`: when it was written. */
export function hermesScheduleRun(job:string,file:string,at:number,doc:string):HarnessJobRun|null {
 if(!text(job)||!/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}.*\.md$/.test(file)||!Number.isFinite(at))return null;
 const title=(/^# Cron Job: (.*)$/m.exec(doc)?.[1]??'').trim();
 const failed=/\(FAILED\)$/.test(title)||/^\*\*Status:\*\* BLOCKED/m.test(doc);
 const section=(name:string)=>new RegExp('^## '+name+'\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))','m').exec(doc)?.[1]?.trim();
 // The answer is the document's last section, and may hold headings of its own.
 const response=/^## Response\s*\n([\s\S]*)/m.exec(doc)?.[1]?.trim(),error=section('Error');
 // A failure's traceback ends with what went wrong; a document with neither says it in its own text after the header
 // (a blocked configuration, a skipped gate).
 const body=response??(error!==undefined?error.replace(/```/g,'').trim().split('\n').filter(line=>line.trim()).pop()?.trim()??''
  :doc.replace(/^## Prompt\s*\n[\s\S]*?(?=^## |(?![\s\S]))/m,'').replace(/^# Cron Job: .*$/m,'').replace(/^\*\*(Job ID|Run Time|Schedule|Status):\*\*.*$/gm,'').trim());
 const silent=!failed&&(response!==undefined?silentText(response):/wakeAgent=false/.test(doc));
 return {id:job+'/'+file,job,at:Math.round(at),status:failed?'failed':silent?'silent':'ok',output:clip(body,16000)};
}

// Cursors: a run's end time and id, so runs that end in the same millisecond are not lost ---------------------------

export const scheduleCursor=(run:{at:number;id:string})=>run.at+'|'+run.id;
export function afterScheduleCursor(run:{at:number;id:string},cursor?:string):boolean {
 if(!cursor)return true;
 const bar=cursor.indexOf('|'),at=Number(cursor.slice(0,bar)),id=cursor.slice(bar+1);
 return !Number.isFinite(at)||run.at>at||run.at===at&&run.id>id;
}
/** Runs after `cursor`, oldest first, at most `limit`, with the cursor to continue from. */
export function scheduleRunsAfter(runs:HarnessJobRun[],cursor:string|undefined,limit=50):{runs:HarnessJobRun[];cursor?:string} {
 const next=runs.filter(run=>afterScheduleCursor(run,cursor)).sort((a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,limit);
 return next.length?{runs:next,cursor:scheduleCursor(next[next.length-1])}:{runs:[],...cursor?{cursor}:{}};
}

// The World's side, the same for every Harness --------------------------------------------------------------------

export type ScheduleHarness={id:string;title:string};
/** What the World remembers per Harness (world.sqlite `world_settings` `harness-schedule:<id>`). */
export type ScheduleState={version:1;since:number;cursor?:string;stoppedNoted?:boolean};
export type SchedulePush={kind:'routine';title:string;body:string;collapse:string};
export type ScheduleResult={item:Record<string,unknown>;push:SchedulePush|null};
/** Brought copies with these routine key prefixes are left to the Harness's own scheduler: its jobs came from the
 * Agent that is now Fox's Harness (routine keys start with the Agent's ID, core `migrationRoutineKey`). */
export function scheduleElsewhere(harness:string,mode:HarnessServiceMode|null):string[] {
 return mode==='files'||mode==='native'?[harness+':']:[];
}
/** Runs ended before Worldlet first watched this Harness are history, not news. */
export const SCHEDULE_PUSH_MAX=3,SCHEDULE_PUSH_FRESH_MS=12*3600_000,SCHEDULE_ITEMS_MAX=20;
const collapseKey=(job:string)=>('job-'+job.replace(/[^A-Za-z0-9_.-]+/g,'-')).slice(0,64);
const itemFor=(harness:ScheduleHarness,{kind,title,reason,summary,source,quote,at}:{kind:'task'|'update';title:string;reason:string;summary:string;source:string;quote:string;at:number})=>processedAttentionContent({
 provider:'harness:'+harness.id,kind,title:clip(title,40),reason,summary:clip(summary,1200),...kind==='task'?{priority:'elevated'}:{},occurredAt:new Date(at).toISOString(),
 sources:[{provider:'harness:'+harness.id,id:clip(source,500),quote:clip(quote,1000)}]});
/** One run as an Attention item: a result is Worth Knowing, a failure Worth Doing; a silent run is nothing. */
export function scheduleRunResult(harness:ScheduleHarness,job:HarnessJob|undefined,run:HarnessJobRun,now:number):ScheduleResult|null {
 if(run.status==='silent')return null;
 const name=job?.name||'Scheduled job',failed=run.status==='failed',output=run.output.trim();
 const also=job?.delivery?`\n\n${harness.title} also sent it to ${job.delivery}.`:'';
 const item=itemFor(harness,{kind:failed?'task':'update',title:name,reason:failed?`${harness.title} could not finish it`:`From ${harness.title}'s scheduled job`,
  summary:(output||(failed?'It stopped without saying why.':'It finished without a message.'))+also,source:run.id,quote:output||name,at:run.at});
 const fresh=now-run.at<=SCHEDULE_PUSH_FRESH_MS;
 return {item,push:fresh?{kind:'routine',title:clip(name,80),body:clip((failed?'Did not finish: ':'')+(firstLine(output)?output.replace(/\s+/g,' ').trim():failed?'It stopped without saying why.':'Finished.'),240),collapse:collapseKey(run.job)}:null};
}
/** One poll: new runs after the remembered cursor become results (at most SCHEDULE_PUSH_MAX of them push), and a
 * Harness whose scheduler is not running while it has jobs to run is noted once until it runs again. The first poll
 * only remembers where the Harness's history ends. */
export function scheduleStep(input:{harness:ScheduleHarness;state:ScheduleState|null;jobs:HarnessJob[];runs:HarnessJobRun[];cursor?:string;running:boolean|null;start?:string;now:number}):{state:ScheduleState;results:ScheduleResult[];stopped:ScheduleResult|null} {
 const {harness,jobs,now}=input;
 const state:ScheduleState=input.state?.version===1?{...input.state}:{version:1,since:now};
 const first=!input.state;
 const byId=new Map(jobs.map(job=>[job.id,job]));
 const results:ScheduleResult[]=[];
 let pushes=0;
 for(const run of input.runs){
  if(first||run.at<state.since||results.length>=SCHEDULE_ITEMS_MAX)continue;
  const result=scheduleRunResult(harness,byId.get(run.job),run,now);
  if(!result)continue;
  if(result.push&&pushes++>=SCHEDULE_PUSH_MAX)result.push=null;
  results.push(result);
 }
 if(input.cursor)state.cursor=input.cursor;
 let stopped:ScheduleResult|null=null;
 const waiting=jobs.filter(job=>!job.paused);
 if(input.running===true)delete state.stoppedNoted;
 else if(input.running===false&&waiting.length&&!state.stoppedNoted){
  state.stoppedNoted=true;
  const names=waiting.slice(0,5).map(job=>job.name).join(', ')+(waiting.length>5?` and ${waiting.length-5} more`:'');
  const how=input.start?` Start it with \`${input.start}\`.`:'';
  stopped={item:itemFor(harness,{kind:'task',title:`Start ${harness.title}'s scheduler`,reason:'Its scheduled jobs are not running',
   summary:`${names} run on ${harness.title}'s own scheduler, which is not running.${how} Worldlet does not run them itself, so they never run twice; each result shows here and on your phone once it runs.`,
   source:'scheduler-stopped:'+now,quote:`${harness.title}'s scheduler is not running`,at:now}),
   push:{kind:'routine',title:`${harness.title}'s scheduled jobs are not running`,body:clip(`Start ${harness.title}'s scheduler so ${names} run.`,240),collapse:collapseKey('scheduler')}};
 }
 return {state,results,stopped};
}
