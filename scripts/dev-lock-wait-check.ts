// The bounded integration-lock wait behind `dev-electron.ts --check` (#913), on temporary lock files:
// no host build, and never the real integration lock.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {waitForLock} from './dev-workspace.ts';

const temp=mkdtempSync(path.join(tmpdir(),'worldlet-lock-wait-'));
// Live processes other than this one hold the fixture locks, as another checkout's watcher would.
const sleeper=()=>spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore'});
const holder=sleeper(),pid=String(holder.pid);
const owner=(file:string)=>existsSync(file)?readFileSync(file,'utf8'):null;
try{
 {const file=path.join(temp,'building.lock'),heard:string[]=[];writeFileSync(file,pid);setTimeout(()=>unlinkSync(file),150);
  const release=await waitForLock(file,5000,p=>heard.push(p),20);
  assert.deepEqual(heard,[pid],'names the live holder once, not on every poll');
  assert.equal(owner(file),String(process.pid),'takes the lock once the holder releases it');release();assert.equal(owner(file),null);}
 console.log('PASS waits for a live holder, names it once, then takes the lock');

 {const file=path.join(temp,'stuck.lock');writeFileSync(file,pid);
  await assert.rejects(waitForLock(file,200,()=>{},20),{message:new RegExp(`^Timed out after 0\\.2 s waiting for process ${pid} to release `)});
  assert.equal(owner(file),pid,'the holder keeps its lock');}
 console.log('PASS a holder that outlives the bound fails the wait clearly and keeps its lock');

 {const file=path.join(temp,'crashed.lock'),gone=sleeper();writeFileSync(file,String(gone.pid));setTimeout(()=>gone.kill(),150);
  const release=await waitForLock(file,5000,()=>{},20);assert.equal(owner(file),String(process.pid),'a holder that exits without releasing does not block');release();}
 console.log('PASS a holder that exits without releasing leaves a stale lock, which is taken');

 {const blocker=path.join(temp,'not-a-directory'),started=Date.now();writeFileSync(blocker,'');
  await assert.rejects(waitForLock(path.join(blocker,'x.lock'),60000,()=>{},20),{code:/^E/});
  assert.ok(Date.now()-started<5000,'a filesystem error is not waited out');}
 console.log('PASS a filesystem error fails at once');

 // The bug was wiring: --check returned at once on a held lock and exited 0 without a candidate.
 const devHost=readFileSync(new URL('./dev-electron.ts',import.meta.url),'utf8');
 assert.ok(/unlock=check\?await waitForLock\(integrationLock,/.test(devHost),'--check waits for the integration lock');
 assert.ok(/const integrationLock=checkout\.linked\?path\.join\(root,'\.local\/dev-candidate\.lock'\):path\.join\(checkout\.common,'worldlet-integration\.lock'\);/.test(devHost),'a linked worktree locks only its own candidate builds, never main\'s integration lock');
 assert.ok(/if\(!check&&locked\(integrationLock\)\)\{clearTimeout\(timer\);timer=setTimeout\(rebuild,500\);return;\}/.test(devHost),'the watcher still retries later without blocking');
 assert.ok(/if\(!c\|\|c\.id===restored\|\|c\.revision!==head\)\{.*process\.exit\(1\);\}/.test(devHost),'--check fails unless it prepared a candidate for HEAD');
 console.log('PASS dev-electron --check waits for the lock and fails without a fresh candidate for HEAD; the watcher does not block');
}finally{holder.kill();rmSync(temp,{recursive:true,force:true});}
{// A lock file older than this boot is stale even when its PID now belongs to another live process (02, 2026-10-06).
 const {writtenBeforeBoot}=await import('./dev-workspace.ts');
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'lock-boot-')),'x.lock');fs.writeFileSync(file,String(process.pid));
 const now=Date.now();fs.utimesSync(file,new Date(now-3600_000),new Date(now-3600_000));
 if(!writtenBeforeBoot(file,{uptime:60,now}))throw Error('a lock written an hour before a one-minute-old boot is stale');
 if(writtenBeforeBoot(file,{uptime:7200,now}))throw Error('a lock written during this boot is not stale');
 fs.rmSync(path.dirname(file),{recursive:true,force:true});
 console.log('PASS a lock written before this boot is stale even if its PID was reused');}
