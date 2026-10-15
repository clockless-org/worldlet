// The Node host (platform/node/README.md): Worldlet with no screen, for Linux and any computer without a display. It
// builds the same Host as the Electron host (platform/electron/src/main.ts) with no window, installs the host modules
// that work without one, and starts their work at once: Attention reading, routines, the standing `worldlet` MCP for
// Hermes and the browser link through the pairing room. The World page itself opens in a web browser on this computer:
// the host serves it on 127.0.0.1 and reaches it over its socket (host/web-page.ts). `electron` is this folder's shim
// (electron-shim.ts), aliased by scripts/build-node-host.ts.
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
import {createPagePair,NO_PAGE,serveWorldWeb,WORLD_LINK_FILE} from '../../electron/src/host/world-web.ts';
import {roomDenied} from '../../../contracts/web-world.ts';
import {AGENT,PHONE,VAULT,WORLD_ROOM_PAGE,WORLD_WEB,type AgentService,type PhoneService,type VaultService,type WorldRoomPageService,type WorldWebService} from '../../electron/src/host/services.ts';
import type {Host,PageBridge} from '../../electron/src/host/types.ts';
import type {HostFeatures} from '../../../contracts/platform.ts';
import {isWorldToolsRegistrar} from '../../../core/agent/index.ts';
import {onboardingUnfinished} from '../../../core/onboarding/index.ts';
import {ALREADY_RUNNING,controlSocketPath,serveControl,type ControlReply,type ControlRequest} from './control.ts';
import {mcpHome,openMcpHome,registerAgent,registeredAgents} from './mcp-home.ts';
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
/** Where the browser link is written for the person: owner-only, in the library (`worldlet link` prints it too). */
export const ROOM_LINK_FILE='room-link.txt';
/** The full World's link for another device, through the pairing room, owner-only beside it. */
export const WORLD_ROOM_LINK_FILE='world-room-link.txt';
/** The World's link on this computer (`http://127.0.0.1:<port>/world/#t=<token>`), owner-only beside it. */
export {WORLD_LINK_FILE};

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
const startedListeners:(()=>void)[]=[],quitListeners:(()=>void|Promise<void>)[]=[],loadedListeners:(()=>void)[]=[],connectedListeners:(()=>void)[]=[],reloadListeners:(()=>void)[]=[];
const router=new HostRouter(()=>host);
const each=(listeners:(()=>void)[],operation:string)=>{for(const listener of listeners)try{listener();}catch(error){diagnostics.record(error,operation);}};
// As in the Electron host, only Fox, connection, content and onboarding requests keep a diagnostic when they fail.
const PERSISTED_REQUEST_FAILURES=['agentChat','hermesChat','connect','appContent','onboarding','foxPreferences','localAgent','localHermes'];
/** The World pages: a browser's on this computer (one at a time) and one on another device, met through the pairing
 * room (one at a time, with only what ROOM_ALLOWED lets through: contracts/web-world.ts). With none, calls answer
 * nothing. A page coming is the host's page load; the last page going is its reload. */
let sent='';
const failed=(body:Record<string,unknown>,error:unknown)=>{if((error as Error)?.name!=='AbortError'&&PERSISTED_REQUEST_FAILURES.includes(body.action as string))diagnostics.record(error,String(body.action),typeof body.id==='string'?body.id:'');};
const loaded=()=>{sent='';each(loadedListeners,'pageLoaded');each(connectedListeners,'pageConnected');};
const gone=()=>{if(!pages.page.ready())each(reloadListeners,'pageReload');};
/** A page's requests go to the router; the work they name is that page's (createPagePair note). */
const dispatchFrom=(origin:'web'|'remote')=>async(body:Record<string,unknown>)=>{pages.note(origin,body);const value=await router.dispatch(body,null,'web');pages.note(origin,body,value);return value;};
const web=createWebPage({platform:platformName(),dispatch:dispatchFrom('web'),loaded,gone,failed});
const remote=createWebPage({platform:platformName(),denied:roomDenied,dispatch:dispatchFrom('remote'),loaded,gone,failed});
const pages=createPagePair(NO_PAGE,web.page,remote.page);
/** The browser link's state is logged when it changes (the state alone; the link itself only goes into its owner-only
 * file). */
let linkState='';
const page:PageBridge={...pages.page,
 event(name,detail){
  pages.page.event(name,detail);
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
 onPageConnected:listener=>{connectedListeners.push(listener);},
 onQuit:listener=>{quitListeners.push(listener);},
 onStarted:listener=>{startedListeners.push(listener);}
};
host.provide(VAULT,createVault(profile.root,'app.worldlet.context',nodeVaultStorage(profile.root)));
host.provide<WorldRoomPageService>(WORLD_ROOM_PAGE,{accept:socket=>remote.connect(socket)});
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
  web.close();remote.close();
  await withDeadline(Promise.allSettled(quitListeners.map(listener=>Promise.resolve().then(listener))),4000);
  try{store.closeLedger();}catch(error){diagnostics.record(error,'quit');}
  // Nothing this host spawned outlives it: a Hermes worker or a tool still running is ended.
  await withDeadline(endStrayChildren(process.platform,[]),5000);
  log('stopped');
  process.exitCode=code;
  // A parent's IPC channel would otherwise keep the process running.
  process.disconnect?.();
  // Timers and sockets the modules keep must not hold the process once quit work is done.
  setTimeout(()=>process.exit(code),200).unref();
 })();
}
process.on('SIGTERM',()=>shutdown(0));
process.on('SIGINT',()=>shutdown(0));
/** The stop that works everywhere: on Windows a SIGTERM ends a process at once, with no handler run, so a parent that
 * started this host with an IPC channel (a service wrapper, the check) sends this message instead. */
const STOP_MESSAGE='worldlet:stop';
process.on('message',message=>{if(message&&typeof message==='object'&&(message as {type?:unknown}).type===STOP_MESSAGE)shutdown(0);});
app.on('quit-requested',()=>shutdown(0));

each(startedListeners,'hostStarted');
log(`started ${app.getVersion()} with the library at ${profile.root}`);

/** Writes a link the phone module made into its owner-only file in the library. The link carries its secret: it goes
 * only into that file, never to stdout (a service's journal). */
async function keepLink(file:string,what:string,operation:string,make:()=>Promise<Record<string,unknown>|undefined>|undefined){
 try{
  const status=await make(),link=status?.link;
  if(typeof link!=='string'||!link)throw Error(`No ${what} was made.`);
  writeAtomic(path.join(profile.root,file),link+'\n',0o600);
  log(`${what} ready in ${path.join(profile.root,file)}`);
 }catch(error){diagnostics.record(error,operation);log(`${what} failed: ${errorMessage(error)}`);}
}
/** The browser link (core/phone/README.md#web), made once and kept: a phone or any browser opens it to reach this
 * computer. Room only here: browsers' direct lines need WebRTC, which this host does not have yet. It carries the full
 * World's pairing too (PhoneService.worldLink, as `world/link`). */
void keepLink(ROOM_LINK_FILE,'room link','roomLink',()=>host.use<PhoneService>(PHONE).worldLink?.());
/** The full World's link for another device (core/phone/world-room.ts, `kind: 'world'`), made once and kept beside it:
 * the World bundle opens it and meets this host in the pairing room. */
void keepLink(WORLD_ROOM_LINK_FILE,'World link for another device','worldRoomLink',()=>host.use<PhoneService>(PHONE).worldRoomLink?.());

/** The World on this computer (contracts/web-world.ts): the full World page, served on 127.0.0.1 beside the browser
 * link's own page, for a browser here that opens the link. The link carries a token kept in the vault; it goes only
 * into its owner-only file, never to stdout. */
let world:Promise<string>|null=null;
const serveWorld=()=>world??=(async()=>{
 const server=await host.use<PhoneService>(PHONE).localServer!();
 const served=serveWorldWeb({root:profile.root,webRoot:profile.webRoot,vault:host.use<VaultService>(VAULT),server,accept:socket=>web.connect(socket)});
 log(`World ready at ${served.origin}/world/ (its link is in ${served.file})`);
 return served.link;
})().catch(error=>{world=null;throw error;});
host.provide<WorldWebService>(WORLD_WEB,{link:serveWorld});
serveWorld().catch(error=>{diagnostics.record(error,'worldWeb');log('World page failed: '+errorMessage(error));});

/** The `worldlet` command line (control.ts): answers go only to the asker, never to this host's log. */
const setupDone=()=>store.state.cloudConsent===true&&!onboardingUnfinished(store.state.onboarding);
const NOT_SET_UP='The person has not finished setup yet: World tools answer only after they open the World (its link is in '+WORLD_LINK_FILE+' in the library) and finish setup there.';
async function answer(request:ControlRequest):Promise<ControlReply> {
 if(request.command==='link'){
  const status=await host.use<PhoneService>(PHONE).worldLink?.() as {link?:string}|undefined;
  if(!status?.link)throw Error('No browser link was made.');
  return {lines:[status.link]};
 }
 if(request.command==='register')return {lines:await registerAgent(request.agent!)};
 if(request.command==='setup'){
  const id=request.agent!,lines:string[]=[];
  // The same choice setup's first page makes in the World: it proves the Agent answers before Fox switches to it.
  // Codex alone is no Agent for Fox; it gets World tools.
  if(id!=='codex'){const chosen=await router.dispatch({action:'agentHarness',operation:'select',id}) as {title?:string};lines.push(`Fox talks through ${chosen.title??id}.`);}
  if(isWorldToolsRegistrar(id))lines.push(...await registerAgent(id));
  if(!setupDone())lines.push(NOT_SET_UP);
  return {lines};
 }
 const agent=host.optional<AgentService>(AGENT),pair=await router.dispatch({action:'phonePair',kind:'web',operation:'status'}) as {state?:string};
 const registered=registeredAgents();
 return {lines:[
  `Worldlet ${app.getVersion()} is running with the library at ${profile.root}.`,
  `Agent: ${agent?.id??'none'}${agent&&!agent.available?' (not available)':''}.`,
  setupDone()?'Setup: done.':'Setup: '+NOT_SET_UP,
  `Browser link: ${pair?.state??'unknown'} (worldlet link prints it).`,
  `MCP home: ${mcpHome()}, registered in ${registered.length?registered.join(', '):'no Agent yet'}.`]};
}
// Another host on this library (one that started at the same moment as this one: cli.ts turns away the rest) keeps it
// and its MCP home, and this one stops; any other failure leaves this host running without its command line.
serveControl(controlSocketPath(profile.root),answer).then(server=>{quitListeners.push(()=>{server.close();});},error=>{
 log('control socket failed: '+errorMessage(error));
 if(errorMessage(error)===ALREADY_RUNNING)shutdown(1);else diagnostics.record(error,'control');
}).then(()=>quitting?undefined:openMcpHome()).catch(error=>{diagnostics.record(error,'mcpHome');log('MCP home failed: '+errorMessage(error));});
