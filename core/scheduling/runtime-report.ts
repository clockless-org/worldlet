import {attentionAdmission} from './attention-budget.ts';
/** Local task inspector: explicit allowlist, never source bodies or raw error strings. */
const statuses=new Set(['queued','running','waiting','succeeded','failed','paused']);
const waits=new Set(['resource','network','rate_limit','model_budget','authorization','approval','retry_at']);
const runStatuses=new Set(['running','succeeded','failed','cancelled','interrupted','yielded']);
const errors=new Set(['offline','timeout','authentication','rate_limit','model_allowance','service_paused','service_credits','update_required','backpressure','operation_failed','cancelled','paused','process_interrupted','lease_expired','generation_changed','unfinished','unverified_output','incomplete_coverage']);
const token=(v:unknown)=>typeof v==='string'&&/^[a-z0-9:_-]{1,120}$/.test(v)?v:'';
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):0;
const time=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function runtimeTaskReport(input){
 const tasks=Array.isArray(input.tasks)?input.tasks:[],checks=Array.isArray(input.checks)?input.checks:[],deliveries=Array.isArray(input.deliveries)?input.deliveries:[];
 const rows=[...tasks],add=task=>{if(!rows.some(row=>row.id===task.id))rows.push(task);};
 for(const check of checks)if(token(check.provider))add({id:`applet:${check.provider}:check`,ownerId:check.provider,pool:'source-io',status:'queued'});
 for(const entry of input.analysis||[])if(token(entry.provider)&&count(entry.pending)>0)add({id:`applet:${entry.provider}:analyze`,ownerId:entry.provider,pool:'source-analysis',status:'queued'});
 if(deliveries.some(row=>row.consumerId==='attention:center'&&row.status==='pending'))add({id:'attention:center',ownerId:'attention-center',pool:'attention',status:'queued'});
 return {supported:true,rows:rows.slice(0,200).map(task=>{
  const owner=token(task.ownerId),center=owner==='attention-center',check=checks.find(row=>row.provider===owner),cursor=(input.cursors||[]).find(row=>row.id===owner);
  const pending=deliveries.filter(row=>row.consumerId==='attention:center'&&(center||row.provider===owner)&&row.status==='pending');
  const oldest=pending.map(row=>time(row.createdAt)).filter(value=>value!==null);
  const oldestAt=oldest.length?Math.min(...oldest):null;
  const runs=(Array.isArray(input.runs)?input.runs:[]).filter(run=>run.taskId===task.id&&time(run.startedAt)!==null);
  const run=task.status==='running'?runs.find(run=>run.id===task.runId):runs.sort((a,b)=>b.startedAt-a.startedAt)[0];
  const started=time(run?.startedAt),finished=time(run?.finishedAt),now=time(input.now);
  const end=run?.status==='running'?now:finished;
  const execution=run&&runStatuses.has(run.status)?{status:run.status,startedAt:started,finishedAt:finished,
   durationSeconds:started!==null&&end!==null&&end>=started?end-started:null,
   deadlineRemainingSeconds:run.status==='running'&&time(run.deadlineAt)!==null&&now!==null?Math.max(0,run.deadlineAt-now):null,
   errorCode:errors.has(run.errorCode)?run.errorCode:null}:null;
  const admission=center&&now!==null?attentionAdmission(input.budget||{},now):null;
  const centerWaiting=center&&pending.length>0&&task.status!=='running'&&task.status!=='paused'&&admission&&!admission.ready;
  const analysis=(input.analysis||[]).find(row=>row.provider===owner),pendingAnalysis=count(analysis?.pending),highWaterMark=count(analysis?.highWaterMark);
  const backpressured=task.id?.endsWith(':check')&&check?.enabled!==false&&!['running','paused'].includes(task.status)&&highWaterMark>0&&pendingAnalysis>=highWaterMark;
  return {execution,consumerBudget:admission?{attempts:admission.attempts,limit:admission.limit}:null,pendingAnalysis,analysisHighWaterMark:highWaterMark||null,
   oldestPendingSeconds:oldestAt!==null&&time(input.now)!==null?Math.max(0,input.now-oldestAt):null,
   id:token(task.id),owner,status:check?.enabled===false?'paused':centerWaiting||backpressured?'waiting':statuses.has(task.status)?task.status:'waiting',waitReason:backpressured?'analysis_backlog':centerWaiting?(input.budget?.lastErrorCode==='model_allowance'?'model_budget':admission.waitReason):waits.has(task.waitReason)?task.waitReason:null,
   pool:token(task.pool),lastSuccessAt:time(task.lastSuccessAt),nextAt:backpressured?null:time(center?admission?.nextAt??input.budget?.nextAt:task.id?.endsWith(':check')?check?.nextAt:task.nextAt),
   scanned:Number.isSafeInteger(cursor?.scanned)&&cursor.scanned>=0?cursor.scanned:null,
   pendingDeliveries:pending.length,
   quarantinedDeliveries:deliveries.filter(row=>(center?row.consumerId==='attention:center':row.provider===owner)&&row.status==='quarantined').length,
   runId:typeof task.runId==='string'&&/^[a-f0-9-]{36}$/i.test(task.runId)?task.runId:null,
   controllable:!!check&&owner!=='attention-center',enabled:check?.enabled!==false};
 }).filter(row=>row.id&&row.owner),scope:'Local task states and counts only. No message contents or account details.'};
}
