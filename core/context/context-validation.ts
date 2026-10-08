import {characters,utf8Length} from '../companion/index.ts';
import type {ContextLayout} from './context-layout.ts';
interface Fact {text:string;quote:string}
interface Activity {kind:string;title:string;quote:string;start?:string;end?:string;allDay?:boolean}
export interface Knowledge {sourceId:string;theme:string;topic:string;summary:string;facts:Fact[];intent?:string;activities?:Activity[];[key:string]:unknown}
const size=(s:string)=>characters(s).length;
const key=(s:string)=>s.normalize('NFC');
export function validateContextAnalysis(items:Knowledge[],sources:{id:string;revision:string}[],originalIDs:string[],themes:string[]):Knowledge[]{
 const wanted=new Set(sources.map(s=>key(s.id))),actual=new Set(items.map(i=>key(i.sourceId)));
 if(items.length!==sources.length||wanted.size!==actual.size||[...wanted].some(id=>!actual.has(id)))throw Error('Analysis did not cover every selected source. Your previous world is preserved.');
 return items.map(item=>{
  const source=sources.find(s=>key(s.id)===key(item.sourceId));
  if(!source||!originalIDs.some(id=>key(id)===key(item.sourceId))||!themes.includes(item.theme)||!item.topic.length||size(item.topic)>100||size(item.summary)>2400||item.facts.length>12||size(item.intent??'')>400)throw Error('Invalid knowledge structure.');
  for(const fact of item.facts)if(!fact.quote.length||size(fact.quote)>1000||size(fact.text)>600)throw Error('A model quote could not be verified in the source. This result was not saved.');
  if((item.activities?.length??0)>8)throw Error('Too many activity signals.');
  for(const activity of item.activities??[])if(!['task','event','update'].includes(activity.kind)||!activity.title.length||size(activity.title)>200||!activity.quote.length||size(activity.quote)>1000)throw Error('An activity could not be verified in its source.');
  return {...item,sourceRevision:source.revision,activityVersion:1};
 });
}
/** Validate model-derived content against host-selected originals, never model-supplied evidence. */
export function validateSourceAnalysis(items:Knowledge[],sources:{id:string;revision:string}[],originals:Record<string,string>,themes:string[]):Knowledge[]{
 if(!Array.isArray(items)||!Array.isArray(sources)||!originals||typeof originals!=='object'||Array.isArray(originals))throw Error('Invalid analysis response.');
 const text=(value:unknown):value is string=>typeof value==='string';
 for(const item of items){
  if(!item||!text(item.sourceId)||!text(item.theme)||!text(item.topic)||!item.topic.trim()||!text(item.summary)||!Array.isArray(item.facts)||
     item.intent!==undefined&&!text(item.intent)||item.activities!==undefined&&!Array.isArray(item.activities))throw Error('Invalid knowledge structure.');
  for(const fact of item.facts)if(!fact||!text(fact.text)||!text(fact.quote)||!fact.quote.trim())throw Error('Invalid source fact.');
  for(const activity of item.activities??[])if(!activity||!text(activity.kind)||!text(activity.title)||!activity.title.trim()||!text(activity.quote)||!activity.quote.trim()||
    activity.allDay!==undefined&&typeof activity.allDay!=='boolean')throw Error('Invalid source activity.');
 }
 const validated=validateContextAnalysis(items,sources,Object.keys(originals),themes);
 return validated.map(item=>{
  // Exact source IDs and quotes are intentional: normalization must not manufacture evidence.
  const original=Object.hasOwn(originals,item.sourceId)?originals[item.sourceId]:undefined;
  if(typeof original!=='string')throw Error('Missing original source.');
  const evidence=(quote:string)=>{if(!original.includes(quote))throw Error('A model quote could not be verified in the original. This result was not saved.');};
  for(const fact of item.facts)evidence(fact.quote);
  for(const activity of item.activities??[]){
   evidence(activity.quote);
   if(activity.kind==='event'){
    const start=eventTime(activity.start);
    if(activity.end!==undefined&&eventTime(activity.end)<start)throw Error('Invalid event end date.');
   }
  }
  // Only the declared content fields enter storage; model output cannot supply revision or host metadata.
  return {sourceId:item.sourceId,sourceRevision:item.sourceRevision,summary:item.summary,theme:item.theme,topic:item.topic,
   facts:item.facts.map(f=>({text:f.text,quote:f.quote})),
   ...(item.intent!==undefined?{intent:item.intent}:{}),activityVersion:1,
   activities:(item.activities??[]).map(a=>({kind:a.kind,title:a.title,quote:a.quote,...(a.kind==='event'?{
    start:a.start,...(a.end!==undefined?{end:a.end}:{}),...(a.allDay!==undefined?{allDay:a.allDay}:{})}: {})}))};
 });
}
function eventTime(value:unknown):number {
 if(typeof value!=='string'||value.length>64)throw Error('An event needs an explicit date and time zone.');
 const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!parts)throw Error('An event needs an explicit date and time zone.');
 const [,y,m,d,h,min,sec,zone]=parts,year=Number(y),month=Number(m),day=Number(d);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 const offset=zone==='Z'?0:Number(zone.slice(1,3))*60+Number(zone.slice(4));
 const result=Date.parse(value);
 if(year<1||month<1||month>12||day<1||day>days[month-1]||Number(h)>23||Number(min)>59||Number(sec)>59||
    zone!=='Z'&&(Number(zone.slice(4))>59||offset>840)||!Number.isFinite(result))throw Error('Invalid event date or time zone.');
 return result;
}
export function validateContextLayout(layout:ContextLayout,knowledgeThemes:string[]):ContextLayout {
 const expected=new Set([...knowledgeThemes,'home']),actual=new Set(layout.places.map(p=>p.theme));
 if(actual.size!==expected.size||[...expected].some(t=>!actual.has(t))||layout.places.length!==expected.size||size(layout.message)>1200)throw Error('The world layout has missing or duplicate places.');
 for(const [index,p] of layout.places.entries()){
  if(p.position.length!==3||!p.position.every(Number.isFinite)||Math.abs(p.position[0])>32||p.position[1]!==0||Math.abs(p.position[2])>30||p.position[0]<=-18||!Number.isFinite(p.scale)||p.scale<0.8||p.scale>1.25||!/^#[0-9A-Fa-f]{6}(?![\s\S])/.test(p.accent)||size(p.title)>40)throw Error('The world layout is outside the supported range.');
  for(const q of layout.places.slice(index+1))if(Math.hypot(p.position[0]-q.position[0],p.position[2]-q.position[2])<12)throw Error('Places are too close together. The previous layout is preserved. Try again.');
 }
 return layout;
}
/** Keep graphemes intact, even when a single grapheme exceeds the byte budget. */
export function contextChunks(text:string,limit=24000):string[]{
 if(typeof text!=='string'||!Number.isInteger(limit)||limit<1)throw Error('Invalid source chunk budget.');
 const result:string[]=[];let chunk='',bytes=0;
 for(const value of characters(text)){
  const size=utf8Length(value);
  if(bytes+size>limit&&chunk){result.push(chunk);chunk='';bytes=0;}
  chunk+=value;bytes+=size;
 }
 if(chunk)result.push(chunk);
 return result;
}
