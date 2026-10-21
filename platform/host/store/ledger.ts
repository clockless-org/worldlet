import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ensureDirectory,WorldletError} from '../files.ts';
import {stableJSON} from './swift-json.ts';
import {WORLD_VIEWS_SQL} from '../../../contracts/storage/world-views.ts';
import {AppTables} from './app.ts';
import {AppletTables} from './applets.ts';
import {AttentionTables,identity} from './attention.ts';
import {CompanionTables,OWN} from './companion.ts';
import {ConnectorTables,safeLibraryComponent,storedConfiguration} from './connectors.ts';
import {GateTables} from './gate.ts';
import {RecordingTables} from './recordings.ts';
import {TaskTables} from './tasks.ts';
export {Cancelled} from './tasks.ts';

type Row=Record<string,any>;

/** Worldlet's durable facts, independent of any Harness's conversation or memory files.
 * Only bound values reach SQL; an Agent never receives a SQL execution tool.
 * This file opens the database and keeps `entries` (history and state revisions); each component's tables are read
 * and written in its own file beside it (attention.ts, companion.ts, applets.ts …), whose methods are this class's. */
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
 /** Evidence identity, byte-compatible with the Mac host's SHA-256 over sorted JSONSerialization. */
 static identity=identity;
 static readonly OWN=OWN;
 static safeLibraryComponent=safeLibraryComponent;
 static storedConfiguration=storedConfiguration;
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
}

// Each component's methods are written with `this:WorldLedger`; on the ledger they are its own.
type Tables<T>={[K in keyof T]:T[K] extends (this:WorldLedger,...args:infer A)=>infer R?(...args:A)=>R:T[K]};
export interface WorldLedger extends Tables<AppTables>,Tables<AppletTables>,Tables<AttentionTables>,Tables<CompanionTables>,Tables<ConnectorTables>,Tables<GateTables>,Tables<RecordingTables>,Omit<Tables<TaskTables>,'withRuntimeOutput'> {
 /** Claim validation and the writes in `body` share one transaction; `body` must be synchronous. */
 withRuntimeOutput<T>(taskID:string,runID:string,body:()=>T):T;
}
for(const tables of [AppTables,AppletTables,AttentionTables,CompanionTables,ConnectorTables,GateTables,RecordingTables,TaskTables]){
 for(const [name,method] of Object.entries(Object.getOwnPropertyDescriptors(tables.prototype)))if(name!=='constructor')Object.defineProperty(WorldLedger.prototype,name,method);
}
