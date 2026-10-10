// The one gate for nightly checks and release checks: static checks, shared tests and this
// platform's suites. `npm run gate` runs it here; machine-nightly.mjs runs the same list per host.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {existsSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
// test:harness:portable holds the untrusted-turn, routine-permission and read-only-tool rules on every
// host, and every host gates test:electron (host contract, module checks, app smoke). The Mac also gates
// test:harness (the Harness handshake). Worldlet has no built-in Hermes since the owner decisions of 2026-10-09,
// so no gate prepares or tests one.
export const sharedGates=['check','check:docs','check:source','check:style','test:ci','test','test:harness:portable','test:ui:smoke','test:ui'];
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
// Linux gates test:harness too: the CI RC runs every check on Linux and only what needs the platform on
// the Mac and Windows runners (owner decision 2026-10-09).
// test:ui:review (last) has Codex look at the pictures those real-app runs kept; only a blocker fails it.
export const platformGates={darwin:['test:electron','test:harness','test:onboarding','test:agent:local','test:ios','test:ui:review'],win32:['test:electron','test:agent:local','test:android','test:ui:review'],linux:['test:electron','test:harness']};
// The RC's second lane (owner request 2026-10-05, RCs within 20 minutes): these gates start no app, browser or emulator
// that the others could meet, and build nothing the others use (dist/, the native interface), so an RC runs them one
// after another in a process of their own at below-normal priority while the rest run (runGates, machine-nightly.mjs).
// test:ios uses its own Simulator and test:android (advisory) its own emulator. `npm test` and test:harness
// stay in the first lane: they build or read the interface test:ui builds.
export const besideGates=['check','check:docs','check:source','check:style','test:ci','test:harness:portable','test:ios','test:android'];
// test:ui:review looks at the pictures the real-app runs kept, Android's among them, so it waits for the second lane.
export const afterBesideGates=['test:ui:review'];
// In the second lane, test:ios and test:android start once test:ui has ended: beside it they slowed its browsers by a
// minute or more on both hosts (RCs 2959-2965, 2026-10-06); after it they still end before the first lane does.
// test:ci too: its fixture workers are real processes, and at the lane's below-normal priority beside test:ui on 02 one
// stayed "running" past a two-minute wait (Mac RCs 2963, 2965, 2968, 2971).
export const besideAfter={'test:ci':'test:ui','test:ios':'test:ui','test:android':'test:ui'};
export function gateCommands(platform=process.platform){return [...sharedGates,...(platformGates[platform]||[])];}
// Only these gates hold back Alpha and Beta (owner decision 2026-10-10: the interface still changes a lot, so a release
// waits only on smoke checks). The app starts (test:electron), the World draws, Fox answers and an Applet opens
// (test:ui:smoke), first-run setup reaches the World (test:onboarding, Mac) and Fox answers through a real local Agent
// (test:agent:local). The release machines add the installed-package smoke (it opens and updates) and, for Beta, the
// one-line install. Every other gate still runs and reports: a failure opens its Issue to be fixed, but the platform is
// promoted. The release machines read this list from main, so it applies to builds made before it changed too.
export const blockingGates=['test:electron','test:ui:smoke','test:onboarding','test:agent:local'];
export const blocks=command=>blockingGates.includes(command);
// One part of the gate (the CI RC splits it over several runners to stay within 30 minutes): WORLDLET_GATE_ONLY names
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
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir=path.dirname(process.execPath),cli=[path.join(dir,'node_modules/npm/bin/npm-cli.js'),path.join(dir,'../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);
 const root=fileURLToPath(new URL('../',import.meta.url)),commands=gatePart(gateCommands());
 // WORLDLET_GATE_BUDGET_MINUTES caps the whole gate (the CI RC sets it, owner decision 2026-10-09: an RC takes at most
 // 30 minutes): the gate running when it runs out is stopped and the rest are not run, all reported as failures.
 const budget=Number(process.env.WORLDLET_GATE_BUDGET_MINUTES)||0,deadline=budget?Date.now()+budget*60_000:0;
 const results=commands.map(command=>{
  const env=process.env;
  const timeout=deadline?deadline-Date.now():undefined;
  if(timeout<=0){console.error(`${command} not run: the gate's ${budget} minutes are used up.`);return {command,ok:false,timedOut:true};}
  const r=cli?spawnSync(process.execPath,[cli,'run',command],{stdio:'inherit',env,timeout,killSignal:'SIGKILL'}):spawnSync('npm',['run',command],{stdio:'inherit',env,shell:process.platform==='win32',timeout,killSignal:'SIGKILL'});
  if(r.error?.code==='ETIMEDOUT'){console.error(`${command} stopped: the gate's ${budget} minutes ran out.`);return {command,ok:false,timedOut:true};}
  return {command,ok:r.status===0&&!r.error};
 });
 const marked=results.map(r=>blocks(r.command)?r:{...r,advisory:true});
 console.log('\nGate ('+process.platform+'):\n'+marked.map(r=>(r.ok?'PASS ':r.advisory?'FAIL (reports only) ':'FAIL ')+r.command).join('\n'));
 // The release machines read the outcome from this file to report a failure as an Issue (scripts/ci-failure-report.mjs).
 if(process.env.WORLDLET_GATE_RESULTS)writeFileSync(process.env.WORLDLET_GATE_RESULTS,JSON.stringify({platform:process.platform,results:marked})+'\n');
 // Only a smoke gate fails the gate; the others' failures are reported above.
 if(marked.some(r=>!r.ok&&!r.advisory))process.exitCode=1;
}
