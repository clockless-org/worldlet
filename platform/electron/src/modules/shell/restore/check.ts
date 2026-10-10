// World restore check (owner ask 2026-10-05: "如果换台机器，要能够完全还原"): everything that happens in
// the World is in `world.sqlite`, and a backup made on one computer and restored into a fresh profile on
// another brings the whole World back. A first library keeps files from before (execution payloads,
// made games, email drafts, a Codex task, the YouTube queue, World preferences in preferences.json),
// which move into its database when it opens; then it gains a source, an item, history, a conversation,
// chat cards, a widget, an ongoing thing, an artifact, browsing history, website recordings past the old 120 MB
// backup limit, brought skills, Fox's setup choices, World settings, an Agent run with streamed text
// and an Order. Its backup is restored into a second, fresh profile, and every database table, every
// original and every World preference must match, while that computer's own preferences stay its own.
// Runs in an Electron main process: npm run test:electron -- shell/restore
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {app} from 'electron';
import {Preferences} from '../../../preferences.ts';
import {WorldStore} from '../../../store/world-store.ts';
import {writeAgentSetting,readAgentSetting} from '../../../store/agent-settings.ts';
import {ExecutionJournal} from '../../agent-runtime/journal.ts';
import {MailReviews} from '../../sources/reviews.ts';
import {CodexTasks} from '../../applet-tools/coding.ts';
import {decode,exportTo,restore} from '../backup.ts';
import type {Host,Row} from '../../../host/types.ts';

const scratch=fs.mkdtempSync(path.join(process.env.WORLDLET_CHECK_ROOT??os.tmpdir(),'worldlet-restore-'));
const pass=(text:string)=>console.log('PASS '+text);
const write=(file:string,data:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
const opened:WorldStore[]=[];
function world(name:string,legacy?:()=>Record<string,unknown>){
 const root=path.join(scratch,name);fs.mkdirSync(root,{recursive:true});
 return {root,setup:()=>{
  const preferences=Preferences.at(root,legacy);
  const store=new WorldStore(root,preferences,{appName:'Worldlet Check',platform:'macos',capabilities:()=>({}),mockGoogleAvailable:false});
  opened.push(store);
  const host={profile:{channel:'dev',worktree:'',root,title:'Worldlet Check',webRoot:root,resources:process.cwd(),smoke:false},preferences,store,
   page:{call:async()=>undefined,event:()=>{},documentEvent:()=>{},ready:()=>false},window:()=>null,worldView:()=>null,register:()=>{},provide:(_name:string,service:unknown)=>service,
   use:(name:string)=>{throw Error('Missing host service '+name);},optional:()=>undefined,onPageReload:()=>{},onQuit:()=>{},onPageLoaded:()=>{},diagnostics:{record:()=>{},log:()=>{}}} as unknown as Host;
  return {preferences,store,host};
 }};
}
/** Every table of a World database, rows in a stable order; search indexes are rebuilt, not compared. */
function tables(file:string):Record<string,unknown[]> {
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const names=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%search%' ORDER BY name").all() as Row[]).map(row=>String(row.name));
  return Object.fromEntries(names.map(name=>{
   const rows=(db.prepare(`SELECT * FROM "${name}"`).all() as Row[]).map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Uint8Array?Buffer.from(value).toString('base64'):value]))));
   return [name,rows.sort()];
  }));
 }finally{db.close();}
}
const HERMES='agent/private/hermes',TASK=crypto.randomUUID();
const first=world('first',()=>({'worldlet.companionName':'Pip','worldlet.textScale':1.25,'worldlet.music.volume':0.5}));
try{
 assert(app.isReady(),'runs in an Electron main process');
 // Files from before, which move into the database when the library opens.
 write(path.join(first.root,'execution','RUN-1.json'),JSON.stringify({text:'An older tool result'}));
 write(path.join(first.root,'games','g-older','game.json'),JSON.stringify({id:'g-older',title:'Older game',blurb:'',color:'#c8553d',ideas:['make a game'],createdAt:1,updatedAt:2,version:2}));
 write(path.join(first.root,'games','g-older','game.html'),'<canvas>v2</canvas>');
 write(path.join(first.root,'games','g-older','versions','1.html'),'<canvas>v1</canvas>');
 const reviewID=crypto.randomUUID().toUpperCase();
 write(path.join(first.root,'mail','reviews.json'),JSON.stringify({version:1,reviews:{[reviewID]:{draft:{from:'me@example.com',to:'alex@example.com',subject:'Hi',body:'Saved draft'},backend:path.join(first.root,HERMES),createdAt:3,attempted:false,confirmed:false}}}));
 write(path.join(first.root,'youtube.json'),JSON.stringify({videos:[{id:'dQw4w9WgXcQ',title:'A video'}],seconds:12}));
 write(path.join(first.root,'agent','private','codex',TASK,'task.json'),JSON.stringify({id:TASK,title:'Calculator',createdAt:'2026-10-05T00:00:00Z',status:'completed',summary:'A calculator',files:['index.html'],instructions:'Open index.html'}));
 write(path.join(first.root,'agent','private','codex',TASK,'files','index.html'),'<button>=</button>');
 const a=first.setup();
 const ledger=a.store.ledger();
 assert.deepEqual(ledger.payload('RUN-1'),{text:'An older tool result'},'execution payloads move in');
 assert.equal(ledger.madeGamePage('g-older'),'<canvas>v2</canvas>','made games move in');
 assert.deepEqual(ledger.madeGameVersions('g-older'),[{version:1,html:'<canvas>v1</canvas>'}],'with their earlier versions');
 assert(Object.keys(ledger.mailReviews()).includes(reviewID),'email drafts move in');
 assert.equal(ledger.codingTask(TASK)?.files['index.html'],'<button>=</button>','Codex tasks move in with their files');
 assert.equal(a.store.worldSetting('youtube')?.seconds,12,'the YouTube queue moves in');
 for(const file of ['execution','games','mail/reviews.json','youtube.json'])assert(fs.existsSync(path.join(first.root,file+'.before-database'))&&!fs.existsSync(path.join(first.root,file)),file+' stays only as a safety copy');
 assert.equal(a.preferences.get('worldlet.companionName'),'Pip');
 assert.equal(ledger.setting('preferences')?.['worldlet.companionName'],'Pip','World preferences move into the database');
 const local=JSON.parse(fs.readFileSync(path.join(first.root,'preferences.json'),'utf8'));
 assert(!('worldlet.companionName' in local)&&local['worldlet.music.volume']===0.5,'this computer keeps only its own preferences in preferences.json');
 pass('files kept beside the database (payloads, games, drafts, YouTube, Codex tasks, World preferences) move into world.sqlite once');

 // The rest of a lived-in World.
 a.store.ingest({title:'Kept',text:'Kept original',origin:'note',externalId:'kept'});
 ledger.put('items','I1',{id:'I1',title:'An item',provider:'note'});
 ledger.record('world.note','',{text:'Something happened'});
 ledger.addCompanionTurns('fox',[{id:'T1',session:'s',role:'user',text:'Hello Fox',createdAt:'2026-10-05T00:00:00Z'},{id:'T2',session:'s',role:'assistant',text:'Hello',createdAt:'2026-10-05T00:00:01Z'}]);
 ledger.replaceCompanionViews([{place:'home',reply:'Hello'}]);
 ledger.saveWidget('W1',{id:'W1',title:'A moment'},{html:'<p>widget</p>',state:{ticked:[1]}});
 ledger.saveOngoing([{id:'O1',name:'A thing'}]);
 ledger.saveArtifacts([{id:'art-abcdefghijkl',kind:'answer',title:'A table',body:'| a | b |',updatedAt:3}]);
 ledger.changeBrowserVisits([],[{url:'https://example.com/',title:'Example',text:'Example text',visitedAt:1}]);
 ledger.replaceBrought('pi',{plan:{'SKILL.md':'# Plan'}},[{name:'news'}]);
 ledger.saveCompanionStored('private','profile',{name:'Pip'});
 ledger.saveSetting('overlay',{moved:['home']});
 writeAgentSetting(first.root,'model-source',{version:1,id:'local-codex'});
 // Website recordings past the old 120 MB limit: a whole World now travels.
 const body='x'.repeat(1024*1024);
 ledger.recordWeb([{id:'V1',site:'example.com',url:'https://example.com/',title:'Example',applet:'',startedAt:1,endedAt:2}],
  Array.from({length:130},(_,at)=>({visit:'V1',at,kind:'network',url:'https://example.com/',meta:{},body})));
 a.preferences.set('worldlet.spokenVoice','Ava');
 a.preferences.set('worldlet.podcast.bookmarks.v1',{show:{seconds:30}});
 // An email draft, a made game and a coding task saved by their modules, and an Order.
 const reviews=new MailReviews(()=>a.store.ledger(),first.root);
 const draft=reviews.create({from:'me@example.com',to:'priya@example.com',subject:'Plan',body:'Reviewed draft'},path.join(first.root,HERMES));
 ledger.saveMadeGame('g-new',{id:'g-new',title:'New game',blurb:'',color:'#336699',ideas:['snake'],createdAt:4,updatedAt:4,version:1},'<canvas>snake</canvas>',3);
 ledger.saveOrder('a1b2c3d4',5,{id:'a1b2c3d4',said:'Make the tree taller',channel:'alpha'});
 ledger.saveSentMessage({id:'5f0c2a1e-msg',at:'2026-10-05T20:00:00.000Z',chat:'iMessage;-;+14155550100',to:'+14155550100',title:'+14155550100',text:'See you at 7',status:'sent'});
 // An Agent run: streamed text is saved within a second, before the run ends.
 const home=ExecutionJournal.register(path.join(first.root,HERMES),true,entry=>a.store.ledger().recordExecution(entry));
 await ExecutionJournal.run({action:'chat',text:'Hi'},home,async()=>({}),async observe=>{
  await observe({type:'delta',text:'Streamed '});await observe({type:'delta',text:'reply'});
  await new Promise(resolve=>setTimeout(resolve,1300));
  const saved=ledger.history({limit:50}).filter(row=>row.kind==='harness.event').map(row=>ledger.payload(String(row.body?.data?.payloadRef).slice('execution/'.length,-'.json'.length)) as Row);
  assert(saved.some(payload=>payload?.text==='Streamed reply'),'streamed text is in the database while the run is still going');
  await observe({type:'tool',id:'call-1',name:'world_search'});
  return {text:'Streamed reply'};
 });
 assert(!fs.existsSync(path.join(first.root,'execution')),'no payload files beside the database');
 pass('an Agent run keeps its payloads in world.sqlite, and streamed text is saved within a second');

 // Backup on the first computer.
 const file=path.join(scratch,'World.worldletbackup');
 const count=exportTo(a.host,file);
 assert(fs.statSync(file).size>120_000_000,'the backup holds more than the old 120 MB limit');
 assert.equal(fs.readFileSync(file).subarray(0,15).toString('latin1'),'SQLite format 3','format 2 is one SQLite file');
 a.store.closeLedger();

 // Restore into a fresh profile on another computer.
 const second=world('second',()=>({'worldlet.music.volume':0.1}));
 const b=second.setup();
 const archive=decode(b.host,file);
 assert.equal(archive.files.length,count);
 restore(b.host,archive);
 fs.rmSync(archive.directory!,{recursive:true,force:true});
 b.store.reload();b.store.ledger();
 const before=tables(path.join(first.root,'world.sqlite')),after=tables(path.join(second.root,'world.sqlite'));
 const configuration=(rows:Record<string,unknown[]>)=>rows.world_settings.map(row=>JSON.parse(String(row))).find(row=>row.key==='configuration');
 for(const rows of [before,after])rows.world_settings=rows.world_settings.filter(row=>JSON.parse(String(row)).key!=='configuration');
 assert.deepEqual(Object.keys(after),Object.keys(before),'the same tables');
 for(const name of Object.keys(before))assert.deepEqual(after[name],before[name],`table ${name} came back unchanged`);
 const restored=JSON.parse(configuration(tables(path.join(second.root,'world.sqlite'))).value);
 assert.deepEqual(restored.connections,[],'account grants do not travel');
 assert.deepEqual(b.store.state.sources.map((source:Row)=>source.title),['Kept']);
 for(const source of b.store.state.sources)assert.equal(fs.readFileSync(path.join(second.root,source.blob),'utf8'),fs.readFileSync(path.join(first.root,source.blob),'utf8'),'originals came back');
 pass(`every table of world.sqlite (${Object.keys(before).length}) and every original came back in a fresh profile`);

 assert.equal(b.preferences.get('worldlet.companionName'),'Pip');
 assert.equal(b.preferences.get('worldlet.textScale'),1.25);
 assert.equal(b.preferences.get('worldlet.spokenVoice'),'Ava');
 assert.deepEqual(b.preferences.get('worldlet.podcast.bookmarks.v1'),{show:{seconds:30}});
 assert.equal(b.preferences.get('worldlet.music.volume'),0.1,'the other computer keeps its own volume');
 assert.deepEqual(readAgentSetting(second.root,'model-source'),{version:1,id:'local-codex'});
 const restoredReviews=new MailReviews(()=>b.store.ledger(),second.root);
 assert.equal(restoredReviews.review(draft,path.join(second.root,HERMES)).draft.body,'Reviewed draft','an email draft still opens for the same Agent on the other computer');
 const tasks=new CodexTasks(()=>b.store.ledger());
 const listed=await tasks.execute('list_codex_tasks',{},path.join(second.root,'agent','private','codex'),'','');
 assert.deepEqual(listed.tasks.map((task:Row)=>task.title),['Calculator'],'Codex tasks came back');
 assert.equal(b.store.ledger().orders()[0]?.said,'Make the tree taller','Orders came back');
 assert.equal(b.store.ledger().sentMessages()[0]?.text,'See you at 7','Messages sent from Worldlet came back');
 pass('World preferences, Fox’s setup, email drafts, Codex tasks and Orders came back; the other computer kept its own preferences');
}catch(error){console.error('FAIL restore:',error);process.exitCode=1;}
// Windows cannot remove the scratch folder while a database in it is open.
finally{for(const store of opened)store.closeLedger();fs.rmSync(scratch,{recursive:true,force:true});}
