// PR checks are light (owner decision 2026-10-01, #1188): the required PR check runs the static/type/architecture
// checks (npm run check:pr) and, here, only a load smoke of the automation code. The operational checks below
// run in full in the RC (npm run test:ci → --all), which files an Issue when one fails.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// The open-source export (scripts/oss-export.mjs) leaves out the operations repository's hosted services, host
// automation and their checks; there only the checks and modules it contains run. Here every one must exist.
const present=f=>existsSync(new URL('../'+f,import.meta.url)),operationsRepository=present('gatehouse');
const available=files=>operationsRepository?files:files.filter(present);
export const operationalChecks=available([
 'scripts/windows-installer-support-check.py',
 'scripts/release-mount-check.py','scripts/release-archive-check.py','scripts/release-notarize-check.py',
 'gatehouse/release-history-check.mjs','gatehouse/release-history-backfill-check.mjs','gatehouse/release-progress-check.mjs','gatehouse/workflow-check.mjs','gatehouse/dependencies-check.mjs','scripts/machine-dependency-result-check.mjs',
 'scripts/machine-wakeup-check.mjs','scripts/machine-storage-check.mjs','scripts/machine-worktree-cleanup-check.mjs','scripts/machine-task-root-check.mjs','scripts/machine-build-root-check.mjs',
 'scripts/machine-recovery-check.mjs','scripts/release-job-check.mjs',
 'scripts/window-pixels-check.mjs','scripts/release-smoke-mac-check.mjs','scripts/release-permissions-mac-check.mjs','scripts/release-login-item-mac-check.mjs','scripts/release-fox-setup-mac-check.mjs','scripts/rc-update-acceptance-mac-check.mjs','scripts/onboarding-paths-check.ts','scripts/setup-fixtures-check.ts',
 'scripts/windows-store-submit-check.mjs',
 'scripts/release-smoke-check.mjs','scripts/rc-update-acceptance-windows-check.mjs','scripts/codesign-retry-check.mjs','scripts/release-failure-check.mjs','scripts/label-hygiene-check.mjs','scripts/claude-action-check.mjs',
 'scripts/nightly-review-dispatch-check.mjs','scripts/machine-daemon-check.mjs','scripts/machine-dev-check.mjs','scripts/machine-testflight-check.mjs','scripts/machine-remote-control-check.mjs',
 'scripts/machine-cadence-check.mjs','scripts/machine-nightly-check.mjs','scripts/machine-rc-fresh-check.mjs','scripts/release-hosts-check.mjs','scripts/machine-codex-cli-check.mjs','scripts/machine-candidate-check.mjs','scripts/machine-candidate-source-check.mjs','scripts/machine-rc-repair-check.mjs','scripts/machine-store-submit-check.mjs','scripts/release-verified-check.mjs','scripts/release-rc-build-check.mjs','scripts/release-package-check.mjs',
 // The test:ui runner decides the UI gate: a broken one could pass every release-candidate run.
 'scripts/test-ui-check.mjs','scripts/run-steps-check.mjs',
 'scripts/machine-prs-check.mjs',
 'gatehouse/check.mjs','gatehouse/cloud-check.mjs','gatehouse/github-check.mjs','gatehouse/github-app-check.mjs','gatehouse/mcp-check.mjs','gatehouse/readers-check.mjs','gatehouse/funnel-check.mjs','gatehouse/oauth-check.mjs','gatehouse/data-sources-check.mjs','gatehouse/production-errors-check.mjs','gatehouse/recordings-check.mjs','gatehouse/inbox-check.mjs','gatehouse/vault-check.mjs','gatehouse/ui-build-check.mjs',
 // Capacity and truthful live state are part of the workflow, not optional UI polish.
 'scripts/machine-capacity-check.mjs','scripts/machine-awake-check.mjs',
 'scripts/machine-interactive-check.mjs','scripts/machine-interactive-cli-check.mjs','scripts/machine-live-check.mjs',
 'scripts/machine-live-report-check.mjs','gatehouse/live-check.mjs',
 'scripts/cloud-session-report-check.mjs',
 // Agents on the hosts call the admin MCP endpoint through this helper with their machine credential.
 'scripts/admin-mcp-check.mjs',
 // 对话: the project's messages into Gatehouse (gatehouse/conversations.mjs).
 'scripts/conversation-sync-check.mjs',
 // PR CI time and spend, reported every hour (owner ask 2026-10-04).
 'scripts/ci-time-check.mjs',
 // The dashboard, reports and dispatch the hosts and the owner read, and release labels, storage and coordination:
 // they had sat in opt-in suites (test:machines, test:release) that no net ran.
 'scripts/machine-actions-check.mjs','scripts/machine-cloud-dispatch-check.mjs','scripts/machine-codex-sessions-check.mjs','scripts/machine-detail-check.mjs',
 'scripts/machine-health-check.mjs','scripts/machine-labels-check.mjs','scripts/machine-needs-decision-check.mjs','scripts/machine-owner-answer-check.mjs',
 'scripts/machine-report-check.mjs','scripts/machine-sessions-check.mjs','scripts/machine-status-check.mjs',
 'scripts/release-label-check.ts','scripts/release-retention-check.mjs','scripts/release-storage-check.py','scripts/release-version-check.py','scripts/r2-object-check.mjs',
 'scripts/windows-release-coordination-check.mjs','scripts/windows-check-coordination-check.ts',
 // Admin live updates and the public release feed: only in test:machines, which no net runs (the admin board's
 // browser check is in test:ui: PR CI runs these when scripts change and has no browser).
 'gatehouse/live-status-check.mjs','gatehouse/release-check.mjs',
]);
export const trustChecks=['scripts/turn-trust-check.ts'];
// Product fixture/native-source changes do not exercise allocator, reporting or publication.
// Keep build/publish/control scripts and unknown paths conservative.
export function productPath(p){
 if(p.startsWith('platform/')&&!p.includes('/scripts/')&&/\.(?:ts|js|cs|swift|mm|cpp|h)$/.test(p))return true;
 return /^scripts\/(?!machine-|release-|candidate-|cloud-|windows-(?:store|release|ready))[^/]+-check\.(?:ts|py|swift)$/.test(p)
  ||/^scripts\/parity-(?:vectors|core-usage)\.ts$/.test(p);
}
export function selectChecks(files){
 // Unknown paths and unavailable diffs run everything. Markdown alone does not change execution.
 const operational=files===null||files.some(p=>!p.endsWith('.md')&&!productPath(p)&&(
  /^(scripts|gatehouse|\.github|platform)\//.test(p)||
  !/^(ui|core|contracts|resources|harness|models|worker|website|migrations)\//.test(p)));
 const trust=files===null||files.some(p=>!p.endsWith('.md')&&/^(ui|core|contracts|platform|harness|scripts)\//.test(p))||operational;
 return [...(operational?operationalChecks:[]),...(trust?trustChecks:[])];
}
export function changedFiles(eventName,event,run=spawnSync){
 const base=eventName==='pull_request'?event?.pull_request?.base?.sha:eventName==='merge_group'?event?.merge_group?.base_sha:null;
 const head=eventName==='pull_request'?event?.pull_request?.head?.sha:eventName==='merge_group'?event?.merge_group?.head_sha:null;
 if(!/^[a-f0-9]{40}$/.test(base||'')||!/^[a-f0-9]{40}$/.test(head||''))return null;
 // Checkout is the tested PR merge. Verify its parents before comparing to its base;
 // this covers every PR commit without downloading the repository's asset history.
 const identity=run('git',['show','-s','--format=%H %P','HEAD'],{encoding:'utf8'});
 if(identity.error||identity.status!==0)return null;
 const [checkedOut,...parents]=String(identity.stdout).trim().split(' ');
 if(eventName==='pull_request'?(parents.length!==2||parents[0]!==base||parents[1]!==head):checkedOut!==head)return null;
 // No rename detection: both deleted old paths and added new paths participate.
 const r=run('git',['diff','--name-only','--no-renames','-z',base,checkedOut],{encoding:'utf8'});
 if(r.error||r.status!==0||typeof r.stdout!=='string')return null;
 return r.stdout.split('\0').filter(Boolean);
}
// Host repair PRs ([RC fix]/[Release fix], scripts/machine-rc-repair.mjs) never delete repository
// configuration: .github/, .claude/ or a top-level dotfile. On 2026-10-02 a manual cleanup on 01 deleted
// such files inside a running repair checkout; this fails that PR instead of merging the deletion.
export const protectedPath=p=>/^\.(?:github|claude)\//.test(p)||/^\.[^/]+$/.test(p);
export function repairDeletions(eventName,event,run=spawnSync){
 if(eventName!=='pull_request'||!/^\[(?:RC|Release) fix\]/.test(event?.pull_request?.title||''))return [];
 // Compare with the checked-out merge's first parent, the base it was built on. The event's base.sha can be an
 // older main tip when main moved after the push, and the depth-2 checkout does not hold it (#1922, 09:21Z 10-06).
 const r=run('git',['diff','--name-only','--no-renames','--diff-filter=D','-z','HEAD^1','HEAD'],{encoding:'utf8'});
 if(r.error||r.status!==0||typeof r.stdout!=='string')return null;
 return r.stdout.split('\0').filter(Boolean).filter(protectedPath);
}
// Hosts run main's automation directly: a module that does not parse or import would stop every host,
// the RC included. Changed scripts must parse; these daemon modules must import (#1188).
export const loadModules=available(['scripts/machine-claim.mjs','scripts/machine-candidate.mjs','scripts/machine-release.mjs','scripts/release-job.mjs','scripts/machine-wakeup.mjs','scripts/machine-cloud-dispatch.mjs','scripts/machine-nightly.mjs','scripts/machine-labels.mjs','scripts/machine-rc-package.mjs','scripts/machine-rc-repair.mjs','scripts/machine-store-submit.mjs','scripts/machine-actions.mjs','scripts/machine-cloud-report.mjs','scripts/machine-metrics.mjs']);
export function loadSmoke(files,run=spawnSync,exists=f=>existsSync(new URL('../'+f,import.meta.url))){
 // A deleted script is in the diff but has nothing to parse; the daemon module imports below catch dangling references.
 const changed=(files||[]).filter(f=>/\.(?:mjs|cjs|js)$/.test(f)&&/^(scripts|gatehouse|platform)\//.test(f)&&exists(f));
 for(const file of changed){const r=run(process.execPath,['--check',file],{stdio:'inherit'});if(r.error||r.status!==0){console.error('Does not parse: '+file);return 1;}}
 for(const file of loadModules){const r=run(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../'+file,import.meta.url).href)})`],{stdio:'inherit'});if(r.error||r.status!==0){console.error('Does not load: '+file);return 1;}}
 const tick=!operationsRepository&&!present('scripts/machine-tick.ts')?{status:0}:run(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../scripts/machine-tick.ts',import.meta.url).href)}).catch(e=>{if(!/Ticks run only under/.test(e.message))throw e;})`],{stdio:'inherit'});
 if(tick.error||tick.status!==0){console.error('Does not load: scripts/machine-tick.ts');return 1;}
 console.log(`Load smoke: ${changed.length} changed scripts parse; ${loadModules.length+1} daemon modules load.`);
 return 0;
}
export function runChecks(checks,run=spawnSync){
 for(const file of checks){
  console.log('Check: '+file);
  const r=run(file.endsWith('.py')?'python3':process.execPath,[file],{stdio:'inherit'});
  if(r.error||r.status!==0)return 1;
 }
 return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&args[0]!=='--all'))throw Error('Usage: node scripts/pr-checks.mjs [--all]');
 let event;try{event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));}catch{}
 const files=args[0]==='--all'?null:changedFiles(process.env.GITHUB_EVENT_NAME,event);
 if(args[0]!=='--all'){
 const deleted=repairDeletions(process.env.GITHUB_EVENT_NAME,event);
 if(deleted===null){console.error('Repair PR: the deleted files could not be read.');process.exitCode=1;}
 else if(deleted.length){console.error('A repair PR must not delete repository configuration: '+deleted.join(', '));process.exitCode=1;}
 else process.exitCode=loadSmoke(files);}else{
 const checks=selectChecks(files);
 console.log(files===null?'Full operational/trust coverage (release, manual or unavailable diff).':`${files.length} changed paths; ${checks.length} focused checks selected. Static/type/architecture checks run separately.`);
 process.exitCode=runChecks(checks);}
}
