import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {codexMcpServers,hermesMcpServers,mcpServersFrom,planIntegrations,type AgentMcpServer,type IntegrationPlan,type MigrationSource} from '../../../../../core/agent/index.ts';
import {codexHome} from './agent-files.ts';
import {discoverHermes} from './hermes-files.ts';
import {openClawState} from './local-memory.ts';
import {readOpenClawConfig} from './openclaw-files.ts';

// The MCP servers a person's own Agent already had, read from its own settings (owner request
// 2026-10-04: port its integrations instead of connecting them again). Only read; core/agent
// decides which ones can come along. Tokens stay in memory and go only to the matching connection.

const LIMIT=20_000_000;
const read=(file:string)=>{try{const stat=fs.lstatSync(file);return stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=LIMIT?fs.readFileSync(file,'utf8'):'';}catch{return '';}};
/** `KEY=value` lines of an Agent's own `.env`, which its settings may reference as `${KEY}`. */
function dotenv(file:string):Record<string,string> {
 const out:Record<string,string>={};
 for(const line of read(file).split(/\r?\n/)){const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);if(match)out[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}
 return out;
}

/** Claude Code keeps user servers in `.claude.json` (`mcpServers`) and per-project ones under `projects`. */
function claudeCodeServers(home:string,environment:NodeJS.ProcessEnv):AgentMcpServer[] {
 const dir=environment.CLAUDE_CONFIG_DIR&&path.isAbsolute(environment.CLAUDE_CONFIG_DIR)?environment.CLAUDE_CONFIG_DIR:home;
 let config:any=null;
 try{config=JSON.parse(read(path.join(dir,'.claude.json'))||'null');}catch{}
 if(!config||typeof config!=='object')return [];
 const servers=mcpServersFrom(config.mcpServers);
 for(const project of Object.values<any>(config.projects??{}).slice(0,200))for(const server of mcpServersFrom(project?.mcpServers))if(!servers.some(s=>s.name===server.name))servers.push(server);
 return servers;
}

export function readAgentIntegrations(id:MigrationSource,home=os.homedir(),environment=process.env):{servers:AgentMcpServer[];env:Record<string,string|undefined>} {
 const env:Record<string,string|undefined>={...environment};
 switch(id){
  case 'claude-code':return {servers:claudeCodeServers(home,environment),env};
  case 'codex':return {servers:codexMcpServers(read(path.join(codexHome(home,environment),'config.toml'))),env};
  case 'hermes':{
   const root=discoverHermes(home,environment);
   return root?{servers:hermesMcpServers(read(path.join(root,'config.yaml'))),env:{...env,...dotenv(path.join(root,'.env'))}}:{servers:[],env};
  }
  case 'openclaw':{
   const config=readOpenClawConfig(home,environment);
   return {servers:mcpServersFrom(config?.mcp?.servers??config?.mcpServers),env:{...env,...dotenv(path.join(openClawState(home,environment),'.env'))}};
  }
  default:return {servers:[],env};
 }
}

/** What can come along from this Agent, with tokens only for the ones that will be ported. */
export function agentIntegrationPlans(id:MigrationSource,home=os.homedir(),environment=process.env):IntegrationPlan[] {
 try{const {servers,env}=readAgentIntegrations(id,home,environment);return planIntegrations(servers,env);}catch{return [];}
}
