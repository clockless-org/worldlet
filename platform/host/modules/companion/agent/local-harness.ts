import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {claudeCodeNeedsSignIn,claudeCodeSignInElsewhere,LOCAL_HARNESSES,LOCAL_HARNESS_RESIDENT,PROVIDER_SETTING,backgroundModel,chosenModel,hermesConfigValues,LOCAL_HARNESS_SPARE,modelAtCapacity,modelRefusedByAccount,providerModel,acpApprovalOutcome,acpApprovalRequest,acpChangesAsked,changesAnswered,acpPermissionReply,finishLocalHarness,harnessApprovalFeatures,harnessService,harnessOriginId,harnessSessionThread,harnessTurnTimings,isHarnessAgentId,isHarnessModelId,openClawAgentModel,openClawModels,openClawGateway,openClawToolConfig,localHarness,localHarnessAdapterId,localHarnessInvocation,localHarnessStream,localHarnessTurn,rankLocalHarnesses,readLocalHarnessLine,
 readWorldSince,HERMES_CHANNEL_READ_ONLY,HERMES_STANDING_WRITE_DECLINED,HermesOwnCalls,hermesStandingWriteApproval,type LocalHarnessId,type ModelTier} from '../../../../../agent/gate/index.ts';
import {WorldletError,writeAtomic} from '../../../files.ts';
import {readAgentSetting,writeAgentSetting} from '../../../store/agent-settings.ts';
import {ExecutionJournal} from './journal.ts';
import {PortableAdapter,idleStop} from './external.ts';
import {AgentCancelled,AgentEventWait,LineReader,UnsupportedRuntime,agentEvent,executable,stopChild} from './protocol.ts';
import {holdStandingTurn,openWorldToolBridge,type McpCall,type WorldToolBridge} from '../../gate/world-tool-bridge.ts';
import {currentHarnessTools,harnessCalls,harnessEvents,harnessTools} from './harness-services.ts';
import {harnessSkills} from './harness-skills.ts';
import {openClawConfigPath,openClawWorkspace} from './openclaw-config.ts';
import {openClawAgents,parseJSON5} from './openclaw-files.ts';
import {AcpConversation,AgentConversations,FirstAvailable,GatewayConversation,HermesServerConversation,type ResidentConversation,type ResidentSession} from './harness-sessions.ts';
import {discoverHermes} from './hermes-files.ts';
import {claudeCodeHome,claudeCodeSessionFolder,hermesThreads} from './agent-files.ts';
import {hermesServer} from './hermes-service.ts';
import type {Adapter,AgentEventHandler,AgentRoutines,AgentRuntime,Row,RuntimeContext} from './types.ts';
import type {HarnessAgents,HarnessApprovalChoice,HarnessApprovals,HarnessModels,HarnessSchedule,HarnessTool} from '../../../../../contracts/harness-services.ts';
import {HARNESS_SCHEDULES} from './harness-schedule.ts';
import {HARNESS_AGENTS} from './harness-agents.ts';
import {runSendCommand} from './harness-send.ts';
import {signInOnce,signInRunning} from './provider-sign-in.ts';
import {setTimeout as sleep} from 'node:timers/promises';

/** A turn the provider turned away because its model was busy for everyone, and that can run again as it is. */
class ModelBusy extends WorldletError {}
/** A turn whose Agent went silent until its deadline before showing anything or calling a World tool: it did nothing,
 * so it runs once more on a new process (Mac Alpha 4469, #623: a Codex turn sent no output for 120 s while three other
 * Codex turns answered, and the same message answered in 14 s when sent again). */
class SilentTurn extends WorldletError {}
/** A turn on the Agent's own default model, or on a model Worldlet named in its place, that the provider refused for
 * this account (Codex's default on a ChatGPT plan that does not include it, Alpha 4511, #668/#669). `model`: the
 * refused one, null for the Agent's own default. */
class ModelRefused extends WorldletError {
 readonly model:string|null;
 constructor(message:string,model:string|null){super(message);this.model=model;}
}
/** The models named in place of a refused default, strongest first: the ChatGPT provider's top tier, the same class as
 * Codex's own default, then its chat tier, which every ChatGPT plan accepts. The chat tier alone left background work
 * failing the World's item rules (Mac Alpha 4512/4513, #668). */
const REFUSED_DEFAULT_TIERS:readonly ModelTier[]=['L','M'];
/** Per Agent command, the model its turns name instead of its own default once the account refused that default. Kept
 * until Worldlet quits; the Agent's own settings are never changed. */
const refusedDefaults=new Map<string,string>();
/** The model after `refused` in the fallback order, or null when none is left. */
function nextFallback(agent:LocalHarnessId,refused:string|null):string|null {
 const order=REFUSED_DEFAULT_TIERS.map(tier=>providerModel(agent,'chatgpt',tier)).filter((model):model is string=>!!model);
 return order[refused===null?0:order.indexOf(refused)+1]??null;
}
/** Waits before each new try of a turn whose model was busy: a busy model is usually free again within seconds
 * (Mac Alpha 4312's onboarding mail conversation failed on Codex's "Selected model is at capacity", #416). */
export const BUSY_RETRIES=[4000,15000];

/** Whether an Agent's command runs at all: `--version` exits 0 ('ok'), fails or cannot be spawned ('failed'), or is still
 * going after `timeout` ('slow', not counted as broken: a large Agent's first start on a cold disk can take that long). */
export function localHarnessStarts(install:LocalHarnessInstall,environment:HarnessEnvironment,timeout=30_000):Promise<'ok'|'failed'|'slow'> {
 return new Promise(resolve=>{
  let child:ChildProcess;
  try{child=spawn(install.command,[...install.prefix,'--version'],{env:harnessEnvironment(install,environment),stdio:'ignore',windowsHide:true});}
  catch{resolve('failed');return;}
  const timer=setTimeout(()=>{try{child.kill();}catch{}resolve('slow');},timeout);timer.unref();
  child.once('error',()=>{clearTimeout(timer);resolve('failed');});
  child.once('exit',code=>{clearTimeout(timer);resolve(code===0?'ok':'failed');});
 });
}
/** A turn whose Agent does not start at all (its command fails before it writes a line, and `--version` fails too), not
 * one that started and failed. Windows Beta 4384, 2026-10-13: a Hermes Agent left half-installed stayed chosen after
 * setup, and every Attention check, routine and Fox speak-first ask failed on it as a bare operationFailed. `repeat`: a
 * later turn refused without starting it again, which reports nothing more (the first one was reported). */
export class AgentNotStarting extends WorldletError {
 readonly repeat:boolean;
 constructor(install:Pick<LocalHarnessInstall,'id'|'title'>,repeat=false){
  super(install.id==='hermes'?`${install.title} does not start on this computer. Open Settings › Agents, choose Manage on your Agent, then Install again.`:`${install.title} does not start on this computer. Open it once in Terminal to check it, or choose another Agent in Settings › Agents.`);
  this.name='AgentNotStarting';this.repeat=repeat;
 }
 /** Already reported once; the host records it locally but sends it nowhere again (modules/app). */
 get reported(){return this.repeat;}
}
/** When each Agent command was last found not to start: its turns are refused for NOT_STARTING_MS without starting it
 * again, then tried again (it may have been repaired by hand). Choosing or installing an Agent again clears it. */
const notStarting=new Map<string,number>();
const NOT_STARTING_MS=10*60_000;
export function forgetNotStarting(command?:string){if(command)notStarting.delete(command);else notStarting.clear();}

// A Harness the person already runs here (Claude Code, Codex, Hermes Agent, OpenClaw, pi) as
// Fox's Agent. Core owns the catalog and the per-command turn; this file finds the executables and runs a Fox
// thread's turns in the Harness's resident session where it has one (Hermes Agent's ACP process, OpenClaw's Gateway:
// harness-sessions.ts), else one process per turn (Claude Code's started before its turn, SpareTurns), with the
// person's own environment so the Harness keeps its sign-in.

/** Where to look: what the host must know about this computer. Tests pass a fixture, including
 * `systemDirectories` so the machine's own Homebrew and /usr/local commands stay out of it (and its
 * /Applications too, unless the fixture names `applicationDirectories`). */
export interface HarnessEnvironment {platform:NodeJS.Platform;env:NodeJS.ProcessEnv;home:string;systemDirectories?:string[];applicationDirectories?:string[]}
const UNIX_SYSTEM_DIRECTORIES=['/opt/homebrew/bin','/usr/local/bin'];
export const currentEnvironment=():HarnessEnvironment=>({platform:process.platform,env:process.env,home:process.env.HOME||process.env.USERPROFILE||''});

/** One runnable Harness: `command` plus `prefix` (a Windows npm shim runs as node + its script).
 * `app` names the desktop app whose own copy of the command this is, when there is no separate one. */
export interface LocalHarnessInstall {id:LocalHarnessId;title:string;command:string;prefix:string[];configured:boolean;app?:string}

/** An app opened from the Finder or Start menu gets a short PATH, so common install folders are
 * searched as well as PATH. */
export function searchDirectories({platform,env,home,systemDirectories}:HarnessEnvironment):string[] {
 const join=path.join;
 const listed=(env.PATH??env.Path??'').split(platform==='win32'?';':':').filter(Boolean);
 const extra:string[]=[];
 if(platform==='win32'){
  const appData=env.APPDATA||join(home,'AppData','Roaming'),local=env.LOCALAPPDATA||join(home,'AppData','Local');
  extra.push(join(home,'.local','bin'),join(appData,'npm'),join(local,'Programs','codex'),join(local,'hermes','bin'),join(home,'.bun','bin'),join(local,'pnpm'),join(local,'Volta','bin'),join(env.ProgramFiles||'C:\\Program Files','nodejs'));
 }else{
  extra.push(join(home,'.local','bin'),join(home,'.claude','local'),...(systemDirectories??UNIX_SYSTEM_DIRECTORIES),join(home,'.bun','bin'),join(home,'.npm-global','bin'),join(home,'.volta','bin'),join(home,'Library','pnpm'),join(home,'.local','share','pnpm'));
  // nvm keeps each Node version's global commands apart; newest first.
  const nvm=join(home,'.nvm','versions','node');
  try{for(const version of fs.readdirSync(nvm).sort().reverse())extra.push(join(nvm,version,'bin'));}catch{}
 }
 return [...new Set([...listed,...extra])];
}

/** npm's Windows shim (`claude.cmd`) cannot be spawned without a shell; run its script with Node. */
function windowsShim(file:string,directories:string[]):{command:string;prefix:string[]}|null {
 let text:string;
 try{if(fs.statSync(file).size>16000)return null;text=fs.readFileSync(file,'utf8');}catch{return null;}
 const match=/"%~?dp0%?\\([^"%]+?\.(?:c|m)?js)"/i.exec(text);
 if(!match)return null;
 const dir=path.dirname(file),script=path.join(dir,...match[1].split(/[\\/]/));
 if(!fs.existsSync(script))return null;
 const node=[dir,...directories].map(d=>path.join(d,'node.exe')).find(candidate=>fs.existsSync(candidate));
 return node?{command:node,prefix:[script]}:null;
}

function locate(names:string[],environment:HarnessEnvironment,directories:string[]):{command:string;prefix:string[]}|null {
 const windows=environment.platform==='win32';
 for(const dir of directories)for(const name of names){
  if(windows){
   const exe=path.join(dir,name+'.exe');
   if(fs.existsSync(exe))return {command:exe,prefix:[]};
   const shim=windowsShim(path.join(dir,name+'.cmd'),directories);
   if(shim)return shim;
  }else{
   const file=path.join(dir,name);
   if(executable(file))return {command:file,prefix:[]};
  }
 }
 return null;
}

/** Desktop apps that carry a Harness's command inside them: the Codex app and ChatGPT both ship Codex,
 * so a person with only the app has Codex too. On Windows the Codex app moves its command into a new
 * bin/<build>/ folder with each update; the newest build wins. */
const APP_BUNDLED:Partial<Record<LocalHarnessId,{mac:string[];windows:{app:string;bin:string}[]}>>={
 codex:{mac:['Codex','ChatGPT'],windows:[{app:'Codex',bin:'OpenAI/Codex/bin'}]}
};
function locateInApps(id:LocalHarnessId,names:string[],{platform,env,home,systemDirectories,applicationDirectories}:HarnessEnvironment):{command:string;prefix:string[];app:string}|null {
 const bundled=APP_BUNDLED[id];
 if(!bundled)return null;
 if(platform==='darwin'){
  const folders=applicationDirectories??[...systemDirectories?[]:['/Applications'],...home?[path.join(home,'Applications')]:[]];
  // Older builds keep the command in Resources/; newer ChatGPT builds moved it to Resources/codex-cli/bin/.
  for(const folder of folders)for(const app of bundled.mac)for(const inner of [[],['codex-cli','bin']])for(const name of names){
   const file=path.join(folder,app+'.app','Contents','Resources',...inner,name);
   if(executable(file))return {command:file,prefix:[],app};
  }
 }else if(platform==='win32'){
  const local=env.LOCALAPPDATA||(home?path.join(home,'AppData','Local'):'');
  for(const {app,bin} of bundled.windows)for(const name of names){
   const builds=path.join(local,...bin.split('/'));
   let files:string[]=[];
   try{files=fs.readdirSync(builds).map(build=>path.join(builds,build,name+'.exe')).filter(file=>fs.existsSync(file));}catch{}
   const newest=files.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
   if(local&&newest)return {command:newest,prefix:[],app};
  }
 }
 return null;
}

function configured(definition:typeof LOCAL_HARNESSES[number],{env,home}:HarnessEnvironment){
 if(definition.configurationEnv.some(key=>{const dir=env[key];return typeof dir==='string'&&path.isAbsolute(dir)&&fs.existsSync(dir);}))return true;
 return !!home&&definition.configuration.some(relative=>fs.existsSync(path.join(home,...relative.split('/'))));
}

/** Installed Harnesses, set-up ones first. Paths stay in the host; the page sees IDs and titles. */
export function locateLocalHarnesses(environment:HarnessEnvironment=currentEnvironment()):LocalHarnessInstall[] {
 const directories=searchDirectories(environment);
 const found:LocalHarnessInstall[]=[];
 for(const definition of LOCAL_HARNESSES){
  // A separate command line first; otherwise the copy inside the person's desktop app.
  const location=locate(definition.commands,environment,directories)??locateInApps(definition.id,definition.commands,environment);
  if(location)found.push({id:definition.id,title:definition.title,...location,configured:configured(definition,environment)});
 }
 return rankLocalHarnesses(found);
}

/** The person's environment, so the Harness finds its own sign-in, minus Worldlet's own settings. */
export function harnessEnvironment(install:LocalHarnessInstall,environment:HarnessEnvironment):Record<string,string> {
 const env:Record<string,string>={};
 for(const [key,value] of Object.entries(environment.env))if(typeof value==='string'&&!/^WORLDLET_/i.test(key)&&!['CLAUDECODE','ELECTRON_RUN_AS_NODE','NODE_OPTIONS'].includes(key.toUpperCase()))env[key]=value;
 const separator=environment.platform==='win32'?';':':';
 const pathKey=Object.keys(env).find(key=>key.toUpperCase()==='PATH')??'PATH';
 // `#!/usr/bin/env node` scripts need Node, which usually sits beside the command.
 env[pathKey]=[...new Set([path.dirname(install.command),...install.prefix.map(file=>path.dirname(file)),...searchDirectories(environment)])].join(separator);
 return env;
}

/** The person's own OpenClaw configuration file: OPENCLAW_CONFIG_PATH, else openclaw.json in its state folder. */
export const openClawConfigFile=({env,home}:HarnessEnvironment):string=>openClawConfigPath(home,env);

/** `<command> --version`, proving the executable starts; null when it does not. */
/** How long a Harness's output is still read after it exits. */
const EXIT_READ_MS=300;
export function harnessVersion(install:LocalHarnessInstall,environment:HarnessEnvironment=currentEnvironment(),timeout=10000):Promise<string|null> {
 return new Promise(resolve=>{
  let output='';
  let child:ChildProcess;
  try{child=spawn(install.command,[...install.prefix,'--version'],{env:harnessEnvironment(install,environment),stdio:['ignore','pipe','ignore'],windowsHide:true});}
  catch{resolve(null);return;}
  const timer=setTimeout(()=>{stopChild(child);resolve(null);},timeout);
  child.stdout?.on('data',(chunk:Buffer)=>{if(output.length<4000)output+=chunk.toString('utf8');});
  child.once('error',()=>{clearTimeout(timer);resolve(null);});
  // On its exit, not when its output closes: a helper it started may hold that open (its last output read first).
  child.once('exit',code=>{clearTimeout(timer);setTimeout(()=>resolve(code===0?output.trim().split('\n')[0].slice(0,80):null),EXIT_READ_MS);});
 });
}

/** One process per Fox turn. Claude Code and Codex also get World tools through a per-turn MCP server. */
/** One turn's Harness process, started with its command line and waiting for the prompt on stdin. Its World tool
 * bridge relays to whichever turn takes it (`dispatch`). `key` is everything its command line depends on. */
/** A brought conversation a turn continues (LocalHarnessRuntime resumeOf): its ongoing ID, the person's session it
 * goes on in, and the folder that session ran in. */
type Resume={origin:string;session:string;cwd:string};
const CONTINUED_FILE='harness-continued.json';
function readContinued(home:string):Record<string,string> {
 try{const value=JSON.parse(fs.readFileSync(path.join(home,CONTINUED_FILE),'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function saveContinued(home:string,origin:string,session:string|null){
 try{
  const all=readContinued(home);
  if(session)all[origin]=session;else delete all[origin];
  fs.mkdirSync(home,{recursive:true,mode:0o700});writeAtomic(path.join(home,CONTINUED_FILE),JSON.stringify(all)+'\n',0o600);
 }catch{}
}
interface StartedTurn {child:ChildProcess;bridge:WorldToolBridge|null;key:string;stderr:{text:string};dispatch:{run:(name:string,args:Row)=>Promise<Row>}}
function discardTurn(turn:StartedTurn){stopChild(turn.child);turn.child.stdout?.destroy();turn.bridge?.close();}
/** How long a spare process waits for the next turn before it is stopped. */
export const SPARE_IDLE_MS=10*60_000;

/** The next turn's process, started as soon as a turn ends (LOCAL_HARNESS_SPARE in Core): the Harness has
 * already loaded its sign-in, settings and MCP server when the person writes, so only the model's own time
 * is left (owner request 2026-10-06; Claude Code measured about 6 s a turn cold and 3.5 s with a spare). It
 * is used only by a turn with the same command line, and is stopped after SPARE_IDLE_MS, on shutdown, or
 * when the Harness changes. */
export class SpareTurns {
 private spare:{turn:StartedTurn;timer:NodeJS.Timeout}|null=null;
 // Moves on every clear(): a process still starting when the spares were cleared (shutdown, a stop for a reset)
 // is not kept when it arrives.
 private generation=0;
 /** What a spare being started now hands to `keep`. */
 get ticket(){return this.generation;}
 take(key:string):StartedTurn|null {
  const entry=this.spare;if(!entry)return null;
  this.spare=null;clearTimeout(entry.timer);
  const {turn}=entry;
  if(turn.key!==key||turn.child.exitCode!==null||turn.child.signalCode!==null){discardTurn(turn);return null;}
  return turn;
 }
 keep(turn:StartedTurn,ticket=this.generation){
  if(ticket!==this.generation){discardTurn(turn);return;}
  this.drop();
  const timer=setTimeout(()=>{if(this.spare?.turn===turn){this.spare=null;discardTurn(turn);}},SPARE_IDLE_MS);
  timer.unref?.();
  this.spare={turn,timer};
  // A spare that exits by itself (signed out, updated) is simply gone; the next turn starts its own.
  turn.child.once('exit',()=>{if(this.spare?.turn===turn){clearTimeout(timer);this.spare=null;turn.bridge?.close();}});
 }
 get waiting(){return this.spare!==null;}
 clear(){this.generation++;this.drop();}
 private drop(){const entry=this.spare;if(!entry)return;this.spare=null;clearTimeout(entry.timer);discardTurn(entry.turn);}
}

/** Permission prompts of a conversation turn that runs a process of its own (Hermes Agent when its resident `hermes acp`
 * does not answer): put to the person as the same approval card, the turn holding until they answer. Unanswered after
 * ten minutes, cancelled or stopped, it is declined, as Hermes itself declines a prompt that times out. */
export class TurnApprovals implements HarnessApprovals {
 private readonly asks=new Map<string,{resolve:(choice:HarnessApprovalChoice|null)=>void;timer:NodeJS.Timeout}>();
 has(id:string){return this.asks.has(id);}
 ask():{id:string;answered:Promise<HarnessApprovalChoice|null>} {
  const id='turn-'+crypto.randomUUID().slice(0,12);
  const answered=new Promise<HarnessApprovalChoice|null>(resolve=>{
   const timer=setTimeout(()=>this.settle(id,'deny'),10*60_000);timer.unref?.();
   this.asks.set(id,{resolve,timer});
  });
  return {id,answered};
 }
 settle(id:string,choice:HarnessApprovalChoice|null){const ask=this.asks.get(id);if(!ask)return;this.asks.delete(id);clearTimeout(ask.timer);ask.resolve(choice);}
 async answer(id:string,choice:HarnessApprovalChoice){
  if(!this.asks.has(id))throw new WorldletError('This request was already answered or has expired.');
  this.settle(id,choice);
 }
}

export class LocalHarnessRuntime implements AgentRuntime {
 readonly install:LocalHarnessInstall;
 private readonly environment:HarnessEnvironment;
 private child:ChildProcess|null=null;
 private cancelled=false;
 private eventWait:AgentEventWait|null=null;
 private readonly onActivity:(runtime:LocalHarnessRuntime,running:boolean)=>void;
 private readonly spares:SpareTurns|null;
 /** The Harness's resident conversation, for the foreground conversation's turns (null: a process per turn). */
 private readonly conversation:ResidentConversation|null;
 private session:ResidentSession|null=null;
 /** Where a conversation turn's own process puts its permission prompts (null: they are declined). */
 private readonly approvals:TurnApprovals|null;
 private asking:string[]=[];
 /** The chosen provider's model for this Agent's turns (model-providers.ts), null for its own default. */
 private readonly route:()=>string|null;
 /** The brought conversations a turn may continue (RuntimeContext `origin`). */
 private readonly links:Pick<RuntimeContext,'origin'>;
 constructor(install:LocalHarnessInstall,environment:HarnessEnvironment=currentEnvironment(),onActivity:(runtime:LocalHarnessRuntime,running:boolean)=>void=()=>{},spares:SpareTurns|null=null,conversation:ResidentConversation|null=null,approvals:TurnApprovals|null=null,route:()=>string|null=()=>null,links:Pick<RuntimeContext,'origin'>={}){
  this.install=install;this.environment=environment;this.onActivity=onActivity;this.route=route;this.links=links;
  this.spares=LOCAL_HARNESS_SPARE.includes(install.id)?spares:null;
  this.conversation=conversation;this.approvals=approvals;
 }
 /** The person's own session a turn in a brought conversation's place continues (owner decision 2026-10-12: Fox
  * writes into it, so the conversation goes on where the person left it, in their Agent too): the one an earlier
  * turn moved on to, else the conversation's own. Claude Code resumes a session file in the folder it ran in
  * (`--resume`); Hermes Agent loads the conversation's newest session (`session/load`) for its main profile. Never a
  * group or channel others write in (RuntimeContext `origin`); OpenClaw's are not continued yet. */
 private resumeOf(home:string,thread:unknown,agent:string|null=null):Resume|null {
  const origin=harnessOriginId(harnessSessionThread(thread));
  if(!origin||agent)return null;
  const later=readContinued(home)[origin];
  if(this.install.id==='claude-code'){
   const root=claudeCodeHome(this.environment.home,this.environment.env),moved=later?claudeCodeSessionFolder(root,later):null;
   if(later&&moved)return {origin,session:later,cwd:moved};
   const session=this.links.origin?.(this.install.id,origin)??null,cwd=session?claudeCodeSessionFolder(root,session):null;
   return session&&cwd?{origin,session,cwd}:null;
  }
  if(this.install.id==='hermes'){
   // Its main profile's conversations only (a profile's chain is named `profile:root`).
   const chain=this.links.origin?.(this.install.id,origin)??null;
   const session=chain&&!chain.includes(':')?hermesThreads(this.environment.home,this.environment.env)?.find(item=>item.key===chain)?.sessions.at(-1)??null:null;
   return session?{origin,session,cwd:home}:null;
  }
  return null;
 }
 /** The person's own session a resident thread continues (Hermes Agent's `session/load`), for warming and the turn alike. */
 private residentResume(home:string,thread:unknown,agent:string|null):{resume?:string} {
  const resume=this.install.id==='hermes'?this.resumeOf(home,thread,agent):null;
  return resume?{resume:resume.session}:{};
 }
 /** Claude Code may answer a resumed conversation in a session of a new ID: the next turn continues that one. */
 private continued(home:string,resume:Resume,session:string){
  if(readContinued(home)[resume.origin]!==session)saveContinued(home,resume.origin,session);
 }
 private settleAsks(){for(const id of this.asking.splice(0))this.approvals?.settle(id,null);}
 /** Opens the turn's World tool bridge (when it has tools) and starts the Harness with its command line; `agent`: the
  * person's other agent that answers this thread (its Hermes profile; its OpenClaw workspace and model); `chosen`: the
  * model chosen for the thread (OpenClaw's `--model`; a Hermes Agent turn of its own keeps its profile's model). */
 private async start(home:string,turn:{system:string;prompt:string},tools:boolean,sample:boolean,key:string,agent:string|null=null,chosen:string|null=null,resume:Resume|null=null):Promise<StartedTurn> {
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  const dispatch={run:async(_name:string,_args:Row):Promise<Row>=>({error:'World tool is unavailable.'})};
  const bridge=tools?await openWorldToolBridge(home,{sample,dispatch:(name,args)=>dispatch.run(name,args)}):null;
  let child:ChildProcess;
  const env=harnessEnvironment(this.install,this.environment);
  // OpenClaw: its own workspace, and with tools a configuration for this turn that includes the person's own.
  let config:string|null=null,workspace:string|null=null,model:string|null=null;
  if(this.install.id==='openclaw'){
   const own=openClawConfigFile(this.environment);
   workspace=openClawWorkspace(this.environment.home,this.environment.env);
   if(agent){
    let settings:unknown={};try{settings=parseJSON5(fs.readFileSync(own,'utf8'));}catch{}
    const found=openClawAgents(this.environment.home,this.environment.env,(settings&&typeof settings==='object'?settings:{}) as Record<string,any>).find(item=>item.id===agent);
    workspace=found?.workspace??workspace;model=openClawAgentModel(settings,agent)??null;
   }
   if(bridge){
    config=path.join(home,`worldlet-openclaw-${crypto.randomUUID().slice(0,8)}.json`);
    writeAtomic(config,openClawToolConfig(fs.existsSync(own)?own:null,bridge.server),0o600);
    // `$include` only reaches files under the including file's folder or these roots.
    env.OPENCLAW_INCLUDE_ROOTS=path.dirname(own);
    const close=bridge.close,file=config;bridge.close=()=>{close();fs.rmSync(file,{force:true});};
   }
  }
  if(chosen)model=chosen;
  try{
   const invocation=localHarnessInvocation(this.install.id,turn,bridge?.server??null,{cwd:home,config,workspace,agent,model,resume});
   // A resumed conversation is found in the folder it ran in.
   child=spawn(this.install.command,[...this.install.prefix,...invocation.args],{cwd:resume?.cwd??home,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  }catch(error){bridge?.close();throw error;}
  if(!child.pid){child.kill();bridge?.close();throw new WorldletError(`${this.install.title} could not start.`);}
  child.stdin!.on('error',()=>{});
  const stderr={text:''};
  child.stderr!.on('data',(chunk:Buffer)=>{stderr.text=(stderr.text+chunk.toString('utf8')).slice(-8000);});
  return {child,bridge,key,stderr,dispatch};
 }
 /** Starts the next turn's process now, with this turn's command line, so the next turn need not wait for it. */
 private prepare(home:string,system:string,tools:boolean,sample:boolean,key:string,agent:string|null,model:string|null){
  const spares=this.spares;if(!spares)return;
  const ticket=spares.ticket;
  void this.start(home,{system,prompt:''},tools,sample,key,agent,model).then(turn=>spares.keep(turn,ticket)).catch(()=>{});
 }
 get isRunning(){return this.child!==null||this.session!==null;}
 cancel(){this.cancelled=true;this.settleAsks();this.eventWait?.cancel();if(this.child)stopChild(this.child);this.session?.cancel();}
 async steer(){return false;}
 run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  if(body.action==='status')return Promise.resolve(this.status());
  if(body.action==='warmup')return this.warm(body,home);
  if(body.action!=='chat')return Promise.reject(new WorldletError(`Fox uses ${this.install.title} on this computer. Manage its models and accounts in ${this.install.title}.`));
  return ExecutionJournal.run(body,home,onEvent,observed=>this.execute(body,home,observed));
 }
 /** Opens the Fox thread's resident session before its turn (the person started typing or opened Fox), switched to
  * the thread's model, so the turn finds it ready; again, it is the same session. A process-per-turn Harness, setup and
  * background work have nothing to open. Never fails: a turn that follows reports what is wrong. */
 private async warm(body:Row,home:string):Promise<Row> {
  const conversation=this.conversation&&body._background!==true&&body.mode!=='setup'?this.conversation:null;
  if(!conversation||this.session||this.child)return {warm:false};
  const agent=isHarnessAgentId(body.harnessAgent)?body.harnessAgent:null,model=this.model(body,agent)??undefined;
  try{
   if(await conversation.unavailable(agent??undefined)!==null)return {warm:false};
   const session=await conversation.open({world:this.world(body),thread:harnessSessionThread(body.thread),...agent?{agent}:{}},{home,sample:body.sample===true,...this.residentResume(home,body.thread,agent)});
   await session.prepare(model);
   return {warm:true};
  }catch{return {warm:false};}
 }
 /** The model a turn uses: the one chosen for its thread (an Applet's), else the chosen provider's for the person's own
  * Agent (not another of their agents, which keeps its own), else the one named in place of a refused default
  * (`refusedDefaults`), else null and the Agent's own default. */
 private model(body:Row,agent:string|null):string|null {
  return this.chosen(body,agent)??(agent?null:refusedDefaults.get(this.install.command)??null);
 }
 /** The model chosen for the turn: its thread's, else the chosen provider's for the person's own Agent. */
 private chosen(body:Row,agent:string|null):string|null {
  if(isHarnessModelId(body.harnessModel))return body.harnessModel;
  if(agent)return null;
  try{return this.route();}catch{return null;}
 }
 /** `harnessWorld`: a turn another Worldlet sent (agent/app remoteTurnBody) keeps its threads apart from this World's. */
 private world(body:Row){return body.sample!==true&&typeof body.harnessWorld==='string'&&/^remote:[A-Za-z0-9._-]{1,60}$/.test(body.harnessWorld)?body.harnessWorld:body.sample===true?'sample':'private';}
 status():Row {
  if(!fs.existsSync(this.install.command))return {ready:false,name:this.install.title,provider:localHarnessAdapterId(this.install.id),error:`${this.install.title} is no longer installed.`};
  return {ready:true,name:this.install.title,provider:localHarnessAdapterId(this.install.id),capabilities:{streaming:true,tools:localHarness(this.install.id).worldTools,cancel:true,steer:false,memory:false,sessions:this.conversation!==null,routines:false}};
 }
 /** One turn; tried again, after a wait, while the provider turns it away as busy before anything happened. */
 private async execute(body:Row,home:string,onEvent:AgentEventHandler):Promise<Row> {
  let silent=false;
  for(let tried=0;;tried++){
   try{return await this.attempt(body,home,onEvent);}
   catch(error){
    if(error instanceof SilentTurn&&!silent&&!this.cancelled){silent=true;tried--;continue;}
    // Its own default refused for this account: the same turn runs at once on the provider's chat-tier model, and so
    // do its later turns.
    const fallback=error instanceof ModelRefused&&!this.cancelled?nextFallback(this.install.id,error.model):null;
    if(fallback){
     // A turn refused at the same time as another may already find a later model in place.
     const order=REFUSED_DEFAULT_TIERS.map(tier=>providerModel(this.install.id,'chatgpt',tier)),current=refusedDefaults.get(this.install.command);
     if(current===undefined||order.indexOf(current)<order.indexOf(fallback))refusedDefaults.set(this.install.command,fallback);
     tried--;continue;
    }
    if(!(error instanceof ModelBusy)||tried>=BUSY_RETRIES.length||this.cancelled)throw error;
    if(body._background!==true)await onEvent(agentEvent({type:'progress',name:`${this.install.title}'s model is busy right now. Trying again…`}));
    await sleep(BUSY_RETRIES[tried]);
    if(this.cancelled)throw new AgentCancelled();
   }
  }
 }
 private async attempt(body:Row,home:string,onEvent:AgentEventHandler):Promise<Row> {
  if(this.child)throw new WorldletError('This Agent is already working.');
  const broken=notStarting.get(this.install.command);
  if(broken!==undefined&&Date.now()-broken<NOT_STARTING_MS)throw new AgentNotStarting(this.install,true);
  this.cancelled=false;
  const id=this.install.id;
  const events=new AgentEventWait();this.eventWait=events;
  // Text, tool calls and their answers reach the page one at a time, in order.
  let chain:Promise<unknown>=Promise.resolve();
  const emit=(event:Row)=>{const next=chain.then(()=>events.run(()=>onEvent(agentEvent(event))));chain=next.catch(()=>{});return next;};
  let started=false;
  const say=async(text:string)=>{if(!text)return;if(!started){started=true;await emit({type:'response_start'});}await emit({type:'delta',text});};
  // World tools for a real request: the conversation's, an Applet task's and the Attention check's (`monitor`, whose
  // events allow only the item tools); greetings, the setup probe and summaries stay text.
  const tools=localHarness(id).worldTools&&body.action==='chat'&&body.allowActions!==false&&(body._background!==true||body.monitor===true);
  const sample=body.sample===true;
  // What the person's Agent can do beyond World tools (its `tools` service), so Fox offers it in a conversation.
  const harnessTools=body._background===true?[]:await currentHarnessTools(id,this.environment.home,this.environment.env);
  // The conversation's own turns go to the Fox thread's resident session; setup's probe and background work keep a
  // process each. When the resident interface does not answer, the turn says so once and runs on its own process.
  const conversation=this.conversation&&body._background!==true&&body.mode!=='setup'?this.conversation:null;
  // The person's other agent and the model chosen for this thread (an Applet's), in the session and the per-turn
  // fallback alike.
  const agent=isHarnessAgentId(body.harnessAgent)?body.harnessAgent:null,model=this.model(body,agent);
  if(conversation){
   const reason=await conversation.unavailable(agent??undefined);
   if(reason===null){conversation.noted=null;return this.converse(conversation,body,home,tools,sample,agent,model,harnessTools,{events,emit,say,started:()=>started});}
   if(conversation.noted!==reason){conversation.noted=reason;await emit({type:'progress',name:`${this.install.title} is not keeping this conversation: ${reason}. Fox starts it for each message, so it is slower and sees only the last few messages.`});}
  }
  // A brought conversation the person switched Fox to, or a kept one's Applet, goes on in that conversation's own
  // Claude Code session (agent/tasks/fox-sessions.ts).
  const resume=id==='claude-code'&&body._background!==true&&body.mode!=='setup'?this.resumeOf(home,body.thread,agent):null;
  const turn=localHarnessTurn(body,{worldTools:tools,own:localHarness(id).connect,harnessTools,resident:resume!==null});
  const key=JSON.stringify([home,turn.system,tools,sample,agent,model]);
  // The spare the previous turn left waiting, when it was started for this command line; else a new process.
  let harness:StartedTurn;
  try{harness=(resume?null:this.spares?.take(key))??await this.start(home,turn,tools,sample,key,agent,model,resume);}
  catch(error){events.cancel();this.eventWait=null;throw await this.notStarting()??error;}
  let calls=0;
  let deadline:ReturnType<typeof idleStop>|null=null;
  harness.dispatch.run=async(name,args)=>{
   const pending=emit({type:'tool',id:`world-${++calls}`,name,args});
   const answer=deadline?await deadline.hold(pending):await pending;
   return answer&&typeof answer==='object'?answer as Row:{error:'World tool is unavailable.'};
  };
  const {child,bridge}=harness;
  const invocation=localHarnessInvocation(id,turn,bridge?.server??null,{cwd:home,agent,model,resume});
  this.child=child;this.onActivity(this,true);
  // Which model the turn named (or the Agent's own default) goes into the run's journal, so a failed check can say
  // which model did the work (Mac Alpha 4512–4514, #668: the release host's model could not be read from its report).
  try{await onEvent(agentEvent({type:'trace',kind:'model.requested',payload:{harness:id,model:model??'own default'}}));}catch{}
  // A conversation over stdin (Hermes Agent's ACP) keeps it open for the replies the stream asks for.
  if(invocation.acp)child.stdin!.write(invocation.stdin??'');
  else if(invocation.stdin!==null)child.stdin!.end(invocation.stdin);else child.stdin!.end();
  const exited=new Promise<number|null>(resolve=>{child.once('exit',code=>resolve(code));child.once('error',()=>resolve(null));});
  const reader=new LineReader(child.stdout);
  child.once('error',()=>reader.end());
  // The turn ends with the Harness itself, stopped or not: a helper it started (a launcher's child, a server) may keep
  // its output open long after, and a stop must not wait for that (owner report 2026-10-09: setup stayed on Connecting).
  child.once('exit',()=>{setTimeout(()=>reader.end(),EXIT_READ_MS).unref();});
  let timedOut=false;
  const stopped=()=>{if(this.cancelled)throw new AgentCancelled();if(timedOut)throw new (!started&&calls===0?SilentTurn:WorldletError)(`${this.install.title} took too long to answer. Try again.`);};
  let standing=()=>{};
  const own=new HermesOwnCalls();
  try{
   const asks=body._background!==true&&body.mode!=='setup';
   standing=this.standing(tools,sample,own,async(name,args,call)=>await this.confirmWrite(name,args,call,own,emit,work=>deadline?deadline.hold(work):work,asks,body.thread,agent)??harness.dispatch.run(name,args));
   deadline=idleStop(body,()=>{timedOut=true;this.settleAsks();events.cancel(new WorldletError(`${this.install.title} took too long to answer. Try again.`));stopChild(child);});
   // A conversation turn's permission prompts go to the person; background work's are declined (no one is there).
   const approvals=body._background!==true&&body.mode!=='setup'?this.approvals:null;
   const stream=localHarnessStream(invocation.acp,{ask:approvals!==null});
   const answer=async()=>{
    for(const ask of stream.asks?.splice(0)??[]){
     const {id,answered}=approvals!.ask();this.asking.push(id);
     if(stream.changes)acpChangesAsked(stream.changes,id,ask.params);
     await emit({type:'approval',request:{...acpApprovalRequest(id,ask.params,{title:this.install.title}),thread:harnessSessionThread(body.thread),...agent?{agent}:{}}});
     const choice=await deadline!.hold(answered);
     this.asking=this.asking.filter(item=>item!==id);
     stopped();
     if(stream.changes)stream.results.push(...changesAnswered(stream.changes,id,choice));
     stream.outbox.push(acpPermissionReply(ask.rpc,choice?acpApprovalOutcome(ask.params,choice):{outcome:{outcome:'cancelled'}}));
    }
    // What an allowed command or edit changed, once its tool call finished.
    for(const result of stream.results.splice(0))await emit({type:'approval_result',result});
    for(const line of stream.outbox.splice(0))if(child.stdin!.writable)child.stdin!.write(line);
   };
   let received=0;
   while(!stream.done){
    stopped();
    const chunk=await reader.read();
    if(!chunk){
     if(reader.buffer.length){const rest=reader.buffer.toString('utf8');reader.buffer=Buffer.alloc(0);await say(readLocalHarnessLine(id,stream,rest));}
     break;
    }
    received+=chunk.length;deadline.touch();
    if(received>16_000_000)throw new WorldletError(`${this.install.title} sent more output than Fox can read.`);
    reader.buffer=reader.buffer.length?Buffer.concat([reader.buffer,chunk]):chunk;
    let line:Buffer|null;
    while(!stream.done&&(line=reader.line())!==null){
     stopped();
     await say(readLocalHarnessLine(id,stream,line.toString('utf8')));
     if(resume&&stream.session&&stream.session!==resume.session)this.continued(home,resume,stream.session);
     for(const call of stream.announced.splice(0))own.announce(call);
     await answer();
    }
   }
   // A conversation that has its answer ends here; the process does not exit by itself.
   if(stream.done)stopChild(child);
   const code=stream.done?0:await exited;
   stopped();
   // Background work (the Attention check) is its World tool calls; a conversation turn still needs words.
   const outcome=finishLocalHarness(id,stream,{code,stderr:harness.stderr.text},body._background===true?calls:0);
   if('error' in outcome){
    // A later session that no longer opens: the next turn goes back to the conversation's own.
    if(resume&&!started&&readContinued(home)[resume.origin]===resume.session)saveContinued(home,resume.origin,null);
    // Claude Code's sign-in ran out or never happened: its own sign-in page opens in the browser by itself, once per launch.
    // After that, with no page open, the line points to Settings › Agents instead.
    const error=claudeCodeNeedsSignIn(outcome.error)&&!signInOnce(this.install,harnessEnvironment(this.install,this.environment))&&!signInRunning()?claudeCodeSignInElsewhere(outcome.error):outcome.error;
    // It wrote nothing and exited with an error: when its command does not start at all, the turn says so plainly.
    if(received===0&&!started&&calls===0&&code!==0&&!this.cancelled&&!timedOut){const broken=await this.notStarting();if(broken)throw broken;}
    // Nothing shown and no World tool called yet, the same turn can simply run again. Background work (an Applet's
    // analysis, the Attention check) is a bounded pass that reads, then saves items by their IDs, with no one watching:
    // it runs again also when the model turned busy mid-pass, after its reads (Mac Alpha 4320, #429).
    if((body._background===true||(!started&&calls===0))&&modelAtCapacity(outcome.error))throw new ModelBusy(outcome.error);
    const own=model===null||!this.chosen(body,agent)&&model===refusedDefaults.get(this.install.command);
    if(own&&(body._background===true||(!started&&calls===0))&&modelRefusedByAccount(outcome.error))throw new ModelRefused(outcome.error,model);
    throw new WorldletError(error);
   }
   if(!started&&outcome.message)await say(outcome.message);
   return {message:outcome.message};
  }finally{
   this.settleAsks();
   deadline?.stop();
   standing();bridge?.close();
   events.cancel();this.eventWait=null;
   stopChild(child);child.stdout!.destroy();
   this.child=null;this.onActivity(this,false);
   // A foreground turn that ran its course leaves the next one's process waiting.
   if(!resume&&!this.cancelled&&!timedOut&&body._background!==true)this.prepare(home,turn.system,tools,sample,key,agent,model);
  }
 }
 /** AgentNotStarting when this Agent's command does not start at all (remembered for NOT_STARTING_MS), else null. */
 private async notStarting():Promise<AgentNotStarting|null> {
  if(this.cancelled||await localHarnessStarts(this.install,this.environment,15_000)!=='failed')return null;
  notStarting.set(this.install.command,Date.now());
  return new AgentNotStarting(this.install);
 }
 /** Hermes Agent loads the `worldlet` server registered in its profile (World tools on Hermes, world-tool-bridge.ts) as
  * well as the turn's own, and calls on it may come through either: while a private World turn with tools runs, the
  * standing server's calls go to this turn; `own` holds the calls its stream announced. Returns the release. */
 private standing(tools:boolean,sample:boolean,own:HermesOwnCalls,dispatch:(name:string,args:Row,call:McpCall)=>Promise<Row>):()=>void {
  return this.install.id==='hermes'&&tools&&!sample?holdStandingTurn({own,dispatch}):()=>{};
 }
 /** A guarded World write on the standing server that this turn's stream announced is Fox's own and runs under the
  * turn's trust, the undo notice after it, no card (owner decision on PR #2237; Kelvin, #2126: ask as little as
  * possible). One it did not announce may be another channel's, so it waits for the person on the approval card (core
  * hermesStandingWriteApproval): Allow once runs it as the turn's tool (null), Deny, a timeout or the turn ending
  * refuses it. With no one to ask (background work, setup) it is refused like a call from another channel. */
 private async confirmWrite(name:string,args:Row,call:McpCall,own:HermesOwnCalls,emit:(event:Row)=>Promise<unknown>,hold:<T>(work:Promise<T>)=>Promise<T>,asks:boolean,thread:unknown,agent:string|null):Promise<Row|null> {
  // The card names the Agent whose token made the call (agent/gate/GRANTS.md).
  const ask=hermesStandingWriteApproval(name,args,call.agent?.name||this.install.title);
  if(!ask||await own.take(call))return null;
  if(!asks||!this.approvals)return {error:HERMES_CHANNEL_READ_ONLY};
  const {id,answered}=this.approvals.ask();this.asking.push(id);
  try{
   await emit({type:'approval',request:{id,...ask,thread:harnessSessionThread(thread),...agent?{agent}:{}}});
   return await hold(answered)==='once'?null:{error:HERMES_STANDING_WRITE_DECLINED};
  }finally{this.asking=this.asking.filter(item=>item!==id);}
 }
 /** One turn in the Fox thread's resident session (main conversation, an item card's or an Applet's thread): only the
  * new line, the instructions, the current view and what happened in the World since its last reply (`worldSince`) go;
  * the Harness keeps the thread and compacts it. Its permission
  * prompts reach the World as `approval` events, answered through the adapter's `approvals`. The reply carries the
  * usage the Agent reported and the turn's timings: opening the session (`sessionMs`, near 0 once warmed) and send to
  * the first word (`firstTextMs`) and its World tool calls (`toolsMs`), for the Fox timing record. */
 private async converse(conversation:ResidentConversation,body:Row,home:string,tools:boolean,sample:boolean,agent:string|null,model:string|null,harnessTools:readonly HarnessTool[],{events,emit,say,started}:TurnPipe):Promise<Row> {
  // A call placed from a resident session names it (`requestedBy`), so its result comes back to this thread.
  const turn=localHarnessTurn(body,{worldTools:tools,own:localHarness(this.install.id).connect,resident:true,harnessTools,harnessCalls:harnessService(this.install.id,'calls')!==null});
  let session:ResidentSession;
  const opening=performance.now();
  try{session=await conversation.open({world:this.world(body),thread:harnessSessionThread(body.thread),...agent?{agent}:{}},{home,sample,...this.residentResume(home,body.thread,agent)});}
  catch(error){events.cancel();this.eventWait=null;throw error;}
  const sessionMs=performance.now()-opening;
  let calls=0,toolsMs=0,timedOut=false;
  const deadline=idleStop(body,()=>{timedOut=true;events.cancel(new WorldletError(`${this.install.title} took too long to answer. Try again.`));session.cancel();});
  session.dispatch=async(name,args)=>{
   const began=performance.now();
   try{
    const answer=await deadline.hold(emit({type:'tool',id:`world-${++calls}`,name,args}));
    return answer&&typeof answer==='object'?answer as Row:{error:'World tool is unavailable.'};
   }finally{toolsMs+=performance.now()-began;}
  };
  this.session=session;this.onActivity(this,true);
  const asks=body._background!==true&&body.mode!=='setup',own=new HermesOwnCalls();
  const standing=this.standing(tools,sample,own,async(name,args,call)=>await this.confirmWrite(name,args,call,own,emit,work=>deadline.hold(work),asks,body.thread,agent)??session.dispatch(name,args));
  let shown:Promise<unknown>=Promise.resolve();
  let firstText:number|null=null;const sent=performance.now();
  try{
   const world=readWorldSince(body.worldSince);
   const result=await session.send({text:turn.prompt,instructions:turn.system,tools,...model?{model}:{},...world?{world}:{}},event=>{
    deadline.touch();
    if(event.type==='delta'&&firstText===null&&event.text)firstText=performance.now()-sent;
    shown=event.type==='delta'?say(event.text):emit(event);
    shown.catch(()=>{});
   },{hold:work=>deadline.hold(work),announce:call=>own.announce(call)});
   await shown;
   if(this.cancelled)throw new AgentCancelled();
   if(timedOut)throw new WorldletError(`${this.install.title} took too long to answer. Try again.`);
   const message=result.text.trim();
   if(!message)throw new WorldletError(`${this.install.title} did not answer.`);
   if(!started())await say(message);
   return {message,...result.usage?{usage:result.usage}:{},timings:harnessTurnTimings({sessionMs,firstTextMs:firstText??performance.now()-sent,toolsMs,usage:result.usage})};
  }catch(error){
   if(this.cancelled)throw new AgentCancelled();
   throw error;
  }finally{
   standing();deadline.stop();session.dispatch=async()=>({error:'World tool is unavailable.'});
   events.cancel();this.eventWait=null;
   this.session=null;this.onActivity(this,false);
  }
 }
}

/** One turn's ordered event path to the page (LocalHarnessRuntime.execute). */
interface TurnPipe {events:AgentEventWait;emit:(event:Row)=>Promise<unknown>;say:(text:string)=>Promise<void>;started:()=>boolean}
/** Fox's Agent is the person's own Harness: Worldlet keeps the companion memory and conversations; the World's
 * account connections are read in the Platform, without a model (agent-runtime/index.ts `worldSources`). Background
 * model work (the Attention check, Applet tasks, the day's plan and Fox's quiet-moment asks) runs on the person's
 * Harness too, beside the conversation (owner decision 2026-10-07 18:18 PDT: the conversation and background work
 * both run on the underlying Harness), a chosen Hermes Agent too (owner decision 2026-10-09). Its models and its
 * scheduled jobs are its own (owner decision 2026-10-09: Worldlet customizes nothing below the Harness contract). */
export class LocalHarnessAdapter extends PortableAdapter implements Adapter {
 readonly install:LocalHarnessInstall;
 readonly available=true;
 private readonly environment:HarnessEnvironment;
 private running=new Set<LocalHarnessRuntime>();
 constructor(context:RuntimeContext,install:LocalHarnessInstall,environment:HarnessEnvironment=currentEnvironment()){super(context);this.install=install;this.environment=environment;this.turnApprovals=install.id==='hermes'?new TurnApprovals():null;}
 /** Background work runs on the person's own Harness (owner decision 2026-10-07: the conversation and background
  * work alike), a chosen Hermes Agent too: its own `hermes acp` beside the conversation, on its own model (owner
  * decision 2026-10-09: Worldlet customizes nothing below the Harness contract). */
 background():Adapter|null {return this;}
 /** Mail and Attention checks read accounts in the Platform (the World's connections) and think on this Harness. */
 override get supportsBackgroundChecks(){return this.background()!==null;}
 get id(){return localHarnessAdapterId(this.install.id);}
 hasInteractiveWork(){return this.running.size>0;}
 private readonly spares=new SpareTurns();
 /** Background turns and Applet tasks beside the conversation: no spare process, and not the person's interactive work. */
 private lanes=new Set<LocalHarnessRuntime>();
 /** The Harness's resident conversation (harness-sessions.ts), one for the adapter's life: Hermes Agent's ACP process
  * or OpenClaw's Gateway. Others run a process per turn. */
 private conversation:ResidentConversation|null=null;
 private resident():ResidentConversation|null {
  if(this.conversation||!LOCAL_HARNESS_RESIDENT.includes(this.install.id))return this.conversation;
  const {install,environment}=this,own=(session:string,thread:string)=>this.context.ownSession?.(install.id,session,thread);
  // Hermes Agent: one `hermes acp` process per profile that answers a thread (`-p <profile>` for another one). Its main
  // profile's threads go to its resident API server first (owner decision 2026-10-08: one path to Hermes Agent,
  // hermes-service.ts), when that answers and its profile has Worldlet's World tools (the standing `worldlet` MCP server); why it does not is recorded once.
  if(install.id==='hermes')this.conversation=new AgentConversations(agent=>{
   const acp=new AcpConversation(install.title,{command:install.command,args:[...install.prefix,...agent?['-p',agent]:[]],env:()=>harnessEnvironment(install,environment)},own);
   if(agent)return acp;
   const server=new HermesServerConversation(install.title,()=>hermesServer(discoverHermes(environment.home,environment.env,environment.platform)),own);
   return new FirstAvailable(server,acp,reason=>this.context.failure(new WorldletError(`${install.title} keeps Fox's conversation in hermes acp: ${reason}`),'hermesServer'));
  });
  else if(install.id==='openclaw')this.conversation=new GatewayConversation(install.title,()=>{
   let config:unknown={};
   try{config=parseJSON5(fs.readFileSync(openClawConfigFile(environment),'utf8'));}catch{}
   return openClawGateway(config,environment.env);
  },own);
  if(this.conversation instanceof GatewayConversation)this.conversation.catalog=agent=>{
   try{return openClawModels(parseJSON5(fs.readFileSync(openClawConfigFile(environment),'utf8')),agent);}catch{return [];}
  };
  return this.conversation;
 }
 /** The Harness's own permission prompts (contracts/harness-services.ts `approvals`), when it surfaces them. */
 approvals():HarnessApprovals|null {
  const resident=this.resident()?.approvals??null,turns=this.turnApprovals;
  if(!turns)return resident;
  return {answer:async(id,choice)=>{if(turns.has(id)||!resident)return turns.answer(id,choice);return resident.answer(id,choice);}};
 }
 /** Hermes Agent's prompts on a conversation turn that falls back to a process of its own (its ACP per turn). */
 private readonly turnApprovals:TurnApprovals|null;
 /** A revoked standing rule: a Harness that reads its rules only when it starts gets its resident process started
  * again, now when no turn runs, else when the last one ends. The person's own processes of it are theirs to restart. */
 forgetApprovals(harness:string){
  if(harness!==this.install.id||harnessApprovalFeatures(harness).revoke!=='restart')return;
  if(this.running.size)this.restartWhenIdle=true;else this.conversation?.shutdown();
 }
 private restartWhenIdle=false;
 make():AgentRuntime {return new LocalHarnessRuntime(this.install,this.environment,(runtime,running)=>{
  if(running)this.running.add(runtime);else this.running.delete(runtime);
  if(!running&&!this.running.size&&this.restartWhenIdle){this.restartWhenIdle=false;this.conversation?.shutdown();}
 },this.spares,this.resident(),this.turnApprovals,this.route,{origin:this.context.origin});}
 makeLane():AgentRuntime {return new LocalHarnessRuntime(this.install,this.environment,(runtime,running)=>{if(running)this.lanes.add(runtime);else this.lanes.delete(runtime);},null,null,null,this.laneRoute);}
 /** The provider chosen for this Agent in Settings › Agents (model-providers.ts): its chat-tier model, read per turn. */
 private readonly route=()=>chosenModel(readAgentSetting(this.context.root,PROVIDER_SETTING),this.install.id);
 /** Background lanes: the chosen provider's model, else the chat-tier model of the provider Hermes Agent's own default
  * uses (its config.yaml `model.provider`, read per turn, never written). */
 private readonly laneRoute=()=>{
  let own:string|null=null;
  if(this.install.id==='hermes'){
   const home=discoverHermes(this.environment.home,this.environment.env,this.environment.platform);
   try{const model=home?hermesConfigValues(fs.readFileSync(path.join(home,'config.yaml'),'utf8')).model:null;if(typeof model?.provider==='string')own=model.provider;}catch{}
  }
  return backgroundModel(readAgentSetting(this.context.root,PROVIDER_SETTING),this.install.id,own);
 };
 /** Applet tasks run beside the conversation on the background Agent. */
 get makeTask(){
  const background=this.background();
  if(background===this)return ()=>this.makeLane();
  return background?.makeTask?()=>background.makeTask!():undefined;
 }
 /** Its models are its own: Worldlet chooses or signs in to none (Settings › Agents, a quick browser step). */
 makeModelAccess():AgentRuntime {return new UnsupportedRuntime(`Fox uses ${this.install.title} on this computer. Manage its models and accounts in ${this.install.title}.`);}
 makeSourceAccess():AgentRuntime {return new UnsupportedRuntime(`${this.install.title} does not read connected accounts for Worldlet.`);}
 /** Its scheduled jobs run on its own scheduler (`schedule`); Worldlet runs none of its own for it. */
 makeRoutines():AgentRoutines {return {start(){},stop(){},wake(){}};}
 get harness(){return {id:this.install.id,title:this.install.title};}
 private scheduleService:HarnessSchedule|null|undefined;
 /** The person's jobs run on this Harness's own scheduler; its records are read from its folder (harness-schedule.ts). */
 schedule():HarnessSchedule|null {return this.scheduleService??=HARNESS_SCHEDULES[this.install.id]?.(this.environment.home||undefined,this.environment.env)??null;}
 harnessEvents(){return harnessEvents(this.install.id,this.environment.home,this.environment.env);}
 harnessTools(){return harnessTools(this.install.id,this.environment.home,this.environment.env);}
 /** Its skills, read from its folder and added to its own way (harness-skills.ts). */
 harnessSkills(){return harnessSkills(this.install.id,this.environment,{locate:()=>[this.install]});}
 /** Its calls, placed and hung up through its own command line where its calling is set up. */
 harnessCalls(){return harnessCalls(this.install.id,this.environment.home,this.environment.env,undefined,args=>runSendCommand(this.install,args,{env:harnessEnvironment(this.install,this.environment),timeout:60_000}));}
 /** The models the same Agent can answer a thread with (`models`), as its resident conversation knows them: Hermes
  * Agent's from its last `session/new`, OpenClaw's from openclaw.json. */
 models():HarnessModels|null {
  const resident=harnessService(this.install.id,'models')!==null?this.resident():null;
  return resident?.models?{list:async agent=>resident.models!(isHarnessAgentId(agent)?agent:undefined)}:null;
 }
 private agentsService:HarnessAgents|null|undefined;
 /** The person's own agents or profiles, read from this Harness's folder (harness-agents.ts), when it declares the `agents` service. */
 agents():HarnessAgents|null {return this.agentsService??=HARNESS_AGENTS[this.install.id]?.(this.environment.home||undefined,this.environment.env)??null;}
 async status(_home:string){return new LocalHarnessRuntime(this.install,this.environment).status();}
 home(scope:'private'|'sample'|'setup'){return path.join(this.context.root,'agent',scope,this.id);}
 override resetExplanation(){return `This deletes Worldlet’s companion archive, conversations, saved items and local connections. ${this.install.title} and its own data are kept. Worldlet then starts onboarding again. This cannot be undone.`;}
 async shutdown(){this.spares.clear();this.conversation?.shutdown();for(const runtime of [...this.running,...this.lanes])runtime.cancel();}
 whileStopped<T>(work:()=>Promise<T>):Promise<T> {
  this.spares.clear();this.conversation?.shutdown();
  for(const runtime of [...this.running,...this.lanes])runtime.cancel();
  return work();
 }
}

// The person's choice --------------------------------------------------------------------------

/** The chosen local Harness (Fox setup choice 'local-harness'): only its ID, never a path or credential. */
export function readSelection(root:string):LocalHarnessId|null {
 const value=readAgentSetting(root,'local-harness');
 return value?.version===1&&LOCAL_HARNESSES.some(harness=>harness.id===value.id)?value.id as LocalHarnessId:null;
}
export function writeSelection(root:string,id:LocalHarnessId|null){
 if(id!==null)localHarness(id);
 writeAgentSetting(root,'local-harness',id===null?null:{version:1,id});
}
/** The saved Harness when it is still installed here; otherwise none, and Fox asks for an Agent. */
export function selectedInstall(root:string,environment:HarnessEnvironment=currentEnvironment()):LocalHarnessInstall|null {
 const id=readSelection(root);
 return id?locateLocalHarnesses(environment).find(install=>install.id===id)??null:null;
}
