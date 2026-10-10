// When each of the person's scheduled jobs runs next, for the World's top-right routines line (ui/hud/routines-line.ts).
// The jobs keep running on their own Agent's scheduler (contracts/harness-services.ts `HarnessJob`); this only reads
// their schedule. A cron expression is the standard five fields (minute hour day-of-month month day-of-week) with
// `*`, lists, ranges and steps, read in the computer's local time like the schedulers that run them.
import type {HarnessJob} from '../../contracts/harness-services.ts';

export type RoutineRow={name:string;at:number|null;everySeconds:number|null};
export type RoutineLine={count:number;next:{name:string;at:number}|null;names:string[];rows:RoutineRow[]};

function field(text:string,min:number,max:number):Set<number>|null {
 const values=new Set<number>();
 for(const part of text.split(',')){
  const [range,stepText]=part.split('/'),step=stepText===undefined?1:Number(stepText);
  if(!Number.isInteger(step)||step<1)return null;
  let from=min,to=max;
  if(range!=='*'){
   const [a,b]=range.split('-');from=Number(a);to=b===undefined?(stepText===undefined?from:max):Number(b);
   if(!Number.isInteger(from)||!Number.isInteger(to)||from<min||to>max||from>to)return null;
  }
  for(let n=from;n<=to;n+=step)values.add(n);
 }
 return values;
}
/** The next minute after `now` (ms) the cron expression names, within about eight days; null when it can't be read. */
export function nextCronRun(expression:string,now:number):number|null {
 const parts=expression.trim().split(/\s+/);
 if(parts.length!==5)return null;
 const [minutes,hours,days,months,weekdays]=[field(parts[0],0,59),field(parts[1],0,23),field(parts[2],1,31),field(parts[3],1,12),field(parts[4].replace(/\b7\b/g,'0'),0,6)];
 if(!minutes||!hours||!days||!months||!weekdays)return null;
 // Cron's rule: when both day fields are restricted, either one matching is enough.
 const anyDay=parts[2]==='*',anyWeekday=parts[4]==='*';
 const at=new Date(now);at.setSeconds(0,0);at.setMinutes(at.getMinutes()+1);
 for(let i=0;i<8*24*60;i++){
  const dayOk=anyDay&&anyWeekday?true:anyDay?weekdays.has(at.getDay()):anyWeekday?days.has(at.getDate()):days.has(at.getDate())||weekdays.has(at.getDay());
  if(months.has(at.getMonth()+1)&&dayOk&&hours.has(at.getHours())&&minutes.has(at.getMinutes()))return at.getTime();
  at.setMinutes(at.getMinutes()+1);
 }
 return null;
}
/** The active jobs, soonest first (an interval job has no fixed time and comes after the timed ones), and which runs
 * next (a one-time job still ahead counts). */
export function routineLine(jobs:readonly HarnessJob[],now:number):RoutineLine {
 const active=jobs.filter(job=>!job.paused&&!('at' in job.when&&job.when.at<=now));
 const rows:RoutineRow[]=active.map(job=>({name:job.name,at:'cron' in job.when?nextCronRun(job.when.cron,now):'at' in job.when?job.when.at:null,everySeconds:'everySeconds' in job.when?job.when.everySeconds:null}));
 rows.sort((a,b)=>(a.at??Infinity)-(b.at??Infinity));
 const first=rows[0]?.at!=null?rows[0]:null;
 return {count:active.length,next:first?{name:first.name,at:first.at!}:null,names:active.map(job=>job.name),rows};
}
