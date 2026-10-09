import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {core} from '../../core.ts';
import {WorldletError} from '../../files.ts';
import {ExecutionJournal} from './journal.ts';
import {windowsSandboxEnv} from '../media/io.ts';
import {AgentCancelled,AgentEventWait,LineReader,UnsupportedRuntime,executable,stopChild,uptime} from './protocol.ts';
import {encodeArchive} from './hermes-files.ts';
import type {Adapter,AgentEventHandler,AgentRoutines,AgentRuntime,AgentSourceConnections,Row,RuntimeContext} from './types.ts';
import {setTimeout as sleep} from 'node:timers/promises';

/** Explicit developer-selected executable (WORLDLET_AGENT_CONFIG), never a shell command or page input. */
export interface ExternalAgentConfiguration {protocolVersion:number;id:string;executable:string;arguments:string[]}
export function loadAgentConfiguration(file:string):ExternalAgentConfiguration {
 if(!path.isAbsolute(file))throw new WorldletError('Agent configuration needs an absolute path.');
 const data=fs.readFileSync(file);
 if(data.length>64000)throw new WorldletError('Agent configuration is too large.');
 const config=JSON.parse(data.toString('utf8'));
 if(config?.protocolVersion!==1||typeof config.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(config.id)||config.id==='hermes'
  ||typeof config.executable!=='string'||!path.isAbsolute(config.executable)||!executable(config.executable)||(process.platform==='win32'&&!config.executable.toLowerCase().endsWith('.exe'))
  ||!Array.isArray(config.arguments)||config.arguments.length>32||!config.arguments.every((arg:unknown)=>typeof arg==='string'&&Buffer.byteLength(arg)<=4096))
  throw new WorldletError('Unsupported Agent configuration. Expected protocol v1 and an executable absolute path.');
 return {protocolVersion:1,id:config.id,executable:config.executable,arguments:[...config.arguments]};
}

const UNSUPPORTED_CONNECTIONS='The selected Agent does not provide account connections. Configure sources in that Agent or select an adapter with connection support.';
class UnsupportedSourceConnections implements AgentSourceConnections {
 providers(){return [];}
 cancel(){}
 async connect():Promise<void> {throw new WorldletError(UNSUPPORTED_CONNECTIONS);}
 async disconnect():Promise<string[]> {throw new WorldletError(UNSUPPORTED_CONNECTIONS);}
 async clientReady():Promise<boolean> {throw new WorldletError(UNSUPPORTED_CONNECTIONS);}
 async configureClient():Promise<void> {throw new WorldletError(UNSUPPORTED_CONNECTIONS);}
}
const NO_ROUTINES:AgentRoutines={start(){},stop(){},wake(){}};

/** Mac AgentAdapter defaults: portable Worldlet memory, no profile attachment, no runtime backups. */
export abstract class PortableAdapter {
 abstract readonly id:string;
 readonly memoryAuthority:string='worldlet';
 get supportsBackgroundChecks():boolean {return false;}
 readonly context:RuntimeContext;
 constructor(context:RuntimeContext){this.context=context;}
 makeSourceConnections():AgentSourceConnections {return new UnsupportedSourceConnections();}
 /** Refresh only portable durable memory, never runtime transcripts or credentials. */
 checkpointCompanion(archive:Row){return archive;}
 captureCompanion(archive:Row){
  if(!['worldlet','hermes'].includes(archive.memoryAuthority))throw new WorldletError('Export this companion with its original Agent selected, then import the archive into the new Agent. Its live memory has not been migrated yet.');
  const portable={...archive,memoryAuthority:'worldlet'};
  encodeArchive(portable);return portable;
 }
 installCompanion(archive:Row,_current:Row,_imported:boolean,install:(archive:Row,recovery:Row|null)=>string|null){return install({...archive,memoryAuthority:'worldlet'},null);}
 allowsBackupPath(_relative:string){return false;}
 validateBackupEntry(_relative:string,_data:Buffer):void {throw new WorldletError('This Agent does not support runtime backup entries.');}
 diagnosticFiles(_home:string):[string,string][] {return [];}
 profile(_discover:boolean):Row {return {supported:false,found:false,bound:false};}
 bindProfile(_path:string):Row {throw new WorldletError('This adapter does not support attaching an existing profile.');}
 resetRetainedPaths(){return new Set(['agent']);}
 resetExplanation(){return 'This deletes Worldlet’s companion archive, conversations, saved items and local connections. The selected Agent’s runtime data is kept; manage that data in the Agent itself. Worldlet then starts onboarding again. This cannot be undone.';}
 warm(_home:string){}
}

/** One process per turn: {hello} → Core handshake → {request} → events → result. */
export class ExternalAgentRuntime implements AgentRuntime {
 readonly config:ExternalAgentConfiguration;
 private child:ChildProcess|null=null;
 private cancelled=false;
 private eventWait:AgentEventWait|null=null;
 private readonly onActivity:(runtime:ExternalAgentRuntime,running:boolean)=>void;
 constructor(config:ExternalAgentConfiguration,onActivity:(runtime:ExternalAgentRuntime,running:boolean)=>void=()=>{}){this.config=config;this.onActivity=onActivity;}
 get isRunning(){return this.child!==null;}
 cancel(){this.cancelled=true;this.eventWait?.cancel();if(this.child)stopChild(this.child);}
 async steer(){return false;}
 run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  return ExecutionJournal.run(body,home,onEvent,observed=>this.execute(body,home,observed));
 }
 private async execute(body:Row,home:string,onEvent:AgentEventHandler):Promise<Row> {
  if(this.child)throw new WorldletError('This Agent is already working.');
  this.cancelled=false;
  const events=new AgentEventWait();this.eventWait=events;
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  // Do not inherit model credentials, shell hooks or Hermes configuration.
  let env:Record<string,string>;
  if(process.platform==='win32')env=windowsSandboxEnv(home,{WORLDLET_AGENT_HOME:home,PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8'});
  else env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:home,TMPDIR:os.tmpdir(),LANG:'en_US.UTF-8',PYTHONUNBUFFERED:'1',WORLDLET_AGENT_HOME:home};
  const child=spawn(this.config.executable,this.config.arguments,{cwd:home,env,stdio:['pipe','pipe','ignore'],windowsHide:true});
  if(!child.pid){child.kill();events.cancel();this.eventWait=null;throw new WorldletError('The Agent could not start.');}
  child.stdin.on('error',()=>{});
  this.child=child;this.onActivity(this,true);
  const reader=new LineReader(child.stdout);
  child.once('error',()=>reader.end());
  let timeout:ReturnType<typeof idleStop>|null=null;
  try{
   let timedOut=false;
   timeout=idleStop(body,()=>{timedOut=true;events.cancel(new WorldletError('Agent timed out. Try again.'));stopChild(child);});
   const send=(value:Row)=>{
    const data=JSON.stringify(value);
    if(Buffer.byteLength(data)>2_000_000)throw new WorldletError('Agent request is too large.');
    if(child.stdin.destroyed)throw new AgentCancelled();
    child.stdin.write(data+'\n');
   };
   const stopped=()=>{if(this.cancelled)throw new AgentCancelled();if(timedOut)throw new WorldletError('Agent timed out. Try again.');};
   send({type:'hello',protocolVersion:1});
   let handshake=false,received=0,protocolState:Row={};
   while(true){
    stopped();
    const chunk=await reader.read();
    if(!chunk){stopped();throw new WorldletError('Agent exited before completing its response.');}
    stopped();
    timeout.touch();
    reader.buffer=reader.buffer.length?Buffer.concat([reader.buffer,chunk]):chunk;received+=chunk.length;
    if(reader.buffer.length>2_000_000||received>16_000_000)throw new WorldletError('Agent output exceeded protocol limits.');
    let line:Buffer|null;
    while((line=reader.line())!==null){
     stopped();
     let event:Row;
     try{event=JSON.parse(line.toString('utf8'));}catch{throw new WorldletError('Invalid Agent JSON event.');}
     if(!event||typeof event!=='object'||Array.isArray(event))throw new WorldletError('Invalid Agent JSON event.');
     if(!handshake){
      const hello=core('harnessHandshake',{hello:event,expectedId:this.config.id,action:body.action??''});
      if(!hello?.capabilities)throw new WorldletError('Invalid Harness handshake.');
      protocolState={requestId:'turn',action:body.action??'',capabilities:hello.capabilities,toolIDs:[],finished:false};
      handshake=true;send({type:'request',id:'turn',body});continue;
     }
     const delivery=core('harnessReceive',{state:protocolState,frame:event});
     if(!delivery?.state)throw new WorldletError('Invalid Harness delivery.');
     protocolState=delivery.state;
     if(delivery.kind==='result')return delivery.value??{};
     if(delivery.kind==='error')throw new WorldletError(typeof delivery.message==='string'?delivery.message:'Agent failed.');
     const normalized=delivery.event;
     if(!normalized||typeof normalized!=='object')throw new WorldletError('Invalid Harness event.');
     if(normalized.type==='tool'){
      const answer=(await timeout.hold(events.run(()=>onEvent(normalized))))??{error:'World tool is unavailable.'};
      stopped();
      send({type:'tool_result',requestId:'turn',id:normalized.id,result:answer});
     }else await timeout.hold(events.run(()=>onEvent(normalized)));
    }
   }
  }finally{
   timeout?.stop();
   events.cancel();this.eventWait=null;
   stopChild(child);try{child.stdin.end();}catch{}child.stdout.destroy();
   this.child=null;this.onActivity(this,false);
  }
 }
}

/** The Agent's deadline as an idle stop (core `agentDeadlineRemaining`), as for Hermes: its output and the World's
 * own work for it (`hold`) renew it, so a long turn that keeps working is not cut off at a fixed time and then redone
 * from scratch on the next message. Background work keeps its hard limit. */
export function idleStop(body:Row,expire:()=>void){
 const seconds=core('agentRequestDeadline',body);
 if(typeof seconds!=='number')throw new WorldletError('Invalid Agent deadline.');
 const started=uptime();let last=started,busy=0,timer:NodeJS.Timeout|null=null;
 const watch=()=>{
  if(busy)last=uptime();
  let remaining=0;
  try{remaining=core('agentDeadlineRemaining',{body,started,lastInput:last,now:uptime()});}catch{}
  if(!(remaining>0)){expire();return;}
  timer=setTimeout(watch,Math.min(remaining*1000,2_000_000_000));
 };
 watch();
 return {
  touch(){last=uptime();},
  async hold<T>(work:Promise<T>):Promise<T>{busy++;try{return await work;}finally{busy--;last=uptime();}},
  stop(){if(timer)clearTimeout(timer);}
 };
}

/** Worldlet owns the clock and consent; the Harness owns jobs and execution. */
class ExternalAgentRoutines implements AgentRoutines {
 private readonly runtime:ExternalAgentRuntime;
 private readonly home:()=>string;
 private loop:{stopped:boolean,woken:boolean}|null=null;
 constructor(runtime:ExternalAgentRuntime,home:()=>string){this.runtime=runtime;this.home=home;}
 start(isAllowed:()=>boolean,onResult:(result:Row)=>void){
  if(this.loop)return;
  const loop={stopped:false,woken:false};this.loop=loop;
  void (async()=>{
   while(!loop.stopped){
    if(isAllowed()){
     try{
      const status=await this.runtime.run({action:'status'},this.home());
      if(isAllowed()&&!loop.stopped&&status?.capabilities?.routines===true){
       const result=await this.runtime.run({action:'routine_tick',_background:true},this.home());
       if(isAllowed()&&!loop.stopped)onResult(result);
      }
     }catch(error){
      if(error instanceof AgentCancelled)return;
      if(isAllowed()&&!loop.stopped)onResult({error:'A scheduled task could not finish. Ask Fox to check your routines.'});
     }
    }
    for(let waited=0;waited<60&&!loop.stopped&&!loop.woken;waited++)await sleep(1000);
    loop.woken=false;
   }
  })();
 }
 wake(){if(this.loop)this.loop.woken=true;}
 stop(){if(this.loop)this.loop.stopped=true;this.loop=null;this.runtime.cancel();}
}

export class ExternalAgentAdapter extends PortableAdapter implements Adapter {
 readonly config:ExternalAgentConfiguration;
 readonly available=true;
 private running=new Set<ExternalAgentRuntime>();
 constructor(context:RuntimeContext,config:ExternalAgentConfiguration){super(context);this.config=config;}
 get id(){return this.config.id;}
 hasInteractiveWork(){return this.running.size>0;}
 make():AgentRuntime {return new ExternalAgentRuntime(this.config,(runtime,running)=>{if(running)this.running.add(runtime);else this.running.delete(runtime);});}
 makeModelAccess(){return this.make();}
 makeSourceAccess():AgentRuntime {return new UnsupportedRuntime('This adapter does not provide connected-source services.');}
 makeRoutines():AgentRoutines {return new ExternalAgentRoutines(new ExternalAgentRuntime(this.config),()=>this.home('private'));}
 status(home:string){return this.make().run({action:'status'},home);}
 home(scope:'private'|'sample'|'setup'){return path.join(this.context.root,'agent',scope,this.id);}
 async shutdown(){for(const runtime of this.running)runtime.cancel();}
}

/** A configuration error keeps the app usable and reports the failure on every Agent call. */
export class UnavailableAgentAdapter extends PortableAdapter implements Adapter {
 readonly id='external';
 readonly available=false;
 readonly failure:Error;
 constructor(context:RuntimeContext,failure:Error){super(context);this.failure=failure;}
 hasInteractiveWork(){return false;}
 make():AgentRuntime {return new UnsupportedRuntime(this.failure);}
 makeModelAccess(){return this.make();}
 makeSourceAccess(){return this.make();}
 makeRoutines(){return NO_ROUTINES;}
 async status(_home:string):Promise<Row> {throw this.failure;}
 home(_scope:'private'|'sample'|'setup'){return path.join(this.context.root,'agent/unavailable');}
 async shutdown(){}
}

/** No Agent chosen yet (owner decisions 2026-10-09: Worldlet customizes nothing below the Harness contract, so there is
 * no built-in Hermes; someone without an Agent gets stock Hermes Agent at setup). Fox waits for one: every Agent call
 * says so, and the World asks for an Agent once (index.ts `foxNeedsAgent`). */
export const NO_AGENT_ID='none';
export const NO_AGENT='Fox needs an Agent. Choose one in Settings › Model.';
export class NoAgentAdapter extends PortableAdapter implements Adapter {
 readonly id=NO_AGENT_ID;
 readonly available=false;
 hasInteractiveWork(){return false;}
 make():AgentRuntime {return new UnsupportedRuntime(NO_AGENT);}
 makeModelAccess(){return this.make();}
 makeSourceAccess(){return this.make();}
 makeRoutines(){return NO_ROUTINES;}
 async status(_home:string):Promise<Row> {return {ready:false,name:'No Agent',provider:NO_AGENT_ID,error:NO_AGENT,capabilities:{streaming:false,tools:false,cancel:false,steer:false,memory:false,sessions:false,routines:false}};}
 home(scope:'private'|'sample'|'setup'){return path.join(this.context.root,'agent',scope,this.id);}
 async shutdown(){}
}
export {NO_ROUTINES};
