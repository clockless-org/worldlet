/** Portable execution entities. Times are Unix seconds; IDs are host-owned. */
export type TaskPool='source-io'|'source-analysis'|'attention'|'interactive'|'browser';
export type RunStatus='running'|'succeeded'|'failed'|'cancelled'|'interrupted'|'yielded';
export interface RuntimeTask {
 id:string;ownerId:string;pool:TaskPool;enabled:boolean;generation:number;token:number;
 status:'queued'|'running'|'waiting'|'succeeded'|'failed'|'paused';nextAt:number;
 runId?:string;leaseUntil?:number;waitReason?:string;failures?:number;lastSuccessAt?:number;lastStartedAt?:number;
}
export interface RuntimeRun {
 id:string;taskId:string;generation:number;token:number;status:RunStatus;startedAt:number;
 deadlineAt:number;finishedAt?:number;errorCode?:string;
}
export interface TaskClaim {task:RuntimeTask;run:RuntimeRun;supersededRun?:RuntimeRun}

/** Local semantic journal; never a raw CDP/model payload or execution authority. */
export interface ExecutionEvent {
 version:1; id:string; at:number; kind:string;
 actor:'user'|'agent'|'scheduler'|'platform';
 requestId?:string; taskId?:string; runId?:string; appletId?:string;
 data:Record<string,string|number|boolean>;
 /** Local save time added by worldEventAppend; `at` stays the original event time. */
 observedAt?:number;
}
