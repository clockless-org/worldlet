// Worldlet's own tools Python (platform/electron/src/modules/media/tools-python.ts): whichever Agent Fox uses, local
// speech, coding sessions and the browser driver's relay run on a Python Worldlet sets up with its bundled uv, never an
// Agent's. One setup on first use (a pinned CPython, a venv with pip, the hash-pinned requirements, then a start
// check), shared by concurrent callers, kept until its requirements change; a failed step says so and is retried next
// time; an explicit WORLDLET_TOOLS_PYTHON wins. Uses a stand-in uv: nothing is downloaded.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ToolsPython,TOOLS_PYTHON_VERSION} from '../platform/electron/src/modules/media/tools-python.ts';
import {withTempDir} from './test-temp.ts';

delete process.env.WORLDLET_TOOLS_PYTHON;
await withTempDir('worldlet-tools-python-',async temp=>{
 const folder=path.join(temp,'library','tools'),uv=path.join(temp,'uv'),requirements=path.join(temp,'requirements.txt');
 fs.writeFileSync(uv,'#!/bin/sh\n',{mode:0o755});fs.writeFileSync(requirements,'websockets==15.0.1 --hash=sha256:'+'0'.repeat(64)+'\n');
 const calls:string[][]=[];let fail='';
 const tools=new ToolsPython({folder,uv:()=>uv,requirements,platform:'darwin',run:async(command,args,env)=>{
  calls.push([path.basename(command),...args]);
  assert.equal(env.UV_PYTHON_INSTALL_DIR,path.join(folder,'python'),'the CPython lives in the tools folder');
  assert.ok(!Object.keys(env).some(key=>key.startsWith('WORLDLET_')||key==='HERMES_HOME'),'no Worldlet or Hermes settings reach uv');
  if(args[0]===fail)return 1;
  if(args[0]==='venv'){fs.mkdirSync(path.join(folder,'venv','bin'),{recursive:true});fs.writeFileSync(path.join(folder,'venv','bin','python3'),'#!/bin/sh\n',{mode:0o755});}
  return 0;
 }});
 // Concurrent callers share one setup.
 const [first,second]=await Promise.all([tools.path(),tools.path()]);
 assert.equal(first,path.join(folder,'venv','bin','python3'));assert.equal(second,first);
 assert.deepEqual(calls,[
  ['uv','venv',path.join(folder,'venv'),'--python',TOOLS_PYTHON_VERSION,'--managed-python','--seed','--no-config'],
  ['uv','pip','install','--python',first,'--no-config','--require-hashes','--only-binary',':all:','-r',requirements],
  ['python3','-I','-B','-c','import sys,websockets; assert sys.version_info[:2]==(3,12)'],
 ]);
 // Ready: nothing runs again.
 calls.length=0;
 assert.equal(await tools.path(),first);assert.equal(calls.length,0);
 // New requirements (an app update): set up again.
 fs.appendFileSync(requirements,'# changed\n');
 await tools.path();assert.equal(calls.length,3);
 // A failed step says so, leaves nothing marked ready, and the next call tries again.
 fs.appendFileSync(requirements,'# changed again\n');calls.length=0;fail='pip';
 await assert.rejects(tools.path(),/could not install its local tools/);
 assert.equal(fs.existsSync(path.join(folder,'.ready')),false);
 fail='';await tools.path();assert.equal(calls.filter(call=>call[1]==='venv').length,2);
 // An explicit WORLDLET_TOOLS_PYTHON wins; a relative or missing one is refused.
 process.env.WORLDLET_TOOLS_PYTHON=uv;assert.equal(await tools.path(),uv);
 process.env.WORLDLET_TOOLS_PYTHON='python3';await assert.rejects(tools.path(),/WORLDLET_TOOLS_PYTHON/);
 delete process.env.WORLDLET_TOOLS_PYTHON;
 // A build without uv says to reinstall.
 await assert.rejects(new ToolsPython({folder:path.join(temp,'other'),uv:()=>null,requirements,platform:'darwin'}).path(),/Reinstall Worldlet/);
 // Windows: the venv's own interpreter.
 assert.equal(new ToolsPython({folder,uv:()=>uv,requirements,platform:'win32'}).python,path.join(folder,'venv','Scripts','python.exe'));
});
console.log('PASS tools Python: Worldlet\'s own (bundled uv, pinned CPython, venv with pip, hash-pinned requirements, start check), set up once for concurrent callers and again when requirements change, a failed step retried, WORLDLET_TOOLS_PYTHON honored');
