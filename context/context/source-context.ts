import type {SourceContextState} from '../../contracts/source-context.ts';
/** Pure projection: only enabled originals with matching revisions contribute. */
export function sourceContextRows(state:SourceContextState) {
 const titles=new Map<string,string>(),enabled=new Map<string,Set<string|number>>();
 for(const source of state.sources){
  if(!titles.has(source.id))titles.set(source.id,source.title);
  if(source.enabled){if(!enabled.has(source.id))enabled.set(source.id,new Set());enabled.get(source.id).add(source.revision);}
 }
 return state.knowledge.filter(k=>enabled.get(k.sourceId)?.has(k.sourceRevision)).map(k=>({source_id:k.sourceId,source_revision:k.sourceRevision,title:titles.get(k.sourceId),markdown:k.summary+'\n\n'+k.facts.map(f=>'- '+f.text).join('\n'),structured:JSON.stringify({...k,intent:k.intent?{key:'local',title:k.intent,reason:'Inferred from sources by the model; not confirmed'}:null})}));
}
