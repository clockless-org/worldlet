import {stopSharedEngine,websiteEngine} from './modules/browser/engine/process.ts';
import {readMemory,refreshMemory} from './modules/browser/memory.ts';
import {browserBudget} from '../../../core/browser/index.ts';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {app,crashReporter,ipcMain,shell,dialog,BaseWindow} from 'electron';
import {macDomain,resolveProfile,platformName,RELEASE_CHECKS} from './profile.ts';
import {Preferences,MAC_IMPORT_KEYS} from './preferences.ts';
import {WorldStore} from './store/world-store.ts';
import {HostRouter} from './host/router.ts';
import {createPageBridge} from './host/page.ts';
import {createDiagnostics,keepProcessOutput} from './host/diagnostics.ts';
import {endStrayChildren,hideAllWindows,installQuitTask,startPendingRelaunch,wantsQuit,withDeadline} from './host/quit.ts';
import {hostCapabilities} from './capabilities.ts';
import {registerWorldScheme,trustedWorldURL} from './world/protocol.ts';
import {WorldWindow} from './world/window.ts';
import {installCapture} from './world/capture.ts';
import {captureRequest,refuseBesideRunningCopy,runCapture,type CaptureRequest} from './world/window-capture.ts';
import {probeRequest,refuseProbeBesideRunningCopy,runProbe,type ProbeRequest} from './world/permission-probe.ts';
import {loginItemCheckRequest,refuseLoginItemCheckBesideRunningCopy,runLoginItemCheck,type LoginItemCheckRequest} from './world/login-item-check.ts';
import {openedAtLogin} from '../../../core/distribution/index.ts';
import {updateAcceptance} from './modules/shell/update-acceptance.ts';
import {modules} from './modules/index.ts';
import {runCheck} from './checks/index.ts';
import {ensureDirectory,errorMessage} from './files.ts';
import {createVault} from './vault.ts';
import {VAULT} from './host/services.ts';
import type {Host} from './host/types.ts';
import type {HostFeatures} from '../../../contracts/platform.ts';
import {startBackgroundLaunch} from './background-launch.ts';

// Release smoke (#987): parsed before anything opens; malformed arguments are a usage error.
let capture:CaptureRequest|null=null;
try{capture=captureRequest(process.argv);updateAcceptance(process.argv);}catch(error){process.stderr.write(error.message+'\n');app.exit(2);}
// RC permission check (#1142): one World action that asks macOS for a permission, then quit.
let probe:ProbeRequest|null=null;
try{probe=probeRequest(process.argv);}catch(error){process.stderr.write(error.message+'\n');app.exit(2);}
// RC login item check (#1229): turn Open at Login on and off again through the setting, then quit.
let loginCheck:LoginItemCheckRequest|null=null;
try{loginCheck=loginItemCheckRequest(process.argv);}catch(error){process.stderr.write(error.message+'\n');app.exit(2);}
const launchedAt=new Date();
registerWorldScheme();
// No public debugging port, whatever the launch arguments say: agent-browser reaches only the
// selected page through webContents.debugger. One page plays sound at a time (Mac media rule).
for(const name of ['remote-debugging-port','remote-debugging-pipe','remote-debugging-address','remote-allow-origins'])app.commandLine.removeSwitch(name);
app.commandLine.appendSwitch('enable-features','AudioFocusEnforcement');
// Windows native occlusion tracking is off for every run. It hides every window while the display is off or
// the session is locked, so capturePage rejects with "Current display surface not available" (#1057). It also
// sometimes marks the shown, uncovered World window occluded: the page reports visible, but no frame is
// produced and the window stays one flat color (release smoke, RCs 1085 and 1087).
if(process.platform==='win32')app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
const profile=resolveProfile();
ensureDirectory(profile.root);
// Chromium's own profile lives inside the library, beside the World data it serves.
app.setPath('userData',path.join(profile.root,'Browser','Electron'));
// Native crashes of the installed app leave a Crashpad report in the library's logs, never uploaded whole; the next
// launch reports that one exists (`native_crash` on app_unclean_exit, modules/shell) and, on Windows, its crash address
// (core/diagnostics/ANALYTICS.md#native-crashes); an Order can name it.
if(app.isPackaged&&profile.channel==='release'){
 try{app.setPath('crashDumps',path.join(profile.root,'logs','crashes'));crashReporter.start({uploadToServer:false});}catch{}
}
// The app name reaches the User-Agent header, which only carries Latin-1; a worktree's window title
// ("Worldlet Dev — branch · id") would break every World request, so the label stays in the title.
app.setName(profile.channel==='dev'?'Worldlet Dev':'Worldlet');
// `--check <name>`: a development-only named check (src/checks) against this launch's library.
const checkIndex=process.argv.indexOf('--check'),checkName=checkIndex>0?process.argv[checkIndex+1]??'':null;
// A release build runs one only on the RC harness's disposable library (profile.ts rcCheckRoot, #1492).
if(checkName!==null&&profile.channel!=='dev'&&!(profile.rcCheck&&RELEASE_CHECKS.includes(checkName))){process.stderr.write('FAIL '+checkName+': named checks run only in development builds, or in a release build launched by the RC harness\n');app.exit(1);}
else if(!app.requestSingleInstanceLock()){if(capture)refuseBesideRunningCopy(capture);if(probe)refuseProbeBesideRunningCopy(probe);if(loginCheck)refuseLoginItemCheckBesideRunningCopy(loginCheck);capture||probe||loginCheck?app.exit(3):app.quit();}
// Quit Worldlet from the Windows taskbar when no copy is running: nothing to quit.
else if(wantsQuit(process.argv))app.exit(0);
else void start();

/** The Mac host kept display and companion preferences in app-scoped UserDefaults. */
function macDefaults(domain:string){
 const values:Record<string,unknown>={};
 if(process.platform!=='darwin')return values;
 for(const key of MAC_IMPORT_KEYS){
  try{
   const type=execFileSync('/usr/bin/defaults',['read-type',domain,key],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().replace(/^Type is /,'');
   const raw=execFileSync('/usr/bin/defaults',['read',domain,key],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
   values[key]=type==='boolean'?raw==='1':type==='integer'||type==='float'?Number(raw):raw;
  }catch{}
 }
 return values;
}
const PERSISTED_REQUEST_FAILURES=['agentChat','hermesChat','connect','appContent','onboarding','foxPreferences','localAgent','localHermes'];

async function start(){
 // The Dev watcher launches the Mac Dev app through LaunchServices and learns its process id from here (scripts/dev-electron.ts).
 if(process.env.WORLDLET_DEV_PID_FILE&&profile.channel==='dev')try{fs.writeFileSync(process.env.WORLDLET_DEV_PID_FILE,String(process.pid));}catch{}
 delete process.env.WORLDLET_DEV_PID_FILE;
 await app.whenReady();
 installQuitTask();
 const diagnostics=createDiagnostics(profile.root);
 keepProcessOutput(profile.root);
 const preferences=Preferences.at(profile.root,()=>macDefaults(macDomain(profile)));
 const services=new Map<string,unknown>();
 const reloadListeners:(()=>void)[]=[],quitListeners:(()=>void|Promise<void>)[]=[],loadedListeners:(()=>void)[]=[];
 let world:WorldWindow|null=null;
 const router=new HostRouter(()=>host);
 const implemented=(feature:keyof HostFeatures)=>{
  const owners:Partial<Record<keyof HostFeatures,string>>={nativeAppletLaunch:'openInstalledApplet',nativeCalendar:'appleSources',appleNotes:'appleSources',appleReminders:'appleSources',voiceMemos:'voiceMemos',messages:'messages',localMusic:'localMusic',folderManagement:'folderConnection',backgroundSourceChecks:'sourceChecks',browserBookmarks:'browserBookmarks',installedAppDetection:'installedApplets',browserFoxOverlay:'browserShow',browserPictureInPicture:'browserPip',browserTaskPictureInPicture:'browserLayout',curatedSourceRead:'curatedSourceContent',localDataDeletion:'deleteSourceData',googleSignInStages:'connect'};
  const owner=owners[feature];
  return !owner||router.has(owner)||services.has(owner);
 };
 // macOS's available memory and pressure, read before the World first asks for the page budget.
 void refreshMemory(null);
 const store=new WorldStore(profile.root,preferences,{appName:profile.title,platform:platformName(),capabilities:()=>hostCapabilities(implemented,{scaledPages:websiteEngine(profile)==='cef',budget:browserBudget(readMemory())}),mockGoogleAvailable:profile.channel==='dev'});
 store.historyFailure=(error,kind)=>diagnostics.record(error,'worldHistory:'+(kind||'unknown'));
 const page=createPageBridge(()=>world?.view.webContents??null,line=>diagnostics.log(line));
 const host:Host={
  profile,preferences,store,page,diagnostics,
  window:()=>world?.window??null,
  worldView:()=>world?.view??null,
  register:actions=>router.register(actions),
  provide:(name,service)=>{services.set(name,service);return service;},
  use:name=>{if(!services.has(name))throw Error(`Missing host service ${name}`);return services.get(name) as any;},
  optional:name=>services.get(name) as any,
  onPageReload:listener=>{reloadListeners.push(listener);},
  onQuit:listener=>{quitListeners.push(listener);},
  onPageLoaded:listener=>{loadedListeners.push(listener);}
 };
 host.provide(VAULT,createVault(profile.root,profile.channel==='release'?'app.worldlet.context':profile.worktree?'app.worldlet.context.dev.wt'+profile.worktree:'app.worldlet.context.dev'));
 for(const install of modules)install(host);
 // Contract check: report what this host implements, without opening a window.
 if(process.argv.includes('--host-contract-check')){
  process.stdout.write(JSON.stringify({actions:router.names(),services:[...services.keys()].sort(),capabilities:hostCapabilities(implemented)})+'\n');
  store.closeLedger();fs.rmSync(profile.root,{recursive:true,force:true});
  app.exit(0);return;
 }

 // The page ignores a payload whose revisions it already holds, so skip building one.
 let sent='';
 const sendState=()=>{
  if(!page.ready())return;
  const revisions=`${store.state.revision}:${store.activityRevision}`;
  if(revisions===sent)return;
  try{const snapshot=store.snapshot();sent=revisions;void page.call('worldletReceive',snapshot);}catch(error){diagnostics.record(error,'snapshot');}
 };
 store.onChange(sendState);

 ipcMain.on('worldlet:platform',event=>{event.returnValue=platformName();});
 ipcMain.handle('worldlet:request',async(event,body)=>{
  // Only the trusted main World document may call the host; subframes and websites cannot.
  const frame=event.senderFrame;
  if(!world||event.sender!==world.view.webContents||!frame||frame.parent||!trustedWorldURL(frame.url))return {ok:false,error:'This page cannot use Worldlet.'};
  try{return {ok:true,value:await router.dispatch(body,event.sender)};}
  catch(error){
   // As on the Mac host, only Fox, connection, content and onboarding requests persist a
   // diagnostic; other request errors (a city lookup, a location timeout) are the page's to show.
   if(error?.name!=='AbortError'&&PERSISTED_REQUEST_FAILURES.includes(body?.action))diagnostics.record(error,body.action,typeof body.id==='string'?body.id:'');
   return {ok:false,error:errorMessage(error)};
  }
 });

 const preload=path.join(__dirname,'world-preload.cjs');
 // Launched by the login item: the World opens minimized and Fox waits on the desktop, nothing takes focus.
 const quiet=profile.channel==='release'&&!capture&&!probe&&!loginCheck&&!profile.smoke&&openedAtLogin({platform:process.platform,argv:process.argv,wasOpenedAtLogin:process.platform==='darwin'?app.getLoginItemSettings({type:'mainAppService'}).wasOpenedAtLogin:false});
 startBackgroundLaunch(profile);
 world=new WorldWindow(profile,preload,{
  openURL:url=>{const browser=host.optional<{openExternalRequest(url:string):void}>('browser');if(browser)browser.openExternalRequest(url);else void shell.openExternal(url);},
  loaded:()=>{sent='';for(const listener of loadedListeners)try{listener();}catch(error){diagnostics.record(error,'pageLoaded');}},
  navigating:()=>{for(const listener of reloadListeners)try{listener();}catch(error){diagnostics.record(error,'pageReload');}},
  closing:()=>host.optional<{shouldKeepOpen():boolean}>('desktopCompanion')?.shouldKeepOpen()??false,
  activated:active=>page.event(active?'worldlet:app-active':'worldlet:app-inactive'),
  resized:()=>{}
 },{quiet});
 if(profile.channel==='dev')installCapture(world.view.webContents);
 if(!fs.existsSync(path.join(profile.webRoot,'index.html'))){
  if(checkName===null)dialog.showErrorBox('Worldlet could not start','The Worldlet interface is missing. Run npm run build:native-ui first.');
  else process.stderr.write('FAIL '+checkName+': the Worldlet interface is missing (npm run build:native-ui)\n');
  app.exit(1);return;
 }
 await world.load();
 if(capture)void runCapture(capture,launchedAt,()=>world?{window:world.window,view:world.view}:null).finally(()=>app.quit());
 if(probe)void runProbe(probe,(body,sender)=>router.dispatch(body,sender),world.view.webContents,()=>store.state.connections??[]).finally(()=>app.quit());
 if(loginCheck)void runLoginItemCheck(loginCheck,profile.channel,(body,sender)=>router.dispatch(body,sender),world.view.webContents).finally(()=>app.quit());
 app.on('second-instance',(_event,argv)=>{if(wantsQuit(argv)){app.quit();return;}const window=world?.window;if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.on('activate',()=>{world?.window.show();});
 let quitting=false;
 const shutdown=(code:number)=>{
  quitting=true;
  // Fox and the World leave the screen at once; quit work that hangs cannot keep them there.
  hideAllWindows();
  stopSharedEngine();
  void (async()=>{
   await withDeadline(Promise.allSettled(quitListeners.map(listener=>Promise.resolve().then(listener))),4000);
   // app.exit skips Chromium's own shutdown, so the page's storage (setup progress, one-time hints) is written first.
   try{world?.view.webContents.session.flushStorageData();}catch{}
   try{store.closeLedger();}catch(error){diagnostics.record(error,'quit');}
   // Nothing the app spawned outlives it: a Hermes worker, the website engine or a tool still running is ended.
   await withDeadline(endStrayChildren(),5000);
   // Electron's relauncher is a child too: a restart or installed update asked for during quit starts only now.
   try{startPendingRelaunch();}catch(error){diagnostics.record(error,'quit');}
   let exited=false;const exit=()=>{if(!exited){exited=true;app.exit(code);}};
   setTimeout(exit,1000).unref?.();
   process.stdout.write('',exit);
  })();
 };
 app.on('before-quit',event=>{
  if(quitting)return;
  event.preventDefault();shutdown(0);
 });
 app.on('window-all-closed',()=>{if(process.platform!=='darwin'||!BaseWindow.getAllWindows().length)app.quit();});
 if(checkName!==null)void runCheck(checkName,{host,window:world.window,view:world.view}).then(shutdown);
}
