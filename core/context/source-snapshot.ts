export function sourceSnapshotPlan(sources:Record<string,any>[],knowledge:Record<string,any>[]) {
 const complete=new Set(knowledge.map(row=>JSON.stringify([row.sourceId,row.sourceRevision])));
 return {ids:sources.filter(row=>row.enabled&&!complete.has(JSON.stringify([row.id,row.revision]))).map(row=>row.id),maxCharacters:4000};
}
/** Bounded original excerpts for the trusted World, never the full source store. */
export function sourceSnapshotRows(sources:Record<string,any>[],knowledge:Record<string,any>[],regions:Record<string,string>={}) {
 let budget=128000;
 const plan=sourceSnapshotPlan(sources,knowledge),pending=new Set(plan.ids);
 return sources.map(row=>{
  let excerpt='';
  if(pending.has(row.id)&&budget>0){
   let characters=0;
   for(const character of String(row.excerpt??'')){
    if(characters++>=plan.maxCharacters)break;
    const code=character.codePointAt(0)!;
    const bytes=code<128?1:code<2048?2:code<65536?3:4;
    if(bytes>budget)break;
    excerpt+=character;budget-=bytes;
   }
  }
  return {id:row.id,title:row.title,origin:row.origin,revision:row.revision,enabled:row.enabled,
   preset:row.preset??regions[row.connectionId]??'home',moduleKey:row.moduleKey??'',
   connectionId:row.connectionId??'',sourceURL:row.sourceURL??'',excerpt};
 });
}
