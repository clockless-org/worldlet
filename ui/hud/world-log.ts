import {worldLogLines,worldLogNow,type WorldLogLine} from '../../core/activity/index.ts';
/** The World's saved history as plain lines. Nothing of it shows in the World's corners any more:
 * the bottom-right "next check" line is gone too (owner Order 2026-10-10), and so is the History page
 * (owner request 2026-10-10). They are still read here and handed to `onLines`, because the phone's
 * Applet world shows them. Lines are Core's.
 *
 * Cost: one small host read every few seconds while the window is visible. Nothing runs per frame. */
const POLL_MS=5000;
export function mountWorldLog({call,sample=()=>false,connections=()=>[],onLines}:{call:(action:string,body?:object)=>Promise<any>;sample?:()=>boolean;connections?:()=>unknown[];
 /** The saved lines and what Applets are doing now, whenever either changes (the phone's Applet world reads them). */
 onLines?:(lines:WorldLogLine[],now:{applet:string,text:string}[])=>void}){
 let lines:WorldLogLine[]=[],timer:any=null,loading=false,reported='';
 function draw(){
  const doing=sample()?[]:worldLogNow(connections(),[...appletTasks.values()]);
  const told=(lines.at(-1)?.seq??'')+'|'+doing.map(l=>l.applet+l.text).join();
  if(onLines&&told!==reported){reported=told;onLines(lines,doing);}
 }
 async function refresh(){
  if(loading||document.hidden)return;loading=true;
  try{
   const result=await call('worldLog',{tasks:false});
   if(Array.isArray(result?.entries))lines=worldLogLines(result.entries);
   if(result?.sample)lines=[];
   draw();
  }catch{/* Decoration over saved history; a failed read keeps the last line. */}
  finally{loading=false;}
 }
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
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 timer=setInterval(()=>void refresh(),POLL_MS);void refresh();
 return {refresh,redraw:()=>{if(!loading)draw();},stop(){clearInterval(timer);window.removeEventListener('worldlet:job',soon);window.removeEventListener('worldlet:applet-task',task);}};
}
