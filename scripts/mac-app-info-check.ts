// The Dev/worktree and packaged Mac apps declare the same privacy usage descriptions, and a change to
// them rebuilds the cached Dev bundle (#1135). Synthetic: no plutil, codesign or macOS prompt involved.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {devInfoPlistEntries,devLaunchConfig,devLauncherFiles,devOpenArguments,devRuntimeStamp,devSigningIdentity,macUsageDescriptions} from './mac-app-info.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const keys=Object.keys(macUsageDescriptions);
for(const key of ['NSLocationUsageDescription','NSLocationWhenInUseUsageDescription','NSCalendarsFullAccessUsageDescription','NSRemindersFullAccessUsageDescription','NSMicrophoneUsageDescription','NSCameraUsageDescription','NSBluetoothAlwaysUsageDescription','NSAppleEventsUsageDescription','NSContactsUsageDescription'])
 assert.ok(keys.includes(key),key+' is declared');
for(const [key,value] of Object.entries(macUsageDescriptions))assert.ok(value.trim().length>10&&!/[<>]/.test(value),key+' has owner-facing text');

// Dev: a stock Electron.app Info.plist (with Electron's own generic strings) after the plutil edits.
const stock:Record<string,string>={CFBundleName:'Electron',CFBundleIdentifier:'com.github.Electron',NSMicrophoneUsageDescription:'This app needs access to the microphone',NSCameraUsageDescription:'This app needs access to the camera'};
const dev={...stock,...Object.fromEntries(devInfoPlistEntries('Worldlet Dev','app.worldlet.mac.dev'))};
assert.equal(dev.CFBundleName,'Worldlet Dev');assert.equal(dev.CFBundleIdentifier,'app.worldlet.mac.dev');assert.equal(dev.CFBundleIconFile,'WorldletDev.icns');
for(const [key,value] of Object.entries(macUsageDescriptions))assert.equal(dev[key],value,'Dev '+key+' matches the packaged app');
console.log('PASS Dev Info.plist edits carry every packaged privacy usage description');

// Cache: the stamp follows the descriptions, not only Electron, icon and identity.
const inputs={electronInfoPlist:'<plist/>',icon:'<svg/>',iconScript:'icon',name:'Worldlet Dev',bundleId:'app.worldlet.mac.dev'};
const base=devRuntimeStamp(inputs);
assert.equal(devRuntimeStamp({...inputs}),base,'stamp is stable');
assert.equal(devRuntimeStamp({...inputs,descriptions:{...macUsageDescriptions}}),base,'default descriptions are the shared ones');
assert.notEqual(devRuntimeStamp({...inputs,descriptions:{...macUsageDescriptions,NSLocationUsageDescription:macUsageDescriptions.NSLocationUsageDescription+' Changed.'}}),base,'changed text rebuilds');
const {NSRemindersFullAccessUsageDescription:_removed,...fewer}=macUsageDescriptions;
assert.notEqual(devRuntimeStamp({...inputs,descriptions:fewer}),base,'a removed key rebuilds');
assert.notEqual(devRuntimeStamp({...inputs,descriptions:{...macUsageDescriptions,NSPhotoLibraryUsageDescription:'Read photos.'}}),base,'an added key rebuilds');
for(const change of [{electronInfoPlist:'<plist> </plist>'},{icon:'<svg> </svg>'},{iconScript:'icon2'},{name:'Worldlet Dev 2'},{bundleId:'app.worldlet.mac.dev.wt'}])
 assert.notEqual(devRuntimeStamp({...inputs,...change}),base,'changed '+Object.keys(change)[0]+' rebuilds');
assert.equal(devRuntimeStamp({...inputs,signer:'-'}),base,'ad hoc keeps the existing stamp');
assert.notEqual(devRuntimeStamp({...inputs,signer:'A'.repeat(40)}),base,'a signing certificate rebuilds');
console.log('PASS Dev bundle stamp changes with the usage descriptions, Electron, icon, identity and signer');

// Signing: a certificate keeps macOS permission grants across rebuilds; ad hoc only without one.
const found=`  1) ${'1'.repeat(40)} "Apple Development: Kelvin (ABC)"\n  2) ${'2'.repeat(40)} "Developer ID Application: Clockless (TEAM)"\n     2 valid identities found\n`;
assert.equal(devSigningIdentity(found,{}),'2'.repeat(40),'Developer ID first');
assert.equal(devSigningIdentity(`  1) ${'1'.repeat(40)} "Apple Development: Kelvin (ABC)"\n`,{}),'1'.repeat(40),'then Apple Development');
assert.equal(devSigningIdentity('     0 valid identities found\n',{}),'-','ad hoc without a certificate');
assert.equal(devSigningIdentity(found,{WORLDLET_SIGN_IDENTITY:'Developer ID Application: X'}),'Developer ID Application: X');
assert.equal(devSigningIdentity(found,{WORLDLET_DEV_SIGN_IDENTITY:'-',WORLDLET_SIGN_IDENTITY:'Y'}),'-','the Dev override wins');
const dev2=readFileSync(path.join(root,'scripts/dev-electron.ts'),'utf8');
assert.match(dev2,/codesign',\['--force','--deep','--timestamp=none','--sign',signer,app\]/,'the Dev bundle is signed with the chosen identity');
assert.match(dev2,/if\(!signed\)await run\('codesign',\['--force','--deep','--sign','-',app\]\)/,'falls back to ad hoc');
console.log('PASS Dev bundle is signed with a certificate when the Mac has one');

// Launch: through LaunchServices, so macOS asks for permissions as Worldlet Dev, not as the watcher's "node".
const open=devOpenArguments('/w/Worldlet Dev.app','/w/app','/w/worldlet.log',{WORLDLET_DEV:'1',PATH:'/usr/bin:/bin',EMPTY:'',GONE:undefined,'BAD-NAME':'x',LINES:'a\nb',__CFBundleIdentifier:'com.apple.Terminal',XPC_SERVICE_NAME:'0'});
assert.deepEqual(open,['-n','-a','/w/Worldlet Dev.app','--stdout','/w/worldlet.log','--stderr','/w/worldlet.log','--env','WORLDLET_DEV=1','--env','PATH=/usr/bin:/bin','--env','EMPTY=','--args','/w/app']);
const launchCode=readFileSync(path.join(root,'scripts/dev-electron.ts'),'utf8');
assert.match(launchCode,/run\('\/usr\/bin\/open',devOpenArguments\(/,'the Mac Dev app is launched by LaunchServices');
assert.match(readFileSync(path.join(root,'platform/electron/src/main.ts'),'utf8'),/WORLDLET_DEV_PID_FILE/,'the app reports its own process id');
console.log('PASS Mac Dev app launches through LaunchServices with its environment');

// Opened directly (Finder, Dock, Spotlight) the bundle starts Worldlet, not Electron's welcome page: its
// Resources/app launcher falls back to launch.json beside runtime/ (owner report 2026-10-02).
assert.notEqual(devRuntimeStamp({...inputs}),'','stamp covers the launcher');
assert.match(launchCode,/devLauncherFiles\)\)writeFileSync\(path\.join\(launcher,file\)/,'the bundle carries the launcher');
assert.ok(launchCode.indexOf("Contents/Resources/app'")<launchCode.indexOf("run('codesign'"),'the launcher is written before signing');
assert.match(launchCode,/writeFileSync\(path\.join\(home,'launch\.json'\),JSON\.stringify\(devLaunchConfig\(appDir,env\)/,'each launch records launch.json');
assert.deepEqual(devLaunchConfig('/w/app',{WORLDLET_DEV:'1',PATH:'/opt/bin:/usr/bin',SECRET_TOKEN:'x',WORLDLET_GONE:undefined}),{appDir:'/w/app',env:{WORLDLET_DEV:'1',PATH:'/opt/bin:/usr/bin'}});
// Real path: require's cache is keyed by it, and macOS's tmpdir() is the /var -> /private/var symlink.
const tmp=realpathSync(mkdtempSync(path.join(tmpdir(),'dev-launcher-')));
try{
 const home=path.join(tmp,'electron'),resources=path.join(home,'runtime/Worldlet Dev.app/Contents/Resources'),launcher=path.join(resources,'app'),appDir=path.join(home,'app');
 mkdirSync(launcher,{recursive:true});mkdirSync(appDir,{recursive:true});
 for(const [file,content] of Object.entries(devLauncherFiles))writeFileSync(path.join(launcher,file),content);
 assert.equal(JSON.parse(devLauncherFiles['package.json']).main,'main.cjs');
 writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:'worldlet',productName:'Worldlet',main:'main.cjs'}));
 writeFileSync(path.join(appDir,'main.cjs'),"globalThis.__devStarted=(globalThis.__devStarted||[]).concat([[require('electron').app.getAppPath(),process.env.WORLDLET_DEV]]);");
 const start=(argv:string[],env:Record<string,string>)=>{
  const fake={appPath:'',name:'',errors:[] as string[]},electron={app:{set name(v:string){fake.name=v;},get name(){return fake.name;},setVersion(){},setAppPath(p:string){fake.appPath=p;},getAppPath:()=>fake.appPath,whenReady:()=>({then(f:()=>void){f();}}),quit(){}},dialog:{showErrorBox:(_t:string,m:string)=>fake.errors.push(m)}};
  const saved={argv:process.argv,env:process.env,resourcesPath:(process as any).resourcesPath};
  const real=createRequire(import.meta.url),Module=real('node:module');
  const load=Module._load;Module._load=function(request:string,...rest:unknown[]){return request==='electron'?electron:load.call(this,request,...rest);};
  const main=path.join(launcher,'main.cjs');delete real.cache[main];delete real.cache[path.join(appDir,'main.cjs')];
  process.argv=['/w/Electron',...argv];process.env={...env};(process as any).resourcesPath=resources;
  try{real(main);}finally{Module._load=load;process.argv=saved.argv;process.env=saved.env;(process as any).resourcesPath=saved.resourcesPath;}
  return fake;
 };
 // No launch.json yet: a clear message instead of Electron's welcome page.
 assert.match(start([],{}).errors[0]??'',/npm run dev/);
 // From the watcher: the app directory argument and its environment.
 (globalThis as any).__devStarted=[];
 const watcher=start(['-psn_0_1',appDir],{WORLDLET_DEV:'watcher'});
 assert.deepEqual((globalThis as any).__devStarted,[[appDir,'watcher']]);assert.equal(watcher.name,'Worldlet');
 // Opened directly: launch.json supplies both.
 writeFileSync(path.join(home,'launch.json'),JSON.stringify(devLaunchConfig(appDir,{WORLDLET_DEV:'1',HOME:'/x'})));
 (globalThis as any).__devStarted=[];
 const direct=start([],{});
 assert.deepEqual((globalThis as any).__devStarted,[[appDir,'1']]);assert.deepEqual(direct.errors,[]);
}finally{rmSync(tmp,{recursive:true,force:true});}
console.log('PASS Opening Worldlet Dev.app directly starts the last launched Dev build');

// One definition: both scripts use it, and no other script spells out a usage description.
const dev_=readFileSync(path.join(root,'scripts/dev-electron.ts'),'utf8'),pkg=readFileSync(path.join(root,'scripts/package-electron.ts'),'utf8');
assert.match(dev_,/devInfoPlistEntries\(name,bundleId\)/);assert.match(dev_,/const stamp=devRuntimeStamp\(/);
assert.match(pkg,/extendInfo:platform==='darwin'\?\{[^}]*\.\.\.macUsageDescriptions/s);
for(const file of readdirSync(path.join(root,'scripts')).filter(f=>/\.(?:ts|mjs|js)$/.test(f)&&!['mac-app-info.ts','mac-app-info-check.ts'].includes(f)))
 assert.doesNotMatch(readFileSync(path.join(root,'scripts',file),'utf8'),/\bNS\w+UsageDescription\s*:/,file+' must use scripts/mac-app-info.ts');
// Worldlet runs on macOS 14 and later: a friend's Mac could not install a build that asked for macOS 26 (owner demo
// meeting 2026-09-24, fixed in e31e3562). The packaged app, its web engine and the download page all say 14.0.
assert.match(pkg,/LSMinimumSystemVersion:'14\.0'/,'the packaged Mac app supports macOS 14');
assert.match(readFileSync(path.join(root,'scripts/build-web-engine.ts'),'utf8'),/LSMinimumSystemVersion:'14\.0'/,'the web engine supports macOS 14');
assert.match(readFileSync(path.join(root,'ui/distribution/mac-release.ts'),'utf8'),/\? minimum : '14\.0'/,'the download page falls back to macOS 14');
console.log('PASS Dev and packaged apps share scripts/mac-app-info.ts; macOS 14 or later');

// Electron fuses: the packaged app (Mac, Windows and Linux) refuses NODE_OPTIONS and --inspect, and keeps RunAsNode for
// the World tool bridge. They are flipped in packager's per-architecture hook, before packager signs or edits resources.
{
 const {appFuses,flipAppFuses}=await import('./electron-fuses.ts');
 const {FuseV1Options,FuseState,getCurrentFuseWire}=await import('@electron/fuses');
 assert.deepEqual(appFuses,{[FuseV1Options.RunAsNode]:true,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,[FuseV1Options.EnableNodeCliInspectArguments]:false});
 assert.match(readFileSync(path.join(root,'platform/electron/src/modules/agent-runtime/world-tool-bridge.ts'),'utf8'),/ELECTRON_RUN_AS_NODE:'1'/,'RunAsNode stays on while the bridge needs it');
 const hook=/afterCopyExtraResources:\[async\(\{buildPath,arch:target\}[^\n]*await flipAppFuses\(buildPath,platform,arch!=='universal'\);\}\]/;
 assert.match(pkg,hook,'package-electron.ts flips the fuses in afterCopyExtraResources, which packager runs before signing');
 assert.equal(pkg.match(/flipAppFuses\(/g)?.length,1);
 assert.doesNotMatch(pkg,/afterComplete|afterFinalizePackageTargets/,'no hook after signing may change the binary');
 assert.match(readFileSync(path.join(root,'scripts/windows.ts'),'utf8'),/run\('scripts\/package-electron\.ts','--platform','win32'/,'Windows packages through package-electron.ts');
 // A synthetic fuse wire (sentinel, version 1, nine fuses all on) flips as configured, for each platform's executable name.
 const tmp=mkdtempSync(path.join(tmpdir(),'worldlet-fuses-'));
 try{
  for(const [platform,file] of [['win32','Worldlet.exe'],['linux','worldlet']] as const){
   writeFileSync(path.join(tmp,file),Buffer.concat([Buffer.alloc(64,7),Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),Buffer.from([1,9]),Buffer.from('111111111'),Buffer.alloc(64,7)]));
   await flipAppFuses(tmp,platform,false);
   const wire=await getCurrentFuseWire(path.join(tmp,file)) as any;
   assert.equal(wire[FuseV1Options.RunAsNode],FuseState.ENABLE);
   assert.equal(wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable],FuseState.DISABLE,platform+': NODE_OPTIONS is ignored');
   assert.equal(wire[FuseV1Options.EnableNodeCliInspectArguments],FuseState.DISABLE,platform+': --inspect is refused');
   assert.equal(wire[FuseV1Options.EnableCookieEncryption],FuseState.ENABLE,'other fuses are untouched');
  }
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
console.log('PASS packaged apps flip the NODE_OPTIONS and --inspect fuses off (RunAsNode on) before signing');
