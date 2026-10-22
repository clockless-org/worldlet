import type {WorldItem} from '../../contracts/world-item.ts';
interface LegacySource {id:string;origin:string;enabled:boolean;revision:string;sourceURL?:string}
interface LegacyActivity {kind:string;title:string;quote:string;start?:string;end?:string;allDay?:boolean}
interface LegacyKnowledge {sourceId:string;sourceRevision:string;summary:string;activities?:LegacyActivity[]}
export interface LegacyItemInput {
 sources:LegacySource[];
 knowledge:LegacyKnowledge[];
 /** Parsed originals supplied after native file path/permission checks. */
 originals:Record<string,Record<string,unknown>>;
}
/** One-time projection; identity seeds deliberately preserve the original format. */
export function migrateWorldItems(input:LegacyItemInput):{identitySeed:string;item:WorldItem}[] {
 const result:{identitySeed:string;item:WorldItem}[]=[];
 for(const knowledge of input.knowledge){
  const source=input.sources.find(s=>s.id===knowledge.sourceId&&s.enabled&&s.revision===knowledge.sourceRevision);
  if(!source)continue;
  for(const [index,activity] of (knowledge.activities??[]).entries()){
   const key=`legacy:${source.id}:${index}`;
   const ref:WorldItem={id:source.id,provider:source.origin,url:source.sourceURL??'',quote:activity.quote,local:true};
   const raw=input.originals[source.id];
   const remote=source.origin==='gmail'?(typeof raw?.threadId==='string'?'thread:'+raw.threadId:undefined):raw?.id;
   if(typeof remote==='string')ref.remoteId=remote;
   const item:WorldItem={key,provider:source.origin,kind:activity.kind,title:activity.title,context:knowledge.summary,status:'candidate',legacySourceId:source.id,sources:[ref],runId:'migration'};
   for(const name of ['start','end','allDay'] as const)if(activity[name]!==undefined)item[name]=activity[name];
   result.push({identitySeed:source.origin+':'+key,item});
  }
 }
 return result;
}
