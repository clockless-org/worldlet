import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {dialog,powerMonitor,shell,type MessageBoxOptions,type OpenDialogOptions,type SaveDialogOptions} from 'electron';
import {core} from '../../core.ts';
import {characterCount,characterPrefix,writeAtomic,WorldletError} from '../../files.ts';
import {canBuild} from '../../store/world-store.ts';
import {presentMailRead as presentLiveMail} from '../sources/records.ts';
import type {Host,Row} from '../../host/types.ts';
import {AGENT,ANALYTICS,AUDIO,BROWSER,COMPANION,DESKTOP_COMPANION,FOX,SOURCES,SPEECH,WORLD_TOOLS,
 type AgentRoutines,type AgentRuntime,type AgentScope,type AgentService,type AnalyticsService,type AudioService,type BrowserService,
 ONGOING,PHONE,type PhoneService,type OngoingService,type CompanionService,type DesktopCompanionService,type FoxService,type SourcesService,type SpeechService,type WorldToolsService} from '../../host/services.ts';
import {createCompanion,decode,type Scope} from './companion.ts';
import {resetToFirstLaunch} from './reset.ts';
import {readLocalAgentMemory,summarizeLocalAgent} from '../agent-runtime/local-memory.ts';
import {hermesThreads} from '../agent-runtime/agent-files.ts';
import {readFoxEnergy} from './energy.ts';
import {bringAgent} from './migration.ts';
import {createOlderHistory} from './older-history.ts';
import {createHistorySync,ownHarnessSession} from './history-sync.ts';
import {createHarnessJobs} from './harness-jobs.ts';
import {createHarnessAgents} from './harness-agents.ts';
import {createHarnessModels} from './harness-models.ts';
import {createFoxSkills} from './skills.ts';
import {installChannelReplies} from './channel-reply.ts';
import {createHarnessApprovalRules} from './harness-approvals.ts';
import {createHarnessConnections} from './harness-connections.ts';
import {WORLD_APPS,MOMENT_MAKER} from '../../../../../core/applets/index.ts';
import {diagnosticError} from '../../../../../core/diagnostics/index.ts';
import {HERMES_CHANNEL_READ_ONLY,MIGRATION_SOURCE_TITLES,WORLD_SINCE_KINDS,WORLD_SINCE_LIMITS,harnessLocation,hermesChannelToolAllowed,harnessService,isHarnessApprovalChoice,isMigrationSource,localHarnessAdapterId,worldSinceNote,type MigrationSource} from '../../../../../core/agent/index.ts';
import {worldLogKeeps} from '../../../../../core/activity/index.ts';
import {onboardingUnfinished} from '../../../../../core/onboarding/index.ts';
import {ARTIFACT_PAGE_MAKER,MORNING_BRIEF_DEFAULT,readMorningBrief} from '../../../../../core/artifacts/index.ts';
import {phoneApprovalPush,phoneFoxPush} from '../../../../../core/phone/index.ts';
import {companionLookIsClassic,normalizeCompanionLook,parseCompanionLook,placeKey,proactiveAsked,proactiveDue,proactiveHeard,proactiveLine,proactiveSpoke,proactiveState,proactiveTask,proactiveToolAllowed,PROACTIVE_MOMENTS,PROACTIVE_READ_ONLY,type ProactiveMoment} from '../../../../../core/companion/index.ts';
import {setTimeout as sleep} from 'node:timers/promises';

/** What the World holds about the companion, for the Profile page: its saved memory and, in the
 * person's own World, how much Fox has said and what each other Agent brought (world.sqlite). */
function knowledgeOf(profile:Row,ledger:{companionCounts():Record<string,{turns:number;notes:number}>;broughtStores():{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}[]}|null){
 const memories=(profile.memories??[]).filter((m:Row)=>typeof m.text==='string'&&m.text.trim()).map((m:Row)=>({kind:String(m.kind),text:characterPrefix(String(m.text),20000),source:String(m.source??'')}));
 if(!ledger)return {memories,conversations:0,brought:[]};
 const counts=ledger.companionCounts(),stores=new Map(ledger.broughtStores().map(value=>[value.source,value]));
 const brought=[...new Set([...Object.keys(counts),...stores.keys()])].filter(isMigrationSource).map(source=>{
  const shelf=stores.get(source);
  return {source,title:MIGRATION_SOURCE_TITLES[source],conversations:counts[source]?.turns??0,notes:counts[source]?.notes??0,
   skills:Object.keys(shelf?.skills??{}).sort(),routines:(shelf?.routines??[]).map(routine=>({name:String(routine.name??''),schedule:String(routine.schedule??'')})).filter(routine=>routine.name)};
 });
 return {memories,conversations:counts.fox?.turns??0,brought};
}

// Fox's page actions (Mac WorldView Coordinator Fox cases, WorldToolService.swift).
/** Swift `CancellationError` as the page sees it. */
class Cancelled extends Error {constructor(){super('The request was cancelled.');this.name='AbortError';}}
const WORLD_TOOL_NAMES=['read_companion_archive','meeting_decisions','_source_begin','_source_result','query_world_items','upsert_world_items','review_world_item','update_world_item','archive_world_items','configure_world_check','read_world_history'];
const CONTROL_SCREENS=['preferences','sources','organize','model','privacy','voice','style','world','data','login'];
const STREAM_EVENTS=['delta','response_start','progress','steered','status'];
/** World services that run without a model on the accounts in this computer's Platform.
 */
const ACCOUNT_SERVICES=['read_connected_google','read_world_source','prepare_email','use_doordash'];
/** Applet tasks running at once, across Applets; one per Applet. */
const MAX_APPLET_TASKS=3;
/** An Applet task's coarse length for analytics: tasks take minutes, so the turn buckets are too short. */
const taskDuration=(seconds:number)=>seconds<1?'under_1s':seconds<5?'1_5s':seconds<15?'5_15s':seconds<60?'15_60s':seconds<300?'1_5m':seconds<900?'5_15m':'over_15m';
/** Seconds without fractions, as `ISO8601DateFormatter` with `.withInternetDateTime`. */
const iso=(seconds:number)=>new Date(seconds*1000).toISOString().replace(/\.\d{3}Z$/,'Z');

export function installFox(host:Host){
 const {store,preferences,page}=host;
 const companion=createCompanion(host);
 const older=createOlderHistory(host,companion);
 // The Agent's history read again while Worldlet runs (history-sync.ts), not only when it was brought.
 const history=createHistorySync(host);
 const {style}=companion;
 const agent=()=>host.optional<AgentService>(AGENT);
 const harnessAgents=createHarnessAgents(host);
 const harnessModels=createHarnessModels(host,{warm:thread=>warmThread(thread)});
 // The Agent's skills in the World, each with when it last ran, and offers to save a task Fox repeats (skills.ts).
 const skills=createFoxSkills(host);
 // A reply the person approved, sent into the channel a brought conversation came from by its own Agent (channel-reply.ts).
 installChannelReplies(host);
 const approvalRules=createHarnessApprovalRules(host);
 const agentConnections=createHarnessConnections(host);
 const requireAgent=()=>{const value=agent();if(!value)throw new WorldletError('Fox is unavailable in this build.');return value;};
 const worldTools=()=>host.optional<WorldToolsService>(WORLD_TOOLS);
 const sources=()=>host.optional<SourcesService>(SOURCES);
 const speech=()=>host.optional<SpeechService>(SPEECH);
 const analytics=()=>host.optional<AnalyticsService>(ANALYTICS);
 const browser=()=>host.optional<BrowserService>(BROWSER);

 let chat:AgentRuntime|null=null,routines:AgentRoutines|null=null;
 const chatRuntime=()=>chat??=requireAgent().make();
 let agentTurn:string|null=null;
 /** Each running turn's shared trust state (the conversation's and every Applet task's), and this
  * session's undoable Fox writes. */
 const trusts=new Map<string,Row>();
 type AppletTask={id:string,applet:string,key:string,title:string,runtime:AgentRuntime,startedAt:number,cancelled:boolean,proactive?:boolean,quiet?:boolean};
 /** Applet tasks running now, by id (see Applet tasks below). */
 const appletTasks=new Map<string,AppletTask>();
 const writeUndos=new Map<string,Row>();
 let pendingCompanion:{id:string,archive:Row}|null=null;
 let lastConsent=false,routinesRunning=false,subscribed=false;
 // Background work Worldlet started by itself (backgroundChat below).
 let backgroundRun:{id:string;runtime:AgentRuntime;cancelled:boolean}|null=null;

 /** The foreground Fox scope. Sample stays sample until private browser context is read
  * into it; without cloud consent Fox runs in setup. A mismatch would start a second,
  * cold Agent process. */
 const foxScope=():Scope=>{
  const sample=store.sampleEnabled();
  return {sample,setup:!(sample&&!(browser()?.privateContextWasRead()??false))&&store.state.cloudConsent!==true};
 };
 const agentScope=(scope:Scope):AgentScope=>scope.setup?'setup':scope.sample?'sample':'private';
 const home=(scope:Scope)=>requireAgent().home(agentScope(scope));

 // Routines and consent ------------------------------------------------------------------
 // Jobs on the chosen Harness's own scheduler come back as Attention items and phone notifications (harness-jobs.ts);
 // Worldlet's routines leave that Agent's brought copies to it.
 const harnessJobs=createHarnessJobs(host,{allowed:()=>store.state.cloudConsent===true&&!store.sampleEnabled()&&!onboardingUnfinished(store.state.onboarding)});
 function startRoutines(){
  const runtime=agent();
  if(!runtime||routinesRunning)return;
  routinesRunning=true;
  (routines??=runtime.makeRoutines()).start(()=>store.state.cloudConsent===true&&!store.sampleEnabled(),routineResult,harnessJobs.elsewhere);
  harnessJobs.start();
 }
 function stopRoutines(){routinesRunning=false;routines?.stop();harnessJobs.stop();}
 /** Each routine run joins the world log; one missed while the computer slept says it ran late. */
 function routineResult(value:Row){
  const job=value?.job;
  if(value?.ran===true&&typeof job?.id==='string'){
   const at=Date.now()/1000;
   store.recordHistory({id:`routine:${job.id}:${at}`,kind:'routine.run',at,actor:'fox',status:job.last_status==='ok'?'complete':'failed',name:typeof job.name==='string'?job.name.slice(0,80):'',late:value.late===true,...typeof value.scheduledAt==='string'?{scheduledAt:value.scheduledAt}:{}});
  }
  page.event('worldlet:routines',value);
 }
 // The computer woke: routines missed while it slept run now, once each, not at the next minute.
 // Worldlet never keeps the computer awake for them.
 const resumed=()=>{if(routinesRunning){routines?.wake();harnessJobs.wake();}};
 powerMonitor.on('resume',resumed);
 function cancelCloud(){chat?.cancel();agentTurn=null;}
 function cancelAppletTasks(){for(const task of appletTasks.values()){task.cancelled=true;task.runtime.cancel();}}
 function checkModelConsent(){
  const consent=store.state.cloudConsent===true,sample=store.sampleEnabled();
  if(!consent||sample)stopRoutines();else startRoutines();
  if(lastConsent&&!consent&&!sample){cancelCloud();cancelAppletTasks();backgroundCancel();}
  lastConsent=consent;
 }
 store.onChange(checkModelConsent);
 const modelChanged=()=>{cancelCloud();page.event('worldlet:model-changed');};
 /** Setup chose another Agent (a local Harness, or back to the built-in one): the old adapter's
  * lanes are already shut down, so the next turn makes new ones. */
 function agentChanged(){
  cancelCloud();cancelAppletTasks();stopRoutines();
  chat=null;routines=null;
  if(store.state.cloudConsent===true&&!store.sampleEnabled())startRoutines();
  page.event('worldlet:model-changed');
 }
 function subscribe(){
  const runtime=agent();
  if(subscribed||!runtime)return;
  subscribed=true;
  runtime.onChanged(reason=>reason==='agent-changed'?agentChanged():reason==='model-changed'?modelChanged():page.event('worldlet:model-changed'));
 }
 function showControls(screen:string,provider?:string|null){
  const desktop=host.optional<DesktopCompanionService>(DESKTOP_COMPANION);
  if(desktop?.isDesktop)void desktop.restoreWorld();
  void page.call('worldletShowControls',screen,provider??null);
 }
 /** Mac `store.stop()` + runtime shutdown around restart, reset, memory saves and transfer. */
 async function stopFox({world=true}:{world?:boolean}={}){
  speech()?.stopSpeaking();speech()?.cancelCapture();stopRoutines();cancelCloud();cancelAppletTasks();
  if(world){worldTools()?.stop();sources()?.cancel();}
  await Promise.all([agent()?.shutdown(),speech()?.stopLocal()]);
 }
 const interactive=()=>agent()?.hasInteractiveWork()??false;
 const showWriteNotice=(notice:Row)=>page.event('worldlet:write-notice',notice);

 // Model status ----------------------------------------------------------------------------
 async function foxModelStatus(){
  const scope=foxScope(),cloudAllowed=!scope.setup,runtime=agent();
  const unavailable={provider:runtime?.id??'unavailable',available:false,ready:false,fallback:false,reason:"Fox's model isn't ready yet. Retry in a moment or choose another connection.",cloudAllowed};
  // Right after an update the built-in Agent installs its new runtime for a few seconds (setup starts when the
  // World loads): wait for it rather than turn the person's first messages away, and say why when setup fails.
  if(runtime&&!runtime.available&&runtime.prepare){
   try{await runtime.prepare();}catch(error){return {...unavailable,reason:error instanceof WorldletError?error.message:unavailable.reason};}
  }
  // No Agent chosen yet says so (agent-runtime NoAgentAdapter).
  if(!runtime?.available){const why=runtime?(await runtime.status(home(scope)).catch(()=>null))?.error:null;return typeof why==='string'?{...unavailable,reason:why}:unavailable;}
  let model:Row;
  try{model=await runtime.status(home(scope));}catch{return unavailable;}
  if(model.ready===true)return {provider:runtime.id,available:true,ready:true,fallback:false,reason:'Configured Agent adapter',cloudAllowed,capabilities:model.capabilities??{}};
  return unavailable;
 }
 function setCloudConsent(allowed:boolean){
  store.setCloudConsent(allowed);
  if(!allowed)return;
  const tools=worldTools();
  if(store.state.connections.some((c:Row)=>c.provider==='gmail'&&canBuild(c))&&agent()?.supportsBackgroundChecks)tools?.startOnboardingMailCheck();
  else void tools?.checkWorldIfDue().catch(error=>host.diagnostics.record(error,'checkWorldIfDue'));
 }

 // World tool trust (WorldToolService.swift) ---------------------------------------------------
 function observeAgentEvent(turn:string,event:Row,result?:Row|null){
  const state=core('turnTrustObserve',{state:trusts.get(turn)??{},event:{...event,result:result??undefined}});
  if(state&&typeof state==='object')trusts.set(turn,state);
 }
 function presentMailRead(records:Row[]):Row[] {
  const service=sources();
  if(service?.presentMailRead)return service.presentMailRead(records);
  return presentLiveMail(store,records);
 }
 async function worldServiceReply(event:Row,turn:string,scope:Scope):Promise<Row|null> {
  if(event.type!=='tool'||typeof event.name!=='string'||!event.args||typeof event.args!=='object'||Array.isArray(event.args))return null;
  const name=event.name,args=event.args as Row;
  const hosted=['prepare_home_change','prepare_notion_change','_email_review'];
  if(!hosted.includes(name)&&name!=='_world_authorize'&&name!=='update_applet_state'&&!WORLD_TOOL_NAMES.includes(name))return null;
  if(scope.sample||scope.setup||store.sampleEnabled()||!store.writable||store.state.cloudConsent!==true)throw new WorldletError('Allow private context in your personal world first.');
  if(name==='_world_authorize')return {ok:true};
  if(hosted.includes(name)){
   const service=sources();
   if(!service)throw new WorldletError('This Worldlet build cannot prepare that change.');
   // A draft made by background work (the morning brief) or from another Hermes channel waits as a card in the Journal
   // instead of taking the screen.
   return await service.serviceReply(name,args,turn,home({sample:false,setup:false}),{quiet:!!backgroundRun&&backgroundRun.id===turn||turn.startsWith('channel-')});
  }
  if(name==='update_applet_state'){
   const service=sources();
   if(!service)throw new WorldletError('This Worldlet build cannot update Applets.');
   return service.describeApplet(args,turn);
  }
  const tools=worldTools();
  if(!tools)throw new WorldletError('World tools are unavailable in this build.');
  const result=await tools.reply(name,args,turn);
  if(name==='_source_result'&&args.provider==='gmail'&&args.failed!==true&&Array.isArray(args.records)){
   const records=args.records.filter((row:Row)=>row&&row.metadataOnly!==true);
   if(records.length)page.event('worldlet:source-results',{provider:'gmail',pages:presentMailRead(records)});
  }
  // A changed task waits on its Attention card (ui/attention/task-review.ts), never over Fox's dialog (owner Order 2026-10-07).
  if(Array.isArray(result?.taskReviews)&&result.taskReviews.length)store.worldChanged();
  return result;
 }
 /** Shared turn trust (#407): once a turn reads untrusted content, guarded writes are denied
  * with the honest reason; direct writes run and leave an undoable Fox notice. */
 async function trustedServiceReply(event:Row,turn:string,scope:Scope):Promise<Row|null> {
  const admission=core<Row>('turnWriteAdmission',{state:trusts.get(turn)??{},event})??{};
  if(admission.allowed===false){
   const reason=typeof admission.error==='string'?admission.error:'Worldlet blocked this write.';
   showWriteNotice({id:crypto.randomUUID().toUpperCase(),text:reason,denied:true});return {error:reason};
  }
  observeAgentEvent(turn,event);
  const args=event.args&&typeof event.args==='object'?event.args:{};
  let guarded:string|null=null,before:unknown=null;
  if(typeof admission.tool==='string'&&admission.tool===event.name){guarded=admission.tool;before=store.guardedWriteBefore(admission.tool,args);}
  const result=await worldServiceReply(event,turn,scope);
  if(!result)return null;
  if(result.untrustedContent===true)observeAgentEvent(turn,event,result);
  if(guarded&&before!=null&&result.error==null){
   const notice=core<Row>('turnWriteNotice',{tool:guarded,args,before});
   if(notice?.undo&&typeof notice.undo==='object'){
    const id=crypto.randomUUID().toUpperCase();writeUndos.set(id,notice.undo);
    showWriteNotice({id,text:notice.text??'',undoable:true});
   }
  }
  return result;
 }

 // Recent world history for the Companion's context -----------------------------------------
 function recentHistory(limit=8):Row[] {
  try{
   const rows=store.ledger().history({limit:limit*6}).map(row=>({...row,at:iso(Number(row.at)||0)}));
   return core<Row[]>('recentWorldHistory',{rows,limit})??[];
  }catch{return [];}
 }

 /** What happened in the World since `thread`'s resident session last replied, for an Agent that keeps one per thread
  * (its `conversation` service): the History lines after that reply as one bounded note (core/agent/world-since.ts),
  * read the way the History page reads them; '' for a new session, or when nothing happened. */
 function worldSince(scope:Scope,thread:string):string {
  const harness=agent()?.harness;
  if(scope.sample||scope.setup||!harness||harnessService(harness.id,'conversation')===null)return '';
  try{
   const since=companion.lastReply(scope,thread),now=Date.now()/1000;
   if(since===null)return '';
   const ledger=store.ledger(),from=Math.max(since,now-WORLD_SINCE_LIMITS.maxAge);
   const rows=[...ledger.history({kinds:WORLD_SINCE_KINDS.filter(kind=>kind!=='world.action'),since:from,limit:200}),...ledger.history({kind:'world.action',since:from,limit:400}).filter(worldLogKeeps)];
   return worldSinceNote(rows,since,now);
  }catch(error){host.diagnostics.record(error,'foxWorldSince');return '';}
 }

 /** One turn's Agent events: stream events reach the page, tools run through the trusted services
  * or the World page under the turn's own trust. The conversation and each Applet task use it with
  * their own turn id; `record` keeps stream events in the conversation's record. */
 function turnEvents(id:string,scope:Scope,{active,allowActions,reads,record}:{active:()=>boolean,allowActions:boolean,reads?:(event:Row)=>boolean,record:boolean}){
  const handle=async(event:Row):Promise<Row|null>=>{
   // `status: waiting` only keeps a long model wait alive; it is not conversation.
   if(record&&typeof event.type==='string'&&STREAM_EVENTS.includes(event.type)&&!(event.type==='status'&&event.stage==='waiting'))companion.recordEvent(id,event.type,scope,typeof event.text==='string'?event.text:null);
   if(!active()||!page.ready())throw new Cancelled();
   if(event.type==='model_required'){showControls('model');return null;}
   if(event.type==='applet'){if(!scope.sample&&!scope.setup)sources()?.receiveAppletEvent(event,id);return null;}
   // The Harness's own permission prompt: an approval card in Fox's dialogue (and on the phone), answered through
   // `harnessApproval`; the turn waits for it.
   if(event.type==='approval'){
    page.event('worldlet:harness-approval',{...event.request,turn:id});
    if(!scope.sample&&!scope.setup)approvalRules.asked(event.request);
    // The paired phone is told too: the prompt rides with its live turn, and the tap opens Fox's dialogue there.
    // Allow once and Deny are on the notification itself (core/phone phoneApprovalPush).
    const push=phoneApprovalPush(event.request);
    if(push&&!scope.sample&&!scope.setup)void host.optional<PhoneService>(PHONE)?.notify(push).catch(()=>{});
    return null;
   }
   // What an approved command or edit changed, as the Harness reported it: shown on that approval's card.
   if(event.type==='approval_result'){page.event('worldlet:harness-approval',{id:event.result?.id,result:event.result,turn:id});return null;}
   if(event.type==='tool'&&!allowActions){
    // A greeting runs no tools; a read-only ask runs its reads, and the model is told the rest is refused.
    if(!reads)throw new WorldletError('A greeting cannot perform actions.');
    if(!reads(event))return {error:PROACTIVE_READ_ONLY};
   }
   const served=await trustedServiceReply(event,id,scope);
   if(served)return served;
   const owned=await accountServiceReply(event,id,scope,handle);
   if(owned)return owned;
   const tool=event.type==='tool';
   // UI tools may wait for user approval; they use the Agent budget, not the short page timeout.
   const deadline=tool?Number(core('agentRequestDeadline',{action:'chat'}))||120:15;
   observeAgentEvent(id,event);
   let timer:ReturnType<typeof setTimeout>|undefined;
   const call=tool?page.call<Row>('worldletAgentTool',id,event):page.call('worldletAgentEvent',id,event).then(()=>null);
   // A page that does not answer in time fails this step, not the turn or the Agent: a tool tells the model it got
   // no answer, and a stream event (a status, a keep-alive, a delta) is dropped.
   const late=tool?{error:'The World page did not answer this step in time. Tell the person, and do not repeat it unless they ask.'}:null;
   const reply=await Promise.race([call,new Promise<Row|null>(resolve=>{timer=setTimeout(()=>resolve(late),deadline*1000);})]).finally(()=>clearTimeout(timer));
   const value=reply&&typeof reply==='object'&&!Array.isArray(reply)?reply as Row:null;
   if(value?.untrustedContent===true)observeAgentEvent(id,event,value);
   return value;
  };
  return handle;
 }
 /** A local Agent's (or a Hermes channel's) call to a World service (Gmail, Calendar and Drive reads, mail drafts,
  * source reads, DoorDash): the Platform runs it with no model (the agent service's source access), and the calls it
  * makes back into the World go through this same turn, under its trust. The built-in Hermes runs these inside its own turn. */
 async function accountServiceReply(event:Row,turn:string,scope:Scope,handle:(event:Row)=>Promise<Row|null>):Promise<Row|null> {
  const runtime=agent();
  // The built-in Hermes runs these inside its own turn and never sends them as tool events; a turn on the standard Hermes
  // Agent's API server or a call from another Hermes channel does (World tools on Hermes), so they are served here too.
  if(event.type!=='tool'||typeof event.name!=='string'||!ACCOUNT_SERVICES.includes(event.name)||!runtime)return null;
  // The practice world has no accounts: the page runs its practice versions (a practice draft, its saved emails).
  if(scope.sample||store.sampleEnabled())return null;
  if(scope.setup||!store.writable||store.state.cloudConsent!==true)throw new WorldletError('Allow private context in your personal world first.');
  const args=event.args&&typeof event.args==='object'&&!Array.isArray(event.args)?event.args:{};
  let result:unknown;
  try{result=await runtime.makeSourceAccess().run({action:'sourceTool',name:event.name,args,_taskTimeoutSeconds:240},runtime.accountsHome(),handle);}
  catch(error){if(error instanceof Cancelled)throw error;return {error:error instanceof Error&&error.message?error.message:'World service is unavailable.'};}
  const value=result&&typeof result==='object'&&!Array.isArray(result)?result as Row:{error:'World service is unavailable.'};
  if(value.untrustedContent===true)observeAgentEvent(turn,event,value);
  return value;
 }
 /** A turn's world bookkeeping once it ends, the conversation's and an Applet task's alike. */
 function finishTurn(id:string,cancelled:boolean){
  trusts.delete(id);
  delete store.worldEvidence[id];
  try{worldTools()?.finishTurn?.(id,cancelled);}catch{}
  try{sources()?.finishAppletTurn(id,cancelled);}catch{}
 }
 /** A World tool call from another Hermes channel, outside any Fox turn (World tools on Hermes, owner decision 2026-10-08
  * 19:15Z: Telegram, the phone, a Hermes cron run): a turn of its own in the private World that starts untrusted, so Core
  * refuses guarded writes, and it runs only reads and a draft for the person's review (core hermesChannelToolAllowed;
  * a prepared email waits as a card, sent only from its review). Anything else is refused with the reason; the World
  * page runs no tools for it, since nobody there asked. */
 async function channelToolReply(name:string,args:Row):Promise<Row> {
  const id='channel-'+crypto.randomUUID().toUpperCase(),scope={sample:false,setup:false};
  trusts.set(id,{untrusted:true,sources:['hermes_channel']});
  const handle=turnEvents(id,scope,{active:()=>true,allowActions:false,reads:hermesChannelToolAllowed,record:false});
  try{
   if(store.sampleEnabled()||!store.writable||store.state.cloudConsent!==true||onboardingUnfinished(store.state.onboarding))return {error:'Worldlet is not ready for this yet: the person has not finished setting up their own World.'};
   if(!hermesChannelToolAllowed({name,args}))return {error:HERMES_CHANNEL_READ_ONLY};
   const event={type:'tool',id:'world-1',name,args},served=await trustedServiceReply(event,id,scope)??await accountServiceReply(event,id,scope,handle);
   return served??{error:'This World tool works only in a conversation with Fox in Worldlet.'};
  }catch(error){
   if(error instanceof Cancelled)return {error:'Worldlet stopped this before it finished.'};
   return {error:error instanceof Error&&error.message?error.message:'World tool is unavailable.'};
  }finally{finishTurn(id,false);}
 }
 /** Core's conversation guidance for Fox's model, for the conversation and Applet tasks alike. */
 function guidanceFor(scope:Scope){
  const runtime=requireAgent(),providers=store.checkProviders();
  return core<string>('conversationGuidance',{scope:agentScope(scope),connectedSources:providers,backgroundSources:runtime.supportsBackgroundChecks?providers:[],routines:runtime.id==='hermes',driveMetadata:runtime.id==='hermes'})??'';
 }

 // Applet tasks ------------------------------------------------------------------------------
 /** Work Fox handed to an Applet (`start_applet_task`, owner decision 2026-10-03: an Applet keeps
  * working and talking with Fox never waits for it). Each task is its own chat in the Agent's task
  * lane, beside the conversation, under the request the person made in the turn that started it.
  * The page runs its tools like a turn's and the world log says the Applet is working; when it ends,
  * its result is kept in Fox's conversation and the world history, and the page says it. */
 function appletTaskStart(request:Row,proactive=false,quiet=false){
  const scope=foxScope(),runtime=agent();
  if(scope.sample||scope.setup||store.sampleEnabled()||!store.writable||store.state.cloudConsent!==true)throw new WorldletError('Applet tasks run in your own world. Do this in the current turn.');
  const make=runtime?.makeTask;
  if(!runtime||!make)throw new WorldletError('This Agent cannot run Applet tasks in the background. Do this in the current turn.');
  // The maker of moment Applets works as an Applet task without a device of its own.
  const app=WORLD_APPS.find(app=>app.id===request.applet)??(request.applet===MOMENT_MAKER.id?MOMENT_MAKER:request.applet===ARTIFACT_PAGE_MAKER.id&&quiet?ARTIFACT_PAGE_MAKER:null);
  if(!app)throw new WorldletError('Unknown Applet.');
  if(typeof request.task!=='string'||!request.task.trim()||characterCount(request.task)>2000||typeof request.request!=='string'||!request.request.trim()||characterCount(request.request)>32000)throw new WorldletError('Invalid Applet task.');
  const tasks=[...appletTasks.values()];
  if(tasks.some(task=>task.key===app.key))throw new WorldletError(`${app.title} is already working on a task. Tell the person it will need to finish first.`);
  if(tasks.length>=MAX_APPLET_TASKS)throw new WorldletError('Several Applets are already working. Tell the person to wait for one to finish.');
  const id='task-'+crypto.randomUUID().toUpperCase();
  // The task inherits the starting turn's trust: after a mail or web read it never begins
  // trusted, so its guarded writes are refused as the parent's would be (turnTrustInherit).
  // A review Worldlet starts by itself (a game session ended, #1598) has no person's words behind it: it
  // starts untrusted, so it can read and answer but never make a guarded write.
  const trust=proactive?{untrusted:true,sources:['browse_web']}:core<Row>('turnTrustInherit',{state:typeof request.parent==='string'?trusts.get(request.parent)??{}:{}})??{untrusted:false,sources:[]};
  const task:AppletTask={id,applet:app.id,key:app.key,title:app.title,runtime:make(),startedAt:Date.now()/1000,cancelled:false,...proactive?{proactive:true}:{},...quiet?{quiet:true}:{}};
  appletTasks.set(id,task);trusts.set(id,trust);
  store.recordHistory({id:id+':started',kind:'applet.task',at:task.startedAt,actor:'fox',status:'started',runId:id},app.key);
  page.event('worldlet:applet-task',{id,applet:app.id,status:'started',request:request.request,...trust.untrusted===true?{trust}:{},...quiet?{quiet:true}:{}});
  // Analytics: the catalog key only, never the task, request, page or result.
  analytics()?.recordProductEvent('applet_task_started','',{applet:app.key});
  void runAppletTask(task,request.task.trim(),request.request.trim());
  return {ok:true,id,status:'started',message:`${app.title} is working on it in the background. Tell the person in one short sentence; its result reaches them when it is done. Do not wait for it.`};
 }
 async function runAppletTask(task:AppletTask,text:string,request:string){
  const scope:Scope={sample:false,setup:false};
  let status='complete',message='',code='';
  try{
   const profile=companion.archive(scope);
   // Nobody asked for a proactive review, so it is told what the person last said to Fox: their language and context.
   const said=task.proactive?[...profile.conversations].reverse().find((turn:Row)=>turn.role==='user'&&typeof turn.text==='string'):null;
   const lastWords=said?`\nThe person's latest words to you, for their language (reference only): ${JSON.stringify(characterPrefix(said.text,300))}`:'';
   const body={action:'chat',session:task.id,mode:'chat',text:`Applet: ${task.title} (${task.applet})\nThe user asked: ${request}\nTask: ${text}${lastWords}`,history:[],
    context:{appletTask:{applet:task.applet,title:task.title}},style:companion.prompt(companion.reference(profile))+guidanceFor(scope),sample:false};
   const result=await task.runtime.run(body,home(scope),turnEvents(task.id,scope,{active:()=>appletTasks.has(task.id)&&!task.cancelled,allowActions:true,record:false}));
   message=typeof result.message==='string'?result.message.trim():'';
  }catch(error){
   status=task.cancelled||(error as Error)?.name==='AbortError'?'cancelled':'failed';
   if(status==='failed'){host.diagnostics.record(error,'appletTask');code=String(diagnosticError({message:(error as Error)?.message??''}).code);}
  }finally{
   appletTasks.delete(task.id);
   finishTurn(task.id,status==='cancelled');
  }
  analytics()?.recordProductEvent('applet_task_'+(status==='complete'?'completed':status),taskDuration(Date.now()/1000-task.startedAt),{applet:task.key,...code?{error_code:code}:{}});
  store.recordHistory({id:task.id+':finished',kind:'applet.task',at:Date.now()/1000,actor:'fox',status,runId:task.id},task.key);
  // The result joins Fox's conversation, so Fox knows it in the next turn.
  // A quiet task (an Artifact page Worldlet asked for by itself) keeps its result out of the conversation.
  if(message&&!task.quiet)try{companion.recordTurn(`${task.title}: ${message}`,'assistant',companion.session(scope),scope);}catch(error){host.diagnostics.record(error,'appletTask');}
  page.event('worldlet:applet-task',{id:task.id,applet:task.applet,status,...message?{message}:{},...task.quiet?{quiet:true}:{}});
 }

 // Fox speaks first ----------------------------------------------------------------------------
 /** At a quiet moment the World page asks whether Fox has one line worth saying (owner request
  * 2026-10-06, core/companion/fox-proactive.ts decides when). The ask runs in the Agent's task lane
  * like the proactive game review: untrusted, so it reads but never writes, and without UI actions.
  * Most asks end in PASS and show nothing. The person's next message cancels an ask still running. */
 const proactive=proactiveState();
 // Browse with me or Don't bother, chosen in Fox's card (owner request 2026-10-08); on unless turned off.
 proactive.browse=preferences.bool('worldlet.foxBrowse',true);
 const proactiveLines=new Map<string,{line:string;thread:string;place:string;moment:ProactiveMoment}>();
 let proactiveRun:{id:string;runtime:AgentRuntime;cancelled:boolean}|null=null;
 const localDay=(at:number)=>{const date=new Date(at*1000);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
 function proactiveStart(request:Row){
  const scope=foxScope(),runtime=agent(),make=runtime?.makeTask;
  if(scope.sample||scope.setup||store.sampleEnabled()||!store.writable||store.state.cloudConsent!==true||!runtime||!make)return {started:false,reason:'unavailable'};
  // Never during onboarding or its tour: first value has its own lines, and its analysis must not
  // wait behind an ask (Mac RC 2961 timed out waiting for first value's pick).
  if(onboardingUnfinished(store.state.onboarding))return {started:false,reason:'onboarding'};
  if(agentTurn!==null||proactiveRun||backgroundRun||appletTasks.size||store.busy||store.organizing)return {started:false,reason:'busy'};
  const moment=request.moment as ProactiveMoment;
  if(!PROACTIVE_MOMENTS.includes(moment))throw new WorldletError('Invalid moment.');
  const thread=typeof request.thread==='string'?request.thread.slice(0,1100):'';
  const place=placeKey(thread);
  const now=Date.now()/1000,day=localDay(now);
  const visit=typeof request.visit==='string'?request.visit.slice(0,1200):'';
  const due=proactiveDue(proactive,{now,day,moment,place,visit});
  if(due.due!==true)return {started:false,reason:due.reason};
  proactiveAsked(proactive,{now,day,moment,visit});
  const id='proactive-'+crypto.randomUUID().toUpperCase();
  const run={id,runtime:make(),cancelled:false};
  proactiveRun=run;trusts.set(id,{untrusted:true,sources:['browse_web']});
  void proactiveRunTurn(run,scope,{moment,thread,place,minutes:Math.max(0,Math.round(Number(request.minutes)||0)),environment:proactiveEnvironment(request.environment)});
  return {started:true,id};
 }
 /** What the page says the place shows (location, state, view, the World's facts), as a turn of the person's own
  * carries it; without it an ask in a native Applet saw only the place's name and passed (owner 2026-10-10). The
  * host's own keys win, and a page that sends too much sends nothing. */
 function proactiveEnvironment(value:unknown):Row {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const {history:_h,here:_p,browsing:_b,page:_g,proactive:_m,...rest}=value as Row;
  try{return JSON.stringify(rest).length<=6000?rest:{};}catch{return {};}
 }
 async function proactiveRunTurn(run:{id:string;runtime:AgentRuntime;cancelled:boolean},scope:Scope,{moment,thread,place,minutes,environment={}}:{moment:ProactiveMoment;thread:string;place:string;minutes:number;environment?:Row}){
  let line:string|null=null;
  try{
   const profile=companion.archive(scope);
   const said=[...profile.conversations].reverse().find((turn:Row)=>turn.role==='user'&&typeof turn.text==='string');
   const context:Row={...environment,history:recentHistory(),proactive:{moment}};
   try{const here=companion.place(scope,thread);if(here)context.here=here;}catch(error){host.diagnostics.record(error,'foxPlace');}
   try{
    const page=browser()?.visiblePage(),shown=page&&!page.hidden&&!page.isClosed?page.recorder:null;
    shown?.flush?.();
    const open=shown?.openVisit?.()??'',visits=store.ledger().recentWebVisits(8);
    context.browsing=core<Row[]>('recentBrowsing',{visits,now:Date.now()/1000,open});
    // What the page on screen says: the ask may not read pages with tools, so its recorded text rides along.
    const visit=open?visits.find(v=>v.id===open)??store.ledger().webVisit(open):null;
    const pageText=visit?core<string>('onScreenText',{records:store.ledger().webPageText(visit.id)}):'';
    if(visit&&pageText)context.page={site:visit.site,title:visit.title,text:pageText};
   }catch(error){host.diagnostics.record(error,'foxPlace');}
   const local=new Date().toLocaleString([],{weekday:'short',hour:'2-digit',minute:'2-digit'});
   const text=proactiveTask({moment,place,local,minutes,recent:proactive.recent,lastWords:said?characterPrefix(said.text,300):''});
   const body={action:'chat',session:run.id,mode:'chat',text,history:[],context,style:companion.prompt(companion.reference(profile))+guidanceFor(scope),sample:false};
   const events=turnEvents(run.id,scope,{active:()=>proactiveRun===run&&!run.cancelled,allowActions:false,reads:proactiveToolAllowed,record:false});
   // Nobody asked, so a missing model ends the ask quietly instead of opening model settings.
   const result=await run.runtime.run(body,home(scope),event=>{if(event.type==='model_required'){run.cancelled=true;throw new Cancelled();}return events(event);});
   if(!run.cancelled)line=proactiveLine(result.message);
  }catch(error){
   if(!run.cancelled&&(error as Error)?.name!=='AbortError')host.diagnostics.record(error,'foxProactive');
  }finally{
   if(proactiveRun===run)proactiveRun=null;
   finishTurn(run.id,run.cancelled);
  }
  // Analytics: the moment and whether Fox spoke, never the line.
  analytics()?.recordProductEvent('fox_proactive_asked','',{proactive_moment:moment,proactive_status:line?'spoke':'passed'});
  if(!line||run.cancelled)return;
  proactiveLines.set(run.id,{line,thread,place,moment});
  page.event('worldlet:fox-proactive',{id:run.id,line,thread,moment});
 }
 /** The page showed the line (or dropped it because the person moved on or started talking). A shown
  * line joins the conversation in its place, so a reply continues from it. */
 function proactiveShown(request:Row){
  const id=typeof request.id==='string'?request.id:'',entry=proactiveLines.get(id);
  proactiveLines.delete(id);
  if(!entry||request.shown!==true)return {ok:true};
  const scope=foxScope(),now=Date.now()/1000;
  proactiveSpoke(proactive,{now,day:localDay(now),place:entry.place,line:entry.line,moment:entry.moment});
  try{companion.recordTurn(entry.line,'assistant',companion.session(scope),scope,entry.thread);}catch(error){host.diagnostics.record(error,'foxProactive');}
  analytics()?.recordProductEvent('fox_proactive_shown','',{proactive_moment:entry.moment});
  return {ok:true};
 }
 /** Browse with me (`on` true) or Don't bother (false), from the switch in Fox's card; without `on`, reads it.
  * Off, Fox never speaks first and an ask still running is dropped. */
 function proactiveBrowse(request:Row){
  if(typeof request.on==='boolean'&&request.on!==proactive.browse){
   if(!store.writable)throw new WorldletError('Preferences are read-only.');
   proactive.browse=request.on;
   if(request.on)preferences.remove('worldlet.foxBrowse');else{preferences.set('worldlet.foxBrowse',false);proactiveCancel();}
   analytics()?.recordProductEvent('fox_browse_changed','',{fox_browse:request.on?'on':'off'});
   page.event('worldlet:fox-browse',{on:request.on});
  }
  return {on:proactive.browse};
 }
 /** A line Fox says unasked in `thread` (FoxService.report): kept in that thread's history, shown like a proactive line
  * when the person is there (the page drops it otherwise; foxProactiveShown knows no such id, so records nothing more),
  * and sent to the paired phone. */
 function report(line:string,thread:string):boolean {
  const scope=foxScope(),text=line.trim();
  if(!text||scope.sample||scope.setup||!store.writable||store.sampleEnabled())return false;
  try{companion.recordTurn(text,'assistant',companion.session(scope),scope,thread);}catch(error){host.diagnostics.record(error,'foxReport');return false;}
  page.event('worldlet:fox-proactive',{id:'report-'+crypto.randomUUID().toUpperCase(),line:text,thread});
  const push=phoneFoxPush({name:'Fox',text});
  if(push)void host.optional<PhoneService>(PHONE)?.notify(push).catch(error=>host.diagnostics.record(error,'foxReport'));
  return true;
 }
 function proactiveCancel(){if(proactiveRun){proactiveRun.cancelled=true;proactiveRun.runtime.cancel();proactiveRun=null;}}

 // Chat --------------------------------------------------------------------------------------
 // How Fox's last reply ended, for Settings › Model (owner request 2026-10-06: see and fix every model
 // connection problem there). In memory for this run; addresses are dropped, and Agent errors carry no keys.
 let lastReply:{ok:boolean,at:number,error?:string}|null=null;
 const replyEnded=(error?:unknown)=>{lastReply=error===undefined?{ok:true,at:Date.now()}:{ok:false,at:Date.now(),error:characterPrefix(String((error as Error)?.message||error||'').replace(/https?:\/\/\S+/g,'[address]'),500)};};
 /** Work Worldlet starts by itself (the day's plan and summary) runs in the Agent's task lane, in a session of its
  * own beside the conversation (owner Orders 2026-10-07: one conversation; agent work goes to a background thread
  * that reports back). The person can talk to Fox meanwhile, and its long request and tool steps never fill the
  * conversation or push it into compaction (the 10-06 summary did). Its tools act on the World as a turn's do, so
  * what it makes (an artifact) shows; one line of its result joins the conversation, so Fox knows it was made. */
 async function backgroundChat(body:Row){
  const scope=foxScope(),runtime=agent(),make=runtime?.makeTask;
  if(!store.writable||typeof body.id!=='string'||typeof body.text!=='string')throw new WorldletError('Invalid Fox request.');
  if(scope.sample||scope.setup||store.sampleEnabled()||store.state.cloudConsent!==true||!runtime||!make)throw new WorldletError('Background work runs in your own world.');
  // One at a time, and not beside an Applet task: the page asks again at its next poll.
  if(backgroundRun||appletTasks.size)throw new WorldletError('Fox is busy with other background work.');
  const id:string=body.id,run={id,runtime:make(),cancelled:false};
  backgroundRun=run;trusts.set(id,{});
  proactiveCancel();
  const said=typeof body.shown==='string'&&body.shown.trim()?body.shown.trim():'Background work';
  const given=body.context&&typeof body.context==='object'&&!Array.isArray(body.context)?body.context as Row:{};
  const thread=typeof body.thread==='string'?body.thread.slice(0,1100):'';
  try{
   const profile=companion.archive(scope);
   const context:Row={...given,history:recentHistory(),backgroundWork:{label:said}};
   try{const here=companion.place(scope,thread);if(here)context.here=here;}catch(error){host.diagnostics.record(error,'foxPlace');}
   const chatBody={action:'chat',session:'work-'+id,mode:'chat',text:body.text,history:[],context,style:companion.prompt(companion.reference(profile))+guidanceFor(scope),sample:false};
   const result=await run.runtime.run(chatBody,home(scope),turnEvents(id,scope,{active:()=>backgroundRun===run&&!run.cancelled,allowActions:body.allowActions!==false,record:false}));
   const message=typeof result.message==='string'?result.message.trim():'';
   if(message)try{companion.recordTurn(`${said}: ${characterPrefix(message,600)}`,'assistant',companion.session(scope),scope,thread);}catch(error){host.diagnostics.record(error,'foxBackground');}
   return {message};
  }catch(error){
   if(run.cancelled||(error as Error)?.name==='AbortError')throw new Cancelled();
   host.diagnostics.record(error,'foxBackground');throw error;
  }finally{
   if(backgroundRun===run)backgroundRun=null;
   finishTurn(id,run.cancelled);
  }
 }
 function backgroundCancel(){if(backgroundRun){backgroundRun.cancelled=true;backgroundRun.runtime.cancel();backgroundRun=null;}}
 let primedAt=0;
 /** `agentWarm` on the built-in Hermes, which has no resident Harness session: the conversation's next turn without
  * its message (`warm`'s prime), with the same session and instructions agentChat sends, so the session Hermes
  * resumes now is the one that turn uses (owner report 2026-10-08, "a hi is slow"). At most once a minute. */
 async function primeConversation(thread:string):Promise<boolean> {
  const scope=foxScope(),runtime=agent();
  if(!runtime||runtime.id!=='hermes'||agentTurn!==null||scope.sample||scope.setup||!store.writable||Date.now()-primedAt<60_000)return false;
  primedAt=Date.now();
  const bound=await harnessAgents.forTurn(thread);
  // A thread on another of the person's agents has nothing here to prime.
  if(bound.agent)return false;
  const archive=companion.archive(scope);
  runtime.warm(home(scope),{action:'chat',session:companion.session(scope),mode:'chat',history:[],context:{},thread,style:companion.prompt(companion.reference(archive))+guidanceFor(scope)+bound.instructions,sample:false});
  return true;
 }
 async function agentChat(body:Row){
  if(body.background===true)return backgroundChat(body);
  const receivedAt=performance.now();
  const scope=foxScope();
  if(!store.writable||typeof body.id!=='string'||typeof body.text!=='string')throw new WorldletError('Invalid Fox request.');
  if(agentTurn!==null)throw new WorldletError('Fox is already working.');
  const runtime=requireAgent(),lane=chatRuntime(),id:string=body.id,text:string=body.text;
  agentTurn=id;trusts.set(id,{});
  // The person's words come first: a line Fox was thinking of saying is dropped, and replying to
  // one Fox said, or asking it to be quiet, changes when it speaks first next.
  // A request Worldlet wrote for a button (the day's plan, a meeting's summary) is kept as what the person saw,
  // its label, never as a long paragraph in their name (owner Order 2026-10-07).
  const said=typeof body.shown==='string'&&body.shown.trim()?body.shown.trim():text;
  proactiveCancel();proactiveHeard(proactive,{now:Date.now()/1000,text:said});
  try{
   // What happened here lately rides along as identifiers, so Fox knows what you just did
   // without asking; how Fox speaks rides along in your words.
   const given=body.context&&typeof body.context==='object'&&!Array.isArray(body.context)?body.context as Row:undefined;
   const context:Row=scope.setup?{}:{...given};
   if(!scope.setup)context.history=recentHistory();
   // The place this turn is said in, its own earlier turns, and lately in the browser (spatial context
   // switching, core/companion/conversation-place.ts). The conversation itself stays one.
   const thread=typeof body.thread==='string'?body.thread.slice(0,1100):'';
   if(!scope.setup){
    try{const here=companion.place(scope,thread);if(here)context.here=here;}catch(error){host.diagnostics.record(error,'foxPlace');}
    if(!scope.sample&&store.state.cloudConsent===true)try{
     // The page on screen is saved first and marked, so Fox tells it apart from earlier visits.
     const page=browser()?.visiblePage(),shown=page&&!page.hidden&&!page.isClosed?page.recorder:null;
     shown?.flush?.();
     context.browsing=core<Row[]>('recentBrowsing',{visits:store.ledger().recentWebVisits(8),now:Date.now()/1000,open:shown?.openVisit?.()??''});
    }catch(error){host.diagnostics.record(error,'foxPlace');}
   }
   const profileArchive=companion.archive(scope);
   // Stateless adapters receive the same recent foreground conversation; session-owning
   // adapters must not replay it.
   const history=profileArchive.conversations.slice(-6).map((turn:Row)=>({role:turn.role,text:characterPrefix(turn.text,2000)}));
   const session=companion.session(scope),since=worldSince(scope,thread);
   companion.recordEvent(id,'sent',scope,said);
   companion.recordTurn(said,'user',session,scope,thread);
   const guidance=guidanceFor(scope);
   // `thread`: a Harness with a resident session keeps one per Fox thread (main, an item card's, an Applet's), on the
   // person's agent bound where it is said (`harnessAgent`, fox/harness-agents.ts) when it is not the main one, with
   // the person's notes for that place in its instructions.
   const bound=scope.sample||scope.setup?{instructions:''}:await harnessAgents.forTurn(thread);
   // And the model chosen for that Applet (`harnessModel`, fox/harness-models.ts), when the Agent has several.
   const harnessModel=scope.sample||scope.setup?undefined:await harnessModels.forTurn(thread,bound.agent);
   const chatBody={action:'chat',session,mode:scope.setup?'setup':'chat',text,history,context,thread,...bound.agent?{harnessAgent:bound.agent}:{},...harnessModel?{harnessModel}:{},...since?{worldSince:since}:{},style:companion.prompt(companion.reference(profileArchive))+guidance+bound.instructions,sample:scope.sample};
   try{
    const result=await lane.run(chatBody,home(scope),turnEvents(id,scope,{active:()=>agentTurn===id,allowActions:body.allowActions!==false,record:true}));
    companion.recordEvent(id,'completed',scope,typeof result.message==='string'?result.message:null);
    if(!scope.setup)replyEnded();
    if(typeof result.message==='string'&&result.message)companion.recordTurn(result.message,'assistant',session,scope,thread);
    const {compactSoon,...reply}=result;
    if(compactSoon===true&&!scope.setup&&!scope.sample)compactWhileIdle(session,home(scope));
    const timings=reply.timings&&typeof reply.timings==='object'?{...reply.timings}:{};
    timings.nativeQueueMs=0;timings.nativeTotalMs=Math.round(performance.now()-receivedAt);
    return {...reply,timings};
   }catch(error){
    const cancelled=agentTurn!==id||(error as Error)?.name==='AbortError';
    companion.recordEvent(id,cancelled?'interrupted':'failed',scope);
    if(!cancelled&&!scope.setup)replyEnded(error);
    throw cancelled?new Cancelled():error;
   }
  }finally{
   finishTurn(id,agentTurn!==id);
   if(agentTurn===id)agentTurn=null;
  }
 }
 // The person started typing or opened Fox (page `agentWarm`): the thread's resident session in their own Agent opens
 // now, on its Applet's agent and model, so the first word of the reply does not wait for it. Only an Agent that
 // declares the `conversation` service has one to open; a thread warmed in the last 20 seconds shares that warm-up.
 const warming=new Map<string,{at:number;done:Promise<boolean>}>();
 function warmThread(thread:string):Promise<boolean> {
  const harness=agent()?.harness,place=thread.slice(0,1100),last=warming.get(place);
  if(store.writable&&!harness)return primeConversation(place).catch(error=>{host.diagnostics.record(error,'foxPrime');return false;});
  if(!store.writable||!harness||harnessService(harness.id,'conversation')===null)return Promise.resolve(false);
  if(last&&Date.now()-last.at<20_000)return last.done;
  const done=(async()=>{
   const scope=foxScope();
   if(scope.setup||agentTurn!==null)return false;
   const harnessAgent=scope.sample?undefined:(await harnessAgents.forTurn(place)).agent;
   const harnessModel=scope.sample?undefined:await harnessModels.forTurn(place,harnessAgent);
   const result=await chatRuntime().run({action:'warmup',mode:'chat',thread:place,sample:scope.sample,...harnessAgent?{harnessAgent}:{},...harnessModel?{harnessModel}:{}},home(scope));
   return result?.warm===true;
  })().catch(error=>{host.diagnostics.record(error,'foxWarm');return false;});
  warming.set(place,{at:Date.now(),done});
  return done;
 }
 // A long conversation near the Agent's compression threshold is summarized right after a reply, while Fox is
 // idle, instead of before the person's next message, which used to sit silent for minutes. The Agent does the
 // summary (Hermes `session.compress`); Fox's name tag says so, with no card. A message sent meanwhile waits for
 // it in the same lane and is never cut off (core preemptAgentWork).
 let compacting=false;
 function compactWhileIdle(session:unknown,where:string){
  if(compacting)return;
  compacting=true;
  const status=(text:string)=>page.event('worldlet:fox-status',{source:'compacting',text});
  status('Tidying up our long conversation…');
  void requireAgent().make().run({action:'compact',session,_background:true},where)
   .catch(error=>{if((error as Error)?.name!=='AbortError')host.diagnostics.record(error,'foxCompact');})
   .finally(()=>{compacting=false;status('');});
 }

 // Dialogs -------------------------------------------------------------------------------------
 const window=()=>host.window();
 const confirm=async(options:MessageBoxOptions)=>{const parent=window();return (parent?await dialog.showMessageBox(parent,options):await dialog.showMessageBox(options)).response;};
 const saveDialog=async(options:SaveDialogOptions)=>{const parent=window();const result=parent?await dialog.showSaveDialog(parent,options):await dialog.showSaveDialog(options);return result.canceled?null:result.filePath??null;};
 const openDialog=async(options:OpenDialogOptions)=>{const parent=window();const result=parent?await dialog.showOpenDialog(parent,options):await dialog.showOpenDialog(options);return result.canceled?null:result.filePaths[0]??null;};
 const reloadWorld=()=>setTimeout(()=>{const view=host.worldView();if(view&&!view.webContents.isDestroyed())view.webContents.reload();},100);

 host.provide<CompanionService>(COMPANION,{
  archive:()=>companion.archive(),
  capture:()=>companion.capture(companion.archive()),
  recall:args=>companion.recall(args)
 });
 host.provide<FoxService>(FOX,{scope:foxScope,turnActive:()=>agentTurn!==null,cancel:cancelCloud,stopRoutines,startRoutines,
  startAppletTask:request=>appletTaskStart(request),reviewGames:request=>appletTaskStart(request,true),makeArtifactPage:request=>appletTaskStart({...request,applet:ARTIFACT_PAGE_MAKER.id},true,true),appletTask:id=>appletTasks.get(id)?.applet??null,
  energy:()=>readFoxEnergy(requireAgent(),error=>host.diagnostics.record(error,'foxEnergy')),report});

 host.register({
  modelStatus:()=>foxModelStatus(),
  // Settings › Model: the Agent in use, the model it is set to, whether its sign-in or key is there, and how
  // the last reply ended. Reading it starts nothing new.
  modelHealth:async()=>{
   const runtime=agent();let model:Row={},error='';
   if(runtime?.available)try{model=await runtime.status(home({sample:false,setup:false}));}catch(e){error=(e as Error)?.message||'Fox could not read its model connection.';}
   // Where Fox's Agent runs (Harness service `location`): here, or the computer a paired Worldlet runs it on.
   return {agent:runtime?.id??null,available:runtime?.available===true,error,lastReply,location:harnessLocation(runtime?.id??'',model),
    model:{name:String(model.name??''),id:String(model.model??''),provider:String(model.provider??''),source:typeof model.source==='string'?model.source:null,ready:model.ready===true,configured:model.configured===true}};
  },
  foxEnergy:()=>readFoxEnergy(requireAgent(),error=>host.diagnostics.record(error,'foxEnergy')),
  // The person's scheduled jobs on their own Agent's scheduler (its `schedule` service), for the World's top-right:
  // names and schedules only, never prompts. None when the Agent declares no scheduler.
  foxRoutines:async()=>{
   const schedule=agent()?.schedule?.();
   if(!schedule||store.sampleEnabled())return {jobs:[]};
   const jobs=await schedule.jobs().catch(error=>{host.diagnostics.record(error,'foxRoutines');return [];});
   return {jobs:jobs.map(job=>({id:job.id,name:job.name,kind:job.kind,paused:job.paused,when:job.when}))};
  },
  foxProactive:request=>proactiveStart(request),
  foxProactiveShown:request=>proactiveShown(request),
  foxBrowse:request=>proactiveBrowse(request),
  foxPreferences:async request=>{
   if(typeof request.cloudConsent==='boolean')setCloudConsent(request.cloudConsent);
   if(request.autoSync===true)throw new WorldletError('Ask Fox to read a connected app. Automatic source mirroring is no longer used.');
   // Preferences and consent remain available while a fresh install prepares the runtime.
   let model:Row;
   try{const runtime=requireAgent();model=runtime.available?await runtime.status(runtime.home('private')):{ready:false};}
   catch(error){host.diagnostics.record(error,'foxPreferences');model={ready:false};}
   let voices:Row[]=[];
   try{voices=await speech()?.voices()??[];}catch(error){host.diagnostics.record(error,'foxPreferences');}
   const service=analytics();
   return {platform:store.options.platform,hostCapabilities:store.options.capabilities(),model:{name:model.name??'',ready:model.ready??false,provider:model.provider??'',harness:agent()?.harness?.title??null},
    cloudConsent:store.state.cloudConsent===true,autoSync:store.state.autoSync===true,companionStyle:style.current(),spokenReplies:preferences.bool('worldlet.spokenReplies'),talkReplies:preferences.bool('worldlet.talkReplies',true),
    // The wake word where local Whisper runs (Mac and Windows), off by default and kept on this computer.
    ...(speech()?.localSupported?{wakeWord:preferences.bool('worldlet.wakeWord'),wakeState:speech()?.wakeState??'off'}:{}),
    spokenVoice:preferences.string('worldlet.spokenVoice'),agentVoice:!!agent()?.voice?.(),morningBrief:readMorningBrief(preferences.string('worldlet.morningBrief')),voices,sampleEnabled:store.sampleEnabled(),
    usageAnalyticsEnabled:service?service.enabled():preferences.get('WorldletUsageAnalyticsEnabled')!==false};
  },
  foxPreferenceChange:async request=>{
   if(!store.writable)throw new WorldletError('Preferences are read-only.');
   const {setting,value}=request;
   if(setting==='usage_analytics'&&typeof value==='boolean'){
    const service=analytics();
    if(service)service.setEnabled(value);else preferences.set('WorldletUsageAnalyticsEnabled',value);
   }else if(setting==='text_size'){
    store.savePresentation({action:'setTextScale',value:value??null});
   }else if(setting==='auto_sync'&&typeof value==='boolean'){
    if(value)throw new WorldletError('Ask Fox to read a connected app instead.');
    store.state.autoSync=false;store.persist();
   }else if(setting==='companion_style'&&typeof value==='string'){
    companion.update({personality:style.clean(value)});style.set(value);
   }else if(setting==='attention_focus'&&['auto','work','personal'].includes(value)){
    preferences.set('worldlet.attentionFocus',value);
    page.event('worldlet:attention-focus',{mode:value});
   }else if(setting==='spoken_replies'&&typeof value==='boolean'){
    preferences.set('worldlet.spokenReplies',value);if(!value)speech()?.stopSpeaking();
   }else if(setting==='talk_replies'&&typeof value==='boolean'){
    preferences.set('worldlet.talkReplies',value);if(!value)speech()?.stopSpeaking();
   }else if(setting==='wake_word'&&typeof value==='boolean'&&speech()?.localSupported){
    preferences.set('worldlet.wakeWord',value);await speech()?.setWakeWord(value);
   }else if(setting==='spoken_voice'&&typeof value==='string'&&(value===''||(await speech()?.voices().catch(()=>[])??[]).some(voice=>voice.id===value))){
    preferences.set('worldlet.spokenVoice',value);
   }else if(setting==='companion_name'&&typeof value==='string'&&value.trim()&&characterCount(value)<=24){
    companion.update({name:value.trim()});preferences.set('worldlet.companionName',value.trim());
   }else if(setting==='companion_look'&&typeof value==='string'){
    // Colors only: the rig, performances and identity stay the same.
    let look;try{look=parseCompanionLook(value);}catch(error){throw new WorldletError(error.message);}
    if(companionLookIsClassic(look))preferences.remove('worldlet.companionLook');else preferences.set('worldlet.companionLook',look);
    page.event('worldlet:companion-appearance',{name:style.name(),look});
    return {ok:true,look,companionStyle:style.current()};
   }else if(setting==='morning_brief'&&typeof value==='string'){
    // What the 6 AM brief holds, in the person's words (core/artifacts/daily.ts); empty or the default keeps the default.
    const brief=readMorningBrief(value);
    if(brief===MORNING_BRIEF_DEFAULT)preferences.remove('worldlet.morningBrief');else preferences.set('worldlet.morningBrief',brief);
    page.event('worldlet:morning-brief',{brief});
    return {ok:true,morningBrief:brief};
   }else if(setting==='companion_motion'&&['idle','happy','waving','sleeping'].includes(value)){
    page.event('worldlet:companion-appearance',{name:style.name(),expression:value});
   }else throw new WorldletError('Unsupported preference value.');
   if(setting==='companion_name')page.event('worldlet:companion-appearance',{name:style.name()});
   return {ok:true,companionStyle:style.current()};
  },
  modelSettings:()=>{speech()?.cancelCapture();showControls('model');return {ok:true};},
  settings:()=>{speech()?.cancelCapture();showControls('preferences');return {ok:true};},
  foxControls:request=>{
   if(typeof request.screen!=='string'||!CONTROL_SCREENS.includes(request.screen))throw new WorldletError('Unknown Fox guide.');
   showControls(request.screen,typeof request.provider==='string'?request.provider:null);
   return {ok:true,message:'Fox will show the guide. No permission or connection has been changed.'};
  },
  restartFox:async()=>{
   await stopFox();
   host.optional<AudioService>(AUDIO)?.setDucked(false,'live');
   await sleep(600);
   worldTools()?.start();startRoutines();
   return {ok:true};
  },
  resetFox:async()=>{
   const runtime=agent();
   const explanation=runtime?.resetExplanation()??"This deletes Worldlet's companion archive, conversations, saved items and local connections. Worldlet then starts onboarding again. This cannot be undone.";
   if(await confirm({type:'warning',message:'Reset Worldlet?',detail:explanation,buttons:['Reset','Cancel'],defaultId:0,cancelId:1})!==0)return {cancelled:true};
   const retained=runtime?runtime.resetRetainedPaths():new Set(['agent']);
   const reset=async()=>{
    await stopFox();
    host.optional<AudioService>(AUDIO)?.setDucked(false,'live');
    await sleep(600);
    browser()?.stop();browser()?.resetHistory();
    companion.closeLedgers();companion.style.inherit(null);
    pendingCompanion=null;writeUndos.clear();trusts.clear();
    await resetToFirstLaunch(host,retained);await runtime?.forgetSetupChoice?.();
   };
   // No Agent process may start while its files move: the page keeps asking for the model status.
   try{await (runtime?runtime.whileStopped(reset):reset());}
   finally{worldTools()?.start();startRoutines();}
   return {ok:true};
  },
  localAgent:request=>localAgent(request),
  localHermes:request=>localAgent(request),
  companionMemory:async request=>{
   if(request.operation!=='save')return companion.memoryManager(request);
   if(agentTurn!==null||store.busy||interactive())throw new WorldletError('Let Fox finish before saving memory changes.');
   await stopFox();
   try{return companion.memoryManager(request);}
   finally{worldTools()?.start();startRoutines();}
  },
  companionArchive:async request=>{
   if(store.sampleEnabled()||!store.writable||agentTurn!==null||store.busy||interactive())throw new WorldletError('Finish the current task and return to your personal world first.');
   switch(request.operation){
    case 'export':{
     const data=companion.exportArchive();
     const file=await saveDialog({defaultPath:'Companion.worldletcompanion',message:'Contains private memories and conversations. Account credentials are excluded.'});
     if(!file)return {cancelled:true};
     writeAtomic(file,data);
     return {ok:true};
    }
    case 'choose':{
     const file=await openDialog({properties:['openFile']});
     if(!file)return {cancelled:true};
     if(fs.statSync(file).size>16_000_000)throw new WorldletError('Companion archive is too large.');
     const archive=decode(fs.readFileSync(file)),id=crypto.randomUUID().toUpperCase();
     pendingCompanion={id,archive};
     return {id,name:archive.identity.name,memories:archive.memories.length,messages:archive.conversations.length};
    }
    case 'cancel':pendingCompanion=null;return {ok:true};
    case 'import':{
     const pending=pendingCompanion;
     if(typeof request.id!=='string'||!pending||pending.id!==request.id)throw new WorldletError('Choose and review a companion archive first.');
     stopRoutines();await agent()?.shutdown();
     try{
      const rollback=companion.importArchive(pending.archive);pendingCompanion=null;
      reloadWorld();
      return {ok:true,rollback:rollback?path.basename(rollback):''};
     }finally{startRoutines();}
    }
    default:throw new WorldletError('Unknown companion archive operation.');
   }
  },
  companionProfile:()=>{
   const sample=store.sampleEnabled(),profile=companion.archive({sample,setup:false});
   let knowledge;
   try{knowledge=knowledgeOf(profile,!sample&&store.writable?store.ledger():null);}catch{knowledge=knowledgeOf(profile,null);}
   return {name:profile.identity.name,createdAt:profile.identity.createdAt,personality:profile.personality,attentionFocus:preferences.string('worldlet.attentionFocus')||'auto',look:normalizeCompanionLook(preferences.get('worldlet.companionLook')),
    knowledge};
  },
  speakReply:async request=>{
   const voice=speech();
   if(request.stop===true){voice?.stopSpeaking();return {ok:true};}
   if(typeof request.text==='string'&&characterCount(request.text)<=12000){
    if(!voice)throw new WorldletError('Spoken replies are unavailable in this build.');
    // Talk with Fox reads its replies unless Settings › Voice turned that off; elsewhere Spoken replies decides.
    const enabled=request.talk===true?preferences.bool('worldlet.talkReplies',true):preferences.bool('worldlet.spokenReplies');
    return {ok:true,spoken:await voice.speak(request.text,enabled,preferences.string('worldlet.spokenVoice'),agent()?.voice?.()??null)};
   }
   return {ok:true};
  },
  conversationRecall:request=>companion.conversationRecall(request.rows),
  ...Object.fromEntries(['agentCancel','hermesCancel'].map(action=>[action,(request:Row)=>{
   speech()?.stopSpeaking();
   if(request.id===agentTurn){chat?.cancel();agentTurn=null;}
   else if(typeof request.id==='string'&&request.id===backgroundRun?.id)backgroundCancel();
   return {ok:true};
  }])),
  ...Object.fromEntries(['agentSteer','hermesSteer'].map(action=>[action,async(request:Row)=>{
   if(!store.writable||typeof request.id!=='string'||request.id!==agentTurn||typeof request.text!=='string'||!chat)return {accepted:false};
   const scope=foxScope();
   companion.recordEvent(request.id,'supplement',scope,request.text);
   const accepted=await chat.steer(request.text);
   companion.recordEvent(request.id,accepted?'supplement_accepted':'supplement_rejected',scope);
   return {accepted};
  }])),
  ...Object.fromEntries(['agentChat','hermesChat'].map(action=>[action,(request:Row)=>agentChat(request)])),
  // The person opened Fox's message field: the conversation gets ready while they type, so the first message after
  // an idle stretch does not wait for its session to resume (owner report 2026-10-08, "a hi is slow").
  // Fox's own start_applet_task (owner decision 2026-10-08). After untrusted content in the
  // starting turn the task inherits that state (turnTrustInherit in appletTaskStart), so its
  // guarded writes, navigation and page effects are checked as this turn's would be.
  appletTaskStart:request=>appletTaskStart(request),
  appletTaskCancel:request=>{
   const task=typeof request.id==='string'?appletTasks.get(request.id):undefined;
   if(task){task.cancelled=true;task.runtime.cancel();}
   return {ok:true};
  },
  appletTasks:()=>({tasks:[...appletTasks.values()].map(task=>({id:task.id,applet:task.applet,startedAt:task.startedAt}))}),
  /** The person's own agents in Fox's Harness, who answers an Applet's thread and why (`list`), or a binding or notes
   * for one of its places (`choose`). */
  harnessAgents:request=>request.operation==='choose'?harnessAgents.choose(request.applet,request.agent,request.scope??'applet',request.note):harnessAgents.list(request.applet),
  /** The same Agent's models and the one answering an Applet's thread (`list`), or a new choice; on the agent that
   * answers there. */
  harnessModels:async request=>{
   const agent=typeof request.applet==='string'?(await harnessAgents.forTurn(JSON.stringify(['object:'+request.applet,'']))).agent:undefined;
   return request.operation==='choose'?harnessModels.choose(request.applet,request.model??null,agent):harnessModels.list(request.applet,agent);
  },
  /** The skills the World shows and Fox's offers to save one (`list`), or an offer saved or declined. */
  foxSkills:request=>skills.request(request),
  /** The person started typing or opened Fox in `thread` (the chat's place thread): open its session now. */
  agentWarm:async request=>({warm:await warmThread(typeof request.thread==='string'?request.thread:'fox-main')}),
  /** Settings › Approvals: every standing rule an Always left in a Harness here (`list`), or one revoked (`revoke`). */
  harnessApprovalRules:request=>request.operation==='revoke'?approvalRules.revoke(request.harness,request.id):approvalRules.list(),
  /** Settings › Integrations: the MCP servers and chat accounts in each Agent here (`list`), the exact command a change
   * would run with its confirmation (`preview`), or that confirmed change run (`change`). */
  harnessConnections:request=>request.operation==='preview'?agentConnections.preview(request.harness,request):request.operation==='change'?agentConnections.change(request.confirm):agentConnections.list(),
  harnessApproval:async request=>{
   const approvals=agent()?.approvals?.()??null;
   if(!approvals||typeof request.id!=='string'||!isHarnessApprovalChoice(request.choice))throw new WorldletError('This request can no longer be answered.');
   await approvals.answer(request.id,request.choice);
   approvalRules.answered(request.id,request.choice);
   // Every copy of the card (this computer, the phone) settles.
   page.event('worldlet:harness-approval',{id:request.id,settled:request.choice});
   return {ok:true};
  },
  worldWriteUndo:request=>{
   const undo=typeof request.id==='string'?writeUndos.get(request.id):undefined;
   if(!undo)throw new WorldletError('This change can no longer be undone.');
   store.undoGuardedWrite(undo);writeUndos.delete(request.id);
   return {ok:true};
  },
  localArchive:()=>{
   const file=path.join(host.profile.root,'archives','notion-world.json');
   if(!fs.existsSync(file))return null;
   const bytes=fs.readFileSync(file);
   let archive:Row|null=null;
   try{if(bytes.length<=25_000_000)archive=JSON.parse(bytes.toString('utf8'));}catch{}
   if(!archive||typeof archive!=='object'||!Array.isArray(archive.pages)||!Array.isArray(archive.spaces))throw new WorldletError('Invalid local Notion export.');
   return archive;
  },
  // Legacy clients may still request a rendered-world cache; durable state rebuilds it.
  saveWorld:()=>({ok:true,skipped:true})
 });

 async function localAgent(request:Row){
  const runtime=requireAgent();
  if(request.operation==='bind'){
   if(!store.writable||store.sampleEnabled()||typeof request.path!=='string')throw new WorldletError('Return to your own world before attaching an Agent.');
   cancelCloud();
   const profile=runtime.bindProfile(request.path);
   style.inherit(profile.name);
   return profile;
  }
  if(request.operation==='adopt'){
   // After setup chose one of the person's own Agents (`agentHarness` `select`): copy its name and
   // memory, then its conversations, notes, skills and scheduled jobs, the same way for each.
   if(!isMigrationSource(request.id))throw new WorldletError('Choose an Agent on this computer.');
   const memory=readLocalAgentMemory(request.id);
   // Its skills and scheduled jobs stay with that Agent: Worldlet sets nothing up below the Agent (owner decision
   // 2026-10-09). A Hermes Agent's history needs no copy: it is the Agent Fox can talk through.
   // Bringing again starts over, older conversations included (older-history.ts).
   older.reset(request.id);
   const brought=request.id!=='hermes'?await bringAgent(request.id,{companion,world:store.ledger(),ownFolders:[path.join(host.profile.root,'agent')],own:ownHarnessSession(request.id,store.ledger().ownHarnessSessions(request.id)),hermesHome:null,importRoutines:null}):null;
   // A brought conversation that looks like one job carried on is proposed as an Applet (core/tasks), and the
   // recent ones are read for the Attention Center; a large history's older part follows in the background.
   if(brought)host.optional<OngoingService>(ONGOING)?.refresh();
   older.start(request.id,brought?.older);
   // A few words for each fact setup's second page shows, from its own files.
   const summary=summarizeLocalAgent(request.id,memory);
   // A Hermes Agent's history stays where it is, so setup's Conversations tile lists its newest few from its own
   // files instead (title and when it was last written to); they are shown on this computer only.
   const recent=request.id==='hermes'?(()=>{try{return (hermesThreads()??[]).sort((a,b)=>b.last-a.last).slice(0,8).map(chain=>({title:chain.title,at:chain.last*1000}));}catch{return [];}})():[];
   if(!memory&&!brought)return {name:null,memories:[],model:null,summary,...recent.length?{recent}:{}};
   // Fox talks through this very Agent: its memory already is Fox's, so only its name is taken (copying it into
   // a memory Fox does not use failed setup's bring, 2026-10-09).
   const through=runtime.id===localHarnessAdapterId(request.id as any);
   const longTerm=through?'':[memory?.longTerm??'',brought?.note??''].filter(Boolean).join('\n\n');
   const result=companion.adoptMemory({name:memory?.name??null,soul:through?'':memory?.soul??'',user:through?'':memory?.user??'',longTerm,source:MIGRATION_SOURCE_TITLES[request.id]+' on this computer'});
   if(result.name)page.event('worldlet:companion-appearance',{name:style.name()});
   return {...result,summary,model:null,...recent.length?{recent}:{},...brought?{history:{conversations:brought.conversations,messages:brought.messages,notes:brought.notes,skills:brought.skills.length,routines:brought.routines.length,stayed:brought.stayed,partial:brought.partial,list:brought.list,...brought.older?{older:brought.older.remaining}:{}}}:{}};
  }
  return runtime.profile(true);
 }
 host.onPageLoaded(()=>{
  subscribe();
  agent()?.onChannelTool?.(channelToolReply);
  older.resume();
  history.start();
  if(store.state.cloudConsent===true&&!store.sampleEnabled())startRoutines();
  const runtime=agent();
  try{runtime?.warm(home(foxScope()));}catch(error){host.diagnostics.record(error,'warm');}
 });
 // The page that started a turn is gone; its tools and stream have no listener left.
 host.onPageReload(()=>{if(agentTurn!==null)cancelCloud();cancelAppletTasks();});
 host.onQuit(()=>{older.stop();history.stop();powerMonitor.off('resume',resumed);stopRoutines();chat?.cancel();cancelAppletTasks();companion.closeLedgers();});
}
