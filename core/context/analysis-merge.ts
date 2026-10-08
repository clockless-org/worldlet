import {characters} from '../companion/index.ts';
import type {Knowledge} from './context-validation.ts';

/** Merge validated chunks in source order. Host IO owns caches and revision fencing. */
export function mergeSourceAnalysis(source:{id:string;revision:string|number},chunks:Knowledge[]):Knowledge|null {
 if(!source||typeof source.id!=='string'||!source.id||!(typeof source.revision==='string'||typeof source.revision==='number'&&Number.isSafeInteger(source.revision)&&source.revision>=0)||!Array.isArray(chunks))throw Error('Invalid analysis merge.');
 if(!chunks.length)return null;
 const counts=new Map<string,number>(),quotes=new Set<string>(),facts:Knowledge['facts']=[],models=new Set<string>();
 for(const [index,chunk] of chunks.entries()){
  if(chunk.sourceId!==`${source.id}:chunk:${index}`)throw Error('Analysis chunks are missing, duplicated or out of order.');
  counts.set(chunk.theme,(counts.get(chunk.theme)??0)+1);
  for(const fact of chunk.facts)if(facts.length<12&&!quotes.has(fact.quote)){quotes.add(fact.quote);facts.push({text:fact.text,quote:fact.quote});}
  if(typeof chunk.model==='string'&&chunk.model)models.add(chunk.model);
 }
 // Explicit ordinal tie break, independent of native locale or collection order.
 const theme=[...counts.keys()].sort((a,b)=>(counts.get(b)!-counts.get(a)!)||(a<b?-1:a>b?1:0))[0];
 const intent=chunks.find(chunk=>chunk.intent!==undefined)?.intent;
 return {
  sourceId:source.id,sourceRevision:source.revision,
  summary:characters(chunks.map(chunk=>chunk.summary).join('\n\n')).slice(0,2400).join(''),
  theme,topic:chunks[0].topic,facts,...(intent!==undefined?{intent}:{}),
  activities:chunks.flatMap(chunk=>chunk.activities??[]).slice(0,8).map(activity=>({...activity})),
  activityVersion:1,model:[...models].sort().join(', '),
 };
}
