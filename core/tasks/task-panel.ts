// The World's tasks beside Fox (ui/hud/task-panel.ts): what the person's Agent is doing now on Fox's left and the
// Routines about to run on its right, each one small card in the same style (owner request 2026-10-11: tasks either
// side of Fox, Fox and its message bar between them as the way to talk to the Agent; finished work lives only in the
// Journal). The panel only draws; every decision is here: which rows, in which group and order, and each card's text.
//
// Only what the person set going shows (owner rule 2026-10-11): their own Routines (jobs on their Agent's scheduler,
// paused ones last, and Worldlet's two daily Routines, which they can pause in Settings › Agents) and the work they or
// their Agent's Routines started (a page Fox drives, Fox's background work, an Applet working on a task Fox handed it). An Applet's
// own regular checks (Mail, Notes, Notion) and Worldlet's housekeeping are not the person's tasks and never show here;
// what they find comes up as Artifacts. Names and schedules only, never prompts or source contents.
import type {HarnessJob} from '../../contracts/harness-services.ts';
import {worldLogApplet} from '../../context/activity/index.ts';
import {getApp} from '../applets/index.ts';
import {nextCronRun} from './next-run.ts';
import {DAILY_ROUTINE_NAMES} from '../../context/artifacts/index.ts';

export type TaskGroup='routines'|'now';
/** Who does it: the person's Agent's scheduler, Fox (its background work and Worldlet's daily Routines), or an Applet
 * working on a task Fox handed it. */
export type TaskSource='agent-job'|'fox'|'applet';
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
 /** Its card: a short name, one line of what it is doing or when it runs, and the picture beside them (`fox`, `clock`
  * for a routine, or an Applet's catalog key). */
 name:string;status:string;icon:string;
 /** How far along a running task is (0 to 1), only when it is known; the card's bar moves on its own otherwise. */
 progress?:number;
 /** A Routine's own controls in its popover (owner request 2026-10-12, "routines 要可以删除可以重启可以修改"): the
  * Agent's job as its scheduler keeps it, or which of Worldlet's two daily Routines, and whether it is paused. */
 routine?:{job:string;when:HarnessJob['when'];kind:HarnessJob['kind'];paused:boolean}|{daily:'plan'|'summary';paused:boolean};
};
/** Every row of a group; the panel decides how many cards fit beside Fox. */
export type TaskSection={rows:TaskRow[];total:number};
export type TaskPanel={routines:TaskSection;now:TaskSection;empty:boolean};
export type TaskPanelInput={
 jobs?:readonly HarnessJob[];
 /** The Agent whose scheduler runs the jobs ("OpenClaw"). */
 harness?:string|null;
 /** Applet tasks working now: catalog key and start (seconds). */
 working?:readonly {id:string;applet:string;at:number}[];
 /** The web page Fox is driving now, if any: its address, title and the steps its status lists. */
 page?:{url:string;title:string;steps?:readonly {text:string;done:boolean}[]}|null;
 /** Fox's background work the page heard of, running now (ms), with the name its card goes by when it has one (a
  * follow-up on an Artifact goes by that Artifact's title). */
 fox?:readonly {source:string;text:string;at:number;name?:string}[];
 /** When Fox makes the next morning brief and today's summary (context/artifacts `dailyPlanned`, ms). */
 daily?:readonly {kind:'plan'|'summary';at:number}[];
 /** Which of those two the person paused: each stays, saying so, so it can be resumed from its card. */
 dailyPaused?:readonly ('plan'|'summary')[];
};
/** Routines reach about a week ahead, like the cron reader. */
const AHEAD_MS=8*86_400_000;

const clip=(value:string,limit=80)=>{const text=value.replace(/\s+/g,' ').trim(),chars=[...text];return chars.length>limit?chars.slice(0,limit-1).join('').trimEnd()+'…':text;};
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
 return planned(at,now,locale).when;
}
/** A planned row's three time texts at once: each formats the day and the clock only once. */
function planned(at:number,now:number,locale?:string){
 const day=routineDay(at,now,locale),clock=routineClock(at,locale);
 return {when:new Date(at).toDateString()===new Date(now).toDateString()?clock:day+' '+clock,day,clock};
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
/** The source a turn of the conversation reports its work under (`worldlet:fox-status`) while Fox does something in it:
 * the person told Fox to do a thing, so it is a task beside Fox like any other (owner request 2026-10-11, "跟小狐狸说要做
 * 什么事的时候也是生成一个 task 直接弄到右边去"). */
export const TURN_TASK_SOURCE='turn';
/** What that task's card is called: the person's own words, short. */
export function turnTaskName(said:string){return clip(said.split('\n').find(line=>line.trim())??'',40)||'Fox';}

/** The two groups, sorted, every row kept. `now` is ms; Applet task starts are seconds as the host keeps them. */
export function taskPanel(input:TaskPanelInput,now:number,locale?:string):TaskPanel {
 const doing:TaskRow[]=[],routines:TaskRow[]=[];
 const inProgress='In progress';

 // Routines ---------------------------------------------------------------------------------------------------------
 const by=input.harness?`${input.harness}’s scheduler`:'Your Agent’s scheduler';
 for(const job of input.jobs??[]){
  if('at' in job.when&&job.when.at<=now)continue;
  // A paused one came along with the Agent too (setup counts it): it shows last, saying so (owner report 2026-10-12,
  // Kelvin: "读到了四个 routine … 并没有在最后的 world 里面显示").
  if(job.paused){
   routines.push({id:'job:'+job.id,group:'routines',source:'agent-job',title:clip(job.name),detail:'',when:'Paused',at:null,every:taskHowOften(job.when),by,open:{routine:job.id},
    day:'Paused',clock:taskHowOften(job.when),name:clip(job.name,40),status:'Paused',icon:'clock',routine:{job:job.id,when:job.when,kind:job.kind,paused:true}});
   continue;
  }
  const at='cron' in job.when?nextCronRun(job.when.cron,now):'at' in job.when?job.when.at:null;
  const every='everySeconds' in job.when?routineEvery(job.when.everySeconds):'';
  const time=at!==null?planned(at,now,locale):{when:every,day:'Repeating',clock:every};
  routines.push({id:'job:'+job.id,group:'routines',source:'agent-job',title:clip(job.name),detail:'',when:time.when,at,every:taskHowOften(job.when),by,open:{routine:job.id},
   day:time.day,clock:time.clock,name:clip(job.name,40),status:time.when,icon:'clock',routine:{job:job.id,when:job.when,kind:job.kind,paused:false}});
 }
 // The two default Routines (Today's prep, Wrap up today; context/artifacts/daily.ts), from the page's daily state: Worldlet
 // asks the person's Agent at that time. A paused one is not planned: it stands last, saying so, so its card can resume it.
 const DAILY_EVERY={plan:'Every morning, while you use Worldlet',summary:'Every evening of a day you use Worldlet'} as const;
 for(const made of input.daily??[]){
  if(made.kind!=='plan'&&made.kind!=='summary'||!Number.isFinite(made.at)||made.at<=now||made.at-now>AHEAD_MS)continue;
  const {when,day,clock}=planned(made.at,now,locale);
  routines.push({id:'daily:'+made.kind,group:'routines',source:'fox',title:DAILY_ROUTINE_NAMES[made.kind],detail:'',when,at:made.at,
   every:DAILY_EVERY[made.kind],by:'Worldlet, with your Agent',day,clock,
   name:DAILY_ROUTINE_NAMES[made.kind],status:when,icon:'clock',routine:{daily:made.kind,paused:false}});
 }
 for(const kind of ['plan','summary'] as const){
  if(!input.dailyPaused?.includes(kind))continue;
  routines.push({id:'daily:'+kind,group:'routines',source:'fox',title:DAILY_ROUTINE_NAMES[kind],detail:'',when:'Paused',at:null,every:DAILY_EVERY[kind],by:'Worldlet, with your Agent',
   day:'Paused',clock:DAILY_EVERY[kind],name:DAILY_ROUTINE_NAMES[kind],status:'Paused',icon:'clock',routine:{daily:kind,paused:true}});
 }

 // Doing now: one window each ---------------------------------------------------------------------------------------
 // A page Fox drives comes first: it is what the person can watch.
 const page=input.page,site=page?taskSite(page.url):'';
 if(page&&site){
  const steps=(page.steps??[]).filter(step=>typeof step?.text==='string'&&step.text.trim()).slice(-8);
  const current=steps.find(step=>!step.done),done=steps.filter(step=>step.done).length;
  doing.push({id:'page:'+site,group:'now',source:'fox',title:`Fox is working on ${site}`,detail:current?clip(current.text,60):'',when:inProgress,at:now+1,who:'Fox',url:page.url,open:{url:page.url},
   name:site,status:current?clip(current.text,60):'Fox is working on this page',icon:'fox',...(steps.length?{progress:done/steps.length}:{}),
   lines:steps.length?steps.map(step=>(step.done?'✓ ':'› ')+clip(step.text,80)):[`Working on ${clip(page.title||site,60)}`]});
 }
 for(const work of input.fox??[]){
  const text=clip(String(work.text??''));if(!text)continue;
  doing.push({id:'fox:'+work.source,group:'now',source:'fox',title:text,detail:'',when:inProgress,at:work.at,who:'Fox',lines:[text],
   name:clip(String(work.name??''),40)||'Fox',status:text,icon:'fox'});
 }
 for(const task of input.working??[]){
  const applet=worldLogApplet(task.applet);if(!applet)continue;
  const at=seconds(task.at);
  doing.push({id:'applet:'+task.id,group:'now',source:'applet',title:`${applet.title} is working on a task`,detail:'',when:inProgress,at:at===null?now:at*1000,open:appletOpen(applet.key),
   who:applet.title,lines:[`Fox handed ${applet.title} a task`,`${applet.title} is working on it`],
   name:applet.title,status:'Working on a task from Fox',icon:applet.key});
 }
 routines.sort((a,b)=>(a.at??Infinity)-(b.at??Infinity));
 doing.sort((a,b)=>(b.at??0)-(a.at??0));
 return {routines:{rows:routines,total:routines.length},now:{rows:doing,total:doing.length},empty:!doing.length&&!routines.length};
}
