import os from 'node:os';
import {spawn as spawnProcess} from 'node:child_process';
import {AGENT_AUDIT_KEEP,ORDER_REASONS,agentRevoked,askWakes,orderAuditEntry,readOrders,readWakeCommand,wakeArgv,wakeAuditEntry,wakeDelay} from '../../../../../agent/gate/index.ts';
import {AGENT_WAKE_LIMITS,type AgentAsk,type AgentOrders} from '../../../../../contracts/agent-asks.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import type {AgentAccess} from '../../host/services.ts';
import type {Row} from './types.ts';

// Orders and waking an Agent (agent/gate/GRANTS.md#orders-and-waking-an-agent), on the Electron and Node hosts alike.
// Core checks; this keeps the World's setting (`agent_settings`, `agent-orders` in world.sqlite) and runs an Agent's
// wake command, the one the person typed in Settings, when work is posted for that Agent: the program itself with its
// arguments (never a shell), detached, stdin and output ignored, stopped after a timeout, at most once a minute per
// Agent. Only a short line of how it ended goes to the Agent's audit.

const SETTING='agent-orders';
type Spawn=typeof spawnProcess;
type Timers={set:(run:()=>void,ms:number)=>unknown;clear:(timer:unknown)=>void};
export type OrderLedger={recordAgentAudit(entry:Row,keep:number):boolean};
export interface AgentOrdersHost {
 /** The setting, with Agents that are revoked or gone left out. */
 read():AgentOrders;
 /** The Agents work may be for: every Agent of this World not revoked. */
 agents():string[];
 /** "Give new work to": an Agent's ID, or null for none. Refused for an unknown or revoked Agent. */
 setDefault(agentId:string|null):void;
 /** An Agent's wake command as the page sent it (an empty list removes it). Refused in words when it is not valid. */
 setWake(agentId:string,command:unknown):void;
 /** A new ask was saved: wake the Agent it is for, if it has a wake command. */
 assigned(ask:AgentAsk):void;
 close():void;
}

export function createAgentOrders({root,access,ledger,spawn=spawnProcess,now=()=>Date.now(),timers={set:(run,ms)=>{const t=setTimeout(run,ms);t.unref?.();return t;},clear:t=>clearTimeout(t as NodeJS.Timeout)},
 timeoutMs=AGENT_WAKE_LIMITS.timeoutSeconds*1000,platform=process.platform}:
 {root:string;access:AgentAccess;ledger:()=>OrderLedger|null;spawn?:Spawn;now?:()=>number;timers?:Timers;timeoutMs?:number;platform?:NodeJS.Platform}):AgentOrdersHost {
 const active=()=>{const at=new Date(now()).toISOString();return access.list(0).map(entry=>entry.identity).filter(identity=>!agentRevoked(identity,at)).map(identity=>identity.id);};
 const load=()=>{let value:Row|null=null;try{value=readAgentSetting(root,SETTING);}catch{}return readOrders(value);};
 const save=(orders:AgentOrders)=>writeAgentSetting(root,SETTING,orders as unknown as Row);
 const audit=(entry:Row)=>{try{ledger()?.recordAgentAudit(entry,AGENT_AUDIT_KEEP);}catch{}};
 // The last wake of each Agent, and the one wake waiting for the minute to pass (the newest work it was given).
 const last=new Map<string,number>(),waiting=new Map<string,{timer:unknown;askId:string}>();
 function run(agentId:string,askId:string){
  const command=load().wake[agentId];
  if(!command||!active().includes(agentId))return;
  last.set(agentId,now());
  const {program,args}=wakeArgv(command,askId),at=()=>new Date(now()).toISOString();
  let child:ReturnType<Spawn>;
  try{child=spawn(program,args,{detached:true,stdio:'ignore',shell:false,windowsHide:true,cwd:os.homedir(),env:process.env});}
  catch(error){audit(wakeAuditEntry(agentId,askId,{error:error instanceof Error?error.message:'unknown'},at()) as unknown as Row);return;}
  let ended=false,timedOut=false;
  // A detached program leads its own process group on macOS and Linux: stopping it stops what it started.
  const kill=()=>{try{if(platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}};
  const timer=timers.set(()=>{if(!ended){timedOut=true;kill();}},timeoutMs);
  const end=(outcome:{code?:number|null;signal?:string|null;error?:string})=>{
   if(ended)return;ended=true;timers.clear(timer);
   audit(wakeAuditEntry(agentId,askId,timedOut?{timedOut:true}:outcome,at()) as unknown as Row);
  };
  child.once('error',error=>end({error:error.message}));
  child.once('exit',(code,signal)=>end({code,signal}));
  child.unref();
 }
 function wake(agentId:string,askId:string){
  const pending=waiting.get(agentId);
  if(pending){pending.askId=askId;return;}
  const delay=wakeDelay(last.get(agentId),now());
  if(!delay)return run(agentId,askId);
  const entry={askId,timer:null as unknown};
  entry.timer=timers.set(()=>{waiting.delete(agentId);run(agentId,entry.askId);},delay);
  waiting.set(agentId,entry);
 }
 const forget=(agentId:string)=>{const pending=waiting.get(agentId);if(pending){timers.clear(pending.timer);waiting.delete(agentId);}};
 // A revoked Agent is woken no more and gets no new work by default.
 access.onRevoke(agentId=>{
  forget(agentId);
  try{const orders=load();if(orders.wake[agentId]||orders.defaultFor===agentId){delete orders.wake[agentId];if(orders.defaultFor===agentId)delete orders.defaultFor;save(orders);}}catch{}
 });
 return {
  read(){
   const orders=load(),agents=active();
   return {...orders.defaultFor&&agents.includes(orders.defaultFor)?{defaultFor:orders.defaultFor}:{},wake:Object.fromEntries(Object.entries(orders.wake).filter(([id])=>agents.includes(id)))};
  },
  agents:active,
  setDefault(agentId){
   const orders=load(),at=new Date(now()).toISOString(),before=orders.defaultFor;
   if(agentId!==null&&!active().includes(agentId))throw new Error(ORDER_REASONS.agent);
   if((agentId??undefined)===before)return;
   if(agentId===null)delete orders.defaultFor;else orders.defaultFor=agentId;
   save(orders);
   if(before)audit(orderAuditEntry(before,'clear-order-target',at) as unknown as Row);
   if(agentId)audit(orderAuditEntry(agentId,'order-target',at) as unknown as Row);
  },
  setWake(agentId,value){
   if(!active().includes(agentId))throw new Error(ORDER_REASONS.agent);
   const command=readWakeCommand(value),orders=load(),had=!!orders.wake[agentId];
   if(command)orders.wake[agentId]=command;else{delete orders.wake[agentId];forget(agentId);}
   if(!command&&!had)return;
   save(orders);
   audit(orderAuditEntry(agentId,command?'set-wake':'clear-wake',new Date(now()).toISOString()) as unknown as Row);
  },
  assigned(ask){const agentId=askWakes(ask);if(agentId)wake(agentId,ask.id);},
  // Wakes not yet due are dropped; a program already running is left to end (or be stopped by its timeout while
  // Worldlet still runs).
  close(){for(const id of [...waiting.keys()])forget(id);},
 };
}
