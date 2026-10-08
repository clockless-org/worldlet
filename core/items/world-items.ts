// A date alone does not turn an invitation into a commitment.
export function attentionKind(item){
 if(item.kind!=='event')return item.kind;
 return item.provider==='google-calendar'||item.eventDisposition==='confirmed'?'event':'update';
}
export function refreshItemPage(page,now=Date.now()){
 if(!page?.worldItemId)return;
 const active=page.worldItemContentReady!==false&&(page.worldItemStatus==='open'||page.worldItemStatus==='read'&&page.worldItemKind!=='update')&&!(Date.parse(page.worldItemSnoozedUntil)>now);
 const signal=page.worldItemSignal||{};
 page.activities=active?[signal]:[];
 page.events=active&&page.worldItemKind==='event'?[{...signal,id:page.worldItemId}]:[];
}
// SQLite is authoritative; pages are a disposable projection into existing Applets.
export function projectWorldItems(world,items=[]){
 const migrated=new Set(items.flatMap(i=>[i.legacySourceId,...(i.sources||[]).filter(r=>r.local).map(r=>r.id)].filter(Boolean)));
 const published=new Set(items.map(i=>i.provider).filter(Boolean));
 for(const page of world.pages){if(migrated.has(page.sourceId)||published.has(page.sourceProvider)){page.activities=[];page.events=[];}}
 for(const item of items){
  const refs=item.sources||[],ref=refs.find(r=>r.provider===item.provider)||refs[0];if(!ref)continue;
  const kind=attentionKind(item);
  const ready=!!world.sample||!!world.sampleDataset||item.attentionContentVersion===1;
  const id='world-item-'+item.id,active=ready&&(item.status==='open'||item.status==='read'&&item.kind!=='update');
  const signal={kind,title:item.title,reason:item.reason||item.context,quote:item.reason||item.context,summary:item.summary||'',actionLabel:item.actionLabel,priority:item.priority||'normal',start:item.start,end:item.end,dueAt:item.dueAt,occurredAt:item.occurredAt,receivedAt:item.receivedAt,observedAt:item.observedAt,sourceUpdatedAt:item.sourceUpdatedAt,allDay:item.allDay,location:item.location,locationName:item.locationName,attentionReason:item.attentionReason,event:item.event,mailPlacement:item.mailPlacement,mailUnread:item.mailUnread};
  const text=[item.context,...refs.map(r=>r.quote)].filter(Boolean).join('\n\n');
  world.pages.push({id,title:item.title,parent:world.roots[0],children:[],paths:[id+'.md'],path:id+'.md',kind:'page',knowledge:true,
   text,markdown:text,sourceId:ref.local?ref.id:'world-item:'+item.id,sourceProvider:item.provider,sourceURL:ref.url||'',revision:item.updatedAt||item.id,sourceRevision:item.updatedAt||item.id,
   worldItemContentReady:ready,worldItemSources:refs,worldItemWebsites:Array.isArray(item.websiteURLs)?item.websiteURLs:[],worldItemId:item.id,worldItemStatus:item.status,worldItemKind:kind,worldItemSnoozedUntil:item.snoozedUntil,worldItemSignal:signal,...(item.noteId?{noteId:item.noteId}:{}),activities:active?[signal]:[],events:active&&kind==='event'?[{...signal,id:item.id}]:[]});
 }
 for(const page of world.pages)refreshItemPage(page);
 return world;
}

// The user settling an item on a page already in the world, by the rule above:
// an open item signals; a read update, a done task and anything dismissed go quiet.
export function settleItemPage(page,status,snoozedUntil=null){
 if(!page?.worldItemId)return;
 page.worldItemStatus=status;page.worldItemSnoozedUntil=snoozedUntil;
 refreshItemPage(page);
}
