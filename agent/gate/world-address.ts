import {AGENT_ASK_PROVIDER} from '../../contracts/agent-asks.ts';
import type {WorldItem} from '../../contracts/world.ts';
import type {RemoteMcpConsent,RemoteMcpRequest,RemoteMcpResponse} from './remote-mcp.ts';

// One address per World (WORLD-ADDRESS.md; owner decisions 2026-10-18 and 2026-10-22): `https://<room>.worldlet.ai`,
// for the World's page and, at `/mcp`, its remote MCP server. The name is the room of remote access's host token, so
// nothing is chosen or registered (`<name>` below is that room; the website still answers names registered before). The website
// serves one static page there for everyone and passes the page's requests to this computer over the remote MCP
// connection, as `address` requests (`kind: 'address'` on the front's frame); it keeps only the name and its World's
// front key. Every decision is made here, never on the website:
// - The owner's new browser asks to be let in with a passkey it just made for this address and a four-digit code; a
//   card in Attention on this computer asks the person to allow it. Then the passkey signs it in, and it is handed
//   this World's link, which opens the full World on that origin, sealed end to end through the pairing room.
// - Other people see nothing unless the person shares one thing (the board, for now): open to anyone with its link,
//   or by invitation, where the visitor asks with their name and their own passkey and the person allows them on a
//   card. A visitor is like an Agent: what they may see (their shares), their audit, and Revoke.
// - Passkeys (public keys only), visitors and shares are kept in the vault; sessions, challenges and requests only in
//   memory. The page's origin and its relying party are the address itself, checked in every passkey answer.

export const ADDRESS_ZONE='worldlet.ai';
/** 3 to 32 lowercase letters, digits and inner hyphens, never two in a row (the website checks the same). */
export const ADDRESS_NAME=/^(?!.*--)[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
export const RESERVED_ADDRESS_NAMES:ReadonlySet<string>=new Set(('www mcp api app apps admin dev docs help status mail email smtp imap pop ns ns1 ns2 cdn static assets '+
 'world worlds worldlet worldlets download downloads install update updates blog news support security login signin signup auth account accounts '+
 'billing pay payment payments shop store test staging beta alpha preview gatehouse ops internal official team owner root system').split(' '));
export const WORLD_ADDRESS_LIMITS=Object.freeze({
 /** Requests to be let in waiting on the person at once, and how long one waits. */
 requests:5,requestSeconds:600,
 challenges:50,challengeSeconds:120,
 sessionSeconds:12*3600,sessions:200,
 passkeys:50,visitors:100,shares:20,audit:20,
 /** How long one wait for the person's answer is held. */
 waitSeconds:25,
 label:40,title:80,
});
/** Whether `name` may be a World's address: well formed and not kept for Worldlet itself. */
export const validAddressName=(name:unknown):name is string=>typeof name==='string'&&ADDRESS_NAME.test(name)&&!RESERVED_ADDRESS_NAMES.has(name);
/** The address of `name`: `https://<name>.worldlet.ai`, or on a development relay `<scheme>://<name>.<its host>`. */
export function worldAddress(name:string,relay=`https://${ADDRESS_ZONE}`):string {
 const url=new URL(relay);
 return `${url.protocol}//${name}.${url.host}`;
}

const enc=new TextEncoder();
const randomBytes=(n:number)=>crypto.getRandomValues(new Uint8Array(n));
const b64url=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
function fromB64url(text:unknown,max=4096):Uint8Array|null {
 if(typeof text!=='string'||!text||text.length>max||!/^[A-Za-z0-9_-]+$/.test(text))return null;
 try{const s=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4));return Uint8Array.from(s,c=>c.charCodeAt(0));}catch{return null;}
}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const sha256=async(bytes:Uint8Array)=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource));
const tokenHash=async(token:string)=>hex(await sha256(enc.encode(token)));
const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const text=(value:unknown,limit:number)=>typeof value==='string'?[...value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g,' ').replace(/\s+/g,' ').trim()].slice(0,limit).join(''):'';
const ID=/^[A-Za-z0-9_-]{16,64}$/;

// Passkeys (WebAuthn). Only ES256 (-7) and RS256 (-257): what every current passkey provider offers.
export const PASSKEY_ALGORITHMS=Object.freeze([-7,-257] as const);
type Algorithm=typeof PASSKEY_ALGORITHMS[number];
const importKey=(spki:Uint8Array,algorithm:Algorithm)=>crypto.subtle.importKey('spki',spki as BufferSource,algorithm===-7?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
/** An ECDSA signature as WebAuthn gives it (DER) in the raw r‖s form WebCrypto takes, or null. */
export function derToRaw(der:Uint8Array):Uint8Array|null {
 let at=0;
 const read=()=>{
  if(der[at++]!==0x02)return null;
  const length=der[at++];if(length===undefined||length>33||at+length>der.length)return null;
  let int=der.slice(at,at+length);at+=length;
  while(int.length>32&&int[0]===0)int=int.slice(1);
  if(int.length>32)return null;
  const out=new Uint8Array(32);out.set(int,32-int.length);return out;
 };
 if(der[at++]!==0x30)return null;
 const total=der[at++];if(total===undefined||total+2!==der.length)return null;
 const r=read(),s=read();
 if(!r||!s||at!==der.length)return null;
 const raw=new Uint8Array(64);raw.set(r,0);raw.set(s,32);return raw;
}
type Client={type:string;challenge:string;origin:string;crossOrigin?:boolean};
function readClient(bytes:Uint8Array):Client|null {
 try{const v=JSON.parse(new TextDecoder().decode(bytes));return typeof v?.type==='string'&&typeof v.challenge==='string'&&typeof v.origin==='string'?v:null;}catch{return null;}
}
/** The checks both ceremonies share: the page's own answer, for this challenge, on this address, with the person present. */
async function checkCeremony(clientData:Uint8Array,authData:Uint8Array,{type,challenge,origin,rpId}:{type:'webauthn.create'|'webauthn.get';challenge:string;origin:string;rpId:string}):Promise<string|null> {
 const client=readClient(clientData);
 if(!client||client.type!==type)return 'This is not a passkey answer.';
 if(client.challenge!==challenge)return 'This passkey answer is for another request.';
 if(client.origin!==origin||client.crossOrigin===true)return 'This passkey answer came from another site.';
 if(authData.length<37||!same(authData.slice(0,32),await sha256(enc.encode(rpId))))return 'This passkey is for another site.';
 if(!(authData[32]&0x01))return 'The passkey was used without anyone present.';
 return null;
}
const signCount=(authData:Uint8Array)=>((authData[33]<<24)>>>0)+(authData[34]<<16)+(authData[35]<<8)+authData[36];

// What this computer keeps (vault `world-address`).
export type AddressPasskey={id:string;publicKey:string;algorithm:Algorithm;label:string;
 /** Whose it is: the person (`owner`), or a visitor they allowed. */
 visitor?:string;signCount:number;createdAt:number;usedAt?:number};
export type AddressShare={id:string;kind:'board';title:string;
 /** Anyone with the link sees it; otherwise only visitors the person allowed. */
 open:boolean;tab?:string;createdAt:number};
export type AddressVisitor={id:string;name:string;
 /** The shares they may see, read only. */
 shares:string[];createdAt:number;audit:{at:number;share:string}[]};
/** `name` is the address the World answers at: the chosen name, else the default one. */
export type WorldAddressState={name:string|null;passkeys:AddressPasskey[];shares:AddressShare[];visitors:AddressVisitor[]};
export const emptyWorldAddressState=():WorldAddressState=>({name:null,passkeys:[],shares:[],visitors:[]});
/** A kept state, with anything that does not fit dropped. */
export function readWorldAddressState(value:unknown):WorldAddressState {
 const v=value&&typeof value==='object'?value as any:{};
 const visitors=(Array.isArray(v.visitors)?v.visitors:[]).filter((x:any)=>ID.test(x?.id)&&typeof x.name==='string'&&Array.isArray(x.shares)&&x.shares.every((s:unknown)=>typeof s==='string'&&ID.test(s))&&Number.isFinite(x.createdAt))
  .map((x:any)=>({id:x.id,name:text(x.name,WORLD_ADDRESS_LIMITS.label),shares:[...x.shares],createdAt:x.createdAt,audit:(Array.isArray(x.audit)?x.audit:[]).filter((a:any)=>Number.isFinite(a?.at)&&typeof a.share==='string').slice(-WORLD_ADDRESS_LIMITS.audit)}));
 const passkeys=(Array.isArray(v.passkeys)?v.passkeys:[]).filter((p:any)=>typeof p?.id==='string'&&fromB64url(p.id,1400)&&fromB64url(p.publicKey,1400)&&PASSKEY_ALGORITHMS.includes(p.algorithm)&&typeof p.label==='string'
  &&(p.visitor===undefined||visitors.some((x:AddressVisitor)=>x.id===p.visitor))&&Number.isFinite(p.createdAt))
  .map((p:any)=>({id:p.id,publicKey:p.publicKey,algorithm:p.algorithm,label:text(p.label,WORLD_ADDRESS_LIMITS.label),...p.visitor?{visitor:p.visitor}:{},signCount:Number.isSafeInteger(p.signCount)?p.signCount:0,createdAt:p.createdAt,...Number.isFinite(p.usedAt)?{usedAt:p.usedAt}:{}}));
 const shares=(Array.isArray(v.shares)?v.shares:[]).filter((s:any)=>ID.test(s?.id)&&s.kind==='board'&&typeof s.title==='string'&&typeof s.open==='boolean'&&Number.isFinite(s.createdAt))
  .map((s:any)=>({id:s.id,kind:'board' as const,title:text(s.title,WORLD_ADDRESS_LIMITS.title)||'Board',open:s.open,...typeof s.tab==='string'&&/^[a-z0-9-]{1,40}$/.test(s.tab)?{tab:s.tab}:{},createdAt:s.createdAt}));
 return {name:validAddressName(v.name)?v.name:null,passkeys,shares,visitors};
}

/** A request to be let in, shown as a card like a connector's (remote-mcp.ts RemoteMcpConsent), with what it asks. */
export type WorldAddressRequest=RemoteMcpConsent&{
 /** `owner`: to open the whole World as the person; `visitor`: to see one shared thing. */
 asks:'owner'|'visitor';share?:{id:string;title:string}};
export const WORLD_ADDRESS_REQUEST_PREFIX='address-';
export const isWorldAddressRequest=(id:unknown)=>typeof id==='string'&&id.startsWith(WORLD_ADDRESS_REQUEST_PREFIX);
const ITEM_STATUS={pending:'open',allowed:'done',denied:'dismissed',expired:'dismissed'} as const;
/** Its Attention card (provider `agents`, the same card as a connector's): Allow or Deny, on this computer only. */
export function worldAddressRequestItem(request:WorldAddressRequest,address:string):WorldItem {
 const at=new Date(request.createdAt).toISOString();
 const title=request.asks==='owner'?`Allow ${request.client} to open your World?`:`${request.client} wants to see your ${request.share?.title??'board'}`;
 const summary=request.asks==='owner'
  ?`A browser called ${request.client} asks to open your whole World at ${address}, as you. Allow only if you are using it right now and it shows the code ${request.code}. It keeps a passkey for this World; sign it out in Settings › Agents.`
  :`Someone who gave the name ${request.client} asked to see ${request.share?.title??'your board'} at ${address}. They can only read it. Allow only if you meant to share it with them; you can ask them for the code ${request.code}. Remove them in Settings › Agents.`;
 return {id:'remote-mcp-consent:'+request.id,provider:AGENT_ASK_PROVIDER,kind:'task',status:ITEM_STATUS[request.status],title:[...title].slice(0,200).join(''),context:summary,summary,
  reason:request.asks==='owner'?'A browser asks to open your World':'Someone asks to see what you shared',attentionContentVersion:1,attentionReason:summary,
  sources:[{provider:AGENT_ASK_PROVIDER,id:request.id,quote:title}],
  remoteConsentId:request.id,remoteConsentClient:request.client,remoteConsentCode:request.code,remoteConsentReturnsTo:request.returnsTo,remoteConsentStatus:request.status,
  remoteConsentAsks:request.asks,...request.share?{remoteConsentShare:request.share.title}:{},
  createdAt:at,updatedAt:at} as WorldItem;
}

export type WorldAddressDeps={
 load():WorldAddressState;
 save(state:WorldAddressState):void;
 /** Shows the request on its card here, and again when its status changes; false when it cannot be shown. */
 show(request:WorldAddressRequest):boolean;
 /** This World's link for another device, to hand a signed-in owner: its bundle path and fragment. */
 worldLink():Promise<{path:string;fragment:string}|null>;
 /** The board as the person sees it, for a share. */
 board(tab?:string):Promise<unknown>;
 /** The address's origin for `name` (worldAddress). */
 origin(name:string):string;
 now?():number;
 random?(n:number):Uint8Array;
};
export interface WorldAddressServer {
 handle(request:RemoteMcpRequest):Promise<RemoteMcpResponse>;
 /** The person's Allow or Deny on the card; false when it is no longer waiting. */
 decide(id:string,allow:boolean):boolean;
 requests():WorldAddressRequest[];
 /** Ends a passkey's sessions, or a visitor's (and every passkey of theirs). */
 signOut(passkeyOrVisitor:string):void;
 /** Ends every session and request (a new name, or the address turned off). */
 reset():void;
}
type Pending={request:WorldAddressRequest;passkey:AddressPasskey;share?:string;waiters:Set<()=>void>};
type Session={passkey:string;visitor?:string;expiresAt:number};
const json=(status:number,value:unknown):RemoteMcpResponse=>({status,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(value)});
const NOT_HERE='There is no World at this address.';

export function createWorldAddressServer(deps:WorldAddressDeps):WorldAddressServer {
 const now=deps.now??(()=>Date.now()),random=deps.random??randomBytes;
 const challenges=new Map<string,{challenge:string;purpose:'register'|'signin';expiresAt:number}>();
 const pending=new Map<string,Pending>(),sessions=new Map<string,Session>();
 const load=()=>readWorldAddressState(deps.load());
 const wake=(entry:Pending)=>{for(const resolve of [...entry.waiters])resolve();entry.waiters.clear();};
 function sweep(){
  const at=now();
  for(const [id,c] of challenges)if(c.expiresAt<=at)challenges.delete(id);
  for(const [hash,s] of sessions)if(s.expiresAt<=at)sessions.delete(hash);
  for(const [id,entry] of pending){
   if(entry.request.status==='pending'&&entry.request.expiresAt<=at){entry.request={...entry.request,status:'expired'};deps.show(entry.request);wake(entry);}
   if(entry.request.expiresAt+60_000<=at)pending.delete(id);
  }
 }
 function take(id:unknown,purpose:'register'|'signin'){
  sweep();
  const found=typeof id==='string'?challenges.get(id):undefined;
  if(typeof id==='string')challenges.delete(id);
  return found&&found.purpose===purpose?found.challenge:null;
 }
 async function session(header:string|undefined){
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header??'')?.[1];
  if(!token)return null;
  sweep();
  const hash=await tokenHash(token),found=sessions.get(hash);
  if(!found)return null;
  // A passkey or visitor removed since: the session ends with it.
  const state=load();
  if(!state.passkeys.some(p=>p.id===found.passkey&&p.visitor===found.visitor)){sessions.delete(hash);return null;}
  return found;
 }
 const body=(request:RemoteMcpRequest)=>{try{const v=JSON.parse(request.body);return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:null;}catch{return null;}};

 async function options(request:RemoteMcpRequest,origin:string){
  const input=body(request),purpose=input?.purpose;
  if(purpose!=='register'&&purpose!=='signin')return json(400,{error:'Say what the passkey is for.'});
  sweep();
  // Past the limit the oldest goes, so a flood of sign-ins cannot lock the person out.
  while(challenges.size>=WORLD_ADDRESS_LIMITS.challenges)challenges.delete(challenges.keys().next().value!);
  const id=b64url(random(16)),challenge=b64url(random(32));
  challenges.set(id,{challenge,purpose,expiresAt:now()+WORLD_ADDRESS_LIMITS.challengeSeconds*1000});
  return json(200,{id,challenge,rpId:new URL(origin).hostname,...purpose==='register'?{user:{id:b64url(random(16))}}:{}});
 }

 async function access(request:RemoteMcpRequest,origin:string){
  const input=body(request);
  if(!input)return json(400,{error:'This request could not be read.'});
  const challenge=take(input.challengeId,'register');
  if(!challenge)return json(400,{error:'This request ran out. Start again.'});
  const label=text(input.label,WORLD_ADDRESS_LIMITS.label);
  if(!label)return json(400,{error:'Give a name first.'});
  const state=load();
  let share:AddressShare|undefined;
  if(input.share!==undefined){
   share=state.shares.find(s=>s.id===input.share);
   if(!share)return json(404,{error:'Nothing is shared at this link any more.'});
  }
  const c=input.credential??{},id=fromB64url(c.id,1400),spki=fromB64url(c.publicKey,1400),clientData=fromB64url(c.clientDataJSON,4096),authData=fromB64url(c.authenticatorData,4096);
  if(!id||!spki||!clientData||!authData||!PASSKEY_ALGORITHMS.includes(c.algorithm))return json(400,{error:'This passkey could not be read.'});
  const refused=await checkCeremony(clientData,authData,{type:'webauthn.create',challenge,origin,rpId:new URL(origin).hostname});
  if(refused)return json(400,{error:refused});
  // The credential the authenticator made is the one sent (attested credential data: AAGUID, length, ID).
  if(!(authData[32]&0x40)||authData.length<55)return json(400,{error:'This passkey could not be read.'});
  const idLength=(authData[53]<<8)+authData[54];
  if(!same(authData.slice(55,55+idLength),id))return json(400,{error:'This passkey could not be read.'});
  try{await importKey(spki,c.algorithm);}catch{return json(400,{error:'This passkey could not be read.'});}
  if(state.passkeys.some(p=>p.id===c.id))return json(409,{error:'This passkey is already known here. Sign in with it.'});
  sweep();
  if([...pending.values()].filter(p=>p.request.status==='pending').length>=WORLD_ADDRESS_LIMITS.requests)return json(429,{error:'Too many requests are waiting for an answer. Try again later.'});
  const at=now(),n=random(4);
  const req:WorldAddressRequest={id:WORLD_ADDRESS_REQUEST_PREFIX+b64url(random(16)),client:label,returnsTo:new URL(origin).hostname,code:String(1000+((n[0]<<8|n[1])%9000)),
   createdAt:at,expiresAt:at+WORLD_ADDRESS_LIMITS.requestSeconds*1000,status:'pending',asks:share?'visitor':'owner',...share?{share:{id:share.id,title:share.title}}:{}};
  const passkey:AddressPasskey={id:c.id,publicKey:b64url(spki),algorithm:c.algorithm,label,signCount:signCount(authData),createdAt:at};
  if(!deps.show(req))return json(503,{error:'This World cannot ask its owner yet. Try again later.'});
  pending.set(req.id,{request:req,passkey,...share?{share:share.id}:{},waiters:new Set()});
  return json(200,{id:req.id,code:req.code});
 }
 async function wait(request:RemoteMcpRequest){
  sweep();
  const entry=pending.get(new URLSearchParams(request.query).get('id')??'');
  if(!entry)return json(200,{status:'expired'});
  if(entry.request.status==='pending')await new Promise<void>(resolve=>{
   const timer=setTimeout(done,WORLD_ADDRESS_LIMITS.waitSeconds*1000);
   function done(){clearTimeout(timer);entry!.waiters.delete(done);resolve();}
   entry.waiters.add(done);
  });
  return json(200,{status:entry.request.status});
 }
 function decide(id:string,allow:boolean){
  sweep();
  const entry=pending.get(id);
  if(!entry||entry.request.status!=='pending')return false;
  if(allow){
   const state=load();
   if(state.passkeys.length>=WORLD_ADDRESS_LIMITS.passkeys)return false;
   if(entry.request.asks==='visitor'){
    if(!state.shares.some(s=>s.id===entry.share))return false;
    if(state.visitors.length>=WORLD_ADDRESS_LIMITS.visitors)return false;
    const visitor:AddressVisitor={id:b64url(random(16)),name:entry.request.client,shares:[entry.share!],createdAt:now(),audit:[]};
    state.visitors.push(visitor);
    state.passkeys.push({...entry.passkey,visitor:visitor.id});
   }else state.passkeys.push(entry.passkey);
   deps.save(state);
  }
  entry.request={...entry.request,status:allow?'allowed':'denied'};
  deps.show(entry.request);wake(entry);
  return true;
 }

 async function signin(request:RemoteMcpRequest,origin:string){
  const input=body(request);
  if(!input)return json(400,{error:'This sign-in could not be read.'});
  const challenge=take(input.challengeId,'signin');
  if(!challenge)return json(400,{error:'This sign-in ran out. Try again.'});
  const c=input.credential??{},clientData=fromB64url(c.clientDataJSON,4096),authData=fromB64url(c.authenticatorData,4096),signature=fromB64url(c.signature,1024);
  const state=load(),passkey=typeof c.id==='string'?state.passkeys.find(p=>p.id===c.id):undefined;
  // An unknown passkey and a wrong signature look the same.
  const refused=()=>json(401,{error:'This passkey is not allowed here. Ask to use this browser first.'});
  if(!passkey||!clientData||!authData||!signature)return refused();
  const why=await checkCeremony(clientData,authData,{type:'webauthn.get',challenge,origin,rpId:new URL(origin).hostname});
  if(why)return json(400,{error:why});
  const signed=new Uint8Array(authData.length+32);signed.set(authData,0);signed.set(await sha256(clientData),authData.length);
  let valid=false;
  try{
   const key=await importKey(fromB64url(passkey.publicKey,1400)!,passkey.algorithm);
   const sig=passkey.algorithm===-7?derToRaw(signature):signature;
   valid=!!sig&&await crypto.subtle.verify(passkey.algorithm===-7?{name:'ECDSA',hash:'SHA-256'}:{name:'RSASSA-PKCS1-v1_5'},key,sig as BufferSource,signed as BufferSource);
  }catch{valid=false;}
  if(!valid)return refused();
  // A counter that went back means a copied passkey.
  const count=signCount(authData);
  if((count!==0||passkey.signCount!==0)&&count<=passkey.signCount)return json(401,{error:'This passkey looks copied. Ask to use this browser again.'});
  passkey.signCount=count;passkey.usedAt=now();deps.save(state);
  sweep();
  if(sessions.size>=WORLD_ADDRESS_LIMITS.sessions){const oldest=[...sessions.entries()].sort((a,b)=>a[1].expiresAt-b[1].expiresAt)[0];if(oldest)sessions.delete(oldest[0]);}
  const token=b64url(random(32));
  sessions.set(await tokenHash(token),{passkey:passkey.id,...passkey.visitor?{visitor:passkey.visitor}:{},expiresAt:now()+WORLD_ADDRESS_LIMITS.sessionSeconds*1000});
  if(passkey.visitor){
   const visitor=state.visitors.find(v=>v.id===passkey.visitor)!;
   return json(200,{session:token,who:{kind:'visitor',name:visitor.name},shares:state.shares.filter(s=>visitor.shares.includes(s.id)).map(s=>({id:s.id,title:s.title}))});
  }
  const world=await deps.worldLink().catch(()=>null);
  return json(200,{session:token,who:{kind:'owner',name:passkey.label},shares:state.shares.map(s=>({id:s.id,title:s.title})),...world?{world}:{}});
 }

 async function view(request:RemoteMcpRequest){
  const id=new URLSearchParams(request.query).get('share')??'',state=load(),share=state.shares.find(s=>s.id===id);
  if(!share)return json(404,{error:'Nothing is shared at this link any more.'});
  const signedIn=await session(request.headers.authorization);
  const visitor=signedIn?.visitor?state.visitors.find(v=>v.id===signedIn.visitor):undefined;
  const allowed=share.open||signedIn&&!signedIn.visitor||visitor?.shares.includes(share.id);
  if(!allowed)return json(signedIn?403:401,{error:'Sign in to see this.'});
  if(visitor){visitor.audit=[...visitor.audit,{at:now(),share:share.id}].slice(-WORLD_ADDRESS_LIMITS.audit);deps.save(state);}
  let board:unknown;
  try{board=await deps.board(share.tab);}catch{return json(503,{error:'This board cannot be read right now. Try again later.'});}
  if(!board||typeof board!=='object'||!('view' in board))return json(503,{error:'This board cannot be read right now. Try again later.'});
  return json(200,{title:share.title,kind:share.kind,board:(board as {view:unknown}).view});
 }

 return {
  async handle(request){
   try{
    const state=load();
    // Only the address this World holds now: a request for a name it gave up is no one's here.
    if(!state.name||request.base!==deps.origin(state.name))return json(404,{error:NOT_HERE});
    const origin=deps.origin(state.name),path=request.path.replace(/\/+$/,'')||'/',get=request.method==='GET',post=request.method==='POST';
    if(path==='/hello'&&get)return json(200,{v:1,name:state.name});
    if(path==='/share'&&get){
     const share=state.shares.find(s=>s.id===new URLSearchParams(request.query).get('id'));
     return share?json(200,{id:share.id,title:share.title,kind:share.kind,open:share.open}):json(404,{error:'Nothing is shared at this link any more.'});
    }
    if(path==='/passkey/options'&&post)return await options(request,origin);
    if(path==='/access'&&post)return await access(request,origin);
    if(path==='/access/wait'&&get)return await wait(request);
    if(path==='/signin'&&post)return await signin(request,origin);
    if(path==='/view'&&get)return await view(request);
    if(path==='/signout'&&post){
     const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization??'')?.[1];
     if(token)sessions.delete(await tokenHash(token));
     return json(200,{ok:true});
    }
    return json(404,{error:'Not found'});
   }catch{return json(500,{error:'This World could not answer. Try again.'});}
  },
  decide,
  requests(){sweep();return [...pending.values()].map(entry=>entry.request);},
  signOut(id){
   const state=load(),visitor=state.visitors.find(v=>v.id===id);
   for(const [hash,s] of sessions)if(s.passkey===id||s.visitor===id||visitor&&s.visitor===visitor.id)sessions.delete(hash);
  },
  reset(){
   sessions.clear();challenges.clear();
   for(const entry of pending.values())if(entry.request.status==='pending'){entry.request={...entry.request,status:'expired'};deps.show(entry.request);wake(entry);}
   pending.clear();
  },
 };
}
