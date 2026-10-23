// Scheduled jobs that run on the person's own Agent (owner goal 2026-10-07: "以前信息推到 telegram，现在推到我们的
// mobile app"). Shared rules for the `schedule` Harness service (contracts/harness-services.ts): how OpenClaw's and
// Hermes Agent's own records read as jobs and runs (the adapters' `files` readers, agent-runtime/harness-schedule.ts),
// and, the same for every Harness, how a new run becomes an Attention item and a phone notification and which
// brought copies Worldlet's own routines leave to the Harness. Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessJob,HarnessJobKind,HarnessJobRun,HarnessServiceMode} from '../../contracts/harness-services.ts';
import {processedAttentionContent} from '../attention/index.ts';
import {record,text} from './values.ts';

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
type ItemFacts={kind:'task'|'update';title:string;reason:string;summary:string;source:string;quote:string;at:number;priority?:'important'};
const scheduleItem=(provider:string,{kind,title,reason,summary,source,quote,at,priority}:ItemFacts)=>processedAttentionContent({
 provider,kind,title:clip(title,40),reason,summary:clip(summary,1200),...priority?{priority}:kind==='task'?{priority:'elevated'}:{},occurredAt:new Date(at).toISOString(),
 sources:[{provider,id:clip(source,500),quote:clip(quote,1000)}]});
const itemFor=(harness:ScheduleHarness,facts:ItemFacts)=>scheduleItem('harness:'+harness.id,facts);
/** A run's phone line: what it said on one line, else that it finished or why not. */
const runBody=(failed:boolean,output:string)=>clip((failed?'Did not finish: ':'')+(output?output.replace(/\s+/g,' ').trim():failed?'It stopped without saying why.':'Finished.'),240);
/** One run as an Attention item: a result is Worth Knowing, a failure Worth Doing; a silent run is nothing. */
export function scheduleRunResult(harness:ScheduleHarness,job:HarnessJob|undefined,run:HarnessJobRun,now:number):ScheduleResult|null {
 if(run.status==='silent')return null;
 const name=job?.name||'Scheduled job',failed=run.status==='failed',output=run.output.trim();
 const also=job?.delivery?`\n\n${harness.title} also sent it to ${job.delivery}.`:'';
 const item=itemFor(harness,{kind:failed?'task':'update',title:name,reason:failed?`${harness.title} could not finish it`:`From ${harness.title}'s scheduled job`,
  summary:(output||(failed?'It stopped without saying why.':'It finished without a message.'))+also,source:run.id,quote:output||name,at:run.at});
 const fresh=now-run.at<=SCHEDULE_PUSH_FRESH_MS;
 return {item,push:fresh?{kind:'routine',title:clip(name,80),body:runBody(failed,output),collapse:collapseKey(run.job)}:null};
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
  const how=input.start?' Start it in Settings › Agents › Your Agent › Scheduled.':'';
  stopped={item:itemFor(harness,{kind:'task',title:`Start ${harness.title}'s scheduler`,reason:'Its scheduled jobs are not running',
   summary:`${names} run on ${harness.title}'s own scheduler, which is not running.${how} Worldlet does not run them itself, so they never run twice; each result shows here and on your phone once it runs.`,
   source:'scheduler-stopped:'+now,quote:`${harness.title}'s scheduler is not running`,at:now}),
   push:{kind:'routine',title:`${harness.title}'s scheduled jobs are not running`,body:clip(`Start ${harness.title}'s scheduler so ${names} run.`,240),collapse:collapseKey('scheduler')}};
 }
 return {state,results,stopped};
}

// Worldlet's own scheduled work, by the same rule ------------------------------------------------------------------
// The morning brief, the day's summary and a run of Worldlet's own routine are results nobody watched being made: each
// becomes an Attention item (Worth Knowing; a routine that did not finish, Worth Doing) and, while fresh, a phone
// notification, instead of the Journal opening by itself or a passing notice. The brief and the summary stay cards in
// the Journal; their item opens the Journal on that card. The host only saves what these return.

/** The provider that owns Worldlet's own scheduled results. */
export const WORLDLET_SCHEDULE='worldlet';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const JOURNAL_SOURCE=/^journal:(\d{4}-\d{2}-\d{2})(?::(.{1,200}))?$/;
const worldletItem=(facts:ItemFacts)=>scheduleItem(WORLDLET_SCHEDULE,facts);
const dayLabel=(day:string)=>{const [y,m,d]=day.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-US',{month:'short',day:'numeric'});};
/** The opening lines of a card's Markdown, for the item's summary: no headings (a lone bold label counts), tables,
 * rules or code. */
function cardLines(body:string){
 const lines=body.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(line=>line&&!/^(#|\||[-*_]{3,}$|```|\*\*[^*]+\*\*:?$)/.test(line));
 return lines.slice(0,8).join('\n');
}
/** The two default Routines' names, as context/store/daily.ts `DAILY_ROUTINE_NAMES` has them (kept here too so
 * this file stays free of the artifacts module; scripts/harness-schedule-check.ts checks they match). */
const DAILY_NAMES={plan:'Today’s prep',summary:'Wrap up today'} as const;
/** A kept morning brief (`plan`, Today’s prep) or day summary (Wrap up today): Worth Knowing, opening the Journal on its card (source
 * `journal:<day>:<card id>`). The same day's card saved again updates the same item. It is important enough for a seat
 * in Now: as an ordinary update it went to Later, under the older days' (Mac 4613: Oct 23's brief in Later, Oct 22's
 * summary in Now); dailySuperseded keeps one of each in the Center. */
export function dailyScheduleResult(input:{kind:'plan'|'summary';day:string;artifact:{id:string;title?:string;brief?:string;body?:string};at:number;now:number}):ScheduleResult|null {
 const {kind,day,artifact,at,now}=input;
 if(kind!=='plan'&&kind!=='summary'||!DAY.test(day)||typeof artifact?.id!=='string'||!artifact.id||!Number.isFinite(at))return null;
 const name=DAILY_NAMES[kind]+' · '+dayLabel(day);
 const said=text(artifact.brief)||cardLines(text(artifact.body));
 const item=worldletItem({kind:'update',title:name,reason:kind==='plan'?'Fox made it for your day':'Fox wrote up your day',summary:(said?said+'\n\n':'')+'It is kept in your Journal.',
  source:'journal:'+day+':'+artifact.id,quote:text(artifact.title)||name,at,priority:'important'});
 const line=firstLine(said.replace(/^\s*[-*+]\s+/gm,'').replace(/[*_`>#|]/g,''));
 return {item,push:now-at<=SCHEDULE_PUSH_FRESH_MS?{kind:'routine',title:name,body:clip(line||'Ready in your Journal.',240),collapse:'daily-'+kind}:null};
}
/** A day's brief or summary kept takes over from its routine's earlier days: their open results are read and its runs
 * that did not finish, that day's included, are done, so the Center holds the latest of each instead of a backlog of
 * past days (Mac 4613 kept nine, Oct 13 on, in Later). */
export function dailySuperseded(kind:'plan'|'summary',day:string,items:readonly Record<string,unknown>[]):{id:string;status:'read'|'done'}[] {
 if(kind!=='plan'&&kind!=='summary'||!DAY.test(day))return [];
 const name=DAILY_NAMES[kind]+' · ',failed=new RegExp('^daily:'+kind+':(\\d{4}-\\d{2}-\\d{2})$');
 return items.flatMap((item):{id:string;status:'read'|'done'}[]=>{
  const id=text(item.id),status=text(item.status)||'open',source=text(record(Array.isArray(item.sources)?item.sources[0]:null).id);
  if(!id||item.provider!==WORLDLET_SCHEDULE||status!=='open')return [];
  const result=JOURNAL_SOURCE.exec(source),failure=failed.exec(source);
  if(result&&text(item.title).startsWith(name)&&result[1]<day)return [{id,status:'read' as const}];
  if(failure&&failure[1]<=day)return [{id,status:'done' as const}];
  return [];
 });
}
/** One of the two default Routines that ran and made no card (the Agent failed, or finished without one): Worth Doing,
 * saying so plainly, so it never fails silently (owner decision 2026-10-11). The same day's again updates the item. */
export function dailyScheduleFailure(input:{kind:'plan'|'summary';day:string;reason?:string;at:number;now:number}):ScheduleResult|null {
 const {kind,day,at,now}=input;
 if(kind!=='plan'&&kind!=='summary'||!DAY.test(day)||!Number.isFinite(at))return null;
 const name=DAILY_NAMES[kind]+' · '+dayLabel(day),why=clip(text(input.reason).replace(/\s+/g,' '),300);
 const summary=(why?'It did not finish: '+why:'It did not finish, and your Agent did not say why.')+'\n\nAsk Fox to make it again, or pause it in Settings › Agents › Your Agent › Scheduled.';
 const item=worldletItem({kind:'task',title:name,reason:'Your routine did not finish',summary,source:'daily:'+kind+':'+day,quote:name,at});
 return {item,push:now-at<=SCHEDULE_PUSH_FRESH_MS?{kind:'routine',title:name,body:clip('Did not finish'+(why?': '+why:'.'),240),collapse:'daily-'+kind}:null};
}
/** One run of Worldlet's own routine as the Agent's `routine_tick` reports it (`{ran, job:{id,name,last_status}, late}`,
 * with `output` when the Agent returns what it said): Worth Knowing when it finished, Worth Doing when it did not.
 * Anything else (nothing due, an error before any run) is nothing. */
export function routineScheduleResult(value:unknown,at:number,now:number):ScheduleResult|null {
 const result=record(value),job=record(result.job),id=text(job.id);
 if(result.ran!==true||!id||!Number.isFinite(at))return null;
 const name=text(job.name)||'Scheduled routine',failed=job.last_status!=='ok',late=result.late===true;
 const output=text(result.output)||text(job.last_output);
 const item=worldletItem({kind:failed?'task':'update',title:name,reason:failed?'Your routine did not finish':late?'It ran when your computer woke':'From your scheduled routine',
  summary:output||(failed?'It stopped without saying why. Ask Fox to check your routines.':late?'It ran late, after your computer woke. Ask Fox what it found.':'It finished. Ask Fox what it found.'),
  source:'routine:'+id+':'+Math.round(at),quote:output||name,at});
 return {item,push:now-at<=SCHEDULE_PUSH_FRESH_MS?{kind:'routine',title:clip(name,80),body:runBody(failed,output),collapse:collapseKey('routine-'+id)}:null};
}
/** Where an item opens the Journal, from its sources: the day and the card, or null for any other item. */
export function journalTarget(sources:unknown):{day:string;card?:string}|null {
 for(const ref of Array.isArray(sources)?sources:[]){
  const value=record(ref);
  if(value.provider!==WORLDLET_SCHEDULE||typeof value.id!=='string')continue;
  const match=JOURNAL_SOURCE.exec(value.id);
  if(match)return {day:match[1],...match[2]?{card:match[2]}:{}};
 }
 return null;
}
