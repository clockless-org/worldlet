// When each of the person's scheduled jobs runs next, for the World's Task panel (core/tasks/task-panel.ts).
// The jobs keep running on their own Agent's scheduler (contracts/harness-services.ts `HarnessJob`); this only reads
// their schedule. A cron expression is the standard five fields (minute hour day-of-month month day-of-week) with
// `*`, lists, ranges and steps, read in the computer's local time like the schedulers that run them.

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
 const dayOk=(at:Date)=>months.has(at.getMonth()+1)&&(anyDay&&anyWeekday?true:anyDay?weekdays.has(at.getDay()):anyWeekday?days.has(at.getDate()):days.has(at.getDate())||weekdays.has(at.getDay()));
 // The walk visits each local minute in turn, for up to eight days of minutes. An hour whose day or hour can't match
 // is crossed in one jump when the clock's offset is the same at both ends (no daylight-saving change inside it): the
 // jump lands where minute steps would and counts the same minutes. Any other hour is walked minute by minute.
 let at=new Date(now);at.setSeconds(0,0);at.setMinutes(at.getMinutes()+1);
 for(let left=8*24*60;left>0;){
  if(Number.isNaN(at.getTime()))return null;
  if(!dayOk(at)||!hours.has(at.getHours())){
   const next=new Date(at.getTime());next.setHours(at.getHours()+1,0,0,0);
   if(next.getTimezoneOffset()===at.getTimezoneOffset()){left-=(next.getTime()-at.getTime())/60000;at=next;continue;}
  }else if(minutes.has(at.getMinutes()))return at.getTime();
  left--;at.setMinutes(at.getMinutes()+1);
 }
 return null;
}
