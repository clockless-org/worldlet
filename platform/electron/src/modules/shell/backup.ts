import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isMigrationSource,migrationSkillPath,migrationSkillsSafe} from '../../../../../core/agent/index.ts';
import {core} from '../../core.ts';
import {digest,ensureDirectory,INSTALLATION_FOLDERS,WorldletError} from '../../files.ts';
import {WORLD_PREFERENCE_KEYS} from '../../preferences.ts';
import {WorldLedger} from '../../store/ledger.ts';
import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';

// Portable World data only. Provider configuration, tokens and executable skills stay out; restored
// records are readable but account grants and cloud consent are not. Skills another Agent brought do
// come back (Markdown only, `brought_skills` in `world.sqlite` or an older `companion/brought/<agent>.json`)
// and are copied into Fox's Harness, so a backup whose skill folders or files are not the plain names
// bringing an Agent makes is refused.
//
// Format 2 (2026-10-05) is one SQLite file holding each library file in chunks, so a whole World of any
// size travels: everything the World records is in `world.sqlite` (owner decision 2026-10-05), and its
// website recordings alone can pass a gigabyte. Its files are staged on disk while a backup is made or
// checked, never held in memory. Format 1, the Mac `WorldBackup.Archive` JSON (at most 120 MB), still
// restores.
/** One library file: in memory (`data`, a format 1 backup) or staged on disk (`file`). */
export interface Entry {path:string;sha256:string;data?:Buffer;file?:string;size?:number}
/** `directory` holds the staged files; `dispose` removes it. */
export interface Archive {version:1|2;createdAt:Date;files:Entry[];preferences:Record<string,string>;directory?:string}
/** World preferences travel inside `world.sqlite` (preferences.ts); a format 1 backup carried these beside it. */
export const PREFERENCE_KEYS=WORLD_PREFERENCE_KEYS;
const V1_PREFERENCE_KEYS=['worldlet.companionName','worldlet.companionStyle','worldlet.companionLook','worldlet.textScale','worldlet.attentionFocus','worldlet.spokenReplies','worldlet.spokenVoice'];
const FIXED=['companion/imported.json','companion/profile.json','companion-profiles/setup/companion/profile.json','index.json','overlay.json','ui-overlay.json','environment.json','browser-history.json','conversation-recall.json','world.sqlite'];
const LIMIT=120_000_000;
/** Format 2: the whole World up to 64 GB and 200,000 files, copied in 16 MB pieces. */
const LIMIT_V2=64_000_000_000,FILES_V2=200_000,CHUNK=16*1024*1024;
const FORMAT='worldlet-backup';
const SQLITE_HEADER='SQLite format 3\0';
const INVALID='Invalid, damaged or incompatible Worldlet backup for the selected Agent. Your current data was not changed.';
/** Seconds since 2001-01-01: Foundation's default `Date` coding. */
const REFERENCE=978307200;
const isBroughtHistory=(file:string)=>{const parts=file.split('/');return parts.length===3&&parts[0]==='companion'&&isMigrationSource(parts[1]);};
/** Skills and routines another Agent brought (`companion/brought/<agent>.json`), kept by the World. */
const isBroughtStore=(file:string)=>{const parts=file.split('/');return parts.length===3&&parts[0]==='companion'&&parts[1]==='brought'&&isMigrationSource(parts[2].replace(/\.json$/,''))&&parts[2].endsWith('.json');};
const isDatabase=(file:string)=>file.endsWith('.sqlite')||file.endsWith('.db');
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-backup-'));
const sizeOf=(entry:Entry)=>entry.data?entry.data.length:entry.size??fs.statSync(entry.file!).size;
/** An entry's bytes; only small files are read whole (the caller checks the size first). */
const bytes=(entry:Entry)=>entry.data??fs.readFileSync(entry.file!);
/** SHA-256 of a file, read in pieces. */
function hashFile(file:string){
 const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(CHUNK),fd=fs.openSync(file,'r');
 try{for(let read;(read=fs.readSync(fd,buffer,0,buffer.length,null))>0;)hash.update(buffer.subarray(0,read));}finally{fs.closeSync(fd);}
 return hash.digest('hex');
}
/** Runs `work` on a database entry as a file on disk. */
function databaseFile<T>(entry:Entry,work:(file:string)=>T):T {
 if(entry.file)return work(entry.file);
 const directory=temporary(),file=path.join(directory,'world.sqlite');
 try{fs.writeFileSync(file,entry.data!,{mode:0o600});return work(file);}finally{fs.rmSync(directory,{recursive:true,force:true});}
}
/** Removes the files a captured or decoded backup staged. */
export function dispose(archive:Archive|null|undefined){if(archive?.directory)fs.rmSync(archive.directory,{recursive:true,force:true});}

export function allowed(host:Host,file:string){
 const parts=file.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..')||file.includes('\\')||file.includes('\0'))return false;
 if(FIXED.includes(file))return true;
 if((file.startsWith('companion/history/')||file.startsWith('companion-profiles/setup/companion/history/'))&&file.endsWith('.json'))return true;
 // History brought from another Agent (`fox/migration.ts`): companion archive files of their own.
 if(isBroughtHistory(file)&&file.endsWith('.json'))return true;
 if(isBroughtStore(file))return true;
 if(file.startsWith('execution/')&&parts.length===2&&file.endsWith('.json'))return true;
 if(file.startsWith('sources/')||file.startsWith('knowledge/'))return true;
 return host.optional<AgentService>(AGENT)?.allowsBackupPath(file)??false;
}
function validSource(host:Host,source:Row){
 const id=source.id;
 // The revision also names cache folders: cache/knowledge/<id>/<revision>/.
 if(typeof id!=='string'||!WorldLedger.safeLibraryComponent(id)||typeof source.revision!=='string'||!WorldLedger.safeLibraryComponent(source.revision))return false;
 return typeof source.blob==='string'&&allowed(host,source.blob)&&source.blob.startsWith('sources/'+id+'/')&&source.blob.endsWith('.json');
}
/** Account grants, cloud consent and this computer's Codex path never travel. */
function portable(state:Row){state.connections=[];state.cloudConsent=false;state.codexPath='';return state;}
/** A consistent single-file copy (no WAL) at `copy`. The World's configuration in it is made portable
 * like the earlier `index.json` was. */
function sqliteSnapshot(host:Host,relative:string,file:string,copy:string){
 try{
  if(relative==='world.sqlite')host.store.ledger().snapshotTo(copy);
  else{const source=new DatabaseSync(file,{readOnly:true});try{source.prepare('VACUUM INTO ?').run(copy);}finally{source.close();}}
  const output=new DatabaseSync(copy);
  try{
   output.exec('PRAGMA journal_mode=DELETE');
   if(relative==='world.sqlite'&&output.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='world_settings'").get()){
    const row=output.prepare("SELECT value FROM world_settings WHERE key='configuration'").get() as Row|undefined;
    if(row)output.prepare("UPDATE world_settings SET value=? WHERE key='configuration'").run(JSON.stringify(portable(JSON.parse(String(row.value)))));
    output.exec('VACUUM');
   }
  }finally{output.close();}
 }catch{throw new WorldletError('The database is busy. Try the backup again after Fox finishes.');}
}
/** Stages a copy of every World file (databases as consistent snapshots) for a format 2 backup;
 * `dispose` removes the copies. The World's preferences are inside `world.sqlite`. */
export function capture(host:Host):Archive {
 const base=fs.realpathSync(host.store.root),directory=temporary();
 const files:Entry[]=[];let total=0;
 try{
  const walk=(dir:string)=>{
   for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){
    if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(file);continue;}
    const relative=path.relative(base,file).split(path.sep).join('/');
    if(!entry.isFile()||!allowed(host,relative))continue;
    if(files.length>=FILES_V2)throw new WorldletError('This library has more files than a backup can hold.');
    const copy=path.join(directory,String(files.length));
    if(isDatabase(relative))sqliteSnapshot(host,relative,file,copy);
    else if(relative==='index.json')fs.writeFileSync(copy,JSON.stringify(portable(JSON.parse(fs.readFileSync(file,'utf8')))),{mode:0o600});
    else fs.copyFileSync(file,copy);
    const size=fs.statSync(copy).size;
    total+=size;
    if(total>LIMIT_V2)throw new WorldletError('This library exceeds the 64 GB backup limit.');
    files.push({path:relative,file:copy,size,sha256:hashFile(copy)});
   }
  };
  walk(base);
  const archive:Archive={version:2,createdAt:new Date(),files,preferences:{},directory};
  validate(host,archive);
  return archive;
 }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
}
/** Sources and configuration recorded in a backup's library database, read without migrating it. */
function libraryDatabase(entry:Entry):{sources:Row[],configuration:Row|null} {
 return databaseFile(entry,file=>{
  let db:DatabaseSync;
  try{db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');}catch{throw new WorldletError('Invalid World library database in backup.');}
  try{
   let version:unknown;
   try{version=(db.prepare("SELECT value FROM library_meta WHERE key='version'").get() as Row|undefined)?.value;}catch{}
   if(String(version)!=='1')throw new WorldletError('Invalid World library database in backup.');
   let rows:Row[];
   try{rows=db.prepare('SELECT body FROM sources ORDER BY position,id').all() as Row[];}catch{throw new WorldletError('Invalid library sources in backup.');}
   if(rows.length>100000)throw new WorldletError('Invalid library source in backup.');
   const sources=rows.map(row=>{try{const value=JSON.parse(String(row.body));if(!value||typeof value!=='object')throw Error();return value;}catch{throw new WorldletError('Invalid library source in backup.');}});
   let configuration:Row|null=null;
   try{
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='world_settings'").get()){
     const row=db.prepare("SELECT value FROM world_settings WHERE key='configuration'").get() as Row|undefined;
     if(row)configuration=JSON.parse(String(row.value));
    }
   }catch{throw new WorldletError(INVALID);}
   return {sources,configuration};
  }finally{db.close();}
 });
}
const json=(data:Buffer)=>JSON.parse(data.toString('utf8'));
/** Whether every skill another Agent brought, in a backup's `world.sqlite`, has a safe source, folder and path. */
function broughtSkillsSafe(entry:Entry):boolean {
 return databaseFile(entry,file=>{
  let db:DatabaseSync;
  try{db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');}catch{return true;} // a damaged database is refused by the checks below
  try{
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='brought_skills'").get())return true;
   for(const row of db.prepare('SELECT source,folder,path FROM brought_skills').iterate() as Iterable<Row>)
    if(!isMigrationSource(row.source)||!migrationSkillPath(row.folder,row.path))return false;
   return true;
  }catch{return false;}finally{db.close();}
 });
}
/** Checks a backup without changing anything. Staged files (format 2) were hashed when they were
 * staged; files held in memory (format 1) are hashed here. */
export function validate(host:Host,archive:Archive):Row {
 const files=archive.files;
 const total=files.reduce((sum,entry)=>sum+sizeOf(entry),0);
 const index=files.find(entry=>entry.path==='index.json');
 const [limit,count]=archive.version===2?[LIMIT_V2,FILES_V2]:[LIMIT,10000];
 if((archive.version!==1&&archive.version!==2)||!files.length||files.length>count||total>limit||new Set(files.map(entry=>entry.path)).size!==files.length||
  !files.every(entry=>allowed(host,entry.path)&&/^[0-9a-f]{64}$/.test(entry.sha256)&&(entry.data?digest(entry.data)===entry.sha256:typeof entry.file==='string')))throw new WorldletError(INVALID);
 try{
  for(const entry of files){
   const size=sizeOf(entry);
   if(['ui-overlay.json','environment.json','browser-history.json','conversation-recall.json'].includes(entry.path)){if(size>64*1024*1024)throw new WorldletError(INVALID);json(bytes(entry));}
   if(entry.path.endsWith('companion/profile.json')||entry.path.startsWith('companion/history/')||isBroughtHistory(entry.path)||entry.path.startsWith('companion-profiles/setup/companion/history/')){
    if(size>16*1024*1024)throw new WorldletError('Companion archive exceeds 16 MB.');
    core('companionValidate',{archive:json(bytes(entry))});
   }
   if(isBroughtStore(entry.path)){
    const value=size<=64*1024*1024?json(bytes(entry)):null;
    if(value?.version!==1||value.source!==entry.path.split('/')[2].replace(/\.json$/,'')||!migrationSkillsSafe(value.skills)||!Array.isArray(value.routines))
     throw new WorldletError('Backup contains an unsafe brought skill. Current data is unchanged.');
   }
   if(entry.path==='companion/imported.json'){
    const value=size<=1024?json(bytes(entry)):null;
    if(value?.version!==1||typeof value.session!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.session))throw new WorldletError('Invalid companion session marker.');
   }
  }
 }catch(error){throw error instanceof WorldletError?error:new WorldletError(INVALID);}
 const agent=host.optional<AgentService>(AGENT);
 for(const entry of files)if(entry.path.startsWith('agent/')){
  if(!agent)throw new WorldletError(INVALID);
  // Only the Agent's small JSON files are read; its databases and transcripts are checked by name.
  agent.validateBackupEntry(entry.path,entry.path.endsWith('.json')&&sizeOf(entry)<=64*1024*1024?bytes(entry):Buffer.alloc(0));
 }
 // The configuration is in the database; backups from before 2026-10-03 carry it as `index.json`.
 const byPath=new Map(files.map(entry=>[entry.path,entry]));
 const database=byPath.get('world.sqlite');
 if(!index&&!database)throw new WorldletError('Backup is missing its World library database.');
 if(database&&!broughtSkillsSafe(database))throw new WorldletError('Backup contains an unsafe brought skill. Current data is unchanged.');
 let library:ReturnType<typeof libraryDatabase>|null=null;
 const read=()=>library??=database?libraryDatabase(database):null;
 let state:Row;
 try{state=index?json(bytes(index)):read()?.configuration;}catch(error){throw error instanceof WorldletError?error:new WorldletError(INVALID);}
 if(!state||typeof state!=='object'||typeof state.version!=='number')throw new WorldletError(INVALID);
 if(state.version!==1)throw new WorldletError('This backup needs a newer version of Worldlet.');
 let sources:Row[]=Array.isArray(state.sources)?state.sources:[];
 if(state.libraryStorageVersion!=null){
  const stored=state.libraryStorageVersion===1&&!sources.length&&!(Array.isArray(state.knowledge)?state.knowledge.length:0)?read():null;
  if(!stored)throw new WorldletError('Backup is missing its World library database.');
  sources=stored.sources;
 }
 if(new Set(sources.map(source=>source?.id)).size!==sources.length)throw new WorldletError('Backup contains duplicate source records.');
 for(const source of sources){
  const data=validSource(host,source)?byPath.get(source.blob):undefined;
  if(!data)throw new WorldletError('Backup contains a missing or unsafe original reference. Current data is unchanged.');
  let original:Row;
  try{original=json(bytes(data));}catch{throw new WorldletError(INVALID);}
  if(!['title','text','raw','kind'].every(key=>typeof original?.[key]==='string'))throw new WorldletError(INVALID);
 }
 return state;
}
/** Format 1: encodes a small archive exactly as Foundation's `JSONEncoder` reads it back (Data → base64,
 * Date → reference seconds). Kept for older apps and checks; exports use format 2 (`writeBackup`). */
export function encode(archive:Archive){
 return JSON.stringify({version:1,createdAt:archive.createdAt.getTime()/1000-REFERENCE,
  files:archive.files.map(entry=>({path:entry.path,data:bytes(entry).toString('base64'),sha256:entry.sha256})),preferences:archive.preferences});
}
/** Format 2: one SQLite file with `backup` (format, version, createdAt), `files` (path, size, SHA-256)
 * and `chunks` (each file in order, 16 MB at most per row). Written beside the destination, then moved in. */
export function writeBackup(archive:Archive,destination:string){
 const partial=destination+'.partial-'+crypto.randomUUID().toUpperCase();
 fs.rmSync(partial,{force:true});
 const db=new DatabaseSync(partial);
 try{
  db.exec(`PRAGMA page_size=65536; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
   CREATE TABLE backup (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE files (path TEXT PRIMARY KEY, size INTEGER NOT NULL, sha256 TEXT NOT NULL);
   CREATE TABLE chunks (path TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(path, part));`);
  const meta=db.prepare('INSERT INTO backup(key,value) VALUES(?,?)');
  meta.run('format',FORMAT);meta.run('version','2');meta.run('createdAt',archive.createdAt.toISOString());meta.run('preferences',JSON.stringify(archive.preferences));
  const row=db.prepare('INSERT INTO files(path,size,sha256) VALUES(?,?,?)'),chunk=db.prepare('INSERT INTO chunks(path,part,data) VALUES(?,?,?)');
  const buffer=Buffer.alloc(CHUNK);
  db.exec('BEGIN');
  for(const entry of archive.files){
   row.run(entry.path,sizeOf(entry),entry.sha256);
   if(entry.data){for(let part=0,at=0;at<entry.data.length||part===0;part++,at+=CHUNK)chunk.run(entry.path,part,entry.data.subarray(at,at+CHUNK));continue;}
   const fd=fs.openSync(entry.file!,'r');
   try{let part=0;for(let read;(read=fs.readSync(fd,buffer,0,CHUNK,null))>0;part++)chunk.run(entry.path,part,buffer.subarray(0,read));if(part===0)chunk.run(entry.path,0,Buffer.alloc(0));}
   finally{fs.closeSync(fd);}
  }
  db.exec('COMMIT');
 }catch(error){db.close();fs.rmSync(partial,{force:true});throw error instanceof WorldletError?error:new WorldletError('Could not write the backup file.');}
 db.close();
 try{fs.chmodSync(partial,0o600);}catch{}
 fs.renameSync(partial,destination);
}
/** Reads a format 2 backup into a staging folder, checking every file's size and SHA-256 on the way. */
function decodeBackup(host:Host,file:string):Archive {
 let db:DatabaseSync;
 try{db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');}catch{throw new WorldletError(INVALID);}
 const directory=temporary();
 try{
  const meta=Object.fromEntries((db.prepare('SELECT key,value FROM backup').all() as Row[]).map(row=>[String(row.key),String(row.value)]));
  if(meta.format!==FORMAT)throw new WorldletError(INVALID);
  if(meta.version!=='2')throw new WorldletError('This backup needs a newer version of Worldlet.');
  const createdAt=new Date(meta.createdAt??'');
  const preferences=JSON.parse(meta.preferences??'{}');
  if(!Number.isFinite(createdAt.getTime())||!preferences||typeof preferences!=='object'||Array.isArray(preferences)||!Object.values(preferences).every(value=>typeof value==='string'))throw new WorldletError(INVALID);
  const rows=db.prepare('SELECT path,size,sha256 FROM files ORDER BY path').all() as Row[];
  if(!rows.length||rows.length>FILES_V2||rows.reduce((sum,row)=>sum+Number(row.size),0)>LIMIT_V2)throw new WorldletError(INVALID);
  const parts=db.prepare('SELECT part,data FROM chunks WHERE path=? ORDER BY part');
  const files:Entry[]=rows.map((row,position)=>{
   const size=Number(row.size);
   if(typeof row.path!=='string'||typeof row.sha256!=='string'||!Number.isSafeInteger(size)||size<0||!allowed(host,row.path))throw new WorldletError(INVALID);
   const target=path.join(directory,String(position)),hash=crypto.createHash('sha256'),fd=fs.openSync(target,'w',0o600);
   let written=0,expected=0;
   try{
    for(const piece of parts.iterate(row.path) as Iterable<Row>){
     const data=piece.data as Uint8Array;
     if(Number(piece.part)!==expected++||!(data instanceof Uint8Array)||(written+=data.length)>size)throw new WorldletError(INVALID);
     fs.writeSync(fd,data);hash.update(data);
    }
   }finally{fs.closeSync(fd);}
   if(written!==size||hash.digest('hex')!==row.sha256)throw new WorldletError(INVALID);
   return {path:row.path,file:target,size,sha256:row.sha256};
  });
  const archive:Archive={version:2,createdAt,files,preferences,directory};
  validate(host,archive);
  return archive;
 }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error instanceof WorldletError?error:new WorldletError(INVALID);}
 finally{db.close();}
}
/** Reads a backup file of either format and checks it; `dispose` the result when done. */
export function decode(host:Host,file:string):Archive {
 const header=Buffer.alloc(16);
 try{const fd=fs.openSync(file,'r');try{fs.readSync(fd,header,0,16,0);}finally{fs.closeSync(fd);}}catch{throw new WorldletError(INVALID);}
 if(header.toString('latin1')===SQLITE_HEADER)return decodeBackup(host,file);
 if(fs.statSync(file).size>170_000_000)throw new WorldletError('Backup file is too large.');
 let value:Row;
 try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new WorldletError(INVALID);}
 if(!value||typeof value!=='object'||typeof value.createdAt!=='number'||!Number.isFinite(value.createdAt)||!Array.isArray(value.files)||!value.preferences||typeof value.preferences!=='object'||
  !value.files.every((entry:Row)=>typeof entry?.path==='string'&&typeof entry.data==='string'&&typeof entry.sha256==='string')||
  !Object.values(value.preferences).every(item=>typeof item==='string'))throw new WorldletError(INVALID);
 const archive:Archive={version:value.version,createdAt:new Date((value.createdAt+REFERENCE)*1000),
  files:value.files.map((entry:Row)=>({path:entry.path,data:Buffer.from(entry.data,'base64'),sha256:entry.sha256})),preferences:value.preferences};
 validate(host,archive);
 return archive;
}
/** Writes the export owner-only. Returns the number of files. */
export function exportTo(host:Host,destination:string){
 const archive=capture(host);
 try{writeBackup(archive,destination);return archive.files.length;}finally{dispose(archive);}
}
/** Not World data: the running Chromium profile, the owner-only credential file, preferences
 * (replaced key by key below), logs, update downloads and the installation's folders (Hermes runtime,
 * local speech, model credential) stay with this installation, as the Mac browser profile, Keychain and
 * UserDefaults did. They are also the files a running app holds open, so the library is swapped entry by
 * entry rather than renaming its folder. */
export const KEPT_ON_RESTORE=new Set(['Browser','vault.json','preferences.json','logs','updates',...INSTALLATION_FOLDERS]);
function swap(root:string,stage:string,rollback:string){
 ensureDirectory(rollback);
 const saved:string[]=[],installed:string[]=[];
 try{
  for(const name of fs.readdirSync(root))if(!KEPT_ON_RESTORE.has(name)){fs.renameSync(path.join(root,name),path.join(rollback,name));saved.push(name);}
  for(const name of fs.readdirSync(stage)){fs.renameSync(path.join(stage,name),path.join(root,name));installed.push(name);}
 }catch{
  for(const name of installed)try{fs.rmSync(path.join(root,name),{recursive:true,force:true});}catch{}
  for(const name of saved)try{fs.renameSync(path.join(rollback,name),path.join(root,name));}catch{}
  try{fs.rmdirSync(rollback);}catch{}
  throw new WorldletError('The library is in use, so the backup was not restored. Current data is unchanged; try again after Fox finishes.');
 }
}
/** Stages the archive beside the library, checks every database, then swaps the World data. The
 * previous library is kept beside it as `<name> before restore <uuid>`; returns that name. */
export function restore(host:Host,archive:Archive):string {
 const state=portable(validate(host,archive));
 const root=host.store.root,parent=path.dirname(root);
 const stage=path.join(parent,'.worldlet-restore-'+crypto.randomUUID().toUpperCase());
 const rollback=path.join(parent,path.basename(root)+' before restore '+crypto.randomUUID().toUpperCase());
 ensureDirectory(stage);
 try{
  for(const entry of archive.files){
   const file=path.join(stage,...entry.path.split('/'));
   ensureDirectory(path.dirname(file));
   if(entry.data)fs.writeFileSync(file,entry.data,{mode:0o600});
   else{fs.copyFileSync(entry.file!,file);fs.chmodSync(file,0o600);}
   if(!isDatabase(entry.path))continue;
   let db:DatabaseSync|null=null;
   try{
    try{db=new DatabaseSync(file,{readOnly:true});}catch(error){throw new WorldletError('A backup database is damaged. Current data is unchanged. '+(error as Error).message);}
    let check:unknown;
    try{check=(db.prepare('PRAGMA quick_check').get() as Row|undefined)?.quick_check;}catch(error){throw new WorldletError('A backup database is damaged. Current data is unchanged. '+(error as Error).message);}
    if(check!=='ok')throw new WorldletError('A backup database is damaged. Current data is unchanged.');
    // Worldlet never defines triggers; a restored one would run inside every later write.
    if(entry.path==='world.sqlite'&&Number((db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get() as Row).n)!==0)
     throw new WorldletError("This backup's database contains unsupported triggers. Current data is unchanged.");
   }finally{db?.close();}
  }
  // The staged database takes the configuration (and an older backup's Sources and Knowledge).
  fs.rmSync(path.join(stage,'index.json'),{force:true});
  const storage=new WorldLedger(stage);
  try{
   const library=structuredClone(state);storage.loadLibrary(library);storage.saveConfiguration(library);
   // World preferences are in the database; a backup from before 2026-10-05 carried them beside it.
   if(!storage.setting('preferences'))storage.saveSetting('preferences',olderPreferences(archive.preferences));
  }finally{storage.close();}
  host.store.closeLedger();
  swap(root,stage,rollback);
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
 host.preferences.reloadWorld();
 return path.basename(rollback);
}
/** The World preferences a backup from before 2026-10-05 carried as text, in their stored types. */
function olderPreferences(values:Record<string,string>):Row {
 const out:Row={};
 for(const [key,value] of Object.entries(values)){
  if(!V1_PREFERENCE_KEYS.includes(key))continue;
  if(key==='worldlet.textScale'){const number=Number(value);if([1,1.25,1.5,2].includes(number))out[key]=number;}
  else if(key==='worldlet.spokenReplies')out[key]=value==='true'||value==='1';
  else out[key]=value.slice(0,key==='worldlet.companionName'?24:240);
 }
 return out;
}
