type Row=Record<string,any>;
/** Characters of a related (non-pending) record the Center sees. Pending seeds stay whole; related
 * records are neighbourhood context, and sixteen of them at the 12,000-character source cap were most
 * of every pass's input tokens. The host validates quotes against the whole original. */
export const RELATED_CONTEXT_CHARACTERS=3000;
// Planner and host bookkeeping on each fact; the model never uses it (keys alone are 48 words a record).
const internalFact=new Set(['keys','fingerprint','changedAt']);
// What the Center's batch reads. The shared item query also carries checks, operations, browser
// workflows and runtime task rows: local state that changes every pass and says nothing about a finding.
const modelFields=['items','taskReviews','context','pendingContextIds','skippedContextIds','appletCandidates','userContext','attentionFocus','timeZone'];
/** Reuse S's grounded extraction. The host retains originals for final validation. */
export function attentionBatchInput(snapshot:Row) {
 const candidates:Row[]=(snapshot.appletCandidates||[]).filter((item:Row)=>(item.sources||[]).some((ref:Row)=>(snapshot.context||[]).some((row:Row)=>{
  const owner=row.sourceReference||{provider:row.provider,id:row.sourceId};return ref.provider===owner.provider&&ref.id===owner.id;
 })));
 const pending=new Set(snapshot.pendingContextIds||[]);
 const context=(snapshot.context||[]).map((row:Row)=>{
  const owner=row.sourceReference||{provider:row.provider,id:row.sourceId};
  const quotes=[...new Set(candidates.flatMap(item=>(item.sources||[]).filter(ref=>ref.provider===owner.provider&&ref.id===owner.id).map(ref=>ref.quote)).filter(q=>typeof q==='string'&&q.trim()&&String(row.text).includes(q)))];
  const record=Object.fromEntries(Object.entries(row).filter(([name])=>!internalFact.has(name)));
  if(quotes.length&&!row.removed)return {...record,text:quotes.join('\n\n'),evidenceParts:quotes,evidenceExcerpt:true};
  // Without checked extraction evidence, a pending seed keeps its supplied bounded original and a
  // related record its opening, marked partial like any excerpt.
  const characters=typeof row.text==='string'?Array.from(row.text as string):[];
  if(row.removed||pending.has(row.id)||characters.length<=RELATED_CONTEXT_CHARACTERS)return record;
  const opening=characters.slice(0,RELATED_CONTEXT_CHARACTERS).join('');
  return {...record,text:opening,evidenceParts:[opening],evidenceExcerpt:true};
 });
 // A saved item whose every input is present at the same revision and not pending in this
 // pass is already current. Marking it lets the model output only new or changed findings;
 // leaving it out of the output keeps it as saved (freshness follows its dependencies).
 // The host supplies saved dependencies separately (itemDependencies); they never reach the model.
 const revision=new Map((snapshot.context||[]).map((row:Row)=>[row.id,row.revision]));
 const saved:Row=snapshot.itemDependencies&&typeof snapshot.itemDependencies==='object'?snapshot.itemDependencies:{};
 const items=(snapshot.items||[]).map((item:Row)=>{
  const listed=Array.isArray(item.attentionDependencies)?item.attentionDependencies:saved[item.id];
  const deps:Row[]=Array.isArray(listed)?listed:[];
  const unchanged=item.attentionContentVersion===1&&deps.length>0&&deps.every(d=>!pending.has(d.id)&&revision.has(d.id)&&revision.get(d.id)===d.revision);
  // Only identity and timing: full copy invites the model to restate it (measured: most of
  // a later pass's output, 20–80s). Omitted items stay saved; their IDs remain reusable.
  return unchanged?{...Object.fromEntries(['id','kind','provider','title','status','start','end','dueAt'].filter(k=>item[k]!==undefined).map(k=>[k,item[k]])),unchanged:true}:item;
 });
 const rest=Object.fromEntries(modelFields.filter(name=>snapshot[name]!==undefined).map(name=>[name,snapshot[name]]));
 return {...rest,appletCandidates:candidates,context,...snapshot.items?{items}:{}};
}
