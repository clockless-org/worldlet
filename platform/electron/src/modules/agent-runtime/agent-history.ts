import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {HarnessHistory,HarnessThread,HarnessTurnRecord} from '../../../../../contracts/harness-services.ts';
import {harnessService,type MigrationSource,type MigrationTurn} from '../../../../../core/agent/index.ts';
import {claudeCodeConversation,claudeCodeHome,codexConversation,codexHome,codexNames,codexSessionId,hermesStateFolders,hermesThread,hermesThreads,inFolders,newBudget,piConversation,piHome,sessionFiles,type BroughtConversation} from './agent-files.ts';
import {openClawThread,openClawThreads} from './openclaw-files.ts';
import {discoverHermes} from './hermes-files.ts';
import {openClawState} from './local-memory.ts';

// The `history` Harness service in mode `files` (contracts/harness-services.ts, core/agent/PORTABILITY.md "History,
// read continuously"): the same read-only readers that bring an Agent, asked again for what changed. A thread is one
// conversation under the key bringing it uses; a turn's ID is its place in that conversation ("0", "1", …), so a cursor
// is the last ID returned and the World's turn IDs match what bringing made. Fox's own sessions are left out: any
// session the World names in `own`, and any whose working folder is one of Worldlet's (`ownFolders`). `watch` tells the
// World soon after the Agent writes to the folder or database its history is in (fs.watch), so a new channel message
// is read as it arrives rather than at the next check.

export interface HistoryOptions {home?:string;environment?:NodeJS.ProcessEnv;
 /** A Harness session that is one of Fox's own (the World remembers it; resident sessions register theirs). */
 own?:(session:string)=>boolean;
 /** Worldlet's own folders: a session run there is a Fox turn (`codex exec` keeps one per turn). */
 ownFolders?:string[]}
/** What a source's reader knows of one thread beyond the contract: its sessions and working folder, and how to read it.
 * A session file is listed by its name and time alone (`lazy`): it is read only when its turns are asked for, so a
 * history of thousands of files does not hold up Worldlet while it is listed. */
type Read={conversation:BroughtConversation;cwd:string|null;sessions:string[]};
type Listed={thread:HarnessThread;lazy:false;sessions:string[];cwd:string|null;read:()=>BroughtConversation|null}|{thread:HarnessThread;lazy:true;read:()=>Read|null};
/** Threads written to after `since` (milliseconds). */
type Listing=(since:number)=>Listed[];
const TURNS=500;
const ms=(at:string|null)=>{const t=at?Date.parse(at):NaN;return Number.isFinite(t)?t:null;};

/** One Agent's history over its files, or null when it has none here or does not declare the service this way. */
export function filesHistory(source:MigrationSource,{home=os.homedir(),environment=process.env,own=()=>false,ownFolders=[]}:HistoryOptions={}):HarnessHistory|null {
 if(harnessService(source,'history')!=='files')return null;
 const list=listing(source,home,environment);
 if(!list)return null;
 const known=new Map<string,Listed>();
 const mine=(sessions:string[],cwd:string|null)=>sessions.some(own)||inFolders(cwd,ownFolders);
 const all=(since=0)=>{const found=list(since).filter(item=>item.lazy===true||!mine(item.sessions,item.cwd));for(const item of found)known.set(item.thread.id,item);return found;};
 // The thread read last, so its pages of turns come from one read of its file.
 let last:{id:string;conversation:BroughtConversation|null}|null=null;
 const read=(item:Listed):BroughtConversation|null=>{
  if(last?.id===item.thread.id)return last.conversation;
  let conversation:BroughtConversation|null;
  if(item.lazy===true){const value=item.read();conversation=value&&!mine(value.sessions,value.cwd)?value.conversation:null;}
  else conversation=item.read();
  last={id:item.thread.id,conversation};
  return conversation;
 };
 return {
  threads:async(since=0)=>all(since).filter(item=>item.thread.updatedAt>since).map(item=>item.thread),
  turns:async(id,cursor,limit=TURNS)=>{
   const item=known.get(id)??all().find(entry=>entry.thread.id===id);
   const conversation=item?read(item):null;
   if(!item||!conversation)return {turns:[],...cursor===undefined?{}:{cursor}};
   const after=cursor===undefined?-1:Number(cursor);
   let at=item.thread.updatedAt;
   const turns:HarnessTurnRecord[]=[];
   // A turn without its own time takes the one before it, as bringing does.
   conversation.turns.forEach((turn:MigrationTurn,index)=>{at=ms(turn.at)??at;if(index>after&&turns.length<Math.max(1,limit))turns.push({id:String(index),role:turn.role,text:turn.text,at});});
   const next=turns.at(-1)?.id??cursor;
   return {turns,...next===undefined?{}:{cursor:next},...item.lazy?{title:conversation.title}:{}};
  },
  watch:onChange=>watchFolders(watched(source,home,environment),onChange),
 };
}

/** Where each source writes its history: session-file folders (recursive), Hermes Agent's `state.db` in its home and
 * each profile, OpenClaw's per-agent `openclaw-agent.sqlite` (and the older sessions.json with its transcripts).
 * `files` are the databases a channel message is written to, compared again just after watching starts. */
type Watched={folder:string;recursive:boolean;names?:RegExp;files?:()=>string[]};
function watched(source:MigrationSource,home:string,environment:NodeJS.ProcessEnv):Watched[] {
 if(source==='claude-code')return [{folder:path.join(claudeCodeHome(home,environment),'projects'),recursive:true,names:/\.jsonl$/}];
 if(source==='pi')return [{folder:path.join(piHome(home,environment),'sessions'),recursive:true,names:/\.jsonl$/}];
 if(source==='codex'){const root=codexHome(home,environment);return ['sessions','archived_sessions'].map(folder=>({folder:path.join(root,folder),recursive:true,names:/\.jsonl$/}));}
 if(source==='hermes')return hermesStateFolders(home,environment).map(folder=>({folder,recursive:false,names:/^state\.db/,files:()=>withWal(path.join(folder,'state.db'))}));
 const agents=path.join(openClawState(home,environment),'agents');
 const files=()=>{try{return fs.readdirSync(agents).flatMap(id=>withWal(path.join(agents,id,'agent','openclaw-agent.sqlite')));}catch{return [];}};
 return [{folder:agents,recursive:true,names:/openclaw-agent\.sqlite|sessions\.json|\.jsonl$/,files}];
}
const withWal=(file:string)=>[file,file+'-wal'];
/** When a watch has surely started, the databases are compared with how they were as it was asked for: on macOS fs.watch
 * starts its FSEvents stream on another thread and a write before it starts is never reported (RC 2026-10-08, a busy
 * gate host), so a channel message written just then would wait for the World's clock. A few stats, a few times. */
export const WATCH_CATCH_UP_MS=[500,2000,5000];
const signature=(files:string[])=>files.map(file=>{try{const stat=fs.statSync(file);return stat.size+':'+stat.mtimeMs;}catch{return '';}}).join('|');
/** One fs.watch per folder; a folder that cannot be watched (missing, or no recursive watching here) is left to the
 * World's own clock. */
function watchFolders(folders:Watched[],onChange:()=>void):()=>void {
 const watchers:fs.FSWatcher[]=[],timers:ReturnType<typeof setTimeout>[]=[];
 for(const {folder,recursive,names,files} of folders){
  if(!fs.existsSync(folder))continue;
  try{
   const watcher=fs.watch(folder,{recursive,persistent:false},(_event,name)=>{if(!names||name&&names.test(path.basename(String(name))))onChange();});
   watcher.on('error',()=>{try{watcher.close();}catch{}});
   watchers.push(watcher);
  }catch{continue;}
  if(!files)continue;
  let was=signature(files());
  for(const delay of WATCH_CATCH_UP_MS){
   const timer=setTimeout(()=>{const now=signature(files());if(now!==was){was=now;onChange();}},delay);
   timer.unref?.();timers.push(timer);
  }
 }
 return ()=>{for(const timer of timers)clearTimeout(timer);for(const watcher of watchers)try{watcher.close();}catch{}};
}

/** Each source's threads with how to read one; null when the Agent is not on this computer. */
function listing(source:MigrationSource,home:string,environment:NodeJS.ProcessEnv):Listing|null {
 // A session file's thread is named by the file (a Codex one by the session ID in its name, else its first line).
 const jsonl=(root:string,files:()=>{file:string;time:number}[],id:(file:string)=>string|null,read:(file:string)=>Read|null):Listing|null=>fs.existsSync(root)?since=>files().filter(({time})=>time>since).flatMap(({file,time})=>{
  const key=id(file);
  return key?[{thread:{id:key,title:'',updatedAt:time},lazy:true as const,read:()=>read(file)}]:[];
 }):null;
 const named=(file:string)=>path.basename(file,'.jsonl');
 if(source==='claude-code'){
  const root=claudeCodeHome(home,environment);
  return jsonl(root,()=>sessionFiles(root,path.join(root,'projects')),named,file=>claudeCodeConversation(root,file,newBudget()));
 }
 if(source==='pi'){
  const root=piHome(home,environment);
  return jsonl(root,()=>sessionFiles(root,path.join(root,'sessions')),named,file=>piConversation(root,file,newBudget()));
 }
 if(source==='codex'){
  // Every session file, by time; one Codex started for itself or too large to read has no conversation.
  const root=codexHome(home,environment);
  let names:Map<string,string>|null=null;
  return jsonl(root,()=>[...sessionFiles(root,path.join(root,'sessions'),3),...sessionFiles(root,path.join(root,'archived_sessions'),0)],codexSessionId,file=>codexConversation(root,file,names??=codexNames(root),newBudget()));
 }
 if(source==='hermes'){
  if(!discoverHermes(home,environment))return null;
  return ()=>(hermesThreads(home,environment)??[]).map(chain=>({thread:{id:chain.key,title:chain.title,...chain.shared?{shared:true}:{},updatedAt:chain.last*1000},lazy:false,sessions:chain.sessions,cwd:null,read:()=>hermesThread(chain.key,home,environment)}));
 }
 if(!fs.existsSync(openClawState(home,environment)))return null;
 return ()=>(openClawThreads(home,environment)??[]).map(({sessions,last,...thread})=>({thread:{...thread,updatedAt:last},lazy:false,sessions,cwd:null,read:()=>{const value=openClawThread(thread.id,home,environment);return value?{key:thread.id,title:value.title,turns:value.turns}:null;}}));
}
