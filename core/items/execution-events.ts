import type {ExecutionEvent,TaskClaim} from '../../contracts/execution.ts';
import {worldEvent} from './world-events.ts';
const identity=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\x00-\x1f]/.test(v);
/** Closed envelope validation; only host-projected scalar metadata is admitted. */
export function executionEvent(value:unknown):ExecutionEvent {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid execution event');
 const e=value as ExecutionEvent;
 const fields=['version','id','at','kind','actor','requestId','taskId','runId','appletId','data','observedAt'];
 if(Object.keys(e).some(k=>!fields.includes(k))||e.version!==1||!identity(e.id)||!Number.isFinite(e.at)||e.at<0||!identity(e.kind)||!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(e.kind)||!['user','agent','scheduler','platform'].includes(e.actor)||e.observedAt!==undefined&&(!Number.isFinite(e.observedAt)||e.observedAt<0))throw Error('Invalid execution envelope');
 for(const key of ['requestId','taskId','runId','appletId'] as const)if(e[key]!==undefined&&!identity(e[key]))throw Error('Invalid execution reference');
 if(!e.data||typeof e.data!=='object'||Array.isArray(e.data))throw Error('Invalid execution metadata');
 const allowed=['model','inputTokens','outputTokens','cacheReadTokens','durationMs','commandId','payloadRef','action','phase','status','ownerId','pool','generation','token','errorCode','operation','provider','moduleId','moduleKey','region','enabled','kind','itemId','sourceId','screen','preset','platform','genre','monitor','mode','level','place','id'];
 for(const [key,v] of Object.entries(e.data))if(!allowed.includes(key)||!(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=500))throw Error('Invalid execution metadata field');
 if(['run.started','run.succeeded','run.failed','run.cancelled','run.interrupted','harness.event','tool.requested','tool.result','tool.failed','model.requested','model.result','model.interrupted','ui.command'].includes(e.kind)){
  if(!e.runId||!e.taskId||typeof e.data.payloadRef!=='string'||!/^execution\/[a-zA-Z0-9_.:-]{1,180}\.json$/.test(e.data.payloadRef))throw Error('Invalid journal event');
 } else if(e.kind==='world.action') {
  if(!e.requestId||typeof e.data.action!=='string'||!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(e.data.action)||!['requested','succeeded','failed'].includes(String(e.data.phase)))throw Error('Invalid action event');
 } else {
  const statuses=['running','succeeded','failed','cancelled','interrupted','yielded'];
  if(!e.taskId||!e.runId||!statuses.some(status=>e.kind==='task.'+status&&e.data.status===status))throw Error('Invalid task event');
 }
 return {...e,data:{...e.data}};
}
/** Preserve meaningful task transitions even after runtime-run retention removes rows. */
export function taskExecutionEvents(claim:TaskClaim):ExecutionEvent[] {
 if(!claim?.task||!claim.run||claim.run.taskId!==claim.task.id||claim.run.generation!==claim.task.generation||claim.run.token!==claim.task.token)throw Error('Mismatched task execution');
 if(claim.supersededRun&&claim.supersededRun.taskId!==claim.task.id)throw Error('Mismatched superseded execution');
 return [...(claim.supersededRun?[claim.supersededRun]:[]),claim.run].map(run=>executionEvent({
  version:1,id:`${run.id}:${run.status}`,at:run.finishedAt??run.startedAt,kind:`task.${run.status}`,
  actor:claim.task.pool==='interactive'||claim.task.pool==='browser'?'agent':'scheduler',
  taskId:claim.task.id,runId:run.id,
  data:{status:run.status,ownerId:claim.task.ownerId,pool:claim.task.pool,generation:run.generation,token:run.token,
   ...(run.errorCode&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(run.errorCode)?{errorCode:run.errorCode}:{})},
 }));
}
/** Caller supplies correlation and clock; request bodies are projected, never copied. */
export function worldActionEvent(input:{action:string;body:Record<string,unknown>;requestId:string;at:number;phase:'requested'|'succeeded'|'failed';actor?:ExecutionEvent['actor']}):ExecutionEvent|null {
 const projected=worldEvent(input.action,input.body);
 if(!projected)return null;
 if(!['requested','succeeded','failed'].includes(input.phase))throw Error('Invalid action phase');
 return executionEvent({version:1,id:input.requestId+':'+input.phase,at:input.at,kind:'world.action',actor:input.actor??'user',requestId:input.requestId,
  ...(projected.applet?{appletId:projected.applet}:{}),data:{...projected.body,action:input.action,phase:input.phase}});
}
