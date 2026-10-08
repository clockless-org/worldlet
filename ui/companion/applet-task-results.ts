import {getApp} from '../../core/applets/index.ts';
/**
 * When an Applet task Fox handed off ends (`worldlet:applet-task`), Fox says its result in a line
 * of its own, with a way to open the Applet. The line follows the person like other global guides.
 * While Fox is answering something else it waits for that turn to end, so a result never cuts into
 * the conversation; several results wait in order. The line is a short report, one sentence (owner Order
 * 2026-10-07: background work reports back, never fills Fox's card); the whole result is in the conversation.
 */
export function reportLine(message:string,limit=140){
 const text=message.replace(/\*\*|__|`/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
 const first=text.split(/(?<=[.!?。！？])\s*/u)[0]||text;
 return first.length>limit?first.slice(0,limit-1).trimEnd()+'…':first;
}
export function mountAppletTaskResults({busy,say}:{busy:()=>boolean;say:(line:{id:string;applet:string;text:string;open:string})=>void}){
 const waiting:{id:string;applet:string;text:string;open:string}[]=[];
 const next=()=>{if(!busy()&&waiting.length)say(waiting.shift()!);};
 window.addEventListener('worldlet:applet-task',(event:any)=>{
  const {id,applet,status,message}=event.detail||{};
  if(typeof id!=='string'||status==='started'||status==='cancelled')return;
  const app=getApp(applet),title=app?.title||'The Applet';
  const text=status==='complete'?(typeof message==='string'&&message.trim()?`${title}: ${reportLine(message)}`:`${title} finished the task.`):`${title} couldn’t finish the task. Ask me to try again.`;
  waiting.push({id,applet:app?.id||String(applet||''),text,open:`Open ${title}`});
  next();
 });
 window.addEventListener('worldlet:fox-idle',()=>setTimeout(next,0));
}
