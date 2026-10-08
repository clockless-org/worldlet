import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {harnessAgentInstructions,hermesProfileModel,isHarnessAgentId,openClawAgentModel,type LocalHarnessId} from '../../../../../core/agent/index.ts';
import type {HarnessAgent,HarnessAgents} from '../../../../../contracts/harness-services.ts';
import {realPath as real} from '../../files.ts';
import {directories,readFile} from './agent-files.ts';
import {declaredName,discoverHermes,standardHermesHome} from './hermes-files.ts';
import {openClawAgents,readOpenClawConfig} from './openclaw-files.ts';

// The `agents` Harness service in mode `files` (contracts/harness-services.ts): the person's own agents or profiles,
// read from that Harness's folder, read-only like every other reader here, so an Applet's thread can be answered by
// one of them (HarnessSessionKey.agent). What the files mean is Core's `harness-agents`; the World's consumer
// (fox `harnessAgents`) never asks which Harness this is.

const LIMIT=200_000;
/** OpenClaw: `agents.entries` / `agents.list` in openclaw.json plus `agents/<id>/` folders (openClawAgents), each with
 * its workspace's SOUL.md, IDENTITY.md and AGENTS.md and its model; the default agent is the main one. */
export function openClawAgentsService(home=os.homedir(),environment=process.env):HarnessAgents {
 return {async list(){
  const config=readOpenClawConfig(home,environment);
  return openClawAgents(home,environment,config).map(agent=>{
   const files:[string,string][]=agent.workspace?['SOUL.md','IDENTITY.md','AGENTS.md'].map(name=>[name,readFile(agent.workspace!,path.join(agent.workspace!,name),LIMIT)]):[];
   const instructions=harnessAgentInstructions(files),model=openClawAgentModel(config,agent.id);
   return {id:agent.id,name:agent.name,...instructions?{instructions}:{},...model?{model}:{},...agent.default?{main:true}:{}};
  });
 }};
}

/** Hermes Agent: the default profile (~/.hermes, %LOCALAPPDATA%\hermes on Windows) and `profiles/<name>/`, each a home
 * with its own config.yaml and SOUL.md; the one Fox talks through (discoverHermes: HERMES_HOME, else the active
 * profile) is the main one. With HERMES_HOME set only that home is the person's Agent. */
export function hermesAgentsService(home=os.homedir(),environment=process.env,platform:NodeJS.Platform=process.platform):HarnessAgents {
 return {async list(){
  const active=discoverHermes(home,environment,platform);
  return hermesHomes(home,environment,platform).map(({id,root}):HarnessAgent=>{
   const soul=readFile(root,path.join(root,'SOUL.md'),LIMIT),instructions=harnessAgentInstructions([['SOUL.md',soul]]),model=hermesProfileModel(readFile(root,path.join(root,'config.yaml'),LIMIT));
   return {id,name:(declaredName(soul)??id).slice(0,80),...instructions?{instructions}:{},...model?{model}:{},...root===active?{main:true}:{}};
  });
 }};
}

/** Each Hermes profile's home, the one Fox talks through (`main`) included; none without a Hermes Agent here. */
export function hermesHomes(home=os.homedir(),environment=process.env,platform:NodeJS.Platform=process.platform):{id:string;root:string;main:boolean}[] {
 const active=discoverHermes(home,environment,platform);
 if(!active)return [];
 const base=standardHermesHome(home,environment,platform);
 const own=(folder:string)=>['config.yaml','.env','SOUL.md'].some(name=>{try{return fs.statSync(path.join(folder,name)).isFile();}catch{return false;}});
 const homes:{id:string;root:string}[]=[];
 if(environment.HERMES_HOME&&path.isAbsolute(environment.HERMES_HOME))homes.push({id:'default',root:active});
 else{
  if(own(base))homes.push({id:'default',root:real(base)});
  for(const name of directories(path.join(base,'profiles')).slice(0,50))if(isHarnessAgentId(name)&&name!=='default'&&own(path.join(base,'profiles',name)))homes.push({id:name,root:real(path.join(base,'profiles',name))});
  if(!homes.some(entry=>entry.root===active))homes.unshift({id:'default',root:active});
 }
 return homes.map(entry=>({...entry,main:entry.root===active}));
}

/** The Harnesses whose agents Worldlet reads (`agents: 'files'` in core/agent/harness-services.ts). */
export const HARNESS_AGENTS:Partial<Record<LocalHarnessId,(home?:string,environment?:NodeJS.ProcessEnv)=>HarnessAgents>>={openclaw:openClawAgentsService,hermes:hermesAgentsService};
