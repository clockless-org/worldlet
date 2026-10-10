// npm run test:onboarding: the whole first-run journey on real code (Mac release gate), as the
// Electron host's development check `--check onboarding-flow` (platform/electron/src/checks).
// Builds the host (and the interface when missing), runs it on a disposable library with this
// computer's Codex CLI as Fox's Agent (there is no built-in Agent, owner decisions 2026-10-09; test:agent:local runs
// Fox on it too), and propagates the check's exit code.
// A failed run keeps its library for diagnosis (logs/diagnostics.jsonl, world.sqlite).
import {spawn,spawnSync} from 'node:child_process';
import {cpSync,createWriteStream,existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace} from './dev-workspace.ts';
import {cachedAgentBrowser} from './package-agent-browser.ts';
import {checkoutUv} from './checkout-uv.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
// A stand-in release host on the owner's own Mac skips this Codex-backed check (owner decision 2026-10-05; scripts/release-hosts.mjs codexGateSkip).
if(process.env.WORLDLET_CODEX_GATES_SKIP){console.log('SKIP onboarding flow: '+process.env.WORLDLET_CODEX_GATES_SKIP);process.exit(0);}
const electron=createRequire(import.meta.url)('electron') as unknown as string;
const TIMEOUT_MS=Number(process.env.WORLDLET_ONBOARDING_TIMEOUT_MS||25*60_000);
const fail=(text:string):never=>{console.error('FAIL onboarding flow: '+text);process.exit(1);};

// Fox answers on this computer's Codex CLI and its sign-in.
const codexHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
if(!existsSync(path.join(codexHome,'auth.json')))fail(`missing the local Codex sign-in (${path.join(codexHome,'auth.json')}); sign in with the Codex app or CLI`);

// Each phase's time is printed, so a slow gate run shows where its minutes went (#41).
const began=Date.now(),seconds=(since:number)=>`${Math.round((Date.now()-since)/1000)}s`;
const build=(script:string)=>{const run=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});if(run.status!==0)fail(script+' failed');};
if(!existsSync(path.join(root,'dist/WorldletWeb/index.html')))build('scripts/build-native-ui.ts');
build('scripts/build-electron.ts');
// Fox finishes the journey's task in the browser, so the pinned driver is required here.
if(!process.env.WORLDLET_AGENT_BROWSER)await cachedAgentBrowser(root).catch(error=>fail('the browser driver: '+error.message));
// The driver runs on Worldlet's own tools Python, which uv sets up (scripts/checkout-uv.ts).
const uv=process.env.WORLDLET_UV||checkoutUv(workspace(root).primary)||fail('uv for Worldlet’s local tools could not be installed');
console.log(`Onboarding setup (builds, browser driver): ${seconds(began)}`);

const profile=mkdtempSync(path.join(os.tmpdir(),'worldlet-onboarding-flow-'));
// An empty preferences file: a disposable library never imports this Mac's Worldlet settings.
writeFileSync(path.join(profile,'preferences.json'),'{}\n',{mode:0o600});
// Codex as Fox's Agent, as setup saves a choice (platform/electron/src/store/agent-settings.ts).
mkdirSync(path.join(profile,'agent'),{recursive:true});
writeFileSync(path.join(profile,'agent','local-harness.json'),JSON.stringify({version:1,id:'codex'}),{mode:0o600});
const logs=path.join(root,'.local/electron-checks');mkdirSync(logs,{recursive:true});
const logFile=path.join(logs,'onboarding-flow.log'),log=createWriteStream(logFile);
// RC 录像: pictures of the run for scripts/ui-review.ts (platform/electron/src/checks/index.ts).
const env:NodeJS.ProcessEnv={...process.env,WORLDLET_UV:uv,WORLDLET_DEV:'1',WORLDLET_REPO_ROOT:root,WORLDLET_CHECK_FRAMES:path.join(logs,'onboarding-flow-frames'),WORLDLET_PROFILE_ROOT:profile};
// The tour's phone step waits two minutes after the first win; here it waits WORLDLET_TOUR_CODA_MS (default 20 s), still
// proven to wait and to come at a calm moment, so the gate's budget is not spent idle (#41). world-tour-check.ts (test:ui)
// holds the two minutes on a moved clock.
env.WORLDLET_TOUR_CODA_MS=process.env.WORLDLET_TOUR_CODA_MS||'20000';
for(const key of ['ELECTRON_RUN_AS_NODE','WORLDLET_DEV_MODEL','WORLDLET_AGENT_CONFIG','WORLDLET_WORKTREE_PROFILE','WORLDLET_WEB_ROOT','WORLDLET_CAPTURE'])delete env[key];
console.log(`Onboarding flow: library ${profile}, Codex home ${codexHome}, log ${path.relative(root,logFile)}`);
const started=Date.now();
const child=spawn(electron,[path.join(root,'dist/electron'),'--check','onboarding-flow'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
for(const [stream,out] of [[child.stdout,process.stdout],[child.stderr,process.stderr]] as const)stream.on('data',data=>{out.write(data);log.write(data);});
let timedOut=false;
const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),10_000).unref();},TIMEOUT_MS);
const code=await new Promise<number>(resolve=>child.on('close',(status,signal)=>resolve(status??(signal?1:0))));
clearTimeout(timer);
const summary=timedOut?`FAIL onboarding flow: timed out after ${TIMEOUT_MS/60_000} minutes`:`onboarding flow exited ${code} after ${Math.round((Date.now()-started)/1000)}s`;
log.write(summary+'\n');await new Promise(resolve=>log.end(resolve));
if(timedOut||code!==0){
 // A release host removes its temporary folders after the RC (Mac RC 3001 lost this library), so the evidence is
 // copied into the primary checkout too, newest three kept.
 let kept=profile;
 try{
  const evidence=path.join(workspace(root).primary,'.local/electron-checks/onboarding-flow-failed'),into=path.join(evidence,new Date().toISOString().replace(/[:.]/g,'-'));
  mkdirSync(into,{recursive:true});
  for(const name of ['logs','world.sqlite','world.sqlite-wal','world.sqlite-shm'])if(existsSync(path.join(profile,name)))cpSync(path.join(profile,name),path.join(into,name),{recursive:true});
  cpSync(logFile,path.join(into,'onboarding-flow.log'));
  for(const old of readdirSync(evidence).sort().slice(0,-3))rmSync(path.join(evidence,old),{recursive:true,force:true});
  kept+=` and ${into}`;
 }catch(error){console.error('Could not copy the library for evidence: '+(error as Error).message);}
 console.error(summary+`; library kept at ${kept} (logs/diagnostics.jsonl, world.sqlite)`);process.exit(1);
}
console.log(summary);
// The website engine and its helpers are their own processes, started with this library's path, and
// can outlive the host while still writing Browser/CEF. rmSync's own retries only repeat the last
// rmdir, so files written meanwhile kept it failing (#1239): wait for them to exit (ending them after
// 15 s), then remove the whole tree again on each attempt. The journey passed, so a library that still
// cannot be removed is reported and left in the temporary folder.
const cleanup=Date.now(),sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const holders=()=>process.platform==='win32'?[]:(spawnSync('pgrep',['-f',profile],{encoding:'utf8'}).stdout??'').split('\n').map(Number).filter(Boolean);
for(let waited=0;waited<20_000&&holders().length;waited+=250){
 if(waited===15_000)for(const pid of holders())try{process.kill(pid,'SIGKILL');}catch{}
 await sleep(250);
}
let removed=false;
for(let attempt=0;attempt<10&&!removed;attempt++){
 try{rmSync(profile,{recursive:true,force:true});removed=true;}catch{await sleep(500);}
}
if(!removed)console.warn(`warning: could not remove the onboarding library ${profile} (still held by ${holders().join(', ')||'no process'})`);
console.log(`Onboarding cleanup: ${seconds(cleanup)}; whole run ${seconds(began)}`);
