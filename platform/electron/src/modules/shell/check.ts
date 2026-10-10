// Shell check: World backups keep only World data. A backup captures the library and the World
// preferences, refuses an archive missing its database or an original, and a restore replaces the
// World while this computer's analytics choice and installation identity (imported once from the
// Mac host) stay as they were. The Mac World menu carries the native labels and follows the World UI's
// enablement rules from shared Core. On Windows the desktop Companion adds a notification-area way back
// to the hidden World, removed when the World returns; Mac and Linux add none. Runs in an Electron main process: npm run test:electron -- shell
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {app,BaseWindow,Menu,WebContentsView} from 'electron';
import {core} from '../../core.ts';
import {Preferences} from '../../preferences.ts';
import {WorldStore} from '../../store/world-store.ts';
import {UsageAnalytics,INSTALLATION_KEYS,INSTALL_CLAIM_URL,ingestPath,personInput} from './analytics.ts';
import {minidumpCrash,nativeCrashes} from './native-crashes.ts';
import {nativeCrashFromIps} from '../../../../../core/diagnostics/index.ts';
import {capture,decode,dispose,encode,restore,validate,PREFERENCE_KEYS,type Archive} from './backup.ts';
import {worldMenu,worldMenuState} from './world-menu.ts';
import {DesktopCompanion} from './companion.ts';
import {companionEntry,trayIcon,type TrayFactory} from './companion-tray.ts';
import type {ActionHandler,Host} from '../../host/types.ts';
import {keptOnQuit,outliveQuit,processRows,processTrees,relaunchAfterQuit,startPendingRelaunch,strayChildren,wantsQuit,withDeadline} from '../../host/quit.ts';

const scratch=fs.mkdtempSync(path.join(process.env.WORLDLET_CHECK_ROOT??os.tmpdir(),'worldlet-shell-'));
const root=path.join(scratch,'library');fs.mkdirSync(root,{recursive:true});
const mac={WorldletUsageAnalyticsEnabled:false,WorldletUsageAccount:'',WorldletUsageAnonymousID:'CA9EF49D-DB2B-4676-A3AD-502F6FF4E60C',WorldletUsageInstallID:'E86FF612-C28D-48FC-8936-A4E842F57707','worldlet.companionName':'Pip'};
const preferences=Preferences.at(root,()=>mac);
const store=new WorldStore(root,preferences,{appName:'Worldlet Check',platform:'macos',capabilities:()=>({}),mockGoogleAvailable:false});
const actions=new Map<string,ActionHandler>(),services=new Map<string,unknown>();
const host:Host={
 profile:{channel:'dev',worktree:'',root,title:'Worldlet Check',webRoot:path.resolve('dist/WorldletWeb'),resources:process.cwd(),smoke:false},
 preferences,store,
 page:{call:async()=>undefined,event:()=>{},documentEvent:()=>{},ready:()=>false},
 window:()=>null,worldView:()=>null,
 register:handlers=>{for(const [name,handler] of Object.entries(handlers))actions.set(name,handler);},
 provide:(name,service)=>{services.set(name,service);return service;},
 use:name=>{if(!services.has(name))throw Error('Missing host service '+name);return services.get(name) as any;},
 optional:name=>services.get(name) as any,
 onPageReload:()=>{},onQuit:()=>{},onPageLoaded:()=>{},
 diagnostics:{record:()=>{},log:()=>{}}
};
const identity=()=>Object.fromEntries(INSTALLATION_KEYS.map(key=>[key,preferences.get(key)]));
const refused=(archive:Archive,pattern:RegExp,label:string)=>assert.throws(()=>validate(host,archive),pattern,label);
try{
 // Quit Completely ends what the app spawned: direct children other than Electron's own helpers, each
 // with its whole tree, deepest first; quit work has a deadline; the taskbar's Quit Worldlet is --quit.
 {
  const rows=[{pid:10,ppid:1},{pid:11,ppid:10},{pid:12,ppid:10},{pid:13,ppid:12},{pid:14,ppid:13},{pid:15,ppid:99},{pid:16,ppid:10}];
  const strays=strayChildren(rows,10,new Set([11]));
  assert.deepEqual(strays,[12,16],'Electron helpers stay; other children are strays');
  assert.deepEqual(processTrees(rows,strays),[14,13,12,16],'each stray ends with its children, deepest first');
  // The update installer waits for the quit it caused; ending it left the old build installed (RC 2800).
  outliveQuit(16);
  assert.deepEqual(strayChildren(rows,10,keptOnQuit([11])),[12],'the update installer outlives the quit');
  // Electron's relauncher is a direct child too; started before the strays end, it died with them and the
  // installed update never reopened (RC d2139330). A relaunch asked for while quitting starts after them.
  const relaunched:Electron.RelaunchOptions[]=[];
  assert(!startPendingRelaunch(options=>relaunched.push(options)),'no relaunch unless one was asked for');
  relaunchAfterQuit({execPath:'/Applications/Worldlet.app/Contents/MacOS/Worldlet',args:['--window-capture','x.png']});
  assert(relaunched.length===0,'asking for a relaunch while quitting starts no relauncher yet');
  assert(startPendingRelaunch(options=>relaunched.push(options))&&!startPendingRelaunch(options=>relaunched.push(options)),'the relaunch starts once, after the strays');
  assert.deepEqual(relaunched,[{execPath:'/Applications/Worldlet.app/Contents/MacOS/Worldlet',args:['--window-capture','x.png']}]);
  const started=Date.now();await withDeadline(new Promise(()=>{}),50);
  assert(Date.now()-started<1000,'a hanging quit listener cannot hold the app open');
  assert(wantsQuit(['Worldlet.exe','--quit'])&&!wantsQuit(['Worldlet.exe']));
  // Windows asks WMI for the app's own children only, and asks again when the first query came back empty
  // (a timeout on a busy computer left two processes running after Quit Completely, Windows Alpha 4153).
  const asked:string[]=[];
  const answers=['','4321 10\r\n4322 10\r\n'];
  const children=await processRows('win32',10,async(_file,args)=>{asked.push(args.at(-1)!);return answers.shift()??'';});
  assert.deepEqual(children,[{pid:4321,ppid:10},{pid:4322,ppid:10}],'an unanswered query is asked once more');
  assert(asked.length===2&&asked.every(query=>query.includes('-Filter "ParentProcessId=10"')),'only the app\'s own children are listed');
  console.log('PASS Quit Completely: strays end with their trees, the update installer survives, a relaunch starts after the strays end, quit work has a deadline, --quit quits, Windows lists only the app\'s children');
 }
 assert(app.isReady(),'runs in an Electron main process');
 const imported=identity();
 assert.deepEqual(imported,Object.fromEntries(INSTALLATION_KEYS.map(key=>[key,(mac as Record<string,unknown>)[key]])),'the Mac host’s analytics identity is imported once');
 assert(INSTALLATION_KEYS.every(key=>!(PREFERENCE_KEYS as readonly string[]).includes(key)),'installation keys are never World preferences');
 console.log('PASS analytics choice and installation identity carry over from the Mac host, outside World preferences');

 store.ingest({title:'Kept',text:'Kept original',origin:'note',externalId:'kept'});
 const archive=capture(host);
 const paths=archive.files.map(entry=>entry.path);
 assert(paths.includes('world.sqlite')&&!paths.includes('index.json')&&paths.some(file=>file.startsWith('sources/')),paths.join(', '));
 assert(!paths.some(file=>['preferences.json','vault.json'].includes(file)||file.startsWith('logs/')||file.startsWith('Browser/')),'installation files stay out: '+paths.join(', '));
 assert.deepEqual(store.ledger().setting('preferences'),{'worldlet.companionName':'Pip'},'only World preferences travel, inside world.sqlite');
 refused({...archive,files:archive.files.filter(entry=>entry.path!=='world.sqlite')},/database/,'a backup without its library database');
 refused({...archive,files:archive.files.filter(entry=>!entry.path.startsWith('sources/'))},/original/,'a backup without an original');
 const file=path.join(scratch,'world.worldlet-backup');fs.writeFileSync(file,encode(archive));
 const decoded=decode(host,file);
 assert.deepEqual(decoded.files.map(entry=>entry.path),paths);
 dispose(archive);
 console.log('PASS a World backup holds the library and World preferences only, and refuses a missing database or original; an older format 1 file still decodes');

 // A later session changes the World and this computer's analytics identity, then restores.
 store.ingest({title:'Later',text:'Later original',origin:'note',externalId:'later'});
 preferences.set('worldlet.companionName','Changed');
 preferences.set('WorldletUsageInstallID','0F6C1B9E-7B1A-4E55-8C55-7C0E9C1D2A33');preferences.set('WorldletUsageAnonymousID','0F6C1B9E-7B1A-4E55-8C55-7C0E9C1D2A34');
 const current=identity();
 const kept=restore(host,decoded);
 store.reload();
 assert.deepEqual(store.state.sources.map((source:{title:string})=>source.title),['Kept'],'the World came back');
 assert.equal(preferences.get('worldlet.companionName'),'Pip','World preferences restored');
 assert.deepEqual(identity(),current,'analytics identity unchanged by the restore');
 assert.equal(new UsageAnalytics(host).enabled(),false,'the analytics choice is unchanged');
 assert(fs.existsSync(path.join(scratch,kept,'world.sqlite')),'the previous library is kept beside it');
 assert.deepEqual(Preferences.at(root).get('WorldletUsageInstallID'),current.WorldletUsageInstallID,'preferences.json stayed in the library');
 console.log('PASS a World backup restore keeps this computer’s analytics installation identity and choice');

 // World menu: the native labels, each item disabled when its World UI action is not allowed.
 const none={importFiles:false,generate:false,readConnectedApps:false};
 assert.deepEqual(worldMenuState(store),{importFiles:true,generate:false,readConnectedApps:false},'importing needs only a personal world; the rest wait for private context');
 store.state.cloudConsent=true;
 assert.deepEqual(worldMenuState(store),{importFiles:true,generate:true,readConnectedApps:false},'Generate needs a source; reading needs a connected app');
 store.state.connections.push({id:'C1',provider:'gmail',transport:'oauth',syncStatus:'disconnected'});
 assert.equal(worldMenuState(store).readConnectedApps,false,'a connection that cannot be read does not count');
 store.state.connections[0].syncStatus='connected';
 const allowed=worldMenuState(store);
 assert.deepEqual(allowed,{importFiles:true,generate:true,readConnectedApps:true});
 store.busy=true;assert.deepEqual(worldMenuState(store),none,'nothing starts while busy');store.busy=false;
 store.organizing=true;assert.deepEqual(worldMenuState(store),none,'nothing starts while organizing');store.organizing=false;
 store.writable=false;assert.deepEqual(worldMenuState(store),none,'a read-only library allows nothing');store.writable=true;
 store.state.sources.forEach((source:{enabled?:boolean})=>{source.enabled=false;});
 assert.equal(worldMenuState(store).generate,false,'Generate needs an enabled source');
 assert.deepEqual(core('worldMenuState',{writable:true,sample:true,busy:false,organizing:false,cloudConsent:true,sources:1,connections:1}),none,'the practice world allows nothing');
 const clicked:string[]=[];
 const actions={importFiles:()=>clicked.push('import'),generate:()=>clicked.push('generate'),readConnectedApps:()=>clicked.push('read')};
 for(const state of [allowed,none,{importFiles:true,generate:false,readConnectedApps:true}]){
  const [world]=Menu.buildFromTemplate([worldMenu(state,actions)]).items;
  assert.equal(world.label,'World');
  const items=world.submenu!.items;
  assert.deepEqual(items.map(item=>[item.label,item.enabled]),[['Import files…',state.importFiles],['Generate my world',state.generate],['Read connected apps',state.readConnectedApps]]);
  assert.equal(items[0].accelerator,'CommandOrControl+O');
 }
 for(const item of Menu.buildFromTemplate([worldMenu(allowed,actions)]).items[0].submenu!.items)item.click();
 assert.deepEqual(clicked,['import','generate','read'],'each item calls its World action');
 // Read connected apps: every enabled, idle check is due now; the check lanes read them.
 const due=core('sourceChecksReadNow',{now:500,checks:[{id:'gmail',provider:'gmail',enabled:true,nextAt:900},{id:'notion',provider:'notion',enabled:false,nextAt:900},{id:'todoist',provider:'todoist',enabled:true,lastStatus:'running',nextAt:900}]});
 assert.deepEqual(due,[{id:'gmail',provider:'gmail',enabled:true,nextAt:500}]);
 console.log('PASS the Mac World menu has the native labels and disables each action the World UI would refuse');

 // Real use (user_engaged): the person's own input on the World page, once per identity per UTC day. Script-dispatched
 // DOM events never reach the host's hooks; automation (a debugger attached), an unfocused app, mouse moves and key
 // releases do not count. Production delivery is replaced by a capture of the request bodies.
 {
  const engagedRoot=path.join(scratch,'engaged');fs.mkdirSync(engagedRoot,{recursive:true});
  const engagedHost:Host={...host,preferences:Preferences.at(engagedRoot),profile:{...host.profile,root:engagedRoot}};
  const sent:any[]=[];let focused=true,clock=Date.parse('2026-10-03T10:00:00Z'),fail=false;
  const analytics=new UsageAnalytics(engagedHost,{config:{key:'phc_check',url:'https://us.i.posthog.com/capture/',version:'2026.1003.1',build:'1',channel:'website'},
   fetch:(async(_url:unknown,init?:{body?:unknown})=>{sent.push(...JSON.parse(String(init?.body)).batch);return new Response('{}',{status:fail?503:200});}) as unknown as typeof fetch,
   focused:()=>focused,now:()=>clock});
  const engaged=()=>sent.filter(event=>event.event==='user_engaged');
  const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
  const view=new WebContentsView(),contents=view.webContents;
  await contents.loadURL('data:text/html,<input id="field"><button id="go">Go</button>');
  analytics.watchInput(contents);
  const native=(type:string)=>contents.emit(type.startsWith('mouse')?'before-mouse-event':'before-input-event',{preventDefault(){}},{type,x:4,y:4});
  await contents.executeJavaScript(`for(const type of ['keydown','keyup'])document.getElementById('field').dispatchEvent(new KeyboardEvent(type,{key:'a',bubbles:true}));
   document.getElementById('go').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));document.getElementById('go').click();document.getElementById('field').focus();true`);
  await settle();
  assert.equal(engaged().length,0,'script-dispatched clicks and keys never reach the host');
  for(const type of ['mouseMove','mouseUp','keyUp','char','mouseEnter'])native(type);
  await settle();assert.equal(engaged().length,0,'moves and releases are not use');
  focused=false;native('keyDown');await settle();assert.equal(engaged().length,0,'an unfocused app does not count');
  focused=true;contents.debugger.attach('1.3');native('keyDown');native('mouseDown');await settle();
  assert.equal(engaged().length,0,'automation driving the page through a debugger does not count');
  contents.debugger.detach();
  assert.equal(personInput('keyDown',{focused:true,automated:false}),true);assert.equal(personInput('mouseWheel',{focused:true,automated:true}),false);
  native('mouseDown');await settle();
  assert.equal(engaged().length,1,'the person\'s click sends user_engaged');
  const first=engaged()[0];
  assert.equal(first.properties.engagement_kind,'input');assert.equal(first.properties.environment,'production');
  assert.equal(first.timestamp,'2026-10-03T10:00:00.000Z');
  clock+=60_000;native('keyDown');native('mouseWheel');analytics.recordProductEvent('user_engaged','',{engagement_kind:'fox_message'});await settle();
  assert.equal(engaged().length,1,'once a day');
  // The next UTC day: the World page reports the person's Fox message first; a failed delivery is retried with the
  // same UUID and kind.
  clock+=86_400_000;fail=true;focused=false;analytics.recordProductEvent('user_engaged','',{engagement_kind:'fox_message'});await settle();
  assert.equal(engaged().length,1,'a report while no window of the app is focused does not count');
  focused=true;analytics.recordProductEvent('user_engaged','',{engagement_kind:'fox_message',text:'private message'});await settle();
  assert.equal(engaged().length,2);
  fail=false;clock+=31_000;native('keyDown');await settle();
  const [failed,retried]=engaged().slice(1);
  assert.deepEqual([retried.uuid,retried.properties.engagement_kind],[failed.uuid,'fox_message'],'the retry is the same event');
  clock+=60_000;native('keyDown');await settle();assert.equal(engaged().length,3,'delivered once that day');
  clock+=86_400_000;analytics.recordProductEvent('user_engaged','',{engagement_kind:'<script>'});await settle();
  assert.equal(engaged().at(-1).properties.engagement_kind,'other','an unknown kind is not passed through');
  assert.doesNotMatch(JSON.stringify(sent),/private|<script>/);
  analytics.setEnabled(false);clock+=86_400_000;native('keyDown');await settle();
  assert.equal(engaged().length,4,'nothing after the person turns sharing off');
  assert.ok(sent.every(event=>event.event==='user_engaged'),'only user_engaged was sent: '+sent.map(event=>event.event).join(', '));
  contents.close();
  console.log('PASS user_engaged: a person\'s own input or Fox message once a day; synthetic DOM events, automation, unfocused input and moves do not count');
 }

 // Invite tracking: a fresh installation asks worldlet.ai once which invited download it came from and then sends that
 // opaque token with its events; an installation that already reported a day never asks.
 {
  const inviteRoot=path.join(scratch,'invite');fs.mkdirSync(inviteRoot,{recursive:true});
  const inviteHost:Host={...host,preferences:Preferences.at(inviteRoot),profile:{...host.profile,root:inviteRoot}};
  const claims:any[]=[],events:any[]=[];
  const analytics=new UsageAnalytics(inviteHost,{config:{key:'phc_check',url:'https://us.i.posthog.com/capture/',version:'2026.1003.1',build:'1',channel:'website'},
   fetch:(async(url:unknown,init?:{body?:unknown})=>{
    if(String(url)===INSTALL_CLAIM_URL){claims.push(JSON.parse(String(init?.body)));return Response.json({token:'0123456789abcdef0123456789abcdef'});}
    events.push(...JSON.parse(String(init?.body)).batch);return new Response('{}');
   }) as unknown as typeof fetch,focused:()=>true,system:'darwin'});
  analytics.recordActiveDay();
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(claims.length,1,'a fresh installation asks once');
  assert.deepEqual(Object.keys(claims[0]),['platform'],'only the system is sent');
  const active=events.find(event=>event.event==='app_active');
  assert.equal(active?.properties.invite_token,'0123456789abcdef0123456789abcdef','the first app_active carries the token');
  assert.equal(active?.properties.$set_once.invite_token,'0123456789abcdef0123456789abcdef');
  await analytics.claimInvite();analytics.recordProductEvent('applet_opened','',{applet:'gmail',trigger:'user'});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(claims.length,1,'never asked again');
  assert.equal(events.at(-1).properties.invite_token,'0123456789abcdef0123456789abcdef','later events carry it too');
  // Speed, update and Fox speak-first events carry only their allowlisted buckets (core/diagnostics/ANALYTICS.md).
  analytics.recordProductEvent('fox_proactive_asked','',{proactive_moment:'settled',proactive_status:'spoke',line:'private line'});
  analytics.recordProductEvent('page_load_timing','15_60s',{timing_outcome:'complete',page_engine:'cef',url:'https://private.example/'});
  analytics.recordProductEvent('update_applied','',{update_wait:'1_7d'});
  analytics.recordProductEvent('update_failed','',{update_stage:'prepare',update_error:'signature',error:'private detail'});
  analytics.recordProductEvent('app_build_changed','',{from_build:'2733'});analytics.recordProductEvent('app_build_changed','',{from_build:'private 1'});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(events.at(-2).properties.from_build,'2733','the Build before the new one');assert.equal(events.at(-1).properties.from_build,undefined,'only a Build number');
  const added=Object.fromEntries(events.slice(-6,-2).map(event=>[event.event,event.properties]));
  assert.deepEqual(Object.keys(added),['fox_proactive_asked','page_load_timing','update_applied','update_failed']);
  assert.equal(added.fox_proactive_asked.proactive_status,'spoke');assert.equal(added.page_load_timing.duration_bucket,'15_60s');
  assert.equal(added.page_load_timing.page_engine,'cef');assert.equal(added.update_applied.update_wait,'1_7d');assert.equal(added.update_failed.update_stage,'prepare');assert.equal(added.update_failed.update_error,'signature');
  assert.ok(!JSON.stringify(added).includes('private'),'no line, URL or error text');
  // Orders: where one went and why one ended unsent, as buckets only.
  analytics.recordProductEvent('order_sent','',{order_result:'stored',said:'private words'});analytics.recordProductEvent('order_stopped','',{order_stop:'left_app'});
  analytics.recordProductEvent('order_stopped','',{order_stop:'private reason'});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(events.slice(-3).map(event=>[event.event,event.properties.order_result??event.properties.order_stop]),[['order_sent','stored'],['order_stopped','left_app'],['order_stopped','other']]);
  assert.ok(!JSON.stringify(events.slice(-3)).includes('private'),'never the words or a free-text reason');
  console.log('PASS invite tracking: a fresh installation claims its invited download once and reports only the opaque token');
 }

 // World page web capture: the host hands the page PostHog's settings only with sharing on and forwards only PostHog's
 // ingestion paths for this project; anything else, or anything after sharing is switched off, goes nowhere.
 {
  const webRoot=path.join(scratch,'web-capture');fs.mkdirSync(webRoot,{recursive:true});
  const forwarded:string[]=[];
  const analytics=new UsageAnalytics({...host,preferences:Preferences.at(webRoot),profile:{...host.profile,root:webRoot}},{config:{key:'phc_check',url:'https://us.i.posthog.com/capture/',host:'https://us.i.posthog.com',version:'2026.1010.1',build:'1',channel:'website'},
   fetch:(async(url:unknown)=>{if(!String(url).endsWith('/batch/'))forwarded.push(String(url));return new Response('{}');}) as unknown as typeof fetch,focused:()=>true,system:'darwin'});
  assert.deepEqual(['/ingest/e/','/ingest/s/','/ingest/flags/','/ingest/array/phc_check/config','/ingest/capture/','/ingest/../api','/other/e/'].map(ingestPath),['/e/','/s/','/flags/','/array/phc_check/config',null,null,null]);
  const config=analytics.webConfig() as any;
  assert.equal(config.key,'phc_check');assert.equal(config.apiHost,'/ingest');assert.equal(config.properties.$geoip_disable,true);
  for(const url of ['worldlet://app/ingest/e/?ip=0','worldlet://app/ingest/array/phc_other/config','worldlet://app/ingest/decide/../../api/projects'])await analytics.ingest(new Request(url,{method:'POST',body:'{}'}));
  assert.deepEqual(forwarded,['https://us.i.posthog.com/e/?ip=0']);
  analytics.setEnabled(false);
  assert.equal(analytics.webConfig(),null);
  assert.equal((await analytics.ingest(new Request('worldlet://app/ingest/e/',{method:'POST',body:'{}'}))).status,204);
  assert.deepEqual(forwarded,['https://us.i.posthog.com/e/?ip=0']);
  console.log('PASS web capture: the World page gets PostHog settings only with sharing on; the host forwards only this project\'s ingestion paths');
 }

 // Native crashes (core/diagnostics/ANALYTICS.md#native-crashes): the next launch finds the system's report of a Mac
 // crash, or the Crashpad minidump of a Windows one, and sends PostHog the crashed thread as module + offset frames and
 // the exception only: no path, user name, registers or the OS's misleading export names for the app's own modules.
 {
  const crashRoot=path.join(scratch,'native-crash'),reports=path.join(crashRoot,'DiagnosticReports'),dumps=path.join(crashRoot,'crashes','reports');
  fs.mkdirSync(reports,{recursive:true});fs.mkdirSync(dumps,{recursive:true});
  const images=[{name:'Worldlet',arch:'arm64',uuid:'4c4c448f-5555-3144-a1ab-f1a26eb65237',path:'/Users/private-person/Applications/Worldlet.app/Contents/MacOS/Worldlet'},
   {name:'Electron Framework',arch:'arm64',uuid:'4c4c4412-5555-3144-a10a-0d09c3791472',path:'/Users/private-person/Applications/Worldlet.app/Contents/Frameworks/Electron Framework'},
   {name:'libsystem_pthread.dylib',arch:'arm64',uuid:'8a3e7a35-7fd6-3b4e-9d0b-2f1c7c0a5e11',path:'/usr/lib/system/libsystem_pthread.dylib'}];
  const ips=JSON.stringify({app_name:'Worldlet',app_version:'2026.1007.3149',bug_type:'309',bundleID:'app.worldlet.mac'})+'\n'+JSON.stringify({
   procName:'Worldlet',procPath:'/Users/private-person/Applications/Worldlet.app/Contents/MacOS/Worldlet',faultingThread:1,
   bundleInfo:{CFBundleIdentifier:'app.worldlet.mac'},exception:{type:'EXC_BREAKPOINT',signal:'SIGTRAP',codes:'0x1, 0x1246f813c'},asi:{'Worldlet':['private@example.com']},
   threads:[{frames:[{imageIndex:2,imageOffset:12}]},{name:'private thread',threadState:{x:[{value:1234}]},frames:[
    {imageIndex:1,imageOffset:0x90b413c,symbol:'ares_llist_node_next',symbolLocation:48115252},{imageIndex:1,imageOffset:0x45e540},{imageIndex:2,imageOffset:0x7d00,symbol:'_pthread_start'}]}],usedImages:images});
  fs.writeFileSync(path.join(reports,'Worldlet-2026-10-07-230224.ips'),ips);
  fs.writeFileSync(path.join(reports,'Worldlet Dev-2026-10-07-230224.ips'),ips);fs.writeFileSync(path.join(reports,'Mail-2026-10-07-230224.ips'),ips);
  const found=nativeCrashes({since:Date.now()-60_000,dumps,system:'darwin',reports});
  assert.deepEqual(found.map(crash=>path.basename(crash.file)),['Worldlet-2026-10-07-230224.ips'],'only Worldlet\'s own processes');
  assert.deepEqual(nativeCrashes({since:Date.now()+60_000,dumps,system:'darwin',reports}),[],'nothing older than the last look');
  // A Windows minidump: header, stream directory, exception stream (STACK_BUFFER_OVERRUN, Chromium's CHECK) and module list.
  const bytes=new Uint8Array(1024),view=new DataView(bytes.buffer);
  const names=['C:\\Users\\private-person\\AppData\\Local\\Programs\\Worldlet\\Worldlet.exe','C:\\Windows\\System32\\ntdll.dll'];
  view.setUint32(0,0x504d444d,true);view.setUint32(8,2,true);view.setUint32(12,32,true);
  view.setUint32(32,6,true);view.setUint32(36,168,true);view.setUint32(40,56,true);view.setUint32(44,4,true);view.setUint32(48,220,true);view.setUint32(52,224,true);
  view.setUint32(56+8,0xc0000409,true);view.setBigUint64(56+24,0x140000000n+0x1234abcn,true);
  view.setUint32(224,2,true);let name=444;
  names.forEach((full,i)=>{const at=228+i*108;view.setBigUint64(at,i?0x7ff800000000n:0x140000000n,true);view.setUint32(at+8,i?0x200000:0x10000000,true);view.setUint32(at+20,name,true);
   if(!i){view.setUint32(at+24,0xfeef04bd,true);view.setUint32(at+32,(2026<<16|1007)>>>0,true);view.setUint32(at+36,(3150<<16)>>>0,true);}
   view.setUint32(name,full.length*2,true);for(let c=0;c<full.length;c++)view.setUint16(name+4+c*2,full.charCodeAt(c),true);name+=4+full.length*2;});
  fs.writeFileSync(path.join(dumps,'0f9a.dmp'),bytes);
  const windows=nativeCrashes({since:Date.now()-60_000,dumps:path.join(crashRoot,'crashes'),system:'win32'});
  assert.equal(windows.length,1);
  const dump=minidumpCrash(fs.readFileSync(windows[0].file));
  assert.deepEqual(dump,{program:'Worldlet.exe',code:'c0000409',arch:'x64',build:'2026.1007.3150',frames:[{module:'Worldlet.exe',offset:0x1234abc}]});
  assert.equal(minidumpCrash(new Uint8Array(64)),null,'not a minidump');
  const events:any[]=[];
  const analytics=new UsageAnalytics({...host,preferences:Preferences.at(crashRoot),profile:{...host.profile,root:crashRoot}},{config:{key:'phc_check',url:'https://us.i.posthog.com/capture/',version:'2026.1008.3168',build:'3168',channel:'website'},
   fetch:(async(_url:unknown,init?:{body?:unknown})=>{events.push(...JSON.parse(String(init?.body)).batch);return new Response('{}');}) as unknown as typeof fetch,focused:()=>true,system:'darwin'});
  analytics.recordNativeCrash(nativeCrashFromIps(fs.readFileSync(found[0].file,'utf8'))!);analytics.recordNativeCrash(dump!);
  await new Promise(resolve=>setTimeout(resolve,30));
  const [mac,win]=events.map(event=>event.properties);
  assert.deepEqual(events.map(event=>event.event),['$exception','$exception']);
  assert.deepEqual([mac.error_code,mac.$exception_level,mac.crash_process,mac.crash_signal,mac.crash_build,mac.crash_arch,mac.crash_module_id,mac.app_build],
   ['nativeCrash','fatal','Worldlet','SIGTRAP','2026.1007.3149','arm64','4C4C4412-5555-3144-A10A-0D09C3791472','3168']);
  const exception=mac.$exception_list[0];
  assert.equal(exception.value,'EXC_BREAKPOINT in Electron Framework (Worldlet)');assert.equal(exception.mechanism.handled,false);
  assert.deepEqual(exception.stacktrace.frames.map((frame:any)=>[frame.filename,frame.function,frame.in_app]),
   [['libsystem_pthread.dylib','_pthread_start',false],['Electron Framework','Electron Framework+0x45e540',true],['Electron Framework','Electron Framework+0x90b413c',true]],'oldest first; the app\'s own frames by offset');
  assert.deepEqual([win.$exception_list[0].type,win.crash_build,win.$exception_list[0].stacktrace.frames[0].function],['EXCEPTION_STACK_BUFFER_OVERRUN','2026.1007.3150','Worldlet.exe+0x1234abc']);
  assert.doesNotMatch(JSON.stringify(events),/private|ares_llist|threadState|Users|System32/,'no path, user name, registers, thread name or annotation');
  console.log('PASS native crashes: the next launch sends the crashed thread as module + offset frames and the exception, nothing private');
 }

 // Windows Companion lifecycle on real windows; the notification-area icon is recorded, not drawn.
 const noop={back:()=>{},quit:()=>{}};
 assert.equal(companionEntry(host,noop,'darwin'),null,'Mac keeps its Dock menu and adds no tray icon');
 assert.equal(companionEntry(host,noop,'linux'),null);
 const world=new BaseWindow({width:400,height:300,show:false}),view=new WebContentsView();
 world.contentView.addChildView(view);view.setBounds({x:0,y:0,width:400,height:300});
 const live:Host={...host,window:()=>world,worldView:()=>view,page:{...host.page,ready:()=>true}};
 const trays:{tooltip:string,menu:Menu|null,click:()=>void,destroyed:boolean}[]=[];
 const fake:TrayFactory=()=>{const tray={tooltip:'',menu:null as Menu|null,click:()=>{},destroyed:false};trays.push(tray);
  return {setToolTip:text=>{tray.tooltip=text;},setContextMenu:menu=>{tray.menu=menu;},on:(_event,listener)=>{tray.click=listener;},destroy:()=>{tray.destroyed=true;}};};
 let quits=0,closeQuits=0,unfinished=true;
 const desktop:DesktopCompanion=new DesktopCompanion(live,companionEntry(live,{back:()=>{void desktop.restoreWorld();},quit:()=>{quits+=1;}},'win32',fake),{quit:()=>{closeQuits+=1;},unfinished:()=>unfinished,follows:false});
 desktop.attach();
 // Until onboarding is over, closing quits and Fox does not stay on the desktop (owner request 2026-10-04).
 assert(desktop.shouldKeepOpen(),'closing during onboarding keeps the window from merely closing');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(closeQuits,1,'closing during onboarding quits the app');
 assert(!desktop.isDesktop&&trays.length===0,'and leaves no Fox on the desktop');
 unfinished=false;
 // Fox's task page follows the presentation (#1175): told after the Companion's window shows and
 // after the World is back, with that window's bounds while it is out.
 const presentations:boolean[]=[];desktop.onPresentation(away=>presentations.push(away));
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 // Back to World focuses the World; Mac delivers that focus later, and a late focus would restore the next detach.
 const focused=()=>new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);world.once('focus',()=>{clearTimeout(timer);resolve();});});
 const detach=async()=>{assert(desktop.shouldKeepOpen(),'closing the World keeps Fox on the desktop');await tick();await tick();assert(desktop.isDesktop);};
 assert.equal(desktop.panelBounds(),null,'no Companion window while the World shows');
 await detach();
 assert.deepEqual(presentations,[true],'told once the Companion is on the desktop');
 const out=desktop.panelBounds();
 assert(out&&out.width>0&&out.height>0,'the Companion window\'s bounds while it is out: '+JSON.stringify(out));
 assert.equal(trays.length,1,'detaching adds one tray icon');
 assert.equal(trays[0].tooltip,'Worldlet Check');
 assert(!world.isVisible(),'the World is hidden');
 assert.deepEqual(trays[0].menu!.items.map(item=>item.label),['Back to World','','Quit Completely']);
 let back=focused();trays[0].click();await back;await tick();
 assert(!desktop.isDesktop&&world.isVisible(),'clicking the icon restores the World');
 assert.deepEqual(presentations,[true,false],'told once the World is back');assert.equal(desktop.panelBounds(),null);
 assert(trays[0].destroyed,'the icon goes when the World returns');
 await detach();
 assert.equal(trays.length,2);
 desktop.shouldKeepOpen();await tick();
 assert.equal(trays.length,2,'closing again while on the desktop adds no second icon');
 back=focused();trays[1].menu!.items[0].click();await back;await tick();
 assert(!desktop.isDesktop&&trays[1].destroyed,'Back to World restores the World and removes the icon');
 await detach();
 trays[2].menu!.items[2].click();
 assert.equal(quits,1,'Quit Completely quits');
 desktop.stop();await tick();
 assert(trays[2].destroyed,'quitting removes the icon');
 if(process.platform==='win32'){
  assert(trayIcon(host).endsWith('worldlet.ico'),'the checkout brand icon: '+trayIcon(host));
  const real=companionEntry(host,noop)!;
  real.show();assert(real.shown);real.hide();await tick();assert(!real.shown);
 }
 console.log('PASS on Windows the desktop Companion keeps a tray way back to the World, removed on restore, with Quit Completely');
 // Another app in front (owner Order 2026-10-09): Fox floats on top while the World window stays where it was.
 {
  const world=new BaseWindow({width:400,height:300,show:false}),view=new WebContentsView();
  world.contentView.addChildView(view);view.setBounds({x:0,y:0,width:400,height:300});
  const page={...host.page,ready:()=>true,call:async(name:string)=>name==='worldletCompanionGeometry'?{x:10,y:10,width:120,height:140}:undefined} as Host['page'];
  const live:Host={...host,window:()=>world,worldView:()=>view,page};
  let front=true,busy=false,unfinished=true;
  const trays:string[]=[];
  const fake:TrayFactory=()=>{trays.push('shown');return {setToolTip:()=>{},setContextMenu:()=>{},on:()=>{},destroy:()=>{}};};
  const desktop=new DesktopCompanion(live,companionEntry(live,noop,'win32',fake),{quit:()=>{},unfinished:()=>unfinished,inFront:()=>front,follows:true});
  desktop.keepInWorld(()=>busy);
  desktop.attach();world.showInactive();
  const away=async()=>{world.emit('blur');for(let i=0;i<20&&!desktop.isDesktop;i++)await new Promise(resolve=>setTimeout(resolve,50));};
  front=false;await away();
  assert(!desktop.isDesktop,'during onboarding Fox stays in the World when another app comes to the front');
  unfinished=false;front=true;await away();
  assert(!desktop.isDesktop,'focus moving to another Worldlet window keeps Fox in the World');
  front=false;busy=true;await away();
  assert(!desktop.isDesktop,'a website, video or call open in the World keeps Fox there');
  busy=false;await away();
  assert(desktop.isDesktop&&desktop.panelBounds(),'another app in front puts Fox on the desktop');
  assert(world.isVisible()&&!world.contentView.children.includes(view),'the World window stays where it was while Fox is out');
  assert.equal(trays.length,0,'the World keeps its taskbar button, so no tray icon');
  world.emit('focus');await new Promise(resolve=>setImmediate(resolve));
  assert(!desktop.isDesktop&&world.contentView.children.includes(view),'bringing the World back to the front brings Fox back into it');
  desktop.stop();
  console.log('PASS another app in front puts Fox on the desktop; the World coming back brings it home');
 }
 for(const window of BaseWindow.getAllWindows())window.destroy();
}catch(error){console.error('FAIL shell:',error);process.exitCode=1;}
finally{store.closeLedger();fs.rmSync(scratch,{recursive:true,force:true});}
