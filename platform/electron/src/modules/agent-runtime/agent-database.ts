import {MessageChannel,receiveMessageOnPort,Worker,type MessagePort} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';

// An Agent's own SQLite database (Hermes Agent's `state.db`, OpenClaw's `openclaw-agent.sqlite`), read in a separate
// process. These databases are another program's, in WAL mode, and reading one maps its `-shm` file. When a program that
// does not see this computer's file locks opens it (a virtual machine sharing the folder, a sync tool), SQLite there
// believes it is the only reader and truncates the `-shm` under the mapping; the next read is a bus error that ends the
// whole process (crash report 2026-10-14: the app's main process in `StatementSync::All` from a timer, "cluster_pagein
// past EOF" on a 32 KB `-shm` mapping). In a reader process the same fault only ends the reader: the read fails, the
// caller treats it like a busy database, and the next read starts a new reader.
//
// Callers keep their synchronous code: each call waits for the reader's answer (a worker thread owns the reader process
// and wakes this thread through shared memory), as the in-process DatabaseSync did. Where that cannot run (a thread that
// may not wait, or a reader that cannot start at all) the database is read in this process as before.

export interface AgentStatement {all(...params:unknown[]):unknown[];get(...params:unknown[]):unknown;iterate(...params:unknown[]):IterableIterator<unknown>}
export interface AgentDatabase {exec(sql:string):void;prepare(sql:string):AgentStatement;close():void}

/** How long one call may take before the reader is stopped and the call fails (a read waits up to its busy timeout). */
const CALL_TIMEOUT_MS=60_000;

/** The reader process: one DatabaseSync per open database, read-only; handles carry its pid so a newer reader refuses
 * an older one's. */
const READER_SOURCE=String.raw`
const {DatabaseSync}=require('node:sqlite');
const databases=new Map(),statements=new Map();let next=0;
const handle=()=>process.pid+':'+(++next);
const database=key=>{const db=databases.get(key);if(!db)throw new Error('The database is closed.');return db;};
const statement=key=>{const entry=statements.get(key);if(!entry)throw new Error('The statement is closed.');return entry.statement;};
function run(m){
 switch(m.op){
  case 'open':{const db=new DatabaseSync(m.file,{readOnly:true,timeout:m.timeout});const key=handle();databases.set(key,db);return key;}
  case 'exec':database(m.db).exec(m.sql);return null;
  case 'prepare':{const key=handle();statements.set(key,{db:m.db,statement:database(m.db).prepare(m.sql)});return key;}
  case 'all':return statement(m.statement).all(...m.params);
  case 'get':return statement(m.statement).get(...m.params);
  case 'close':{for(const [key,entry] of statements)if(entry.db===m.db)statements.delete(key);const db=databases.get(m.db);databases.delete(m.db);if(db)db.close();return null;}
 }
 throw new Error('Unknown request.');
}
process.on('message',m=>{let answer;try{answer={id:m.id,value:run(m)};}catch(error){answer={id:m.id,error:String(error&&error.message||error)};}process.send(answer);});
process.on('disconnect',()=>process.exit(0));
`;

/** The worker thread: starts the reader on first use and again after it ends, forwards each request, and wakes the
 * waiting thread with the answer. `unavailable` marks a reader that could not start at all (no answer ever came). */
const WORKER_SOURCE=String.raw`
const {workerData}=require('node:worker_threads');
const {spawn}=require('node:child_process');
const {port,flag,execPath,source}=workerData;
let reader=null;const pending=new Set();
function answer(message){port.postMessage(message);Atomics.store(flag,0,1);Atomics.notify(flag,0);}
function start(){
 const env={...process.env,ELECTRON_RUN_AS_NODE:'1'};delete env.NODE_OPTIONS;
 const self=spawn(execPath,['-e',source],{stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',env,windowsHide:true});
 let answered=false;reader=self;
 self.on('message',message=>{answered=true;if(pending.delete(message.id))answer(message);});
 const gone=(why,unavailable)=>{if(reader===self)reader=null;for(const id of pending)answer({id,error:why,unavailable});pending.clear();};
 self.on('error',error=>gone('The database reader could not start: '+error.message,!answered));
 self.on('exit',(code,signal)=>gone('The database reader stopped ('+(signal||code)+').',!answered&&!signal));
}
port.on('message',message=>{
 if(message.op==='stop'){if(reader)reader.kill();return;}
 if(!reader)start();
 pending.add(message.id);
 try{reader.send(message);}catch(error){pending.delete(message.id);answer({id:message.id,error:String(error.message)});}
});
`;

type Answer={id:number;value?:unknown;error?:string;unavailable?:boolean};
type Channel={worker:Worker;port:MessagePort;flag:Int32Array};
let channel:Channel|null=null,sequence=0;
/** null until decided; false once the reader process could not run here, and databases open in this process. */
let isolated:boolean|null=null;

function waitAllowed(){try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,1,0);return true;}catch{return false;}}
function open():Channel {
 const {port1,port2}=new MessageChannel(),flag=new Int32Array(new SharedArrayBuffer(4));
 const worker=new Worker(WORKER_SOURCE,{eval:true,workerData:{port:port2,flag,execPath:process.execPath,source:READER_SOURCE},transferList:[port2]});
 worker.unref();worker.on('error',()=>{if(channel?.worker===worker)channel=null;});
 return {worker,port:port1,flag};
}
function stop(){const current=channel;channel=null;if(!current)return;try{current.port.postMessage({op:'stop'});}catch{}setTimeout(()=>{void current.worker.terminate();},1000).unref();}

class ReaderUnavailable extends Error {}
function call(request:Record<string,unknown>):unknown {
 const current=channel??=open(),id=++sequence,deadline=Date.now()+CALL_TIMEOUT_MS;
 current.port.postMessage({...request,id});
 for(;;){
  Atomics.store(current.flag,0,0);
  for(let got=receiveMessageOnPort(current.port);got;got=receiveMessageOnPort(current.port)){
   const answer=got.message as Answer;
   if(answer.id!==id)continue; // an answer to a call that already timed out
   if(answer.unavailable)throw new ReaderUnavailable(answer.error);
   if(answer.error!==undefined)throw new Error(answer.error);
   return answer.value;
  }
  const left=deadline-Date.now();
  if(left<=0){stop();throw new Error('The database reader did not answer in time.');}
  Atomics.wait(current.flag,0,0,left);
 }
}

function inProcess(file:string,timeout:number):AgentDatabase {
 const db=new DatabaseSync(file,{readOnly:true,timeout} as any);
 return {exec:sql=>{db.exec(sql);},prepare:sql=>db.prepare(sql) as unknown as AgentStatement,close:()=>db.close()};
}

/** Opens another program's SQLite database read-only, in the reader process where it can run. */
export function openAgentDatabase(file:string,{timeout=2000}:{timeout?:number}={}):AgentDatabase {
 isolated??=waitAllowed();
 if(!isolated)return inProcess(file,timeout);
 let db:string;
 try{db=call({op:'open',file,timeout}) as string;}
 catch(error){if(!(error instanceof ReaderUnavailable))throw error;isolated=false;stop();return inProcess(file,timeout);}
 let closed=false;
 const use=(request:Record<string,unknown>)=>{if(closed)throw new Error('The database is closed.');return call(request);};
 return {
  exec:sql=>{use({op:'exec',db,sql});},
  prepare:sql=>{
   const statement=use({op:'prepare',db,sql});
   return {
    all:(...params)=>use({op:'all',statement,params}) as unknown[],
    get:(...params)=>use({op:'get',statement,params}),
    iterate:(...params)=>(use({op:'all',statement,params}) as unknown[])[Symbol.iterator](),
   };
  },
  close:()=>{if(closed)return;closed=true;try{call({op:'close',db});}catch{}},
 };
}
