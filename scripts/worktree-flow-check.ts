import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {flow} from './worktree-flow.ts';
import {withTempDir} from './test-temp.ts';
await withTempDir('worldlet-dev-flow-',async tmp=>{
const main=path.join(tmp,'main'),dev=path.join(tmp,'dev'),feature=path.join(tmp,'feature');
const git=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:'pipe'}).trim();
 mkdirSync(main);git(main,'init','-b','main');git(main,'config','user.email','fixture@example.test');git(main,'config','user.name','Fixture');
 writeFileSync(path.join(main,'shared'),'base\n');git(main,'add','.');git(main,'commit','-m','base');
 git(main,'worktree','add','-b','dev',dev);git(main,'worktree','add','-b','codex/feature',feature);
 writeFileSync(path.join(feature,'feature'),'preserve feature\n');git(feature,'add','.');git(feature,'commit','-m','feature');
 const roots=[main,dev,feature];
 const before=roots.map(root=>({head:git(root,'rev-parse','HEAD'),status:git(root,'status','--porcelain')}));
 for(const root of roots){
  for(const command of ['verify','merge']){
   assert.throws(()=>flow(command,root),/Local dev integration is retired/);
   assert.throws(()=>flow(command,root,['--push']),/Local dev integration is retired/);
  }
  // Test the retired CLI as a process: importing it intentionally throws.
  for(const args of [[],['main'],['dev']]){
   const result=spawnSync(process.execPath,[fileURLToPath(new URL('./merge-dev.ts',import.meta.url)),...args],{cwd:root,encoding:'utf8'});
   assert.equal(result.status,1);
   assert.match(result.stderr,/Local dev integration is retired/);
  }
 }
 assert.deepEqual(roots.map(root=>({head:git(root,'rev-parse','HEAD'),status:git(root,'status','--porcelain')})),before,'retired commands preserve all checkouts');
 console.log('PASS retired local integration rejects main/dev/feature calls without changing Git state.');
});
