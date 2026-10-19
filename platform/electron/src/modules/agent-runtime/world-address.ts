import {DEFAULT_PAIR_RELAY} from '../../../../../core/phone/index.ts';
import {WORLD_ADDRESS_LIMITS,addressNameFrom,createWorldAddressServer,emptyWorldAddressState,isWorldAddressRequest,readWorldAddressState,worldAddress,worldAddressRequestItem,
 type WorldAddressRequest,type WorldAddressServer,type WorldAddressState} from '../../../../../agent/agent/index.ts';
import type {VaultService} from '../../host/services.ts';
import type {RemoteMcpHost} from './remote-mcp.ts';
import type {ConsentLedger} from './remote-mcp.ts';
import type {Row} from './types.ts';

// This World's own address on this computer (agent/agent/WORLD-ADDRESS.md): the name the person picked, claimed on the
// website's registry with remote access's host token, and the server that answers the address's page over remote
// access's connection. Passkeys (public keys), visitors and shares are kept in the vault (`world-address`); a request
// to be let in is a card in Attention, kept with the connectors' consents in the ledger.

export const WORLD_ADDRESS_VAULT='world-address';
export type WorldAddressStatus={
 name:string|null;address?:string;
 /** The website knows the name as this World's, and remote access is connected. */
 reachable:boolean;
 /** Remote access is on (the address needs its connection). */
 remote:boolean;
 devices:{id:string;name:string;addedAt:string;usedAt?:string}[];
 visitors:{id:string;name:string;sees:string[];seenAt?:string}[];
 shares:{id:string;title:string;open:boolean;link?:string;people:number}[];
 error?:string;
};
export interface WorldAddressHost {
 status():Promise<WorldAddressStatus>;
 /** Whether a name could be this World's: `{name,valid,available}`. */
 check(name:unknown):Promise<Row>;
 /** Picks the name (or renames): claimed on the website with the host token, first come, first served. */
 claim(name:unknown):Promise<WorldAddressStatus>;
 /** Gives the name up: the address stops answering and every browser and visitor must sign in again. */
 release():Promise<WorldAddressStatus>;
 /** Shares the board: open to anyone with the link, or only to people the person allows. */
 share(open:unknown):Promise<WorldAddressStatus>;
 unshare(id:unknown):Promise<WorldAddressStatus>;
 /** Signs a browser of the person's out (its passkey is forgotten) or removes a visitor and what they could see. */
 remove(id:unknown):Promise<WorldAddressStatus>;
 /** The person's Allow or Deny on a request's card. */
 decide(id:unknown,allow:boolean):Row;
 owns(id:unknown):boolean;
}

export function createWorldAddressHost({vault,remote,ledger,changed,worldLink,renewWorldLink,board,relay=DEFAULT_PAIR_RELAY,fetch:request=globalThis.fetch,now=()=>Date.now()}:{
 vault:VaultService;remote:RemoteMcpHost;ledger:()=>ConsentLedger|null;changed:()=>void;
 /** This World's link for another device (PhoneService.worldRoomLink): its address. */
 worldLink:()=>Promise<string|null>;
 /** A new one, which closes the pages the old one opened. */
 renewWorldLink:()=>Promise<void>;
 board:(tab?:string)=>Promise<unknown>;
 relay?:string;fetch?:typeof globalThis.fetch;now?:()=>number;
}):WorldAddressHost {
 const site=relay.replace(/\/+$/,'');
 const origin=(name:string)=>worldAddress(name,site);
 const load=():WorldAddressState=>{try{const raw=vault.get(WORLD_ADDRESS_VAULT);return raw?readWorldAddressState(JSON.parse(raw)):emptyWorldAddressState();}catch{return emptyWorldAddressState();}};
 const save=(state:WorldAddressState)=>vault.set(WORLD_ADDRESS_VAULT,JSON.stringify(state));
 let answering:'user'|'agent'='agent',confirmed:string|null=null,lastError='';
 function show(request:WorldAddressRequest){
  const db=ledger(),name=load().name;if(!db||!name)return false;
  try{db.saveRemoteConsent(request as unknown as Row,worldAddressRequestItem(request,origin(name)) as unknown as Row,answering);changed();return true;}catch{return false;}
 }
 // A request still waiting from an earlier run can no longer be answered: its page and passkey are gone.
 try{const db=ledger(),name=load().name;for(const row of db?.remoteConsents()??[])if(row.status==='pending'&&isWorldAddressRequest(row.id)&&name)show({...row,status:'expired'} as unknown as WorldAddressRequest);}catch{}
 const server:WorldAddressServer=createWorldAddressServer({
  load,save,show,origin,board,now,
  worldLink:async()=>{
   const link=await worldLink();if(!link)return null;
   const url=new URL(link);
   return /^\/world\/[^/]+\/$/.test(url.pathname)&&url.hash.length>1?{path:url.pathname,fragment:url.hash.slice(1)}:null;
  },
 });
 // The registry, with the host token: `PUT`, `DELETE`, or a name's availability.
 async function registry(method:'PUT'|'DELETE',token:string,name?:string){
  const response=await request(site+'/api/address/names',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...name?{body:JSON.stringify({name})}:{}});
  let value:any={};try{value=await response.json();}catch{}
  return {status:response.status,value};
 }
 /** Confirms the name with the website now and then, so it is not given up as unused. */
 async function confirm(){
  const state=load(),token=remote.hostToken();
  if(!state.name||!token)return;
  try{
   const {status,value}=await registry('PUT',token,state.name);
   if(status===200||status===201){confirmed=state.name;lastError='';}
   else if(status===409){confirmed=null;lastError='Another World took this name while this one was away. Choose a new one.';}
   else lastError=typeof value?.error==='string'?value.error:'';
  }catch{lastError='This computer cannot reach worldlet.ai right now.';}
  changed();
 }
 remote.serveAddress({
  handle:request=>server.handle(request),
  async renewed(previous,next){
   const name=load().name;if(!name)return;
   await registry('DELETE',previous).catch(()=>null);
   const {status}=await registry('PUT',next,name);
   confirmed=status===200||status===201?name:null;
  },
 });
 void confirm();
 const daily=setInterval(()=>void confirm(),24*3600_000);
 (daily as {unref?:()=>void}).unref?.();
 const iso=(at?:number)=>at===undefined?undefined:new Date(at).toISOString();
 async function status():Promise<WorldAddressStatus>{
  const state=load(),remoteStatus=await remote.status().catch(()=>null);
  const base=state.name?origin(state.name):'';
  return {
   name:state.name,...state.name?{address:base}:{},
   reachable:!!state.name&&confirmed===state.name&&!!remoteStatus?.connected,remote:!!remoteStatus?.enabled,
   devices:state.passkeys.filter(p=>!p.visitor).map(p=>({id:p.id,name:p.label,addedAt:iso(p.createdAt)!,...p.usedAt?{usedAt:iso(p.usedAt)}:{}})),
   visitors:state.visitors.map(v=>({id:v.id,name:v.name,sees:state.shares.filter(s=>v.shares.includes(s.id)).map(s=>s.title),...v.audit.length?{seenAt:iso(v.audit.at(-1)!.at)}:{}})),
   shares:state.shares.map(s=>({id:s.id,title:s.title,open:s.open,...base?{link:base+'/s/'+s.id}:{},people:state.visitors.filter(v=>v.shares.includes(s.id)).length})),
   ...lastError?{error:lastError}:{},
  };
 }
 const fail=(message:string)=>{throw new Error(message);};
 return {
  status,
  async check(name){
   const wanted=typeof name==='string'?name.trim().toLowerCase():'';
   if(!addressNameFrom(wanted))return {name:wanted,valid:false,available:false};
   if(load().name===wanted)return {name:wanted,valid:true,available:true,yours:true};
   try{const response=await request(site+'/api/address/names/'+encodeURIComponent(wanted));const value=await response.json() as Row;return {name:wanted,valid:value.valid===true,available:value.available===true};}
   catch{fail('This computer cannot reach worldlet.ai right now.');}
   return {};
  },
  async claim(name){
   const wanted=addressNameFrom(name);
   if(!wanted)fail('Use 3 to 32 lowercase letters or digits, with single hyphens between them. Some names are kept for Worldlet itself.');
   // The address reaches this World over remote access's connection.
   if(!(await remote.status()).enabled)await remote.enable();
   const token=remote.hostToken();if(!token)fail('Remote access could not be turned on. Try again.');
   const {status:code,value}=await registry('PUT',token!,wanted).catch(()=>({status:0,value:{}}));
   if(code===409)fail('This name is taken. Choose another.');
   if(code!==200&&code!==201)fail(typeof value?.error==='string'?value.error:'This computer cannot reach worldlet.ai right now. Try again.');
   const state=load(),renamed=state.name!==wanted;
   state.name=wanted;save(state);confirmed=wanted;lastError='';
   // Passkeys belong to the old address's site: a new name starts the sign-ins over.
   if(renamed){server.reset();state.passkeys=[];state.visitors=[];save(state);}
   changed();
   return status();
  },
  async release(){
   const token=remote.hostToken();
   if(token)await registry('DELETE',token).catch(()=>null);
   server.reset();
   const state=load();save({...emptyWorldAddressState(),shares:state.shares});confirmed=null;lastError='';
   changed();
   return status();
  },
  async share(open){
   const state=load();
   if(state.shares.length>=WORLD_ADDRESS_LIMITS.shares)fail('You share as much as one World can. Stop sharing something first.');
   const id=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   state.shares.push({id,kind:'board',title:'Board',open:open===true,createdAt:now()});
   save(state);changed();
   return status();
  },
  async unshare(id){
   const state=load();
   if(!state.shares.some(s=>s.id===id))fail('That is not shared.');
   state.shares=state.shares.filter(s=>s.id!==id);
   for(const visitor of state.visitors)visitor.shares=visitor.shares.filter(s=>s!==id);
   // Someone who can see nothing any more is removed with their passkeys.
   const gone=state.visitors.filter(v=>!v.shares.length).map(v=>v.id);
   state.visitors=state.visitors.filter(v=>v.shares.length);state.passkeys=state.passkeys.filter(p=>!p.visitor||!gone.includes(p.visitor));
   save(state);for(const visitor of gone)server.signOut(visitor);changed();
   return status();
  },
  async remove(id){
   const state=load(),passkey=state.passkeys.find(p=>p.id===id&&!p.visitor),visitor=state.visitors.find(v=>v.id===id);
   if(!passkey&&!visitor)fail('That browser or person is not known here.');
   if(passkey)state.passkeys=state.passkeys.filter(p=>p!==passkey);
   if(visitor){state.visitors=state.visitors.filter(v=>v!==visitor);state.passkeys=state.passkeys.filter(p=>p.visitor!==visitor.id);}
   save(state);server.signOut(id as string);
   // A browser of the person's may still have the World open from the link it was handed: that link changes.
   if(passkey)await renewWorldLink().catch(()=>{});
   changed();
   return status();
  },
  decide(id,allow){
   if(!isWorldAddressRequest(id))return {ok:false,error:'That request is not known here.'};
   answering='user';
   try{
    if(!server.decide(id as string,allow))return {ok:false,error:'This request is no longer waiting. Ask again from the browser.'};
    return {ok:true,status:allow?'allowed':'denied'};
   }finally{answering='agent';}
  },
  owns:isWorldAddressRequest,
 };
}
