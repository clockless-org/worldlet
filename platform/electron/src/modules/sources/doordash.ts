import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorldletError,ensureDirectory,writeAtomic} from '../../files.ts';
import {DOORDASH_CLI_VERSION,doordashArgs,doordashOutcome,type DoordashRun} from '../../../../../core/accounts/index.ts';
import type {AgentEventHandler,AgentRuntime} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
import {validateWorldTool} from './google-source.ts';

export interface DoorDashOptions {
 /** The World's DoorDash folder: whether the person connected it in its Applet. */
 folder:string;
 /** Fox's earlier Agent profiles, where a connection made before was marked (doordash_cli.py `marker`). */
 legacyHomes:()=>string[];
 /** The person's home folder, where `npm run setup:doordash` puts the CLI. */
 home?:string;
 /** Runs the CLI (tests replace it). */
 run?:(command:string,args:string[],timeoutSeconds:number)=>Promise<DoordashRun>;
}

/** DoorDash through its official CLI, run by the Platform with no Harness and no model (was Hermes doordash_cli.py):
 * the Applet's status, sign-in and disconnect, and Fox's `use_doordash`. Sign-in is DoorDash's own browser flow and
 * its credentials stay in its own store; one CLI run at a time. */
export class DoorDash {
 private readonly options:DoorDashOptions;
 private queue:Promise<unknown>=Promise.resolve();
 constructor(options:DoorDashOptions){this.options=options;}
 binary(){return path.join(this.options.home??os.homedir(),'.local','share','worldlet','dd-cli',DOORDASH_CLI_VERSION,`dd-cli-v${DOORDASH_CLI_VERSION}-darwin-arm64`);}
 private installed(){try{fs.accessSync(this.binary(),fs.constants.X_OK);return fs.statSync(this.binary()).isFile();}catch{return false;}}
 private marker(){return path.join(this.options.folder,'enabled.json');}
 /** Connected in its Applet: the World's mark, or one made earlier in Fox's Agent profile (adopted). */
 enabled(){
  if(fs.existsSync(this.marker()))return true;
  if(!this.options.legacyHomes().some(home=>fs.existsSync(path.join(home,'doordash_enabled.json'))))return false;
  this.mark();return true;
 }
 private mark(){ensureDirectory(this.options.folder);writeAtomic(this.marker(),'{"enabled":true}\n',0o600);}
 private forget(){
  fs.rmSync(this.marker(),{force:true});
  for(const home of this.options.legacyHomes())fs.rmSync(path.join(home,'doordash_enabled.json'),{force:true});
 }
 private exclusive<T>(work:()=>Promise<T>):Promise<T> {const next=this.queue.then(work,work);this.queue=next.catch(()=>{});return next;}
 private cli(args:string[],timeoutSeconds:number){return (this.options.run??runCli)(this.binary(),args,timeoutSeconds);}
 /** The Applet's operations (doordash_cli.py `run`): status, login, disconnect. */
 async request(operation:string):Promise<Row> {
  const installed=this.installed();
  if(operation==='status')return {ok:true,installed,enabled:this.enabled(),version:installed?DOORDASH_CLI_VERSION:null,accountVerified:false};
  if(operation==='disconnect'){this.forget();return {ok:true};}
  if(operation!=='login')throw new WorldletError('Unsupported source operation.');
  if(!installed)return {ok:false,error:'Install the official DoorDash CLI with npm run setup:doordash, then sign in here.'};
  return this.exclusive(async()=>{
   const login=await this.cli(['login'],180);
   if(login.timedOut)return {ok:false,error:'DoorDash sign-in timed out. Finish in the browser and try again.'};
   if(login.exitCode)return {ok:false,error:'DoorDash sign-in did not finish. Check the browser and early-access approval.'};
   const verified=doordashOutcome('cart_list',await this.cli(doordashArgs('cart_list',{}),60));
   if(verified.ok!==true)return verified;
   this.mark();
   return {ok:true,enabled:true,accountVerified:true};
  });
 }
 /** Fox's `use_doordash`: the turn admits it first (its cart writes are guarded), then one bounded CLI run. */
 async tool(args:Row,onEvent:AgentEventHandler|undefined):Promise<Row> {
  validateWorldTool('use_doordash',args);
  const operation=typeof args.operation==='string'?args.operation:'status';
  const reply=await onEvent?.({type:'tool',id:'world-'+crypto.randomUUID(),name:'_world_authorize',args:{name:'use_doordash',operation}});
  const permission=reply&&typeof reply==='object'?reply as Row:{error:'World service permission required.'};
  if(permission.error||!permission.ok)throw new WorldletError(String(permission.error||'World service permission required.'));
  if(!this.enabled())return {error:'Connect DoorDash in its Applet first.'};
  if(!this.installed())return {ok:false,error:'Install the official DoorDash CLI with npm run setup:doordash, then sign in here.'};
  let cliArgs:string[];
  try{cliArgs=doordashArgs(operation,args.parameters??{});}catch(error){throw new WorldletError((error as Error).message);}
  return this.exclusive(async()=>{
   try{return doordashOutcome(operation,await this.cli(cliArgs,60));}
   catch(error){throw new WorldletError((error as Error).message);}
  });
 }
}

/** One CLI run: no stdin, its own environment minus DoorDash's (DD_*), stdout kept (bounded), stderr never shown. */
function runCli(command:string,args:string[],timeoutSeconds:number):Promise<DoordashRun> {
 return new Promise(resolve=>{
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('DD_')));
  const child=spawn(command,args,{stdio:['ignore','pipe','ignore'],env,windowsHide:true});
  let stdout='',timedOut=false,size=0;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutSeconds*1000);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{size+=chunk.length;if(size<=1_000_001)stdout+=chunk;});
  child.on('error',()=>{clearTimeout(timer);resolve({timedOut:false,exitCode:127,stdout:''});});
  child.on('close',code=>{clearTimeout(timer);resolve({timedOut,exitCode:timedOut?null:code??1,stdout});});
 });
}

/** DoorDash's Applet requests and `use_doordash` run here; every other source request goes to `fallback`. */
export class DoorDashSourceAccess implements AgentRuntime {
 private readonly doordash:DoorDash;
 private readonly fallback:()=>AgentRuntime;
 private delegate:AgentRuntime|null=null;
 constructor(doordash:DoorDash,fallback:()=>AgentRuntime){this.doordash=doordash;this.fallback=fallback;}
 private other(){return this.delegate??=this.fallback();}
 cancel(){this.delegate?.cancel();}
 async steer(){return false;}
 async run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  if(body.action==='sourceTool'&&body.name==='use_doordash')return this.doordash.tool(body.args&&typeof body.args==='object'?body.args as Row:{},onEvent);
  if(body.action==='sourceRequest'&&body.provider==='doordash')return this.doordash.request(String(body.operation??''));
  return this.other().run(body,home,onEvent);
 }
}
