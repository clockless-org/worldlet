import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {core} from '../core.ts';
import {digest,ensureDirectory,isLink,readJSON,writeJSON,writeAtomic,WorldletError} from '../files.ts';
import type {Preferences} from '../preferences.ts';
import {removeOldLeftovers} from './leftovers.ts';
import {moveFilesIn} from './moved-in.ts';
import {WorldLedger} from './ledger.ts';
import {ActivityRecorder} from '../modules/browser/activity.ts';
import {EMPTY_OVERLAY} from '../../../../core/context/index.ts';
import eventPolicy from '../../../../contracts/world-event-policy.json';

type Row=Record<string,any>;
/** Seconds since 2001-01-01, the Mac host's Codable date encoding for stored rows. */
export const referenceDate=()=>Date.now()/1000-978307200;
const THEMES=['home','library','studio','factory','cafe','family','calendar','finance','archive','rocket','health','vision'];
const AGENT_TRANSPORTS_WITHOUT_LIFECYCLE=['native','cli'];
/** An Agent-owned connection counts only once authorized; host-owned and legacy imports always count. */
export function canBuild(connection:Row){
 if(connection.transport==='nango')return false;
 if(!connection.transport||AGENT_TRANSPORTS_WITHOUT_LIFECYCLE.includes(connection.transport))return true;
 return ['connected','sync_error','syncing','reading'].includes(connection.syncStatus??'');
}
export interface StoreOptions {appName:string;platform:string;capabilities:()=>Row;mockGoogleAvailable:boolean;googleClientID?:string;tourCodaAfterWinMs?:number}
export interface AppletActivity {turn:string;calls:string[];succeeded:boolean;failed:boolean;summary:string;needsAttention:boolean;count?:number;readTurns?:string[]}
function freshState():Row {
 return {version:1,workspaceId:crypto.randomUUID().toUpperCase(),revision:0,sources:[],knowledge:[],layout:null,connections:[],codexPath:'',model:'',cloudConsent:false,lastJob:'Not yet generated',autoSync:false,onboarding:{unlockedApplets:['app-gmail'],version:1,presets:['home'],completed:false}};
}

/** The World library: the SQLite ledger (configuration included, earlier `index.json`) and immutable originals.
 * Every OS uses the format the Mac host established, so an installed library opens unchanged. */
export class WorldStore {
 state:Row;
 busy=false;
 organizing=false;
 status='Sources are stored on this computer';
 error:string|null=null;
 writable=true;
 /** Practice edits survive page reloads, never a new app session. */
 sampleUI:Record<string,string>={};
 activityRevision=0;
 sourceContentEpoch=0;
 sourceContentEpochs:Record<string,number>={};
 liveAppOriginals:Record<string,Row>={};
 liveAppRecords:Record<string,Row[]>={};
 appletActivity:Record<string,AppletActivity>={};
 homeWriteDrafts:Record<string,Row>={};
 mailReadRevision=0;
 mailReadPages:Row[]=[];
 attentionEpoch=0;
 /** Evidence each Fox turn actually read, keyed `provider:id`; only this can back a saved quote. */
 worldEvidence:Record<string,Record<string,Row>>={};
 private worldLedger:WorldLedger|null=null;
 private listeners=new Set<()=>void>();
 private worldListeners=new Set<()=>void>();
 /** Host services contribute snapshot fields that are not library state (update status, routines). */
 snapshotExtras:()=>Row=()=>({});
 runtimeRows:()=>Row[]=()=>[];
 /** The host reports a history event that could not be saved; the action it describes still continues. */
 historyFailure:(error:unknown,kind:string)=>void=()=>{};
 readonly root:string;
 readonly preferences:Preferences;
 readonly options:StoreOptions;
 constructor(root:string,preferences:Preferences,options:StoreOptions){
  this.root=root;this.preferences=preferences;this.options=options;
  ensureDirectory(root);
  try{this.state=this.storedConfiguration()??freshState();}
  catch{this.state=freshState();this.writable=false;this.error='Could not read the local library. Original files are preserved; writing is disabled.';}
  this.state.sources??=[];this.state.knowledge??=[];this.state.connections??=[];
  if(this.writable){try{this.loadLibrary();}catch(error){this.writable=false;this.error=error.message;}}
  // UI-only World: retire the old source mirror for existing and new profiles.
  this.state.autoGenerate=false;this.state.autoSync=false;this.state.automaticProcessingVersion=2;
  for(const connection of this.state.connections)if(['syncing','reading'].includes(connection.syncStatus??'')){connection.syncStatus='sync_error';connection.syncError='The last read was interrupted. Open the shelf to retry.';}
  if(!this.state.googleClientID&&options.googleClientID)this.state.googleClientID=options.googleClientID;
  if(this.state.onboarding?.completed)this.state.onboarding=this.onboardingResult({operation:'offerGames'});
  if(/^(正在|Organizing|Designing)/.test(this.state.lastJob??''))this.state.lastJob='The last task was interrupted. You can generate again.';
  if(this.writable){try{this.persist();}catch(error){this.writable=false;this.error=error.message;}}
  // The person's World preferences live in the World's database (preferences.ts).
  if(this.writable)preferences.attachWorld({read:()=>this.ledger().setting('preferences'),write:values=>this.ledger().saveSetting('preferences',values)});
 }
 // Lifecycle ---------------------------------------------------------------------------
 onChange(listener:()=>void){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
 onWorldChange(listener:()=>void){this.worldListeners.add(listener);return ()=>this.worldListeners.delete(listener);}
 notify(){for(const listener of this.listeners)try{listener();}catch{}}
 /** Item/activity change without a configuration write. */
 worldChanged(){this.activityRevision+=1;for(const listener of this.worldListeners)try{listener();}catch{}this.notify();}
 sampleEnabled(){return this.preferences.bool('worldlet.sampleEnabled');}
 ledger(){
  if(this.worldLedger)return this.worldLedger;
  const value=new WorldLedger(this.root,owner=>this.runtimeSpec(owner));
  value.migrate(this.state as any);value.requireFreshAttentionReview();value.recoverInterruptedChecks();
  try{value.finishLocalDeletionFiles();}catch{}
  if(this.writable){try{moveFilesIn(this.root,value);}catch{}removeOldLeftovers(this.root);}
  this.worldLedger=value;return value;
 }
 closeLedger(){this.worldLedger?.close();this.worldLedger=null;}
 runtimeSpec(owner:string){return this.runtimeRows().find(row=>row.provider===owner&&(row.mode==='scheduled'||row.mode==='observation'))??null;}
 private loadLibrary(){
  if(!fs.existsSync(path.join(this.root,'world.sqlite'))&&(this.state.libraryStorageVersion!=null||this.hadDatabase()))throw new WorldletError('The World library database is missing. Restore its backup before continuing.');
  const storage=new WorldLedger(this.root);
  try{storage.loadLibrary(this.state);}finally{storage.close();}
 }
 persist(){
  if(!this.writable)throw new WorldletError('The library is read-only. Original data cannot be overwritten.');
  this.ledger().saveConfiguration(this.state);
  this.state.libraryStorageVersion=1;
 }
 private storedConfiguration(){
  const stored=WorldLedger.storedConfiguration(this.root);
  if(stored&&stored.version!==1)throw new WorldletError('Unsupported data version');
  return stored;
 }
 /** Without its configuration file a library that lost its database looks new: its moved-in
  * `index.json` or its originals show it had one. */
 private hadDatabase(){
  if(fs.existsSync(path.join(this.root,'index.json')))return false;
  if(fs.existsSync(path.join(this.root,'index.json.before-database')))return true;
  try{return fs.readdirSync(path.join(this.root,'sources')).length>0;}catch{return false;}
 }
 changed(){this.state.revision=(this.state.revision??0)+1;this.persist();this.notify();}
 /** Reloads configuration after a restore or reset replaced the files. */
 reload(){
  this.closeLedger();this.savedOverlay=null;this.preferences.reloadWorld();
  this.state=this.storedConfiguration()??freshState();
  this.state.sources??=[];this.state.knowledge??=[];this.state.connections??=[];
  this.loadLibrary();
  this.homeWriteDrafts={};this.liveAppOriginals={};this.liveAppRecords={};this.appletActivity={};this.worldEvidence={};this.sampleUI={};
  this.writable=true;this.error=null;
 }
 setCloudConsent(allowed:boolean){if(!this.writable)throw new WorldletError('The library is read-only.');this.state.cloudConsent=allowed;this.changed();}

 // Snapshot ----------------------------------------------------------------------------
 // Weather and brought conversations need no account: the World holds them (core/ongoing/attention.ts).
 get attentionProviders(){return [...this.state.connections.filter(canBuild).map(c=>c.provider),'weather','conversations'];}
 projectAttention(items:Row[]){return core<Row[]>('attentionProject',{items,facts:this.ledger().attentionFacts(),now:Date.now()/1000,providers:this.attentionProviders});}
 worldItems(){return core<Row[]>('worldItemsVisible',{items:this.projectAttention(this.ledger().records('items')),enabledSourceIDs:this.state.sources.filter(s=>s.enabled!==false).map(s=>s.id)});}
 worldChecks(){return this.ledger().records('checks');}
 sourceContentRevision(provider:string){return `${this.sourceContentEpoch}:${this.sourceContentEpochs[provider]??0}`;}
 appRecords(provider:string){
  return this.liveAppRecords[provider]??this.state.sources.filter(s=>s.enabled!==false&&s.origin===provider).slice(0,50).map(s=>({id:s.id,sourceId:s.id,title:s.title,url:s.sourceURL??''}));
 }
 /** Providers with read records the Attention Center has not acknowledged yet; a delivery stays
  * pending through the synthesis that consumes it. */
 attentionPendingProviders(){
  if(this.state.cloudConsent!==true)return new Set<string>();
  return new Set(this.ledger().records('runtime-deliveries').filter(row=>row.consumerId==='attention:center'&&row.status==='pending').map(row=>String(row.provider)));
 }
 appletSnapshot(connection:Row,items=this.worldItems(),checks=this.worldChecks(),attentionPending=this.attentionPendingProviders()){
  const value:Row={id:connection.id,provider:connection.provider,label:connection.target,transport:connection.transport??'',syncStatus:connection.syncStatus??'connected',records:this.appRecords(connection.provider),contentRevision:this.sourceContentRevision(connection.provider)};
  if(connection.syncError)value.syncError=connection.syncError;
  const check=checks.find(row=>row.provider===connection.provider);
  if(check)value.requiredAction=check.requiredAction;
  const input:Row={provider:connection.provider,connected:canBuild(connection),items,syncStatus:connection.syncStatus??null,check:check??null,activity:this.appletActivity[connection.provider]??null,attentionPending:attentionPending.has(connection.provider)};
  return {...value,...core('appletActivitySnapshot',input)};
 }
 private sourceRows(knowledge:Row[]){
  const metadata=this.state.sources.map(s=>({id:s.id,revision:s.revision,enabled:s.enabled!==false}));
  const plan=core('sourceSnapshotPlan',{sources:metadata,knowledge});
  const pending=new Set<string>(plan.ids);
  const originals=this.state.sources.map(source=>{
   let excerpt='';
   if(pending.has(source.id)){try{excerpt=String(this.original(source.id).text??'').slice(0,plan.maxCharacters);}catch{}}
   return {id:source.id,title:source.title,origin:source.origin,revision:source.revision,enabled:source.enabled!==false,preset:source.preset??null,moduleKey:source.moduleKey??'',connectionId:source.connectionID??'',excerpt,sourceURL:source.sourceURL??''};
  });
  return core<Row[]>('sourceSnapshotRows',{sources:originals,knowledge,regions:this.state.onboarding?.connectionRegions??{}});
 }
 /** A small World setting kept in the database: 'overlay' (the page's local edits) or 'environment'
  * (weather). Its earlier `<key>.json` moves in once and stays as `.before-database`; a file brought
  * back by restoring an older backup is the newer copy then. */
 worldSetting(key:'overlay'|'environment'|'youtube'):Row|null {
  const file=path.join(this.root,key+'.json');
  const legacy=fs.existsSync(file)&&!isLink(file);
  if(legacy&&!this.writable){try{return readJSON(file);}catch{return null;}}
  const ledger=this.ledger();
  if(legacy){
   let value:unknown=null;try{value=readJSON(file);}catch{}
   if(value&&typeof value==='object'&&!Array.isArray(value))ledger.saveSetting(key,value as Row);
   fs.renameSync(file,file+'.before-database');
  }
  return ledger.setting(key);
 }
 saveWorldSetting(key:'overlay'|'environment'|'youtube',value:Row){
  if(!this.writable)throw new WorldletError('Library is read-only.');
  this.worldSetting(key);this.ledger().saveSetting(key,value);
 }
 /** The page's local edits; this store is its only writer, so it is read once per load. */
 private savedOverlay:Row|null=null;
 private overlay():Row {
  if(this.savedOverlay)return this.savedOverlay;
  let overlay:Row=EMPTY_OVERLAY();try{overlay=this.worldSetting('overlay')??overlay;}catch{}
  return this.savedOverlay=overlay;
 }
 snapshot():Row {
  const knowledge=this.state.knowledge;
  const overlay=this.overlay();
  // One projection per snapshot, shared by every connection below.
  const worldItems=this.worldItems(),worldChecks=this.worldChecks(),attentionPending=this.attentionPendingProviders();
  return {
   appName:this.options.appName,platform:this.options.platform,hostCapabilities:this.options.capabilities(),mockGoogleAvailable:this.options.mockGoogleAvailable,...this.options.tourCodaAfterWinMs?{tourCodaAfterWinMs:this.options.tourCodaAfterWinMs}:{},
   worldItems,worldChecks,activityRevision:this.activityRevision,onboarding:this.state.onboarding??{version:1,presets:['home'],completed:false},
   cloudConsent:this.state.cloudConsent===true,busy:this.busy,sampleUI:{...this.sampleUI},textScale:this.preferences.number('worldlet.textScale',0),
   sampleEnabled:this.sampleEnabled(),workspaceId:this.state.workspaceId,revision:this.state.revision,sources:this.sourceRows(knowledge),knowledge,
   layout:this.state.layout??null,overlay,taskReviews:this.pageTaskReviews(),connections:this.state.connections.filter(canBuild).map(c=>this.appletSnapshot(c,worldItems,worldChecks,attentionPending)),
   ...this.snapshotExtras()
  };
 }

 // Presentation and history --------------------------------------------------------------
 savePresentation(body:Row){
  if(!this.writable)throw new WorldletError('Library is read-only.');
  const request=core('presentationRequest',body);
  if(request.action==='setTextScale')this.preferences.set('worldlet.textScale',request.value);
  else if(request.action==='saveSampleUI')this.sampleUI=request.state;
  else if(request.action==='saveOverlay'){this.saveWorldSetting('overlay',request.state);this.savedOverlay=request.state;}
  else throw new WorldletError('Unknown presentation action.');
 }
 /** Recording must never fail the action it describes; transport traffic is skipped first. */
 recordWorldAction(action:string,body:Row,requestID:string,phase='requested'){
  const operation=typeof body.operation==='string'?body.operation:'';
  if(eventPolicy.plumbing.includes(action)||operation==='status'||eventPolicy.plumbing.includes(action+':'+operation))return;
  if(this.sampleEnabled())return;
  try{
   const projected=core('worldActionEvent',{action,body,requestId:requestID,phase,at:Date.now()/1000});
   this.recordHistory(projected,projected.appletId??'');
  }catch(error){this.historyFailure(error,'world.action');}
 }
 /** Identified best-effort append: a retried id adds no row, and a failed save is reported, never thrown. */
 recordHistory(event:Row,key=''):boolean{
  try{this.ledger().append(event,key);return true;}
  catch(error){this.historyFailure(error,typeof event.kind==='string'?event.kind:'');return false;}
 }
 worldHistory(before?:number,after?:number){
  if(this.sampleEnabled())return {entries:[],sample:true};
  const args:Row={limit:50};if(before!=null)args.before=before;if(after!=null)args.after=after;
  const page=this.ledger().queryWorldHistory(args);
  return {entries:(page.events??[]).map(event=>{const at=Date.parse(event.at);return typeof event.at==='string'&&Number.isFinite(at)?{...event,at:at/1000}:event;})};
 }
 /** The trusted World page's activity bridge sends `{kind,data}`; its recorder supplies the event id, surface and time. */
 private worldActivity?:ActivityRecorder;
 recordActivity(body:Row){
  if(!this.writable||this.sampleEnabled())return;
  (this.worldActivity??=new ActivityRecorder(this,'https://worldlet.local/world')).event(body);
 }

 // Items -------------------------------------------------------------------------------
 private personal(message:string){if(!this.writable||this.sampleEnabled())throw new WorldletError(message);}
 markWorldItemRead(id:string){
  this.personal('Invalid item.');
  if(!this.worldItems().some(item=>item.id===id))throw new WorldletError('Unknown item.');
  this.ledger().update(id,'read',null,true);this.worldChanged();
 }
 setWorldItemStatus(id:string,status:string,snoozedUntil?:string|null,by?:'fox'){
  this.personal('Invalid item status.');
  if(!this.worldItems().some(item=>item.id===id))throw new WorldletError('Unknown item.');
  this.ledger().update(id,status,snoozedUntil,false,by);this.worldChanged();
 }
 /** Pending task reviews for the Attention cards of the tasks each may update (owner Order 2026-10-07: decisions
  * go to Attention, not Fox's dialog). Ids and the source's provider only, never the evidence. */
 private pageTaskReviews():Row[]{
  if(!this.writable||this.sampleEnabled()||this.state.cloudConsent!==true)return [];
  try{
   return this.ledger().settledTaskReviews().map(row=>({id:row.id,provider:typeof row.proposal?.provider==='string'?row.proposal.provider:'',
    items:[...new Set([row.previous?.id,...(Array.isArray(row.candidates)?row.candidates:[]).map((c:Row)=>c?.id)].filter((v):v is string=>typeof v==='string'))]}));
  }catch{return [];}
 }
 reviewTask(id:string,choice:string,candidateID?:string){
  if(!this.writable||!this.state.cloudConsent||this.sampleEnabled())throw new WorldletError('Open your personal world to review this task.');
  const db=this.ledger();
  if(choice!=='skip'){
   const row=db.find('task-reviews',id),refs=row?.proposal?.sources;
   if(!Array.isArray(refs)||!refs.every(ref=>this.state.connections.some(c=>c.provider===ref.provider&&canBuild(c))))throw new WorldletError("Reconnect the task's sources before confirming this change.");
  }
  const result=db.resolveTaskReview(id,choice,candidateID);
  this.worldChanged();return result;
 }
 resolveBrowserOutcome(id:string,done:boolean){
  if(!this.writable||!this.state.cloudConsent||this.sampleEnabled())throw new WorldletError('Open your personal world to review a browser result.');
  const result=this.ledger().resolveBrowserAction(id,done);this.worldChanged();return result;
 }
 checkProviders(){return this.runtimeRows().filter(row=>row.mode==='scheduled').map(row=>row.provider);}
 /** Fox tools and Fox notice undo share one schedule path. */
 configureWorldCheck(args:Row,cancel:(provider:string)=>void=()=>{}){
  const db=this.ledger();
  const providers=this.checkProviders().filter(provider=>this.state.connections.some(c=>c.provider===provider&&canBuild(c)));
  if(typeof args.provider!=='string')throw new WorldletError('Invalid source check configuration.');
  const existing=db.find('checks',args.provider);
  const check=core('sourceCheckConfigure',{request:args,providers,now:Date.now()/1000,check:existing??null});
  if(typeof check?.enabled!=='boolean')throw new WorldletError('Invalid source check configuration.');
  db.transaction(()=>{db.put('checks',args.provider,check);db.setRuntimeTasksEnabled(args.provider,check.enabled);db.configureRuntimeSource(check);});
  if(!check.enabled)cancel(args.provider);
  this.worldChanged();return {ok:true,runsWhileAppOpen:true};
 }
 /** Saved state a guarded Fox write replaces, so its notice can undo exactly. */
 guardedWriteBefore(tool:string,args:Row){
  const db=this.ledger();
  if(tool==='configure_world_check')return db.find('checks',args.provider)??null;
  const ids=tool==='archive_world_items'?(Array.isArray(args.ids)?args.ids:[]):[args.id].filter(id=>typeof id==='string');
  return db.records('items').filter(item=>ids.includes(item.id));
 }
 undoGuardedWrite(undo:Row){
  if(!this.writable||!this.state.cloudConsent||this.sampleEnabled())throw new WorldletError('Open your personal world to undo this change.');
  if(undo.kind==='check'&&undo.request){this.configureWorldCheck(undo.request);return;}
  if(!Array.isArray(undo.items))throw new WorldletError('This change can no longer be undone.');
  this.ledger().restore(undo.items);this.worldChanged();
 }

 // Sources -----------------------------------------------------------------------------
 ingest({title,text,raw,origin,externalId,connectionID,sourceURL,commit=true}:{title:string,text:string,raw?:string,origin:string,externalId:string,connectionID?:string,sourceURL?:string,commit?:boolean}){
  if(!this.writable)throw new WorldletError('Library is read-only.');
  if(!text.trim()||Buffer.byteLength(text,'utf8')>1_000_000)throw new WorldletError('Source is empty or exceeds 1 MB. Split it before importing.');
  const id=digest(origin+':'+externalId),revision=digest(title+'\n'+text+'\n'+(raw??text)),blob=`sources/${id}/${revision}.json`;
  if(this.state.sources.some(s=>s.id===id&&s.revision===revision))return false;
  if(this.state.sources.length>=100000&&!this.state.sources.some(s=>s.id===id))throw new WorldletError('The library has reached the 100,000 -source limit.');
  writeJSON(path.join(this.root,blob),{title,text,raw:raw??text,kind:origin});
  const previous=this.state.sources.find(s=>s.id===id);
  this.state.sources=this.state.sources.filter(s=>s.id!==id);
  const source:Row={id,title,origin,revision,blob,enabled:previous?.enabled??true,updatedAt:referenceDate()};
  if(previous?.preset!=null)source.preset=previous.preset;if(previous?.moduleKey!=null)source.moduleKey=previous.moduleKey;
  if(connectionID)source.connectionID=connectionID;if(sourceURL)source.sourceURL=sourceURL;
  this.state.sources.push(source);
  this.state.knowledge=this.state.knowledge.filter(k=>k.sourceId!==id);
  this.recordBuiltRegion('home');
  if(commit)this.changed();
  return true;
 }
 original(id:string):Row {
  const live=this.liveAppOriginals[id];
  if(live){
   if(!this.state.connections.some(c=>canBuild(c)&&id.startsWith('live:'+c.provider+':')))throw new WorldletError('Reconnect this app to read its original.');
   return live;
  }
  const source=this.state.sources.find(s=>s.id===id);
  if(!source)throw new WorldletError('Source not found.');
  const base=path.join(fs.realpathSync(this.root),'sources',source.id);
  let file:string;try{file=fs.realpathSync(path.join(this.root,source.blob));}catch{throw new WorldletError('This original is no longer available.');}
  if(!WorldLedger.safeLibraryComponent(source.id)||!file.startsWith(base+path.sep))throw new WorldletError('This original has an invalid local path.');
  return readJSON(file);
 }
 discardBlobs(id:string){
  if(!WorldLedger.safeLibraryComponent(id))return;
  for(const dir of ['sources','knowledge','cache/knowledge'])fs.rmSync(path.join(this.root,dir,id),{recursive:true,force:true});
 }
 forgetDerivedLayout(){this.state.layout=null;fs.rmSync(path.join(this.root,'world'),{recursive:true,force:true});}
 removeSource(id:string){
  if(this.busy)return;
  this.ledger().forgetLocalSource(id);
  this.state.sources=this.state.sources.filter(s=>s.id!==id);this.state.knowledge=this.state.knowledge.filter(k=>k.sourceId!==id);
  this.state.layout=null;this.changed();
  this.discardBlobs(id);fs.rmSync(path.join(this.root,'world'),{recursive:true,force:true});
 }
 importFile(file:string,connectionID?:string){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1_000_000)throw new WorldletError('Only plain text files under 1 MB can be imported.');
  const text=fs.readFileSync(file,'utf8');
  return this.ingest({title:path.basename(file,path.extname(file)),text,origin:'file',externalId:path.resolve(file),connectionID});
 }
 syncFolder(connection:Row){
  const folder=connection.folderPath;
  if(typeof folder!=='string'||!fs.existsSync(folder))throw new WorldletError('Folder access expired. Choose the folder again.');
  let count=0;
  const walk=(dir:string)=>{
   for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.')||['node_modules','.git','dist','build'].includes(entry.name)||entry.isSymbolicLink())continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){if(!entry.name.endsWith('.app')&&!entry.name.endsWith('.bundle'))walk(file);continue;}
    if(!['md','txt','json','csv'].includes(path.extname(entry.name).slice(1).toLowerCase()))continue;
    if(count>=100)throw new WorldletError('A folder can sync up to 100 text files. Choose a smaller folder.');
    count+=1;this.importFile(file,connection.id);
   }
  };
  walk(folder);
  this.status='Folder synced. Deleting source files does not remove imported copies.';
 }

 // Onboarding --------------------------------------------------------------------------
 private onboardingResult(body:Row){return core('onboardingUpdate',{setup:this.state.onboarding??{version:1,presets:['home'],completed:false},body});}
 recordBuiltRegion(region:string){this.state.onboarding=this.onboardingResult({operation:'builtRegion',region});}
 recordRegionConnection(id:string,region:string){this.state.onboarding=this.onboardingResult({operation:'connectionRegion',id,region});this.persist();}
 updateOnboarding(body:Row){
  const operation=typeof body.operation==='string'?body.operation:'';
  if(!this.writable||this.busy&&!['intro','journey','mail','complete','setup','unlock','removeApplet','regionLayout'].includes(operation))throw new WorldletError('Please wait for the current operation to finish.');
  // Internal placement reducers cannot be invoked by a page request.
  if(['builtRegion','connectionRegion'].includes(operation))throw new WorldletError('Unknown setup action.');
  const setup=this.onboardingResult(body);
  // Opening an Applet saves when it was used: kept in the World, without a new revision redrawing the page that sent it.
  if(operation==='regionLayout'){const previous=this.state.onboarding;this.state.onboarding=setup;try{this.persist();}catch(error){this.state.onboarding=previous;throw error;}return {ok:true};}
  if(operation==='region'){
   const sources:string[]=body.sourceIds??[],connections:string[]=body.connectionIds??[];
   if(!sources.every(id=>this.state.sources.some(s=>s.id===id&&s.enabled!==false))||!connections.every(id=>this.state.connections.some(c=>c.id===id&&canBuild(c))))throw new WorldletError('Connect a source or choose an existing local source first.');
  }
  if(operation==='journey'&&typeof body.itemId==='string'&&!this.worldItems().some(item=>item.id===body.itemId))throw new WorldletError('This attention item is no longer available.');
  const before=structuredClone(this.state);
  let sourceId:string|undefined;
  try{
   if(operation==='note'){
    if(typeof body.title!=='string'||typeof body.text!=='string'||typeof body.preset!=='string')throw new WorldletError('Invalid note.');
    const externalId=crypto.randomUUID().toUpperCase(),id=digest('note:'+externalId);
    this.ingest({title:body.title,text:body.text,origin:'note',externalId,commit:false});
    const source=this.state.sources.find(s=>s.id===id);
    if(source){source.preset=body.preset;source.moduleKey=body.moduleKey;}
    sourceId=id;
   }
   this.state.onboarding=setup;
   this.changed();
  }catch(error){this.state=before;throw error;}
  return sourceId?{ok:true,sourceId}:{ok:true};
 }

 // Live source content and deletion ------------------------------------------------------
 forgetLiveSourceContent(provider?:string){
  if(!provider||provider==='gmail'){this.mailReadPages=[];this.mailReadRevision+=1;}
  if(provider){
   this.sourceContentEpochs[provider]=(this.sourceContentEpochs[provider]??0)+1;
   delete this.liveAppRecords[provider];delete this.appletActivity[provider];
   this.liveAppOriginals=Object.fromEntries(Object.entries(this.liveAppOriginals).filter(([key])=>!key.startsWith('live:'+provider+':')));
  }else{
   this.sourceContentEpoch+=1;this.liveAppRecords={};this.liveAppOriginals={};this.appletActivity={};
  }
 }
 private deletable(){if(!this.writable||this.sampleEnabled())throw new WorldletError('Open your personal world to delete its data.');}
 /** Core scopes the deletion; the ledger applies it in one transaction, then the files go. */
 deleteLocalContent(request:Row,clearMail:()=>void=()=>{}){
  this.deletable();
  const scope=core<Row>('localDeletionRequest',request);
  const item=typeof scope.item==='string';
  const ids=new Set(item?[]:core<string[]>('localDeletionSources',{provider:scope.provider,sources:this.state.sources,connections:this.state.connections}));
  const library={sources:this.state.sources.filter(s=>!ids.has(s.id)),knowledge:this.state.knowledge.filter(k=>!ids.has(k.sourceId))};
  const paths=['world',...[...ids].filter(WorldLedger.safeLibraryComponent).flatMap(id=>['sources/'+id,'knowledge/'+id,'cache/knowledge/'+id])];
  if(!item&&scope.provider===null)paths.push('cache');
  if(scope.clearMailReviews)clearMail();
  const removed=this.ledger().deleteLocalContent(scope,library,paths);
  if(item&&!removed)return 0;
  this.state.sources=library.sources;this.state.knowledge=library.knowledge;
  if(!item)this.forgetLiveSourceContent(scope.provider??undefined);
  this.attentionEpoch+=1;this.state.layout=null;this.changed();
  // A failed removal stays recorded and is retried when the ledger next opens.
  try{this.ledger().finishLocalDeletionFiles();}catch{}
  this.worldChanged();return removed;
 }
 validateThemes(){return THEMES;}
}
