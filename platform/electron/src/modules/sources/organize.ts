import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {core} from '../../core.ts';
import {readJSON,writeJSON,WorldletError,errorMessage} from '../../files.ts';
import type {AgentRuntime} from '../../host/services.ts';
import type {SourcesContext} from './context.ts';
import type {Row} from '../../host/types.ts';
// Organize local sources into the world (Mac Store.generate + ContextDerivation). Models
// extract meaning chunk by chunk; the shared compiler owns the layout coordinates.
const THEMES=['home','library','studio','factory','cafe','family','calendar','finance','archive','rocket','health','vision'];
const CHUNK_FORMAT='hermes-activities-v2';
class Cancelled extends Error {constructor(){super('Cancelled.');}}

export function createOrganizer(ctx:SourcesContext){
 const {store}=ctx;
 let running:Promise<void>|null=null,cancelled=false,client:AgentRuntime|null=null,lastModel='';
 const defaultModel=()=>ctx.agentId()+'-selected';
 const check=()=>{if(cancelled)throw new Cancelled();};

 /** Extraction has no tools or memory, and its own home, so a batch cannot occupy Fox's profile. */
 async function analyze(data:string):Promise<string> {
  if(Buffer.byteLength(data)>100_000)throw new WorldletError('Invalid context processing request.');
  if(!store.state.cloudConsent)throw new WorldletError('Ask Fox to allow selected context before organizing these sources. No context was sent.');
  const agent=ctx.agent();
  client??=agent.make();
  const result=await client.run({action:'chat',mode:'context_analysis',text:data,session:'derive-'+crypto.randomUUID().toUpperCase(),_background:true},agent.isolatedHome('derivation'));
  check();
  if(typeof result?.message!=='string')throw new WorldletError('Context processing did not finish. Completed chunks are kept; try again.');
  let value:unknown;try{value=JSON.parse(result.message);}catch{}
  if(Buffer.byteLength(result.message)>100_000||!value||typeof value!=='object'||Array.isArray(value))throw new WorldletError('The model returned invalid structured data. Your world is unchanged.');
  lastModel=typeof result.model==='string'?result.model:defaultModel();
  return result.message;
 }
 const validate=(items:Row[],chunk:Row,text:string)=>core<Row[]>('sourceAnalysisValidate',{items,sources:[{id:chunk.id,revision:chunk.revision}],originals:{[chunk.id]:text},themes:THEMES});
 const needsOrganization=(source:Row)=>source.enabled!==false&&!store.state.knowledge.some((k:Row)=>k.sourceId===source.id&&k.sourceRevision===source.revision&&k.activityVersion===1);
 const current=(source:Row)=>store.state.sources.some((s:Row)=>s.id===source.id&&s.revision===source.revision&&s.enabled!==false);

 async function generate(){
  if(store.busy||store.organizing)return;
  if(!store.state.cloudConsent){store.error='Ask Fox to allow selected context before organizing your private sources.';return;}
  const selected=store.state.sources.filter((s:Row)=>s.enabled!==false);
  if(!selected.length){store.status='No sources need organizing.';return;}
  const pending=selected.filter(needsOrganization);
  if(!pending.length&&store.state.layout){store.status='No source changes. Your world is up to date.';return;}
  store.organizing=true;store.error=null;store.state.lastJob='Organizing sources';store.status=store.state.lastJob;
  try{store.persist();}catch{}
  try{
   for(const [sourceIndex,source] of pending.entries()){
    check();
    if(!store.state.cloudConsent)throw new WorldletError('Context processing is paused.');
    if(!current(source))continue;
    const original=store.original(source.id);
    const chunks=core<string[]>('contextChunks',{text:String(original.text??''),limit:24000});
    if(!Array.isArray(chunks))throw new WorldletError('Invalid source chunks.');
    const parsed:Row[]=[];
    for(const [index,text] of chunks.entries()){
     check();
     const chunk={id:source.id+':chunk:'+index,revision:source.revision};
     const cache=path.join(store.root,'cache/knowledge',source.id,source.revision,CHUNK_FORMAT,index+'.json');
     const legacy=path.join(store.root,'knowledge',source.id,source.revision,CHUNK_FORMAT,index+'.json');
     const stored=[cache,legacy].map(file=>{try{return fs.existsSync(file)?readJSON(file):null;}catch{return null;}}).find(Boolean);
     if(stored&&Array.isArray(stored.items)){
      try{
       // Model attribution is host-owned cache metadata, not model-derived content.
       const valid=validate(stored.items,chunk,text).map(item=>({...item,model:stored.items.find((s:Row)=>s.sourceId===item.sourceId)?.model}));
       parsed.push(...valid);continue;
      }catch{}
     }
     store.status=`Organizing ${sourceIndex+1}/${pending.length} · Chunk ${index+1}/${chunks.length}`;store.state.lastJob=store.status;
     const request=core('sourceAnalysisRequest',{sourceId:chunk.id,title:source.title,text,now:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),topics:store.state.knowledge.map((k:Row)=>k.topic)});
     const bytes=await analyze(JSON.stringify(request));
     if(!store.state.cloudConsent)throw new WorldletError('Context processing is paused.');
     const valid=validate(JSON.parse(bytes).items??[],chunk,text);
     if(valid[0])valid[0].model=lastModel;
     writeJSON(cache,{items:valid});
     parsed.push(...valid);
    }
    const merged=core('sourceAnalysisMerge',{source:{id:source.id,revision:source.revision},chunks:parsed});
    if(merged==null||!current(source))continue;
    // Each validated source checkpoints independently; restart reuses completed chunks.
    store.state.knowledge=[...store.state.knowledge.filter((k:Row)=>k.sourceId!==source.id),merged];store.changed();
   }
   const analyzed=store.state.knowledge.filter((k:Row)=>selected.some((s:Row)=>s.id===k.sourceId&&s.revision===k.sourceRevision));
   if(analyzed.length!==selected.length)throw new WorldletError('Some sources still need organizing. The layout has not been updated.');
   store.status='Designing your world…';store.state.lastJob=store.status;
   // Layout needs theme aggregates, not another upload of every original or fact.
   const themes=[...new Set(analyzed.map((k:Row)=>k.theme as string))].sort();
   const hints=themes.map(theme=>{const group=analyzed.filter((k:Row)=>k.theme===theme);return {theme,count:group.length,topics:group.slice(0,12).map((k:Row)=>k.topic)};});
   const previous=store.state.layout?JSON.stringify(store.state.layout,null,2):'None';
   check();
   const layout=core<Row>('contextLayout',{themes:hints,previous});
   core('contextLayoutValidate',{layout,themes:analyzed.map((k:Row)=>k.theme)});
   lastModel='worldlet-layout-v1';
   store.state.layout=layout;
   store.state.lastJob='Generated · '+new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date());
   store.status=typeof layout.message==='string'?layout.message:store.state.lastJob;store.changed();
  }catch(error){
   const stopped=error instanceof Cancelled;
   store.state.lastJob=stopped?'Canceled. Completed chunks are preserved.':'Generation incomplete. Completed chunks are preserved.';
   store.status=store.state.lastJob;
   if(!stopped)store.error=errorMessage(error);
   try{store.persist();}catch{}
  }finally{store.organizing=false;store.notify();}
 }

 return {
  organizeSources(body:Row){
   if(store.sampleEnabled()||body.consent!==true)throw new WorldletError('Choose whether to allow cloud processing first.');
   if(store.busy||!store.writable)throw new WorldletError('Please wait for the current operation to finish.');
   if(!store.state.sources.some((s:Row)=>s.enabled!==false))throw new WorldletError('Add a source before organizing your world.');
   store.setCloudConsent(true);
   if(!running){cancelled=false;running=generate().catch(error=>ctx.host.diagnostics.record(error,'organizeSources')).finally(()=>{running=null;});}
   return {ok:true};
  },
  cancel(){if(running){cancelled=true;client?.cancel();}}
 };
}
