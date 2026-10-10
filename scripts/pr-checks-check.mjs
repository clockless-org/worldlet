import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {selectChecks,changedFiles,runChecks,operationalChecks,trustChecks,repairDeletions,protectedPath} from './pr-checks.mjs';
import {gateCommands} from './gate.mjs';
import {withTempDir} from './test-temp.ts';

const all=[...operationalChecks,...trustChecks];
assert.equal(new Set(all).size,all.length,'no repeated commands');
assert.deepEqual(selectChecks(null),all);
assert.deepEqual(selectChecks([]),[]);
assert.deepEqual(selectChecks(['README.md','docs/RELEASE-GUIDELINES.md']),[]);
assert.deepEqual(selectChecks(['ui/companion/motion.ts']),trustChecks);
for(const file of ['scripts/machine-capacity.mjs','scripts/dev-workspace.ts','gatehouse/auth.mjs',
 '.github/workflows/architecture.yml','package-lock.json','package.json','release.json','new-root/config',
 'platform/electron/distribution/mac/publish-release.py','scripts/release-label-check.ts','scripts/machine-health-check.ts','harness/hermes/runtime.json']){
 assert.deepEqual(selectChecks([file]),all,file);
}
for(const file of ['core/agent/turn-trust.ts','harness/hermes/turn_trust.py','contracts/agent.ts'])assert.deepEqual(selectChecks([file]),trustChecks,file);
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
for(const platform of ['darwin','win32','linux']){
 const gates=gateCommands(platform);
 for(const command of ['check','check:docs','check:source','check:style','test:ci','test','test:harness:portable','test:ui','test:electron'])assert(gates.includes(command),platform+': '+command);
}
assert.equal(pkg.scripts['test:ci'],'node scripts/pr-checks-check.mjs && node scripts/pr-checks.mjs --all');
const workflow=readFileSync(new URL('../.github/workflows/architecture.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
for(const step of ['name: Architecture\n','fetch-depth: 2','npm run check:pr','node scripts/pr-checks-check.mjs','node scripts/pr-checks.mjs'])assert(workflow.includes(step),step);
assert(pkg.scripts.check.includes('npm run check:arch'),'check executes the complete behavior/contract/parity list');
const basic=pkg.scripts['check:pr'];
// PR CI runs every check (owner, 2026-10-05: "记好check和test的区别，pr ci就跑check"); the fast browser-free and operational
// checks stay because together they finish within three minutes ("3分钟内的话可以改名check，继续跑").
for(const required of ['npm run check &&','check:source','check:contracts','scripts/browser-surface-contract-check.ts','check:docs','check:style'])assert(basic.includes(required),required);
assert(!/\bnpm (run )?test\b(?!:ui:quick)/.test(basic+workflow),'no product test suite runs on a pull request but the quick UI checks');
// The quick UI checks run on pull requests, on Linux, in three jobs (owner decision 2026-10-10: quick checks within five
// minutes); the whole UI suite stays in Beta.
assert.equal((workflow.match(/npm run test:ui:quick/g)||[]).length,1,'the UI jobs run test:ui:quick');
assert.match(workflow,/WORLDLET_TEST_UI_SHARD: \$\{\{ matrix\.shard \}\}\/3/);
// Every third-party action is pinned to a commit, never a moving tag.
for(const file of readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(f=>/\.ya?ml$/.test(f)))
 for(const [,action] of readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8').matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm))
  assert(/^\.\/|@[0-9a-f]{40}$/.test(action),`${file}: ${action} is pinned to a commit SHA`);
// PR CI runs on Linux only, basic checks only (owner decision 2026-10-04): no workflow a pull request triggers may use a
// non-Linux runner or build the iPhone/Android apps; those run in Alpha and Beta.
for(const file of readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(f=>/\.ya?ml$/.test(f))){
 const text=readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
 if(!/^\s*(pull_request|pull_request_target|merge_group)\s*:/m.test(text))continue;
 for(const [,runner] of text.matchAll(/^\s*runs-on:\s*(.+)$/gm))assert(/^ubuntu-[\w.]+$/.test(runner.trim()),`${file}: pull request CI runs on Linux only, not ${runner.trim()}`);
 assert(!/xcodebuild|swift test|gradlew|test:ios|test:android|test:ui(?!:quick)/.test(text.replace(/#.*$/gm,'')),`${file}: iPhone, Android and the whole UI suite run on the release machines, not on pull requests`);
}
// A host popup-rule change (#781 shape) selects only the trust checks, not all operational checks.
const popupPaths=['contracts/README.md','contracts/fixtures/parity/browser-popup.json',
 'platform/electron/README.md','platform/electron/src/modules/browser/rules.ts','platform/electron/src/modules/browser/page.ts',
 'scripts/electron-bridge-check.ts','scripts/parity-vectors.ts','scripts/parity-core-usage.ts'];
assert.deepEqual(selectChecks(popupPaths),trustChecks);
for(const file of ['scripts/attention-events-check.ts','platform/bridge/world-tool-runtime.ts','platform/electron/src/modules/fox/index.ts'])assert.deepEqual(selectChecks([file]),trustChecks,file);
assert.deepEqual(selectChecks([...popupPaths,'scripts/machine-wakeup.mjs']),all,'mixed changes retain operational checks');
assert.deepEqual(selectChecks(['scripts/unknown-new-helper.ts']),all,'unclassified scripts remain conservative');
assert(!workflow.includes('paths-ignore:')&&!workflow.includes('paths:'),'required check must always report');
assert.equal(changedFiles('workflow_dispatch',{}),null);
assert.equal(changedFiles('pull_request',{pull_request:{base:{sha:'bad'}}}),null);
const sha='a'.repeat(40),event={pull_request:{base:{sha},head:{sha}}};
assert.equal(changedFiles('pull_request',event,()=>({status:128})),null);
assert.equal(changedFiles('pull_request',event,()=>({status:null,error:Error('missing git')})),null);

// Exercise the tested merge, every PR commit, deletions and cross-directory renames.
await withTempDir('worldlet-pr-selection-',async root=>{
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
 mkdirSync(path.join(root,'scripts'));mkdirSync(path.join(root,'docs'));
 writeFileSync(path.join(root,'scripts/old.mjs'),'// original\n');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
 git('checkout','-qb','feature');git('mv','scripts/old.mjs','docs/moved.md');git('commit','-qm','rename');
 writeFileSync(path.join(root,'docs/second.md'),'second commit\n');git('add','.');git('commit','-qm','second');const head=git('rev-parse','HEAD');
 git('checkout','-q','--detach',base);writeFileSync(path.join(root,'unrelated'),'base only\n');git('add','.');git('commit','-qm','base advanced');const newerBase=git('rev-parse','HEAD');
 git('merge','--no-ff','-qm','PR merge',head);const merged=git('rev-parse','HEAD');
 const run=(bin,args,opts)=>spawnSync(bin,args,{...opts,cwd:root});
 const pr={pull_request:{base:{sha:newerBase},head:{sha:head}}};
 const files=changedFiles('pull_request',pr,run);
 assert.deepEqual(files,['docs/moved.md','docs/second.md','scripts/old.mjs']);
 assert.deepEqual(selectChecks(files),all,'renaming code to docs cannot skip checks');
 assert.deepEqual(changedFiles('merge_group',{merge_group:{base_sha:newerBase,head_sha:merged}},run),files);
 assert.equal(changedFiles('merge_group',{merge_group:{base_sha:newerBase,head_sha:head}},run),null,'wrong checkout runs full coverage');
 // A depth-two checkout has enough evidence; no full asset history is needed.
 const shallow=path.join(root,'shallow');
 git('clone','-q','--depth=2','--no-local',root,shallow);
 const shallowRun=(bin,args,opts)=>spawnSync(bin,args,{...opts,cwd:shallow});
 assert.deepEqual(changedFiles('pull_request',pr,shallowRun),files);
 assert.equal(changedFiles('merge_group',{merge_group:{base_sha:base,head_sha:merged}},shallowRun),null,'missing shallow base selects all');
 git('checkout','-q','--detach',head);
 assert.equal(changedFiles('pull_request',pr,run),null,'unverified merge runs full coverage');
 // Real failed child and missing executable cannot be reported as passing.
 const failure=path.join(root,'fail.mjs');writeFileSync(failure,'process.exit(7);');
 assert.equal(runChecks([failure]),1);
 assert.equal(runChecks(['fixture.py'],()=>({status:null,error:Error('ENOENT')})),1);
 let calls=0;assert.equal(runChecks(['first.mjs','never.mjs'],()=>{calls++;return {status:3};}),1);assert.equal(calls,1);
});
console.log('PASS PR selection: docs/product/control-plane, full fallback, two-platform coverage, real Git ranges/rename/deletion and failed child propagation.');
// #1188: PRs run a load smoke; a changed script that does not parse or a daemon module that does not load fails it.
{const {loadSmoke,loadModules}=await import('./pr-checks.mjs');const {existsSync}=await import('node:fs');
 for(const f of loadModules)assert.ok(existsSync(new URL('../'+f,import.meta.url)),'load list names a real module: '+f);
 const calls=[];const ok=(bin,args)=>{calls.push(args);return {status:0};};
 const all=()=>true;
 assert.equal(loadSmoke(['scripts/x.mjs','docs/a.md','ui/y.ts'],ok,all),0);assert.deepEqual(calls[0],['--check','scripts/x.mjs'],'only changed JS under scripts/gatehouse/platform is parsed');
 assert.equal(loadSmoke(['scripts/x.mjs'],(bin,args)=>({status:args[0]==='--check'?1:0}),all),1,'a script that does not parse fails the PR');
 assert.equal(loadSmoke(['scripts/deleted.mjs'],(bin,args)=>({status:args[0]==='--check'?1:0}),()=>false),0,'a deleted script is not parsed');
 if(loadModules.includes('scripts/machine-wakeup.mjs'))assert.equal(loadSmoke([],(bin,args)=>({status:String(args.at(-1)).includes('machine-wakeup.mjs')?1:0})),1,'a daemon module that does not load fails the PR');
 console.log('PASS PR load smoke: changed scripts parse, daemon modules load');}
// #1225: PR CI runs the browser-free part of npm test; nested npm groups and browser checks stay in the RC.
{const {fastSteps}=await import('./test-fast.mjs');
 const steps=fastSteps(['test:core','test:worktrees']);assert.ok(steps.length>10,'the fast subset is not empty');
 assert.ok(steps.every(s=>!/attention-card-layout-check/.test(s.args[0])),'browser checks are left to the RC');
 const fake=fastSteps(['test'],f=>'');assert.deepEqual(fake,[],'npm run groups are never inlined');
 console.log('PASS PR fast tests: browser-free checks of test:core/test:worktrees only');}

// Repair PRs fail when they delete repository configuration; other PRs and other deletions pass.
{const base='b'.repeat(40),out='.github/workflows/claude.yml\0.claude/settings.json\0.gitignore\0ui/old.ts\0';
 const run=(bin,args)=>{assert.deepEqual(args.slice(0,5),['diff','--name-only','--no-renames','--diff-filter=D','-z']);assert.deepEqual(args.slice(5),['HEAD^1','HEAD']);return {status:0,stdout:out};};
 const ev=title=>({pull_request:{title,base:{sha:base}}});
 assert.deepEqual(repairDeletions('pull_request',ev('[RC fix][windows] wait for the frame'),run),['.github/workflows/claude.yml','.claude/settings.json','.gitignore']);
 assert.deepEqual(repairDeletions('pull_request',ev('[Release fix][mac] retry notarization'),run).length,3);
 assert.deepEqual(repairDeletions('pull_request',ev('Remove the old workflow'),run),[]);
 assert.deepEqual(repairDeletions('merge_group',{},run),[]);
 assert.equal(repairDeletions('pull_request',ev('[RC fix][mac] x'),()=>({status:128})),null);
 assert(!protectedPath('ui/.eslintrc')&&protectedPath('.env.example'));
 console.log('PASS repair PRs that delete .github/, .claude/ or top-level dotfiles fail');}
