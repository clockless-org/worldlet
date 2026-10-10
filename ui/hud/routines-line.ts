// The person's routines in the World's top-right, under what Fox is doing now (owner requests 2026-10-10: the
// top-right is background work, routines are work that runs on its own, list each one, and make it feel like a
// timeline). A short timeline in the corner's own ink: a rail with a dot per routine, "Now" at the top, then each
// routine soonest first under the day it runs (Today, Tomorrow, Mon…) with its time; repeating ones without a fixed
// time last, under "Repeating". Five at most, then "+2 more". They come from the person's own Agent's scheduler
// (`foxRoutines`, its `schedule` service) and stay there; the list only reads them, again every few minutes and after
// a routine ran. Hidden while there are none; unlike the work line it shows during the first run too, since setup's
// Routines tile flies here on entry.
import {routineLine} from '../../core/tasks/index.ts';
import {callHost} from '../../platform/bridge/host.ts';

const REFRESH_MS=5*60_000;

/** "Today", "Tomorrow" or "Mon": the day a routine runs, in the viewer's own locale. */
export function routineDay(at:number,now=Date.now(),locale?:string){
 const ahead=Math.round((new Date(at).setHours(12,0,0,0)-new Date(now).setHours(12,0,0,0))/86_400_000);
 const word=ahead<=1?new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(Math.max(0,ahead),'day'):new Intl.DateTimeFormat(locale,{weekday:'short'}).format(at);
 return word.charAt(0).toLocaleUpperCase(locale)+word.slice(1);
}
/** "8:00 AM", in the viewer's own locale. */
export const routineClock=(at:number,locale?:string)=>new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit'}).format(at);

/** "every hour", "every 30 min", "every 2 days". */
export function routineEvery(seconds:number){
 const [n,unit]=seconds%86400===0?[seconds/86400,'day']:seconds%3600===0?[seconds/3600,'hour']:[Math.max(1,Math.round(seconds/60)),'min'];
 return n===1?'every '+unit:'every '+n+' '+unit+(unit==='min'?'':'s');
}
/** Rows shown before "+N more". */
const SHOWN=5;

export function mountRoutinesLine(root:HTMLElement,{call=callHost}:{call?:(action:string,body?:object)=>Promise<any>}={}){
 const box=document.createElement('div');box.className='fox-routines';box.hidden=true;box.setAttribute('aria-label','Routines');
 const list=document.createElement('ol');list.className='fox-timeline';box.append(list);
 const corner=root.querySelector('.notion-top .world-environment')||root.querySelector('.notion-top')||root;corner.append(box);
 const li=(cls:string,text='')=>{const item=document.createElement('li');item.className=cls;if(text)item.textContent=text;return item;};
 let timer=0;
 async function refresh(){
  clearTimeout(timer);timer=window.setTimeout(refresh,REFRESH_MS);
  let jobs:any[]=[];
  try{jobs=(await call('foxRoutines'))?.jobs??[];}catch{return;}
  const now=Date.now(),summary=routineLine(Array.isArray(jobs)?jobs:[],now);
  box.hidden=summary.count===0;
  list.replaceChildren();
  if(!summary.count)return;
  list.append(li('fox-timeline-now','Now'));
  let day='';
  for(const row of summary.rows.slice(0,SHOWN)){
   // A day label where the day changes; the repeating ones share one.
   const label=row.at!==null?routineDay(row.at,now):'Repeating';
   if(label!==day){day=label;list.append(li('fox-timeline-day',label));}
   const item=li('fox-routine');
   const name=document.createElement('span');name.className='fox-routine-name';name.textContent=row.name;
   const when=document.createElement('span');when.className='fox-routine-when';when.textContent=row.at!==null?routineClock(row.at):row.everySeconds?routineEvery(row.everySeconds):'';
   item.append(name);if(when.textContent)item.append(when);
   item.title=row.name+(when.textContent?' · '+(row.at!==null?label+' ':'')+when.textContent:'');
   list.append(item);
  }
  if(summary.rows.length>SHOWN){
   const more=li('fox-routine fox-routine-more','+'+(summary.rows.length-SHOWN)+' more');
   more.title=summary.rows.slice(SHOWN).map(row=>row.name).join('\n');list.append(more);
  }
 }
 // A routine ran (notion-world's `worldlet:routines`), or one was added or changed: read again.
 window.addEventListener('worldlet:routines',()=>void refresh());
 void refresh();
 return box;
}
