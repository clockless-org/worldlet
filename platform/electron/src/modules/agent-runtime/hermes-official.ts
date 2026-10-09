import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {HERMES_INSTALLERS,hermesChatGptModel,hermesInstallerResult,hermesInstallerStages,hermesSignInPrompt} from '../../../../../core/agent/index.ts';
import {WorldletError} from '../../files.ts';
import {hermesCommandPath,isOwnHermes,standardHermesHome} from './hermes-files.ts';
import {runHarnessCommand} from './harness-approvals.ts';
import {harnessEnvironment,locateLocalHarnesses,type HarnessEnvironment,type LocalHarnessInstall} from './local-harness.ts';

/** Stock Hermes Agent for a person with no Agent (core/agent/hermes-setup.ts): the official installer, run stage by
 * stage as Hermes' own desktop installer runs it, to Hermes' default location; nothing when a Hermes Agent is here. */
export interface HermesInstallProgress {step:number;steps:number;title:string}
const STAGE_TIMEOUT_MS=20*60_000;
const INSTALLER_LIMIT=2*1024*1024;
const FAILED='Hermes Agent could not be installed. Check your internet connection and try again.';

/** The person's own Hermes Agent here (its command, not the one Worldlet set up for Fox's profile), or null. */
export function ownHermesAgent(environment:HarnessEnvironment):LocalHarnessInstall|null {
 const found=locateLocalHarnesses(environment).find(item=>item.id==='hermes');
 if(!found)return null;
 // Worldlet's own launcher for Fox's profile is not a Hermes Agent of the person's.
 try{if(found.command===hermesCommandPath(environment.home)&&fs.readFileSync(found.command,'utf8').includes('worldlet-hermes-command'))return null;}catch{}
 return found;
}

/** Removes what Worldlet once put at Hermes' standard locations for Fox's own profile (standardHermes): the link at
 * ~/.hermes (a junction on Windows) and its own `hermes` launcher. Only Worldlet's: a real folder or another command stays. */
export function releaseStandardHermes(root:string,environment:HarnessEnvironment){
 const home=standardHermesHome(environment.home,environment.env,environment.platform);
 try{if(fs.lstatSync(home).isSymbolicLink()&&isOwnHermes(root,home))fs.unlinkSync(home);}catch{}
 const command=hermesCommandPath(environment.home);
 try{if(fs.readFileSync(command,'utf8').includes('worldlet-hermes-command'))fs.rmSync(command,{force:true});}catch{}
}

/** Installs stock Hermes Agent the official way when none is here, then returns it. `progress` hears each step. */
export async function installHermes(root:string,{environment,progress,fetch:get=fetch}:{environment:HarnessEnvironment;progress:(step:HermesInstallProgress)=>void;fetch?:typeof fetch}):Promise<LocalHarnessInstall> {
 const existing=ownHermesAgent(environment);
 // A Hermes Agent already here is used as it is (owner decision 2026-10-09 12:11 PDT): nothing is installed.
 if(existing)return existing;
 releaseStandardHermes(root,environment);
 const windows=environment.platform==='win32';
 if(environment.platform==='darwin'&&!await commandLineTools())throw new WorldletError('Hermes Agent needs Apple’s Command Line Tools. Install them in the window macOS opened, then try again.');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-hermes-'));
 try{
  const script=path.join(folder,windows?'install.ps1':'install.sh');
  fs.writeFileSync(script,await download(get,windows?HERMES_INSTALLERS.windows:HERMES_INSTALLERS.posix),{mode:0o600});
  const env=installerEnvironment(environment);
  const run=async(args:string[],stage?:string)=>{
   let output='';
   const [command,prefix]=windows?[path.join(environment.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script]]:['/bin/bash',[script]];
   try{await step(command,[...prefix,...args],env,folder,text=>{output=(output+text).slice(-64_000);});}
   catch(error){
    // A failed stage says why in its result frame; that beats its last lines on stderr.
    const said=stage?hermesInstallerResult(output,stage):null;
    throw said&&!said.ok&&said.reason&&!/^it did not report/.test(said.reason)?new Error(said.reason):error;
   }
   return output;
  };
  const flag=(posix:string,win:string)=>windows?win:posix;
  let stages:{name:string;title:string}[];
  try{stages=hermesInstallerStages(await run([flag('--manifest','-Manifest')]));}
  catch(error){throw new WorldletError(`${FAILED} (${String((error as Error)?.message??error).slice(-300)})`);}
  for(const [index,stage] of stages.entries()){
   progress({step:index+1,steps:stages.length,title:stage.title});
   let output:string;
   try{output=await run([flag('--stage','-Stage'),stage.name,flag('--json','-Json'),flag('--non-interactive','-NonInteractive')],stage.name);}
   catch(error){throw new WorldletError(`${FAILED} (${stage.title}: ${String((error as Error)?.message??error).slice(-300)})`);}
   const result=hermesInstallerResult(output,stage.name);
   if(!result.ok)throw new WorldletError(`${FAILED} (${stage.title}: ${result.reason})`);
  }
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
 const installed=ownHermesAgent(environment);
 if(!installed)throw new WorldletError(FAILED);
 return installed;
}

/** ChatGPT as Hermes Agent's model, set up with Hermes' own commands: its sign-in (`hermes auth add openai-codex`,
 * browser authorization; `open` gets the address it prints, with the code to type when it falls back to its device
 * page), then, as Hermes says to configure it without its wizard, `hermes config set model.provider openai-codex` and
 * `model.default` to a ChatGPT model Hermes lists. Hermes keeps the sign-in; Worldlet never sees the token. */
export async function signInHermes(install:LocalHarnessInstall,environment:HarnessEnvironment,open:(prompt:{url:string;code:string|null})=>void,signal?:AbortSignal):Promise<void> {
 await hermesSignIn(install,environment,open,signal);
 const set=async(key:string,value:string)=>{
  const run=await runHarnessCommand(install,environment,['config','set',key,value],{timeout:60_000});
  if(run.code!==0)throw new WorldletError(`Hermes Agent could not use ChatGPT: ${(run.stderr.trim().split('\n').pop()||'its settings did not change').slice(0,300)}`);
 };
 await set('model.provider','openai-codex');
 const models=await acpModels(install,environment);
 const model=hermesChatGptModel(models.current,models.available);
 if(!model)throw new WorldletError('Hermes Agent lists no ChatGPT model. Choose one with `hermes model` in Terminal, then try again.');
 if(models.current!=='openai-codex:'+model)await set('model.default',model);
}

/** The models a new `hermes acp` session offers (ACP `session/new` `models`) and the current one. */
function acpModels(install:LocalHarnessInstall,environment:HarnessEnvironment):Promise<{current:unknown;available:unknown[]}> {
 return new Promise((resolve,reject)=>{
  const child=spawn(install.command,[...install.prefix,'acp'],{env:harnessEnvironment(install,environment),cwd:environment.home||undefined,stdio:['pipe','pipe','ignore'],windowsHide:true});
  let buffer='',settled=false;
  const finish=(error:Error|null,value?:{current:unknown;available:unknown[]})=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();error?reject(error):resolve(value!);};
  const timer=setTimeout(()=>finish(new WorldletError('Hermes Agent did not answer. Try again.')),90_000);timer.unref();
  const send=(id:number,method:string,params:unknown)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  child.stdout.on('data',chunk=>{
   buffer+=String(chunk);
   let end:number;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    let message:any;try{message=JSON.parse(line);}catch{continue;}
    if(message?.id===1)send(2,'session/new',{cwd:environment.home,mcpServers:[]});
    if(message?.id===2){
     const state=message.result?.models;
     if(!state)return finish(new WorldletError('Hermes Agent did not list its models.'));
     finish(null,{current:state.currentModelId,available:Array.isArray(state.availableModels)?state.availableModels.map((item:any)=>item?.modelId):[]});
    }
   }
  });
  child.stdin.on('error',()=>{});
  child.once('error',error=>finish(new WorldletError(`Hermes Agent did not start: ${error.message}`)));
  child.once('exit',()=>finish(new WorldletError('Hermes Agent stopped before listing its models.')));
  send(1,'initialize',{protocolVersion:1,clientCapabilities:{}});
 });
}

function hermesSignIn(install:LocalHarnessInstall,environment:HarnessEnvironment,open:(prompt:{url:string;code:string|null})=>void,signal?:AbortSignal):Promise<void> {
 return new Promise((resolve,reject)=>{
  const child=spawn(install.command,[...install.prefix,'auth','add','openai-codex','--type','oauth','--browser','--no-browser'],{env:harnessEnvironment(install,environment),stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='',errors='',opened=false;
  const timer=setTimeout(()=>child.kill(),15*60_000);timer.unref();
  const abort=()=>child.kill();
  signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',chunk=>{
   output=(output+String(chunk)).slice(-16_000);
   const prompt=opened?null:hermesSignInPrompt(output);
   // The device page needs its code, which Hermes prints after the address.
   if(prompt&&(prompt.code||!/codex\/device/.test(prompt.url))){opened=true;open(prompt);}
  });
  child.stderr.on('data',chunk=>{errors=(errors+String(chunk)).slice(-4000);});
  child.once('error',error=>{clearTimeout(timer);reject(new WorldletError(`Hermes Agent did not start: ${error.message}`));});
  child.once('exit',code=>{
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
   if(signal?.aborted)return reject(new WorldletError('Sign-in was cancelled.'));
   if(code===0)return resolve();
   const said=(errors.trim().split('\n').filter(Boolean).pop()||'').replace(/^Login failed:\s*/,'').slice(0,300);
   reject(new WorldletError(said?`ChatGPT sign-in did not finish: ${said}`:'ChatGPT sign-in did not finish. Try again.'));
  });
 });
}

/** The installer's environment: the person's own (so it finds git, curl and their proxy), never Worldlet's settings
 * and never a HERMES_HOME, so Hermes lands at its default location. */
function installerEnvironment(environment:HarnessEnvironment):Record<string,string> {
 const env:Record<string,string>={};
 for(const [key,value] of Object.entries(environment.env))if(typeof value==='string'&&!/^(WORLDLET_|HERMES_)/i.test(key)&&!['ELECTRON_RUN_AS_NODE','NODE_OPTIONS'].includes(key.toUpperCase()))env[key]=value;
 if(environment.platform!=='win32'){
  const listed=(env.PATH??'').split(':').filter(Boolean);
  env.PATH=[...new Set([...listed,'/usr/bin','/bin','/usr/sbin','/sbin',path.join(environment.home,'.local','bin')])].join(':');
  env.HOME=environment.home;
 }
 return env;
}
/** macOS: git and the compilers Hermes' installer needs come with the Command Line Tools; without them, macOS's own
 * install window is opened and the person comes back once it is done. */
function commandLineTools():Promise<boolean> {
 return new Promise(resolve=>{
  const child=spawn('/usr/bin/xcode-select',['-p'],{stdio:'ignore'});
  child.once('error',()=>resolve(false));
  child.once('exit',code=>{
   if(code===0)return resolve(true);
   try{spawn('/usr/bin/xcode-select',['--install'],{stdio:'ignore',detached:true}).unref();}catch{}
   resolve(false);
  });
 });
}
async function download(get:typeof fetch,url:string):Promise<Buffer> {
 const response=await get(url,{redirect:'follow',signal:AbortSignal.timeout(60_000)}).catch(()=>null);
 if(!response?.ok)throw new WorldletError(FAILED);
 const data=Buffer.from(await response.arrayBuffer());
 if(!data.length||data.length>INSTALLER_LIMIT)throw new WorldletError(FAILED);
 return data;
}
/** Installer steps still running; quitting Worldlet ends them with their children (git, uv, pip), each step leading
 * its own process group on macOS and Linux. */
const running=new Set<ChildProcess>();
export function endHermesInstall(){for(const child of running)stop(child);running.clear();}
function stop(child:ChildProcess){
 if(process.platform!=='win32'&&child.pid&&child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGTERM');return;}catch{}}
 try{child.kill();}catch{}
}
/** One installer run: its output goes to `output`; a failure says the last lines it wrote to stderr. */
function step(command:string,args:string[],env:Record<string,string>,cwd:string,output:(text:string)=>void):Promise<void> {
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'});
  running.add(child);
  let errors='',late=false;
  const timer=setTimeout(()=>{late=true;stop(child);},STAGE_TIMEOUT_MS);timer.unref();
  child.stdout.on('data',chunk=>output(String(chunk)));
  child.stderr.on('data',chunk=>{errors=(errors+String(chunk)).slice(-8192);});
  child.once('error',error=>{running.delete(child);clearTimeout(timer);reject(error);});
  child.once('close',code=>{
   running.delete(child);clearTimeout(timer);
   if(late)return reject(new WorldletError('Installing Hermes Agent took too long. Try again.'));
   if(code===0)return resolve();
   reject(new Error((errors.trim().split('\n').filter(Boolean).slice(-2).join(' ')||`it stopped with code ${code}`).slice(-300)));
  });
 });
}
