// Electron development: prepare a candidate (host + interface) per change, then Apply explicitly.
// The running Dev app is never replaced by the watcher itself, and stopping the watcher never closes it.
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {watch,openSync,readFileSync,writeFileSync,rmSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {devChange} from './dev-change-policy.ts';
import {workspace,git,lock,locked,waitForLock,processAlive} from './dev-workspace.ts';
import {installPrimaryGuard} from './primary-guard.mjs';
import {checkoutUv} from './checkout-uv.ts';
import {DeferredDevUpdate,failureDetail,pullRequestNumber} from './dev-deferred-update.ts';
import {devInfoPlistEntries,devLaunchConfig,devLauncherFiles,devOpenArguments,devRuntimeStamp,devSigningIdentity} from './mac-app-info.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const checkout=workspace(root);
if((!checkout.linked&&checkout.branch!=='main')||(process.argv.includes('--main')&&checkout.linked))throw Error('dev:main must run in the primary checkout on main.');
// The main Dev app builds only from the primary checkout's main, so keep it there (scripts/primary-guard.mjs).
if(!checkout.linked)try{installPrimaryGuard(root);}catch(error){console.error('Primary guard not installed: '+error.message);}
const home=path.join(root,'.local/dev/electron'),appDir=path.join(home,'app'),webDir=path.join(home,'WorldletWeb'),pidFile=path.join(home,'app.pid');
const updates=new DeferredDevUpdate(appDir,webDir);
if(process.argv.includes('--apply-ready')){const c=await updates.requestCurrent();console.log(`Requested Apply and restart for ${c.revision}.`);process.exit(0);}
const releaseLock=lock(path.join(root,'.local/dev-watcher.lock'));process.on('exit',releaseLock);
// Under the daemon (scripts/machine-dev.mjs) the primary checkout's dependencies follow package-lock.json,
// so a dependency change on main (Electron itself in #996) reaches the Dev app without a manual install.
// Off Mac the running Dev app executes from node_modules/electron, so installing waits until it is stopped: at
// start when no Dev app runs, otherwise during Apply, between stopping the old app and launching the new.
// On Mac it runs from its own copy of Electron.app, so candidate preparation installs first (rebuild below).
const supervised=process.argv.includes('--supervised');
const deps=path.join(home,'dependencies.json'),lockDigest=()=>createHash('sha256').update(readFileSync(path.join(root,'package-lock.json'))).digest('hex');
function dependenciesCurrent(){let installed='';try{installed=JSON.parse(readFileSync(deps,'utf8')).lock;}catch{}return installed===lockDigest()&&existsSync(path.join(root,'node_modules/electron/dist'));}
function ensureDependencies(){
 if(dependenciesCurrent())return;
 const digest=lockDigest();
 console.log('Installing dependencies for package-lock.json '+digest.slice(0,12)+'…');
 const npm=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--no-audit','--no-fund'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
 if(npm.status!==0)throw Error('npm ci failed; the Dev watcher stops and the daemon retries later.');
 if(!existsSync(path.join(root,'node_modules/electron/dist'))&&spawnSync(process.execPath,[path.join(root,'node_modules/electron/install.js')],{cwd:root,stdio:'inherit'}).status!==0)throw Error('The Electron binary could not be installed.');
 mkdirSync(home,{recursive:true});writeFileSync(deps,JSON.stringify({lock:digest,installedAt:new Date().toISOString()}));
}
const electronBinary=()=>createRequire(import.meta.url)('electron') as unknown as string;
// On Mac the Dev app is a renamed copy of Electron.app: its own name in the Dock and menu bar, the DEV
// icon, the development bundle identity (macOS permissions and the one-time UserDefaults import
// follow it) and the packaged app's privacy usage descriptions (scripts/mac-app-info.ts). Rebuilt only
// when Electron, the icon source, the identity, the signing certificate or those Info.plist entries change.
async function devRuntime(){
 if(process.platform!=='darwin')return electronBinary();
 const source=path.resolve(path.dirname(electronBinary()),'../..'),bundleId=checkout.bundleId,name='Worldlet Dev';
 const icon=path.join(root,'resources/styles/builtin/assets/brand/worldlet-app-icon.svg');
 const signer=devSigningIdentity(spawnSync('security',['find-identity','-v','-p','codesigning'],{encoding:'utf8',timeout:15000}).stdout??'',process.env);
 const stamp=devRuntimeStamp({electronInfoPlist:readFileSync(path.join(source,'Contents/Info.plist'),'utf8'),icon:readFileSync(icon,'utf8'),iconScript:readFileSync(path.join(root,'scripts/app-icon.ts'),'utf8'),name,bundleId,signer});
 const app=path.join(home,'runtime',name+'.app'),stampFile=path.join(home,'runtime','stamp');
 let current='';try{current=readFileSync(stampFile,'utf8');}catch{}
 if(current!==stamp||!existsSync(app)){
  rmSync(path.join(home,'runtime'),{recursive:true,force:true});mkdirSync(path.join(home,'runtime'),{recursive:true});
  await run('ditto',[source,app]);
  const {macIcon}=await import('./app-icon.ts');
  await macIcon(root,path.join(app,'Contents/Resources/WorldletDev.icns'),{dev:true});
  const plist=path.join(app,'Contents/Info.plist');
  for(const [key,value] of devInfoPlistEntries(name,bundleId))await run('plutil',['-replace',key,'-string',value,plist]);
  const launcher=path.join(app,'Contents/Resources/app');mkdirSync(launcher,{recursive:true});
  for(const [file,content] of Object.entries(devLauncherFiles))writeFileSync(path.join(launcher,file),content);
  // Editing Info.plist invalidates Electron's signature, so the bundle is signed again: with a certificate when
  // this Mac has one, so macOS keeps its permission grants across rebuilds (scripts/mac-app-info.ts), and ad hoc
  // otherwise or when the certificate cannot be used without someone at the keychain prompt.
  const signed=signer!=='-'&&spawnSync('codesign',['--force','--deep','--timestamp=none','--sign',signer,app],{stdio:'inherit',timeout:120000}).status===0;
  if(!signed)await run('codesign',['--force','--deep','--sign','-',app]);
  writeFileSync(stampFile,stamp);
 }
 return path.join(app,'Contents/MacOS/Electron');
}
const check=process.argv.includes('--check'),watchers:ReturnType<typeof watch>[]=[];
let closing=false,busy=false,queued=false,timer:NodeJS.Timeout|undefined,headTimer:NodeJS.Timeout|undefined,controlTimer:NodeJS.Timeout|undefined,attemptedHead='';
const integrationLock=checkout.linked?path.join(root,'.local/dev-candidate.lock'):path.join(checkout.common,'worldlet-integration.lock');
// stderr still reaches the watcher log in full; the failure message carries its first real error,
// because Dev shows only that message (an esbuild "Could not resolve" read as just "exited 1").
async function run(command:string,args:string[],extra:NodeJS.ProcessEnv={}){
 const child=spawn(command,args,{cwd:root,env:{...process.env,...extra},stdio:['inherit','inherit','pipe']});
 let stderr='';child.stderr!.on('data',chunk=>{process.stderr.write(chunk);stderr=(stderr+chunk).slice(-20000);});
 const [code]=await once(child,'exit');if(code!==0)throw Error(`${path.basename(command)} ${args[0]} exited ${code}${failureDetail(stderr)}`);
}
const runningPid=()=>{try{const pid=Number(readFileSync(pidFile,'utf8'));return pid&&processAlive(pid)?pid:0;}catch{return 0;}};
async function stopApp(){
 const pid=runningPid();if(!pid)return;
 process.kill(pid,'SIGTERM');
 for(let i=0;i<100&&processAlive(pid);i++)await new Promise(resolve=>setTimeout(resolve,100));
 if(processAlive(pid))throw Error('Worldlet is still closing; development build was not replaced.');
 rmSync(pidFile,{force:true});
}
async function launch(){
 if(runningPid())return;
 const logFile=path.join(home,'worldlet.log');
 // Worldlet's own tools Python needs uv (scripts/checkout-uv.ts), the primary checkout's, shared by every worktree.
 const uv=checkoutUv(checkout.primary);
 const env:NodeJS.ProcessEnv={...process.env,WORLDLET_DEV:'1',WORLDLET_REPO_ROOT:root,WORLDLET_WEB_ROOT:webDir,WORLDLET_DEV_UPDATE_DIR:home,WORLDLET_DEV_PID_FILE:pidFile,
  WORLDLET_WINDOW_TITLE:checkout.linked?`Worldlet Dev — ${checkout.label}`:'Worldlet Dev',...(checkout.linked?{WORLDLET_WORKTREE_PROFILE:checkout.id}:{}),
  ...(uv?{WORLDLET_UV:uv}:{})};
 delete env.ELECTRON_RUN_AS_NODE;
 const binary=await devRuntime();
 if(process.platform==='darwin'){
  // LaunchServices starts the app, so macOS permission requests name Worldlet Dev rather than this Node process
  // (scripts/mac-app-info.ts); the app writes its own process id to WORLDLET_DEV_PID_FILE.
  rmSync(pidFile,{force:true});
  writeFileSync(path.join(home,'launch.json'),JSON.stringify(devLaunchConfig(appDir,env),null,1),{mode:0o600});
  await run('/usr/bin/open',devOpenArguments(path.resolve(binary,'../../..'),appDir,logFile,env));
  for(let i=0;i<300&&!runningPid();i++)await new Promise(resolve=>setTimeout(resolve,100));
  if(!runningPid())throw Error('Worldlet Dev did not report its process within 30 s; see '+logFile);
 }else{
  const log=openSync(logFile,'a');
  const child=spawn(binary,[appDir],{cwd:root,env,detached:true,stdio:['ignore',log,log]});
  child.unref();writeFileSync(pidFile,String(child.pid));
 }
 console.log(checkout.label+': Dev launch requested. Actual window readiness requires verification.');
}
async function candidate(app:string,web:string){
 await run(process.execPath,['scripts/build-electron.ts','--out',app]);
 await run(process.execPath,['scripts/build-native-ui.ts'],{WORLDLET_UI_BUILD_PUBLISH_DIR:web});
}
async function rebuild(){
 if(busy||closing)return;
 if(!check&&locked(integrationLock)){clearTimeout(timer);timer=setTimeout(rebuild,500);return;}
 busy=true;queued=false;let unlock:()=>void;
 try{unlock=check?await waitForLock(integrationLock,20*60000,pid=>console.log(`Waiting for process ${pid} to release the integration lock…`)):lock(integrationLock);}
 catch(error){busy=false;if(check){updates.state.error=error.message;console.error(error.message);}else schedule();return;}
 try{
  if(!checkout.linked&&git(root,'branch','--show-current')!=='main')throw Error('Primary checkout left main.');
  const head=git(root,'rev-parse','HEAD');
  if(!checkout.linked&&git(root,'status','--porcelain'))throw Error('Main has local changes; candidate preparation waits for a clean checkout.');
  attemptedHead=head;
  // A dependency added on main (qrcode-generator in #1470) must be installed before the candidate builds.
  // On Mac the running Dev app is its own copy of Electron.app, so installing does not disturb it.
  if(supervised&&!dependenciesCurrent()){
   if(process.platform==='darwin'||!runningPid())ensureDependencies();
   else throw Error('package-lock.json changed; quit Worldlet Dev so the new dependencies can be installed.');
  }
  await updates.prepare(head,async(app,web)=>{await candidate(app,web);if(git(root,'rev-parse','HEAD')!==head||(!checkout.linked&&git(root,'status','--porcelain')))throw Error('Source changed during candidate preparation; current app retained.');},git(root,'show','-s','--format=%cI',head),pullRequestNumber(git(root,'show','-s','--format=%s',head)),commitsBehind(updates.state.current,head));
  console.log(`Dev build ${head.slice(0,7)} ready. Current app unchanged; choose Apply in Dev, or explicitly run npm run dev -- --apply-ready.`);
 }catch(error){updates.state.error=error.message;await updates.publish();console.error(error.message);}
 finally{unlock!();busy=false;if(queued)schedule();}
}
// Commits the running app is behind the candidate, counted in the local checkout once per candidate.
// Unknown until an Apply records the running revision, or if that commit is no longer in the repository.
function commitsBehind(current:string|undefined,head:string){
 if(!current)return undefined;
 try{const count=Number(git(root,'rev-list','--count',`${current}..${head}`));return Number.isInteger(count)?count:undefined;}catch{return undefined;}
}
function schedule(){queued=true;clearTimeout(timer);timer=setTimeout(rebuild,250);}
async function control(){
 if(busy||closing)return;
 busy=true;
 try{const id=await updates.requested();if(id)await updates.apply(id,stopApp,async()=>{if(supervised)ensureDependencies();await launch();});}
 catch(error){updates.state.error=error.message;console.error(error.message);}
 finally{await updates.publish();busy=false;if(queued)schedule();}
}
async function close(){if(closing)return;closing=true;clearTimeout(timer);clearInterval(headTimer);clearInterval(controlTimer);for(const watcher of watchers)watcher.close();updates.state.online=false;await updates.publish();process.exit(check?1:0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
if(supervised&&!runningPid())ensureDependencies();
await updates.restore();
const restored=updates.state.candidate?.id;
console.log(runningPid()?'Adopted the existing Dev app without restarting or reloading it.':'No running Dev app. Preparation only; Apply explicitly to launch a prepared build.');
if(!check)controlTimer=setInterval(()=>{void control();},1000);
await rebuild();
if(check){updates.state.online=false;await updates.publish();const head=git(root,'rev-parse','HEAD'),c=updates.state.candidate;
 if(!c||c.id===restored||c.revision!==head){console.error(`No Dev candidate prepared for ${head.slice(0,7)}.`);process.exit(1);}
 console.log(`Candidate ${head.slice(0,7)} prepared; current app and published web resources unchanged.`);process.exit(0);}
// Feature previews react to edits, but main only prepares committed, clean changes.
if(checkout.linked){
 for(const name of ['ui','core','contracts','resources','platform/bridge','platform/electron','platform/local-tools','platform/browser','platform/web-engine','scripts'])watchers.push(watch(path.join(root,name),{recursive:true},(_event,file)=>{if(!String(file??'').includes('node_modules'))schedule();}));
 for(const name of ['release.json','package.json','package-lock.json'])watchers.push(watch(path.join(root,name),()=>schedule()));
}
headTimer=setInterval(()=>{
 if(closing||busy||locked(integrationLock))return;
 try{const head=git(root,'rev-parse','HEAD');if(head===attemptedHead)return;
  if(attemptedHead&&devChange(git(root,'diff','--name-only','-z',attemptedHead,head).split('\0'))==='none'){attemptedHead=head;return;}
  schedule();
 }catch(error){console.error(error.message);}
},1500);
