import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import {WorldletError} from '../../files.ts';
import {CLOUDFLARE_API,CLOUDFLARE_GATE,GOOGLE_TOKEN_URL,HTTP_JSON_GATE,HTTP_JSON_LIMITS,POSTHOG_GATE,SEARCH_CONSOLE_API,SEARCH_CONSOLE_GATE,checkCloudflare,checkHttpJson,checkPosthog,checkSearchConsole,cloudflareSettings,httpJsonEndpoints,httpJsonSettings,posthogSettings,privateAddress,readCloudflare,readHttpJson,readPosthog,readSearchConsole,searchConsoleAccessToken,searchConsoleAssertion,searchConsoleKey,searchConsoleSettings,type HttpJsonSettings,type ServiceGate,type ServiceHttp} from '../../../../../core/accounts/index.ts';
import {SERVICE_ACTIONS} from '../../../../../contracts/services.ts';
import type {AgentEventHandler,AgentRuntime,AgentSourceConnections,VaultService} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
import {validateWorldTool} from './google-source.ts';
import {ExecutionJournal} from '../agent-runtime/journal.ts';

/** Worldlet Services read over the service's own HTTPS API with a key the person pasted (contracts/services.ts,
 * core/accounts/services): PostHog, whose remote MCP server serves only PostHog Cloud and chooses its own project,
 * Cloudflare's analytics, whose own MCP servers sign in with OAuth and offer far more than reads, and HTTP JSON
 * endpoints the person names. The connection is the World's own, in the vault as `service:<name>`: the settings the
 * person gave (PostHog's address and project, Cloudflare's account) and their key; for HTTP JSON, each named
 * endpoint's address and optional token. Each request goes only to that Service's one address, follows no redirect and
 * stops at its time and size limits (ServiceGate); the key is never logged, put in the World's state or an event, or
 * given to an Agent. Google Search Console's key is a service account's private key, which is never sent at all: it signs
 * a short-lived assertion that only Google's token address receives, and the access token that comes back is kept in
 * memory until a minute before it expires. */
interface Definition<S> {
 gate:ServiceGate;
 /** What the person gave besides the key, checked (a ValueError says what is wrong in plain words). */
 settings(value:unknown):S;
 /** The one origin this connection's requests go to. */
 origin(settings:S):string;
 /** One read that proves the key works for those settings, before it is kept. */
 check(http:ServiceHttp,settings:S):Promise<unknown>;
 read(http:ServiceHttp,settings:S,body:Row):Promise<unknown>;
 /** One connection holds several named endpoints, each its own settings and optional key (HTTP JSON): connecting adds
  * or replaces one by name, `list` answers their names and addresses, and a read's `id` names the one it goes to. */
 named?:{name(settings:S):string;list(endpoints:{settings:S;token:boolean}[]):unknown};
 /** The kept key is a Google service account's, exchanged for access tokens (Search Console). */
 serviceAccount?:true;
}
const define=<S,>(definition:Definition<S>)=>definition as unknown as Definition<unknown>;
const SERVICES:Readonly<Record<string,Definition<unknown>>>=Object.freeze({
 posthog:define({gate:POSTHOG_GATE,settings:posthogSettings,origin:settings=>settings.host,check:checkPosthog,read:readPosthog}),
 cloudflare:define({gate:CLOUDFLARE_GATE,settings:cloudflareSettings,origin:()=>CLOUDFLARE_API,check:(http,settings)=>checkCloudflare(http,settings),read:(http,settings,body)=>readCloudflare(http,settings,body)}),
 http:define<HttpJsonSettings>({gate:HTTP_JSON_GATE,settings:httpJsonSettings,origin:settings=>new URL(settings.url).origin,check:checkHttpJson,read:readHttpJson,
  named:{name:settings=>settings.name,list:httpJsonEndpoints}}),
 'search-console':define({gate:SEARCH_CONSOLE_GATE,settings:searchConsoleSettings,origin:()=>SEARCH_CONSOLE_API,check:http=>checkSearchConsole(http),read:(http,settings,body)=>readSearchConsole(http,settings,body),serviceAccount:true}),
});
/** The Services read here; the rest of `read_service` (GitHub) runs over MCP (mcp-source.ts). */
export const DIRECT_SERVICES:readonly string[]=Object.freeze(Object.keys(SERVICES));
const definition=(provider:string)=>Object.hasOwn(SERVICES,provider)?SERVICES[provider]:null;
const vaultId=(provider:string)=>'service:'+provider;

/** A kept key the service refuses (401): the person connects again with a new one. */
class ServiceUnauthorized extends Error {override name='ServiceUnauthorized';}
interface Kept {v:1;settings:unknown;token:string}
/** A connection of named endpoints (Definition.named): each with its settings and its key, which may be empty. */
interface KeptNamed {v:1;endpoints:{settings:unknown;token:string}[]}
type Endpoint={settings:unknown;token:string};

export interface ServiceSourceOptions {vault:VaultService;fetch?:typeof fetch;
 /** Every address a host name resolves to, for a gate that is `publicOnly` (the system resolver by default). */
 lookup?:(host:string)=>Promise<string[]>;
 /** Milliseconds now, for when an access token expires (Date.now by default). */
 clock?:()=>number}
export class ServiceSource {
 private readonly vault:VaultService;
 private readonly fetch:typeof fetch;
 private readonly lookup:(host:string)=>Promise<string[]>;
 private readonly clock:()=>number;
 /** Access tokens exchanged for a service account key, by the key's hash: in memory only. */
 private readonly access=new Map<string,{token:string;until:number}>();
 constructor(options:ServiceSourceOptions){
  this.vault=options.vault;this.fetch=options.fetch??fetch;this.clock=options.clock??Date.now;
  this.lookup=options.lookup??(async host=>(await dns.lookup(host,{all:true})).map(entry=>entry.address));
 }
 connected(provider:string){return this.endpoints(provider).length>0;}
 /** The kept connection's endpoints (one, unless the Service is `named`), each with its settings checked again: one
  * whose address or project no longer passes is not used. */
 private endpoints(provider:string):Endpoint[] {
  const service=definition(provider);
  if(!service)return [];
  try{
   const value=JSON.parse(this.vault.get(vaultId(provider))??'null') as (Kept&KeptNamed)|null;
   if(value?.v!==1)return [];
   if(service.named)return (Array.isArray(value.endpoints)?value.endpoints:[]).slice(0,HTTP_JSON_LIMITS.endpoints).flatMap(entry=>{
    try{return typeof entry?.token==='string'?[{settings:service.settings(entry.settings),token:entry.token}]:[];}catch{return [];}
   });
   if(typeof value.token!=='string'||!value.token)return [];
   if(service.serviceAccount)searchConsoleKey(value.token);
   return [{settings:service.settings(value.settings),token:value.token}];
  }catch{return [];}
 }
 /** The endpoint a read goes to: the only one, or the one its `id` names. */
 private endpoint(service:Definition<unknown>,provider:string,body:Row):Endpoint {
  const kept=this.endpoints(provider),named=service.named;
  if(!kept.length)throw new WorldletError(service.gate.connectMessage);
  if(!named)return kept[0];
  const chosen=kept.find(entry=>named.name(entry.settings)===body.id);
  if(!chosen)throw new WorldletError(`${service.gate.title} has no endpoint named that. Connected: ${kept.map(entry=>named.name(entry.settings)).join(', ')}.`);
  return chosen;
 }
 /** The named endpoints as Settings shows them: each one's settings and whether it has a token, never the token. */
 endpointList(provider:string):Row[] {
  if(!definition(provider)?.named)return [];
  return this.endpoints(provider).map(entry=>({...entry.settings as Row,token:!!entry.token}));
 }
 /** Forgets one named endpoint. The last one goes only with Disconnect, so the connection and its endpoints go together. */
 removeEndpoint(provider:string,name:unknown){
  const named=definition(provider)?.named,kept=this.endpoints(provider);
  if(!named)throw new WorldletError('Unsupported Service.');
  const rest=kept.filter(entry=>named.name(entry.settings)!==name);
  if(rest.length===kept.length)throw new WorldletError('There is no endpoint with that name.');
  if(!rest.length)throw new WorldletError('This is the last endpoint. Disconnect it instead.');
  this.vault.set(vaultId(provider),JSON.stringify({v:1,endpoints:rest} satisfies KeptNamed));
 }
 /** One bounded read of a connected Service. */
 async read(provider:string,body:Row):Promise<Row> {
  const service=definition(provider);
  if(!service)throw new WorldletError('Unsupported Service.');
  if(service.named&&body.operation==='list'){
   const kept=this.endpoints(provider);
   if(!kept.length)throw new WorldletError(service.gate.connectMessage);
   if(body.id||body.query||body.cursor)throw new WorldletError(`${service.gate.title}'s list takes nothing else.`);
   return service.named.list(kept.map(entry=>({settings:entry.settings,token:!!entry.token}))) as Row;
  }
  const kept=this.endpoint(service,provider,body);
  try{return await service.read(this.http(service,kept.settings,kept.token),kept.settings,body) as Row;}
  catch(error){if(error instanceof ServiceUnauthorized)throw new WorldletError(service.gate.disconnected);throw error;}
 }
 /** The connection still works: the same one read connecting made, for each endpoint. */
 async test(provider:string):Promise<Row> {
  const service=definition(provider);
  const kept=service?this.endpoints(provider):[];
  if(!service||!kept.length)throw new WorldletError(service?.gate.connectMessage??'Unsupported Service.');
  for(const entry of kept){
   try{await service.check(this.http(service,entry.settings,entry.token),entry.settings);}
   catch(error){if(error instanceof ServiceUnauthorized)throw new WorldletError(service.gate.disconnected);throw error;}
  }
  return {ok:true,status:'connected'};
 }
 /** Checks the settings, then the key with one read on a connection not kept yet: only a key the service accepts is
  * kept, so a refused paste leaves the connection already kept as it was. */
 async connect(provider:string,token:string,settings:unknown):Promise<void> {
  const service=definition(provider);
  if(!service)throw new WorldletError('Unsupported Service.');
  let chosen:unknown;
  try{chosen=service.settings(settings);}catch(error){throw new WorldletError((error as Error).message);}
  let key:string;
  // A pasted service account key is always checked with Google afresh, never with an access token already in memory.
  if(service.serviceAccount){try{key=JSON.stringify(searchConsoleKey(token));}catch(error){throw new WorldletError((error as Error).message);}this.access.clear();}
  else{
   key=token.replace(/^\s*bearer\s+/i,'').trim();
   if(!key&&!service.named||/\s/.test(key))throw new WorldletError(service.gate.refused);
  }
  // A named endpoint joins those kept, replacing one of the same name, up to the limit.
  const named=service.named,others=named?this.endpoints(provider).filter(entry=>named.name(entry.settings)!==named.name(chosen)):[];
  if(named&&others.length>=HTTP_JSON_LIMITS.endpoints)throw new WorldletError(`${service.gate.title} keeps up to ${HTTP_JSON_LIMITS.endpoints} endpoints. Remove one first.`);
  try{await service.check(this.http(service,chosen,key),chosen);}
  catch(error){if(error instanceof ServiceUnauthorized)throw new WorldletError(service.gate.refused);throw error;}
  this.vault.set(vaultId(provider),JSON.stringify(named?{v:1,endpoints:[...others,{settings:chosen,token:key}]} satisfies KeptNamed:{v:1,settings:chosen,token:key} satisfies Kept));
 }
 disconnect(provider:string){if(definition(provider)){this.vault.delete(vaultId(provider));this.access.clear();}}
 /** An access token for a kept service account key: the one in memory until a minute before it expires, otherwise a
  * new one from Google's token address for an assertion the key signs (RS256). Only the assertion is sent; a key
  * Google refuses is ServiceUnauthorized, and nothing Google says about it is repeated. */
 private async accessToken(gate:ServiceGate,credential:string):Promise<string> {
  const id=crypto.createHash('sha256').update(credential).digest('hex'),held=this.access.get(id);
  if(held&&held.until>this.clock())return held.token;
  const key=searchConsoleKey(credential),{header,claims}=searchConsoleAssertion(key,this.clock()/1000);
  const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const data=part(header)+'.'+part(claims);
  let assertion:string;
  try{assertion=data+'.'+crypto.sign('sha256',Buffer.from(data),key.privateKey).toString('base64url');}catch{throw new ServiceUnauthorized();}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),gate.timeoutSeconds*1000);
  try{
   let response:Response;
   try{
    response=await this.fetch(GOOGLE_TOKEN_URL,{method:'POST',redirect:'manual',signal:controller.signal,
     headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()});
   }catch{throw new WorldletError(controller.signal.aborted?'Google took too long to answer. Try again.':`Could not reach Google to sign in to ${gate.title}. Check your internet connection.`);}
   if(response.type==='opaqueredirect'||response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>{});throw new WorldletError(`Google answered from another address. Worldlet signs in only at ${GOOGLE_TOKEN_URL}.`);}
   const text=await bounded(response,gate,controller);
   let value:unknown=null;try{value=JSON.parse(text);}catch{}
   if(response.status===400||response.status===401){
    const error=value&&typeof value==='object'?(value as Row).error:null;
    if(response.status===401||['invalid_grant','invalid_client','unauthorized_client'].includes(String(error)))throw new ServiceUnauthorized();
    throw new WorldletError(gate.invalid);
   }
   if(!response.ok)throw new WorldletError(`Google could not sign in to ${gate.title} right now (${response.status}). Try again later.`);
   let access:{token:string;until:number};
   try{access=searchConsoleAccessToken(value,this.clock());}catch(error){throw new WorldletError((error as Error).message);}
   this.access.set(id,access);
   return access.token;
  }finally{clearTimeout(timer);}
 }
 /** A connected Service's settings and a request function over its key, for a write the person approved (PostHog
  * drafts, core/agent/service-drafts.ts): each request answers its status and JSON instead of throwing for a refusal,
  * so Core can say why. It still goes only to the connection's one origin, follows no redirect and stops at the gate's
  * time and size; the key stays here. Null when the Service is not connected. */
 writer(provider:string):{settings:unknown;request(method:'GET'|'POST'|'PATCH',path:string,body?:Record<string,unknown>):Promise<{status:number;json:unknown}>}|null {
  // A Service with one endpoint only (PostHog): a named Service has no single connection to write to.
  const service=definition(provider),kept=service&&!service.named?this.endpoints(provider)[0]:undefined;
  if(!service||!kept)return null;
  return {settings:kept.settings,request:this.http(service,kept.settings,kept.token).raw};
 }
 /** Requests to the connection's one origin, with its key, bounded in time and size. Paths are the reader's own. */
 private http(service:Definition<unknown>,settings:unknown,token:string):ServiceHttp&{raw(method:'GET'|'POST'|'PATCH',path:string,body?:unknown):Promise<{status:number;json:unknown}>} {
  const {gate}=service,origin=service.origin(settings);
  // `raw`: the status and JSON of any answer that is not a redirect (a write's refusal is the caller's to explain).
  const raw=(method:'GET'|'POST'|'PATCH',path:string,body?:unknown)=>send(method,path,body,true) as Promise<{status:number;json:unknown}>;
  const send=async(method:'GET'|'POST'|'PATCH',path:string,body?:unknown,answer=false):Promise<unknown>=>{
   if(!path.startsWith('/')||path.startsWith('//'))throw new WorldletError('Invalid Service request.');
   const url=new URL(path,origin);
   if(url.origin!==origin)throw new WorldletError(`${gate.title} is read only at the address you gave.`);
   const authorization=service.serviceAccount?'Bearer '+await this.accessToken(gate,token):token?'Bearer '+token:'';
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),gate.timeoutSeconds*1000);
   try{
    if(gate.publicOnly)await this.publicHost(gate,url.hostname);
    let response:Response;
    try{
     response=await this.fetch(url.href,{method,redirect:'manual',signal:controller.signal,
      headers:{...authorization?{authorization}:{},accept:'application/json',...body===undefined?{}:{'content-type':'application/json'}},
      ...body===undefined?{}:{body:JSON.stringify(body)}});
    }catch{throw new WorldletError(controller.signal.aborted?`${gate.title} took too long to answer. Try a narrower read.`:`Could not reach ${gate.title} at ${origin}. Check the address and your internet connection.`);}
    const discard=()=>response.body?.cancel().catch(()=>{});
    if(response.type==='opaqueredirect'||response.status>=300&&response.status<400){void discard();throw new WorldletError(`${gate.title} answered from another address. Worldlet reads it only at ${origin}; check the address you gave.`);}
    if(response.status===401){void discard();if(service.serviceAccount)this.access.clear();if(answer)return {status:401,json:null};throw new ServiceUnauthorized();}
    const text=await bounded(response,gate,controller);
    if(answer){let json:unknown=null;try{json=JSON.parse(text);}catch{}return {status:response.status,json};}
    if(!response.ok){
     if(response.status===403)throw new WorldletError(gate.forbidden);
     if(response.status===404)throw new WorldletError(gate.missing);
     if(response.status===429)throw new WorldletError(gate.busy);
     if(response.status===400){
      // The service's own short reason (a HogQL error names the field it could not find; Google says what it could not
      // take): data, never the key.
      let detail='';try{const value=JSON.parse(text);detail=typeof value?.detail==='string'?value.detail:typeof value?.error?.message==='string'?value.error.message:'';}catch{}
      detail=[...detail.replace(/\s+/g,' ').trim()].slice(0,300).join('');
      throw new WorldletError(gate.invalid+(detail?` ${gate.title} said: ${detail}`:''));
     }
     throw new WorldletError(`${gate.title} could not answer right now (${response.status}). Try again later.`);
    }
    try{return JSON.parse(text);}catch{throw new WorldletError(`${gate.title} returned an unsupported answer.`);}
   }finally{clearTimeout(timer);}
  };
  // An address the person typed (HTTP JSON) is read with GET only, raw requests included.
  const getOnly=(method:string)=>gate.publicOnly&&method!=='GET';
  return {get:path=>send('GET',path),post:(path,body)=>getOnly('POST')?Promise.reject(new WorldletError(`${gate.title} reads with GET only.`)):send('POST',path,body),
   raw:(method,path,body)=>getOnly(method)?Promise.reject(new WorldletError(`${gate.title} reads with GET only.`)):raw(method,path,body)};
 }
 /** A host name the person typed must resolve only to addresses on the internet (privateAddress), never this computer
  * or the local network, whatever name points there. Checked before every request. */
 private async publicHost(gate:ServiceGate,hostname:string){
  const host=hostname.replace(/^\[|\]$/g,'');
  let addresses:string[];
  if(net.isIP(host))addresses=[host];
  else try{addresses=await this.lookup(host);}catch{throw new WorldletError(`Could not find ${host}. Check the address and your internet connection.`);}
  if(!addresses.length||addresses.some(privateAddress))throw new WorldletError(`Worldlet reads ${gate.title} only on the internet: ${host} points to this computer or your local network.`);
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
