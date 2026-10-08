import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import readline from 'node:readline';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../host/types.ts';
// One long-lived `imsg rpc` child (the pinned release, scripts/package-imsg.ts): JSON-RPC 2.0, one object per
// line on stdin and stdout. Message words travel on that pipe, never on Worldlet's command lines. macOS
// counts the child as Worldlet, so Worldlet's Full Disk Access, Automation and Contacts permissions apply.

/** An error imsg answered with: its JSON-RPC code and its `data` (a string, or the delivery disposition). */
export class ImsgError extends Error {
 readonly code:number;readonly data:unknown;
 constructor(message:string,code:number,data:unknown){super(message);this.code=code;this.data=data;}
}
type Waiting={resolve:(value:Row)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;listener?:(message:Row|null)=>void};
const IDLE=10*60_000;

export class Imsg {
 private child:ChildProcessWithoutNullStreams|null=null;
 private next=1;
 private waiting=new Map<number,Waiting>();
 private listeners=new Map<number,(message:Row|null)=>void>();
 private idle:ReturnType<typeof setTimeout>|null=null;
 private binary:()=>string|null;
 constructor(binary:()=>string|null){this.binary=binary;}

 private start(){
  if(this.child)return this.child;
  const file=this.binary();
  if(!file)throw new WorldletError('Messages support is missing from this copy of Worldlet. Install Worldlet again.');
  const child=spawn(file,['rpc'],{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME??'',LANG:'en_US.UTF-8'}});
  this.child=child;
  readline.createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>this.receive(line));
  // Diagnostics only; read so the pipe never fills.
  child.stderr.resume();
  child.on('error',error=>this.retire(child,error.message));child.on('exit',()=>this.retire(child));
  child.stdin.on('error',()=>{});
  return child;
 }

 private receive(line:string){
  let value:Row;
  try{value=JSON.parse(line);}catch{return;}
  if(value&&typeof value==='object'&&'id'in value&&typeof value.id==='number'){
   const wait=this.waiting.get(value.id);if(!wait)return;
   this.waiting.delete(value.id);clearTimeout(wait.timer);
   if(value.error){wait.reject(new ImsgError(String(value.error.message??'Messages refused the request.'),Number(value.error.code),value.error.data));return;}
   // A watch's first message can follow on the next line: listen before anything else runs.
   if(wait.listener&&Number.isSafeInteger(value.result?.subscription))this.listeners.set(value.result.subscription,wait.listener);
   wait.resolve(value.result??{});
   return;
  }
  const params=value?.params;
  if(value?.method==='message'&&params)this.listeners.get(params.subscription)?.(params.message);
  else if(value?.method==='watch.overflow'&&params){const listener=this.listeners.get(params.subscription);this.listeners.delete(params.subscription);listener?.(null);}
  this.rest();
 }

 /** Forgets a child that ended or is ending: whatever still waits on it is told so. */
 private retire(child:ChildProcessWithoutNullStreams,reason='Messages stopped answering.'){
  if(this.child!==child)return;
  this.child=null;
  for(const [,wait] of this.waiting){clearTimeout(wait.timer);wait.reject(new ImsgError(reason,-1,null));}
  this.waiting.clear();
  for(const [,listener] of this.listeners)listener(null);
  this.listeners.clear();
 }

 /** Stops the child after a quiet while; the next request starts it again. */
 private rest(){
  if(this.idle)clearTimeout(this.idle);
  this.idle=setTimeout(()=>{if(!this.waiting.size&&!this.listeners.size)this.stop();},IDLE);
  this.idle.unref?.();
 }

 request(method:string,params:Row={},{timeout=30_000,listener}:{timeout?:number;listener?:(message:Row|null)=>void}={}):Promise<Row>{
  const child=this.start();
  const id=this.next++;
  this.rest();
  return new Promise((resolve,reject)=>{
   // A send that outlives this wait may still go out; callers treat the timeout as unconfirmed.
   const timer=setTimeout(()=>{this.waiting.delete(id);reject(new ImsgError('Messages did not answer in time.',-32001,{disposition:'may_have_completed'}));},timeout);
   this.waiting.set(id,{resolve,reject,timer,listener});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
 }

 /** New messages in one chat after `after` (imsg's row id), waiting up to `ms` for the first and a moment
  * longer for any right behind it. The subscription ends with the wait. */
 async newMessages(chat:number,after:number,ms=25_000):Promise<Row[]>{
  const found:Row[]=[];
  let finish:()=>void=()=>{};
  const done=new Promise<void>(resolve=>{finish=resolve;});
  let timer=setTimeout(()=>finish(),ms);
  const listener=(message:Row|null)=>{
   clearTimeout(timer);
   if(!message){finish();return;}
   found.push(message);timer=setTimeout(()=>finish(),300);
  };
  const {subscription}=await this.request('watch.subscribe',{chat_id:chat,since_rowid:after>0?after:0,attachments:true},{listener});
  try{await done;}
  finally{
   clearTimeout(timer);
   if(this.listeners.delete(subscription))await this.request('watch.unsubscribe',{subscription}).catch(()=>{});
  }
  return found;
 }

 stop(){
  const child=this.child;if(!child)return;
  this.retire(child,'Messages was closed.');
  // Closing stdin lets imsg finish what it accepted and exit; a stuck child is killed.
  child.stdin.end();
  setTimeout(()=>{if(child.exitCode===null)child.kill();},5000).unref?.();
 }
}
