import {contextReads,ledgerContext} from '../../../store/context-storage.ts';
import {collectServicePage} from '../../connectors/service-collection.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {app,shell} from 'electron';
import {openInBrowser} from '../../../system-browser.ts';
import {WorldletError} from '../../../files.ts';
import {AGENT,ANALYTICS,ONGOING,PHONE,SOURCES,VAULT,type AgentAccess,type AgentService,type AnalyticsService,type OngoingService,type PhoneService,type SourcesService,type VaultService} from '../../../services.ts';
import type {Host} from '../../../types.ts';
import {installationRoot,type Profile} from '../../../profile.ts';
import {ExecutionJournal} from './journal.ts';
import {attachedHermes,bindHermes,discoverOtherHermes,unbindHermes} from './hermes-files.ts';
import {keepHermesResident} from './hermes-service.ts';
import {openStandingWorldTools,standingEndpointFile,type StandingWorldTools} from '../../gate/world-tool-bridge.ts';
import {createAgentAccess} from '../../gate/agent-access.ts';
import {createAgentAsks,type AgentAsks} from '../../gate/agent-asks.ts';
import {createAgentOrders,type AgentOrdersHost} from '../../gate/agent-orders.ts';
import {createWorldBoard,type WorldBoard} from '../../connectors/board.ts';
import {createAgentReports,type AgentReports} from '../../gate/agent-reports.ts';
import {createScriptAgents,mcpHome,type ScriptAgents} from '../../gate/script-agents.ts';
import {createGithubDrafts,type GithubDrafts} from '../../gate/github-drafts.ts';
import {createRemoteMcpHost,type RemoteMcpHost} from '../../gate/remote-mcp.ts';
import {createWorldAddressHost,type WorldAddressHost} from '../../gate/world-address.ts';
import {createAgentArtifacts,type AgentArtifacts} from '../../gate/agent-artifacts.ts';
import {createServiceDrafts,type ServiceDrafts} from '../../gate/service-drafts.ts';
import type {AskDrafts} from '../../gate/agent-asks.ts';
import {GITHUB_APP,type PosthogSettings} from '../../../../../context/connectors/index.ts';
import {moveFoxProfile} from './fox-move.ts';
import {HERMES_WINDOW_DONE,endHermesInstall,hermesInstallWindow,hermesSessionModels,hermesStarts,installHermes,workingHermesAgent,installedHermes,ownHermesAgent,signInHermes,type HermesInstallProgress} from './hermes-official.ts';
import {UPDATED,backgroundSignIn,claudeCodeSignedIn,openSignIn} from './provider-sign-in.ts';
import {codexHome} from './agent-files.ts';
import {parseJSON5} from './openclaw-files.ts';
import {readAgentSetting,writeAgentSetting} from '../../../store/agent-settings.ts';
import {serviceReadDefaults,serviceReaders} from '../../gate/service-readers.ts';
import {createServiceRequests,type ServiceRequests} from '../../gate/service-requests.ts';
import {ExternalAgentAdapter,NoAgentAdapter,UnavailableAgentAdapter,loadAgentConfiguration} from './external.ts';
import {LocalHarnessAdapter,LocalHarnessRuntime,currentEnvironment,forgetNotStarting,harnessEnvironment,harnessVersion,locateLocalHarnesses,openClawConfigFile,readSelection,selectedInstall,writeSelection,type LocalHarnessInstall} from './local-harness.ts';
import {runHarnessCommand,standingRules} from './harness-approvals.ts';
import {harnessConnections} from './harness-connections.ts';
import {harnessScheduleControls} from './harness-schedule-controls.ts';
import {harnessSkills} from './harness-skills.ts';
import {harnessMemory} from './harness-memory.ts';
import {AGENT_VERSIONS,agentRevoked,serviceGranted,askGranted,ASK_GRANT_KINDS,type AskGrantKind,boardGranted,BOARD_GRANT_KINDS,type BoardGrantKind,artifactGranted,ARTIFACT_GRANT_KINDS,type ArtifactGrantKind,githubDraftGranted,githubWriteGrants,isServiceDraftProvider,serviceDraftGranted,agentProfileApplets,agentProfileAsked,type AgentProfile,BACKGROUND_SIGN_IN,PROVIDER_SETTING,agentProviders,agentTooOldMessage,agentVersionStatus,chooseProvider,isModelProviderId,openClawModels,providerSignIn,readProviderChoices,signedInProviders,type ModelProviderId,connectArgument,harnessToolsSummary,isLocalHarnessId,isMigrationSource,localHarness,readRemoteGatewayUrl,recommendLocalHarness,type LocalHarnessId,reportGranted,REPORT_GRANT_KINDS,type ReportGrantKind,SCRIPT_HARNESS} from '../../../../../agent/gate/index.ts';
import {harnessTools} from './harness-services.ts';
import {ongoingId} from '../../../../../agent/tasks/index.ts';
import {SERVICE_PROVIDERS,SERVICE_TITLES} from '../../../../../contracts/services.ts';
import {GITHUB_WRITE_LIMITS} from '../../../../../contracts/github-drafts.ts';
import {SERVICE_DRAFT_PROVIDERS,SERVICE_DRAFT_TITLES} from '../../../../../contracts/service-drafts.ts';
import {canBuild} from '../../../store/world-store.ts';
import {harnessSend} from './harness-send.ts';
import {harnessVoice} from './harness-voice.ts';
import {reportOpenClawWorkspaces,surveyOpenClaw} from './openclaw-files.ts';
import {conversationDigest,describeAgent,readAgentProfile,writeAgentProfile,type AgentProfileResult} from './agent-profile.ts';
import {WORLD_APPS} from '../../../../../context/applets/index.ts';
import {surveyAgentHistory} from './agent-files.ts';
import {readLocalAgentMemory,writeAdopted} from './local-memory.ts';
import {RemoteHarnessAdapter} from './remote-harness.ts';
import {RemoteGatewayAdapter,checkRemoteGateway,readRemoteGateway,remoteGatewayView,writeRemoteGateway} from './remote-gateway.ts';
import {createRemoteAgentLink,type RemoteAgentLink} from '../../windows/remote.ts';
import type {Adapter,Row,RuntimeContext} from './types.ts';
import type {HarnessVoice} from '../../../../../contracts/harness-services.ts';
import {bundledResource} from '../../../resources.ts';
import {GoogleAccount} from '../../connectors/google-account.ts';
import {GoogleSource,GoogleSourceAccess,GoogleSourceConnections} from '../../connectors/google-source.ts';
import {McpAccounts} from '../../connectors/mcp-account.ts';
import {McpSource,McpSourceAccess,McpSourceConnections} from '../../connectors/mcp-source.ts';
import {ServiceSource,ServiceSourceAccess,ServiceSourceConnections} from '../../connectors/service-source.ts';
import {DoorDash,DoorDashSourceAccess} from '../../connectors/doordash.ts';
import type {AgentContext} from '../../../../../context/store/index.ts';

/** Which providers `install` is signed in to, as the Agent itself says (null: it does not say): Hermes Agent lists them
 * in a new ACP session, OpenClaw names their models in openclaw.json; Codex is signed in to ChatGPT when it has a
 * sign-in; Claude Code answers on its own Anthropic sign-in. */
async function providerSignIns(install:LocalHarnessInstall):Promise<ModelProviderId[]|null> {
 const environment=currentEnvironment();
 if(install.id==='codex')return fs.existsSync(path.join(codexHome(environment.home,environment.env),'auth.json'))?['chatgpt']:[];
 if(install.id==='claude-code'){const signedIn=await claudeCodeSignedIn(install,harnessEnvironment(install,environment));return signedIn===null?null:signedIn?['anthropic']:[];}
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
 * GitHub), each used from the Agent's own profile when it already has it, else kept by the World; the Services read
 * over their own API with a key the World keeps (PostHog); and DoorDash's official CLI. */
export interface WorldSources {google:GoogleSource;mcp:McpSource;services:ServiceSource;doordash:DoorDash}
export function worldSources(context:RuntimeContext,vault:VaultService,accountsHome:()=>string,savedNotion?:(request:Row)=>Row):WorldSources {
 const own=()=>path.join(context.root,'agent','private','hermes');
 const homes=()=>[...new Set([accountsHome(),own()])];
 const openExternal=(url:string)=>context.openExternal(url);
 const mcp=new McpSource({accounts:new McpAccounts({vault,agentHomes:homes}),openExternal,reviews:path.join(context.root,'accounts','notion-reviews')});
 const account=new GoogleAccount({folder:path.join(context.root,'accounts','google'),vault,clientFile:()=>bundledResource(context.profile,'googleClient'),adoptFrom:homes});
 const google=new GoogleSource({account,development:context.development,openExternal,ownProfile:own,legacyHomes:homes,notion:{connected:()=>!!savedNotion,read:async body=>{
  if(!savedNotion)throw new WorldletError('Saved Notion context is unavailable.');
  return savedNotion(body);
 }},github:{read:body=>mcp.read('github',body)}});
 const doordash=new DoorDash({folder:path.join(context.root,'accounts','doordash'),legacyHomes:homes});
 // Search Console reads with the same Google sign-in, which adds its permission only when its tile is connected.
 const searchConsole={connect:(open:(url:string)=>Promise<void>,cancelled:()=>boolean)=>account.connect(['search-console'],open,cancelled),
  allows:()=>account.allows('search-console'),bearer:(force:boolean)=>account.bearer('search-console',force)};
 return {google,mcp,services:new ServiceSource({vault,openExternal,google:searchConsole}),doordash};
}

export function createAgentService(context:RuntimeContext,selected:Adapter|(()=>Adapter),listeners:((reason:AgentChange)=>void)[],sources:((accountsHome:()=>string)=>WorldSources)|null=null):AgentService {
 const current=typeof selected==='function'?selected:()=>selected;
 const journal=(home:string,enabled:boolean)=>ExecutionJournal.register(home,enabled,context.record);
 // The World's connections keep one owner whichever Agent Fox uses (connections carry transport `hermes`, the name they
 // have always had): their files live in Fox's earlier Hermes profile folder, and a chosen Hermes Agent's own profile
 // is read first, so what it is already connected to is used as it is (owner decision 2026-10-09).
 const accountsHome=()=>attachedHermes(context.root)??path.join(context.root,'agent','private','hermes');
 // The person's own Harnesses here: the `hermes` Worldlet set up for Fox's own profile is Fox, not the person's Hermes Agent.
 const personsHarnesses=()=>locateLocalHarnesses().filter(install=>install.id!=='hermes'||discoverOtherHermes(context.root)!==null);
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
  makeSourceAccess:()=>world?new GoogleSourceAccess(world.google,()=>new ServiceSourceAccess(world.services,()=>new McpSourceAccess(world.mcp,()=>new DoorDashSourceAccess(world.doordash,()=>current().makeSourceAccess())))):current().makeSourceAccess(),
  collectServicePage:async(request,signal)=>{if(!world)throw new WorldletError('World Services are unavailable.');return collectServicePage(world,request,signal);},
  worldNotionBinding:()=>world?.mcp.worldNotionBinding()??null,
  serviceDraftConnections:()=>({posthog:()=>{const writer=world?.services.writer('posthog');return writer?{settings:writer.settings as PosthogSettings,request:writer.request}:null;},notion:()=>world?.mcp.notionSession()??null}),
  makeSourceConnections:()=>world?new GoogleSourceConnections(world.google,()=>new ServiceSourceConnections(world.services,()=>new McpSourceConnections(world.mcp,()=>current().makeSourceConnections(),()=>'hermes'),()=>'hermes'),()=>'hermes'):current().makeSourceConnections(),
  googleAccount:()=>worldGoogle?.account??null,
  makeRoutines:()=>current().makeRoutines(),
  get harness(){return current().harness??null;},
  schedule:()=>current().schedule?.()??null,
  approvals:()=>current().approvals?.()??null,
  // Every Harness here that keeps standing rules Worldlet can read, as `detect` finds them (the `hermes` Worldlet set
  // up for Fox's own profile is Fox, not the person's Hermes Agent); a revoke tells Fox's adapter to forget it too.
  standingRules:()=>personsHarnesses().flatMap(install=>{
   const rules=standingRules(install,currentEnvironment());
   return rules?[{harness:install.id,title:install.title,rules:{list:()=>rules.list(),revoke:async(id:string)=>{await rules.revoke(id);current().forgetApprovals?.(install.id);}}}]:[];
  }),
  // The same Harnesses' connections (Settings › Connectors); Fox's own Hermes profile is not the person's Hermes Agent.
  harnessConnections:()=>personsHarnesses().flatMap(install=>{
   const connections=harnessConnections(install,currentEnvironment());
   return connections?[{harness:install.id,title:install.title,connections}]:[];
  }),
  // The same Harnesses' own scheduled jobs and skills (Settings › Agents), each changed only by its own command.
  harnessSchedules:()=>personsHarnesses().flatMap(install=>{
   const schedule=harnessScheduleControls(install,currentEnvironment());
   return schedule?[{harness:install.id,title:install.title,schedule}]:[];
  }),
  harnessSkillSets:()=>personsHarnesses().flatMap(install=>{
   const skills=harnessSkills(install.id,currentEnvironment(),{locate:()=>[install]});
   return skills?[{harness:install.id,title:install.title,skills}]:[];
  }),
  harnessMemories:()=>personsHarnesses().flatMap(install=>{
   const memory=harnessMemory(install,currentEnvironment());
   return memory?[{harness:install.id,title:install.title,memory}]:[];
  }),
  harnessEvents:()=>current().harnessEvents?.()??null,
  harnessCalls:()=>current().harnessCalls?.()??null,
  harnessTools:()=>current().harnessTools?.()??null,
  harnessSkills:()=>current().harnessSkills?.()??null,
  channelSend:source=>harnessSend(source),
  onChannelTool:handler=>{channelTool=handler;},
  agentAccess:()=>agentAccess,
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

/** Remote access is on by default (agent/gate/REMOTE-MCP.md) only in the library the installed app opens by default:
 * never a development build, a release check, a smoke run or another library. */
export function opensRemoteAccess(context:RuntimeContext):boolean {
 const profile=context.profile;
 return profile.channel==='release'&&!profile.rcCheck&&!profile.smoke&&path.resolve(context.root)===path.resolve(installationRoot(profile));
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
 const tools=standingWorldTools();
 if(!tools)return null;
 return tools.then(tools=>
  keepHermesResident(home,(args,stdin)=>runHarnessCommand(install,environment,args,{timeout:120_000,...stdin!==undefined?{stdin}:{}}),{worldTools:home=>tools.server(home)})).then(
  reason=>{if(reason)context.failure(new WorldletError(`Hermes Agent is not kept running for Fox: ${reason}`),'hermesResident');},
  error=>context.failure(error,'hermesResident'));
}
/** World tools on Hermes (owner decision 2026-10-08 19:15Z): the standing endpoint its registered `worldlet` server relays
 * to, one per app run, and where a call outside any Fox turn goes (Fox's module: `AgentService.onChannelTool`). */
let standing:Promise<StandingWorldTools>|null=null;
/** That endpoint, opened on first use (null before the runtime is installed): Hermes Agent's registered server, and
 * the other Agents a host registers on it (platform/server control.ts). */
export function standingWorldTools():Promise<StandingWorldTools>|null {
 if(!agentAccess)return null;
 return standing??=openStandingWorldTools({access:agentAccess,asks:(agentId,args)=>agentAsks?agentAsks.call(agentId,args):{error:'Worldlet is still starting. Try again in a moment.'},
  context:(args,canRead)=>savedContext?.(args,canRead)??{error:'Worldlet is still starting. Try again in a moment.'},
  board:(agentId,args,canRead)=>worldBoard?worldBoard.call(agentId,args,canRead):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'}),
  drafts:(agentId,args)=>githubDrafts?githubDrafts.call(agentId,args):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'}),
  artifacts:(agentId,args,readsAll)=>agentArtifacts?agentArtifacts.call(agentId,args,readsAll):{error:'Worldlet is still starting. Try again in a moment.'},
  serviceDrafts:(agentId,args)=>serviceDrafts?serviceDrafts.call(agentId,args):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'}),
  serviceRequest:(agent,provider)=>serviceRequests?.asked(agent,provider)??'',
  reports:(agentId,args)=>agentReports?agentReports.call(agentId,args):{error:'Worldlet is still starting. Try again in a moment.'},
  writes:(agentId,args,grants)=>githubDrafts?githubDrafts.run(agentId,args,grants):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'}),channel:(name,args,agent)=>channelTool?channelTool(name,args,agent):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'})});
}
let channelTool:((name:string,args:Row,agent:AgentContext)=>Promise<Row>)|null=null;
/** The World's saved Service context (`context/*`), read through the sources module once the runtime is installed. */
let savedContext:((args:Row,canRead:(provider:string)=>boolean)=>Row|undefined)|null=null;
/** Agents' first need of a Service (service-requests.ts), made with agentAccess. */
let serviceRequests:ServiceRequests|null=null;
/** Each Agent's identity, Grants and audit (agent-access.ts), made when the runtime is installed. */
let agentAccess:AgentAccess|null=null;
/** Agent asks (agent-asks.ts), made with agentAccess. */
let agentAsks:AgentAsks|null=null;
/** Orders and wake commands (agent-orders.ts), made with agentAccess. */
let agentOrders:AgentOrdersHost|null=null;
/** The board (board.ts), made with the Agent service whose Service readers it reads through. */
let worldBoard:WorldBoard|null=null;
/** GitHub drafts (github-drafts.ts), made with agentAccess. */
let githubDrafts:GithubDrafts|null=null;
/** Remote MCP (remote-mcp.ts), made with agentAccess. */
let remoteMcp:RemoteMcpHost|null=null;
let worldAddress:WorldAddressHost|null=null;
/** Agent reports (agent-reports.ts), made with agentAccess. */
let agentReports:AgentReports|null=null;
/** Agents for scripts (script-agents.ts), made with agentAccess. */
let scriptAgents:ScriptAgents|null=null;
/** Agents for scripts on this host: the Node host adds one from its command line (`worldlet register --script`). */
export const scriptAgentService=()=>scriptAgents;
/** What Agents save to the Journal (agent-artifacts.ts), made with agentAccess. */
let agentArtifacts:AgentArtifacts|null=null;
/** PostHog and Notion drafts (service-drafts.ts), made with agentAccess. */
let serviceDrafts:ServiceDrafts|null=null;
/** The drafts an ask may carry, whichever Service they write to: each draft is found in the store that keeps it. */
const askDrafts=():AskDrafts|null=>{
 const owners=([githubDrafts,serviceDrafts] as (AskDrafts|null)[]).filter((owner):owner is AskDrafts=>owner!==null);
 if(!owners.length)return null;
 const find=(id:string)=>owners.find(owner=>owner.summaries([id]).length>0)??null;
 return {summaries:ids=>ids.flatMap(id=>find(id)?.summaries([id])??[]),
  approve:async id=>{const owner=find(id);if(!owner)throw new Error('No such draft.');return owner.approve(id);}};
};
/** How many of each Agent's newest audit entries Settings shows. */
const AGENT_ACCESS_AUDIT=20;

/** Setup's local Agent choice (`agentHarness`): `detect` lists Harnesses installed here by ID and
 * title, never paths; `select` proves the chosen one answers before Fox switches to it, so a
 * Harness that is not signed in leaves setup's first page in place; `clear` leaves Fox without an Agent. Worldlet
 * provides no model (owner decision 2026-10-05) and customizes nothing below the Harness contract (owner decision
 * 2026-10-09): Hermes Agent, OpenClaw, pi and Claude Code answer for Fox themselves (`LocalHarnessAdapter`), with
 * World tools, and run the World's background work too, Codex included (owner request 2026-10-20). With no Agent here,
 * stock Hermes Agent is offered instead.
 * `pair` (with a `worldlet://agent` code) makes the Agent on another computer Fox's Agent instead (Harness location
 * remote, platform/web/README.md#another-computers-agent); `select` or `clear` ends that pairing.
 * `gateway` (an address and token, platform/web/README.md#an-agent-gateway-on-another-computer) proves an OpenClaw
 * Gateway on another computer answers, keeps its token in the vault and makes it Fox's Agent; without a token it uses
 * the one saved for that address again. `pair`, `select` and `clear` set it aside (kept, to use again);
 * `forget-gateway` deletes it. `detect` reports its address and whether it is in use, never its token.
 * `requested` hands over, once, the Agent a `--connect=<id>` launch named (`takeRequested`). `detect` also reports each
 * Agent's version against the oldest Worldlet works with (agent/gate/agent-versions.ts); `select` turns an older one
 * away and `update` opens its own update command in Terminal. */
/** Each Agent's `--version` line, kept for a minute so Settings and setup do not start every Agent on each redraw;
 * `fresh` reads it again (choosing an Agent, or after its update). */
const THINGS_PLACED='agent-things-placed';
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
/** How the proving turn ended; then, for an Agent that describes itself (agent/gate/agent-profile.ts), what it said. */
export type AgentCheckEvent={id:LocalHarnessId;ok:true}|{id:LocalHarnessId;ok:false;message:string}|{id:LocalHarnessId;profile:AgentProfile|null;result:AgentProfileResult;ms:number};
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
   const found=locateLocalHarnesses().filter(item=>item.id!=='hermes'||discoverOtherHermes(context.root)!==null);
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
   // What each can do beyond World tools (its `tools` service), as one quiet line in Settings › Agents.
   for(const agent of agents as Row[]){const summary=harnessToolsSummary(await harnessTools(agent.id)?.list()??[]);if(summary)agent.canAlso=summary;}
   // Its version against the oldest Worldlet works with (agent/gate/agent-versions.ts), so a too-old one says so before it
   // is chosen; `fresh` reads it again, after the person updated it.
   const versions=await Promise.all(found.map(install=>installedVersion(install,request.fresh===true)));
   (agents as Row[]).forEach((agent,i)=>{agent.version=agentVersionStatus(found[i].id,versions[i]);});
   // A Hermes Agent whose command fails at once (left half installed) is no Agent to choose: setup offers to install it
   // again instead (`install-hermes` repairs it), and says why (`brokenHermes`). Choosing it used to fail in under a
   // second with nothing to do about it (Windows Beta 4384, 2026-10-13).
   const at=found.findIndex(install=>install.id==='hermes');
   const brokenHermes=at>=0&&versions[at]===null&&await hermesStarts(found[at],currentEnvironment(),15_000)==='failed';
   if(brokenHermes)agents.splice(at,1);
   // Setup preselects the recommended one (owner request 2026-10-04: the local option is the default).
   if(remote?.paired)await remote.heartbeat();
   const elsewhere=remote?.paired||gateway()?.active===true;
   return {agents,recommended:recommendLocalHarness(agents),selected:elsewhere?null:readSelection(context.root),remote:remoteStatus(),gateway:remoteGatewayView(gateway()),...brokenHermes?{brokenHermes:true}:{}};
  }
  // No Agent here (owner decision 2026-10-09 11:51 PDT): stock Hermes Agent, installed the official
  // way to its default location, or the one already here as it is (12:11 PDT). The person then picks it like any other.
  if(request.operation==='install-hermes'){
   const install=await installHermes(context.root,{environment:currentEnvironment(),progress:step=>onHermesSetup({stage:'install',...step})});
   forgetNotStarting(install.command);
   return {ok:true,id:install.id,title:install.title};
  }
  // The same installer in a window the person sees, when the quiet one failed; Check again finds what it installed.
  if(request.operation==='install-hermes-window'){
   if(!await workingHermesAgent(currentEnvironment())){const run=hermesInstallWindow(process.platform);await openSignIn(run,run.args,file=>shell.openPath(file),process.platform,HERMES_WINDOW_DONE);}
   return {ok:true};
  }
  // ChatGPT as Hermes Agent's model, signed in inside Hermes with its own command; `cancel-sign-in` stops it.
  if(request.operation==='sign-in-hermes'){
   const install=ownHermesAgent(currentEnvironment());
   if(!install)throw new WorldletError('Hermes Agent is not on this computer. Install it first.');
   signingIn?.abort();
   const controller=signingIn=new AbortController();
   // Only a Hermes Agent Worldlet installed gets its model set; one that was already here keeps the person's.
   const setModel=installedHermes(context.root);
   try{await signInHermes(install,currentEnvironment(),prompt=>{void context.openExternal(prompt.url).catch(()=>{});onHermesSetup({stage:'sign-in',...prompt});},controller.signal,{setModel});}
   finally{if(signingIn===controller)signingIn=null;}
   return {ok:true};
  }
  if(request.operation==='cancel-sign-in'){signingIn?.abort();return {ok:true};}
  // The Agent an install script named (`--connect=<id>`), handed to first-run setup once; setup decides what it means.
  if(request.operation==='requested')return {id:takeRequested()};
  // What the chosen Agent said about itself, once it has (`select`).
  if(request.operation==='profile')return {profile:isLocalHarnessId(request.id)?readAgentProfile(context.root,request.id):null};
  // The catalog Applets the chosen Agent pointed to, which each Area recommends first (context/applets/area-recommend.ts).
  if(request.operation==='suggestions'){const install=selectedInstall(context.root);return {keys:install?agentProfileApplets(readAgentProfile(context.root,install.id),WORLD_APPS.map(app=>app.key)):[]};}
  if(request.operation==='select'){
   if(!isLocalHarnessId(request.id))throw new WorldletError('Choose an Agent found on this computer.');
   const install=locateLocalHarnesses().find(item=>item.id===request.id&&(item.id!=='hermes'||discoverOtherHermes(context.root)!==null));
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
   forgetNotStarting(install.command);
   writeSelection(context.root,install.id);writeAdopted(context.root,null);attachChosenHermes(context.root,install.id,error=>context.failure(error,'foxMove'));
   await switchTo(adapter);
   // Once it answers, it describes itself in the background (owner request 2026-10-11); setup never waits for that.
   const describe=async()=>{
    if(!agentProfileAsked(install.id))return;
    const started=Date.now(),{profile,result}=await describeAgent(()=>new LocalHarnessRuntime(install),adapter.home('setup'),conversationDigest(install.id));
    try{writeAgentProfile(context.root,install.id,profile,result);}catch{}
    if(install.id==='openclaw'&&profile)reportOpenClawWorkspaces(profile.workspaces);
    onAgentCheck({id:install.id,profile,result,ms:Date.now()-started});
   };
   if(later)void prove().then(()=>{onAgentCheck({id:install.id,ok:true});return describe();},error=>onAgentCheck({id:install.id,ok:false,message:(error as Error).message}));
   else void describe();
   return {ok:true,id:install.id,title:install.title,...connect?{connected:true}:{},...later?{checking:true}:{}};
  }
  // The provider Fox's Agent answers with (agent/gate/model-providers.ts): `providers` lists the ones it supports, which
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
   // Claude Code signs in on its own in the browser, so Worldlet runs it with no Terminal (owner decision 2026-10-11).
   if(BACKGROUND_SIGN_IN.includes(install.id)){
    signingIn?.abort();
    const controller=signingIn=new AbortController();
    try{await backgroundSignIn(install,args,harnessEnvironment(install,currentEnvironment()),controller.signal);}
    finally{if(signingIn===controller)signingIn=null;}
    return {ok:true,background:true};
   }
   await openSignIn(install,args,file=>shell.openPath(file));
   return {ok:true};
  }
  // The Agent's own update command, opened in Terminal like a sign-in, for one older than Worldlet works with
  // (agent/gate/agent-versions.ts). The person runs it; Worldlet never updates an Agent by itself.
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
  openExternal:url=>openInBrowser(url),
  record:entry=>{try{return host.store.ledger().recordExecution(entry);}catch{return false;}},
  failure:(error,operation)=>host.diagnostics.record(error,operation),
  ownSession:(source,session,thread)=>{try{host.store.ledger().rememberOwnHarnessSession(source,session,thread);}catch{}},
  origin:(source,id)=>{
   try{
    if(!host.store.writable||host.store.sampleEnabled())return null;
    const ledger=host.store.ledger(),found=contextReads(ledgerContext(ledger),'conversations').broughtConversations().find(c=>c.source===source&&ongoingId(c.source,c.session)===id);
    if(!found||ledger.historyShared(source,found.session)===true)return null;
    return ledger.historyThreads(source,found.session).find(thread=>ledger.historyCursor(source,thread)?.shared!==true)??null;
   }catch{return null;}
  },
  changed:reason=>{for(const listener of listeners)try{listener(reason);}catch(error){host.diagnostics.record(error,'agentRuntime');}}
 });
 // The pairing with Worldlet on another computer whose Agent Fox uses (platform/web/README.md#another-computers-agent).
 const remote=createRemoteAgentLink({vault:host.use<VaultService>(VAULT),
  name:()=>os.hostname().replace(/\.(local|lan|home)$/i,'').slice(0,60)||'Computer',version:app.getVersion(),
  // Unpaired on the other computer: Fox has no Agent until one is chosen.
  onEnded:()=>{if(adapter instanceof RemoteHarnessAdapter)void switchTo(noAgent()).catch(error=>host.diagnostics.record(error,'agentRuntime'));}});
 const vault=host.use<VaultService>(VAULT);
 agentAccess=createAgentAccess({root:context.root,vault,ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()?host.store.ledger():null;}catch{return null;}}});
 // Remote MCP (agent/gate/REMOTE-MCP.md): cloud MCP clients reach the same World tools through the front, each
 // connection an Agent of its own, allowed on a consent card in Attention.
 remoteMcp=createRemoteMcpHost({vault,access:agentAccess,tools:()=>standingWorldTools(),services:()=>connectedServices().map(provider=>({provider,title:SERVICE_TITLES[provider]??provider})),relay:process.env.WORLDLET_PAIR_RELAY||undefined,onByDefault:opensRemoteAccess(context),changed:()=>host.store.worldChanged(),
  ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()?host.store.ledger():null;}catch{return null;}}});
 host.onQuit(()=>remoteMcp?.close());
 /** Remote access (Settings › Agents): `status`, `enable`, `disable`, `renew` (a new address, every connection
  * ends) and the person's answer on a consent card (`allow`, `deny` with its ID). Not in ROOM_ALLOWED: only this
  * computer's pages may let a connector in. `token` (a `name`, or a remote Agent's `id`) makes a token for an Agent that
  * cannot open a browser; it is answered once and never shown again. */
 host.register({remoteMcp:async request=>{
  const remote=remoteMcp!;
  try{
   if(request.operation==='status')return await remote.status();
   if(request.operation==='enable')return await remote.enable();
   if(request.operation==='disable')return await remote.disable();
   if(request.operation==='renew')return await remote.renew();
   // Allow also lets it read the connected Services the card names; "Allow without them" gives only the default Grants.
   // A request to be let in at the World's own address goes on the same card (world-address.ts).
   if((request.operation==='allow'||request.operation==='allow-basic'||request.operation==='deny')&&worldAddress?.owns(request.id))return worldAddress.decide(request.id,request.operation!=='deny');
   if(request.operation==='allow'||request.operation==='allow-basic'||request.operation==='deny')return remote.decide(request.id,request.operation!=='deny',request.operation==='allow');
   if(request.operation==='token')return await remote.token(request.name,request.id);
  }catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not do that.');}
  throw new WorldletError('Unknown remote access operation.');
 }});
 // This World's own address (agent/gate/WORLD-ADDRESS.md): its name, claimed with remote access's host token, and the
 // page there answered over remote access's connection. Signed-in owner browsers are handed the World's link for
 // another device; a shared board is read as the person sees it.
 const phone=()=>host.optional<PhoneService>(PHONE);
 worldAddress=createWorldAddressHost({vault,remote:remoteMcp,relay:process.env.WORLDLET_PAIR_RELAY||undefined,changed:()=>host.store.worldChanged(),
  ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()?host.store.ledger():null;}catch{return null;}},
  worldLink:async()=>{const status=await phone()?.worldRoomLink?.();return typeof status?.link==='string'?status.link:null;},
  renewWorldLink:async()=>{await phone()?.worldRoomRenew?.();},
  board:async tab=>worldBoard?worldBoard.view({operation:'read',...tab?{tab}:{}}):null});
 /** Your World's address (Settings › Agents): `status`, `check` and `claim` a `name`, `release`, `share` the board
  * (`open`: anyone with the link), `unshare` and `remove` (a browser or a person) by `id`. Not in ROOM_ALLOWED: only
  * this computer's pages change who may reach the World. */
 host.register({worldAddress:async request=>{
  const address=worldAddress!;
  try{
   if(request.operation==='status')return await address.status();
   if(request.operation==='check')return await address.check(request.name);
   if(request.operation==='claim')return await address.claim(request.name);
   if(request.operation==='release')return await address.release();
   if(request.operation==='share')return await address.share(request.open);
   if(request.operation==='unshare')return await address.unshare(request.id);
   if(request.operation==='remove')return await address.remove(request.id);
  }catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not do that.');}
  throw new WorldletError('Unknown address operation.');
 }});
 // Orders (agent/gate/GRANTS.md#orders-and-waking-an-agent): which Agent new work goes to, and the program the person
 // set to wake each Agent, run here when work is posted for it.
 agentOrders=createAgentOrders({root:context.root,access:agentAccess,ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()?host.store.ledger():null;}catch{return null;}}});
 host.onQuit(()=>agentOrders?.close());
 // Asks need the person's own World with private context allowed, as a channel's reads do.
 agentAsks=createAgentAsks({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  name:agentId=>agentAccess?.identity(agentId)?.name??agentId,changed:()=>host.store.worldChanged(),drafts:askDrafts,orders:()=>agentOrders});
 // An Agent's first need of a Service (agent/gate/GRANTS.md#when-an-agent-first-needs-a-service): in the person's own
 // World with private context allowed, as asks are.
 serviceRequests=createServiceRequests({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  access:()=>agentAccess,connected:provider=>connectedServices().includes(provider),title:provider=>SERVICE_TITLES[provider]??provider,changed:()=>host.store.worldChanged()});
 /** The person's answer on a Service request's Attention card: `allow` (the Agent's read Grant for that Service, which
  * must be connected) or `decline`, with its ID. Not in ROOM_ALLOWED: only this computer's pages give an Agent a Grant. */
 host.register({serviceRequest:async request=>{
  try{return serviceRequests!.answer(request);}catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not do that.');}
 }});
 // Agents for scripts (agent/gate/GRANTS.md#agents-for-scripts): their endpoint files are written again each run.
 scriptAgents=createScriptAgents({root:context.root,access:agentAccess,tools:()=>standingWorldTools()});
 void scriptAgents.open().catch(error=>host.diagnostics.record(error,'scriptAgents'));
 // Agent reports (agent/gate/GRANTS.md#agent-reports): in the person's own World with private context allowed, as asks are.
 agentReports=createAgentReports({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  identities:()=>agentAccess?.list(0).map(entry=>entry.identity)??[]});
 /** The person's answer on an ask's Attention card (agent/gate/GRANTS.md#agent-asks): `answer` with the ask's ID and
  * `answered` (one of its own choices and an optional note), `done` or `skipped`. Core checks it against the stored
  * ask; the page never names an Agent. Approve on an ask that carries GitHub drafts is `approveDrafts`, which runs them
  * first; a World page on another device may send only `answer` (ROOM_ALLOWED), so it cannot approve them. `attachment`
  * (the ask's `id` and the `attachment`) reads one attachment's bytes for the card; it too stays on this computer, since
  * a picture an Agent attached may be private. */
 host.register({agentAsk:async request=>{
  if(request.operation==='attachment'){
   try{return agentAsks!.attachment(request);}catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not read this attachment.');}
  }
  if(request.operation!=='answer'&&request.operation!=='approveDrafts')throw new WorldletError('Unknown asks operation.');
  try{return await agentAsks!.answer(request);}catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not answer this.');}
 }});
 // GitHub drafts (agent/gate/GRANTS.md#github-drafts): in the person's own World with private context allowed, as asks are.
 // GitHub's sign-in, read from the vault as the GitHub tile keeps it (one McpAccounts per vault entry is safe: each
 // renewal is checked against the entry it read).
 const githubSignIn=new McpAccounts({vault,agentHomes:()=>[]});
 githubDrafts=createGithubDrafts({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  vault,name:agentId=>agentAccess?.identity(agentId)?.name??agentId,changed:()=>host.store.worldChanged(),userAgent:`Worldlet/${app.getVersion()}`,
  // Writes as the person through their GitHub sign-in (Settings › Connectors), when no own GitHub App is connected.
  signedIn:()=>githubSignIn.signedInWith('github',GITHUB_APP.clientId),
  userToken:async force=>githubSignIn.signedInWith('github',GITHUB_APP.clientId)?(await githubSignIn.bearer('github',force))?.replace(/^Bearer /,'')??null:null});
 // What Agents save to the Journal (agent/gate/GRANTS.md#agent-artifacts): in the person's own World with private context allowed, as asks
 // are, kept with every other artifact so the Journal lists them.
 agentArtifacts=createAgentArtifacts({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  name:agentId=>agentAccess?.identity(agentId)?.name??agentId,changed:id=>host.page.event('worldlet:artifacts',{id})});
 /** The person's Approve or Dismiss on a GitHub draft's card (`approve`, `dismiss`, with the draft's ID). Approve reads
  * the target again and writes only when it has not changed. Not in ROOM_ALLOWED: a page on another device cannot
  * approve a GitHub write. */
 host.register({githubDraft:async request=>{
  try{
   if(request.operation==='approve')return await githubDrafts!.approve(request.id);
   if(request.operation==='dismiss')return githubDrafts!.dismiss(request.id);
  }catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not do that.');}
  throw new WorldletError('Unknown GitHub draft operation.');
 }});
 // PostHog and Notion drafts (agent/gate/GRANTS.md#posthog-and-notion-drafts): the same way, written through the World's
 // own PostHog and Notion connections.
 serviceDrafts=createServiceDrafts({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  connections:()=>service.serviceDraftConnections?.()??null,name:agentId=>agentAccess?.identity(agentId)?.name??agentId,changed:()=>host.store.worldChanged()});
 /** The person's Approve or Dismiss on a PostHog or Notion draft's card (`approve`, `dismiss`, with the draft's ID).
  * Approve reads the target again and writes only when it has not changed. Not in ROOM_ALLOWED: a page on another
  * device cannot approve a write to an outside service. */
 host.register({serviceDraft:async request=>{
  try{
   if(request.operation==='approve')return await serviceDrafts!.approve(request.id);
   if(request.operation==='dismiss')return serviceDrafts!.dismiss(request.id);
  }catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not do that.');}
  throw new WorldletError('Unknown draft operation.');
 }});
 /** The GitHub App that writes approved drafts (Settings › Connectors): `status`, `connect` (its App ID,
  * installation ID and private key, checked with GitHub before they are kept in the vault) and `disconnect`. None
  * answers with the App's settings. Not in ROOM_ALLOWED. */
 host.register({githubApp:async request=>{
  try{
   if(request.operation==='status')return githubDrafts!.app.status();
   if(request.operation==='connect')return await githubDrafts!.app.connect({appId:request.appId,installationId:request.installationId,privateKey:request.privateKey});
   if(request.operation==='disconnect')return githubDrafts!.app.disconnect();
  }catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not do that.');}
  throw new WorldletError('Unknown GitHub App operation.');
 }});
 /** HTTP JSON's endpoints (Settings › Connectors): `list` (each one's name, address and whether it has a token,
  * never the token) and `remove` (one by `name`; the last goes with Disconnect). Connecting one is `connect` with
  * provider `http`. Not in ROOM_ALLOWED. */
 host.register({httpJson:async request=>{
  const endpoints=new ServiceSource({vault});
  if(request.operation==='list')return {endpoints:endpoints.endpointList('http')};
  if(request.operation==='remove'){endpoints.removeEndpoint('http',request.name);return {endpoints:endpoints.endpointList('http')};}
  throw new WorldletError('Unknown HTTP JSON operation.');
 }});
 /** What a Service that signed in lets the person choose (PostHog's projects) and which one is chosen (Settings ›
  * Connectors). Choosing is `connect` with the choice in `settings` and no key. Not in ROOM_ALLOWED. */
 host.register({serviceChoices:async request=>new ServiceSource({vault}).choices(String(request.provider??''))});
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
 const service=createAgentService(context,()=>adapter,listeners,home=>worldSources(context,vault,home,request=>{
  const sources=host.optional<SourcesService>(SOURCES);
  if(!sources?.readNotionContext)throw new WorldletError('Saved Notion context is unavailable.');
  return sources.readNotionContext(request);
 }));
 savedContext=(args,canRead)=>host.optional<SourcesService>(SOURCES)?.serviceContext?.(args,canRead);
 // The board (context/connectors/BOARD.md): in the person's own World with private context allowed, as asks are. Each preset is
 // read through the World's own Service readers, as the Attention Center reads a source: no Agent, no turn, no model; an
 // `agents` preset from the Agents' own reports, as `agents/list` answers.
 worldBoard=createWorldBoard({ledger:()=>{try{return host.store.writable&&!host.store.sampleEnabled()&&host.store.state.cloudConsent===true?host.store.ledger():null;}catch{return null;}},
  read:request=>service.makeSourceAccess().run({action:'sourceTool',name:'read_service',args:{...request},_background:true},service.accountsHome(),
   async event=>event.type==='tool'&&event.name==='_world_authorize'&&(event.args as Row|undefined)?.name==='read_service'?{ok:true}:{error:'The board only reads Services.'}),
  agents:()=>agentReports?.list()??null});
 /** The board as the person sees it (`read`, optionally one `tab`): every Service the World is connected to. */
 host.register({board:async request=>{
  if(request.operation!=='read')throw new WorldletError('Unknown board operation.');
  try{return await worldBoard!.view(request);}catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not read the board.');}
 }});
 // Reset Fox starts onboarding on its first page, where the local Agent is chosen again.
 service.forgetSetupChoice=async()=>{
  if(process.env.WORLDLET_AGENT_CONFIG!==undefined)return;
  if(remote.paired)await remote.end().catch(()=>{});
  writeRemoteGateway(vault,null);
  forgetSetupChoice(context.root);
  await switchTo(noAgent());
 };
 host.provide<AgentService>(AGENT,service);
 // Where OpenClaw said its workspaces are, from its last description (openclaw-files reportOpenClawWorkspaces).
 try{reportOpenClawWorkspaces(readAgentProfile(context.root,'openclaw')?.workspaces);}catch{}
 const extras=host.store.snapshotExtras;
 host.store.snapshotExtras=()=>({...extras(),agentNeeded:foxNeedsAgent(context,adapter)});
 // `--connect=<id>` from an install script, at launch or on a second launch while running (main.ts brings the window
 // forward); first-run setup reads it once (`requested`) and decides (core connectRequestPlan).
 let requested=connectArgument(process.argv);
 app.on('second-instance',(_event,argv)=>{const id=connectArgument(argv);if(!id)return;requested=id;host.page.event('worldlet:connect-agent');});
 /** Settings › Agents (agent/gate/GRANTS.md): each Agent with its last use, Grants, newest audit entries and,
  * unless revoked, "Can read <Service>" for each connected Service (`list`); one revoked (`revoke`: its token and
  * endpoint files go, revokedAt is stamped); or one Service's read Grant given or taken back (`grantService`,
  * `ungrantService`). The page names only the Service: the targets are that Service's own reads (core serviceReadGrant),
  * never patterns from the page. The same action as Revoke, so the same pages reach it (none on another device). */
 const connectedServices=()=>{
  let connections:Row[]=[];try{connections=host.store.state.connections??[];}catch{}
  return SERVICE_PROVIDERS.filter(provider=>connections.some(c=>c.provider===provider&&canBuild(c)));
 };
 /** The Services PostHog and Notion drafts can write to now: connected in the World. */
 const draftServices=()=>{
  let connections:Row[]=[];try{connections=host.store.state.connections??[];}catch{}
  return SERVICE_DRAFT_PROVIDERS.filter(provider=>connections.some(c=>c.provider===provider&&canBuild(c)));
 };
 // Reading is on by default: a Service that becomes connected can be read by the Agent Fox uses (service-readers.ts).
 const defaultServiceReads=serviceReadDefaults({root:context.root,access:()=>agentAccess&&host.store.writable&&!host.store.sampleEnabled()?agentAccess:null,selected:()=>readSelection(context.root)});
 const connectedNow=()=>{try{defaultServiceReads(connectedServices());}catch{}};
 connectedNow();
 host.store.onChange(connectedNow);
 host.register({agentAccess:async request=>{
  const access=agentAccess!;
  // "Who may use it" under a connected Service's tile in Settings › Connectors: the Agent Fox uses and every other Agent
  // not revoked, each with whether it may read that Service now. Changing one is grantService or ungrantService.
  if(request.operation==='serviceReaders'){
   const provider=typeof request.provider==='string'?request.provider:'';
   if(!SERVICE_PROVIDERS.includes(provider))throw new WorldletError('That is not a Service Worldlet reads.');
   return serviceReaders(access,provider,readSelection(context.root));
  }
  if(request.operation==='revoke'){
   const id=typeof request.id==='string'?request.id:'';
   if(!access.identity(id))throw new WorldletError('That Agent is not known here.');
   access.revoke(id);return {ok:true};
  }
  if(request.operation==='grantService'||request.operation==='ungrantService'){
   const id=typeof request.id==='string'?request.id:'',provider=typeof request.provider==='string'?request.provider:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(!SERVICE_PROVIDERS.includes(provider))throw new WorldletError('That is not a Service Worldlet reads.');
   if(request.operation==='grantService'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!connectedServices().includes(provider))throw new WorldletError(`Connect ${SERVICE_TITLES[provider]} first.`);
    if(!access.grantService(id,provider))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantService(id,provider))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  if(request.operation==='grantAsks'||request.operation==='ungrantAsks'){
   const id=typeof request.id==='string'?request.id:'',kind=typeof request.kind==='string'?request.kind:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(!ASK_GRANT_KINDS.includes(kind as AskGrantKind))throw new WorldletError('That is not something an Agent can be allowed here.');
   if(request.operation==='grantAsks'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!access.grantAsks(id,kind))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantAsks(id,kind))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  if(request.operation==='grantBoard'||request.operation==='ungrantBoard'){
   const id=typeof request.id==='string'?request.id:'',kind=typeof request.kind==='string'?request.kind:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(!BOARD_GRANT_KINDS.includes(kind as BoardGrantKind))throw new WorldletError('That is not something an Agent can be allowed here.');
   if(request.operation==='grantBoard'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!access.grantBoard(id,kind))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantBoard(id,kind))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  if(request.operation==='grantArtifacts'||request.operation==='ungrantArtifacts'){
   const id=typeof request.id==='string'?request.id:'',kind=typeof request.kind==='string'?request.kind:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(!ARTIFACT_GRANT_KINDS.includes(kind as ArtifactGrantKind))throw new WorldletError('That is not something an Agent can be allowed here.');
   if(request.operation==='grantArtifacts'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!access.grantArtifacts(id,kind))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantArtifacts(id,kind))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  if(request.operation==='grantGithubDrafts'||request.operation==='ungrantGithubDrafts'){
   const id=typeof request.id==='string'?request.id:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(request.operation==='grantGithubDrafts'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!githubDrafts?.writer())throw new WorldletError('Connect GitHub in Settings › Connectors first.');
    if(!access.grantGithubDrafts(id))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantGithubDrafts(id))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  // A new Agent for a script, named by the person: the page sends only its name.
  if(request.operation==='addScript'){
   try{const added=await scriptAgents!.add(request.name);return {ok:true,id:added.id,name:added.name,endpointFile:added.endpointFile};}
   catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not add it.');}
  }
  if(request.operation==='grantReports'||request.operation==='ungrantReports'){
   const id=typeof request.id==='string'?request.id:'',kind=typeof request.kind==='string'?request.kind:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(!REPORT_GRANT_KINDS.includes(kind as ReportGrantKind))throw new WorldletError('That is not something an Agent can be allowed here.');
   if(request.operation==='grantReports'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!access.grantReports(id,kind))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantReports(id,kind))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  // "Can update Issues in <repo> without asking" (agent/gate/GRANTS.md#standing-github-writes): the page sends the Agent,
  // the repository and one of Core's choices (with its label prefix); Core builds the Grant, never from targets.
  if(request.operation==='grantGithubWrites'||request.operation==='ungrantGithubWrites'){
   const id=typeof request.id==='string'?request.id:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(request.operation==='grantGithubWrites'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!githubDrafts?.app.status().connected)throw new WorldletError('Changing GitHub without asking needs your own GitHub App, under Settings › Connectors › Advanced.');
    if(!access.grantGithubWrites(id,request.repo,request.choice,request.labelPrefix))throw new WorldletError(`Could not allow that. Name the repository as owner/repo, and a label prefix such as state: for labels; one Agent can have this on at most ${GITHUB_WRITE_LIMITS.grantsPerAgent} repositories.`);
   }else if(!access.ungrantGithubWrites(id,request.repo))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  // "Give new work to" (an Agent's ID, or empty for none) and an Agent's wake command (`command`: the program's full
  // path, then its arguments, as a list; empty removes it). The host checks both; the page sends no shell line.
  if(request.operation==='setOrderTarget'){
   try{agentOrders!.setDefault(typeof request.id==='string'&&request.id?request.id:null);}catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not change that.');}
   return {ok:true};
  }
  if(request.operation==='setWake'){
   const id=typeof request.id==='string'?request.id:'';
   try{agentOrders!.setWake(id,request.command);}catch(error){throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not change that.');}
   return {ok:true};
  }
  // "Can draft PostHog changes", "Can draft Notion changes": the page names the Agent and the Service only.
  if(request.operation==='grantServiceDrafts'||request.operation==='ungrantServiceDrafts'){
   const id=typeof request.id==='string'?request.id:'',provider=typeof request.provider==='string'?request.provider:'';
   const identity=access.identity(id);
   if(!identity)throw new WorldletError('That Agent is not known here.');
   if(!isServiceDraftProvider(provider))throw new WorldletError('That is not a Service Worldlet drafts changes for.');
   if(request.operation==='grantServiceDrafts'){
    if(agentRevoked(identity,new Date().toISOString()))throw new WorldletError('This Agent was revoked.');
    if(!draftServices().includes(provider))throw new WorldletError(`Connect ${SERVICE_DRAFT_TITLES[provider]} first.`);
    if(!access.grantServiceDrafts(id,provider))throw new WorldletError('Could not change that.');
   }else if(!access.ungrantServiceDrafts(id,provider))throw new WorldletError('Could not change that.');
   return {ok:true};
  }
  const services=connectedServices(),drafting=draftServices(),now=new Date().toISOString(),orders=agentOrders?.read()??{wake:{}};
  const githubApp=githubDrafts?.app.status().connected===true,githubWriter=!!githubDrafts?.writer();
  return {orders:{...orders.defaultFor?{defaultFor:orders.defaultFor}:{}},agents:access.list(AGENT_ACCESS_AUDIT).map(({identity,grants,audit})=>({...identity,grants,audit,
   // Its wake command, as the person typed it (shown only to this computer's pages, as all of this action is).
   ...agentRevoked(identity,now)?{}:{wake:orders.wake[identity.id]??[]},
   services:agentRevoked(identity,now)?[]:services.map(provider=>({provider,title:SERVICE_TITLES[provider],granted:serviceGranted(identity.id,grants,provider,now)})),
   asks:{ask:askGranted(identity.id,grants,'ask',now),work:askGranted(identity.id,grants,'work',now)},
   board:{read:boardGranted(identity.id,grants,'read',now),define:boardGranted(identity.id,grants,'define',now)},
   // What it last reported and how that reads now (agent/gate/GRANTS.md#agent-reports), with its two Grants.
   reports:{report:reportGranted(identity.id,grants,'report',now),list:reportGranted(identity.id,grants,'list',now)},
   ...agentRevoked(identity,now)?{}:agentReports?.state(identity.id)??{},
   // An Agent for a script: where its program reads its endpoint and token.
   ...identity.harness===SCRIPT_HARNESS&&!agentRevoked(identity,now)?{endpointFile:path.join(mcpHome(),standingEndpointFile(identity.id))}:{},
   artifacts:{save:artifactGranted(identity.id,grants,'save',now),read:artifactGranted(identity.id,grants,'read',now)},
   // "Can draft GitHub changes", shown once GitHub is connected to write them (or while the Grant is still on).
   ...!agentRevoked(identity,now)&&(githubWriter||githubDraftGranted(identity.id,grants,now))?{githubDrafts:githubDraftGranted(identity.id,grants,now)}:{},
   // Its standing GitHub write Grants, each with its repository, and whether another can be given (a GitHub App is connected).
   ...!agentRevoked(identity,now)&&(githubApp||githubWriteGrants(identity.id,grants,now).length)?{githubWrites:{add:githubApp,
    grants:githubWriteGrants(identity.id,grants,now).map(grant=>({repo:grant.github!.repo,writes:grant.github!.writes,...grant.github!.labelPrefix?{labelPrefix:grant.github!.labelPrefix}:{}}))}}:{},
   // "Can draft PostHog changes", "Can draft Notion changes": each shown while that Service is connected (or while the
   // Grant is still on).
   serviceDrafts:agentRevoked(identity,now)?[]:SERVICE_DRAFT_PROVIDERS.filter(provider=>drafting.includes(provider)||serviceDraftGranted(identity.id,grants,provider,now))
    .map(provider=>({provider,title:SERVICE_DRAFT_TITLES[provider],granted:serviceDraftGranted(identity.id,grants,provider,now)}))}))};
 }});
 host.register({agentHarness:localHarnessActions(context,switchTo,noAgent,remote,vault,()=>{const id=requested;requested=null;return id;},event=>host.page.event('worldlet:hermes-setup',event),
  async id=>{if(adapter instanceof LocalHarnessAdapter&&adapter.install.id===id)await adapter.whileStopped(async()=>{});},event=>{host.page.event('worldlet:agent-check',event);
   // The things it said the person handles most become Applets: its own conversations' (modules/tasks), and a catalog
   // Applet that fits joins the World when setup is already over (setup itself adds them to its selection).
   // What it picked out for the Attention Center reaches it the same way (modules/tasks).
   if('profile' in event&&(event.profile?.things?.length||event.profile?.attention?.length))host.optional<OngoingService>(ONGOING)?.refresh();
   if('profile' in event&&event.profile?.things?.length)placeThings(event.id,event.profile);})});
 function placeThings(id:string,profile:AgentProfile){
  const onboarding=host.store.state.onboarding;
  if(!onboarding?.completed||!host.store.writable||host.store.sampleEnabled())return;
  const placed=readAgentSetting(context.root,THINGS_PLACED) as Record<string,string[]>|null,before=new Set(placed?.[id]??[]);
  const keys=agentProfileApplets({...profile,applets:[],connections:[],channels:[]},WORLD_APPS.map(app=>app.key)).filter(key=>!before.has(key));
  if(!keys.length)return;
  for(const key of keys){
   const app=WORLD_APPS.find(a=>a.key===key);
   // One the person removed stays removed.
   if(app&&!onboarding.hiddenApplets?.includes(app.id)&&!onboarding.unlockedApplets?.includes(app.id))try{host.store.updateOnboarding({operation:'unlock',applet:app.id});}catch(error){host.diagnostics.record(error,'agentThings');}
  }
  try{writeAgentSetting(context.root,THINGS_PLACED,{...placed??{},[id]:[...before,...keys]} as any);}catch{}
 }
 host.onQuit(()=>{endHermesInstall();void standing?.then(tools=>tools.close(),()=>{});return adapter.shutdown();});
}
