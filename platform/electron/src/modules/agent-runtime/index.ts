import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {app,shell} from 'electron';
import {WorldletError} from '../../files.ts';
import {AGENT,ANALYTICS,VAULT,type AgentService,type AnalyticsService,type VaultService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
import {installationRoot,type Profile} from '../../profile.ts';
import {ExecutionJournal} from './journal.ts';
import {HermesAdapter} from './hermes.ts';
import {attachedHermes,bindHermes,discoverOtherHermes,isOwnHermes,standardHermes,standardHermesHome,unbindHermes} from './hermes-files.ts';
import {keepHermesResident,type HermesRuntime} from './hermes-service.ts';
import {openStandingWorldTools,type StandingWorldTools} from './world-tool-bridge.ts';
import {endSetup} from './installation.ts';
import {ExternalAgentAdapter,UnavailableAgentAdapter,loadAgentConfiguration} from './external.ts';
import {LocalHarnessAdapter,LocalHarnessRuntime,currentEnvironment,harnessVersion,locateLocalHarnesses,readSelection,selectedInstall,writeSelection,type LocalHarnessInstall} from './local-harness.ts';
import {runHarnessCommand,standingRules} from './harness-approvals.ts';
import {harnessConnections} from './harness-connections.ts';
import {connectArgument,harnessToolsSummary,isLocalHarnessId,isMigrationSource,localHarness,readRemoteGatewayUrl,recommendLocalHarness,type LocalHarnessId} from '../../../../../core/agent/index.ts';
import {harnessTools} from './harness-services.ts';
import {harnessSend} from './harness-send.ts';
import {harnessVoice} from './harness-voice.ts';
import {codexSignedIn,readModelSource,writeModelSource} from './model-access.ts';
import {surveyOpenClaw} from './openclaw-files.ts';
import {surveyAgentHistory} from './agent-files.ts';
import {isAdoptable,readAdopted,readLocalAgentMemory,writeAdopted} from './local-memory.ts';
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

/** Selects the Agent adapter at launch (Mac AgentRuntimeProvider): WORLDLET_AGENT_CONFIG names an
 * external Harness; otherwise the Agent on another computer this Worldlet is paired with (`remote`);
 * otherwise the Gateway on another computer Fox uses directly (`remote-openclaw`, its address and token in `vault`);
 * otherwise a local Harness the person chose at setup, while it is still installed;
 * otherwise the official Hermes composition. A bad configuration yields an unavailable adapter that
 * explains itself. */
export function selectAdapter(context:RuntimeContext,configuration=process.env.WORLDLET_AGENT_CONFIG,remote:RemoteAgentLink|null=null,vault:VaultService|null=null):Adapter {
 try{
  if(configuration!==undefined)return new ExternalAgentAdapter(context,loadAgentConfiguration(configuration));
  if(remote?.paired)return new RemoteHarnessAdapter(remote,()=>new HermesAdapter(context));
  const gateway=vault?readRemoteGateway(vault):null;
  if(gateway?.active)return new RemoteGatewayAdapter(gateway,()=>new HermesAdapter(context));
  const local=selectedInstall(context.root);
  // A Hermes Agent chosen before its profile became the World's Harness is attached on the next launch.
  if(local?.id==='hermes')try{attachChosenHermes(context.root,local.id);}catch{}
  if(local)return new LocalHarnessAdapter(context,local,undefined,()=>new HermesAdapter(context),codexSignedIn);
  return new HermesAdapter(context);
 }catch(error){return new UnavailableAgentAdapter(context,error instanceof Error?error:new WorldletError(String(error)));}
}

/** The Agent runtime service over the selected adapter. Private and isolated homes are
 * registered with the execution journal; sample and setup homes never are. */
/** The World's own Google connection (owner decision 2026-10-09: a connection made through Worldlet is kept by the
 * Platform): Gmail, Calendar and Drive work the same whichever Agent Fox uses. Fox's Hermes profile's earlier grant is adopted. */
/** The World's account connections: Google, and the MCP connectors (Notion, Todoist, Linear, PayPal, Supabase,
 * GitHub), each used from the Agent's own profile when it already has it, else kept by the World. */
export interface WorldSources {google:GoogleSource;mcp:McpSource}
export function worldSources(context:RuntimeContext,vault:VaultService,accountsHome:()=>string):WorldSources {
 const own=()=>path.join(context.root,'agent','private','hermes');
 const homes=()=>[...new Set([accountsHome(),own()])];
 const openExternal=(url:string)=>context.openExternal(url);
 const mcp=new McpSource({accounts:new McpAccounts({vault,agentHomes:homes}),openExternal,reviews:path.join(context.root,'accounts','notion-reviews')});
 const account=new GoogleAccount({folder:path.join(context.root,'accounts','google'),vault,clientFile:()=>bundledResource(context.profile,'googleClient'),adoptFrom:homes});
 const google=new GoogleSource({account,development:context.development,openExternal,ownProfile:own,legacyHomes:homes,notion:{connected:()=>mcp.connected('notion'),read:body=>mcp.read('notion',body)}});
 return {google,mcp};
}

export function createAgentService(context:RuntimeContext,selected:Adapter|(()=>Adapter),listeners:((reason:AgentChange)=>void)[],sources:((accountsHome:()=>string)=>WorldSources)|null=null):AgentService {
 const current=typeof selected==='function'?selected:()=>selected;
 const accounts=()=>{const adapter=current();return adapter.accountOwner?.()??adapter;};
 const journal=(home:string,enabled:boolean)=>ExecutionJournal.register(home,enabled,context.record);
 const world=sources?.(()=>accounts().home('private'))??null,worldGoogle=world?.google??null;
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
  get accountsId(){return accounts().id;},
  accountsHome:()=>journal(accounts().home('private'),true),
  makeSourceAccess:()=>world?new GoogleSourceAccess(world.google,()=>new McpSourceAccess(world.mcp,()=>accounts().makeSourceAccess())):accounts().makeSourceAccess(),
  makeSourceConnections:()=>world?new GoogleSourceConnections(world.google,()=>new McpSourceConnections(world.mcp,()=>accounts().makeSourceConnections(),()=>accounts().id),()=>accounts().id):accounts().makeSourceConnections(),
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
  // The same Harnesses' connections (Settings › Integrations); Fox's own Hermes profile is not the person's Hermes Agent.
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
  helperPython:()=>current().helperPython(),
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

/** Forgets the local Agent, adopted Agent and Codex model chosen on setup's first page, and a Hermes Agent's attachment. */
export function forgetSetupChoice(root:string){writeSelection(root,null);writeAdopted(root,null);writeModelSource(root,null);unbindHermes(root);}

/** The person's own Hermes Agent is the World's Harness (owner decision 2026-10-07): the World's account
 * connections, background checks, Applet tasks and routines run on its profile, so whatever it is connected to
 * keeps working in the World and a new connection is made in that profile. Any other choice ends the attachment. */
export function attachChosenHermes(root:string,id:string){
 // Fox's own profile, reached through the standard location (standardHermes), is not another Agent to attach.
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
}

/** Only the library the installed app opens by default sets up this computer's Hermes Agent: never a development
 * build, a release check, a smoke run, another library or a configured Agent. */
export function setsUpThisComputer(context:RuntimeContext):boolean {
 const profile=context.profile;
 return profile.channel==='release'&&!profile.rcCheck&&!profile.smoke&&process.env.WORLDLET_AGENT_CONFIG===undefined&&path.resolve(context.root)===path.resolve(installationRoot(profile));
}

/** Fox's own Hermes profile becomes the person's standard Hermes Agent (`standardHermes`) while Fox runs on it:
 * only for the library this installed app opens by default, never a release check's, a smoke run's or another one. */
export function offerStandardHermes(context:RuntimeContext,adapter:Adapter){
 if(!(adapter instanceof HermesAdapter)||!adapter.available||attachedHermes(context.root)||!setsUpThisComputer(context))return null;
 try{return standardHermes(context.root,{python:adapter.python,launcher:path.join(context.profile.webRoot,'hermes','hermes_command.py')});}
 catch(error){context.failure(error,'standardHermes');return null;}
}

/** The Hermes Agent Fox uses, whichever it is (owner decision 2026-10-08: the standard one Worldlet set up and the
 * person's own are one path), is kept running as a login service with its API server on this computer
 * (hermes-service.ts): the standard Hermes Agent once Fox's own profile is linked at the standard location, or the
 * person's own Hermes Agent chosen as Fox's Agent; the standard one on Worldlet's runtime, whose hook borrows this
 * computer's Codex sign-in read-only in the service as Fox does. In the background, never blocking start; a failure is recorded in
 * diagnostics and Fox keeps its current path. Worldlet never stops it, also not on Quit. */
export function residentHermes(context:RuntimeContext,adapter:Adapter):Promise<void>|null {
 if(!setsUpThisComputer(context))return null;
 let target:{home:string;install:LocalHarnessInstall;runtime:HermesRuntime|null}|null=null;
 if(adapter instanceof HermesAdapter&&adapter.available&&!attachedHermes(context.root)&&isOwnHermes(context.root,standardHermesHome())){
  const install=adapter.standardInstall;
  target={home:adapter.privateHome(),install,runtime:{python:install.command,launcher:install.prefix[0]}};
 }
 else if(adapter instanceof LocalHarnessAdapter&&adapter.install.id==='hermes'){const home=discoverOtherHermes(context.root);if(home)target={home,install:adapter.install,runtime:null};}
 if(!target)return null;
 const {home,install,runtime}=target,environment=currentEnvironment();
 return (standing??=openStandingWorldTools({channel:(name,args)=>channelTool?channelTool(name,args):Promise.resolve({error:'Worldlet is still starting. Try again in a moment.'})})).then(tools=>
  keepHermesResident(home,(args,stdin)=>runHarnessCommand(install,environment,args,{timeout:120_000,...stdin!==undefined?{stdin}:{}}),{runtime,worldTools:home=>tools.server(home)})).then(
  reason=>{if(reason)context.failure(new WorldletError(`Hermes Agent is not kept running for Fox: ${reason}`),'hermesResident');},
  error=>context.failure(error,'hermesResident'));
}
/** World tools on Hermes (owner decision 2026-10-08 19:15Z): the standing endpoint its registered `worldlet` server relays
 * to, one per app run, and where a call outside any Fox turn goes (Fox's module: `AgentService.onChannelTool`). */
let standing:Promise<StandingWorldTools>|null=null;
let channelTool:((name:string,args:Row)=>Promise<Row>)|null=null;

/** Setup's local Agent choice (`agentHarness`): `detect` lists Harnesses installed here by ID and
 * title, never paths; `select` proves the chosen one answers before Fox switches to it, so a
 * Harness that is not signed in leaves setup's first page in place; `clear` returns to the built-in Agent
 * on this computer's Codex sign-in. Worldlet provides no model (owner decision 2026-10-05). Codex is a model,
 * not a second Agent (owner decision 2026-10-02):
 * choosing it keeps the built-in Hermes Harness, with connections, background checks, routines and
 * memory, and pays for every model tier with the person's own Codex sign-in (`local-codex`).
 * OpenClaw, Claude Code, pi and Hermes Agent are whole Agents with their own name, memory and
 * history: choosing one keeps the built-in Harness too, and Fox's module copies them in through one
 * flow (`localAgent` `adopt`, owner request 2026-10-03). Hermes Agent, OpenClaw and pi answer for Fox
 * themselves (`LocalHarnessAdapter`, `connect` in Core, owner decision 2026-10-07), with World tools, while the
 * World's background work stays on the built-in Harness. Claude Code keeps the built-in Harness when Fox has a
 * model to run it on (a Codex sign-in here, or an API key); without one it answers directly on its own sign-in.
 * `pair` (with a `worldlet://agent` code) makes the Agent on another computer Fox's Agent instead (Harness location
 * remote, core/phone/README.md#another-computers-agent); `select` or `clear` ends that pairing.
 * `gateway` (an address and token, core/phone/README.md#an-agent-gateway-on-another-computer) proves an OpenClaw
 * Gateway on another computer answers, keeps its token in the vault and makes it Fox's Agent; without a token it uses
 * the one saved for that address again. `pair`, `select` and `clear` set it aside (kept, to use again);
 * `forget-gateway` deletes it. `detect` reports its address and whether it is in use, never its token.
 * `requested` hands over, once, the Agent a `--connect=<id>` launch named (`takeRequested`). */
export function localHarnessActions(context:RuntimeContext,switchTo:(adapter:Adapter)=>Promise<void>,builtIn:()=>Adapter,remote:RemoteAgentLink|null=null,vault:VaultService|null=null,takeRequested:()=>LocalHarnessId|null=()=>null){
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
   await switchTo(new RemoteGatewayAdapter(checked,()=>new HermesAdapter(context)));
   return {ok:true,gateway:{host:checked.host}};
  }
  if(request.operation==='forget-gateway'){
   const saved=gateway();
   if(vault)writeRemoteGateway(vault,null);
   if(saved?.active)await switchTo(builtIn());
   return {ok:true};
  }
  if(request.operation==='pair'){
   if(!remote)throw new WorldletError('This Worldlet cannot use an Agent on another computer.');
   if(typeof request.link!=='string'||request.link.length>1000)throw new WorldletError('Paste the code from Worldlet on your other computer.');
   const status=await remote.pair(request.link);
   setAside();
   // A local Agent chosen before is set aside; this computer's model source stays for its background work.
   writeSelection(context.root,null);writeAdopted(context.root,null);unbindHermes(context.root);
   await switchTo(new RemoteHarnessAdapter(remote,()=>new HermesAdapter(context)));
   return {ok:true,remote:{computer:status.computer}};
  }
  if(request.operation==='detect'){
   // The `hermes` command and ~/.hermes Worldlet set up for Fox's own profile are Fox, not another Agent to choose.
   const found=locateLocalHarnesses().filter(item=>item.id!=='hermes'||discoverOtherHermes(context.root)!==null);
   // Codex runs Fox on the built-in Harness, so World tools come with it; the rest get them through Worldlet's MCP server.
   // Only whether an Agent has a name or memory to bring is reported, never its contents or paths.
   const agents=found.map(({id,title,configured})=>{
    const memory=isMigrationSource(id)?readLocalAgentMemory(id):null;
    // Each also reports how much history it holds (counts only), which it brings along.
    const history=isMigrationSource(id)?(()=>{try{return id==='openclaw'?surveyOpenClaw():surveyAgentHistory(id);}catch{return null;}})():null,brings=history&&(history.conversations||history.notes||history.skills||history.jobs)?history:null;
    // `model`: it can pay for Fox's models (a Codex sign-in, or an API-key model Fox copies).
    const model=id==='codex'?codexSignedIn():!!memory?.model;
    return {id,title,configured,model,worldTools:id==='codex'||isAdoptable(id)||localHarness(id).worldTools,...memory||brings?{memory:{name:memory?.name??null,user:!!memory?.user,longTerm:!!memory?.longTerm,model:!!memory?.model,...brings?{history:brings}:{}}}:{}};
   });
   // What each can do beyond World tools (its `tools` service), as one quiet line in Settings › Model.
   for(const agent of agents as Row[]){const summary=harnessToolsSummary(await harnessTools(agent.id)?.list()??[]);if(summary)agent.canAlso=summary;}
   // Setup preselects the recommended one (owner request 2026-10-04: the local option is the default).
   if(remote?.paired)await remote.heartbeat();
   const elsewhere=remote?.paired||gateway()?.active===true;
   return {agents,recommended:recommendLocalHarness(agents),selected:elsewhere?null:readSelection(context.root)??readAdopted(context.root)??(readModelSource(context.root)?'codex':null),remote:remoteStatus(),gateway:remoteGatewayView(gateway())};
  }
  // The Agent an install script named (`--connect=<id>`), handed to first-run setup once; setup decides what it means.
  if(request.operation==='requested')return {id:takeRequested()};
  if(request.operation==='select'){
   if(!isLocalHarnessId(request.id))throw new WorldletError('Choose an Agent found on this computer.');
   const install=locateLocalHarnesses().find(item=>item.id===request.id&&(item.id!=='hermes'||discoverOtherHermes(context.root)!==null));
   if(!install)throw new WorldletError('That Agent is no longer on this computer.');
   if(remote?.paired)await remote.end();
   setAside();
   // Worldlet provides no model (owner decision 2026-10-05). An Agent whose API-key model Fox copies, or a
   // Codex sign-in here, powers the built-in Harness; otherwise the Agent answers itself below, on its own sign-in.
   const own=codexSignedIn();
   // Hermes Agent, OpenClaw and pi are the person's own Agents: Fox talks through them directly, with World tools,
   // and only the World's background work stays on the built-in Agent (owner decision 2026-10-07).
   const connect=localHarness(install.id).connect;
   if(!connect&&isAdoptable(install.id)&&(own||readLocalAgentMemory(install.id)?.model)){
    // Its CLI is not run. Its own model settings stay with it; Fox pays with the Codex sign-in here when there is one.
    writeSelection(context.root,null);writeAdopted(context.root,install.id);writeModelSource(context.root,own?'local-codex':null);unbindHermes(context.root);
    await switchTo(builtIn());
    context.changed('model-changed');
    return {ok:true,id:install.id,title:install.title,model:true};
   }
   if(!await harnessVersion(install))throw new WorldletError(`${install.title} did not start. Open it once in Terminal, then try again.`);
   if(install.id==='codex'){
    // Only the app's own copy here (no separate command line): signing in happens in that app.
    if(!codexSignedIn())throw new WorldletError(install.app?`Sign in to Codex in the ${install.app} app on this computer first, then try again.`:'Sign in to Codex on this computer first (open Codex, or run codex login), then try again.');
    writeSelection(context.root,null);writeAdopted(context.root,null);writeModelSource(context.root,'local-codex');unbindHermes(context.root);
    await switchTo(builtIn());
    context.changed('model-changed');
    return {ok:true,id:install.id,title:install.title,model:true};
   }
   // One short turn proves the sign-in; its answer is not shown.
   const adapter=new LocalHarnessAdapter(context,install,undefined,()=>new HermesAdapter(context),codexSignedIn);
   const probe=new LocalHarnessRuntime(install);
   const timer=setTimeout(()=>probe.cancel(),90_000);
   try{await probe.run({action:'chat',text:'Reply with the single word: ready',_background:true},adapter.home('setup'));}
   catch(error){throw new WorldletError((error as Error)?.name==='AbortError'?`${install.title} did not answer in time. Check that it is signed in, then try again.`:(error as Error)?.message||`${install.title} did not answer.`);}
   finally{clearTimeout(timer);}
   writeSelection(context.root,install.id);writeAdopted(context.root,null);attachChosenHermes(context.root,install.id);
   // Background work runs on the built-in Agent with this computer's Codex sign-in when there is one.
   writeModelSource(context.root,own?'local-codex':null);
   await switchTo(adapter);
   return {ok:true,id:install.id,title:install.title,...connect?{connected:true}:{}};
  }
  if(request.operation==='clear'){
   if(remote?.paired)await remote.end();
   setAside();
   forgetSetupChoice(context.root);
   await switchTo(builtIn());
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
  // Unpaired on the other computer: Fox goes back to the built-in Agent here.
  onEnded:()=>{if(adapter instanceof RemoteHarnessAdapter)void switchTo(builtIn()).catch(error=>host.diagnostics.record(error,'agentRuntime'));}});
 const vault=host.use<VaultService>(VAULT);
 let adapter=selectAdapter(context,undefined,remote,vault);
 // Once the runtime is ready and Fox's profile exists (after its first turn), and again whenever Fox changes Agent.
 listeners.push(()=>{offerStandardHermes(context,adapter);void residentHermes(context,adapter);});
 offerStandardHermes(context,adapter);void residentHermes(context,adapter);
 const switchTo=async(next:Adapter)=>{
  const previous=adapter;
  if(previous.id===next.id&&next.id==='hermes')return;
  await previous.shutdown();
  adapter=next;
  context.changed('agent-changed');
 };
 const builtIn=()=>adapter.id==='hermes'?adapter:new HermesAdapter(context);
 const service=createAgentService(context,()=>adapter,listeners,home=>worldSources(context,vault,home));
 // Reset Fox starts onboarding on its first page, where the local Agent is chosen again.
 service.forgetSetupChoice=async()=>{
  if(process.env.WORLDLET_AGENT_CONFIG!==undefined)return;
  if(remote.paired)await remote.end().catch(()=>{});
  writeRemoteGateway(vault,null);
  forgetSetupChoice(context.root);
  await switchTo(builtIn());
 };
 host.provide<AgentService>(AGENT,service);
 // `--connect=<id>` from an install script, at launch or on a second launch while running (main.ts brings the window
 // forward); first-run setup reads it once (`requested`) and decides (core connectRequestPlan).
 let requested=connectArgument(process.argv);
 app.on('second-instance',(_event,argv)=>{const id=connectArgument(argv);if(!id)return;requested=id;host.page.event('worldlet:connect-agent');});
 host.register({agentHarness:localHarnessActions(context,switchTo,builtIn,remote,vault,()=>{const id=requested;requested=null;return id;})});
 host.onQuit(()=>{endSetup();void standing?.then(tools=>tools.close(),()=>{});return adapter.shutdown();});
}
