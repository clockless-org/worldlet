// One allowlist for both native hosts. Never accept prompts, URLs or raw errors.
const fields=new Set(["nativeStartingMs","nativeWaitingMs","nativeModelMs","nativeConnectionsMs","bundleStartMs","sceneMs","firstFrameMs","revealedMs","unclosedModelMs","unclosedMs","steerAcceptedMs","configLockMs","bootstrapMs","chatLockMs","connectionsMs","sessionMs","prompt_tokens","dequeuedMs","prepareStartedMs","modelStatusMs","contextReadyMs","localActionMs","bridgeSentMs","bridgeReturnedMs","firstDeltaMs","firstRenderedMs","firstPaintMs","completeMs","paintMs","prepareMs","firstTextMs","totalMs","modelMs","toolsMs","firstReasoningMs","queueMs","workerMs","launchMs","firstWorkerEventMs","nativeEventsMs","nativeQueueMs","nativeTotalMs","contextChars","startMs","durationMs","endMs","firstChunkMs","inputChars","toolCount","input_tokens","output_tokens","reasoning_tokens","cache_read_tokens"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function numeric(value){
 const out:Record<string,unknown>={};
 for(const [key,n]of Object.entries(value||{}))if(fields.has(key)&&typeof n==='number'&&Number.isFinite(n)&&n>=0)out[key]=n;
 return out;
}
export function foxTiming(value){
 if(!value||typeof value.id!=='string'||!uuid.test(value.id))return null;
 const out:Record<string,unknown>={...numeric(value),id:value.id};
 if(['startup','conversation'].includes(value.kind))out.kind=value.kind;
 if(typeof value.at==='string'&&/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(value.at)&&value.at.length<=40&&Number.isFinite(Date.parse(value.at)))out.at=value.at;
 if(typeof value.parentId==='string'&&uuid.test(value.parentId))out.parentId=value.parentId;
 if(['running','complete','error','cancelled'].includes(value.outcome))out.outcome=value.outcome;
 if(typeof value.lastStage==='string'&&fields.has(value.lastStage))out.lastStage=value.lastStage;
 if(Array.isArray(value.modelCalls))out.modelCalls=value.modelCalls.slice(0,40).map(numeric);
 return out;
}

/** Coarse buckets of a timing, the only form a timing leaves the device in (`duration_bucket` and its siblings). */
export const TIMING_BUCKETS=['under_1s','1_5s','5_15s','15_60s','1_5m','5_15m','over_15m'] as const;
export function timingBucket(ms:unknown):string {
 if(typeof ms!=='number'||!Number.isFinite(ms)||ms<0)return '';
 return ms<1000?'under_1s':ms<5000?'1_5s':ms<15000?'5_15s':ms<60000?'15_60s':ms<300000?'1_5m':ms<900000?'5_15m':'over_15m';
}
/** How long a prepared update waited for Update before a launch ran it (`update_applied`). */
export const UPDATE_WAIT_BUCKETS=['under_1h','1_24h','1_7d','over_7d'] as const;
export function updateWaitBucket(ms:unknown):string {
 if(typeof ms!=='number'||!Number.isFinite(ms)||ms<0)return '';
 return ms<3_600_000?'under_1h':ms<86_400_000?'1_24h':ms<604_800_000?'1_7d':'over_7d';
}
/** The PostHog event for a finished Fox turn or app start, from a row `foxTiming` already allowlisted: buckets and
 * the outcome only. A turn still running, a steering message folded into its parent, and a row with no total send none. */
export function foxTimingEvent(row:Record<string,unknown>|null):{event:string,duration:string,dimensions:Record<string,string>}|null {
 if(!row)return null;
 const bucket=(key:string)=>timingBucket(row[key]);
 if(row.kind==='startup'){
  const duration=bucket('revealedMs');
  const frame=bucket('firstFrameMs');
  return duration?{event:'app_startup_timing',duration,dimensions:frame?{first_frame_bucket:frame}:{}}:null;
 }
 if(!['complete','error','cancelled'].includes(row.outcome as string)||row.parentId)return null;
 const duration=bucket('completeMs');
 if(!duration)return null;
 const dimensions:Record<string,string>={timing_outcome:row.outcome as string};
 for(const [key,name] of [['firstTextMs','first_text_bucket'],['modelMs','model_bucket'],['toolsMs','tools_bucket']]){const value=bucket(key);if(value)dimensions[name]=value;}
 return {event:'fox_timing',duration,dimensions};
}
