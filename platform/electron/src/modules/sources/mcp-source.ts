import fs from 'node:fs';
import path from 'node:path';
import {WorldletError,ensureDirectory,writeAtomic} from '../../files.ts';
import {curatedSourceRead} from '../../../../../core/applets/index.ts';
import {LINEAR_GATE,NOTION_GATE,PAYPAL_GATE,SUPABASE_GATE,TODOIST_GATE,MCP_POLICY,enabledMcpTools,mcpConfiguration,notion,readLinear,readPaypal,readSupabase,todoist,todoistTimeoutSeconds,
 type McpGate,type McpSession,type NotionReviewStore} from '../../../../../core/accounts/index.ts';
import type {AgentEventHandler,AgentRuntime,AgentSourceConnections} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
import type {McpAccounts,McpConnection} from './mcp-account.ts';
import {McpUnauthorized} from './mcp-client.ts';

/** The official endpoint each connector signs in to when none is given (hermes.ts SOURCE_ENDPOINTS). */
export const MCP_ENDPOINTS:Readonly<Record<string,string>>=Object.freeze({notion:'https://mcp.notion.com/mcp',github:'https://api.githubcopilot.com/mcp/',linear:'https://mcp.linear.app/mcp',
 paypal:'https://mcp.paypal.com/http',todoist:'https://ai.todoist.net/mcp',supabase:'https://mcp.supabase.com/mcp?read_only=true&features=account'});
const TITLES:Readonly<Record<string,string>>=Object.freeze({notion:'Notion',github:'GitHub',linear:'Linear',paypal:'PayPal',todoist:'Todoist',supabase:'Supabase'});
const GATES:Readonly<Record<string,McpGate>>=Object.freeze({notion:NOTION_GATE,todoist:TODOIST_GATE,linear:LINEAR_GATE,paypal:PAYPAL_GATE,supabase:SUPABASE_GATE});
export const MCP_PROVIDERS=Object.freeze(Object.keys(MCP_ENDPOINTS));

export interface McpSourceOptions {accounts:McpAccounts;openExternal(url:string):Promise<void>;
 /** Where Notion's reviewed writes keep their drafts (notion_writes.py's `worldlet-notion-reviews`). */
 reviews:string}
/** The World's MCP connectors (host.py `mcp`, `notion`, `todoist`, `linear`, `paypal`, `supabase`): each reader runs
 * in the Platform on the connection the person's Agent already has or the one made through Worldlet. */
export class McpSource {
 readonly accounts:McpAccounts;
 readonly openExternal:(url:string)=>Promise<void>;
 private readonly reviews:string;
 constructor(options:McpSourceOptions){this.accounts=options.accounts;this.openExternal=options.openExternal;this.reviews=options.reviews;}
 connected(provider:string){return MCP_PROVIDERS.includes(provider)&&this.accounts.connection(provider)!==null;}
 /** mcp_session.connected_session: configured and signed in, at an address the connector accepts. */
 private session(provider:string,gate:McpGate|null):McpSession&{close():Promise<void>} {
  const connection=this.accounts.connection(provider);
  if(!connection)throw new WorldletError(gate?.connectMessage??'Configure this service first.');
  if(gate&&!gate.urls.includes(connection.url))throw new WorldletError(gate.urlMessage);
  return this.accounts.session(connection,TITLES[provider]??provider);
 }
 /** One reader run, bounded as the Python `run(timeout=)` was; an expired sign-in says to reconnect. */
 async read(provider:string,body:Row):Promise<Row> {
  const gate=GATES[provider];
  if(!gate)throw new WorldletError('Unsupported source operation.');
  const session=this.session(provider,gate);
  const timeout=provider==='todoist'?todoistTimeoutSeconds(body):gate.timeoutSeconds;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const work=provider==='notion'?notion(session,body,folderStore(this.reviews))
    :provider==='todoist'?todoist(session,body)
    :provider==='linear'?readLinear(session,body)
    :provider==='paypal'?readPaypal(session,body)
    :readSupabase(session,body);
   return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new WorldletError(`${TITLES[provider]} took too long to answer. Try again.`)),timeout*1000);})]) as Row;
  }catch(error){
   if(error instanceof McpUnauthorized)throw new WorldletError(gate.disconnectedMessage);
   throw error;
  }finally{clearTimeout(timer);void session.close();}
 }
 /** host.py `mcp` test: the server answers and has the connector's tools. */
 async test(provider:string):Promise<Row> {
  const session=this.session(provider,null) as ReturnType<McpAccounts['session']>;
  try{
   const tools=enabledMcpTools(provider,await session.tools(),MCP_POLICY[provider]?.tools??null);
   return {ok:true,tools,status:'connected'};
  }catch(error){
   if(error instanceof McpUnauthorized)throw new WorldletError('This connection needs authorization before use.');
   throw error;
  }finally{void session.close();}
 }
 /** Connects through Worldlet (host.py `mcp` configure): the official endpoint, a token or OAuth, then the test. */
 async connect(provider:string,url:string,token:string,cancelled:()=>boolean,opened:(url:string)=>void):Promise<Row> {
  const endpoint=url||MCP_ENDPOINTS[provider]||'';
  mcpConfiguration(provider,endpoint);
  await this.accounts.connect(provider,endpoint,token,async address=>{
   try{await this.openExternal(address);}catch{throw new WorldletError('Could not open your browser. Try again.');}
   opened(address);
  },cancelled);
  try{return await this.test(provider);}
  catch(error){this.accounts.disconnect(provider);throw error;}
 }
}

/** The Notion review folder on disk: owner-only, no links followed, files replaced atomically. */
function folderStore(folder:string):NotionReviewStore {
 const file=(name:string)=>{
  if(!/^[A-Za-z0-9._-]{1,120}$/.test(name)||name.startsWith('.'))throw new WorldletError('Invalid review file.');
  return path.join(folder,name);
 };
 const ready=()=>{ensureDirectory(folder);const stat=fs.lstatSync(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw new WorldletError('The review folder is not usable.');};
 return {
  list(){try{return fs.readdirSync(folder);}catch{return [];}},
  read(name){try{const target=file(name);if(fs.lstatSync(target).isSymbolicLink())return null;return fs.readFileSync(target,'utf8');}catch{return null;}},
  exists(name){try{fs.lstatSync(file(name));return true;}catch{return false;}},
  write(name,text){ready();writeAtomic(file(name),text,0o600);},
  create(name){ready();try{fs.closeSync(fs.openSync(file(name),'wx',0o600));return true;}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return false;throw error;}},
  delete(name){fs.rmSync(file(name),{force:true});},
 };
}

/** A host source request for an MCP connector, as the World runs it (what HermesSourceAccess sent to host.py), or
 * null when another runs it (Google, DoorDash). */
function mcpRequest(body:Row):{provider:string;kind:'test'|'read';body:Row}|null {
 const provider=typeof body.provider==='string'?body.provider:'',operation=body.operation;
 if(!MCP_PROVIDERS.includes(provider))return null;
 if(body.action==='sourceRefresh')return {provider,kind:'test',body:{}};
 if(body.action!=='sourceRequest'||typeof operation!=='string')return null;
 // Only the trusted review coordinator issues these operations; the model has no commit tool.
 if(provider==='todoist'&&['review','complete'].includes(operation))return {provider,kind:'read',body:{operation,id:body.id??''}};
 if(['todoist','supabase','linear'].includes(provider)){
  const input:Row={...body};if(operation==='fetch')input.operation='read';delete input.action;delete input.background;
  const read=curatedSourceRead(input as any) as Row|null;
  if(!read||typeof read!=='object')throw new WorldletError('Invalid source read.');
  const request:Row={...read};delete request.provider;delete request.connectionProvider;
  return {provider,kind:'read',body:request};
 }
 if(provider==='notion'&&['prepare','commit','check','reviews','discard'].includes(operation))return {provider,kind:'read',body:{operation,id:body.id??'',draft:body.draft??{},binding:body.binding??''}};
 const operations:Record<string,string[]>={notion:['list','fetch'],paypal:['list','read']};
 if(!operations[provider]?.includes(operation))throw new WorldletError('Unsupported source operation.');
 return {provider,kind:'read',body:{operation,id:body.id??'',page:body.page??1}};
}

/** The World's MCP connectors as the source-access runtime: a connector's request runs here when the World or the
 * person's Agent has its connection; anything else (and a connector with no connection yet, which then says to
 * connect) goes to `fallback`. */
export class McpSourceAccess implements AgentRuntime {
 private readonly source:McpSource;
 private readonly fallback:()=>AgentRuntime;
 private delegate:AgentRuntime|null=null;
 constructor(source:McpSource,fallback:()=>AgentRuntime){this.source=source;this.fallback=fallback;}
 private other(){return this.delegate??=this.fallback();}
 cancel(){this.delegate?.cancel();}
 async steer(){return false;}
 async run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  const request=mcpRequest(body);
  if(!request)return this.other().run(body,home,onEvent);
  if(request.kind==='test'){
   const result=await this.source.test(request.provider);
   if(result?.ok!==true)throw new WorldletError('The source connection could not be verified.');
   return result;
  }
  return this.source.read(request.provider,request.body);
 }
}

/** Connecting an MCP connector through Worldlet keeps it in the World; Google and the rest go to `fallback`. */
export class McpSourceConnections implements AgentSourceConnections {
 private readonly source:McpSource;
 private readonly fallback:()=>AgentSourceConnections;
 private readonly transport:()=>string;
 private delegate:AgentSourceConnections|null=null;
 private cancelled=false;
 constructor(source:McpSource,fallback:()=>AgentSourceConnections,transport:()=>string){this.source=source;this.fallback=fallback;this.transport=transport;}
 private other(){return this.delegate??=this.fallback();}
 providers(provider:string){return MCP_PROVIDERS.includes(provider)?[provider]:this.other().providers(provider);}
 cancel(){this.cancelled=true;this.delegate?.cancel();}
 async connect(options:Parameters<AgentSourceConnections['connect']>[0]){
  if(!MCP_PROVIDERS.includes(options.provider))return this.other().connect(options);
  this.cancelled=false;
  const result=await this.source.connect(options.provider,options.endpoint,options.token,()=>this.cancelled,url=>options.onStage('browser',url));
  if(this.cancelled)throw new WorldletError('Sign-in was cancelled.');
  if(result?.ok!==true)throw new WorldletError('Authorization did not complete.');
  options.onConnected({provider:options.provider,target:options.target||TITLES[options.provider]||options.provider,transport:this.transport(),connector:'mcp'});
 }
 async disconnect(connection:Row,home:string){
  const provider=String(connection.provider??'');
  const found:McpConnection|null=MCP_PROVIDERS.includes(provider)?this.source.accounts.connection(provider):null;
  // The World's own connection is forgotten here; an Agent's own stays with that Agent (its own command removes it).
  if(found?.source!=='world')return this.other().disconnect(connection,home);
  this.source.accounts.disconnect(provider);
  return [provider];
 }
 async clientReady(provider:string,home:string){return MCP_PROVIDERS.includes(provider)?true:this.other().clientReady(provider,home);}
 async configureClient(provider:string,file:string,home:string){return this.other().configureClient(provider,file,home);}
}
