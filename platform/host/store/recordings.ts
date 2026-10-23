import {WorldletError} from '../files.ts';
import type {WorldLedger} from './ledger.ts';

// What the built-in browser recorded: pages visited inside Worldlet (`browser_visits`) and what happened in each page
// (`web_visits`, `web_records`, searchable through `web_records_search`).
type Row=Record<string,any>;
const ready={visits:new WeakSet<WorldLedger>(),web:new WeakSet<WorldLedger>()};

// Browsing history --------------------------------------------------------------------------------
// Pages visited inside Worldlet, oldest first (Core bounds and dedupes them, browser/history.ts);
// before 2026-10-03 browser-history.json. Times keep the Mac format: seconds since 2001.
function ensureVisits(ledger:WorldLedger){
 if(ready.visits.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS browser_visits (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, visited_at REAL NOT NULL);');
 ready.visits.add(ledger);
}
// Website recordings ------------------------------------------------------------------------------
// What happened in the built-in browser's pages (agent/applets/web-record.ts): one row per visit (a
// stay on one site) and its records in order. Text is searchable through a trigram index.
const webSearchable=new WeakSet<WorldLedger>();
function ensureWeb(ledger:WorldLedger){
 if(ready.web.has(ledger))return;
 ledger.exec(`CREATE TABLE IF NOT EXISTS web_visits (id TEXT PRIMARY KEY, site TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, applet TEXT NOT NULL, started_at REAL NOT NULL, ended_at REAL NOT NULL);
  CREATE INDEX IF NOT EXISTS web_visits_time ON web_visits(started_at);
  CREATE INDEX IF NOT EXISTS web_visits_site ON web_visits(site, started_at);
  CREATE TABLE IF NOT EXISTS web_records (id INTEGER PRIMARY KEY AUTOINCREMENT, visit TEXT NOT NULL, at REAL NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL, meta TEXT NOT NULL, body TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS web_records_visit ON web_records(visit, id);
  CREATE INDEX IF NOT EXISTS web_records_kind ON web_records(kind, at);`);
 try{
  if(!ledger.tableExists('web_records_search'))ledger.handle.exec(`CREATE VIRTUAL TABLE web_records_search USING fts5(body, content='web_records', content_rowid='id', tokenize='trigram', detail='none');`);
  webSearchable.add(ledger);
 }catch{webSearchable.delete(ledger);}
 ready.web.add(ledger);
}
const webVisitRow=(row:Row)=>({id:String(row.id),site:String(row.site),url:String(row.url),title:String(row.title),applet:String(row.applet),startedAt:Number(row.started_at),endedAt:Number(row.ended_at)});
/** The recordings' size in bytes, from each row's header (octet_length reads no recorded body). The tidy counts it a
 * slice at a time (`tidyWebStep`, a minute after start), through record `through`; saves and removals keep it current
 * after that. A cold disk takes seconds to walk every header, so no single step walks them all. */
const tallies=new WeakMap<WorldLedger,{through:number;bytes:number;complete:boolean;oldest:number}>();
const tally=(ledger:WorldLedger)=>{let entry=tallies.get(ledger);if(!entry)tallies.set(ledger,entry={through:0,bytes:0,complete:false,oldest:0});return entry;};
/** One tidy step's bounds: headers counted, and the bodies one removal reads to take them out of the search index. */
const TIDY={countRows:2000,dropRows:200,dropBytes:2_000_000};

export class RecordingTables {
 browserVisits(this:WorldLedger):{id:number;url:string;title:string;text:string;visitedAt:number}[] {
  ensureVisits(this);
  return this.all('SELECT id,url,title,text,visited_at AS visitedAt FROM browser_visits ORDER BY id').map(row=>({id:Number(row.id),url:String(row.url),title:String(row.title),text:String(row.text),visitedAt:Number(row.visitedAt)}));
 }
 /** Removes visits by id and appends new ones in order; returns the new ids. `replace` clears all first. */
 changeBrowserVisits(this:WorldLedger,remove:number[],add:{url:string;title:string;text:string;visitedAt:number}[],replace=false):number[] {
  ensureVisits(this);
  try{
   return this.transaction(()=>{
    if(replace)this.run('DELETE FROM browser_visits');
    const drop=this.handle.prepare('DELETE FROM browser_visits WHERE id=?'),insert=this.handle.prepare('INSERT INTO browser_visits(url,title,text,visited_at) VALUES(?,?,?,?)');
    for(const id of remove)drop.run(id);
    return add.map(visit=>Number(insert.run(visit.url,visit.title,visit.text,visit.visitedAt).lastInsertRowid));
   });
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save browsing history.');}
 }

 /** Saves visits (new or extended) and their new records in one transaction. */
 recordWeb(this:WorldLedger,visits:{id:string;site:string;url:string;title:string;applet:string;startedAt:number;endedAt:number}[],records:{visit:string;at:number;kind:string;url:string;meta:Row;body:string}[]){
  ensureWeb(this);
  let added=0;
  try{
   this.transaction(()=>{
    const visit=this.handle.prepare(`INSERT INTO web_visits(id,site,url,title,applet,started_at,ended_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE web_visits.title END,ended_at=max(web_visits.ended_at,excluded.ended_at)`);
    for(const v of visits)visit.run(v.id,v.site,v.url,v.title,v.applet,v.startedAt,v.endedAt);
    const insert=this.handle.prepare('INSERT INTO web_records(visit,at,kind,url,meta,body) VALUES(?,?,?,?,?,?)');
    const index=webSearchable.has(this)?this.handle.prepare('INSERT INTO web_records_search(rowid,body) VALUES(?,?)'):null;
    for(const r of records){
     const id=Number(insert.run(r.visit,r.at,r.kind,r.url,JSON.stringify(r.meta??{}),r.body).lastInsertRowid);
     if(index&&r.body)index.run(id,r.body);
     added+=Buffer.byteLength(r.body);
    }
   });
   // A count still in progress reaches these records itself.
   const counted=tallies.get(this);if(counted?.complete)counted.bytes+=added;
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not save the browsing recording.');}
 }
 /** Visits newest first, optionally on one site, in a time range, and holding every term. Each comes
  * with how much it recorded and, for a search, where the first term was found. */
 webVisits(this:WorldLedger,{terms=[],site='',after=null,before,offset=0,limit=10}:{terms?:string[];site?:string;after?:number|null;before:number;offset?:number;limit?:number}){
  ensureWeb(this);
  const where=['v.ended_at>=?','v.started_at<?'],values:any[]=[after??0,before];
  if(site){where.push('(v.site=? OR v.site LIKE ?)');values.push(site,'%.'+site);}
  for(const term of terms){
   // Short terms cannot use the trigram index; they fall back to a scan of this visit's text.
   const indexed=webSearchable.has(this)&&term.length>=3&&!/[%_"]/.test(term);
   where.push(`(instr(lower(v.title||' '||v.url),lower(?))>0 OR EXISTS (SELECT 1 FROM web_records r WHERE r.visit=v.id AND ${indexed?'r.id IN (SELECT rowid FROM web_records_search WHERE body LIKE ?) AND ':''}instr(lower(r.body),lower(?))>0))`);
   values.push(term,...indexed?['%'+term+'%']:[],term);
  }
  const total=Number(this.all(`SELECT count(*) AS n FROM web_visits v WHERE ${where.join(' AND ')}`,...values)[0]?.n??0);
  const rows=this.all(`SELECT v.* FROM web_visits v WHERE ${where.join(' AND ')} ORDER BY v.ended_at DESC LIMIT ? OFFSET ?`,...values,limit,offset);
  return {total,visits:rows.map(row=>{
   const visit=webVisitRow(row);
   const counts=Object.fromEntries(this.all('SELECT kind,count(*) AS n FROM web_records WHERE visit=? GROUP BY kind',visit.id).map(r=>[String(r.kind),Number(r.n)]));
   let found='';
   if(terms[0]){const hit=this.all('SELECT body FROM web_records WHERE visit=? AND instr(lower(body),lower(?))>0 ORDER BY id DESC LIMIT 1',visit.id,terms[0])[0];
    if(hit){const body=String(hit.body),at=body.toLowerCase().indexOf(terms[0].toLowerCase());found=body.slice(Math.max(0,at-160),at+240);}}
   return {...visit,counts,...found?{found}:{}};
  })};
 }
 webVisit(this:WorldLedger,id:string){ensureWeb(this);const row=this.all('SELECT * FROM web_visits WHERE id=?',id)[0];return row?webVisitRow(row):null;}
 /** One visit's records in order from record number `offset` (#n, counted over the whole visit, so a
  * page's number from `webPages` is a place to start even when reading only `kinds` or `term`),
  * each with its number. `total` counts the matching records in the whole visit, `after` those from
  * `offset` on. */
 webRecords(this:WorldLedger,visit:string,{offset=0,limit=400,kinds=[],term=''}:{offset?:number;limit?:number;kinds?:string[];term?:string}={}){
  ensureWeb(this);
  const where=['1'],values:any[]=[];
  if(kinds.length){where.push(`kind IN (${kinds.map(()=>'?').join(',')})`);values.push(...kinds);}
  if(term){where.push('instr(lower(body),lower(?))>0');values.push(term);}
  const numbered='WITH numbered AS (SELECT id,at,kind,url,meta,body,row_number() OVER (ORDER BY id)-1 AS idx FROM web_records WHERE visit=?)';
  const counts=this.all(`${numbered} SELECT count(*) AS n,coalesce(sum(idx>=?),0) AS later FROM numbered WHERE ${where.join(' AND ')}`,visit,offset,...values)[0];
  const rows=this.all(`${numbered} SELECT idx,at,kind,url,meta,body FROM numbered WHERE idx>=? AND ${where.join(' AND ')} ORDER BY id LIMIT ?`,visit,offset,...values,limit);
  return {total:Number(counts?.n??0),after:Number(counts?.later??0),records:rows.map(row=>{let meta:Row={};try{meta=JSON.parse(String(row.meta));}catch{}return {index:Number(row.idx),at:Number(row.at),kind:String(row.kind),url:String(row.url),meta,body:String(row.body)};})};
 }
 /** Where a visit's address changed (`page` records), with each one's record number. */
 webPages(this:WorldLedger,visit:string){
  ensureWeb(this);
  return this.all("SELECT r.at,r.url,r.meta,(SELECT count(*) FROM web_records x WHERE x.visit=r.visit AND x.id<r.id) AS idx FROM web_records r WHERE r.visit=? AND r.kind='page' ORDER BY r.id",visit)
   .map(row=>{let title='';try{title=String(JSON.parse(String(row.meta)).title??'');}catch{}return {index:Number(row.idx),url:String(row.url),title,at:Number(row.at)};});
 }
 /** Meeting transcripts (`transcript` records), newest first: one per transcription session, with
  * the meeting's title, its site, when it ran and how many lines it holds. */
 meetingTranscripts(this:WorldLedger,limit=20){
  ensureWeb(this);
  return this.all(`SELECT json_extract(r.meta,'$.session') AS session,r.visit,v.site,max(json_extract(r.meta,'$.meeting')) AS meeting,min(r.at) AS started,max(r.at) AS ended,count(*) AS lines
   FROM web_records r JOIN web_visits v ON v.id=r.visit WHERE r.kind='transcript' AND json_extract(r.meta,'$.session') IS NOT NULL
   GROUP BY session ORDER BY ended DESC LIMIT ?`,limit)
   .map(row=>({session:String(row.session),visit:String(row.visit),site:String(row.site),meeting:String(row.meeting??''),startedAt:Number(row.started),endedAt:Number(row.ended),lines:Number(row.lines)}));
 }
 /** One transcription session's lines in order. */
 meetingTranscript(this:WorldLedger,session:string){
  ensureWeb(this);
  return this.all(`SELECT at,body,meta FROM web_records WHERE kind='transcript' AND json_extract(meta,'$.session')=? ORDER BY id LIMIT 5000`,session)
   .map(row=>{let meta:Row={};try{meta=JSON.parse(String(row.meta));}catch{}return {at:Number(row.at),text:String(row.body),speaker:String(meta.speaker??''),meeting:String(meta.meeting??'')};});
 }
 /** A visit's newest whole-page text record and the additions after it, oldest first (core onScreenText). */
 webPageText(this:WorldLedger,visit:string){
  ensureWeb(this);
  return this.all(`SELECT kind,body FROM web_records WHERE visit=? AND kind IN ('text','text-more')
   AND id>=coalesce((SELECT max(id) FROM web_records WHERE visit=? AND kind='text'),0) ORDER BY id DESC LIMIT 40`,visit,visit)
   .reverse().map(row=>({kind:String(row.kind),body:String(row.body)}));
 }
 /** The newest visits, for Fox's sense of what just happened. */
 recentWebVisits(this:WorldLedger,limit:number){ensureWeb(this);return this.all('SELECT * FROM web_visits ORDER BY ended_at DESC LIMIT ?',limit).map(webVisitRow);}
 /** Removes raw network records older than `rawBefore` and, above `maxBytes`, the oldest raw records
  * until the recordings fit; visits left empty go too. Returns how many records were removed. The host tidies a step
  * at a time (`tidyWebStep`) so the app stays responsive; this runs every step at once. */
 pruneWeb(this:WorldLedger,limits:{rawKinds:string[];rawBefore:number;maxBytes:number}):number {
  let removed=0,step;
  while((step=this.tidyWebStep(limits))!=='done')removed+=step;
  return removed;
 }
 /** One bounded step of `pruneWeb`: counts the next slice of record sizes, or removes the next few expired (or, over
  * `maxBytes`, oldest) raw records in a transaction of their own. Returns how many records it removed, or `done`. */
 tidyWebStep(this:WorldLedger,{rawKinds,rawBefore,maxBytes}:{rawKinds:string[];rawBefore:number;maxBytes:number}):number|'done' {
  ensureWeb(this);
  const kinds=rawKinds.map(()=>'?').join(','),counted=tally(this);
  try{
   if(!counted.complete){
    const slice=this.all(`SELECT coalesce(sum(octet_length(body)),0) AS n,count(*) AS rows,max(id) AS last FROM (SELECT id,body FROM web_records WHERE id>? ORDER BY id LIMIT ?)`,counted.through,TIDY.countRows)[0];
    if(Number(slice?.rows??0)){counted.bytes+=Number(slice!.n);counted.through=Number(slice!.last);}
    else counted.complete=true;
    return 0;
   }
   // octet_length reads each body's size from its row header; length() would read the body.
   const pick=(rows:Row[])=>{let bytes=0;return rows.filter((row,i)=>{bytes+=Number(row.n);return i===0||bytes<=TIDY.dropBytes;});};
   let rows=pick(this.all(`SELECT id,visit,octet_length(body) AS n FROM web_records WHERE kind IN (${kinds}) AND at<? LIMIT ?`,...rawKinds,rawBefore,TIDY.dropRows));
   // Over the limit, the oldest raw records in record order, from where the last step stopped (kept records are passed once).
   if(!rows.length&&counted.bytes>maxBytes){
    rows=pick(this.all(`SELECT id,visit,octet_length(body) AS n FROM web_records NOT INDEXED WHERE id>? AND kind IN (${kinds}) ORDER BY id LIMIT ?`,counted.oldest,...rawKinds,TIDY.dropRows));
    if(rows.length)counted.oldest=Number(rows[rows.length-1].id);
   }
   if(!rows.length)return 'done';
   const ids=rows.map(row=>Number(row.id)),list=ids.map(()=>'?').join(','),visits=[...new Set(rows.map(row=>String(row.visit)))];
   this.transaction(()=>{
    if(webSearchable.has(this))this.run(`INSERT INTO web_records_search(web_records_search,rowid,body) SELECT 'delete',id,body FROM web_records WHERE id IN (${list}) AND body<>''`,...ids);
    this.run(`DELETE FROM web_records WHERE id IN (${list})`,...ids);
    this.run(`DELETE FROM web_visits WHERE id IN (${visits.map(()=>'?').join(',')}) AND NOT EXISTS (SELECT 1 FROM web_records r WHERE r.visit=web_visits.id)`,...visits);
   });
   counted.bytes=Math.max(0,counted.bytes-rows.reduce((sum,row)=>sum+Number(row.n),0));
   return rows.length;
  }catch{throw new WorldletError('Could not tidy the browsing recordings.');}
 }
 /** The recordings' size in bytes, as the tidy counted it (finishing the count when it has not yet). */
 webRecordBytes(this:WorldLedger):number {
  ensureWeb(this);
  const counted=tally(this);
  while(!counted.complete)this.tidyWebStep({rawKinds:[],rawBefore:0,maxBytes:Number.MAX_SAFE_INTEGER});
  return counted.bytes;
 }
 /** The recorded sites, most recently visited first, with how many visits each holds. */
 webSites(this:WorldLedger):{site:string;visits:number;lastAt:number}[] {
  ensureWeb(this);
  return this.all('SELECT site,count(*) AS n,max(ended_at) AS last FROM web_visits GROUP BY site ORDER BY last DESC').map(row=>({site:String(row.site),visits:Number(row.n),lastAt:Number(row.last)}));
 }
 /** Deletes recordings on one site and its subdomains (or every site) in a time range, with their
  * search index entries. Returns how many visits went. */
 deleteWeb(this:WorldLedger,{site='',after=0,before=Number.MAX_SAFE_INTEGER}:{site?:string;after?:number;before?:number}):number {
  ensureWeb(this);
  // The subdomain test compares the address's end exactly: LIKE would read `_` and `%` in a site as wildcards.
  const where='ended_at>=? AND started_at<?'+(site?' AND (site=? OR substr(site,-?)=?)':''),values:any[]=[after,before,...site?[site,site.length+1,'.'+site]:[]];
  const visits=`visit IN (SELECT id FROM web_visits WHERE ${where})`;
  try{
   return this.transaction(()=>{
    if(webSearchable.has(this))this.run(`INSERT INTO web_records_search(web_records_search,rowid,body) SELECT 'delete',id,body FROM web_records WHERE ${visits} AND body<>''`,...values);
    this.run(`DELETE FROM web_records WHERE ${visits}`,...values);
    // The size is counted again, a slice at a time, by the next tidy.
    tallies.delete(this);
    return Number(this.run(`DELETE FROM web_visits WHERE ${where}`,...values).changes);
   });
  }catch{throw new WorldletError('Could not delete the browsing recordings.');}
 }
}
