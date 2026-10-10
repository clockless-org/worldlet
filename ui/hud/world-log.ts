import {worldLogLines,worldLogNext,worldLogNow,type WorldLogLine} from '../../core/activity/index.ts';
import {node} from '../components/index.ts';
import {isDesktopCompanion} from '../companion/index.ts';
/** The bottom-right corner of the World: one quiet line with the next scheduled check
 * ("Next · Mail check at 23:52"); selecting it opens the companion panel's History page. The
 * live log of what the World and the person did used to scroll above it; it is gone from the
 * corner (owner Order 2026-10-06) and lives on only in History. The lines are still read here
 * and handed to `onLines`, because the phone's Applet world shows them. Lines are Core's.
 *
 * Cost: one small host read every few seconds while the window is visible. Nothing runs per frame. */
const POLL_MS=5000,TASKS_MS=60000;
const el:(tag:string,cls?:string,text?:unknown)=>any=node;
const clock=(seconds:number)=>new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(seconds*1000);
export function mountWorldLog({root,call,sample=()=>false,connections=()=>[],onLines}:{root:HTMLElement;call:(action:string,body?:object)=>Promise<any>;sample?:()=>boolean;connections?:()=>unknown[];
 /** The saved lines and what Applets are doing now, whenever either changes (the phone's Applet world reads them). */
 onLines?:(lines:WorldLogLine[],now:{applet:string,text:string}[])=>void}){
 const section=el('section','world-log');section.setAttribute('aria-label','Scheduled checks');section.hidden=true;
 const next=el('button','world-log-next');next.type='button';next.title='Open world history';
 section.append(next);root.append(section);
 let lines:WorldLogLine[]=[],tasks:any[]=[],tasksAt=0,timer:any=null,loading=false,reported='';
 // Fox's lane: the actions beside Fox (Check mail, Summarize…), the message bar and Fox. The line
 // shares the bottom band with them, so it narrows to the room right of the nearest one and steps
 // aside when too little is left, never drawing behind them (RC UI reviews 2737/2743, #1699).
 const LANE='.world-actions :is(button,.world-capsule),.companion-text-entry,.companion-pet',GAP=12,MIN_ROOM=150;
 let fitting=0;
 function fit(){
  fitting=0;if(section.hidden)return;
  section.style.removeProperty('--world-log-room');
  const box=section.getBoundingClientRect();if(!box.width)return;let edge=-Infinity;
  for(const item of root.querySelectorAll(LANE)){
   const r=item.getBoundingClientRect();
   if(r.width&&r.height&&r.top<box.bottom&&r.bottom>box.top&&r.left<box.right)edge=Math.max(edge,r.right);
  }
  const room=Math.floor(box.right-edge-GAP);
  if(Number.isFinite(room))section.style.setProperty('--world-log-room',Math.max(0,room)+'px');
  section.dataset.crowded=String(room<MIN_ROOM);
 }
 const refit=()=>{if(!fitting)fitting=requestAnimationFrame(fit);};
 const history=()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'History'}}));
 function draw(){
  const upcoming=worldLogNext(tasks,Date.now()/1000);
  const doing=sample()?[]:worldLogNow(connections(),[...appletTasks.values()]);
  const told=(lines.at(-1)?.seq??'')+'|'+doing.map(l=>l.applet+l.text).join();
  if(onLines&&told!==reported){reported=told;onLines(lines,doing);}
  // Mounted even when the page starts as the desktop Companion (opened at login), so the line is
  // there once the World comes back.
  section.hidden=isDesktopCompanion()||sample()||!upcoming;
  if(section.hidden)return;
  next.textContent=`Next · ${upcoming!.title} check at ${clock(upcoming!.at)}`;
  refit();
 }
 async function refresh(){
  if(loading||document.hidden)return;loading=true;
  try{
   const wantTasks=Date.now()-tasksAt>TASKS_MS;
   const result=await call('worldLog',{tasks:wantTasks});
   if(Array.isArray(result?.entries))lines=worldLogLines(result.entries);
   if(wantTasks&&Array.isArray(result?.tasks)){tasks=result.tasks;tasksAt=Date.now();}
   if(result?.sample){lines=[];tasks=[];}
   draw();
  }catch{/* Decoration over saved history; a failed read keeps the last line. */}
  finally{loading=false;}
 }
 next.onclick=history;
 section.addEventListener('pointerdown',(e:any)=>{e.worldletKeepFox=true;});
 const soon=()=>{setTimeout(()=>void refresh(),400);};
 // Applets working on a task Fox handed them, by task id, for the phone's live lines.
 const appletTasks=new Map<string,{applet:string}>();
 const task=(event:any)=>{
  const {id,applet,status,quiet}=event.detail||{};if(typeof id!=='string'||quiet===true)return;
  if(status==='started')appletTasks.set(id,{applet});else appletTasks.delete(id);
  draw();soon();
 };
 window.addEventListener('worldlet:applet-task',task);
 window.addEventListener('worldlet:job',soon);
 window.addEventListener('worldlet:desktop-companion',()=>draw());
 window.addEventListener('resize',refit);
 const lane=new MutationObserver(refit);lane.observe(root,{attributes:true});
 for(const part of root.querySelectorAll('.world-actions,.companion-text-entry'))lane.observe(part,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 timer=setInterval(()=>void refresh(),POLL_MS);void refresh();
 return {refresh,fit,redraw:()=>{if(!loading)draw();},element:section,stop(){clearInterval(timer);lane.disconnect();window.removeEventListener('resize',refit);window.removeEventListener('worldlet:job',soon);window.removeEventListener('worldlet:applet-task',task);section.remove();}};
}
