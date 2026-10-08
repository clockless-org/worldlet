import {shell} from 'electron';
import {core} from '../../core.ts';
import {WorldletError,errorMessage as message} from '../../files.ts';
import {canBuild,referenceDate,type WorldStore} from '../../store/world-store.ts';
import {sourceOriginal,mailPresentation} from './records.ts';
import {APPLE_PROVIDERS,refreshApple} from './apple.ts';
import {DEVELOPMENT_SESSIONS} from '../../host/services.ts';
import type {DevelopmentSessionsService} from '../../host/services.ts';
import type {SourcesContext} from './context.ts';
import type {Row} from '../../host/types.ts';
// Live Applet content (Mac AgentSourceContent, AppContent, NotionContent, PayPalContent,
// CuratedSourceContent, DoorDash). Reads stay in memory for this app session.
/** Sort order that puts the host's own (native) connection first. */
export const nativeFirst=(a:Row,b:Row)=>(a.transport==='native'?0:1)-(b.transport==='native'?0:1);

/** The saved finding is a pointer and evidence, not a substitute for its mail: read the
 * authorized source again, never a model. */
export async function itemOriginal(ctx:SourcesContext,id:string):Promise<Row> {
 const {store}=ctx;
 if(store.sampleEnabled())throw new WorldletError('Personal originals are unavailable in the practice world.');
 const item=store.worldItems().find(row=>row.id===id);
 if(!item)throw new WorldletError('This item is no longer available.');
 const refs:Row[]=Array.isArray(item.sources)?item.sources:[];
 const ref=refs.find(row=>row?.provider==='gmail');
 if(item.provider==='gmail'&&ref&&ref.local!==true){
  const gmail=()=>store.state.connections.some((c:Row)=>c.provider==='gmail'&&canBuild(c));
  const source=ref.id;
  if(!gmail()||typeof source!=='string'||!source.startsWith('thread:'))throw new WorldletError('Reconnect Gmail with Fox to read this original. Your saved item is kept.');
  const revision=store.sourceContentRevision('gmail');
  const value=await ctx.agent().makeSourceAccess().run({action:'sourceRequest',provider:'gmail',operation:'read',threads:true,id:source,background:true},ctx.home());
  const messages=value?.records?.[0]?.data?.thread?.messages;
  if(revision!==store.sourceContentRevision('gmail')||!gmail()||!Array.isArray(messages)||!messages.length)throw new WorldletError('The original email is unavailable. Your saved item is kept.');
  const when=(row:Row)=>Number.parseInt(typeof row.internalDate==='string'?row.internalDate:'',10)||0;
  const originals=[...messages].sort((a,b)=>when(b)-when(a)).map(row=>sourceOriginal('gmail','',row));
  return {title:originals[0].title,text:'Messages in this thread, newest first.\n\n'+originals.map(o=>o.text).join('\n\n---\n\n'),messages:originals.map(o=>({title:o.title,text:o.text,mail:mailPresentation(o.raw)}))};
 }
 const evidence=refs.map(row=>(typeof row?.quote==='string'?row.quote:'')+'\n'+(typeof row?.url==='string'?row.url:'')).join('\n\n');
 return {title:item.title??'Saved item',text:(typeof item.context==='string'?item.context:'')+'\n\n'+evidence};
}

export async function refreshAgentSource(ctx:SourcesContext,connection:Row){
 const {store}=ctx;
 if(connection.transport!==ctx.accountsId())throw new WorldletError('Select the Agent that owns this source to read it.');
 if(connection.provider==='notion'){await readNotion(ctx,connection,'list','',true);return;}
 const provider:string=connection.provider,revision=store.sourceContentRevision(provider);
 const result=await ctx.sourceAccess().run({action:'sourceRefresh',provider,connector:connection.connector??''},ctx.home());
 if(revision!==store.sourceContentRevision(provider)||ctx.currentSourceIndex(connection)<0)throw new WorldletError('This connection changed while reading. Open the app again.');
 const records=result?.records;
 if(!Array.isArray(records)||records.length>50)throw new WorldletError('This app returned incomplete content. Retry to refresh it.');
 // Stage the complete batch before replacing any visible inventory/original.
 const originals=Object.fromEntries(Object.entries(store.liveAppOriginals).filter(([key])=>!key.startsWith('live:'+provider+':')));
 const seen=new Set<string>();
 const pages=records.map((record:Row)=>{
  const data=record?.data,id=record?.id;
  if(!data||typeof data!=='object'||typeof id!=='string'||!id||id.length>500||seen.has(id))throw new WorldletError('Invalid app result.');
  seen.add(id);
  const original=sourceOriginal(provider,'',data),key='live:'+provider+':'+id;
  originals[key]=original;
  const row:Row={id:key,title:original.title,sourceId:key,url:data.htmlLink??data.webViewLink??data.url??''};
  if(provider==='gmail'&&typeof data.threadId==='string'){row.threadId=data.threadId;row.labelIds=data.labelIds??[];}
  if(data.start&&typeof data.start==='object'){row.start=data.start.dateTime??data.start.date;row.allDay=data.start.dateTime==null;}
  if(provider==='google-calendar'){
   for(const field of ['hangoutLink','conferenceData','description','status','attendees','organizer','location'])if(data[field]!=null)row[field]=data[field];
   if(data.end&&typeof data.end==='object')row.end=data.end.dateTime??data.end.date;
  }
  const headers=data.payload?.headers;
  if(Array.isArray(headers)){const from=headers.find((h:Row)=>typeof h?.name==='string'&&h.name.toLowerCase()==='from')?.value;if(from!=null)row.from=from;}
  return row;
 });
 const index=ctx.currentSourceIndex(connection);
 if(index<0)throw new WorldletError('This connection changed while reading. Open the app again.');
 const previous=structuredClone(store.state),previousOriginals=store.liveAppOriginals,previousPages=store.liveAppRecords;
 try{
  store.liveAppOriginals=originals;store.liveAppRecords={...store.liveAppRecords,[provider]:pages};
  const current=store.state.connections[index];current.syncStatus='connected';delete current.syncError;
  store.changed();
 }catch(error){store.state=previous;store.liveAppOriginals=previousOriginals;store.liveAppRecords=previousPages;throw error;}
}

export async function appContent(ctx:SourcesContext,provider:string,refresh:boolean):Promise<Row> {
 const {store}=ctx;
 const readRevision=store.mailReadRevision;
 const connection=store.sampleEnabled()?undefined:[...store.state.connections].sort(nativeFirst).find((c:Row)=>c.provider===provider&&[ctx.accountsId(),'native'].includes(c.transport??'')&&canBuild(c));
 if(!connection)throw new WorldletError('Connect this app first.');
 if(provider==='notion'&&(refresh||!store.liveAppRecords[provider]))return notionContent(ctx,'list','');
 // Mail and Calendar Full View read the authorized API on first entry, independently of
 // browser cookies and model/content-processing permission. Cache is memory-only.
 if(refresh||(['gmail','google-calendar',...APPLE_PROVIDERS].includes(provider)&&!store.liveAppRecords[provider])){
  if(!store.writable||store.busy)throw new WorldletError('Fox is working. Try again when it finishes.');
  if(!['gmail','google-calendar','google-drive',...APPLE_PROVIDERS].includes(provider))throw new WorldletError('This app reads on demand through Fox. Automatic collection is not available yet.');
  delete store.appletActivity[provider];
  await ctx.busyWhile(async()=>{
   const index=store.state.connections.findIndex((c:Row)=>c.id===connection.id);
   if(index<0)throw new WorldletError('This app is disconnected.');
   store.status=`Reading ${provider}…`;store.state.connections[index].syncStatus='reading';delete store.state.connections[index].syncError;store.changed();
   try{
    if(connection.transport==='native')await refreshApple(ctx,connection);else await refreshAgentSource(ctx,connection);
    store.status='Applet records updated';
   }catch(error){
    const current=ctx.currentSourceIndex(connection);
    if(current>=0){const row=store.state.connections[current];row.syncStatus='sync_error';row.syncError=message(error);try{store.changed();}catch{}store.status='Read needs attention';}
    throw error;
   }
  });
 }
 if(provider==='gmail'&&readRevision!==store.mailReadRevision)store.liveAppRecords.gmail=store.mailReadPages;
 return {pages:store.appRecords(provider),scope:provider==='gmail'?'Recent 30 days · Up to 20 messages · Read only':provider==='google-calendar'?(connection.transport==='native'?'Mac calendars · Next 30 days · Up to 50 events · Read only':'Primary Google calendar · Next 30 days · Up to 50 events · Read only'):'Read on demand · Session results'};
}

export async function notionContent(ctx:SourcesContext,operation:string,id:string):Promise<Row> {
 const {store}=ctx;
 const connection=store.writable&&!store.sampleEnabled()?ctx.agentConnection('notion'):undefined;
 if(!connection)throw new WorldletError('Connect Notion in your personal world first.');
 if(!['list','fetch'].includes(operation))throw new WorldletError('Unsupported Notion request.');
 if(store.busy)throw new WorldletError('Fox is working. Try opening the shelf again when it finishes.');
 delete store.appletActivity.notion;
 return ctx.busyWhile(()=>readNotion(ctx,connection,operation,id));
}

export async function readNotion(ctx:SourcesContext,connection:Row,operation='list',id='',background=false):Promise<Row> {
 const {store}=ctx;
 let index=ctx.currentSourceIndex(connection);
 if(index<0)throw new WorldletError('Notion is disconnected.');
 const revision=store.sourceContentRevision(connection.provider);
 store.status=operation==='list'?'Reading Notion pages…':'Reading Notion page…';
 store.state.connections[index].syncStatus='reading';delete store.state.connections[index].syncError;store.changed();
 try{
  const result={...await ctx.sourceAccess().run({action:'sourceRequest',provider:'notion',operation,id,background},ctx.home())};
  index=ctx.currentSourceIndex(connection);
  if(revision!==store.sourceContentRevision(connection.provider)||index<0)throw new WorldletError('Notion changed while reading. Open it again.');
  if(result.ok!==true)throw new WorldletError('Notion did not return content.');
  const now=new Date();result.updatedAt=now.toISOString().replace(/\.\d{3}Z$/,'Z');result.formatVersion=3;
  // Return this read to its caller only; never mirror the page body.
  if(operation==='list'&&Array.isArray(result.pages))store.liveAppRecords[connection.provider]=result.pages.map((page:Row)=>({id:page.id??'',title:page.title??'Notion',url:page.url??''}));
  delete result.records;
  const row=store.state.connections[index];row.syncedAt=referenceDate();row.syncStatus='connected';delete row.syncError;
  store.changed();store.status=operation==='list'?'Notion pages updated':'Notion page read';
  return result;
 }catch(error){
  const current=ctx.currentSourceIndex(connection);
  if(revision===store.sourceContentRevision(connection.provider)&&current>=0){
   const row=store.state.connections[current];row.syncStatus='sync_error';row.syncError='Notion could not finish reading. Ask Fox to retry.';
   try{store.changed();}catch{}store.status='Notion needs attention';
  }
  throw error;
 }
}

export async function paypalContent(ctx:SourcesContext,body:Row):Promise<Row> {
 const {store}=ctx;
 const connected=()=>store.state.connections.some((c:Row)=>c.provider==='paypal'&&canBuild(c));
 if(!store.writable||store.sampleEnabled()||!ctx.agentConnection('paypal'))throw new WorldletError('Connect PayPal with Fox to read merchant invoices.');
 const operation=typeof body.operation==='string'?body.operation:'list';
 if(!['list','read'].includes(operation))throw new WorldletError('Unsupported PayPal read.');
 const result=await ctx.agent().makeSourceAccess().run({action:'sourceRequest',provider:'paypal',operation,id:typeof body.id==='string'?body.id:'',page:Number.isInteger(body.page)?body.page:1,background:true},ctx.home());
 if(!connected())throw new WorldletError('PayPal was disconnected.');
 return result;
}

export async function curatedSourceContent(ctx:SourcesContext,body:Row):Promise<Row> {
 const {store}=ctx;
 const input={...body};delete input.action;
 const plan=core<Row>('curatedSourceRead',input);
 const provider=plan?.connectionProvider;
 if(typeof provider!=='string')throw new WorldletError('Invalid source read.');
 if(!store.writable||store.sampleEnabled())throw new WorldletError('Local sources are unavailable in this world.');
 if(typeof plan.localTool==='string'){
  const sessions=ctx.host.optional<DevelopmentSessionsService>(DEVELOPMENT_SESSIONS);
  if(!sessions)throw new WorldletError('Local development tools are unavailable in this build.');
  const value=await sessions.list(plan.localTool,typeof plan.operation==='string'?plan.operation:'list',typeof plan.id==='string'?plan.id:'');
  if(typeof value?.error==='string')throw new WorldletError(value.error);
  return value;
 }
 const connection=ctx.agentConnection(provider);
 if(!connection)throw new WorldletError('Connect this Applet with Fox first.');
 const revision=store.sourceContentRevision(provider);
 const request:Row={...plan};delete request.connectionProvider;
 if(provider==='google-drive'&&request.operation==='read')request.operation='fetch';
 request.action='sourceRequest';request.background=true;
 const result=await ctx.agent().makeSourceAccess().run(request,ctx.home());
 if(revision!==store.sourceContentRevision(provider)||ctx.currentSourceIndex(connection)<0)throw new WorldletError('The account changed. Reopen the Applet.');
 return result;
}

export async function doorDash(ctx:SourcesContext,operation:string):Promise<Row> {
 const {store}=ctx;
 if(!store.writable||store.sampleEnabled())throw new WorldletError('Use DoorDash in your personal world.');
 if(!['status','login','disconnect','waitlist'].includes(operation))throw new WorldletError('Ask Fox to help with your DoorDash cart.');
 if(operation==='waitlist'){await shell.openExternal('https://forms.gle/gvCQZvu9C1EKA6aM6');return {ok:true};}
 if(store.busy)throw new WorldletError('Wait for the current operation to finish.');
 const work=async()=>{
  const result=await ctx.sourceAccess().run({action:'sourceRequest',provider:'doordash',operation},ctx.home());
  if(result?.ok!==true)throw new WorldletError(typeof result?.error==='string'?result.error:'DoorDash could not finish. Check early-access approval and sign-in.');
  if(operation==='login'){
   if(result.accountVerified!==true)throw new WorldletError('DoorDash account access has not been verified.');
   const previous=structuredClone(store.state);
   try{
    store.state.connections=store.state.connections.filter((c:Row)=>c.provider!=='doordash');
    store.state.connections.push({id:'cli-doordash',provider:'doordash',target:'DoorDash',transport:'cli',syncStatus:'connected',connector:'dd-cli'});
    store.changed();store.status='DoorDash connected. Ask Fox what you would like to eat.';
   }catch(error){store.state=previous;throw error;}
  }else if(operation==='disconnect'){
   store.state.connections=store.state.connections.filter((c:Row)=>c.provider!=='doordash');delete store.appletActivity.doordash;
   store.changed();store.status='DoorDash disconnected from Worldlet. Its CLI sign-in remains in its credential store.';
  }
  return result;
 };
 if(operation==='status')return work();
 store.status=operation==='login'?'Complete DoorDash sign-in in your browser…':'Disconnecting DoorDash…';
 return ctx.busyWhile(work);
}
