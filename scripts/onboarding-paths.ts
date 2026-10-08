// RC onboarding paths (#1492): the first-run paths of platform/electron/src/checks/onboarding-paths.ts, one
// launch per phase on one fresh library, each ending with Quit Completely; after each launch nothing may be
// left running with that library (the World, website engine and helper processes).
//   npm run test:onboarding:paths                                  this checkout's development build (no RC gate)
//   node scripts/onboarding-paths.ts --app <Worldlet.app|Worldlet.exe> --out <dir>    the signed package (RC package smoke)
// A packaged release opens a disposable library only when this launcher names one: a fresh worldlet-rc-* folder
// in the temporary folder holding a one-time token (profile.ts rcCheckRoot). Every launch also finds a fixture
// OpenClaw (scripts/setup-fixtures.ts) first on PATH and in OPENCLAW_STATE_DIR, so a computer without a local
// Agent of its own still walks every path; a SKIP is a failure. A failure fails the RC (BLOCKING, on since
// 2026-10-03: it was advisory until the RC repairs #1536 and #1542 got it passing). Writes <out>/onboarding-paths.json; a failed run keeps its library for diagnosis.
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RC_CHECK_MARKER} from '../platform/electron/src/rc-check.ts';
import {workspace} from './dev-workspace.ts';
import {launchEnvironment,writeOpenClawFixture} from './setup-fixtures.ts';

export const BLOCKING=true;
export const PHASES=[{phase:'choose',minutes:6},{phase:'resume',minutes:10},{phase:'after-reset',minutes:4}];
export const usage='Usage: node scripts/onboarding-paths.ts [--app <Worldlet.app | Worldlet.exe> --out <dir>]';
const root=fileURLToPath(new URL('../',import.meta.url));

export function parseArgs(argv:string[]){
 const options:Record<string,string>={};
 for(let i=0;i<argv.length;i+=2){
  const name=/^--(app|out)$/.exec(argv[i])?.[1],value=argv[i+1];
  if(!name||value===undefined||value.startsWith('--')||name in options)throw Error(usage);
  options[name]=value;
 }
 if(!!options.app!==!!options.out)throw Error(usage);
 if(options.app&&!/(\.app\/?|\.exe)$/i.test(options.app))throw Error('--app must name Worldlet.app or the installed Worldlet.exe');
 return options.app?{app:path.resolve(options.app.replace(/\/$/,'')),out:path.resolve(options.out)}:{};
}
/** What one phase's launch printed: its PASS line, or why not. A SKIP (an older build without an Agent) fails. */
export function phaseOutcome(phase:string,code:number|null,output:string,timedOut:boolean):{ok:boolean,reason:string|null} {
 if(timedOut)return {ok:false,reason:`${phase}: timed out`};
 const failed=/^FAIL onboarding-paths: (.*)$/m.exec(output)?.[1]??/^(SKIP onboarding paths.*)$/m.exec(output)?.[1];
 if(failed)return {ok:false,reason:`${phase}: ${failed}`};
 if(code!==0){const last=output.trim().split(/\r?\n/).at(-1)?.trim().slice(0,300);return {ok:false,reason:`${phase}: exited ${code}${last?` (last output: ${last})`:''}`};}
 if(!new RegExp(`^PASS onboarding paths ${phase}: `,'m').test(output))return {ok:false,reason:`${phase}: exited without its PASS line (did Quit Completely run?)`};
 return {ok:true,reason:null};
}
/** Processes whose command line names the library (Chromium and the website engine pass it to every helper),
 * never this process or, on Windows, the PowerShell running the query: its own command line names the library too. */
export function holders(library:string,{platform=process.platform,run=execFileSync,self=process.pid}={}):number[] {
 const names=[...new Set([library,(()=>{try{return fs.realpathSync(library);}catch{return library;}})()])];
 try{
  if(platform==='win32'){
   const script=`Get-CimInstance Win32_Process | Where-Object { $c=$_.CommandLine; $_.ProcessId -ne $PID -and $c -and (${names.map(n=>`$c.Contains('${n.replace(/'/g,"''")}')`).join(' -or ')}) } | ForEach-Object { $_.ProcessId }`;
   return String(run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:60_000})).split(/\r?\n/).map(Number).filter(pid=>pid>0&&pid!==self);
  }
  return String(run('ps',['-axww','-o','pid=,command='],{encoding:'utf8'})).split('\n')
   .filter(line=>names.some(name=>line.includes(name))).map(line=>Number(line.trim().split(/\s+/)[0])).filter(pid=>pid>0&&pid!==self);
 }catch{return [];}
}
// The app to launch: this checkout's development build, or the package's own executable.
function target(app:string|undefined,library:string,token:string,fixture:ReturnType<typeof writeOpenClawFixture>){
 const clean=launchEnvironment(process.env,fixture,{});
 if(!app){
  const build=(script:string)=>{const r=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});if(r.status!==0)throw Error(script+' failed');};
  if(!fs.existsSync(path.join(root,'dist/WorldletWeb/index.html')))build('scripts/build-native-ui.ts');
  build('scripts/build-electron.ts');
  const electron=createRequire(import.meta.url)('electron') as unknown as string;
  // Fox's built-in Agent signs in to Google, as in test:onboarding: the project Hermes runtime when there is one.
  const python=process.platform==='win32'?'Scripts/python.exe':'bin/python3';
  const hermes=[process.env.WORLDLET_HERMES_PYTHON,path.join(root,'.local/hermes-source/.venv',python),path.join(workspace(root).primary,'.local/hermes-source/.venv',python)].find(file=>!!file&&fs.existsSync(file));
  // Its Google Desktop registration (resources.ts googleClient): a task worktree has none of its own, as with Hermes.
  const google=[process.env.WORLDLET_GOOGLE_CLIENT_FILE,path.join(root,'.local/google-oauth-client.json'),path.join(workspace(root).primary,'.local/google-oauth-client.json')].find(file=>!!file&&fs.existsSync(file));
  return {executable:electron,args:[path.join(root,'dist/electron'),'--check','onboarding-paths'],cwd:root,env:{...clean,WORLDLET_DEV:'1',WORLDLET_REPO_ROOT:root,WORLDLET_PROFILE_ROOT:library,...hermes?{WORLDLET_HERMES_PYTHON:hermes}:{},...google?{WORLDLET_GOOGLE_CLIENT_FILE:google}:{}}};
 }
 let executable=app;
 if(app.endsWith('.app')){
  const name=execFileSync('plutil',['-extract','CFBundleExecutable','raw','-o','-',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  executable=path.join(app,'Contents/MacOS',name);
 }
 if(!fs.existsSync(executable))throw Error('no app at '+executable);
 // Like the Start menu shortcut on Windows: the program folder as working directory.
 return {executable,args:['--check','onboarding-paths'],cwd:process.platform==='win32'?path.dirname(path.dirname(executable)):os.tmpdir(),env:{...clean,WORLDLET_RC_PROFILE_ROOT:library,WORLDLET_RC_CHECK_TOKEN:token}};
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function launch(run:ReturnType<typeof target>,phase:string,minutes:number,logFile:string){
 return new Promise<{code:number|null,output:string,timedOut:boolean,seconds:number}>(resolve=>{
  const log=fs.createWriteStream(logFile),began=Date.now();let output='',timedOut=false;
  const child=spawn(run.executable,run.args,{cwd:run.cwd,env:{...run.env,WORLDLET_ONBOARDING_PATHS_PHASE:phase},stdio:['ignore','pipe','pipe'],windowsHide:false});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{process.stdout.write(data);log.write(data);output=(output+String(data)).slice(-200_000);});
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),10_000).unref();},minutes*60_000);
  const done=(code:number|null)=>{clearTimeout(timer);log.end(()=>resolve({code,output,timedOut,seconds:Math.round((Date.now()-began)/1000)}));};
  child.on('error',error=>{output+=`\nFAIL onboarding-paths: could not start ${run.executable}: ${error.message}\n`;done(null);});
  child.on('close',(code,signal)=>done(code??(signal?1:0)));
 });
}

export async function onboardingPaths({app,out}:{app?:string,out?:string}){
 const evidence=out??path.join(root,'.local/electron-checks/onboarding-paths');
 fs.rmSync(evidence,{recursive:true,force:true});fs.mkdirSync(evidence,{recursive:true});
 const library=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-rc-')),token=randomBytes(32).toString('hex');
 // An empty preferences file: a disposable library never imports this computer's Worldlet settings.
 fs.writeFileSync(path.join(library,'preferences.json'),'{}\n',{mode:0o600});
 // The fixture local Agent, outside the library: Reset Fox must not be able to remove it.
 const agents=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-rc-agents-'));
 const record:{ok:boolean,blocking:boolean,target:string,library:string,reason:string|null,phases:Record<string,unknown>[]}={ok:false,blocking:BLOCKING,target:app??'development build',library,reason:null,phases:[]};
 console.log(`Onboarding paths: ${record.target}, library ${library}, evidence ${evidence}`);
 try{
  const run=target(app,library,token,writeOpenClawFixture(agents));
  for(const {phase,minutes} of PHASES){
   // Reset Fox (end of resume) removes every library file it does not keep, this marker included.
   fs.writeFileSync(path.join(library,RC_CHECK_MARKER),token+'\n',{mode:0o600});
   const result=await launch(run,phase,minutes,path.join(evidence,phase+'.log'));
   const outcome=phaseOutcome(phase,result.code,result.output,result.timedOut);
   // Quit Completely leaves nothing running: helpers get a moment to exit, then the rest are named and ended.
   let left=holders(library);
   for(let waited=0;waited<20_000&&left.length;waited+=500){await sleep(500);left=holders(library);}
   for(const pid of left)try{process.kill(pid,'SIGKILL');}catch{}
   record.phases.push({phase,code:result.code,seconds:result.seconds,timedOut:result.timedOut,leftovers:left,...outcome});
   if(!outcome.ok){record.reason=outcome.reason;break;}
   if(left.length){record.reason=`${phase}: Quit Completely left ${left.length} process${left.length>1?'es':''} running with the library (pid ${left.join(', ')})`;break;}
  }
  record.ok=!record.reason;
 }catch(error){record.reason=String((error as Error)?.message||error);}
 finally{fs.rmSync(agents,{recursive:true,force:true});}
 fs.writeFileSync(path.join(evidence,'onboarding-paths.json'),JSON.stringify(record,null,1)+'\n');
 if(record.ok)for(let attempt=0;attempt<10;attempt++){try{fs.rmSync(library,{recursive:true,force:true});break;}catch{await sleep(1000);}}
 return record;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let options;
 try{options=parseArgs(process.argv.slice(2));}catch(error){console.error((error as Error).message);process.exit(2);}
 const record=await onboardingPaths(options);
 if(record.ok)console.log(`PASS onboarding paths: ${record.phases.map(p=>p.phase).join(' → ')} on ${record.target}, nothing left running after Quit Completely`);
 else console.log(`${BLOCKING?'FAIL':'ADVISORY FAIL'} onboarding paths: ${record.reason}; library kept at ${record.library}`);
 process.exit(record.ok||!BLOCKING?0:1);
}
