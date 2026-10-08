import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {core} from '../core.ts';
import {digest,ensureDirectory,WorldletError} from '../files.ts';
import {swiftJSON,swiftFold,stableJSON,sameJSON} from './swift-json.ts';
import {WORLD_VIEWS_SQL} from '../../../../contracts/storage/world-views.ts';

type Row=Record<string,any>;
export class Cancelled extends Error {constructor(){super('Cancelled.');}}
const now=()=>Date.now()/1000;
const iso=()=>new Date().toISOString();
const RUNTIME_BUCKETS=['runtime-tasks','runtime-runs','runtime-generations','runtime-deliveries','runtime-operations'];

/** Worldlet's durable facts, independent of any Harness's conversation or memory files.
 * Only bound values reach SQL; an Agent never receives a SQL execution tool. */
export class WorldLedger {
 db:DatabaseSync|null;
 /** Library rows last committed through this connection; lets an unchanged save skip a re-encode. */
 private savedLibrary:{sources:string,knowledge:string}|null=null;
 readonly root:string;
 private readonly runtimeSpec:(owner:string)=>Row|null;
 constructor(root:string,runtimeSpec:(owner:string)=>Row|null=()=>null){
  this.root=root;this.runtimeSpec=runtimeSpec;
  ensureDirectory(root);
  const file=path.join(root,'world.sqlite');
  this.db=new DatabaseSync(file,{timeout:3000} as any);
  this.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS entries_at ON entries(at);
   CREATE INDEX IF NOT EXISTS entries_kind_key ON entries(kind,key,seq);`);
  this.migrateLegacyTables();
  this.exec(WORLD_VIEWS_SQL);
  this.exec('PRAGMA user_version=3;');
  try{fs.chmodSync(file,0o600);}catch{}
 }
 close(){this.db?.close();this.db=null;}
 private get handle(){if(!this.db)throw new WorldletError('The world database is closed.');return this.db;}
 exec(sql:string){try{this.handle.exec(sql);}catch{throw new WorldletError('Could not save world data.');}}
 private all(sql:string,...values:any[]):Row[]{return this.handle.prepare(sql).all(...values) as Row[];}
 private run(sql:string,...values:any[]){return this.handle.prepare(sql).run(...values);}
 private tableExists(name:string){return this.all("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name).length>0;}
 /** Version 2 kept a mutable record bucket beside an append-only stream; both now share entries. */
 private migrateLegacyTables(){
  if(!this.tableExists('events')&&!this.tableExists('records'))return;
  this.transaction(()=>{
   if(this.tableExists('events')){this.exec("INSERT INTO entries(seq,at,kind,key,body) SELECT seq,at,kind,COALESCE(applet,''),body FROM events ORDER BY seq;");this.exec('DROP TABLE events;');}
   if(this.tableExists('records')){this.exec("INSERT INTO entries(at,kind,key,body) SELECT strftime('%s','now'),'state.' || bucket,id,body FROM records;");this.exec('DROP TABLE records;');}
  });
 }
 transaction<T>(work:()=>T):T {
  const name='worldlet_'+crypto.randomUUID().replaceAll('-','');
  this.exec('SAVEPOINT '+name);
  try{const result=work();this.exec('RELEASE SAVEPOINT '+name);return result;}
  catch(error){try{this.handle.exec('ROLLBACK TO SAVEPOINT '+name);this.handle.exec('RELEASE SAVEPOINT '+name);}catch{}throw error;}
 }
 // What happened in this world, kept whole and local. Recording never runs a model and
 // never fails the action it describes.
 record(kind:string,key='',body:Row={},at=now()):boolean {
  if(!this.db||!kind||kind.length>64)return false;
  try{this.run('INSERT INTO entries(at,kind,key,body) VALUES(?,?,?,?)',at,kind,key,stableJSON(body));return true;}catch{return false;}
 }
 /** Identified history append; Core owns identity, so a retried (kind,key,id) adds no second row. */
 append(body:Row,key=''){
  if(!this.db||typeof body.kind!=='string'||typeof body.at!=='number')throw new WorldletError('Cannot save history event.');
  const plan=core('worldEventAppend',{kind:body.kind,key,at:body.at,observedAt:now(),body});
  try{this.run(plan.sql,...plan.values);}catch{throw new WorldletError('Cannot save history event.');}
 }
 /** Bounded query for the history tool. Filters are optional and combine. */
 queryWorldHistory(args:Row){
  const plan=core('worldHistoryQuery',args);
  const rows=this.all(plan.sql,...plan.values).map(raw=>{
   const row:Row={seq:Number(raw.seq),at:Number(raw.at)};
   if(raw.kind!=null)row.kind=String(raw.kind);if(raw.key!=null)row.key=String(raw.key);
   try{
    const body=JSON.parse(raw.body);if(body&&typeof body==='object'&&!Array.isArray(body)){
     row.body=body;
     const ref=body.data?.payloadRef;
     if(args.seq!=null&&typeof ref==='string'&&/^execution\/[a-zA-Z0-9_.-]{1,180}\.json$/.test(ref)){
      try{const payload=this.payload(ref.slice('execution/'.length,-'.json'.length));if(payload!==undefined)row.payload=payload;}catch{}
     }
    }
   }catch{}
   return row;
  });
  return core('worldHistoryPage',{rows,limit:plan.limit,ascending:plan.ascending,contentOffset:plan.contentOffset??null,total:this.eventCount()});
 }
 history({since,until,kind,kinds,key,limit=200,before,after}:{since?:number,until?:number,kind?:string,kinds?:readonly string[],key?:string,limit?:number,before?:number,after?:number}={}){
  let sql="SELECT seq,at,kind,key,body FROM entries WHERE kind NOT LIKE 'state.%'";const binds:any[]=[];
  if(since!=null){sql+=' AND at>=?';binds.push(since);}
  if(until!=null){sql+=' AND at<=?';binds.push(until);}
  if(kind){sql+=' AND kind=?';binds.push(kind);}
  if(kinds?.length){sql+=` AND kind IN (${kinds.map(()=>'?').join(',')})`;binds.push(...kinds);}
  if(key){sql+=' AND key=?';binds.push(key);}
  if(before!=null){sql+=' AND seq<?';binds.push(before);}
  if(after!=null){sql+=' AND seq>?';binds.push(after);}
  sql+=after==null?' ORDER BY seq DESC LIMIT ?':' ORDER BY seq ASC LIMIT ?';binds.push(Math.max(1,Math.min(1000,limit)));
  return this.all(sql,...binds).map(raw=>{const row:Row={seq:Number(raw.seq),at:Number(raw.at),kind:raw.kind,key:raw.key};try{const body=JSON.parse(raw.body);if(body&&Object.keys(body).length)row.body=body;}catch{}return row;});
 }
 eventCount(){return Number(this.all("SELECT COUNT(*) AS n FROM entries WHERE kind NOT LIKE 'state.%'")[0]?.n??0);}
 /** Current value per key of a state bucket. */
 records(bucket:string):Row[] {
  const kind='state.'+bucket;
  return this.all('SELECT body FROM entries WHERE kind=? AND seq IN (SELECT MAX(seq) FROM entries WHERE kind=? GROUP BY key) ORDER BY key',kind,kind).map(row=>{
   let value;try{value=JSON.parse(row.body);}catch{}
   if(!value||typeof value!=='object'||Array.isArray(value))throw new WorldletError('Invalid world data; existing data was preserved.');
   return value;
  });
 }
 find(bucket:string,id:string){return this.records(bucket).find(row=>row.id===id);}
 /** One key's current value in a state bucket, without reading the bucket's other values (large ones stay unread). */
 value(bucket:string,id:string):Row|null {
  const raw=this.all('SELECT body FROM entries WHERE kind=? AND key=? ORDER BY seq DESC LIMIT 1','state.'+bucket,id)[0];
  if(!raw)return null;let value;try{value=JSON.parse(raw.body);}catch{return null;}
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
 }
 put(bucket:string,id:string,value:Row){if(!this.record('state.'+bucket,id,value))throw new WorldletError('Cannot save world data.');}
 delete(bucket:string,id:string){try{this.run('DELETE FROM entries WHERE kind=? AND key=?','state.'+bucket,id);}catch{throw new WorldletError('Could not delete world data.');}}
 deleteRuntimeRecord(bucket:string,id:string){if(!RUNTIME_BUCKETS.includes(bucket))throw new WorldletError('Invalid runtime record.');this.delete(bucket,id);}
 /** Every stored revision of a state bucket (optionally one key), oldest first. */
 revisions(bucket:string,key?:string){
  const rows=key==null?this.all('SELECT seq,body FROM entries WHERE kind=? ORDER BY seq','state.'+bucket):this.all('SELECT seq,body FROM entries WHERE kind=? AND key=? ORDER BY seq','state.'+bucket,key);
  return rows.map(row=>{let body;try{body=JSON.parse(row.body);}catch{}if(!body||typeof body!=='object')throw new WorldletError('Invalid world data; existing data was preserved.');return {seq:Number(row.seq),body};});
 }

 // Items --------------------------------------------------------------------------------
 /** Evidence identity, byte-compatible with the Mac host's SHA-256 over sorted JSONSerialization. */
 static identity(item:Row){
  const provider=typeof item.provider==='string'?item.provider:'';
  const anchors=(Array.isArray(item.sources)?item.sources:[]).filter(ref=>ref?.provider===provider).map(ref=>{
   const quote=swiftFold(typeof ref.quote==='string'?ref.quote:'').split(/\s+/u).filter(Boolean).join(' ');
   return [typeof ref.remoteId==='string'?ref.remoteId:typeof ref.id==='string'?ref.id:'',provider==='gmail'&&item.kind!=='task'?'thread':quote];
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
  return digest(swiftJSON({provider,kind:item.kind??'',anchors}));
 }
 upsert(items:Row[],run:string,reviewed=false){return this.transaction(()=>this.writeItems(items,run,reviewed));}
 private writeItems(items:Row[],run:string,reviewed=false):string[] {
  if(items.length>50)throw new WorldletError('At most 50 items per write.');
  const old=new Map(this.records('items').filter(v=>typeof v.id==='string').map(v=>[v.id,v]));
  // Saved identities are computed once per write, not once per incoming item.
  const identities=new Map<string,string>();
  const identityOf=(row:Row)=>{let value=identities.get(row.id);if(value===undefined){value=WorldLedger.identity(row);identities.set(row.id,value);}return value;};
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
   const identity=WorldLedger.identity(item);
   const resolution:Row={item,identity};
   if(typeof item.id==='string')resolution.previous=old.get(item.id);
   else{
    const matches=[...old.values()].filter(prior=>identityOf(prior)===identity||item.kind==='task'&&prior.kind==='task'&&prior.provider===item.provider&&prior.obligationIdentityVersion===1&&(prior.obligationIdentityAliases||[]).includes(identity));
    if(matches.length>1)throw new WorldletError('Several saved tasks match this evidence. Choose the existing task before updating it.');
    resolution.matchingID=matches[0]?.id;
   }
   const id=core<string>('worldItemResolveID',resolution);
   if(typeof id!=='string')throw new WorldletError('Invalid shared item identity.');
   if(!reviewed&&this.taskNeedsReview(item))throw new WorldletError('Review this changed task in Fox before updating the saved obligation.');
   const previous=old.get(id);
   item=core('worldItemPrepare',{item,previous:previous??{},id,identity,run,now:iso(),previousIdentity:previous?identityOf(previous):''});
   this.put('items',id,item);old.set(id,item);identities.delete(id);ids.push(id);
  }
  return ids;
 }
 taskNeedsReview(item:Row){
  if(typeof item.id!=='string')return false;
  const previous=this.find('items',item.id);if(!previous)return false;
  core('worldItemResolveID',{item,previous,identity:WorldLedger.identity(item)});
  return core('taskContinuityReview',{item,previous,identity:WorldLedger.identity(item),previousIdentity:WorldLedger.identity(previous)})===true;
 }
 /** Only validated source proposals enter this queue. The World UI owns the decision. */
 saveTaskProposals(items:Row[],run:string){
  return this.transaction(()=>{
   const direct:Row[]=[],queued:Row[]=[];
   for(const original of items){
    let item={...original},candidates:Row[]=[];
    const identity=WorldLedger.identity(item);
    if(item.id==null){
     const pending=this.records('task-reviews').find(row=>row.proposal&&WorldLedger.identity(row.proposal)===identity);
     // A review queued before the same-evidence rule is dropped once it no longer needs the user.
     let stale=false;try{stale=!!pending&&!this.taskNeedsReview({...item,id:pending.previous?.id});}catch{}
     if(pending&&!stale){queued.push(pending);continue;}
     if(pending)this.delete('task-reviews',pending.id);
    }
    if(item.id==null&&item.kind==='task'){
     const matches=this.records('items').filter(prior=>prior.kind==='task'&&prior.provider===item.provider&&core('worldItemOwnerSourceMatch',{a:prior,b:item})===true);
     const known=matches.some(prior=>WorldLedger.identity(prior)===identity||prior.obligationIdentityVersion===1&&(prior.obligationIdentityAliases||[]).includes(identity));
     if(!known&&matches.length){candidates=matches;item.id=matches[0].id;}
    }
    if(!this.taskNeedsReview(item)){direct.push(item);continue;}
    const previous=this.find('items',item.id)!;
    const id=digest('task-review:'+item.id+':'+identity);
    const existing=this.records('task-reviews');
    const saved=existing.find(row=>row.id===id);if(saved){queued.push(saved);continue;}
    if(existing.length>=100)throw new WorldletError('Review pending task changes in Fox before adding more.');
    const row={id,previous,candidates:candidates.length?candidates:[previous],proposal:item,runId:run,createdAt:iso()};
    this.put('task-reviews',id,row);queued.push(row);
   }
   const ids=this.writeItems(direct,run);
   return {ok:true,ids,persisted:true,taskReviews:queued,requiresReview:queued.length>0,guidance:queued.length?"Changed tasks await the user's choice in Fox. Do not claim they were updated or create a duplicate to bypass review.":'Findings saved.'};
  });
 }
 /** Drops queued reviews that no longer need the user (the same-evidence rule, or a task that is gone), so a
  * review saved by an older build never comes back on its own. Returns the reviews still waiting. */
 settledTaskReviews(){
  const waiting:Row[]=[],settled:string[]=[];
  for(const row of this.records('task-reviews')){
   if(typeof row.id!=='string')continue;
   let needed=false;
   try{needed=!!row.proposal&&typeof row.previous?.id==='string'&&this.taskNeedsReview({...row.proposal,id:row.previous.id});}catch{}
   if(needed)waiting.push(row);else settled.push(row.id);
  }
  if(settled.length)try{this.transaction(()=>{for(const id of settled)this.delete('task-reviews',id);});}catch{}
  return waiting;
 }
 /** Removes pending task reviews and browser receipts: all of them, or with a deletion scope only
  * those Core's localDeletionTrail ties to it (one item, one provider, a forgotten local source). */
 clearTaskReviews(scope?:Row){
  const goes=(bucket:string,record:Row)=>!scope||core('localDeletionTrail',{...scope,bucket,record})===true;
  for(const row of this.records('browser-actions'))if(typeof row.id==='string'&&goes('browser-actions',row)){this.delete('browser-actions',row.id);this.delete('runtime-operations',row.id);}
  for(const row of this.records('task-reviews'))if(typeof row.id==='string'&&goes('task-reviews',row))this.delete('task-reviews',row.id);
 }
 resolveTaskReview(id:string,choice:string,candidateID?:string){
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
   const ids=this.writeItems([proposal],'user-task-review',true);
   this.delete('task-reviews',id);
   return {ok:true,ids,status:choice==='same'?current.status??'open':'open'};
  });
 }
 update(id:string,status:string,snoozedUntil?:string|null,readOnlyUpdate=false,by?:'fox'){
  this.transaction(()=>{
   const item=this.find('items',id);if(!item)throw new WorldletError('Unknown item or status.');
   const input:Row={item,status,now:iso(),readOnlyUpdate};if(snoozedUntil!=null)input.snoozedUntil=snoozedUntil;if(by)input.by=by;
   const decision=core('worldItemMutation',input);
   if(decision?.changed===true&&decision.item)this.put('items',id,decision.item);
  });
 }
 archive(ids:string[]){
  if(!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw new WorldletError('Invalid archive selection.');
  return this.transaction(()=>{for(const id of ids)this.update(id,'dismissed');return ids.length;});
 }
 /** Undo of a Fox write: Core restores the exact prior status, including candidate. */
 restore(snapshots:Row[]){
  const at=iso();
  this.transaction(()=>{for(const previous of snapshots){const item=typeof previous.id==='string'&&this.find('items',previous.id);if(!item)throw new WorldletError('Undo no longer matches this item.');this.put('items',previous.id,core('worldItemRestore',{item,previous,now:at}));}});
 }
 review(id:string,assessment:string,reason:string,sources:Row[],run:string){
  let item=this.find('items',id);
  if(!item||core('worldItemMatchingOwnerSource',{a:item,b:{sources}})!==true)throw new WorldletError("A review needs fresh evidence from the item's own source.");
  const current=item.status??'candidate';
  item=core('worldItemReview',{item,assessment,reason,sources,now:iso()});
  this.transaction(()=>{this.put('items',id,item);this.put('reviews',run+':'+id,{id,runId:run,previousStatus:current,status:item.status,reason,sources,at:item.reviewedAt});});
 }
 requireFreshAttentionReview(){
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

 // Browser receipts ----------------------------------------------------------------------
 beginBrowserAction(label:string,url:URL,taskID:string|undefined,attemptKey:string){
  return this.transaction(()=>{
   const id=crypto.randomUUID().toUpperCase();
   const input:Row={id,label,origin:'https://'+url.hostname,attemptKey,items:this.records('items'),receipts:this.records('browser-actions'),now:now()};
   if(taskID)input.taskID=taskID;
   const row=core('browserReceiptBegin',input);
   this.prepareRuntimeOperation(id,'browser','browser.submit',digest(row.origin??''));
   this.transitionRuntimeOperation(id,'submit');
   this.put('browser-actions',id,row);return row;
  });
 }
 browserAction(id:string){const row=this.find('browser-actions',id);if(!row)throw new WorldletError('This browser action is no longer available.');return row;}
 observeBrowserAction(id:string,url:string){
  return this.transaction(()=>{
   let origin='';try{const value=new URL(url);if(value.protocol==='https:')origin='https://'+value.hostname;}catch{}
   const row=core('browserReceiptObserve',{receipt:this.browserAction(id),origin,now:now()});
   this.put('browser-actions',id,row);return row;
  });
 }
 resolveBrowserAction(id:string,done:boolean){
  return this.transaction(()=>{
   const decision=core('browserReceiptResolve',{receipt:this.browserAction(id),done,items:this.records('items'),now:now()});
   if(!decision?.receipt||typeof decision.event!=='string')throw new WorldletError('Invalid browser confirmation.');
   const row={...decision.receipt};
   // The receipt is Fox's own browser action, so the task is one Fox completed.
   if(typeof decision.completeTaskID==='string')this.update(decision.completeTaskID,'done',undefined,false,'fox');
   const operation=this.prepareRuntimeOperation(id,'browser','browser.submit',digest(row.origin??''));
   if(operation.status==='prepared')this.transitionRuntimeOperation(id,'submit');
   this.transitionRuntimeOperation(id,decision.event);
   row.operationId=id;this.put('browser-actions',id,row);return row;
  });
 }

 // Deletion ------------------------------------------------------------------------------
 /** Replaces one stored revision's body, or deletes it for null; an unchanged body is left alone. */
 private rewriteEntry(seq:unknown,body:Row,replacement:Row|null){
  if(replacement&&sameJSON(replacement,body))return;
  try{
   if(replacement)this.run('UPDATE entries SET body=? WHERE seq=?',stableJSON(replacement),seq);
   else this.run('DELETE FROM entries WHERE seq=?',seq);
  }catch{throw new WorldletError('Could not remove source history.');}
 }
 /** Rewrites every past revision of a bucket in place; null removes that revision. */
 private scrubRevisions(bucket:string,scrub:(item:Row)=>Row|null){
  for(const revision of this.revisions(bucket))this.rewriteEntry(revision.seq,revision.body,scrub(revision.body));
 }
 private scrubHistory(gone:string[],scrub:(item:Row)=>Row|null,source:string){
  this.forgetTrail(gone,source);
  for(const bucket of ['items','attention-backup','reviews'])this.scrubRevisions(bucket,scrub);
 }
 /** Rows that exist only because an item did: its review reasons and pre-migration copy. */
 private forgetTrail(ids:string[],source:string){
  this.clearTaskReviews({gone:ids,source});
  if(!ids.length)return;
  const set=new Set(ids);
  for(const id of set)this.delete('attention-backup',id);
  for(const row of this.records('reviews'))if(set.has(row.id)&&typeof row.runId==='string')this.delete('reviews',row.runId+':'+row.id);
 }
 /** A forgotten local source leaves no copy, including in past item revisions and reviews. */
 forgetLocalSource(source:string){
  this.transaction(()=>{
   const scrub=(item:Row)=>{
    if(!Array.isArray(item.sources))return item;
    const remaining=item.sources.filter(ref=>!(ref?.local===true&&ref.id===source));
    if(remaining.length===item.sources.length)return item;
    return remaining.length?{...item,sources:remaining}:null;
   };
   const gone:string[]=[];
   for(const item of this.records('items'))if(typeof item.id==='string'&&scrub(item)===null){this.delete('items',item.id);gone.push(item.id);}
   this.scrubHistory(gone,scrub,source);
  });
 }
 /** Applies Core's localDeletionRecord to every revision of the scope's buckets, invalidates
  * runtime work and saves the trimmed library in one transaction. The files to remove are
  * recorded in that transaction and removed by finishLocalDeletionFiles, retried on reopen. */
 deleteLocalContent(scope:Row,library:Row,paths:string[]){
  const provider=scope.provider??null,item=typeof scope.item==='string'?scope.item:undefined,gone:string[]=[];
  const scrub=(bucket:string,key:string,record:Row)=>core<Row|null>('localDeletionRecord',{provider,item,bucket,key,record,gone});
  for(const file of paths)if(!WorldLedger.deletionPath(file))throw new WorldletError('Invalid local deletion cleanup path.');
  try{
   return this.transaction(()=>{
    for(const row of this.records('items'))if(typeof row.id==='string'&&scrub('items',row.id,row)===null)gone.push(row.id);
    if(item!==undefined&&!gone.length)return 0;
    const owners=item!==undefined?[]:provider===null?this.records('runtime-tasks').map(row=>row.ownerId).filter(owner=>typeof owner==='string'):[provider];
    for(const owner of new Set([...owners,'attention-center']))this.invalidateRuntimeTasks(owner);
    // Browser actions are the task-review trail Core removes: only the deleted item's or provider's.
    if(scope.buckets.includes('task-reviews'))this.clearTaskReviews({provider,...item!==undefined?{item}:{},gone});
    for(const bucket of scope.buckets){
     for(const revision of this.all('SELECT seq,key,body FROM entries WHERE kind=? ORDER BY seq','state.'+bucket)){
      let record;try{record=JSON.parse(revision.body);}catch{}
      if(!record||typeof record!=='object')throw new WorldletError('Invalid world data; existing data was preserved.');
      this.rewriteEntry(revision.seq,record,scrub(bucket,String(revision.key),record));
     }
    }
    this.saveLibrary(library);
    if(paths.length){const id=crypto.randomUUID();this.put('local-deletion-files',id,{id,paths});}
    return gone.length;
   });
  }catch(error){this.savedLibrary=null;throw error;}
 }
 /** Library-relative directories a deletion may remove: the World layout, caches and per-source copies. */
 static deletionPath(file:unknown){
  if(typeof file!=='string')return false;
  if(file==='world'||file==='cache')return true;
  const match=/^(sources|knowledge|cache\/knowledge)\/([^/]+)$/.exec(file);
  return !!match&&WorldLedger.safeLibraryComponent(match[2]);
 }
 finishLocalDeletionFiles(){
  for(const job of this.records('local-deletion-files')){
   const paths:unknown[]=Array.isArray(job.paths)?job.paths:[];
   if(!paths.every(WorldLedger.deletionPath))throw new WorldletError('Invalid local deletion cleanup path.');
   for(const file of paths as string[])fs.rmSync(path.join(this.root,...file.split('/')),{recursive:true,force:true});
   this.delete('local-deletion-files',job.id);
  }
 }
 replaceAttentionCache(bucket:string,value:Row){
  if(!['attention-context','attention-budget'].includes(bucket))throw new WorldletError('Invalid attention cache.');
  this.transaction(()=>{this.delete(bucket,'current');this.put(bucket,'current',{...value,id:'current'});});
 }
 replaceAppletState(bucket:string,provider:string,value:Row){
  if(!['applet-observations','applet-findings','applet-cursors'].includes(bucket))throw new WorldletError('Invalid Applet state.');
  this.transaction(()=>{this.delete(bucket,provider);this.put(bucket,provider,{...value,id:provider,provider});});
 }
 forgetAppletState(provider:string){
  this.transaction(()=>{
   this.invalidateRuntimeTasks(provider);
   this.invalidateRuntimeTasks('attention-center');
   for(const row of this.records('runtime-operations'))if(row.ownerId===provider&&typeof row.id==='string')this.delete('runtime-operations',row.id);
   for(const row of this.records('runtime-deliveries'))if(row.provider===provider&&typeof row.id==='string')this.delete('runtime-deliveries',row.id);
   for(const bucket of ['applet-observations','applet-findings','applet-cursors'])this.delete(bucket,provider);
  });
 }
 attentionFacts():Row[]{const facts=this.records('attention-context')[0]?.facts;return Array.isArray(facts)?facts:[];}
 attentionBudget():Row{return this.records('attention-budget')[0]??{};}

 // Execution bookkeeping -----------------------------------------------------------------
 static runsPerProvider=100;
 /** Check and run rows keep only their current revision; each provider keeps its newest receipts. */
 pruneExecution(){
  for(const bucket of ['checks','runs'])this.run('DELETE FROM entries WHERE kind=? AND seq NOT IN (SELECT MAX(seq) FROM entries WHERE kind=? GROUP BY key)','state.'+bucket,'state.'+bucket);
  const groups=new Map<string,Row[]>();
  for(const run of this.records('runs')){const key=run.provider??'';groups.set(key,[...(groups.get(key)||[]),run]);}
  for(const runs of groups.values()){
   if(runs.length<=WorldLedger.runsPerProvider)continue;
   for(const run of runs.sort((a,b)=>(b.startedAt??0)-(a.startedAt??0)).slice(WorldLedger.runsPerProvider))if(typeof run.id==='string'&&run.status!=='running')this.delete('runs',run.id);
  }
 }
 recoverInterruptedChecks(){
  // Each runtime settlement owns its transaction; they are idempotent, so recovery can resume.
  this.recoverRuntimeTasks();
  this.recoverRuntimeOperations();
  this.transaction(()=>{
   for(const bucket of ['checks','runs']){
    const key=bucket==='checks'?'lastStatus':'status';
    for(const row of this.records(bucket)){
     if(row[key]!=='running'||typeof row.id!=='string')continue;
     const next={...row,[key]:'error',error:'The previous check was interrupted. Saved items are kept.'};
     if(bucket==='checks'&&row.enabled===true)next.nextAt=now()+60;
     if(bucket==='runs'){next.finishedAt=now();next.errorCode='interrupted';}
     this.put(bucket,row.id,next);
    }
   }
   const budget=this.records('attention-budget')[0];
   if(budget?.lastStatus==='running'){this.delete('attention-budget','current');this.put('attention-budget','current',{...budget,lastStatus:'error',lastErrorCode:'interrupted',nextAt:now()+60});}
  });
 }
 /** One-time import of legacy Knowledge into items; index.json and originals stay. */
 migrate(state:{sources:Row[],knowledge:Row[]}){
  if(this.records('meta').length)return;
  this.transaction(()=>{
   const originals:Row={};
   for(const source of state.sources){
    if(!source.enabled||!state.knowledge.some(k=>k.sourceId===source.id&&k.sourceRevision===source.revision))continue;
    const file=path.resolve(this.root,source.blob);
    if(!file.startsWith(path.resolve(this.root)+path.sep))continue;
    try{const original=JSON.parse(fs.readFileSync(file,'utf8'));const raw=JSON.parse(original.raw);if(raw&&typeof raw==='object')originals[source.id]=Object.fromEntries(Object.entries(raw).filter(([key])=>key==='id'||key==='threadId'));}catch{}
   }
   const migrated=core<Row[]>('worldItemsMigrate',{sources:state.sources,knowledge:state.knowledge,originals});
   for(const row of migrated){
    if(typeof row.identitySeed!=='string'||!row.item)throw new WorldletError('Invalid item migration result.');
    const id=digest(row.identitySeed);this.put('items',id,{...row.item,id});
   }
   this.put('meta','migration',{id:'migration',version:1});
  });
 }

 // Runtime tasks (claims, leases and settlement decisions live in shared Core) -------------
 private generation(owner:string){return Number(this.find('runtime-generations',owner)?.generation??0);}
 private recordTaskExecution(claim:Row){for(const event of core<Row[]>('taskExecutionEvents',claim))this.append(event,event.taskId??'');}
 claimRuntimeTask(taskID:string,owner:string,pool:string,runID:string){
  return this.transaction(()=>{
   const old=this.find('runtime-tasks',taskID);
   const lease=core<number>('runtimeTaskLease',{taskId:taskID,spec:this.runtimeSpec(owner)??{}});
   if(typeof lease!=='number')throw new WorldletError('Invalid runtime lease policy');
   const input:Row={taskId:taskID,ownerId:owner,pool,generation:this.generation(owner),runId:runID,now:now(),leaseSeconds:lease};
   if(old)input.task=old;
   if(typeof old?.runId==='string')input.previousRun=this.find('runtime-runs',old.runId);
   const claim=core('runtimeTaskClaim',input);
   if(!claim?.task||!claim.run)return false;
   if(typeof claim.supersededRun?.id==='string'){this.deleteRuntimeRecord('runtime-runs',claim.supersededRun.id);this.put('runtime-runs',claim.supersededRun.id,claim.supersededRun);}
   this.deleteRuntimeRecord('runtime-tasks',taskID);this.put('runtime-tasks',taskID,claim.task);
   this.put('runtime-runs',runID,claim.run);
   this.recordTaskExecution(claim);
   return true;
  });
 }
 finishRuntimeTask(taskID:string,runID:string,status:string,nextAt:number,errorCode?:string|null,waitReason?:string|null,failures?:number|null){
  return this.transaction(()=>{
   const task=this.find('runtime-tasks',taskID),run=this.find('runtime-runs',runID);
   if(!task||typeof task.ownerId!=='string'||!run)return false;
   const input:Row={task,run,now:now(),generation:this.generation(task.ownerId),status,nextAt};
   if(errorCode!=null)input.errorCode=errorCode;if(waitReason!=null)input.waitReason=waitReason;if(failures!=null)input.failures=failures;
   const result=core('runtimeTaskFinish',input);
   if(!result?.task||!result.run)return false;
   this.deleteRuntimeRecord('runtime-tasks',taskID);this.put('runtime-tasks',taskID,result.task);
   this.deleteRuntimeRecord('runtime-runs',runID);this.put('runtime-runs',runID,result.run);
   this.recordTaskExecution(result);
   for(const id of core<string[]>('runtimeRunPrune',{taskId:taskID,runs:this.records('runtime-runs')}))this.deleteRuntimeRecord('runtime-runs',id);
   return true;
  });
 }
 /** Claim validation and the writes in `body` share one transaction; `body` must be synchronous. */
 withRuntimeOutput<T>(taskID:string,runID:string,body:()=>T):T {
  return this.transaction(()=>{
   const task=this.find('runtime-tasks',taskID),run=this.find('runtime-runs',runID);
   if(!task||typeof task.ownerId!=='string'||!run)throw new Cancelled();
   if(core('runtimeClaimCanWrite',{task,run,generation:this.generation(task.ownerId),now:now()})!==true)throw new Cancelled();
   return body();
  });
 }
 setRuntimeTasksEnabled(owner:string,enabled:boolean){
  this.transaction(()=>{
   for(let task of this.records('runtime-tasks').filter(row=>row.ownerId===owner)){
    if(typeof task.id!=='string')continue;
    if(!enabled&&task.status==='running'&&typeof task.runId==='string'){
     this.finishRuntimeTask(task.id,task.runId,'cancelled',task.nextAt??0,'paused');
     const receipt=this.records('runs').find(row=>row.id===task.runId&&row.status==='running');
     if(receipt)this.put('runs',task.runId,{...receipt,status:'cancelled',errorCode:'paused',finishedAt:now()});
     task=this.find('runtime-tasks',task.id)??task;
    }
    const updated=core('runtimeTaskEnabled',{task,enabled});
    this.deleteRuntimeRecord('runtime-tasks',task.id);this.put('runtime-tasks',task.id,updated);
   }
  });
 }
 invalidateRuntimeTasks(owner:string){
  this.transaction(()=>{
   for(const task of this.records('runtime-tasks'))if(task.ownerId===owner&&task.status==='running'&&typeof task.id==='string'&&typeof task.runId==='string')this.finishRuntimeTask(task.id,task.runId,'interrupted',0,'configuration_changed');
   const generation=this.generation(owner)+1;
   this.deleteRuntimeRecord('runtime-generations',owner);this.put('runtime-generations',owner,{id:owner,generation});
   const taskIDs=new Set(this.records('runtime-tasks').filter(row=>row.ownerId===owner).map(row=>row.id).filter(Boolean));
   for(const id of taskIDs)this.deleteRuntimeRecord('runtime-tasks',id);
   for(const row of this.records('runtime-runs'))if(taskIDs.has(row.taskId)&&typeof row.id==='string')this.deleteRuntimeRecord('runtime-runs',row.id);
  });
 }
 configureRuntimeSource(check:Row){
  if(typeof check.provider!=='string')throw new WorldletError('Missing source owner.');
  const id='applet:'+check.provider+':check';
  this.transaction(()=>{const task=this.find('runtime-tasks',id);if(!task)return;const next=core('runtimeSourceConfigure',{task,check});this.deleteRuntimeRecord('runtime-tasks',id);this.put('runtime-tasks',id,next);});
 }
 recoverRuntimeTasks(){for(const row of this.records('runtime-tasks'))if(row.status==='running'&&typeof row.id==='string'&&typeof row.runId==='string')this.finishRuntimeTask(row.id,row.runId,'interrupted',now(),'process_interrupted');}

 // Runtime operations (external writes with uncertain outcomes) ----------------------------
 prepareRuntimeOperation(id:string,owner:string,command:string,scope:string){
  return this.transaction(()=>{
   const existing=this.find('runtime-operations',id);
   const input:Row={id,ownerId:owner,command,scope,reference:id,now:now()};if(existing)input.existing=existing;
   const row=core('runtimeOperationPrepare',input);
   if(!existing)this.put('runtime-operations',id,row);
   return row;
  });
 }
 transitionRuntimeOperation(id:string,event:string){
  return this.transaction(()=>{
   const row=this.find('runtime-operations',id);if(!row)throw new WorldletError('Operation is unavailable.');
   const next=core('runtimeOperationTransition',{operation:row,event,now:now()});
   this.deleteRuntimeRecord('runtime-operations',id);this.put('runtime-operations',id,next);
   return next;
  });
 }
 recoverRuntimeOperations(){this.transaction(()=>{for(const row of this.records('runtime-operations'))if(row.status==='submitted'&&typeof row.id==='string')this.transitionRuntimeOperation(row.id,'uncertain');});}

 // Runtime deliveries ----------------------------------------------------------------------
 runtimeSubscriptions():Row[] {
  const rows=this.records('runtime-subscriptions');
  if(!rows.some(row=>row.consumerId==='attention:center'))rows.push({consumerId:'attention:center',providers:['*'],enabled:true});
  return core('runtimeSubscriptions',{rows});
 }
 /** Trusted host API. Registration does not grant source permissions or start an executor. */
 registerRuntimeSubscription(subscription:Row){
  this.transaction(()=>{
   if(typeof subscription.consumerId!=='string')throw new WorldletError('Missing subscriber.');
   const rows=[...this.runtimeSubscriptions().filter(row=>row.consumerId!==subscription.consumerId),subscription];
   core('runtimeSubscriptions',{rows});
   this.put('runtime-subscriptions',subscription.consumerId,subscription);
   if(subscription.consumerId==='attention:center')this.invalidateRuntimeTasks('attention-center');
   this.publishAttentionFacts(this.attentionFacts());
  });
 }
 subscribedAttentionProviders(providers:string[]){
  const sub=this.runtimeSubscriptions().find(row=>row.consumerId==='attention:center');
  if(sub?.enabled!==true)return [];
  const selected:string[]=sub.providers||[];
  return providers.filter(p=>selected.includes('*')||selected.includes(p));
 }
 attentionInputBudget(){
  const budget={...this.attentionBudget()};
  const rows=this.records('runtime-deliveries').filter(row=>row.consumerId==='attention:center');
  if(rows.length)budget.seen=Object.fromEntries(rows.filter(row=>row.status==='acknowledged'&&typeof row.entityId==='string'&&(typeof row.revision==='number'||typeof row.revision==='string')).map(row=>[row.entityId,row.revision]));
  return budget;
 }
 /** Facts and delivery metadata share a commit; payloads stay in the bounded context. */
 publishAttentionFacts(facts:Row[]){
  this.transaction(()=>{
   const budget=this.attentionBudget();
   const rows=core<Row[]>('runtimeDeliveries',{rows:this.records('runtime-deliveries'),facts,seen:budget.seen??{},subscriptions:this.runtimeSubscriptions(),now:now()});
   this.replaceAttentionCache('attention-context',{id:'current',facts});
   this.saveDeliveries(rows);
  });
 }
 acknowledgeRuntimeDeliveries(consumer:string,seeds:Row[]){
  this.transaction(()=>{
   if(!this.runtimeSubscriptions().some(row=>row.consumerId===consumer&&row.enabled===true))throw new Cancelled();
   this.saveDeliveries(core('runtimeDeliveriesAck',{rows:this.records('runtime-deliveries'),seeds,consumerId:consumer,now:now()}));
  });
 }
 acknowledgeAttentionDeliveries(seeds:Row[]){this.acknowledgeRuntimeDeliveries('attention:center',seeds);}
 failAttentionDeliveries(seeds:Row[],code:string,isolated:boolean){this.saveDeliveries(core('runtimeDeliveriesFail',{rows:this.records('runtime-deliveries'),seeds,consumerId:'attention:center',code,isolated}));}
 retryAttentionQuarantine(){
  this.transaction(()=>{
   const rows=core<Row[]>('runtimeDeliveriesRetry',{rows:this.records('runtime-deliveries'),consumerId:'attention:center'});
   this.invalidateRuntimeTasks('attention-center');
   this.saveDeliveries(rows);
   this.replaceAttentionCache('attention-budget',{...this.attentionBudget(),nextAt:0,failures:0});
  });
 }
 private saveDeliveries(rows:Row[]){
  for(const row of this.records('runtime-deliveries'))if(typeof row.id==='string')this.deleteRuntimeRecord('runtime-deliveries',row.id);
  for(const row of rows)if(typeof row.id==='string')this.put('runtime-deliveries',row.id,row);
 }

 // Formal library tables -------------------------------------------------------------------
 static safeLibraryComponent(value:string){return !!value&&value!=='.'&&value!=='..'&&!/[\\/\0]/.test(value);}
 /** Loads Sources/Knowledge; a fresh database imports the configuration's legacy arrays once. */
 loadLibrary(state:Row){
  if(state.libraryStorageVersion!=null&&state.libraryStorageVersion!==1)throw new WorldletError('This library needs a newer Worldlet.');
  const markers=this.all("SELECT value FROM library_meta WHERE key='version'");
  if(!markers.length){
   if(state.libraryStorageVersion!=null)throw new WorldletError('The World library database is missing. Restore its backup before continuing.');
   this.saveLibrary(state);
  }else if(String(markers[0].value)!=='1')throw new WorldletError('This library database needs a newer Worldlet.');
  const sources=this.all('SELECT body FROM sources ORDER BY position,id').map(row=>JSON.parse(row.body));
  for(const source of sources){
   const parts=String(source.blob).split('/');
   if(!WorldLedger.safeLibraryComponent(source.id)||!WorldLedger.safeLibraryComponent(source.revision)||!String(source.blob).startsWith('sources/'+source.id+'/')||!String(source.blob).endsWith('.json')||!parts.every(WorldLedger.safeLibraryComponent))throw new WorldletError('Invalid library source identity; originals were preserved.');
  }
  state.sources=sources;
  state.knowledge=this.all('SELECT body FROM knowledge ORDER BY position,source_id').map(row=>JSON.parse(row.body));
  state.libraryStorageVersion=1;
  this.savedLibrary={sources:stableJSON(state.sources),knowledge:stableJSON(state.knowledge)};
 }
 /** Only changed rows are written; their metadata journal commits atomically. */
 saveLibrary(state:Row){
  const sources:Row[]=state.sources||[],knowledge:Row[]=state.knowledge||[];
  if(new Set(sources.map(s=>s.id)).size!==sources.length||new Set(knowledge.map(k=>k.sourceId)).size!==knowledge.length)throw new WorldletError('Duplicate library identity. Existing data was preserved.');
  const byID=new Map(sources.map(s=>[s.id,s]));
  if(!knowledge.every(k=>byID.has(k.sourceId)))throw new WorldletError('Knowledge has no original source. Existing data was preserved.');
  const encoded={sources:stableJSON(sources),knowledge:stableJSON(knowledge)};
  if(this.savedLibrary&&this.savedLibrary.sources===encoded.sources&&this.savedLibrary.knowledge===encoded.knowledge)return;
  this.transaction(()=>{
   const oldSources=this.all('SELECT body FROM sources').map(row=>JSON.parse(row.body));
   const oldKnowledge=this.all('SELECT body FROM knowledge').map(row=>JSON.parse(row.body));
   const priorSources=new Map(oldSources.map(s=>[s.id,stableJSON(s)]));
   const priorKnowledge=new Map(oldKnowledge.map(k=>[k.sourceId,stableJSON(k)]));
   const journal=(domain:string,id:string,revision:string,operation:string)=>{if(!this.record('library.'+operation,id,{domain,revision}))throw new WorldletError('Cannot save library history.');};
   const knowledgeIDs=new Set(knowledge.map(k=>k.sourceId));
   for(const old of oldKnowledge)if(!knowledgeIDs.has(old.sourceId)){this.run('DELETE FROM knowledge WHERE source_id=?',old.sourceId);journal('knowledge',old.sourceId,old.sourceRevision??'','deleted');}
   for(const old of oldSources)if(!byID.has(old.id)){this.run('DELETE FROM sources WHERE id=?',old.id);journal('sources',old.id,old.revision,'deleted');}
   sources.forEach((source,position)=>{
    const body=stableJSON(source);
    if(priorSources.get(source.id)!==body){
     this.run('INSERT INTO sources(id,revision,body,position) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,position=excluded.position',source.id,source.revision,body,position);
     journal('sources',source.id,source.revision,'saved');
    }else this.run('UPDATE sources SET position=? WHERE id=? AND position!=?',position,source.id,position);
   });
   knowledge.forEach((item,position)=>{
    const body=stableJSON(item);
    if(priorKnowledge.get(item.sourceId)!==body){
     this.run('INSERT INTO knowledge(source_id,source_revision,processing_version,body,position) VALUES(?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET source_revision=excluded.source_revision,processing_version=excluded.processing_version,body=excluded.body,position=excluded.position',item.sourceId,item.sourceRevision??'legacy',String(item.activityVersion??0),body,position);
     journal('knowledge',item.sourceId,item.sourceRevision??'legacy','saved');
    }else this.run('UPDATE knowledge SET position=? WHERE source_id=? AND position!=?',position,item.sourceId,position);
   });
   const changed=new Set(oldSources.filter(s=>byID.get(s.id)?.revision!==s.revision).map(s=>s.id));
   if(changed.size)for(const item of this.records('items')){
    if(typeof item.id==='string'&&Array.isArray(item.sources)&&item.sources.some(ref=>ref?.local===true&&changed.has(ref.id)))this.put('items',item.id,{...item,attentionInvalidated:true});
   }
   this.run("INSERT INTO library_meta(key,value) VALUES('version','1') ON CONFLICT(key) DO NOTHING");
  });
  this.savedLibrary=encoded;
 }
 /** Consistent copy for backups, through SQLite rather than copying a live WAL file. */
 /** A copy for backup, without the search index (derived; rebuilt when the copy is opened). */
 snapshotTo(file:string){
  fs.rmSync(file,{force:true});this.handle.prepare('VACUUM INTO ?').run(file);
  const copy=new DatabaseSync(file);
  try{
   // Search indexes are rebuilt on open.
   const indexes=(copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('companion_turns_search','companion_notes_search')").all() as Row[]).map(row=>String(row.name));
   if(indexes.length){for(const name of indexes)copy.exec(`DROP TABLE ${name}`);copy.exec('VACUUM');}
  }finally{copy.close();}
 }

 // Conversations and notes ----------------------------------------------------------------------
 // Fox's own conversation turns and everything brought from another Agent share one table, marked
 // by `source` ('fox', or the Agent it came from), plus one table of notes an Agent wrote itself
 // (owner decision 2026-10-03: whatever can be in SQLite is; the companion profile stays a small
 // JSON file). A trigram full-text index makes substring search fast in any language; it is
 // derived, left out of backups and rebuilt when missing. Writes keep it current by hand because
 // a World database never carries triggers (`shell/backup.ts`).
 static readonly OWN='fox';
 private companionReady=false;
 private searchable=false;
 private ensureCompanion(){
  if(this.companionReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS companion_turns (id TEXT PRIMARY KEY, source TEXT NOT NULL, session TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, thread TEXT NOT NULL DEFAULT '');
   CREATE INDEX IF NOT EXISTS companion_turns_source ON companion_turns(source, created_at);
   CREATE INDEX IF NOT EXISTS companion_turns_time ON companion_turns(created_at);
   CREATE TABLE IF NOT EXISTS companion_notes (id TEXT PRIMARY KEY, source TEXT NOT NULL, session TEXT NOT NULL, date TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS companion_notes_source ON companion_notes(source);`);
  // The first version had no thread: a brought turn's thread is its own conversation; Fox's
  // earlier turns stay in no particular context ('').
  if(!this.all("SELECT 1 FROM pragma_table_info('companion_turns') WHERE name='thread'").length)this.transaction(()=>{
   this.exec(`ALTER TABLE companion_turns ADD COLUMN thread TEXT NOT NULL DEFAULT '';UPDATE companion_turns SET thread=session WHERE source<>'${WorldLedger.OWN}';`);
  });
  this.exec('CREATE INDEX IF NOT EXISTS companion_turns_thread ON companion_turns(source, thread, created_at);');
  this.moveBroughtTables();
  try{
   const missing=!this.tableExists('companion_turns_search')||!this.tableExists('companion_notes_search');
   if(missing)this.transaction(()=>{
    for(const table of ['companion_turns','companion_notes']){
     this.handle.exec(`DROP TABLE IF EXISTS ${table}_search;CREATE VIRTUAL TABLE ${table}_search USING fts5(text, content='${table}', content_rowid='rowid', tokenize='trigram', detail='none');INSERT INTO ${table}_search(${table}_search) VALUES('rebuild');`);
    }
   });
   this.searchable=true;
  }catch{this.searchable=false;}
  this.companionReady=true;
 }
 /** The first version kept brought history in `brought_*` tables; they join the shared ones once. */
 private moveBroughtTables(){
  if(!this.tableExists('brought_messages'))return;
  this.transaction(()=>{
   this.exec(`INSERT OR IGNORE INTO companion_turns(id,source,session,role,text,created_at,thread) SELECT m.id,m.source,c.session,m.role,m.text,m.created_at,c.session FROM brought_messages m JOIN brought_conversations c ON c.id=m.conversation_id;
    INSERT OR IGNORE INTO companion_notes(id,source,session,date,text,created_at) SELECT id,source,session,date,text,created_at FROM brought_notes;
    DROP TABLE brought_messages;DROP TABLE IF EXISTS brought_conversations;DROP TABLE IF EXISTS brought_notes;`);
  });
 }
 private indexRows(table:'companion_turns'|'companion_notes',where:string,...values:any[]){
  if(this.searchable)this.run(`INSERT INTO ${table}_search(rowid,text) SELECT rowid,text FROM ${table} WHERE ${where}`,...values);
 }
 private unindexRows(table:'companion_turns'|'companion_notes',where:string,...values:any[]){
  if(this.searchable)this.run(`INSERT INTO ${table}_search(${table}_search,rowid,text) SELECT 'delete',rowid,text FROM ${table} WHERE ${where}`,...values);
 }
 /** Adds turns that are not here yet (by id); returns how many were added. `thread` is the context
  * a turn was said in: for Fox, the place and view it was asked from (one Harness session covers the
  * whole World, so the session cannot tell them apart); for a brought turn, its own conversation. */
 addCompanionTurns(source:string,turns:{id:string;session:string;role:string;text:string;createdAt:string;thread?:string}[]):number {
  this.ensureCompanion();
  let added=0;
  try{
   this.transaction(()=>{
    const insert=this.handle.prepare('INSERT OR IGNORE INTO companion_turns(id,source,session,role,text,created_at,thread) VALUES(?,?,?,?,?,?,?)');
    for(const turn of turns){
     const thread=typeof turn.thread==='string'?turn.thread:source===WorldLedger.OWN?'':turn.session;
     if(Number(insert.run(turn.id,source,turn.session,turn.role,turn.text,turn.createdAt,thread).changes)===0)continue;
     this.indexRows('companion_turns','id=?',turn.id);added++;
    }
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the conversation.');}
  return added;
 }
 /** Replaces every turn and note from `source`. Returns how many it now holds. */
 replaceCompanionHistory(source:string,{turns,notes}:{turns:{id:string;session:string;role:string;text:string;createdAt:string}[];notes:{id:string;session:string;date:string;text:string;createdAt:string}[]}):number {
  this.ensureCompanion();
  try{
   this.transaction(()=>{
    this.unindexRows('companion_turns','source=?',source);this.run('DELETE FROM companion_turns WHERE source=?',source);
    // Bringing again starts the continuous read over (its turns keep their IDs, so nothing comes twice).
    this.ensureHistory();this.run('DELETE FROM harness_history WHERE source=?',source);
    this.unindexRows('companion_notes','source=?',source);this.run('DELETE FROM companion_notes WHERE source=?',source);
    const note=this.handle.prepare('INSERT OR REPLACE INTO companion_notes(id,source,session,date,text,created_at) VALUES(?,?,?,?,?,?)');
    for(const n of notes){note.run(n.id,source,n.session,n.date,n.text,n.createdAt);}
    this.indexRows('companion_notes','source=?',source);
    this.addCompanionTurns(source,turns);
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the conversation history.');}
  return turns.length+notes.length;
 }
 /** `source`'s turns, oldest first; `limit` keeps only the newest ones. */
 companionTurns(source:string,limit?:number):Row[] {
  this.ensureCompanion();
  const rows=limit===undefined?this.all('SELECT id,session,role,text,created_at AS createdAt FROM companion_turns WHERE source=? ORDER BY created_at,rowid',source)
   :this.all('SELECT * FROM (SELECT id,session,role,text,created_at AS createdAt,rowid AS r FROM companion_turns WHERE source=? ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY createdAt,r',source,limit);
  return rows.map(({r:_,...row})=>({...row}));
 }
 /** The person's turns, in any conversation, that invoked a skill (`/name` as typed, or Hermes Agent's expanded form
  * of one), newest first and only their start (core/agent skillInvocation reads the name). */
 skillTurns(limit=2000):{role:string;text:string;at:number}[] {
  this.ensureCompanion();
  return this.all("SELECT role,substr(text,1,200) AS text,created_at FROM companion_turns WHERE role='user' AND (text LIKE '/%' OR text LIKE '[IMPORTANT: The user has invoked the %') ORDER BY created_at DESC LIMIT ?",limit)
   .map(row=>({role:String(row.role),text:String(row.text),at:Date.parse(String(row.created_at))}));
 }
 private static SEARCH=`SELECT id,session,thread,role,text,createdAt,kind,own FROM (
  SELECT t.id AS id,t.session AS session,t.thread AS thread,t.role AS role,t.text AS text,t.created_at AS createdAt,'conversation' AS kind,t.source=? AS own,t.rowid AS r FROM companion_turns t WHERE {turns}
  UNION ALL SELECT n.id,n.session,n.session,'assistant',CASE WHEN n.date<>'' THEN 'Notes for '||n.date||char(10)||char(10)||n.text ELSE n.text END,n.created_at,'note',0,n.rowid FROM companion_notes n WHERE {notes})`;
 private searchPlan(query:string):{sql:string;values:any[]} {
  // The index answers substring LIKE; the exact check keeps the archive's own rule (any case).
  const indexed=this.searchable&&query!==''&&!/[%_]/.test(query);
  const filter=(alias:string,table:string)=>query===''?'1':indexed?`${alias}.rowid IN (SELECT rowid FROM ${table}_search WHERE text LIKE ?) AND instr(lower(${alias}.text),lower(?))>0`:`instr(lower(${alias}.text),lower(?))>0`;
  const args=query===''?[]:indexed?['%'+query+'%',query]:[query];
  return {sql:WorldLedger.SEARCH.replace('{turns}',filter('t','companion_turns')).replace('{notes}',filter('n','companion_notes')),values:[WorldLedger.OWN,...args,...args]};
 }
 /** Turns and notes containing `query` (any case): Fox's own first, then the rest, newest first. */
 searchCompanion(query:string,offset:number,limit:number):{rows:Row[];total:number} {
  this.ensureCompanion();
  const plan=this.searchPlan(query);
  const total=Number(this.all(`SELECT count(*) AS n FROM (${plan.sql})`,...plan.values)[0]?.n??0);
  const rows=limit>0?this.all(`${plan.sql} ORDER BY own DESC, createdAt DESC, id LIMIT ? OFFSET ?`,...plan.values,limit,offset):[];
  return {rows:rows.map(({own:_,...row})=>({...row})),total};
 }
 /** One turn or note by id, or null. */
 companionRecord(id:string):Row|null {
  this.ensureCompanion();
  const plan=this.searchPlan('');
  const row=this.all(`SELECT * FROM (${plan.sql}) WHERE id=? LIMIT 1`,...plan.values,id)[0];
  if(!row)return null;
  const {own:_,...rest}=row;return {...rest};
 }
 /** How much each source holds: {source: {turns, notes}}. */
 companionCounts():Record<string,{turns:number;notes:number}> {
  this.ensureCompanion();
  const counts:Record<string,{turns:number;notes:number}>={};
  const at=(source:string)=>counts[source]??={turns:0,notes:0};
  for(const row of this.all('SELECT source,count(*) AS n FROM companion_turns GROUP BY source'))at(row.source).turns=Number(row.n);
  for(const row of this.all('SELECT source,count(*) AS n FROM companion_notes GROUP BY source'))at(row.source).notes=Number(row.n);
  return counts;
 }

 // History read continuously (fox/history-sync.ts) ------------------------------------------------------
 // Where the World got to in each Harness thread (`harness_history`: the last turn ID taken and the session its turns
 // are filed under; the row with no thread says when the source was last checked) and the Harness sessions that are
 // Fox's own (`harness_own_sessions`), which never come back as another conversation.
 private historyReady=false;
 private ensureHistory(){
  if(this.historyReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS harness_history (source TEXT NOT NULL, thread TEXT NOT NULL, cursor TEXT, session TEXT NOT NULL DEFAULT '', checked_at INTEGER NOT NULL, PRIMARY KEY(source, thread));
   CREATE TABLE IF NOT EXISTS harness_own_sessions (source TEXT NOT NULL, session TEXT NOT NULL, thread TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY(source, session));`);
  // Whether the thread is a group or channel others write in (HarnessThread.shared); null until it is listed again.
  if(!this.all("SELECT 1 FROM pragma_table_info('harness_history') WHERE name='shared'").length)this.exec('ALTER TABLE harness_history ADD COLUMN shared INTEGER');
  this.historyReady=true;
 }
 /** Where the World got to in one thread, and when it was last read through (milliseconds; 0 when left part-way). */
 historyCursor(source:string,thread:string):{cursor:string|null;session:string;checkedAt:number;shared:boolean|null}|null {
  this.ensureHistory();
  const row=this.all('SELECT cursor,session,checked_at,shared FROM harness_history WHERE source=? AND thread=?',source,thread)[0];
  return row?{cursor:row.cursor==null?null:String(row.cursor),session:String(row.session),checkedAt:Number(row.checked_at),shared:row.shared==null?null:!!row.shared}:null;
 }
 /** `shared` undefined keeps what is known of the thread. */
 saveHistoryCursor(source:string,thread:string,cursor:string|null,session:string,at=Date.now(),shared?:boolean){
  this.ensureHistory();
  this.run('INSERT INTO harness_history(source,thread,cursor,session,checked_at,shared) VALUES(?,?,?,?,?,?) ON CONFLICT(source,thread) DO UPDATE SET cursor=excluded.cursor,session=excluded.session,checked_at=excluded.checked_at,shared=coalesce(excluded.shared,harness_history.shared)',source,thread,cursor,session,Math.round(at),shared===undefined?null:shared?1:0);
 }
 saveHistoryShared(source:string,thread:string,shared:boolean){this.ensureHistory();this.run('UPDATE harness_history SET shared=? WHERE source=? AND thread=?',shared?1:0,source,thread);}
 /** Whether a brought conversation is a group (one of its threads is shared), a direct one, or not known yet (null). */
 historyShared(source:string,session:string):boolean|null {
  this.ensureHistory();
  const row=this.all("SELECT max(shared) AS shared FROM harness_history WHERE source=? AND session=? AND thread<>''",source,session)[0];
  return row?.shared==null?null:!!row.shared;
 }
 /** When `source` was last checked (milliseconds), or null before the first time. */
 historyCheckedAt(source:string):number|null {
  this.ensureHistory();
  const row=this.all("SELECT checked_at FROM harness_history WHERE source=? AND thread=''",source)[0];
  return row?Number(row.checked_at):null;
 }
 historySources():string[] {this.ensureHistory();return this.all("SELECT DISTINCT source FROM harness_history ORDER BY source").map(row=>String(row.source));}
 /** The Harness threads whose turns are filed under `session`, most recently read first (a reply goes to one of them). */
 historyThreads(source:string,session:string):string[] {this.ensureHistory();return this.all("SELECT thread FROM harness_history WHERE source=? AND session=? AND thread<>'' ORDER BY checked_at DESC",source,session).map(row=>String(row.thread));}
 /** A Harness session that is Fox's own (a resident session, harness-sessions), with the Fox thread it carries. */
 rememberOwnHarnessSession(source:string,session:string,thread=''){
  this.ensureHistory();
  this.run('INSERT OR REPLACE INTO harness_own_sessions(source,session,thread,created_at) VALUES(?,?,?,?)',source,session,thread,Math.round(Date.now()));
 }
 ownHarnessSessions(source:string):Set<string> {this.ensureHistory();return new Set(this.all('SELECT session FROM harness_own_sessions WHERE source=?',source).map(row=>String(row.session)));}
 /** Fox's own sessions in `source`, each with its Fox thread (a call one of them placed reports back there). */
 ownHarnessSessionThreads(source:string):Map<string,string> {this.ensureHistory();return new Map(this.all('SELECT session,thread FROM harness_own_sessions WHERE source=?',source).map(row=>[String(row.session),String(row.thread??'')]));}
 /** The session a turn is filed under, or null when it is not here. */
 companionSession(id:string):string|null {this.ensureCompanion();const row=this.all('SELECT session FROM companion_turns WHERE id=?',id)[0];return row?String(row.session):null;}
 /** The text `source` keeps, in bytes. */
 companionBytes(source:string):number {this.ensureCompanion();return Number(this.all('SELECT coalesce(sum(length(CAST(text AS BLOB))),0) AS n FROM companion_turns WHERE source=?',source)[0]?.n??0);}

 // What Fox's chat shows, place by place -----------------------------------------------------------
 // The chat keeps one card per turn (the question, Fox's steps, the answer) and, for each place,
 // the reply shown there last. Each card and reply belongs to a thread: the place and view it was
 // asked in (`contextThread` in ui/attention), the same key Fox's turns carry in companion_turns.
 // Rows are saved and read back whole, in order; before 2026-10-03 they were conversation-recall.json.
 private viewsReady=false;
 private ensureViews(){
  if(this.viewsReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS companion_views (position INTEGER PRIMARY KEY, thread TEXT NOT NULL, body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS companion_cards (position INTEGER PRIMARY KEY, id TEXT NOT NULL, thread TEXT NOT NULL, body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS companion_cards_thread ON companion_cards(thread, position);`);
  this.viewsReady=true;
 }
 static readonly CARDS_ROW='fox-thread';
 private static thread=(row:Row)=>JSON.stringify([String(row?.key||'overview'),String(row?.view||'')]);
 /** Whether the chat rows were ever saved here. */
 hasCompanionViews():boolean {
  this.ensureViews();
  return this.all('SELECT 1 FROM companion_views LIMIT 1').length>0||this.all('SELECT 1 FROM companion_cards LIMIT 1').length>0;
 }
 /** The chat rows as saved; the cards row gets its cards back. */
 companionViews():Row[] {
  this.ensureViews();
  const cards=this.all('SELECT body FROM companion_cards ORDER BY position').map(row=>JSON.parse(String(row.body)));
  return this.all('SELECT body FROM companion_views ORDER BY position').map(row=>{
   const value=JSON.parse(String(row.body));
   return value?.key===WorldLedger.CARDS_ROW?{...value,entries:cards}:value;
  });
 }
 /** Replaces the chat rows: each card is its own row, tagged with its thread. */
 replaceCompanionViews(rows:Row[]){
  this.ensureViews();
  try{
   this.transaction(()=>{
    this.run('DELETE FROM companion_views');this.run('DELETE FROM companion_cards');
    const view=this.handle.prepare('INSERT INTO companion_views(position,thread,body) VALUES(?,?,?)'),card=this.handle.prepare('INSERT INTO companion_cards(position,id,thread,body) VALUES(?,?,?,?)');
    rows.forEach((row,position)=>{
     if(row?.key===WorldLedger.CARDS_ROW){
      const {entries,...rest}=row;
      (Array.isArray(entries)?entries:[]).forEach((entry:Row,n:number)=>card.run(n,String(entry?.id??''),WorldLedger.thread(entry),JSON.stringify(entry)));
      view.run(position,'',JSON.stringify(rest));
     }else view.run(position,WorldLedger.thread(row),JSON.stringify(row));
    });
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the conversation history.');}
 }

 // Who Fox is ---------------------------------------------------------------------------------------
 // Per scope ('private', 'setup', 'sample'): 'profile' (identity, personality, memory; conversations
 // live in companion_turns), 'memory-edits' (sections the person wrote) and 'session' (the marker
 // that starts a fresh Harness session after an import or edit). Before 2026-10-03 these were
 // companion/profile.json, memory-edits.json and imported.json (fox/companion.ts moves them in).
 private profileReady=false;
 private ensureProfile(){
  if(this.profileReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS companion_profile (scope TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope, name));');
  this.profileReady=true;
 }
 companionStored(scope:string,name:string):Row|null {
  this.ensureProfile();
  const row=this.all('SELECT value FROM companion_profile WHERE scope=? AND name=?',scope,name)[0];
  return row?JSON.parse(String(row.value)):null;
 }
 saveCompanionStored(scope:string,name:string,value:Row|null){
  this.ensureProfile();
  try{
   if(value===null)this.run('DELETE FROM companion_profile WHERE scope=? AND name=?',scope,name);
   else this.run('INSERT INTO companion_profile(scope,name,value) VALUES(?,?,?) ON CONFLICT(scope,name) DO UPDATE SET value=excluded.value',scope,name,JSON.stringify(value));
  }catch{throw new WorldletError('Could not save the companion profile.');}
 }

 // Small World settings ----------------------------------------------------------------------------
 // One JSON value per key: the page's layout edits ('overlay') and weather ('environment'), before
 // 2026-10-03 overlay.json and environment.json (WorldStore.worldSetting moves them in); and the
 // World's configuration ('configuration', below).
 private settingsReady=false;
 private ensureSettings(){
  if(this.settingsReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS world_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  this.settingsReady=true;
 }
 setting(key:string):Row|null {
  this.ensureSettings();
  const row=this.all('SELECT value FROM world_settings WHERE key=?',key)[0];
  return row?JSON.parse(String(row.value)):null;
 }
 saveSetting(key:string,value:Row|null){
  this.ensureSettings();
  try{
   if(value===null)this.run('DELETE FROM world_settings WHERE key=?',key);
   else this.run('INSERT INTO world_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
  }catch{throw new WorldletError('Could not save world settings.');}
 }

 // The World's configuration ------------------------------------------------------------------------
 // Connections, onboarding, layout and the rest of the library state (Sources and Knowledge have their
 // own tables) are the `world_settings` row 'configuration'; before 2026-10-03 the `index.json` file.
 /** The saved configuration, read without opening the ledger. An `index.json` beside the database is
  * the earlier file, or one an older backup brought back, and is the newer copy until it moves in. */
 static storedConfiguration(root:string):Row|null {
  const file=path.join(root,'index.json');
  if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  const database=path.join(root,'world.sqlite');
  if(!fs.existsSync(database))return null;
  const db=new DatabaseSync(database,{readOnly:true});
  try{
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='world_settings'").get())return null;
   const row=db.prepare("SELECT value FROM world_settings WHERE key='configuration'").get() as Row|undefined;
   return row?JSON.parse(String(row.value)):null;
  }finally{db.close();}
 }
 /** Saves the library tables and the configuration in one transaction, then retires `index.json`. */
 saveConfiguration(state:Row){
  try{this.transaction(()=>{this.saveLibrary(state);this.saveSetting('configuration',{...state,sources:[],knowledge:[],libraryStorageVersion:1});});}
  catch(error){this.savedLibrary=null;throw error;}
  const file=path.join(this.root,'index.json');
  if(fs.existsSync(file))fs.renameSync(file,file+'.before-database');
 }

 // Browsing history --------------------------------------------------------------------------------
 // Pages visited inside Worldlet, oldest first (Core bounds and dedupes them, browser/history.ts);
 // before 2026-10-03 browser-history.json. Times keep the Mac format: seconds since 2001.
 private visitsReady=false;
 private ensureVisits(){
  if(this.visitsReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS browser_visits (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, visited_at REAL NOT NULL);');
  this.visitsReady=true;
 }
 browserVisits():{id:number;url:string;title:string;text:string;visitedAt:number}[] {
  this.ensureVisits();
  return this.all('SELECT id,url,title,text,visited_at AS visitedAt FROM browser_visits ORDER BY id').map(row=>({id:Number(row.id),url:String(row.url),title:String(row.title),text:String(row.text),visitedAt:Number(row.visitedAt)}));
 }
 /** Removes visits by id and appends new ones in order; returns the new ids. `replace` clears all first. */
 changeBrowserVisits(remove:number[],add:{url:string;title:string;text:string;visitedAt:number}[],replace=false):number[] {
  this.ensureVisits();
  try{
   return this.transaction(()=>{
    if(replace)this.run('DELETE FROM browser_visits');
    const drop=this.handle.prepare('DELETE FROM browser_visits WHERE id=?'),insert=this.handle.prepare('INSERT INTO browser_visits(url,title,text,visited_at) VALUES(?,?,?,?)');
    for(const id of remove)drop.run(id);
    return add.map(visit=>Number(insert.run(visit.url,visit.title,visit.text,visit.visitedAt).lastInsertRowid));
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save browsing history.');}
 }

 // Skills and routines brought from another Agent --------------------------------------------------
 // The World's copy (owner decision 2026-10-03: whatever can be in SQLite is); Fox's Harness gets
 // its own copy from here (fox/migration.ts). Before 2026-10-03 it was companion/brought/<agent>.json.
 private broughtReady=false;
 private ensureBrought(){
  if(this.broughtReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS brought_skills (source TEXT NOT NULL, folder TEXT NOT NULL, path TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(source, folder, path));
   CREATE TABLE IF NOT EXISTS brought_routines (source TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(source, position));`);
  this.broughtReady=true;
 }
 /** Every Agent's skills ({folder: {path: text}}) and routines, by source. */
 broughtStores():{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}[] {
  this.ensureBrought();
  const stores=new Map<string,{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}>();
  const at=(source:string)=>{let value=stores.get(source);if(!value)stores.set(source,value={source,skills:{},routines:[]});return value;};
  for(const row of this.all('SELECT source,folder,path,text FROM brought_skills ORDER BY source,folder,path'))(at(row.source).skills[row.folder]??={})[row.path]=String(row.text);
  for(const row of this.all('SELECT source,body FROM brought_routines ORDER BY source,position'))at(row.source).routines.push(JSON.parse(String(row.body)));
  return [...stores.values()];
 }
 /** Replaces what `source` brought. */
 replaceBrought(source:string,skills:Record<string,Record<string,string>>,routines:Row[]){
  this.ensureBrought();
  try{
   this.transaction(()=>{
    this.run('DELETE FROM brought_skills WHERE source=?',source);this.run('DELETE FROM brought_routines WHERE source=?',source);
    const skill=this.handle.prepare('INSERT INTO brought_skills(source,folder,path,text) VALUES(?,?,?,?)'),routine=this.handle.prepare('INSERT INTO brought_routines(source,position,body) VALUES(?,?,?)');
    for(const [folder,files] of Object.entries(skills))for(const [file,text] of Object.entries(files))skill.run(source,folder,file,text);
    routines.forEach((value,position)=>routine.run(source,position,JSON.stringify(value)));
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save what this Agent brought.');}
 }

 // My Applets ---------------------------------------------------------------------------------------
 // The person's own Applets (core/applets/MY-APPLETS.md#one-table), one row each in one table: a website made into
 // one (`site`), a page Fox made with its page and what was ticked (`page`), a brought conversation (`conversation`;
 // Fox's proposals wait here too until kept or declined), and the pictures painted for it. Before 2026-10-06 they
 // lived in the `widgets` and `ongoing` tables and the `site-applets` and `applet-art` buckets; those move in once
 // and stay as they were for a month.
 private myAppletsReady=false;
 private ensureMyApplets(){
  if(this.myAppletsReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS my_applets (id TEXT PRIMARY KEY, kind TEXT NOT NULL, record TEXT NOT NULL, html TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '{}', icon TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', painted_at REAL NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS my_applets_kind ON my_applets(kind);`);
  this.myAppletsReady=true;
  if(!this.setting(WorldLedger.MY_APPLETS_MOVED))this.moveInMyApplets();
 }
 static readonly MY_APPLETS_MOVED='my-applets-moved';
 private moveInMyApplets(){
  const latest=(bucket:string)=>this.all('SELECT key,body FROM entries WHERE kind=? AND seq IN (SELECT MAX(seq) FROM entries WHERE kind=? GROUP BY key)','state.'+bucket,'state.'+bucket)
   .flatMap(row=>{try{const body=JSON.parse(String(row.body));return body&&typeof body==='object'&&!Array.isArray(body)?[{key:String(row.key),body}]:[];}catch{return [];}});
  try{
   this.transaction(()=>{
    if(this.tableExists('widgets'))this.exec("INSERT OR IGNORE INTO my_applets(id,kind,record,html,state) SELECT id,'page',record,html,state FROM widgets;");
    if(this.tableExists('ongoing'))this.exec("INSERT OR IGNORE INTO my_applets(id,kind,record) SELECT id,'conversation',record FROM ongoing;");
    for(const {key,body} of latest('site-applets'))this.run("INSERT OR IGNORE INTO my_applets(id,kind,record) VALUES(?,'site',?)",key,JSON.stringify(body));
    for(const {body} of latest('applet-art'))if(typeof body.applet==='string'&&body.applet.startsWith('app-'))
     this.run('UPDATE my_applets SET icon=?,background=?,painted_at=? WHERE id=?',String(body.icon??''),String(body.background??''),Number(body.madeAt)||0,body.applet.slice(4));
    this.saveSetting(WorldLedger.MY_APPLETS_MOVED,{at:now()});
   });
  }catch{throw new WorldletError('Could not move your Applets into their table; they were kept where they were.');}
 }
 /** One kind of the person's own Applets: each record and state (pages and pictures stay in the table until asked for). */
 myApplets(kind:'site'|'page'|'conversation'):{id:string;record:Row;state:Row;painted:boolean}[] {
  this.ensureMyApplets();
  return this.all("SELECT id,record,state,icon<>'' AS painted FROM my_applets WHERE kind=? ORDER BY id",kind)
   .map(row=>({id:String(row.id),record:JSON.parse(String(row.record)),state:JSON.parse(String(row.state)),painted:Boolean(row.painted)}));
 }
 /** Saves one of the person's own Applets: its record, and its page and state when given; a new page needs its page. */
 saveMyApplet(id:string,kind:'site'|'page'|'conversation',record:Row,{html,state}:{html?:string;state?:Row}={}){
  this.ensureMyApplets();
  try{
   const sets=['record=excluded.record',...(html!==undefined?['html=excluded.html']:[]),...(state!==undefined?['state=excluded.state']:[])];
   this.run(`INSERT INTO my_applets(id,kind,record,html,state) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ${sets.join(',')}`,id,kind,JSON.stringify(record),html??'',JSON.stringify(state??{}));
  }catch{throw new WorldletError('Could not save the Applet.');}
 }
 /** Forgets the person's own Applets, their pages and pictures with them. */
 deleteMyApplets(ids:string[]){
  this.ensureMyApplets();
  try{this.transaction(()=>{for(const id of ids)this.run('DELETE FROM my_applets WHERE id=?',id);});}catch{throw new WorldletError('Could not delete the Applet.');}
 }
 myAppletPage(id:string):string|null {
  this.ensureMyApplets();
  const row=this.all("SELECT html FROM my_applets WHERE id=? AND kind='page'",id)[0];
  return row?String(row.html):null;
 }
 /** Every painted icon, by Applet ID (small: they ride in the snapshot). */
 myAppletIcons():Record<string,string> {
  this.ensureMyApplets();
  return Object.fromEntries(this.all("SELECT id,icon FROM my_applets WHERE icon<>''").map(row=>[String(row.id),String(row.icon)]));
 }
 myAppletArt(id:string):{icon:string;background:string;paintedAt:number}|null {
  this.ensureMyApplets();
  const row=this.all("SELECT icon,background,painted_at FROM my_applets WHERE id=? AND icon<>''",id)[0];
  return row?{icon:String(row.icon),background:String(row.background),paintedAt:Number(row.painted_at)}:null;
 }
 /** Keeps (or with null forgets) the pictures painted for one of the person's own Applets; false when it is gone. */
 saveMyAppletArt(id:string,art:{icon:string;background:string;paintedAt:number}|null):boolean {
  this.ensureMyApplets();
  try{return Number(this.run('UPDATE my_applets SET icon=?,background=?,painted_at=? WHERE id=?',art?.icon??'',art?.background??'',art?.paintedAt??0,id).changes)>0;}
  catch{throw new WorldletError('Could not keep the pictures.');}
 }

 // Pages Fox made (core/widgets): `page` rows of the person's own Applets.
 widgetRows():{record:Row;state:Row}[] {return this.myApplets('page').map(({record,state})=>({record,state}));}
 widgetPage(id:string):string|null {return this.myAppletPage(id);}
 /** Saves a page's record, and its page and state when given; a new page needs both. */
 saveWidget(id:string,record:Row,{html,state}:{html?:string;state?:Row}={}){
  if(html===undefined&&!this.all("SELECT 1 FROM my_applets WHERE id=? AND kind='page'",id).length)return;
  this.saveMyApplet(id,'page',record,{html,state});
 }
 deleteWidget(id:string){this.deleteMyApplets([id]);}

 // Artifacts ---------------------------------------------------------------------------------------
 // Every card Fox showed (core/artifacts): one row each, newest shown last in `at`.
 private artifactsReady=false;
 private ensureArtifacts(){
  if(this.artifactsReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, record TEXT NOT NULL, at REAL NOT NULL);');
  this.artifactsReady=true;
 }
 artifactRows():Row[] {
  this.ensureArtifacts();
  return this.all('SELECT record FROM artifacts ORDER BY at DESC').map(row=>JSON.parse(String(row.record)));
 }
 /** Saves artifacts and forgets the ones given, in one transaction. */
 saveArtifacts(save:Row[],forget:string[]=[]){
  this.ensureArtifacts();
  try{
   this.transaction(()=>{
    for(const record of save)this.run('INSERT INTO artifacts(id,record,at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,at=excluded.at',String(record.id),JSON.stringify(record),Number(record.updatedAt)||0);
    for(const id of forget)this.run('DELETE FROM artifacts WHERE id=?',id);
   });
  }catch{throw new WorldletError('Could not save the artifact.');}
 }

 // Local calendar events ---------------------------------------------------------------------------
 // Events the person made in the Calendar Applet (core/applets/calendar-events.ts): one row each.
 private calendarReady=false;
 private ensureCalendar(){
  if(this.calendarReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, record TEXT NOT NULL);');
  this.calendarReady=true;
 }
 calendarEventRows():Row[] {
  this.ensureCalendar();
  return this.all('SELECT record FROM calendar_events ORDER BY id').map(row=>JSON.parse(String(row.record)));
 }
 /** Saves events and forgets the ones given, in one transaction. */
 saveCalendarEvents(save:Row[],forget:string[]=[]){
  this.ensureCalendar();
  try{
   this.transaction(()=>{
    for(const record of save)this.run('INSERT INTO calendar_events(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record',String(record.id),JSON.stringify(record));
    for(const id of forget)this.run('DELETE FROM calendar_events WHERE id=?',id);
   });
  }catch{throw new WorldletError('Could not save the event.');}
 }

 // Ongoing things --------------------------------------------------------------------------------
 // Brought conversations the person made into Applets (core/ongoing): `conversation` rows of the person's own
 // Applets, one record per thing. The conversation itself stays in companion_turns.
 ongoingRows():Row[] {return this.myApplets('conversation').map(row=>row.record);}
 /** Saves and forgets records in one transaction. */
 saveOngoing(save:Row[],forget:string[]=[]){
  this.ensureMyApplets();
  try{
   this.transaction(()=>{
    for(const record of save)this.saveMyApplet(String(record.id),'conversation',record);
    this.deleteMyApplets(forget);
   });
  }catch{throw new WorldletError('Could not save what is ongoing.');}
 }
 /** Every brought conversation (not Fox's own): its Agent, session, turns, the person's own turns and its first and last time. */
 broughtConversations():{source:string;session:string;turns:number;userTurns:number;first:string;last:string}[] {
  this.ensureCompanion();
  return this.all(`SELECT source,session,count(*) AS turns,sum(role='user') AS userTurns,min(created_at) AS first,max(created_at) AS last FROM companion_turns WHERE source<>? GROUP BY source,session`,WorldLedger.OWN)
   .map(row=>({source:String(row.source),session:String(row.session),turns:Number(row.turns),userTurns:Number(row.userTurns??0),first:String(row.first),last:String(row.last)}));
 }
 /** The person's own newest `limit` messages in one brought conversation, oldest first, one per line (to tell what
  * it is about, core/ongoing kinds). */
 ownText(source:string,session:string,limit:number):string {
  this.ensureCompanion();
  return this.all(`SELECT text FROM (SELECT text,created_at,rowid AS r FROM companion_turns WHERE source=? AND session=? AND role='user' ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at,r`,source,session,limit)
   .map(row=>String(row.text).replace(/\s+/g,' ').trim().slice(0,400)).join('\n');
 }
 /** The newest `limit` turns of one brought conversation, oldest first. */
 conversationTurns(source:string,session:string,limit:number):{role:string;text:string;createdAt:string}[] {
  this.ensureCompanion();
  return this.all('SELECT role,text,created_at AS createdAt FROM (SELECT role,text,created_at,rowid AS r FROM companion_turns WHERE source=? AND session=? ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at,r',source,session,limit)
   .map(row=>({role:String(row.role),text:String(row.text),createdAt:String(row.createdAt)}));
 }

 /** The newest `limit` of Fox's own turns said in one place (`thread`, the chat's context key), oldest
  * first, leaving out `except` (the turn being answered). */
 threadTurns(thread:string,limit:number,except=''):{role:string;text:string;createdAt:string}[] {
  this.ensureCompanion();
  return this.all('SELECT role,text,created_at AS createdAt FROM (SELECT role,text,created_at,rowid AS r FROM companion_turns WHERE source=? AND thread=? AND id<>? ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at,r',WorldLedger.OWN,thread,except,limit)
   .map(row=>({role:String(row.role),text:String(row.text),createdAt:String(row.createdAt)}));
 }
 /** Fox's own newest turns, where each was said and when, without their text (core worldSinceCutoff). */
 recentTurnPlaces(limit:number):{thread:string;role:string;createdAt:string}[] {
  this.ensureCompanion();
  return this.all('SELECT thread,role,created_at AS createdAt FROM companion_turns WHERE source=? ORDER BY created_at DESC,rowid DESC LIMIT ?',WorldLedger.OWN,Math.max(1,Math.min(2000,limit)))
   .map(row=>({thread:String(row.thread??''),role:String(row.role),createdAt:String(row.createdAt)}));
 }
 /** Where Fox's previous turn before `except` was said, or ''. */
 previousThread(except:string):string {
  this.ensureCompanion();
  return String(this.all('SELECT thread FROM companion_turns WHERE source=? AND id<>? ORDER BY created_at DESC,rowid DESC LIMIT 1',WorldLedger.OWN,except)[0]?.thread??'');
 }

 // Website recordings ------------------------------------------------------------------------------
 // What happened in the built-in browser's pages (core/browser/web-record.ts): one row per visit (a
 // stay on one site) and its records in order. Text is searchable through a trigram index.
 private webReady=false;
 private webSearchable=false;
 private ensureWeb(){
  if(this.webReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS web_visits (id TEXT PRIMARY KEY, site TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, applet TEXT NOT NULL, started_at REAL NOT NULL, ended_at REAL NOT NULL);
   CREATE INDEX IF NOT EXISTS web_visits_time ON web_visits(started_at);
   CREATE INDEX IF NOT EXISTS web_visits_site ON web_visits(site, started_at);
   CREATE TABLE IF NOT EXISTS web_records (id INTEGER PRIMARY KEY AUTOINCREMENT, visit TEXT NOT NULL, at REAL NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL, meta TEXT NOT NULL, body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS web_records_visit ON web_records(visit, id);
   CREATE INDEX IF NOT EXISTS web_records_kind ON web_records(kind, at);`);
  try{
   if(!this.tableExists('web_records_search'))this.handle.exec(`CREATE VIRTUAL TABLE web_records_search USING fts5(body, content='web_records', content_rowid='id', tokenize='trigram', detail='none');`);
   this.webSearchable=true;
  }catch{this.webSearchable=false;}
  this.webReady=true;
 }
 /** Saves visits (new or extended) and their new records in one transaction. */
 recordWeb(visits:{id:string;site:string;url:string;title:string;applet:string;startedAt:number;endedAt:number}[],records:{visit:string;at:number;kind:string;url:string;meta:Row;body:string}[]){
  this.ensureWeb();
  try{
   this.transaction(()=>{
    const visit=this.handle.prepare(`INSERT INTO web_visits(id,site,url,title,applet,started_at,ended_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE web_visits.title END,ended_at=max(web_visits.ended_at,excluded.ended_at)`);
    for(const v of visits)visit.run(v.id,v.site,v.url,v.title,v.applet,v.startedAt,v.endedAt);
    const insert=this.handle.prepare('INSERT INTO web_records(visit,at,kind,url,meta,body) VALUES(?,?,?,?,?,?)');
    const index=this.webSearchable?this.handle.prepare('INSERT INTO web_records_search(rowid,body) VALUES(?,?)'):null;
    for(const r of records){
     const id=Number(insert.run(r.visit,r.at,r.kind,r.url,JSON.stringify(r.meta??{}),r.body).lastInsertRowid);
     if(index&&r.body)index.run(id,r.body);
    }
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the browsing recording.');}
 }
 private webVisitRow=(row:Row)=>({id:String(row.id),site:String(row.site),url:String(row.url),title:String(row.title),applet:String(row.applet),startedAt:Number(row.started_at),endedAt:Number(row.ended_at)});
 /** Visits newest first, optionally on one site, in a time range, and holding every term. Each comes
  * with how much it recorded and, for a search, where the first term was found. */
 webVisits({terms=[],site='',after=null,before,offset=0,limit=10}:{terms?:string[];site?:string;after?:number|null;before:number;offset?:number;limit?:number}){
  this.ensureWeb();
  const where=['v.ended_at>=?','v.started_at<?'],values:any[]=[after??0,before];
  if(site){where.push('(v.site=? OR v.site LIKE ?)');values.push(site,'%.'+site);}
  for(const term of terms){
   // Short terms cannot use the trigram index; they fall back to a scan of this visit's text.
   const indexed=this.webSearchable&&term.length>=3&&!/[%_"]/.test(term);
   where.push(`(instr(lower(v.title||' '||v.url),lower(?))>0 OR EXISTS (SELECT 1 FROM web_records r WHERE r.visit=v.id AND ${indexed?'r.id IN (SELECT rowid FROM web_records_search WHERE body LIKE ?) AND ':''}instr(lower(r.body),lower(?))>0))`);
   values.push(term,...indexed?['%'+term+'%']:[],term);
  }
  const total=Number(this.all(`SELECT count(*) AS n FROM web_visits v WHERE ${where.join(' AND ')}`,...values)[0]?.n??0);
  const rows=this.all(`SELECT v.* FROM web_visits v WHERE ${where.join(' AND ')} ORDER BY v.ended_at DESC LIMIT ? OFFSET ?`,...values,limit,offset);
  return {total,visits:rows.map(row=>{
   const visit=this.webVisitRow(row);
   const counts=Object.fromEntries(this.all('SELECT kind,count(*) AS n FROM web_records WHERE visit=? GROUP BY kind',visit.id).map(r=>[String(r.kind),Number(r.n)]));
   let found='';
   if(terms[0]){const hit=this.all('SELECT body FROM web_records WHERE visit=? AND instr(lower(body),lower(?))>0 ORDER BY id DESC LIMIT 1',visit.id,terms[0])[0];
    if(hit){const body=String(hit.body),at=body.toLowerCase().indexOf(terms[0].toLowerCase());found=body.slice(Math.max(0,at-160),at+240);}}
   return {...visit,counts,...found?{found}:{}};
  })};
 }
 webVisit(id:string){this.ensureWeb();const row=this.all('SELECT * FROM web_visits WHERE id=?',id)[0];return row?this.webVisitRow(row):null;}
 /** One visit's records in order from record number `offset` (#n, counted over the whole visit, so a
  * page's number from `webPages` is a place to start even when reading only `kinds` or `term`),
  * each with its number. `total` counts the matching records in the whole visit, `after` those from
  * `offset` on. */
 webRecords(visit:string,{offset=0,limit=400,kinds=[],term=''}:{offset?:number;limit?:number;kinds?:string[];term?:string}={}){
  this.ensureWeb();
  const where=['1'],values:any[]=[];
  if(kinds.length){where.push(`kind IN (${kinds.map(()=>'?').join(',')})`);values.push(...kinds);}
  if(term){where.push('instr(lower(body),lower(?))>0');values.push(term);}
  const numbered='WITH numbered AS (SELECT id,at,kind,url,meta,body,row_number() OVER (ORDER BY id)-1 AS idx FROM web_records WHERE visit=?)';
  const counts=this.all(`${numbered} SELECT count(*) AS n,coalesce(sum(idx>=?),0) AS later FROM numbered WHERE ${where.join(' AND ')}`,visit,offset,...values)[0];
  const rows=this.all(`${numbered} SELECT idx,at,kind,url,meta,body FROM numbered WHERE idx>=? AND ${where.join(' AND ')} ORDER BY id LIMIT ?`,visit,offset,...values,limit);
  return {total:Number(counts?.n??0),after:Number(counts?.later??0),records:rows.map(row=>{let meta:Row={};try{meta=JSON.parse(String(row.meta));}catch{}return {index:Number(row.idx),at:Number(row.at),kind:String(row.kind),url:String(row.url),meta,body:String(row.body)};})};
 }
 /** Where a visit's address changed (`page` records), with each one's record number. */
 webPages(visit:string){
  this.ensureWeb();
  return this.all("SELECT r.at,r.url,r.meta,(SELECT count(*) FROM web_records x WHERE x.visit=r.visit AND x.id<r.id) AS idx FROM web_records r WHERE r.visit=? AND r.kind='page' ORDER BY r.id",visit)
   .map(row=>{let title='';try{title=String(JSON.parse(String(row.meta)).title??'');}catch{}return {index:Number(row.idx),url:String(row.url),title,at:Number(row.at)};});
 }
 /** Meeting transcripts (`transcript` records), newest first: one per transcription session, with
  * the meeting's title, its site, when it ran and how many lines it holds. */
 meetingTranscripts(limit=20){
  this.ensureWeb();
  return this.all(`SELECT json_extract(r.meta,'$.session') AS session,r.visit,v.site,max(json_extract(r.meta,'$.meeting')) AS meeting,min(r.at) AS started,max(r.at) AS ended,count(*) AS lines
   FROM web_records r JOIN web_visits v ON v.id=r.visit WHERE r.kind='transcript' AND json_extract(r.meta,'$.session') IS NOT NULL
   GROUP BY session ORDER BY ended DESC LIMIT ?`,limit)
   .map(row=>({session:String(row.session),visit:String(row.visit),site:String(row.site),meeting:String(row.meeting??''),startedAt:Number(row.started),endedAt:Number(row.ended),lines:Number(row.lines)}));
 }
 /** One transcription session's lines in order. */
 meetingTranscript(session:string){
  this.ensureWeb();
  return this.all(`SELECT at,body,meta FROM web_records WHERE kind='transcript' AND json_extract(meta,'$.session')=? ORDER BY id LIMIT 5000`,session)
   .map(row=>{let meta:Row={};try{meta=JSON.parse(String(row.meta));}catch{}return {at:Number(row.at),text:String(row.body),speaker:String(meta.speaker??''),meeting:String(meta.meeting??'')};});
 }
 /** A visit's newest whole-page text record and the additions after it, oldest first (core onScreenText). */
 webPageText(visit:string){
  this.ensureWeb();
  return this.all(`SELECT kind,body FROM web_records WHERE visit=? AND kind IN ('text','text-more')
   AND id>=coalesce((SELECT max(id) FROM web_records WHERE visit=? AND kind='text'),0) ORDER BY id DESC LIMIT 40`,visit,visit)
   .reverse().map(row=>({kind:String(row.kind),body:String(row.body)}));
 }
 /** The newest visits, for Fox's sense of what just happened. */
 recentWebVisits(limit:number){this.ensureWeb();return this.all('SELECT * FROM web_visits ORDER BY ended_at DESC LIMIT ?',limit).map(this.webVisitRow);}
 /** Removes raw network records older than `rawBefore` and, above `maxBytes`, the oldest raw records
  * until the recordings fit; empty visits go too. Returns how many records were removed. */
 pruneWeb({rawKinds,rawBefore,maxBytes}:{rawKinds:string[];rawBefore:number;maxBytes:number}):number {
  this.ensureWeb();
  const kinds=rawKinds.map(()=>'?').join(',');
  let removed=0;
  try{
   this.transaction(()=>{
    const drop=(where:string,...values:any[])=>{
     if(this.webSearchable)this.run(`INSERT INTO web_records_search(web_records_search,rowid,body) SELECT 'delete',id,body FROM web_records WHERE ${where} AND body<>''`,...values);
     removed+=Number(this.run(`DELETE FROM web_records WHERE ${where}`,...values).changes);
    };
    drop(`kind IN (${kinds}) AND at<?`,...rawKinds,rawBefore);
    let bytes=Number(this.all('SELECT coalesce(sum(length(body)),0) AS n FROM web_records')[0]?.n??0);
    while(bytes>maxBytes){
     const oldest=this.all(`SELECT id,length(body) AS n FROM web_records WHERE kind IN (${kinds}) ORDER BY id LIMIT 500`,...rawKinds);
     if(!oldest.length)break;
     const last=Number(oldest[oldest.length-1].id);
     drop(`kind IN (${kinds}) AND id<=?`,...rawKinds,last);
     bytes-=oldest.reduce((sum,row)=>sum+Number(row.n),0);
    }
    this.run('DELETE FROM web_visits WHERE NOT EXISTS (SELECT 1 FROM web_records r WHERE r.visit=web_visits.id)');
   });
  }catch{throw new WorldletError('Could not tidy the browsing recordings.');}
  return removed;
 }
 /** The recorded sites, most recently visited first, with how many visits each holds. */
 webSites():{site:string;visits:number;lastAt:number}[] {
  this.ensureWeb();
  return this.all('SELECT site,count(*) AS n,max(ended_at) AS last FROM web_visits GROUP BY site ORDER BY last DESC').map(row=>({site:String(row.site),visits:Number(row.n),lastAt:Number(row.last)}));
 }
 /** Deletes recordings on one site and its subdomains (or every site) in a time range, with their
  * search index entries. Returns how many visits went. */
 deleteWeb({site='',after=0,before=Number.MAX_SAFE_INTEGER}:{site?:string;after?:number;before?:number}):number {
  this.ensureWeb();
  // The subdomain test compares the address's end exactly: LIKE would read `_` and `%` in a site as wildcards.
  const where='ended_at>=? AND started_at<?'+(site?' AND (site=? OR substr(site,-?)=?)':''),values:any[]=[after,before,...site?[site,site.length+1,'.'+site]:[]];
  const visits=`visit IN (SELECT id FROM web_visits WHERE ${where})`;
  try{
   return this.transaction(()=>{
    if(this.webSearchable)this.run(`INSERT INTO web_records_search(web_records_search,rowid,body) SELECT 'delete',id,body FROM web_records WHERE ${visits} AND body<>''`,...values);
    this.run(`DELETE FROM web_records WHERE ${visits}`,...values);
    return Number(this.run(`DELETE FROM web_visits WHERE ${where}`,...values).changes);
   });
  }catch{throw new WorldletError('Could not delete the browsing recordings.');}
 }

 // Everything else the World keeps ----------------------------------------------------------------
 // Owner decision 2026-10-05: everything that happens in the World is recorded in this database, so a
 // backup restored on another computer brings the whole World back. Each was a file of its own before
 // (store/moved-in.ts moves those in once): the execution journal's payloads (`execution/<id>.json`,
 // still the reference recorded in history), made games (`games/<id>/`), reviewed email drafts
 // (`mail/reviews.json`) and Codex coding tasks (`agent/private/codex/<id>/task.json` and `files/`).
 // Order submissions, which used to leave no local copy, are kept here too, and so are the messages sent
 // from the Messages Applet (sources/messages.ts). (The YouTube queue,
 // `youtube.json`, is the `world_settings` row 'youtube', moved in by WorldStore.worldSetting.)
 private keptReady=false;
 private ensureKept(){
  if(this.keptReady)return;
  this.exec(`CREATE TABLE IF NOT EXISTS execution_payloads (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS made_games (id TEXT PRIMARY KEY, record TEXT NOT NULL, html TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS made_game_versions (id TEXT NOT NULL, version INTEGER NOT NULL, html TEXT NOT NULL, PRIMARY KEY(id, version));
   CREATE TABLE IF NOT EXISTS mail_reviews (id TEXT PRIMARY KEY, review TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS coding_tasks (id TEXT PRIMARY KEY, record TEXT NOT NULL, files TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, at REAL NOT NULL, record TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sent_messages (id TEXT PRIMARY KEY, at TEXT NOT NULL, record TEXT NOT NULL);`);
  this.keptReady=true;
 }
 /** One execution journal entry (agent-runtime/journal.ts) in one transaction: its runtime task and run,
  * the history event and the payload its `execution/<id>.json` reference names. */
 recordExecution(entry:Row):boolean {
  const event=entry?.event;
  if(!event||typeof event!=='object')return false;
  const reference=event.data?.payloadRef;
  try{
   return this.transaction(()=>{
    if(typeof entry.task?.id==='string')this.put('runtime-tasks',entry.task.id,entry.task);
    if(typeof entry.run?.id==='string')this.put('runtime-runs',entry.run.id,entry.run);
    this.append(event,typeof event.runId==='string'?event.runId:'');
    if(typeof reference==='string'&&/^execution\/[a-zA-Z0-9_.-]{1,180}\.json$/.test(reference))this.savePayload(reference.slice('execution/'.length,-'.json'.length),entry.payload);
    return true;
   });
  }catch{return false;}
 }
 /** One execution journal payload, by the id in its `execution/<id>.json` reference. */
 savePayload(id:string,payload:unknown){
  this.ensureKept();
  this.run('INSERT INTO execution_payloads(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',id,JSON.stringify(payload??null));
 }
 payload(id:string):unknown {
  this.ensureKept();
  const row=this.all('SELECT payload FROM execution_payloads WHERE id=?',id)[0];
  return row?JSON.parse(String(row.payload)):undefined;
 }
 /** Every made game's record (pages stay in the table until asked for). */
 madeGameRecords():Row[] {
  this.ensureKept();
  return this.all('SELECT record FROM made_games ORDER BY id').map(row=>JSON.parse(String(row.record)));
 }
 madeGamePage(id:string):string|null {
  this.ensureKept();
  const row=this.all('SELECT html FROM made_games WHERE id=?',id)[0];
  return row?String(row.html):null;
 }
 /** Saves a game's record, and its page when given; a changed page keeps the last `versions` pages. */
 saveMadeGame(id:string,record:Row,html?:string,versions=0){
  this.ensureKept();
  try{
   this.transaction(()=>{
    const previous=this.all('SELECT record,html FROM made_games WHERE id=?',id)[0];
    if(html===undefined){this.run('UPDATE made_games SET record=? WHERE id=?',JSON.stringify(record),id);return;}
    if(previous&&versions>0){
     const version=Number(record.version)-1;
     if(Number.isInteger(version)&&version>0)this.run('INSERT INTO made_game_versions(id,version,html) VALUES(?,?,?) ON CONFLICT(id,version) DO UPDATE SET html=excluded.html',id,version,String(previous.html));
     this.run('DELETE FROM made_game_versions WHERE id=? AND version NOT IN (SELECT version FROM made_game_versions WHERE id=? ORDER BY version DESC LIMIT ?)',id,id,versions);
    }
    this.run('INSERT INTO made_games(id,record,html) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,html=excluded.html',id,JSON.stringify(record),html);
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the game.');}
 }
 madeGameVersions(id:string):{version:number;html:string}[] {
  this.ensureKept();
  return this.all('SELECT version,html FROM made_game_versions WHERE id=? ORDER BY version DESC',id).map(row=>({version:Number(row.version),html:String(row.html)}));
 }
 deleteMadeGame(id:string){
  this.ensureKept();
  try{this.transaction(()=>{this.run('DELETE FROM made_game_versions WHERE id=?',id);this.run('DELETE FROM made_games WHERE id=?',id);});}
  catch{throw new WorldletError('Could not delete the game.');}
 }
 /** Reviewed email drafts by id (sources/reviews.ts validates them). */
 mailReviews():Record<string,Row> {
  this.ensureKept();
  return Object.fromEntries(this.all('SELECT id,review FROM mail_reviews ORDER BY id').map(row=>[String(row.id),JSON.parse(String(row.review))]));
 }
 /** Replaces every reviewed email draft at once. */
 replaceMailReviews(reviews:Record<string,Row>){
  this.ensureKept();
  try{
   this.transaction(()=>{
    this.run('DELETE FROM mail_reviews');
    for(const [id,review] of Object.entries(reviews))this.run('INSERT INTO mail_reviews(id,review) VALUES(?,?)',id,JSON.stringify(review));
   });
  }catch{throw new WorldletError('Could not save the email review.');}
 }
 /** Codex coding tasks: the record and the files it made ({path: content}). */
 codingTasks():{record:Row;files:Record<string,string>}[] {
  this.ensureKept();
  return this.all('SELECT record,files FROM coding_tasks ORDER BY id').map(row=>({record:JSON.parse(String(row.record)),files:JSON.parse(String(row.files))}));
 }
 codingTask(id:string):{record:Row;files:Record<string,string>}|null {
  this.ensureKept();
  const row=this.all('SELECT record,files FROM coding_tasks WHERE id=?',id)[0];
  return row?{record:JSON.parse(String(row.record)),files:JSON.parse(String(row.files))}:null;
 }
 /** Saves a task's record, and the files it made when given. */
 saveCodingTask(record:Row,files?:Record<string,string>){
  this.ensureKept();
  const id=String(record.id);
  try{
   if(files===undefined)this.run("INSERT INTO coding_tasks(id,record,files) VALUES(?,?,'{}') ON CONFLICT(id) DO UPDATE SET record=excluded.record",id,JSON.stringify(record));
   else this.run('INSERT INTO coding_tasks(id,record,files) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,files=excluded.files',id,JSON.stringify(record),JSON.stringify(files));
  }catch{throw new WorldletError('Could not save the coding task.');}
 }
 /** Order submissions, newest first: the words, where they were said and what reached admin and the project. */
 orders(limit=100):Row[] {
  this.ensureKept();
  return this.all('SELECT record FROM orders ORDER BY at DESC LIMIT ?',Math.max(1,Math.min(1000,limit))).map(row=>JSON.parse(String(row.record)));
 }
 saveOrder(id:string,at:number,record:Row){
  this.ensureKept();
  try{this.run('INSERT INTO orders(id,at,record) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,record=excluded.record',id,at,JSON.stringify(record));}
  catch{throw new WorldletError('Could not save the Order.');}
 }
 /** Messages sent from the Messages Applet, newest first: to whom, the words, and whether Messages sent them. */
 sentMessages(limit=100):Row[] {
  this.ensureKept();
  return this.all('SELECT record FROM sent_messages ORDER BY at DESC LIMIT ?',Math.max(1,Math.min(1000,limit))).map(row=>JSON.parse(String(row.record)));
 }
 sentMessage(id:string):Row|null {
  this.ensureKept();
  const row=this.all('SELECT record FROM sent_messages WHERE id=?',id)[0];
  return row?JSON.parse(String(row.record)):null;
 }
 saveSentMessage(record:Row){
  this.ensureKept();
  try{this.run('INSERT INTO sent_messages(id,at,record) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,record=excluded.record',String(record.id),String(record.at),JSON.stringify(record));}
  catch{throw new WorldletError('Could not record the message.');}
 }
 deleteSentMessage(id:string){
  this.ensureKept();
  this.run('DELETE FROM sent_messages WHERE id=?',id);
 }
}
