import type {ActivityObservation,ActivityState,ActivityFact} from '../../contracts/activity.ts';
import {journalPayload} from '../items/index.ts';
const id=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(s);
const short=(s:unknown,n:number)=>typeof s==='string'?s.slice(0,n):'';
/** URLs lose credentials, query and fragment values; originals are not telemetry. */
export function activityURL(raw:string):string {
 // Foundation's embedded JS engine need not provide WHATWG URL.
 const m=/^https?:\/\/([^/?#]+)([^?#]*)/.exec(raw);
 if(!m)return '';
 return (raw.slice(0,raw.indexOf(':'))+'://'+m[1].replace(/^.*@/,'')+m[2]).slice(0,4096);
}
export function activityEvent(input:{id:string;surfaceId:string;at:number;kind:string;data?:Record<string,unknown>}):ActivityFact {
 if(!id(input.id)||!id(input.surfaceId)||!Number.isFinite(input.at)||input.at<0||!['ui.click','ui.edit','ui.submit','ui.command','ui.open','ui.close','ui.visibility','capture.error','capture.popup'].includes(input.kind))throw Error('Invalid activity event');
 const data=input.data??{},clean:Record<string,unknown>={};
 // A host observed a popup stack transition, not its documents or a successful action.
 if(input.kind==='capture.popup'){
  if(typeof data.active!=='boolean')throw Error('Invalid activity popup');
  return {version:1,id:input.id,at:input.at,kind:'activity.capture.gap',surfaceId:input.surfaceId,data:{reason:'popup-coverage',active:data.active,scope:'popup-stack',content:'not-observed',targetInventory:'unavailable'}};
 }
 for(const k of ['commandId','operation','status','target','tag','label','appletId','region','reason','inputType'])if(typeof data[k]==='string')clean[k]=short(data[k],300);
 if(typeof data.characters==='number'&&Number.isSafeInteger(data.characters)&&data.characters>=0)clean.characters=data.characters;
 if(input.kind==='ui.edit')clean.contentRecorded=false;
 if(typeof data.active==='boolean')clean.active=data.active;
 return {version:1,id:input.id,at:input.at,kind:'activity.'+input.kind,surfaceId:input.surfaceId,data:journalPayload(clean) as Record<string,unknown>};
}
export function activityObserve(input:ActivityObservation):{state:ActivityState|null;events:ActivityFact[]} {
 if(!id(input.id)||!id(input.surfaceId)||!Number.isFinite(input.at)||!Number.isFinite(input.tick)||input.at<0||input.tick<0||typeof input.active!=='boolean')throw Error('Invalid activity observation');
 if(input.close!==undefined&&typeof input.close!=='boolean')throw Error('Invalid activity close');
 if(input.endReason!==undefined&&(!input.close||!['navigation','hidden','closed','popup','unavailable'].includes(input.endReason)))throw Error('Invalid activity end reason');
 const events:ActivityFact[]=[];let state=input.state?{...input.state}:null;
 const emit=(kind:string,data:Record<string,unknown>,visitId=state?.visitId)=>events.push({version:1,id:input.id+'-'+events.length,at:input.at,kind:'activity.'+kind,surfaceId:input.surfaceId,...(visitId?{visitId}:{}),data:journalPayload(data) as Record<string,unknown>});
 if(input.close){
  if(state){
   const unobservedMs=Math.max(0,input.tick-state.lastTick);
   if(state.active&&unobservedMs>0)emit('capture.gap',{unobservedMs,reason:'visit-ended-between-samples'});
   emit('page.closed',{url:state.url,totalVisibleMs:state.visibleMs,reason:input.endReason??'closed'});
  }
  return {state:null,events};
 }
 if(state){
  const samePage=input.page?.url===state.navigationURL&&input.page?.documentId===state.documentId;
  const elapsed=Math.max(0,input.tick-state.lastTick),observed=state.active&&input.active&&samePage&&!input.page?.omitted&&input.page?.visible===true?Math.min(5000,elapsed):0;
  state.visibleMs+=observed;state.lastTick=input.tick;
  if(observed>0)emit('page.dwell',{visibleMs:observed,totalVisibleMs:state.visibleMs,measurement:'focused-visible-sampled'});
  if(elapsed>5000)emit('capture.gap',{unobservedMs:elapsed-5000,reason:'poll-gap'});
 }
 const p=input.page;if(!p){if(state?.active){emit('page.visibility',{active:false});state.active=false;}return {state,events};}
 if(typeof p.url!=='string'||typeof p.title!=='string'||typeof p.text!=='string'||typeof p.visible!=='boolean'||(p.clicks!==undefined&&!Array.isArray(p.clicks))||(p.edits!==undefined&&!Array.isArray(p.edits))||(p.interactions!==undefined&&!Array.isArray(p.interactions)))throw Error('Invalid activity content');
 const url=activityURL(p.url);if(!url||!id(p.documentId))throw Error('Invalid activity page');
 if(!state||state.navigationURL!==p.url||state.documentId!==p.documentId){
  if(state)emit('page.closed',{url:state.url,totalVisibleMs:state.visibleMs,reason:'navigation'});
  state={visitId:input.id,url,navigationURL:p.url,documentId:p.documentId,title:'',text:'',lastTick:input.tick,active:false,visibleMs:0};
  emit('page.opened',{url});
 }
 const active=input.active&&p.visible===true&&!p.omitted;
 if(state.active!==active)emit('page.visibility',{active});state.active=active;
 if(Number.isFinite(p.scrollX)&&Number.isFinite(p.scrollY)&&(state.scrollX!==p.scrollX||state.scrollY!==p.scrollY)){emit('page.scroll',{x:p.scrollX,y:p.scrollY});state.scrollX=p.scrollX;state.scrollY=p.scrollY;}
 if(!p.omitted&&p.coverage){
  const c=p.coverage;
  if(c.scope!=='document'||c.workers!=='not-observed'||!Number.isSafeInteger(c.frameElements)||c.frameElements<0)throw Error('Invalid activity coverage');
  const coverage=JSON.stringify([c.scope,c.frameElements,c.workers]);
  if(state.coverage!==coverage)emit('capture.gap',{reason:'document-only-coverage',scope:'document',frameElements:c.frameElements,childFrames:'not-observed',workers:'not-observed',targetInventory:'unavailable'});
  state.coverage=coverage;
 }
 const title=p.omitted?'':short(p.title,500),text=p.omitted?'':short(p.text,1_000_000);
 if(state.title!==title||state.text!==text||p.omitted){
  const parts=Math.max(1,Math.ceil(text.length/16000));
  for(let part=0;part<parts;part++)emit('page.content',{url,title,text:text.slice(part*16000,(part+1)*16000),snapshotId:input.id,part,parts,visible:active,scope:'visible-viewport-text',truncated:p.truncated===true||p.text.length>1_000_000,...(p.omitted?{omitted:short(p.omitted,100)}:{})});
  state.title=title;state.text=text;
 }
 // An exclusion applies to the entire observation, including buffers queued before a privacy transition.
 if(p.omitted)return {state,events};
 for(const interaction of (p.interactions??[]).slice(0,2000)){
  if(!interaction||typeof interaction.type!=='string'||!/^[a-z][a-z0-9.:-]{0,63}$/.test(interaction.type))continue;
  const detail:Record<string,unknown>={type:interaction.type};
  for(const key of ['tag','target','label','inputType'])if(typeof interaction[key]==='string')detail[key]=short(interaction[key],300);
  for(const key of ['nodeId','at','x','y','characters'])if(typeof interaction[key]==='number'&&Number.isFinite(interaction[key]))detail[key]=interaction[key];
  if(typeof interaction.active==='boolean')detail.active=interaction.active;
  emit('page.interaction',{...detail,contentRecorded:false,attribution:'page-observed; may include agent input'});
 }
 for(const click of (p.clicks??[]).slice(0,200))emit('page.click',{tag:short(click.tag,30),label:short(click.label,200),...(click.href?{href:activityURL(click.href)}:{}),attribution:'page-observed; may include agent input'});
 for(const edit of (p.edits??[]).slice(0,200))emit('page.edit',{tag:short(edit.tag,30),inputType:short(edit.inputType,60),characters:Math.max(0,Math.min(1000000,Number(edit.characters)||0)),contentRecorded:false,attribution:'page-observed; may include agent input'});
 if(typeof p.dropped==='number'&&Number.isSafeInteger(p.dropped)&&p.dropped>0)emit('capture.gap',{dropped:p.dropped,reason:'interaction-buffer-limit'});
 return {state,events};
}
export {WORLD_LOG_KINDS,worldLogLines,worldLogNext,worldLogNow,worldLogApplet,worldLogKeeps} from './world-log.ts';
export type {WorldLogLine,WorldLogNext} from './world-log.ts';
