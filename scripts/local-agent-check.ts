// npm run test:agent:local: Fox on this computer's Codex CLI, for real (Mac and Windows release
// gates), as the Electron host's development check `--check local-agent-flow`
// (platform/electron/src/checks/local-agent-flow.ts). Builds the host (and the interface when
// missing), opens a disposable practice-world library with Codex chosen as Fox's local Agent
// Harness, and propagates the check's exit code. Only the local Codex sign-in is used: the
// Worldlet model service is never called and no real account is read. Without a Codex sign-in
// here the run reports SKIP and passes. A failed run keeps its library for diagnosis.
import {spawn,spawnSync} from 'node:child_process';
import {createWriteStream,existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
// A stand-in release host on the owner's own Mac skips this Codex-backed check (owner decision 2026-10-05; scripts/release-hosts.mjs codexGateSkip).
if(process.env.WORLDLET_CODEX_GATES_SKIP){console.log('SKIP local agent flow: '+process.env.WORLDLET_CODEX_GATES_SKIP);process.exit(0);}
const electron=createRequire(import.meta.url)('electron') as unknown as string;
const TIMEOUT_MS=Number(process.env.WORLDLET_LOCAL_AGENT_TIMEOUT_MS||25*60_000);
const fail=(text:string):never=>{console.error('FAIL local agent flow: '+text);process.exit(1);};

const codexHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
if(!existsSync(path.join(codexHome,'auth.json'))){
 console.log(`SKIP local agent flow: no Codex sign-in on this computer (${path.join(codexHome,'auth.json')}); sign in with the Codex CLI to run Fox on it`);
 process.exit(0);
}

const build=(script:string)=>{const run=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});if(run.status!==0)fail(script+' failed');};
if(!existsSync(path.join(root,'dist/WorldletWeb/index.html')))build('scripts/build-native-ui.ts');
build('scripts/build-electron.ts');

const profile=mkdtempSync(path.join(os.tmpdir(),'worldlet-local-agent-'));
// The practice world (fictional example.com mail) and Codex as Fox's Agent, as setup saves them
// (the earlier agent/local-harness.json file, which moves into the World's database on first read;
// platform/electron/src/store/agent-settings.ts).
writeFileSync(path.join(profile,'preferences.json'),JSON.stringify({'worldlet.sampleEnabled':true})+'\n',{mode:0o600});
mkdirSync(path.join(profile,'agent'),{recursive:true});
writeFileSync(path.join(profile,'agent','local-harness.json'),JSON.stringify({version:1,id:'codex'}),{mode:0o600});
const logs=path.join(root,'.local/electron-checks');mkdirSync(logs,{recursive:true});
const logFile=path.join(logs,'local-agent-flow.log'),log=createWriteStream(logFile);
// RC 录像: pictures of the run for scripts/ui-review.ts (platform/electron/src/checks/index.ts).
const env:NodeJS.ProcessEnv={...process.env,WORLDLET_DEV:'1',WORLDLET_REPO_ROOT:root,WORLDLET_CHECK_FRAMES:path.join(logs,'local-agent-flow-frames'),WORLDLET_PROFILE_ROOT:profile};
// WORLDLET_DEV_MODEL would point Hermes at the Worldlet model service; this run never uses Hermes.
for(const key of ['ELECTRON_RUN_AS_NODE','WORLDLET_DEV_MODEL','WORLDLET_AGENT_CONFIG','WORLDLET_WORKTREE_PROFILE','WORLDLET_WEB_ROOT','WORLDLET_CAPTURE'])delete env[key];
console.log(`Local agent flow: library ${profile}, Codex home ${codexHome}, log ${path.relative(root,logFile)}`);
const started=Date.now();
const child=spawn(electron,[path.join(root,'dist/electron'),'--check','local-agent-flow'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let tail='';
for(const [stream,out] of [[child.stdout,process.stdout],[child.stderr,process.stderr]] as const)stream.on('data',data=>{out.write(data);log.write(data);tail=(tail+String(data)).slice(-20_000);});
let timedOut=false;
const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),10_000).unref();},TIMEOUT_MS);
const code=await new Promise<number>(resolve=>child.on('close',(status,signal)=>resolve(status??(signal?1:0))));
clearTimeout(timer);
const summary=timedOut?`FAIL local agent flow: timed out after ${TIMEOUT_MS/60_000} minutes`:`local agent flow exited ${code} after ${Math.round((Date.now()-started)/1000)}s`;
log.write(summary+'\n');await new Promise(resolve=>log.end(resolve));
if(timedOut||code!==0){
 // The Codex service rejects a newer model from an old CLI (#1357): name the fix, not only the 400.
 if(/requires a newer version of Codex/.test(tail))console.error('The Codex CLI on this computer is too old for the model in '+path.join(codexHome,'config.toml')+'. Upgrade it (npm install -g @openai/codex@latest, or brew upgrade --cask codex); release hosts do this before their RC gates.');
 console.error(summary+`; library kept at ${profile}`);process.exit(1);
}
console.log(summary);
// Website-engine helpers can outlive the host for a moment; a library that cannot be removed is left in the temporary folder.
for(let attempt=0;attempt<10;attempt++){
 try{rmSync(profile,{recursive:true,force:true});break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}
}
