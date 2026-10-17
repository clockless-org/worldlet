import os from 'node:os';
import path from 'node:path';
import {SCRIPT_AGENT_LIMITS,SCRIPT_AGENT_REASONS,SCRIPT_HARNESS,agentRevoked,scriptAgentId,scriptAgentName} from '../../../../../core/agent/index.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import {ensureDirectory} from '../../files.ts';
import type {AgentAccess} from '../../host/services.ts';
import {standingEndpointFile,type StandingAgent,type StandingWorldTools} from './world-tool-bridge.ts';

// Agents for scripts (core/agent/GRANTS.md#agents-for-scripts). The person names one in Settings › Agent › Access (or
// `worldlet register --script <name>` on the Node host); it becomes an Agent like any other, with harness `script`, and
// each run the host writes its endpoint and new token into its own owner-only file in the fixed MCP home, where a
// program on this computer reads them. Revoking it removes that file. The Electron and Node hosts share this.

/** Worldlet's fixed home for Agents (platform/node/README.md#one-fixed-mcp-home): `~/.worldlet`, or `WORLDLET_HOME`. */
export const worldletHome=(env:NodeJS.ProcessEnv=process.env)=>path.resolve(env.WORLDLET_HOME||path.join(os.homedir(),'.worldlet'));
export const mcpHome=(env:NodeJS.ProcessEnv=process.env)=>path.join(worldletHome(env),'mcp');

const SETTING='script-agents';
type Stored={id:string;name:string};
const agentOf=(item:Stored):StandingAgent=>({id:item.id,name:item.name,harness:SCRIPT_HARNESS,kind:'local'});

export interface ScriptAgents {
 /** The Agents for scripts the person added, in the order they were. */
 list():Stored[];
 /** Adds one named `name` and writes its endpoint file now. Returns its ID and where the file is. */
 add(name:unknown):Promise<{id:string;name:string;endpointFile:string}>;
 /** Each run: this run's endpoint and a new token for every one not revoked, in their same files. */
 open():Promise<void>;
}
export function createScriptAgents({root,access,tools,home=()=>mcpHome()}:{root:string;access:AgentAccess;tools:()=>Promise<StandingWorldTools>|null;home?:()=>string}):ScriptAgents {
 const list=():Stored[]=>{
  let value:unknown=null;try{value=readAgentSetting(root,SETTING)?.agents;}catch{}
  return Array.isArray(value)?value.flatMap(item=>typeof item?.id==='string'&&typeof item?.name==='string'?[{id:item.id,name:item.name}]:[]):[];
 };
 const standing=async()=>{const opened=await tools();if(!opened)throw new Error('Worldlet is still starting. Try again in a moment.');return opened;};
 return {
  list,
  async add(input){
   const name=scriptAgentName(input),stored=list();
   const now=new Date().toISOString();
   if(stored.filter(item=>{const identity=access.identity(item.id);return identity&&!agentRevoked(identity,now);}).length>=SCRIPT_AGENT_LIMITS.agents)throw new Error(SCRIPT_AGENT_REASONS.full);
   const id=scriptAgentId(name,[...stored.map(item=>item.id),...access.list(0).map(entry=>entry.identity.id)]);
   const opened=await standing();
   writeAgentSetting(root,SETTING,{agents:[...stored,{id,name}]});
   ensureDirectory(home());
   opened.server(home(),agentOf({id,name}));
   return {id,name,endpointFile:path.join(home(),standingEndpointFile(id))};
  },
  async open(){
   const stored=list();
   if(!stored.length)return;
   const opened=await standing();
   ensureDirectory(home());
   for(const item of stored)opened.server(home(),agentOf(item));
  },
 };
}
