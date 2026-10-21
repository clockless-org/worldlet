import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {core} from '../core.ts';
import {WorldletError} from '../files.ts';
import {SERVICE_SYNC_BUCKETS} from '../../../contracts/service-sync.ts';
import {ensureArtifactPages,ensureArtifacts,ensureKept} from './applets.ts';
import {ensureCompanion} from './companion.ts';
import type {WorldLedger} from './ledger.ts';

// What the app keeps for itself: small World settings (`world_settings`), the World's history (`entries` that are not
// state), the execution journal's payloads, backups, and how much each kind of context holds.
type Row=Record<string,any>;
const settingsReady=new WeakSet<WorldLedger>();
// Small World settings ----------------------------------------------------------------------------
// One JSON value per key: the page's layout edits ('overlay') and weather ('environment'), before
// 2026-10-03 overlay.json and environment.json (WorldStore.worldSetting moves them in); and the
// World's configuration ('configuration', connectors.ts).
function ensureSettings(ledger:WorldLedger){
 if(settingsReady.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS world_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
 settingsReady.add(ledger);
}

export class AppTables {
 setting(this:WorldLedger,key:string):Row|null {
  ensureSettings(this);
  const row=this.all('SELECT value FROM world_settings WHERE key=?',key)[0];
  return row?JSON.parse(String(row.value)):null;
 }
 saveSetting(this:WorldLedger,key:string,value:Row|null){
  ensureSettings(this);
  try{
   if(value===null)this.run('DELETE FROM world_settings WHERE key=?',key);
   else this.run('INSERT INTO world_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
  }catch{throw new WorldletError('Could not save world settings.');}
 }

 // History -------------------------------------------------------------------------------
 /** Identified history append; Core owns identity, so a retried (kind,key,id) adds no second row. */
 append(this:WorldLedger,body:Row,key=''){
  if(!this.db||typeof body.kind!=='string'||typeof body.at!=='number')throw new WorldletError('Cannot save history event.');
  const plan=core('worldEventAppend',{kind:body.kind,key,at:body.at,observedAt:Date.now()/1000,body});
  try{this.run(plan.sql,...plan.values);}catch{throw new WorldletError('Cannot save history event.');}
 }
 /** Bounded query for the history tool. Filters are optional and combine. */
 queryWorldHistory(this:WorldLedger,args:Row){
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
 history(this:WorldLedger,{since,until,kind,kinds,key,limit=200,before,after}:{since?:number,until?:number,kind?:string,kinds?:readonly string[],key?:string,limit?:number,before?:number,after?:number}={}){
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
 eventCount(this:WorldLedger){return Number(this.all("SELECT COUNT(*) AS n FROM entries WHERE kind NOT LIKE 'state.%'")[0]?.n??0);}
 /** How many events the World has written, deleted ones included (the newest sequence number). */
 eventRows(this:WorldLedger):number {return Number(this.all('SELECT coalesce(max(seq),0) AS n FROM entries')[0]?.n??0);}

 // Execution journal ---------------------------------------------------------------------
 /** One execution journal entry (agent-runtime/journal.ts) in one transaction: its runtime task and run,
  * the history event and the payload its `execution/<id>.json` reference names. */
 recordExecution(this:WorldLedger,entry:Row):boolean {
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
 savePayload(this:WorldLedger,id:string,payload:unknown){
  ensureKept(this);
  this.run('INSERT INTO execution_payloads(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',id,JSON.stringify(payload??null));
 }
 payload(this:WorldLedger,id:string):unknown {
  ensureKept(this);
  const row=this.all('SELECT payload FROM execution_payloads WHERE id=?',id)[0];
  return row?JSON.parse(String(row.payload)):undefined;
 }

 // Backups and sizes ---------------------------------------------------------------------
 /** A copy for backup, without the search index (derived; rebuilt when the copy is opened). Consistent: made through
  * SQLite rather than by copying a live WAL file. */
 snapshotTo(this:WorldLedger,file:string){
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
 contextSizes(this:WorldLedger):{conversations:{count:number;bytes:number};services:{provider:string;bytes:number}[];journal:{bytes:number};agentOutputs:{bytes:number};board:{bytes:number}} {
  ensureCompanion(this);ensureArtifacts(this);ensureArtifactPages(this);
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
}
