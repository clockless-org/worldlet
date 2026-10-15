import crypto from 'node:crypto';
import {WorldletError} from '../../files.ts';
import {CLOUDFLARE_API,CLOUDFLARE_GATE,POSTHOG_GATE,checkCloudflare,checkPosthog,cloudflareSettings,posthogSettings,readCloudflare,readPosthog,type ServiceGate,type ServiceHttp} from '../../../../../core/accounts/index.ts';
import {SERVICE_ACTIONS} from '../../../../../contracts/services.ts';
import type {AgentEventHandler,AgentRuntime,AgentSourceConnections,VaultService} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
import {validateWorldTool} from './google-source.ts';
import {ExecutionJournal} from '../agent-runtime/journal.ts';

/** Worldlet Services read over the service's own HTTPS API with a key the person pasted (contracts/services.ts,
 * core/accounts/services): PostHog, whose remote MCP server serves only PostHog Cloud and chooses its own project, and
 * Cloudflare's analytics, whose own MCP servers sign in with OAuth and offer far more than reads. The connection is the
 * World's own, in the vault as `service:<name>`: the settings the person gave (PostHog's address and project,
 * Cloudflare's account) and their key. Each request goes only to that Service's one address, follows no redirect and
 * stops at its time and size limits (ServiceGate); the key is never logged, put in the World's state or an event, or
 * given to an Agent. */
interface Definition<S> {
 gate:ServiceGate;
 /** What the person gave besides the key, checked (a ValueError says what is wrong in plain words). */
 settings(value:unknown):S;
 /** The one origin this connection's requests go to. */
 origin(settings:S):string;
 /** One read that proves the key works for those settings, before it is kept. */
 check(http:ServiceHttp,settings:S):Promise<unknown>;
 read(http:ServiceHttp,settings:S,body:Row):Promise<unknown>;
}
const define=<S,>(definition:Definition<S>)=>definition as unknown as Definition<unknown>;
const SERVICES:Readonly<Record<string,Definition<unknown>>>=Object.freeze({
 posthog:define({gate:POSTHOG_GATE,settings:posthogSettings,origin:settings=>settings.host,check:checkPosthog,read:readPosthog}),
 cloudflare:define({gate:CLOUDFLARE_GATE,settings:cloudflareSettings,origin:()=>CLOUDFLARE_API,check:(http,settings)=>checkCloudflare(http,settings),read:(http,settings,body)=>readCloudflare(http,settings,body)}),
});
/** The Services read here; the rest of `read_service` (GitHub) runs over MCP (mcp-source.ts). */
export const DIRECT_SERVICES:readonly string[]=Object.freeze(Object.keys(SERVICES));
const definition=(provider:string)=>Object.hasOwn(SERVICES,provider)?SERVICES[provider]:null;
const vaultId=(provider:string)=>'service:'+provider;

/** A kept key the service refuses (401): the person connects again with a new one. */
class ServiceUnauthorized extends Error {override name='ServiceUnauthorized';}
interface Kept {v:1;settings:unknown;token:string}

export interface ServiceSourceOptions {vault:VaultService;fetch?:typeof fetch}
export class ServiceSource {
 private readonly vault:VaultService;
 private readonly fetch:typeof fetch;
 constructor(options:ServiceSourceOptions){this.vault=options.vault;this.fetch=options.fetch??fetch;}
 connected(provider:string){return this.kept(provider)!==null;}
 /** The kept connection, its settings checked again: one whose address or project no longer passes is not used. */
 private kept(provider:string):{settings:unknown;token:string}|null {
  const service=definition(provider);
  if(!service)return null;
  try{
   const value=JSON.parse(this.vault.get(vaultId(provider))??'null') as Kept|null;
   if(value?.v!==1||typeof value.token!=='string'||!value.token)return null;
   return {settings:service.settings(value.settings),token:value.token};
  }catch{return null;}
 }
 /** One bounded read of a connected Service. */
 async read(provider:string,body:Row):Promise<Row> {
  const service=definition(provider);
  if(!service)throw new WorldletError('Unsupported Service.');
  const kept=this.kept(provider);
  if(!kept)throw new WorldletError(service.gate.connectMessage);
  try{return await service.read(this.http(service,kept.settings,kept.token),kept.settings,body) as Row;}
  catch(error){if(error instanceof ServiceUnauthorized)throw new WorldletError(service.gate.disconnected);throw error;}
 }
 /** The connection still works: the same one read connecting made. */
 async test(provider:string):Promise<Row> {
  const service=definition(provider);
  const kept=service&&this.kept(provider);
  if(!service||!kept)throw new WorldletError(service?.gate.connectMessage??'Unsupported Service.');
  try{await service.check(this.http(service,kept.settings,kept.token),kept.settings);}
  catch(error){if(error instanceof ServiceUnauthorized)throw new WorldletError(service.gate.disconnected);throw error;}
  return {ok:true,status:'connected'};
 }
 /** Checks the settings, then the key with one read on a connection not kept yet: only a key the service accepts is
  * kept, so a refused paste leaves the connection already kept as it was. */
 async connect(provider:string,token:string,settings:unknown):Promise<void> {
  const service=definition(provider);
  if(!service)throw new WorldletError('Unsupported Service.');
  let chosen:unknown;
  try{chosen=service.settings(settings);}catch(error){throw new WorldletError((error as Error).message);}
  const key=token.replace(/^\s*bearer\s+/i,'').trim();
  if(!key||/\s/.test(key))throw new WorldletError(service.gate.refused);
  try{await service.check(this.http(service,chosen,key),chosen);}
  catch(error){if(error instanceof ServiceUnauthorized)throw new WorldletError(service.gate.refused);throw error;}
  this.vault.set(vaultId(provider),JSON.stringify({v:1,settings:chosen,token:key} satisfies Kept));
 }
 disconnect(provider:string){if(definition(provider))this.vault.delete(vaultId(provider));}
 /** Requests to the connection's one origin, with its key, bounded in time and size. Paths are the reader's own. */
 private http(service:Definition<unknown>,settings:unknown,token:string):ServiceHttp {
  const {gate}=service,origin=service.origin(settings);
  const send=async(method:'GET'|'POST',path:string,body?:unknown):Promise<unknown>=>{
   if(!path.startsWith('/')||path.startsWith('//'))throw new WorldletError('Invalid Service request.');
   const url=new URL(path,origin);
   if(url.origin!==origin)throw new WorldletError(`${gate.title} is read only at the address you gave.`);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),gate.timeoutSeconds*1000);
   try{
    let response:Response;
    try{
     response=await this.fetch(url.href,{method,redirect:'manual',signal:controller.signal,
      headers:{authorization:'Bearer '+token,accept:'application/json',...body===undefined?{}:{'content-type':'application/json'}},
      ...body===undefined?{}:{body:JSON.stringify(body)}});
    }catch{throw new WorldletError(controller.signal.aborted?`${gate.title} took too long to answer. Try a narrower read.`:`Could not reach ${gate.title} at ${origin}. Check the address and your internet connection.`);}
    const discard=()=>response.body?.cancel().catch(()=>{});
    if(response.type==='opaqueredirect'||response.status>=300&&response.status<400){void discard();throw new WorldletError(`${gate.title} answered from another address. Worldlet reads it only at ${origin}; check the address you gave.`);}
    if(response.status===401){void discard();throw new ServiceUnauthorized();}
    const text=await bounded(response,gate,controller);
    if(!response.ok){
     if(response.status===403)throw new WorldletError(gate.forbidden);
     if(response.status===404)throw new WorldletError(gate.missing);
     if(response.status===429)throw new WorldletError(gate.busy);
     if(response.status===400){
      // The service's own short reason (a HogQL error names the field it could not find): data, never the key.
      let detail='';try{const value=JSON.parse(text);detail=typeof value?.detail==='string'?value.detail:'';}catch{}
      detail=[...detail.replace(/\s+/g,' ').trim()].slice(0,300).join('');
      throw new WorldletError(gate.invalid+(detail?` ${gate.title} said: ${detail}`:''));
     }
     throw new WorldletError(`${gate.title} could not answer right now (${response.status}). Try again later.`);
    }
    try{return JSON.parse(text);}catch{throw new WorldletError(`${gate.title} returned an unsupported answer.`);}
   }finally{clearTimeout(timer);}
  };
  return {get:path=>send('GET',path),post:(path,body)=>send('POST',path,body)};
 }
}

/** The answer's text, read only up to the gate's size. */
async function bounded(response:Response,gate:ServiceGate,controller:AbortController):Promise<string> {
 const tooLarge=()=>new WorldletError(`${gate.title} sent more than Worldlet reads at once. Narrow the read.`);
 if(Number(response.headers.get('content-length'))>gate.maxBytes){await response.body?.cancel().catch(()=>{});throw tooLarge();}
 const reader=response.body?.getReader();
 if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>gate.maxBytes){await reader.cancel().catch(()=>{});throw tooLarge();}
   chunks.push(value);
  }
 }catch(error){
  if(error instanceof WorldletError)throw error;
  throw new WorldletError(controller.signal.aborted?`${gate.title} took too long to answer. Try a narrower read.`:`${gate.title} stopped answering. Try again.`);
 }
 return Buffer.concat(chunks).toString('utf8');
}

/** `read_service`'s own gate, for every Service whichever transport reads it: the call is checked against the tool's
 * schema, must name one of `providers` and an operation that Service has (SERVICE_ACTIONS), and is admitted by the
 * turn (whose Grants name `<provider>/<operation>`, core/agent/GRANTS.md; the read makes the turn untrusted). Returns
 * the one read to make. */
export async function admitServiceRead(args:Row,providers:readonly string[],onEvent:AgentEventHandler|undefined):Promise<{provider:string;body:Row}> {
 validateWorldTool('read_service',args);
 const provider=String(args.provider),operation=String(args.operation);
 if(!providers.includes(provider))throw new WorldletError('Unsupported Service.');
 const actions=SERVICE_ACTIONS[provider];
 if(!actions||!Object.hasOwn(actions,operation))throw new WorldletError(`This Service has no ${operation} read. Use ${Object.keys(actions??{}).join(' or ')}.`);
 const reply=await onEvent?.({type:'tool',id:'world-'+crypto.randomUUID(),name:'_world_authorize',args:{name:'read_service',provider,operation}});
 const permission=reply&&typeof reply==='object'?reply as Row:{error:'World service permission required.'};
 if(permission.error||permission.ok!==true)throw new WorldletError(String(permission.error||'World service permission required.'));
 return {provider,body:{operation,...typeof args.id==='string'?{id:args.id}:{},...typeof args.query==='string'?{query:args.query}:{},...typeof args.cursor==='string'?{cursor:args.cursor}:{}}};
}

/** The Services read here as the source-access runtime: their `read_service` calls and connection checks; anything
 * else goes to `fallback`. */
export class ServiceSourceAccess implements AgentRuntime {
 private readonly source:ServiceSource;
 private readonly fallback:()=>AgentRuntime;
 private delegate:AgentRuntime|null=null;
 constructor(source:ServiceSource,fallback:()=>AgentRuntime){this.source=source;this.fallback=fallback;}
 private other(){return this.delegate??=this.fallback();}
 cancel(){this.delegate?.cancel();}
 async steer(){return false;}
 async run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  const args=body.args&&typeof body.args==='object'?body.args as Row:{};
  if(body.action==='sourceTool'&&body.name==='read_service'&&DIRECT_SERVICES.includes(String(args.provider)))
   return ExecutionJournal.run(body,home,onEvent,async observed=>{const {provider,body:read}=await admitServiceRead(args,DIRECT_SERVICES,observed);return this.source.read(provider,read);});
  if(body.action==='sourceRefresh'&&DIRECT_SERVICES.includes(String(body.provider)))return this.source.test(String(body.provider));
  return this.other().run(body,home,onEvent);
 }
}

const TITLES:Readonly<Record<string,string>>=Object.freeze(Object.fromEntries(Object.entries(SERVICES).map(([provider,service])=>[provider,service.gate.title])));
/** Connecting one of these Services keeps its key in the World's vault; any other source goes to `fallback`. */
export class ServiceSourceConnections implements AgentSourceConnections {
 private readonly source:ServiceSource;
 private readonly fallback:()=>AgentSourceConnections;
 private readonly transport:()=>string;
 private delegate:AgentSourceConnections|null=null;
 constructor(source:ServiceSource,fallback:()=>AgentSourceConnections,transport:()=>string){this.source=source;this.fallback=fallback;this.transport=transport;}
 private other(){return this.delegate??=this.fallback();}
 providers(provider:string){return DIRECT_SERVICES.includes(provider)?[provider]:this.other().providers(provider);}
 cancel(){this.delegate?.cancel();}
 async connect(options:Parameters<AgentSourceConnections['connect']>[0]){
  if(!DIRECT_SERVICES.includes(options.provider))return this.other().connect(options);
  await this.source.connect(options.provider,options.token,options.settings??{});
  options.onConnected({provider:options.provider,target:TITLES[options.provider],transport:this.transport(),connector:'service'});
 }
 async disconnect(connection:Row,home:string){
  const provider=String(connection.provider??'');
  if(!DIRECT_SERVICES.includes(provider))return this.other().disconnect(connection,home);
  this.source.disconnect(provider);
  return [provider];
 }
 async clientReady(provider:string,home:string){return DIRECT_SERVICES.includes(provider)?true:this.other().clientReady(provider,home);}
 async configureClient(provider:string,file:string,home:string){return this.other().configureClient(provider,file,home);}
}
