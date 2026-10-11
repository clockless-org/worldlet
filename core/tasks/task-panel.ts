// The World's Task panel on the right (ui/hud/task-panel.ts): what the person's Agent is doing now, what is planned
// and what was done today, in three groups, so the person can see background work without asking. The panel only
// draws; every decision is here: which rows, in which group and order, how many before "+N more", how a day of
// repeated Applet checks folds into one row, which rows failed, and the time text on the right of each row.
//
// Inputs are what the host already keeps (the `taskPanel` host action): the person's Agent's scheduled jobs (its
// `schedule` service), today's history rows (`applet.check`, `applet.task`, `routine.run`, `brought.older`), the
// runtime task report (source checks running and their next time), today's scheduled-job runs that became Attention
// items (core/agent/harness-schedule.ts), and the Applet tasks working now; plus what the page itself hears of Fox's
// background work (`worldlet:fox-status`). Names and schedules only, never prompts or source contents.
import type {HarnessJob} from '../../contracts/harness-services.ts';
import {worldLogApplet} from '../activity/index.ts';
import {getApp} from '../applets/index.ts';
import {nextCronRun} from './next-run.ts';

export type TaskGroup='now'|'planned'|'done';
/** Who does it: the person's Agent's scheduler, Fox's own background work, an Applet working on a task, a source
 * check, or one of Worldlet's routines. */
export type TaskSource='agent-job'|'fox'|'applet'|'check'|'worldlet';
/** Where selecting a row goes, at most one place. */
export type TaskOpen={applet:string}|{journal:string;card?:string}|{attention:string}|{routine:string};
export type TaskRow={
 /** Stable: the source's prefix and its own id. */
 id:string;group:TaskGroup;source:TaskSource;title:string;
 /** The current step, "6 times", "will retry". */
 detail:string;
 /** The right-hand time: "In progress", "Tomorrow 6:00 AM", "every hour", "9:12 AM". */
 when:string;
 /** Started, planned or finished (ms); null for a repeating job with no fixed time. */
 at:number|null;
 failed?:true;
 /** Folded runs (a day of checks of one Applet). */
 count?:number;
 open?:TaskOpen;
 /** For a planned row's popover: how often and who runs it. */
 every?:string;by?:string;
};
export type TaskSection={rows:TaskRow[];more:number;total:number};
export type TaskPanel={now:TaskSection;planned:TaskSection;done:TaskSection;empty:boolean;
 /** The narrow-window chip: "Doing now 1 · Planned 3". */
 chip:string};
export type TaskPanelInput={
 jobs?:readonly HarnessJob[];
 /** The Agent whose scheduler runs the jobs ("OpenClaw"). */
 harness?:string|null;
 /** Today's history rows (seconds), any order. */
 history?:readonly unknown[];
 /** Runtime task report rows (`runtimeTaskReport().rows`, seconds). */
 tasks?:readonly unknown[];
 /** Today's scheduled-job results as Attention items (`taskPanelScheduleRuns`). */
 runs?:readonly {id:string;title:string;at:number;failed?:boolean}[];
 /** Applet tasks working now: catalog key and start (seconds). */
 working?:readonly {id:string;applet:string;at:number}[];
 /** Fox's background work the page heard of: running now, and what it finished (ms). */
 fox?:readonly {source:string;text:string;at:number}[];
 foxDone?:readonly {source:string;text:string;at:number}[];
};
/** Rows shown in each group before "+N more". */
export const TASK_PANEL_LIMITS={now:3,planned:4,done:4} as const;
/** History kinds the panel reads. */
export const TASK_PANEL_KINDS=['applet.check','applet.task','routine.run','brought.older'] as const;
/** Planned rows reach about a week ahead, like the cron reader. */
const AHEAD_MS=8*86_400_000;

const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const clip=(value:string,limit=80)=>{const text=value.replace(/\s+/g,' ').trim();return [...text].length>limit?[...text].slice(0,limit-1).join('').trimEnd()+'…':text;};
const seconds=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
const appletOpen=(key:string):TaskOpen|undefined=>{const id=getApp(key)?.id;return id?{applet:id}:undefined;};

/** "Today", "Tomorrow" or "Mon": the day something runs, in the viewer's own locale. */
export function routineDay(at:number,now=Date.now(),locale?:string){
 const ahead=Math.round((new Date(at).setHours(12,0,0,0)-new Date(now).setHours(12,0,0,0))/86_400_000);
 const word=ahead<=1?new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(Math.max(0,ahead),'day'):new Intl.DateTimeFormat(locale,{weekday:'short'}).format(at);
 return word.charAt(0).toLocaleUpperCase(locale)+word.slice(1);
}
/** "8:00 AM", in the viewer's own locale. */
export const routineClock=(at:number,locale?:string)=>new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit'}).format(at);
/** "every hour", "every 30 min", "every 2 days". */
export function routineEvery(secondsBetween:number){
 const [n,unit]=secondsBetween%86400===0?[secondsBetween/86400,'day']:secondsBetween%3600===0?[secondsBetween/3600,'hour']:[Math.max(1,Math.round(secondsBetween/60)),'min'];
 return n===1?'every '+unit:'every '+n+' '+unit+(unit==='min'?'':'s');
}
/** A planned time: the clock today, else the day and the clock ("Tomorrow 6:00 AM", "Mon 6:30 AM"). */
export function taskPlannedWhen(at:number,now:number,locale?:string){
 const day=routineDay(at,now,locale),clock=routineClock(at,locale);
 return new Date(at).toDateString()===new Date(now).toDateString()?clock:day+' '+clock;
}
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/** How often a job runs, in plain words, for the planned row's popover. */
export function taskHowOften(when:HarnessJob['when']):string {
 if('everySeconds' in when)return routineEvery(when.everySeconds).replace(/^e/,'E');
 if('at' in when)return 'Once';
 const [minute,hour,day,month,weekday]=when.cron.trim().split(/\s+/);
 const fixed=(v:string|undefined)=>!!v&&/^\d+$/.test(v);
 const step=/^\*\/(\d+)$/.exec(minute??'');
 if(step&&hour==='*'&&day==='*'&&month==='*'&&weekday==='*')return routineEvery(Number(step[1])*60).replace(/^e/,'E');
 if(fixed(minute)&&hour==='*'&&day==='*'&&month==='*'&&weekday==='*')return 'Every hour';
 if(fixed(minute)&&fixed(hour)&&month==='*'){
  if(day==='*'&&weekday==='*')return 'Every day';
  if(day==='*'&&weekday==='1-5')return 'Every weekday';
  if(day==='*'&&fixed(weekday))return 'Every '+WEEKDAYS[Number(weekday)%7];
  if(fixed(day)&&weekday==='*')return 'Every month';
 }
 return 'On its own schedule';
}

/** Today's scheduled-job results among the World's items (core/agent/harness-schedule.ts writes them with the provider
 * `harness:<id>`): each run's name, time and whether it failed, for the Done group. The note that a scheduler is not
 * running is not a run. */
export function taskPanelScheduleRuns(items:readonly unknown[],now:number):{id:string;title:string;at:number;failed?:true}[] {
 const start=new Date(now).setHours(0,0,0,0),out:{id:string;title:string;at:number;failed?:true}[]=[];
 for(const raw of Array.isArray(items)?items:[]){
  const item=obj(raw),provider=typeof item.provider==='string'?item.provider:'';
  if(!provider.startsWith('harness:')||typeof item.id!=='string'||typeof item.title!=='string')continue;
  if(String(obj(Array.isArray(item.sources)?item.sources[0]:null).id??'').startsWith('scheduler-stopped:'))continue;
  const at=Date.parse(String(item.occurredAt??''));
  if(!Number.isFinite(at)||at<start||at>now+60_000)continue;
  out.push({id:item.id,title:clip(item.title),at,...item.kind==='task'?{failed:true as const}:{}});
 }
 return out;
}

function section(rows:TaskRow[],limit:number):TaskSection {return {rows:rows.slice(0,limit),more:Math.max(0,rows.length-limit),total:rows.length};}

/** The three groups, sorted, capped and folded. `now` is ms; history and task times are seconds as the host keeps them. */
export function taskPanel(input:TaskPanelInput,now:number,locale?:string):TaskPanel {
 const start=new Date(now).setHours(0,0,0,0),today=new Date(now),day=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
 const doing:TaskRow[]=[],planned:TaskRow[]=[],done:TaskRow[]=[];
 const inProgress='In progress';

 // Doing now ------------------------------------------------------------------------------------------------------
 for(const work of input.fox??[]){
  const text=clip(String(work.text??''));if(!text)continue;
  doing.push({id:'fox:'+work.source,group:'now',source:'fox',title:text,detail:'',when:inProgress,at:work.at});
 }
 for(const task of input.working??[]){
  const applet=worldLogApplet(task.applet);if(!applet)continue;
  const at=seconds(task.at);
  doing.push({id:'applet:'+task.id,group:'now',source:'applet',title:`${applet.title} is working on a task`,detail:'',when:inProgress,at:at===null?now:at*1000,open:appletOpen(applet.key)});
 }
 const reports=(Array.isArray(input.tasks)?input.tasks:[]).map(obj);
 for(const task of reports){
  if(typeof task.id!=='string'||!task.id.endsWith(':check')||task.status!=='running')continue;
  const applet=worldLogApplet(task.owner);if(!applet)continue;
  const at=seconds(obj(task.execution).startedAt);
  doing.push({id:'check:'+applet.key,group:'now',source:'check',title:`Checking ${applet.title}`,detail:'',when:inProgress,at:at===null?now:at*1000,open:appletOpen(applet.key)});
 }

 // Today's history, oldest first ----------------------------------------------------------------------------------
 const history=(Array.isArray(input.history)?input.history:[]).map(obj).map(row=>({row,body:{...obj(row.body),...obj(obj(row.body).data)},at:(seconds(row.at)??0)*1000}))
  .filter(entry=>entry.at>=start&&entry.at<=now+60_000).sort((a,b)=>a.at-b.at||Number(a.row.seq)-Number(b.row.seq));
 const checks=new Map<string,{title:string;count:number;at:number;failedAt:number}>();
 let older:{at:number;body:Record<string,any>}|null=null;
 for(const {row,body,at} of history){
  const kind=String(row.kind);
  if(kind==='applet.check'){
   const applet=worldLogApplet(row.key)??worldLogApplet(body.appletId)??worldLogApplet(body.provider);
   if(!applet||body.status==='started'||body.status==='cancelled')continue;
   const fold=checks.get(applet.key)??{title:applet.title,count:0,at:0,failedAt:0};
   // A check that failed and then succeeded was retried: only a failure newer than the last success is shown.
   if(body.status==='complete'){fold.count++;fold.at=at;fold.failedAt=0;}else fold.failedAt=at;
   checks.set(applet.key,fold);
  }else if(kind==='applet.task'){
   const applet=worldLogApplet(row.key)??worldLogApplet(body.appletId);
   if(!applet||body.status==='started'||body.status==='cancelled')continue;
   const failed=body.status!=='complete';
   done.push({id:'task:'+String(body.runId??row.seq),group:'done',source:'applet',title:failed?`${applet.title} couldn’t finish a task`:`${applet.title} finished a task`,
    detail:failed?'Not finished':'',when:'',at,...failed?{failed:true as const}:{},open:appletOpen(applet.key)});
  }else if(kind==='routine.run'){
   const name=typeof body.name==='string'&&body.name.trim()?clip(body.name,80):'A routine';
   const failed=body.status!=='complete';
   done.push({id:'routine:'+String(row.seq??at),group:'done',source:'worldlet',title:name,detail:failed?'Not finished':body.late===true?'Ran late':'',when:'',at,...failed?{failed:true as const}:{}});
  }else if(kind==='brought.older'){
   if(body.agent==='hermes'&&typeof body.brought==='number')older={at,body};
  }
 }
 for(const [key,fold] of checks){
  if(fold.count)done.push({id:'checked:'+key,group:'done',source:'check',title:`Checked ${fold.title}`,detail:fold.count>1?`${fold.count} times`:'',when:'',at:fold.at,count:fold.count,open:appletOpen(key)});
  if(fold.failedAt)done.push({id:'check-failed:'+key,group:'done',source:'check',title:`${fold.title} check didn’t finish`,detail:'will retry',when:'',at:fold.failedAt,failed:true,open:appletOpen(key)});
 }
 if(older){
  const {body,at}=older,brought=Number(body.brought),left=Number(body.remaining),many=(n:number)=>n.toLocaleString('en-US')+(n===1?' conversation':' conversations');
  if(body.status==='bringing')doing.push({id:'older:hermes',group:'now',source:'worldlet',title:'Bringing older Hermes Agent conversations',detail:'',when:Number.isFinite(left)&&left>0?left.toLocaleString('en-US')+' to go':inProgress,at});
  else done.push({id:'older:hermes',group:'done',source:'worldlet',title:'Brought older Hermes Agent conversations',detail:body.status==='complete'?many(brought):'the oldest stayed behind',when:'',at});
 }
 for(const run of input.runs??[]){
  if(!Number.isFinite(run.at)||run.at<start)continue;
  done.push({id:'run:'+run.id,group:'done',source:'agent-job',title:clip(run.title),detail:run.failed?'Not finished':'',when:'',at:run.at,...run.failed?{failed:true as const}:{},open:{attention:run.id}});
 }
 for(const work of input.foxDone??[]){
  const text=clip(String(work.text??''));if(!text||work.at<start)continue;
  done.push({id:'fox-done:'+work.source+':'+work.at,group:'done',source:'fox',title:text,detail:'',when:'',at:work.at,open:{journal:day}});
 }

 // Planned --------------------------------------------------------------------------------------------------------
 const by=input.harness?`${input.harness}’s scheduler`:'Your Agent’s scheduler';
 for(const job of input.jobs??[]){
  if(job.paused||'at' in job.when&&job.when.at<=now)continue;
  const at='cron' in job.when?nextCronRun(job.when.cron,now):'at' in job.when?job.when.at:null;
  const every='everySeconds' in job.when?routineEvery(job.when.everySeconds):'';
  planned.push({id:'job:'+job.id,group:'planned',source:'agent-job',title:clip(job.name),detail:'',when:at!==null?taskPlannedWhen(at,now,locale):every,at,every:taskHowOften(job.when),by,open:{routine:job.id}});
 }
 for(const task of reports){
  if(typeof task.id!=='string'||!task.id.endsWith(':check')||task.enabled===false||task.status==='paused'||task.status==='running')continue;
  const applet=worldLogApplet(task.owner),next=seconds(task.nextAt);
  if(!applet||next===null)continue;
  const at=Math.max(now,next*1000);
  if(at-now>AHEAD_MS)continue;
  planned.push({id:'check:'+applet.key,group:'planned',source:'check',title:`Check ${applet.title}`,detail:'',when:taskPlannedWhen(at,now,locale),at,every:'Regularly, for anything new',by:'Worldlet',open:appletOpen(applet.key)});
 }

 doing.sort((a,b)=>(b.at??0)-(a.at??0));
 planned.sort((a,b)=>(a.at??Infinity)-(b.at??Infinity));
 done.sort((a,b)=>(b.at??0)-(a.at??0));
 for(const row of done)row.when=routineClock(row.at!,locale);
 const panel={now:section(doing,TASK_PANEL_LIMITS.now),planned:section(planned,TASK_PANEL_LIMITS.planned),done:section(done,TASK_PANEL_LIMITS.done)};
 const parts=[panel.now.total?'Doing now '+panel.now.total:'',panel.planned.total?'Planned '+panel.planned.total:''].filter(Boolean);
 return {...panel,empty:!doing.length&&!planned.length&&!done.length,chip:parts.length?parts.join(' · '):done.length?'Done today '+done.length:''};
}
