import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {claudeCodeAgentSkill,claudeCodeConversationTitle,claudeCodeTurn,codexSessionIncluded,codexTurns,hermesConversationIncluded,hermesConversationTitle,hermesSendRoute,hermesSharedChat,hermesProfileSkill,hermesRoutine,hermesTurn,migrationNotesSession,piConversationTitle,piTurn,promptTemplateSkill,
 type HermesSendRoute,type MigrationRoutineResult,type MigrationTurn} from '../../../../../core/agent/index.ts';
import {realPath as real} from '../../files.ts';
import {declaredName,discoverHermes} from './hermes-files.ts';

// Read-only views of the Agents a person may already run here, in one shape that Fox brings over
// the same way (`fox/migration.ts`): conversations, notes, skills and scheduled jobs. OpenClaw's
// richer layout has its own reader (`openclaw-files.ts`) built on the helpers below. Nothing under
// an Agent's folder is ever written, and only bounded regular files inside it are read. What the
// lines mean is Core's `agent-migration`.

export interface BroughtConversation {key:string;title:string;turns:MigrationTurn[]}
/** `session` is the full name Fox files the note under. */
export interface BroughtNote {session:string;date:string;text:string}
export interface BroughtSkill {name:string;files:{relative:string;text:string}[]}
export interface AgentHistory {
 conversations:BroughtConversation[];notes:BroughtNote[];skills:BroughtSkill[];routines:MigrationRoutineResult[];
 /** Parts that could not be read, by plain description; the rest still comes over. */
 problems:string[];truncated:boolean;
 /** Older conversations left to bring in the background, newest first (Hermes Agent's large `state.db`). */
 older?:{cursor:HermesCursor;remaining:number;bytes:number};
}
export interface HistoryCounts {conversations:number;notes:number;skills:number;jobs:number}

export const TEXT_BUDGET=96_000_000;
const FILE_LIMIT=1_000_000,TURN_LIMIT=128_000,TRANSCRIPT_LIMIT=64_000_000,SESSION_FILES=3000;
/** Session files are mostly tool output; reading stops after this much even if little of it was text. */
const READ_BUDGET=1_000_000_000;
const utf8=new TextDecoder('utf-8',{fatal:true});
export const inside=(file:string,root:string)=>{try{return real(file).startsWith(real(root)+path.sep);}catch{return false;}};
/** A regular UTF-8 file inside `root`, at most `limit` bytes; anything else counts as absent. */
export function readFile(root:string,file:string,limit=FILE_LIMIT):string {
 try{
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.size>limit||!inside(file,root))return '';
  return utf8.decode(fs.readFileSync(file));
 }catch{return '';}
}
export const directories=(folder:string)=>{try{return fs.readdirSync(folder,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink()).map(entry=>entry.name);}catch{return [];}};
export const json=(text:unknown)=>{try{return typeof text==='string'?JSON.parse(text):null;}catch{return null;}};
const absolute=(value:string|undefined)=>value&&path.isAbsolute(value)?value:null;

/** A working folder inside one of `folders` (Worldlet's own, where Fox's turns run). */
export function inFolders(cwd:string|null|undefined,folders:string[]):boolean {
 if(!cwd||!folders.length)return false;
 let at=cwd;try{at=real(cwd);}catch{}
 return folders.some(folder=>{let base=path.resolve(folder);try{base=real(folder);}catch{}return at===base||at.startsWith(base+path.sep);});
}
export type Budget={left:number;truncated:boolean};
export const newBudget=():Budget=>({left:TEXT_BUDGET,truncated:false});
/** Bounds each turn and the whole history; once the budget runs out the rest stays behind. */
export function keep(turns:MigrationTurn[],budget:Budget):MigrationTurn[] {
 const kept:MigrationTurn[]=[];
 for(const turn of turns){
  const text=Buffer.byteLength(turn.text)>TURN_LIMIT?Buffer.from(turn.text).subarray(0,TURN_LIMIT-8).toString('utf8').replace(/�$/,'')+' …':turn.text;
  budget.left-=Buffer.byteLength(text);
  if(budget.left<0){budget.truncated=true;break;}
  kept.push({...turn,text});
 }
 return kept;
}

/** Markdown files of one skill folder (scripts and binaries stay behind), or null without SKILL.md. */
function skillFiles(root:string,base:string):BroughtSkill['files']|null {
 if(!readFile(root,path.join(base,'SKILL.md'),256_000))return null;
 const files:BroughtSkill['files']=[];
 const walk=(dir:string,prefix:string,depth:number)=>{
  let entries:fs.Dirent[]=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{}
  for(const entry of entries){
   if(files.length>=30||entry.name.startsWith('.')||entry.isSymbolicLink())continue;
   const relative=prefix+entry.name;
   if(entry.isDirectory()&&depth<2)walk(path.join(dir,entry.name),relative+'/',depth+1);
   else if(entry.isFile()&&/\.md$/i.test(entry.name)){const text=readFile(root,path.join(dir,entry.name),256_000);if(text)files.push({relative,text});}
  }
 };
 walk(base,'',0);
 return files;
}
/** Skill folders under `folder` (`<name>/SKILL.md`), looking `depth` levels down for grouped ones
 * (Hermes keeps `<category>/<name>/`). `skip` names folders that are not the person's own. */
export function skillsIn(root:string,folder:string,{depth=0,skip=new Set<string>()}:{depth?:number;skip?:Set<string>}={}):BroughtSkill[] {
 const result:BroughtSkill[]=[];
 const visit=(dir:string,level:number)=>{
  for(const name of directories(dir).slice(0,200)){
   if(result.length>=200||name.startsWith('.')||skip.has(name))continue;
   const base=path.join(dir,name),files=skillFiles(root,base);
   if(files)result.push({name,files});
   else if(level<depth)visit(base,level+1);
  }
 };
 visit(folder,0);
 return result;
}
const countSkills=(root:string,folder:string,options?:{depth?:number;skip?:Set<string>})=>{
 let count=0;
 const visit=(dir:string,level:number)=>{for(const name of directories(dir).slice(0,200)){if(name.startsWith('.')||options?.skip?.has(name))continue;if(fs.existsSync(path.join(dir,name,'SKILL.md')))count++;else if(level<(options?.depth??0))visit(path.join(dir,name),level+1);}};
 visit(folder,0);
 return count;
};

/** Markdown files in `folder` (and one level of sub-folders, which name a namespace: `git/commit.md`
 * is `/git:commit`), as {relative, text}. */
function markdownFiles(root:string,folder:string):{relative:string;text:string}[] {
 const found:{relative:string;text:string}[]=[];
 const visit=(dir:string,prefix:string,depth:number)=>{
  let entries:fs.Dirent[]=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(found.length>=200||entry.name.startsWith('.')||entry.isSymbolicLink())continue;
   if(entry.isDirectory()&&depth<1)visit(path.join(dir,entry.name),prefix+entry.name+'/',depth+1);
   else if(entry.isFile()&&/\.md$/i.test(entry.name)){const text=readFile(root,path.join(dir,entry.name),256_000);if(text.trim())found.push({relative:prefix+entry.name,text});}
  }
 };
 visit(folder,'',0);
 return found;
}
const asSkill=(skill:{name:string;markdown:string}|null):BroughtSkill[]=>skill?[{name:skill.name,files:[{relative:'SKILL.md',text:skill.markdown}]}]:[];
/** Claude Code sub-agents and slash commands, and pi prompt templates, each as a skill. */
const claudeCodeExtras=(root:string)=>[...markdownFiles(root,path.join(root,'agents')).flatMap(file=>asSkill(claudeCodeAgentSkill(path.basename(file.relative),file.text))),
 ...markdownFiles(root,path.join(root,'commands')).flatMap(file=>asSkill(promptTemplateSkill('claude-code',file.relative,file.text)))];
const piExtras=(root:string)=>markdownFiles(root,path.join(root,'prompts')).flatMap(file=>asSkill(promptTemplateSkill('pi',file.relative,file.text)));

/** JSONL session files `depth` folders below `folder` (one per project; Codex files by date),
 * newest first, so a full budget keeps the recent ones. */
export function sessionFiles(root:string,folder:string,depth=1):{file:string;time:number;size:number}[] {
 const files:{file:string;time:number;size:number}[]=[];
 const visit=(dir:string,level:number)=>{
  if(level<depth){for(const name of directories(dir))visit(path.join(dir,name),level+1);return;}
  let names:string[]=[];try{names=fs.readdirSync(dir).filter(name=>name.endsWith('.jsonl'));}catch{}
  for(const name of names){
   const file=path.join(dir,name);
   try{const info=fs.lstatSync(file);if(info.isFile()&&inside(file,root))files.push({file,time:info.mtimeMs,size:info.size});}catch{}
  }
 };
 visit(folder,0);
 return files.sort((a,b)=>b.time-a.time).slice(0,SESSION_FILES);
}
const lines=(text:string)=>text.split('\n').flatMap(line=>{if(!line.trim())return [];const value=json(line);return value&&typeof value==='object'?[value]:[];});
const mtimeDate=(file:string)=>{try{return fs.statSync(file).mtime.toISOString().slice(0,10);}catch{return '';}};

// Claude Code -----------------------------------------------------------------------------------

/** One Claude Code session file as a conversation (its key is the file's session ID), with its working folder and the
 * session IDs it names, or null when it holds no visible turn. */
export function claudeCodeConversation(root:string,file:string,budget:Budget):{conversation:BroughtConversation;cwd:string|null;sessions:string[]}|null {
 const entries=lines(readFile(root,file,TRANSCRIPT_LIMIT));
 const turns=entries.map(claudeCodeTurn).filter((turn):turn is MigrationTurn=>!!turn);
 if(!turns.length)return null;
 const last=(type:string,field:string)=>entries.filter(entry=>entry.type===type&&typeof entry[field]==='string').at(-1)?.[field];
 const title=last('custom-title','customTitle')??last('summary','summary')??last('ai-title','aiTitle');
 const cwd=entries.find(entry=>typeof entry.cwd==='string')?.cwd??null,key=path.basename(file,'.jsonl');
 return {conversation:{key,title:claudeCodeConversationTitle({title,cwd,first:turns.find(turn=>turn.role==='user')?.text}),turns:keep(turns,budget)},cwd,
  sessions:[...new Set([key,...entries.flatMap(entry=>typeof entry.sessionId==='string'?[entry.sessionId]:[])])]};
}
export const claudeCodeHome=(home=os.homedir(),environment=process.env)=>absolute(environment.CLAUDE_CONFIG_DIR)??path.join(home,'.claude');
/** Claude Code: `projects/<folder>/<session>.jsonl` conversations, the auto memory notes beside
 * them (`projects/<folder>/memory/*.md`), `skills/<name>/SKILL.md`, and sub-agents (`agents/*.md`)
 * and slash commands (`commands/**.md`) as skills too. `CLAUDE.md` is its memory,
 * which `local-memory.ts` brings with the name. */
export function readClaudeCode(home=os.homedir(),environment=process.env,ownFolders:string[]=[]):AgentHistory|null {
 const root=claudeCodeHome(home,environment);
 if(!fs.existsSync(root))return null;
 const budget=newBudget(),conversations:BroughtConversation[]=[],notes:BroughtNote[]=[];
 let read=0;
 for(const {file,size} of sessionFiles(root,path.join(root,'projects'))){
  if((read+=size)>READ_BUDGET)budget.truncated=true;
  if(budget.truncated)break;
  const found=claudeCodeConversation(root,file,budget);
  if(found&&!inFolders(found.cwd,ownFolders))conversations.push(found.conversation);
 }
 for(const project of directories(path.join(root,'projects'))){
  const folder=path.join(root,'projects',project,'memory');
  let names:string[]=[];try{names=fs.readdirSync(folder).filter(name=>name.endsWith('.md')).sort();}catch{}
  // The folder is the project path with separators as dashes; its last part names it.
  const owner=project.split('-').filter(Boolean).at(-1)??project;
  for(const name of names.slice(0,200)){
   const text=readFile(root,path.join(folder,name)).trim();
   if(text)notes.push({session:migrationNotesSession('claude-code',owner),date:mtimeDate(path.join(folder,name)),text});
  }
 }
 return {conversations,notes,skills:[...skillsIn(root,path.join(root,'skills')),...claudeCodeExtras(root)],routines:[],problems:[],truncated:budget.truncated};
}

// pi -------------------------------------------------------------------------------------------

/** One pi session file as a conversation, with its working folder and session ID, or null without a visible turn. */
export function piConversation(root:string,file:string,budget:Budget):{conversation:BroughtConversation;cwd:string|null;sessions:string[]}|null {
 const entries=lines(readFile(root,file,TRANSCRIPT_LIMIT));
 const turns=entries.map(piTurn).filter((turn):turn is MigrationTurn=>!!turn);
 if(!turns.length)return null;
 const title=entries.filter(entry=>entry.type==='session_info'&&typeof entry.name==='string').at(-1)?.name;
 const session=entries.find(entry=>entry.type==='session'),cwd=typeof session?.cwd==='string'?session.cwd:null,key=path.basename(file,'.jsonl');
 return {conversation:{key,title:piConversationTitle({title,cwd,first:turns.find(turn=>turn.role==='user')?.text}),turns:keep(turns,budget)},cwd,sessions:[key,...typeof session?.id==='string'?[session.id]:[]]};
}
export const piHome=(home=os.homedir(),environment=process.env)=>absolute(environment.PI_CODING_AGENT_DIR)??path.join(home,'.pi','agent');
/** pi: `sessions/<folder>/<time>_<id>.jsonl` (OpenClaw's session tree), `skills/<name>/SKILL.md`
 * and prompt templates (`prompts/*.md`) as skills.
 * `AGENTS.md` is its memory, which `local-memory.ts` brings with the name. */
export function readPi(home=os.homedir(),environment=process.env,ownFolders:string[]=[]):AgentHistory|null {
 const root=piHome(home,environment);
 if(!fs.existsSync(root))return null;
 const budget=newBudget(),conversations:BroughtConversation[]=[];
 let read=0;
 for(const {file,size} of sessionFiles(root,path.join(root,'sessions'))){
  if((read+=size)>READ_BUDGET)budget.truncated=true;
  if(budget.truncated)break;
  const found=piConversation(root,file,budget);
  if(found&&!inFolders(found.cwd,ownFolders))conversations.push(found.conversation);
 }
 return {conversations,notes:[],skills:[...skillsIn(root,path.join(root,'skills')),...piExtras(root)],routines:[],problems:[],truncated:budget.truncated};
}

// Codex ----------------------------------------------------------------------------------------

export const codexHome=(home=os.homedir(),environment=process.env)=>absolute(environment.CODEX_HOME)??path.join(home,'.codex');
/** Its first line (`session_meta`), read alone so sessions Codex started for itself (sub-agents,
 * reviews) are left out before any transcript is read. */
function codexMeta(file:string):Record<string,any>|null {
 let fd:number|null=null;
 try{
  fd=fs.openSync(file,'r');
  // Usually 15–50 KB (it carries Codex's instructions); read in steps up to 512 KB.
  const buffer=Buffer.alloc(512_000);
  let length=0,end=-1;
  while(end<0&&length<buffer.length){const step=fs.readSync(fd,buffer,length,Math.min(64_000,buffer.length-length),length);if(!step)break;end=buffer.subarray(length,length+step).indexOf(10);if(end>=0)end+=length;length+=step;}
  const first=json(buffer.subarray(0,end<0?length:end).toString('utf8'));
  return first?.type==='session_meta'&&first.payload&&typeof first.payload==='object'?first.payload:null;
 }catch{return null;}
 finally{if(fd!==null)try{fs.closeSync(fd);}catch{}}
}
/** A Codex session's ID without reading its transcript: the one in its file name (`rollout-<time>-<id>.jsonl`), else
 * its first line's. */
export function codexSessionId(file:string):string|null {
 const named=/-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(file)?.[1];
 if(named)return named;
 const id=codexMeta(file)?.id;
 return typeof id==='string'&&id?id:null;
}
/** The person's own Codex sessions, newest first. A file too large to read (one long run can reach
 * gigabytes of tool output) is skipped rather than spending the whole read budget on it. */
const codexSessions=(root:string)=>[...sessionFiles(root,path.join(root,'sessions'),3),...sessionFiles(root,path.join(root,'archived_sessions'),0)]
 .filter(({file,size})=>size<=TRANSCRIPT_LIMIT&&codexSessionIncluded(codexMeta(file)??{})).slice(0,SESSION_FILES);
const codexExtras=(root:string)=>markdownFiles(root,path.join(root,'prompts')).flatMap(file=>asSkill(promptTemplateSkill('codex',file.relative,file.text)));
/** Names given in `session_index.jsonl`; renames are appended, so the last name for a thread wins. */
export function codexNames(root:string):Map<string,string> {
 const names=new Map<string,string>();
 for(const entry of lines(readFile(root,path.join(root,'session_index.jsonl'),8_000_000)))if(typeof entry.id==='string'&&typeof entry.thread_name==='string'&&entry.thread_name.trim())names.set(entry.id,entry.thread_name.trim());
 return names;
}
/** One Codex session file as a conversation (its key is the session ID), with its working folder, or null when Codex
 * started it for itself or it holds no visible turn. */
export function codexConversation(root:string,file:string,names:Map<string,string>,budget:Budget):{conversation:BroughtConversation;cwd:string|null;sessions:string[]}|null {
 const entries=lines(readFile(root,file,TRANSCRIPT_LIMIT));
 const meta=entries.find(entry=>entry.type==='session_meta')?.payload??{};
 if(!codexSessionIncluded(meta))return null;
 const turns=codexTurns(entries);
 if(!turns.length)return null;
 const id=typeof meta.id==='string'?meta.id:path.basename(file,'.jsonl');
 return {conversation:{key:id,title:claudeCodeConversationTitle({title:names.get(id)??meta.thread_name,cwd:meta.cwd,first:turns.find(turn=>turn.role==='user')?.text}),turns:keep(turns,budget)},
  cwd:typeof meta.cwd==='string'?meta.cwd:null,sessions:[id]};
}
/** Codex: `sessions/YYYY/MM/DD/rollout-*.jsonl` (and `archived_sessions/`) conversations, named in
 * `session_index.jsonl`, `skills/<name>/SKILL.md` (not its own `.system` ones) and custom prompts
 * (`prompts/*.md`) as skills. `AGENTS.md` is its memory, which `local-memory.ts` brings. Its model
 * stays a Codex sign-in that Fox uses directly. */
export function readCodex(home=os.homedir(),environment=process.env,ownFolders:string[]=[]):AgentHistory|null {
 const root=codexHome(home,environment);
 if(!fs.existsSync(root))return null;
 const names=codexNames(root),budget=newBudget(),conversations:BroughtConversation[]=[];
 let read=0;
 for(const {file,size} of codexSessions(root)){
  if((read+=size)>READ_BUDGET)budget.truncated=true;
  if(budget.truncated)break;
  const found=codexConversation(root,file,names,budget);
  if(found&&!inFolders(found.cwd,ownFolders))conversations.push(found.conversation);
 }
 return {conversations,notes:[],skills:[...skillsIn(root,path.join(root,'skills')),...codexExtras(root)],routines:[],problems:[],truncated:budget.truncated};
}

// Hermes Agent ---------------------------------------------------------------------------------

/** Skills Hermes Agent ships itself (listed in `.bundled_manifest`); Fox's own Hermes has them. */
function bundledSkills(root:string):Set<string> {
 return new Set(readFile(root,path.join(root,'skills','.bundled_manifest')).split('\n').map(line=>line.split(':')[0].trim()).filter(Boolean));
}
export function hermesJobs(root:string):unknown[] {
 const value=json(readFile(root,path.join(root,'cron','jobs.json'),8_000_000));
 const jobs=Array.isArray(value)?value:value?.jobs;
 return Array.isArray(jobs)?jobs:jobs&&typeof jobs==='object'?Object.entries(jobs).map(([id,job])=>({...(job as object),id:(job as any)?.id??id})):[];
}
const ownJob=(job:any)=>job?.origin?.platform!=='worldlet';
/** Hermes Agent's conversations, newest activity first (owner request 2026-10-06: a large `state.db` is read by
 * time, the recent part when the Agent is brought and the rest in the background). A compressed conversation
 * continues in a child session, so each chain of sessions is one conversation, named by its first session. The
 * chains come from the `sessions` table alone; messages are read only for the chains taken, and only the person's
 * and the Agent's own rows (tool output, often most of the file, is never read). */
export interface HermesCursor {last:number;key:string}
type HermesChain={key:string;profile:string|null;home:number;sessions:any[];last:number};
type HermesHome={root:string;profile:string|null};
/** A session's start in seconds (Hermes stores seconds; milliseconds are accepted too). */
const stamp=(value:unknown)=>{const n=typeof value==='string'?Number(value):value;return typeof n==='number'&&Number.isFinite(n)?n>1e12?n/1000:n:0;};
const newer=(a:{last:number;key:string},b:{last:number;key:string})=>b.last-a.last||(a.key<b.key?-1:a.key>b.key?1:0);
function hermesChains(db:DatabaseSync,profile:string|null,home:number):HermesChain[] {
 const columns=new Set((db.prepare('PRAGMA table_info(sessions)').all() as any[]).map(row=>row.name));
 const wanted=['id','parent_session_id','started_at','source','session_key','title','display_name','chat_type','chat_id','thread_id'].filter(name=>columns.has(name));
 const sessions=(db.prepare(`SELECT ${wanted.join(',')} FROM sessions`).all() as any[]).filter(hermesConversationIncluded);
 const byId=new Map(sessions.map(session=>[String(session.id),session]));
 const rootOf=(session:any)=>{let current=session,steps=0;while(current.parent_session_id&&byId.has(String(current.parent_session_id))&&steps++<100)current=byId.get(String(current.parent_session_id));return current;};
 const chains=new Map<string,HermesChain>();
 for(const session of sessions){
  const id=String(rootOf(session).id),key=(profile?profile+':':'')+id;
  const chain=chains.get(id)??{key,profile,home,sessions:[],last:0};
  chain.sessions.push(session);chain.last=Math.max(chain.last,stamp(session.started_at));
  chains.set(id,chain);
 }
 return [...chains.values()];
}
function hermesMessages(db:DatabaseSync){
 const columns=new Set((db.prepare('PRAGMA table_info(messages)').all() as any[]).map(row=>row.name));
 const summary=columns.has('_compressed_summary')?',_compressed_summary AS summary':'';
 return db.prepare(`SELECT role,content,timestamp${summary} FROM messages WHERE session_id=? AND role IN ('user','assistant') ORDER BY timestamp,id`);
}
function hermesConversation(messages:ReturnType<DatabaseSync['prepare']>,chain:HermesChain,budget:Budget):BroughtConversation|null {
 const sessions=[...chain.sessions].sort((a,b)=>stamp(a.started_at)-stamp(b.started_at));
 const turns:MigrationTurn[]=[];
 for(const session of sessions)for(const row of messages.iterate(String(session.id)) as Iterable<any>){const turn=hermesTurn(row);if(turn)turns.push(turn);}
 if(!turns.length)return null;
 const named=[...sessions].reverse().find(session=>session.title)?.title;
 const title=hermesConversationTitle({title:named,source:sessions[0].source,chat:sessions[0].display_name,first:turns.find(turn=>turn.role==='user')?.text});
 return {key:chain.key,title:chain.profile?chain.profile+' · '+title:title,turns:keep(turns,budget)};
}
export interface HermesWindow {
 /** Continue after this conversation (an earlier window's `next`). */
 after?:HermesCursor|null;
 /** Stop after this many bytes of text or conversations; `recentDays` also stops at conversations quiet for longer,
  * once `atLeast` came. */
 bytes:number;conversations:number;recentDays?:number;atLeast?:number;
 /** Text still allowed in all (the whole history's TEXT_BUDGET less what earlier windows brought). */
 left?:number;now?:number;
}
export interface HermesWindowResult {conversations:BroughtConversation[];next:HermesCursor|null;remaining:number;bytes:number;problems:string[];truncated:boolean}
/** One window of Hermes Agent conversations across the active profile and the others, newest activity first. */
function hermesWindow(homes:HermesHome[],window:HermesWindow):HermesWindowResult {
 const problems:string[]=[],conversations:BroughtConversation[]=[],open:(DatabaseSync|null)[]=[],statements:(ReturnType<DatabaseSync['prepare']>|null)[]=[];
 const budget:Budget={left:window.left??TEXT_BUDGET,truncated:false},start=budget.left;
 let next:HermesCursor|null=null,remaining=0;
 try{
  const all:HermesChain[]=[];
  homes.forEach((home,index)=>{
   const file=path.join(home.root,'state.db');
   open.push(null);statements.push(null);
   if(!fs.existsSync(file)||!inside(file,home.root))return;
   try{
    const db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);
    db.exec('PRAGMA trusted_schema=OFF');
    open[index]=db;
    statements[index]=hermesMessages(db);
    all.push(...hermesChains(db,home.profile,index));
   }catch{problems.push(home.profile?`the ${home.profile} profile's conversations`:'conversations');}
  });
  const after=window.after;
  const queue=all.sort(newer).filter(chain=>!after||newer(after,chain)<0);
  const quiet=window.recentDays===undefined?-Infinity:(window.now??Date.now()/1000)-window.recentDays*86_400;
  let taken=0;
  for(const chain of queue){
   const used=start-budget.left;
   if(budget.truncated||used>=window.bytes||taken>=window.conversations||taken>=(window.atLeast??0)&&chain.last<quiet)break;
   taken++;next={last:chain.last,key:chain.key};
   try{const conversation=hermesConversation(statements[chain.home]!,chain,budget);if(conversation)conversations.push(conversation);}
   catch{const what=chain.profile?`the ${chain.profile} profile's conversations`:'conversations';if(!problems.includes(what))problems.push(what);}
  }
  remaining=budget.truncated?0:queue.length-taken;
  if(!remaining)next=null;
 }finally{for(const db of open)try{db?.close();}catch{}}
 return {conversations,next,remaining,bytes:start-budget.left,problems,truncated:budget.truncated};
}
/** Hermes Agent's other profiles (`profiles/<name>/`, and the default `~/.hermes` when another is
 * active): each a separate Agent with its own persona, memory and conversations. */
function otherHermesProfiles(active:string,home:string,environment:NodeJS.ProcessEnv):{name:string;root:string}[] {
 const base=path.join(home,'.hermes'),found:{name:string;root:string}[]=[];
 const usable=(root:string)=>{try{return fs.statSync(path.join(root,'config.yaml')).size>0&&real(root)!==active;}catch{return false;}};
 if(usable(base))found.push({name:'default',root:real(base)});
 for(const name of directories(path.join(base,'profiles')).slice(0,20))if(/^[A-Za-z0-9_-]+$/.test(name)&&usable(path.join(base,'profiles',name)))found.push({name,root:real(path.join(base,'profiles',name))});
 return environment.HERMES_HOME&&path.isAbsolute(environment.HERMES_HOME)?[]:found;
}
/** Hermes Agent: the active profile's conversations, own skills and `cron/jobs.json`, plus each other
 * profile's conversations and one skill holding its persona and memory. The active profile's name
 * and memory files come through `local-memory.ts`. */
export function readOwnHermes(home=os.homedir(),environment=process.env):AgentHistory|null {
 const root=discoverHermes(home,environment);
 if(!root)return null;
 const profiles=otherHermesProfiles(root,home,environment),skills=skillsIn(root,path.join(root,'skills'),{depth:2,skip:bundledSkills(root)});
 // The recent part now: conversations active in the past month (at least the newest 20), up to 16 MB of text or
 // 400 conversations; older ones follow in the background (`readOlderHermes`, fox/older-history.ts).
 const recent=hermesWindow(hermesHomes(root,profiles),{...HERMES_RECENT,now:Date.now()/1000});
 const conversations=recent.conversations,problems=recent.problems;
 for(const profile of profiles){
  const own=conversations.filter(c=>c.key.startsWith(profile.name+':'));
  const read=(relative:string)=>readFile(profile.root,path.join(profile.root,relative)).trim(),soul=read('SOUL.md');
  const role={id:profile.name,name:declaredName(soul)??profile.name,soul:declaredName(soul)?soul:'',memory:read('memories/MEMORY.md'),user:read('memories/USER.md'),conversations:own.map(c=>c.title)};
  if(role.soul||role.memory||role.user||own.length)skills.push(...asSkill(hermesProfileSkill(role)));
 }
 const now=Date.now();
 return {conversations,notes:[],skills,routines:hermesJobs(root).filter(ownJob).map(job=>hermesRoutine(job,now)),problems,truncated:recent.truncated,
  ...recent.next?{older:{cursor:recent.next,remaining:recent.remaining,bytes:recent.bytes}}:{}};
}
/** What bringing Hermes Agent reads at once; the rest comes later, newest first. */
export const HERMES_RECENT={bytes:16_000_000,conversations:400,recentDays:30,atLeast:20};
/** Each background step afterwards. */
export const HERMES_OLDER={bytes:4_000_000,conversations:60};
const hermesHomes=(root:string,profiles:{name:string;root:string}[]):HermesHome[]=>[{root,profile:null},...profiles.map(p=>({root:p.root,profile:p.name}))];
/** The next older window of Hermes Agent conversations after `cursor`, within what the whole history may still
 * bring (`left` bytes), or null when Hermes Agent is no longer here. */
export function readOlderHermes(cursor:HermesCursor,left:number,home=os.homedir(),environment=process.env):HermesWindowResult|null {
 const root=discoverHermes(home,environment);
 if(!root)return null;
 return hermesWindow(hermesHomes(root,otherHermesProfiles(root,home,environment)),{...HERMES_OLDER,after:cursor,left});
}

/** Hermes Agent's conversations as threads, for the history service (agent-history.ts): each chain across the active
 * profile and the others, with its title, the IDs of its sessions and when it was last written to (its newest message,
 * in seconds). With `key`, that chain's conversation instead. Opened read-only; only `messages` rows of the person and
 * the Agent are read. */
export interface HermesThread {key:string;title:string;shared?:boolean;sessions:string[];last:number}
function hermesOpen<T>(home:string,environment:NodeJS.ProcessEnv,read:(db:DatabaseSync,profile:string|null,index:number)=>T[]):T[]|null {
 const root=discoverHermes(home,environment);
 if(!root)return null;
 const found:T[]=[];
 hermesHomes(root,otherHermesProfiles(root,home,environment)).forEach((entry,index)=>{
  const file=path.join(entry.root,'state.db');
  if(!fs.existsSync(file)||!inside(file,entry.root))return;
  let db:DatabaseSync|null=null;
  try{db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);db.exec('PRAGMA trusted_schema=OFF');found.push(...read(db,entry.profile,index));}
  catch{}finally{try{db?.close();}catch{}}
 });
 return found;
}
export function hermesThreads(home=os.homedir(),environment=process.env):HermesThread[]|null {
 return hermesOpen(home,environment,(db,profile,index)=>{
  const newest=db.prepare('SELECT max(timestamp) AS t FROM messages WHERE session_id=?'),first=db.prepare(`SELECT content FROM messages WHERE session_id=? AND role='user' ORDER BY timestamp,id LIMIT 1`);
  return hermesChains(db,profile,index).map(chain=>{
   const sessions=[...chain.sessions].sort((a,b)=>stamp(a.started_at)-stamp(b.started_at));
   const last=Math.max(chain.last,...sessions.map(session=>stamp((newest.get(String(session.id)) as any)?.t)));
   const named=[...sessions].reverse().find(session=>session.title)?.title,opening=(first.get(String(sessions[0].id)) as any)?.content;
   const title=hermesConversationTitle({title:named,source:sessions[0].source,chat:sessions[0].display_name,first:typeof opening==='string'?opening:null});
   return {key:chain.key,title:profile?profile+' · '+title:title,...sessions.some(session=>hermesSharedChat(session.chat_type))?{shared:true}:{},sessions:sessions.map(session=>String(session.id)),last};
  });
 });
}
/** Where Hermes Agent sends into one thread's chat (its newest session that names one), for the `send` service
 * (agent-runtime/harness-send.ts). */
export function hermesSendRouteOf(key:string,home=os.homedir(),environment=process.env):HermesSendRoute|null {
 return hermesOpen(home,environment,(db,profile,index)=>{
  const chain=hermesChains(db,profile,index).find(chain=>chain.key===key);
  const sessions=chain?[...chain.sessions].sort((a,b)=>stamp(b.started_at)-stamp(a.started_at)):[];
  for(const session of sessions){const route=hermesSendRoute({source:session.source,chatId:session.chat_id,threadId:session.thread_id});if(route)return [route];}
  return [];
 })?.[0]??null;
}
/** The folders whose `state.db` holds Hermes Agent's history (its home and each profile), for watching it. */
export function hermesStateFolders(home=os.homedir(),environment=process.env):string[] {
 const root=discoverHermes(home,environment);
 return root?hermesHomes(root,otherHermesProfiles(root,home,environment)).map(entry=>entry.root):[];
}
export function hermesThread(key:string,home=os.homedir(),environment=process.env):BroughtConversation|null {
 return hermesOpen(home,environment,(db,profile,index)=>{
  const chain=hermesChains(db,profile,index).find(chain=>chain.key===key);
  const conversation=chain?hermesConversation(hermesMessages(db),chain,newBudget()):null;
  return conversation?[conversation]:[];
 })?.[0]??null;
}

/** Counts for the setup question, without reading transcripts. */
export function surveyAgentHistory(id:'claude-code'|'pi'|'hermes'|'codex',home=os.homedir(),environment=process.env):HistoryCounts {
 const none={conversations:0,notes:0,skills:0,jobs:0};
 if(id==='codex'){
  const root=codexHome(home,environment);
  return fs.existsSync(root)?{conversations:codexSessions(root).length,notes:0,skills:countSkills(root,path.join(root,'skills'))+codexExtras(root).length,jobs:0}:none;
 }
 if(id==='claude-code'){
  const root=claudeCodeHome(home,environment);
  if(!fs.existsSync(root))return none;
  let notes=0;
  for(const project of directories(path.join(root,'projects'))){try{notes+=fs.readdirSync(path.join(root,'projects',project,'memory')).filter(name=>name.endsWith('.md')).length;}catch{}}
  return {conversations:sessionFiles(root,path.join(root,'projects')).length,notes,skills:countSkills(root,path.join(root,'skills'))+claudeCodeExtras(root).length,jobs:0};
 }
 if(id==='pi'){
  const root=piHome(home,environment);
  return fs.existsSync(root)?{conversations:sessionFiles(root,path.join(root,'sessions')).length,notes:0,skills:countSkills(root,path.join(root,'skills'))+piExtras(root).length,jobs:0}:none;
 }
 const root=discoverHermes(home,environment);
 if(!root)return none;
 const count=(base:string)=>{
  const file=path.join(base,'state.db');
  if(!fs.existsSync(file)||!inside(file,base))return 0;
  try{
   const db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);
   try{return (db.prepare('SELECT id,source,parent_session_id FROM sessions WHERE message_count>0 OR message_count IS NULL').all() as any[]).filter(session=>hermesConversationIncluded(session)&&!session.parent_session_id).length;}
   finally{db.close();}
  }catch{return 0;}
 };
 const profiles=otherHermesProfiles(root,home,environment);
 return {conversations:[root,...profiles.map(p=>p.root)].reduce((sum,base)=>sum+count(base),0),notes:0,
  skills:countSkills(root,path.join(root,'skills'),{depth:2,skip:bundledSkills(root)})+profiles.length,jobs:hermesJobs(root).filter(ownJob).filter(job=>hermesRoutine(job).ok).length};
}
