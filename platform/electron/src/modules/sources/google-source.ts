import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {Compile} from 'typebox/compile';
import {WorldletError} from '../../files.ts';
import {listWorldTools} from '../../../../../core/tools/index.ts';
import {GOOGLE_SIGN_IN,GOOGLE_SIGN_IN_SERVICES,curatedConnection,curatedSourceRead} from '../../../../../core/applets/index.ts';
import {harnessAuthHandoff} from '../../../../../core/agent/index.ts';
import {GoogleRestError,MOCK_GOOGLE_EMAIL,discover,mockGoogle,normalizeSource as normalize,prepareMail as prepare,readCalendar,readDrive,readDriveList,readPage,reconcileMail as reconcile,sendMail as send,sourceFailure,type GoogleRest} from '../../../../../core/accounts/index.ts';
import type {AgentEventHandler,AgentRuntime,AgentSourceConnections} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
import {ExecutionJournal} from '../agent-runtime/journal.ts';
import type {GoogleAccount,GoogleService} from './google-account.ts';

const GOOGLE=['gmail','google-calendar','google-drive'];
/** A host source request for Google, as the World's connection runs it (what HermesSourceAccess sent to host.py), or
 * null for any other source. Drive-backed Applets (Docs, Sheets, Slides) list and read through Core's curated read. */
function googleRequest(body:Row):Row|null {
 const provider=typeof body.provider==='string'?body.provider:'',operation=body.operation;
 if(body.action==='sourceRefresh')return GOOGLE.includes(provider)&&body.connector!=='mcp'?{operation:'read',service:provider,_background:true}:null;
 if(body.action!=='sourceRequest'||typeof operation!=='string')return null;
 if(curatedConnection(provider)==='google-drive'&&['list','fetch'].includes(operation)){
  const input:Row={...body};if(operation==='fetch')input.operation='read';delete input.action;delete input.background;
  const read=curatedSourceRead(input as any) as Row|null;
  if(!read||typeof read!=='object')throw new WorldletError('Invalid source read.');
  const request:Row={...read};delete request.provider;delete request.connectionProvider;
  return {...request,applet:provider,readOperation:request.operation,operation:'drive_content'};
 }
 if(!GOOGLE.includes(provider))return null;
 if(provider==='gmail'&&operation==='authorizeSend')return {operation:'connect',services:['gmail','google-calendar','gmail-send']};
 if(provider==='gmail'&&operation==='access')return {operation:'mail_access'};
 if(provider==='gmail'&&['send','reconcile'].includes(operation))return {operation:operation==='send'?'send_email':'reconcile_email',id:body.id??'',draft:body.draft??{}};
 if(operation!=='read')throw new WorldletError('Unsupported source operation.');
 return {operation:'read',service:provider,id:body.id??'',threads:body.threads??false};
}
const MOCK_MARKER='mock.json';
/** The World's own Google connection as the source-access runtime every Agent's account owner hands out: Gmail,
 * Calendar and Drive requests and the World service tools that read them (`read_world_source` for Mail and
 * Calendar, `read_connected_google`, `prepare_email`) run here, in the Platform, with no Harness and no model; every
 * other source still goes to `fallback` (the account owner's own runtime) until it moves too. */
export class GoogleSourceAccess implements AgentRuntime {
 private readonly google:GoogleSource;
 private readonly fallback:()=>AgentRuntime;
 private delegate:AgentRuntime|null=null;
 private cancelled=false;
 constructor(google:GoogleSource,fallback:()=>AgentRuntime){this.google=google;this.fallback=fallback;}
 private other(){return this.delegate??=this.fallback();}
 cancel(){this.cancelled=true;this.delegate?.cancel();}
 async steer(){return false;}
 async run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  this.cancelled=false;
  const provider=typeof body.provider==='string'?body.provider:'';
  if(body.action==='sourceTool'){
   const name=String(body.name??''),args=body.args&&typeof body.args==='object'?body.args as Row:{};
   const ours=name==='read_connected_google'||name==='prepare_email'||name==='read_world_source'&&(['gmail','google-calendar'].includes(String(args.provider))||args.provider==='notion'&&this.google.notionConnected());
   // Journaled as every Agent runtime's runs are: the tools it calls back (`_source_result` among them) are the turn's record.
   return ours?ExecutionJournal.run(body,home,onEvent,observed=>this.google.tool(name,args,observed,()=>this.cancelled)):this.other().run(body,home,onEvent);
  }
  const request=googleRequest(body);
  if(request&&(request.operation!=='read'||body.action!=='sourceRefresh'||this.google.authorized()))return ExecutionJournal.run(body,home,onEvent,()=>this.request(request));
  return this.other().run(body,home,onEvent);
 }
 private async request(request:Row):Promise<Row> {
  // Gmail send access, asked from a mail review: the same sign-in with the send scope added.
  if(request.operation==='connect'){
   await this.google.account.connect(request.services,url=>this.google.openExternal(url),()=>this.cancelled);
   const own=this.google.ownProfile();if(own)this.google.account.mirror(own);
   return {ok:true};
  }
  const result=await this.google.request(request);
  if(request.operation==='read'&&!Array.isArray(result?.records))throw new WorldletError('The source returned no valid records. Previous content is kept.');
  return result;
 }
}

/** Google sign-in for the World's own connection; every other provider goes to `fallback`. */
export class GoogleSourceConnections implements AgentSourceConnections {
 private readonly google:GoogleSource;
 private readonly fallback:()=>AgentSourceConnections;
 private readonly transport:()=>string;
 private delegate:AgentSourceConnections|null=null;
 private cancelled=false;
 constructor(google:GoogleSource,fallback:()=>AgentSourceConnections,transport:()=>string){this.google=google;this.fallback=fallback;this.transport=transport;}
 private other(){return this.delegate??=this.fallback();}
 providers(provider:string){return GOOGLE_SIGN_IN.includes(provider)?[...GOOGLE_SIGN_IN_SERVICES]:this.other().providers(provider);}
 cancel(){this.cancelled=true;this.delegate?.cancel();}
 async connect(options:Parameters<AgentSourceConnections['connect']>[0]){
  const services=this.providers(options.provider);
  if(!services.length||!services.every(service=>GOOGLE.includes(service)))return this.other().connect(options);
  this.cancelled=false;
  if(options.mock){
   // Development only: Mail and Calendar on a fictional account, without OAuth.
   if(!this.google.development)throw new WorldletError('Mock Google is available only in development builds.');
   this.google.rehearse(true);
  }else{
   this.google.rehearse(false);
   let opened=false;
   await this.google.account.connect(services as GoogleService[],async url=>{
    const handoff=harnessAuthHandoff({event:{type:'google_auth',url},action:'google',operation:'connect',sent:opened}) as Row|null;
    if(typeof handoff?.url!=='string'||!/^https:\/\//.test(handoff.url))throw new WorldletError('Invalid Google authorization address.');
    opened=true;
    try{await this.google.openExternal(handoff.url);}catch{throw new WorldletError('Could not open your browser. Try again.');}
    // Consent opens only when the saved grant cannot be reused: the one point the person has a browser to sign in to.
    options.onStage('browser',handoff.url);
   },()=>this.cancelled);
   options.onStage('verifying');
   const own=this.google.ownProfile();if(own)this.google.account.mirror(own);
  }
  for(const service of services){
   if(this.cancelled)throw new WorldletError('Google sign-in was cancelled.');
   const result=await this.google.request({operation:'test',service});
   if(result?.ok!==true)throw new WorldletError('Authorization did not complete.');
   options.onConnected({provider:service,target:options.target||(typeof result.label==='string'?result.label:service),transport:this.transport(),connector:'oauth'});
  }
 }
 async disconnect(connection:Row,home:string){
  if(connection.connector==='mcp'||!GOOGLE.includes(connection.provider)||!this.google.authorized())return this.other().disconnect(connection,home);
  this.google.disconnect();
  return [...GOOGLE];
 }
 async clientReady(provider:string,home:string){return ['google',...GOOGLE].includes(provider)?this.google.account.client()!==null:this.other().clientReady(provider,home);}
 async configureClient(provider:string,file:string,home:string){
  if(['google',...GOOGLE].includes(provider))throw new WorldletError('This build has its own Google sign-in.');
  return this.other().configureClient(provider,file,home);
 }
}

const validators=new Map<string,ReturnType<typeof Compile>>();
function validate(name:string,args:Row){
 let validator=validators.get(name);
 if(!validator){
  const definition=listWorldTools().find((tool:Row)=>tool.name===name);
  if(!definition)throw new WorldletError('Unknown World service.');
  validator=Compile(definition.parameters);validators.set(name,validator);
 }
 if(!validator.Check(args))throw new WorldletError('Invalid arguments for '+name+'. '+[...validator.Errors(args)].map((error:any)=>error.instancePath+': '+error.message).join('; '));
}
const failureCode=(error:unknown)=>error instanceof GoogleRestError?({400:'invalid_request',401:'authorization_required',403:'access_denied',404:'source_not_found',429:'rate_limited'} as Record<number,string>)[error.status]??'source_unavailable':error instanceof TypeError||error instanceof RangeError||(error as Error)?.name==='ValueError'?'invalid_request':'source_unavailable';

export interface GoogleSourceOptions {account:GoogleAccount;development:boolean;openExternal(url:string):Promise<void>;
 /** Fox's own Hermes profile, whose Google files go when the World disconnects, and where earlier mail receipts were kept. */
 ownProfile:()=>string|null;legacyHomes:()=>string[];now?:()=>number;
 /** Notion, read for `read_world_source` through the World's MCP connection when it has one (mcp-source.ts). */
 notion?:{connected():boolean;read(body:Row):Promise<Row>}}
/** Google's reads, mail drafts and sends for the World (host.py `_google` and `_google_reads`, world_service.py). */
export class GoogleSource {
 readonly account:GoogleAccount;
 readonly development:boolean;
 private readonly options:GoogleSourceOptions;
 constructor(options:GoogleSourceOptions){this.options=options;this.account=options.account;this.development=options.development;}
 openExternal(url:string){return this.options.openExternal(url);}
 notionConnected(){return this.options.notion?.connected()===true;}
 ownProfile(){return this.options.ownProfile();}
 private get marker(){return path.join(this.account.folder,MOCK_MARKER);}
 /** Development builds only: rehearse onboarding on the fictional account (true), or leave it for a real sign-in. */
 rehearse(on:boolean){
  if(!on){fs.rmSync(this.marker,{force:true});return;}
  fs.mkdirSync(this.account.folder,{recursive:true,mode:0o700});
  fs.writeFileSync(this.marker,JSON.stringify({email:MOCK_GOOGLE_EMAIL,services:['gmail','google-calendar']}),{mode:0o600});
 }
 private get mock(){return this.development&&fs.existsSync(this.marker);}
 authorized(){return this.mock||this.account.authorized();}
 disconnect(){fs.rmSync(this.marker,{force:true});this.account.disconnect(this.options.ownProfile());}
 private api():GoogleRest {return this.mock?mockGoogle(this.options.now):this.account.rest();}
 private granted():string[] {return this.mock?['gmail','google-calendar']:this.account.services();}

 async request(body:Row):Promise<Row> {
  const operation=String(body.operation??'');
  if(operation==='status')return {clientReady:this.mock||this.account.client()!==null};
  if(operation==='disconnect'){this.disconnect();return {ok:true};}
  if(!this.authorized())throw new WorldletError('Connect Google first. No local authorization was found.');
  const api=this.api(),mock=this.mock;
  if(operation==='services')return {ok:true,services:this.granted()};
  if(mock&&['client','drive_content','send_email','reconcile_email'].includes(operation))throw new WorldletError('This action is not available with the mock Google account.');
  if(operation==='drive_content')return readDrive(api,body);
  if(operation==='mail_access')return {canSend:!mock&&this.account.canSend()};
  if(operation==='prepare_email')return prepare(api,body.draft??{});
  const receipts=()=>this.account.receipts(this.options.legacyHomes());
  if(operation==='reconcile_email')return reconcile(api,receipts(),body.draft??{},String(body.id??''));
  if(operation==='send_email'){
   if(!this.account.canSend())throw new WorldletError('Allow Gmail send access first. Your existing connection is read-only.');
   return send(api,receipts(),body.draft??{},String(body.id??''));
  }
  if(operation!=='read'&&operation!=='test')throw new WorldletError('Unsupported Google operation.');
  const service=String(body.service??'gmail');
  if(service==='gmail'){
   const profile=await api.get('gmail/v1/users/me/profile'),email=String(profile.emailAddress??'');
   const page=operation==='test'?{records:[],nextPageToken:'',scope:'Connection check only'}:body.discovery?await discover(api,email,body):await readPage(api,body,email);
   if(!mock)void this.account.remember(email).catch(()=>{});
   return {ok:true,label:email,bounded:true,...page};
  }
  if(service==='google-calendar')return readCalendar(api,body,operation,this.options.now?.()??Date.now());
  if(service==='google-drive'){if(mock)throw new WorldletError('Mock Google supports Mail and Calendar only.');return readDriveList(api,operation);}
  throw new WorldletError('Unsupported Google service.');
 }

 /** A World service tool (world_service.py `execute`): validated, authorized by the turn, then run with no model.
  * Its calls back into the World (`_world_authorize`, `_source_begin`, `_source_result`, `_email_review`) go through
  * the turn that asked, under its trust. */
 async tool(name:string,args:Row,onEvent:AgentEventHandler|undefined,cancelled:()=>boolean):Promise<Row> {
  validate(name,args);
  if(cancelled())throw new WorldletError('Task stopped.');
  const call=async(tool:string,values:Row)=>{
   const reply=await onEvent?.({type:'tool',id:'world-'+crypto.randomUUID(),name:tool,args:values});
   const value=reply&&typeof reply==='object'?reply as Row:{error:'World service permission required.'};
   if(value.error)throw new WorldletError(String(value.error));
   return value;
  };
  const permission=await call('_world_authorize',{name,...name==='read_connected_google'?{provider:args.service}:{}});
  if(!permission.ok)throw new WorldletError('World service permission required.');
  if(name==='prepare_email')return call('_email_review',await this.request({operation:'prepare_email',draft:args}));
  if(name==='read_connected_google')return this.request({operation:'read',service:args.service});
  // read_world_source (source_reader.py `execute`): the World admits the read, then records what it returned.
  const permit=await call('_source_begin',args);
  try{
   const page=Array.isArray(permit.records)?{records:permit.records,scope:'Bounded local results.'}:await this.readSource(permit.readOptions??args,cancelled);
   await call('_source_result',{provider:args.provider,ticket:permit.ticket,records:page.records,scope:page.scope??''});
   return page;
  }catch(error){
   if(!cancelled())await call('_source_result',{provider:args.provider,ticket:permit.ticket,failed:true}).catch(()=>{});
   throw error;
  }
 }
 /** source_reader.py `read`: one bounded page, normalized; a failure says only its classified kind. */
 private async readSource(args:Row,cancelled:()=>boolean){
  if(cancelled())throw new WorldletError('Source read was cancelled.');
  const provider=String(args.provider);
  if(!['gmail','google-calendar','notion'].includes(provider))throw new WorldletError('Unsupported backend source.');
  if(provider!=='gmail'&&(args.unreadOnly||(args.pageToken&&provider!=='google-calendar')||args.query||args.metadataOnly||args.discovery))throw new WorldletError('Unread filtering and paging are available for Gmail only.');
  let result:Row;
  try{
   const notion=this.options.notion;
   if(provider==='notion'){if(!notion)throw new WorldletError('Unsupported backend source.');result=await notion.read({operation:args.id?'fetch':'list',id:args.id??''});}
   else result=await this.request({operation:'read',service:provider,threads:provider==='gmail',limit:args.limit??20,id:args.id??'',unreadOnly:args.unreadOnly??false,pageToken:args.pageToken??'',
    query:args.query??'',metadataOnly:args.metadataOnly??false,discovery:args.discovery??false,scanMessages:args.scanMessages??false,windowStart:args.windowStart,windowDays:args.windowDays??30});
  }catch(error){throw new WorldletError(sourceFailure([{type:'error',code:failureCode(error)}]));}
  return {scannedCount:result.scannedCount??(Array.isArray(result.records)?result.records.length:0),records:normalize(provider,result),scope:result.scope??'Bounded results, not the entire account.',
   nextPageToken:result.nextPageToken??'',unreadOnly:result.unreadOnly??false,metadataOnly:result.metadataOnly??false,coverage:result.coverage??[]};
 }
}
