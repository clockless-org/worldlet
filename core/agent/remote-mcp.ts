import {AGENT_ASK_PROVIDER} from '../../contracts/agent-asks.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import type {WorldItem} from '../../contracts/world.ts';

// Remote MCP (REMOTE-MCP.md; owner decision 2026-10-17: everything the team's private service did becomes a Worldlet
// feature anyone can use). An MCP client in the cloud (a ChatGPT, Claude or Cursor connector, a cloud Agent session)
// reaches the `worldlet` MCP server on the person's own computer through an HTTPS front, `mcp.worldlet.ai/<room>`. The
// front only forwards each HTTP request to this computer over one WebSocket and its answer back; it stores nothing and
// decides nothing. This computer answers everything: OAuth 2.1 discovery, client registration, the authorization (the
// person allows it on a card here, never on a web page), the tokens, and the MCP calls, which run under the connecting
// Agent's own Grants exactly as on the standing server (GRANTS.md). The front sees requests in transit (cloud clients
// only speak HTTPS, so TLS ends there) but keeps none.
//
// The room is the first 32 hex characters of sha256(<host token>): the computer proves it is the room's host with the
// token, and making a token for a given room means reversing SHA-256, so the front keeps no record of rooms either.

/** Where cloud clients reach a World: `<origin>/<room>`. */
export const MCP_FRONT_ORIGIN='https://mcp.worldlet.ai';
/** The WebSocket the computer holds open to the front: `GET <relay>/api/mcp-host/<room>`, subprotocols
 * `worldlet-mcp-host.v1, host.<token>`. */
export const MCP_HOST_PROTOCOL='worldlet-mcp-host.v1';
export const MCP_HOST_PATH='/api/mcp-host/';
export const REMOTE_MCP_LIMITS=Object.freeze({
 /** A request body the front forwards, and a response body this computer sends, at most. */
 body:1_048_576,
 clients:50,redirectUris:10,
 /** Authorizations waiting on the person at once. */
 consents:5,
 accessSeconds:3600,codeSeconds:120,consentSeconds:600,
 /** How long one wait for the person's answer is held before the page asks again. */
 waitSeconds:25,
});
/** MCP protocol versions this server speaks, newest first. */
export const REMOTE_MCP_PROTOCOLS=['2025-06-18','2025-03-26','2024-11-05'] as const;
export const REMOTE_MCP_INSTRUCTIONS='Worldlet is the person\'s World, running on their own computer. Call describe_world_tools to see what you may do here, then call_world_tool. Some calls wait for the person\'s approval in Worldlet; a refused call says why.';
const FORWARDED_HEADERS=['authorization','content-type','accept','mcp-protocol-version','mcp-session-id'];

const enc=new TextEncoder();
const randomBytes=(n:number)=>crypto.getRandomValues(new Uint8Array(n));
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async(text:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)));
const tokenHash=async(token:string)=>hex(await digest(token));
const TOKEN=/^[A-Za-z0-9_-]{43}$/;

/** A new host or access token: 32 random bytes, base64url. */
export const newRemoteMcpToken=(random:(n:number)=>Uint8Array=randomBytes)=>b64url(random(32));
export async function remoteMcpRoom(token:string){return hex(await digest(token)).slice(0,32);}
/** The WebSocket this computer opens on `relay` as the room's host. */
export async function remoteMcpHostEntry(token:string,relay:string){
 const room=await remoteMcpRoom(token);
 return {room,url:relay.replace(/\/+$/,'').replace(/^http/,'ws')+MCP_HOST_PATH+room,protocols:[MCP_HOST_PROTOCOL,'host.'+token]};
}
/** The address the person gives a connector: `<front>/<room>`. */
export const remoteMcpAddress=(room:string,front:string=MCP_FRONT_ORIGIN)=>front.replace(/\/+$/,'')+'/'+room;
/** RFC 8414 and RFC 9728 put the well-known segment before the path: `<origin>/.well-known/<kind><path>`. */
export function wellKnownAddress(base:string,kind:'oauth-protected-resource'|'oauth-authorization-server'){
 const url=new URL(base);return url.origin+'/.well-known/'+kind+url.pathname.replace(/\/+$/,'');
}

// What the front sends and takes back (its side is worker/mcp-front.ts in the operations repository).
export type RemoteMcpRequest={id:string;method:string;base:string;path:string;query:string;headers:Record<string,string>;body:string;
 /** `address`: a request from the page at this World's own address (world-address.ts), not from an MCP client. */
 kind?:'address'};
export type RemoteMcpResponse={status:number;headers:Record<string,string>;body:string};
/** A request frame from the front, or null. */
export function readRemoteMcpRequest(data:unknown):RemoteMcpRequest|null {
 if(typeof data!=='string'||data.length>REMOTE_MCP_LIMITS.body*2)return null;
 let v:any;try{v=JSON.parse(data);}catch{return null;}
 if(v?.t!=='req'||typeof v.id!=='string'||!v.id||v.id.length>100||typeof v.method!=='string'||!/^[A-Z]{3,7}$/.test(v.method))return null;
 if(typeof v.base!=='string'||v.base.length>300||!/^(https:\/\/[a-z0-9.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)(:\d+)?)(\/[A-Za-z0-9/_-]*)?$/.test(v.base))return null;
 if(typeof v.path!=='string'||!v.path.startsWith('/')||v.path.length>500)return null;
 const query=typeof v.query==='string'&&v.query.length<=8000?v.query:'',body=typeof v.body==='string'?v.body:'';
 if(body.length>REMOTE_MCP_LIMITS.body)return null;
 const headers:Record<string,string>={};
 for(const name of FORWARDED_HEADERS){const value=v.headers?.[name];if(typeof value==='string'&&value.length<=8000)headers[name]=value;}
 return {id:v.id,method:v.method,base:v.base.replace(/\/+$/,''),path:v.path,query,headers,body,...v.kind==='address'?{kind:'address' as const}:{}};
}
export const remoteMcpResponseFrame=(id:string,response:RemoteMcpResponse)=>JSON.stringify({t:'res',id,...response});

// What this computer keeps: the clients that registered and the connections the person allowed (each one Agent).
export type RemoteMcpClient={id:string;name:string;redirectUris:string[];secretHash?:string;createdAt:number};
export type RemoteMcpConnection={agentId:string;clientId:string;accessHash:string;accessExpiresAt:number;refreshHash:string;createdAt:number};
/** A token the person made for an Agent that cannot open a browser (a script, a daemon): a bearer with no expiry, good
 * until the person revokes that Agent or makes it a new token. One per Agent. */
export type RemoteMcpToken={agentId:string;hash:string;createdAt:number};
export type RemoteMcpState={clients:RemoteMcpClient[];connections:RemoteMcpConnection[];tokens:RemoteMcpToken[]};
export const emptyRemoteMcpState=():RemoteMcpState=>({clients:[],connections:[],tokens:[]});
const HASH=/^[a-f0-9]{64}$/;
/** A kept state, with anything that does not fit dropped. */
export function readRemoteMcpState(value:unknown):RemoteMcpState {
 const v=value&&typeof value==='object'?value as any:{};
 const clients=(Array.isArray(v.clients)?v.clients:[]).filter((c:any)=>typeof c?.id==='string'&&TOKEN.test(c.id)&&typeof c.name==='string'&&Array.isArray(c.redirectUris)&&c.redirectUris.every(validRedirect)
  &&(c.secretHash===undefined||HASH.test(c.secretHash))&&Number.isFinite(c.createdAt));
 const connections=(Array.isArray(v.connections)?v.connections:[]).filter((c:any)=>typeof c?.agentId==='string'&&AGENT_ID_PATTERN.test(c.agentId)&&typeof c.clientId==='string'
  &&HASH.test(c.accessHash)&&HASH.test(c.refreshHash)&&Number.isFinite(c.accessExpiresAt)&&Number.isFinite(c.createdAt));
 const tokens=(Array.isArray(v.tokens)?v.tokens:[]).filter((t:any)=>typeof t?.agentId==='string'&&AGENT_ID_PATTERN.test(t.agentId)&&HASH.test(t.hash)&&Number.isFinite(t.createdAt));
 return {clients,connections,tokens};
}

/** A redirect a client may register: https, http to this device's loopback, or an app's own scheme (cursor://…). */
export function validRedirect(value:unknown):boolean {
 if(typeof value!=='string'||value.length>2000)return false;
 let url:URL;try{url=new URL(value);}catch{return false;}
 if(url.hash||url.username||url.password)return false;
 if(url.protocol==='https:')return true;
 if(url.protocol==='http:')return ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)&&!['javascript:','data:','file:','vbscript:','blob:','about:','ws:','wss:','ftp:','filesystem:'].includes(url.protocol);
}
/** Where a redirect returns, in a few words for the card: a host name, or the app's scheme. */
export function redirectPlace(value:string):string {
 try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url.hostname:url.protocol.slice(0,-1)+' app';}catch{return 'an unknown place';}
}

/** One authorization waiting on, or answered by, the person. The client's name is what it registered itself: the card
 * also names where it returns and a code the waiting page shows, so the person can tell it is the one they started. */
export type RemoteMcpConsentStatus='pending'|'allowed'|'denied'|'expired';
export type RemoteMcpConsent={id:string;client:string;returnsTo:string;code:string;createdAt:number;expiresAt:number;status:RemoteMcpConsentStatus};
export const remoteConsentItemId=(id:string)=>'remote-mcp-consent:'+id;
const CONSENT_ITEM_STATUS:Record<RemoteMcpConsentStatus,'open'|'done'|'dismissed'>={pending:'open',allowed:'done',denied:'dismissed',expired:'dismissed'};
/** The connected Services in a sentence: "GitHub", "GitHub and PostHog", "GitHub, PostHog and Cloudflare". */
export function remoteConsentServicesWords(services:readonly string[]):string {
 return services.length<2?services.join(''):`${services.slice(0,-1).join(', ')} and ${services.at(-1)}`;
}
/** The consent's Attention card (provider `agents`): Allow or Deny on this computer only. `services`: the connected
 * Services by name, which Allow also lets it read (Allow without them gives it only the default Grants). */
export function remoteConsentItem(consent:RemoteMcpConsent,services:readonly string[]=[]):WorldItem {
 const at=new Date(consent.createdAt).toISOString();
 const title=`${consent.client} wants to use your World`;
 const named=services.filter(name=>typeof name==='string'&&name).slice(0,10);
 const reads=named.length?` Allow also lets it read your ${remoteConsentServicesWords(named)}, so it can answer with them; it never changes anything there without asking you. Choose Allow without them to keep them private.`:'';
 const summary=`Allow only if you just started connecting ${consent.client} and its page shows the code ${consent.code}. It returns to ${consent.returnsTo}.${reads} It connects as an Agent of its own: you choose what it may do, and can revoke it, in Settings › Agent › Access.`;
 return {id:remoteConsentItemId(consent.id),provider:AGENT_ASK_PROVIDER,kind:'task',status:CONSENT_ITEM_STATUS[consent.status],title:[...title].slice(0,200).join(''),context:summary,summary,
  reason:'A connector asks to reach your World',attentionContentVersion:1,attentionReason:summary,
  sources:[{provider:AGENT_ASK_PROVIDER,id:consent.id,quote:title}],
  remoteConsentId:consent.id,remoteConsentClient:consent.client,remoteConsentCode:consent.code,remoteConsentReturnsTo:consent.returnsTo,remoteConsentStatus:consent.status,...named.length?{remoteConsentServices:named}:{},
  createdAt:at,updatedAt:at} as WorldItem;
}
/** The Agent an allowed connection becomes: its own ID, the client's name, kind `remote`. */
export function remoteMcpAgent(client:string,random:(n:number)=>Uint8Array=randomBytes):{id:string;name:string;harness:string;kind:'remote'} {
 const slug=client.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'connector';
 const id=`remote-${slug}-${hex(random(3))}`;
 return {id:AGENT_ID_PATTERN.test(id)?id:`remote-connector-${hex(random(3))}`,name:client,harness:slug.slice(0,32),kind:'remote'};
}

export type RemoteMcpTool={name:string;description:string;inputSchema:unknown};
export interface RemoteMcpDeps {
 load():RemoteMcpState;
 save(state:RemoteMcpState):void;
 /** Shows the consent on its card here, and again each time its status changes; false when it cannot be shown
  * (setup is not finished), so nobody could allow it. */
 show(consent:RemoteMcpConsent):boolean;
 /** The person allowed it and the client redeemed its code: the Agent this connection is, made now; its ID, or null
  * when none can be made. A code never redeemed makes no Agent. */
 connect(consent:RemoteMcpConsent):string|null;
 /** Whether the Agent may still connect (known and not revoked). */
 active(agentId:string):boolean;
 tools():RemoteMcpTool[];
 /** One `tools/call` by this Agent, decided by its own Grants. */
 call(agentId:string,name:string,args:Record<string,unknown>):Promise<{text:string;isError:boolean}>;
 now?():number;
 random?(n:number):Uint8Array;
}
export interface RemoteMcpServer {
 handle(request:RemoteMcpRequest):Promise<RemoteMcpResponse>;
 /** The person's Allow or Deny on the card; false when it is no longer waiting. */
 decide(id:string,allow:boolean):boolean;
 consents():RemoteMcpConsent[];
 /** A new token for this Agent, replacing any it had; only its hash is kept. */
 mint(agentId:string):Promise<string>;
 /** The Agent was revoked: its connections and token end at once. */
 forget(agentId:string):void;
 /** Ends every connection and registration (a new address). */
 reset():void;
}
type Pending={consent:RemoteMcpConsent;clientId:string;redirectUri:string;challenge:string;state:string|null;base:string;redirect:string|null;waiters:Set<()=>void>};
type Code={clientId:string;redirectUri:string;challenge:string;consent:RemoteMcpConsent;expiresAt:number};

const json=(status:number,value:unknown,headers:Record<string,string>={}):RemoteMcpResponse=>({status,headers:{'content-type':'application/json','cache-control':'no-store',...headers},body:JSON.stringify(value)});
const oauthError=(status:number,error:string,description:string)=>json(status,{error,error_description:description});
const notAllowed=(allow:string)=>json(405,{error:'method_not_allowed'},{allow});
const rpcError=(id:unknown,code:number,message:string)=>({jsonrpc:'2.0',id:id??null,error:{code,message}});
const PAGE_CSP=(nonce:string)=>`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const scriptValue=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
function page(title:string,lines:string[],script='',nonce=''):RemoteMcpResponse {
 const body=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title>`+
  `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 16px;color:#1d1b18;background:#faf7f2}@media(prefers-color-scheme:dark){body{color:#eee8df;background:#1c1a17}}h1{font-size:1.4rem}.code{font-size:2rem;letter-spacing:.2em;font-weight:600}</style></head>`+
  `<body><h1>${escapeHtml(title)}</h1>${lines.join('')}${script?`<script nonce="${nonce}">${script}</script>`:''}</body></html>`;
 return {status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':PAGE_CSP(nonce||'none')},body};
}
const errorPage=(status:number,message:string)=>({...page('Could not connect',[`<p>${escapeHtml(message)}</p>`]),status});
const text=(value:unknown,limit:number)=>typeof value==='string'?[...value.replace(/[\u0000-\u001f\u007f]/g,' ').trim()].slice(0,limit).join(''):'';
function withQuery(uri:string,values:Record<string,string|null>){
 const url=new URL(uri);for(const [key,value] of Object.entries(values))if(value!==null)url.searchParams.set(key,value);return url.href;
}

export function createRemoteMcpServer(deps:RemoteMcpDeps):RemoteMcpServer {
 const now=deps.now??(()=>Date.now()),random=deps.random??randomBytes;
 const pending=new Map<string,Pending>(),codes=new Map<string,Code>();
 const load=()=>readRemoteMcpState(deps.load());
 function sweep(){
  const at=now();
  for(const [code,entry] of codes)if(entry.expiresAt<=at)codes.delete(code);
  for(const [id,entry] of pending){
   if(entry.consent.status==='pending'&&entry.consent.expiresAt<=at){entry.consent={...entry.consent,status:'expired'};deps.show(entry.consent);wake(entry);}
   // An answered or expired one is kept a little longer, for the page still asking.
   if(entry.consent.expiresAt+60_000<=at)pending.delete(id);
  }
 }
 const wake=(entry:Pending)=>{for(const resolve of [...entry.waiters])resolve();entry.waiters.clear();};
 async function connection(header:string|undefined){
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header??'')?.[1];
  if(!token)return null;
  const hash=await tokenHash(token),at=now();
  const state=load(),found=state.connections.find(c=>c.accessHash===hash&&c.accessExpiresAt>at)??state.tokens.find(t=>t.hash===hash);
  return found&&deps.active(found.agentId)?found:null;
 }
 async function issue(state:RemoteMcpState,agentId:string,clientId:string,createdAt:number){
  const access=newRemoteMcpToken(random),refresh=newRemoteMcpToken(random);
  state.connections.push({agentId,clientId,accessHash:await tokenHash(access),accessExpiresAt:now()+REMOTE_MCP_LIMITS.accessSeconds*1000,refreshHash:await tokenHash(refresh),createdAt});
  deps.save(state);
  return json(200,{access_token:access,token_type:'Bearer',expires_in:REMOTE_MCP_LIMITS.accessSeconds,refresh_token:refresh,scope:'world'});
 }

 function resourceMetadata(base:string){
  return json(200,{resource:base,authorization_servers:[base],bearer_methods_supported:['header'],scopes_supported:['world'],resource_name:'Worldlet'});
 }
 function serverMetadata(base:string){
  return json(200,{issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',
   response_types_supported:['code'],response_modes_supported:['query'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],
   token_endpoint_auth_methods_supported:['none','client_secret_post','client_secret_basic'],scopes_supported:['world'],authorization_response_iss_parameter_supported:true});
 }

 // RFC 7591: anyone with the address may register; registering grants nothing until the person allows it here.
 async function register(request:RemoteMcpRequest){
  if(request.method!=='POST')return notAllowed('POST');
  let body:any;try{body=JSON.parse(request.body);}catch{return oauthError(400,'invalid_client_metadata','The registration is not JSON.');}
  const uris=Array.isArray(body?.redirect_uris)?body.redirect_uris:[];
  if(!uris.length||uris.length>REMOTE_MCP_LIMITS.redirectUris||!uris.every(validRedirect))return oauthError(400,'invalid_redirect_uri','Each redirect must be https, this device\'s loopback, or an app\'s own scheme.');
  if(Array.isArray(body.grant_types)&&!body.grant_types.includes('authorization_code'))return oauthError(400,'invalid_client_metadata','Only the authorization code grant is offered.');
  if(Array.isArray(body.response_types)&&!body.response_types.every((t:unknown)=>t==='code'))return oauthError(400,'invalid_client_metadata','Only the code response is offered.');
  const method=body.token_endpoint_auth_method??'client_secret_basic';
  if(!['none','client_secret_post','client_secret_basic'].includes(method))return oauthError(400,'invalid_client_metadata','That token endpoint authentication is not offered.');
  const state=load(),at=now(),id=newRemoteMcpToken(random),secret=method==='none'?null:newRemoteMcpToken(random);
  const name=text(body.client_name,60)||redirectPlace(uris[0]);
  state.clients.push({id,name,redirectUris:[...uris],...secret?{secretHash:await tokenHash(secret)}:{},createdAt:at});
  // Past the limit, the oldest registrations no connection uses go first.
  while(state.clients.length>REMOTE_MCP_LIMITS.clients){
   const unused=state.clients.findIndex(c=>c.id!==id&&!state.connections.some(x=>x.clientId===c.id));
   if(unused<0)return oauthError(400,'invalid_client_metadata','Too many connectors are registered with this World.');
   state.clients.splice(unused,1);
  }
  deps.save(state);
  return json(201,{client_id:id,client_id_issued_at:Math.floor(at/1000),...secret?{client_secret:secret,client_secret_expires_at:0}:{},client_name:name,redirect_uris:uris,
   token_endpoint_auth_method:method,grant_types:['authorization_code','refresh_token'],response_types:['code']});
 }

 async function authorize(request:RemoteMcpRequest){
  if(request.method!=='GET')return notAllowed('GET');
  sweep();
  const q=new URLSearchParams(request.query),client=load().clients.find(c=>c.id===q.get('client_id'));
  if(!client)return errorPage(400,'This connector is not registered with this World. Add the World\'s address to it again.');
  const redirectUri=q.get('redirect_uri')??(client.redirectUris.length===1?client.redirectUris[0]:'');
  if(!client.redirectUris.includes(redirectUri))return errorPage(400,'This connector asked to return somewhere it did not register.');
  const state=q.get('state'),fail=(error:string,description:string)=>({status:302,headers:{location:withQuery(redirectUri,{error,error_description:description,state,iss:request.base}),'cache-control':'no-store'},body:''});
  if(q.get('response_type')!=='code')return fail('unsupported_response_type','Only the code response is offered.');
  const challenge=q.get('code_challenge')??'';
  if(q.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return fail('invalid_request','PKCE with S256 is required.');
  const waiting=[...pending.values()].filter(p=>p.consent.status==='pending');
  if(waiting.length>=REMOTE_MCP_LIMITS.consents)return errorPage(429,'Too many connections are waiting for an answer in Worldlet. Answer or let them run out, then try again.');
  const at=now(),n=random(4),code=String(1000+((n[0]<<8|n[1])%9000));
  const consent:RemoteMcpConsent={id:b64url(random(16)),client:client.name,returnsTo:redirectPlace(redirectUri),code,createdAt:at,expiresAt:at+REMOTE_MCP_LIMITS.consentSeconds*1000,status:'pending'};
  if(!deps.show(consent))return errorPage(503,'Worldlet cannot ask you yet: finish setting it up on your computer, then try again.');
  pending.set(consent.id,{consent,clientId:client.id,redirectUri,challenge,state,base:request.base,redirect:null,waiters:new Set()});
  const nonce=b64url(random(16));
  const script=`const wait=${scriptValue(request.base+'/authorize/wait?id='+consent.id)},say=t=>{document.getElementById('said').textContent=t};`+
   `(async()=>{for(;;){let r;try{r=await (await fetch(wait,{cache:'no-store'})).json();}catch{await new Promise(f=>setTimeout(f,3000));continue;}`+
   `if(r.redirect){say(r.allowed?'Allowed. Returning…':'You declined. Returning…');location.replace(r.redirect);return;}`+
   `if(r.expired){say('This request ran out. Start connecting again.');return;}}})();`;
  return page('Connect to your World',[`<p>${escapeHtml(client.name)} wants to use your World.</p>`,
   '<p>Open Worldlet on your computer and choose Allow on the card in Attention. Allow only if the card shows this code:</p>',
   `<p class="code">${code}</p>`,'<p id="said" role="status">Waiting for your answer…</p>'],script,nonce);
 }
 async function wait(request:RemoteMcpRequest){
  if(request.method!=='GET')return notAllowed('GET');
  sweep();
  const entry=pending.get(new URLSearchParams(request.query).get('id')??'');
  if(!entry)return json(200,{expired:true});
  if(entry.consent.status==='pending')await new Promise<void>(resolve=>{
   const timer=setTimeout(done,REMOTE_MCP_LIMITS.waitSeconds*1000);
   function done(){clearTimeout(timer);entry!.waiters.delete(done);resolve();}
   entry.waiters.add(done);
  });
  if(entry.redirect)return json(200,{redirect:entry.redirect,allowed:entry.consent.status==='allowed'});
  return json(200,entry.consent.status==='expired'?{expired:true}:{pending:true});
 }
 function decide(id:string,allow:boolean){
  sweep();
  const entry=pending.get(id);
  if(!entry||entry.consent.status!=='pending')return false;
  if(allow){
   const code=newRemoteMcpToken(random);
   codes.set(code,{clientId:entry.clientId,redirectUri:entry.redirectUri,challenge:entry.challenge,consent:entry.consent,expiresAt:now()+REMOTE_MCP_LIMITS.codeSeconds*1000});
   entry.redirect=withQuery(entry.redirectUri,{code,state:entry.state,iss:entry.base});
   entry.consent={...entry.consent,status:'allowed'};
  }else{
   entry.redirect=withQuery(entry.redirectUri,{error:'access_denied',error_description:'The person declined in Worldlet.',state:entry.state,iss:entry.base});
   entry.consent={...entry.consent,status:'denied'};
  }
  deps.show(entry.consent);wake(entry);
  return true;
 }

 async function token(request:RemoteMcpRequest){
  if(request.method!=='POST')return notAllowed('POST');
  let form:URLSearchParams;
  try{form=(request.headers['content-type']??'').includes('application/json')?new URLSearchParams(Object.entries(JSON.parse(request.body)).map(([k,v])=>[k,String(v)])):new URLSearchParams(request.body);}
  catch{return oauthError(400,'invalid_request','The token request could not be read.');}
  let clientId=form.get('client_id')??'',secret=form.get('client_secret');
  const basic=/^Basic ([A-Za-z0-9+/=]+)$/.exec(request.headers.authorization??'')?.[1];
  if(basic){try{const [id,pass]=atob(basic).split(':');clientId=decodeURIComponent(id??'');secret=decodeURIComponent(pass??'');}catch{return oauthError(401,'invalid_client','The client could not be read.');}}
  const state=load(),client=state.clients.find(c=>c.id===clientId);
  if(!client||client.secretHash&&(!secret||await tokenHash(secret)!==client.secretHash))return oauthError(401,'invalid_client','This connector is not registered with this World.');
  const grant=form.get('grant_type');
  if(grant==='authorization_code'){
   sweep();
   const code=form.get('code')??'',entry=codes.get(code);
   codes.delete(code);
   if(!entry||entry.clientId!==client.id)return oauthError(400,'invalid_grant','This code is not valid.');
   if(form.has('redirect_uri')&&form.get('redirect_uri')!==entry.redirectUri)return oauthError(400,'invalid_grant','The redirect does not match.');
   const verifier=form.get('code_verifier')??'';
   if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||b64url(await digest(verifier))!==entry.challenge)return oauthError(400,'invalid_grant','The code verifier does not match.');
   const agentId=deps.connect(entry.consent);
   if(!agentId||!deps.active(agentId))return oauthError(400,'invalid_grant','Worldlet could not make this connection.');
   return issue(state,agentId,client.id,now());
  }
  if(grant==='refresh_token'){
   const hash=await tokenHash(form.get('refresh_token')??''),index=state.connections.findIndex(c=>c.refreshHash===hash&&c.clientId===client.id);
   const found=index<0?null:state.connections[index];
   if(!found||!deps.active(found.agentId))return oauthError(400,'invalid_grant','This connection has ended. Connect again.');
   // Each refresh token works once: a new pair replaces it.
   state.connections.splice(index,1);
   return issue(state,found.agentId,client.id,found.createdAt);
  }
  return oauthError(400,'unsupported_grant_type','Only authorization_code and refresh_token are offered.');
 }

 async function mcp(request:RemoteMcpRequest){
  if(request.method!=='POST')return notAllowed('POST');
  const found=await connection(request.headers.authorization);
  if(!found){
   const offered=request.headers.authorization?.startsWith('Bearer ');
   return json(401,{error:offered?'invalid_token':'unauthorized',error_description:'Connect to this World first: Worldlet asks the person to allow it.'},
    {'www-authenticate':`Bearer resource_metadata="${wellKnownAddress(request.base,'oauth-protected-resource')}"`+(offered?', error="invalid_token"':'')});
  }
  let body:unknown;try{body=JSON.parse(request.body);}catch{return json(400,rpcError(null,-32700,'Parse error'));}
  const batch=Array.isArray(body),messages=batch?body as unknown[]:[body];
  if(!messages.length)return json(400,rpcError(null,-32600,'Invalid request'));
  const answers:unknown[]=[];
  for(const message of messages){
   const m=message&&typeof message==='object'?message as Record<string,unknown>:null;
   // Notifications and the client's own answers take no reply.
   if(!m||m.id===undefined||m.id===null){if(!m)answers.push(rpcError(null,-32600,'Invalid request'));continue;}
   if(m.jsonrpc!=='2.0'||typeof m.method!=='string'){if(m.method!==undefined||m.result===undefined&&m.error===undefined)answers.push(rpcError(m.id,-32600,'Invalid request'));continue;}
   answers.push(await dispatch(found.agentId,m));
  }
  if(!answers.length)return {status:202,headers:{'cache-control':'no-store'},body:''};
  return json(200,batch?answers:answers[0]);
 }
 async function dispatch(agentId:string,m:Record<string,unknown>){
  const params=m.params&&typeof m.params==='object'?m.params as Record<string,unknown>:{},reply=(result:unknown)=>({jsonrpc:'2.0',id:m.id,result});
  try{
   if(m.method==='initialize'){
    const asked=params.protocolVersion,version=(REMOTE_MCP_PROTOCOLS as readonly unknown[]).includes(asked)?asked:REMOTE_MCP_PROTOCOLS[0];
    return reply({protocolVersion:version,capabilities:{tools:{listChanged:false}},serverInfo:{name:'worldlet',title:'Worldlet',version:'1'},instructions:REMOTE_MCP_INSTRUCTIONS});
   }
   if(m.method==='ping')return reply({});
   if(m.method==='tools/list')return reply({tools:deps.tools()});
   if(m.method==='tools/call'){
    if(typeof params.name!=='string')return rpcError(m.id,-32602,'A tool name is required.');
    const args=params.arguments&&typeof params.arguments==='object'&&!Array.isArray(params.arguments)?params.arguments as Record<string,unknown>:{};
    const result=await deps.call(agentId,params.name,args);
    return reply({content:[{type:'text',text:result.text}],isError:result.isError});
   }
   return rpcError(m.id,-32601,'Method not found');
  }catch{return rpcError(m.id,-32603,'Worldlet could not answer this call.');}
 }

 return {
  async handle(request){
   try{
    const path=request.path.replace(/\/+$/,'')||'/';
    if(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/mcp')return request.method==='GET'?resourceMetadata(request.base):notAllowed('GET');
    if(path==='/.well-known/oauth-authorization-server'||path==='/.well-known/openid-configuration')return request.method==='GET'?serverMetadata(request.base):notAllowed('GET');
    if(path==='/register')return await register(request);
    if(path==='/authorize')return await authorize(request);
    if(path==='/authorize/wait')return await wait(request);
    if(path==='/token')return await token(request);
    if(path==='/'||path==='/mcp')return await mcp(request);
    return json(404,{error:'not_found'});
   }catch{return json(500,{error:'server_error'});}
  },
  decide,
  consents(){sweep();return [...pending.values()].map(entry=>entry.consent);},
  async mint(agentId){
   const token=newRemoteMcpToken(random),hash=await tokenHash(token),state=load();
   deps.save({...state,tokens:[...state.tokens.filter(t=>t.agentId!==agentId),{agentId,hash,createdAt:now()}]});
   return token;
  },
  forget(agentId){
   const state=load(),kept=state.connections.filter(c=>c.agentId!==agentId),tokens=state.tokens.filter(t=>t.agentId!==agentId);
   if(kept.length!==state.connections.length||tokens.length!==state.tokens.length)deps.save({...state,connections:kept,tokens});
  },
  reset(){
   deps.save(emptyRemoteMcpState());codes.clear();
   for(const entry of pending.values())if(entry.consent.status==='pending'){entry.consent={...entry.consent,status:'expired'};deps.show(entry.consent);wake(entry);}
   pending.clear();
  }
 };
}
