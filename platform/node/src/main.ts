// The Node host (platform/node/README.md): Worldlet with no screen, for Linux and any computer without a display. It
// builds the same Host as the Electron host (platform/electron/src/main.ts) with no window, installs the host modules
// that work without one, and starts their work at once: Attention reading, routines, the standing `worldlet` MCP for
// Hermes and the browser link through the pairing room. The World page itself opens in a web browser on this computer:
// the host serves it on 127.0.0.1 and reaches it over its socket (host/web-page.ts). `electron` is this folder's shim
// (electron-shim.ts), aliased by scripts/build-node-host.ts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {app,useProfileRoot} from './electron-shim.ts';
import {nodeVaultStorage} from './vault-storage.ts';
import {platformName,profileFrom} from '../../electron/src/profile.ts';
import {Preferences} from '../../electron/src/preferences.ts';
import {WorldStore} from '../../electron/src/store/world-store.ts';
import {HostRouter} from '../../electron/src/host/router.ts';
import {createDiagnostics} from '../../electron/src/host/diagnostics.ts';
import {endStrayChildren,withDeadline} from '../../electron/src/host/quit.ts';
import {FEATURE_OWNERS,hostCapabilities} from '../../electron/src/capabilities.ts';
import {ensureDirectory,errorMessage,writeAtomic} from '../../electron/src/files.ts';
import {createVault} from '../../electron/src/vault.ts';
import {createWebPage} from '../../electron/src/host/web-page.ts';
import {PHONE,VAULT,type PhoneService,type VaultService} from '../../electron/src/host/services.ts';
import type {Host,PageBridge} from '../../electron/src/host/types.ts';
import {WORLD_TOKEN,worldLink} from '../../../contracts/web-world.ts';
import type {HostFeatures} from '../../../contracts/platform.ts';
import {installWorld} from '../../electron/src/modules/world.ts';
import {installFox} from '../../electron/src/modules/fox/index.ts';
import {installAttention} from '../../electron/src/modules/attention/index.ts';
import {installAgentRuntime} from '../../electron/src/modules/agent-runtime/index.ts';
import {installSources} from '../../electron/src/modules/sources/index.ts';
import {installPhone} from '../../electron/src/modules/phone/index.ts';
import {installOngoing} from '../../electron/src/modules/tasks/index.ts';
import {installArtifacts} from '../../electron/src/modules/artifacts/index.ts';
import {installCalendar} from '../../electron/src/modules/calendar/index.ts';

/** The host modules that work with no window, in the Electron host's order (platform/electron/src/modules/index.ts).
 * The shell, browser, media, sound, voice, Applet tools, games, widgets, artifact pages, site Applets and Applet art
 * need a screen and stay out. */
export const NODE_MODULES:((host:Host)=>void)[]=[installWorld,installFox,installAttention,installAgentRuntime,installSources,installPhone,installOngoing,installArtifacts,installCalendar];
/** Where the browser link is written for the person (and, later, the `worldlet link` command): owner-only, in the library. */
export const ROOM_LINK_FILE='room-link.txt';
/** The World's link on this computer (`http://127.0.0.1:<port>/world/#t=<token>`), owner-only beside it. */
export const WORLD_LINK_FILE='world-link.txt';
/** The World's token for a browser on this computer, kept in the vault so the link survives a restart. */
const WORLD_TOKEN_VAULT='world-web-token';

// The program's own folder holds WorldletWeb (an installed copy); a checkout's build sits in dist/node beside dist/WorldletWeb.
const here=__dirname,resources=fs.existsSync(path.join(here,'WorldletWeb'))?here:path.dirname(here);
(process as {resourcesPath?:string}).resourcesPath=resources;
// Always an installed program (the release channel); `WORLDLET_PROFILE_ROOT` names another library.
const profile=profileFrom({packaged:true,resourcesPath:resources,appPath:here,rootOverride:true});
useProfileRoot(profile.root);
ensureDirectory(profile.root);
const log=(line:string)=>process.stdout.write(`worldlet: ${line}\n`);

const diagnostics=createDiagnostics(profile.root);
const preferences=Preferences.at(profile.root,()=>({}));
const services=new Map<string,unknown>();
const startedListeners:(()=>void)[]=[],quitListeners:(()=>void|Promise<void>)[]=[],loadedListeners:(()=>void)[]=[],reloadListeners:(()=>void)[]=[];
const router=new HostRouter(()=>host);
const each=(listeners:(()=>void)[],operation:string)=>{for(const listener of listeners)try{listener();}catch(error){diagnostics.record(error,operation);}};
// As in the Electron host, only Fox, connection, content and onboarding requests keep a diagnostic when they fail.
const PERSISTED_REQUEST_FAILURES=['agentChat','hermesChat','connect','appContent','onboarding','foxPreferences','localAgent','localHermes'];
/** The World page, when a browser on this computer has it open (one at a time); with none, calls answer nothing. */
let sent='';
const web=createWebPage({
 platform:platformName(),
 dispatch:body=>router.dispatch(body,null,'web'),
 loaded:()=>{sent='';each(loadedListeners,'pageLoaded');},
 gone:()=>each(reloadListeners,'pageReload'),
 failed:(body,error)=>{if((error as Error)?.name!=='AbortError'&&PERSISTED_REQUEST_FAILURES.includes(body.action as string))diagnostics.record(error,String(body.action),typeof body.id==='string'?body.id:'');},
});
/** The browser link's state is logged when it changes (the state alone; the link itself only goes into its owner-only
 * file). */
let linkState='';
const page:PageBridge={...web.page,
 event(name,detail){
  web.page.event(name,detail);
  if(name!=='worldlet:web-pair-status'||!detail||typeof detail!=='object')return;
  const status=detail as {state?:string;error?:string},line=`${status.state}${status.error?' ('+status.error+')':''}`;
  if(line!==linkState){linkState=line;log('room link '+line);}
 }};
const implemented=(feature:keyof HostFeatures)=>{const owner=FEATURE_OWNERS[feature];return !owner||router.has(owner)||services.has(owner);};
const store=new WorldStore(profile.root,preferences,{appName:profile.title,platform:platformName(),capabilities:()=>hostCapabilities(implemented),mockGoogleAvailable:false});
store.historyFailure=(error,kind)=>diagnostics.record(error,'worldHistory:'+(kind||'unknown'));
const host:Host={
 profile,preferences,store,page,diagnostics,
 window:()=>null,
 worldView:()=>null,
 register:actions=>router.register(actions),
 provide:(name,service)=>{services.set(name,service);return service;},
 use:name=>{if(!services.has(name))throw Error(`Missing host service ${name}`);return services.get(name) as any;},
 optional:name=>services.get(name) as any,
 // A browser's World page connects and goes away (host/web-page.ts).
 onPageReload:listener=>{reloadListeners.push(listener);},
 onPageLoaded:listener=>{loadedListeners.push(listener);},
 onQuit:listener=>{quitListeners.push(listener);},
 onStarted:listener=>{startedListeners.push(listener);}
};
host.provide(VAULT,createVault(profile.root,'app.worldlet.context',nodeVaultStorage(profile.root)));
for(const install of NODE_MODULES)install(host);

const contractCheck=process.argv.includes('--host-contract-check');

if(contractCheck){
 // What this host implements, as the Electron host reports it; the library was a temporary one (profile.ts).
 process.stdout.write(JSON.stringify({actions:router.names(),services:[...services.keys()].sort(),capabilities:hostCapabilities(implemented)})+'\n');
 store.closeLedger();fs.rmSync(profile.root,{recursive:true,force:true});
 process.exit(0);
}

// Attention reads the Applet contracts from the interface build (WorldletWeb), as the Electron host does.
if(!fs.existsSync(path.join(profile.webRoot,'applet-runtime.json'))){
 process.stderr.write(`worldlet: the Worldlet interface is missing at ${profile.webRoot}. Run npm run build:native-ui first.\n`);
 store.closeLedger();process.exit(1);
}

// The open World page gets each new snapshot, as in the Electron host; it ignores one whose revisions it holds.
store.onChange(()=>{
 if(!page.ready())return;
 const revisions=`${store.state.revision}:${store.activityRevision}`;
 if(revisions===sent)return;
 try{const snapshot=store.snapshot();sent=revisions;void page.call('worldletReceive',snapshot);}catch(error){diagnostics.record(error,'snapshot');}
});

let quitting=false;
function shutdown(code:number){
 if(quitting)return;
 quitting=true;
 void (async()=>{
  web.close();
  await withDeadline(Promise.allSettled(quitListeners.map(listener=>Promise.resolve().then(listener))),4000);
  try{store.closeLedger();}catch(error){diagnostics.record(error,'quit');}
  // Nothing this host spawned outlives it: a Hermes worker or a tool still running is ended.
  await withDeadline(endStrayChildren(process.platform,[]),5000);
  log('stopped');
  process.exitCode=code;
  // Timers and sockets the modules keep must not hold the process once quit work is done.
  setTimeout(()=>process.exit(code),200).unref();
 })();
}
process.on('SIGTERM',()=>shutdown(0));
process.on('SIGINT',()=>shutdown(0));
app.on('quit-requested',()=>shutdown(0));

each(startedListeners,'hostStarted');
log(`started ${app.getVersion()} with the library at ${profile.root}`);

/** The browser link (core/phone/README.md#web), made once and kept: a phone or any browser opens it to reach this
 * computer. Room only here: browsers' direct lines need WebRTC, which this host does not have yet. */
async function roomLink(){
 const ask=(operation:string)=>router.dispatch({action:'phonePair',kind:'web',operation}) as Promise<{state:string;link?:string;error?:string}>;
 let status=await ask('status');
 if(status.state==='none')status=await ask('start');
 if(!status.link)throw Error('No browser link was made.');
 const file=path.join(profile.root,ROOM_LINK_FILE);
 writeAtomic(file,status.link+'\n',0o600);
 // The link carries its secret: it goes only into the owner-only file, never to stdout (a service's journal).
 log(`room link ready in ${file}`);
}
roomLink().catch(error=>{diagnostics.record(error,'roomLink');log('room link failed: '+errorMessage(error));});

/** The World on this computer (contracts/web-world.ts): the full World page, served on 127.0.0.1 beside the browser
 * link's own page, for a browser here that opens the link. The link carries a token kept in the vault; it goes only
 * into its owner-only file, never to stdout. */
async function serveWorld(){
 const vault=host.use<VaultService>(VAULT);
 let token=vault.get(WORLD_TOKEN_VAULT)??'';
 if(!WORLD_TOKEN.test(token)){token=crypto.randomBytes(32).toString('base64url');vault.set(WORLD_TOKEN_VAULT,token);}
 const server=await host.use<PhoneService>(PHONE).localServer!();
 server.serveWorld({webRoot:profile.webRoot,token,accept:socket=>web.connect(socket)});
 const file=path.join(profile.root,WORLD_LINK_FILE);
 writeAtomic(file,worldLink(server.origin,token)+'\n',0o600);
 log(`World ready at ${server.origin}/world/ (its link is in ${file})`);
}
serveWorld().catch(error=>{diagnostics.record(error,'worldWeb');log('World page failed: '+errorMessage(error));});
