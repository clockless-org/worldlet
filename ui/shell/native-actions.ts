// A row carries its item's own times for ranking (timeliness, owner decision 2026-10-04). Only
// known times are copied, so a row never hides its page's own signal times with blanks.
const times=a=>Object.fromEntries(Object.entries({start:a.start,end:a.end,allDay:a.allDay,receivedAt:a.receivedAt,occurredAt:a.occurredAt,sourceUpdatedAt:a.sourceUpdatedAt}).filter(([,v])=>v!==undefined));
// Only known source updates and explicitly modeled sample decisions become actions.
// Reading clears an unread item, never an outstanding decision.
export function collectNativeActions({pages, sections, arrivals=[], read=new Set(), sampleTour=[], decisions=[], completed=new Set(), current=null, depth='overview', lastRead=null}) {
 const placeFor=id=>sections.find(s=>s.children.includes(id))?.id;
 const tasks: any[]=decisions.filter(d=>pages.has(d.pageId)&&!completed.has(d.id)).map(d=>({id:d.id,pageId:d.pageId,placeId:placeFor(d.pageId),kind:'decision',requiresChoice:!!d.choices?.length,icon:'alert',label:d.label,taskTitle:d.title||pages.get(d.pageId).title,objective:d.objective||d.label,state:'needsAction'}));
 // Validated source signals provide private tasks and updates; an import alone is not an update.
 for(const p of pages.values())for(const [i,a] of (p.activities||[]).entries()){
  if(a.kind==='task'||a.kind==='update'&&(p.worldItemId?p.worldItemStatus==='open':!read.has(p.id)))tasks.push({id:'activity:'+p.id+':'+i,pageId:p.id,placeId:placeFor(p.id),kind:a.kind==='task'?'decision':'updates',label:a.title,taskTitle:a.title,actionTitle:a.title,objective:a.quote,context:a.quote||'',summary:a.summary||'',priority:a.priority||'normal',state:a.kind==='task'?'needsAction':'unseen',dueAt:a.dueAt,mailPlacement:a.mailPlacement,mailUnread:a.mailUnread,...times(a)});
 }
 const groups=new Map();
 for(const id of [...new Set([...arrivals,...sampleTour])]){
  if(!pages.has(id)||pages.get(id).pending||pages.get(id).knowledge||Array.isArray(pages.get(id).activities)||read.has(id)||tasks.some(t=>t.pageId===id))continue;
  const placeId=placeFor(id),section=sections.find(s=>s.id===placeId),mail=section?.module==='mailroom'||section?.theme==='archive',calendar=section?.module==='calendar-room'||section?.theme==='calendar';
  const label=mail?'Check mail':calendar?'Check calendar':section?.theme==='factory'?'Project updates':section?.theme==='library'?'New notes':'New content';
  const key=placeId||'other';if(!groups.has(key))groups.set(key,{id:'updates:'+key,placeId,kind:'updates',icon:mail?'mail':calendar?'calendar':'file',label,pageIds:[],state:'unseen'});
  groups.get(key).pageIds.push(id);
 }
 const activities=[...tasks,...groups.values()].map(a=>a.pageIds?{...a,label:a.label+' '+a.pageIds.length,taskTitle:a.pageIds.length===1?pages.get(a.pageIds[0]).title:(sections.find(s=>s.id===a.placeId)?.title||'Updates'),objective:'Review '+a.pageIds.length+' new '+(a.pageIds.length===1?'item':'items')}:a);
 let actions=activities;
 if(depth!=='overview')actions=activities.filter(a=>a.pageId===current||a.placeId===placeFor(current)||a.placeId===current);
 if(depth==='note')actions=actions.filter(a=>a.kind==='decision'&&a.pageId===current);
 if(depth==='overview'&&lastRead&&pages.has(lastRead)&&lastRead!==current)actions=[...actions,{id:'resume:'+lastRead,pageId:lastRead,kind:'resume',icon:'book',label:'Continue reading',state:'available'}];
 return {activities,actions};
}

// Explicit calendar records only: unread notes are Updates, not scheduled Events.
export function upcomingEvents({pages,sections,now=new Date(),limit=2}) {
 const current=now.getTime(),items=[];
 for(const page of pages.values())for(const event of page.events||[]){
  const start=new Date(event.start),end=new Date(event.end||event.start);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end.getTime()<current||event.cancelled)continue;
  const today=start.toDateString()===now.toDateString(),tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);
  const day=today?'Today':start.toDateString()===tomorrow.toDateString()?'Tomorrow':start.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const time=event.allDay?'All day':start.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  items.push({matterId:event.matterId,id:'event:'+page.id+':'+(event.id||event.start),pageId:page.id,placeId:sections.find(s=>s.children.includes(page.id))?.id,state:'event',kind:'event',icon:'calendar',label:event.title||page.title,taskTitle:event.title||page.title,context:event.quote||'',summary:event.summary||'',objective:(start.getTime()<=current?'Now':day)+' · '+time,allDay:!!event.allDay,start:start.getTime(),end:end.getTime()});
 }
 return items.sort((a,b)=>a.start-b.start).slice(0,limit);
}
