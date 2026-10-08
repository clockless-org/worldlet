import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {core} from '../../core.ts';
import {WorldletError} from '../../files.ts';
import {bundledResource} from '../../resources.ts';
import {ExecutionJournal} from './journal.ts';
import {AgentCancelled,agentEvent,executable,exists,isCancellation} from './protocol.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import {HermesInstallation,venvPython} from './installation.ts';
import {HermesPool,type HermesEnvironment,type HermesWorker} from './hermes-worker.ts';
import {ModelAccess} from './model-access.ts';
import {attachedHermes,bindHermes,checkpointHermesMemory,discoverOtherHermes,encodeArchive,hermesIdentity,isAttachedHermes,isOwnHermes,readHermesConversations,replaceHermesMemory,standardHermesHome} from './hermes-files.ts';
import {LocalHarnessRuntime,TurnApprovals,currentEnvironment,type LocalHarnessInstall} from './local-harness.ts';
import {HermesServerConversation} from './harness-sessions.ts';
import {ServerFirstRuntime,hermesServer} from './hermes-service.ts';
import {curatedConnection,GOOGLE_SIGN_IN,GOOGLE_SIGN_IN_SERVICES,SOURCE_PROVIDERS} from '../../../../../core/applets/index.ts';
import {routinesDueAfterGap,type RoutineSlot} from '../../../../../core/scheduling/index.ts';
import type {Adapter,AgentEventHandler,AgentRoutines,AgentRuntime,AgentSourceConnections,Row,RuntimeContext} from './types.ts';

/** The app release (`build-info.json` beside the bundled UI), named to the Harness process. */
function appVersion(webRoot:string){
 try{const value=JSON.parse(fs.readFileSync(path.join(webRoot,'build-info.json'),'utf8')).version;return typeof value==='string'?value:'';}catch{return '';}
}
const GOOGLE=['gmail','google-calendar','google-drive'];
const ISOLATED=['sample','setup','derivation','monitor','applet-analysis'];
export const SOURCE_ENDPOINTS:Record<string,string>={notion:'https://mcp.notion.com/mcp',github:'https://api.githubcopilot.com/mcp/',linear:'https://mcp.linear.app/mcp',paypal:'https://mcp.paypal.com/http',todoist:'https://ai.todoist.net/mcp',supabase:'https://mcp.supabase.com/mcp?read_only=true&features=account'};

/** The official Hermes composition (Mac HermesAdapter, HermesRuntime, HermesProfiles,
 * HermesCompanionTransfer). Parallel status reads share one worker request. */
export class HermesAdapter implements Adapter {
 readonly id='hermes';
 readonly memoryAuthority='hermes';
 readonly supportsBackgroundChecks=true;
 readonly context:RuntimeContext;
 readonly installation:HermesInstallation;
 readonly modelAccess:ModelAccess;
 readonly pool:HermesPool;
 private reads=new Map<string,Promise<Row>>();
 // The last status each home answered. A long turn or a 16-minute sign-in on that worker must not hold Settings,
 // the Energy page and Fox's preferences waiting for a read whose answer only a model change alters.
 private lastStatus=new Map<string,Row>();
 forgetStatus(){this.lastStatus.clear();}
 constructor(context:RuntimeContext){
  this.context=context;
  this.installation=new HermesInstallation(context);
  this.modelAccess=new ModelAccess();
  const adapter=this,profile=context.profile,webRoot=profile.webRoot;
  let version:string|undefined;
  const environment:HermesEnvironment={
   available:()=>adapter.available,
   python:()=>adapter.python,
   hostScript:()=>path.join(webRoot,'hermes/host.py'),
   bundledFiles:()=>['world_service.py','world_gateway.py','world_contract.py','services.json','host.py','desktop.py','turn_metrics.py','world_context.py','context_history.py','routines.py','persona.py','tools.json'].map(name=>path.join(webRoot,'hermes',name)),
   development:context.development,
   modelHome:home=>ISOLATED.includes(path.basename(path.dirname(home)))?adapter.privateHome(path.resolve(home,'../../..')):null,
   attached:home=>isAttachedHermes(home),
   privateHome:home=>path.basename(path.dirname(home))==='private',
   googleClientFile:()=>bundledResource(profile,'googleClient'),
   codexHome:()=>adapter.modelAccess.codexHome,
   modelSource:()=>adapter.modelAccess.source,
   analyticsID:()=>context.analyticsID(),
   appVersion:()=>version??=appVersion(webRoot)
  };
  this.pool=new HermesPool(environment);
 }
 /** Release builds run only the prepared installation. */
 get python(){
  if(this.context.development){
   if(process.env.WORLDLET_HERMES_PYTHON)return process.env.WORLDLET_HERMES_PYTHON;
   return venvPython(path.join(this.context.profile.resources,'.local/hermes-source/.venv'));
  }
  return this.installation.python;
 }
 get available(){return this.context.development?executable(this.python):this.installation.ready;}
 async prepare(){if(!this.available)await this.installation.prepare();}
 hasInteractiveWork(){return this.pool.hasInteractiveWork||this.serverTurns.size>0;}
 /** The standard Hermes Agent (Fox's own profile, linked at the standard location by standardHermes) as the person's
  * own Hermes Agent is reached: its `hermes` command line on this runtime. */
 get standardInstall():LocalHarnessInstall {return {id:'hermes',title:'Hermes Agent',command:this.python,prefix:[path.join(this.context.profile.webRoot,'hermes','hermes_command.py')],configured:true};}
 /** Its resident API server (hermes-service.ts), while Fox's own profile is the standard Hermes Agent; else null. */
 private server:HermesServerConversation|null=null;
 private readonly serverTurns=new Set<LocalHarnessRuntime>();
 /** A World write Hermes asks for on its registered `worldlet` server during one of those turns waits for the person
  * on the approval card (LocalHarnessRuntime confirmWrite), answered here. */
 private readonly serverApprovals=new TurnApprovals();
 approvals(){return this.serverApprovals;}
 private standardServer():HermesServerConversation|null {
  if(attachedHermes(this.context.root)||!isOwnHermes(this.context.root,standardHermesHome()))return null;
  return this.server??=new HermesServerConversation('Hermes Agent',()=>hermesServer(this.privateHome()),(session,thread)=>this.context.ownSession?.('hermes',session,thread));
 }
 privateHome(root=this.context.root){return attachedHermes(root)??path.join(root,'agent/private/hermes');}
 home(scope:'private'|'sample'|'setup'){return scope==='private'?this.privateHome():path.join(this.context.root,'agent',scope,'hermes');}
 /** Fox's conversation on the standard Hermes Agent goes the way a person's own goes (owner decision 2026-10-08: one
  * path) while its resident API server answers; otherwise the built-in runtime as before (ServerFirstRuntime). */
 make():AgentRuntime {
  const server=this.standardServer();
  if(!server)return new HermesRuntime(this);
  const turns=new LocalHarnessRuntime(this.standardInstall,currentEnvironment(),(runtime,running)=>{if(running)this.serverTurns.add(runtime);else this.serverTurns.delete(runtime);},null,server,this.serverApprovals);
  return new ServerFirstRuntime(new HermesRuntime(this),turns,server,reason=>this.context.failure(new WorldletError(`Fox talks through the built-in Hermes runtime: ${reason}`),'hermesServer'));
 }
 makeTask():AgentRuntime {return new HermesRuntime(this,true);}
 makeModelAccess():AgentRuntime {return new HermesModelAccess(this);}
 makeSourceAccess():AgentRuntime {return new HermesSourceAccess(new HermesRuntime(this),this.context.development);}
 makeSourceConnections():AgentSourceConnections {return new HermesSourceConnections(new HermesRuntime(this),this.context);}
 makeRoutines():AgentRoutines {return new HermesRoutines(this);}
 async helperPython(){await this.prepare();return this.python;}
 status(home:string):Promise<Row> {
  const key=path.resolve(home);
  const running=this.reads.get(key);
  if(running)return running;
  const worker=this.pool.worker(home),known=this.lastStatus.get(key);
  if(known&&worker.busy)return Promise.resolve(known);
  const read=worker.enqueue(crypto.randomUUID().toUpperCase(),{action:'status'}).then(value=>{this.lastStatus.set(key,value);return value;}).finally(()=>this.reads.delete(key));
  this.reads.set(key,read);
  return read;
 }
 warm(home:string,prime?:Row){this.pool.warm(home,()=>this.prepare(),prime);}
 shutdown(){this.lastStatus.clear();this.server?.shutdown();return this.pool.shutdown();}
 whileStopped<T>(work:()=>Promise<T>){this.lastStatus.clear();this.server?.shutdown();return this.pool.whileStopped(work);}

 checkpointCompanion(archive:Row){return checkpointHermesMemory(archive,this.privateHome());}
 captureCompanion(archive:Row,imported:boolean){
  const portable=this.checkpointCompanion(archive);
  if(portable.memoryAuthority==='hermes'&&!imported){
   portable.conversations=[...(portable.conversations??[]),...readHermesConversations(this.privateHome(),portable.conversations??[],portable.identity?.id??'')];
   portable.conversations.sort((a:Row,b:Row)=>a.createdAt<b.createdAt?-1:a.createdAt>b.createdAt?1:0);
  }
  encodeArchive(portable);return portable;
 }
 installCompanion(archive:Row,current:Row,imported:boolean,install:(archive:Row,recovery:Row|null)=>string|null){
  const root=this.context.root;
  if(attachedHermes(root))throw new WorldletError('This world shares an existing Hermes profile. Import into a separate Worldlet profile to preserve that Agent’s memory.');
  const portable:Row={...archive,memoryAuthority:'hermes'};
  // Recovery includes the latest live memory, not a stale snapshot; history stays with the previous companion.
  const recovery=this.captureCompanion(current,imported);
  return replaceHermesMemory(portable.memories??[],this.privateHome(),()=>install(portable,recovery));
 }
 /** Memory manager edits (Mac CompanionMemoryEdits → HermesMemoryTransfer.replace). An attached
  * profile's memory belongs to that Agent and is never rewritten. */
 replaceCompanionMemories(memories:Row[],commit:()=>void){
  if(attachedHermes(this.context.root))throw new WorldletError('Memory changed or belongs to an attached Agent. Reload before editing.');
  replaceHermesMemory(memories,this.privateHome(),commit);
 }
 allowsBackupPath(relative:string){
  const prefix='agent/private/hermes/';
  if(!relative.startsWith(prefix))return false;
  const rest=relative.slice(prefix.length);
  return ['state.db','worldlet-desktop-sessions.json','memories/MEMORY.md','memories/USER.md','SOUL.md'].includes(rest)||(rest.startsWith('sessions/')&&rest.endsWith('.jsonl'));
 }
 validateBackupEntry(relative:string,data:Buffer){
  if(!this.allowsBackupPath(relative))throw new WorldletError('Unsupported Hermes backup entry.');
  if(relative.endsWith('/worldlet-desktop-sessions.json'))JSON.parse(data.toString('utf8'));
 }
 diagnosticFiles(home:string):[string,string][] {
  return ([['Model config','config.yaml'],['Model credentials','.env'],['Google token','google_token.json'],['Google client file','google_client_secret.json'],['Other auth','auth.json'],['USER.md','memories/USER.md'],['MEMORY.md','memories/MEMORY.md'],['Sessions','sessions'],['Skills folder','skills']] as [string,string][]).map(([label,file])=>[label,path.join(home,file)]);
 }
 profile(discover:boolean):Row {
  const attached=attachedHermes(this.context.root);
  if(attached)return {supported:true,found:true,bound:true,name:hermesIdentity(attached),path:attached};
  const found=discover?discoverOtherHermes(this.context.root):null;
  if(found)return {supported:true,found:true,bound:false,name:hermesIdentity(found),path:found};
  return {supported:true,found:false,bound:false};
 }
 bindProfile(expected:string){bindHermes(this.context.root,expected);return this.profile(false);}
 /** Reset keeps the model connection; only the selected kernel's layout is known here. */
 resetRetainedPaths(){
  const retained=new Set(['agent/private/hermes/.env','agent/private/hermes/config.yaml','agent/private/hermes/auth.json','agent/private/hermes/google_client_secret.json']);
  const agent=path.join(this.context.root,'agent');
  if(fs.existsSync(agent))for(const scope of fs.readdirSync(agent,{withFileTypes:true})){
   if(!scope.isDirectory()||scope.isSymbolicLink())continue;
   for(const runtime of fs.readdirSync(path.join(agent,scope.name)))if(runtime!=='hermes')retained.add(`agent/${scope.name}/${runtime}`);
  }
  return retained;
 }
 resetExplanation(){
  if(attachedHermes(this.context.root))return 'This deletes Worldlet’s local data and attachment. Your existing Hermes profile, memory and credentials stay where they are. This cannot be undone.';
  return `This permanently deletes Fox’s memory, conversations, recorded activity, saved items, imported copies, and account connections on this ${process.platform==='darwin'?'Mac':'computer'}. Your model configuration and credentials are kept. Worldlet then starts onboarding again. This cannot be undone.`;
 }
}

/** A caller owns cancellation; the pool owns resident processes per profile and lane. */
export class HermesRuntime implements AgentRuntime {
 private readonly adapter:HermesAdapter;
 private request:{id:string,worker:HermesWorker}|null=null;
 private stopped=false;
 /** Applet tasks share one lane beside the conversation, one task at a time. */
 private readonly task:boolean;
 constructor(adapter:HermesAdapter,task=false){this.adapter=adapter;this.task=task;}
 cancel(){
  this.stopped=true;
  const request=this.request;
  if(request){this.request=null;request.worker.cancel(request.id);}
 }
 async steer(text:string){
  const request=this.request;
  return request?request.worker.steer(request.id,text):false;
 }
 run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  this.stopped=false;
  return ExecutionJournal.run(body,home,onEvent,observed=>this.execute(body,home,observed));
 }
 private async execute(body:Row,home:string,onEvent:AgentEventHandler):Promise<Row> {
  await this.adapter.prepare();
  if(this.request)throw new WorldletError('Fox is already working. Stop the current task first.');
  if(this.stopped)throw new AgentCancelled();
  const background=body._background===true,action=typeof body.action==='string'?body.action:'';
  const sourceLane=background&&['notion','google','mcp','paypal','todoist','supabase','linear'].includes(action);
  const provider=typeof body.args?.provider==='string'?body.args.provider:'';
  const readKey=background&&action==='world_tool'&&body.name==='read_world_source'&&['gmail','google-calendar','notion','apple-notes','apple-reminders'].includes(provider)?provider:null;
  // Each source's extraction gets its own serial worker, so Mail cannot queue Calendar.
  const analysisLane=typeof body.analysisLane==='string'?'analysis:'+body.analysisLane:'analysis';
  // A browser step's quick choice runs while Fox's turn waits on it, so it never queues behind that turn.
  const modelLane=action==='browser_pick'?'browser-pick':background?(body.sourceAnalysis===true?analysisLane:body.attentionSynthesis===true?'attention':null):null;
  const task=this.task&&action==='chat';
  const worker=this.adapter.pool.worker(home,task?{taskLane:true}:{modelLane,sourceLane,readKey,routineLane:action==='routine_tick'}),id=crypto.randomUUID().toUpperCase();
  this.request={id,worker};
  try{
   return await worker.enqueue(id,task?{...body,appletTask:true}:body,event=>onEvent(action==='chat'&&event.type!=='trace'?agentEvent(event):event));
  }finally{if(this.request?.id===id)this.request=null;}
 }
}

/** Host configuration actions and provider sign-in events. */
class HermesModelAccess implements AgentRuntime {
 private readonly runtime:HermesRuntime;
 private readonly adapter:HermesAdapter;
 constructor(adapter:HermesAdapter){this.adapter=adapter;this.runtime=new HermesRuntime(adapter);}
 cancel(){this.runtime.cancel();}
 async steer(){return false;}
 async run(body:Row,home:string,onEvent?:AgentEventHandler){
  const request={...body};
  if(request.action==='modelConfigure')request.action='configure';
  let sent=false;
  const result=await this.runtime.run(request,home,async event=>{
   if(event.type==='model_auth'){
    const handoff=core('harnessAuthHandoff',{event,action:body.action??'',sent});
    sent=true;
    return onEvent?.(handoff&&typeof handoff==='object'?handoff:{});
   }
   return onEvent?.(event);
  });
  if(!['modelCatalog','browser_pick'].includes(String(body.action))){this.adapter.forgetStatus();this.adapter.context.changed('model-changed');}
  return result;
 }
}

/** Host-facing source requests, independent of Hermes' own CLI operations. */
export class HermesSourceAccess implements AgentRuntime {
 private readonly runtime:AgentRuntime;
 private readonly development:boolean;
 constructor(runtime:AgentRuntime,development:boolean){this.runtime=runtime;this.development=development;}
 cancel(){this.runtime.cancel();}
 async steer(){return false;}
 static request(body:Row,home:string,development:boolean):Row {
  const action=typeof body.action==='string'?body.action:'';
  if(action==='sourceTool')return {action:'world_tool',name:body.name??'',args:body.args??{},_background:body._background??false,_taskTimeoutSeconds:body._taskTimeoutSeconds??240};
  const provider=body.provider;
  if(typeof provider!=='string')throw new WorldletError('A source provider is required.');
  const google=GOOGLE.includes(provider);
  if(action==='sourceRefresh'){
   if(!SOURCE_PROVIDERS.includes(provider))throw new WorldletError('Unsupported source refresh.');
   if(google&&body.connector!=='mcp'&&googleAuthorized(home,development))return {action:'google',operation:'read',service:provider,_background:true};
   return {action:'mcp',operation:'test',name:provider,_background:true};
  }
  const operation=body.operation;
  if(action!=='sourceRequest'||typeof operation!=='string')throw new WorldletError('Unsupported source request.');
  // Only the trusted review coordinator issues these operations; the model has no commit tool.
  if(provider==='todoist'&&['review','complete'].includes(operation))return {action:'todoist',operation,id:body.id??'',_background:true};
  const drive=curatedConnection(provider)==='google-drive';
  if(['todoist','supabase','linear'].includes(provider)||(drive&&['list','fetch'].includes(operation))){
   const input:Row={...body};
   if(operation==='fetch')input.operation='read';
   delete input.action;delete input.background;
   const request=core('curatedSourceRead',input);
   if(!request||typeof request!=='object')throw new WorldletError('Invalid source read.');
   delete request.provider;delete request.connectionProvider;request.action=provider;
   if(drive){request.applet=provider;request.readOperation=request.operation;request.operation='drive_content';request.action='google';}
   request._background=true;return request;
  }
  if(google){
   if(provider==='gmail'&&operation==='authorizeSend')return {action:'google',operation:'connect',services:['gmail','google-calendar','gmail-send']};
   if(provider==='gmail'&&operation==='access')return {action:'google',operation:'mail_access'};
   if(provider==='gmail'&&['send','reconcile'].includes(operation))return {action:'google',operation:operation==='send'?'send_email':'reconcile_email',id:body.id??'',draft:body.draft??{}};
   if(operation!=='read')throw new WorldletError('Unsupported source operation.');
   return {action:'google',operation:'read',service:provider,id:body.id??'',threads:body.threads??false,_background:body.background??false};
  }
  if(provider==='notion'&&['prepare','commit','check','reviews','discard'].includes(operation))return {action:'notion',operation,id:body.id??'',draft:body.draft??{},binding:body.binding??''};
  const operations:Record<string,string[]>={notion:['list','fetch'],paypal:['list','read'],doordash:['status','login','disconnect']};
  if(!operations[provider]?.includes(operation))throw new WorldletError('Unsupported source operation.');
  return {action:provider,operation,id:body.id??'',page:body.page??1,_background:body.background??false};
 }
 async run(body:Row,home:string,onEvent?:AgentEventHandler){
  const request=HermesSourceAccess.request(body,home,this.development);
  const result=await this.runtime.run(request,home,onEvent);
  if(request.action==='google'&&request.operation==='read'&&!Array.isArray(result?.records))throw new WorldletError('The source returned no valid records. Previous content is kept.');
  if(request.action==='mcp'&&request.operation==='test'&&result?.ok!==true)throw new WorldletError('The source connection could not be verified.');
  return result;
 }
}

/** Real OAuth token, or (development builds only) the fictional rehearsal account. */
export function googleAuthorized(home:string,development:boolean){
 return exists(path.join(home,'google_token.json'))||(development&&exists(path.join(home,'mock_google.json')));
}

/** Account connections through Hermes: Google consent in the system browser, MCP for the rest. */
export class HermesSourceConnections implements AgentSourceConnections {
 private readonly runtime:AgentRuntime;
 private readonly context:RuntimeContext;
 private cancelled=false;
 constructor(runtime:AgentRuntime,context:RuntimeContext){this.runtime=runtime;this.context=context;}
 providers(provider:string){
  if(GOOGLE_SIGN_IN.includes(provider))return [...GOOGLE_SIGN_IN_SERVICES];
  return SOURCE_PROVIDERS.includes(provider)?[provider]:[];
 }
 cancel(){this.cancelled=true;this.runtime.cancel();}
 private check(){if(this.cancelled)throw new AgentCancelled();}
 async connect({provider,target,endpoint,token,home,mock,onStage,onConnected}:Parameters<AgentSourceConnections['connect']>[0]){
  this.cancelled=false;
  const services=this.providers(provider);
  if(!services.length)throw new WorldletError('Unsupported service.');
  const google=services.every(service=>GOOGLE.includes(service));
  if(mock){
   // Development only: Mail and Calendar on a fictional account, without OAuth.
   if(!this.context.development)throw new WorldletError('Mock Google is available only in development builds.');
   if(!google)throw new WorldletError('Unsupported service.');
   await this.runtime.run({action:'google',operation:'connect',services,mock:true},home);
   for(const service of services){
    this.check();
    const result=await this.runtime.run({action:'google',operation:'test',service},home);
    if(result?.ok!==true)throw new WorldletError('Mock Google did not connect.');
    onConnected({provider:service,target:typeof result.label==='string'?result.label:service,transport:'hermes',connector:'oauth'});
   }
   return;
  }
  if(google){
   let sent=false;
   await this.runtime.run({action:'google',operation:'connect',services},home,async event=>{
    if(event.type!=='google_auth')return null;
    const handoff=core('harnessAuthHandoff',{event,action:'google',operation:'connect',sent});
    if(typeof handoff?.url!=='string'||!/^https:\/\//.test(handoff.url))throw new WorldletError('Invalid Google authorization address.');
    sent=true;
    try{await this.context.openExternal(handoff.url);}catch{throw new WorldletError('Could not open your browser. Try again.');}
    // Hermes asks for consent only when the saved grant cannot be reused, so this is the one
    // point where the person really has a browser to sign in to. The page offers the same address
    // again (Open again, Copy link) when no browser came up.
    onStage('browser',handoff.url);
    return null;
   });
   onStage('verifying');
  }
  for(const service of services){
   this.check();
   const url=endpoint||SOURCE_ENDPOINTS[service]||'';
   const result=await this.runtime.run(google?{action:'google',operation:'test',service}:{action:'mcp',operation:'configure',name:service,url,token},home);
   this.check();
   if(result?.ok!==true)throw new WorldletError('Authorization did not complete.');
   onConnected({provider:service,target:target||(typeof result.label==='string'?result.label:service),transport:'hermes',connector:google?'oauth':'mcp'});
  }
 }
 async disconnect(connection:Row,home:string){
  const google=connection.connector!=='mcp'&&GOOGLE.includes(connection.provider)&&googleAuthorized(home,this.context.development);
  const result=await this.runtime.run(google?{action:'google',operation:'disconnect'}:{action:'mcp',operation:'remove',name:connection.provider},home);
  if(result?.ok!==true)throw new WorldletError('The connection could not be removed.');
  return google?[...GOOGLE]:[connection.provider];
 }
 async clientReady(provider:string,home:string){
  if(!['google',...GOOGLE].includes(provider))return true;
  return (await this.runtime.run({action:'google',operation:'status'},home))?.clientReady===true;
 }
 async configureClient(provider:string,file:string,home:string){
  if(!['google',...GOOGLE].includes(provider))throw new WorldletError('This provider does not use a desktop OAuth client.');
  await this.runtime.run({action:'google',operation:'client',path:file},home);
 }
}

/** Worldlet's routines as Hermes lists them (routines.py `owned`), read only. */
function hermesRoutineSlots(file:string):RoutineSlot[] {
 try{
  const jobs=JSON.parse(fs.readFileSync(file,'utf8'))?.jobs;
  return (Array.isArray(jobs)?jobs:[]).filter((job:Row)=>job?.origin?.platform==='worldlet').map((job:Row)=>({id:job.id,name:job.name,enabled:job.enabled,state:job.state,nextRunAt:job.next_run_at}));
 }catch{return [];}
}

/** App-scoped clock only. Hermes owns schedules, claims, execution and results. The clock ticks on
 * start, each minute and at once on `wake` (the computer woke); each routine missed in the gap
 * (Core `routinesDueAfterGap`) gets one tick now, and a late run says so. */
class HermesRoutines implements AgentRoutines {
 private readonly adapter:HermesAdapter;
 private readonly runtime:HermesRuntime;
 private loop:{stopped:boolean,woken:boolean}|null=null;
 constructor(adapter:HermesAdapter){this.adapter=adapter;this.runtime=new HermesRuntime(adapter);}
 start(isAllowed:()=>boolean,onResult:(result:Row)=>void,elsewhere:()=>string[]=()=>[]){
  if(this.loop)return;
  const loop={stopped:false,woken:false};this.loop=loop;
  void (async()=>{
   while(!loop.stopped){
    const home=this.adapter.privateHome(),file=path.join(home,'cron/jobs.json');
    if(isAllowed()&&exists(file)){
     const due=routinesDueAfterGap(hermesRoutineSlots(file),Date.now());
     // A tick runs at most one job, so a gap with several missed routines takes one tick each.
     for(let tick=0;tick<Math.min(Math.max(due.length,1),20)&&!loop.stopped;tick++){
      try{
       const result=await this.runtime.run({action:'routine_tick',_background:true,elsewhere:elsewhere()},home);
       const missed=result?.ran===true?due.find(routine=>routine.id===result.job?.id&&routine.late):undefined;
       if(!loop.stopped&&isAllowed())onResult(missed?{...result,late:true,scheduledAt:missed.scheduledAt}:result);
       if(result?.ran!==true)break;
      }catch(error){
       if(isCancellation(error)){if(loop.stopped)return;}
       else if(!loop.stopped)onResult({error:'A scheduled task could not finish. Ask Fox to check your routines.'});
       break;
      }
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
