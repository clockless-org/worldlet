/** Local deletion policy. Native hosts confirm intent and perform storage IO. */
export function localDeletionRequest(input:any) {
 // One saved item and its review trail; sources, caches and other items stay.
 if(input.action==='deleteWorldItem') {
  if(typeof input.id!=='string'||!input.id||input.id.length>200)throw Error('Invalid item.');
  return {provider:null,item:input.id,clearMailReviews:false,buckets:['items','attention-backup','reviews','task-reviews']};
 }
 const provider=input.action==='clearWorldContent'?null:input.provider;
 if(input.action!=='clearWorldContent'&&input.action!=='deleteSourceData')throw Error('Invalid deletion request.');
 if(provider!==null&&(typeof provider!=='string'||!provider.trim()||provider.length>100))throw Error('Name the source to delete.');
 return {provider,clearMailReviews:provider===null||provider==='gmail',buckets:['items','attention-backup','reviews','task-reviews','attention-budget','attention-context','applet-observations','applet-findings','applet-cursors','runtime-operations','runtime-deliveries'],title:provider?`Delete everything from ${provider}?`:'Delete everything Worldlet saved?',
  detail:(provider?`This permanently deletes local items, imported copies and derived notes from ${provider}, including saved revisions. Items that also rest on another source keep that evidence. `:'This permanently deletes every local saved item, imported copy and derived note, including saved revisions. ')+"Connections, model setup, preferences, Fox memory, conversations and Fox's recorded activity (Settings › Help, which can quote what Fox read) are kept; Reset removes them. Nothing is deleted in external services. Connected sources can be read again. This cannot be undone.",button:provider?'Delete':'Delete everything saved'};
}
export function localDeletionSources({provider,sources=[],connections=[]}:any) {
 const connectionIds=new Set(connections.filter(c=>c.provider===provider&&typeof c.id==='string'&&c.id).map(c=>c.id));
 return sources.filter(s=>provider===null||s.origin===provider||connectionIds.has(s.connectionID??s.connectionId)).map(s=>s.id);
}
/** Whether a pending task review or a browser receipt belongs to what is being deleted.
 * Deleting one item or one source removes only the trail that refers to it (its id, an item
 * the deletion removed, its provider, or a forgotten local source); everything else stays.
 * Clearing everything (provider null, no item) removes the whole trail. */
export function localDeletionTrail({provider,item,source,bucket,record,gone=[]}:any):boolean {
 const row=record&&typeof record==='object'?record:{};
 const rows=bucket==='browser-actions'?[row.task].filter(Boolean)
  :[row.previous,row.proposal,...(Array.isArray(row.candidates)?row.candidates:[])].filter(value=>value&&typeof value==='object');
 const ids=bucket==='browser-actions'?[row.taskID]:rows.map(value=>value.id);
 if(ids.some(id=>typeof id==='string'&&(id===item||gone.includes(id))))return true;
 if(typeof source==='string')return rows.some(value=>Array.isArray(value.sources)&&value.sources.some(ref=>ref?.local===true&&ref.id===source));
 if(typeof item==='string')return false;
 if(provider===null)return true;
 return typeof provider==='string'&&rows.some(value=>value.provider===provider);
}
export function localDeletionRecord({provider,item,bucket,key,record,gone=[]}:any):any {
 if(bucket==='task-reviews')return localDeletionTrail({provider,item,bucket,record,gone})?null:record;
 if(bucket==='attention-budget')return null;
 if(typeof item==='string')return ['items','attention-backup','reviews'].includes(bucket)&&(record.id===item||gone.includes(record.id))?null:record;
 if(['items','attention-backup','reviews'].includes(bucket)) {
  if(provider===null||gone.includes(record.id))return null;
  const refs=Array.isArray(record.sources)?record.sources:[],remaining=refs.filter(s=>s.provider!==provider);
  if(record.provider===provider||(refs.length&&!remaining.length))return null;
  if(remaining.length===refs.length)return record;
  const result={...record,sources:remaining};
  if(Array.isArray(record.attentionDependencies)) {
   result.attentionDependencies=record.attentionDependencies.filter(d=>{try{const parts=JSON.parse(d.id);return Array.isArray(parts)&&parts.every(p=>typeof p==='string')&&parts[0]!==provider;}catch{return false;}});
   result.attentionInvalidated=true;
  }
  return result;
 }
 if(bucket==='attention-context')return provider===null?null:{...record,facts:(record.facts||[]).filter(f=>f.provider!==provider)};
 if(['applet-observations','applet-findings','applet-cursors'].includes(bucket))return provider===null||key===provider?null:record;
 if(bucket==='runtime-operations')return provider===null||record.ownerId===provider?null:record;
 if(bucket==='runtime-deliveries')return provider===null||record.provider===provider?null:record;
 return record;
}
