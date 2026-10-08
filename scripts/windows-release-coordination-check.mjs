import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareReleaseCoordination,validateBinding,gateEnvironment} from './windows-release-coordination.mjs';
import {withTempDir} from './test-temp.ts';

await withTempDir('worldlet-release-cu-',async root=>{
 const expected=prepareReleaseCoordination(root,'windows-release','a'.repeat(40),{run:'release-run',issue:627});
 const discovery=JSON.parse(fs.readFileSync(path.join(root,'.worldlet-task/windows-check/current.json'),'utf8'));
 assert.deepEqual(discovery,expected);assert.equal(discovery.state,'preparing');
 assert.equal(discovery.exeSha256,undefined); // Never claim pre-build artifact identity.
 const now=Date.now(),binding={...expected,authorized:true,state:'running',workerRun:'cu-run',workerPid:process.pid,
  issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
 assert.equal(validateBinding(expected,binding,now,()=>true),binding);
 assert.throws(()=>validateBinding(expected,null,now),/absent/);
 assert.throws(()=>validateBinding(expected,binding,now,()=>false),/live worker/);
 for(const key of ['run','issue','source','invocation','directory','role'])
  assert.throws(()=>validateBinding(expected,{...binding,[key]:'wrong'},now,()=>true),/mismatch/);
 for(const patch of [{authorized:false},{state:'idle'},{workerRun:''},{workerPid:0}])
  assert.throws(()=>validateBinding(expected,{...binding,...patch},now,()=>true),/active run/);
 for(const patch of [{expiresAt:new Date(now).toISOString()},{issuedAt:new Date(now+1).toISOString()},
  {expiresAt:new Date(now+300001).toISOString()},{expiresAt:'bad'}])
  assert.throws(()=>validateBinding(expected,{...binding,...patch},now,()=>true),/expired or invalid/);
 const base={PATH:'unchanged',WORLDLET_SETUP_PYTHON:'configured-python',WORLDLET_TOOLS_PYTHON:'tools-python',
  WORLDLET_WINDOWS_CHECK_COORDINATE:'1',WORLDLET_WINDOWS_CHECK_RUN:'stale',worldlet_windows_check_release:'stale'};
 const clean={PATH:'unchanged',WORLDLET_SETUP_PYTHON:'configured-python',WORLDLET_TOOLS_PYTHON:'tools-python'};
 for(const command of ['ci','check','test:mac','test:windows'])assert.deepEqual(gateEnvironment(base,command,null),clean);
 assert.deepEqual(gateEnvironment(base,'check',expected),clean);
 assert.throws(()=>gateEnvironment(base,'test:electron',expected),/absent/);
 fs.writeFileSync(path.join(expected.directory,'cu-binding.json'),JSON.stringify(binding));
 assert.deepEqual(gateEnvironment(base,'test:electron',expected),{...clean,WORLDLET_WINDOWS_CHECK_COORDINATE:'1',
  WORLDLET_WINDOWS_CHECK_RUN:expected.run,WORLDLET_WINDOWS_CHECK_RELEASE:path.join(expected.directory,'release.json'),
  WORLDLET_WINDOWS_CHECK_WORKER_PID:String(process.pid),WORLDLET_WINDOWS_CHECK_WORKER_RUN:binding.workerRun});
 assert.equal(base.WORLDLET_WINDOWS_CHECK_RUN,'stale');
 assert.equal(prepareReleaseCoordination(root,'mac-release','x',undefined),null);
 assert.throws(()=>prepareReleaseCoordination(root,'mac-release','a'.repeat(40),{run:'r',issue:627}),/Invalid/);
 assert.throws(()=>prepareReleaseCoordination(root,'windows-release','wrong',{run:'r',issue:627}),/Invalid/);
});
console.log('PASS release CU binding: early discovery, active identity, liveness, expiry and command-scoped environment.');
