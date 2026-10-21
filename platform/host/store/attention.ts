import {core} from '../core.ts';
import {digest,WorldletError} from '../files.ts';
import {swiftJSON,swiftFold,sameJSON} from './swift-json.ts';
import type {WorldLedger} from './ledger.ts';

// Attention items, their reviews and the task reviews waiting for the person: the `state.items`, `state.reviews`,
// `state.task-reviews`, `state.attention-*` buckets of `entries`. Core validates, prepares and keeps their history.
type Row=Record<string,any>;
const iso=()=>new Date().toISOString();

/** Evidence identity, byte-compatible with the Mac host's SHA-256 over sorted JSONSerialization. */
export function identity(item:Row){
 const provider=typeof item.provider==='string'?item.provider:'';
 const anchors=(Array.isArray(item.sources)?item.sources:[]).filter(ref=>ref?.provider===provider).map(ref=>{
  const quote=swiftFold(typeof ref.quote==='string'?ref.quote:'').split(/\s+/u).filter(Boolean).join(' ');
  return [typeof ref.remoteId==='string'?ref.remoteId:typeof ref.id==='string'?ref.id:'',provider==='gmail'&&item.kind!=='task'?'thread':quote];
 }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
 return digest(swiftJSON({provider,kind:item.kind??'',anchors}));
}
/** A record the host keeps for the person (an Agent's ask, a draft, a consent, a request) and its Attention item, saved
 * by the caller's transaction. The item is the host's own (provider `agents`): its status is the record's, set by the
 * person (`user`) or by an Agent or the request itself (`agent`), and its Agent the record's. */
export function saveWithItem(ledger:WorldLedger,bucket:string,run:string,record:Row,item:Row,origin:'user'|'agent',agentId?:unknown){
 core('worldItemValidate',{item,dates:{start:null,end:null}});
 const previous=ledger.value('items',item.id);
 const prepared=core<Row>('worldItemPrepare',{item,previous:previous??{},id:item.id,identity:identity(item),run,now:iso(),
  previousIdentity:previous?identity(previous):'',agentId});
 prepared.status=item.status;prepared.statusOrigin=origin;
 ledger.put(bucket,record.id,record);ledger.put('items',item.id,prepared);
}
function writeItems(ledger:WorldLedger,items:Row[],run:string,reviewed=false):string[] {
 if(items.length>50)throw new WorldletError('At most 50 items per write.');
 const old=new Map(ledger.records('items').filter(v=>typeof v.id==='string').map(v=>[v.id,v]));
 // Saved identities are computed once per write, not once per incoming item.
 const identities=new Map<string,string>();
 const identityOf=(row:Row)=>{let value=identities.get(row.id);if(value===undefined){value=identity(row);identities.set(row.id,value);}return value;};
 const ids:string[]=[];
 for(let item of items){
  const time=(key:string)=>{const value=Date.parse(item[key]);return typeof item[key]==='string'&&Number.isFinite(value)?value/1000:null;};
  core('worldItemValidate',{item,dates:{start:time('start'),end:time('end')}});
  if(!Array.isArray(item.sources))throw new WorldletError('Invalid world item.');
  // URL interpretation and source authorization remain host execution gates.
  for(const ref of item.sources)if(typeof ref?.url==='string'&&ref.url){
   let url:URL;try{url=new URL(ref.url);}catch{throw new WorldletError('Invalid source link.');}
   if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new WorldletError('Invalid source link.');
  }
  const itemIdentity=identity(item);
  const resolution:Row={item,identity:itemIdentity};
  if(typeof item.id==='string')resolution.previous=old.get(item.id);
  else{
   const matches=[...old.values()].filter(prior=>identityOf(prior)===itemIdentity||item.kind==='task'&&prior.kind==='task'&&prior.provider===item.provider&&prior.obligationIdentityVersion===1&&(prior.obligationIdentityAliases||[]).includes(itemIdentity));
   if(matches.length>1)throw new WorldletError('Several saved tasks match this evidence. Choose the existing task before updating it.');
   resolution.matchingID=matches[0]?.id;
  }
  const id=core<string>('worldItemResolveID',resolution);
  if(typeof id!=='string')throw new WorldletError('Invalid shared item identity.');
  if(!reviewed&&ledger.taskNeedsReview(item))throw new WorldletError('Review this changed task in Fox before updating the saved obligation.');
  const previous=old.get(id);
  item=core('worldItemPrepare',{item,previous:previous??{},id,identity:itemIdentity,run,now:iso(),previousIdentity:previous?identityOf(previous):''});
  ledger.put('items',id,item);old.set(id,item);identities.delete(id);ids.push(id);
 }
 return ids;
}

export class AttentionTables {
 upsert(this:WorldLedger,items:Row[],run:string,reviewed=false){return this.transaction(()=>writeItems(this,items,run,reviewed));}
 /** `items` is the items bucket when the caller already read it. */
 taskNeedsReview(this:WorldLedger,item:Row,items?:Row[]){
  if(typeof item.id!=='string')return false;
  const previous=items?items.find(row=>row.id===item.id):this.find('items',item.id);if(!previous)return false;
  core('worldItemResolveID',{item,previous,identity:identity(item)});
  return core('taskContinuityReview',{item,previous,identity:identity(item),previousIdentity:identity(previous)})===true;
 }
 /** Only validated source proposals enter this queue. The World UI owns the decision. */
 saveTaskProposals(this:WorldLedger,items:Row[],run:string){
  return this.transaction(()=>{
   const direct:Row[]=[],queued:Row[]=[];
   for(const original of items){
    let item={...original},candidates:Row[]=[];
    const itemIdentity=identity(item);
    if(item.id==null){
     const pending=this.records('task-reviews').find(row=>row.proposal&&identity(row.proposal)===itemIdentity);
     // A review queued before the same-evidence rule is dropped once it no longer needs the user.
     let stale=false;try{stale=!!pending&&!this.taskNeedsReview({...item,id:pending.previous?.id});}catch{}
     if(pending&&!stale){queued.push(pending);continue;}
     if(pending)this.delete('task-reviews',pending.id);
    }
    if(item.id==null&&item.kind==='task'){
     const matches=this.records('items').filter(prior=>prior.kind==='task'&&prior.provider===item.provider&&core('worldItemOwnerSourceMatch',{a:prior,b:item})===true);
     const known=matches.some(prior=>identity(prior)===itemIdentity||prior.obligationIdentityVersion===1&&(prior.obligationIdentityAliases||[]).includes(itemIdentity));
     if(!known&&matches.length){candidates=matches;item.id=matches[0].id;}
    }
    if(!this.taskNeedsReview(item)){direct.push(item);continue;}
    const previous=this.find('items',item.id)!;
    const id=digest('task-review:'+item.id+':'+itemIdentity);
    const existing=this.records('task-reviews');
    const saved=existing.find(row=>row.id===id);if(saved){queued.push(saved);continue;}
    if(existing.length>=100)throw new WorldletError('Review pending task changes in Fox before adding more.');
    const row={id,previous,candidates:candidates.length?candidates:[previous],proposal:item,runId:run,createdAt:iso()};
    this.put('task-reviews',id,row);queued.push(row);
   }
   const ids=writeItems(this,direct,run);
   return {ok:true,ids,persisted:true,taskReviews:queued,requiresReview:queued.length>0,guidance:queued.length?"Changed tasks await the user's choice in Fox. Do not claim they were updated or create a duplicate to bypass review.":'Findings saved.'};
  });
 }
 /** Drops queued reviews that no longer need the user (the same-evidence rule, or a task that is gone), so a
  * review saved by an older build never comes back on its own. Returns the reviews still waiting. */
 settledTaskReviews(this:WorldLedger){
  const waiting:Row[]=[],settled:string[]=[];
  // The items bucket is read once for every review, not once per review; unreadable items settle each one, as before.
  let items:Row[]|null|undefined;
  const loaded=()=>{if(items===undefined){try{items=this.records('items');}catch{items=null;}}if(!items)throw new WorldletError('Invalid world data; existing data was preserved.');return items;};
  for(const row of this.records('task-reviews')){
   if(typeof row.id!=='string')continue;
   let needed=false;
   try{needed=!!row.proposal&&typeof row.previous?.id==='string'&&this.taskNeedsReview({...row.proposal,id:row.previous.id},loaded());}catch{}
   if(needed)waiting.push(row);else settled.push(row.id);
  }
  if(settled.length)try{this.transaction(()=>{for(const id of settled)this.delete('task-reviews',id);});}catch{}
  return waiting;
 }
 /** Removes pending task reviews and browser receipts: all of them, or with a deletion scope only
  * those Core's localDeletionTrail ties to it (one item, one provider, a forgotten local source). */
 clearTaskReviews(this:WorldLedger,scope?:Row){
  const goes=(bucket:string,record:Row)=>!scope||core('localDeletionTrail',{...scope,bucket,record})===true;
  for(const row of this.records('browser-actions'))if(typeof row.id==='string'&&goes('browser-actions',row)){this.delete('browser-actions',row.id);this.delete('runtime-operations',row.id);}
  for(const row of this.records('task-reviews'))if(typeof row.id==='string'&&goes('task-reviews',row))this.delete('task-reviews',row.id);
 }
 resolveTaskReview(this:WorldLedger,id:string,choice:string,candidateID?:string){
  return this.transaction(()=>{
   const row=this.find('task-reviews',id);
   if(!['same','new','skip'].includes(choice)||!row?.previous||!row.proposal)throw new WorldletError('This task review is no longer available.');
   if(choice==='skip'){this.delete('task-reviews',id);return {ok:true};}
   const initial=row.previous,proposal={...row.proposal};
   const candidates:Row[]=Array.isArray(row.candidates)?row.candidates:[initial];
   const previous=candidates.find(c=>c.id===(candidateID??initial.id));
   if(!previous)throw new WorldletError('Choose one of the saved tasks in this review.');
   if(choice==='same')proposal.id=previous.id;
   const current=this.find('items',previous.id);
   const created=Date.parse(row.createdAt);
   if(!current||!sameJSON(current,previous)||!Number.isFinite(created)||Date.now()-created>=7*86400_000)throw new WorldletError('This task changed since the review. Ask Fox to read the source again, or dismiss this proposal.');
   if(choice==='new')delete proposal.id;
   const ids=writeItems(this,[proposal],'user-task-review',true);
   this.delete('task-reviews',id);
   return {ok:true,ids,status:choice==='same'?current.status??'open':'open'};
  });
 }
 update(this:WorldLedger,id:string,status:string,snoozedUntil?:string|null,readOnlyUpdate=false,by?:'fox'){
  this.transaction(()=>{
   const item=this.find('items',id);if(!item)throw new WorldletError('Unknown item or status.');
   const input:Row={item,status,now:iso(),readOnlyUpdate};if(snoozedUntil!=null)input.snoozedUntil=snoozedUntil;if(by)input.by=by;
   const decision=core('worldItemMutation',input);
   if(decision?.changed===true&&decision.item)this.put('items',id,decision.item);
  });
 }
 archive(this:WorldLedger,ids:string[]){
  if(!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw new WorldletError('Invalid archive selection.');
  return this.transaction(()=>{for(const id of ids)this.update(id,'dismissed');return ids.length;});
 }
 /** Undo of a Fox write: Core restores the exact prior status, including candidate. */
 restore(this:WorldLedger,snapshots:Row[]){
  const at=iso();
  this.transaction(()=>{for(const previous of snapshots){const item=typeof previous.id==='string'&&this.find('items',previous.id);if(!item)throw new WorldletError('Undo no longer matches this item.');this.put('items',previous.id,core('worldItemRestore',{item,previous,now:at}));}});
 }
 review(this:WorldLedger,id:string,assessment:string,reason:string,sources:Row[],run:string){
  let item=this.find('items',id);
  if(!item||core('worldItemMatchingOwnerSource',{a:item,b:{sources}})!==true)throw new WorldletError("A review needs fresh evidence from the item's own source.");
  const current=item.status??'candidate';
  item=core('worldItemReview',{item,assessment,reason,sources,now:iso()});
  this.transaction(()=>{this.put('items',id,item);this.put('reviews',run+':'+id,{id,runId:run,previousStatus:current,status:item.status,reason,sources,at:item.reviewedAt});});
 }
 requireFreshAttentionReview(this:WorldLedger){
  if(this.records('meta').some(row=>row.id==='attention-policy-v2'))return;
  this.transaction(()=>{
   for(const item of this.records('items')){
    if(core('worldItemNeedsReview',{item})!==true||typeof item.id!=='string')continue;
    this.put('attention-backup',item.id,item);
    this.put('items',item.id,{...item,status:'candidate',reviewReason:'Imported extraction needs current ownership and completion verification.'});
   }
   this.put('meta','attention-policy-v2',{id:'attention-policy-v2',version:2});
  });
 }
 replaceAttentionCache(this:WorldLedger,bucket:string,value:Row){
  if(!['attention-context','attention-budget'].includes(bucket))throw new WorldletError('Invalid attention cache.');
  this.transaction(()=>{this.delete(bucket,'current');this.put(bucket,'current',{...value,id:'current'});});
 }
 attentionFacts(this:WorldLedger):Row[]{const facts=this.records('attention-context')[0]?.facts;return Array.isArray(facts)?facts:[];}
 attentionBudget(this:WorldLedger):Row{return this.records('attention-budget')[0]??{};}
}
