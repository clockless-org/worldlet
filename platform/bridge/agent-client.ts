import type {FoxChatBody} from '../../contracts/fox.ts';
import {reduceAgentResponse,turnTrustInherit} from '../../core/agent/index.ts';
import {validateAgentEvent} from '../../contracts/agent.ts';
import {createWorldToolRuntime} from './world-tool-runtime.ts';
import {foxDoing,FOX_WORKING} from '../../ui/companion/index.ts';
import {companionHistory} from '../../contracts/companion-conversation.ts';
import {toolAnimationActivity,stageAnimationActivity} from '../../core/companion/index.ts';

const stageMessages={waiting:'Waiting for current operation…',starting:'Getting ready…',connections:'Getting your accounts ready…',model:'Thinking…',compacting:'Catching up on our long conversation… this can take a few minutes.'};
export function createAgentClient(call,{sample=false}={}){
 const turns=new Map();
 window.worldletAgentEvent=(id,event)=>turns.get(id)?.event(validateAgentEvent(event));
 window.worldletAgentTool=(id,event)=>turns.get(id)?.tool(validateAgentEvent({...event,type:'tool'})) ?? {error:'This Fox task is no longer active.'};
 // What Fox is doing now ("Filling in the form…", "Thinking…"), for the small screen over the head
 // of the Applet whose page Fox works on. `applet` names an Applet task's Applet; the conversation's
 // own turn leaves it out.
 const foxStep=(text:string,applet?:string)=>window.dispatchEvent(new CustomEvent('worldlet:fox-step',{detail:{text,...applet?{applet}:{}}}));
 // The World executor of the latest turn; an Applet task Fox started runs its tools with it.
 let world:{execute:any,codex:any}|null=null;
 // An Applet task (`start_applet_task`) is a turn of its own beside the conversation: the host
 // announces it, and its tools run here under the request the person made when Fox started it.
 // It starts with the starting turn's trust the host sends (untrusted after a mail or web read).
 // It streams nothing into Fox's card; its steps show over its Applet's head instead.
 window.addEventListener('worldlet:applet-task',(event:any)=>{
  const {id,status,request,applet,trust}=event.detail||{};
  if(typeof id!=='string'||!id.startsWith('task-'))return;
  if(status!=='started'){turns.delete(id);return;}
  if(!world||turns.has(id))return;
  let said='';
  const step=(text:string)=>{if(text===said||!turns.has(id))return;said=text;foxStep(text,applet);};
  const runtime=createWorldToolRuntime({call,execute:world.execute,codex:world.codex,sample,request:typeof request==='string'?request:'',origin:'user',operationId:id,appletTask:true,trust:turnTrustInherit(trust),flush:()=>window.worldletFlushWrites?.(),onToolStart:(name,args)=>step(foxDoing(name,args)+'…')});
  turns.set(id,{steer:async()=>({accepted:false}),event(event){if(event.type==='status'&&event.stage==='model')step('Thinking…');},tool:event=>runtime.callTool(event.name,event.args||{},event.id),task:true});
 });
 async function run({text,context,thread=undefined,history=[],execute,signal=undefined,onDelta=undefined,onStatus=undefined,onToolState=undefined,codex=undefined,trace=undefined,setup=false,allowActions=true,origin='user',shown=undefined,background=false}){
  signal?.throwIfAborted();if(!setup)world={execute,codex};const id=trace?.id||crypto.randomUUID();let partial='',currentTool='',currentToolStatus='',started=false;
  const runtime=createWorldToolRuntime({call,execute,codex,sample,setup,allowActions,request:text,origin,signal,operationId:id,flush:()=>window.worldletFlushWrites?.(),onToolStart:(name,args)=>{
   currentTool=name;currentToolStatus=foxDoing(name,args)+'…';
   if(turns.has(id)&&!signal?.aborted){onStatus?.(currentToolStatus,FOX_WORKING,{activity:toolAnimationActivity(name,args),source:'tool',tool:name});foxStep(currentToolStatus);}
  }});
  const abort=()=>{call('agentCancel',{id}).catch(()=>{});turns.delete(id);};
  signal?.addEventListener('abort',abort,{once:true});
  turns.set(id,{
   async steer(text){
    // User supplements are also the authorization context for subsequent tools.
    runtime.steer(text);
    return {...await call('agentSteer',{id,text}),parentId:trace?.id};
   },
   event(event){
    if(signal?.aborted)return;
    partial=reduceAgentResponse(partial,event);
    if(event.type==='status'){const mark={starting:'nativeStartingMs',waiting:'nativeWaitingMs',model:'nativeModelMs',connections:'nativeConnectionsMs'}[event.stage];if(mark)trace?.mark(mark);}
    // Once the model has the turn, `waiting` is only Hermes Desktop's keep-alive (harness/hermes/desktop.py):
    // it must not replace "Thinking…" or the long-conversation notice with the queue's "Waiting…".
    if(event.type==='status'&&!(event.stage==='waiting'&&started))onStatus?.(stageMessages[event.stage]||'Working…',undefined,{activity:stageAnimationActivity(event.stage),source:'stage'});
    if(event.type==='status'&&(event.stage==='model'||event.stage==='compacting'))started=true;
    if(event.type==='status'&&event.stage==='model')foxStep(stageMessages.model);
    // The adapter names the tool it is running; say what that means in plain words
    // rather than spending the one line the user sees on the word "tools".
    if(event.type==='progress'){onStatus?.(currentTool===event.name?currentToolStatus:foxDoing(event.name)+'…',FOX_WORKING,{activity:event.activity||toolAnimationActivity(event.name),source:'tool',tool:event.name});}
    if(event.type==='steered'){onStatus?.('Updating with your message…',undefined,{activity:'thinking',source:'stage'});}
    if(event.type==='delta'){trace?.mark('firstDeltaMs');onDelta?.(partial);}
   },
   // Background work (the day's plan) is never what the person's next message steers.
   task:background,
   async tool(event){
    onToolState?.(true);
    try{
     return await runtime.callTool(event.name,event.args||{},event.id);
    }finally{onToolState?.(false);}
   }
  });
  try{trace?.mark('bridgeSentMs');const body:FoxChatBody={id,text,context,...typeof thread==='string'?{thread}:{},history:setup?[]:companionHistory(history),sample,allowActions,...typeof shown==='string'&&shown.trim()&&shown!==text?{shown:shown.trim().slice(0,200)}:{},...background?{background:true}:{}};const result=await call('agentChat',body);trace?.mark('bridgeReturnedMs');return result;}
  catch(error){if(runtime.wrote&&!signal?.aborted)return {message:'Your change was saved, but Fox could not finish the reply.'};throw error;}
  finally{turns.delete(id);signal?.removeEventListener('abort',abort);}
 }
 run.steer=async text=>{const turn=[...turns.values()].find(turn=>!turn.task);return turn?turn.steer(text):{accepted:false};};
 // The World executor before the conversation's first turn: an Applet task Worldlet starts by itself (a game
 // review once the person stops playing, #1598) can come before the person has said anything to Fox.
 run.useWorld=(value:{execute:any,codex:any})=>{world??=value;};
 return run;
}
