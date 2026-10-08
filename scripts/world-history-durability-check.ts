// Synthetic durability fixtures for the shared World history append contract (#689).
// The helpers mirror the native adapters: payload file first, then state + event in one transaction.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {worldEventAppend,worldHistoryQuery,worldHistoryPage,journalEntry,taskExecutionEvents,conversationEntries} from '../core/items/index.ts';
import {finishRuntimeTask} from '../core/scheduling/index.ts';
const views=readFileSync(new URL('../contracts/storage/world-views.sql',import.meta.url),'utf8');
const folder=mkdtempSync(join(tmpdir(),'worldlet-history-'));
const open=(name='world')=>{const db=new DatabaseSync(join(folder,name+'.sqlite'));db.exec('CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL);'+views);return db;};
let clock=1000,payloadDir=folder;
const append=(db:DatabaseSync,body:Record<string,any>,key:string)=>{const p=worldEventAppend({kind:body.kind,key,at:body.at,observedAt:++clock,body});db.prepare(p.sql).run(...p.values);};
const put=(db:DatabaseSync,bucket:string,id:string,value:unknown)=>db.prepare("INSERT INTO entries(at,kind,key,body) VALUES(0,?,?,?)").run('state.'+bucket,id,JSON.stringify(value));
const state=(db:DatabaseSync,bucket:string,id:string)=>{const r=db.prepare("SELECT body FROM entries WHERE kind=? AND key=? ORDER BY seq DESC LIMIT 1").get('state.'+bucket,id);return r?JSON.parse(String(r.body)):undefined;};
const count=(db:DatabaseSync,where='1')=>Number((db.prepare(`SELECT COUNT(*) n FROM entries WHERE kind NOT LIKE 'state.%' AND ${where}`).get() as {n:number}).n);
const page=(db:DatabaseSync,args:Record<string,unknown>)=>{const p=worldHistoryQuery(args);const rows=db.prepare(p.sql).all(...p.values).map(r=>({...r,body:JSON.parse(String(r.body))})) as Parameters<typeof worldHistoryPage>[0]['rows'];return worldHistoryPage({...p,rows});};
const tx=(db:DatabaseSync,work:()=>void)=>{db.exec('BEGIN');try{work();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
// Native ExecutionJournal.write: payload file, then one transaction; remove the file when the commit fails.
const journal=(db:DatabaseSync,input:Parameters<typeof journalEntry>[0],crash?:'before-commit')=>{
 const entry=journalEntry(input);const file=join(payloadDir,String(entry.event.data.payloadRef).replace('execution/','payload-'));
 writeFileSync(file,JSON.stringify(entry.payload));
 if(crash)return file;
 try{tx(db,()=>{if(entry.task)put(db,'runtime-tasks',entry.task.id,entry.task);if(entry.run)put(db,'runtime-runs',entry.run.id,entry.run);append(db,entry.event as any,input.runId);});}
 catch(e){unlinkSync(file);throw e;}
 return file;
};
// Native restart recovery (recoverRuntimeTasks): settle running journal tasks through shared Core, atomically.
const recover=(db:DatabaseSync,now:number)=>{
 const tasks=db.prepare("SELECT key FROM entries WHERE kind='state.runtime-tasks' GROUP BY key").all().map(r=>state(db,'runtime-tasks',String(r.key)));
 for(const task of tasks.filter(t=>t?.status==='running'))tx(db,()=>{
  const claim=finishRuntimeTask({task,run:state(db,'runtime-runs',task.runId),now,generation:0,status:'interrupted',nextAt:now,errorCode:'process_interrupted'});
  if(!claim)return;put(db,'runtime-tasks',claim.task.id,claim.task);put(db,'runtime-runs',claim.run.id,claim.run);
  for(const event of taskExecutionEvents(claim))append(db,event as any,claim.task.id);
 });
};
try {
 // Duplicate append: a retry of one identity is one row; equal content with distinct ids is two real events.
 let db=open();
 const event={version:1,id:'retry-1',at:500,kind:'world.action',actor:'user',data:{action:'open'}};
 append(db,event,'');append(db,event,'');
 assert.equal(count(db),1);
 append(db,{...event,id:'retry-2'},'');
 assert.equal(count(db),2);
 const stored=JSON.parse(String((db.prepare("SELECT body FROM entries WHERE kind='world.action' ORDER BY seq LIMIT 1").get() as {body:string}).body));
 assert.equal(stored.at,500);assert.equal(typeof stored.observedAt,'number');assert.notEqual(stored.observedAt,stored.at);
 assert.throws(()=>worldEventAppend({kind:'world.action',at:1,observedAt:1,body:{data:{}}}),/stable id/);
 assert.throws(()=>worldEventAppend({kind:'state.items',at:1,observedAt:1,body:{id:'x'}}),/kind/);

 // Crash between payload and ledger commit: the orphan payload is inert and no event is invented.
 journal(db,{id:'run-a-1',runId:'run-a',at:600,kind:'run.started',payload:{prompt:'synthetic'}});
 journal(db,{id:'run-a-2',runId:'run-a',at:601,kind:'harness.event',payload:{type:'delta',text:'first chunk'}});
 const orphan=journal(db,{id:'run-a-3',runId:'run-a',at:602,kind:'run.succeeded',payload:{ok:true}},'before-commit');
 assert.ok(existsSync(orphan));
 assert.equal(count(db,"json_extract(body,'$.runId')='run-a'"),2);
 assert.equal(state(db,'runtime-runs','run-a').status,'running');

 // Failed ledger write and state rollback: state and event commit together or not at all; the payload is removed.
 db.exec("CREATE TEMP TRIGGER fail_history BEFORE INSERT ON entries WHEN NEW.kind='run.failed' BEGIN SELECT RAISE(ABORT,'disk full'); END;");
 journal(db,{id:'run-b-1',runId:'run-b',at:700,kind:'run.started'});
 assert.throws(()=>journal(db,{id:'run-b-2',runId:'run-b',at:701,kind:'run.failed',startedAt:700,payload:{error:'synthetic'}}),/disk full/);
 assert.equal(state(db,'runtime-runs','run-b').status,'running');
 assert.equal(count(db,"json_extract(body,'$.id')='run-b-2'"),0);
 assert.ok(!existsSync(join(folder,'payload-run-b-2.json')));
 // Failed payload write: the adapter stops before the ledger, so no event references a missing write.
 payloadDir=join(folder,'missing');
 assert.throws(()=>journal(db,{id:'run-b-3',runId:'run-b',at:702,kind:'tool.requested',payload:{tool:'synthetic'}}),/ENOENT/);
 payloadDir=folder;
 assert.equal(count(db,"json_extract(body,'$.id')='run-b-3'"),0);
 assert.equal(state(db,'runtime-runs','run-b').status,'running');
 db.exec('DROP TRIGGER fail_history');

 // Truncated buffered stream: process ends with text still buffered and no terminal event.
 // Restart recovery settles the run once, and the page exposes the gap instead of claiming completeness.
 db.close();db=open();
 recover(db,800);recover(db,801);
 const gaps=page(db,{kind:'task.interrupted'}).events;
 assert.equal(gaps.length,2);
 assert.deepEqual(gaps.map(e=>e.id).sort(),['run-a:interrupted','run-b:interrupted']);
 for(const gap of gaps)assert.equal((gap.gap as {reason:string}).reason,'process-interrupted');
 assert.equal(state(db,'runtime-runs','run-a').status,'interrupted');
 assert.equal(count(db,"kind='harness.event'"),1,'recovery never rebuilds lost stream text');

 // Legacy rows: pre-contract bodies (no id/observedAt, possibly duplicated) stay readable and are marked.
 db.prepare("INSERT INTO entries(at,kind,key,body) VALUES(?,?,?,?)").run(900,'activity.page','',JSON.stringify({data:{title:'Legacy'}}));
 db.prepare("INSERT INTO entries(at,kind,key,body) VALUES(?,?,?,?)").run(901,'activity.page','',JSON.stringify({id:'dup',data:{title:'Legacy'}}));
 db.prepare("INSERT INTO entries(at,kind,key,body) VALUES(?,?,?,?)").run(902,'activity.page','',JSON.stringify({id:'dup',data:{title:'Legacy'}}));
 db.exec(views);
 const legacy=page(db,{kind:'activity.page'}).events;
 assert.equal(legacy.length,3);
 assert.ok(legacy.every(e=>e.legacy===true&&e.observedAt===null));
 assert.match(String(legacy.at(-1)!.id),/^legacy:\d+$/);

 // Restart paging and correlation: ids, outcomes and time fields survive reopen; cursors page without overlap.
 db.close();db=open();
 const first=page(db,{runId:'run-a',limit:2});
 assert.equal(first.events.length,2);assert.equal(first.hasMore,true);
 const rest=page(db,{runId:'run-a',limit:2,before:'nextBefore' in first?first.nextBefore:undefined});
 const ids=[...first.events,...rest.events].map(e=>e.id);
 assert.deepEqual(ids,['run-a:interrupted','run-a-2','run-a-1']);
 assert.ok(first.events.every(e=>typeof e.observedAt==='string'&&typeof e.at==='string'));
 assert.equal(first.events[0].kind,'task.interrupted');
 db.close();

 // A legacy identity cannot suppress the first v1 event; its rows remain untouched.
 let collision=open('legacy-collision');
 const legacyBody=JSON.stringify({id:'collision',data:{action:'open'}});
 for(const at of [10,11])collision.prepare('INSERT INTO entries(at,kind,key,body) VALUES(?,?,?,?)').run(at,'world.action','fixture',legacyBody);
 const originalLegacy=collision.prepare('SELECT * FROM entries ORDER BY seq').all();
 const appendCollision=(id='collision',kind='world.action',key='fixture',observedAt=0)=>{
  const plan=worldEventAppend({kind,key,at:20,observedAt,body:{id,data:{action:'open'}}});
  return collision.prepare(plan.sql).run(...plan.values).changes;
 };
 assert.equal(appendCollision(),1,'A legacy kind/key/id must not suppress a new v1 event');
 assert.equal(appendCollision('collision','world.action','fixture',30),0,'observedAt=0 still identifies the saved v1 event');
 assert.equal(appendCollision('distinct'),1,'Equal content with another id is a separate event');
 assert.equal(appendCollision('collision','world.other'),1,'Identity includes kind');
 assert.equal(appendCollision('collision','world.action','other'),1,'Identity includes key');
 collision.close();collision=open('legacy-collision');
 assert.equal(appendCollision('collision','world.action','fixture',40),0,'Retry remains idempotent after reopening the file');
 assert.deepEqual(collision.prepare('SELECT * FROM entries WHERE seq<=2 ORDER BY seq').all(),originalLegacy,'Legacy rows are not rewritten');
 const all=page(collision,{limit:10}).events;
 assert.equal(all.length,6);
 const saved=all.find(e=>e.kind==='world.action'&&e.key==='fixture'&&!e.legacy&&e.id==='collision')!;
 assert.equal(saved.at,new Date(20_000).toISOString());
 assert.equal(saved.observedAt,new Date(0).toISOString(),'Retry preserves the first observed time');
 assert.ok(all.filter(e=>Number(e.seq)<=2).every(e=>e.legacy===true&&e.observedAt===null));
 for(const ascending of [false,true]){
  const sequences:number[]=[];let cursor=ascending?0:undefined;
  while(true){
   const result=page(collision,{limit:2,...(ascending?{after:cursor}:{before:cursor})});
   sequences.push(...result.events.map(e=>Number(e.seq)));
   if(!result.hasMore)break;
   const next=Number(ascending?('nextAfter' in result?result.nextAfter:undefined):('nextBefore' in result?result.nextBefore:undefined));
   assert.ok(ascending?next>cursor!:cursor===undefined||next<cursor,'Paging must advance');cursor=next;
  }
  assert.deepEqual(sequences,ascending?[1,2,3,4,5,6]:[6,5,4,3,2,1],'Reopened pages preserve legacy and v1 rows without duplicates or omissions');
 }
 collision.close();

 // Scope isolation: private, setup and sample conversations live in separate ledgers; identity never crosses them.
 const scopes=['private','setup','sample'].map(scope=>({scope,db:open('conversation-'+scope)}));
 for(const {scope,db:ledger} of scopes)for(const entry of conversationEntries({id:'turn-1',requestId:'request-1',at:1000,scope,type:'user_message',text:'synthetic '+scope}))append(ledger,entry,'request-1');
 const retry=conversationEntries({id:'turn-1',requestId:'request-1',at:1000,scope:'sample',type:'user_message',text:'synthetic sample'});
 for(const entry of retry)append(scopes[2].db,entry,'request-1');
 for(const {scope,db:ledger} of scopes){
  const rows=page(ledger,{runId:'request-1',requestId:'request-1'}).events;
  assert.equal(rows.length,1);assert.equal((rows[0].body as {scope:string}).scope,scope);
  ledger.close();
  const reopened=open('conversation-'+scope);
  assert.deepEqual(page(reopened,{requestId:'request-1'}).events,rows,'Correlation queries stay within their reopened scope ledger');
  assert.equal(page(reopened,{requestId:'request-1',surfaceId:'missing'}).events.length,0,'Missing identifiers never match');
  reopened.close();
 }
 console.log('PASS World history appends are idempotent, atomic with state, and expose crash gaps after reopen');
} finally {rmSync(folder,{recursive:true,force:true});}
