import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {app,BaseWindow,dialog,Menu,powerMonitor,shell,type MenuItemConstructorOptions} from 'electron';
import {WorldletError,errorMessage,isoSeconds} from '../../files.ts';
import {AGENT,ANALYTICS,APP_UPDATES,BROWSER,COMPANION,DESKTOP_COMPANION,FOX,ORDER,PHONE,SOURCES,SPEECH,USER_ACTIVITY,WORLD_TOOLS,
 type AgentService,type BrowserService,type CompanionService,type FoxService,type OrderService,type PhoneService,type SourcesService,type SpeechService,type UserActivityService,type WorldToolsService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {DesktopCompanion} from './companion.ts';
import {companionMenu} from './companion-tray.ts';
import {createUpdates,devBuildApply,devBuildStatus} from './updates.ts';
import {UsageAnalytics} from './analytics.ts';
import {minidumpCrash,nativeCrashes} from './native-crashes.ts';
import {diagnostics,exportDiagnostics,recordFoxTiming,sendFeedback,showDebug,watchConsole} from './diagnostics.ts';
import {decode,dispose,exportTo,restore,type Archive} from './backup.ts';
import {worldMenu,worldMenuState,type WorldMenuState} from './world-menu.ts';
import {createLoginItem} from './login-item.ts';
import {order} from './order.ts';
import {wantsQuit} from '../../host/quit.ts';
import {foxTimingEvent,nativeCrashFromIps} from '../../../../../core/diagnostics/index.ts';
import {setTimeout as sleep} from 'node:timers/promises';

/** App shell: menus, the desktop Companion, updates, Open at Login, diagnostics, feedback, usage analytics and World backups. */
export function installShell(host:Host){
 const {store,page}=host;
 const companion=host.provide(DESKTOP_COMPANION,new DesktopCompanion(host));
 const updates=createUpdates(host);
 host.provide(APP_UPDATES,updates);
 const analytics=host.provide(ANALYTICS,new UsageAnalytics(host));
 analytics.followChannel(()=>updates.channel);
 // Page console warnings and errors, kept in memory for an Order (diagnostics.ts).
 watchConsole();
 const loginItem=createLoginItem(host);
 // System-wide input idle time (any app, not only Worldlet), shortened by an open paired phone. An unreadable
 // idle time counts as active, so background work never stops on a platform that cannot report it.
 host.provide<UserActivityService>(USER_ACTIVITY,{idleSeconds:()=>{
  let idle=0;try{const value=powerMonitor.getSystemIdleTime();if(Number.isFinite(value)&&value>0)idle=value;}catch{}
  const phone=host.optional<PhoneService>(PHONE)?.idleSeconds();
  return typeof phone==='number'?Math.min(idle,phone):idle;
 }});
 const agent=()=>host.optional<AgentService>(AGENT),fox=()=>host.optional<FoxService>(FOX),tools=()=>host.optional<WorldToolsService>(WORLD_TOOLS);
 const browser=()=>host.optional<BrowserService>(BROWSER);
 const sheet=<T>(work:()=>Promise<T>)=>companion.whileSheet(work);

 const extras=store.snapshotExtras;
 store.snapshotExtras=()=>({...extras(),appUpdate:updates.snapshot()});
 updates.onChange(()=>{void page.call('worldletAppUpdate',updates.snapshot());});
 analytics.onChange(buildMenus);
 // Sharing switched on or off: the World page starts or stops its PostHog web client (ui/shell/web-analytics.ts).
 analytics.onChange(()=>host.page.event('worldlet:analytics-changed'));
 loginItem.onChange(buildMenus);
 // Crashed renderer, GPU and helper processes reach PostHog as an allowlisted type and Electron reason only.
 const processGone=(type:string,reason:string)=>{if(reason!=='clean-exit')analytics.recordProductEvent('app_process_gone','',{process_type:type,exit_reason:reason});};
 app.on('render-process-gone',(_event,_contents,details)=>processGone('renderer',details.reason));
 app.on('child-process-gone',(_event,details)=>processGone(details.type==='GPU'?'gpu':details.type==='Utility'?'utility':'other',details.reason));
 // Uncaught main-process errors and every error the host records reach PostHog error tracking (sanitized in Core).
 // The monitor observes without changing Electron's own handling.
 process.on('uncaughtExceptionMonitor',error=>analytics.recordException(error,'main'));
 const recordDiagnostic=host.diagnostics.record.bind(host.diagnostics);
 host.diagnostics.record=(error,operation,requestId)=>{recordDiagnostic(error,operation,requestId);analytics.recordException(error,'host',operation);};
 // A run that never reached a clean quit (native crash, force quit, power loss) leaves its marker for the next launch.
 const runMarker=path.join(host.profile.root,'logs','running.json');
 const uncleanExit=fs.existsSync(runMarker);
 // A native crash of that run leaves a Crashpad report (main.ts starts the reporter, uploads off); PostHog learns only
 // whether one exists. The reports stay in logs/crashes, newest few kept.
 const nativeCrash=uncleanExit&&crashedSince(runMarker,app.getPath('crashDumps'));
 try{fs.mkdirSync(path.dirname(runMarker),{recursive:true});fs.writeFileSync(runMarker,JSON.stringify({startedAt:new Date().toISOString()}),{mode:0o600});}catch{}
 // Websites and inline players never follow Fox onto the desktop.
 companion.beforeDetach(()=>browser()?.stop());

 const showControls=(screen:string)=>{if(companion.isDesktop)void companion.restoreWorld();void page.call('worldletShowControls',screen,null);};
 // Mac World menu: the World UI's own actions; a refusal is shown like the page shows it.
 const sources=()=>host.optional<SourcesService>(SOURCES);
 const worldAction=(operation:string,work:()=>unknown)=>{void (async()=>{try{await work();}catch(error){
  host.diagnostics.record(error,operation);
  const world=host.window(),options={type:'warning' as const,message:errorMessage(error)};
  await sheet(()=>world?dialog.showMessageBox(world,options):dialog.showMessageBox(options));
 }})();};
 const worldActions={
  importFiles:()=>worldAction('importFiles',()=>sources()?.importFiles({})),
  generate:()=>worldAction('organizeSources',()=>sources()?.organizeSources({consent:true})),
  readConnectedApps:()=>worldAction('readConnectedApps',()=>tools()?.readConnectedApps())
 };
 let worldState:WorldMenuState|null=null;
 const currentWorldState=()=>{try{return worldMenuState(store);}catch(error){host.diagnostics.record(error,'worldMenuState');return {importFiles:false,generate:false,readConnectedApps:false};}};
 function buildMenus(){
  const mac=process.platform==='darwin';
  if(mac)worldState=currentWorldState();
  const quit:MenuItemConstructorOptions={label:'Quit Completely',accelerator:'CommandOrControl+Q',click:()=>app.quit()};
  const update:MenuItemConstructorOptions={label:'Check for Updates',enabled:updates.configured,click:()=>updates.check()};
  const usage:MenuItemConstructorOptions={label:'Share Basic Usage Counts',type:'checkbox',checked:analytics.enabled(),click:item=>analytics.setEnabled(item.checked)};
  // Read lazily: building the menu never asks the system about login items in a Dev build.
  const login:MenuItemConstructorOptions={label:'Open at Login',type:'checkbox',enabled:loginItem.supported(),checked:loginItem.supported()&&loginItem.on(),click:item=>{try{loginItem.set(item.checked);}catch(error){host.diagnostics.record(error,'loginItem');buildMenus();}}};
  const askFox:MenuItemConstructorOptions={label:'Ask Fox…',accelerator:'CommandOrControl+,',click:()=>showControls('preferences')};
  const openWorld:MenuItemConstructorOptions={label:'Open World',accelerator:'CommandOrControl+1',click:()=>{void companion.restoreWorld();}};
  // A website Applet's page goes back and forward through its own history, with the platform's keys (owner request 2026-10-06).
  const pageBack:MenuItemConstructorOptions={label:'Back',accelerator:mac?'Command+[':'Alt+Left',click:()=>{void page.call('worldletBrowserNavigate','back');}};
  const pageForward:MenuItemConstructorOptions={label:'Forward',accelerator:mac?'Command+]':'Alt+Right',click:()=>{void page.call('worldletBrowserNavigate','forward');}};
  // The Browser's tabs (owner request 2026-10-07, ui/browser/browser-device.ts): the page answers whether it took the key.
  // ⌘W closes the Browser's tab there and the window everywhere else, as it did; Close Window keeps ⇧⌘W.
  const tab=(action:string)=>page.call('worldletBrowserNavigate',action).then(taken=>taken===true,()=>false);
  const newTab:MenuItemConstructorOptions={label:'New Tab',accelerator:'CommandOrControl+T',click:()=>{void tab('new-tab');}};
  const closeTab:MenuItemConstructorOptions={label:'Close Tab',accelerator:'CommandOrControl+W',click:()=>{void tab('close-tab').then(taken=>{if(!taken&&mac)BaseWindow.getFocusedWindow()?.close();});}};
  const nextTab:MenuItemConstructorOptions={label:'Next Tab',accelerator:mac?'Command+Shift+]':'Control+Tab',click:()=>{void tab('next-tab');}};
  const previousTab:MenuItemConstructorOptions={label:'Previous Tab',accelerator:mac?'Command+Shift+[':'Control+Shift+Tab',click:()=>{void tab('previous-tab');}};
  const template:MenuItemConstructorOptions[]=mac?[
   {label:app.name,submenu:[{role:'about'},update,usage,login,{type:'separator'},askFox,{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},quit]},
   {label:'File',submenu:[openWorld,pageBack,pageForward,{type:'separator'},newTab,closeTab,nextTab,previousTab,{type:'separator'},{role:'close',accelerator:'Command+Shift+W'}]},
   {role:'editMenu'},worldMenu(worldState!,worldActions),{role:'windowMenu'}
  ]:[
   {label:'File',submenu:[openWorld,pageBack,pageForward,{type:'separator'},newTab,closeTab,nextTab,previousTab,{type:'separator'},askFox,{type:'separator'},update,usage,login,{type:'separator'},quit]},
   {role:'editMenu'},{role:'windowMenu'}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.dock?.setMenu(Menu.buildFromTemplate(companionMenu({back:()=>{void companion.restoreWorld();},quit:()=>app.quit()})));
 }
 buildMenus();
 // Keep World menu enablement current; rebuild only when an item's state changes.
 if(process.platform==='darwin')store.onChange(()=>{const next=currentWorldState();if(JSON.stringify(next)!==JSON.stringify(worldState))buildMenus();});

 app.on('activate',()=>companion.reopen());
 app.on('second-instance',(_event,argv)=>{if(!wantsQuit(argv))companion.reopen();});
 if(process.platform==='darwin')app.on('did-become-active',()=>analytics.recordActiveDay());
 let started=false;
 // The person's own keys, clicks and scrolls on the World page (user_engaged); app_active below only says the app ran.
 const watched=new WeakSet<object>();
 host.onPageLoaded(()=>{
  companion.attach();
  companion.syncPresentation();
  const contents=host.worldView()?.webContents;
  if(contents&&!watched.has(contents)){watched.add(contents);analytics.watchInput(contents);}
  if(started)return;
  started=true;
  const world=host.window();
  // The keyboard menu stays for shortcuts; the World has no visible menu bar.
  if(process.platform!=='darwin'){world?.setMenuBarVisibility(false);world?.on('focus',()=>analytics.recordActiveDay());}
  // The person may have allowed or removed the login item in System Settings meanwhile.
  if(loginItem.supported())world?.on('focus',()=>loginItem.refresh());
  analytics.recordActiveDay();
  if(uncleanExit)analytics.recordProductEvent('app_unclean_exit','',{native_crash:nativeCrash?'yes':'no'});
  setTimeout(()=>reportNativeCrashes(host,analytics),10_000);
  updates.start();
 });
 host.onQuit(()=>{companion.stop();updates.quit();try{fs.rmSync(runMarker,{force:true});}catch{}});

 let pending:{id:string,archive:Archive}|null=null;
 const orders=order(host,()=>updates.channel);
 // The paired phone shows its Order button only while this answers true (modules/phone).
 host.provide<OrderService>(ORDER,{ready:()=>orders({operation:'status'}).then(r=>!!(r.available&&r.ready),()=>false)});
 host.register({
  // The World page's uncaught errors; Core keeps only type, failure code and sanitized frames.
  reportException:request=>{
   analytics.recordException({name:request.name,message:typeof request.message==='string'?request.message.slice(0,2000):'',stack:typeof request.stack==='string'?request.stack.slice(0,20000):''},'renderer');
   return {ok:true};
  },
  // The World page's PostHog web client settings (autocapture, sessions, masked replay), null when it must not load.
  analyticsConfig:()=>analytics.webConfig(),
  usageEvent:request=>{
   // Real use counts in the practice world too; other product events leave it out.
   if(request.event==='user_engaged'||!store.sampleEnabled())analytics.recordProductEvent(typeof request.event==='string'?request.event:'',typeof request.duration==='string'?request.duration:'',request);
   return {ok:true};
  },
  openWorld:async()=>{await companion.restoreWorldForAction();return {ok:true};},
  // Setup's Terms and Privacy links: no World page exists yet to show a website, so the system browser opens it.
  openSystemBrowser:async request=>{
   let url:URL;try{url=new URL(String(request.url??''));}catch{throw new WorldletError('Invalid link.');}
   if(url.protocol!=='https:'||url.username||url.password)throw new WorldletError('Only secure links can be opened.');
   try{await shell.openExternal(url.href);}catch{throw new WorldletError('Could not open your browser. Try again.');}
   return {ok:true};
  },
  // Fox's one-time offer and the Open at Login setting: `status` (default), `set` {enabled} or `offered`.
  loginItem:request=>{
   const operation=typeof request.operation==='string'?request.operation:'status';
   if(operation==='status')return loginItem.refresh();
   if(operation==='offered')return loginItem.markOffered();
   if(operation==='set'&&typeof request.enabled==='boolean')return loginItem.set(request.enabled);
   throw new WorldletError('Unknown login item operation.');
  },
  companionMenu:()=>{setImmediate(()=>companion.showMenu());return {ok:true};},
  desktopCompanionSize:request=>{companion.setBounds(request.rect);return {ok:true};},
  desktopCompanionDrag:request=>{if(request.phase==='start')companion.beginDrag();else companion.endDrag();return {ok:true};},
  desktopCompanionState:()=>({enabled:companion.isDesktop}),
  // The timing stays in logs/fox-timing.jsonl; PostHog gets only its buckets (core foxTimingEvent), to see Fox slowing down.
  foxTiming:request=>{try{const timing=foxTimingEvent(recordFoxTiming(store.root,request));if(timing)analytics.recordProductEvent(timing.event,timing.duration,timing.dimensions);}catch{}return {ok:true};},
  appUpdate:request=>updates.activate(request),
  devBuildStatus:()=>devBuildStatus(host),
  devBuildApply:request=>devBuildApply(host,request),
  feedback:request=>sendFeedback(host,request),
  // The team's spoken tasks for Claude, Alpha and Dev only (order.ts).
  order:orders,
  showDebug:async()=>{await showDebug(host,sheet);return {ok:true};},
  diagnostics:()=>diagnostics(host),
  exportDiagnostics:()=>exportDiagnostics(host,host.window(),sheet),
  dataBackup:async request=>{
   if(!store.writable||store.sampleEnabled())throw new WorldletError('Switch to your personal world to manage its backup.');
   const operation=typeof request.operation==='string'?request.operation:'';
   const world=host.window() as any;
   if(operation==='choose'){
    const options={properties:['openFile' as const],message:'Choose a Worldlet backup. It will be checked before anything changes.'};
    const choice=await sheet(()=>world?dialog.showOpenDialog(world,options):dialog.showOpenDialog(options));
    if(choice.canceled||!choice.filePaths[0])return {cancelled:true};
    const archive=decode(host,choice.filePaths[0]),id=crypto.randomUUID().toUpperCase();
    dispose(pending?.archive);pending={id,archive};
    return {id,count:archive.files.length,createdAt:isoSeconds(archive.createdAt)};
   }
   if(operation==='cancel'){dispose(pending?.archive);pending=null;return {ok:true};}
   if(operation!=='export'&&operation!=='restore')throw new WorldletError('Unknown backup operation.');
   if(store.busy||store.organizing||fox()?.turnActive()||agent()?.hasInteractiveWork())throw new WorldletError('Let Fox finish its current task before managing the backup.');
   let destination='';
   if(operation==='export'){
    const options={defaultPath:'Worldlet.worldletbackup',message:'Contains personal sources and conversations. Provider credential files and browser logins are excluded. Keep this file private.'};
    const choice=await sheet(()=>world?dialog.showSaveDialog(world,options):dialog.showSaveDialog(options));
    if(choice.canceled||!choice.filePath)return {cancelled:true};
    destination=choice.filePath;
   }else if(!pending||request.id!==pending.id)throw new WorldletError('Choose and review a backup first.');
   fox()?.stopRoutines();tools()?.stop();host.optional<SpeechService>(SPEECH)?.stopSpeaking();
   await agent()?.shutdown();
   await sleep(600);
   try{
    if(!store.writable||store.sampleEnabled()||store.busy||store.organizing)throw new WorldletError('Finish the current task in your personal world before managing its backup.');
    if(destination){
     store.persist();host.optional<CompanionService>(COMPANION)?.archive();
     return {ok:true,count:exportTo(host,destination)};
    }
    browser()?.stop();browser()?.resetHistory();
    const rollback=restore(host,pending!.archive);
    dispose(pending?.archive);pending=null;
    store.reload();store.changed();
    setTimeout(()=>{const view=host.worldView();if(view&&!view.webContents.isDestroyed())view.webContents.reload();},100);
    return {ok:true,rollback};
   }finally{tools()?.start();fox()?.startRoutines();}
  }
 });
}

/** Whether Crashpad wrote a report after the unclean run named by `marker` started; keeps the newest ten reports. */
/** Native crashes since the last look reach PostHog error tracking (analytics.recordNativeCrash), five at most per
 * launch; the first look goes back a week. A report that fails to send is not retried. */
const NATIVE_CRASHES_SEEN='WorldletNativeCrashesSeenAt';
function reportNativeCrashes(host:Host,analytics:UsageAnalytics){
 if(!app.isPackaged)return;
 const prefs=host.preferences,since=prefs.number(NATIVE_CRASHES_SEEN,Date.now()-7*86_400_000);
 const found=nativeCrashes({since,dumps:app.getPath('crashDumps')});
 prefs.set(NATIVE_CRASHES_SEEN,Math.max(since,...found.map(crash=>crash.at)));
 for(const crash of found){
  let raw:Row|null=null;
  try{raw=crash.kind==='ips'?nativeCrashFromIps(fs.readFileSync(crash.file,'utf8')):minidumpCrash(fs.readFileSync(crash.file));}catch{}
  if(raw)analytics.recordNativeCrash(raw);
 }
}
export function crashedSince(marker:string,dumps:string){
 let since=0;try{since=Date.parse(JSON.parse(fs.readFileSync(marker,'utf8')).startedAt)||fs.statSync(marker).mtimeMs;}catch{return false;}
 const reports:{file:string,at:number}[]=[];
 const walk=(dir:string,depth:number)=>{let entries:fs.Dirent[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const entry of entries){const file=path.join(dir,entry.name);
   if(entry.isDirectory()&&depth<3)walk(file,depth+1);
   else if(entry.isFile()&&entry.name.endsWith('.dmp'))try{reports.push({file,at:fs.statSync(file).mtimeMs});}catch{}}};
 walk(dumps,0);
 reports.sort((a,b)=>b.at-a.at);
 for(const old of reports.slice(10))try{fs.rmSync(old.file,{force:true});}catch{}
 return reports.some(report=>report.at>=since-1000);
}
