import {sourceReadAction} from '../applets/index.ts';
import {attentionFailure} from '../attention/index.ts';
const serviceCodes:Record<string,string>={service_paused:'worldlet_model_paused',service_credits:'worldlet_service_credits',update_required:'worldlet_update_required'};
/** Error text is classification input only. Persist the code, never the text. */
export function runtimeFailure(input:{message?:string;cancelled?:boolean;madeProgress?:boolean;now:number;failures:number}){
 const {now}=input,failures=Math.min(10,Math.max(0,input.failures||0)+1),message=input.message||'';
 if(!Number.isFinite(now))throw Error('Invalid runtime clock');
 if(/Attention delivery capacity reached/i.test(message))return {code:'backpressure',waitReason:'resource',nextAt:now+5,failures:input.failures||0};
 if(input.cancelled)return {code:'cancelled',waitReason:'retry_at',nextAt:now+5,failures:input.failures||0};
 // A newer revision of a record arrived mid-analysis: analyze that one soon; nothing failed.
 if(/Source changed during analysis/i.test(message))return {code:'source_changed',waitReason:'retry_at',nextAt:now+5,failures:input.failures||0};
 // A persisted code is reclassified after restart, so it must map back to the same wait.
 const service=attentionFailure(Object.hasOwn(serviceCodes,message)?serviceCodes[message]:message,now);
 // Included-model stops (allowance, pause, credits, outdated app) carry their own deadline; a short backoff only adds rejected calls.
 if(service.code!=='synthesis_failed')return {code:service.code,waitReason:'model_budget',nextAt:service.nextAt!,failures};
 const action=sourceReadAction({message});
 if(action)return {code:'authentication',waitReason:'authorization',nextAt:now+1800,failures};
 const incomplete=/Applet analysis did not cover every supplied source record/i.test(message);
 if(incomplete&&input.madeProgress)return {code:'incomplete_coverage',waitReason:'retry_at',nextAt:now+5,failures:0};
 const code=/invalid_grant|unauthorized|unauthenticated|sign.in required|\b401\b/i.test(message)?'authentication':/rate.limit|too many requests|\b429\b/i.test(message)?'rate_limit':/offline|network|name resolution|connection refused/i.test(message)?'offline':/timed out|timeout/i.test(message)?'timeout':incomplete?'incomplete_coverage':'operation_failed';
 const seconds=code==='authentication'?1800:Math.min(900,30*2**Math.min(failures-1,5));
 return {code,waitReason:code==='authentication'?'authorization':code==='rate_limit'?'rate_limit':code==='offline'?'network':'retry_at',nextAt:now+seconds,failures};
}
/** Fair, bounded admission. A delayed provider cannot block a ready one. */
export function analysisPlan(input:{candidates:{provider:string;pending:number}[];tasks:any[];now:number;foreground:boolean;independentLane?:boolean}){
 const {now}=input;
 const pending=input.candidates.filter(c=>c.pending>0);
 if(!pending.length)return {provider:null,waitSeconds:null};
 if(input.foreground&&!input.independentLane)return {provider:null,waitSeconds:1};
 const candidates=pending.map(c=>({provider:c.provider,task:input.tasks.find(t=>t.id===`applet:${c.provider}:analyze`)}));
 const ready=candidates.filter(c=>c.task?.enabled!==false&&(c.task?.nextAt||0)<=now&&!(c.task?.status==='running'&&(c.task?.leaseUntil||0)>now));
 // Every admitted slice counts, including partial work and failed attempts.
 // Otherwise a never-completed backfill can monopolize the analysis lane.
 const served=task=>task?.lastStartedAt??task?.lastSuccessAt??0;
 ready.sort((a,b)=>served(a.task)-served(b.task)||a.provider.localeCompare(b.provider));
 if(ready.length)return {provider:ready[0].provider,waitSeconds:0};
 const times=candidates.filter(c=>c.task?.enabled!==false).map(c=>Math.max(c.task?.nextAt||0,c.task?.status==='running'?c.task.leaseUntil||0:0));
 return {provider:null,waitSeconds:times.length?Math.min(60,Math.max(1,Math.min(...times)-now)):null};
}
/** Awake-clock delay: honor short page continuations without a busy retry loop. */
export function nextSourceWake(checks:{enabled?:boolean;nextAt?:number}[],now:number){
 const due=checks.filter(c=>c.enabled===true).map(c=>Number.isFinite(c.nextAt)?c.nextAt!:now);
 return due.length?Math.min(60,Math.max(5,Math.min(...due)-now)):60;
}
/** Bound source reads independently of model pools; one reader per provider. */
export function sourceReadProviders(providers:string[],active:string[]){
 return new Set(active).size>=2?[]:[...new Set(providers)].filter(p=>!active.includes(p));
}

/** Shared lease policy; hosts provide the Applet specification and clock only. */
export function runtimeTaskLease(input:{taskId:string;spec?:{syncTimeoutSeconds?:number;analysisTimeoutSeconds?:number}|null}):number {
 const timeout=input.taskId.endsWith(':check')?input.spec?.syncTimeoutSeconds??240:input.taskId.endsWith(':analyze')?input.spec?.analysisTimeoutSeconds??600:600;
 if(!Number.isInteger(timeout)||timeout<15||timeout>600)throw Error('Invalid Applet task timeout');
 return timeout+60;
}
/** Return only expired history IDs. Running work and other tasks are never pruned. */
export function runtimeRunPrune(input:{taskId:string;runs:{id:string;taskId:string;status:string;startedAt?:number}[]}):string[] {
 return input.runs.filter(r=>r.taskId===input.taskId&&r.status!=='running')
  .slice().sort((a,b)=>(b.startedAt??0)-(a.startedAt??0)||(a.id<b.id?-1:a.id>b.id?1:0))
  .slice(100).map(r=>r.id);
}
