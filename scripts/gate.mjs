// The one gate for nightly checks and release checks: static checks, shared tests and this
// platform's suites. `npm run gate` runs it here; machine-nightly.mjs runs the same list per host.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {workspace} from './dev-workspace.ts';
// test:harness:portable holds the untrusted-turn, routine-permission and read-only-tool rules on every
// host, and every host gates test:electron (host contract, module checks, app smoke). The Mac also gates
// test:harness (Harness handshake, attention jobs) and test:hermes (the pinned Hermes loop and model
// sources); they run after test:ui has built dist/WorldletWeb.
export const sharedGates=['check','check:docs','check:source','check:style','test:ci','test','test:harness:portable','test:ui'];
// test:onboarding runs the whole first-run journey on the Mac release host before shipping.
// test:onboarding:paths walks the other first-run paths through a local Agent (a fixture OpenClaw at least): quit mid-setup
// and resume, Mail's Google sign-in, Reset Fox, Quit Completely with nothing left running (#1492). It is no RC gate
// (owner request 2026-10-05, RCs within 20 minutes): the RC package smoke runs the same check on the signed, installed
// app (scripts/machine-rc-package.mjs), so the development-build run only repeated it.
// test:onboarding:options takes every way in on setup's sign-in page to the World, bringing OpenClaw, Claude Code, pi
// and Hermes Agent in from fixture homes, and has Fox answer on each (#1503). It is advisory (it never failed an RC) and
// no RC gate since 2026-10-05 (owner request, RCs within 20 minutes); `npm run test:onboarding:options` runs it.
// test:agent:local has Fox really talk through this host's Codex CLI (practice mail, World tools);
// it reports SKIP where Codex is not signed in.
// Fox's Pokémon Showdown battle review is no RC gate (owner request 2026-10-05, RCs within 20 minutes): it graded a
// real model's answers, flaked, and is not release-breaking; scripts/game-review-check.ts (test:core) keeps the recorder,
// what Fox reads back and when a review starts.
// test:ios runs the iPhone app's WorldletKit and XCUITest UI tests on a Simulator (SKIP without Xcode);
// pull requests run nothing for it (owner decision 2026-10-04: PR CI is Linux basic checks only).
// test:android runs the Android app's protocol and JVM UI tests, then its instrumented UI tests on an emulator
// (Windows: 01 tests Windows and Android, 02 Mac and iOS, owner decision 2026-10-03); pull requests run nothing
// for it (owner decision 2026-10-04). Advisory until it has passed on 01.
// test:ui:review (last) has Codex look at the pictures those real-app runs kept; only a blocker fails it.
export const platformGates={darwin:['test:electron','test:harness','test:hermes','test:onboarding','test:agent:local','test:ios','test:ui:review'],win32:['test:electron','test:agent:local','test:android','test:ui:review'],linux:['test:electron']};
// The RC's second lane (owner request 2026-10-05, RCs within 20 minutes): these gates start no app, browser or emulator
// that the others could meet, and build nothing the others use (dist/, the native interface), so an RC runs them one
// after another in a process of their own at below-normal priority while the rest run (runGates, machine-nightly.mjs).
// test:ios uses its own Simulator and test:android (advisory) its own emulator. `npm test`, test:harness and
// test:hermes stay in the first lane: they build or read the interface test:ui builds.
export const besideGates=['check','check:docs','check:source','check:style','test:ci','test:harness:portable','test:ios','test:android'];
// test:ui:review looks at the pictures the real-app runs kept, Android's among them, so it waits for the second lane.
export const afterBesideGates=['test:ui:review'];
// In the second lane, test:ios and test:android start once test:ui has ended: beside it they slowed its browsers by a
// minute or more on both hosts (RCs 2959-2965, 2026-10-06); after it they still end before the first lane does.
// test:ci too: its fixture workers are real processes, and at the lane's below-normal priority beside test:ui on 02 one
// stayed "running" past a two-minute wait (Mac RCs 2963, 2965, 2968, 2971).
export const besideAfter={'test:ci':'test:ui','test:ios':'test:ui','test:android':'test:ui'};
export function gateCommands(platform=process.platform){return [...sharedGates,...(platformGates[platform]||[])];}
// One part of the gate (the CI RC splits it over several runners to stay within 20 minutes): WORLDLET_GATE_ONLY names
// the gates to run, WORLDLET_GATE_SKIP the ones to leave to another part. A name this platform's gate lacks is an error.
export function gatePart(commands,{only=process.env.WORLDLET_GATE_ONLY,skip=process.env.WORLDLET_GATE_SKIP}={}){
 const names=value=>String(value||'').split(',').map(n=>n.trim()).filter(Boolean),want=names(only),drop=names(skip);
 const unknown=[...want,...drop].filter(n=>!commands.includes(n));
 if(unknown.length)throw Error('This gate has no '+unknown.join(', '));
 return commands.filter(c=>(!want.length||want.includes(c))&&!drop.includes(c));
}
// A quick RC (between release slots, owner decision 2026-10-06: "rc只查大问题，Release查小问题") runs test:ui's quick set
// (scripts/test-ui.mjs quickChecks) in place of the whole suite; every other gate is the same.
export const uiGates=['test:ui','test:ui:quick'];
export const quickGates=commands=>commands.map(c=>c==='test:ui'?'test:ui:quick':c);
export const hermesGates=['test:harness','test:hermes'];
// Validated runtime input for hermesGates: WORLDLET_HERMES_PYTHON, else this checkout's
// `npm run setup:hermes` interpreter, else the primary checkout's (`primary`: a temporary gate
// checkout on a release host has none of its own, #1285). It must sit in a Hermes source checkout at the runtime.json
// revision and import jsonschema; otherwise these gates fail with the reason, never skip. Its bin
// directory leads PATH so the suites' bare python3 resolves to it. Process-local; nothing is persisted.
// A probe that stalls (RC 22021646: a check printed nothing for 480 s while the package build ran beside
// it) is stopped after a minute and run once more, so the gate names the stall instead of hanging until killed.
export const stallMs=60000;
export function boundedRun(run,command,args,options={}){
 for(let attempt=1;;attempt++){
  const result=run(command,args,{encoding:'utf8',timeout:stallMs,...options});
  if(result.error?.code!=='ETIMEDOUT'||attempt===2)return result;
  console.error(`${path.basename(command)} ${args.slice(0,2).join(' ')} stalled for ${stallMs/1000} s; running it once more.`);
 }
}
export function hermesRuntime(root,env=process.env,run=spawnSync,primary=null){
 const windows=process.platform==='win32',venv=dir=>path.join(dir,'.local/hermes-source/.venv',windows?'Scripts/python.exe':'bin/python');
 const python=env.WORLDLET_HERMES_PYTHON||[root,primary].filter(Boolean).map(venv).find(existsSync)||venv(root);
 const fail=reason=>({ok:false,python,reason:`Hermes runtime ${python}: ${reason}. Run npm run setup:hermes in ${primary?'the primary checkout':'this checkout'} or set WORLDLET_HERMES_PYTHON to a validated runtime.`});
 if(!existsSync(python))return fail('not found');
 const source=path.resolve(path.dirname(python),'../..'),revision=JSON.parse(readFileSync(path.join(root,'harness/hermes/runtime.json'),'utf8')).revision;
 const head=boundedRun(run,'git',['-C',source,'rev-parse','HEAD']);
 if(head.error?.code==='ETIMEDOUT')return fail(`git rev-parse in ${source} stalled twice`);
 if(head.status!==0||head.stdout.trim()!==revision)return fail(`source ${source} is not at pinned revision ${revision}`);
 const probe=boundedRun(run,python,['-c','import jsonschema, hermes_cli']);
 if(probe.error?.code==='ETIMEDOUT')return fail('the jsonschema and hermes_cli import stalled twice');
 if(probe.status!==0)return fail('cannot import jsonschema and hermes_cli');
 return {ok:true,python};
}
export const hermesEnvironment=(env,python)=>({...env,WORLDLET_HERMES_PYTHON:python,PATH:path.dirname(python)+path.delimiter+(env.PATH||'')});
// The development-build onboarding suites run Fox on that runtime too (they find it themselves, like
// hermesRuntime): without it, Mail's Google sign-in ends in "Fox setup files are missing". They need it as well.
export const onboardingGates=['test:onboarding','test:onboarding:paths','test:onboarding:options'];
export const runtimeGates=[...hermesGates,...onboardingGates];
// A host without a validated runtime runs `setup` once and checks again, so a host that never ran
// setup:hermes (a fresh Windows host) is not failed for it. An explicit WORLDLET_HERMES_PYTHON is left as set.
// An attempt is reported as `hermes-runtime`.
export function ensureHermesRuntime(check,setup,env=process.env){
 const before=check();
 if(before.ok||env.WORLDLET_HERMES_PYTHON)return {runtime:before,result:null};
 const r=setup(),ran=r.status===0&&!r.error,runtime=ran?check():before;
 const line=runtime.ok?`Hermes runtime installed: ${runtime.python}`:`Hermes runtime setup ${ran?'finished, but the runtime is still not valid':'failed'}: ${runtime.reason}`;
 return {runtime,result:{command:'hermes-runtime',ok:runtime.ok,tail:line}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir=path.dirname(process.execPath),cli=[path.join(dir,'node_modules/npm/bin/npm-cli.js'),path.join(dir,'../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);
 const root=fileURLToPath(new URL('../',import.meta.url)),commands=gatePart(gateCommands()),runtime=commands.some(c=>runtimeGates.includes(c))?hermesRuntime(root,process.env,spawnSync,workspace(root).primary):null;
 // WORLDLET_GATE_BUDGET_MINUTES caps the whole gate (the CI RC sets it, owner decision 2026-10-09: an RC takes at most
 // 20 minutes): the gate running when it runs out is stopped and the rest are not run, all reported as failures.
 const budget=Number(process.env.WORLDLET_GATE_BUDGET_MINUTES)||0,deadline=budget?Date.now()+budget*60_000:0;
 const results=commands.map(command=>{
  if(runtimeGates.includes(command)&&!runtime.ok){console.error(runtime.reason);return {command,ok:false};}
  const env=hermesGates.includes(command)?hermesEnvironment(process.env,runtime.python):process.env;
  const timeout=deadline?deadline-Date.now():undefined;
  if(timeout<=0){console.error(`${command} not run: the gate's ${budget} minutes are used up.`);return {command,ok:false,timedOut:true};}
  const r=cli?spawnSync(process.execPath,[cli,'run',command],{stdio:'inherit',env,timeout,killSignal:'SIGKILL'}):spawnSync('npm',['run',command],{stdio:'inherit',env,shell:process.platform==='win32',timeout,killSignal:'SIGKILL'});
  if(r.error?.code==='ETIMEDOUT'){console.error(`${command} stopped: the gate's ${budget} minutes ran out.`);return {command,ok:false,timedOut:true};}
  return {command,ok:r.status===0&&!r.error};
 });
 console.log('\nGate ('+process.platform+'):\n'+results.map(r=>(r.ok?'PASS ':'FAIL ')+r.command).join('\n'));
 // The CI release candidate (.github/workflows/rc.yml) reads the outcome from this file to report a failure as an Issue.
 if(process.env.WORLDLET_GATE_RESULTS)writeFileSync(process.env.WORLDLET_GATE_RESULTS,JSON.stringify({platform:process.platform,results})+'\n');
 if(results.some(r=>!r.ok))process.exitCode=1;
}
