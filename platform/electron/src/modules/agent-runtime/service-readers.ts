import {agentRevoked,serviceGranted} from '../../../../../agent/agent/index.ts';
import type {AgentAccess} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';

/** The Services that were connected when reading was last given by default (serviceReadDefaults). */
export const SERVICE_READ_DEFAULTS='service-read-defaults';

/** Reading is on by default (owner decision 2026-10-17, agent/agent/GRANTS.md#settings--connectors): when a Service
 * becomes connected, the Agent Fox uses (`selected`) gets its read Grant, as if the person had ticked "Can read" for it.
 * Which Services were already connected is kept in the World's Agent settings, so a restart grants nothing again and a
 * Grant the person took back stays off until the Service is connected anew. The first time, what is connected is kept
 * as it is. Call it with the connected Services whenever they may have changed. */
export function serviceReadDefaults({root,access,selected,now=()=>new Date().toISOString()}:{root:string;access:()=>AgentAccess|null;selected:()=>string|null;now?:()=>string}):(connected:readonly string[])=>void {
 let seen:Set<string>|null=null;
 const keep=(connected:readonly string[])=>{try{writeAgentSetting(root,SERVICE_READ_DEFAULTS,{seen:[...connected]} as unknown as Row);}catch{}};
 return connected=>{
  const agents=access();
  if(!agents)return;
  if(!seen){
   const kept=readAgentSetting(root,SERVICE_READ_DEFAULTS) as {seen?:unknown}|null;
   if(!kept||!Array.isArray(kept.seen)){seen=new Set(connected);keep(connected);return;}
   seen=new Set(kept.seen.filter((item):item is string=>typeof item==='string'));
  }
  const fresh=connected.filter(provider=>!seen!.has(provider));
  if(!fresh.length&&connected.length===seen.size)return;
  seen=new Set(connected);keep(connected);
  const id=selected(),identity=id?agents.identity(id):null;
  if(!identity||agentRevoked(identity,now()))return;
  for(const provider of fresh)agents.grantService(identity.id,provider);
 };
}

/** "Who may use it" under a connected Service in Settings › Connectors: the Agent Fox uses (`main`) and every other Agent
 * that is not revoked, each with whether it may read `provider` now (core connectorWhoMayUse words them). */
export function serviceReaders(access:AgentAccess,provider:string,selected:string|null,now=new Date().toISOString()):{main:{id:string;name:string;granted:boolean}|null;others:{id:string;name:string;granted:boolean}[]} {
 const readers=access.list(0).filter(({identity})=>!agentRevoked(identity,now)).map(({identity,grants})=>({id:identity.id,name:identity.name,granted:serviceGranted(identity.id,grants,provider,now)}));
 return {main:readers.find(agent=>agent.id===selected)??null,others:readers.filter(agent=>agent.id!==selected)};
}
