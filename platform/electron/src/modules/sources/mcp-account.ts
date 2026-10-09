import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {hermesConfigValues} from '../../../../../core/agent/index.ts';
import {WorldletError,writeAtomic} from '../../files.ts';
import type {VaultService} from '../../host/services.ts';
import {McpHttpClient,McpUnauthorized} from './mcp-client.ts';

/** Account connections over MCP (Notion, Todoist, Linear, PayPal, Supabase, GitHub) as the World keeps them (owner
 * decision 2026-10-09). A connection the person's Agent already has is used as it is: its `mcp_servers` entry and
 * sign-in in that Hermes profile, read there each time, and a refreshed token written back the way Hermes writes
 * it, so the Agent keeps working too. A connection made through Worldlet is the World's own: in the vault
 * (`mcp:<name>`), signed in with OAuth (discovery, dynamic registration, PKCE on a loopback address) or a token. */
export interface McpAccountOptions {
 vault:VaultService;
 /** The Hermes profiles whose connections are the Agent's own (Fox's profile, the chosen Hermes Agent's). */
 agentHomes:()=>string[];
 fetch?:typeof fetch;
 now?:()=>number;
}
/** A World connection in the vault. `expires_at` in ms. */
interface WorldGrant {
 v:1;url:string;kind:'oauth'|'bearer';
 bearer?:string;access_token?:string;refresh_token?:string;expires_at?:number;scope?:string;
 client_id?:string;client_secret?:string;token_endpoint?:string;resource?:string;
}
/** Where a connection lives: the World's vault, or an Agent's Hermes profile. */
export type McpConnection={source:'world';name:string;url:string;grant:WorldGrant}|{source:'agent';name:string;url:string;home:string;entry:Record<string,any>};

const NAME=/^[a-z][a-z0-9_-]{0,63}$/;
const vaultId=(name:string)=>'mcp:'+name;

export class McpAccounts {
 private readonly vault:VaultService;
 private readonly agentHomes:()=>string[];
 private readonly fetch:typeof fetch;
 private readonly now:()=>number;
 constructor(options:McpAccountOptions){
  this.vault=options.vault;this.agentHomes=options.agentHomes;this.fetch=options.fetch??fetch;this.now=options.now??Date.now;
 }
 /** The World's own connection first, else the first Agent profile with this server enabled and signed in. */
 connection(name:string):McpConnection|null {
  if(!NAME.test(name))return null;
  const grant=this.worldGrant(name);
  if(grant)return {source:'world',name,url:grant.url,grant};
  for(const home of this.agentHomes()){
   const entry=agentEntry(home,name);
   if(entry&&(signedIn(home,name)||bearerHeader(home,entry)))return {source:'agent',name,url:String(entry.url),home,entry};
  }
  return null;
 }
 /** Tools are limited to `include` (the connector's read tools); a server at another address is refused. */
 session(connection:McpConnection,title:string):McpHttpClient {
  return new McpHttpClient({url:connection.url,title,fetch:this.fetch,authorization:force=>this.authorization(connection,force)});
 }
 /** Connects through Worldlet: a token when one is given, else OAuth in the browser (`open`), within five minutes. */
 async connect(name:string,url:string,token:string,open:(url:string)=>Promise<void>,cancelled:()=>boolean=()=>false):Promise<McpConnection> {
  if(!NAME.test(name))throw new WorldletError('Invalid connection name.');
  const parsed=safeUrl(url);
  if(!parsed)throw new WorldletError('Use an HTTPS service endpoint.');
  const bearer=token.replace(/^\s*bearer\s+/i,'').trim();
  if(token.trim()&&(!bearer||bearer.toLowerCase()==='bearer'))throw new WorldletError('Bearer token is required');
  const grant:WorldGrant=bearer?{v:1,url:parsed,kind:'bearer',bearer}:await this.consent(parsed,open,cancelled);
  this.vault.set(vaultId(name),JSON.stringify(grant));
  return {source:'world',name,url:parsed,grant};
 }
 /** Forgets the World's own connection. An Agent's own stays with that Agent: it is removed there, by its own command. */
 disconnect(name:string){if(NAME.test(name))this.vault.delete(vaultId(name));}
 private worldGrant(name:string):WorldGrant|null {
  try{
   const value=JSON.parse(this.vault.get(vaultId(name))??'null');
   return value?.v===1&&typeof value.url==='string'&&safeUrl(value.url)===value.url&&['oauth','bearer'].includes(value.kind)?value:null;
  }catch{return null;}
 }
 /** The Authorization header, refreshing an expired (or, `force`, a refused) OAuth token. null when there is nothing
  * to send or nothing to refresh with. */
 private async authorization(connection:McpConnection,force:boolean):Promise<string|null> {
  if(connection.source==='world'){
   const grant=this.worldGrant(connection.name)??connection.grant;
   if(grant.kind==='bearer')return force?null:'Bearer '+grant.bearer;
   if(!force&&grant.access_token&&(!grant.expires_at||grant.expires_at>this.now()+60_000))return 'Bearer '+grant.access_token;
   if(!grant.refresh_token||!grant.token_endpoint||!grant.client_id)return null;
   const fresh=await this.refresh(grant.token_endpoint,grant.client_id,grant.client_secret,grant.refresh_token,grant.resource);
   const next:WorldGrant={...grant,access_token:fresh.access_token,refresh_token:fresh.refresh_token??grant.refresh_token,expires_at:fresh.expires_in?this.now()+fresh.expires_in*1000:undefined,...fresh.scope?{scope:fresh.scope}:{}};
   this.vault.set(vaultId(connection.name),JSON.stringify(next));
   return 'Bearer '+next.access_token;
  }
  const {home,name,entry}=connection;
  const header=bearerHeader(home,entry);
  if(header)return force?null:header;
  const files=hermesTokenFiles(home,name);
  const tokens=readJson(files.tokens);
  if(!tokens||typeof tokens.access_token!=='string')return null;
  // Hermes records an absolute `expires_at` in seconds (tools/mcp_oauth.py HermesTokenStorage.set_tokens).
  const expires=typeof tokens.expires_at==='number'?tokens.expires_at*1000:null;
  if(!force&&(expires===null||expires>this.now()+60_000))return 'Bearer '+tokens.access_token;
  const client=readJson(files.client),meta=readJson(files.meta);
  const endpoint=typeof meta?.token_endpoint==='string'?meta.token_endpoint:null;
  if(typeof tokens.refresh_token!=='string'||!endpoint||typeof client?.client_id!=='string')return null;
  const fresh=await this.refresh(endpoint,client.client_id,typeof client.client_secret==='string'?client.client_secret:undefined,tokens.refresh_token,undefined);
  const saved:Record<string,unknown>={...tokens,access_token:fresh.access_token,token_type:'Bearer',...fresh.refresh_token?{refresh_token:fresh.refresh_token}:{},...fresh.scope?{scope:fresh.scope}:{}};
  if(fresh.expires_in){saved.expires_in=fresh.expires_in;saved.expires_at=this.now()/1000+fresh.expires_in;}else{delete saved.expires_in;delete saved.expires_at;}
  // Written back as Hermes writes it, so the Agent's own copy stays valid when the server rotates refresh tokens.
  writeAtomic(files.tokens,JSON.stringify(saved,null,2),0o600);
  return 'Bearer '+fresh.access_token;
 }
 private async refresh(endpoint:string,client:string,secret:string|undefined,refresh:string,resource:string|undefined){
  const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:client,...secret?{client_secret:secret}:{},...resource?{resource}:{}});
  const answer=await this.post(endpoint,form);
  if(!answer.ok||typeof answer.value.access_token!=='string'){
   if(answer.value?.error==='invalid_grant'||answer.status===400||answer.status===401)throw new McpUnauthorized('');
   throw new WorldletError('The service could not renew its sign-in right now. Try again later.');
  }
  return answer.value as {access_token:string;refresh_token?:string;expires_in?:number;scope?:string};
 }
 private async post(url:string,form:URLSearchParams|Record<string,unknown>,timeout=15_000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const json=!(form instanceof URLSearchParams);
   const response=await this.fetch(url,{method:'POST',headers:{'content-type':json?'application/json':'application/x-www-form-urlencoded',accept:'application/json'},body:json?JSON.stringify(form):form.toString(),signal:controller.signal});
   return {ok:response.ok,status:response.status,value:await response.json().catch(()=>({})) as any};
  }catch{throw new WorldletError('Could not reach the service to sign in. Check your internet connection and try again.');}
  finally{clearTimeout(timer);}
 }
 private async getJson(url:string,timeout=10_000):Promise<any|null> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await this.fetch(url,{headers:{accept:'application/json','mcp-protocol-version':'2025-06-18'},signal:controller.signal});
   return response.ok?await response.json().catch(()=>null):null;
  }catch{return null;}finally{clearTimeout(timer);}
 }
 /** MCP authorization (2025-06-18): the server's protected-resource metadata names its authorization server, whose
  * metadata gives the endpoints; the World registers itself there (RFC 7591) for this loopback address and signs
  * in with PKCE, the resource indicator naming the server (RFC 8707). */
 private async consent(url:string,open:(url:string)=>Promise<void>,cancelled:()=>boolean):Promise<WorldGrant> {
  const resource=await this.resourceMetadata(url);
  const issuer=typeof resource?.authorization_servers?.[0]==='string'?resource.authorization_servers[0]:new URL(url).origin;
  const server=await this.authorizationMetadata(issuer);
  if(!server||typeof server.authorization_endpoint!=='string'||typeof server.token_endpoint!=='string')throw new WorldletError('This service does not offer a sign-in Worldlet can use.');
  if(!safeUrl(server.authorization_endpoint)||!safeUrl(server.token_endpoint))throw new WorldletError('This service does not offer a sign-in Worldlet can use.');
  const methods=Array.isArray(server.code_challenge_methods_supported)?server.code_challenge_methods_supported:['S256'];
  if(!methods.includes('S256'))throw new WorldletError('This service does not offer a sign-in Worldlet can use.');
  const target=typeof resource?.resource==='string'?resource.resource:url;
  const scopes=Array.isArray(resource?.scopes_supported)?resource.scopes_supported.filter((s:unknown)=>typeof s==='string').join(' '):'';
  const verifier=crypto.randomBytes(48).toString('base64url'),state=crypto.randomBytes(24).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  let client:{client_id:string;client_secret?:string}|null=null;
  const code=await loopback(async redirect=>{
   if(typeof server.registration_endpoint!=='string'||!safeUrl(server.registration_endpoint))throw new WorldletError('This service does not let Worldlet register to sign in. Connect it with a token instead.');
   const registered=await this.post(server.registration_endpoint,{client_name:'Worldlet',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'});
   if(!registered.ok||typeof registered.value.client_id!=='string')throw new WorldletError('This service did not let Worldlet register to sign in.');
   client={client_id:registered.value.client_id,...typeof registered.value.client_secret==='string'?{client_secret:registered.value.client_secret}:{}};
   return server.authorization_endpoint+(server.authorization_endpoint.includes('?')?'&':'?')+new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:redirect,state,code_challenge:challenge,code_challenge_method:'S256',resource:target,...scopes?{scope:scopes}:{}}).toString();
  },state,open,cancelled);
  const registered=client as {client_id:string;client_secret?:string}|null;
  if(!registered)throw new WorldletError('Authorization did not complete.');
  const answer=await this.post(server.token_endpoint,new URLSearchParams({grant_type:'authorization_code',code:code.code,redirect_uri:code.redirect,client_id:registered.client_id,code_verifier:verifier,resource:target,...registered.client_secret?{client_secret:registered.client_secret}:{}}));
  if(!answer.ok||typeof answer.value.access_token!=='string')throw new WorldletError('Authorization did not complete.');
  const value=answer.value;
  return {v:1,url,kind:'oauth',access_token:value.access_token,...typeof value.refresh_token==='string'?{refresh_token:value.refresh_token}:{},
   ...Number(value.expires_in)>0?{expires_at:this.now()+Number(value.expires_in)*1000}:{},...typeof value.scope==='string'?{scope:value.scope}:{},
   client_id:registered.client_id,...registered.client_secret?{client_secret:registered.client_secret}:{},token_endpoint:server.token_endpoint,resource:target};
 }
 /** RFC 9728: the metadata the server's 401 points at, else the well-known address for its path, then its origin's. */
 private async resourceMetadata(url:string):Promise<any|null> {
  let pointed:string|null=null;
  try{
   const response=await this.fetch(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Worldlet',version:'1'}}})});
   const challenge=response.headers.get('www-authenticate')??'';
   await response.body?.cancel().catch(()=>{});
   pointed=/resource_metadata="([^"]+)"/.exec(challenge)?.[1]??null;
  }catch{}
  const {origin,pathname}=new URL(url);
  for(const candidate of [pointed&&safeUrl(pointed),origin+'/.well-known/oauth-protected-resource'+(pathname==='/'?'':pathname),origin+'/.well-known/oauth-protected-resource']){
   if(!candidate)continue;
   const value=await this.getJson(candidate);
   if(value&&typeof value==='object')return value;
  }
  return null;
 }
 /** RFC 8414 and OpenID discovery, path-aware first. */
 private async authorizationMetadata(issuer:string):Promise<any|null> {
  const parsed=safeUrl(issuer);
  if(!parsed)return null;
  const {origin,pathname}=new URL(parsed),suffix=pathname==='/'?'':pathname.replace(/\/$/,'');
  for(const candidate of [origin+'/.well-known/oauth-authorization-server'+suffix,origin+'/.well-known/openid-configuration'+suffix,origin+suffix+'/.well-known/openid-configuration']){
   const value=await this.getJson(candidate);
   if(value&&typeof value==='object')return value;
  }
  return null;
 }
}

/** HTTPS only, with no user or password; the URL as written otherwise. */
function safeUrl(value:string):string|null {
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?value:null;}catch{return null;}
}
/** The browser signs in and comes back to a loopback address with the code. `authorize(redirect)` gives the address
 * to open once the listener is up. */
function loopback(authorize:(redirect:string)=>Promise<string>,state:string,open:(url:string)=>Promise<void>,cancelled:()=>boolean):Promise<{code:string;redirect:string}> {
 return new Promise((resolve,reject)=>{
  let settled=false,redirect='';
  const finish=(error:Error|null,code?:string)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(watch);server.close();if(error)reject(error);else resolve({code:code!,redirect});};
  const server=http.createServer((request,response)=>{
   const url=new URL(request.url??'/',redirect);
   if(url.pathname!=='/callback'||(!url.searchParams.has('code')&&!url.searchParams.has('error'))){response.writeHead(404).end();return;}
   const page=(text:string)=>{response.writeHead(200,{'content-type':'text/plain; charset=utf-8'});response.end(text);};
   if(url.searchParams.get('state')!==state){page('This sign-in link is out of date. Return to Worldlet and try again.');return;}
   const code=url.searchParams.get('code');
   if(!code){page('Authorization was not completed. You can return to Worldlet.');finish(new WorldletError('Authorization did not complete.'));return;}
   page('Authorization received. You can return to Worldlet.');
   finish(null,code);
  });
  const timer=setTimeout(()=>finish(new WorldletError('Sign-in timed out. Try again.')),300_000);
  const watch=setInterval(()=>{if(cancelled())finish(new WorldletError('Sign-in was cancelled.'));},500);
  server.on('error',error=>finish(error));
  server.listen(0,'127.0.0.1',()=>{
   redirect=`http://127.0.0.1:${(server.address() as {port:number}).port}/callback`;
   authorize(redirect).then(open).catch(error=>finish(error instanceof Error?error:new WorldletError(String(error))));
  });
 });
}

// An Agent's own connections, in its Hermes profile (read only, except a refreshed token) ------------------------

function readJson(file:string):any|null {try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'?value:null;}catch{return null;}}
function readText(file:string,limit=1_000_000):string {try{const stat=fs.statSync(file);return stat.size<=limit?fs.readFileSync(file,'utf8'):'';}catch{return '';}}
/** Hermes' token store (tools/mcp_oauth.py): HERMES_HOME/mcp-tokens/<name>.json, .client.json, .meta.json. */
function hermesTokenFiles(home:string,name:string){
 const folder=path.join(home,'mcp-tokens');
 return {tokens:path.join(folder,name+'.json'),client:path.join(folder,name+'.client.json'),meta:path.join(folder,name+'.meta.json')};
}
/** The enabled `mcp_servers.<name>` entry with an HTTPS address in that profile's config.yaml. */
function agentEntry(home:string,name:string):Record<string,any>|null {
 const entry=hermesConfigValues(readText(path.join(home,'config.yaml'))).mcp_servers?.[name];
 if(!entry||typeof entry!=='object'||entry.enabled===false||String(entry.enabled).toLowerCase()==='false')return null;
 return typeof entry.url==='string'&&safeUrl(entry.url)?entry:null;
}
function signedIn(home:string,name:string){return typeof readJson(hermesTokenFiles(home,name).tokens)?.access_token==='string';}
/** A token header saved by `hermes mcp add` (`Bearer ${MCP_<NAME>_API_KEY}`, the value in that profile's .env). */
function bearerHeader(home:string,entry:Record<string,any>):string|null {
 const header=entry.headers&&typeof entry.headers==='object'?entry.headers.Authorization??entry.headers.authorization:null;
 if(typeof header!=='string'||!header.trim())return null;
 const env=readText(path.join(home,'.env'));
 const value=header.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,(_all,key:string)=>{
  const match=new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`,'m').exec(env);
  return match?match[1].replace(/^(['"])(.*)\1$/,'$2'):'';
 });
 return /^Bearer\s+\S+/.test(value)?value:null;
}
