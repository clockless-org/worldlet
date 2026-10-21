import crypto from 'node:crypto';
import {core} from '../core.ts';
import {digest,WorldletError} from '../files.ts';
import type {WorldLedger} from './ledger.ts';

// Runtime tasks, operations and deliveries, execution receipts and browser receipts: the `state.runtime-*`, `state.checks`,
// `state.runs` and `state.browser-actions` buckets of `entries`. Claims, leases and settlement decisions live in shared Core.
type Row=Record<string,any>;
export class Cancelled extends Error {constructor(){super('Cancelled.');}}
const now=()=>Date.now()/1000;
const RUNTIME_BUCKETS=['runtime-tasks','runtime-runs','runtime-generations','runtime-deliveries','runtime-operations'];
const RUNS_PER_PROVIDER=100;
const generation=(ledger:WorldLedger,owner:string)=>Number(ledger.find('runtime-generations',owner)?.generation??0);
function recordTaskExecution(ledger:WorldLedger,claim:Row){for(const event of core<Row[]>('taskExecutionEvents',claim))ledger.append(event,event.taskId??'');}
function saveDeliveries(ledger:WorldLedger,rows:Row[]){
 for(const row of ledger.records('runtime-deliveries'))if(typeof row.id==='string')ledger.deleteRuntimeRecord('runtime-deliveries',row.id);
 for(const row of rows)if(typeof row.id==='string')ledger.put('runtime-deliveries',row.id,row);
}

export class TaskTables {
 deleteRuntimeRecord(this:WorldLedger,bucket:string,id:string){if(!RUNTIME_BUCKETS.includes(bucket))throw new WorldletError('Invalid runtime record.');this.delete(bucket,id);}

 // Execution bookkeeping -----------------------------------------------------------------
 /** Check and run rows keep only their current revision; each provider keeps its newest receipts. */
 pruneExecution(this:WorldLedger){
  for(const bucket of ['checks','runs'])this.run('DELETE FROM entries WHERE kind=? AND seq NOT IN (SELECT MAX(seq) FROM entries WHERE kind=? GROUP BY key)','state.'+bucket,'state.'+bucket);
  const groups=new Map<string,Row[]>();
  for(const run of this.records('runs')){const key=run.provider??'';groups.set(key,[...(groups.get(key)||[]),run]);}
  for(const runs of groups.values()){
   if(runs.length<=RUNS_PER_PROVIDER)continue;
   for(const run of runs.sort((a,b)=>(b.startedAt??0)-(a.startedAt??0)).slice(RUNS_PER_PROVIDER))if(typeof run.id==='string'&&run.status!=='running')this.delete('runs',run.id);
  }
 }
 recoverInterruptedChecks(this:WorldLedger){
  // Each runtime settlement owns its transaction; they are idempotent, so recovery can resume.
  this.recoverRuntimeTasks();
  this.recoverRuntimeOperations();
  this.transaction(()=>{
   for(const bucket of ['checks','runs']){
    const key=bucket==='checks'?'lastStatus':'status';
    for(const row of this.records(bucket)){
     if(row[key]!=='running'||typeof row.id!=='string')continue;
     const next={...row,[key]:'error',error:'The previous check was interrupted. Saved items are kept.'};
     if(bucket==='checks'&&row.enabled===true)next.nextAt=now()+60;
     if(bucket==='runs'){next.finishedAt=now();next.errorCode='interrupted';}
     this.put(bucket,row.id,next);
    }
   }
   const budget=this.records('attention-budget')[0];
   if(budget?.lastStatus==='running'){this.delete('attention-budget','current');this.put('attention-budget','current',{...budget,lastStatus:'error',lastErrorCode:'interrupted',nextAt:now()+60});}
  });
 }

 // Runtime tasks (claims, leases and settlement decisions live in shared Core) -------------
 claimRuntimeTask(this:WorldLedger,taskID:string,owner:string,pool:string,runID:string){
  return this.transaction(()=>{
   const old=this.find('runtime-tasks',taskID);
   const lease=core<number>('runtimeTaskLease',{taskId:taskID,spec:this.runtimeSpec(owner)??{}});
   if(typeof lease!=='number')throw new WorldletError('Invalid runtime lease policy');
   const input:Row={taskId:taskID,ownerId:owner,pool,generation:generation(this,owner),runId:runID,now:now(),leaseSeconds:lease};
   if(old)input.task=old;
   if(typeof old?.runId==='string')input.previousRun=this.find('runtime-runs',old.runId);
   const claim=core('runtimeTaskClaim',input);
   if(!claim?.task||!claim.run)return false;
   if(typeof claim.supersededRun?.id==='string'){this.deleteRuntimeRecord('runtime-runs',claim.supersededRun.id);this.put('runtime-runs',claim.supersededRun.id,claim.supersededRun);}
   this.deleteRuntimeRecord('runtime-tasks',taskID);this.put('runtime-tasks',taskID,claim.task);
   this.put('runtime-runs',runID,claim.run);
   recordTaskExecution(this,claim);
   return true;
  });
 }
 finishRuntimeTask(this:WorldLedger,taskID:string,runID:string,status:string,nextAt:number,errorCode?:string|null,waitReason?:string|null,failures?:number|null){
  return this.transaction(()=>{
   const task=this.find('runtime-tasks',taskID),run=this.find('runtime-runs',runID);
   if(!task||typeof task.ownerId!=='string'||!run)return false;
   const input:Row={task,run,now:now(),generation:generation(this,task.ownerId),status,nextAt};
   if(errorCode!=null)input.errorCode=errorCode;if(waitReason!=null)input.waitReason=waitReason;if(failures!=null)input.failures=failures;
   const result=core('runtimeTaskFinish',input);
   if(!result?.task||!result.run)return false;
   this.deleteRuntimeRecord('runtime-tasks',taskID);this.put('runtime-tasks',taskID,result.task);
   this.deleteRuntimeRecord('runtime-runs',runID);this.put('runtime-runs',runID,result.run);
   recordTaskExecution(this,result);
   for(const id of core<string[]>('runtimeRunPrune',{taskId:taskID,runs:this.records('runtime-runs')}))this.deleteRuntimeRecord('runtime-runs',id);
   return true;
  });
 }
 /** Claim validation and the writes in `body` share one transaction; `body` must be synchronous. */
 withRuntimeOutput<T>(this:WorldLedger,taskID:string,runID:string,body:()=>T):T {
  return this.transaction(()=>{
   const task=this.find('runtime-tasks',taskID),run=this.find('runtime-runs',runID);
   if(!task||typeof task.ownerId!=='string'||!run)throw new Cancelled();
   if(core('runtimeClaimCanWrite',{task,run,generation:generation(this,task.ownerId),now:now()})!==true)throw new Cancelled();
   return body();
  });
 }
 setRuntimeTasksEnabled(this:WorldLedger,owner:string,enabled:boolean){
  this.transaction(()=>{
   for(let task of this.records('runtime-tasks').filter(row=>row.ownerId===owner)){
    if(typeof task.id!=='string')continue;
    if(!enabled&&task.status==='running'&&typeof task.runId==='string'){
     this.finishRuntimeTask(task.id,task.runId,'cancelled',task.nextAt??0,'paused');
     const receipt=this.records('runs').find(row=>row.id===task.runId&&row.status==='running');
     if(receipt)this.put('runs',task.runId,{...receipt,status:'cancelled',errorCode:'paused',finishedAt:now()});
     task=this.find('runtime-tasks',task.id)??task;
    }
    const updated=core('runtimeTaskEnabled',{task,enabled});
    this.deleteRuntimeRecord('runtime-tasks',task.id);this.put('runtime-tasks',task.id,updated);
   }
  });
 }
 invalidateRuntimeTasks(this:WorldLedger,owner:string){
  this.transaction(()=>{
   for(const task of this.records('runtime-tasks'))if(task.ownerId===owner&&task.status==='running'&&typeof task.id==='string'&&typeof task.runId==='string')this.finishRuntimeTask(task.id,task.runId,'interrupted',0,'configuration_changed');
   const next=generation(this,owner)+1;
   this.deleteRuntimeRecord('runtime-generations',owner);this.put('runtime-generations',owner,{id:owner,generation:next});
   const taskIDs=new Set(this.records('runtime-tasks').filter(row=>row.ownerId===owner).map(row=>row.id).filter(Boolean));
   for(const id of taskIDs)this.deleteRuntimeRecord('runtime-tasks',id);
   for(const row of this.records('runtime-runs'))if(taskIDs.has(row.taskId)&&typeof row.id==='string')this.deleteRuntimeRecord('runtime-runs',row.id);
  });
 }
 configureRuntimeSource(this:WorldLedger,check:Row){
  if(typeof check.provider!=='string')throw new WorldletError('Missing source owner.');
  const id='applet:'+check.provider+':check';
  this.transaction(()=>{const task=this.find('runtime-tasks',id);if(!task)return;const next=core('runtimeSourceConfigure',{task,check});this.deleteRuntimeRecord('runtime-tasks',id);this.put('runtime-tasks',id,next);});
 }
 recoverRuntimeTasks(this:WorldLedger){for(const row of this.records('runtime-tasks'))if(row.status==='running'&&typeof row.id==='string'&&typeof row.runId==='string')this.finishRuntimeTask(row.id,row.runId,'interrupted',now(),'process_interrupted');}

 // Runtime operations (external writes with uncertain outcomes) ----------------------------
 prepareRuntimeOperation(this:WorldLedger,id:string,owner:string,command:string,scope:string){
  return this.transaction(()=>{
   const existing=this.find('runtime-operations',id);
   const input:Row={id,ownerId:owner,command,scope,reference:id,now:now()};if(existing)input.existing=existing;
   const row=core('runtimeOperationPrepare',input);
   if(!existing)this.put('runtime-operations',id,row);
   return row;
  });
 }
 transitionRuntimeOperation(this:WorldLedger,id:string,event:string){
  return this.transaction(()=>{
   const row=this.find('runtime-operations',id);if(!row)throw new WorldletError('Operation is unavailable.');
   const next=core('runtimeOperationTransition',{operation:row,event,now:now()});
   this.deleteRuntimeRecord('runtime-operations',id);this.put('runtime-operations',id,next);
   return next;
  });
 }
 recoverRuntimeOperations(this:WorldLedger){this.transaction(()=>{for(const row of this.records('runtime-operations'))if(row.status==='submitted'&&typeof row.id==='string')this.transitionRuntimeOperation(row.id,'uncertain');});}

 // Runtime deliveries ----------------------------------------------------------------------
 runtimeSubscriptions(this:WorldLedger):Row[] {
  const rows=this.records('runtime-subscriptions');
  if(!rows.some(row=>row.consumerId==='attention:center'))rows.push({consumerId:'attention:center',providers:['*'],enabled:true});
  return core('runtimeSubscriptions',{rows});
 }
 subscribedAttentionProviders(this:WorldLedger,providers:string[]){
  const sub=this.runtimeSubscriptions().find(row=>row.consumerId==='attention:center');
  if(sub?.enabled!==true)return [];
  const selected:string[]=sub.providers||[];
  return providers.filter(p=>selected.includes('*')||selected.includes(p));
 }
 attentionInputBudget(this:WorldLedger){
  const budget={...this.attentionBudget()};
  const rows=this.records('runtime-deliveries').filter(row=>row.consumerId==='attention:center');
  if(rows.length)budget.seen=Object.fromEntries(rows.filter(row=>row.status==='acknowledged'&&typeof row.entityId==='string'&&(typeof row.revision==='number'||typeof row.revision==='string')).map(row=>[row.entityId,row.revision]));
  return budget;
 }
 /** Facts and delivery metadata share a commit; payloads stay in the bounded context. */
 publishAttentionFacts(this:WorldLedger,facts:Row[]){
  this.transaction(()=>{
   const budget=this.attentionBudget();
   const rows=core<Row[]>('runtimeDeliveries',{rows:this.records('runtime-deliveries'),facts,seen:budget.seen??{},subscriptions:this.runtimeSubscriptions(),now:now()});
   this.replaceAttentionCache('attention-context',{id:'current',facts});
   saveDeliveries(this,rows);
  });
 }
 acknowledgeRuntimeDeliveries(this:WorldLedger,consumer:string,seeds:Row[]){
  this.transaction(()=>{
   if(!this.runtimeSubscriptions().some(row=>row.consumerId===consumer&&row.enabled===true))throw new Cancelled();
   saveDeliveries(this,core('runtimeDeliveriesAck',{rows:this.records('runtime-deliveries'),seeds,consumerId:consumer,now:now()}));
  });
 }
 acknowledgeAttentionDeliveries(this:WorldLedger,seeds:Row[]){this.acknowledgeRuntimeDeliveries('attention:center',seeds);}
 failAttentionDeliveries(this:WorldLedger,seeds:Row[],code:string,isolated:boolean){saveDeliveries(this,core('runtimeDeliveriesFail',{rows:this.records('runtime-deliveries'),seeds,consumerId:'attention:center',code,isolated}));}
 retryAttentionQuarantine(this:WorldLedger){
  this.transaction(()=>{
   const rows=core<Row[]>('runtimeDeliveriesRetry',{rows:this.records('runtime-deliveries'),consumerId:'attention:center'});
   this.invalidateRuntimeTasks('attention-center');
   saveDeliveries(this,rows);
   this.replaceAttentionCache('attention-budget',{...this.attentionBudget(),nextAt:0,failures:0});
  });
 }

 // Browser receipts ----------------------------------------------------------------------
 beginBrowserAction(this:WorldLedger,label:string,url:URL,taskID:string|undefined,attemptKey:string){
  return this.transaction(()=>{
   const id=crypto.randomUUID().toUpperCase();
   const input:Row={id,label,origin:'https://'+url.hostname,attemptKey,items:this.records('items'),receipts:this.records('browser-actions'),now:now()};
   if(taskID)input.taskID=taskID;
   const row=core('browserReceiptBegin',input);
   this.prepareRuntimeOperation(id,'browser','browser.submit',digest(row.origin??''));
   this.transitionRuntimeOperation(id,'submit');
   this.put('browser-actions',id,row);return row;
  });
 }
 browserAction(this:WorldLedger,id:string){const row=this.find('browser-actions',id);if(!row)throw new WorldletError('This browser action is no longer available.');return row;}
 observeBrowserAction(this:WorldLedger,id:string,url:string){
  return this.transaction(()=>{
   let origin='';try{const value=new URL(url);if(value.protocol==='https:')origin='https://'+value.hostname;}catch{}
   const row=core('browserReceiptObserve',{receipt:this.browserAction(id),origin,now:now()});
   this.put('browser-actions',id,row);return row;
  });
 }
 resolveBrowserAction(this:WorldLedger,id:string,done:boolean){
  return this.transaction(()=>{
   const decision=core('browserReceiptResolve',{receipt:this.browserAction(id),done,items:this.records('items'),now:now()});
   if(!decision?.receipt||typeof decision.event!=='string')throw new WorldletError('Invalid browser confirmation.');
   const row={...decision.receipt};
   // The receipt is Fox's own browser action, so the task is one Fox completed.
   if(typeof decision.completeTaskID==='string')this.update(decision.completeTaskID,'done',undefined,false,'fox');
   const operation=this.prepareRuntimeOperation(id,'browser','browser.submit',digest(row.origin??''));
   if(operation.status==='prepared')this.transitionRuntimeOperation(id,'submit');
   this.transitionRuntimeOperation(id,decision.event);
   row.operationId=id;this.put('browser-actions',id,row);return row;
  });
 }
}
