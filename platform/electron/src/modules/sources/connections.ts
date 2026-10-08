import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {app,dialog} from 'electron';
import type {OpenDialogOptions} from 'electron';
import {digest,WorldletError} from '../../files.ts';
import {referenceDate} from '../../store/world-store.ts';
import {APPLE_PROVIDERS,connectApple} from './apple.ts';
import {nativeFirst} from './content.ts';
import {GOOGLE_SIGN_IN,SOURCE_PROVIDERS,WORLD_APPS} from '../../../../../core/applets/index.ts';
import {isMigrationSource} from '../../../../../core/agent/index.ts';
import {agentIntegrationPlans} from '../agent-runtime/agent-integrations.ts';
import {IMPORT_REGIONS} from './context.ts';
import type {SourcesContext} from './context.ts';
import type {Row} from '../../host/types.ts';
import {backgroundLaunch} from '../../background-launch.ts';
// Account connections (Mac AgentSources, WorldView `connect`, ConnectionView.requestConnection)
// and local files/folders (Mac Store.importFiles, Windows FolderImport/TextFileImport).
// GitHub, Linear and PayPal had a native token sheet on the Mac; here they use the Agent's
// own MCP authorization like Notion, because the World page owns all connection UI.
const DIRECT=['google',...SOURCE_PROVIDERS];
const TEXT_EXTENSIONS=['md','txt','json','csv'];

export function createConnections(ctx:SourcesContext){
 const {store,host}=ctx;

 function acceptAgentConnection(remote:Row,region?:string){
  if(remote.status!=='connected')return;
  const {id,provider,target}=remote;
  if(typeof id!=='string'||!id||id.length>160||typeof provider!=='string'||!ctx.sourceConnections().providers(provider).length||typeof target!=='string'||target.length>2000)throw new WorldletError('Invalid connection result.');
  const previous=structuredClone(store.state);
  try{
   const connection:Row={id,provider,target,transport:ctx.accountsId(),syncStatus:'connected',connector:typeof remote.connector==='string'?remote.connector:'mcp'};
   if(provider==='notion')connection.cursors={reviewGrant:crypto.randomUUID().toUpperCase()};
   store.state.connections=store.state.connections.filter((c:Row)=>c.id!==id);store.state.connections.push(connection);
   // Reauthorization may select a different account: the next Applet open must read the
   // new grant instead of reusing the previous inventory.
   store.attentionEpoch+=1;
   const db=store.ledger();
   db.transaction(()=>{
    db.forgetAppletState(provider);
    db.replaceAttentionCache('attention-context',{id:'current',facts:db.attentionFacts().filter(fact=>fact.provider!==provider)});
   });
   store.forgetLiveSourceContent(provider);
   store.state.onboarding??={version:1,presets:['home'],completed:false};
   store.state.onboarding.connectionRegions??={};
   const selected=region??store.state.onboarding.connectionRegions[id]??'home';
   store.state.onboarding.connectionRegions[id]=selected;
   store.recordBuiltRegion(selected);store.changed();
   if(['gmail','google-calendar'].includes(provider)){
    const check=db.records('checks').find(row=>row.id===provider);
    if(check?.enabled===true)db.put('checks',provider,{...check,nextAt:Date.now()/1000});
   }
  }catch(error){store.state=previous;throw error;}
 }

 /** Starts the first Mail/Calendar read; false when the preconditions do not hold. */
 function startOnboardingMailCheck(){
  const tools=ctx.worldTools();
  if(!tools||!store.writable||!store.state.cloudConsent||store.sampleEnabled()||!ctx.agentConnection('gmail'))return false;
  tools.startOnboardingMailCheck();return true;
 }

 async function connectAgentSource(provider:string,region:string|undefined,mock:boolean){
  if(!store.writable||store.busy)throw new WorldletError('Wait for the current task to finish.');
  let connected=false,checking=false;
  store.busy=true;store.error=null;store.status=mock?'Connecting the mock Google account…':'Complete authorization in your browser.';
  try{
   if(mock&&(host.profile.channel!=='dev'||provider!=='google'))throw new WorldletError('Mock Google is available only in development builds.');
   await ctx.sourceConnections().connect({provider,target:'',endpoint:'',token:'',home:ctx.home(),mock,
    // Sign-in stages reach the page as they happen (contracts/platform.ts GOOGLE_SIGN_IN_EVENT).
    onStage:(stage,url)=>host.page.event('worldlet:google-sign-in',url?{stage,url}:stage),
    onConnected:receipt=>acceptAgentConnection({id:typeof (receipt as Row).id==='string'?(receipt as Row).id:`${ctx.accountsId()}-${receipt.provider}`,provider:receipt.provider,target:receipt.target,status:'connected',connector:receipt.connector},region)});
   connected=true;store.status='Connected. Ask Fox to find or read your information.';
   if(GOOGLE_SIGN_IN.includes(provider)&&store.state.cloudConsent&&ctx.agent().supportsBackgroundChecks)checking=startOnboardingMailCheck();
   if(!backgroundLaunch()){if(process.platform==='darwin')app.focus({steal:true});host.window()?.focus();}
  }finally{
   store.busy=false;
   if(!connected)store.status='Sign-in did not finish. Existing connections are kept; try again when ready.';
  }
  return checking;
 }

 async function disconnectAgentSource(connection:Row){
  if(!store.writable||store.busy)throw new WorldletError('Wait for the current read to finish.');
  if(connection.transport!==ctx.accountsId())throw new WorldletError('Select the Agent that owns this connection before disconnecting it.');
  await ctx.busyWhile(async()=>{
   const removed=await ctx.sourceConnections().disconnect({id:connection.id,provider:connection.provider,target:connection.target,connector:connection.connector??'mcp'},ctx.home());
   store.attentionEpoch+=1;
   for(const provider of removed){store.ledger().forgetAppletState(provider);store.forgetLiveSourceContent(provider);}
   if(removed.includes('notion'))fs.rmSync(path.join(store.root,'app-content/notion'),{recursive:true,force:true});
   store.state.connections=store.state.connections.filter((c:Row)=>!(c.transport===ctx.accountsId()&&removed.includes(c.provider)&&(c.id===connection.id||c.connector===connection.connector)));
   store.changed();store.status='Disconnected. Local copies are kept.';
  });
 }

 // Local text files ------------------------------------------------------------------------
 function readText(file:string){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1_000_000)throw new WorldletError('Only plain text files under 1 MB can be imported.');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(file));}catch{throw new WorldletError('Save the selected files as UTF-8 text before importing.');}
  if(text.includes('\0'))throw new WorldletError('The selected file contains binary data.');
  return text;
 }
 /** Ingests every file in one batch; `changed()` publishes whatever was imported, even on failure. */
 function ingestFiles(files:string[],connectionID?:string){
  let imported=0;const ids:string[]=[];
  try{
   for(const file of files){
    const resolved=path.resolve(file);
    if(store.ingest({title:path.basename(resolved,path.extname(resolved)),text:readText(resolved),origin:'file',externalId:resolved,connectionID,commit:false}))imported+=1;
    const id=digest('file:'+resolved);
    if(store.state.sources.some((s:Row)=>s.id===id&&s.enabled!==false))ids.push(id);
   }
  }finally{if(imported)store.changed();}
  return {imported,ids};
 }
 function folderFiles(root:string){
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new WorldletError('Folder access expired. Choose the folder again.');
  const files:string[]=[];let visited=0;
  const walk=(dir:string)=>{
   for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(++visited>10000)throw new WorldletError('Choose a smaller folder to connect.');
    if(entry.name.startsWith('.')||['node_modules','dist','build'].includes(entry.name)||entry.isSymbolicLink())continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){if(!/\.(app|bundle|framework|photoslibrary)$/i.test(entry.name))walk(file);continue;}
    if(!entry.isFile()||!TEXT_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase()))continue;
    if(files.length>=100)throw new WorldletError('A folder can sync up to 100 text files. Choose a smaller folder.');
    files.push(file);
   }
  };
  walk(root);
  return files.sort();
 }
 const parent=()=>host.window();
 async function choose(options:OpenDialogOptions){
  const window=parent();
  const result=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);
  return result.canceled?[]:result.filePaths;
 }

 async function importFiles(body:Row):Promise<Row> {
  const region=ctx.requireRegion(body.region);
  if(store.sampleEnabled())throw new WorldletError('Leave the practice world before importing personal files.');
  if(store.busy)throw new WorldletError('Please wait for the current task to finish.');
  const selected=await choose({properties:['openFile','multiSelections'],filters:[{name:'Text',extensions:TEXT_EXTENSIONS}]});
  if(!selected.length)return {ok:true,cancelled:true,imported:0};
  if(store.sampleEnabled())throw new WorldletError('File import was cancelled.');
  const {imported,ids}=ingestFiles(selected);
  // Reimporting an unchanged file still makes a valid region association.
  if(region&&ids.length)store.updateOnboarding({operation:'region',region,sourceIds:ids});
  store.status=`Imported ${imported} sources.`;
  return {ok:true,imported,sourceIds:ids};
 }

 async function connectFolder(region?:string):Promise<Row> {
  if(store.sampleEnabled())throw new WorldletError('Return to your personal world to connect a folder.');
  if(store.busy)throw new WorldletError('Please wait for the current task to finish.');
  const [folder]=await choose({properties:['openDirectory'],title:'Choose a folder',buttonLabel:'Connect'});
  if(!folder)return {cancelled:true};
  if(store.sampleEnabled())throw new WorldletError('Folder connection was cancelled.');
  const files=folderFiles(folder);
  const existing=store.state.connections.find((c:Row)=>c.provider==='folder'&&c.folderPath===folder);
  const connection:Row=existing??{id:crypto.randomUUID().toUpperCase(),provider:'folder',target:path.basename(folder),folderPath:folder};
  if(region)store.recordRegionConnection(connection.id,region);
  const {imported,ids}=ingestFiles(files,connection.id);
  if(!existing)store.state.connections.push(connection);
  connection.syncedAt=referenceDate();
  store.recordBuiltRegion(region??'home');store.changed();
  store.status='Folder synced. Deleting source files does not remove imported copies.';
  return {ok:true,imported,sourceIds:ids,connected:true};
 }

 async function folderConnection(body:Row):Promise<Row> {
  if(store.sampleEnabled())throw new WorldletError('Return to your personal world to sync folders.');
  const id=typeof body.id==='string'?body.id:'',operation=body.operation;
  const connection=store.state.connections.find((c:Row)=>c.id===id&&c.provider==='folder');
  if(operation==='disconnect'){
   if(!connection)throw new WorldletError('This folder is not connected.');
   store.state.connections=store.state.connections.filter((c:Row)=>c!==connection);store.changed();
   store.status='Disconnected. What was already saved is kept; delete it separately from Settings if you want it gone.';
   return {ok:true};
  }
  if(operation==='choose')return connectFolder(ctx.requireRegion(body.region));
  if(operation!=='sync')throw new WorldletError('Unknown folder operation.');
  if(!connection)throw new WorldletError('This folder is not connected. Choose it again.');
  if(store.busy)throw new WorldletError('Please wait for the current task to finish.');
  if(typeof connection.folderPath!=='string')throw new WorldletError('Folder access expired. Choose the folder again.');
  const files=folderFiles(connection.folderPath);
  const {imported,ids}=ingestFiles(files,connection.id);
  connection.syncedAt=referenceDate();store.changed();
  store.status='Folder synced. Deleting source files does not remove imported copies.';
  return {ok:true,imported,sourceIds:ids};
 }

 /** Setup's second page (owner request 2026-10-04): the integrations the brought Agent already had.
  * One with its own token becomes the same Worldlet connection, owned by the built-in Hermes like any
  * other (#1463); one signed in through that app's own OAuth is listed to reconnect; the rest stay
  * with that Agent. Tokens never leave the host. */
 async function agentIntegrations(body:Row):Promise<Row> {
  if(!isMigrationSource(body.id))throw new WorldletError('Choose an Agent on this computer.');
  const items:Row[]=[];
  for(const plan of agentIntegrationPlans(body.id)){
   const already=!!plan.provider&&plan.provider!=='google'&&!!ctx.agentConnection(plan.provider);
   let outcome:string=already?'connected':plan.outcome;
   if(plan.outcome==='port'&&!already&&body.operation==='port'&&plan.provider&&plan.token){
    try{
     if(!store.writable||store.sampleEnabled())throw new WorldletError('Return to your own world first.');
     const region=WORLD_APPS.find(app=>app.key===plan.provider)?.region;
     await ctx.sourceConnections().connect({provider:plan.provider,target:'',endpoint:'',token:plan.token,home:ctx.home(),mock:false,onStage:()=>{},
      onConnected:receipt=>acceptAgentConnection({id:`${ctx.accountsId()}-${receipt.provider}`,provider:receipt.provider,target:receipt.target,status:'connected',connector:receipt.connector},region&&IMPORT_REGIONS.has(region)?region:undefined)});
     outcome='ported';
    }catch(error){host.diagnostics.record(error,'agentIntegrations');outcome='reconnect';}
   }
   items.push({title:plan.title,provider:plan.provider,outcome});
  }
  return {integrations:items};
 }

 return {
  acceptAgentConnection,importFiles,folderConnection,agentIntegrations,
  async connect(body:Row):Promise<Row> {
   const provider=body.provider;
   if(typeof provider!=='string')throw new WorldletError('Missing source.');
   const region=ctx.requireRegion(body.region);
   const local=process.platform==='darwin'&&APPLE_PROVIDERS.includes(provider);
   const direct=!local&&DIRECT.includes(provider);
   let checking=false;
   if(local)await connectApple(ctx,provider,region);
   else if(direct)checking=await connectAgentSource(provider,region,body.mock===true&&host.profile.channel==='dev');
   else if(APPLE_PROVIDERS.includes(provider))throw new WorldletError('This local app is available only on macOS.');
   else if(provider==='folder'){if(store.busy)throw new WorldletError('Please wait for the current task to finish.');return connectFolder(region);}
   else throw new WorldletError('Unsupported source.');
   if(!checking)void ctx.worldTools()?.checkWorldIfDue().catch(error=>host.diagnostics.record(error,'checkWorldIfDue'));
   return {ok:true,connected:true};
  },
  connectCancel(){ctx.sourceConnections().cancel();},
  async disconnectSource(body:Row){
   const provider=body.provider;
   if(typeof provider!=='string')throw new WorldletError('Choose a source to disconnect.');
   const connection=[...store.state.connections].sort(nativeFirst).find((c:Row)=>c.provider===provider);
   if(!connection)throw new WorldletError('This source is not connected.');
   if(connection.transport==='native'&&APPLE_PROVIDERS.includes(provider)){
    if(!store.writable||store.busy)throw new WorldletError('Wait for the current read to finish.');
    store.state.connections=store.state.connections.filter((c:Row)=>c.id!==connection.id);
    delete store.liveAppRecords[provider];
    store.liveAppOriginals=Object.fromEntries(Object.entries(store.liveAppOriginals).filter(([key])=>!key.startsWith('live:'+provider+':')));
    store.changed();
   }else{
    if(connection.transport!==ctx.accountsId())throw new WorldletError('Disconnect this source from its Applet.');
    await disconnectAgentSource(connection);
   }
  }
 };
}
