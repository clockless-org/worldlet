// The World's Task panel on the right (ui/hud/task-panel.ts): the person's Agent's routines and what it is doing now,
// in one column that scrolls as one (owner request 2026-10-11: Routines on top, then one small window per running task;
// finished work lives only in the Journal). The panel only draws; every decision is here: which rows, in which group
// and order, and the time text of each row.
//
// Inputs are what the host already keeps (the `taskPanel` host action): the person's Agent's scheduled jobs (its
// `schedule` service), today's history rows (only `brought.older`, for older conversations still coming in), the
// runtime task report (source checks running and their next time) and the Applet tasks working now; plus what the page
// itself hears of Fox's background work (`worldlet:fox-status`). Names and schedules only, never prompts or source
// contents.
import type {HarnessJob} from '../../contracts/harness-services.ts';
import {worldLogApplet} from '../activity/index.ts';
import {getApp} from '../applets/index.ts';
import {nextCronRun} from './next-run.ts';

export type TaskGroup='routines'|'now';
/** Who does it: the person's Agent's scheduler, Fox's own background work, an Applet working on a task, a source
 * check, or one of Worldlet's routines. */
export type TaskSource='agent-job'|'fox'|'applet'|'check'|'worldlet';
/** Where selecting a row goes, at most one place. */
export type TaskOpen={applet:string}|{routine:string}|{url:string};
export type TaskRow={
 /** Stable: the source's prefix and its own id. */
 id:string;group:TaskGroup;source:TaskSource;title:string;
 /** The current step of a page Fox drives ("Choosing a court time"). */
 detail:string;
 /** The time text: "In progress", "Tomorrow 6:00 AM", "every hour". */
 when:string;
 /** Started or planned (ms); null for a repeating job with no fixed time. */
 at:number|null;
 open?:TaskOpen;
 /** For a routine's popover: how often and who runs it. */
 every?:string;by?:string;
 /** For the Routines timeline: the day it stands under ("Today", "Tomorrow", "Mon", "Repeating") and the time beside
  * its dot ("8:00 AM", "every hour"). */
 day?:string;clock?:string;
 /** For its Doing now window: who is doing it ("Fox", "YouTube", "Worldlet"), the status lines it shows now, and for
  * a page Fox drives, that page's address. */
 who?:string;lines?:string[];url?:string;
};
/** Every row of a group: the panel scrolls as one column, so nothing is cut to "+N more". */
export type TaskSection={rows:TaskRow[];total:number};
export type TaskPanel={routines:TaskSection;now:TaskSection;empty:boolean;
 /** The narrow-window chip: "Routines 3 · Doing now 1". */
 chip:string};
export type TaskPanelInput={
 jobs?:readonly HarnessJob[];
 /** The Agent whose scheduler runs the jobs ("OpenClaw"). */
 harness?:string|null;
 /** Today's history rows (seconds), any order. */
 history?:readonly unknown[];
 /** Runtime task report rows (`runtimeTaskReport().rows`, seconds). */
 tasks?:readonly unknown[];
 /** Applet tasks working now: catalog key and start (seconds). */
 working?:readonly {id:string;applet:string;at:number}[];
 /** The web page Fox is driving now, if any: its address, title and the steps its status lists. */
 page?:{url:string;title:string;steps?:readonly {text:string;done:boolean}[]}|null;
 /** Fox's background work the page heard of, running now (ms). */
 fox?:readonly {source:string;text:string;at:number}[];
};
/** History kinds the panel reads: only older conversations still coming in, which is a Doing now window. */
export const TASK_PANEL_KINDS=['brought.older'] as const;
/** Routines reach about a week ahead, like the cron reader. */
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

/** A page's host without "www.", or '' for an address that is not a web page. */
export function taskSite(url:string):string {
 const m=typeof url==='string'?/^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url):null;
 return m?m[1].toLowerCase().replace(/^www\./,''):'';
}
/** The two groups, sorted, every row kept. `now` is ms; history and task times are seconds as the host keeps them. */
export function taskPanel(input:TaskPanelInput,now:number,locale?:string):TaskPanel {
 const start=new Date(now).setHours(0,0,0,0);
 const doing:TaskRow[]=[],routines:TaskRow[]=[];
 const inProgress='In progress';

 // Routines ---------------------------------------------------------------------------------------------------------
 const by=input.harness?`${input.harness}’s scheduler`:'Your Agent’s scheduler';
 for(const job of input.jobs??[]){
  if(job.paused||'at' in job.when&&job.when.at<=now)continue;
  const at='cron' in job.when?nextCronRun(job.when.cron,now):'at' in job.when?job.when.at:null;
  const every='everySeconds' in job.when?routineEvery(job.when.everySeconds):'';
  routines.push({id:'job:'+job.id,group:'routines',source:'agent-job',title:clip(job.name),detail:'',when:at!==null?taskPlannedWhen(at,now,locale):every,at,every:taskHowOften(job.when),by,open:{routine:job.id},
   day:at!==null?routineDay(at,now,locale):'Repeating',clock:at!==null?routineClock(at,locale):every});
 }
 const reports=(Array.isArray(input.tasks)?input.tasks:[]).map(obj);
 for(const task of reports){
  if(typeof task.id!=='string'||!task.id.endsWith(':check')||task.enabled===false||task.status==='paused'||task.status==='running')continue;
  const applet=worldLogApplet(task.owner),next=seconds(task.nextAt);
  if(!applet||next===null)continue;
  const at=Math.max(now,next*1000);
  if(at-now>AHEAD_MS)continue;
  routines.push({id:'check:'+applet.key,group:'routines',source:'check',title:`Check ${applet.title}`,detail:'',when:taskPlannedWhen(at,now,locale),at,every:'Regularly, for anything new',by:'Worldlet',open:appletOpen(applet.key),
   day:routineDay(at,now,locale),clock:routineClock(at,locale)});
 }

 // Doing now: one window each ---------------------------------------------------------------------------------------
 // A page Fox drives comes first: it is what the person can watch.
 const page=input.page,site=page?taskSite(page.url):'';
 if(page&&site){
  const steps=(page.steps??[]).filter(step=>typeof step?.text==='string'&&step.text.trim()).slice(-8);
  const current=steps.find(step=>!step.done);
  doing.push({id:'page:'+site,group:'now',source:'fox',title:`Fox is working on ${site}`,detail:current?clip(current.text,60):'',when:inProgress,at:now+1,who:'Fox',url:page.url,open:{url:page.url},
   lines:steps.length?steps.map(step=>(step.done?'✓ ':'› ')+clip(step.text,80)):[`Working on ${clip(page.title||site,60)}`]});
 }
 for(const work of input.fox??[]){
  const text=clip(String(work.text??''));if(!text)continue;
  doing.push({id:'fox:'+work.source,group:'now',source:'fox',title:text,detail:'',when:inProgress,at:work.at,who:'Fox',lines:[text]});
 }
 for(const task of input.working??[]){
  const applet=worldLogApplet(task.applet);if(!applet)continue;
  const at=seconds(task.at);
  doing.push({id:'applet:'+task.id,group:'now',source:'applet',title:`${applet.title} is working on a task`,detail:'',when:inProgress,at:at===null?now:at*1000,open:appletOpen(applet.key),
   who:applet.title,lines:[`Fox handed ${applet.title} a task`,`${applet.title} is working on it`]});
 }
 for(const task of reports){
  if(typeof task.id!=='string'||!task.id.endsWith(':check')||task.status!=='running')continue;
  const applet=worldLogApplet(task.owner);if(!applet)continue;
  const at=seconds(obj(task.execution).startedAt);
  doing.push({id:'check:'+applet.key,group:'now',source:'check',title:`Checking ${applet.title}`,detail:'',when:inProgress,at:at===null?now:at*1000,open:appletOpen(applet.key),
   who:'Worldlet',lines:[`Reading ${applet.title} for anything new`]});
 }
 // Older Hermes Agent conversations still coming in: today's newest report, while it is still bringing them.
 let older:{at:number;body:Record<string,any>}|null=null;
 for(const raw of Array.isArray(input.history)?input.history:[]){
  const row=obj(raw),body={...obj(row.body),...obj(obj(row.body).data)},at=(seconds(row.at)??0)*1000;
  if(String(row.kind)!=='brought.older'||at<start||at>now+60_000||body.agent!=='hermes'||typeof body.brought!=='number')continue;
  if(!older||at>=older.at)older={at,body};
 }
 if(older?.body.status==='bringing'){
  const {body,at}=older,brought=Number(body.brought),left=Number(body.remaining),many=(n:number)=>n.toLocaleString('en-US')+(n===1?' conversation':' conversations');
  doing.push({id:'older:hermes',group:'now',source:'worldlet',title:'Bringing older Hermes Agent conversations',detail:'',when:Number.isFinite(left)&&left>0?left.toLocaleString('en-US')+' to go':inProgress,at,
   who:'Worldlet',lines:[`Brought ${many(Number.isFinite(brought)?brought:0)} so far`+(Number.isFinite(left)&&left>0?` · ${left.toLocaleString('en-US')} to go`:'')]});
 }

 routines.sort((a,b)=>(a.at??Infinity)-(b.at??Infinity));
 doing.sort((a,b)=>(b.at??0)-(a.at??0));
 const chip=[routines.length?'Routines '+routines.length:'',doing.length?'Doing now '+doing.length:''].filter(Boolean).join(' · ');
 return {routines:{rows:routines,total:routines.length},now:{rows:doing,total:doing.length},empty:!doing.length&&!routines.length,chip};
}
