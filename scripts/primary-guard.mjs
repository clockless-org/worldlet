// Keeps the primary checkout on main (owner decision 2026-10-03: every session works in a worktree). The main
// Dev app builds only from the primary checkout's main (scripts/dev-electron.ts), so a session that switches it
// to a feature branch pauses Dev updates ("Primary checkout left main."). Git hooks are not versioned, so the
// Dev watcher and the development host's daemon tick install a post-checkout hook into the primary checkout: a
// branch checkout switches straight back to main with a real `git checkout main`, restoring the tree, and fails
// with a pointer to `git worktree add`. Linked worktrees, file checkouts and detached HEADs (rebase, bisect, gate
// checkouts) are left alone; CI clones never get the hook. WORLDLET_PRIMARY_GUARD_OFF=1 skips it once.
// No reference-transaction guard: Git updates the index and working tree before the HEAD transaction, so
// refusing there left main with the other branch's files staged (03, 2026-10-03). The installer removes any.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,renameSync,chmodSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const MARKER='worldlet-primary-guard';
const head=`#!/bin/sh
# ${MARKER}: installed by scripts/primary-guard.mjs; edits here are overwritten.
# A hook that was here before lives on as post-checkout.local and still runs first.`;
// Leaves unless this is the primary checkout with the guard on.
const primaryOnly=`[ -z "$WORLDLET_PRIMARY_GUARD_OFF" ] || exit $status
git_dir=$(cd "$(git rev-parse --git-dir)" && pwd -P) || exit $status
common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P) || exit $status
[ "$git_dir" = "$common_dir" ] || exit $status`;
const advice=`echo "Worldlet: the primary checkout stays on main; the Dev app builds from it. Work in a worktree:" >&2
echo "  git worktree add ../worldlet-<name> -b <branch> origin/main" >&2`;
export const hooks={
 'post-checkout':`${head}
status=0
local_hook="$(dirname "$0")/post-checkout.local"
if [ -x "$local_hook" ]; then "$local_hook" "$@" || status=$?; fi
[ "$3" = 1 ] || exit $status
${primaryOnly}
branch=$(git branch --show-current)
[ -n "$branch" ] && [ "$branch" != main ] || exit $status
git show-ref --verify --quiet refs/heads/main || exit $status
${advice}
if WORLDLET_PRIMARY_GUARD_OFF=1 git checkout -q main; then
 echo "Switched the primary checkout back to main; branch $branch is kept." >&2
else
 echo "Could not switch back to main; run: git checkout main" >&2
fi
exit 1
`};

const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:20000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();

/** Installs or refreshes the hook for the primary checkout of `root`'s repository. Idempotent; an unrelated
 * existing post-checkout hook is kept as post-checkout.local. Every reference-transaction hook (#1525's guard,
 * the hand-made one on 03, or one it chained as .local) is moved to reference-transaction.disabled.
 * A hooks directory inside the work tree (core.hooksPath pointing at versioned files) is not touched. */
export function installPrimaryGuard(root){
 const common=path.resolve(root,git(root,'rev-parse','--git-common-dir'));
 const primary=path.dirname(common);
 const dir=path.resolve(primary,git(primary,'rev-parse','--git-path','hooks'));
 const inside=(parent,file)=>{const r=path.relative(parent,file);return !r.startsWith('..')&&!path.isAbsolute(r);};
 if(inside(primary,dir)&&!inside(common,dir))return {status:'skipped: hooks are versioned in the work tree'};
 const result={};
 for(const [name,hook] of Object.entries(hooks)){
  const file=path.join(dir,name);
  let current='';try{current=readFileSync(file,'utf8');}catch{}
  if(current===hook){result[name]='current';continue;}
  mkdirSync(dir,{recursive:true});
  if(current&&!current.includes('# '+MARKER+':')){
   if(existsSync(file+'.local')){result[name]='skipped: '+name+'.local already exists';continue;}
   else renameSync(file,file+'.local');
  }
  writeFileSync(file,hook);chmodSync(file,0o755);result[name]='installed';
 }
 const refusing=path.join(dir,'reference-transaction');
 for(const file of [refusing,refusing+'.local'])if(existsSync(file)){
  let text='';try{text=readFileSync(file,'utf8');}catch{}
  if(text.includes('# '+MARKER+':'))rmSync(file);
  else renameSync(file,refusing+'.disabled'+(file.endsWith('.local')?'-local':''));
  result['reference-transaction']='removed';
 }
 const states=Object.values(result);
 return {status:states.every(s=>s==='current')?'current':states.some(s=>s.startsWith('skipped'))?'partial':'installed',hooks:result};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(installPrimaryGuard(process.cwd()));
