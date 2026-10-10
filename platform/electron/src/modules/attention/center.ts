import fs from 'node:fs';
import path from 'node:path';
import {core} from '../../core.ts';
import {digest,readJSON,WorldletError} from '../../files.ts';
import {canBuild} from '../../store/world-store.ts';
import {presentMailRead} from '../sources/records.ts';
import {Cancelled} from '../../store/ledger.ts';
import {AGENT,COMPANION,SOURCES,USER_ACTIVITY} from '../../host/services.ts';
import type {AgentRuntime,AgentService,CompanionService,SourcesService,UserActivityService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {worldTool,worldToolReply} from './tools.ts';
import {CONTEXT_CHANGED,SOURCE_PAUSED,now,uuid,message,isCancel,isValidation,checkCancellation,isRow,rows,strings,int,characterPrefix,internetDate,isoSeconds,sleep} from './util.ts';

/** Work started under one `start()`; `stop()` aborts it and the next start gets fresh lanes. */
class Session {
 readonly controller=new AbortController();
 get signal(){return this.controller.signal;}
 loop=false;
 attentionWake=false;
 sourceCheckTasks=0;
 onboardingMail=false;
 analysisTasks=new Set<string>();
}

/** Port of the Mac host's AttentionCenter, AppletRuntime, WorldInteraction checks and RuntimeTasks.
 * Planning, settlement and every product decision are shared Core operations; this class only
 * holds turn state, reads and writes the ledger, and drives Agent lanes. */
export class AttentionCenter {
 readonly host:Host;
 // Turn-scoped receipts (Mac WorldStore.worldRead*/worldAcknowledged); evidence lives on the store.
 readTickets=new Map<string,Map<string,string>>();
 readCounts=new Map<string,number>();
 readFailures=new Set<string>();
 acknowledged=new Set<string>();
 analysisProviders=new Map<string,string>();
 analysisCandidates=new Map<string,Row[]>();
 synthesisFacts=new Map<string,Row[]>();
 synthesisPlans=new Map<string,Row>();
 activeSourceChecks=new Set<string>();
 attentionRunning=false;
 private readers=new Map<string,AgentRuntime>();
 private analysisAgents=new Map<string,AgentRuntime>();
 private checkAgent:AgentRuntime|null=null;
 private session=new Session();
 private runtimeRegistry:Row[]|null=null;
 private attentionRegistry:Row[]|null=null;
 constructor(host:Host){this.host=host;}

 // Facts ----------------------------------------------------------------------------------
 get store(){return this.host.store;}
 get writable(){return this.store.writable;}
 get consent(){return this.store.state.cloudConsent===true;}
 sample(){return this.store.sampleEnabled();}
 db(){return this.store.ledger();}
 agentService(){return this.host.optional<AgentService>(AGENT);}
 agent(){const agent=this.agentService();if(!agent)throw new WorldletError('Agent runtime is not available.');return agent;}
 sources(){return this.host.optional<SourcesService>(SOURCES);}
 supportsBackgroundChecks(){return this.agentService()?.supportsBackgroundChecks===true;}
 interactive(){return this.agentService()?.hasInteractiveWork()===true;}
 /** Seconds since the person's last input; 0 (active) when the host reports no activity fact. */
 idleSeconds(){try{const value=this.host.optional<UserActivityService>(USER_ACTIVITY)?.idleSeconds();return typeof value==='number'&&Number.isFinite(value)?value:0;}catch{return 0;}}
 /** Idle installations start no scheduled source checks, Applet analysis or synthesis (#1650). */
 idle(){try{return core('userIdle',{idleSeconds:this.idleSeconds()})===true;}catch{return false;}}
 connected(provider:string){return this.store.state.connections.some(c=>c.provider===provider&&canBuild(c));}
 nativeConnected(provider:string){return this.store.state.connections.some(c=>c.provider===provider&&c.transport==='native'&&canBuild(c));}
 persist(error:unknown,operation:string,requestId?:string){this.host.diagnostics.record(error,operation,requestId??'');}
 worldChanged(){this.store.worldChanged();}
 receiveAppletEvent(event:Row,turn:string){try{this.sources()?.receiveAppletEvent(event,turn);}catch(error){this.persist(error,'appletActivity',turn);}}
 finishAppletTurn(turn:string,cancelled=false){try{this.sources()?.finishAppletTurn(turn,cancelled);}catch(error){this.persist(error,'appletActivity',turn);}}
 /** Executable Applet contracts (webRoot/applet-runtime.json), validated by Core. */
 runtimeRows():Row[] {
  if(this.runtimeRegistry)return this.runtimeRegistry;
  const raw=JSON.parse(fs.readFileSync(path.join(this.host.profile.webRoot,'applet-runtime.json'),'utf8'));
  const valid=core('appletRuntimes',{rows:raw});
  if(!Array.isArray(valid))throw new WorldletError('Invalid Applet runtime registry.');
  return this.runtimeRegistry=valid;
 }
 runtimeSpec(provider:string):Row|null {return this.runtimeRows().find(row=>row.provider===provider&&(row.mode==='scheduled'||row.mode==='observation'))??null;}
 checkProviders(){try{return this.runtimeRows().filter(row=>row.mode==='scheduled').map(row=>row.provider as string);}catch{return [];}}
 attentionRegistrations():Row[] {
  if(this.attentionRegistry)return this.attentionRegistry;
  const raw=JSON.parse(fs.readFileSync(path.join(this.host.profile.webRoot,'attention-applets.json'),'utf8'));
  const valid=core('attentionRegistrations',{rows:raw});
  if(!Array.isArray(valid))throw new WorldletError('Invalid Applet attention registry.');
  return this.attentionRegistry=valid;
 }
 /** Background writes need current consent; per-finding currency is checked separately. */
 requireAttentionWritable(){if(!this.writable||!this.consent||this.sample())throw new Cancelled();}
 attentionSourceAuthorized(provider:string,turn:string){return this.connected(provider)||(provider==='weather'||provider==='conversations')&&this.consent&&this.synthesisFacts.has(turn);}
 enabledCheck(provider:string){return this.db().records('checks').some(row=>row.provider===provider&&row.enabled===true);}
 pausedProviders(){return this.db().records('checks').filter(row=>row.enabled===false).map(row=>row.provider);}
 findings(provider:string):Row {return this.db().find('applet-findings',provider)??{};}
 observations(provider:string):Row[] {return rows(this.db().find('applet-observations',provider)?.records);}

 // Turn lifecycle ---------------------------------------------------------------------------
 finishTurn(turn:string,cancelled=false){
  this.readTickets.delete(turn);this.readCounts.delete(turn);this.readFailures.delete(turn);
  delete this.store.worldEvidence[turn];this.acknowledged.delete(turn);
  this.finishAppletTurn(turn,cancelled);
 }
 cancelProvider(provider:string){
  this.readers.get(provider)?.cancel();
  if([...this.analysisProviders.values()].includes(provider))this.analysisRuntime(provider).cancel();
 }
 /** Cancels model-backed lanes when private context is no longer allowed; the clock keeps running. */
 cancelPrivateWork(){
  for(const reader of this.readers.values())reader.cancel();
  for(const agent of this.analysisAgents.values())agent.cancel();
  this.checkAgent?.cancel();
 }
 start(){
  const session=this.session;
  if(session.loop)return;
  session.loop=true;
  this.requestSourceChecks();this.requestAttentionSynthesis();this.requestAppletAnalysis();
  void (async()=>{
   try{
    while(!session.signal.aborted){
     let delay=60;
     try{const wake=core('runtimeNextWake',{checks:this.db().records('checks'),now:now()});if(typeof wake==='number'&&Number.isFinite(wake))delay=wake;}catch{}
     // While idle, look for the person's return every minute; their first input brings the one catch-up pass.
     if(this.idle())delay=Math.min(delay,60);
     await sleep(delay,session.signal);
     this.worldChanged(); // Refresh dependency expiry even without network or a model.
     if(this.idle())continue;
     this.requestAppletAnalysis();this.requestAttentionSynthesis();this.requestSourceChecks();this.requestAttentionSynthesis();
    }
   }catch{}finally{session.loop=false;}
  })();
 }
 stop(){
  const session=this.session;this.session=new Session();
  session.controller.abort();
  for(const reader of this.readers.values())reader.cancel();this.readers.clear();
  for(const agent of this.analysisAgents.values())agent.cancel();this.analysisAgents.clear();
  this.checkAgent?.cancel();this.checkAgent=null;
 }

 // Observations -----------------------------------------------------------------------------
 /** A current observation, never a forecast or proof of a future outdoor window. */
 observeWeather(value:Row){
  if(!this.writable||!this.consent||this.sample())return;
  const weather=value?.weather,observed=weather?.observedAt,temperature=weather?.temperature,clock=Date.now();
  if(!isRow(weather)||typeof observed!=='number'||observed>clock||clock-observed>=7_200_000||typeof weather.words!=='string'||typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<-150||temperature>100){
   this.observeAttention('weather',[{id:'current',text:'No current weather observation.',cancelled:true}]);return;
  }
  const previous=this.db().attentionFacts().find(f=>f.provider==='weather'&&f.sourceId==='current'&&f.removed!==true)?.text;
  const text=core('attentionWeatherText',{words:weather.words,temperature,previous:typeof previous==='string'?previous:''});
  if(typeof text!=='string')throw new WorldletError('Invalid weather observation.');
  this.observeAttention('weather',[{id:'current',title:'Current weather',observedAt:observed/1000,text,url:''}]);
 }
 /** Brought conversations active lately (core/tasks/attention.ts), read again by the Ongoing module after each
  * bring and every hour. An unchanged conversation renews its freshness without a model pass; one no longer
  * offered expires with its freshness, and items it supported leave the Center without being called done. */
 observeConversations(records:Row[]){
  if(!this.writable||!this.consent||this.sample()||!records.length)return;
  this.observeAttention('conversations',records.slice(0,50));
 }
 observeAttention(provider:string,records:Row[],publish=false){
  if(!this.writable||this.sample()||!(provider==='google-calendar'||this.consent))return;
  const storedAt=publish?null:this.storeAppletRecords(provider,records);
  const runtime=this.runtimeSpec(provider);
  if(runtime?.publishAttention===false)return;
  const db=this.db();
  if(runtime?.analysis==='source-small'&&!publish){
   // Refresh existing dependencies promptly; new candidates wait for analysis. The stored
   // observation time is stamped so a later republish of these rows is not ignored.
   const known=new Set(db.attentionFacts().filter(f=>f.provider===provider).map(f=>f.sourceId).filter(id=>typeof id==='string'));
   const changed:Row[]=records.filter(row=>known.has(typeof row.id==='string'?row.id:'')).map(row=>({...row,observedAt:storedAt}));
   if(changed.length){
    const revisions=Object.fromEntries(changed.filter(row=>typeof row.id==='string').map(row=>[row.id,this.analysisRevision(row)]));
    const refresh=core('appletAnalysisRefresh',{records:changed,saved:this.findings(provider),revisions});
    if(!Array.isArray(refresh))throw new WorldletError('Invalid analysis refresh');
    this.observeAttention(provider,refresh,true);
   }
   return;
  }
  if(!this.store.attentionProviders.includes(provider))return;
  const registration=this.attentionRegistrations().find(row=>row.provider===provider);
  if(!registration)return;
  const observations=records.filter(row=>row.metadataOnly!==true).flatMap(row=>{
   if(typeof row.id!=='string'||typeof row.text!=='string'||!row.text)return [];
   const attributes:Row={};
   for(const field of ['start','end','allDay','completed','cancelled','location','partial','analysisPending','image'])if(row[field]!==undefined)attributes[field]=row[field];
   const removed=row.cancelled===true||row.completed===true||row.status==='cancelled';
   let url='';
   if(typeof row.url==='string')try{const link=new URL(row.url);if(['https:','http:'].includes(link.protocol)&&link.hostname&&!link.username&&!link.password)url=row.url;}catch{}
   // The user's mail workflow (#1152); Core keeps only well-formed values.
   const workflow={placement:row.mailPlacement,unread:row.unread};
   // When the newest message arrived, as the reader reports it; Core keeps only a valid instant.
   const receivedAt=typeof row.receivedAt==='number'||typeof row.receivedAt==='string'?row.receivedAt:undefined;
   return [{id:row.attentionId??row.id,sourceId:row.id,title:row.title??'',text:characterPrefix(row.text,12000),fingerprint:digest(row.text),observedAt:row.observedAt??now(),url,attributes,workflow,removed,...(receivedAt!==undefined?{receivedAt}:{})}];
  });
  const facts=core('attentionObserve',{facts:db.attentionFacts(),registration,observations,deliveries:db.records('runtime-deliveries'),now:now()});
  if(!Array.isArray(facts))throw new WorldletError('Invalid attention context.');
  db.publishAttentionFacts(facts);
  this.requestAttentionSynthesis();
  this.worldChanged();
 }
 /** `current`: the ledger's attention facts and paused checks, when a caller already read them. */
 attentionManaged(item:Row,facts:Row[],mode:string,current?:{facts:Row[],paused:string[]}):Row {
  const dependencies=core('attentionDependencies',{item,facts});
  if(!Array.isArray(dependencies)||core('attentionCurrent',{dependencies,facts:current?.facts??this.db().attentionFacts(),providers:this.store.attentionProviders,now:now()})!==true)throw new WorldletError(CONTEXT_CHANGED);
  if(mode==='synthesis'){
   const paused=current?.paused??this.pausedProviders();
   if(rows(item.sources).some(ref=>paused.includes(ref.provider??'')))throw new WorldletError(SOURCE_PAUSED);
  }
  const result={...item};delete result.attentionInvalidated;result.attentionDependencies=dependencies;result.attentionMode=mode;
  return result;
 }
 /** Provider event timestamps are facts, not model-generated summaries. */
 calendarTimes(item:Row,evidence:Record<string,Row>):Row {
  const valid=Object.fromEntries(Object.entries(evidence).filter(([,source])=>internetDate(source?.start)));
  const result=core('worldItemCalendarTimes',{item,evidence:valid});
  if(!isRow(result))throw new WorldletError('Invalid calendar projection.');
  return result;
 }
 /** Present exactly the foreground read used by Fox, without fetching a different inbox. */
 presentMailRead(records:Row[],accumulate=false):Row[] {
  const shared=this.sources()?.presentMailRead;
  if(shared)return shared.call(this.sources(),records,accumulate);
  return presentMailRead(this.store,records,accumulate);
 }

 // Companion context ------------------------------------------------------------------------
 /** The private companion archive; the companion owner checkpoints it, else the saved profile. */
 companionArchive():Row|null {
  const owner=this.host.optional<CompanionService>(COMPANION);
  if(owner)return owner.archive();
  let archive:Row|null=this.store.ledger().companionStored('private','profile');
  if(!archive)return null;
  try{const agent=this.agentService();if(agent&&this.writable)archive=agent.checkpointCompanion(archive);}catch{}
  return archive;
 }
 /** Mac CompanionTransfer.capture: rotated history segments join the active profile. */
 companionWithHistory(profile:Row):Row {
  const conversations:Row[]=[...rows(profile.conversations)];
  const folder=path.join(this.store.root,'companion','history');
  if(fs.existsSync(folder)){
   const files=fs.readdirSync(folder,{withFileTypes:true}).filter(entry=>entry.name.endsWith('.json'));
   if(files.length>1000)throw new WorldletError('Too many history segments for one export.');
   for(const entry of files){
    if(entry.isSymbolicLink())throw new WorldletError('Companion history contains a symbolic link.');
    const file=path.join(folder,entry.name);
    if(fs.statSync(file).size>16_000_000)throw new WorldletError('Companion archive exceeds 16 MB.');
    const segment=readJSON(file);
    if(segment?.identity?.id!==profile.identity?.id)throw new WorldletError('Companion history identity mismatch.');
    conversations.push(...rows(segment.conversations));
   }
  }
  const seen=new Set<string>();
  const merged=conversations.filter(turn=>{if(seen.has(turn.id))return false;seen.add(turn.id);return true;}).sort((a,b)=>String(a.createdAt)<String(b.createdAt)?-1:String(a.createdAt)>String(b.createdAt)?1:0);
  return {...profile,conversations:merged};
 }
 readCompanionArchive(args:Row){
  const owner=this.host.optional<CompanionService>(COMPANION);
  if(owner)return owner.recall(args);
  const profile=this.companionArchive()??{format:'worldlet.companion',version:1,identity:{id:uuid(),name:this.host.preferences.string('worldlet.companionName','Fox')||'Fox',createdAt:isoSeconds()},personality:'',memoryAuthority:'worldlet',memories:[],conversations:[]};
  const archive=this.companionWithHistory(profile);
  // Recall reads Worldlet's copy of memories even when the Agent owns them.
  if(archive.memoryAuthority==='hermes')archive.memoryAuthority='worldlet';
  const result=core('companionRecall',{archive,args});
  if(!isRow(result))throw new WorldletError('Invalid companion recall result.');
  return result;
 }
 /** The world's present for a background check, as a chat turn already carries it. */
 monitorContext():Row {
  const date=new Date();
  const part=(options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',options).format(date);
  const context:Row={now:`${part({weekday:'short'})}, ${part({month:'short'})} ${part({day:'numeric'})}, ${part({hour:'numeric',minute:'2-digit',hour12:true})}`,instant:isoSeconds(date)};
  try{
   const weather=this.store.worldSetting('environment')?.weather;
   const observed=weather?.observedAt,temperature=weather?.temperature;
   // The two-hour limit is the page's own WEATHER_MAX_AGE.
   if(typeof observed==='number'&&date.getTime()-observed<7_200_000&&typeof temperature==='number'&&typeof weather.words==='string'&&weather.words)context.weather=weather.words+', '+String(Math.sign(temperature)*Math.round(Math.abs(temperature)))+'°';
  }catch{}
  context.timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  context.attentionFocus=this.host.preferences.string('worldlet.attentionFocus','auto')||'auto';
  try{
   let archive=this.companionArchive();
   const agent=this.agentService();
   if(archive&&agent)archive=agent.captureCompanion(archive,this.store.ledger().companionStored('private','session')!==null);
   if(archive)context.userContext={referenceOnly:true,memories:rows(archive.memories).filter(memory=>memory.kind!=='soul').slice(0,12).map(memory=>({kind:memory.kind,text:characterPrefix(String(memory.text??''),500)}))};
  }catch{}
  return context;
 }

 // Applet analysis --------------------------------------------------------------------------
 analysisRevision(row:Row){
  const content=core('analysisSourceContent',row);
  if(typeof content!=='string')throw new WorldletError('Invalid analysis source version.');
  return 'v2:'+digest(content);
 }
 private analysisRevisions(records:Row[]){
  const contents=core('analysisSourceContents',{rows:records});
  if(!Array.isArray(contents)||contents.length!==records.length)throw new WorldletError('Invalid analysis source versions.');
  const revisions:Record<string,string>={};
  records.forEach((row,index)=>{if(typeof row.id!=='string')throw new WorldletError('Missing analysis source ID.');revisions[row.id]='v2:'+digest(contents[index]);});
  return revisions;
 }
 analysisSourcesCurrent(records:Row[],latest:Row[]){
  const current=new Map(latest.filter(row=>typeof row.id==='string').map(row=>[row.id,row]));
  return records.every(source=>{const row=typeof source.id==='string'&&current.get(source.id);return !!row&&this.analysisRevision(row)===this.analysisRevision(source);});
 }
 /** The Applet keeps its own successful observations even with no Center subscriber. */
 storeAppletRecords(provider:string,records:Row[]){
  const db=this.db(),old=db.find('applet-observations',provider),at=now();
  const retained=core('appletObservations',{previous:old?.records??[],incoming:records,now:at});
  if(!Array.isArray(retained))throw new WorldletError('Invalid Applet observations');
  db.replaceAppletState('applet-observations',provider,{records:retained,updatedAt:at});
  return at;
 }
 saveAppletCandidates(provider:string,items:Row[],turn:string,processedIDs?:Set<string>){
  const db=this.db();
  const sources=Object.values(this.store.worldEvidence[turn]??{}).filter(row=>!processedIDs||processedIDs.has(typeof row.id==='string'?row.id:''));
  const processed=[...new Set(sources.map(row=>row.id).filter(id=>typeof id==='string'))];
  const saved=this.findings(provider);
  db.transaction(()=>{
   const latest=this.observations(provider);
   const next=core('appletAnalysisCommit',{provider,records:sources,latest,saved,items,processed,now:now(),revisions:this.analysisRevisions(sources),publishedSourceIds:db.attentionFacts().filter(f=>f.provider===provider).map(f=>f.sourceId).filter(id=>typeof id==='string')});
   if(!isRow(next))throw new WorldletError('Invalid Applet checkpoint');
   const publish=rows(next.publishRecords);delete next.publishRecords;
   if(publish.length)this.observeAttention(provider,publish,true);
   // Candidate checkpoint and outgoing deliveries commit under the same fence.
   db.replaceAppletState('applet-findings',provider,next);
  });
  this.acknowledged.add(turn);this.worldChanged();
  return {ok:true,candidates:items.length,published:false};
 }
 pendingAppletAnalysis(provider:string,limit=20):Row[] {
  if(this.runtimeSpec(provider)?.analysis!=='source-small')return [];
  const valid=this.observations(provider).filter(row=>typeof row.id==='string'&&typeof row.text==='string');
  const ordered=core('appletAnalysisPending',{records:valid,saved:this.findings(provider),revisions:this.analysisRevisions(valid)});
  if(!Array.isArray(ordered))throw new WorldletError('Invalid analysis queue order');
  return ordered.slice(0,Math.max(0,limit));
 }
 private retryingAppletAnalysis(provider:string,records:Row[]):string[] {return strings(core('appletAnalysisRetrying',{records,saved:this.findings(provider),revisions:this.analysisRevisions(records)}));}
 /** Content failures count per unchanged record; repeated failures run alone, then park until the source changes. */
 private recordAppletAnalysisFailure(provider:string,records:Row[],taskID:string,runID:string,code?:string){
  if(!['operation_failed','incomplete_coverage','unverified_output'].includes(code??''))return;
  const db=this.db();
  db.withRuntimeOutput(taskID,runID,()=>{
   const latest=this.observations(provider);
   const current=records.filter(row=>this.analysisSourcesCurrent([row],latest));
   const next=core('appletAnalysisFailed',{records:current,saved:this.findings(provider),latest,revisions:this.analysisRevisions(current)});
   if(!isRow(next))throw new WorldletError('Invalid analysis failure state');
   db.replaceAppletState('applet-findings',provider,next);
  });
 }
 analysisRuntime(provider:string){
  let agent=this.analysisAgents.get(provider);
  if(!agent){const service=this.agent();agent=service.makeBackground?.()??service.make();this.analysisAgents.set(provider,agent);}
  return agent;
 }
 private async analyzeAppletPage(provider:string,records:Row[],turn:string,signal:AbortSignal){
  if(!records.length)return;
  const epoch=this.store.attentionEpoch,session='applet-'+uuid();
  this.analysisProviders.set(session,provider);
  this.store.worldEvidence[session]=Object.fromEntries(records.filter(row=>typeof row.id==='string').map(row=>[provider+':'+row.id,row]));
  let submitted=false,queried=false,committed=false,yielded=false,changed=false;
  let processedIDs:string[]=[];
  const requiredIDs=records.map(row=>row.id).filter(id=>typeof id==='string');
  try{
   const context=this.monitorContext();
   const spec=this.runtimeSpec(provider);
   const timeout=int(spec?.analysisTimeoutSeconds)??600;
   this.receiveAppletEvent({provider,callId:session,phase:'reading'},turn);
   try{
    let instructions='';
    if(typeof spec?.analysisPrompt==='string'&&typeof spec?.key==='string')instructions=fs.readFileSync(path.join(this.host.profile.webRoot,'applets',spec.key,spec.analysisPrompt),'utf8');
    const request=core('appletAnalysisRequest',{timeoutSeconds:timeout,instructions});
    if(!isRow(request))throw new WorldletError('Invalid Applet analysis request');
    request.session=session;request.context=context;request.analysisLane=provider;
    await this.analysisRuntime(provider).run(request,this.agent().isolatedHome('applet-analysis'),async event=>{
     checkCancellation(signal);
     if(this.store.attentionEpoch!==epoch||!this.consent||!this.connected(provider))throw new Cancelled();
     if(event.type!=='tool'||typeof event.name!=='string'||!isRow(event.args))return null;
     const name=event.name,args=event.args;
     if(name==='query_world_items'){
      queried=true;
      const snapshot=core('appletAnalysisInput',{provider,records,items:this.db().records('items').filter(item=>item.provider===provider),now:now()});
      if(!isRow(snapshot))throw new WorldletError('Invalid source batch');
      snapshot.pendingContextIds=requiredIDs.filter(id=>!processedIDs.includes(id));snapshot.userContext=context.userContext??{};
      return snapshot;
     }
     if(!queried||name!=='upsert_world_items')return {error:'Query context, then submit Applet candidates only.'};
     try{core('attentionCoverage',{available:requiredIDs,required:requiredIDs,previous:processedIDs,processed:args.processedContextIds??[]});}
     catch{return {error:'processedContextIds must contain exact IDs from the supplied source records.'};}
     const result=await worldToolReply(this,name,args,session,provider);
     if(result.error==null){
      const db=this.db();
      if(!this.enabledCheck(provider))throw new Cancelled();
      const latest=this.observations(provider);
      // Records cited by rejected candidates, or changed since this batch was read, stay pending.
      const withheld=new Set(strings(result.withheldContextIds));
      for(const row of records)if(typeof row.id==='string'&&!this.analysisSourcesCurrent([row],latest)){withheld.add(row.id);changed=true;}
      const staged=this.analysisCandidates.get(session)??[];
      // Never checkpoint half of a cross-record candidate: a restart would lose its staged remainder.
      const acknowledged=new Set(strings(args.processedContextIds).filter(id=>!withheld.has(id)));
      let stable=false;
      while(!stable){
       stable=true;
       for(const item of staged){
        const ids=rows(item.sources).map(ref=>ref.id).filter(id=>typeof id==='string');
        if(ids.some(id=>!acknowledged.has(id)&&!processedIDs.includes(id))&&ids.some(id=>acknowledged.has(id))){for(const id of ids)acknowledged.delete(id);stable=false;}
       }
      }
      const coverage=core('attentionCoverage',{available:requiredIDs,required:requiredIDs,previous:processedIDs,processed:[...acknowledged]});
      if(!isRow(coverage))throw new WorldletError('Invalid analysis coverage.');
      const covered=new Set(Array.isArray(coverage.processed)?strings(coverage.processed):processedIDs);
      if(covered.size){
       const candidates=staged.filter(item=>rows(item.sources).every(ref=>covered.has(typeof ref.id==='string'?ref.id:'')));
       db.withRuntimeOutput('applet:'+provider+':analyze',turn,()=>this.saveAppletCandidates(provider,candidates,session,covered));
      }
      submitted=true;processedIDs=Array.isArray(coverage.processed)?strings(coverage.processed):processedIDs;
      result.pendingContextIds=coverage.remaining;
     }
     return result;
    });
    // A cancellation from a World tool call comes back to an Agent on the per-turn MCP bridge as the call's error
    // (world-tool-bridge.ts), so the Agent ends its turn instead of the run stopping: the run was cancelled all the same.
    checkCancellation(signal);
    if(this.store.attentionEpoch!==epoch||!this.consent||!this.connected(provider))throw new Cancelled();
    if(!submitted)throw new WorldletError('Applet analysis ended without a verified result.');
    checkCancellation(signal);
    if(!requiredIDs.every(id=>processedIDs.includes(id))){
     yielded=processedIDs.length>0||changed;
     throw new WorldletError(changed?'Source changed during analysis; retry the current revision.':'Applet analysis did not cover every supplied source record; retry remaining analysis.');
    }
    checkCancellation(signal);
    if(this.store.attentionEpoch!==epoch||!this.consent||!this.connected(provider)||!this.enabledCheck(provider))throw new Cancelled();
    if(!this.analysisSourcesCurrent(records,this.observations(provider))){yielded=true;throw new WorldletError('Source changed during analysis; retry the current revision.');}
    const db=this.db(),taskID='applet:'+provider+':analyze';
    db.withRuntimeOutput(taskID,turn,()=>{if(!db.finishRuntimeTask(taskID,turn,'succeeded',0))throw new Cancelled();});
    committed=true;
   }finally{
    this.receiveAppletEvent({provider,callId:session,phase:committed?'complete':yielded?'yielded':'error'},turn);
   }
  }finally{
   this.analysisCandidates.delete(session);this.analysisProviders.delete(session);delete this.store.worldEvidence[session];this.acknowledged.delete(session);
  }
 }
 /** Analysis owns separate model lanes, one per source; collection never awaits them. */
 requestAppletAnalysis(provider?:string){
  if(provider===undefined){
   if(!this.writable||!this.consent||this.sample())return;
   let specs:Row[];try{specs=this.runtimeRows().filter(row=>row.analysis==='source-small');}catch{return;}
   for(const spec of specs)if(typeof spec.provider==='string'&&this.connected(spec.provider))this.requestAppletAnalysis(spec.provider);
   return;
  }
  const session=this.session;
  if(session.analysisTasks.has(provider)||!this.writable||!this.consent||this.sample()||!this.agentService())return;
  session.analysisTasks.add(provider);
  void this.analysisLane(provider,session.signal).finally(()=>session.analysisTasks.delete(provider));
 }
 private async analysisLane(provider:string,signal:AbortSignal){
  while(!signal.aborted){
   // The clock restarts an idle lane when the person returns; pending records stay durable.
   if(!this.writable||!this.consent||this.sample()||this.idle())return;
   try{
    const db=this.db(),at=now();
    const spec=this.runtimeSpec(provider);
    if(spec?.analysis!=='source-small'||!this.connected(provider)||!this.enabledCheck(provider))return;
    const limit=int(spec.analysisBatchSize)??int(spec.pageSize)??20;
    const pending=this.pendingAppletAnalysis(provider,limit);
    const retrying=this.retryingAppletAnalysis(provider,pending);
    const records=core('analysisBatch',{records:pending,limit,retrying});
    if(!Array.isArray(records))throw new WorldletError('Invalid bounded analysis batch');
    const tasks=db.records('runtime-tasks');
    const admission=core('runtimeAnalysisPlan',{candidates:[{provider,pending:records.length}],tasks,now:at,independentLane:true,foreground:this.store.busy||this.interactive()});
    if(!isRow(admission))return;
    if(admission.provider!==provider||!records.length){
     if(typeof admission.waitSeconds!=='number')return;
     await sleep(admission.waitSeconds,signal);continue;
    }
    const taskID='applet:'+provider+':analyze',turn=uuid();
    if(!db.claimRuntimeTask(taskID,provider,'source-analysis',turn)){await sleep(1,signal);continue;}
    // Record service before model execution, under the same fenced claim, so a crash or a
    // repeatedly rejected batch cannot pin the head of the queue.
    db.withRuntimeOutput(taskID,turn,()=>{
     const saved=this.findings(provider);
     const retained=new Set(this.observations(provider).map(row=>row.id).filter(id=>typeof id==='string'));
     const attempted:Row=Object.fromEntries(Object.entries(isRow(saved.attempted)?saved.attempted:{}).filter(([id])=>retained.has(id)));
     for(const record of records)if(typeof record.id==='string')attempted[record.id]=at;
     db.replaceAppletState('applet-findings',provider,{...saved,attempted});
    });
    let outcome='succeeded',failure:Row={};
    try{await this.analyzeAppletPage(provider,records,turn,signal);}
    catch(error){
     const cancelled=isCancel(error)||signal.aborted;
     outcome=cancelled?'cancelled':'failed';
     const analyzed=isRow(this.findings(provider).analyzed)?this.findings(provider).analyzed:{};
     const madeProgress=records.some(row=>typeof row.id==='string'&&analyzed[row.id]===this.analysisRevision(row));
     const prior=tasks.find(task=>task.id===taskID)?.failures??0;
     const decided=core('runtimeFailure',{message:message(error),cancelled,madeProgress,now:now(),failures:prior});
     failure=isRow(decided)?decided:{};
     if(madeProgress&&failure.code==='incomplete_coverage'||failure.code==='source_changed')outcome='yielded';
     // A cancellation is the World moving on, not a failure to report.
     else if(!cancelled)this.persist(error,'appletAnalysis',turn);
     // Best effort: accounting must never skip settling the claim below.
     if(outcome!=='cancelled')try{this.recordAppletAnalysisFailure(provider,records,taskID,turn,failure.code);}catch{}
    }
    if(outcome!=='succeeded')db.finishRuntimeTask(taskID,turn,outcome,typeof failure.nextAt==='number'?failure.nextAt:0,outcome==='yielded'?null:failure.code??null,failure.waitReason??null,int(failure.failures)??null);
    this.finishAppletTurn(turn);
    this.worldChanged();
    checkCancellation(signal);
   }catch(error){
    if(!isCancel(error)&&!signal.aborted)this.persist(error,'appletAnalysisQueue');
    return;
   }
  }
 }

 // Source collection ------------------------------------------------------------------------
 backgroundSourceReader(provider:string){
  let reader=this.readers.get(provider);
  if(!reader){reader=this.agent().makeSourceAccess();this.readers.set(provider,reader);}
  return reader;
 }
 /** Runs the registered reader through the World service; only source tools are answered. */
 private async readSource(provider:string,args:Row,turn:string,timeout:unknown,epoch:number,signal:AbortSignal,refusal:string){
  let received=false;
  const result=await this.backgroundSourceReader(provider).run({action:'sourceTool',name:'read_world_source',args,_background:true,_taskTimeoutSeconds:timeout??240},this.agent().accountsHome(),async event=>{
   checkCancellation(signal);
   if(this.store.attentionEpoch!==epoch||!this.consent||this.sample())throw new Cancelled();
   if(event.type!=='tool'||typeof event.name!=='string'||!isRow(event.args))return null;
   const body=event.args;
   if(event.name==='_world_authorize'&&body.name==='read_world_source')return {ok:true};
   if(!['_source_begin','_source_result'].includes(event.name))return {error:refusal};
   const reply=await worldToolReply(this,event.name,body,turn,provider);
   if(typeof reply.error==='string')throw new WorldletError(reply.error);
   if(event.name==='_source_result'&&reply.error==null&&body.failed!==true)received=true;
   return reply;
  });
  return {result,received};
 }
 private receiptsSettled(turn:string){return !(this.readTickets.get(turn)?.size)&&!this.readFailures.has(turn);}
 /** One durable page per run. Collection resumes independently of Center success. */
 private async collectAppletPage(provider:string,turn:string,signal:AbortSignal){
  const spec=this.runtimeSpec(provider);
  if(!spec)throw new WorldletError('Applet has no scheduled reader.');
  const db=this.db(),cursor=db.find('applet-cursors',provider)??{},epoch=this.store.attentionEpoch;
  const plan=core('appletReadPlan',{spec,cursor,now:now()});
  if(!isRow(plan))throw new WorldletError('Invalid Applet read plan.');
  const args={...plan};for(const key of ['initial','startedAt','scanned'])delete args[key];
  const {result:page,received}=await this.readSource(provider,args,turn,spec.syncTimeoutSeconds,epoch,signal,'Collection is read-only.');
  if(!received||!this.receiptsSettled(turn))throw new WorldletError('Source page ended without a validated receipt; its checkpoint is unchanged.');
  if(!Array.isArray(page?.records)||this.store.attentionEpoch!==epoch)throw new Cancelled();
  const next=core('appletPageFinish',{spec,cursor,plan,page,now:now()});
  if(!isRow(next)||this.store.attentionEpoch!==epoch)throw new Cancelled();
  db.withRuntimeOutput('applet:'+provider+':check',turn,()=>db.replaceAppletState('applet-cursors',provider,next));
  if(provider==='gmail')this.presentMailRead(rows(page.records),true);
  this.acknowledged.add(turn);this.worldChanged();
  if(spec.analysis==='source-small')this.requestAppletAnalysis();
 }
 /** Registered Applet readers use the existing World service without starting a model turn. */
 private async collectAttentionSource(provider:string,turn:string,signal:AbortSignal){
  const epoch=this.store.attentionEpoch;
  const timeout=int(this.runtimeSpec(provider)?.syncTimeoutSeconds)??240;
  const read=async(args:Row)=>{
   const {result,received}=await this.readSource(provider,args,turn,timeout,epoch,signal,'Applet readers can only read their registered source.');
   if(!received||!this.receiptsSettled(turn))throw new WorldletError('Applet reader ended without a validated source receipt.');
   if(!Array.isArray(result?.records))throw new WorldletError('Applet reader returned no source receipt.');
   return rows(result.records);
  };
  let records:Row[];
  if(this.nativeConnected(provider)){
   const permit=await worldTool(this,'_source_begin',{provider},turn,provider);
   if(!Array.isArray(permit.records)||typeof permit.ticket!=='string')throw new WorldletError('Local source returned no records.');
   await worldTool(this,'_source_result',{provider,ticket:permit.ticket,records:permit.records},turn,provider);
   records=rows(permit.records);
  }else{
   const requests=core('attentionReads',{provider});
   if(!Array.isArray(requests))throw new WorldletError('Invalid attention read plan.');
   const collected:Row[]=[],seen=new Set<string>();
   for(const request of requests)for(const row of await read(request))if(typeof row.id==='string'&&!seen.has(row.id)){seen.add(row.id);collected.push(row);}
   records=collected;
   const followups=core('attentionFollowupReads',{provider,records});
   if(!Array.isArray(followups))throw new WorldletError('Invalid follow-up read plan.');
   for(const request of followups)await read(request);
  }
  if(this.store.attentionEpoch!==epoch)throw new Cancelled();
  if(provider==='gmail')this.presentMailRead(records,true);
  this.acknowledged.add(turn); // A valid empty read is a completed collection, not a cleared list.
 }
 /** Native Calendar facts (macOS EventKit through the Sources host). */
 private async checkCalendarAttention(turn:string,signal:AbortSignal){
  if(!this.store.attentionProviders.includes('google-calendar'))throw new WorldletError('Calendar is disconnected.');
  const epoch=this.store.attentionEpoch;
  const reader=this.sources()?.readNative;
  if(!reader)throw new WorldletError('Calendar is not available on this computer.');
  const rowsRead=await reader.call(this.sources(),'google-calendar',{includeCancelled:true});
  checkCancellation(signal);
  if(this.store.attentionEpoch!==epoch||!this.store.attentionProviders.includes('google-calendar')||this.sample()||this.pausedProviders().includes('google-calendar'))throw new WorldletError('Calendar reading is no longer authorized.');
  const records=rowsRead.map(row=>{
   const record:Row={...row,allDay:row.allDay==='true',cancelled:row.cancelled==='true'};
   // EventKit all-day dates belong to the user's local calendar timezone.
   for(const field of ['start','end']){
    const text=row[field];
    const match=typeof text==='string'&&text.length===10&&/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if(match){const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));if(date.getFullYear()===Number(match[1])&&date.getMonth()===Number(match[2])-1&&date.getDate()===Number(match[3]))record[field]=isoSeconds(date);}
   }
   return record;
  });
  this.db().withRuntimeOutput('applet:google-calendar:check',turn,()=>this.observeAttention('google-calendar',records));
  // New events publish only after analysis; wake its lane like any committed source page.
  if(this.runtimeSpec('google-calendar')?.analysis==='source-small')this.requestAppletAnalysis('google-calendar');
 }
 requestSourceChecks(){
  const session=this.session;
  while(session.sourceCheckTasks<2){
   session.sourceCheckTasks+=1;
   void (async()=>{try{if(!session.signal.aborted)await this.checkWorldIfDue(undefined,false,session.signal);}finally{session.sourceCheckTasks-=1;}})();
  }
 }
 /** World menu "Read connected apps": every enabled check is due now (Mac `syncAll`); the check lanes read them. */
 readConnectedApps(){
  if(!this.writable||this.sample())return;
  const db=this.db(),due=core('sourceChecksReadNow',{checks:db.records('checks'),now:now()});
  if(!Array.isArray(due))throw new WorldletError('Invalid source check plan.');
  for(const row of due){if(typeof row?.id!=='string')throw new WorldletError('Invalid source check plan.');db.put('checks',row.id,row);}
  this.worldChanged();this.requestSourceChecks();
 }
 async checkWorldIfDue(only?:string,firstMail=false,signal=this.session.signal){
  // A check the person asked for (`only`) still runs; scheduled checks wait for their return.
  if(!this.writable||this.sample()||signal.aborted||only===undefined&&this.idle())return;
  try{
   const db=this.db(),at=now();
   const registrations=this.runtimeRows().filter(row=>row.mode==='scheduled');
   const authorized=registrations.filter(row=>row.reader!=='observation').map(row=>row.provider as string).filter(provider=>{
    if(!this.store.state.connections.some(c=>c.provider===provider&&canBuild(c)&&(provider==='google-calendar'&&c.transport==='native'||this.consent&&this.supportsBackgroundChecks())))return false;
    const threshold=int(registrations.find(row=>row.provider===provider)?.analysisHighWaterMark)??100;
    try{return this.pendingAppletAnalysis(provider,threshold).length<threshold;}
    catch(error){this.persist(error,'appletBackpressure');return false;}
   });
   const providers=strings(core('runtimeReadProviders',{providers:authorized,active:[...this.activeSourceChecks]}));
   const defaults=core('sourceChecksDefault',{existing:db.records('checks'),providers,now:at,registrations});
   if(!Array.isArray(defaults))throw new WorldletError('Invalid source check plan.');
   // Shared core takes each new check's interval from its Applet registration.
   for(const row of defaults){if(typeof row?.id!=='string')throw new WorldletError('Invalid source check plan.');db.put('checks',row.id,row);}
   const selection:Row={checks:db.records('checks'),providers,now:at,firstMail};
   if(only!==undefined)selection.only=only;
   const due=core('sourceCheckDue',selection);
   if(!isRow(due)||typeof due.provider!=='string')return;
   const provider=due.provider;
   this.activeSourceChecks.add(provider);
   try{
    const turn=uuid(),epoch=this.store.attentionEpoch,taskID='applet:'+provider+':check';
    if(!db.claimRuntimeTask(taskID,provider,'source-io',turn))return;
    try{
     let check=core('sourceCheckStart',{check:due,now:at});
     if(!isRow(check))throw new WorldletError('Invalid source check plan.');
     check.runId=turn;
     db.put('checks',provider,check);this.worldChanged();
     try{
      const run:Row={id:turn,taskId:'applet:'+provider,provider,startedAt:at,status:'running'};
      db.put('runs',turn,run);
      this.store.recordHistory({id:turn+':started',kind:'applet.check',at:now(),actor:'applet',status:'started',runId:turn},provider);
      let failureMessage='';
      try{
       if(provider==='google-calendar'&&this.nativeConnected(provider)){await this.checkCalendarAttention(turn,signal);this.acknowledged.add(turn);}
       else if(['gmail','google-calendar'].includes(provider))await this.collectAppletPage(provider,turn,signal);
       else await this.collectAttentionSource(provider,turn,signal);
       if(!this.acknowledged.has(turn))throw new WorldletError('Check ended without saved findings.');
       if(this.readFailures.has(turn))throw new WorldletError('Source coverage was incomplete; retry the check.');
       if(db.records('applet-cursors').some(row=>row.id===provider&&row.hasMore===true))check.nextAt=now()+5;
       check.lastStatus='complete';check.lastSuccessAt=now();
       for(const key of ['error','errorCode','requiredAction','failures'])delete check[key];
       run.status='complete';
      }catch(error){
       if(isCancel(error)){check.lastStatus='cancelled';run.status='cancelled';}
       else{
        this.persist(error,'appletCheck',turn);
        check.lastStatus='error';check.error='The check did not finish. Saved items are kept; it will retry when available.';
        let action:unknown;try{action=core('sourceReadAction',{message:message(error)});}catch{}
        if(typeof action==='string')check.requiredAction=action;else delete check.requiredAction;
        failureMessage=message(error);
        run.status='error';
       }
      }
      if(signal.aborted){check.lastStatus='cancelled';run.status='cancelled';}
      run.finishedAt=now();
      if(epoch!==this.store.attentionEpoch){
       // Do not recreate state removed by reset or overwrite a newer run.
       const latest=db.records('checks').find(row=>row.id===provider&&row.runId===turn);
       if(latest){
        const cancelled=core('sourceCheckFinish',{check:latest,latest,status:'cancelled',now:now()});
        if(isRow(cancelled)){run.status='cancelled';db.transaction(()=>{db.put('checks',provider,cancelled);db.put('runs',turn,run);});this.worldChanged();}
       }
       return;
      }
      // A user may have paused or reconfigured the schedule while it was running.
      const latest=db.records('checks').find(row=>row.id===provider);
      if(!latest)return;
      const reconciled=core('sourceCheckFinish',{check,latest,status:check.lastStatus??'error',now:now(),message:failureMessage});
      if(!isRow(reconciled))throw new WorldletError('Invalid source check result.');
      check=reconciled;
      if(check.errorCode==='model_allowance')check.error='Checking is waiting for the included AI allowance to reset. Your connection is still saved.';
      if(check.errorCode===undefined)delete run.errorCode;else run.errorCode=check.errorCode;
      const outcome=typeof check.lastStatus==='string'?check.lastStatus:'error';
      const settled=db.transaction(()=>{
       if(!db.finishRuntimeTask(taskID,turn,outcome==='complete'?'succeeded':outcome==='cancelled'?'cancelled':'failed',0,typeof run.errorCode==='string'?run.errorCode:null,typeof check.waitReason==='string'?check.waitReason:null,int(check.failures)??null))return false;
       db.put('checks',provider,check);db.put('runs',turn,run);db.pruneExecution();
       return true;
      });
      if(!settled)return;
      this.store.recordHistory({id:turn+':finished',kind:'applet.check',at:now(),actor:'applet',status:run.status??'error',runId:turn},provider);
      this.worldChanged();
     }finally{
      this.readTickets.delete(turn);this.readCounts.delete(turn);this.readFailures.delete(turn);delete this.store.worldEvidence[turn];this.acknowledged.delete(turn);
      this.finishAppletTurn(turn);
      const left=this.store.appletActivity[provider];
      // Keep only what an unfinished Fox turn read, so it can still describe this app.
      if(left?.turn===turn){if(left.readTurns?.length)this.store.appletActivity[provider]={turn:left.readTurns.at(-1)!,calls:[],succeeded:true,failed:false,summary:'',needsAttention:false,readTurns:left.readTurns};else delete this.store.appletActivity[provider];this.worldChanged();}
     }
    }finally{
     try{db.finishRuntimeTask(taskID,turn,'interrupted',now()+60,'unfinished');}catch{}
    }
   }finally{this.activeSourceChecks.delete(provider);}
  }catch(error){
   this.persist(error,'worldCheck');
   this.store.status='World checks could not save their state. Ask Fox to retry.';
  }
 }
 startOnboardingMailCheck(){
  if(!this.writable||!this.consent||this.sample()||!this.connected('gmail'))throw new WorldletError('Connect Mail before checking it.');
  const session=this.session;
  if(session.onboardingMail)return;
  session.onboardingMail=true;
  void Promise.all([this.checkWorldIfDue('google-calendar',false,session.signal),this.checkWorldIfDue('gmail',false,session.signal)])
   .then(()=>{if(!session.signal.aborted)this.requestAttentionSynthesis();})
   .finally(()=>{session.onboardingMail=false;});
 }
 onboardingMailRunning(){return this.session.onboardingMail;}
 /** Whether mail is still on its way to the Center: a source being read, an Applet being analysed or a
  * synthesis due or running. First value keeps waiting on it rather than ending the tour without an item. */
 attentionReading(){const s=this.session;return s.onboardingMail||s.sourceCheckTasks>0||s.analysisTasks.size>0||s.attentionWake||this.attentionRunning;}

 // Attention synthesis ----------------------------------------------------------------------
 private centerProviders(){
  const db=this.db(),paused=this.pausedProviders();
  return db.subscribedAttentionProviders(this.store.attentionProviders).filter(provider=>!paused.includes(provider));
 }
 /** Consumer housekeeping must run even when no model pass is eligible. */
 private retireUnreferencedAttentionRemovals(providers:string[]){
  const db=this.db();
  const discarded=rows(core('attentionDiscardedRemovals',{facts:db.attentionFacts(),items:db.records('items'),providers}));
  const pending=db.records('runtime-deliveries').filter(row=>row.consumerId==='attention:center'&&row.status==='pending');
  const number=(value:unknown)=>typeof value==='number'?value:null;
  const retire=discarded.filter(seed=>pending.some(row=>row.entityId===seed.id&&number(row.revision)===number(seed.revision)));
  if(retire.length)db.acknowledgeAttentionDeliveries(retire);
 }
 /** Sources whose S analysis still has records to read, as during a first scan; the Center
  * spaces partial passes from them (#1720). Parked records do not count. */
 private analysisBacklog(providers:string[]):string[] {
  return providers.filter(provider=>{try{return this.connected(provider)&&this.enabledCheck(provider)&&this.pendingAppletAnalysis(provider,1).length>0;}catch{return false;}});
 }
 /** Registration wakes the consumer; durable revisions are its pending queue. */
 requestAttentionSynthesis(){
  const session=this.session;
  if(session.attentionWake||!this.writable||!this.consent||this.sample())return;
  session.attentionWake=true;
  const signal=session.signal;
  void (async()=>{
   try{
    // Let a source transaction finish and coalesce submissions from the same batch.
    await sleep(0.2,signal);
    while(!signal.aborted){
     if(!this.writable||!this.consent||this.sample())return;
     // An active synthesis cannot consume this probe; pending revisions remain durable.
     if(this.attentionRunning){await sleep(1,signal);continue;}
     const db=this.db(),at=now();
     const providers=this.centerProviders();
     this.retireUnreferencedAttentionRemovals(providers);
     const budget=db.attentionInputBudget();
     // Probe pending revisions independently of the cooldown; execution still passes admission.
     const plan=core('attentionPlan',{facts:db.attentionFacts(),budget:{...budget,nextAt:0},now:at,providers,items:db.records('items'),deliveries:db.records('runtime-deliveries'),backlog:this.analysisBacklog(providers)});
     if(!isRow(plan))return;
     const delay=Math.max(0,(typeof budget.nextAt==='number'?budget.nextAt:0)-at);
     if(delay>0){await sleep(Math.min(delay,60),signal);continue;}
     // An unavailable runtime must not spin. The minute clock remains recovery.
     if(!await this.synthesizeAttentionIfDue(signal))return;
     await sleep(1,signal);
    }
   }catch(error){
    if(!isCancel(error)&&!signal.aborted)this.persist(error,'attentionWake');
   }finally{session.attentionWake=false;}
  })();
 }
 private worldCheckAgent(){const service=this.agent();return this.checkAgent??=service.makeBackground?.()??service.make();}
 /** A read-only, bounded synthesis lane. No source reads or external actions are exposed. */
 async synthesizeAttentionIfDue(signal=this.session.signal):Promise<boolean>{
  const admitted=(()=>{try{return core('admitBackgroundWork',{supported:this.writable&&this.supportsBackgroundChecks(),privateScope:!this.sample(),consent:this.consent,busy:this.attentionRunning,independentLane:true,foregroundPending:this.interactive(),idleSeconds:this.idleSeconds()})===true;}catch{return false;}})();
  if(!admitted)return false;
  try{
   const db=this.db(),at=now();
   const providers=this.centerProviders();
   this.retireUnreferencedAttentionRemovals(providers);
   const plan=core('attentionPlan',{facts:db.attentionFacts(),budget:db.attentionInputBudget(),now:at,providers,items:db.records('items'),deliveries:db.records('runtime-deliveries'),backlog:this.analysisBacklog(providers)});
   if(!isRow(plan)||!Array.isArray(plan.facts))return true;
   const facts:Row[]=plan.facts;
   this.attentionRunning=true;
   try{
    const epoch=this.store.attentionEpoch,turn=uuid();
    if(!db.claimRuntimeTask('attention:center','attention-center','attention',turn))return true;
    try{
     let budget:Row=core('attentionStart',{budget:db.attentionBudget(),now:at});
     if(!isRow(budget))budget={};
     budget.lastStatus='running';budget.runId=turn;budget.lastStartedAt=at;
     db.replaceAttentionCache('attention-budget',budget);
     db.put('runs',turn,{id:turn,taskId:'attention:center',provider:'attention-center',startedAt:at,status:'running'});
     // Several facts can share one source ID (a changed recurrence); plan seeds come first, so keep the first.
     const evidence:Record<string,Row>={};
     for(const fact of facts){
      if(fact.removed===true||typeof fact.provider!=='string'||typeof fact.sourceId!=='string')continue;
      const key=fact.provider+':'+fact.sourceId;
      if(!(key in evidence))evidence[key]={...fact,id:fact.sourceId,...(isRow(fact.attributes)?fact.attributes:{})};
     }
     this.store.worldEvidence[turn]=evidence;
     this.synthesisFacts.set(turn,facts);this.synthesisPlans.set(turn,plan);
     let success=false,cancelled=false,yielded=false;
     try{
      const execution=core('attentionExecution',{kind:'synthesis'});
      if(!isRow(execution))throw new WorldletError('Invalid synthesis plan.');
      const userContext=this.monitorContext();
      let queried=false;
      let processedContextIDs:string[]=[];
      const requiredContextIDs=rows(plan.seeds).map(seed=>seed.id).filter(id=>typeof id==='string');
      try{
       await this.worldCheckAgent().run({action:'chat',mode:'chat',monitor:true,attentionSynthesis:true,_background:true,session:'attention-'+turn,context:userContext,text:execution.prompt??'',_taskTimeoutSeconds:execution.timeoutSeconds??600},this.agent().isolatedHome('monitor'),async event=>{
        checkCancellation(signal);
        if(this.store.attentionEpoch!==epoch||!this.consent||this.sample())throw new Cancelled();
        if(event.type!=='tool'||typeof event.name!=='string'||!isRow(event.args))return null;
        const name=event.name,args=event.args;
        if(!['query_world_items','upsert_world_items','review_world_item'].includes(name))return {error:'Attention synthesis cannot read services, change user state or perform actions.'};
        if(name==='query_world_items'){
         queried=true;
         const result=await worldToolReply(this,name,{},turn);
         result.context=core('sourceEvidenceContext',{records:facts});
         result.pendingContextIds=requiredContextIDs.filter(id=>!processedContextIDs.includes(id));
         const ids=new Set(facts.map(f=>(f.provider??'')+':'+(f.sourceId??'')));
         result.appletCandidates=this.db().records('applet-findings').flatMap(row=>rows(row.items)).filter(item=>rows(item.sources).some(ref=>ids.has((ref.provider??'')+':'+(ref.id??'')))).slice(0,40);
         result.userContext=userContext.userContext;
         result.attentionFocus=userContext.attentionFocus;
         result.timeZone=userContext.timeZone;
         // Include prior user decisions; bound the response to this evidence neighborhood.
         const sourceKeys=new Set(facts.filter(f=>typeof f.provider==='string'&&typeof f.sourceId==='string').map(f=>f.provider+':'+f.sourceId));
         result.items=rows(result.items).filter(item=>rows(item.sources).some(ref=>sourceKeys.has((ref.provider??'')+':'+(ref.id??'')))||rows(item.attentionDependencies).some(dependency=>facts.some(f=>f.id===dependency.id))).slice(0,80);
         // The model-facing items omit internal dependencies; Core uses the saved ones to mark current items.
         const dependencies:Row={};
         for(const row of this.db().records('items'))if(typeof row.id==='string'&&Array.isArray(row.attentionDependencies)&&!(row.id in dependencies))dependencies[row.id]=row.attentionDependencies;
         result.itemDependencies=dependencies;
         return core('attentionBatchInput',result);
        }
        if(!queried)return {error:'Query current context and user decisions first.'};
        if(name==='upsert_world_items'){
         const available=facts.map(f=>f.id).filter(id=>typeof id==='string');
         try{if(!isRow(core('attentionCoverage',{available,required:requiredContextIDs,previous:processedContextIDs,processed:args.processedContextIds??[]})))throw Error();}
         catch{return {error:'processedContextIds must contain only exact IDs from the supplied context.'};}
         const result=await worldToolReply(this,name,args,turn);
         if(result.error==null){
          // Inputs cited by rejected findings were not acknowledged; they remain pending.
          let coverage:Row={};try{const value=core('attentionCoverage',{available,required:requiredContextIDs,previous:processedContextIDs,processed:args.processedContextIds??[],withheld:result.withheldContextIds??[]});if(isRow(value))coverage=value;}catch{}
          processedContextIDs=Array.isArray(coverage.processed)?strings(coverage.processed):processedContextIDs;
          result.pendingContextIds=coverage.remaining;
         }
         return result;
        }
        return worldToolReply(this,name,args,turn);
       });
       success=this.acknowledged.has(turn)&&requiredContextIDs.every(id=>processedContextIDs.includes(id));
       yielded=!success&&requiredContextIDs.some(id=>processedContextIDs.includes(id));
       if(!success&&!yielded)budget.lastErrorCode=this.acknowledged.has(turn)?'incomplete_coverage':'unverified_output';
      }catch(error){
       if(isCancel(error)||signal.aborted){success=false;cancelled=true;}
       else{
        this.persist(error,'attentionSynthesis',turn);
        success=false;
        try{const failure=core('attentionFailure',{message:message(error),now:now()});if(isRow(failure)){budget.lastErrorCode=failure.code;budget.retryAfter=failure.nextAt;}}catch{}
       }
      }
      if(this.store.attentionEpoch!==epoch)return true;
      const settled=db.transaction(()=>{
       const completion:Row=core('attentionCompletion',{plan,facts:db.attentionFacts(),providers:this.centerProviders(),deliveries:db.records('runtime-deliveries'),now:now(),success,cancelled,yielded})??{};
       success=completion.success===true;
       cancelled=typeof completion.cancelled==='boolean'?completion.cancelled:true;
       yielded=completion.yielded===true;
       // Progress recorded by Core attentionProgress survives a later failed turn.
       const progress=db.attentionBudget();
       if(progress.contentVersion===1){budget.contentVersion=1;budget.seen=progress.seen;}
       const finished=core('attentionFinish',{budget,plan,now:now(),success,cancelled,yielded,facts:db.attentionFacts()});
       if(isRow(finished))budget=finished;
       if(success||cancelled||yielded){delete budget.lastErrorCode;delete budget.retryAfter;}
       else if(typeof budget.retryAfter==='number')budget.nextAt=Math.max(budget.retryAfter,typeof budget.nextAt==='number'?budget.nextAt:0);
       budget.lastStatus=success?'complete':cancelled?'cancelled':yielded?'yielded':'error';
       if(!db.finishRuntimeTask('attention:center',turn,success?'succeeded':cancelled?'cancelled':yielded?'yielded':'failed',0,typeof budget.lastErrorCode==='string'?budget.lastErrorCode:null))return false;
       db.replaceAttentionCache('attention-budget',budget);
       // Accepted findings are already saved. Inputs still pending after the single repair retry
       // alone and quarantine after bounded attempts instead of re-entering every healthy batch.
       if(!success&&!cancelled&&!yielded)db.failAttentionDeliveries(rows(plan.seeds),typeof budget.lastErrorCode==='string'?budget.lastErrorCode:'',facts.length===1);
       else if(yielded)db.failAttentionDeliveries(rows(plan.seeds),'incomplete_coverage',facts.length===1);
       return true;
      });
      if(!settled)return true;
      db.put('runs',turn,{id:turn,taskId:'attention:center',provider:'attention-center',startedAt:at,finishedAt:now(),status:budget.lastStatus??'error',count:facts.length});
      this.store.recordHistory({id:turn+':finished',kind:'attention.synthesis',at:now(),runId:turn,status:success?'complete':cancelled?'cancelled':yielded?'yielded':'error',count:facts.length},'center');
      this.worldChanged();
     }finally{
      delete this.store.worldEvidence[turn];this.acknowledged.delete(turn);this.synthesisFacts.delete(turn);this.synthesisPlans.delete(turn);
     }
    }finally{
     try{db.finishRuntimeTask('attention:center',turn,'interrupted',now()+60,'unfinished');}catch{}
    }
   }finally{this.attentionRunning=false;}
  }catch(error){
   this.persist(error,'attentionSynthesis');
   this.store.status='Attention Center could not save its check state.';
  }
  return true;
 }

 // Runtime tasks ----------------------------------------------------------------------------
 runtimeTaskReport():Row {
  const db=this.db();
  const analysis=this.runtimeRows().filter(spec=>spec.analysis==='source-small'&&typeof spec.provider==='string').map(spec=>({provider:spec.provider,pending:this.pendingAppletAnalysis(spec.provider,Number.MAX_SAFE_INTEGER).length,highWaterMark:int(spec.analysisHighWaterMark)??100}));
  const report=core('runtimeTaskReport',{now:now(),analysis,tasks:db.records('runtime-tasks'),runs:db.records('runtime-runs'),checks:db.records('checks'),cursors:db.records('applet-cursors'),deliveries:db.records('runtime-deliveries'),budget:db.attentionBudget()});
  return isRow(report)?report:{};
 }
 async runtimeTaskControl(args:Row){
  if(args.provider==='attention-center'&&args.operation==='retry-quarantined'){
   if(!this.writable||!this.consent||this.sample())throw new WorldletError('Task retry is unavailable.');
   this.db().retryAttentionQuarantine();this.requestAttentionSynthesis();this.worldChanged();
   return {ok:true};
  }
  if(typeof args.provider!=='string'||typeof args.operation!=='string'||!['pause','resume'].includes(args.operation))throw new WorldletError('Unknown task operation.');
  const check=this.db().records('checks').find(row=>row.provider===args.provider);
  const result=await worldTool(this,'configure_world_check',{provider:args.provider,enabled:args.operation==='resume',intervalMinutes:check?.intervalMinutes??30},'task-inspector');
  if(args.operation==='resume'){this.requestAppletAnalysis();this.requestAttentionSynthesis();}
  return result;
 }
}
