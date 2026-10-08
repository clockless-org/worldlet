import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {core} from '../../core.ts';
import {WorldletError} from '../../files.ts';
import {appendRotated} from '../../host/diagnostics.ts';
import {AgentCancelled,AgentEventWait,LineReader,uptime} from './protocol.ts';
import {end,environment as inherit,windowsSandboxEnv} from '../media/io.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import type {AgentEventHandler,Row} from './types.ts';
import {RESIDENT_IDLE_MS} from './harness-sessions.ts';

/** What a worker needs from the Hermes adapter (paths, model access, environment). */
export interface HermesEnvironment {
 available():boolean;
 python():string;
 hostScript():string;
 bundledFiles():string[];
 development:boolean;
 /** Parent of the scope homes' model configuration (the private profile) for an isolated home. */
 modelHome(home:string):string|null;
 attached(home:string):boolean;
 privateHome(home:string):boolean;
 googleClientFile():string|null;
 codexHome():string;
 /** The host's model source (contracts/model-sources.json): this computer's Codex sign-in. Worldlet pays for no model. */
 modelSource():string;
 analyticsID():string;
 /** This app's release version, '' when unknown. */
 appVersion():string;
}

class Job {
 readonly id:string;readonly body:Row;readonly onEvent?:AgentEventHandler;readonly priority:number;readonly queued=uptime();
 private resolve:((value:Row)=>void)|null;private reject:((error:Error)=>void)|null;
 cancelled=false;settled=false;
 readonly eventWait=new AgentEventWait();
 // A cooperative cancel acknowledgement leaves the resident Python process usable. Other
 // cancellation paths terminate it and need retirement.
 cooperativelyCancelled=false;
 lastInput=uptime();
 controls:Row[]=[];
 acknowledgements=new Map<string,{resolve:(value:boolean)=>void,reject:(error:Error)=>void}>();
 constructor(id:string,body:Row,onEvent:AgentEventHandler|undefined,priority:number,resolve:(value:Row)=>void,reject:(error:Error)=>void){
  this.id=id;this.body=body;this.onEvent=onEvent;this.priority=priority;this.resolve=resolve;this.reject=reject;
 }
 finish(result:{value:Row}|{error:Error}){
  for(const acknowledgement of this.acknowledgements.values())acknowledgement.resolve(false);
  this.acknowledgements.clear();
  const {resolve,reject}=this;this.resolve=this.reject=null;
  if('value' in result)resolve?.(result.value);else reject?.(result.error);
 }
}

/** One resident `host.py --serve` process and its pipes. */
class Connection {
 readonly child:ChildProcess;readonly reader:LineReader;exited=false;
 private readonly exit:Promise<void>;
 private ended:Promise<void>|null=null;
 constructor(child:ChildProcess){
  this.child=child;this.reader=new LineReader(child.stdout);
  this.exit=new Promise(resolve=>{child.once('exit',()=>{this.exited=true;resolve();});child.once('error',()=>{this.exited=true;this.reader.end();resolve();});});
  child.stdin.on('error',()=>{});
 }
 get running(){return !this.exited&&this.child.exitCode===null&&this.child.signalCode===null;}
 write(value:Row){
  if(!this.running||this.child.stdin.destroyed||!this.child.stdin.writable)throw new AgentCancelled();
  this.child.stdin.write(JSON.stringify(value)+'\n');
 }
 terminate(){
  try{this.child.stdin.end();}catch{}
  if(!this.running)return;
  // Windows: the venv launcher's exit leaves its interpreter running with the home's files open,
  // so Reset could not move them (EBUSY).
  if(process.platform==='win32'){this.ended??=end(this.child);return;}
  this.child.kill('SIGTERM');
  setTimeout(()=>{if(this.running)this.child.kill('SIGKILL');},500).unref();
 }
 waitUntilExit(){return this.ended?Promise.all([this.exit,this.ended]).then(()=>{}):this.exit;}
}

const CAPABILITIES={streaming:true,tools:true,cancel:true,steer:true,memory:true,sessions:true,tracing:true};

/** Serialized JSONL transport and priority queue (Mac HermesWorker.swift). No application data or
 * secrets are logged. An in-flight operation completes before another writer starts. */
export class HermesWorker {
 readonly home:string;
 readonly independentLane:boolean;
 /** Fox's Applet tasks: a chat that runs beside the conversation, so it neither makes the
  * conversation wait nor holds back background checks. */
 readonly taskLane:boolean;
 private readonly pool:HermesPool;
 private jobs:Job[]=[];
 private active:Job|null=null;
 private closed=false;
 private connection:Connection|null=null;
 private configurationStamp='';
 private retiring=false;
 /** Earlier turns served by the current process; reset with each launch. */
 private retiredRequests:string[]=[];
 private idleTimer:NodeJS.Timeout|null=null;
 private sentRequest:string|null=null;
 constructor(pool:HermesPool,home:string,independentLane=false,taskLane=false){this.pool=pool;this.home=home;this.independentLane=independentLane||taskLane;this.taskLane=taskLane;}
 private get environment(){return this.pool.environment;}
 get processIdentifier(){return this.connection?.running?this.connection.child.pid:undefined;}
 get started(){return this.connection!==null||this.active!==null||this.jobs.length>0;}
 get hasInteractiveWork(){return (this.active?.priority??0)>0||this.jobs.some(job=>job.priority>0);}
 /** Other work runs or waits here, so a status read would queue behind it. */
 get busy(){return [this.active,...this.jobs].some(job=>job&&!job.cancelled&&job.body.action!=='status');}
 get hasForegroundDemand(){
  return [...(this.active?[this.active]:[]),...this.jobs].some(job=>{
   try{return core('foregroundAgentWork',{action:job.body.action??'',_background:job.body._background??false})===true;}catch{return false;}
  });
 }
 enqueue(id:string,body:Row,onEvent?:AgentEventHandler):Promise<Row> {
  if(this.closed||this.pool.held)return Promise.reject(new AgentCancelled());
  const priority=core('agentWorkPriority',body);
  if(typeof priority!=='number')return Promise.reject(new WorldletError('Invalid Agent priority.'));
  if(this.idleTimer){clearTimeout(this.idleTimer);this.idleTimer=null;}
  return new Promise<Row>((resolve,reject)=>{
   const job=new Job(id,body,onEvent,priority,resolve,reject);this.jobs.push(job);
   // A message sent while Fox's conversation is being summarized waits for it, and says so.
   const stage=this.active?.body.action==='compact'?'compacting':'waiting';
   if(this.active&&job.priority>0)void Promise.resolve().then(async()=>{if(!job.cancelled)try{await job.onEvent?.({type:'status',stage});}catch{}});
   this.pool.drain();
  });
 }
 cancel(id:string){
  const index=this.jobs.findIndex(job=>job.id===id);
  if(index>=0){const [job]=this.jobs.splice(index,1);job.cancelled=true;job.finish({error:new AgentCancelled()});this.pool.drain();return;}
  const job=this.active;
  if(!job||job.id!==id)return;
  job.cancelled=true;job.eventWait.cancel();
  if(job.body.action==='routine_tick'||(job.body.action==='chat'&&['chat','setup'].includes(typeof job.body.mode==='string'?job.body.mode:'chat'))){
   try{this.write({type:'cancel',requestId:id});job.cooperativelyCancelled=true;}catch{this.terminate();}
   // Cooperative stop preserves the session. A stuck provider/tool still has a bounded
   // escape; never replay its possible writes.
   setTimeout(()=>{if(this.active?.id===id&&!job.settled)this.terminate();},12_000).unref();
  }else this.terminate();
 }
 steer(id:string,text:string):Promise<boolean> {
  const job=this.active?.id===id?this.active:this.jobs.find(job=>job.id===id);
  if(!job||job.cancelled||job.settled||job.body.action!=='chat'||!text||Buffer.byteLength(text)>32_000)return Promise.resolve(false);
  return new Promise<boolean>((resolve,reject)=>{
   const controlId=crypto.randomUUID().toUpperCase();
   const body={type:'steer',requestId:id,controlId,text};
   job.acknowledgements.set(controlId,{resolve,reject});
   job.lastInput=uptime();
   if(this.active?.id===id&&this.sentRequest===id){
    try{this.write(body);}catch(error){job.acknowledgements.delete(controlId);reject(error);}
   }else job.controls.push(body);
  });
 }
 shutdown(){
  this.closed=true;
  if(this.idleTimer){clearTimeout(this.idleTimer);this.idleTimer=null;}
  for(const job of this.jobs){job.cancelled=true;job.finish({error:new AgentCancelled()});}
  this.jobs=[];
  if(this.active){this.active.cancelled=true;this.active.eventWait.cancel();}
  const connection=this.connection;
  this.terminate();
  return connection?.waitUntilExit()??Promise.resolve();
 }
 yieldBackground(foregroundPending:boolean){
  const job=this.active;
  if(!job||job.cancelled)return;
  let preempt=false;
  try{preempt=core('preemptAgentWork',{body:{action:job.body.action??'',_background:job.body._background??false},foregroundPending,independentLane:this.independentLane})===true;}catch{}
  if(preempt)this.cancel(job.id);
 }
 pump(){
  if(this.closed||this.retiring||this.active||!this.jobs.length)return;
  const rows=this.jobs.map(job=>({id:job.id,body:{action:job.body.action??'',_background:job.body._background??false}}));
  let selected:unknown;
  try{selected=core('nextAgentWork',{queued:rows,busy:false,foregroundPending:this.pool.hasInteractiveWork,independentLane:this.independentLane});}
  catch(error){const failed=this.jobs;this.jobs=[];for(const job of failed)job.finish({error:error as Error});queueMicrotask(()=>this.pool.drain());return;}
  const index=this.jobs.findIndex(job=>job.id===selected);
  if(index<0)return;
  const [job]=this.jobs.splice(index,1);
  this.active=job;
  void (async()=>{
   const queueMs=Math.round((uptime()-job.queued)*1000);
   try{
    const value=await this.execute(job);
    if(job.cancelled)throw new AgentCancelled();
    value.timings={...(value.timings&&typeof value.timings==='object'?value.timings:{}),queueMs};
    job.finish({value});
   }catch(error){
    // A cooperative cancel returns control to the same backend; retiring here would turn a
    // normal stop into a cold restart for the very next message.
    if(!job.settled&&(!job.cooperativelyCancelled||job.eventWait.interrupted))await this.retire();
    job.finish({error:job.cancelled?new AgentCancelled():error as Error});
   }
   this.active=null;this.pool.drain();this.scheduleIdleRetirement();
  })();
 }
 private scheduleIdleRetirement(){
  // The conversation's worker stays up while the app is open: retiring it after ten idle minutes made most next
  // messages pay a cold session resume (owner 2026-10-08, "a hi is slow", "Hermes 不应该一直在线吗"). Helper lanes
  // (source reads, analysis, Applet tasks) still retire when unused.
  if(this.active||this.jobs.length||this.closed||!this.independentLane)return;
  if(this.idleTimer)clearTimeout(this.idleTimer);
  this.idleTimer=setTimeout(()=>{this.idleTimer=null;if(!this.active&&!this.jobs.length)void this.retire();},RESIDENT_IDLE_MS);
  this.idleTimer.unref();
 }
 private stamp(){
  const modelHome=this.environment.modelHome(this.home)??this.home;
  const profile=[path.join(this.home,'config.yaml'),path.join(this.home,'.env'),path.join(modelHome,'config.yaml'),path.join(modelHome,'.env')];
  return fileStamp(profile)+'|'+this.pool.bundledStamp()+'|source:'+this.environment.modelSource()+'|analytics:'+this.environment.analyticsID();
 }
 private launch(){
  const environment=this.environment;
  if(!environment.available())throw new WorldletError('Fox’s runtime is not ready. Ask Fox to retry setup; your saved data is safe.');
  fs.mkdirSync(this.home,{recursive:true,mode:0o700});
  const home=this.home,attached=environment.attached(home),modelHome=environment.modelHome(home),scope=path.basename(path.dirname(home));
  const windows=process.platform==='win32';
  let env:Record<string,string>;
  if(windows){
   env=windowsSandboxEnv(home,{PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'});
   for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY'])if(process.env[key]?.trim())env[key]=process.env[key];
  }else env=inherit(['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY']);
  if(modelHome)env.WORLDLET_MODEL_HOME=modelHome;
  if(['monitor','applet-analysis'].includes(scope)&&modelHome)env.WORLDLET_SOURCE_HOME=modelHome;
  if(environment.privateHome(home)||attached){const client=environment.googleClientFile();if(client)env.WORLDLET_GOOGLE_CLIENT_FILE=client;}
  if(attached)env.WORLDLET_EXTERNAL_AGENT='1';
  Object.assign(env,{HERMES_HOME:home,PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',HERMES_INTERACTIVE:'0'});
  // Worldlet provides no model: the person's own provider, or else this computer's Codex sign-in, pays for every tier.
  if(!attached){env.WORLDLET_MODEL_SOURCE=environment.modelSource();env.CODEX_HOME=environment.codexHome();}
  const version=environment.appVersion();if(version)env.WORLDLET_APP_VERSION=version;
  // The release and build type, which Hermes's own diagnostics may name; nothing sends them anywhere.
  env.WORLDLET_BUILD=environment.development?'development':'release';
  env.WORLDLET_NATIVE_GOOGLE_AUTH='1';
  // Development builds may rehearse onboarding with a fictional Google account.
  if(environment.development)env.WORLDLET_MOCK_GOOGLE_ALLOWED='1';
  const args=[...(windows?['-X','utf8','-B']:[]),environment.hostScript(),'--serve'];
  const child=spawn(environment.python(),args,{cwd:home,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  if(!child.pid){child.kill();throw new WorldletError('Hermes is unavailable.');}
  // Hermes's own output (its host prints to stderr) is kept beside its logs, for an Order to carry (owner 2026-10-06).
  const output=path.join(home,'logs','host-stderr.log');
  child.stderr?.on('data',(chunk:Buffer)=>appendRotated(output,chunk.toString('utf8')));
  this.connection=new Connection(child);this.retiredRequests=[];this.configurationStamp=this.stamp();
 }
 private terminate(){this.connection?.terminate();}
 private async retire(){
  if(this.retiring)return;
  this.retiring=true;
  try{
   const connection=this.connection;
   this.terminate();
   if(connection)await connection.waitUntilExit();
   if(this.connection===connection){this.connection=null;this.configurationStamp='';}
  }finally{this.retiring=false;this.pool.drain();}
 }
 private write(value:Row){
  if(!this.connection)throw new AgentCancelled();
  this.connection.write(value);
 }
 private async execute(job:Job):Promise<Row> {
  const started=uptime();
  let eventMs=0,firstEventMs:number|null=null;
  if(job.cancelled)throw new AgentCancelled();
  const environment=this.environment;
  let launched=false;
  if(!this.connection?.running||this.configurationStamp!==this.stamp()){
   await this.retire();
   if(job.cancelled)throw new AgentCancelled();
   this.launch();launched=true;
  }
  const launchMs=(uptime()-started)*1000;
  const connection=this.connection;
  if(!connection)throw new WorldletError('Hermes is unavailable.');
  let timedOut=false;
  if(typeof core('agentRequestDeadline',job.body)!=='number')throw new WorldletError('Invalid Agent deadline.');
  job.lastInput=uptime();
  const executionStarted=job.lastInput;
  // Waiting for another process's profile lock (`lock_wait` .. `lock_held`, harness/hermes/host.py) is not this
  // request's work, so its hard limit leaves it out, up to one more full limit.
  const ceiling=Number(core('agentRequestDeadline',job.body))||0;
  let lockWaited=0,lockSince:number|null=null;
  const waitedForLock=()=>Math.min(ceiling,lockWaited+(lockSince===null?0:uptime()-lockSince));
  // A process this request started spends its first seconds importing and preparing Hermes (slow on a first run or
  // under antivirus). Until its first answer, up to LAUNCH_GRACE_SECONDS, that is not the request's silence or work:
  // a 20 s status read must not kill every cold start and start cold again.
  const starting=()=>launched?Math.min(LAUNCH_GRACE_SECONDS,firstEventMs!==null?firstEventMs/1000:uptime()-executionStarted):0;
  let timer:NodeJS.Timeout|null=null;
  const watch=()=>{
   let remaining=0;
   if(launched&&firstEventMs===null&&starting()<LAUNCH_GRACE_SECONDS)job.lastInput=uptime();
   try{remaining=core('agentDeadlineRemaining',{body:job.body,started:executionStarted+waitedForLock()+starting(),lastInput:job.lastInput,now:uptime()});}catch{}
   if(!(remaining>0)){timedOut=true;job.eventWait.cancel(new WorldletError('Hermes timed out. You can try again.'));connection.terminate();return;}
   timer=setTimeout(watch,Math.min(remaining*1000,2_000_000_000));
  };
  watch();
  const body:Row={...job.body};
  delete body._background;delete body._analyticsID;
  body.requestId=job.id;
  const analytics=environment.analyticsID();
  if(!(body.sample??false)&&!this.home.split(path.sep).some(part=>part==='sample'||part==='setup')&&analytics)body._analyticsID=analytics;
  try{
   if(job.cancelled)throw new AgentCancelled();
   let protocolState:Row={requestId:job.id,action:job.body.action??'',capabilities:CAPABILITIES,toolIDs:[],finished:false};
   try{
    connection.write(body);
    this.sentRequest=job.id;
    for(const control of job.controls)connection.write(control);
    job.controls=[];
    const reader=connection.reader;
    while(true){
     if(timedOut)throw new WorldletError('Hermes timed out. You can try again.');
     const line=reader.line();
     if(line){
      let frame:Row;
      try{frame=JSON.parse(line.toString('utf8'));}catch{throw new WorldletError('Invalid Hermes response.');}
      if(!frame||typeof frame!=='object'||Array.isArray(frame))throw new WorldletError('Invalid Hermes response.');
      // Core owns frame acceptance. Late frames from earlier turns of this process are
      // discarded and cannot affect the next turn's tools.
      const delivery=core('harnessReceive',{state:protocolState,frame,hermes:true,retired:this.retiredRequests});
      const kind=delivery?.kind;
      if(typeof kind!=='string'||!delivery.state)throw new WorldletError('Invalid Hermes response.');
      if(kind==='stale')continue;
      protocolState=delivery.state;
      // Only correlated activity renews the shared idle deadline.
      job.lastInput=uptime();
      if(firstEventMs===null)firstEventMs=(uptime()-started)*1000;
      const event:Row=kind==='host'?delivery.frame??{}:delivery.event??{};
      const branch=kind==='event'?event.type:kind;
      if(branch==='steer'){
       const acknowledgement=job.acknowledgements.get(delivery.controlId);
       if(acknowledgement){job.acknowledgements.delete(delivery.controlId);acknowledgement.resolve(delivery.accepted===true);}
      }else if(branch==='result'){
       const value=delivery.value;
       if(!value||typeof value!=='object')throw new WorldletError('Invalid Hermes result.');
       value.timings={...(value.timings&&typeof value.timings==='object'?value.timings:{}),workerMs:Math.round((uptime()-started)*1000),launchMs:Math.round(launchMs),firstWorkerEventMs:Math.round(firstEventMs??0),nativeEventsMs:Math.round(eventMs)};
       job.settled=true;
       if(changesConfiguration(body))await this.retire();
       return value;
      }else if(branch==='error'){
       const error=new WorldletError(typeof delivery.message==='string'?delivery.message:'Hermes could not finish.');
       // The caller records it under its own operation (agentChat, appletCheck, attentionSynthesis…); recording it here
       // too counted every Hermes failure twice in production errors.
       throw error;
      }else if(branch==='tool'){
       const eventStarted=uptime();
       const answer=job.cancelled?{error:'The user stopped this request.'}:(await hostWork(job,()=>job.eventWait.run(()=>job.onEvent?.(event))))??{error:'This tool is unavailable in the current view.'};
       eventMs+=(uptime()-eventStarted)*1000;
       job.lastInput=uptime();
       connection.write({type:'tool_result',requestId:job.id,id:event.id??'',result:answer});
      }else if(event.type==='status'&&(event.stage==='lock_wait'||event.stage==='lock_held')){
       if(event.stage==='lock_wait')lockSince??=uptime();
       else if(lockSince!==null){lockWaited+=uptime()-lockSince;lockSince=null;}
      }else{
       // Hermes may normalize its profile while preparing a turn. Adopt that stamp before
       // inference; edits during inference still invalidate the worker on the next request.
       if(event.type==='status'&&(event.stage==='model'||event.stage==='primed'))this.configurationStamp=this.stamp();
       if(!job.cancelled){const eventStarted=uptime();await hostWork(job,()=>job.eventWait.run(()=>job.onEvent?.(event)));eventMs+=(uptime()-eventStarted)*1000;}
      }
      continue;
     }
     const chunk=await reader.read();
     if(!chunk){
      if(job.cancelled)throw new AgentCancelled();
      throw new WorldletError(timedOut?'Hermes timed out. You can try again.':'Hermes stopped before completing the task. Try again.');
     }
     reader.buffer=reader.buffer.length?Buffer.concat([reader.buffer,chunk]):chunk;
     if(reader.buffer.length>=2_000_000)throw new WorldletError('Hermes response is too large.');
    }
   }finally{
    this.sentRequest=null;
    // Retire this turn's id so its late frames (e.g. a trailing steer_result) are dropped.
    this.retiredRequests=[...this.retiredRequests,job.id].slice(-64);
   }
  }finally{if(timer)clearTimeout(timer);}
 }
}

/** While the host itself works on an event (a World tool waiting on the page or the person), Hermes is waiting
 * for us, not silent: its keep-alives queue unread on stdout. The idle stop must not count that time and kill it;
 * the work is bounded by its own deadline (the page call in fox/index.ts). */
async function hostWork<T>(job:{lastInput:number},work:()=>Promise<T>):Promise<T> {
 const hold=setInterval(()=>{job.lastInput=uptime();},1000);
 try{return await work();}finally{clearInterval(hold);job.lastInput=uptime();}
}
/** How long a freshly started Hermes may take to answer its first request before the request's limits apply. */
const LAUNCH_GRACE_SECONDS=120;
function changesConfiguration(body:Row){
 const {action,operation}=body;
 return ['configure','modelLogin','modelRepair'].includes(action)||(action==='mcp'&&['configure','login','remove'].includes(operation))||(action==='google'&&['client','connect','disconnect'].includes(operation));
}
function fileStamp(files:string[]){
 return files.map(file=>{try{const info=fs.statSync(file);return `${info.mtimeMs/1000}:${info.size}:${info.ino}`;}catch{return '0:0:0';}}).join('|');
}

/** Resident processes isolated by profile and execution lane. */
export class HermesPool {
 readonly environment:HermesEnvironment;
 private workers=new Map<string,HermesWorker>();
 private bundled:string|null=null;
 private holds=0;
 constructor(environment:HermesEnvironment){this.environment=environment;}
 /** No new work starts while held, so no process has the homes' files open. */
 get held(){return this.holds>0;}
 worker(home:string,{modelLane,sourceLane=false,readKey,routineLane=false,taskLane=false}:{modelLane?:string|null,sourceLane?:boolean,readKey?:string|null,routineLane?:boolean,taskLane?:boolean}={}){
  const key=path.resolve(home)+(taskLane?'#tasks':modelLane?'#model:'+modelLane:readKey?'#read:'+readKey:routineLane?'#routines':sourceLane?'#sources':'#agent');
  let worker=this.workers.get(key);
  if(!worker){worker=new HermesWorker(this,home,!!readKey||!!modelLane||routineLane,taskLane);this.workers.set(key,worker);}
  return worker;
 }
 /** The person's own conversation; Applet tasks run beside it and do not count. */
 get hasInteractiveWork(){return [...this.workers.values()].some(worker=>!worker.taskLane&&worker.hasInteractiveWork);}
 drain(){
  const workers=[...this.workers.values()];
  const foreground=workers.some(worker=>!worker.taskLane&&worker.hasForegroundDemand);
  for(const worker of workers)worker.yieldBackground(foreground);
  for(const worker of workers)worker.pump();
 }
 bundledStamp(){
  if(this.environment.development)return fileStamp(this.environment.bundledFiles());
  return this.bundled??=fileStamp(this.environment.bundledFiles());
 }
 warm(home:string,prepare:()=>Promise<void>,prime?:Row){
  if(!this.environment.available()){
   void prepare().then(()=>{if(this.environment.available())this.warm(home,prepare,prime);},()=>{});
   return;
  }
  const worker=this.worker(home);
  // One import-only warmup; foreground requests can overtake it in the queue. A primed warmup also resumes the
  // conversation's session (about 1.7 s, every first message after an idle stretch) while the person types; a resident
  // session makes it a no-op, and a busy worker already has the conversation's process up.
  if(prime?worker.busy:worker.started)return;
  worker.enqueue(crypto.randomUUID().toUpperCase(),{action:'warmup',...prime?{prime}:{},_background:true}).catch(()=>{});
 }
 async shutdown(){
  const workers=[...this.workers.values()];this.workers.clear();
  await Promise.race([Promise.allSettled(workers.map(worker=>worker.shutdown())),sleep(1500)]);
 }
 /** Shuts down, then runs `work` with no worker started: Reset moves the homes, which a request
  * arriving meanwhile (the page polls the model status) would otherwise reopen. */
 async whileStopped<T>(work:()=>Promise<T>):Promise<T> {
  this.holds++;
  try{await this.shutdown();return await work();}
  finally{this.holds--;}
 }
}
