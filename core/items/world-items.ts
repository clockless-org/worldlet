import {AGENT_ASK_PROVIDER} from '../../contracts/agent-asks.ts';
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
   worldItemContentReady:ready,worldItemSources:refs,worldItemWebsites:Array.isArray(item.websiteURLs)?item.websiteURLs:[],worldItemId:item.id,worldItemStatus:item.status,worldItemKind:kind,worldItemSnoozedUntil:item.snoozedUntil,worldItemSignal:signal,...(item.noteId?{noteId:item.noteId}:{}),...(item.provider===AGENT_ASK_PROVIDER&&typeof item.githubDraftId==='string'?{worldItemGithubDraft:{id:item.githubDraftId,agent:String(item.agentName||item.agentId||''),repo:String(item.githubDraftRepo||''),write:String(item.githubDraftWrite||''),url:typeof item.githubDraftUrl==='string'&&/^https:\/\/github\.com\//.test(item.githubDraftUrl)?item.githubDraftUrl:'',status:String(item.githubDraftStatus||''),text:typeof item.githubDraftText==='string'?item.githubDraftText:String(item.context||''),...(typeof item.githubDraftReason==='string'?{reason:item.githubDraftReason}:{})}}:{}),...(item.provider===AGENT_ASK_PROVIDER&&typeof item.askId==='string'?{worldItemAsk:{id:item.askId,agent:String(item.agentName||item.agentId||''),choices:Array.isArray(item.askChoices)?item.askChoices.filter(c=>typeof c==='string').slice(0,4):[],status:String(item.askStatus||''),...(typeof item.askChoice==='string'?{choice:item.askChoice}:{}),...(Array.isArray(item.askDraftIds)&&item.askDraftIds.length?{drafts:item.askDraftIds.length}:{}),...(Array.isArray(item.askAttachments)&&item.askAttachments.length?{attachments:item.askAttachments.filter(a=>a&&typeof a.id==='string'&&typeof a.name==='string'&&typeof a.type==='string').slice(0,20).map(a=>({id:a.id,name:a.name,type:a.type,size:Number(a.size)||0}))}:{})}}:{}),...(item.provider===AGENT_ASK_PROVIDER&&typeof item.remoteConsentId==='string'?{worldItemRemoteConsent:{id:item.remoteConsentId,client:String(item.remoteConsentClient||''),code:String(item.remoteConsentCode||''),returnsTo:String(item.remoteConsentReturnsTo||''),status:String(item.remoteConsentStatus||'')}}:{}),activities:active?[signal]:[],events:active&&kind==='event'?[{...signal,id:item.id}]:[]});
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
