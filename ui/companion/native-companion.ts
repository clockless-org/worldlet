import {createCompanionAI} from './companion-ai.ts';
import {createModelStatusReader} from '../../platform/bridge/model-status.ts';
import {createAgentClient} from '../../platform/bridge/agent-client.ts';

// Native Fox uses the selected Agent adapter; cloud HTTPS remains for voice transport.
export function createNativeCompanion(call,{sample=false}={}){
 const publishModelStatus=status=>window.dispatchEvent(new CustomEvent('worldlet:model-status',{detail:status}));
 const statusReader=createModelStatusReader(()=>call('modelStatus'),publishModelStatus);
 const modelStatus=()=>statusReader.get();
 const refreshModel=()=>{statusReader.invalidate();void modelStatus().catch(()=>{});};
 window.addEventListener('worldlet:model-invalidated',()=>statusReader.invalidate());
 window.addEventListener('worldlet:model-changed',refreshModel);
 window.addEventListener('worldlet:model-refresh',refreshModel);
 void modelStatus().catch(()=>{});
 window.addEventListener('worldlet:fox-timing',(e: any)=>{void call('foxTiming',e.detail).catch(()=>{});});
 document.addEventListener('worldlet:world-revealed',()=>{
  const timings=window.worldletStartupTimings;if(!timings)return;
  const report:Record<string,unknown>={id:crypto.randomUUID(),kind:'startup',outcome:'complete'};
  for(const name of ['bundleStart','scene','firstFrame','revealed'])if(Number.isFinite(timings[name]))report[name+'Ms']=Math.max(0,Math.round(timings[name]-timings.boot));
  void call('foxTiming',report).catch(()=>{});
 },{once:true});
 const streams=new Map();window.worldletCloudStream=(id,event)=>streams.get(id)?.(event);
 function streamingRequest(payload,signal,action='cloudRequest'){
  const id=crypto.randomUUID(),encoder=new TextEncoder();let sink,settled=false,closed=false;
  return new Promise((resolve,reject)=>{
   const abort=()=>{if(closed)return;closed=true;call('cloudCancel',{streamId:id}).catch(()=>{});streams.delete(id);sink?.error(new DOMException('Aborted','AbortError'));if(!settled)reject(new DOMException('Aborted','AbortError'));};
   signal?.addEventListener('abort',abort,{once:true});
   streams.set(id,event=>{
    if(closed||signal?.aborted)return;
    if(event.type==='headers'){
     settled=true;resolve(new Response(new ReadableStream({start(controller){sink=controller;},cancel(){abort();}}),{status:event.status,headers:{'Content-Type':event.streaming?'application/x-ndjson':'application/json'}}));
    }else if(event.type==='line')sink?.enqueue(encoder.encode(event.line+'\n'));
   });
   call(action,{...payload,streamId:id}).then(()=>{if(!closed){closed=true;sink?.close();if(!settled)reject(Error('No stream received.'));}}).catch(error=>{if(!closed){closed=true;sink?.error(error);if(!settled)reject(error);}}).finally(()=>{streams.delete(id);signal?.removeEventListener('abort',abort);});
  });
 }
 const agent=createAgentClient(call,{sample});
 return createCompanionAI(call,{sample,nativeCall:call,runAgent:agent,async modelOptions(){
  const status=await modelStatus();
  if(!status.available)throw Error(status.reason||'Fox is unavailable right now.');
  return {provider:'agent',setup:!status.cloudAllowed};
 },async codex(operation,body,signal){
  if(sample)return {error:'Use the local practice coding tools in this world.'};
  signal?.throwIfAborted();
  const abort=()=>{call('codexCancel').catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{return await call('codexTask',{operation,...body});}finally{signal?.removeEventListener('abort',abort);}
 },async request(path,body,signal){
  signal?.throwIfAborted();let payload: any={path};
  if(body instanceof Blob){const bytes=new Uint8Array(await body.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));payload.audio=btoa(binary);}
  else if(body)payload.body=body;
  if(path==='/api/chat'&&body?.stream)return streamingRequest(payload,signal);
  const result=await call('cloudRequest',payload);signal?.throwIfAborted();
  return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});
 }});
}
