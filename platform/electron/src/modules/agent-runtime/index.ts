import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {app,shell} from 'electron';
import {WorldletError} from '../../files.ts';
import {AGENT,ANALYTICS,VAULT,type AgentService,type AnalyticsService,type VaultService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
import {installationRoot,type Profile} from '../../profile.ts';
import {ExecutionJournal} from './journal.ts';
import {attachedHermes,bindHermes,discoverOtherHermes,unbindHermes} from './hermes-files.ts';
import {keepHermesResident} from './hermes-service.ts';
import {openStandingWorldTools,type StandingWorldTools} from './world-tool-bridge.ts';
import {moveFoxProfile} from './fox-move.ts';
import {endHermesInstall,hermesSessionModels,installHermes,ownHermesAgent,signInHermes,type HermesInstallProgress} from './hermes-official.ts';
import {UPDATED,openSignIn} from './provider-sign-in.ts';
import {codexHome} from './agent-files.ts';
import {parseJSON5} from './openclaw-files.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import {ExternalAgentAdapter,NoAgentAdapter,UnavailableAgentAdapter,loadAgentConfiguration} from './external.ts';
import {LocalHarnessAdapter,LocalHarnessRuntime,currentEnvironment,harnessVersion,locateLocalHarnesses,openClawConfigFile,readSelection,selectedInstall,writeSelection,type LocalHarnessInstall} from './local-harness.ts';
import {runHarnessCommand,standingRules} from './harness-approvals.ts';
import {harnessConnections} from './harness-connections.ts';
import {AGENT_VERSIONS,PROVIDER_SETTING,agentProviders,agentTooOldMessage,agentVersionStatus,chooseProvider,isModelProviderId,openClawModels,providerSignIn,readProviderChoices,signedInProviders,type ModelProviderId,connectArgument,harnessToolsSummary,isLocalHarnessId,isMigrationSource,localHarness,readRemoteGatewayUrl,recommendLocalHarness,type LocalHarnessId} from '../../../../../core/agent/index.ts';
import {harnessTools} from './harness-services.ts';
import {harnessSend} from './harness-send.ts';
import {harnessVoice} from './harness-voice.ts';
import {surveyOpenClaw} from './openclaw-files.ts';
import {surveyAgentHistory} from './agent-files.ts';
import {readLocalAgentMemory,writeAdopted} from './local-memory.ts';
import {RemoteHarnessAdapter} from './remote-harness.ts';
import {RemoteGatewayAdapter,checkRemoteGateway,readRemoteGateway,remoteGatewayView,writeRemoteGateway} from './remote-gateway.ts';
import {createRemoteAgentLink,type RemoteAgentLink} from '../phone/remote.ts';
import type {Adapter,Row,RuntimeContext} from './types.ts';
import type {HarnessVoice} from '../../../../../contracts/harness-services.ts';
import {bundledResource} from '../../resources.ts';
import {GoogleAccount} from '../sources/google-account.ts';
import {GoogleSource,GoogleSourceAccess,GoogleSourceConnections} from '../sources/google-source.ts';
import {McpAccounts} from '../sources/mcp-account.ts';
import {McpSource,McpSourceAccess,McpSourceConnections} from '../sources/mcp-source.ts';
import {DoorDash,DoorDashSourceAccess} from '../sources/doordash.ts';

/** Which providers `install` is signed in to, as the Agent itself says (null: it does not say): Hermes Agent lists them
 * in a new ACP session, OpenClaw names their models in openclaw.json; Codex is signed in to ChatGPT when it has a
 * sign-in; Claude Code answers on its own Anthropic sign-in. */
async function providerSignIns(install:LocalHarnessInstall):Promise<ModelProviderId[]|null> {
 const environment=currentEnvironment();
 if(install.id==='codex')return fs.existsSync(path.join(codexHome(environment.home,environment.env),'auth.json'))?['chatgpt']:[];
 if(install.id==='claude-code')return ['anthropic'];
 let listed:{id:string}[]=[];
 try{
  if(install.id==='hermes')listed=(await hermesSessionModels(install,environment)).available.filter((id):id is string=>typeof id==='string').map(id=>({id}));
  if(install.id==='openclaw')listed=openClawModels(parseJSON5(fs.readFileSync(openClawConfigFile(environment),'utf8')));
 }catch{return null;}
 return signedInProviders(install.id,listed);
}

/** Selects the Agent adapter at launch (Mac AgentRuntimeProvider): WORLDLET_AGENT_CONFIG names an
 * external Harness; otherwise the Agent on another computer this Worldlet is paired with (`remote`);
 * otherwise the Gateway on another computer Fox uses directly (`remote-openclaw`, its address and token in `vault`);
 * otherwise a local Harness the person chose at setup, while it is still installed;
 * otherwise none yet (NoAgentAdapter: owner decisions 2026-10-09, no built-in Hermes). A bad configuration yields an
 * unavailable adapter that explains itself. */
export function selectAdapter(context:RuntimeContext,configuration=process.env.WORLDLET_AGENT_CONFIG,remote:RemoteAgentLink|null=null,vault:VaultService|null=null):Adapter {
 try{
  if(configuration!==undefined)return new ExternalAgentAdapter(context,loadAgentConfiguration(configuration));
  if(remote?.paired)return new RemoteHarnessAdapter(context,remote);
  const gateway=vault?readRemoteGateway(vault):null;
  if(gateway?.active)return new RemoteGatewayAdapter(context,gateway);
  const local=selectedInstall(context.root);
  // A Hermes Agent chosen before its profile became the World's Harness is attached on the next launch.
  if(local?.id==='hermes')try{attachChosenHermes(context.root,local.id,error=>context.failure(error,'foxMove'));}catch{}
  if(local)return new LocalHarnessAdapter(context,local);
  return new NoAgentAdapter(context);
 }catch(error){return new UnavailableAgentAdapter(context,error instanceof Error?error:new WorldletError(String(error)));}
}

/** The Agent runtime service over the selected adapter. Private and isolated homes are
 * registered with the execution journal; sample and setup homes never are. */
/** The World's own Google connection (owner decision 2026-10-09: a connection made through Worldlet is kept by the
 * Platform): Gmail, Calendar and Drive work the same whichever Agent Fox uses. Fox's Hermes profile's earlier grant is adopted. */
/** The World's account connections: Google, and the MCP connectors (Notion, Todoist, Linear, PayPal, Supabase,
 * GitHub), each used from the Agent's own profile when it already has it, else kept by the World; and DoorDash's
 * official CLI. */
export interface WorldSources {google:GoogleSource;mcp:McpSource;doordash:DoorDash}
export function worldSources(context:RuntimeContext,vault:VaultService,accountsHome:()=>string):WorldSources {
 const own=()=>path.join(context.root,'agent','private','hermes');
 const homes=()=>[...new Set([accountsHome(),own()])];
 const openExternal=(url:string)=>context.openExternal(url);
 const mcp=new McpSource({accounts:new McpAccounts({vault,agentHomes:homes}),openExternal,reviews:path.join(context.root,'accounts','notion-reviews')});
 const account=new GoogleAccount({folder:path.join(context.root,'accounts','google'),vault,clientFile:()=>bundledResource(context.profile,'googleClient'),adoptFrom:homes});
 const google=new GoogleSource({account,development:context.development,openExternal,ownProfile:own,legacyHomes:homes,notion:{connected:()=>mcp.connected('notion'),read:body=>mcp.read('notion',body)}});
 const doordash=new DoorDash({folder:path.join(context.root,'accounts','doordash'),legacyHomes:homes});
 return {google,mcp,doordash};
}

export function createAgentService(context:RuntimeContext,selected:Adapter|(()=>Adapter),listeners:((reason:AgentChange)=>void)[],sources:((accountsHome:()=>string)=>WorldSources)|null=null):AgentService {
 const current=typeof selected==='function'?selected:()=>selected;
 const journal=(home:string,enabled:boolean)=>ExecutionJournal.register(home,enabled,context.record);
 // The World's connections keep one owner whichever Agent Fox uses (connections carry transport `hermes`, the name they
 // have always had): their files live in Fox's earlier Hermes profile folder, and a chosen Hermes Agent's own profile
 // is read first, so what it is already connected to is used as it is (owner decision 2026-10-09).
 const accountsHome=()=>attachedHermes(context.root)??path.join(context.root,'agent','private','hermes');
 const world=sources?.(accountsHome)??null,worldGoogle=world?.google??null;
 // Fox's Harness's own text-to-speech, found once per Harness (locating it reads the PATH).
 let voice:{id:string;service:HarnessVoice|null}|null=null;
 return {
  get id(){return current().id;},
  get memoryAuthority(){return current().memoryAuthority;},
  get available(){return current().available;},
  get supportsBackgroundChecks(){return current().supportsBackgroundChecks;},
  hasInteractiveWork:()=>current().hasInteractiveWork(),
  make:()=>current().make(),
  // A getter: the adapter can change when setup picks a local Agent.
  get makeTask(){const adapter=current();return adapter.makeTask?()=>adapter.makeTask!():undefined;},
  makeBackground:()=>{const adapter=current(),background=adapter.background?.()??adapter;return background.makeLane?.()??background.make();},
  makeModelAccess:()=>current().makeModelAccess(),
  accountsId:'hermes',
  accountsHome:()=>journal(accountsHome(),true),
  // Every source the World reads runs in the Platform; anything else is the Agent's own (a person's own Harness
  // reads none).
  makeSourceAccess:()=>world?new GoogleSourceAccess(world.google,()=>new McpSourceAccess(world.mcp,()=>new DoorDashSourceAccess(world.doordash,()=>current().makeSourceAccess()))):current().makeSourceAccess(),
  makeSourceConnections:()=>world?new GoogleSourceConnections(world.google,()=>new McpSourceConnections(world.mcp,()=>current().makeSourceConnections(),()=>'hermes'),()=>'hermes'):current().makeSourceConnections(),
  googleAccount:()=>worldGoogle?.account??null,
  makeRoutines:()=>current().makeRoutines(),
  get harness(){return current().harness??null;},
  schedule:()=>current().schedule?.()??null,
  approvals:()=>current().approvals?.()??null,
  // Every Harness here that keeps standing rules Worldlet can read, as `detect` finds them (the `hermes` Worldlet set
  // up for Fox's own profile is Fox, not the person's Hermes Agent); a revoke tells Fox's adapter to forget it too.
  standingRules:()=>locateLocalHarnesses().filter(install=>install.id!=='hermes'||discoverOtherHermes(context.root)!==null).flatMap(install=>{
   const rules=standingRules(install,currentEnvironment());
   return rules?[{harness:install.id,title:install.title,rules:{list:()=>rules.list(),revoke:async(id:string)=>{await rules.revoke(id);current().forgetApprovals?.(install.id);}}}]:[];
  }),
  // The same Harnesses' connections (Settings › Accounts); Fox's own Hermes profile is not the person's Hermes Agent.
  harnessConnections:()=>locateLocalHarnesses().filter(install=>install.id!=='hermes'||discoverOtherHermes(context.root)!==null).flatMap(install=>{
   const connections=harnessConnections(install,currentEnvironment());
   return connections?[{harness:install.id,title:install.title,connections}]:[];
  }),
  harnessEvents:()=>current().harnessEvents?.()??null,
  harnessCalls:()=>current().harnessCalls?.()??null,
  harnessTools:()=>current().harnessTools?.()??null,
  harnessSkills:()=>current().harnessSkills?.()??null,
  channelSend:source=>harnessSend(source),
  onChannelTool:handler=>{channelTool=handler;},
  voice:()=>{const id=current().harness?.id;if(!id)return null;if(voice?.id!==id)voice={id,service:harnessVoice(id)};return voice.service;},
  agents:()=>current().agents?.()??null,
  models:()=>current().models?.()??null,
  status:home=>current().status(home),
  prepare:async()=>{await current().prepare?.();},
  home:scope=>journal(current().home(scope),scope==='private'),
  isolatedHome:scope=>{
   if(!['derivation','monitor','applet-analysis'].includes(scope))throw new WorldletError('Unknown isolated Agent scope.');
   return journal(path.join(context.root,'agent',scope,current().id),true);
  },
  warm:(home,prime)=>current().warm(home,prime),
  shutdown:()=>current().shutdown(),
  whileStopped:work=>{const adapter=current();return adapter.whileStopped?adapter.whileStopped(work):adapter.shutdown().then(work);},
  onChanged:listener=>{listeners.push(listener);},
  checkpointCompanion:archive=>current().checkpointCompanion(archive),
  captureCompanion:(archive,imported)=>current().captureCompanion(archive,imported),
  installCompanion:(archive,existing,imported,install)=>current().installCompanion(archive,existing,imported,install),
  allowsBackupPath:relative=>current().allowsBackupPath(relative),
  validateBackupEntry:(relative,data)=>current().validateBackupEntry(relative,data),
  diagnosticFiles:home=>current().diagnosticFiles(home),
  profile:(discover=false)=>current().profile(discover),
  bindProfile:file=>current().bindProfile(file),
  resetRetainedPaths:()=>current().resetRetainedPaths(),
  resetExplanation:()=>current().resetExplanation(),
  // A getter: the adapter can change when setup picks a local Agent.
  get replaceCompanionMemories(){const adapter=current();return adapter.replaceCompanionMemories?(memories:Row[],commit:()=>void)=>adapter.replaceCompanionMemories!(memories,commit):undefined;}
 };
}

export function runtimeContext(profile:Profile,options:Omit<RuntimeContext,'profile'|'root'|'development'>):RuntimeContext {
 return {profile,root:profile.root,development:profile.channel==='dev',...options};
}

type AgentChange='runtime-ready'|'model-changed'|'agent-changed';

/** Forgets the local Agent chosen on setup's first page (and an earlier adopted one), and a Hermes Agent's attachment. */
export function forgetSetupChoice(root:string){writeSelection(root,null);writeAdopted(root,null);unbindHermes(root);}

/** The person's own Hermes Agent is the World's Harness (owner decision 2026-10-07): the World's account
 * connections, background checks, Applet tasks and routines run on its profile, so whatever it is connected to
 * keeps working in the World and a new connection is made in that profile. Any other choice ends the attachment. */
export function attachChosenHermes(root:string,id:string,failure:(error:unknown)=>void=()=>{}){
 // Fox's own profile, reached through the standard location (Worldlet once linked it there), is not another Agent to attach.
 const profile=id==='hermes'?discoverOtherHermes(root):null;
 if(!profile){unbindHermes(root);return;}
 if(attachedHermes(root)===profile)return;
 // A Google sign-in made in Worldlet's own Hermes comes along when the profile has none (Hermes' own
 // google-workspace files have the same names); the Agent's own MCP sign-ins are already there.
 const own=path.join(root,'agent','private','hermes');
 for(const name of ['google_token.json','google_profile.json']){
  const from=path.join(own,name),to=path.join(profile,name);
  try{if(fs.existsSync(from)&&!fs.existsSync(to)){fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);fs.chmodSync(to,0o600);}}catch{}
 }
 bindHermes(root,profile);
 // Someone who used Fox's own Hermes profile brings what it learned (fox-move.ts), once.
 try{moveFoxProfile(root,own,profile);}catch(error){failure(error);}
}

/** Only the library the installed app opens by default sets up this computer's Hermes Agent: never a development
 * build, a release check, a smoke run, another library or a configured Agent. */
export function setsUpThisComputer(context:RuntimeContext):boolean {
 const profile=context.profile;
 return profile.channel==='release'&&!profile.rcCheck&&!profile.smoke&&process.env.WORLDLET_AGENT_CONFIG===undefined&&path.resolve(context.root)===path.resolve(installationRoot(profile));
}

/** Someone without an Agent (Fox's own Hermes before, or one that is no longer installed) chooses one once (owner
 * decisions 2026-10-09: no built-in Hermes; no Agent → stock Hermes Agent, with what Fox's profile learned moved into it,
 * fox-move.ts). Only in the library this app opens by default, never a release check's, a smoke run's or a configured Agent's. */
export function foxNeedsAgent(context:RuntimeContext,adapter:Adapter):boolean {
 const profile=context.profile;
 return adapter instanceof NoAgentAdapter&&!profile.rcCheck&&!profile.smoke&&process.env.WORLDLET_AGENT_CONFIG===undefined&&path.resolve(context.root)===path.resolve(installationRoot(profile));
}

/** The person's Hermes Agent, chosen as Fox's Agent, is kept running as a login service with its API server on this
 * computer (hermes-service.ts), with World tools on its registered `worldlet` server. In the background, never
 * blocking start; a failure is recorded in diagnostics and Fox keeps its current path. Worldlet never stops it, also
 * not on Quit. */
export function residentHermes(context:RuntimeContext,adapter:Adapter):Promise<void>|null {
 if(!setsUpThisComputer(context)||!(adapter instanceof LocalHarnessAdapter)||adapter.install.id!=='hermes')return null;
 const home=discoverOtherHermes(context.root);
 if(!home)return null;
 const install=adapter.install,environment=currentEnvironment();
 return (standing??=openStandingWorldTools({channel:(name,args)=>channelTool?channelTool(name,args):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'})})).then(tools=>
  keepHermesResident(home,(args,stdin)=>runHarnessCommand(install,environment,args,{timeout:120_000,...stdin!==undefined?{stdin}:{}}),{worldTools:home=>tools.server(home)})).then(
  reason=>{if(reason)context.failure(new WorldletError(`Hermes Agent is not kept running for Fox: ${reason}`),'hermesResident');},
  error=>context.failure(error,'hermesResident'));
}
/** World tools on Hermes (owner decision 2026-10-08 19:15Z): the standing endpoint its registered `worldlet` server relays
 * to, one per app run, and where a call outside any Fox turn goes (Fox's module: `AgentService.onChannelTool`). */
let standing:Promise<StandingWorldTools>|null=null;
let channelTool:((name:string,args:Row)=>Promise<Row>)|null=null;

/** Setup's local Agent choice (`agentHarness`): `detect` lists Harnesses installed here by ID and
 * title, never paths; `select` proves the chosen one answers before Fox switches to it, so a
 * Harness that is not signed in leaves setup's first page in place; `clear` leaves Fox without an Agent. Worldlet
 * provides no model (owner decision 2026-10-05) and customizes nothing below the Harness contract (owner decision
 * 2026-10-09): Hermes Agent, OpenClaw, pi and Claude Code answer for Fox themselves (`LocalHarnessAdapter`), with
 * World tools, and run the World's background work too. Codex alone is no Agent; stock Hermes Agent is offered instead.
 * `pair` (with a `worldlet://agent` code) makes the Agent on another computer Fox's Agent instead (Harness location
 * remote, core/phone/README.md#another-computers-agent); `select` or `clear` ends that pairing.
 * `gateway` (an address and token, core/phone/README.md#an-agent-gateway-on-another-computer) proves an OpenClaw
 * Gateway on another computer answers, keeps its token in the vault and makes it Fox's Agent; without a token it uses
 * the one saved for that address again. `pair`, `select` and `clear` set it aside (kept, to use again);
 * `forget-gateway` deletes it. `detect` reports its address and whether it is in use, never its token.
 * `requested` hands over, once, the Agent a `--connect=<id>` launch named (`takeRequested`). `detect` also reports each
 * Agent's version against the oldest Worldlet works with (core/agent/agent-versions.ts); `select` turns an older one
 * away and `update` opens its own update command in Terminal. */
/** Each Agent's `--version` line, kept for a minute so Settings and setup do not start every Agent on each redraw;
 * `fresh` reads it again (choosing an Agent, or after its update). */
const versionLines=new Map<string,{at:number;line:Promise<string|null>}>();
function installedVersion(install:LocalHarnessInstall,fresh=false):Promise<string|null> {
 const key=[install.command,...install.prefix].join('\0'),known=versionLines.get(key);
 if(known&&!fresh&&Date.now()-known.at<60_000)return known.line;
 const line=harnessVersion(install);
 versionLines.set(key,{at:Date.now(),line});
 return line;
}
/** What setup hears while Hermes Agent is installed (`install-hermes`) or signs in to ChatGPT (`sign-in-hermes`). */
/** How the short turn that proves a chosen Agent answers ended, when setup let it run after the switch (`checkLater`). */
export type AgentCheckEvent={id:LocalHarnessId;ok:true}|{id:LocalHarnessId;ok:false;message:string};
export type HermesSetupEvent=({stage:'install'}&HermesInstallProgress)|{stage:'sign-in';url:string;code:string|null};
export function localHarnessActions(context:RuntimeContext,switchTo:(adapter:Adapter)=>Promise<void>,noAgent:()=>Adapter,remote:RemoteAgentLink|null=null,vault:VaultService|null=null,takeRequested:()=>LocalHarnessId|null=()=>null,onHermesSetup:(event:HermesSetupEvent)=>void=()=>{},release:(id:LocalHarnessId)=>Promise<void>=async()=>{},onAgentCheck:(event:AgentCheckEvent)=>void=()=>{}){
 let signingIn:AbortController|null=null;
 const remoteStatus=()=>{const s=remote?.status();return s?.state==='paired'?{computer:s.computer,seenAt:s.seenAt??null,...s.error?{error:s.error}:{}}:null;};
 const gateway=()=>vault?readRemoteGateway(vault):null;
 const setAside=()=>{const saved=gateway();if(saved?.active)writeRemoteGateway(vault!,{...saved,active:false});};
 return async(request:Row):Promise<Row>=>{
  if(process.env.WORLDLET_AGENT_CONFIG!==undefined&&request.operation!=='detect')throw new WorldletError('This Worldlet uses a configured Agent.');
  if(request.operation==='gateway'){
   if(!vault)throw new WorldletError('This Worldlet cannot use a Gateway on another computer.');
   const saved=gateway(),typed=typeof request.token==='string'&&request.token.trim()?request.token:null;
   if(typeof request.url!=='string'||(!typed&&!saved))throw new WorldletError('Type your Gateway’s address and token.');
   // Without a token, only the saved address may be used again with its saved token.
   let same=false;try{same=readRemoteGatewayUrl(request.url).base===saved?.url;}catch{}
   const checked=await checkRemoteGateway(request.url,typed??(same?saved!.token:''));
   if(remote?.paired)await remote.end();
   writeSelection(context.root,null);writeAdopted(context.root,null);unbindHermes(context.root);
   writeRemoteGateway(vault,{v:1,url:checked.url,token:checked.token,active:true});
   await switchTo(new RemoteGatewayAdapter(context,checked));
   return {ok:true,gateway:{host:checked.host}};
  }
  if(request.operation==='forget-gateway'){
   const saved=gateway();
   if(vault)writeRemoteGateway(vault,null);
   if(saved?.active)await switchTo(noAgent());
   return {ok:true};
  }
  if(request.operation==='pair'){
   if(!remote)throw new WorldletError('This Worldlet cannot use an Agent on another computer.');
   if(typeof request.link!=='string'||request.link.length>1000)throw new WorldletError('Paste the code from Worldlet on your other computer.');
   const status=await remote.pair(request.link);
   setAside();
   // A local Agent chosen before is set aside.
   writeSelection(context.root,null);writeAdopted(context.root,null);unbindHermes(context.root);
   await switchTo(new RemoteHarnessAdapter(context,remote));
   return {ok:true,remote:{computer:status.computer}};
  }
  if(request.operation==='detect'){
   // The `hermes` command and ~/.hermes Worldlet set up for Fox's own profile are Fox, not another Agent to choose.
   // Codex alone is no Agent: its sign-in is not borrowed for one (owner decision 2026-10-09 11:51 PDT), stock Hermes Agent is.
   const found=locateLocalHarnesses().filter(item=>item.id!=='codex'&&(item.id!=='hermes'||discoverOtherHermes(context.root)!==null));
   // World tools come through Worldlet's MCP server. Only whether an Agent has a name or memory to bring is reported,
   // never its contents or paths.
   const agents=found.map(({id,title,configured})=>{
    const memory=isMigrationSource(id)?readLocalAgentMemory(id):null;
    // Each also reports how much history it holds (counts only), which it brings along.
    const history=isMigrationSource(id)?(()=>{try{return id==='openclaw'?surveyOpenClaw():surveyAgentHistory(id);}catch{return null;}})():null,brings=history&&(history.conversations||history.notes||history.skills||history.jobs)?history:null;
    // `model`: it has a model of its own set up.
    const model=!!memory?.model;
    return {id,title,configured,model,worldTools:localHarness(id).worldTools,...memory||brings?{memory:{name:memory?.name??null,user:!!memory?.user,longTerm:!!memory?.longTerm,model:!!memory?.model,...brings?{history:brings}:{}}}:{}};
   });
   // What each can do beyond World tools (its `tools` service), as one quiet line in Settings › Your Agent.
   for(const agent of agents as Row[]){const summary=harnessToolsSummary(await harnessTools(agent.id)?.list()??[]);if(summary)agent.canAlso=summary;}
   // Its version against the oldest Worldlet works with (core/agent/agent-versions.ts), so a too-old one says so before it
   // is chosen; `fresh` reads it again, after the person updated it.
   const versions=await Promise.all(found.map(install=>installedVersion(install,request.fresh===true)));
   (agents as Row[]).forEach((agent,i)=>{agent.version=agentVersionStatus(found[i].id,versions[i]);});
   // Setup preselects the recommended one (owner request 2026-10-04: the local option is the default).
   if(remote?.paired)await remote.heartbeat();
   const elsewhere=remote?.paired||gateway()?.active===true;
   return {agents,recommended:recommendLocalHarness(agents),selected:elsewhere?null:readSelection(context.root),remote:remoteStatus(),gateway:remoteGatewayView(gateway())};
  }
  // No Agent here (Codex alone included, owner decision 2026-10-09 11:51 PDT): stock Hermes Agent, installed the official
  // way to its default location, or the one already here as it is (12:11 PDT). The person then picks it like any other.
  if(request.operation==='install-hermes'){
   const install=await installHermes(context.root,{environment:currentEnvironment(),progress:step=>onHermesSetup({stage:'install',...step})});
   return {ok:true,id:install.id,title:install.title};
  }
  // ChatGPT as Hermes Agent's model, signed in inside Hermes with its own command; `cancel-sign-in` stops it.
  if(request.operation==='sign-in-hermes'){
   const install=ownHermesAgent(currentEnvironment());
   if(!install)throw new WorldletError('Hermes Agent is not on this computer. Install it first.');
   signingIn?.abort();
   const controller=signingIn=new AbortController();
   try{await signInHermes(install,currentEnvironment(),prompt=>{void context.openExternal(prompt.url).catch(()=>{});onHermesSetup({stage:'sign-in',...prompt});},controller.signal);}
   finally{if(signingIn===controller)signingIn=null;}
   return {ok:true};
  }
  if(request.operation==='cancel-sign-in'){signingIn?.abort();return {ok:true};}
  // The Agent an install script named (`--connect=<id>`), handed to first-run setup once; setup decides what it means.
  if(request.operation==='requested')return {id:takeRequested()};
  if(request.operation==='select'){
   if(!isLocalHarnessId(request.id))throw new WorldletError('Choose an Agent found on this computer.');
   const install=locateLocalHarnesses().find(item=>item.id===request.id&&item.id!=='codex'&&(item.id!=='hermes'||discoverOtherHermes(context.root)!==null));
   if(!install)throw new WorldletError('That Agent is no longer on this computer.');
   if(remote?.paired)await remote.end();
   setAside();
   // Fox talks through it directly, with World tools, and it runs the World's background work too (owner decisions
   // 2026-10-07 and 2026-10-09). Its models and sign-ins are its own.
   const connect=localHarness(install.id).connect;
   const line=await installedVersion(install,true);
   if(!line)throw new WorldletError(`${install.title} did not start. Open it once in Terminal, then try again.`);
   // Older than Worldlet works with: the person updates it with its own command (`update`); Worldlet never does.
   const version=agentVersionStatus(install.id,line);
   if(version.outdated)throw new WorldletError(agentTooOldMessage(install.title,version));
   // One short turn proves the sign-in; its answer is not shown.
   const adapter=new LocalHarnessAdapter(context,install);
   const prove=async()=>{
    const probe=new LocalHarnessRuntime(install);
    const timer=setTimeout(()=>probe.cancel(),90_000);
    try{await probe.run({action:'chat',text:'Reply with the single word: ready',_background:true},adapter.home('setup'));}
    catch(error){throw new WorldletError((error as Error)?.name==='AbortError'?`${install.title} did not answer in time. Check that it is signed in, then try again.`:(error as Error)?.message||`${install.title} did not answer.`);}
    finally{clearTimeout(timer);}
   };
   // That turn cold-starts the Agent and waits for its model, which takes half a minute for a large Hermes Agent. Setup
   // (`checkLater`) moves on at once and hears how it ended (`onAgentCheck`); anything else waits for it as before.
   const later=request.checkLater===true;
   if(!later)await prove();
   writeSelection(context.root,install.id);writeAdopted(context.root,null);attachChosenHermes(context.root,install.id,error=>context.failure(error,'foxMove'));
   await switchTo(adapter);
   if(later)void prove().then(()=>onAgentCheck({id:install.id,ok:true}),error=>onAgentCheck({id:install.id,ok:false,message:(error as Error).message}));
   return {ok:true,id:install.id,title:install.title,...connect?{connected:true}:{},...later?{checking:true}:{}};
  }
  // The provider Fox's Agent answers with (core/agent/model-providers.ts): `providers` lists the ones it supports, which
  // it is signed in to and the chosen one; `provider` chooses one (null: the Agent's own default); `provider-sign-in`
  // opens the Agent's own sign-in for one in Terminal.
  if(request.operation==='providers'){
   const install=selectedInstall(context.root);
   if(!install||remote?.paired||gateway()?.active)return {agent:null,providers:[],chosen:null};
   const signedIn=await providerSignIns(install);
   return {agent:install.id,title:install.title,chosen:readProviderChoices(readAgentSetting(context.root,PROVIDER_SETTING)).choices[install.id]??null,
    providers:agentProviders(install.id).map(provider=>({id:provider.id,name:provider.name,account:provider.account,signedIn:signedIn?signedIn.includes(provider.id):null,signIn:providerSignIn(install.id,provider.id)!==null}))};
  }
  if(request.operation==='provider'){
   const install=selectedInstall(context.root);
   if(!install)throw new WorldletError('Choose an Agent first.');
   const provider=request.id===null?null:isModelProviderId(request.id)?request.id:undefined;
   if(provider===undefined)throw new WorldletError('Choose a provider.');
   try{writeAgentSetting(context.root,PROVIDER_SETTING,chooseProvider(readAgentSetting(context.root,PROVIDER_SETTING),install.id,provider) as unknown as Row);}
   catch(error){throw new WorldletError((error as Error).message);}
   return {ok:true,chosen:provider};
  }
  if(request.operation==='provider-sign-in'){
   const install=selectedInstall(context.root),args=install&&isModelProviderId(request.id)?providerSignIn(install.id,request.id):null;
   if(!install||!args)throw new WorldletError('Sign in to this provider in your Agent.');
   await openSignIn(install,args,file=>shell.openPath(file));
   return {ok:true};
  }
  // The Agent's own update command, opened in Terminal like a sign-in, for one older than Worldlet works with
  // (core/agent/agent-versions.ts). The person runs it; Worldlet never updates an Agent by itself.
  if(request.operation==='update'){
   const install=isLocalHarnessId(request.id)?locateLocalHarnesses().find(item=>item.id===request.id):undefined,args=install?AGENT_VERSIONS[install.id].update:null;
   if(!install)throw new WorldletError('That Agent is no longer on this computer.');
   if(!args)throw new WorldletError(AGENT_VERSIONS[install.id].howTo);
   // Windows will not replace files a running process holds (Hermes Agent's updater refuses while its venv is in use),
   // so Fox's own resident process of this Agent stops first; the next turn starts it again.
   await release(install.id);
   await openSignIn(install,args,file=>shell.openPath(file),process.platform,UPDATED);
   return {ok:true};
  }
  if(request.operation==='clear'){
   if(remote?.paired)await remote.end();
   setAside();
   forgetSetupChoice(context.root);
   await switchTo(noAgent());
   return {ok:true};
  }
  throw new WorldletError('Unknown local Agent operation.');
 };
}

export function installAgentRuntime(host:Host){
 const listeners:((reason:AgentChange)=>void)[]=[];
 const context=runtimeContext(host.profile,{
  analyticsID:()=>{try{return host.optional<AnalyticsService>(ANALYTICS)?.modelAnalyticsID()??'';}catch{return '';}},
  openExternal:url=>shell.openExternal(url),
  record:entry=>{try{return host.store.ledger().recordExecution(entry);}catch{return false;}},
  failure:(error,operation)=>host.diagnostics.record(error,operation),
  ownSession:(source,session,thread)=>{try{host.store.ledger().rememberOwnHarnessSession(source,session,thread);}catch{}},
  changed:reason=>{for(const listener of listeners)try{listener(reason);}catch(error){host.diagnostics.record(error,'agentRuntime');}}
 });
 // The pairing with Worldlet on another computer whose Agent Fox uses (core/phone/README.md#another-computers-agent).
 const remote=createRemoteAgentLink({fetch:(input,init)=>fetch(input,init),vault:host.use<VaultService>(VAULT),
  name:()=>os.hostname().replace(/\.(local|lan|home)$/i,'').slice(0,60)||'Computer',version:app.getVersion(),userAgent:`Worldlet/${app.getVersion()} (agent pairing)`,
  // Unpaired on the other computer: Fox has no Agent until one is chosen.
  onEnded:()=>{if(adapter instanceof RemoteHarnessAdapter)void switchTo(noAgent()).catch(error=>host.diagnostics.record(error,'agentRuntime'));}});
 const vault=host.use<VaultService>(VAULT);
 let adapter=selectAdapter(context,undefined,remote,vault);
 // Once the runtime is ready and Fox's profile exists (after its first turn), and again whenever Fox changes Agent.
 listeners.push(()=>{void residentHermes(context,adapter);});
 void residentHermes(context,adapter);
 const switchTo=async(next:Adapter)=>{
  const previous=adapter;
  if(previous instanceof NoAgentAdapter&&next instanceof NoAgentAdapter)return;
  await previous.shutdown();
  adapter=next;
  context.changed('agent-changed');
 };
 const noAgent=()=>adapter instanceof NoAgentAdapter?adapter:new NoAgentAdapter(context);
 const service=createAgentService(context,()=>adapter,listeners,home=>worldSources(context,vault,home));
 // Reset Fox starts onboarding on its first page, where the local Agent is chosen again.
 service.forgetSetupChoice=async()=>{
  if(process.env.WORLDLET_AGENT_CONFIG!==undefined)return;
  if(remote.paired)await remote.end().catch(()=>{});
  writeRemoteGateway(vault,null);
  forgetSetupChoice(context.root);
  await switchTo(noAgent());
 };
 host.provide<AgentService>(AGENT,service);
 const extras=host.store.snapshotExtras;
 host.store.snapshotExtras=()=>({...extras(),agentNeeded:foxNeedsAgent(context,adapter)});
 // `--connect=<id>` from an install script, at launch or on a second launch while running (main.ts brings the window
 // forward); first-run setup reads it once (`requested`) and decides (core connectRequestPlan).
 let requested=connectArgument(process.argv);
 app.on('second-instance',(_event,argv)=>{const id=connectArgument(argv);if(!id)return;requested=id;host.page.event('worldlet:connect-agent');});
 host.register({agentHarness:localHarnessActions(context,switchTo,noAgent,remote,vault,()=>{const id=requested;requested=null;return id;},event=>host.page.event('worldlet:hermes-setup',event),
  async id=>{if(adapter instanceof LocalHarnessAdapter&&adapter.install.id===id)await adapter.whileStopped(async()=>{});},event=>host.page.event('worldlet:agent-check',event))});
 host.onQuit(()=>{endHermesInstall();void standing?.then(tools=>tools.close(),()=>{});return adapter.shutdown();});
}
