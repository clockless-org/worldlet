import {WorldletError} from '../files.ts';
import type {WorldLedger} from './ledger.ts';

// What Fox keeps: conversation turns and notes, where the World got to in each Harness's history, what the chat shows
// place by place, who Fox is, and the skills and routines brought from another Agent.
type Row=Record<string,any>;
const ready={companion:new WeakSet<WorldLedger>(),history:new WeakSet<WorldLedger>(),views:new WeakSet<WorldLedger>(),profile:new WeakSet<WorldLedger>(),brought:new WeakSet<WorldLedger>()};

// Conversations and notes ----------------------------------------------------------------------
// Fox's own conversation turns and everything brought from another Agent share one table, marked
// by `source` ('fox', or the Agent it came from), plus one table of notes an Agent wrote itself
// (owner decision 2026-10-03: whatever can be in SQLite is; the companion profile stays a small
// JSON file). A trigram full-text index makes substring search fast in any language; it is
// derived, left out of backups and rebuilt when missing. Writes keep it current by hand because
// a World database never carries triggers (`app/backup.ts`).
export const OWN='fox';
const searchable=new WeakSet<WorldLedger>();
export function ensureCompanion(ledger:WorldLedger){
 if(ready.companion.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS companion_turns (id TEXT PRIMARY KEY, source TEXT NOT NULL, session TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, thread TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS companion_turns_source ON companion_turns(source, created_at);
  CREATE INDEX IF NOT EXISTS companion_turns_time ON companion_turns(created_at);
  CREATE TABLE IF NOT EXISTS companion_notes (id TEXT PRIMARY KEY, source TEXT NOT NULL, session TEXT NOT NULL, date TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS companion_notes_source ON companion_notes(source);`);
 // The first version had no thread: a brought turn's thread is its own conversation; Fox's
 // earlier turns stay in no particular context ('').
 if(!ledger.all("SELECT 1 FROM pragma_table_info('companion_turns') WHERE name='thread'").length)ledger.transaction(()=>{
  ledger.exec(`ALTER TABLE companion_turns ADD COLUMN thread TEXT NOT NULL DEFAULT '';UPDATE companion_turns SET thread=session WHERE source<>'${OWN}';`);
 });
 ledger.exec('CREATE INDEX IF NOT EXISTS companion_turns_thread ON companion_turns(source, thread, created_at);');
 moveBroughtTables(ledger);
 try{
  const missing=!ledger.tableExists('companion_turns_search')||!ledger.tableExists('companion_notes_search');
  if(missing)ledger.transaction(()=>{
   for(const table of ['companion_turns','companion_notes']){
    ledger.handle.exec(`DROP TABLE IF EXISTS ${table}_search;CREATE VIRTUAL TABLE ${table}_search USING fts5(text, content='${table}', content_rowid='rowid', tokenize='trigram', detail='none');INSERT INTO ${table}_search(${table}_search) VALUES('rebuild');`);
   }
  });
  searchable.add(ledger);
 }catch{searchable.delete(ledger);}
 ready.companion.add(ledger);
}
/** The first version kept brought history in `brought_*` tables; they join the shared ones once. */
function moveBroughtTables(ledger:WorldLedger){
 if(!ledger.tableExists('brought_messages'))return;
 ledger.transaction(()=>{
  ledger.exec(`INSERT OR IGNORE INTO companion_turns(id,source,session,role,text,created_at,thread) SELECT m.id,m.source,c.session,m.role,m.text,m.created_at,c.session FROM brought_messages m JOIN brought_conversations c ON c.id=m.conversation_id;
   INSERT OR IGNORE INTO companion_notes(id,source,session,date,text,created_at) SELECT id,source,session,date,text,created_at FROM brought_notes;
   DROP TABLE brought_messages;DROP TABLE IF EXISTS brought_conversations;DROP TABLE IF EXISTS brought_notes;`);
 });
}
function indexRows(ledger:WorldLedger,table:'companion_turns'|'companion_notes',where:string,...values:any[]){
 if(searchable.has(ledger))ledger.run(`INSERT INTO ${table}_search(rowid,text) SELECT rowid,text FROM ${table} WHERE ${where}`,...values);
}
function unindexRows(ledger:WorldLedger,table:'companion_turns'|'companion_notes',where:string,...values:any[]){
 if(searchable.has(ledger))ledger.run(`INSERT INTO ${table}_search(${table}_search,rowid,text) SELECT 'delete',rowid,text FROM ${table} WHERE ${where}`,...values);
}
const SEARCH=`SELECT id,session,thread,role,text,createdAt,kind,own FROM (
 SELECT t.id AS id,t.session AS session,t.thread AS thread,t.role AS role,t.text AS text,t.created_at AS createdAt,'conversation' AS kind,t.source=? AS own,t.rowid AS r FROM companion_turns t WHERE {turns}
 UNION ALL SELECT n.id,n.session,n.session,'assistant',CASE WHEN n.date<>'' THEN 'Notes for '||n.date||char(10)||char(10)||n.text ELSE n.text END,n.created_at,'note',0,n.rowid FROM companion_notes n WHERE {notes})`;
function searchPlan(ledger:WorldLedger,query:string):{sql:string;values:any[]} {
 // The index answers substring LIKE; the exact check keeps the archive's own rule (any case).
 const indexed=searchable.has(ledger)&&query!==''&&!/[%_]/.test(query);
 const filter=(alias:string,table:string)=>query===''?'1':indexed?`${alias}.rowid IN (SELECT rowid FROM ${table}_search WHERE text LIKE ?) AND instr(lower(${alias}.text),lower(?))>0`:`instr(lower(${alias}.text),lower(?))>0`;
 const args=query===''?[]:indexed?['%'+query+'%',query]:[query];
 return {sql:SEARCH.replace('{turns}',filter('t','companion_turns')).replace('{notes}',filter('n','companion_notes')),values:[OWN,...args,...args]};
}

// History read continuously (fox/history-sync.ts) ------------------------------------------------------
// Where the World got to in each Harness thread (`harness_history`: the last turn ID taken and the session its turns
// are filed under; the row with no thread says when the source was last checked) and the Harness sessions that are
// Fox's own (`harness_own_sessions`), which never come back as another conversation.
function ensureHistory(ledger:WorldLedger){
 if(ready.history.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS harness_history (source TEXT NOT NULL, thread TEXT NOT NULL, cursor TEXT, session TEXT NOT NULL DEFAULT '', checked_at INTEGER NOT NULL, PRIMARY KEY(source, thread));
  CREATE TABLE IF NOT EXISTS harness_own_sessions (source TEXT NOT NULL, session TEXT NOT NULL, thread TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY(source, session));`);
 // Whether the thread is a group or channel others write in (HarnessThread.shared); null until it is listed again.
 if(!ledger.all("SELECT 1 FROM pragma_table_info('harness_history') WHERE name='shared'").length)ledger.exec('ALTER TABLE harness_history ADD COLUMN shared INTEGER');
 ready.history.add(ledger);
}

// What Fox's chat shows, place by place -----------------------------------------------------------
// The chat keeps one card per turn (the question, Fox's steps, the answer) and, for each place,
// the reply shown there last. Each card and reply belongs to a thread: the place and view it was
// asked in (`contextThread` in ui/attention), the same key Fox's turns carry in companion_turns.
// Rows are saved and read back whole, in order; before 2026-10-03 they were conversation-recall.json.
function ensureViews(ledger:WorldLedger){
 if(ready.views.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS companion_views (position INTEGER PRIMARY KEY, thread TEXT NOT NULL, body TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS companion_cards (position INTEGER PRIMARY KEY, id TEXT NOT NULL, thread TEXT NOT NULL, body TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS companion_cards_thread ON companion_cards(thread, position);`);
 ready.views.add(ledger);
}
const CARDS_ROW='fox-thread';
const thread=(row:Row)=>JSON.stringify([String(row?.key||'overview'),String(row?.view||'')]);

// Who Fox is ---------------------------------------------------------------------------------------
// Per scope ('private', 'setup', 'sample'): 'profile' (identity, personality, memory; conversations
// live in companion_turns), 'memory-edits' (sections the person wrote) and 'session' (the marker
// that starts a fresh Harness session after an import or edit). Before 2026-10-03 these were
// companion/profile.json, memory-edits.json and imported.json (fox/companion.ts moves them in).
function ensureProfile(ledger:WorldLedger){
 if(ready.profile.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS companion_profile (scope TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope, name));');
 ready.profile.add(ledger);
}

// Skills and routines brought from another Agent --------------------------------------------------
// The World's copy (owner decision 2026-10-03: whatever can be in SQLite is); Fox's Harness gets
// its own copy from here (fox/migration.ts). Before 2026-10-03 it was companion/brought/<agent>.json.
function ensureBrought(ledger:WorldLedger){
 if(ready.brought.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS brought_skills (source TEXT NOT NULL, folder TEXT NOT NULL, path TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(source, folder, path));
  CREATE TABLE IF NOT EXISTS brought_routines (source TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(source, position));`);
 ready.brought.add(ledger);
}

export class CompanionTables {
 /** Adds turns that are not here yet (by id); returns how many were added. `thread` is the context
  * a turn was said in: for Fox, the place and view it was asked from (one Harness session covers the
  * whole World, so the session cannot tell them apart); for a brought turn, its own conversation. */
 addCompanionTurns(this:WorldLedger,source:string,turns:{id:string;session:string;role:string;text:string;createdAt:string;thread?:string}[]):number {
  ensureCompanion(this);
  let added=0;
  try{
   this.transaction(()=>{
    const insert=this.handle.prepare('INSERT OR IGNORE INTO companion_turns(id,source,session,role,text,created_at,thread) VALUES(?,?,?,?,?,?,?)');
    for(const turn of turns){
     const thread=typeof turn.thread==='string'?turn.thread:source===OWN?'':turn.session;
     if(Number(insert.run(turn.id,source,turn.session,turn.role,turn.text,turn.createdAt,thread).changes)===0)continue;
     indexRows(this,'companion_turns','id=?',turn.id);added++;
    }
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the conversation.');}
  return added;
 }
 /** Replaces every turn and note from `source`. Returns how many it now holds. */
 replaceCompanionHistory(this:WorldLedger,source:string,{turns,notes}:{turns:{id:string;session:string;role:string;text:string;createdAt:string}[];notes:{id:string;session:string;date:string;text:string;createdAt:string}[]}):number {
  ensureCompanion(this);
  try{
   this.transaction(()=>{
    unindexRows(this,'companion_turns','source=?',source);this.run('DELETE FROM companion_turns WHERE source=?',source);
    // Bringing again starts the continuous read over (its turns keep their IDs, so nothing comes twice).
    ensureHistory(this);this.run('DELETE FROM harness_history WHERE source=?',source);
    unindexRows(this,'companion_notes','source=?',source);this.run('DELETE FROM companion_notes WHERE source=?',source);
    const note=this.handle.prepare('INSERT OR REPLACE INTO companion_notes(id,source,session,date,text,created_at) VALUES(?,?,?,?,?,?)');
    for(const n of notes){note.run(n.id,source,n.session,n.date,n.text,n.createdAt);}
    indexRows(this,'companion_notes','source=?',source);
    this.addCompanionTurns(source,turns);
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the conversation history.');}
  return turns.length+notes.length;
 }
 /** `source`'s turns, oldest first; `limit` keeps only the newest ones. */
 companionTurns(this:WorldLedger,source:string,limit?:number):Row[] {
  ensureCompanion(this);
  const rows=limit===undefined?this.all('SELECT id,session,role,text,created_at AS createdAt FROM companion_turns WHERE source=? ORDER BY created_at,rowid',source)
   :this.all('SELECT * FROM (SELECT id,session,role,text,created_at AS createdAt,rowid AS r FROM companion_turns WHERE source=? ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY createdAt,r',source,limit);
  return rows.map(({r:_,...row})=>({...row}));
 }
 /** The person's turns, in any conversation, that invoked a skill (`/name` as typed, or Hermes Agent's expanded form
  * of one), newest first and only their start (agent/gate skillInvocation reads the name). */
 skillTurns(this:WorldLedger,limit=2000):{role:string;text:string;at:number}[] {
  ensureCompanion(this);
  return this.all("SELECT role,substr(text,1,200) AS text,created_at FROM companion_turns WHERE role='user' AND (text LIKE '/%' OR text LIKE '[IMPORTANT: The user has invoked the %') ORDER BY created_at DESC LIMIT ?",limit)
   .map(row=>({role:String(row.role),text:String(row.text),at:Date.parse(String(row.created_at))}));
 }
 /** Turns and notes containing `query` (any case): Fox's own first, then the rest, newest first. */
 searchCompanion(this:WorldLedger,query:string,offset:number,limit:number):{rows:Row[];total:number} {
  ensureCompanion(this);
  const plan=searchPlan(this,query);
  const total=Number(this.all(`SELECT count(*) AS n FROM (${plan.sql})`,...plan.values)[0]?.n??0);
  const rows=limit>0?this.all(`${plan.sql} ORDER BY own DESC, createdAt DESC, id LIMIT ? OFFSET ?`,...plan.values,limit,offset):[];
  return {rows:rows.map(({own:_,...row})=>({...row})),total};
 }
 /** One turn or note by id, or null. */
 companionRecord(this:WorldLedger,id:string):Row|null {
  ensureCompanion(this);
  const plan=searchPlan(this,'');
  const row=this.all(`SELECT * FROM (${plan.sql}) WHERE id=? LIMIT 1`,...plan.values,id)[0];
  if(!row)return null;
  const {own:_,...rest}=row;return {...rest};
 }
 /** How much each source holds: {source: {turns, notes}}. */
 companionCounts(this:WorldLedger):Record<string,{turns:number;notes:number}> {
  ensureCompanion(this);
  const counts:Record<string,{turns:number;notes:number}>={};
  const at=(source:string)=>counts[source]??={turns:0,notes:0};
  for(const row of this.all('SELECT source,count(*) AS n FROM companion_turns GROUP BY source'))at(row.source).turns=Number(row.n);
  for(const row of this.all('SELECT source,count(*) AS n FROM companion_notes GROUP BY source'))at(row.source).notes=Number(row.n);
  return counts;
 }
 /** The session a turn is filed under, or null when it is not here. */
 companionSession(this:WorldLedger,id:string):string|null {ensureCompanion(this);const row=this.all('SELECT session FROM companion_turns WHERE id=?',id)[0];return row?String(row.session):null;}
 /** The text `source` keeps, in bytes. */
 companionBytes(this:WorldLedger,source:string):number {ensureCompanion(this);return Number(this.all('SELECT coalesce(sum(length(CAST(text AS BLOB))),0) AS n FROM companion_turns WHERE source=?',source)[0]?.n??0);}
 /** Every brought conversation (not Fox's own): its Agent, session, turns, the person's own turns and its first and last time. */
 broughtConversations(this:WorldLedger):{source:string;session:string;turns:number;userTurns:number;first:string;last:string}[] {
  ensureCompanion(this);
  return this.all(`SELECT source,session,count(*) AS turns,sum(role='user') AS userTurns,min(created_at) AS first,max(created_at) AS last FROM companion_turns WHERE source<>? GROUP BY source,session`,OWN)
   .map(row=>({source:String(row.source),session:String(row.session),turns:Number(row.turns),userTurns:Number(row.userTurns??0),first:String(row.first),last:String(row.last)}));
 }
 /** The person's own newest `limit` messages in one brought conversation, oldest first, one per line (to tell what
  * it is about, agent/tasks kinds). */
 ownText(this:WorldLedger,source:string,session:string,limit:number):string {
  ensureCompanion(this);
  return this.all(`SELECT text FROM (SELECT text,created_at,rowid AS r FROM companion_turns WHERE source=? AND session=? AND role='user' ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at,r`,source,session,limit)
   .map(row=>String(row.text).replace(/\s+/g,' ').trim().slice(0,400)).join('\n');
 }
 /** The newest `limit` turns of one brought conversation, oldest first. */
 conversationTurns(this:WorldLedger,source:string,session:string,limit:number):{role:string;text:string;createdAt:string}[] {
  ensureCompanion(this);
  return this.all('SELECT role,text,created_at AS createdAt FROM (SELECT role,text,created_at,rowid AS r FROM companion_turns WHERE source=? AND session=? ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at,r',source,session,limit)
   .map(row=>({role:String(row.role),text:String(row.text),createdAt:String(row.createdAt)}));
 }
 /** The newest `limit` of Fox's own turns said in one place (`thread`, the chat's context key), oldest
  * first, leaving out `except` (the turn being answered). */
 threadTurns(this:WorldLedger,thread:string,limit:number,except=''):{role:string;text:string;createdAt:string}[] {
  ensureCompanion(this);
  return this.all('SELECT role,text,created_at AS createdAt FROM (SELECT role,text,created_at,rowid AS r FROM companion_turns WHERE source=? AND thread=? AND id<>? ORDER BY created_at DESC,rowid DESC LIMIT ?) ORDER BY created_at,r',OWN,thread,except,limit)
   .map(row=>({role:String(row.role),text:String(row.text),createdAt:String(row.createdAt)}));
 }
 /** Fox's own newest turns, where each was said and when, without their text (core worldSinceCutoff). */
 recentTurnPlaces(this:WorldLedger,limit:number):{thread:string;role:string;createdAt:string}[] {
  ensureCompanion(this);
  return this.all('SELECT thread,role,created_at AS createdAt FROM companion_turns WHERE source=? ORDER BY created_at DESC,rowid DESC LIMIT ?',OWN,Math.max(1,Math.min(2000,limit)))
   .map(row=>({thread:String(row.thread??''),role:String(row.role),createdAt:String(row.createdAt)}));
 }
 /** Where Fox's previous turn before `except` was said, or ''. */
 previousThread(this:WorldLedger,except:string):string {
  ensureCompanion(this);
  return String(this.all('SELECT thread FROM companion_turns WHERE source=? AND id<>? ORDER BY created_at DESC,rowid DESC LIMIT 1',OWN,except)[0]?.thread??'');
 }

 /** Where the World got to in one thread, and when it was last read through (milliseconds; 0 when left part-way). */
 historyCursor(this:WorldLedger,source:string,thread:string):{cursor:string|null;session:string;checkedAt:number;shared:boolean|null}|null {
  ensureHistory(this);
  const row=this.all('SELECT cursor,session,checked_at,shared FROM harness_history WHERE source=? AND thread=?',source,thread)[0];
  return row?{cursor:row.cursor==null?null:String(row.cursor),session:String(row.session),checkedAt:Number(row.checked_at),shared:row.shared==null?null:!!row.shared}:null;
 }
 /** `shared` undefined keeps what is known of the thread. */
 saveHistoryCursor(this:WorldLedger,source:string,thread:string,cursor:string|null,session:string,at=Date.now(),shared?:boolean){
  ensureHistory(this);
  this.run('INSERT INTO harness_history(source,thread,cursor,session,checked_at,shared) VALUES(?,?,?,?,?,?) ON CONFLICT(source,thread) DO UPDATE SET cursor=excluded.cursor,session=excluded.session,checked_at=excluded.checked_at,shared=coalesce(excluded.shared,harness_history.shared)',source,thread,cursor,session,Math.round(at),shared===undefined?null:shared?1:0);
 }
 saveHistoryShared(this:WorldLedger,source:string,thread:string,shared:boolean){ensureHistory(this);this.run('UPDATE harness_history SET shared=? WHERE source=? AND thread=?',shared?1:0,source,thread);}
 /** Whether a brought conversation is a group (one of its threads is shared), a direct one, or not known yet (null). */
 historyShared(this:WorldLedger,source:string,session:string):boolean|null {
  ensureHistory(this);
  const row=this.all("SELECT max(shared) AS shared FROM harness_history WHERE source=? AND session=? AND thread<>''",source,session)[0];
  return row?.shared==null?null:!!row.shared;
 }
 /** When `source` was last checked (milliseconds), or null before the first time. */
 historyCheckedAt(this:WorldLedger,source:string):number|null {
  ensureHistory(this);
  const row=this.all("SELECT checked_at FROM harness_history WHERE source=? AND thread=''",source)[0];
  return row?Number(row.checked_at):null;
 }
 historySources(this:WorldLedger):string[] {ensureHistory(this);return this.all("SELECT DISTINCT source FROM harness_history ORDER BY source").map(row=>String(row.source));}
 /** The Harness threads whose turns are filed under `session`, most recently read first (a reply goes to one of them). */
 historyThreads(this:WorldLedger,source:string,session:string):string[] {ensureHistory(this);return this.all("SELECT thread FROM harness_history WHERE source=? AND session=? AND thread<>'' ORDER BY checked_at DESC",source,session).map(row=>String(row.thread));}
 /** A Harness session that is Fox's own (a resident session, harness-sessions), with the Fox thread it carries. */
 rememberOwnHarnessSession(this:WorldLedger,source:string,session:string,thread=''){
  ensureHistory(this);
  this.run('INSERT OR REPLACE INTO harness_own_sessions(source,session,thread,created_at) VALUES(?,?,?,?)',source,session,thread,Math.round(Date.now()));
 }
 ownHarnessSessions(this:WorldLedger,source:string):Set<string> {ensureHistory(this);return new Set(this.all('SELECT session FROM harness_own_sessions WHERE source=?',source).map(row=>String(row.session)));}
 /** Fox's own sessions in `source`, each with its Fox thread (a call one of them placed reports back there). */
 ownHarnessSessionThreads(this:WorldLedger,source:string):Map<string,string> {ensureHistory(this);return new Map(this.all('SELECT session,thread FROM harness_own_sessions WHERE source=?',source).map(row=>[String(row.session),String(row.thread??'')]));}

 /** Whether the chat rows were ever saved here. */
 hasCompanionViews(this:WorldLedger):boolean {
  ensureViews(this);
  return this.all('SELECT 1 FROM companion_views LIMIT 1').length>0||this.all('SELECT 1 FROM companion_cards LIMIT 1').length>0;
 }
 /** The chat rows as saved; the cards row gets its cards back. */
 companionViews(this:WorldLedger):Row[] {
  ensureViews(this);
  const cards=this.all('SELECT body FROM companion_cards ORDER BY position').map(row=>JSON.parse(String(row.body)));
  return this.all('SELECT body FROM companion_views ORDER BY position').map(row=>{
   const value=JSON.parse(String(row.body));
   return value?.key===CARDS_ROW?{...value,entries:cards}:value;
  });
 }
 /** Replaces the chat rows: each card is its own row, tagged with its thread. */
 replaceCompanionViews(this:WorldLedger,rows:Row[]){
  ensureViews(this);
  try{
   this.transaction(()=>{
    this.run('DELETE FROM companion_views');this.run('DELETE FROM companion_cards');
    const view=this.handle.prepare('INSERT INTO companion_views(position,thread,body) VALUES(?,?,?)'),card=this.handle.prepare('INSERT INTO companion_cards(position,id,thread,body) VALUES(?,?,?,?)');
    rows.forEach((row,position)=>{
     if(row?.key===CARDS_ROW){
      const {entries,...rest}=row;
      (Array.isArray(entries)?entries:[]).forEach((entry:Row,n:number)=>card.run(n,String(entry?.id??''),thread(entry),JSON.stringify(entry)));
      view.run(position,'',JSON.stringify(rest));
     }else view.run(position,thread(row),JSON.stringify(row));
    });
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the conversation history.');}
 }

 companionStored(this:WorldLedger,scope:string,name:string):Row|null {
  ensureProfile(this);
  const row=this.all('SELECT value FROM companion_profile WHERE scope=? AND name=?',scope,name)[0];
  return row?JSON.parse(String(row.value)):null;
 }
 saveCompanionStored(this:WorldLedger,scope:string,name:string,value:Row|null){
  ensureProfile(this);
  try{
   if(value===null)this.run('DELETE FROM companion_profile WHERE scope=? AND name=?',scope,name);
   else this.run('INSERT INTO companion_profile(scope,name,value) VALUES(?,?,?) ON CONFLICT(scope,name) DO UPDATE SET value=excluded.value',scope,name,JSON.stringify(value));
  }catch{throw new WorldletError('Could not save the companion profile.');}
 }

 /** Every Agent's skills ({folder: {path: text}}) and routines, by source. */
 broughtStores(this:WorldLedger):{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}[] {
  ensureBrought(this);
  const stores=new Map<string,{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}>();
  const at=(source:string)=>{let value=stores.get(source);if(!value)stores.set(source,value={source,skills:{},routines:[]});return value;};
  for(const row of this.all('SELECT source,folder,path,text FROM brought_skills ORDER BY source,folder,path'))(at(row.source).skills[row.folder]??={})[row.path]=String(row.text);
  for(const row of this.all('SELECT source,body FROM brought_routines ORDER BY source,position'))at(row.source).routines.push(JSON.parse(String(row.body)));
  return [...stores.values()];
 }
 /** Replaces what `source` brought. */
 replaceBrought(this:WorldLedger,source:string,skills:Record<string,Record<string,string>>,routines:Row[]){
  ensureBrought(this);
  try{
   this.transaction(()=>{
    this.run('DELETE FROM brought_skills WHERE source=?',source);this.run('DELETE FROM brought_routines WHERE source=?',source);
    const skill=this.handle.prepare('INSERT INTO brought_skills(source,folder,path,text) VALUES(?,?,?,?)'),routine=this.handle.prepare('INSERT INTO brought_routines(source,position,body) VALUES(?,?,?)');
    for(const [folder,files] of Object.entries(skills))for(const [file,text] of Object.entries(files))skill.run(source,folder,file,text);
    routines.forEach((value,position)=>routine.run(source,position,JSON.stringify(value)));
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save what this Agent brought.');}
 }
}
