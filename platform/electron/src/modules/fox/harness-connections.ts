import {randomUUID} from 'node:crypto';
import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {WorldletError} from '../../files.ts';
import {isConnectionId,readConnectionAdd} from '../../../../../core/agent/index.ts';
import type {HarnessConnectionChange} from '../../../../../contracts/harness-services.ts';

// Settings › Integrations, the Agent's part (owner approval 2026-10-08: manage the Agent's MCP connections through its
// own command line): every MCP server and chat account in each Agent on this computer, with what each was last used
// for, and a server added or removed by that Agent's own command (agent-runtime/harness-connections.ts). A change is
// two steps: `preview` returns the exact command and a one-time confirmation; only `change` with that confirmation
// runs it, so what runs is what the person saw and confirmed. Nothing here knows which Harness it is: whether one can
// be changed is whether its service offers `change`. Never in the practice world.

const CONFIRM_MS=5*60_000;
export function createHarnessConnections(host:Host){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const harnesses=()=>host.optional<AgentService>(AGENT)?.harnessConnections?.()??[];
 const pending=new Map<string,{harness:string;change:HarnessConnectionChange;command:string;until:number}>();
 const find=(harness:unknown)=>{const found=harnesses().find(item=>item.harness===harness);if(!found)throw new WorldletError('This Agent is no longer on this computer.');return found;};
 return {
  /** Every Agent's connections here; one that fails to list says why and does not hide the others. */
  async list():Promise<Row> {
   const current=host.optional<AgentService>(AGENT)?.harness?.id;
   return {harnesses:await Promise.all(harnesses().map(async({harness,title,connections})=>{
    let listed:Row[]=[],error='';
    try{listed=(await connections.list()).slice(0,300) as unknown as Row[];}catch(e){error=(e as Error)?.message||`${title} did not list its connections.`;}
    return {harness,title,connections:listed,changes:!!connections.change,inUse:current===harness,...error?{error}:{}};
   }))};
  },
  /** The exact command a change would run, and the confirmation `change` needs. */
  async preview(harness:unknown,request:Row):Promise<Row> {
   if(!own())throw new WorldletError('Change connections in your own world.');
   const found=find(harness);
   if(!found.connections.change||!found.connections.preview)throw new WorldletError(`${found.title}’s connections can be changed only in ${found.title} itself.`);
   let change:HarnessConnectionChange;
   if(request.remove!==undefined){if(!isConnectionId(request.remove))throw new WorldletError('This server is no longer there.');change={remove:request.remove};}
   else try{change={add:readConnectionAdd(request.add)};}catch(e){throw new WorldletError((e as Error).message);}
   const command=await found.connections.preview(change),confirm=randomUUID();
   for(const [key,item] of pending)if(item.until<Date.now())pending.delete(key);
   pending.set(confirm,{harness:found.harness,change,command,until:Date.now()+CONFIRM_MS});
   return {command,confirm};
  },
  /** Runs the change the person confirmed, once. */
  async change(confirm:unknown):Promise<Row> {
   if(!own())throw new WorldletError('Change connections in your own world.');
   const item=typeof confirm==='string'?pending.get(confirm):undefined;
   if(typeof confirm==='string')pending.delete(confirm);
   if(!item||item.until<Date.now())throw new WorldletError('Confirm the change again.');
   await find(item.harness).connections.change!(item.change);
   return {ok:true,command:item.command};
  },
 };
}
