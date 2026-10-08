import {attentionGroupWhen} from './time.ts';
import {matterCopy} from './matter-copy.ts';
import {groupAttentionEvents} from '../../core/attention/index.ts';
// Source signals stay independent within their Applet unless Core groups saved items
// into one event. Explicit scenes can still fold related signals; neither grouping
// changes the saved source evidence.
// Within a kind, Coming Up keeps start order; other rows carry their times only for ranking.
const startOf=signal=>{const value=signal?.state==='event'?signal.start:undefined,time=typeof value==='number'?value:Date.parse(value);return Number.isFinite(time)?time:Infinity;};
export function collectMatters({sections,pages,activities=[],events=[],current,currentSpace,depth,now=Date.now()}){
 const rank={needsAction:0,event:1,unseen:2,available:3};
 const items=sections.filter(r=>r.entity==='matter').map(r=>{
  const signals=[...activities,...events].filter(a=>a.matterId?a.matterId===r.moduleId:a.placeId===r.id||r.children.includes(a.pageId)||a.pageIds?.some(id=>r.children.includes(id)));
  signals.sort((a,b)=>(rank[a.state]??3)-(rank[b.state]??3)||startOf(a)-startOf(b));
  const state=signals[0]?.state||'available';
  const copy=matterCopy(r,signals,pages,now);
  return {id:r.moduleId,pageIds:r.children,placeId:r.id,title:r.title,taskTitle:copy.actionTitle,label:r.title,objective:copy.context,...copy,signalCount:signals.length,state,requiresChoice:!!signals[0]?.requiresChoice,priority:signals[0]?.priority||'normal',summary:signals[0]?.summary||'',worldItemId:pages?.get(signals[0]?.pageId)?.worldItemId,kind:'matter',active:current===r.moduleId||currentSpace===r.id,signals};
 });
 const apps=new Map<string,any>(sections.filter(r=>r.entity==='app').flatMap(r=>r.children.map((id): [string,any]=>[id,r])));
 for(const signal of [...activities,...events]){
  for(const pageId of signal.pageId?[signal.pageId]:signal.pageIds||[]){
   const app=apps.get(pageId);if(!app)continue;
   const copy=matterCopy(app,[{...signal,pageId}],pages,now);
   items.push({id:signal.id+':'+pageId,pageId,pageIds:[pageId],targetId:app.moduleId,placeId:app.id,title:app.title,taskTitle:copy.actionTitle,label:app.title,objective:copy.context,...copy,signalCount:1,state:signal.state,requiresChoice:!!signal.requiresChoice,priority:signal.priority||'normal',summary:signal.summary||'',worldItemId:pages?.get(pageId)?.worldItemId,kind:'activity',active:current===pageId,signals:[signal]});
  }
 }
 return foldEvents(items,pages,now).sort((a,b)=>(rank[a.state]??3)-(rank[b.state]??3)||startOf(a.signals[0])-startOf(b.signals[0]));
}

// One card per Core event. The lead item keeps its copy and target; every member's
// signals, pages, world items, sources and actions stay attached.
function foldEvents(items,pages,now){
 const saved=items.filter(i=>i.kind==='activity'&&i.worldItemId);
 if(!saved.length)return items;
 const byId=new Map<string,any>(saved.map(i=>[i.id,i]));
 const represented=new Set(saved.map(i=>i.worldItemId));
 // Settled pages no longer emit active signals. Include their durable decisions
 // when grouping so re-extraction of old evidence cannot create a replacement.
 const history=[...pages.values()].filter((p:any)=>p.worldItemId&&!represented.has(p.worldItemId)&&['done','dismissed'].includes(p.worldItemStatus)).map((p:any)=>({id:'settled:'+p.worldItemId,provider:p.sourceProvider||'',kind:p.worldItemKind||'',state:'available',priority:p.worldItemSignal?.priority,status:p.worldItemStatus,event:p.worldItemSignal?.event,sources:Array.isArray(p.worldItemSources)?p.worldItemSources:[]}));
 const grouped=groupAttentionEvents([...saved.map(i=>{const p=pages.get(i.pageId);return {...p.worldItemSignal,id:i.id,provider:p.sourceProvider||'',kind:p.worldItemKind||'',state:i.state,priority:i.priority,actionLabel:i.signals[0]?.actionLabel,status:p.worldItemStatus,snoozedUntil:p.worldItemSnoozedUntil,event:p.worldItemSignal?.event,sources:Array.isArray(p.worldItemSources)?p.worldItemSources:[]};}),...history],{now});
 const folded=new Map();
 for(const event of grouped){
  const members=event.members.map(m=>byId.get(m.id)).filter(Boolean),lead=members[0];
  if(event.status!=='open'){for(const m of members)folded.set(m.id,null);continue;}
  if(members.length<2)continue;
  const card={...lead,when:attentionGroupWhen(members.map(m=>pages.get(m.pageId)?.worldItemSignal||{}),{now:new Date(now)}),eventId:event.id,signalCount:members.reduce((n,m)=>n+m.signalCount,0),signals:members.flatMap(m=>m.signals),pageIds:[...new Set(members.flatMap(m=>m.pageIds))],worldItemIds:[...new Set(members.map(m=>m.worldItemId))],sources:event.sources,sourceCount:event.sources.length,messageCount:event.messageCount,actions:event.actions,priority:event.priority,newEvidence:event.newEvidence,snoozedUntil:event.snoozedUntil,active:members.some(m=>m.active)};
  // The card keeps its earliest member's place. Core breaks lead ties by ID, so the lead's place
  // could send an item with a duplicate behind every equal row and out of the Center.
  const place=saved.find(i=>members.includes(i));
  for(const m of members)folded.set(m.id,m===place?card:null);
 }
 return items.flatMap(i=>!folded.has(i.id)?[i]:folded.get(i.id)?[folded.get(i.id)]:[]);
}
