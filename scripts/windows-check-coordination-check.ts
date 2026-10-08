import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {coordinationScope,createWindowsCheckCoordinator,validateReady} from './windows-check-coordination.ts';

const now=Date.now(),iso=(offset:number)=>new Date(now+offset).toISOString();
const identity={run:'run',invocation:'invocation',exeSha256:'EXE',dllSha256:'DLL'};
const request={...identity,stage:'activity',requestId:'request',requestedAt:iso(-1000)};
const lease={...identity,scope:coordinationScope,issuedAt:iso(-2000),expiresAt:iso(298000)};
const ready={...request,scope:coordinationScope,readyAt:iso(-500),expiresAt:lease.expiresAt,nativeCu:{success:true,workerPid:process.pid,evidence:'Native inventory succeeded in this worker.'}};
validateReady(request,lease,ready,now);
for(const key of ['run','invocation','exeSha256','dllSha256','scope']){
 assert.throws(()=>validateReady(request,{...lease,[key]:'other'},ready,now));
 assert.throws(()=>validateReady(request,lease,{...ready,[key]:'other'},now));
}
for(const patch of [{expiresAt:iso(0)},{issuedAt:iso(1)},{issuedAt:iso(-300000)},{expiresAt:'invalid'}])
 assert.throws(()=>validateReady(request,{...lease,...patch},ready,now));
for(const patch of [{readyAt:iso(-1500)},{readyAt:iso(1)},{expiresAt:iso(0)},{expiresAt:iso(299000)},{requestId:'stale'},{stage:'smoke'},{nativeCu:{success:false}},{nativeCu:{success:true,workerPid:0,evidence:'x'}}])
 assert.throws(()=>validateReady(request,lease,{...ready,...patch},now));
assert.throws(()=>validateReady(request,lease,ready,now+298000));
assert.throws(()=>validateReady(request,undefined,ready,now));
assert.equal(createWindowsCheckCoordinator('unused','unused',{}),null);
// IO orchestration uses Node as a harmless child: no native build, GUI or desktop input.
const root=mkdtempSync(path.join(os.tmpdir(),'worldlet-coordination-'));
try{
 const output=path.join(root,'dist');mkdirSync(output);
 // A copy of a Node that loads a shared libnode through @rpath (Homebrew's) cannot start away from its lib folder; a
 // link resolves to the real binary. Windows' node.exe is self-contained, and links there need extra rights.
 if(process.platform==='win32')writeFileSync(path.join(output,'Worldlet.exe'),readFileSync(process.execPath),{mode:0o755});
 else symlinkSync(process.execPath,path.join(output,'Worldlet.exe'));
 writeFileSync(path.join(output,'Worldlet.dll'),'fixture');
 const coordinator=createWindowsCheckCoordinator(root,output,{WORLDLET_WINDOWS_CHECK_COORDINATE:'1',WORLDLET_WINDOWS_CHECK_RUN:'test'})!;
 const gate=JSON.parse(readFileSync(path.join(root,'.worldlet-task/windows-check/current.json'),'utf8'));
 async function stage(name:string,code:number){
  const pending=coordinator.run(name,path.join(output,'Worldlet.exe'),['-e',`console.log('fixture');process.exit(${code})`],process.env);
  const req=JSON.parse(readFileSync(path.join(gate.directory,'desktop-request.json'),'utf8'));
  const at=new Date().toISOString(),expiresAt=new Date(Date.now()+60000).toISOString();
  writeFileSync(path.join(gate.directory,'cu-lease.json'),JSON.stringify({...gate,issuedAt:at,expiresAt}));
  writeFileSync(path.join(gate.directory,'cu-ready.json'),JSON.stringify({...req,scope:coordinationScope,readyAt:at,expiresAt,nativeCu:ready.nativeCu}));
  return pending;
 }
 await stage('activity',0);
 assert.ok(JSON.parse(readFileSync(path.join(gate.directory,'activity-host-started.json'),'utf8')).pid>0);
 await assert.rejects(stage('smoke',7),/failed \(7\)/);
 coordinator.finish(false);
 assert.equal(JSON.parse(readFileSync(path.join(gate.directory,'finished.json'),'utf8')).success,false);
 assert.match(readFileSync(path.join(gate.directory,'activity.stdout.log'),'utf8'),/fixture/);
}finally{rmSync(root,{recursive:true,force:true});}
console.log('PASS Windows check coordination: identity, finite lease, stage freshness, native evidence, opt-in and child exit propagation.');
