import fs from 'node:fs';
import {core} from '../../core.ts';
import {readHarnessApprovalRequest,readHarnessApprovalResult} from '../../../../../core/agent/index.ts';
import {WorldletError} from '../../files.ts';
import {end} from '../media/io.ts';
// One executable test for every host module (on Windows X_OK is only existence, so a file is enough).
export {executable} from '../media/io.ts';
import type {ChildProcess} from 'node:child_process';
import type {AgentEventHandler,AgentRuntime,Row} from './types.ts';

/** Asks a running child to end, then kills it if it is still running a second later. Windows has no
 * polite stop and ends the whole tree, as a launcher's own children would keep running. */
export function stopChild(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode!==null)return;
 if(process.platform==='win32'){void end(child);return;}
 child.kill('SIGTERM');
 setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},1000).unref();
}

/** Swift `CancellationError`: callers tell a stop from a failure by `name`. */
export class AgentCancelled extends Error {
 constructor(message='Cancelled.'){super(message);this.name='AbortError';}
}
export const isCancellation=(error:unknown)=>error instanceof AgentCancelled||(error as Error)?.name==='AbortError';
export const uptime=()=>performance.now()/1000;
export const exists=(file:string)=>{try{fs.statSync(file);return true;}catch{return false;}};

/** Adapter transport stays native; shared contracts normalize public events. */
export function agentEvent(raw:Row):Row {
 // Applet events have their own authorized source/activity validation.
 if(raw.type==='applet')return raw;
 // A Harness's own permission prompt (contracts/harness-services.ts HarnessTurnEvent): bounded before the page sees it.
 if(raw.type==='approval'){const request=readHarnessApprovalRequest(raw.request);if(!request)throw new WorldletError('Invalid Agent approval request.');return {type:'approval',request};}
 if(raw.type==='approval_result'){const result=readHarnessApprovalResult(raw.result);if(!result)throw new WorldletError('Invalid Agent approval result.');return {type:'approval_result',result};}
 const result=core('agentEvent',{event:raw});
 if(!result||typeof result!=='object')throw new WorldletError('Invalid Agent event.');
 return result;
}

/** Cancellation releases the caller even if a callback ignores it; a late result
 * cannot settle a later wait. */
export class AgentEventWait {
 interrupted=false;
 private terminal:Error|null=null;
 private pending:{resolve:(value:any)=>void,reject:(error:Error)=>void}|null=null;
 cancel(error:Error=new AgentCancelled()){
  if(this.terminal)return;
  this.interrupted=this.pending!==null;this.terminal=error;
  const pending=this.pending;this.pending=null;pending?.reject(error);
 }
 run<T>(operation:()=>Promise<T>|T):Promise<T> {
  if(this.terminal)return Promise.reject(this.terminal);
  if(this.pending)throw Error('Agent events must be serialized');
  return new Promise<T>((resolve,reject)=>{
   this.pending={resolve,reject};
   Promise.resolve().then(operation).then(value=>{if(this.terminal)return;this.pending=null;resolve(value);},error=>{if(this.terminal)return;this.pending=null;reject(error);});
  });
 }
}

/** Child stdout as an awaitable byte stream; EOF resolves `null`. */
export class LineReader {
 private chunks:Buffer[]=[];
 private ended=false;
 private waiter:(()=>void)|null=null;
 buffer:Buffer=Buffer.alloc(0);
 constructor(stream:NodeJS.ReadableStream){
  stream.on('data',(chunk:Buffer)=>{this.chunks.push(chunk);this.wake();});
  const end=()=>{this.ended=true;this.wake();};
  stream.on('end',end);stream.on('close',end);stream.on('error',end);
 }
 private wake(){const waiter=this.waiter;this.waiter=null;waiter?.();}
 end(){this.ended=true;this.wake();}
 async read():Promise<Buffer|null> {
  while(!this.chunks.length&&!this.ended)await new Promise<void>(resolve=>{this.waiter=resolve;});
  if(this.chunks.length)return this.chunks.shift();
  return null;
 }
 line():Buffer|null {
  const end=this.buffer.indexOf(10);
  if(end<0)return null;
  const line=this.buffer.subarray(0,end);this.buffer=this.buffer.subarray(end+1);return line;
 }
}

/** A runtime that always fails with the adapter's explanation. */
export class UnsupportedRuntime implements AgentRuntime {
 private readonly failure:Error;
 constructor(failure:Error|string){this.failure=typeof failure==='string'?new WorldletError(failure):failure;}
 cancel(){}
 async steer(){return false;}
 async run(_body:Row,_home:string,_onEvent?:AgentEventHandler):Promise<Row> {throw this.failure;}
}
