import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {core} from '../core.ts';
import {digest,WorldletError} from '../files.ts';
import {stableJSON,sameJSON} from './swift-json.ts';
import {SERVICE_SYNC_BUCKETS} from '../../../contracts/service-sync.ts';
import type {WorldLedger} from './ledger.ts';

// What Connectors bring in and how it is forgotten: the library's Sources and Knowledge (`sources`, `knowledge`,
// `library_meta`), the World's configuration (the `world_settings` row 'configuration'), Service presets and the board
// (`state.*` buckets), and local deletion, which scrubs every revision a forgotten source or Service left behind.
type Row=Record<string,any>;
/** Library rows last committed through each connection; lets an unchanged save skip a re-encode. */
const savedLibrary=new WeakMap<WorldLedger,{sources:string,knowledge:string}>();

export function safeLibraryComponent(value:string){return !!value&&value!=='.'&&value!=='..'&&!/[\\/\0]/.test(value);}
/** Library-relative directories a deletion may remove: the World layout, caches and per-source copies. */
function deletionPath(file:unknown){
 if(typeof file!=='string')return false;
 if(file==='world'||file==='cache')return true;
 const match=/^(sources|knowledge|cache\/knowledge)\/([^/]+)$/.exec(file);
 return !!match&&safeLibraryComponent(match[2]);
}
// The World's configuration ------------------------------------------------------------------------
// Connections, onboarding, layout and the rest of the library state (Sources and Knowledge have their
// own tables) are the `world_settings` row 'configuration'; before 2026-10-03 the `index.json` file.
/** The saved configuration, read without opening the ledger. An `index.json` beside the database is
 * the earlier file, or one an older backup brought back, and is the newer copy until it moves in. */
export function storedConfiguration(root:string):Row|null {
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
// Deletion ------------------------------------------------------------------------------
/** Replaces one stored revision's body, or deletes it for null; an unchanged body is left alone. */
function rewriteEntry(ledger:WorldLedger,seq:unknown,body:Row,replacement:Row|null){
 if(replacement&&sameJSON(replacement,body))return;
 try{
  if(replacement)ledger.run('UPDATE entries SET body=? WHERE seq=?',stableJSON(replacement),seq);
  else ledger.run('DELETE FROM entries WHERE seq=?',seq);
 }catch{throw new WorldletError('Could not remove source history.');}
}
/** Rows that exist only because an item did: its review reasons and pre-migration copy. */
function forgetTrail(ledger:WorldLedger,ids:string[],source:string){
 ledger.clearTaskReviews({gone:ids,source});
 if(!ids.length)return;
 const set=new Set(ids);
 for(const id of set)ledger.delete('attention-backup',id);
 for(const row of ledger.records('reviews'))if(set.has(row.id)&&typeof row.runId==='string')ledger.delete('reviews',row.runId+':'+row.id);
}

export class ConnectorTables {
 // Service presets (context/connectors/services/presets.ts, context/applets/INTEGRATIONS.md#service-presets) ---------------
 /** Every saved Service preset (`state.service-presets`), by ID. */
 servicePresets(this:WorldLedger):Row[]{return this.records('service-presets');}
 saveServicePreset(this:WorldLedger,preset:Row){this.put('service-presets',preset.id,preset);}
 /** Removes the preset and its earlier revisions. */
 deleteServicePreset(this:WorldLedger,id:string){
  this.transaction(()=>{
   if(this.value('service-sync-jobs',id))this.invalidateRuntimeTasks('service-sync:'+id);
   for(const bucket of SERVICE_SYNC_BUCKETS)this.delete(bucket,id);
   this.delete('service-presets',id);
  });
 }
 // The board (context/connectors/BOARD.md) -------------------------------------------------------------------------------
 /** The board's current definition and revision (`state.board`), or null with none. */
 board(this:WorldLedger):Row|null{return this.value('board','board');}
 saveBoard(this:WorldLedger,board:Row){this.put('board','board',board);}

 // Formal library tables -------------------------------------------------------------------
 /** Loads Sources/Knowledge; a fresh database imports the configuration's legacy arrays once. */
 loadLibrary(this:WorldLedger,state:Row){
  if(state.libraryStorageVersion!=null&&state.libraryStorageVersion!==1)throw new WorldletError('This library needs a newer Worldlet.');
  const markers=this.all("SELECT value FROM library_meta WHERE key='version'");
  if(!markers.length){
   if(state.libraryStorageVersion!=null)throw new WorldletError('The World library database is missing. Restore its backup before continuing.');
   this.saveLibrary(state);
  }else if(String(markers[0].value)!=='1')throw new WorldletError('This library database needs a newer Worldlet.');
  const sources=this.all('SELECT body FROM sources ORDER BY position,id').map(row=>JSON.parse(row.body));
  for(const source of sources){
   const parts=String(source.blob).split('/');
   if(!safeLibraryComponent(source.id)||!safeLibraryComponent(source.revision)||!String(source.blob).startsWith('sources/'+source.id+'/')||!String(source.blob).endsWith('.json')||!parts.every(safeLibraryComponent))throw new WorldletError('Invalid library source identity; originals were preserved.');
  }
  state.sources=sources;
  state.knowledge=this.all('SELECT body FROM knowledge ORDER BY position,source_id').map(row=>JSON.parse(row.body));
  state.libraryStorageVersion=1;
  savedLibrary.set(this,{sources:stableJSON(state.sources),knowledge:stableJSON(state.knowledge)});
 }
 /** Only changed rows are written; their metadata journal commits atomically. */
 saveLibrary(this:WorldLedger,state:Row){
  const sources:Row[]=state.sources||[],knowledge:Row[]=state.knowledge||[];
  if(new Set(sources.map(s=>s.id)).size!==sources.length||new Set(knowledge.map(k=>k.sourceId)).size!==knowledge.length)throw new WorldletError('Duplicate library identity. Existing data was preserved.');
  const byID=new Map(sources.map(s=>[s.id,s]));
  if(!knowledge.every(k=>byID.has(k.sourceId)))throw new WorldletError('Knowledge has no original source. Existing data was preserved.');
  const encoded={sources:stableJSON(sources),knowledge:stableJSON(knowledge)};
  const saved=savedLibrary.get(this);
  if(saved&&saved.sources===encoded.sources&&saved.knowledge===encoded.knowledge)return;
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
  savedLibrary.set(this,encoded);
 }
 /** Saves the library tables and the configuration in one transaction, then retires `index.json`. */
 saveConfiguration(this:WorldLedger,state:Row){
  try{this.transaction(()=>{this.saveLibrary(state);this.saveSetting('configuration',{...state,sources:[],knowledge:[],libraryStorageVersion:1});});}
  catch(error){savedLibrary.delete(this);throw error;}
  const file=path.join(this.root,'index.json');
  if(fs.existsSync(file))fs.renameSync(file,file+'.before-database');
 }
 /** One-time import of legacy Knowledge into items; index.json and originals stay. */
 migrate(this:WorldLedger,state:{sources:Row[],knowledge:Row[]}){
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

 // Deletion ------------------------------------------------------------------------------
 /** A forgotten local source leaves no copy, including in past item revisions and reviews. */
 forgetLocalSource(this:WorldLedger,source:string){
  this.transaction(()=>{
   const scrub=(item:Row)=>{
    if(!Array.isArray(item.sources))return item;
    const remaining=item.sources.filter(ref=>!(ref?.local===true&&ref.id===source));
    if(remaining.length===item.sources.length)return item;
    return remaining.length?{...item,sources:remaining}:null;
   };
   const gone:string[]=[];
   for(const item of this.records('items'))if(typeof item.id==='string'&&scrub(item)===null){this.delete('items',item.id);gone.push(item.id);}
   forgetTrail(this,gone,source);
   // Every past revision of these buckets is rewritten in place; null removes that revision.
   for(const bucket of ['items','attention-backup','reviews'])for(const revision of this.revisions(bucket))rewriteEntry(this,revision.seq,revision.body,scrub(revision.body));
  });
 }
 /** Applies Core's localDeletionRecord to every revision of the scope's buckets, invalidates
  * runtime work and saves the trimmed library in one transaction. The files to remove are
  * recorded in that transaction and removed by finishLocalDeletionFiles, retried on reopen. */
 deleteLocalContent(this:WorldLedger,scope:Row,library:Row,paths:string[]){
  const provider=scope.provider??null,item=typeof scope.item==='string'?scope.item:undefined,gone:string[]=[];
  const scrub=(bucket:string,key:string,record:Row)=>core<Row|null>('localDeletionRecord',{provider,item,bucket,key,record,gone});
  for(const file of paths)if(!deletionPath(file))throw new WorldletError('Invalid local deletion cleanup path.');
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
      rewriteEntry(this,revision.seq,record,scrub(bucket,String(revision.key),record));
     }
    }
    this.saveLibrary(library);
    if(paths.length){const id=crypto.randomUUID();this.put('local-deletion-files',id,{id,paths});}
    return gone.length;
   });
  }catch(error){savedLibrary.delete(this);throw error;}
 }
 finishLocalDeletionFiles(this:WorldLedger){
  for(const job of this.records('local-deletion-files')){
   const paths:unknown[]=Array.isArray(job.paths)?job.paths:[];
   if(!paths.every(deletionPath))throw new WorldletError('Invalid local deletion cleanup path.');
   for(const file of paths as string[])fs.rmSync(path.join(this.root,...file.split('/')),{recursive:true,force:true});
   this.delete('local-deletion-files',job.id);
  }
 }
}
