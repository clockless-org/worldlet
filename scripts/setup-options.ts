// RC setup options (#1503): every way in on setup's sign-in page, through the real UI of this
// checkout's development build (platform/electron/src/checks/setup-options.ts), one launch on one fresh
// library per option, each ending with Quit Completely; after each launch nothing may be left running
// with that library. Options: mock Google, Continue with Codex, and OpenClaw, Claude Code, pi and
// Hermes Agent brought in from fixture homes (scripts/setup-fixtures.ts), plus OpenClaw with Start fresh.
// The fixtures reach the app only through the Agents' relocation variables and a PATH that finds the
// fixture commands first, so this computer's own Agents are never read; Codex is this computer's own
// (SKIP without a Codex sign-in), and its history is never brought. Fox answers on this computer's model
// source (development: the local Codex sign-in). Development builds only: a release build has no mock
// sign-in and refuses this check.
//   npm run test:onboarding:options                 every option (advisory, no RC gate)
//   node scripts/setup-options.ts openclaw decline  only these options
// New gates report ADVISORY FAIL and pass until they have passed on 01 and 02; then BLOCKING turns on.
// Writes .local/electron-checks/setup-options/setup-options.json; a failed option keeps its library.
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SETUP_OPTIONS} from '../platform/electron/src/checks/setup-option-names.ts';
import {workspace} from './dev-workspace.ts';
import {holders} from './onboarding-paths.ts';
import {FIXTURE_EXPECTATIONS,launchEnvironment,writeSetupFixtures,type FixtureAgent} from './setup-fixtures.ts';

export const BLOCKING=false;
// One option's launch, and the whole run: the gate gives each command 30 minutes (machine-nightly.mjs),
// so options that would not finish in BUDGET_MINUTES are reported as not run rather than killed.
export const MINUTES=7,BUDGET_MINUTES=26;
const root=fileURLToPath(new URL('../',import.meta.url));

export function parseOptions(argv:string[]):string[] {
 const unknown=argv.filter(name=>!(SETUP_OPTIONS as readonly string[]).includes(name));
 if(unknown.length)throw Error(`Unknown option ${unknown.join(', ')}; choose from ${SETUP_OPTIONS.join(', ')}`);
 return argv.length?SETUP_OPTIONS.filter(name=>argv.includes(name)):[...SETUP_OPTIONS];
}
/** What one option's launch printed: its PASS line, a SKIP, or neither. */
export function optionOutcome(option:string,code:number|null,output:string,timedOut:boolean):{ok:boolean,skipped:boolean,reason:string|null} {
 if(timedOut)return {ok:false,skipped:false,reason:`${option}: timed out`};
 if(new RegExp(`^SKIP setup options ${option}\\b`,'m').test(output))return {ok:code===0,skipped:true,reason:code===0?null:`${option}: exited ${code} after SKIP`};
 const failed=/^FAIL setup-options: (.*)$/m.exec(output)?.[1];
 if(failed)return {ok:false,skipped:false,reason:`${option}: ${failed}`};
 if(code!==0){const last=output.trim().split(/\r?\n/).at(-1)?.trim().slice(0,300);return {ok:false,skipped:false,reason:`${option}: exited ${code}${last?` (last output: ${last})`:''}`};}
 if(!new RegExp(`^PASS setup options ${option}: `,'m').test(output))return {ok:false,skipped:false,reason:`${option}: exited without its PASS line (did Quit Completely run?)`};
 return {ok:true,skipped:false,reason:null};
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function launch(executable:string,args:string[],env:Record<string,string>,logFile:string){
 return new Promise<{code:number|null,output:string,timedOut:boolean,seconds:number}>(resolve=>{
  const log=fs.createWriteStream(logFile),began=Date.now();let output='',timedOut=false;
  const child=spawn(executable,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{process.stdout.write(data);log.write(data);output=(output+String(data)).slice(-200_000);});
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),10_000).unref();},MINUTES*60_000);
  const done=(code:number|null)=>{clearTimeout(timer);log.end(()=>resolve({code,output,timedOut,seconds:Math.round((Date.now()-began)/1000)}));};
  child.on('error',error=>{output+=`\nFAIL setup-options: could not start ${executable}: ${error.message}\n`;done(null);});
  child.on('close',(code,signal)=>done(code??(signal?1:0)));
 });
}

export async function setupOptions(options:string[]){
 const evidence=path.join(root,'.local/electron-checks/setup-options');
 fs.rmSync(evidence,{recursive:true,force:true});fs.mkdirSync(evidence,{recursive:true});
 const record:{ok:boolean,blocking:boolean,fixtures:string,reasons:string[],options:Record<string,unknown>[]}={ok:false,blocking:BLOCKING,fixtures:'',reasons:[],options:[]};
 const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-setup-agents-'));record.fixtures=fixtureRoot;
 try{
  const fixtures=writeSetupFixtures(fixtureRoot);
  const build=(script:string)=>{const r=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});if(r.status!==0)throw Error(script+' failed');};
  if(!fs.existsSync(path.join(root,'dist/WorldletWeb/index.html')))build('scripts/build-native-ui.ts');
  build('scripts/build-electron.ts');
  const electron=createRequire(import.meta.url)('electron') as unknown as string;
  const codexSignedIn=fs.existsSync(path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'auth.json'));
  const began=Date.now();
  for(const option of options){
   if((Date.now()-began)/60_000+MINUTES>BUDGET_MINUTES){
    console.log(`SKIP setup options ${option}: not run, the ${BUDGET_MINUTES}-minute budget is spent`);
    record.options.push({option,ok:true,skipped:true,reason:'out of time'});continue;
   }
   if(option==='codex'&&!codexSignedIn){
    console.log('SKIP setup options codex: no Codex sign-in on this computer');
    record.options.push({option,ok:true,skipped:true,reason:null});continue;
   }
   const library=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-setup-'));
   fs.writeFileSync(path.join(library,'preferences.json'),'{}\n',{mode:0o600});
   const agent=option==='google'||option==='codex'?null:option as FixtureAgent;
   const env=launchEnvironment(process.env,fixtures,{WORLDLET_DEV:'1',WORLDLET_REPO_ROOT:root,WORLDLET_PROFILE_ROOT:library,WORLDLET_SETUP_OPTION:option,
    ...agent?{WORLDLET_SETUP_EXPECT:JSON.stringify(FIXTURE_EXPECTATIONS[agent])}:{}});
   console.log(`Setup option ${option}: library ${library}`);
   const result=await launch(electron,[path.join(root,'dist/electron'),'--check','setup-options'],env,path.join(evidence,option+'.log'));
   const outcome=optionOutcome(option,result.code,result.output,result.timedOut);
   let left=holders(library);
   for(let waited=0;waited<20_000&&left.length;waited+=500){await sleep(500);left=holders(library);}
   for(const pid of left)try{process.kill(pid,'SIGKILL');}catch{}
   const reason=outcome.reason??(left.length?`${option}: Quit Completely left ${left.length} process${left.length>1?'es':''} running with the library (pid ${left.join(', ')})`:null);
   record.options.push({option,code:result.code,seconds:result.seconds,library,leftovers:left,...outcome,ok:!reason,reason});
   if(reason)record.reasons.push(reason+`; library kept at ${library}`);
   else for(let attempt=0;attempt<10;attempt++){try{fs.rmSync(library,{recursive:true,force:true});break;}catch{await sleep(1000);}}
  }
  record.ok=!record.reasons.length;
 }catch(error){record.reasons.push(String((error as Error)?.message||error));}
 finally{fs.rmSync(fixtureRoot,{recursive:true,force:true});}
 fs.writeFileSync(path.join(evidence,'setup-options.json'),JSON.stringify(record,null,1)+'\n');
 return record;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let options;
 try{options=parseOptions(process.argv.slice(2));}catch(error){console.error((error as Error).message);process.exit(2);}
 const record=await setupOptions(options);
 const passed=record.options.filter(o=>o.ok&&!o.skipped).map(o=>o.option),skipped=record.options.filter(o=>o.skipped).map(o=>o.option);
 if(record.ok)console.log(`PASS setup options: ${passed.join(', ')||'none'} reached the World and Fox answered${skipped.length?`; skipped ${skipped.join(', ')}`:''}`);
 else console.log(`${BLOCKING?'FAIL':'ADVISORY FAIL'} setup options: ${record.reasons.join(' | ')}`);
 process.exit(record.ok||!BLOCKING?0:1);
}
