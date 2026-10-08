import type {AttentionEvent,AttentionEventMember,AttentionEventRecord} from '../../contracts/attention.ts';
// Related messages become one event only through a shared source record (the same
// message or thread). An explicit topic and subject is a masked display label, not an
// identifier: two accounts can share an issuer and last-4, and one merchant can have
// unrelated incidents, so a matching label alone never joins separate records. Different
// labels keep incidents apart even when they cite one digest. Shared keywords never
// group, and a pressing actionable item is never folded behind another one.
const PRIORITY=['normal','elevated','important','high','urgent'];
const STATE={needsAction:0,event:1,unseen:2,available:3};
const norm=(value:unknown)=>typeof value==='string'?value.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' '):'';
export const attentionSourceKey=(ref:{provider:string;id:string;remoteId?:string})=>(ref.provider+':'+(ref.remoteId||ref.id)).normalize('NFC');
const rank=(m:AttentionEventMember)=>Math.max(0,PRIORITY.indexOf(m.priority||'normal'));
const pressing=(m:AttentionEventMember)=>rank(m)>=3;
const separate=(m:AttentionEventMember)=>pressing(m)&&(m.state==='needsAction'||m.kind==='task'||m.kind==='decision');
const topicKey=(m:AttentionEventMember)=>{const topic=norm(m.event?.topic),subject=norm(m.event?.subject);return topic&&subject?[m.provider,m.kind,topic,subject].join('|'):'';};
const sameSources=(a:AttentionEventMember,b:AttentionEventMember)=>{const x=new Set(a.sources.map(attentionSourceKey)),y=b.sources.map(attentionSourceKey);return x.size===new Set(y).size&&y.every(k=>x.has(k));};
function hash(text:string){let h=0x811c9dc5;for(const c of text.normalize('NFC')){h^=c.codePointAt(0)!;h=Math.imul(h,0x01000193)>>>0;}return h.toString(36).padStart(7,'0');}
const snoozed=(value:string|undefined,now:number)=>!!value&&Date.parse(value)>now;
/** Group saved Attention items into stable events. Pure and deterministic: the same
 * members and records always yield the same IDs, order, counts and state. */
export function groupAttentionEvents(input:AttentionEventMember[],{previous=[],now}:{previous?:AttentionEventRecord[];now:number}):AttentionEvent[] {
 const members=[...new Map(input.map(m=>[m.id,m])).values()];
 const parent=members.map((_,i)=>i),find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 // A keyless message may never bridge two different explicit subjects.
 const subject=members.map(topicKey);
 const join=(a:number,b:number)=>{const x=find(a),y=find(b);if(x===y||subject[x]&&subject[y]&&subject[x]!==subject[y])return;const [low,high]=x<y?[x,y]:[y,x];parent[high]=low;subject[low]||=subject[high];};
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
  const a=members[i],b=members[j];
  if(a.provider!==b.provider||a.kind!==b.kind)continue;
  if(separate(a)||separate(b)){if(sameSources(a,b))join(i,j);continue;}
  // Two explicit, different subjects are separate incidents even if they cite one digest.
  const key=topicKey(a),other=topicKey(b);
  if(key&&other&&key!==other)continue;
  const keys=new Set(a.sources.map(attentionSourceKey));
  if(b.sources.some(r=>keys.has(attentionSourceKey(r))))join(i,j);
 }
 const clusters=new Map<number,AttentionEventMember[]>();
 members.forEach((m,i)=>{const root=find(i);clusters.set(root,[...(clusters.get(root)||[]),m]);});
 const used=new Set<string>();
 return [...clusters.values()].map(group=>{
  group.sort((a,b)=>(STATE[a.state]??3)-(STATE[b.state]??3)||rank(b)-rank(a)||a.id.localeCompare(b.id));
  const sources=[...new Map(group.flatMap(m=>m.sources).map(r=>[attentionSourceKey(r),r])).values()];
  const sourceKeys=sources.map(attentionSourceKey).sort();
  const explicit=group.map(topicKey).find(Boolean);
  // The label alone would give unrelated incidents one ID and one saved state; anchor it to evidence.
  const anchor=sourceKeys.length?group[0].provider+'|'+group[0].kind+'|'+sourceKeys[0]:'member|'+group.map(m=>m.id).sort()[0];
  const seed=explicit?explicit+'|'+anchor:anchor;
  let id='event:'+hash(seed);
  const record=previous.find(r=>!used.has(r.id)&&r.id===id)||previous.find(r=>!used.has(r.id)&&r.sourceKeys.some(k=>sourceKeys.includes(k)));
  if(record){id=record.id;used.add(record.id);}
  // Without a saved record, members the user already handled stand in for it.
  const handled=group.filter(m=>m.status==='dismissed'||m.status==='done'||snoozed(m.snoozedUntil,now));
  const known=new Set(record?record.sourceKeys:handled.flatMap(m=>m.sources.map(attentionSourceKey)));
  const fresh=group.filter(m=>m.sources.some(r=>!known.has(attentionSourceKey(r))));
  const newEvidence=(!!record||handled.length>0)&&fresh.length>0;
  const wakes=handled.map(m=>m.snoozedUntil).filter(v=>snoozed(v,now)).sort();
  let status:AttentionEvent['status']=record?record.status:handled.length&&!newEvidence&&!wakes.length?(handled.every(m=>m.status==='done')?'done':'dismissed'):'open';
  let snoozedUntil=record?(snoozed(record.snoozedUntil,now)?record.snoozedUntil:undefined):wakes.length===handled.length?wakes[0]:undefined;
  if(newEvidence){
   // New evidence reopens a finished event; a snooze holds unless the new message is pressing.
   if(status!=='open')status='open';
   if(snoozedUntil&&fresh.some(pressing))snoozedUntil=undefined;
  }
  const event:AttentionEvent={id,lead:group[0],members:group,sources,sourceKeys,messageCount:group.length,priority:PRIORITY[Math.max(...group.map(rank))],actions:[...new Set(group.map(m=>m.actionLabel).filter((v):v is string=>!!v))],newEvidence,status};
  if(snoozedUntil)event.snoozedUntil=snoozedUntil;
  return event;
 });
}
/** The record to save after the user acts on an event, so later passes inherit it. */
export function attentionEventRecord(event:AttentionEvent,status:AttentionEventRecord['status']=event.status,snoozedUntil=event.snoozedUntil):AttentionEventRecord {
 return {id:event.id,sourceKeys:event.sourceKeys,status,...(snoozedUntil?{snoozedUntil}:{})};
}
