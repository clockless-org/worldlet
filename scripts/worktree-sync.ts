import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace,git,lock,locked,repoRoot} from './dev-workspace.ts';

// Called under the shared integration lock. Never rebase, stash or reset another checkout.
export function syncWorktrees(primary:string){
 const target=git(primary,'rev-parse','refs/heads/main');
 const results:Array<{root:string;status:string}>=[];
 for(const record of git(primary,'worktree','list','--porcelain','-z').split('\0\0')){
  const fields=record.split('\0'),root=fields.find(f=>f.startsWith('worktree '))?.slice(9);
  if(!root||path.resolve(root)===path.resolve(primary))continue;
  let status='';
  try{
   if(!existsSync(root)||fields.some(f=>/^(prunable|locked)( |$)/.test(f)))status='unavailable or locked';
   else if(!fields.some(f=>f.startsWith('branch ')))status='detached';
   else if(['dev-watcher.lock','worktree-verify.lock'].some(f=>locked(path.join(root,'.local',f))))status='busy';
   else if(['index.lock','HEAD.lock','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer'].some(f=>existsSync(path.resolve(root,git(root,'rev-parse','--git-path',f)))))status='Git operation in progress';
   else if(git(root,'status','--porcelain'))status='uncommitted changes';
   else if(git(root,'rev-parse','HEAD')===target)status='current';
   else if(spawnSync('git',['merge-base','--is-ancestor','HEAD',target],{cwd:root}).status!==0)status='independent commits; rebase manually';
   else{
    const update=spawnSync('git',['merge','--ff-only',target],{cwd:root,encoding:'utf8'});
    status=update.status===0?'updated':`skipped: ${update.stderr?.trim()||'Git refused update'}`;
   }
  }catch(error){status=`skipped: ${error.message}`;}
  results.push({root,status});
 }
 for(const result of results)console.log(`Worktree ${result.status}: ${result.root}`);
 return results;
}
export function synchronize(cwd=repoRoot){
 const w=workspace(cwd);
 if(git(w.primary,'branch','--show-current')!=='main')throw Error('The primary checkout must stay on main.');
 const release=lock(path.join(w.common,'worldlet-integration.lock'));
 try{return syncWorktrees(w.primary);}finally{release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{synchronize();}catch(error){console.error(error.message);process.exitCode=1;}
}
