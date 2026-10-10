/** Portable task claims. Hosts commit the returned task and run atomically. */
import type {TaskPool,RunStatus,RuntimeTask,RuntimeRun,TaskClaim} from '../../contracts/execution.ts';
export type {TaskPool,RunStatus,RuntimeTask,RuntimeRun,TaskClaim} from '../../contracts/execution.ts';
export function claimRuntimeTask(input:{task?:RuntimeTask;previousRun?:RuntimeRun;taskId:string;ownerId:string;pool:TaskPool;generation:number;runId:string;now:number;leaseSeconds:number}):TaskClaim|null {
 const {task:old,taskId,ownerId,pool,generation,runId,now,leaseSeconds}=input;
 if(!taskId||!ownerId||!runId||!Number.isFinite(now)||!Number.isInteger(generation)||generation<0||!Number.isFinite(leaseSeconds)||leaseSeconds<=0||leaseSeconds>3600||!['source-io','source-analysis','attention','interactive','browser'].includes(pool))throw Error('Invalid task claim');
 if(old&&(old.id!==taskId||old.ownerId!==ownerId))throw Error('Task ownership changed');
 if(old&&(!old.enabled||old.generation>generation||old.generation===generation&&(old.nextAt>now||old.status==='running'&&(old.leaseUntil||0)>now)))return null;
 const previous=input.previousRun;
 if(previous&&(!old||previous.id!==old.runId||previous.taskId!==old.id||previous.token!==old.token||previous.generation!==old.generation))throw Error('Previous run does not match task');
 if(previous?.id===runId)throw Error('A new claim requires a new run identity');
 const supersededRun:RuntimeRun|undefined=previous?.status==='running'?{...previous,status:'interrupted',finishedAt:now,errorCode:old!.generation===generation?'lease_expired':'generation_changed'}:undefined;
 const token=(old?.token||0)+1,deadlineAt=now+leaseSeconds;
 return {task:{...old,id:taskId,ownerId,pool,enabled:true,generation,token,status:'running',nextAt:now,lastStartedAt:now,runId,leaseUntil:deadlineAt,waitReason:undefined},run:{id:runId,taskId,generation,token,status:'running',startedAt:now,deadlineAt},...(supersededRun?{supersededRun}:{})};
}
export function finishRuntimeTask(input:{task:RuntimeTask;run:RuntimeRun;now:number;generation:number;status:Exclude<RunStatus,'running'>;nextAt:number;errorCode?:string;waitReason?:string;failures?:number}):TaskClaim|null {
 const {task,run,now,generation,status,nextAt,errorCode}=input;
 if(!Number.isFinite(now)||!Number.isFinite(nextAt)||!['succeeded','failed','cancelled','interrupted','yielded'].includes(status))throw Error('Invalid task outcome');
 if(task.id!==run.taskId||task.runId!==run.id||task.token!==run.token||task.generation!==generation||run.generation!==generation||task.status!=='running'||run.status!=='running')return null;
 if(['succeeded','yielded'].includes(status)&&(task.leaseUntil||0)<=now)return null;
 return {task:{...task,status:!task.enabled?'paused':status==='succeeded'?'succeeded':status==='yielded'?'queued':'waiting',nextAt,runId:undefined,leaseUntil:undefined,waitReason:status==='succeeded'?undefined:input.waitReason||'retry_at',failures:['succeeded','yielded'].includes(status)?0:input.failures??task.failures??0,...(status==='succeeded'?{lastSuccessAt:now}:{})},run:{...run,status,finishedAt:now,errorCode}};
}

/** Check immediately inside the same transaction as each output write. */
export function runtimeClaimCanWrite(input:{task:RuntimeTask;run:RuntimeRun;generation:number;now:number}):boolean {
 const {task,run,generation,now}=input;
 return Number.isFinite(now)&&task.enabled&&task.id===run.taskId&&task.runId===run.id&&task.token===run.token&&task.generation===generation&&run.generation===generation&&task.status==='running'&&run.status==='running'&&(task.leaseUntil||0)>now&&run.deadlineAt>now;
}

/** Pause/re-enable preserves checkpoints and retry deadlines, but revokes old writers. */
export function setRuntimeTaskEnabled(task:RuntimeTask,enabled:boolean):RuntimeTask {
 if(typeof enabled!=='boolean')throw Error('Invalid task enable state');
 if(task.enabled===enabled)return {...task};
 return {...task,enabled,status:enabled?'queued':'paused',token:task.token+1,runId:undefined,leaseUntil:undefined};
}

/** An explicit source configuration replaces its due time, not its current claim.
 * Ordinary pause/resume callers continue to preserve retry deadlines.
 */
export function configureRuntimeSource(task:RuntimeTask,check:{provider:string;enabled:boolean;nextAt:number}):RuntimeTask {
 if(task.pool!=='source-io'||task.ownerId!==check.provider||task.enabled!==check.enabled||!Number.isFinite(check.nextAt))throw Error('Invalid source task configuration');
 return {...task,nextAt:check.nextAt};
}
