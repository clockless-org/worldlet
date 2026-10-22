import {WorldletError} from '../files.ts';
import type {WorldLedger} from './ledger.ts';

// What Applets keep: each Applet's observations, findings and cursors (`state.applet-*`), the person's own Applets
// (`my_applets`: sites, pages Fox made, ongoing conversations and their pictures), artifacts and their pages, local
// calendar events, made games, reviewed email drafts, Codex coding tasks, the retired Orders and sent messages.
type Row=Record<string,any>;
const ready={myApplets:new WeakSet<WorldLedger>(),artifacts:new WeakSet<WorldLedger>(),artifactPages:new WeakSet<WorldLedger>(),calendar:new WeakSet<WorldLedger>(),kept:new WeakSet<WorldLedger>()};
const MY_APPLETS_MOVED='my-applets-moved';

// My Applets ---------------------------------------------------------------------------------------
// The person's own Applets (context/applets/MY-APPLETS.md#one-table), one row each in one table: a website made into
// one (`site`), a page Fox made with its page and what was ticked (`page`), a brought conversation (`conversation`;
// Fox's proposals wait here too until kept or declined), and the pictures painted for it. Before 2026-10-06 they
// lived in the `widgets` and `ongoing` tables and the `site-applets` and `applet-art` buckets; those move in once
// and stay as they were for a month.
function ensureMyApplets(ledger:WorldLedger){
 if(ready.myApplets.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS my_applets (id TEXT PRIMARY KEY, kind TEXT NOT NULL, record TEXT NOT NULL, html TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '{}', icon TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', painted_at REAL NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS my_applets_kind ON my_applets(kind);`);
 ready.myApplets.add(ledger);
 if(!ledger.setting(MY_APPLETS_MOVED))moveInMyApplets(ledger);
}
function moveInMyApplets(ledger:WorldLedger){
 const latest=(bucket:string)=>ledger.all('SELECT key,body FROM entries WHERE kind=? AND seq IN (SELECT MAX(seq) FROM entries WHERE kind=? GROUP BY key)','state.'+bucket,'state.'+bucket)
  .flatMap(row=>{try{const body=JSON.parse(String(row.body));return body&&typeof body==='object'&&!Array.isArray(body)?[{key:String(row.key),body}]:[];}catch{return [];}});
 try{
  ledger.transaction(()=>{
   if(ledger.tableExists('widgets'))ledger.exec("INSERT OR IGNORE INTO my_applets(id,kind,record,html,state) SELECT id,'page',record,html,state FROM widgets;");
   if(ledger.tableExists('ongoing'))ledger.exec("INSERT OR IGNORE INTO my_applets(id,kind,record) SELECT id,'conversation',record FROM ongoing;");
   for(const {key,body} of latest('site-applets'))ledger.run("INSERT OR IGNORE INTO my_applets(id,kind,record) VALUES(?,'site',?)",key,JSON.stringify(body));
   for(const {body} of latest('applet-art'))if(typeof body.applet==='string'&&body.applet.startsWith('app-'))
    ledger.run('UPDATE my_applets SET icon=?,background=?,painted_at=? WHERE id=?',String(body.icon??''),String(body.background??''),Number(body.madeAt)||0,body.applet.slice(4));
   ledger.saveSetting(MY_APPLETS_MOVED,{at:Date.now()/1000});
  });
 }catch{throw new WorldletError('Could not move your Applets into their table; they were kept where they were.');}
}
// Every card Fox showed (context/store): one row each, newest shown last in `at`.
export function ensureArtifacts(ledger:WorldLedger){
 if(ready.artifacts.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, record TEXT NOT NULL, at REAL NOT NULL);');
 ready.artifacts.add(ledger);
}
// A page the Agent wrote for an artifact (context/store/artifact-render.ts), kept apart from the record so listing
// artifacts never reads the documents.
export function ensureArtifactPages(ledger:WorldLedger){
 if(ready.artifactPages.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS artifact_pages (id TEXT PRIMARY KEY, record TEXT NOT NULL, at REAL NOT NULL);');
 ready.artifactPages.add(ledger);
}
// Events the person made in the Calendar Applet (context/applets/calendar-events.ts): one row each.
function ensureCalendar(ledger:WorldLedger){
 if(ready.calendar.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, record TEXT NOT NULL);');
 ready.calendar.add(ledger);
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
export function ensureKept(ledger:WorldLedger){
 if(ready.kept.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS execution_payloads (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS made_games (id TEXT PRIMARY KEY, record TEXT NOT NULL, html TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS made_game_versions (id TEXT NOT NULL, version INTEGER NOT NULL, html TEXT NOT NULL, PRIMARY KEY(id, version));
  CREATE TABLE IF NOT EXISTS mail_reviews (id TEXT PRIMARY KEY, review TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS coding_tasks (id TEXT PRIMARY KEY, record TEXT NOT NULL, files TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, at REAL NOT NULL, record TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sent_messages (id TEXT PRIMARY KEY, at TEXT NOT NULL, record TEXT NOT NULL);`);
 ready.kept.add(ledger);
}

export class AppletTables {
 replaceAppletState(this:WorldLedger,bucket:string,provider:string,value:Row){
  if(!['applet-observations','applet-findings','applet-cursors'].includes(bucket))throw new WorldletError('Invalid Applet state.');
  this.transaction(()=>{this.delete(bucket,provider);this.put(bucket,provider,{...value,id:provider,provider});});
 }
 forgetAppletState(this:WorldLedger,provider:string){
  this.transaction(()=>{
   this.invalidateRuntimeTasks(provider);
   this.invalidateRuntimeTasks('attention-center');
   for(const row of this.records('runtime-operations'))if(row.ownerId===provider&&typeof row.id==='string')this.delete('runtime-operations',row.id);
   for(const row of this.records('runtime-deliveries'))if(row.provider===provider&&typeof row.id==='string')this.delete('runtime-deliveries',row.id);
   for(const bucket of ['applet-observations','applet-findings','applet-cursors'])this.delete(bucket,provider);
  });
 }

 /** One kind of the person's own Applets: each record and state (pages and pictures stay in the table until asked for). */
 myApplets(this:WorldLedger,kind:'site'|'page'|'conversation'):{id:string;record:Row;state:Row;painted:boolean}[] {
  ensureMyApplets(this);
  return this.all("SELECT id,record,state,icon<>'' AS painted FROM my_applets WHERE kind=? ORDER BY id",kind)
   .map(row=>({id:String(row.id),record:JSON.parse(String(row.record)),state:JSON.parse(String(row.state)),painted:Boolean(row.painted)}));
 }
 /** Saves one of the person's own Applets: its record, and its page and state when given; a new page needs its page. */
 saveMyApplet(this:WorldLedger,id:string,kind:'site'|'page'|'conversation',record:Row,{html,state}:{html?:string;state?:Row}={}){
  ensureMyApplets(this);
  try{
   const sets=['record=excluded.record',...(html!==undefined?['html=excluded.html']:[]),...(state!==undefined?['state=excluded.state']:[])];
   this.run(`INSERT INTO my_applets(id,kind,record,html,state) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ${sets.join(',')}`,id,kind,JSON.stringify(record),html??'',JSON.stringify(state??{}));
  }catch{throw new WorldletError('Could not save the Applet.');}
 }
 /** Forgets the person's own Applets, their pages and pictures with them. */
 deleteMyApplets(this:WorldLedger,ids:string[]){
  ensureMyApplets(this);
  try{this.transaction(()=>{for(const id of ids)this.run('DELETE FROM my_applets WHERE id=?',id);});}catch{throw new WorldletError('Could not delete the Applet.');}
 }
 myAppletPage(this:WorldLedger,id:string):string|null {
  ensureMyApplets(this);
  const row=this.all("SELECT html FROM my_applets WHERE id=? AND kind='page'",id)[0];
  return row?String(row.html):null;
 }
 /** Every painted icon, by Applet ID (small: they ride in the snapshot). */
 myAppletIcons(this:WorldLedger):Record<string,string> {
  ensureMyApplets(this);
  return Object.fromEntries(this.all("SELECT id,icon FROM my_applets WHERE icon<>''").map(row=>[String(row.id),String(row.icon)]));
 }
 myAppletArt(this:WorldLedger,id:string):{icon:string;background:string;paintedAt:number}|null {
  ensureMyApplets(this);
  const row=this.all("SELECT icon,background,painted_at FROM my_applets WHERE id=? AND icon<>''",id)[0];
  return row?{icon:String(row.icon),background:String(row.background),paintedAt:Number(row.painted_at)}:null;
 }
 /** Keeps (or with null forgets) the pictures painted for one of the person's own Applets; false when it is gone. */
 saveMyAppletArt(this:WorldLedger,id:string,art:{icon:string;background:string;paintedAt:number}|null):boolean {
  ensureMyApplets(this);
  try{return Number(this.run('UPDATE my_applets SET icon=?,background=?,painted_at=? WHERE id=?',art?.icon??'',art?.background??'',art?.paintedAt??0,id).changes)>0;}
  catch{throw new WorldletError('Could not keep the pictures.');}
 }

 // Pages Fox made (context/store): `page` rows of the person's own Applets.
 widgetRows(this:WorldLedger):{record:Row;state:Row}[] {return this.myApplets('page').map(({record,state})=>({record,state}));}
 widgetPage(this:WorldLedger,id:string):string|null {return this.myAppletPage(id);}
 /** Saves a page's record, and its page and state when given; a new page needs both. */
 saveWidget(this:WorldLedger,id:string,record:Row,{html,state}:{html?:string;state?:Row}={}){
  if(html===undefined&&!this.all("SELECT 1 FROM my_applets WHERE id=? AND kind='page'",id).length)return;
  this.saveMyApplet(id,'page',record,{html,state});
 }
 deleteWidget(this:WorldLedger,id:string){this.deleteMyApplets([id]);}

 // Ongoing things --------------------------------------------------------------------------------
 // Brought conversations the person made into Applets (agent/tasks): `conversation` rows of the person's own
 // Applets, one record per thing. The conversation itself stays in companion_turns.
 ongoingRows(this:WorldLedger):Row[] {return this.myApplets('conversation').map(row=>row.record);}
 /** Saves and forgets records in one transaction. */
 saveOngoing(this:WorldLedger,save:Row[],forget:string[]=[]){
  ensureMyApplets(this);
  try{
   this.transaction(()=>{
    for(const record of save)this.saveMyApplet(String(record.id),'conversation',record);
    this.deleteMyApplets(forget);
   });
  }catch{throw new WorldletError('Could not save what is ongoing.');}
 }

 // Artifacts ---------------------------------------------------------------------------------------
 artifactRows(this:WorldLedger):Row[] {
  ensureArtifacts(this);
  return this.all('SELECT record FROM artifacts ORDER BY at DESC').map(row=>JSON.parse(String(row.record)));
 }
 /** Saves artifacts and forgets the ones given, in one transaction. */
 saveArtifacts(this:WorldLedger,save:Row[],forget:string[]=[]){
  ensureArtifacts(this);
  try{
   this.transaction(()=>{
    for(const record of save)this.run('INSERT INTO artifacts(id,record,at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,at=excluded.at',String(record.id),JSON.stringify(record),Number(record.updatedAt)||0);
    for(const id of forget)this.run('DELETE FROM artifacts WHERE id=?',id);
   });
  }catch{throw new WorldletError('Could not save the artifact.');}
 }
 artifactPage(this:WorldLedger,id:string):Row|null {
  ensureArtifactPages(this);
  const row=this.all('SELECT record FROM artifact_pages WHERE id=?',id)[0];
  return row?JSON.parse(String(row.record)):null;
 }
 /** The IDs of every kept page, newest first. */
 artifactPageIds(this:WorldLedger):string[] {
  ensureArtifactPages(this);
  return this.all('SELECT id FROM artifact_pages ORDER BY at DESC').map(row=>String(row.id));
 }
 saveArtifactPage(this:WorldLedger,record:Row){
  ensureArtifactPages(this);
  try{this.run('INSERT INTO artifact_pages(id,record,at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,at=excluded.at',String(record.id),JSON.stringify(record),Number(record.createdAt)||0);}
  catch{throw new WorldletError('Could not save the artifact page.');}
 }
 deleteArtifactPages(this:WorldLedger,ids:string[]){
  if(!ids.length)return;
  ensureArtifactPages(this);
  try{this.transaction(()=>{for(const id of ids)this.run('DELETE FROM artifact_pages WHERE id=?',id);});}
  catch{throw new WorldletError('Could not forget the artifact page.');}
 }

 // Local calendar events ---------------------------------------------------------------------------
 calendarEventRows(this:WorldLedger):Row[] {
  ensureCalendar(this);
  return this.all('SELECT record FROM calendar_events ORDER BY id').map(row=>JSON.parse(String(row.record)));
 }
 /** Saves events and forgets the ones given, in one transaction. */
 saveCalendarEvents(this:WorldLedger,save:Row[],forget:string[]=[]){
  ensureCalendar(this);
  try{
   this.transaction(()=>{
    for(const record of save)this.run('INSERT INTO calendar_events(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record',String(record.id),JSON.stringify(record));
    for(const id of forget)this.run('DELETE FROM calendar_events WHERE id=?',id);
   });
  }catch{throw new WorldletError('Could not save the event.');}
 }

 // Made games ------------------------------------------------------------------------------------
 /** Every made game's record (pages stay in the table until asked for). */
 madeGameRecords(this:WorldLedger):Row[] {
  ensureKept(this);
  return this.all('SELECT record FROM made_games ORDER BY id').map(row=>JSON.parse(String(row.record)));
 }
 madeGamePage(this:WorldLedger,id:string):string|null {
  ensureKept(this);
  const row=this.all('SELECT html FROM made_games WHERE id=?',id)[0];
  return row?String(row.html):null;
 }
 /** Saves a game's record, and its page when given; a changed page keeps the last `versions` pages. */
 saveMadeGame(this:WorldLedger,id:string,record:Row,html?:string,versions=0){
  ensureKept(this);
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
 madeGameVersions(this:WorldLedger,id:string):{version:number;html:string}[] {
  ensureKept(this);
  return this.all('SELECT version,html FROM made_game_versions WHERE id=? ORDER BY version DESC',id).map(row=>({version:Number(row.version),html:String(row.html)}));
 }
 deleteMadeGame(this:WorldLedger,id:string){
  ensureKept(this);
  try{this.transaction(()=>{this.run('DELETE FROM made_game_versions WHERE id=?',id);this.run('DELETE FROM made_games WHERE id=?',id);});}
  catch{throw new WorldletError('Could not delete the game.');}
 }

 // Mail, coding, Orders and Messages ---------------------------------------------------------------
 /** Reviewed email drafts by id (sources/reviews.ts validates them). */
 mailReviews(this:WorldLedger):Record<string,Row> {
  ensureKept(this);
  return Object.fromEntries(this.all('SELECT id,review FROM mail_reviews ORDER BY id').map(row=>[String(row.id),JSON.parse(String(row.review))]));
 }
 /** Replaces every reviewed email draft at once. */
 replaceMailReviews(this:WorldLedger,reviews:Record<string,Row>){
  ensureKept(this);
  try{
   this.transaction(()=>{
    this.run('DELETE FROM mail_reviews');
    for(const [id,review] of Object.entries(reviews))this.run('INSERT INTO mail_reviews(id,review) VALUES(?,?)',id,JSON.stringify(review));
   });
  }catch{throw new WorldletError('Could not save the email review.');}
 }
 /** Codex coding tasks: the record and the files it made ({path: content}). */
 codingTasks(this:WorldLedger):{record:Row;files:Record<string,string>}[] {
  ensureKept(this);
  return this.all('SELECT record,files FROM coding_tasks ORDER BY id').map(row=>({record:JSON.parse(String(row.record)),files:JSON.parse(String(row.files))}));
 }
 codingTask(this:WorldLedger,id:string):{record:Row;files:Record<string,string>}|null {
  ensureKept(this);
  const row=this.all('SELECT record,files FROM coding_tasks WHERE id=?',id)[0];
  return row?{record:JSON.parse(String(row.record)),files:JSON.parse(String(row.files))}:null;
 }
 /** Saves a task's record, and the files it made when given. */
 saveCodingTask(this:WorldLedger,record:Row,files?:Record<string,string>){
  ensureKept(this);
  const id=String(record.id);
  try{
   if(files===undefined)this.run("INSERT INTO coding_tasks(id,record,files) VALUES(?,?,'{}') ON CONFLICT(id) DO UPDATE SET record=excluded.record",id,JSON.stringify(record));
   else this.run('INSERT INTO coding_tasks(id,record,files) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,files=excluded.files',id,JSON.stringify(record),JSON.stringify(files));
  }catch{throw new WorldletError('Could not save the coding task.');}
 }
 /** Order submissions from before Orders were retired (2026-10-18), newest first; kept for backups and restores. */
 orders(this:WorldLedger,limit=100):Row[] {
  ensureKept(this);
  return this.all('SELECT record FROM orders ORDER BY at DESC LIMIT ?',Math.max(1,Math.min(1000,limit))).map(row=>JSON.parse(String(row.record)));
 }
 saveOrder(this:WorldLedger,id:string,at:number,record:Row){
  ensureKept(this);
  try{this.run('INSERT INTO orders(id,at,record) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,record=excluded.record',id,at,JSON.stringify(record));}
  catch{throw new WorldletError('Could not save the Order.');}
 }
 /** Messages sent from the Messages Applet, newest first: to whom, the words, and whether Messages sent them. */
 sentMessages(this:WorldLedger,limit=100):Row[] {
  ensureKept(this);
  return this.all('SELECT record FROM sent_messages ORDER BY at DESC LIMIT ?',Math.max(1,Math.min(1000,limit))).map(row=>JSON.parse(String(row.record)));
 }
 sentMessage(this:WorldLedger,id:string):Row|null {
  ensureKept(this);
  const row=this.all('SELECT record FROM sent_messages WHERE id=?',id)[0];
  return row?JSON.parse(String(row.record)):null;
 }
 saveSentMessage(this:WorldLedger,record:Row){
  ensureKept(this);
  try{this.run('INSERT INTO sent_messages(id,at,record) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,record=excluded.record',String(record.id),String(record.at),JSON.stringify(record));}
  catch{throw new WorldletError('Could not record the message.');}
 }
 deleteSentMessage(this:WorldLedger,id:string){
  ensureKept(this);
  this.run('DELETE FROM sent_messages WHERE id=?',id);
 }
}
