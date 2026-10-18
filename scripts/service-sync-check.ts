import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createServicePresets} from '../platform/electron/src/modules/sources/service-presets.ts';
import {createServiceSync,SERVICE_SYNC_BUCKETS} from '../platform/electron/src/modules/sources/service-sync.ts';
import {finishServiceSyncPage,serviceSyncPage,SERVICE_SYNC_LIMITS} from '../core/accounts/index.ts';
import {localDeletionRecord,localDeletionRequest} from '../core/items/local-deletion.ts';
import {roomDenied,ROOM_DENIED_MESSAGE} from '../contracts/web-world.ts';
import type {ServiceRead} from '../contracts/services.ts';

// All providers and account identities here are synthetic. Real SQLite + the shared scheduler/claim path; no network.
const record=(id:string,title=id)=>({id,title,url:'https://example.com/record/'+id,fields:{count:1}});
const page=(request:ServiceRead,ids:string[],cursor?:string)=>({provider:request.provider,operation:request.operation,scope:'Synthetic bounded records',records:ids.map(id=>record(id)),...cursor?{cursor}:{}});
await withTempDir('worldlet-service-sync-',async dir=>{
 let ledger=new WorldLedger(path.join(dir,'world')),clock=Date.now()/1000,available=true,binding='synthetic-account',version='1';
 const asked:ServiceRead[]=[];
 let respond:(request:ServiceRead,signal:AbortSignal)=>Promise<unknown>=async req=>page(req,['one']);
 const make=()=>createServiceSync({ledger:()=>available?ledger:null,authorize:()=>binding?{binding,version}:null,
  read:async(req,signal)=>{asked.push(req);return respond(req,signal);},now:()=>clock});
 let sync=make();
 const save=(id:string,provider='github',read:object={operation:'search',query:'repo:example/app is:pr'})=>createServicePresets({ledger:()=>ledger}).handle({operation:'save',preset:{id,name:id,provider,read}});
 const configure=(enabled=true)=>sync.handle({operation:'configure',id:'prs',enabled,intervalMinutes:15});
 const job=()=>ledger.value('service-sync-jobs','prs')!;
 const snapshot=()=>ledger.value('service-sync-snapshots','prs');
 const checkpoint=()=>ledger.value('service-sync-pages','prs');
 save('prs');
 assert.equal(await sync.tick(),false);assert.equal(asked.length,0,'saving presets does not schedule collection');
 assert.throws(()=>sync.handle({operation:'configure',id:'prs',intervalMinutes:15}),/whether to enable/);
 assert.throws(()=>sync.handle({operation:'configure',id:'prs',enabled:true,intervalMinutes:1}),/15–1440/);
 binding='';assert.throws(()=>configure(),/Connect this Service/);binding='synthetic-account';
 configure();
 respond=async req=>req.cursor?page(req,['one','two']):page(req,['one'],'2');
 assert.equal(await sync.tick(),true);assert.equal(snapshot(),null);assert.equal(checkpoint()!.cursor,'2');assert.equal(job().check.lastStatus,'partial');
 assert.equal(await sync.tick(),false,'page continuation honors the short shared schedule');
 // A different process reads the persisted page/checkpoint and finishes the traversal exactly once.
 ledger.close();ledger=new WorldLedger(path.join(dir,'world'));sync=make();clock+=5;
 assert.equal(await sync.tick(),true);assert.equal(asked[1].cursor,'2');assert.equal(checkpoint(),null);
 assert.deepEqual(snapshot()!.records.map((r:any)=>r.id),['one','two']);assert.equal(snapshot()!.pages,2);
 assert.equal(job().check.lastStatus,'complete');assert.equal(snapshot()!.coverage,'bounded-reader');
 const good=JSON.stringify(snapshot());
 clock+=900;respond=async()=>{throw Error('429 rate limit; Authorization: synthetic-private-value');};
 assert.equal(await sync.tick(),false);assert.equal(job().check.errorCode,'rate_limit');assert.equal(job().check.nextAt,clock+30);
 assert.equal(JSON.stringify(snapshot()),good,'failure keeps last-good data');
 assert.ok(!JSON.stringify(ledger.revisions('service-sync-jobs')).includes('synthetic-private-value'),'raw failures never persist');
 assert.equal(await sync.tick(),false,'failure backoff prevents busy retries');
 clock+=30;respond=async req=>page(req,['three']);assert.equal(await sync.tick(),true);
 assert.equal(job().check.failures,undefined);assert.deepEqual(snapshot()!.records.map((r:any)=>r.id),['three']);
 assert.equal(ledger.revisions('service-sync-snapshots').length,1,'snapshots and checkpoints are bounded current values');
 // Failure in a later page must not move its cursor; a retry resumes it, not the first page.
 clock+=900;respond=async req=>page(req,['four'],'2');assert.equal(await sync.tick(),true);clock+=5;
 respond=async()=>{throw Error('offline');};assert.equal(await sync.tick(),false);assert.equal(checkpoint()!.cursor,'2');
 clock+=30;respond=async req=>page(req,['five']);assert.equal(await sync.tick(),true);
 assert.equal(asked.at(-1)!.cursor,'2');assert.deepEqual(snapshot()!.records.map((r:any)=>r.id),['four','five']);
 // Duplicate workers: the second cannot dispatch a read while the first owns the ledger lease.
 let finish!:(value:unknown)=>void,entered!:()=>void;
 const enteredPromise=new Promise<void>(resolve=>entered=resolve);
 clock+=900;respond=req=>new Promise(resolve=>{finish=resolve;entered();});
 const pending=sync.tick();await enteredPromise;const second=make();
 assert.equal(await second.tick(),false);finish(page(asked.at(-1)!,['six']));assert.equal(await pending,true);
 // Pause during a read revokes the writer; an eventual response cannot change data or configuration.
 clock+=900;let enterPause!:()=>void;const pausedRead=new Promise<void>(resolve=>enterPause=resolve);
 respond=req=>new Promise(resolve=>{finish=resolve;enterPause();});const late=sync.tick();await pausedRead;
 const kept=JSON.stringify(snapshot());configure(false);finish(page(asked.at(-1)!,['forbidden']));await late;
 assert.equal(job().check.enabled,false);assert.equal(JSON.stringify(snapshot()),kept);assert.equal(await sync.tick(),false);
 assert.throws(()=>sync.handle({operation:'read',id:'prs'}),/paused/);
 // Resume reuses good data, but edits/account changes require an explicit reconfiguration and clear checkpoints.
 configure();save('prs','github',{operation:'search',query:'repo:example/other is:issue'});
 assert.equal(await sync.tick(),false);assert.throws(()=>sync.handle({operation:'read',id:'prs'}),/changed/);
 configure();assert.equal(snapshot(),null);binding='another-account';assert.equal(await sync.tick(),false);
 configure();assert.equal(checkpoint(),null);
 // Disconnect/consent loss while reading: no late result can be published.
 let disconnected!:()=>void;const duringRead=new Promise<void>(resolve=>disconnected=resolve);
 respond=req=>new Promise(resolve=>{finish=resolve;disconnected();});const changed=sync.tick();await duringRead;
 version='2';finish(page(asked.at(-1)!,['wrong-account']));assert.equal(await changed,false);assert.equal(snapshot(),null);
 configure();available=false;assert.equal(await sync.tick(),false);available=true;
 respond=async req=>page(req,['allowed']);assert.equal(await sync.tick(),true);
 // Crash recovery: persisted running state can be reclaimed only after the shared lease expires.
 clock+=900;const owner='service-sync:prs',task=owner+':check';
 assert.equal(ledger.claimRuntimeTask(task,owner,'source-io','interrupted'),true);
 ledger.put('service-sync-jobs','prs',{...job(),check:{...job().check,lastStatus:'running',nextAt:clock+900}});
 assert.equal(await make().tick(),false);
 const old=ledger.value('runtime-tasks',task)!;ledger.deleteRuntimeRecord('runtime-tasks',task);
 ledger.put('runtime-tasks',task,{...old,leaseUntil:Date.now()/1000-1});
 assert.equal(await make().tick(),true);assert.equal(ledger.value('runtime-runs','interrupted')!.status,'interrupted');
 // Deletes clean every state bucket, do not recreate state on a stale response, and leave other providers alone.
 for(const bucket of SERVICE_SYNC_BUCKETS){
  assert.ok(localDeletionRequest({action:'deleteSourceData',provider:'github'}).buckets.includes(bucket));
  assert.equal(localDeletionRecord({provider:'github',bucket,key:'prs',record:{provider:'github'}}),null);
  assert.deepEqual(localDeletionRecord({provider:'posthog',bucket,key:'prs',record:{provider:'github'}}),{provider:'github'});
 }
 sync.handle({operation:'delete',id:'prs'});for(const bucket of SERVICE_SYNC_BUCKETS)assert.equal(ledger.value(bucket,'prs'),null);
 assert.equal(await sync.tick(),false);
 // All currently supported Service preset readers use this same adapter and persistence path.
 for(const [id,provider,read] of [['metrics','posthog',{operation:'query',query:'SELECT 1'}],['traffic','cloudflare',{operation:'read',id:'workers'}]] as const){
  save(id,provider,read);sync.handle({operation:'configure',id,enabled:true,intervalMinutes:15});
  assert.equal(await sync.tick(),true);assert.equal(ledger.value('service-sync-snapshots',id)!.provider,provider);
 }
 assert.equal(roomDenied({action:'serviceSync',operation:'configure'}),ROOM_DENIED_MESSAGE);
 sync.stop();second.stop();ledger.close();
});
// Provider reply/cursor validation, pagination loops, unapproved operations and capacity fail closed.
const request:ServiceRead={provider:'github',operation:'search',query:'repo:example/app'};
for(const invalid of [{...page(request,[]),provider:'posthog'},{...page(request,[]),operation:'write'}, {...page(request,[]),cursor:{}}, {...page(request,[]),records:[{...record('x'),fields:{bad:NaN}}]}])assert.throws(()=>serviceSyncPage(request,invalid),/Invalid/);
const syntheticJob:any={id:'prs',provider:'github',check:{id:'prs',provider:'prs',enabled:true,intervalMinutes:15,nextAt:0}};
assert.throws(()=>finishServiceSyncPage(syntheticJob,{cursor:'2',seen:['2'],pages:1,records:[],startedAt:0},page(request,[],'2'),10),/repeated/);
assert.throws(()=>finishServiceSyncPage(syntheticJob,{seen:[],pages:SERVICE_SYNC_LIMITS.pages-1,records:[],startedAt:0},page(request,[],'next'),10),/limit/);
console.log('PASS Service sync: explicit scheduling, real SQLite, restart/cursors/dedup, leases, retry/last-good, pause/account/consent guards, bounded storage, deletion and three mock Services.');

// Real bounded Service adapter with a synthetic vault + mock HTTP, even when an execution home is registered.
const {ServiceSource}=await import('../platform/electron/src/modules/sources/service-source.ts');
const {collectServicePage}=await import('../platform/electron/src/modules/sources/service-collection.ts');
const {ExecutionJournal}=await import('../platform/electron/src/modules/agent-runtime/journal.ts');
await withTempDir('worldlet-service-collector-',async dir=>{
 const entries:unknown[]=[],values=new Map<string,string>();let fail=false,calls=0;
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 ExecutionJournal.register(dir,true,entry=>{entries.push(entry);return true;});
 const source=new ServiceSource({vault,fetch:(async(input:any,init:any)=>{
  calls++;assert.equal(init.redirect,'manual');
  if(String(input).endsWith('/query/')){
   if(fail)throw Error('offline synthetic-private-provider-error');
   return new Response(JSON.stringify({columns:['count'],results:[[12]]}));
  }
  return new Response(JSON.stringify({id:1,name:'Synthetic project'}));
 }) as typeof fetch});
 await source.connect('posthog','phx_'+'Synthetic'.repeat(5),{host:'https://eu.posthog.com',project:'1'});
 const readers={services:source,mcp:{read:async()=>{throw Error('Unexpected MCP fallback');}}};
 const request:ServiceRead={provider:'posthog',operation:'query',query:'SELECT 12 AS count'};
 assert.equal((await collectServicePage(readers,request,new AbortController().signal)).records[0].fields.count,12);
 fail=true;await assert.rejects(collectServicePage(readers,request,new AbortController().signal),/Could not reach PostHog/);
 assert.deepEqual(entries,[],'scheduled collection keeps no conversational copies of payloads, queries or failures');
 const before=calls;
 await assert.rejects(collectServicePage(readers,{...request,operation:'write'} as any,new AbortController().signal));
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(collectServicePage(readers,request,cancelled.signal),/cancelled/);
 assert.equal(calls,before,'invalid operations/aborted requests cannot reach HTTP');
 ExecutionJournal.register(dir,false,()=>true);
});
await withTempDir('worldlet-sync-recovery-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));let clock=Date.now()/1000,calls=0;
 let read:(req:ServiceRead,signal:AbortSignal)=>Promise<unknown>=async req=>{calls++;return page(req,['kept']);};
 const sync=createServiceSync({ledger:()=>ledger,authorize:()=>({binding:'mock',version:'1'}),read:(req,signal)=>read(req,signal),now:()=>clock,timeoutMs:20});
 const presets=createServicePresets({ledger:()=>ledger});
 const setup=(id:string)=>{presets.handle({operation:'save',preset:{id,name:id,provider:'github',read:{operation:'search',query:'repo:example/app'}}});sync.handle({operation:'configure',id,enabled:true,intervalMinutes:15});};
 setup('a');setup('b');
 assert.ok(ledger.claimRuntimeTask('service-sync:a:check','service-sync:a','source-io','other-worker'));
 const a=ledger.value('service-sync-jobs','a')!;ledger.put('service-sync-jobs','a',{...a,check:{...a.check,lastStatus:'running'}});
 assert.equal(await sync.tick(),true);assert.equal(calls,1);assert.ok(ledger.value('service-sync-snapshots','b'),'leased job does not starve other due providers');
 sync.handle({operation:'delete',id:'a'});
 clock+=900;
 const kept=JSON.stringify(ledger.value('service-sync-snapshots','b'));
 const original=ledger.put.bind(ledger);let inject=true;
 ledger.put=(bucket,id,value)=>{if(bucket==='service-sync-snapshots'&&inject){inject=false;throw Error('synthetic disk write failure');}original(bucket,id,value);};
 assert.equal(await sync.tick(),false);assert.equal(JSON.stringify(ledger.value('service-sync-snapshots','b')),kept,'snapshot write failure rolls back deletion and checkpoint changes');
 ledger.put=original;clock+=30;assert.equal(await sync.tick(),true);
 clock+=900;read=async()=>new Promise(()=>{});
 // The sync's own timeout timer is unref'd: hold the loop open until the tick settles, however slow the machine.
 const keepAlive=setInterval(()=>{},1000);assert.equal(await sync.tick(),false);clearInterval(keepAlive);
 assert.equal(ledger.value('service-sync-jobs','b')!.check.errorCode,'timeout');
 // Owner restarts an expired pagination traversal without discarding the last-good snapshot.
 sync.handle({operation:'restart',id:'b'});read=async req=>page(req,['part'],'old-cursor');assert.equal(await sync.tick(),true);clock+=5;
 assert.equal(await sync.tick(),false);assert.equal(ledger.value('service-sync-pages','b')!.cursor,'old-cursor');
 sync.handle({operation:'restart',id:'b'});assert.equal(ledger.value('service-sync-pages','b'),null);assert.ok(ledger.value('service-sync-snapshots','b'));
 let entered!:()=>void,finish!:(value:unknown)=>void;const gate=new Promise<void>(resolve=>entered=resolve);
 read=req=>new Promise(resolve=>{finish=resolve;entered();});const pending=sync.tick();await gate;
 presets.handle({operation:'delete',id:'b'});finish(page(request,['late']));assert.equal(await pending,false);
 for(const bucket of SERVICE_SYNC_BUCKETS)assert.equal(ledger.records(bucket).length,0,'preset deletion atomically removes all sync data and rejects late output');
 sync.stop();ledger.close();
});
console.log('PASS Service sync recovery: real mock-HTTP reader without payload history, fairness, atomic rollback, timeout, explicit cursor restart and preset deletion.');

// Use the actual consent setter: revoke then restore during a read must not re-admit the older response.
await withTempDir('worldlet-sync-consent-',async dir=>{
 // This host module uses build-time JSON imports, so load it through the same bundler as the host.
 const {build}=await import('esbuild'),{writeFileSync}=await import('node:fs'),{createRequire}=await import('node:module');
 const bundled=await build({stdin:{contents:"export {WorldStore} from './platform/electron/src/store/world-store.ts'; export {Preferences} from './platform/electron/src/preferences.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false});
 const moduleFile=path.join(dir,'store.cjs');writeFileSync(moduleFile,bundled.outputFiles[0].text);
 const {WorldStore,Preferences}=createRequire(import.meta.url)(moduleFile);

 const store=new WorldStore(dir,Preferences.at(dir),{appName:'Worldlet Check',platform:'macos',capabilities:()=>({}),mockGoogleAvailable:false});
 store.setCloudConsent(true);const initial=store.attentionEpoch;store.setCloudConsent(true);assert.equal(store.attentionEpoch,initial);
 const ledger=store.ledger();createServicePresets({ledger:()=>ledger}).handle({operation:'save',preset:{id:'prs',name:'PRs',provider:'github',read:{operation:'search',query:'repo:example/app'}}});
 let entered!:()=>void,finish!:(value:unknown)=>void;const gate=new Promise<void>(resolve=>entered=resolve);
 const sync=createServiceSync({ledger:()=>store.state.cloudConsent===true?ledger:null,authorize:()=>({binding:'synthetic',version:String(store.attentionEpoch)}),
  read:req=>new Promise(resolve=>{finish=resolve;entered();})});
 sync.handle({operation:'configure',id:'prs',enabled:true,intervalMinutes:15});const pending=sync.tick();await gate;
 store.setCloudConsent(false);store.setCloudConsent(true);assert.equal(store.attentionEpoch,initial+2);
 finish(page(request,['old-response']));assert.equal(await pending,false);assert.equal(ledger.value('service-sync-snapshots','prs'),null);
 sync.stop();store.closeLedger();
});
console.log('PASS Service sync: revoking and restoring consent rejects the prior in-flight response.');
