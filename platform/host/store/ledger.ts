import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {core} from '../core.ts';
import {digest,ensureDirectory,WorldletError} from '../files.ts';
import {swiftJSON,swiftFold,stableJSON,sameJSON} from './swift-json.ts';
import {SERVICE_SYNC_BUCKETS} from '../../../contracts/service-sync.ts';
import {WORLD_VIEWS_SQL} from '../../../contracts/storage/world-views.ts';
import {CompanionTables,ensureCompanion,OWN} from './companion.ts';
import {RecordingTables} from './recordings.ts';
import {TaskTables} from './tasks.ts';
export {Cancelled} from './tasks.ts';

type Row=Record<string,any>;
const now=()=>Date.now()/1000;
const iso=()=>new Date().toISOString();

/** Worldlet's durable facts, independent of any Harness's conversation or memory files.
 * Only bound values reach SQL; an Agent never receives a SQL execution tool.
 * This file opens the database and keeps `entries` (history and state revisions); a component's tables are read
 * and written in its own file beside it (tasks.ts, companion.ts, recordings.ts), whose methods are this class's. */
export class WorldLedger {
 db:DatabaseSync|null;
 readonly root:string;
 readonly runtimeSpec:(owner:string)=>Row|null;
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
 static readonly OWN=OWN;
 /** Names each open savepoint; nested ones only need distinct names. */
 private savepoints=0;
 close(){this.db?.close();this.db=null;}
 // The component tables beside this file read and write through these.
 get handle(){if(!this.db)throw new WorldletError('The world database is closed.');return this.db;}
 // A closed ledger keeps its own message, so a write racing quit is not reported as a failed save.
 exec(sql:string){const db=this.handle;try{db.exec(sql);}catch{throw new WorldletError('Could not save world data.');}}
 all(sql:string,...values:any[]):Row[]{return this.handle.prepare(sql).all(...values) as Row[];}
 run(sql:string,...values:any[]){return this.handle.prepare(sql).run(...values);}
 tableExists(name:string){return this.all("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name).length>0;}
 /** Version 2 kept a mutable record bucket beside an append-only stream; both now share entries. */
 private migrateLegacyTables(){
  if(!this.tableExists('events')&&!this.tableExists('records'))return;
  this.transaction(()=>{
   if(this.tableExists('events')){this.exec("INSERT INTO entries(seq,at,kind,key,body) SELECT seq,at,kind,COALESCE(applet,''),body FROM events ORDER BY seq;");this.exec('DROP TABLE events;');}
   if(this.tableExists('records')){this.exec("INSERT INTO entries(at,kind,key,body) SELECT strftime('%s','now'),'state.' || bucket,id,body FROM records;");this.exec('DROP TABLE records;');}
  });
 }
 transaction<T>(work:()=>T):T {
  const name='worldlet_'+(++this.savepoints);
  this.exec('SAVEPOINT '+name);
  try{const result=work();this.exec('RELEASE SAVEPOINT '+name);return result;}
  catch(error){try{this.handle.exec('ROLLBACK TO SAVEPOINT '+name);this.handle.exec('RELEASE SAVEPOINT '+name);}catch{}throw error;}
 }
 // What happened in this world, kept whole and local. Recording never runs a model and
 // never fails the action it describes.
 record(kind:string,key='',body:Row={},at=Date.now()/1000):boolean {
  if(!this.db||!kind||kind.length>64)return false;
  try{this.run('INSERT INTO entries(at,kind,key,body) VALUES(?,?,?,?)',at,kind,key,stableJSON(body));return true;}catch{return false;}
 }
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
 /** Every stored revision of a state bucket (optionally one key), oldest first. */
 revisions(bucket:string,key?:string){
  const rows=key==null?this.all('SELECT seq,body FROM entries WHERE kind=? ORDER BY seq','state.'+bucket):this.all('SELECT seq,body FROM entries WHERE kind=? AND key=? ORDER BY seq','state.'+bucket,key);
  return rows.map(row=>{let body;try{body=JSON.parse(row.body);}catch{}if(!body||typeof body!=='object')throw new WorldletError('Invalid world data; existing data was preserved.');return {seq:Number(row.seq),body};});
 }
 /** Library rows last committed through this connection; lets an unchanged save skip a re-encode. */
 private savedLibrary:{sources:string,knowledge:string}|null=null;
 /** One Agent's audit entry (`agent.audit`, agent/gate/GRANTS.md), keyed by its Agent; only its newest `keep` stay. */
 recordAgentAudit(entry:Row,keep:number):boolean {
  const agent=typeof entry.agentId==='string'?entry.agentId:'';
  if(!agent||!this.record('agent.audit',agent,entry))return false;
  try{this.run("DELETE FROM entries WHERE kind='agent.audit' AND key=? AND seq NOT IN (SELECT seq FROM entries WHERE kind='agent.audit' AND key=? ORDER BY seq DESC LIMIT ?)",agent,agent,Math.max(1,keep));}catch{}
  return true;
 }
 /** One Agent's newest audit entries, newest first. */
 agentAudit(agent:string,limit=50):Row[] {
  return this.all("SELECT body FROM entries WHERE kind='agent.audit' AND key=? ORDER BY seq DESC LIMIT ?",agent,Math.max(1,Math.min(500,limit))).flatMap(row=>{
   try{const value=JSON.parse(row.body);return value&&typeof value==='object'&&!Array.isArray(value)?[value]:[];}catch{return [];}
  });
 }
 // Agent asks (agent/gate/asks.ts, agent/gate/GRANTS.md#agent-asks) ---------------------------------------
 /** Every Agent ask's current value (`state.agent-asks`). */
 agentAsks():Row[]{return this.records('agent-asks');}
 /** One ask and its Attention item, saved together. The item is the host's own (provider `agents`): its status is the
  * ask's, set by the person (`user`) or by an Agent's claim or resolve (`agent`), and its Agent the ask's. The bytes of
  * the attachments a new ask carries are saved with it (`agent_ask_attachments`); the ask keeps only what describes them. */
 saveAgentAsk(ask:Row,item:Row,origin:'user'|'agent',attachments:{id:string;data:Uint8Array}[]=[]){
  this.transaction(()=>{
   if(attachments.length){
    this.ensureAskAttachments();
    for(const file of attachments)this.run('INSERT INTO agent_ask_attachments(ask_id,id,data) VALUES(?,?,?) ON CONFLICT(ask_id,id) DO UPDATE SET data=excluded.data',String(ask.id),file.id,file.data);
   }
   core('worldItemValidate',{item,dates:{start:null,end:null}});
   const previous=this.value('items',item.id);
   const prepared=core<Row>('worldItemPrepare',{item,previous:previous??{},id:item.id,identity:WorldLedger.identity(item),run:'agent-asks',now:iso(),
    previousIdentity:previous?WorldLedger.identity(previous):'',agentId:ask.agentId});
   prepared.status=item.status;prepared.statusOrigin=origin;
   this.put('agent-asks',ask.id,ask);this.put('items',item.id,prepared);
  });
 }
 private askAttachmentsReady=false;
 private ensureAskAttachments(){
  if(this.askAttachmentsReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS agent_ask_attachments (ask_id TEXT NOT NULL, id TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(ask_id, id));');
  this.askAttachmentsReady=true;
 }
 /** `length` bytes of one ask's attachment from `offset` (SQLite reads only that part), or null when it is not kept. */
 agentAskAttachment(askId:string,id:string,offset:number,length:number):Uint8Array|null {
  this.ensureAskAttachments();
  const row=this.all('SELECT substr(data,?,?) AS part FROM agent_ask_attachments WHERE ask_id=? AND id=?',Math.max(0,offset)+1,Math.max(0,length),askId,id)[0];
  return row?(row.part instanceof Uint8Array?row.part:new Uint8Array(0)):null;
 }
 // GitHub drafts (agent/gate/github-drafts.ts, agent/gate/GRANTS.md#github-drafts) -------------------------------
 /** Every GitHub draft's current value (`state.github-drafts`). */
 githubDrafts():Row[]{return this.records('github-drafts');}
 /** One draft and its Attention item, saved together, as an ask is: the item is the host's own (provider `agents`), its
  * status the draft's, set by the person (`user`) or by the Agent's draft (`agent`), and its Agent the draft's. */
 saveGithubDraft(draft:Row,item:Row,origin:'user'|'agent'){this.saveDraft('github-drafts',draft,item,origin);}
 // PostHog and Notion drafts (agent/gate/service-drafts.ts, agent/gate/GRANTS.md#posthog-and-notion-drafts) -------
 /** Every PostHog and Notion draft's current value (`state.service-drafts`). */
 serviceDrafts():Row[]{return this.records('service-drafts');}
 /** One draft and its Attention item, saved together, as a GitHub draft is. */
 saveServiceDraft(draft:Row,item:Row,origin:'user'|'agent'){this.saveDraft('service-drafts',draft,item,origin);}
 private saveDraft(bucket:string,draft:Row,item:Row,origin:'user'|'agent'){
  this.transaction(()=>{
   core('worldItemValidate',{item,dates:{start:null,end:null}});
   const previous=this.value('items',item.id);
   const prepared=core<Row>('worldItemPrepare',{item,previous:previous??{},id:item.id,identity:WorldLedger.identity(item),run:bucket,now:iso(),
    previousIdentity:previous?WorldLedger.identity(previous):'',agentId:draft.agentId});
   prepared.status=item.status;prepared.statusOrigin=origin;
   this.put(bucket,draft.id,draft);this.put('items',item.id,prepared);
  });
 }
 // Remote MCP consents (agent/gate/remote-mcp.ts, agent/gate/REMOTE-MCP.md) ----------------------------------------
 /** Every remote connection the person was asked to allow (`state.remote-mcp-consents`). */
 remoteConsents():Row[]{return this.records('remote-mcp-consents');}
 /** One consent and its Attention item, saved together: the item is the host's own (provider `agents`), its status the
  * consent's, set by the person's answer (`user`) or by the request itself, or its running out (`agent`). */
 saveRemoteConsent(consent:Row,item:Row,origin:'user'|'agent'){
  this.transaction(()=>{
   core('worldItemValidate',{item,dates:{start:null,end:null}});
   const previous=this.value('items',item.id);
   const prepared=core<Row>('worldItemPrepare',{item,previous:previous??{},id:item.id,identity:WorldLedger.identity(item),run:'remote-mcp',now:iso(),
    previousIdentity:previous?WorldLedger.identity(previous):''});
   prepared.status=item.status;prepared.statusOrigin=origin;
   this.put('remote-mcp-consents',consent.id,consent);this.put('items',item.id,prepared);
  });
 }
 // Service requests (agent/gate/service-requests.ts, agent/gate/GRANTS.md#when-an-agent-first-needs-a-service) -----
 /** Every Agent's request to read a Service, answered or not (`state.service-requests`). */
 serviceRequests():Row[]{return this.records('service-requests');}
 /** One request and its Attention item, saved together, as a draft is: the item is the host's own (provider `agents`),
  * its status the request's, set by the person's answer (`user`) or by the refused call that asked (`agent`). */
 saveServiceRequest(request:Row,item:Row,origin:'user'|'agent'){this.saveDraft('service-requests',request,item,origin);}
 // Service presets (context/connectors/services/presets.ts, context/applets/INTEGRATIONS.md#service-presets) ---------------
 /** Every saved Service preset (`state.service-presets`), by ID. */
 servicePresets():Row[]{return this.records('service-presets');}
 saveServicePreset(preset:Row){this.put('service-presets',preset.id,preset);}
 /** Removes the preset and its earlier revisions. */
 deleteServicePreset(id:string){
  this.transaction(()=>{
   if(this.value('service-sync-jobs',id))this.invalidateRuntimeTasks('service-sync:'+id);
   for(const bucket of SERVICE_SYNC_BUCKETS)this.delete(bucket,id);
   this.delete('service-presets',id);
  });
 }
 // Agent reports (agent/gate/reports.ts, agent/gate/GRANTS.md#agent-reports) ------------------------------------
 /** Each Agent's one report (`state.agent-reports`, keyed by the Agent). */
 agentReports():Row[]{return this.records('agent-reports');}
 saveAgentReport(report:Row){this.put('agent-reports',report.agentId,report);}
 // The board (context/connectors/BOARD.md) -------------------------------------------------------------------------------
 /** The board's current definition and revision (`state.board`), or null with none. */
 board():Row|null{return this.value('board','board');}
 saveBoard(board:Row){this.put('board','board',board);}
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
 /** `items` is the items bucket when the caller already read it. */
 taskNeedsReview(item:Row,items?:Row[]){
  if(typeof item.id!=='string')return false;
  const previous=items?items.find(row=>row.id===item.id):this.find('items',item.id);if(!previous)return false;
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
   // Search indexes are rebuilt on open. `agent_conversations_search` is the index of a table older Worlds kept and
   // nothing writes now; its rows stay, its index is left out.
   const indexes=(copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('companion_turns_search','companion_notes_search','agent_conversations_search')").all() as Row[]).map(row=>String(row.name));
   if(indexes.length){for(const name of indexes)copy.exec(`DROP TABLE ${name}`);copy.exec('VACUUM');}
  }finally{copy.close();}
 }
 /** How much each kind of context this World keeps holds, for Settings › Context (context/connectors/world-context.ts): the
  * past conversations (how many, and their text), each Service's synced context, the Journal's cards and what Agents
  * saved there (with their pages), and the board's definition. Bytes of what is kept now, not of older revisions. */
 contextSizes():{conversations:{count:number;bytes:number};services:{provider:string;bytes:number}[];journal:{bytes:number};agentOutputs:{bytes:number};board:{bytes:number}} {
  ensureCompanion(this);this.ensureArtifacts();this.ensureArtifactPages();
  const bytes=(value:unknown)=>value==null?0:Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
  const turns=this.all("SELECT count(DISTINCT source||char(31)||session) AS n,coalesce(sum(length(CAST(text AS BLOB))),0) AS b FROM companion_turns")[0];
  const notes=Number(this.all('SELECT coalesce(sum(length(CAST(text AS BLOB))),0) AS b FROM companion_notes')[0]?.b??0);
  const [jobs,pages,snapshots]=SERVICE_SYNC_BUCKETS;
  const providerOf=new Map(this.records(jobs).map(job=>[String(job.id),String(job.provider??'')]));
  const services=new Map<string,number>();
  for(const bucket of [pages,snapshots]){
   const kind='state.'+bucket;
   for(const row of this.all('SELECT key,length(CAST(body AS BLOB)) AS b FROM entries WHERE kind=? AND seq IN (SELECT MAX(seq) FROM entries WHERE kind=? GROUP BY key)',kind,kind)){
    const provider=providerOf.get(String(row.key));
    if(provider)services.set(provider,(services.get(provider)??0)+Number(row.b));
   }
  }
  let journal=0,agentOutputs=0;
  for(const row of this.all('SELECT a.record AS record,coalesce((SELECT length(CAST(p.record AS BLOB)) FROM artifact_pages p WHERE p.id=a.id),0) AS page FROM artifacts a')){
   let agent=false;try{agent=typeof JSON.parse(String(row.record))?.agentId==='string';}catch{}
   const size=bytes(String(row.record))+Number(row.page);
   if(agent)agentOutputs+=size;else journal+=size;
  }
  return {conversations:{count:Number(turns?.n??0),bytes:Number(turns?.b??0)+notes},services:[...services].map(([provider,size])=>({provider,bytes:size})),
   journal:{bytes:journal},agentOutputs:{bytes:agentOutputs},board:{bytes:bytes(this.board())}};
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

 // My Applets ---------------------------------------------------------------------------------------
 // The person's own Applets (context/applets/MY-APPLETS.md#one-table), one row each in one table: a website made into
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

 // Pages Fox made (context/store): `page` rows of the person's own Applets.
 widgetRows():{record:Row;state:Row}[] {return this.myApplets('page').map(({record,state})=>({record,state}));}
 widgetPage(id:string):string|null {return this.myAppletPage(id);}
 /** Saves a page's record, and its page and state when given; a new page needs both. */
 saveWidget(id:string,record:Row,{html,state}:{html?:string;state?:Row}={}){
  if(html===undefined&&!this.all("SELECT 1 FROM my_applets WHERE id=? AND kind='page'",id).length)return;
  this.saveMyApplet(id,'page',record,{html,state});
 }
 deleteWidget(id:string){this.deleteMyApplets([id]);}

 // Artifacts ---------------------------------------------------------------------------------------
 // Every card Fox showed (context/store): one row each, newest shown last in `at`.
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

 // A page the Agent wrote for an artifact (context/store/artifact-render.ts), kept apart from the record so listing
 // artifacts never reads the documents.
 private artifactPagesReady=false;
 private ensureArtifactPages(){
  if(this.artifactPagesReady)return;
  this.exec('CREATE TABLE IF NOT EXISTS artifact_pages (id TEXT PRIMARY KEY, record TEXT NOT NULL, at REAL NOT NULL);');
  this.artifactPagesReady=true;
 }
 artifactPage(id:string):Row|null {
  this.ensureArtifactPages();
  const row=this.all('SELECT record FROM artifact_pages WHERE id=?',id)[0];
  return row?JSON.parse(String(row.record)):null;
 }
 /** The IDs of every kept page, newest first. */
 artifactPageIds():string[] {
  this.ensureArtifactPages();
  return this.all('SELECT id FROM artifact_pages ORDER BY at DESC').map(row=>String(row.id));
 }
 saveArtifactPage(record:Row){
  this.ensureArtifactPages();
  try{this.run('INSERT INTO artifact_pages(id,record,at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,at=excluded.at',String(record.id),JSON.stringify(record),Number(record.createdAt)||0);}
  catch{throw new WorldletError('Could not save the artifact page.');}
 }
 deleteArtifactPages(ids:string[]){
  if(!ids.length)return;
  this.ensureArtifactPages();
  try{this.transaction(()=>{for(const id of ids)this.run('DELETE FROM artifact_pages WHERE id=?',id);});}
  catch{throw new WorldletError('Could not forget the artifact page.');}
 }

 // Local calendar events ---------------------------------------------------------------------------
 // Events the person made in the Calendar Applet (context/applets/calendar-events.ts): one row each.
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
 // Brought conversations the person made into Applets (agent/tasks): `conversation` rows of the person's own
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
 /** How many events the World has written, deleted ones included (the newest sequence number). */
 eventRows():number {return Number(this.all('SELECT coalesce(max(seq),0) AS n FROM entries')[0]?.n??0);}

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
 /** Order submissions from before Orders were retired (2026-10-18), newest first; kept for backups and restores. */
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

// Each component's methods are written with `this:WorldLedger`; on the ledger they are its own.
type Tables<T>={[K in keyof T]:T[K] extends (this:WorldLedger,...args:infer A)=>infer R?(...args:A)=>R:T[K]};
export interface WorldLedger extends Tables<CompanionTables>,Tables<RecordingTables>,Omit<Tables<TaskTables>,'withRuntimeOutput'> {
 /** Claim validation and the writes in `body` share one transaction; `body` must be synchronous. */
 withRuntimeOutput<T>(taskID:string,runID:string,body:()=>T):T;
}
for(const tables of [CompanionTables,RecordingTables,TaskTables]){
 for(const [name,method] of Object.entries(Object.getOwnPropertyDescriptors(tables.prototype)))if(name!=='constructor')Object.defineProperty(WorldLedger.prototype,name,method);
}
