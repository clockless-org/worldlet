// Library storage check (Mac LibraryStorageChecks): a legacy `index.json` with Sources/Knowledge
// arrays moves into the SQLite library tables and its configuration into `world_settings`; restart, an
// older `index.json` brought back,
// no-op saves, source-revision invalidation, rollback, a missing database and local deletion through
// Core's rules (one provider, one item, everything; a pending file cleanup finished on reopen), identified
// history producers (retry, legitimate repeat, reported append failure, restart query), on a
// real WorldStore and WorldLedger in a disposable directory (no Electron, account or model).
//   npm run test:electron -- module:store
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Preferences} from '../preferences.ts';
import {digest} from '../files.ts';
import {WorldStore} from './world-store.ts';
import {WorldLedger} from './ledger.ts';
import {EMPTY_OVERLAY} from '../../../../core/context/index.ts';
import {removeOldLeftovers} from './leftovers.ts';
import {readAgentSetting,writeAgentSetting} from './agent-settings.ts';
import {BrowserHistory} from '../modules/browser/history.ts';
import {ActivityRecorder} from '../modules/browser/activity.ts';
import {installWorld} from '../modules/world.ts';

type Row=Record<string,any>;
const scratch=fs.mkdtempSync(path.join(process.env.WORLDLET_CHECK_ROOT??os.tmpdir(),'worldlet-library-'));
const open=(root:string)=>new WorldStore(root,Preferences.at(root),{appName:'Worldlet Check',platform:'macos',capabilities:()=>({}),mockGoogleAvailable:false});
const stores:WorldStore[]=[];
const opened=(root:string)=>{const store=open(root);stores.push(store);return store;};
try{
 const root=path.join(scratch,'library');fs.mkdirSync(root,{recursive:true});
 const id=digest('note:fixture'),blob=`sources/${id}/old.json`;
 fs.mkdirSync(path.join(root,'sources',id),{recursive:true});
 fs.writeFileSync(path.join(root,blob),JSON.stringify({title:'Original',text:'Original text',raw:'Original text',kind:'note'}));
 const legacy:Row={version:1,workspaceId:'5B0E3A39-1A1C-4F37-9E0B-8F00C2B1A001',revision:3,
  sources:[{id,title:'Original',origin:'note',revision:'old',blob,enabled:true,updatedAt:800000000}],
  knowledge:[{sourceId:id,summary:'Summary',theme:'home',topic:'Fixture',facts:[{text:'Fact',quote:'Original text'}],activities:[{kind:'task',title:'Fixture task',quote:'Original text'}],sourceRevision:'old',activityVersion:1}],
  layout:null,connections:[],codexPath:'',model:'',cloudConsent:false,lastJob:'Not yet generated',autoSync:false};
 const oldIndex=JSON.stringify(legacy);
 fs.writeFileSync(path.join(root,'index.json'),oldIndex);

 const store=opened(root);
 assert(store.writable&&store.state.sources.length===1&&store.state.knowledge[0]?.summary==='Summary','legacy migration failed: '+store.error);
 const config=WorldLedger.storedConfiguration(root)!;
 assert.deepEqual([config.sources,config.knowledge,config.libraryStorageVersion,config.workspaceId],[[],[],1,legacy.workspaceId],'the database keeps the configuration');
 assert(!fs.existsSync(path.join(root,'index.json'))&&fs.existsSync(path.join(root,'index.json.before-database')),'index.json moved in');
 const ledger=store.ledger();
 const tables=ledger.db!.prepare('SELECT (SELECT COUNT(*) FROM sources) AS sources,(SELECT COUNT(*) FROM knowledge) AS knowledge').get() as Row;
 assert.deepEqual({...tables},{sources:1,knowledge:1});
 assert.deepEqual(ledger.records('items').map(item=>[item.title,item.legacySourceId]),[['Fixture task',id]],'legacy Knowledge activities were imported once into items');
 console.log('PASS legacy index.json moves into SQLite: Sources/Knowledge into the library tables, the rest into world_settings');

 const before=ledger.eventCount();
 store.persist();store.persist();
 assert.equal(ledger.eventCount(),before,'unchanged records must not add history');
 console.log('PASS unchanged saves add no library history');
 // The areas' layout (pins and last use) is kept in the World without a new revision redrawing the page.
 const revision=store.state.revision;
 store.updateOnboarding({operation:'regionLayout',layout:{version:2,pins:{home:['app-gmail',null,null,null,null]},lastUsedAt:{'app-gmail':1000}}});
 assert.equal(store.state.revision,revision,'saving the area layout adds no revision');
 assert.deepEqual(WorldLedger.storedConfiguration(root)!.onboarding.regionLayout.pins,{home:['app-gmail',null,null,null,null]},'the area layout is kept in the World');
 console.log('PASS the areas\' pinned places and last use are kept in world.sqlite without a new revision');

 ledger.put('items','fixture-attention',{id:'fixture-attention',status:'dismissed',sources:[{local:true,id}]});
 assert.equal(store.ingest({title:'Updated',text:'Updated text',origin:'note',externalId:'fixture'}),true);
 assert.deepEqual(store.state.knowledge,[],'a new revision drops the stale Knowledge');
 const attention=ledger.find('items','fixture-attention');
 assert(attention?.attentionInvalidated===true&&attention.status==='dismissed',JSON.stringify(attention));
 console.log('PASS a source revision invalidates dependent local items and keeps their status');

 // An index.json brought back (an older copy of the library) moves in again; the database keeps its Sources.
 fs.writeFileSync(path.join(root,'index.json'),oldIndex);
 const restarted=opened(root);
 assert(restarted.writable&&restarted.state.sources[0]?.title==='Updated'&&!restarted.state.knowledge.length,'restart after an interrupted replacement: '+JSON.stringify(restarted.state.sources));
 assert.equal(restarted.original(id).text,'Updated text');
 assert(!fs.existsSync(path.join(root,'index.json')),'the brought-back index.json moved in');
 restarted.state.model='fixture-model';restarted.persist();
 assert.equal(opened(root).state.model,'fixture-model','a configuration change survives a restart');
 console.log('PASS restart: configuration comes from the database; a brought-back index.json moves in, its stale arrays ignored');

 // A failed database write rolls back both the source rows and their history.
 const history=ledger.eventCount();
 ledger.exec("CREATE TRIGGER fixture_reject BEFORE INSERT ON sources BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 assert.throws(()=>ledger.saveLibrary({...restarted.state,sources:restarted.state.sources.map((source:Row)=>({...source,title:'Must roll back'}))}),'a rejected write must fail');
 ledger.exec('DROP TRIGGER fixture_reject;');
 const recovered:Row={};ledger.loadLibrary(recovered);
 assert.equal(recovered.sources[0].title,'Updated');assert.equal(ledger.eventCount(),history,'rolled-back history');
 console.log('PASS a rejected library write rolls back its rows and history');

 restarted.deleteLocalContent({action:'clearWorldContent'});
 const empty=opened(root);
 assert(empty.writable&&!empty.state.sources.length&&!empty.state.knowledge.length,'cleared library reopens empty');
 assert(!fs.existsSync(path.join(root,'sources',id)),'originals deleted');
 console.log('PASS clearing World content empties the library tables and originals');

 // Deleting one provider's data: mixed items keep their other evidence in every revision; connections stay.
 const home=path.join(scratch,'deletion');fs.mkdirSync(home,{recursive:true});
 const local=opened(home),book=local.ledger();
 const mail=digest('imap:fixture'),page=digest('notion:fixture');
 for(const dir of [`sources/${mail}`,`knowledge/${mail}`,`cache/knowledge/${mail}`,`sources/${page}`]){fs.mkdirSync(path.join(home,dir),{recursive:true});fs.writeFileSync(path.join(home,dir,'copy.json'),'{}');}
 local.state.connections=[{id:'mail-account',provider:'gmail',target:'fixture'}];
 local.state.sources=[{id:mail,title:'Mail',origin:'imap',connectionID:'mail-account',revision:'r',blob:`sources/${mail}/copy.json`,enabled:true,updatedAt:1},{id:page,title:'Page',origin:'notion',revision:'r',blob:`sources/${page}/copy.json`,enabled:true,updatedAt:1}];
 local.changed();
 const mailRef={provider:'gmail',id:'m1'},pageRef={provider:'notion',id:'n1'};
 book.put('items','mail-only',{id:'mail-only',title:'Reply',sources:[mailRef]});
 book.put('items','mixed',{id:'mixed',title:'Draft',sources:[mailRef,pageRef]});
 book.put('items','mixed',{id:'mixed',title:'Draft, revised',sources:[mailRef,pageRef]});
 book.put('items','page-only',{id:'page-only',title:'Read',sources:[pageRef]});
 book.put('reviews','run:mail-only',{id:'mail-only',runId:'run',reason:'fixture'});
 book.put('attention-context','current',{id:'current',facts:[{provider:'gmail',text:'mail'},{provider:'notion',text:'page'}]});
 for(const key of ['gmail','notion'])book.put('applet-observations',key,{id:key});
 // Pending task reviews and browser receipts are scoped like the items they refer to.
 for(const [id,item,provider] of [['r-mail','mail-only','gmail'],['r-page','page-only','notion'],['r-mixed','mixed','notion']])
  book.put('task-reviews',id,{id,previous:{id:item,provider},candidates:[{id:item,provider}],proposal:{id:item,provider},runId:'run',createdAt:'2026-10-04T00:00:00Z'});
 for(const [id,item] of [['b-page','page-only'],['b-mixed','mixed']])book.put('browser-actions',id,{id,taskID:item,task:{provider:'notion'},status:'unverified'});
 const trail=()=>[book.records('task-reviews').map(row=>row.id).sort(),book.records('browser-actions').map(row=>row.id).sort()];
 const revisions=(bucket:string,key:string)=>(book.db!.prepare('SELECT body FROM entries WHERE kind=? AND key=? ORDER BY seq').all('state.'+bucket,key) as Row[]).map(row=>JSON.parse(row.body));
 assert.equal(local.deleteLocalContent({action:'deleteSourceData',provider:'gmail'}),1);
 assert.deepEqual([revisions('items','mail-only'),revisions('reviews','run:mail-only')],[[],[]],'items resting only on the provider leave no revision or review');
 const mixed=revisions('items','mixed');
 assert(mixed.length===2&&mixed.every(row=>row.sources.length===1&&row.sources[0].provider==='notion'),'mixed item keeps its other evidence in every revision: '+JSON.stringify(mixed));
 assert.deepEqual(book.records('attention-context')[0].facts,[{provider:'notion',text:'page'}]);
 assert.deepEqual(book.records('applet-observations').map(row=>row.id),['notion']);
 assert((book.find('runtime-generations','gmail')?.generation??0)>=1,'runtime work for the provider is invalidated');
 assert.deepEqual([local.state.connections.length,local.state.sources.map((s:Row)=>s.id)],[1,[page]],'connections stay; only the provider sources go');
 assert(![`sources/${mail}`,`knowledge/${mail}`,`cache/knowledge/${mail}`].some(dir=>fs.existsSync(path.join(home,dir)))&&fs.existsSync(path.join(home,'sources',page)),'only the provider copies are removed');
 assert.deepEqual(book.records('local-deletion-files'),[],'finished cleanup leaves no pending record');
 assert.deepEqual(trail(),[['r-mixed','r-page'],['b-mixed','b-page']],'only the provider’s task reviews go; other reviews and receipts stay');
 console.log('PASS deleting one provider data scrubs every revision through Core; mixed items, other sources and connections stay');

 assert.equal(local.deleteLocalContent({action:'deleteWorldItem',id:'page-only'}),1);
 assert.deepEqual(revisions('items','page-only'),[],'the item leaves no revision');
 assert.equal(local.deleteLocalContent({action:'deleteWorldItem',id:'page-only'}),0,'deleting a missing item changes nothing');
 assert(book.find('items','mixed')&&local.state.sources.length===1,'other items and sources stay');
 assert.deepEqual(trail(),[['r-mixed'],['b-mixed']],'deleting one item removes only its task reviews and browser receipts');
 assert.throws(()=>local.deleteLocalContent({action:'deleteWorldItem'}),/Invalid item/);
 console.log('PASS deleting one item removes it and its revisions only');

 // Clearing everything, with the file cleanup interrupted: the record survives and reopening finishes it.
 const finish=WorldLedger.prototype.finishLocalDeletionFiles;
 WorldLedger.prototype.finishLocalDeletionFiles=function(){WorldLedger.prototype.finishLocalDeletionFiles=finish;throw new Error('fixture interruption');};
 local.deleteLocalContent({action:'clearWorldContent'});
 assert.equal(WorldLedger.prototype.finishLocalDeletionFiles,finish);
 assert(!book.records('items').length&&!local.state.sources.length&&local.state.connections.length===1,'clearing keeps connections');
 assert.deepEqual(trail(),[[],[]],'clearing everything removes every task review and receipt');
 assert(fs.existsSync(path.join(home,'sources',page))&&book.records('local-deletion-files').length===1,'interrupted cleanup stays recorded');
 local.closeLedger();
 const reopened=opened(home);
 assert(reopened.writable&&!reopened.state.sources.length&&reopened.state.connections.length===1,'cleared library reopens empty with its connections');
 assert(!fs.existsSync(path.join(home,'sources',page))&&!reopened.ledger().records('local-deletion-files').length,'reopening finishes the pending cleanup');
 console.log('PASS clearing World content records pending file cleanup in its transaction and finishes it on reopen');

 // History producers append through Core identity: a retried id is one row, a repeated action is
 // another, a failed save is reported without failing the action, and reopening reads v1 rows.
 const journal=path.join(scratch,'history');fs.mkdirSync(journal,{recursive:true});
 const failures:string[]=[];
 let hist=opened(journal);hist.historyFailure=(_error,kind)=>failures.push(kind);
 const turn='4C1D8F2A-0000-4000-8000-000000000001';
 const check=(status:string,phase:string)=>({id:turn+':'+phase,kind:'applet.check',at:1_800_000_000,actor:'applet',status,runId:turn});
 assert(hist.recordHistory(check('started','started'),'gmail')&&hist.recordHistory(check('started','started'),'gmail'),'a retried event is accepted');
 assert(hist.recordHistory(check('complete','finished'),'gmail'));
 const message={id:'5D2E9F3B-0000-4000-8000-000000000002',kind:'conversation.message',at:1_800_000_001,actor:'user',messageId:'5D2E9F3B-0000-4000-8000-000000000002',preview:'Fictional hello'};
 hist.recordHistory(message,'session-a');hist.recordHistory(message,'session-a');
 const tool=(id:string)=>({id,kind:'applet.activity',at:1_800_000_002,actor:'fox',operation:'archive_world_items',status:'complete',runId:turn});
 hist.recordHistory(tool('6E3FA04C-0000-4000-8000-000000000003'),'gmail');hist.recordHistory(tool('6E3FA04C-0000-4000-8000-000000000004'),'gmail');
 const recorder=new ActivityRecorder(hist);
 recorder.event({kind:'ui.click',data:{target:'fixture-button'}});
 hist.recordWorldAction('openApplet',{appletId:'gmail'},'req-fixture-1');hist.recordWorldAction('openApplet',{appletId:'gmail'},'req-fixture-1');
 const kinds=(kind:string)=>hist.ledger().history({kind}).length;
 assert.deepEqual(['applet.check','conversation.message','applet.activity','activity.ui.click','world.action'].map(kinds),[2,1,2,1,1],'retries add no row; repeated tool calls stay distinct');
 assert.deepEqual(failures,[]);
 hist.ledger().db!.exec("CREATE TEMP TRIGGER fixture_full BEFORE INSERT ON entries WHEN NEW.kind<>'state.fixture' BEGIN SELECT RAISE(ABORT,'fixture disk full'); END;");
 assert.equal(hist.recordHistory(check('error','finished-2'),'gmail'),false,'a failed append returns false instead of throwing');
 recorder.event({kind:'ui.submit',data:{}});
 hist.recordWorldAction('openApplet',{appletId:'gmail'},'req-fixture-2');
 assert.deepEqual(failures,['applet.check','ui.submit','world.action'],'each failed append reaches the host failure hook');
 hist.ledger().db!.exec('DROP TRIGGER fixture_full');
 assert.deepEqual(['applet.check','activity.ui.submit'].map(kinds),[2,0],'failed appends left no partial row');
 hist.closeLedger();
 hist=opened(journal);
 const saved=hist.worldHistory().entries as Row[];
 assert.equal(saved.length,7,JSON.stringify(saved));
 assert(saved.every(entry=>!entry.legacy&&typeof entry.observedAt==='string'&&!String(entry.id).startsWith('legacy:')),'reopened rows keep identity and save time: '+JSON.stringify(saved));
 const byKind=(kind:string)=>saved.filter(entry=>entry.kind===kind);
 assert.deepEqual(byKind('applet.check').map(entry=>[entry.id,entry.key,entry.body.status,entry.body.runId]).reverse(),[[turn+':started','gmail','started',turn],[turn+':finished','gmail','complete',turn]]);
 assert.deepEqual(byKind('conversation.message').map(entry=>[entry.body.actor,entry.body.preview]),[['user','Fictional hello']]);
 assert.deepEqual(byKind('applet.activity').map(entry=>[entry.body.operation,entry.body.status]),[['archive_world_items','complete'],['archive_world_items','complete']]);
 assert.deepEqual(byKind('world.action').map(entry=>entry.id),['req-fixture-1:requested']);
 assert.equal(byKind('activity.ui.click')[0]?.body.target,'fixture-button');
 assert.equal(hist.ledger().queryWorldHistory({runId:turn}).events.length,4,'runId correlates check and tool outcomes');
 console.log('PASS history producers: retried ids add no row, repeated actions stay distinct, failed appends are reported and reopened rows are not legacy');

 // The World page's bridge sends bare `{kind,data}` (#1076): the store's recorder supplies id, surface and time,
 // and a page observation is recorder state, not an invalid event.
 const worldJournal=path.join(scratch,'world-activity');fs.mkdirSync(worldJournal,{recursive:true});
 const worldFailures:string[]=[];
 const world=opened(worldJournal);world.historyFailure=(error,kind)=>worldFailures.push(kind+': '+String(error));
 world.recordActivity({kind:'ui.observation',data:{documentId:'7F4B0C5D-0000-4000-8000-000000000005',visible:true,title:'World',text:'Fictional World page'}});
 world.recordActivity({kind:'ui.click',data:{target:'world-button'}});
 world.recordActivity({kind:'ui.click',data:{target:'world-button'}});
 assert.deepEqual(worldFailures,[],'World activity saves without failures: '+worldFailures.join('; '));
 const clicks=world.ledger().history({kind:'activity.ui.click'});
 assert.equal(new Set(clicks.map((entry:Row)=>entry.body.id)).size,2,'each World event gets its own id: '+JSON.stringify(clicks));
 world.closeLedger();
 console.log('PASS World page activity gets recorder identity and page observations are not reported as failures');

 // #1119: the same through the host's `worldActivity` handler, for one whole World visit as
 // platform/bridge/activity.ts sends it: open, a page observation, a command, close.
 const visitJournal=path.join(scratch,'world-visit');fs.mkdirSync(visitJournal,{recursive:true});
 const visitFailures:string[]=[];
 const visit=opened(visitJournal);visit.historyFailure=(error,kind)=>visitFailures.push(kind+': '+String(error));
 const handlers:Row={};
 installWorld({store:visit,register:(map:Row)=>Object.assign(handlers,map)} as any);
 const worldPage={documentId:'7F4B0C5D-0000-4000-8000-000000000006',url:'https://worldlet.local/world',title:'World',text:'Fictional World page',visible:true,scrollX:0,scrollY:0,clicks:[],edits:[],interactions:[],dropped:0};
 for(const request of [{kind:'ui.open',data:{target:'world'}},{kind:'ui.observation',data:worldPage},{kind:'ui.command',data:{operation:'openApplet',status:'requested',commandId:'cmd-fixture-1',target:'gmail'}},{kind:'ui.close',data:{target:'world'}}])
  assert.deepEqual(handlers.worldActivity(request),{ok:true});
 assert.deepEqual(visitFailures,[],'World visit saves without failures: '+visitFailures.join('; '));
 const visitEntries=visit.worldHistory().entries as Row[];
 const visitKinds=visitEntries.map(entry=>entry.kind);
 for(const kind of ['activity.ui.open','activity.page.opened','activity.ui.command','activity.ui.close','activity.page.closed'])assert(visitKinds.includes(kind),kind+' in '+JSON.stringify(visitKinds));
 assert(!visitKinds.includes('activity.ui.observation'),'an observation is recorder state, never an activity kind: '+JSON.stringify(visitKinds));
 assert.equal(new Set(visitEntries.map(entry=>entry.body.surfaceId)).size,1,'one World surface: '+JSON.stringify(visitEntries));
 assert(visitEntries.every(entry=>typeof entry.id==='string'&&entry.body.id===entry.id&&Number.isFinite(entry.at)),'every entry has an id and time: '+JSON.stringify(visitEntries));
 visit.closeLedger();
 console.log('PASS a World visit through the worldActivity handler saves with Core identity on one surface');

 // A migrated index without its database is refused, never turned into an empty writable library.
 const lost=path.join(scratch,'lost');fs.mkdirSync(lost,{recursive:true});
 fs.writeFileSync(path.join(lost,'index.json'),JSON.stringify(config));
 const blocked=opened(lost);
 assert(!blocked.writable&&/database is missing/.test(blocked.error??''),'missing database: '+blocked.error);
 assert(!fs.existsSync(path.join(lost,'world.sqlite'))||blocked.state.sources.length===0);
 assert.throws(()=>blocked.persist(),/read-only/);
 const gone=path.join(scratch,'gone');fs.mkdirSync(path.join(gone,'sources',id),{recursive:true});
 fs.writeFileSync(path.join(gone,blob),'{}');
 const orphaned=opened(gone);
 assert(!orphaned.writable&&/database is missing/.test(orphaned.error??''),'originals without a database: '+orphaned.error);
 console.log('PASS a library without its world.sqlite opens read-only instead of empty and writable');
 // Small World settings live in the database; their earlier files move in once.
 {
  const home=path.join(scratch,'settings');fs.mkdirSync(home);
  fs.writeFileSync(path.join(home,'environment.json'),JSON.stringify({weather:{words:'Sunny'}}));
  const store=opened(home);
  assert.deepEqual(store.worldSetting('environment'),{weather:{words:'Sunny'}});
  assert.ok(!fs.existsSync(path.join(home,'environment.json'))&&fs.existsSync(path.join(home,'environment.json.before-database')));
  assert.equal(store.worldSetting('overlay'),null);
  const overlay=EMPTY_OVERLAY();
  store.savePresentation({action:'saveOverlay',state:overlay});
  assert.deepEqual(store.ledger().setting('overlay'),overlay);
  assert.equal(fs.existsSync(path.join(home,'overlay.json')),false,'no file written');
  console.log('PASS layout edits and weather are World settings in the database; earlier files move in once');
 }
 // Conversations: Fox's own and brought ones in one table, searched with a trigram index that backups leave out.
 {
  const home=path.join(scratch,'conversations');
  const ledger=new WorldLedger(home);
  // The first version's brought_* tables join the shared ones.
  ledger.exec(`CREATE TABLE brought_conversations (id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, session TEXT NOT NULL);
   CREATE TABLE brought_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, source TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE brought_notes (id TEXT PRIMARY KEY, source TEXT NOT NULL, session TEXT NOT NULL, date TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
   INSERT INTO brought_conversations VALUES('c','openclaw','Diet','OpenClaw · Diet');
   INSERT INTO brought_messages VALUES('m','c','openclaw','user','我今天吃了沙拉','2026-09-01T10:00:00Z');
   INSERT INTO brought_notes VALUES('n','openclaw','OpenClaw notes','2026-09-02','Booked the dentist.','2026-09-02T12:00:00Z');`);
  ledger.addCompanionTurns(WorldLedger.OWN,[{id:'f1',session:'context-a',role:'user',text:'What salad did I eat?',createdAt:'2026-08-01T10:00:00Z'},{id:'f2',session:'context-a',role:'assistant',text:'吃了沙拉 with tofu',createdAt:'2026-08-01T10:00:02Z'}]);
  assert.deepEqual(ledger.companionCounts(),{fox:{turns:2,notes:0},openclaw:{turns:1,notes:1}});
  assert.equal(Number((ledger.db!.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'brought_%'").get() as Row).n),0,'the old tables are gone');
  const ids=(query:string)=>ledger.searchCompanion(query,0,10).rows.map(row=>row.id);
  assert.deepEqual(ids('沙拉'),['f2','m'],'Fox’s own first, then brought; two characters still match');
  assert.deepEqual(ids('SALAD'),['f1'],'any case');
  assert.deepEqual(ids('dentist'),['n']);assert.equal(ledger.searchCompanion('dentist',0,1).rows[0].text,'Notes for 2026-09-02\n\nBooked the dentist.');
  assert.deepEqual(ids('50%'),[],'LIKE wildcards are plain text');
  assert.equal(ledger.searchCompanion('',0,0).total,4);
  assert.equal(ledger.companionRecord('m')?.session,'OpenClaw · Diet');
  ledger.replaceCompanionHistory('openclaw',{turns:[{id:'m2',session:'OpenClaw · Diet',role:'user',text:'Ramen tonight',createdAt:'2026-09-03T10:00:00Z'}],notes:[]});
  assert.deepEqual(ids('沙拉'),['f2'],'bringing again replaces that Agent only');assert.deepEqual(ids('ramen'),['m2']);
  assert.deepEqual(ledger.companionTurns(WorldLedger.OWN,1).map(row=>row.id),['f2']);
  // A backup copy leaves the index out; opening it builds the index again.
  const copy=path.join(scratch,'copy');fs.mkdirSync(copy);ledger.snapshotTo(path.join(copy,'world.sqlite'));
  const raw=new WorldLedger(copy);
  assert.equal(Number((raw.db!.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%_search%'").get() as Row).n),0);
  assert.deepEqual(raw.searchCompanion('ramen',0,5).rows.map(row=>row.id),['m2']);
  raw.close();
  // Each turn keeps the thread it was said in: Fox's the place it was asked from, a brought one its conversation.
  ledger.addCompanionTurns(WorldLedger.OWN,[{id:'f3',session:'context-a',role:'user',text:'Mail question',createdAt:'2026-09-04T10:00:00Z',thread:'["mail","inbox"]'}]);
  const threadOf=(id:string)=>(ledger.db!.prepare('SELECT thread FROM companion_turns WHERE id=?').get(id) as Row).thread;
  assert.deepEqual(['f1','f3','m2'].map(threadOf),['','["mail","inbox"]','OpenClaw · Diet']);
  assert.equal(ledger.searchCompanion('mail question',0,1).rows[0].thread,'["mail","inbox"]');
  ledger.close();
  // A database from before threads gets the column; brought turns take their conversation.
  const older=path.join(scratch,'older');fs.mkdirSync(older);
  const plain=new DatabaseSync(path.join(older,'world.sqlite'));
  plain.exec(`CREATE TABLE companion_turns (id TEXT PRIMARY KEY, source TEXT NOT NULL, session TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
   INSERT INTO companion_turns VALUES('o1','fox','context-a','user','hi','2026-08-01T10:00:00Z'),('o2','pi','pi · Plan','user','plan','2026-08-01T10:00:00Z');`);
  plain.close();
  const upgraded=new WorldLedger(older);
  assert.deepEqual(upgraded.searchCompanion('',0,5).rows.map(row=>[row.id,row.thread]),[['o1',''],['o2','pi · Plan']]);
  upgraded.close();
  console.log('PASS conversations: Fox’s own and brought turns in one table with their thread, notes beside them, indexed search that backups leave out');
 }
 // The person's own Applets in one table (core/applets/MY-APPLETS.md#one-table): the earlier tables and buckets move
 // in once and stay as they were; pages, records, ticks and pictures come along; deleting takes the pictures too.
 {
  const home=path.join(scratch,'my-applets');fs.mkdirSync(home);
  const plain=new DatabaseSync(path.join(home,'world.sqlite'));
  plain.exec(`CREATE TABLE entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL);
   CREATE TABLE widgets (id TEXT PRIMARY KEY, record TEXT NOT NULL, html TEXT NOT NULL, state TEXT NOT NULL);
   CREATE TABLE ongoing (id TEXT PRIMARY KEY, record TEXT NOT NULL);
   INSERT INTO widgets VALUES('wgt-0123456789','{"id":"wgt-0123456789","title":"Tahoe"}','<p>page</p>','{"state":{"a":"1"}}');
   INSERT INTO ongoing VALUES('job-0123456789ab','{"id":"job-0123456789ab","state":"kept"}');
   INSERT INTO entries(at,kind,key,body) VALUES(1,'state.site-applets','site-0123456789ab','{"id":"site-0123456789ab","title":"old"}'),
    (2,'state.site-applets','site-0123456789ab','{"id":"site-0123456789ab","title":"tldraw"}'),
    (3,'state.applet-art','app-wgt-0123456789','{"applet":"app-wgt-0123456789","icon":"data:image/png;base64,AA==","background":"data:image/jpeg;base64,BB==","madeAt":7}');`);
  plain.close();
  const ledger=new WorldLedger(home);
  assert.deepEqual(ledger.myApplets('page'),[{id:'wgt-0123456789',record:{id:'wgt-0123456789',title:'Tahoe'},state:{state:{a:'1'}},painted:true}]);
  assert.equal(ledger.widgetPage('wgt-0123456789'),'<p>page</p>');
  assert.deepEqual(ledger.myApplets('site').map(row=>row.record.title),['tldraw'],'the latest website record');
  assert.deepEqual(ledger.ongoingRows(),[{id:'job-0123456789ab',state:'kept'}]);
  assert.deepEqual(ledger.myAppletIcons(),{'wgt-0123456789':'data:image/png;base64,AA=='});
  assert.deepEqual(ledger.myAppletArt('wgt-0123456789'),{icon:'data:image/png;base64,AA==',background:'data:image/jpeg;base64,BB==',paintedAt:7});
  const count=(table:string)=>Number((ledger.db!.prepare('SELECT count(*) AS n FROM '+table).get() as Row).n);
  assert.deepEqual([count('widgets'),count('ongoing')],[1,1],'the earlier tables stay as they were');
  // Moving in happens once: an Applet deleted afterwards does not come back from them.
  ledger.deleteWidget('wgt-0123456789');ledger.close();
  const again=new WorldLedger(home);
  assert.deepEqual(again.myApplets('page'),[]);assert.deepEqual(again.myAppletIcons(),{},'its pictures went with it');
  // Saving a page record alone changes an existing page only; pictures are kept for Applets still there.
  again.saveWidget('wgt-9999999999',{id:'wgt-9999999999'});assert.deepEqual(again.myApplets('page'),[]);
  again.saveWidget('wgt-9999999999',{id:'wgt-9999999999'},{html:'<p>x</p>',state:{}});
  again.saveWidget('wgt-9999999999',{id:'wgt-9999999999',title:'renamed'});
  assert.deepEqual([again.widgetPage('wgt-9999999999'),again.myApplets('page')[0].record.title],['<p>x</p>','renamed']);
  assert.equal(again.saveMyAppletArt('wgt-0123456789',{icon:'i',background:'b',paintedAt:1}),false,'no pictures for a deleted Applet');
  again.saveOngoing([{id:'job-0123456789ab',state:'declined'}],[]);again.saveOngoing([],['job-0123456789ab']);assert.deepEqual(again.ongoingRows(),[]);
  again.close();
  console.log('PASS the person\'s own Applets: one table that the earlier pages, conversations, websites and pictures move into once');
 }
 // What the chat shows place by place: rows read back whole, each card tagged with its thread.
 {
  const ledger=new WorldLedger(path.join(scratch,'views'));
  assert.equal(ledger.hasCompanionViews(),false);assert.deepEqual(ledger.companionViews(),[]);
  const cards=[{id:'turn:1',key:'mail',view:'inbox',user:'Any bills?',text:'Two.'},{id:'turn:2',key:'',view:'',user:'Hi',text:'Hello.'}];
  const rows=[{key:'mail',view:'inbox',text:'Two.'},{key:'fox-thread',userTextVersion:1,view:'',text:'',entries:cards}];
  ledger.replaceCompanionViews(rows);
  assert.deepEqual(ledger.companionViews(),rows);
  assert.deepEqual(ledger.db!.prepare('SELECT thread FROM companion_cards ORDER BY position').all().map((row:any)=>row.thread),['["mail","inbox"]','["overview",""]']);
  ledger.replaceCompanionViews([]);assert.deepEqual(ledger.companionViews(),[]);
  ledger.close();
  console.log('PASS the chat’s cards and last replies are kept in the database, each with its thread');
 }
 // Browsing history lives in the database; the earlier file moves in once, then each visit changes a few rows.
 {
  const home=path.join(scratch,'visits');fs.mkdirSync(home);
  fs.writeFileSync(path.join(home,'browser-history.json'),JSON.stringify([{url:'https://example.com/a',title:'A',text:'alpha',visitedAt:100}]));
  const ledger=new WorldLedger(home);
  const history=new BrowserHistory(ledger);
  assert.ok(!fs.existsSync(path.join(home,'browser-history.json'))&&fs.existsSync(path.join(home,'browser-history.json.before-database')));
  const at=new Date().setHours(12,0,0,0);
  history.record('https://example.com/b','B','beta',at);
  history.record('https://example.com/b','B again','beta two',at+400_000);
  assert.deepEqual(ledger.browserVisits().map(v=>[v.url,v.title]),[['https://example.com/a','A'],['https://example.com/b','B again']],'the same page the same day is one visit, kept as the newest');
  assert.equal(new BrowserHistory(ledger).search({query:'beta'}).items[0].title,'B again','read back after reopening');
  history.record('https://www.example.org/c','C','',at);
  assert.deepEqual(history.sites(),{'example.com':1,'example.org':1},'an Area sees recent hosts and counts only; the 2001 visit is past the month');
  ledger.close();
  // Safety copies left by the moves go after a month.
  const old=path.join(home,'companion','pi.before-database');fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'0001.json'),'{}');
  assert.deepEqual(removeOldLeftovers(home),[],'a fresh copy stays');
  assert.deepEqual(removeOldLeftovers(home,Date.now()+31*86_400_000).sort(),['browser-history.json.before-database','companion/pi.before-database']);
  assert.ok(!fs.existsSync(old)&&fs.existsSync(path.join(home,'world.sqlite')));
  console.log('PASS browsing history is kept in the database, and moved files’ safety copies go after a month');
 }
 // Fox's setup choices live in the database too, and travel with backups.
 {
  const home=path.join(scratch,'agent-settings');fs.mkdirSync(path.join(home,'agent'),{recursive:true});
  fs.writeFileSync(path.join(home,'agent','local-harness.json'),JSON.stringify({version:1,id:'pi'}));
  assert.deepEqual(readAgentSetting(home,'local-harness'),{version:1,id:'pi'},'before the database exists the file is read');
  const ledger=new WorldLedger(home);
  assert.deepEqual(readAgentSetting(home,'local-harness'),{version:1,id:'pi'});
  assert.ok(!fs.existsSync(path.join(home,'agent','local-harness.json'))&&fs.existsSync(path.join(home,'agent','local-harness.json.before-database')));
  writeAgentSetting(home,'model-source',{version:1,id:'local-codex'});
  assert.deepEqual(readAgentSetting(home,'model-source'),{version:1,id:'local-codex'});
  writeAgentSetting(home,'local-harness',null);assert.equal(readAgentSetting(home,'local-harness'),null);
  const copy=path.join(scratch,'agent-settings-copy');fs.mkdirSync(copy);ledger.snapshotTo(path.join(copy,'world.sqlite'));
  assert.deepEqual(readAgentSetting(copy,'model-source'),{version:1,id:'local-codex'},'a backup carries them');
  ledger.close();
  console.log('PASS Fox’s setup choices are kept in the database and carried by backups');
 }
 // Browsing recordings: the sites the person can delete, newest first, and a delete limited to one site
 // and a time range leaves the rest (Settings › General, scripts/web-record-check.ts).
 {
  const ledger=new WorldLedger(path.join(scratch,'web-recordings'));
  const visit=(id:string,site:string,at:number)=>ledger.recordWeb([{id,site,url:'https://'+site+'/',title:site,applet:'browser',startedAt:at,endedAt:at+60}],[{visit:id,at,kind:'text',url:'https://'+site+'/',meta:{},body:'Pallet Town '+id}]);
  visit('a1','a.com',100);visit('a2','a.com',5000);visit('b1','b.com',3000);
  assert.deepEqual(ledger.webSites(),[{site:'a.com',visits:2,lastAt:5060},{site:'b.com',visits:1,lastAt:3060}]);
  assert.equal(ledger.deleteWeb({site:'a.com',after:0,before:1000}),1,'only the visit in range');
  assert.deepEqual(ledger.webVisits({terms:['Pallet'],before:10_000}).visits.map(v=>v.id).sort(),['a2','b1']);
  assert.equal(ledger.deleteWeb({}),2,'every site');
  assert.deepEqual(ledger.webSites(),[]);
  ledger.close();
  console.log('PASS browsing recordings list by site and delete by site, time range or all');
 }
 {
  // A review an older build queued for a re-read of the same passage is dropped instead of shown again.
  const ledger=opened(path.join(scratch,'reviews')).ledger();
  const mail='Subject: You need to verify your identity. You will need to verify your identity to publish to Google Play.';
  const task=(quote:string,id='t1')=>({id,kind:'task',provider:'gmail',title:'Verify identity for Google Play',sources:[{provider:'gmail',id:'local',remoteId:'thread:abc',quote}]});
  ledger.put('items','t1',task(mail));
  const review=(id:string,proposal:Row,previous:Row=task(mail))=>ledger.put('task-reviews',id,{id,previous,candidates:[previous],proposal,runId:'run',createdAt:'2026-10-04T00:00:00Z'});
  review('same',{...task('Status: READ '+mail)});
  review('new',{...task('New message: please also send the tax form. '+mail)});
  review('gone',{...task(mail,'missing')},task(mail,'missing'));
  assert.deepEqual(ledger.settledTaskReviews().map(row=>row.id),['new'],'only a review that still needs the person stays');
  assert.deepEqual(ledger.records('task-reviews').map(row=>row.id),['new'],'settled reviews are deleted');
  console.log('PASS a queued task review of the same evidence, or of a removed task, is dropped instead of shown again');
 }
}catch(error){console.error('FAIL library storage:',error);process.exitCode=1;}
finally{for(const store of stores)store.closeLedger();fs.rmSync(scratch,{recursive:true,force:true});}
