import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {HarnessCall,HarnessCalls,HarnessEvents,HarnessExternalEvent,HarnessTools,HarnessTool} from '../../../../../contracts/harness-services.ts';
import {OPENCLAW_CALL_NAMESPACES,harnessService,openClawCallArgs,openClawCallPlacing,openClawCallResult,openClawHangUpArgs,hermesExternalEvent,openClawCallChunkKey,openClawCallRecord,openClawHarnessCalls,openClawVoiceCallStore,hermesHarnessTools,openClawExternalEvent,openClawHarnessTools,openClawTurn,type OpenClawSessionFacts} from '../../../../../core/agent/index.ts';
import {callLive} from '../../../../../core/tasks/index.ts';
import {inside,json,readFile} from './agent-files.ts';
import {discoverHermes} from './hermes-files.ts';
import {openClawState} from './local-memory.ts';
import {openClawAgents,readOpenClawConfig} from './openclaw-files.ts';

// The `tools`, `events` and `calls` Harness services (contracts/harness-services.ts) that local Harnesses provide by
// reading their own folders (mode `files`, core/agent/harness-services.ts). Only read, never written; what the rows mean
// is Core's (core/agent/harness-tools.ts, harness-events.ts, harness-calls.ts). The World asks for a service, never for a Harness by name:
// a Harness that declares neither gets null here.

type Env=NodeJS.ProcessEnv;
const sqlite=(file:string,root:string,work:(db:DatabaseSync)=>void)=>{
 if(!fs.existsSync(file)||!inside(file,root))return;
 let db:DatabaseSync|null=null;
 try{db=new DatabaseSync(file,{readOnly:true,timeout:2000} as any);db.exec('PRAGMA trusted_schema=OFF');work(db);}catch{}
 finally{try{db?.close();}catch{}}
};
const tables=(db:DatabaseSync)=>new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map(row=>String(row.name)));

/** What the Harness can do beyond World tools, from its own settings. */
function readTools(id:string,home:string,env:Env):HarnessTool[] {
 if(id==='openclaw')return openClawHarnessTools(readOpenClawConfig(home,env));
 if(id==='hermes'){const root=discoverHermes(home,env);return root?hermesHarnessTools(readFile(root,path.join(root,'config.yaml'),4_000_000)):[];}
 return [];
}
export function harnessTools(id:string,home=os.homedir(),env:Env=process.env):HarnessTools|null {
 if(harnessService(id,'tools')!=='files')return null;
 return {list:async()=>{try{return readTools(id,home,env);}catch{return [];}}};
}

const toolCache=new Map<string,{at:number;tools:HarnessTool[]}>();
/** The same list, read again at most every few minutes: each Fox turn names it (core/agent localHarnessTurn), and an
 * unchanged list keeps the turn's instructions, and so a waiting spare process, the same. */
export async function currentHarnessTools(id:string,home=os.homedir(),env:Env=process.env,maxAge=5*60_000):Promise<HarnessTool[]> {
 const key=id+'\u0000'+home,cached=toolCache.get(key);
 if(cached&&Date.now()-cached.at<maxAge)return cached.tools;
 const tools=await harnessTools(id,home,env)?.list()??[];
 toolCache.set(key,{at:Date.now(),tools});
 return tools;
}

// Events -------------------------------------------------------------------------------------

/** The latest message that started a run in this transcript and the Agent's answer after it. */
function lastExchange(turns:{role:string;text:string}[]):{message:string;answer:string} {
 let i=turns.length-1;
 while(i>=0&&turns[i].role!=='user')i--;
 if(i<0)return {message:'',answer:''};
 const answer=turns.slice(i+1).filter(turn=>turn.role==='assistant').map(turn=>turn.text).join('\n\n');
 return {message:turns[i].text,answer};
}
/** OpenClaw: sessions whose key carries `hook` (or created by a hook) in each agent's openclaw-agent.sqlite, else in
 * the older sessions.json with its JSONL transcript. */
function openClawEvents(home:string,env:Env):HarnessExternalEvent[] {
 const state=openClawState(home,env),found:HarnessExternalEvent[]=[];
 if(!fs.existsSync(state))return found;
 const add=(facts:OpenClawSessionFacts)=>{const event=openClawExternalEvent(facts);if(event)found.push(event);};
 for(const agent of openClawAgents(home,env)){
  const file=path.join(state,'agents',agent.id,'agent','openclaw-agent.sqlite');
  if(fs.existsSync(file)){
   sqlite(file,state,db=>{
    const have=tables(db);
    if(!have.has('session_nodes')||!have.has('transcript_events'))return;
    const nodes=db.prepare(`SELECT * FROM session_nodes WHERE session_key LIKE '%hook%' OR created_via IN ('hook','webhook') LIMIT 200`).all() as any[];
    const events=db.prepare('SELECT event_json FROM transcript_events WHERE session_id=? AND event_json IS NOT NULL ORDER BY seq DESC LIMIT 200');
    for(const node of nodes){
     const turns=(events.all(String(node.current_session_id)) as any[]).reverse().flatMap(row=>{const turn=openClawTurn(json(row.event_json));return turn?[turn]:[];});
     const entry=json(node.entry_json)??{};
     add({key:String(node.session_key),createdVia:node.created_via,label:node.label??entry.label,displayName:node.display_name??entry.displayName,updatedAt:node.updated_at||entry.updatedAt,...lastExchange(turns)});
    }
   });
   continue;
  }
  const folder=path.join(state,'agents',agent.id,'sessions'),store=json(readFile(state,path.join(folder,'sessions.json'),16_000_000));
  if(!store||typeof store!=='object')continue;
  for(const [key,entry] of Object.entries(store as Record<string,any>).filter(([key])=>key.toLowerCase().split(':').includes('hook')).slice(0,200)){
   const named=typeof entry?.sessionFile==='string'&&entry.sessionFile?path.resolve(folder,entry.sessionFile):typeof entry?.sessionId==='string'?path.join(folder,entry.sessionId+'.jsonl'):'';
   const turns=named.endsWith('.jsonl')?readFile(state,named,16_000_000).split('\n').slice(-400).flatMap(line=>{const turn=openClawTurn(json(line));return turn?[turn]:[];}):[];
   add({key,label:entry?.label,displayName:entry?.displayName,updatedAt:entry?.updatedAt,...lastExchange(turns)});
  }
 }
 return found;
}
/** Hermes Agent: `state.db` sessions whose source is `webhook`, newest first. */
function hermesEvents(home:string,env:Env):HarnessExternalEvent[] {
 const root=discoverHermes(home,env),found:HarnessExternalEvent[]=[];
 if(!root)return found;
 sqlite(path.join(root,'state.db'),root,db=>{
  const have=tables(db);
  if(!have.has('sessions')||!have.has('messages'))return;
  const columns=new Set((db.prepare('PRAGMA table_info(sessions)').all() as any[]).map(row=>String(row.name)));
  const wanted=['id','source','started_at','display_name','title'].filter(name=>columns.has(name));
  if(!columns.has('source')||!columns.has('started_at'))return;
  const sessions=db.prepare(`SELECT ${wanted.join(',')} FROM sessions WHERE lower(source)='webhook' ORDER BY started_at DESC LIMIT 100`).all() as any[];
  const messages=db.prepare('SELECT role,content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 200');
  for(const session of sessions){
   const turns=(messages.all(String(session.id)) as any[]).reverse().filter(row=>(row.role==='user'||row.role==='assistant')&&typeof row.content==='string'&&row.content.trim()).map(row=>({role:String(row.role),text:String(row.content)}));
   const event=hermesExternalEvent({id:String(session.id),source:session.source,displayName:session.display_name,title:session.title,startedAt:session.started_at,...lastExchange(turns)});
   if(event)found.push(event);
  }
 });
 return found;
}
/** Every outside event the Harness recorded, as it stands now. */
export function readHarnessEvents(id:string,home=os.homedir(),env:Env=process.env):HarnessExternalEvent[] {
 try{return id==='openclaw'?openClawEvents(home,env):id==='hermes'?hermesEvents(home,env):[];}catch{return [];}
}
/** How often the Harness's folder is read again for new events. */
export const HARNESS_EVENTS_POLL_MS=2*60_000;
/** Each recorded event once per subscription, the ones already there first, then new ones as they are recorded. */
export function harnessEvents(id:string,home=os.homedir(),env:Env=process.env,every=HARNESS_EVENTS_POLL_MS):HarnessEvents|null {
 if(harnessService(id,'events')!=='files')return null;
 return {subscribe(onEvent){
  const seen=new Set<string>();
  const read=()=>{
   for(const event of readHarnessEvents(id,home,env).sort((a,b)=>a.at-b.at)){
    if(seen.has(event.id))continue;
    seen.add(event.id);
    try{onEvent(event);}catch{}
   }
  };
  read();
  const timer=setInterval(read,every);timer.unref?.();
  return ()=>clearInterval(timer);
 }};
}

// Calls -------------------------------------------------------------------------------------

/** The newest snapshots read from the voice-call plugin's store; older ones of a long history are left. */
const CALL_SNAPSHOTS=400;
/** OpenClaw's voice-call plugin store (core/agent/harness-calls.ts): its configured `store` (`~` is the home), else
 * `voice-calls` in the OpenClaw state folder. */
export function openClawVoiceCallDir(home:string,env:Env):string {
 const store=openClawVoiceCallStore(readOpenClawConfig(home,env));
 if(!store)return path.join(openClawState(home,env),'voice-calls');
 return path.resolve(store.replace(/^~(?=$|[\\/])/,home));
}
/** Every call snapshot the plugin kept, oldest first: its plugin-state rows (each reassembled from its chunks), then,
 * when there are none, the older `calls.jsonl`. */
function openClawCallRecords(home:string,env:Env):unknown[] {
 const store=openClawVoiceCallDir(home,env),found:unknown[]=[];
 if(!fs.existsSync(store))return found;
 sqlite(path.join(store,'state','openclaw.sqlite'),store,db=>{
  if(!tables(db).has('plugin_state_entries'))return;
  const events=(db.prepare('SELECT entry_key,value_json,created_at FROM plugin_state_entries WHERE namespace=? ORDER BY created_at DESC,entry_key DESC LIMIT ?').all(OPENCLAW_CALL_NAMESPACES.events,CALL_SNAPSHOTS) as any[])
   .map(row=>({key:String(row.entry_key),meta:json(row.value_json)??{},created:Number(row.created_at)||0}))
   .sort((a,b)=>(Number(a.meta.persistedAt)||a.created)-(Number(b.meta.persistedAt)||b.created)||(Number(a.meta.sequence)||0)-(Number(b.meta.sequence)||0)||a.key.localeCompare(b.key));
  const chunk=db.prepare('SELECT value_json FROM plugin_state_entries WHERE namespace=? AND entry_key=?');
  for(const event of events){
   const count=Number(event.meta.chunkCount);
   if(!Number.isSafeInteger(count)||count<1||count>48)continue;
   const parts:Buffer[]=[];
   for(let index=0;index<count;index++){
    const value=json((chunk.get(OPENCLAW_CALL_NAMESPACES.chunks,openClawCallChunkKey(event.key,index)) as any)?.value_json);
    if(!value||value.index!==index||typeof value.dataBase64!=='string'){parts.length=0;break;}
    parts.push(Buffer.from(value.dataBase64,'base64'));
   }
   const call=parts.length===count?openClawCallRecord(Buffer.concat(parts).toString('utf8')):null;
   if(call)found.push(call);
  }
 });
 if(found.length)return found;
 for(const line of readFile(store,path.join(store,'calls.jsonl'),32_000_000).split('\n').slice(-CALL_SNAPSHOTS*4)){const call=openClawCallRecord(line);if(call)found.push(call);}
 return found;
}
/** Every call the Harness recorded, as it stands now, newest first. */
export function readHarnessCalls(id:string,home=os.homedir(),env:Env=process.env):HarnessCall[] {
 try{return id==='openclaw'?openClawHarnessCalls(openClawCallRecords(home,env)):[];}catch{return [];}
}
/** How often the Harness's folder is read again for calls: a call Fox placed is reported soon after it ends. */
export const HARNESS_CALLS_POLL_MS=30_000;
/** While a call is in progress, or just after the World placed one, it is read this often, so its status and each
 * transcript line show in the World as the call runs (the plugin writes a snapshot at every change). */
export const HARNESS_CALLS_LIVE_MS=1_500;
/** How long a call the World placed is read live before its first snapshot appears, and how long dialing may take. */
const DIAL_MS=60_000;
/** Until when calls are read live because the World just placed one, and the subscriptions to wake when it does. */
let dialedUntil=0;
const readers=new Set<()=>void>();
const dialed=()=>{dialedUntil=Date.now()+DIAL_MS;for(const wake of readers)wake();};
/** The Agent's own command line, run once (no shell): `args` after the command itself. */
export type HarnessCommand=(args:string[])=>Promise<{code:number|null;stdout:string;stderr:string}>;
/** Each call once per subscription, and again whenever it changes (answered, ended, its transcript grew); with
 * `command`, a Harness whose calling is set up places and hangs up calls through it. */
export function harnessCalls(id:string,home=os.homedir(),env:Env=process.env,every=HARNESS_CALLS_POLL_MS,command?:HarnessCommand):HarnessCalls|null {
 if(harnessService(id,'calls')!=='files')return null;
 const live=Math.min(every,HARNESS_CALLS_LIVE_MS);
 const dialing=id==='openclaw'&&command?{
  placing:():{ready:true}|{ready:false;note:string}=>{try{return openClawCallPlacing(readOpenClawConfig(home,env));}catch{return {ready:false as const,note:'Worldlet could not read your OpenClaw settings.'};}},
  async place(request:{to:string;message:string}){
   const ready=dialing!.placing();
   if(ready.ready!==true)throw Error(ready.note);
   const {code,stdout,stderr}=await command(openClawCallArgs(request));
   const result=openClawCallResult(code,stdout,stderr);
   if('error' in result)throw Error(result.error);
   dialed();
   return result;
  },
  async hangUp(callId:string){
   const {code,stderr}=await command(openClawHangUpArgs(callId.replace(/^openclaw:/,'')));
   if(code!==0)throw Error(stderr.trim().split('\n').filter(Boolean).slice(-1)[0]?.slice(0,300)||'Your Agent could not hang up.');
  },
 }:null;
 return {...dialing??{},subscribe(onCall){
  const seen=new Map<string,string>();
  let timer:ReturnType<typeof setTimeout>|null=null,stopped=false;
  const read=()=>{
   if(timer)clearTimeout(timer);
   timer=null;
   let running=false;
   for(const call of readHarnessCalls(id,home,env).reverse()){
    if(callLive(call,Date.now()))running=true;
    const mark=JSON.stringify([call.outcome,call.live,call.answeredAt,call.endedAt,call.transcript.length,call.summary]);
    if(seen.get(call.id)===mark)continue;
    seen.set(call.id,mark);
    try{onCall(call);}catch{}
   }
   if(stopped)return;
   timer=setTimeout(read,running||Date.now()<dialedUntil?live:every);timer.unref?.();
  };
  read();
  readers.add(read);
  return ()=>{stopped=true;readers.delete(read);if(timer)clearTimeout(timer);};
 }};
}
