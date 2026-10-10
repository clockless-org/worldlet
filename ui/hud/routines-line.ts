// The person's routines in the World's top-right, under what Fox is doing now (owner request 2026-10-10: the
// top-right is background work, and routines are work that runs on its own). One quiet line in the corner's own
// ink: how many there are and which runs next ("4 routines · Morning brief at 8:00 AM"); hovering lists them all.
// They come from the person's own Agent's scheduler (`foxRoutines`, its `schedule` service) and stay there; the
// line only reads them, again every few minutes and after a routine ran. Hidden while there are none; unlike the work line it
// shows during the first run too, since setup's Routines tile flies here on entry.
import {routineLine} from '../../core/tasks/index.ts';
import {uiIcon} from '../components/index.ts';
import {callHost} from '../../platform/bridge/host.ts';

const REFRESH_MS=5*60_000;

/** "8:00 AM", "tomorrow 8:00 AM" or "Mon 8:00 AM", in the viewer's own locale. */
export function routineWhen(at:number,now=Date.now(),locale?:string){
 const day=(t:number)=>{const d=new Date(t);return d.getFullYear()*400+d.getMonth()*32+d.getDate();};
 const clock=new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit'}).format(at);
 const ahead=Math.round((new Date(at).setHours(12,0,0,0)-new Date(now).setHours(12,0,0,0))/86_400_000);
 if(day(at)===day(now))return clock;
 if(ahead===1)return new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(1,'day')+' '+clock;
 return new Intl.DateTimeFormat(locale,{weekday:'short'}).format(at)+' '+clock;
}

/** "every hour", "every 30 min", "every 2 days". */
export function routineEvery(seconds:number){
 const [n,unit]=seconds%86400===0?[seconds/86400,'day']:seconds%3600===0?[seconds/3600,'hour']:[Math.max(1,Math.round(seconds/60)),'min'];
 return n===1?'every '+unit:'every '+n+' '+unit+(unit==='min'?'':'s');
}
/** Rows shown before "+N more". */
const SHOWN=5;

export function mountRoutinesLine(root:HTMLElement,{call=callHost}:{call?:(action:string,body?:object)=>Promise<any>}={}){
 const box=document.createElement('div');box.className='fox-routines';box.hidden=true;box.setAttribute('aria-label','Routines');
 const list=document.createElement('ul');list.className='fox-routines-list';box.append(list);
 const corner=root.querySelector('.notion-top .world-environment')||root.querySelector('.notion-top')||root;corner.append(box);
 let timer=0;
 async function refresh(){
  clearTimeout(timer);timer=window.setTimeout(refresh,REFRESH_MS);
  let jobs:any[]=[];
  try{jobs=(await call('foxRoutines'))?.jobs??[];}catch{return;}
  const now=Date.now(),summary=routineLine(Array.isArray(jobs)?jobs:[],now);
  box.hidden=summary.count===0;
  list.replaceChildren();
  // Each routine on its own line, soonest first: its name, then when it runs next.
  for(const row of summary.rows.slice(0,SHOWN)){
   const item=document.createElement('li');item.className='fox-routine';
   item.innerHTML=uiIcon('clock');
   const name=document.createElement('span');name.className='fox-routine-name';name.textContent=row.name;
   const when=document.createElement('span');when.className='fox-routine-when';when.textContent=row.at!==null?routineWhen(row.at,now):row.everySeconds?routineEvery(row.everySeconds):'';
   item.append(name);if(when.textContent)item.append(when);
   item.title=row.name+(when.textContent?' · '+when.textContent:'');
   list.append(item);
  }
  if(summary.rows.length>SHOWN){
   const more=document.createElement('li');more.className='fox-routine fox-routine-more';more.textContent='+'+(summary.rows.length-SHOWN)+' more';
   more.title=summary.rows.slice(SHOWN).map(row=>row.name).join('\n');list.append(more);
  }
 }
 // A routine ran (notion-world's `worldlet:routines`), or one was added or changed: read again.
 window.addEventListener('worldlet:routines',()=>void refresh());
 void refresh();
 return box;
}
