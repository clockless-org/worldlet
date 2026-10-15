import crypto from 'node:crypto';
import {configureServiceSync,finishServiceSyncPage,readStoredServicePreset,readNotionContext,servicePresetRead,serviceSyncFailure,serviceSyncPage,serviceSyncReadKey,serviceSyncStart,SERVICE_SYNC_LIMITS} from '../../../../../core/accounts/index.ts';
import {dueSourceCheck,nextSourceWake} from '../../../../../core/tasks/index.ts';
import type {ServicePreset} from '../../../../../contracts/service-presets.ts';
import type {ServiceRead} from '../../../../../contracts/services.ts';
import {SERVICE_SYNC_BUCKETS,type ServiceSyncCheckpoint,type ServiceSyncJob,type ServiceSyncSnapshot} from '../../../../../contracts/service-sync.ts';
import type {WorldLedger} from '../../store/ledger.ts';
import type {Row} from '../../host/types.ts';

// Timer/IO adapter only: shared Core owns scheduling, retries, page validation and checkpoint transitions.
// Uses the existing World ledger and source-io claims. Nothing is scheduled by default.
export {SERVICE_SYNC_BUCKETS};
const [JOBS,PAGES,SNAPSHOTS]=SERVICE_SYNC_BUCKETS;
const owner=(id:string)=>'service-sync:'+id;
const task=(id:string)=>owner(id)+':check';
export interface SyncAuthorization {binding:string;version:string}
export function createServiceSync({ledger,authorize,read,changed=()=>{},now=()=>Date.now()/1000,timeoutMs=SERVICE_SYNC_LIMITS.timeoutMs}:{
 ledger:()=>WorldLedger|null;authorize:(preset:ServicePreset)=>SyncAuthorization|null;
 read:(request:ServiceRead,signal:AbortSignal)=>Promise<unknown>;changed?:()=>void;now?:()=>number;timeoutMs?:number;
}){
 const active=new Map<string,AbortController>();let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 const db=()=>{const value=ledger();if(!value)throw Error('Service sync is available only in your own writable World.');return value;};
 const replace=(store:WorldLedger,bucket:string,id:string,value:Row)=>{store.delete(bucket,id);store.put(bucket,id,value);};
 const jobs=(store:WorldLedger)=>store.records(JOBS) as ServiceSyncJob[];
 const preset=(store:WorldLedger,id:string)=>readStoredServicePreset(store.servicePresets().find(row=>row.id===id));
 function current(store:WorldLedger,job:ServiceSyncJob,version?:string):boolean {
  if(ledger()!==store)return false;
  const live=preset(store,job.id),permission=live&&authorize(live),latest=store.value(JOBS,job.id) as ServiceSyncJob|null;
  return !!live&&!!permission&&permission.binding===job.binding&&(version===undefined||permission.version===version)
   &&serviceSyncReadKey(live)===serviceSyncReadKey(job.preset)&&latest?.revision===job.revision&&latest.check.enabled===true;
 }
 function handle(request:Row):Row {
  const store=db(),operation=request.operation;
  if(operation==='list')return {jobs:jobs(store).map(job=>({id:job.id,provider:job.provider,revision:job.revision,check:job.check,available:current(store,job),
   snapshotAt:store.value(SNAPSHOTS,job.id)?.collectedAt??null,pendingPages:store.value(PAGES,job.id)?.pages??0}))};
  if(typeof request.id!=='string')throw Error('Choose a saved Service preset.');
  const previous=store.value(JOBS,request.id) as ServiceSyncJob|undefined;
  if(operation==='read'){
   if(!previous||!current(store,previous))throw Error('This Service sync is paused, changed or no longer authorized.');
   return {snapshot:store.value(SNAPSHOTS,request.id),check:previous.check,untrustedContent:true};
  }
  if(operation==='restart'){
   if(!previous||!current(store,previous))throw Error('Enable this sync with its current connection and preset first.');
   active.get(request.id)?.abort();
   const next=configureServiceSync(previous,previous.preset,previous.binding,{enabled:true,intervalMinutes:previous.check.intervalMinutes},now());
   store.transaction(()=>{store.invalidateRuntimeTasks(owner(request.id));store.delete(PAGES,request.id);replace(store,JOBS,request.id,next);});
   changed();return {ok:true};
  }
  if(operation==='delete'){
   active.get(request.id)?.abort();
   store.transaction(()=>{store.invalidateRuntimeTasks(owner(request.id));for(const bucket of SERVICE_SYNC_BUCKETS)store.delete(bucket,request.id);});changed();return {ok:true};
  }
  if(operation!=='configure')throw Error('Unknown Service sync operation.');
  const live=preset(store,request.id);
  if(!live)throw Error('Choose a saved Service preset.');
  const permission=authorize(live);
  // Pausing remains possible after disconnect; enabling always needs the exact current connection.
  const binding=permission?.binding??(request.enabled===false?previous?.binding:null);
  if(!binding)throw Error('Connect this Service before enabling sync.');
  const next=configureServiceSync(previous,live,binding,{enabled:request.enabled,...request.intervalMinutes===undefined?{}:{intervalMinutes:request.intervalMinutes}},now());
  const scopeChanged=!previous||previous.binding!==binding||serviceSyncReadKey(previous.preset)!==serviceSyncReadKey(live);
  active.get(request.id)?.abort();
  store.transaction(()=>{
   store.invalidateRuntimeTasks(owner(request.id));
   if(scopeChanged){store.delete(PAGES,request.id);store.delete(SNAPSHOTS,request.id);}
   replace(store,JOBS,request.id,next);
  });changed();return {ok:true,id:next.id,check:next.check};
 }
 async function tick():Promise<boolean>{
  if(stopped)return false;
  const store=ledger();if(!store)return false;
  const eligible=jobs(store).filter(job=>!active.has(job.id)&&current(store,job));
  // An interrupted page is reclaimed by the existing lease machinery even before the ordinary interval is due.
  let job:ServiceSyncJob|undefined,permission:SyncAuthorization|null=null,run='';
  const candidates=[...eligible];
  while(candidates.length){
   const due=dueSourceCheck(candidates.map(item=>({...item.check,...item.check.lastStatus==='running'?{nextAt:0}:{}})),candidates.map(item=>item.id),now());
   const index=candidates.findIndex(item=>item.id===due?.id);if(index<0)break;
   const candidate=candidates.splice(index,1)[0],authorization=authorize(candidate.preset),attempt=crypto.randomUUID();
   if(authorization&&store.claimRuntimeTask(task(candidate.id),owner(candidate.id),'source-io',attempt)){job=candidate;permission=authorization;run=attempt;break;}
  }
  if(!job||!permission)return false;
  const started=serviceSyncStart(job,now()),controller=new AbortController();active.set(job.id,controller);
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   store.withRuntimeOutput(task(job.id),run,()=>replace(store,JOBS,job.id,started));changed();
   const checkpoint=store.value(PAGES,job.id) as ServiceSyncCheckpoint|undefined;
   const request={...servicePresetRead(job.preset),...checkpoint?.cursor?{cursor:checkpoint.cursor}:{}};
   const aborted=new Promise<never>((_,reject)=>{
    controller.signal.addEventListener('abort',()=>reject(Error('Service sync cancelled.')),{once:true});
    timeout=setTimeout(()=>{reject(Error('Service sync timed out.'));controller.abort();},timeoutMs);timeout.unref?.();
   });
   const page=serviceSyncPage(request,await Promise.race([read(request,controller.signal),aborted]));
   if(stopped||controller.signal.aborted||!current(store,job,permission.version))return false;
   const result=finishServiceSyncPage(started,checkpoint,page,now());
   store.withRuntimeOutput(task(job.id),run,()=>{
    replace(store,JOBS,job.id,result.job);
    if(result.checkpoint)replace(store,PAGES,job.id,{...result.checkpoint,provider:job.provider});
    else{store.delete(PAGES,job.id);replace(store,SNAPSHOTS,job.id,result.snapshot!);}
    if(!store.finishRuntimeTask(task(job.id),run,result.checkpoint?'yielded':'succeeded',0))throw Error('Service sync lease expired.');
   });changed();return true;
  }catch(error){
   // Raw provider errors may contain request headers or credentials: classify only, never log or persist the text.
   if(!stopped&&current(store,job,permission.version)){
    const failed=serviceSyncFailure(started,now(),error instanceof Error?error.message:'');
    store.transaction(()=>{
     if(store.finishRuntimeTask(task(job.id),run,'failed',0,failed.check.errorCode,failed.check.waitReason,failed.check.failures))replace(store,JOBS,job.id,failed);
    });changed();
   }
   return false;
  }finally{
   clearTimeout(timeout);
   if(active.get(job.id)===controller)active.delete(job.id);
  }
 }
 async function wake(){
  try{await tick();}catch{/* Next wake retries storage access; no provider text enters logs. */}
  if(stopped)return;
  let seconds=60;try{const store=ledger();if(store)seconds=nextSourceWake(jobs(store).map(job=>job.check),now());}catch{}
  timer=setTimeout(()=>void wake(),seconds*1000);timer.unref?.();
 }
 function notionContext(request:Row):Row {
  const store=db();
  const snapshots=jobs(store).filter(job=>job.provider==='notion'&&current(store,job)).flatMap(job=>{
   const snapshot=store.value(SNAPSHOTS,job.id) as ServiceSyncSnapshot|null;
   return snapshot?[snapshot]:[];
  });
  return readNotionContext(snapshots,request);
 }
 return {handle,tick,notionContext,start(){if(timer)return;stopped=false;timer=setTimeout(()=>void wake(),0);timer.unref?.();},stop(){stopped=true;clearTimeout(timer);timer=undefined;for(const controller of active.values())controller.abort();}};
}
