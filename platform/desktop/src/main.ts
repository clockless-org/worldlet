import {sharedEnginePid,stopSharedEngine,websiteEngine} from '../../host/modules/applets/engine/process.ts';
import {readMemory,refreshMemory} from '../../host/modules/applets/memory.ts';
import {browserBudget} from '../../../agent/applets/index.ts';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {app,crashReporter,ipcMain,dialog,BaseWindow} from 'electron';
import {listenForLinks,openInBrowser} from '../../host/system-browser.ts';
import {macDomain,resolveProfile,platformName,RELEASE_CHECKS} from '../../host/profile.ts';
import {Preferences,MAC_IMPORT_KEYS} from '../../host/preferences.ts';
import {WorldStore} from '../../host/store/world-store.ts';
import {HostRouter} from '../../host/router.ts';
import {createPageBridge} from '../../host/page.ts';
import {createWebPage} from '../../host/web-page.ts';
import {createPagePair,serveWorldWeb} from '../../host/world-web.ts';
import {createDiagnostics,keepProcessOutput} from '../../host/diagnostics.ts';
import {endStrayChildren,hideAllWindows,installQuitTask,relaunchAfterQuit,startPendingRelaunch,wantsQuit,withDeadline} from '../../host/quit.ts';
import {FEATURE_OWNERS,hostCapabilities} from '../../host/capabilities.ts';
import {registerWorldScheme,trustedWorldURL} from '../../host/protocol.ts';
import {WorldWindow} from './world/window.ts';
import {installCapture} from './world/capture.ts';
import {captureRequest,refuseBesideRunningCopy,runCapture,type CaptureRequest} from './world/window-capture.ts';
import {probeRequest,refuseProbeBesideRunningCopy,runProbe,type ProbeRequest} from './world/permission-probe.ts';
import {loginItemCheckRequest,refuseLoginItemCheckBesideRunningCopy,runLoginItemCheck,type LoginItemCheckRequest} from './world/login-item-check.ts';
import {openedAtLogin} from '../../../agent/app/index.ts';
import {onboardingUnfinished} from '../../../agent/companion/index.ts';
import {updateAcceptance} from '../../host/modules/shell/update-acceptance.ts';
import {modules} from '../../host/modules/index.ts';
import {runCheck} from './checks/index.ts';
import {ensureDirectory,errorMessage} from '../../host/files.ts';
import {createVault} from '../../host/vault.ts';
import {ANALYTICS,DESKTOP_COMPANION,PHONE,RTC_PAGE,RUN_IN_BACKGROUND,VAULT,WORLD_ROOM_PAGE,WORLD_WEB,type AnalyticsService,type DesktopCompanionService,type PhoneService,type RtcPageFactory,type VaultService,type WorldRoomPageService,type WorldWebService} from '../../host/services.ts';
import {roomDenied} from '../../../contracts/web-world.ts';
import {openRtcWindow} from '../../host/modules/shell/rtc-window.ts';
import type {Host} from '../../host/types.ts';
import type {HostFeatures} from '../../../contracts/platform.ts';
import {backgroundLaunchWanted,startBackgroundLaunch} from '../../host/background-launch.ts';
import {startGraphics} from './graphics.ts';
import {offerApplicationsFolder} from './applications-folder.ts';

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
// A link another app opened while Worldlet is the default browser can arrive before `ready` (system-browser.ts).
listenForLinks();
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
// A background check launch on the Mac sits below every ordinary window (background-launch.ts). Once windows on that
// screen cover it whole, Chromium hides its pages as occluded: no frame is drawn, capturePage rejects with "Current
// display surface not available" and the World never arrives (Mac Alpha 4378 and 4380, #500).
if(process.platform==='darwin'&&backgroundLaunchWanted(profile))app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
ensureDirectory(profile.root);
// A computer whose GPU process kept crashing starts in software graphics for a while (graphics.ts).
startGraphics(profile.root);
// Chromium's own profile lives inside the library, beside the World data it serves.
app.setPath('userData',path.join(profile.root,'Browser','Electron'));
// Native crashes of the installed app leave a Crashpad report in the library's logs, never uploaded whole; the next
// launch reports that one exists (`native_crash` on app_unclean_exit, modules/shell) and, on Windows, its crash address
// (agent/app/ANALYTICS.md#native-crashes); an Order can name it.
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
 // A Mac copy run from the disk image cannot update itself: it offers to move into Applications first.
 if(await offerApplicationsFolder(profile)){app.quit();return;}
 installQuitTask();
 const diagnostics=createDiagnostics(profile.root);
 keepProcessOutput(profile.root);
 const preferences=Preferences.at(profile.root,()=>macDefaults(macDomain(profile)));
 const services=new Map<string,unknown>();
 const reloadListeners:(()=>void)[]=[],quitListeners:(()=>void|Promise<void>)[]=[],loadedListeners:(()=>void)[]=[],connectedListeners:(()=>void)[]=[],startedListeners:(()=>void)[]=[];
 let world:WorldWindow|null=null;
 const router=new HostRouter(()=>host);
 const implemented=(feature:keyof HostFeatures)=>{
  const owner=FEATURE_OWNERS[feature];
  return !owner||router.has(owner)||services.has(owner);
 };
 // macOS's available memory and pressure, read before the World first asks for the page budget.
 void refreshMemory(null);
 const store=new WorldStore(profile.root,preferences,{appName:profile.title,platform:platformName(),capabilities:()=>hostCapabilities(implemented,{scaledPages:websiteEngine(profile)==='cef',budget:browserBudget(readMemory())}),mockGoogleAvailable:profile.channel==='dev'});
 store.historyFailure=(error,kind)=>diagnostics.record(error,'worldHistory:'+(kind||'unknown'));
 // The World page in the app's window, and a browser's beside it on this computer (host/world-web.ts createPagePair):
 // the window stays the World's page; a browser's page is an extra one, the newest browser tab taking over an older one.
 const failed=(body:any,error:any)=>{
  // As on the Mac host, only Fox, connection, content and onboarding requests persist a
  // diagnostic; other request errors (a city lookup, a location timeout) are the page's to show.
  if(error?.name!=='AbortError'&&PERSISTED_REQUEST_FAILURES.includes(body?.action))diagnostics.record(error,body.action,typeof body.id==='string'?body.id:'');
 };
 const web=createWebPage({
  platform:platformName(),
  dispatch:async body=>{pages.note('web',body);const value=await router.dispatch(body,null,'web');pages.note('web',body,value);return value;},
  // A browser's page coming and going is not the window's page loading or reloading: it gets the World as it is, and
  // what a page gets pushed when it comes (onPageConnected).
  loaded:()=>{sent='';sendState();for(const listener of connectedListeners)try{listener();}catch(error){diagnostics.record(error,'pageConnected');}},
  gone:()=>{},
  failed,
 });
 // The World on another device, met through the pairing room (modules/shell/world-room-link.ts): a page beside the
 // others, with only what ROOM_ALLOWED lets through (contracts/web-world.ts roomDenied).
 const remote=createWebPage({
  platform:platformName(),
  denied:roomDenied,
  dispatch:async body=>{pages.note('remote',body);const value=await router.dispatch(body,null,'web');pages.note('remote',body,value);return value;},
  loaded:()=>{sent='';sendState();for(const listener of connectedListeners)try{listener();}catch(error){diagnostics.record(error,'pageConnected');}},
  gone:()=>{},
  failed,
 });
 const pages=createPagePair(createPageBridge(()=>world?.view.webContents??null,line=>diagnostics.log(line)),web.page,remote.page);
 const page=pages.page;
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
  onPageLoaded:listener=>{loadedListeners.push(listener);},
  onPageConnected:listener=>{connectedListeners.push(listener);},
  onStarted:listener=>{startedListeners.push(listener);}
 };
 let started=false;
 const startServices=()=>{
  if(started)return;
  started=true;
  for(const listener of startedListeners)try{listener();}catch(error){diagnostics.record(error,'hostStarted');}
 };
 host.provide(VAULT,createVault(profile.root,profile.channel==='release'?'app.worldlet.context':profile.worktree?'app.worldlet.context.dev.wt'+profile.worktree:'app.worldlet.context.dev'));
 host.provide<RtcPageFactory>(RTC_PAGE,openRtcWindow);
 host.provide<WorldRoomPageService>(WORLD_ROOM_PAGE,{accept:socket=>remote.connect(socket)});
 for(const install of modules)install(host);
 // Contract check: report what this host implements, without opening a window.
 if(process.argv.includes('--host-contract-check')){
  process.stdout.write(JSON.stringify({actions:router.names(),services:[...services.keys()].sort(),capabilities:hostCapabilities(implemented)})+'\n');
  store.closeLedger();fs.rmSync(profile.root,{recursive:true,force:true});
  app.exit(0);return;
 }

 // The World in a browser on this computer, served beside the window while the app runs (contracts/web-world.ts): the
 // same page on 127.0.0.1 at /world/, its link in the library's owner-only world-link.txt (host/world-web.ts).
 let worldWeb:Promise<string>|null=null;
 const serveWorld=()=>worldWeb??=(async()=>{
  const server=await host.use<PhoneService>(PHONE).localServer!();
  return serveWorldWeb({root:profile.root,webRoot:profile.webRoot,vault:host.use<VaultService>(VAULT),server,accept:socket=>web.connect(socket)}).link;
 })().catch(error=>{worldWeb=null;throw error;});
 host.provide<WorldWebService>(WORLD_WEB,{link:serveWorld});
 host.onStarted(()=>void serveWorld().catch(error=>diagnostics.record(error,'worldWeb')));
 host.onQuit(()=>{web.close();remote.close();});

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
  try{pages.note('native',body);const value=await router.dispatch(body,event.sender);pages.note('native',body,value);return {ok:true,value};}
  catch(error){failed(body,error);return {ok:false,error:errorMessage(error)};}
 });

 const preload=path.join(__dirname,'world-preload.cjs');
 // Launched by the login item: the World opens minimized and Fox waits on the desktop, nothing takes focus.
 const quiet=profile.channel==='release'&&!capture&&!probe&&!loginCheck&&!profile.smoke&&openedAtLogin({platform:process.platform,argv:process.argv,wasOpenedAtLogin:process.platform==='darwin'?app.getLoginItemSettings({type:'mainAppService'}).wasOpenedAtLogin:false});
 // Set to run in background with onboarding over: the login launch opens no window at all (the Dock or tray brings it).
 const hidden=quiet&&preferences.bool(RUN_IN_BACKGROUND)&&!onboardingUnfinished(store.state.onboarding);
 startBackgroundLaunch(profile);
 world=new WorldWindow(profile,preload,{
  openURL:url=>{const browser=host.optional<{openExternalRequest(url:string):void}>('browser');if(browser)browser.openExternalRequest(url);else void openInBrowser(url);},
  loaded:()=>{sent='';startServices();for(const listener of loadedListeners)try{listener();}catch(error){diagnostics.record(error,'pageLoaded');}for(const listener of connectedListeners)try{listener();}catch(error){diagnostics.record(error,'pageConnected');}},
  navigating:()=>{for(const listener of reloadListeners)try{listener();}catch(error){diagnostics.record(error,'pageReload');}},
  closing:()=>host.optional<{shouldKeepOpen():boolean}>('desktopCompanion')?.shouldKeepOpen()??false,
  activated:active=>page.event(active?'worldlet:app-active':'worldlet:app-inactive'),
  resized:()=>{},
  ingest:request=>host.optional<AnalyticsService>(ANALYTICS)?.ingest(request)??Promise.resolve(new Response(null,{status:204}))
 },{quiet,hidden});
 if(profile.channel==='dev')installCapture(world.view.webContents);
 if(!fs.existsSync(path.join(profile.webRoot,'index.html'))){
  if(checkName===null)dialog.showErrorBox('Worldlet could not start','The Worldlet interface is missing. Run npm run build:native-ui first.');
  else process.stderr.write('FAIL '+checkName+': the Worldlet interface is missing (npm run build:native-ui)\n');
  app.exit(1);return;
 }
 // Run in background: no window and no World page. The host does its own work (startServices), a phone or browser
 // gets the Center and Fox from it, and the page loads only when the World is shown (the Dock, the tray, a notification).
 let loading:Promise<unknown>|null=null;
 const loadWorld=()=>loading??=world!.load();
 if(hidden){
  world.window.once('show',()=>void loadWorld().catch(error=>diagnostics.record(error,'worldLoad')));
  startServices();
  host.optional<DesktopCompanionService>(DESKTOP_COMPANION)?.background();
 }else await loadWorld();
 if(capture)void runCapture(capture,launchedAt,()=>world?{window:world.window,view:world.view}:null).finally(()=>app.quit());
 if(probe)void runProbe(probe,(body,sender)=>router.dispatch(body,sender),world.view.webContents,()=>store.state.connections??[]).finally(()=>app.quit());
 if(loginCheck)void runLoginItemCheck(loginCheck,profile.channel,(body,sender)=>router.dispatch(body,sender),world.view.webContents).finally(()=>app.quit());
 // The World window can be closed for good while another window (the glow, a task page) keeps the app running, for
 // example before its page is ready. Showing a destroyed window throws in the main process, so the Dock icon or a
 // second launch then starts Worldlet again to bring the World back.
 const bringWorld=()=>{
  const window=world?.window;
  if(!window)return;
  if(window.isDestroyed()){relaunchAfterQuit();app.quit();return;}
  if(window.isMinimized())window.restore();
  window.show();window.focus();
 };
 app.on('second-instance',(_event,argv)=>{if(wantsQuit(argv)){app.quit();return;}bringWorld();});
 app.on('activate',()=>{const window=world?.window;if(window?.isDestroyed())bringWorld();else window?.show();});
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
   // Windows reads its children through PowerShell, which can take seconds on a busy computer.
   await withDeadline(endStrayChildren(process.platform,[sharedEnginePid()]),process.platform==='win32'?20_000:5000);
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
