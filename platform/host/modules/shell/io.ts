import fs from 'node:fs';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {WorldletError} from '../../files.ts';

export class TooLarge extends Error {}
/** Reads at most `limit` bytes; a larger body is abandoned, never buffered whole. */
export async function readLimited(response:Response,limit:number):Promise<Buffer> {
 const declared=Number(response.headers.get('content-length')??'');
 if(Number.isFinite(declared)&&declared>limit){void response.body?.cancel().catch(()=>{});throw new TooLarge('too large');}
 if(!response.body)return Buffer.alloc(0);
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  total+=value.byteLength;
  if(total>limit){void reader.cancel().catch(()=>{});throw new TooLarge('too large');}
  parts.push(value);
 }
 return Buffer.concat(parts);
}
export function cancelled(){const error=new Error('The request was cancelled.');error.name='AbortError';return error;}

/** Helper processes run with a fixed minimal environment and are killed on cancel and quit. */
export const children=new Set<ChildProcess>();
export function killAll(){for(const child of children)end(child);children.clear();}
/** Ends a helper and what it started, resolving once the whole tree is ended. Windows ends only the
 * process itself: a venv launcher's interpreter and its pip or download children would keep the
 * output pipe and the library's files. */
export function end(child:ChildProcess):Promise<void>{
 if(process.platform==='win32'&&child.pid&&child.exitCode===null&&child.signalCode===null){
  return new Promise(resolve=>{
   const taskkill=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
   taskkill.once('error',()=>{try{child.kill();}catch{}resolve();});
   taskkill.once('exit',code=>{if(code!==0)try{child.kill();}catch{}resolve();});
  });
 }
 try{child.kill();}catch{}
 return Promise.resolve();
}
export function environment(names:string[],extra:Record<string,string>={}){
 const env:Record<string,string>={};
 for(const name of names)if(process.env[name]!==undefined)env[name]=process.env[name]!;
 return {...env,...extra};
}
/** Windows: a minimal system environment whose user folders all live inside `home` (created here). */
export function windowsSandboxEnv(home:string,extra:Record<string,string>={}){
 const system=process.env.SystemRoot||'C:\\Windows';
 const env:Record<string,string>={SystemRoot:system,SystemDrive:path.parse(system).root.replace(/[\\/]$/,''),WINDIR:system,PATH:path.join(system,'System32'),HOME:home,USERPROFILE:home,APPDATA:path.join(home,'AppData','Roaming'),LOCALAPPDATA:path.join(home,'AppData','Local'),TEMP:path.join(home,'tmp'),TMP:path.join(home,'tmp'),LANG:'en_US.UTF-8',...extra};
 for(const key of ['APPDATA','LOCALAPPDATA','TEMP'])fs.mkdirSync(env[key],{recursive:true});
 return env;
}
export const WINDOWS_BASE=['SYSTEMROOT','SystemRoot','SystemDrive','WINDIR','PATH','TEMP','TMP','LOCALAPPDATA','USERPROFILE','APPDATA','COMSPEC','HOME'];
export interface RunOptions {env:Record<string,string>;timeout:number;input?:string;limit?:number;signal?:AbortSignal;cwd?:string;timeoutMessage?:string}
/** Runs a program to completion with explicit arguments (no shell). */
export function run(executable:string,args:string[],options:RunOptions):Promise<{code:number|null,stdout:Buffer}> {
 return new Promise((resolve,reject)=>{
  if(options.signal?.aborted){reject(cancelled());return;}
  let child:ChildProcess;
  try{child=spawn(executable,args,{env:options.env,cwd:options.cwd,stdio:[options.input===undefined?'ignore':'pipe','pipe','ignore'],windowsHide:true});}
  catch(error){reject(error);return;}
  children.add(child);
  const parts:Buffer[]=[];let total=0,failure:Error|null=null;
  const stop=(error:Error)=>{if(!failure)failure=error;end(child);};
  const timer=setTimeout(()=>stop(new WorldletError(options.timeoutMessage??'The local tool timed out.')),options.timeout);
  const abort=()=>stop(cancelled());
  options.signal?.addEventListener('abort',abort,{once:true});
  child.stdout!.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>(options.limit??2_000_000)){stop(new WorldletError('The local tool returned too much data.'));return;}parts.push(chunk);});
  if(options.input!==undefined){child.stdin!.on('error',()=>{});child.stdin!.end(options.input);}
  let settled=false;
  const settle=(code:number|null)=>{
   if(settled)return;settled=true;
   clearTimeout(timer);children.delete(child);options.signal?.removeEventListener('abort',abort);
   if(failure)reject(failure);else resolve({code,stdout:Buffer.concat(parts)});
  };
  // A program that never started emits no 'close'.
  child.on('error',error=>{if(!failure)failure=error;if(child.pid===undefined)settle(null);});
  child.on('close',code=>settle(code));
 });
}

export function executable(file:string){try{const stat=fs.statSync(file);if(!stat.isFile())return false;if(process.platform==='win32')return true;fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}
export function which(name:string){
 const names=process.platform==='win32'?[name+'.exe',name]:[name];
 for(const dir of (process.env.PATH??'').split(path.delimiter).filter(Boolean))for(const file of names){const full=path.join(dir,file);if(executable(full))return full;}
 return '';
}

/** Newline-delimited JSON from a long-lived child's stdout, bounded per line. */
export function jsonLines(onValue:(value:any)=>void,onOverflow:()=>void,limit=32_000_000){
 let pending=Buffer.alloc(0);
 return (chunk:Buffer)=>{
  let data=pending.length?Buffer.concat([pending,chunk]):chunk,start=0;
  for(;;){
   const end=data.indexOf(10,start);
   if(end<0)break;
   const line=data.subarray(start,end);start=end+1;
   if(line.length){try{const value=JSON.parse(line.toString('utf8'));if(value&&typeof value==='object')onValue(value);}catch{}}
  }
  pending=Buffer.from(data.subarray(start));
  if(pending.length>limit){pending=Buffer.alloc(0);onOverflow();}
 };
}
