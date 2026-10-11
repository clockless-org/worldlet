// core/tasks/next-run.ts `nextCronRun` jumps over hours that can't match instead of stepping minute by minute. This
// keeps a verbatim copy of the minute-by-minute version and checks both give the same answer for thousands of seeded
// cron expressions and start times: every field form the parser reads (and some it refuses), month ends, Feb 29,
// the new year, and both daylight-saving changes in America/Los_Angeles as well as UTC. No browser.
import assert from 'node:assert/strict';
import {nextCronRun} from '../core/tasks/next-run.ts';

// The minute-by-minute version, as it was before the jump.
function oldField(text:string,min:number,max:number):Set<number>|null {
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
function oldNextCronRun(expression:string,now:number):number|null {
 const parts=expression.trim().split(/\s+/);
 if(parts.length!==5)return null;
 const [minutes,hours,days,months,weekdays]=[oldField(parts[0],0,59),oldField(parts[1],0,23),oldField(parts[2],1,31),oldField(parts[3],1,12),oldField(parts[4].replace(/\b7\b/g,'0'),0,6)];
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

// Seeded generator (mulberry32), so every run compares the same cases.
let seed=0x5eed1e;
const rand=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
const int=(lo:number,hi:number)=>lo+Math.floor(rand()*(hi-lo+1));
const pick=<T>(items:readonly T[]):T=>items[int(0,items.length-1)];

// One cron field in any form the parser reads, near its edges; now and then one it refuses.
function fieldText(min:number,max:number,favourites:readonly number[]):string {
 const n=()=>rand()<0.5?pick(favourites):int(min,max);
 const one=():string=>{
  const a=n(),b=n(),lo=Math.min(a,b),hi=Math.max(a,b),step=pick([1,2,3,5,7,10,15,30]);
  switch(int(0,6)){
   case 0:return String(a);
   case 1:return lo+'-'+hi;
   case 2:return '*/'+step;
   case 3:return lo+'-'+hi+'/'+step;
   case 4:return a+'/'+step;
   case 5:return String(a);
   default:return lo+'-'+hi;
  }
 };
 const r=rand();
 if(r<0.3)return '*';
 if(r<0.75)return one();
 if(r<0.95)return Array.from({length:int(2,4)},one).join(',');
 return pick([String(max+1),String(min-1),'*/0','x',min+'-',max+'-'+min,'1,','*/'+(max+1)]);
}
function cron():string {
 const common=['0 7 * * *','0 18 * * 1-5','*/15 * * * *','0 9 31 * *','0 9 29 2 *','30 2 * * *','0 1 * * 0','59 1 * * *','0 0 1 1 *','0 9 1 * 1','0 9 30 2 *','15 3 * * 7','0 9 * * 5-7','0 12 * 13 *','* * * * *','0 0 * * *'];
 if(rand()<0.15)return pick(common);
 const parts=[fieldText(0,59,[0,1,30,59]),fieldText(0,23,[0,1,2,3,23]),fieldText(1,31,[1,28,29,30,31]),fieldText(1,12,[1,2,3,11,12]),fieldText(0,7,[0,6,7])];
 return rand()<0.03?parts.slice(0,4).join(' '):parts.join(' ');
}
// Start times built in the local clock: spread over 2023-2030, around month ends, Feb 29 and the new year, and the
// days and hours either side of Los Angeles's spring-forward and fall-back changes.
function start():number {
 const r=rand(),second=int(0,59),ms=int(0,999);
 if(r<0.3)return new Date(int(2023,2030),int(0,11),int(1,28),int(0,23),int(0,59),second,ms).getTime();
 if(r<0.5){const y=int(2023,2030),m=int(0,11),last=new Date(y,m+1,0).getDate();return new Date(y,m,last-int(0,8),int(0,23),int(0,59),second,ms).getTime();}
 if(r<0.6)return new Date(pick([2024,2028]),1,int(20,29),int(0,23),int(0,59),second,ms).getTime();
 if(r<0.7)return new Date(int(2023,2030),11,int(24,31),int(0,23),int(0,59),second,ms).getTime();
 const [y,m,d]=pick([[2024,2,10],[2024,10,3],[2025,2,9],[2025,10,2],[2026,2,8],[2026,10,1],[2027,2,14],[2027,10,7]] as const);
 if(r<0.85)return new Date(y,m,d,int(0,4),int(0,59),second,ms).getTime()+pick([0,0,3600000]);
 return new Date(y,m,d-int(0,9),int(0,23),int(0,59),second,ms).getTime();
}

const zone=process.env.TZ;
let compared=0,found=0;
try {
 for(const tz of ['America/Los_Angeles','UTC']){
  process.env.TZ=tz;seed=0x5eed1e;
  const cases:[string,number][]=[];
  for(let i=0;i<700;i++)cases.push([cron(),start()]);
  // The eight-day edge: a time a few minutes either side of the last minute the walk reaches, so the count of
  // minutes walked (an hour shorter or longer across a daylight-saving change) decides found or not found.
  for(let i=0;i<350;i++){
   const now=start(),edge=new Date(now+(8*24*60+int(-75,75))*60000);
   cases.push([`${edge.getMinutes()} ${edge.getHours()} ${pick([`${edge.getDate()} ${edge.getMonth()+1} *`,`* ${edge.getMonth()+1} ${edge.getDay()}`,`${edge.getDate()} * ${edge.getDay()}`])}`,now]);
  }
  for(const now of [NaN,Infinity,8.64e15-60000*3,-8.64e15])cases.push(['* * * * *',now],['0 9 * * *',now]);
  for(const [expression,now] of cases){
   const want=oldNextCronRun(expression,now);
   assert.equal(nextCronRun(expression,now),want,`${tz}: ${expression} from ${now} (${new Date(now).toString()})`);
   compared++;if(want!==null)found++;
  }
 }
} finally {
 if(zone===undefined)delete process.env.TZ;else process.env.TZ=zone;
}
assert.ok(found>compared/4&&found<compared*0.9,`both found and not-found answers compared (${found} of ${compared} found)`);
console.log(`next run: ${compared} cases agree with the minute-by-minute version (${found} with a time)`);
