// Local integration belongs to dev; GitHub main is updated only through PRs.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace,git,lock} from './dev-workspace.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
function clean(cwd:string){if(git(cwd,'status','--porcelain'))throw Error(`Commit or set aside changes first: ${cwd}`);}
function run(cwd:string,command:string,args:string[]){
 const result=spawnSync(command,args,{cwd,stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`${command} ${args.join(' ')} failed.`);
}
export function devCheckout(cwd=root){
 const w=workspace(cwd);
 const row=git(cwd,'worktree','list','--porcelain').split('\n\n').find(row=>row.split('\n').includes('branch refs/heads/dev'));
 if(!row)throw Error('Create a dedicated linked worktree on branch dev first. Keep the primary checkout on main.');
 const dev=row.split('\n')[0].slice(9);
 if(path.resolve(dev)===w.primary)throw Error('dev must use a linked worktree; the primary checkout stays on main.');
 return dev;
}
export function flow(command:string,cwd=root,args:string[]=[]){
 if(command==='merge'||command==='verify')throw Error('Local dev integration is retired. Use a feature PR and GitHub squash merge.');
 const w=workspace(cwd),main=w.primary;
 if(git(main,'branch','--show-current')!=='main')throw Error('The primary checkout must stay on main.');
 if(args.includes('--push'))throw Error('Direct main pushes are retired. Push the feature branch and open a GitHub PR.');
 const dev=devCheckout(cwd);
 if(!w.linked||w.branch==='detached'||w.branch==='dev')throw Error('Run this from a feature branch in a linked worktree, not main or dev.');
 const receiptFile=path.join(w.root,'.local/worktree-verified.json');
 if(command==='status'){console.log(JSON.stringify({...w,main,dev,verified:existsSync(receiptFile)?JSON.parse(readFileSync(receiptFile,'utf8')):null},null,2));return;}
 const release=lock(path.join(w.common,'worldlet-integration.lock'));
 try{
  clean(w.root);clean(dev);
  const head=git(w.root,'rev-parse','HEAD'),base=git(dev,'rev-parse','HEAD');
  if(spawnSync('git',['merge-base','--is-ancestor',head,base],{cwd}).status===0)throw Error('This feature is already included in dev.');
  if(command==='verify'){
   if(existsSync(receiptFile))unlinkSync(receiptFile);
   run(w.root,'git',['diff','--check',git(w.root,'merge-base','main',head),head]);
   mkdirSync(path.dirname(receiptFile),{recursive:true});
   writeFileSync(receiptFile,JSON.stringify({version:3,head,base,dev,root:w.root,verifiedAt:new Date().toISOString()},null,2)+'\n');
   console.log(`Git checks passed. Run npm run worktree:merge to integrate into local dev, then open a feature PR for main.`);
  }else if(command==='merge'){
   const receipt=JSON.parse(readFileSync(receiptFile,'utf8'));
   if(receipt.version!==3||receipt.head!==head||receipt.base!==base||receipt.dev!==dev||receipt.root!==w.root)throw Error('Verification is absent or stale. Run npm run worktree:verify again.');
   const result=spawnSync('git',['merge','--no-ff','--no-edit',head],{cwd:dev,stdio:'inherit'});
   if(result.status!==0){
    if(existsSync(path.resolve(dev,git(dev,'rev-parse','--git-path','MERGE_HEAD'))))run(dev,'git',['merge','--abort']);
    throw Error('Integration conflict; dev was restored. Resolve overlapping work on an integration-resolution branch; main and feature branches were not changed.');
   }
   console.log(`Local dev now includes ${head.slice(0,7)}. Its running Dev app refreshes automatically. main was not changed; publish through a GitHub PR.`);
  }else throw Error('Use status, verify or merge.');
 }finally{release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{flow(process.argv[2],root,process.argv.slice(3));}catch(error){console.error(error.message);process.exitCode=1;}
}
