import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installPrimaryGuard,MARKER} from './primary-guard.mjs';

if(process.platform==='win32'){console.log('SKIP primary guard hook behavior is checked on POSIX hosts.');process.exit(0);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-primary-guard-'));
const primary=path.join(tmp,'main'),linked=path.join(tmp,'feature');
const env={...process.env,WORLDLET_PRIMARY_GUARD_OFF:''};
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:'pipe',env}).trim();
const run=(cwd,...args)=>spawnSync('git',args,{cwd,encoding:'utf8',env});
try{
 fs.mkdirSync(primary);git(primary,'init','-q','-b','main');git(primary,'config','user.email','fixture@example.test');git(primary,'config','user.name','Fixture');
 fs.writeFileSync(path.join(primary,'file'),'base\n');git(primary,'add','.');git(primary,'commit','-qm','base');
 // A branch whose tree differs from main, so a switch that is only half undone would show up in git status.
 git(primary,'checkout','-q','-b','claude/feature');fs.writeFileSync(path.join(primary,'file'),'feature\n');fs.writeFileSync(path.join(primary,'added'),'feature only\n');
 git(primary,'add','.');git(primary,'commit','-qm','feature');git(primary,'checkout','-q','main');
 // An existing post-checkout hook is kept and still runs.
 const hooks=path.join(primary,'.git/hooks'),previous=path.join(tmp,'previous-ran');
 fs.writeFileSync(path.join(hooks,'post-checkout'),`#!/bin/sh\necho "$3" >> "${previous}"\n`,{mode:0o755});
 // Any reference-transaction guard (#1525's, a hand-made one, or one chained as .local) is taken out: refusing the
 // HEAD update there leaves main with the other branch's files staged.
 fs.writeFileSync(path.join(hooks,'reference-transaction'),`#!/bin/sh\n# ${MARKER}: old guard\nexit 0\n`,{mode:0o755});
 fs.writeFileSync(path.join(hooks,'reference-transaction.local'),'#!/bin/sh\n# hand guard\nexit 0\n',{mode:0o755});
 assert.equal(installPrimaryGuard(primary).status,'installed');
 assert.ok(!fs.existsSync(path.join(hooks,'reference-transaction')));assert.ok(!fs.existsSync(path.join(hooks,'reference-transaction.local')));
 assert.ok(fs.existsSync(path.join(hooks,'reference-transaction.disabled-local')));
 fs.writeFileSync(path.join(hooks,'reference-transaction'),'#!/bin/sh\n# hand guard: git-common-dir, refs/heads/main\nexit 1\n',{mode:0o755});
 assert.equal(installPrimaryGuard(primary).status,'installed');
 assert.ok(!fs.existsSync(path.join(hooks,'reference-transaction')));assert.ok(fs.existsSync(path.join(hooks,'reference-transaction.disabled')));
 assert.equal(installPrimaryGuard(primary).status,'current');
 assert.match(fs.readFileSync(path.join(hooks,'post-checkout'),'utf8'),new RegExp('# '+MARKER+':'));
 assert.ok(fs.existsSync(path.join(hooks,'post-checkout.local')));

 // Leaving main in the primary checkout fails, and the checkout is back on main with main's tree: git status clean.
 for(const args of [['switch','-q','claude/feature'],['checkout','-q','claude/feature'],['checkout','-q','-b','claude/new']]){
  const left=run(primary,...args);
  assert.notEqual(left.status,0,args.join(' '));assert.match(left.stderr,/git worktree add/);
  assert.equal(git(primary,'branch','--show-current'),'main',args.join(' '));
  assert.equal(git(primary,'status','--porcelain'),'',args.join(' ')+' leaves main clean');
  assert.equal(fs.readFileSync(path.join(primary,'file'),'utf8'),'base\n');assert.ok(!fs.existsSync(path.join(primary,'added')));
 }
 assert.ok(git(primary,'rev-parse','--verify','claude/new'),'the branch it created is kept');

 // File checkouts, detached HEAD and staying on main are untouched; the previous hook still runs.
 fs.writeFileSync(path.join(primary,'file'),'edit\n');assert.equal(run(primary,'checkout','--','file').status,0);
 assert.equal(run(primary,'checkout','-q','--detach').status,0);assert.equal(git(primary,'rev-parse','--abbrev-ref','HEAD'),'HEAD');
 assert.equal(run(primary,'checkout','-q','main').status,0);
 assert.ok(fs.readFileSync(previous,'utf8').trim().split('\n').length>=2,'the previous hook still runs');
 assert.equal(spawnSync('git',['switch','-q','claude/feature'],{cwd:primary,encoding:'utf8',env:{...env,WORLDLET_PRIMARY_GUARD_OFF:'1'}}).status,0,'escape hatch');
 git(primary,'checkout','-q','main');

 // Linked worktrees share the hook but switch branches freely.
 assert.equal(run(primary,'worktree','add','-q','-b','claude/work',linked).status,0);
 assert.equal(run(linked,'checkout','-q','-b','claude/other').status,0);assert.equal(git(linked,'branch','--show-current'),'claude/other');
 assert.equal(run(linked,'checkout','-q','claude/feature').status,0);
 // Installing from a worktree targets the primary checkout's hooks.
 assert.equal(installPrimaryGuard(linked).status,'current');
 console.log('PASS primary checkout switches back to main with a clean tree on a branch switch; reference-transaction guards removed; worktrees, files and detached HEAD unaffected.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
