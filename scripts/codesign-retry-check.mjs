import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,chmodSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {codesignRetryScript} from './codesign-retry.mjs';
import {withTempDir} from './test-temp.ts';
// Mac signing only: the wrapper is a POSIX shell script, so Windows (RC host 01) has nothing to check (#1095).
if(process.platform==='win32'){console.log('SKIP codesign retry: Mac signing only');process.exit(0);}
// A fake codesign: fails with the given messages in order, then succeeds; counts its calls.
await withTempDir('codesign-retry-',async dir=>{
 const run=(failures)=>{
  const count=path.join(dir,'count'),fake=path.join(dir,'fake'),wrapper=path.join(dir,'codesign');writeFileSync(count,'0');
  writeFileSync(fake,['#!/bin/sh',`n=$(($(cat "${count}")+1)); echo $n >"${count}"`,'echo "out:$*"',
   ...failures.map((m,i)=>`[ $n -eq ${i+1} ] && { echo "${m}" >&2; exit 1; }`),'exit 0',''].join('\n'));chmodSync(fake,0o755);
  writeFileSync(wrapper,codesignRetryScript({codesign:fake,pause:'0'}));chmodSync(wrapper,0o755);
  const r=spawnSync(wrapper,['--sign','X','a b.pak'],{encoding:'utf8'});
  return {status:r.status,stdout:r.stdout,stderr:r.stderr,calls:Number(readFileSync(count,'utf8'))};
 };
 let r=run(['a.pak: A timestamp was expected but was not found.','The timestamp service is not available.']);
 assert.equal(r.status,0);assert.equal(r.calls,3,'two timestamp failures, then signed');assert.match(r.stdout,/out:--sign X a b\.pak/,'arguments pass through intact');assert.match(r.stderr,/retry 2 of 4/);
 r=run(['errSecInternalComponent']);assert.equal(r.status,1);assert.equal(r.calls,1,'other failures are not retried');assert.match(r.stderr,/errSecInternalComponent/);
 r=run(Array(6).fill('A timestamp was expected but was not found.'));assert.equal(r.status,1);assert.equal(r.calls,5,'at most five attempts');assert.match(r.stderr,/timestamp was expected/,'the last failure passes through');
 assert.equal(run([]).calls,1);
});
// #1105: only Mach-O files (and directories, the bundles) are signed; resources are sealed.
{const {sealedNotSigned}=await import('./codesign-retry.mjs'),d=mkdtempSync(path.join(os.tmpdir(),'sealed-'));
 try{const f=(name,hex)=>{writeFileSync(path.join(d,name),Buffer.concat([Buffer.from(hex,'hex'),Buffer.from('rest')]));return path.join(d,name);};
  for(const hex of ['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca'])assert.equal(sealedNotSigned(f('m'+hex,hex)),false,'Mach-O '+hex+' is signed');
  assert.equal(sealedNotSigned(f('locale.pak','0500000001')),true,'a resource is sealed, not signed');assert.equal(sealedNotSigned(f('icon.png','89504e47')),true);
  assert.equal(sealedNotSigned(d),false,'directories (bundles) are signed');assert.equal(sealedNotSigned(path.join(d,'missing')),false);}
 finally{rmSync(d,{recursive:true,force:true});}}
console.log('PASS codesign: only Mach-O code signed (resources sealed); one file retried only for unanswered timestamps, at most five times, arguments and the last error preserved.');
