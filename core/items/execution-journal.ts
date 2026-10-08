import type {ExecutionEvent,RuntimeTask,RuntimeRun} from '../../contracts/execution.ts';
/** One shared payload policy for native adapters. Never send journal payloads to analytics. */
export function journalPayload(value:unknown):unknown {
 let remaining=256_000;
 const secret=/password|passwd|secret|authorization|cookie|api.?key|private.?key|signing.?key|^key$|token$|^code$|access.?token|refresh.?token|id.?token|credential|device.?code|_analytics/i;
 const textSecret=/(["']?)(?<![A-Za-z0-9])((?:client_?|app_?)?secret|password|passwd|pwd|api[_-]?key|private[_-]?key|signing[_-]?key|(?:access|refresh|id|session|bearer|auth|included)[_-]?token|authorization|cookie|token)\1(\s*[:=]\s*)(["']?)(?!\[(?:AUTH )?REDACTED)[^\s"'&,;}\]]+\4/gi;
 const clean=(value:unknown,depth:number):unknown=>{
  if(depth>12||remaining<=0)return '[TRUNCATED]';
  if(typeof value==='string'){
   if(/^[\s]*[\[{]/.test(value)){try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object')return JSON.stringify(clean(parsed,depth+1));}catch{}}

   const text=value.replace(/\b(?:Bearer|Basic)\s+[^\s"<>]+/gi,'[AUTH REDACTED]').replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi,'$1[REDACTED]@').replace(/\bsk-[a-zA-Z0-9_-]{12,}/g,'[REDACTED]').replace(/([?&](?:token|key|code|secret|signature|access_token|refresh_token)=)[^&#\s]*/gi,'$1[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,'[REDACTED]').replace(/\bya29\.[\w.-]+|\b1\/\/0[\w-]{20,}/g,'[REDACTED]')
    // Credential fields written as text (key=value, key: value, Python or YAML dicts), not only as JSON keys.
    .replace(textSecret,(_,open,key,separator,quote)=>`${open}${key}${open}${separator}${quote}[REDACTED]${quote}`);
   const limit=Math.min(64_000,remaining);remaining-=Math.min(limit,text.length);
   return text.length>limit?text.slice(0,limit)+'[TRUNCATED]':text;
  }
  if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.slice(0,1000).map(v=>clean(v,depth+1)).concat(value.length>1000?['[TRUNCATED]']:[]);
  if(value&&typeof value==='object'){const entries=Object.entries(value);return {...Object.fromEntries(entries.slice(0,1000).map(([key,v])=>[key,secret.test(key)?'[REDACTED]':clean(v,depth+1)])),...(entries.length>1000?{__truncated__:true}:{})};}
  return null;
 };return clean(value,0);
}
const kinds=['run.started','run.succeeded','run.failed','run.cancelled','run.interrupted','harness.event','tool.requested','tool.result','tool.failed','model.requested','model.result','model.interrupted','ui.command'];
export function journalEntry(input:{id:string;runId:string;taskId?:string;at:number;kind:string;payload?:unknown;startedAt?:number}):{event:ExecutionEvent;payload:unknown;task?:RuntimeTask;run?:RuntimeRun} {
 if(!/^[a-zA-Z0-9_.-]{1,180}$/.test(input.id)||!kinds.includes(input.kind)||![input.id,input.runId,input.taskId??input.runId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(v))||!Number.isFinite(input.at)||input.at<0)throw Error('Invalid journal identity');
 const detail=input.payload as Record<string,any>|undefined;
 const result=detail?.payload??detail;
 if(input.kind==='tool.result'&&(result?.ok===false||result?.result?.error||result?.result?.isError||result?.result?.ok===false))input={...input,kind:'tool.failed'};
 const dimensions:Record<string,string|number>={};
 for(const key of ['model','provider'] as const)if(typeof result?.[key]==='string'&&result[key].length<=120)dimensions[key]=result[key];
 const usage=result?.usage;
 for(const [key,value] of Object.entries({inputTokens:usage?.input_tokens??usage?.prompt_tokens,outputTokens:usage?.output_tokens??usage?.completion_tokens,cacheReadTokens:usage?.cache_read_tokens,durationMs:result?.durationMs}))
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0)dimensions[key]=value;
 const taskId=input.taskId??'execution:'+input.runId;
 const startedAt=input.startedAt??input.at;
 if(!Number.isFinite(startedAt)||startedAt<0||startedAt>input.at)throw Error('Invalid execution time');
 const status=input.kind==='run.started'?'running':input.kind.slice(4);
 const state=input.kind.startsWith('run.')?{
  task:{id:taskId,ownerId:'agent',pool:'interactive' as const,enabled:status==='running',generation:0,token:1,status:status==='running'?'running':status==='succeeded'?'succeeded':status==='cancelled'||status==='interrupted'?'paused':'failed',nextAt:0,...(status==='running'?{runId:input.runId}:{})} as RuntimeTask,
  run:{id:input.runId,taskId,generation:0,token:1,status,startedAt,deadlineAt:0,...(status==='running'?{}:{finishedAt:input.at})} as RuntimeRun,
 }:{};
 return {...state,event:{version:1,id:input.id,at:input.at,kind:input.kind,actor:input.kind==='ui.command'?'user':'agent',taskId,runId:input.runId,data:{...dimensions,payloadRef:`execution/${input.id}.json`}},payload:journalPayload(input.payload)};
}
