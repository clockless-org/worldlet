// The Electron host suite (npm run test:electron): host contract, module checks and an app smoke run.
// Each check uses a disposable library; none contacts a real account or model.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readdirSync,readFileSync,rmSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createWindowsCheckCoordinator} from './windows-check-coordination.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const electron=createRequire(import.meta.url)('electron') as unknown as string;
const only=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const results:{name:string,ok:boolean,detail:string}[]=[];
const record=(name:string,ok:boolean,detail='')=>{results.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?'  '+detail:''));};
let coordinatorFinish=(_ok:boolean)=>{};
const wanted=(name:string)=>!only.length||only.some(part=>name.includes(part));
const env=(extra:NodeJS.ProcessEnv={})=>{const value:NodeJS.ProcessEnv={...process.env,WORLDLET_DEV:'1',WORLDLET_QUIET:'1',WORLDLET_REPO_ROOT:root,...extra};delete value.ELECTRON_RUN_AS_NODE;return value;};

if(!existsSync(path.join(root,'dist/WorldletWeb/index.html')))spawnSync(process.execPath,['scripts/build-native-ui.ts'],{cwd:root,stdio:'inherit'});
if(spawnSync(process.execPath,['scripts/build-electron.ts'],{cwd:root,stdio:'inherit'}).status!==0)throw Error('Electron host build failed.');
const scratch=mkdtempSync(path.join(os.tmpdir(),'worldlet-electron-checks-'));

// 1. Every action the shared UI sends is registered (pseudo-actions the UI handles itself excepted; `warm` is
// companion-ai's name for the host's `agentWarm`, which the `nativeCall` scan below still requires).
const UI_INTERNAL=new Set(['chat','steer','cancel','replyAction','background','warm']);
function uiActions(){
 const found=new Set<string>();
 const walk=(dir:string)=>{for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){if(entry.name!=='node_modules')walk(file);continue;}
  if(!/\.(ts|js)$/.test(entry.name))continue;
  const source=readFileSync(path.join(root,file),'utf8');
  for(const match of source.matchAll(/\b(?:callHost|call|host|nativeCall\??\.?)\(\s*'([a-zA-Z]+)'/g))found.add(match[1]);
  for(const match of source.matchAll(/action\s*:\s*'([a-zA-Z]+)'/g))if(/worldletHost|request\(/.test(source))found.add(match[1]);
 }};
 for(const dir of ['ui','core','platform/bridge'])walk(dir);
 return [...found].filter(name=>!UI_INTERNAL.has(name)).sort();
}
if(wanted('host-contract')){
 const run=spawnSync(electron,[path.join(root,'dist/electron'),'--host-contract-check'],{cwd:root,env:env({WORLDLET_PROFILE_ROOT:path.join(scratch,'contract')}),encoding:'utf8',timeout:60000});
 const line=run.stdout.split('\n').find(text=>text.startsWith('{'));
 if(!line)record('host-contract',false,'no report: '+(run.stderr||'').slice(-400));
 else{
  const report=JSON.parse(line),registered=new Set(report.actions);
  const missing=uiActions().filter(action=>!registered.has(action));
  record('host-contract',!missing.length,missing.length?'unregistered UI actions: '+missing.join(', '):`${report.actions.length} actions, services ${report.services.join(',')}`);
  writeFileSync(path.join(scratch,'host-contract.json'),JSON.stringify(report,null,1));
 }
}

// 2. Module checks: platform/electron/src/**/check.ts, bundled and run under Electron's Node.
function checks(dir:string):string[]{
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const file=path.join(dir,entry.name);return entry.isDirectory()?checks(file):entry.name==='check.ts'?[file]:[];});
}
for(const file of checks(path.join(root,'platform/electron/src')).sort()){
 const name='module:'+path.relative(path.join(root,'platform/electron/src'),path.dirname(file));
 if(!wanted(name))continue;
 const outfile=path.join(scratch,name.replace(/[^a-z0-9-]+/gi,'_')+'.mjs');
 // ESM: checks use top-level await; bundled CommonJS dependencies still get a require.
 try{await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'esm',target:'node24',external:['electron'],logLevel:'error',banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"}});}
 catch(error){record(name,false,'bundle failed: '+error.message.split('\n')[0]);continue;}
 const home=path.join(scratch,name.replace(/[^a-z0-9-]+/gi,'_'));mkdirSync(home,{recursive:true});
 // Checks that import Electron APIs run in a real main process (no window); others under Electron's Node.
 const wrapper=outfile.replace(/\.mjs$/,'.main.mjs');
 // No top-level await here: Electron emits ready only after an ESM entry's top level settles.
 // Windowed checks read pixels back (modules/browser/engine): as in a capture run (#1057, #1060), Windows occlusion
 // tracking must not evict the window's surface and the display stays on, or capturePage rejects (RC b10523a0, #1218).
 // Each run keeps its own Electron storage (cookies, persist: partitions) in its scratch home, never the user-wide
 // default: a check that left cookies there (or another run beside it) changed what the next run read (Mac RC 3252,
 // modules/browser/engine's shared sign-in step).
 writeFileSync(wrapper,`import {app,powerSaveBlocker} from 'electron';app.dock?.hide();app.setPath('userData',${JSON.stringify(path.join(home,'Electron'))});
if(process.platform==='win32')app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
app.whenReady().then(()=>{powerSaveBlocker.start('prevent-display-sleep');}).then(()=>import(${JSON.stringify('./'+path.basename(outfile))})).then(()=>app.exit(process.exitCode??0),error=>{console.error(error?.stack||error);app.exit(1);});`);
 const real=/from 'electron'/.test(readFileSync(file,'utf8'));
 const run=spawnSync(electron,[real?wrapper:outfile],{cwd:root,env:{...env({WORLDLET_CHECK_ROOT:home}),...(real?{}:{ELECTRON_RUN_AS_NODE:'1'})},encoding:'utf8',timeout:240000});
 const output=(run.stdout+run.stderr).trim().split('\n');
 record(name,run.status===0,run.status===0?output.filter(line=>/^PASS/.test(line)).length+' passed':output.slice(-6).join(' | '));
}

// 3. App smoke: the World opens on a fresh library and the core requests answer.
if(wanted('smoke')){
 const profile=path.join(scratch,'smoke'),shot=path.join(scratch,'smoke.png');
 const probe=`(async()=>{const h=window.worldletHost,r=a=>h.request(a);const out={};
  out.platform=h.platform;
  const s=await r({action:'snapshot'});out.snapshot=['platform','hostCapabilities','onboarding','connections','worldItems','overlay'].every(k=>k in s);
  for(const action of ['foxPreferences','modelStatus','companionProfile','worldHistory','diagnostics','worldAudio','weatherLoad','appUpdate','devBuildStatus','desktopCompanionState','conversationRecall','loginItem']){
   try{await r({action,...(action==='worldAudio'?{operation:'status'}:{}),...(action==='emailAction'?{operation:'list'}:{})});out[action]='ok';}catch(e){out[action]='error: '+e.message;}
  }
  try{await r({action:'noSuchAction'});out.unknown='accepted';}catch(e){out.unknown='rejected';}
  // Private-context gates hold on a fresh library.
  try{await r({action:'emailAction',operation:'list'});out.privateGate='open';}catch(e){out.privateGate=/private context/.test(e.message)?'ok':'error: '+e.message;}
  return JSON.stringify(out);})()`;
 const smokeEnv=env({WORLDLET_PROFILE_ROOT:profile,WORLDLET_CAPTURE:shot,WORLDLET_CAPTURE_PROBE:probe,WORLDLET_CAPTURE_WAIT:'20000'});
 // One smoke run: launch, collect the report, judge it. `flags` go to Chromium before the app path.
 const smoke=async(flags:string[]=[])=>{
  let output='',code:number|null;
  rmSync(shot,{force:true});
  // A Windows release gate runs the windowed stage on the coordinated, CU-verified desktop.
  const coordinator=process.platform==='win32'?createWindowsCheckCoordinator(root,path.join(root,'dist/electron'),process.env,{exe:electron,dll:path.join(root,'dist/electron/main.cjs')}):null;
  if(coordinator){
   coordinatorFinish=ok=>coordinator.finish(ok);
   try{await coordinator.run('smoke',electron,[...flags,path.join(root,'dist/electron')],smokeEnv);code=0;}catch{code=1;}
   const gate=JSON.parse(readFileSync(path.join(root,'.worldlet-task/windows-check/current.json'),'utf8'));
   output=readFileSync(path.join(gate.directory,'smoke.stdout.log'),'utf8');
  }else{
   const child=spawn(electron,[...flags,path.join(root,'dist/electron')],{cwd:root,env:smokeEnv});
   child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
   const timer=setTimeout(()=>child.kill('SIGKILL'),120000);
   code=await new Promise<number|null>(resolve=>child.on('close',resolve));clearTimeout(timer);
  }
  const json=output.slice(output.indexOf('{\n'));
  let report:any=null;try{report=JSON.parse(json.slice(0,json.lastIndexOf('}')+1));}catch{}
  let probeResult:Record<string,unknown>|null=null;try{probeResult=report?.probe?JSON.parse(report.probe):null;}catch{}
  // Without a report, say how the run ended and what it printed last instead of only 'no probe result' (#1045).
  const ended=code===null?'killed after 120 s':'exit '+code,tail=output.trim().split(/\r?\n/).slice(-3).join(' | ').slice(0,400);
  const failures=report?.stalled?.length?['stalled: '+report.stalled.join(', ')]:probeResult?Object.entries(probeResult).filter(([key,value])=>key==='unknown'?value!=='rejected':key==='snapshot'?value!==true:key==='platform'?false:value!=='ok').map(([key,value])=>`${key}=${value}`)
   :[report?.probe?'probe: '+report.probe:`no probe result (${ended}${tail?'; last output: '+tail:''})`];
  const shotOK=existsSync(shot)&&statSync(shot).size>10000;
  // A GPU-process exit is named even when the run passed (#1060).
  const gpu=report?.gpuExits?.length?`; GPU process exited: ${report.gpuExits.join(', ')}`:'';
  return {ok:code===0&&!!report&&report.outcome!=='error'&&!failures.length&&shotOK,report,detail:(failures.length?failures.join('; '):`outcome ${report?.outcome}, frame ${shotOK?'saved':'missing'}`)+gpu};
 };
 let result=await smoke();
 // On Windows the RC's windowed run can lose its GPU display surface ("Current display surface not
 // available for capture", 01, 2026-10-01, #1057) while the same run started alone renders. It is run
 // once more without GPU compositing and the fallback is named in the result; the final-artifact release
 // smoke still judges the installed app's own window. The cause was 01's display turning off: Chromium's
 // occlusion tracking evicts the surface (fixed by #1057 and #1060). The report also names GPU-process exits.
 if(!result.ok&&process.platform==='win32'&&/display surface not available/.test(result.detail)){
  const first=result.detail;result=await smoke(['--disable-gpu-compositing']);
  result.detail=`${result.detail} (GPU compositing fallback after: ${first.slice(0,200)})`;
 }
 record('smoke',result.ok,result.detail);
 const report=result.report;
 if(report?.errors?.length)console.log('  page warnings: '+report.errors.slice(0,5).join(' | '));
}

const failed=results.filter(result=>!result.ok);
console.log(`\n${results.length-failed.length}/${results.length} Electron host checks passed`+(failed.length?`; evidence kept in ${scratch}`:''));
coordinatorFinish(!failed.length);
if(failed.length)process.exitCode=1;else rmSync(scratch,{recursive:true,force:true});
