import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {openClawConversationIncluded,openClawConversationTitle,openClawRoutine,openClawSharedSession,openClawTurn,type OpenClawTurn} from '../../../../../core/agent/index.ts';
import {realPath as real} from '../../files.ts';
import {directories,inside,json,keep,newBudget,readFile,skillsIn,type Budget,type BroughtSkill} from './agent-files.ts';
import {declaredName} from './hermes-files.ts';
import {openClawState,openClawWorkspace} from './local-memory.ts';

// Read-only view of a person's OpenClaw (2026.9: per-agent SQLite sessions and a shared SQLite
// state database; older installs: sessions.json + JSONL transcripts and cron/jobs.json). Nothing
// under the OpenClaw folder is ever written, and only bounded regular files inside it are read.
// What the rows mean (titles, turns, schedules) is Core's `openclaw-migration`.

export interface OpenClawAgent {id:string;name:string;default:boolean;workspace:string|null}
export interface OpenClawConversation {agentId:string;key:string;title:string;turns:OpenClawTurn[]}
export interface OpenClawNote {agentId:string;date:string;text:string}
export interface OpenClawData {
 agents:OpenClawAgent[];conversations:OpenClawConversation[];notes:OpenClawNote[];skills:BroughtSkill[];
 jobs:unknown[];config:unknown;personas:Record<string,{soul:string;memory:string;user:string}>;
 /** Parts that could not be read, by plain description; the rest still comes over. */
 problems:string[];truncated:boolean;
}

/** openclaw.json is JSON5 (comments, unquoted keys, trailing commas, single quotes). */
export function parseJSON5(source:string):unknown {
 try{return JSON.parse(source);}catch{}
 let out='',i=0;
 const n=source.length;
 while(i<n){
  const c=source[i];
  if(c==='"'||c==='\''){
   let value='';i++;
   while(i<n&&source[i]!==c){if(source[i]==='\\'&&i+1<n){value+=source[i]+source[i+1];i+=2;}else value+=source[i++];}
   i++;
   let decoded:string;try{decoded=JSON.parse('"'+value.replace(/\\'/g,"'")+'"');}catch{decoded=value;}
   out+=JSON.stringify(decoded);
   continue;
  }
  if(c==='/'&&source[i+1]==='/'){while(i<n&&source[i]!=='\n')i++;continue;}
  if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?n:end+2;continue;}
  if(/[A-Za-z_$]/.test(c)){
   let word='';while(i<n&&/[\w$]/.test(source[i]))word+=source[i++];
   let j=i;while(j<n&&/\s/.test(source[j]))j++;
   out+=source[j]===':'?JSON.stringify(word):word==='Infinity'||word==='NaN'?'null':word;
   continue;
  }
  if(c==='+'&&/[\d.]/.test(source[i+1]??'')){i++;continue;}
  out+=c;i++;
 }
 out=out.replace(/,(\s*[}\]])/g,'$1');
 try{return JSON.parse(out);}catch{return null;}
}

export function readOpenClawConfig(home=os.homedir(),environment=process.env):Record<string,any> {
 const state=openClawState(home,environment);
 const value=parseJSON5(readFile(state,path.join(state,'openclaw.json'),4_000_000));
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
}

/** Configured agents (`agents.entries`, older `agents.list`) plus agent folders on disk. The
 * default agent is the one marked `default`, else `main`, else the first. */
export function openClawAgents(home=os.homedir(),environment=process.env,config=readOpenClawConfig(home,environment)):OpenClawAgent[] {
 const state=openClawState(home,environment),agents=config?.agents??{};
 const entries:Record<string,any>={};
 if(agents.entries&&typeof agents.entries==='object')for(const [id,entry] of Object.entries(agents.entries))entries[id]=entry??{};
 if(Array.isArray(agents.list))for(const entry of agents.list)if(entry&&typeof entry.id==='string')entries[entry.id]={...entry,...entries[entry.id]};
 for(const id of directories(path.join(state,'agents')))entries[id]??={};
 const ids=Object.keys(entries).filter(id=>/^[A-Za-z0-9_.-]{1,64}$/.test(id));
 if(!ids.length&&fs.existsSync(state))ids.push('main');
 const chosen=ids.find(id=>entries[id]?.default===true)??(ids.includes('main')?'main':ids[0]);
 return ids.map(id=>{
  const entry=entries[id]??{},isDefault=id===chosen;
  const configured=typeof entry.workspace==='string'&&entry.workspace.trim()?entry.workspace.trim().replace(/^~(?=$|[\\/])/,home):null;
  const candidate=configured??(isDefault?openClawWorkspace(home,environment):path.join(state,'workspace-'+id));
  const workspace=candidate&&path.isAbsolute(candidate)&&fs.existsSync(candidate)&&fs.statSync(candidate).isDirectory()?real(candidate):null;
  const declared=workspace?declaredName(readFile(workspace,path.join(workspace,'IDENTITY.md')))??declaredName(readFile(workspace,path.join(workspace,'SOUL.md'))):null;
  const name=[entry.name,entry.identity?.name,declared].find(value=>typeof value==='string'&&value.trim())?.trim()??id;
  return {id,name:name.slice(0,80),default:isDefault,workspace};
 });
}

// Conversations ----------------------------------------------------------------------------

const zstd=(zlib as any).zstdDecompressSync as ((data:Buffer)=>Buffer)|undefined;
function eventsFromJSONL(data:string,into:OpenClawTurn[]){
 for(const line of data.split('\n')){
  if(!line.trim())continue;
  let event:unknown;try{event=JSON.parse(line);}catch{continue;}
  const turn=openClawTurn(event);
  if(turn)into.push(turn);
 }
}

/** OpenClaw 2026.6+: `agents/<id>/agent/openclaw-agent.sqlite`, opened read-only. `read` sees each conversation node
 * with its sessions (every window, then the current one) and a reader of their turns. */
type OpenClawNode={key:string;node:any;entry:any;sessions:string[];turns:()=>OpenClawTurn[];last:()=>number};
function sqliteNodes<T>(state:string,agent:OpenClawAgent,problems:string[],read:(node:OpenClawNode)=>T|null):T[]|null {
 const file=path.join(state,'agents',agent.id,'agent','openclaw-agent.sqlite');
 if(!fs.existsSync(file)||!inside(file,state))return null;
 let db:DatabaseSync;
 try{db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);}catch{problems.push(`${agent.name}'s conversations`);return [];}
 const result:T[]=[];
 try{
  db.exec('PRAGMA trusted_schema=OFF');
  const tables=new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map(row=>row.name));
  if(!tables.has('session_nodes')||!tables.has('transcript_events'))return [];
  const nodes=db.prepare('SELECT * FROM session_nodes').all() as any[];
  const windows=tables.has('session_windows')?db.prepare('SELECT session_id,session_key,created_at FROM session_windows ORDER BY created_at,session_id').all() as any[]:[];
  const cold=new Map<string,any>();
  if(tables.has('session_transcript_cold_archives'))for(const row of db.prepare('SELECT session_id,archive_name,storage,archive_blob FROM session_transcript_cold_archives').all() as any[])cold.set(row.session_id,row);
  const events=db.prepare('SELECT event_json,event_zstd FROM transcript_events WHERE session_id=? ORDER BY seq');
  const timed=(db.prepare('PRAGMA table_info(transcript_events)').all() as any[]).some(row=>row.name==='created_at');
  const newest=timed?db.prepare('SELECT max(created_at) AS t FROM transcript_events WHERE session_id=?'):null;
  // Without event times, a conversation is as new as the database file.
  const written=Math.max(...['','-wal'].map(suffix=>{try{return fs.statSync(file+suffix).mtimeMs;}catch{return 0;}}));
  for(const node of nodes){
   const key=String(node.session_key);
   if(!openClawConversationIncluded(key,node.created_via))continue;
   const sessions=windows.filter(row=>row.session_key===key).map(row=>String(row.session_id));
   if(!sessions.includes(String(node.current_session_id)))sessions.push(String(node.current_session_id));
   const turns=()=>{
    const found:OpenClawTurn[]=[];
    for(const session of sessions){
     const archived=cold.get(session);
     if(archived){
      const raw=archived.storage==='sqlite'&&archived.archive_blob?Buffer.from(archived.archive_blob):readArchive(state,agent.id,String(archived.archive_name));
      if(raw&&zstd){try{eventsFromJSONL(zstd(raw).toString('utf8'),found);}catch{}}
     }
     for(const row of events.iterate(session) as Iterable<any>){
      let text:string|null=typeof row.event_json==='string'?row.event_json:null;
      if(text===null&&row.event_zstd&&zstd){try{text=zstd(Buffer.from(row.event_zstd)).toString('utf8');}catch{}}
      const turn=text?openClawTurn(json(text)):null;
      if(turn)found.push(turn);
     }
    }
    return found;
   };
   const last=()=>{const t=Math.max(0,...sessions.map(session=>Number((newest?.get(session) as any)?.t)||0));return t?t>1e12?t:t*1000:written;};
   const value=read({key,node,entry:json(node.entry_json)??{},sessions,turns,last});
   if(value!==null)result.push(value);
  }
 }catch{problems.push(`${agent.name}'s conversations`);}
 finally{try{db.close();}catch{}}
 return result;
}
const nodeTitle=({key,node,entry}:OpenClawNode,label:string|null)=>openClawConversationTitle({key,label:node.label??entry.label,displayName:node.display_name??entry.displayName,subject:entry.subject,channel:entry.channel??entry.provider,agentName:label});
function sqliteConversations(state:string,agent:OpenClawAgent,label:string|null,budget:Budget,problems:string[]):OpenClawConversation[]|null {
 return sqliteNodes(state,agent,problems,node=>{
  const turns=node.turns();
  return turns.length?{agentId:agent.id,key:node.key,title:nodeTitle(node,label),turns:keep(turns,budget)}:null;
 });
}
function readArchive(state:string,agent:string,name:string):Buffer|null {
 if(!/^[A-Za-z0-9._-]+$/.test(name))return null;
 const file=path.join(state,'agents',agent,'sessions','cold',name);
 try{const info=fs.lstatSync(file);return info.isFile()&&info.size<=64_000_000&&inside(file,state)?fs.readFileSync(file):null;}catch{return null;}
}
/** Before the SQLite store: `agents/<id>/sessions/sessions.json` plus one JSONL file per session. */
function legacyEntries(state:string,agent:OpenClawAgent):{key:string;entry:any;file:string}[] {
 const folder=path.join(state,'agents',agent.id,'sessions');
 const store=json(readFile(state,path.join(folder,'sessions.json'),16_000_000));
 if(!store||typeof store!=='object')return [];
 return Object.entries(store as Record<string,any>).flatMap(([key,entry])=>{
  if(!openClawConversationIncluded(key)||!entry||typeof entry!=='object')return [];
  const named=typeof entry.sessionFile==='string'&&entry.sessionFile?path.resolve(folder,entry.sessionFile):typeof entry.sessionId==='string'?path.join(folder,entry.sessionId+'.jsonl'):'';
  return named&&named.endsWith('.jsonl')?[{key,entry,file:named}]:[];
 });
}
const legacyTitle=(key:string,entry:any,label:string|null)=>openClawConversationTitle({key,label:entry.label,displayName:entry.displayName,subject:entry.subject,channel:entry.channel??entry.lastChannel,agentName:label});
function legacyConversations(state:string,agent:OpenClawAgent,label:string|null,budget:Budget):OpenClawConversation[] {
 const result:OpenClawConversation[]=[];
 for(const {key,entry,file} of legacyEntries(state,agent)){
  const turns:OpenClawTurn[]=[];
  eventsFromJSONL(readFile(state,file,64_000_000),turns);
  if(!turns.length)continue;
  result.push({agentId:agent.id,key,title:legacyTitle(key,entry,label),turns:keep(turns,budget)});
 }
 return result;
}

/** Every agent's conversations as threads, for the history service (agent-history.ts): ID `<agent>:<session key>`, the
 * same key bringing it uses, with its title, its session IDs and when it was last written to (milliseconds), without
 * reading transcripts. With `id`, that one conversation's turns instead. */
export interface OpenClawThread {id:string;title:string;channel?:string;agent?:string;shared?:boolean;sessions:string[];last:number}
export function openClawThreads(home=os.homedir(),environment=process.env):OpenClawThread[]|null {
 const state=openClawState(home,environment);
 if(!fs.existsSync(state))return null;
 const agents=openClawAgents(home,environment),threads:OpenClawThread[]=[];
 for(const agent of agents){
  const label=agents.length>1&&!agent.default?agent.name:null,about={...label?{agent:agent.name}:{}};
  const found=sqliteNodes(state,agent,[],node=>({id:agent.id+':'+node.key,title:nodeTitle(node,label),...about,...typeof (node.entry.channel??node.entry.provider)==='string'?{channel:node.entry.channel??node.entry.provider}:{},...openClawSharedSession(node.key)?{shared:true}:{},sessions:[node.key,...node.sessions],last:node.last()}));
  threads.push(...found??legacyEntries(state,agent).map(({key,entry,file})=>{
   let last=0;try{last=fs.statSync(file).mtimeMs;}catch{}
   return {id:agent.id+':'+key,title:legacyTitle(key,entry,label),...about,...openClawSharedSession(key)?{shared:true}:{},sessions:[key,path.basename(file,'.jsonl')],last};
  }));
 }
 return threads;
}
export function openClawThread(id:string,home=os.homedir(),environment=process.env):OpenClawConversation|null {
 const state=openClawState(home,environment);
 if(!fs.existsSync(state))return null;
 const agents=openClawAgents(home,environment),agent=agents.find(agent=>id.startsWith(agent.id+':'));
 if(!agent)return null;
 const key=id.slice(agent.id.length+1),label=agents.length>1&&!agent.default?agent.name:null;
 const found=sqliteNodes(state,agent,[],node=>node.key===key?{agentId:agent.id,key,title:nodeTitle(node,label),turns:keep(node.turns(),newBudget())}:null);
 if(found)return found[0]??null;
 return legacyConversations(state,agent,label,newBudget()).find(conversation=>conversation.key===key)??null;
}
/** The newest tool calls in each agent's transcripts (`toolResult` messages, the newest `limit` rows that are not
 * compressed), each with the title of the conversation it was in, for what a connection was last used for
 * (agent-runtime/harness-connections.ts). Opened read-only; nothing else of a transcript is kept. */
export function openClawToolUses(home=os.homedir(),environment=process.env,limit=4000):{tool:string;at:number;thread:string}[] {
 const state=openClawState(home,environment),uses:{tool:string;at:number;thread:string}[]=[];
 if(!fs.existsSync(state))return uses;
 const agents=openClawAgents(home,environment);
 for(const agent of agents){
  const label=agents.length>1&&!agent.default?agent.name:null,titles=new Map<string,string>();
  sqliteNodes(state,agent,[],node=>{const title=nodeTitle(node,label);for(const session of node.sessions)titles.set(session,title);return null;});
  const file=path.join(state,'agents',agent.id,'agent','openclaw-agent.sqlite');
  if(!fs.existsSync(file)||!inside(file,state))continue;
  let db:DatabaseSync|null=null;
  try{
   db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);db.exec('PRAGMA trusted_schema=OFF');
   const timed=(db.prepare('PRAGMA table_info(transcript_events)').all() as any[]).some(row=>row.name==='created_at');
   for(const row of db.prepare(`SELECT session_id,event_json${timed?',created_at':''} FROM transcript_events WHERE event_json LIKE '%"toolResult"%' ORDER BY seq DESC LIMIT ?`).all(limit) as any[]){
    const entry=json(String(row.event_json))??{},message=entry.message??{};
    if(message.role!=='toolResult'||typeof message.toolName!=='string')continue;
    const at=[message.timestamp,entry.timestamp,row.created_at].map(value=>typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN).find(Number.isFinite);
    if(at)uses.push({tool:message.toolName,at:at>1e12?at:at*1000,thread:titles.get(String(row.session_id))??''});
   }
  }catch{}finally{try{db?.close();}catch{}}
 }
 return uses;
}
/** The session entry of one thread (`<agent>:<session key>`): where its replies are delivered (`deliveryContext`) for
 * the `send` service (agent-runtime/harness-send.ts), without reading its transcript. */
export function openClawSessionEntry(id:string,home=os.homedir(),environment=process.env):Record<string,any>|null {
 const state=openClawState(home,environment);
 if(!fs.existsSync(state))return null;
 const agent=openClawAgents(home,environment).find(agent=>id.startsWith(agent.id+':'));
 if(!agent)return null;
 const key=id.slice(agent.id.length+1);
 const found=sqliteNodes(state,agent,[],node=>node.key===key?node.entry:null);
 if(found)return found[0]??null;
 return legacyEntries(state,agent).find(entry=>entry.key===key)?.entry??null;
}

// Workspace files, skills and scheduled jobs -----------------------------------------------------

/** `memory/YYYY-MM-DD*.md` daily notes in the agent's workspace. */
function dailyNotes(agent:OpenClawAgent):OpenClawNote[] {
 if(!agent.workspace)return [];
 const folder=path.join(agent.workspace,'memory');
 let names:string[]=[];try{names=fs.readdirSync(folder).filter(name=>/^\d{4}-\d{2}-\d{2}.*\.md$/i.test(name)).sort();}catch{}
 return names.slice(-3000).map(name=>({agentId:agent.id,date:name.slice(0,10),text:readFile(agent.workspace!,path.join(folder,name)).trim()})).filter(note=>note.text);
}
/** Automations: SQLite `cron_jobs` in `state/openclaw.sqlite`, else the older `cron/jobs.json`. */
export function scheduledJobs(state:string,problems:string[]=[]):unknown[] {
 const file=path.join(state,'state','openclaw.sqlite');
 if(fs.existsSync(file)&&inside(file,state)){
  let db:DatabaseSync|null=null;
  try{
   db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);
   db.exec('PRAGMA trusted_schema=OFF');
   const table=db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='cron_jobs'`).get();
   if(table)return (db.prepare('SELECT job_id,name,enabled,agent_id,job_json FROM cron_jobs ORDER BY sort_order,job_id').all() as any[]).map(row=>({...json(row.job_json),id:row.job_id,name:row.name,enabled:row.enabled===1,agentId:row.agent_id??json(row.job_json)?.agentId}));
  }catch{problems.push('scheduled jobs');}
  finally{try{db?.close();}catch{}}
 }
 const legacy=json(readFile(state,path.join(state,'cron','jobs.json'),8_000_000));
 return Array.isArray(legacy)?legacy:Array.isArray(legacy?.jobs)?legacy.jobs:[];
}

/** Everything a person's OpenClaw holds that Worldlet can bring over. */
export function readOpenClaw(home=os.homedir(),environment=process.env):OpenClawData|null {
 const state=openClawState(home,environment);
 if(!fs.existsSync(state))return null;
 const config=readOpenClawConfig(home,environment),agents=openClawAgents(home,environment,config),multiple=agents.length>1;
 const problems:string[]=[],budget:Budget=newBudget();
 const conversations:OpenClawConversation[]=[],notes:OpenClawNote[]=[],skills:BroughtSkill[]=[],personas:OpenClawData['personas']={};
 for(const agent of agents){
  const label=multiple&&!agent.default?agent.name:null;
  conversations.push(...(sqliteConversations(state,agent,label,budget,problems)??legacyConversations(state,agent,label,budget)));
  notes.push(...dailyNotes(agent));
  if(agent.workspace){
   skills.push(...skillsIn(agent.workspace,path.join(agent.workspace,'skills')));
   const read=(name:string)=>readFile(agent.workspace!,path.join(agent.workspace!,name)).trim();
   personas[agent.id]={soul:[read('IDENTITY.md'),read('SOUL.md'),read('AGENTS.md')].filter(Boolean).join('\n\n'),memory:read('MEMORY.md')||read('memory.md'),user:read('USER.md')};
  }
 }
 // Skills installed for every agent.
 skills.push(...skillsIn(state,path.join(state,'skills')));
 return {agents,conversations,notes,skills,jobs:scheduledJobs(state,problems),config,personas,problems,truncated:budget.truncated};
}

/** Counts for the setup question, without reading transcripts. */
export function surveyOpenClaw(home=os.homedir(),environment=process.env):{agents:number;conversations:number;notes:number;skills:number;jobs:number} {
 const state=openClawState(home,environment);
 if(!fs.existsSync(state))return {agents:0,conversations:0,notes:0,skills:0,jobs:0};
 const agents=openClawAgents(home,environment);
 let conversations=0,notes=0,skills=directories(path.join(state,'skills')).length;
 for(const agent of agents){
  const file=path.join(state,'agents',agent.id,'agent','openclaw-agent.sqlite');
  if(fs.existsSync(file)){
   try{
    const db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);
    try{conversations+=(db.prepare('SELECT session_key,created_via FROM session_nodes').all() as any[]).filter(row=>openClawConversationIncluded(String(row.session_key),row.created_via)).length;}
    finally{db.close();}
   }catch{}
  }else{
   const store=json(readFile(state,path.join(state,'agents',agent.id,'sessions','sessions.json'),16_000_000));
   if(store&&typeof store==='object')conversations+=Object.keys(store).filter(key=>openClawConversationIncluded(key)).length;
  }
  if(agent.workspace){
   try{notes+=fs.readdirSync(path.join(agent.workspace,'memory')).filter(name=>/^\d{4}-\d{2}-\d{2}.*\.md$/i.test(name)).length;}catch{}
   skills+=directories(path.join(agent.workspace,'skills')).filter(name=>fs.existsSync(path.join(agent.workspace!,'skills',name,'SKILL.md'))).length;
  }
 }
 return {agents:agents.length,conversations,notes,skills,jobs:scheduledJobs(state,[]).filter(job=>openClawRoutine(job).ok).length};
}
