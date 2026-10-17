// Worldlet's fixed MCP home (platform/node/README.md#one-fixed-mcp-home): `~/.worldlet/mcp` (`WORLDLET_HOME` names
// another place than `~/.worldlet`) holds the standing server's stdio shim, its tool list and one owner-only endpoint
// file per Agent. Their names never change, so an Agent registers the server once: each run the host writes the
// endpoint and that Agent's new token (core/agent/GRANTS.md) into the same file, and removes it when it stops, so a call
// then answers that Worldlet is not open. `register` runs the Agent's own command (core/agent/harness-connections.ts
// worldToolsCommands) and copies the Worldlet skill into the Agent's skills folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {standingWorldTools} from '../../electron/src/modules/agent-runtime/index.ts';
import {mcpHome,worldletHome} from '../../electron/src/modules/agent-runtime/script-agents.ts';
import {currentEnvironment,locateLocalHarnesses} from '../../electron/src/modules/agent-runtime/local-harness.ts';
import {runHarnessCommand} from '../../electron/src/modules/agent-runtime/harness-approvals.ts';
import {codexHome} from '../../electron/src/modules/agent-runtime/agent-files.ts';
import type {StandingAgent} from '../../electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {ensureDirectory,writeAtomic} from '../../electron/src/files.ts';
import {LOCAL_HARNESSES,commandReason,isWorldToolsRegistrar,worldToolsCommands,type WorldToolsRegistrar} from '../../../core/agent/index.ts';

/** The Worldlet skill (harness/skills/worldlet/SKILL.md), put in by scripts/build-node-host.ts. */
declare const __WORLDLET_SKILL__:string|undefined;
const REGISTERED='registered.json';

export {worldletHome,mcpHome};
/** Where each Agent reads its skills: Claude Code `~/.claude/skills` (or under CLAUDE_CONFIG_DIR), Codex
 * `~/.codex/skills` (or under CODEX_HOME). */
export function skillFile(harness:WorldToolsRegistrar,env:NodeJS.ProcessEnv=process.env,home=os.homedir()):string {
 const root=harness==='claude-code'?(env.CLAUDE_CONFIG_DIR&&path.isAbsolute(env.CLAUDE_CONFIG_DIR)?env.CLAUDE_CONFIG_DIR:path.join(home,'.claude')):codexHome(home,env);
 return path.join(root,'skills','worldlet','SKILL.md');
}
/** The Node the Agent runs the shim with: the installer's `current/node/bin/node` (install.sh) when it is this same Node,
 * so the registration outlives the versioned folder it came from (an install keeps only the build before it). */
export function stableRunner(home=mcpHome(),runner=process.execPath):string {
 const current=path.join(path.dirname(home),'current','node','bin','node');
 try{return fs.realpathSync(current)===fs.realpathSync(runner)?current:runner;}catch{return runner;}
}
const agentFor=(id:WorldToolsRegistrar):StandingAgent=>({id,name:LOCAL_HARNESSES.find(item=>item.id===id)!.title,harness:id,kind:'local'});

/** The Agents registered from this home, in the order they were. */
export function registeredAgents(home=mcpHome()):WorldToolsRegistrar[] {
 try{const value=JSON.parse(fs.readFileSync(path.join(home,REGISTERED),'utf8'));return Array.isArray(value)?value.filter(isWorldToolsRegistrar):[];}catch{return [];}
}

/** Each run: this run's endpoint and a new token for every Agent registered here, in their same files. */
export async function openMcpHome(home=mcpHome()):Promise<void> {
 const agents=registeredAgents(home);
 if(!agents.length)return;
 const tools=await standingWorldTools();
 if(!tools)throw Error('The Agent runtime is not installed.');
 ensureDirectory(home);
 for(const id of agents)tools.server(home,agentFor(id));
}

/** Registers the standing `worldlet` server in the Agent `id` with its own command, and puts the skill in its skills
 * folder. Returns what the person reads. */
export async function registerAgent(id:string,home=mcpHome()):Promise<string[]> {
 const known=LOCAL_HARNESSES.find(item=>item.id===id);
 if(!known)throw Error(`Not an Agent Worldlet knows: ${id}. Use claude-code or codex.`);
 if(!isWorldToolsRegistrar(id))throw Error(id==='hermes'?'Hermes Agent gets World tools in its own profile once it is Fox’s Agent: run worldlet setup --agent hermes.':`Worldlet cannot register its MCP server in ${known.title} from here yet.`);
 const environment=currentEnvironment(),install=locateLocalHarnesses(environment).find(item=>item.id===id);
 if(!install)throw Error(`${known.title} is not on this computer.`);
 const tools=await standingWorldTools();
 if(!tools)throw Error('The Agent runtime is not installed.');
 ensureDirectory(home);
 const server=tools.server(home,agentFor(id));
 for(const step of worldToolsCommands(id,{...server,command:stableRunner(home,server.command)})){
  const run=await runHarnessCommand(install,environment,step.args,{timeout:60_000});
  if(run.code!==0&&!step.optional)throw Error(`${known.title} did not add Worldlet’s MCP server: ${commandReason(run.stderr+'\n'+run.stdout)||'it stopped with code '+run.code}`);
 }
 const agents=registeredAgents(home);
 if(!agents.includes(id))writeAtomic(path.join(home,REGISTERED),JSON.stringify([...agents,id]));
 const skill=skillFile(id,environment.env,environment.home);
 if(typeof __WORLDLET_SKILL__!=='string')throw Error('This build has no Worldlet skill.');
 writeAtomic(skill,__WORLDLET_SKILL__,0o644);
 return [`${known.title}: Worldlet's MCP server "worldlet" is registered (${home}).`,`${known.title}: the Worldlet skill is at ${skill}.`];
}
