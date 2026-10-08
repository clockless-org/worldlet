// Test-only rendezvous. Records coordinate this parent's workers; they do not grant OS access.
import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {readBinding} from './windows-release-coordination.mjs';

export const leaseLimitMs=300_000;
export const coordinationScope='parent-task-only; no control over external clients or system input';
export interface GateIdentity {run:string; invocation:string; exeSha256:string; dllSha256:string;}
export interface DesktopRequest extends GateIdentity {stage:string; requestId:string; requestedAt:string;}
type RecordData=Record<string,unknown>;
function record(value:unknown):RecordData {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid coordination record.');
 return value as RecordData;
}
function time(value:unknown):number {return typeof value==='string'?Date.parse(value):NaN;}
export function validateReady(request:DesktopRequest,leaseValue:unknown,readyValue:unknown,now=Date.now()):void {
 const lease=record(leaseValue),ready=record(readyValue);
 for(const value of [lease,ready]){
  for(const key of ['run','invocation','exeSha256','dllSha256'] as const)
   if(value[key]!==request[key])throw Error(`Coordination ${key} mismatch.`);
  if(value.scope!==coordinationScope)throw Error('Coordination scope acknowledgment missing.');
 }
 const issued=time(lease.issuedAt),expires=time(lease.expiresAt),at=time(ready.readyAt),until=time(ready.expiresAt),requested=time(request.requestedAt);
 if(![issued,expires,at,until,requested,now].every(Number.isFinite)
   ||issued>now||expires<=now||expires<=issued||expires-issued>leaseLimitMs
   ||at<issued||at<requested||at>now||until<=now||until<=at||until-at>leaseLimitMs||until>expires)
  throw Error('Coordination lease/readiness is expired or outside its finite window.');
 if(ready.requestId!==request.requestId||ready.stage!==request.stage)throw Error('Coordination desktop request mismatch.');
 const evidence=record(ready.nativeCu);
 if(evidence.success!==true||typeof evidence.evidence!=='string'||!evidence.evidence.trim()
   ||!Number.isSafeInteger(evidence.workerPid)||Number(evidence.workerPid)<=0)
  throw Error('Successful native CU evidence and live worker PID required.');
}
// Gate acceptance of one READY: the record itself, the bound worker and that worker being alive.
export function acceptReady(request:DesktopRequest,leaseValue:unknown,readyValue:unknown,bound:{workerPid:unknown}|null,now=Date.now()):void {
 validateReady(request,leaseValue,readyValue,now);
 const workerPid=Number(record(record(readyValue).nativeCu).workerPid);
 if(bound&&workerPid!==bound.workerPid)throw Error('READY worker does not match the authorized release binding.');
 try{process.kill(workerPid,0);}catch{throw Error('Native CU worker is not live or cannot be verified.');}
}
function readRecord(file:string):unknown {
 try{return JSON.parse(readFileSync(file,'utf8'));}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw Error(`Cannot read coordination record ${path.basename(file)}.`);}
}
function save(file:string,value:unknown){const temporary=file+'.tmp';writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');renameSync(temporary,file);}
function digest(file:string){return createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();}

// `artifacts` names the two files that identify the gate build: the app executable and its host
// program (Electron: the Electron binary and the built main.cjs). The record keeps exe/dll field names.
export function createWindowsCheckCoordinator(root:string,output:string,env:NodeJS.ProcessEnv=process.env,artifacts={exe:path.join(output,'Worldlet.exe'),dll:path.join(output,'Worldlet.dll')}){
 if(env.WORLDLET_WINDOWS_CHECK_COORDINATE!=='1')return null;
 const run=env.WORLDLET_WINDOWS_CHECK_RUN;
 if(!run||!/^[a-zA-Z0-9-]{1,100}$/.test(run))throw Error('Coordinated check requires WORLDLET_WINDOWS_CHECK_RUN.');
 const releaseFile=env.WORLDLET_WINDOWS_CHECK_RELEASE;
 const release=releaseFile?record(readRecord(releaseFile)):null;
 if(release&&(release.run!==run||release.role!=='windows-release'||typeof release.invocation!=='string'
  ||!/^[a-zA-Z0-9-]{1,100}$/.test(release.invocation)||! /^[a-f0-9]{40}$/.test(String(release.source))
  ||release.directory!==path.join(root,'.worldlet-task/windows-check',release.invocation)
  ||path.resolve(releaseFile!)!==path.join(String(release.directory),'release.json')))
  throw Error('Windows release coordination identity/path mismatch.');
 if(release&&execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()!==release.source)
  throw Error('Windows release gate source mismatch.');
 const bound=release?readBinding(release):null;
 if(bound&&(String(bound.workerPid)!==env.WORLDLET_WINDOWS_CHECK_WORKER_PID||bound.workerRun!==env.WORLDLET_WINDOWS_CHECK_WORKER_RUN))
  throw Error('Windows CU worker changed during build; start a new invocation.');
 const checkBinding=()=>{
  if(!release)return;
  const current=readBinding(release);
  if(current.workerPid!==bound.workerPid||current.workerRun!==bound.workerRun)throw Error('Windows CU worker changed during gate; start a new invocation.');
 };
 const identity:GateIdentity={run,invocation:release?String(release.invocation):randomUUID(),exeSha256:digest(artifacts.exe),dllSha256:digest(artifacts.dll)};
 const directory=path.join(root,'.worldlet-task','windows-check',identity.invocation);
 mkdirSync(directory,{recursive:true});
 const identityRecord={...release,...identity,state:'built',createdAt:new Date().toISOString(),directory,exe:artifacts.exe,scope:coordinationScope};
 save(path.join(directory,'gate.json'),identityRecord);
 save(path.join(root,'.worldlet-task','windows-check','current.json'),identityRecord);
 console.log('WINDOWS_CHECK_GATE '+JSON.stringify(identityRecord));
 const event=(value:RecordData)=>appendFileSync(path.join(directory,'events.jsonl'),JSON.stringify({...identity,at:new Date().toISOString(),...value})+'\n');
 return {
  async run(stage:string,exe:string,args:string[],childEnv:NodeJS.ProcessEnv){
   const request:DesktopRequest={...identity,stage,requestId:randomUUID(),requestedAt:new Date().toISOString()};
   save(path.join(directory,'desktop-request.json'),request);
   event({stage,state:'waiting',requestId:request.requestId});
   const deadline=performance.now()+leaseLimitMs;
   while(true){
    checkBinding();
    const lease=readRecord(path.join(directory,'cu-lease.json')),ready=readRecord(path.join(directory,'cu-ready.json'));
    // An earlier stage's READY can remain while the worker responds to this request.
    if(ready!==undefined&&record(ready).requestId===request.requestId){
     acceptReady(request,lease,ready,bound);
     break;
    }
    if(performance.now()>=deadline)throw Error(`Timed out waiting for fresh native CU readiness: ${stage}.`);
    await delay(250);
   }
   if(digest(exe)!==identity.exeSha256||digest(artifacts.dll)!==identity.dllSha256)throw Error('Built artifacts changed during coordination.');
   acceptReady(request,readRecord(path.join(directory,'cu-lease.json')),readRecord(path.join(directory,'cu-ready.json')),bound);
   checkBinding();
   await new Promise<void>((resolve,reject)=>{
    const child=spawn(exe,args,{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe']});
    child.once('spawn',()=>{const started={...request,pid:child.pid,startedAt:new Date().toISOString()};save(path.join(directory,`${stage}-host-started.json`),started);event({stage,state:'started',pid:child.pid});});
    child.stdout.on('data',chunk=>{process.stdout.write(chunk);appendFileSync(path.join(directory,`${stage}.stdout.log`),chunk);});
    child.stderr.on('data',chunk=>{process.stderr.write(chunk);appendFileSync(path.join(directory,`${stage}.stderr.log`),chunk);});
    child.once('error',reject);
    child.once('close',(code,signal)=>{event({stage,state:'exited',pid:child.pid,exitCode:code,signal});if(code===0)resolve();else reject(Error(`${exe} failed (${code ?? signal}).`));});
   });
   checkBinding();
  },
  finish(success:boolean){event({state:success?'complete':'failed'});save(path.join(directory,'finished.json'),{...identity,success,finishedAt:new Date().toISOString()});},
 };
}
