import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {DeferredDevUpdate,failureDetail,pullRequestNumber} from './dev-deferred-update.ts';
// The Dev Apply capsule shows the squash merge's PR number, read from the commit subject.
assert.equal(pullRequestNumber('Ship Rive Fox to every channel (#1526)'),1526);
assert.equal(pullRequestNumber('Revert "x (#12)" and fix'),undefined);assert.equal(pullRequestNumber('Local commit'),undefined);
// A failed build step names its real error, not only "exited 1" (a missing dependency after #1470).
assert.equal(failureDetail('✘ [ERROR] Could not resolve "qrcode-generator"\n\n    ui/companion/companion-phone.ts:1:19:\n      1 │ import qrcode from \'qrcode-generator\';\n\n/x/node_modules/esbuild/lib/main.js:1467\n  let error = new Error(text);\nError: Build failed with 1 error:\n'),': Could not resolve "qrcode-generator" (ui/companion/companion-phone.ts:1:19)');
assert.equal(failureDetail("node:internal/modules/run_main:123\n    triggerUncaughtException(\n    ^\nError [ERR_MODULE_NOT_FOUND]: Cannot find package 'x' imported from /a.ts\n    at foo\n\nNode.js v22.22.1\n"),": Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'x' imported from /a.ts");
assert.equal(failureDetail(''),'');
const root=await mkdtemp(path.join(tmpdir(),'dev-deferred-'));
const app=path.join(root,'live/Worldlet Dev.app'),web=path.join(root,'dist/WorldletWeb');
const put=async(p:string,v:string)=>{await mkdir(p,{recursive:true});await writeFile(path.join(p,'version'),v);};
const version=(p:string)=>readFile(path.join(p,'version'),'utf8');
try{
 await put(app,'old-native');await put(web,'old-web');await writeFile(path.join(web,'.dev-reload'),'old-marker');
 const update=new DeferredDevUpdate(app,web);await update.restore();
 const calls:string[]=[];
 await update.prepare('a'.repeat(40),async(a,w)=>{calls.push('build');await put(a,'new-native');await put(w,'new-web');},'2026-09-30T11:40:00-07:00',1526,4);
 const id=update.state.candidate!.id;
 assert.equal(update.state.candidate!.committedAt,'2026-09-30T11:40:00-07:00','the candidate carries its commit time for the Dev footer');
 assert.equal(update.state.candidate!.pr,1526,'the candidate carries its PR number');
 assert.equal(update.state.candidate!.behind,4,'the candidate carries how many commits the running app is behind');
 assert.equal(await version(app),'old-native');assert.equal(await version(web),'old-web');assert.equal(await readFile(path.join(web,'.dev-reload'),'utf8'),'old-marker');
 assert.deepEqual(calls,['build']);assert.equal(await update.requested(),null,'ready is never an implicit Apply');
 // Adoption reads the prepared candidate but has no stop/swap/reload effect.
 await update.requestCurrent();const adopted=new DeferredDevUpdate(app,web);await adopted.restore();assert.equal(await adopted.requested(),null,'adoption must discard pending requests from a previous watcher');assert.equal(adopted.state.candidate?.id,id);assert.equal(await version(web),'old-web');
 await assert.rejects(adopted.apply('b'.repeat(24),async()=>{throw Error('must not stop');},async()=>{}),/changed/);
 assert.equal(await version(app),'old-native');
 // Failed preparation leaves the ready candidate and live pair untouched.
 await assert.rejects(adopted.prepare('b'.repeat(40),async()=>{throw Error('compiler error');}));assert.equal(adopted.state.candidate?.id,id);assert.equal(await version(web),'old-web');
 // Only a matching explicit Apply request causes stop and pair replacement.
 await adopted.requestCurrent();assert.equal(await adopted.requested(),id);assert.equal(await adopted.requested(),null,'request consumed once');
 await adopted.apply(id,async()=>{calls.push('stop');assert.equal(await version(app),'old-native');assert.equal(await version(web),'old-web');},async()=>{calls.push('launch');assert.equal(await version(app),'new-native');assert.equal(await version(web),'new-web');});
 assert.deepEqual(calls,['build','stop','launch']);assert.equal(adopted.state.candidate,null);
 assert.equal(adopted.state.current,'a'.repeat(40),'Apply records the running revision for the next commits-behind count');
 const restarted=new DeferredDevUpdate(app,web);await restarted.restore();assert.equal(restarted.state.current,'a'.repeat(40),'the running revision survives a watcher restart');
 // Reported launch failure restores both native and web, not a mixed version.
 await adopted.prepare('c'.repeat(40),async(a,w)=>{await put(a,'bad-native');await put(w,'bad-web');});
 const bad=adopted.state.candidate!.id;let starts=0;
 await assert.rejects(adopted.apply(bad,async()=>{},async()=>{if(++starts===1)throw Error('launch error');}),/launch error/);
 assert.equal(await version(app),'new-native');assert.equal(await version(web),'new-web');assert.equal(starts,2);
 // Offline/expired state never accepts the CLI bootstrap Apply request.
 adopted.state.online=false;await adopted.publish();await assert.rejects(adopted.requestCurrent(),/active Dev watcher/);
 adopted.state.online=true;adopted.state.applying=true;await adopted.publish();await assert.rejects(adopted.requestCurrent(),/active Dev watcher/);adopted.state.applying=false;
 for(const observedAt of ['invalid',new Date(Date.now()+60000).toISOString(),new Date(Date.now()-60000).toISOString()]){
  await writeFile(adopted.statusFile,JSON.stringify({...adopted.state,observedAt}));await assert.rejects(adopted.requestCurrent(),/active Dev watcher/);
 }
 // Newest safe candidate replaces deferred builds; applied backups remain available.
 const recovery=adopted.paths(id);assert.equal(await version(recovery.previousApp),'old-native');
 await adopted.prepare('d'.repeat(40),async(a,w)=>{await put(a,'next-native');await put(w,'next-web');});
 await assert.rejects(access(adopted.paths(bad).base),'superseded unused candidate removed');
 const deferred=adopted.state.candidate!.id;
 await put(adopted.paths(deferred).previousWeb,'recovery-evidence');
 await adopted.prepare('e'.repeat(40),async(a,w)=>{await put(a,'latest-native');await put(w,'latest-web');});
 assert.equal(await version(adopted.paths(deferred).previousWeb),'recovery-evidence','never delete recovery backups while coalescing');
 assert.equal(await version(recovery.previousApp),'old-native');
 assert.equal(await version(app),'new-native');assert.equal(await version(web),'new-web','coalescing never publishes');
 await assert.rejects(adopted.apply(deferred,async()=>{throw Error('must not stop');},async()=>{}),/changed/);
 assert.throws(()=>adopted.paths('../live'),/Invalid/);
 console.log('PASS prepare/adopt isolation; exact-ID Apply; offline/invalid/expired/busy refusal; pair rollback; candidate coalescing preserves recovery backups');
}finally{await rm(root,{recursive:true,force:true});}
