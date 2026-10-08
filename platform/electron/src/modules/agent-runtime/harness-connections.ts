import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {commandLine,commandReason,dotenvNames,harnessService,hermesConnectionCommand,hermesConnections,hermesConversationTitle,hermesMcpPrefixes,openClawConnectionCommand,openClawConnections,openClawMcpPrefixes,withLastUse,type ConnectionUse,type LocalHarnessId} from '../../../../../core/agent/index.ts';
import type {HarnessConnection,HarnessConnectionChange,HarnessConnections} from '../../../../../contracts/harness-services.ts';
import {WorldletError} from '../../files.ts';
import {inside,readFile} from './agent-files.ts';
import {runHarnessCommand} from './harness-approvals.ts';
import {hermesHomes} from './harness-agents.ts';
import {openClawThreads,openClawToolUses} from './openclaw-files.ts';
import type {HarnessEnvironment,LocalHarnessInstall} from './local-harness.ts';

// The person's connections in their Agent (contracts/harness-services.ts `connections`, declared per Harness in
// core/agent/harness-services.ts): its MCP servers and chat accounts, read where that Agent keeps them, each with its
// last use from the Agent's own history (the same files the World's history sync reads), and a server added or removed
// only with the Agent's own command, after the person confirmed the exact command (fox/harness-connections.ts). Hermes
// Agent: each profile's config.yaml and .env (names only), state.db's tool rows, `hermes mcp add/remove` under that
// profile's HERMES_HOME. OpenClaw: `openclaw mcp status --json` and `openclaw channels list --json`, its transcripts'
// tool results, `openclaw mcp add/unset`. Worldlet never writes either Agent's files itself, and no secret leaves here:
// what Core lists is masked, and a failure says only the masked line the command printed.

const OUTPUT=4_000_000;
const ms=(value:unknown)=>{const n=typeof value==='string'&&!/^\d+(\.\d+)?$/.test(value.trim())?Date.parse(value):Number(value);return Number.isFinite(n)&&n>0?n>1e12?n:n*1000:0;};
/** Hermes Agent's uses in one home's state.db: the newest row of each `mcp…` tool and the newest session of each
 * chat platform, each with its conversation's title. Opened read-only; no message text is read. */
function hermesUses(root:string):ConnectionUse[] {
 const file=path.join(root,'state.db');
 if(!fs.existsSync(file)||!inside(file,root))return [];
 let db:DatabaseSync|null=null;
 try{
  db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);db.exec('PRAGMA trusted_schema=OFF');
  const has=(table:string)=>new Set((db!.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(row=>row.name));
  const messages=has('messages'),sessions=has('sessions'),named=['title','display_name'].filter(name=>sessions.has(name));
  const about=db.prepare(`SELECT source${named.map(name=>','+name).join('')} FROM sessions WHERE id=?`);
  const title=(row:any)=>row?hermesConversationTitle({title:row.title,source:row.source,chat:row.display_name}):'';
  const uses:ConnectionUse[]=[];
  // SQLite returns the other columns of the row that holds max().
  if(messages.has('tool_name'))for(const row of db.prepare(`SELECT tool_name,max(timestamp) AS at,session_id FROM messages WHERE tool_name LIKE 'mcp%' GROUP BY tool_name LIMIT 500`).all() as any[])
   uses.push({tool:String(row.tool_name),at:ms(row.at),thread:title(about.get(String(row.session_id)))});
  if(sessions.has('source')&&sessions.has('started_at'))for(const row of db.prepare(`SELECT source,max(started_at) AS at${named.map(name=>','+name).join('')} FROM sessions GROUP BY source LIMIT 50`).all() as any[])
   if(typeof row.source==='string')uses.push({channel:row.source.toLowerCase(),at:ms(row.at),thread:title(row)});
  return uses;
 }catch{return [];}finally{try{db?.close();}catch{}}
}
/** The JSON document a `--json` command printed: the first line that starts one and parses to the end (a banner such
 * as `[plugins] loaded` may come before it). */
function printedJson(text:string):unknown {
 for(const match of text.matchAll(/^[ \t]*[[{]/gm)){try{return JSON.parse(text.slice(match.index));}catch{}}
 throw Error('It printed no JSON.');
}
const said=(title:string,what:string,run:{code:number|null;stdout:string;stderr:string})=>new WorldletError(`${title} did not ${what}: ${commandReason(run.stderr+'\n'+run.stdout)||(run.code===null?'it did not answer in time':'it stopped with code '+run.code)}`);

/** Hermes Agent: every profile (its main home and each profiles/<name>), read from its own files; changed with its own
 * `hermes mcp add` (answered on stdin: no sign-in, every tool it lists) or `hermes mcp remove` in that profile's home,
 * then read again to be sure. A server it could not connect to is not saved (its add asks before saving one anyway). */
export function hermesConnectionsService(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessConnections {
 const homes=()=>hermesHomes(environment.home,environment.env,environment.platform);
 const read=({id,root,main}:{id:string;root:string;main:boolean})=>hermesConnections(readFile(root,path.join(root,'config.yaml'),OUTPUT),dotenvNames(readFile(root,path.join(root,'.env'),1_000_000)),id,{main});
 const plan=(change:HarnessConnectionChange)=>{
  const all=homes();
  if('remove' in change){
   for(const home of all){const found=read(home).find(c=>c.id===change.remove&&c.kind==='mcp');if(found)return {home,name:found.name,...hermesConnectionCommand(change,found.name)};}
   throw new WorldletError(`${install.title} no longer has this server.`);
  }
  const home=all.find(entry=>entry.main);
  if(!home)throw new WorldletError(`${install.title} is not set up on this computer.`);
  if(read(home).some(c=>c.kind==='mcp'&&c.name===change.add.name))throw new WorldletError(`${install.title} already has a server named ${change.add.name}.`);
  return {home,name:change.add.name,...hermesConnectionCommand(change)};
 };
 return {
  async list(){return homes().flatMap(home=>withLastUse(read(home),hermesUses(home.root),hermesMcpPrefixes));},
  async preview(change){const {home,args}=plan(change);return commandLine('hermes',args)+(home.main?'':` (in its “${home.id}” profile)`);},
  async change(change){
   const {home,name,args,stdin}=plan(change);
   const run=await runHarnessCommand(install,environment,args,{stdin,env:{HERMES_HOME:home.root},timeout:90_000});
   const there=read(home).some(c=>c.kind==='mcp'&&c.name===name);
   if('add' in change&&!there)throw said(install.title,'add it',run);
   if('remove' in change&&there)throw said(install.title,'remove it',run);
  },
 };
}

/** OpenClaw: its own `mcp status --json` and `channels list --json` (the Gateway's servers and chat accounts), each
 * server's last use from its transcripts' tool results and each account's from its channel conversations; changed with
 * `openclaw mcp add` (it connects before saving and refuses a name it has) or `openclaw mcp unset`. */
export function openClawConnectionsService(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessConnections {
 const listed=async():Promise<HarnessConnection[]>=>{
  const [status,channels]=await Promise.all([runHarnessCommand(install,environment,['mcp','status','--json']),runHarnessCommand(install,environment,['channels','list','--json'],{timeout:15_000})]);
  let servers:unknown;
  try{if(status.code!==0)throw Error();servers=printedJson(status.stdout);}catch{throw said(install.title,'list its MCP servers',status);}
  let chat:unknown=null;
  try{if(channels.code===0)chat=printedJson(channels.stdout);}catch{}
  return openClawConnections(servers,chat);
 };
 const plan=async(change:HarnessConnectionChange)=>{
  const all=await listed();
  if('remove' in change){const found=all.find(c=>c.id===change.remove&&c.kind==='mcp');if(!found)throw new WorldletError(`${install.title} no longer has this server.`);return {name:found.name,...openClawConnectionCommand(change,found.name)};}
  if(all.some(c=>c.kind==='mcp'&&c.name===change.add.name))throw new WorldletError(`${install.title} already has a server named ${change.add.name}.`);
  return {name:change.add.name,...openClawConnectionCommand(change)};
 };
 return {
  async list(){
   const all=await listed(),uses:ConnectionUse[]=[...openClawToolUses(environment.home,environment.env)];
   for(const thread of openClawThreads(environment.home,environment.env)??[])if(thread.channel)uses.push({channel:thread.channel,at:thread.last,thread:thread.title});
   return withLastUse(all,uses,openClawMcpPrefixes);
  },
  async preview(change){return commandLine('openclaw',(await plan(change)).args);},
  async change(change){
   const {name,args}=await plan(change);
   const run=await runHarnessCommand(install,environment,args,{timeout:90_000});
   if(run.code!==0)throw said(install.title,'add' in change?'add it':'remove it',run);
   const there=(await listed()).some(c=>c.kind==='mcp'&&c.name===name);
   if(there!==('add' in change))throw said(install.title,'add' in change?'add it':'remove it',run);
  },
 };
}

/** The Harnesses whose connections Worldlet reads (`connections` in core/agent/harness-services.ts). */
export const HARNESS_CONNECTIONS:Partial<Record<LocalHarnessId,(install:LocalHarnessInstall,environment:HarnessEnvironment)=>HarnessConnections>>={hermes:hermesConnectionsService,openclaw:openClawConnectionsService};
export function harnessConnections(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessConnections|null {
 return harnessService(install.id,'connections')?HARNESS_CONNECTIONS[install.id]?.(install,environment)??null:null;
}
