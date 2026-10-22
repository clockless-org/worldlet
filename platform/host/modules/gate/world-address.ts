import {DEFAULT_PAIR_RELAY} from '../../../web/index.ts';
import {WORLD_ADDRESS_LIMITS,createWorldAddressServer,emptyWorldAddressState,isWorldAddressRequest,readWorldAddressState,remoteMcpRoom,worldAddress,worldAddressRequestItem,
 type WorldAddressRequest,type WorldAddressServer,type WorldAddressState} from '../../../../agent/gate/index.ts';
import type {VaultService} from '../../services.ts';
import type {RemoteMcpHost} from './remote-mcp.ts';
import type {ConsentLedger} from './remote-mcp.ts';
import type {Row} from '../companion/agent/types.ts';

// This World's own address on this computer (agent/gate/WORLD-ADDRESS.md): `https://<room>.worldlet.ai`, the room of
// remote access's host token (owner request 2026-10-22, "再简单点"), so there is nothing to choose, register or
// confirm, and New address under remote access gives a new one. The server answers the address's page over remote
// access's connection. Passkeys (public keys), visitors and shares are kept in the vault (`world-address`); a request
// to be let in is a card in Attention, kept with the connectors' consents in the ledger.

export const WORLD_ADDRESS_VAULT='world-address';
export type WorldAddressStatus={
 name:string|null;address?:string;
 /** The remote MCP address on this World's own address (`<address>/mcp`). */
 mcp?:string;
 /** Remote access is connected, so the address answers. */
 reachable:boolean;
 /** Remote access is on (the address needs its connection). */
 remote:boolean;
 devices:{id:string;name:string;addedAt:string;usedAt?:string}[];
 visitors:{id:string;name:string;sees:string[];seenAt?:string}[];
 shares:{id:string;title:string;open:boolean;link?:string;people:number}[];
};
export interface WorldAddressHost {
 status():Promise<WorldAddressStatus>;
 /** The remote MCP address on this World's own address; null while remote access has no token. */
 mcpAddress():string|null;
 /** Shares the board: open to anyone with the link, or only to people the person allows. */
 share(open:unknown):Promise<WorldAddressStatus>;
 unshare(id:unknown):Promise<WorldAddressStatus>;
 /** Signs a browser of the person's out (its passkey is forgotten) or removes a visitor and what they could see. */
 remove(id:unknown):Promise<WorldAddressStatus>;
 /** The person's Allow or Deny on a request's card. */
 decide(id:unknown,allow:boolean):Row;
 owns(id:unknown):boolean;
}

export function createWorldAddressHost({vault,remote,ledger,changed,worldLink,renewWorldLink,board,relay=DEFAULT_PAIR_RELAY,now=()=>Date.now()}:{
 vault:VaultService;remote:RemoteMcpHost;ledger:()=>ConsentLedger|null;changed:()=>void;
 /** This World's link for another device (PhoneService.worldRoomLink): its address. */
 worldLink:()=>Promise<string|null>;
 /** A new one, which closes the pages the old one opened. */
 renewWorldLink:()=>Promise<void>;
 board:(tab?:string)=>Promise<unknown>;
 relay?:string;now?:()=>number;
}):WorldAddressHost {
 const site=relay.replace(/\/+$/,'');
 const origin=(name:string)=>worldAddress(name,site);
 const load=():WorldAddressState=>{try{const raw=vault.get(WORLD_ADDRESS_VAULT);return raw?readWorldAddressState(JSON.parse(raw)):emptyWorldAddressState();}catch{return emptyWorldAddressState();}};
 const save=(state:WorldAddressState)=>vault.set(WORLD_ADDRESS_VAULT,JSON.stringify(state));
 let answering:'user'|'agent'='agent';
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
 // The address is the room of remote access's host token: kept in the vault so the server answers only for it, and
 // moved, with every sign-in started over (passkeys belong to the old address), when the token changes.
 let room:string|null=null;
 async function sync(){
  const token=remote.hostToken();
  room=token?await remoteMcpRoom(token):null;
  const state=load();
  if(room&&state.name!==room){
   const moved=state.name!==null;
   save({...emptyWorldAddressState(),name:room,shares:state.shares});
   if(moved)server.reset();
   changed();
  }
 }
 const mcpAddress=()=>room?origin(room)+'/mcp':null;
 remote.serveAddress({
  handle:async request=>{await sync();return server.handle(request);},
  mcpAddress,
  async renewed(){await sync();},
 });
 void sync().catch(()=>{});
 const iso=(at?:number)=>at===undefined?undefined:new Date(at).toISOString();
 async function status():Promise<WorldAddressStatus>{
  await sync().catch(()=>{});
  const state=load(),remoteStatus=await remote.status().catch(()=>null);
  const name=room&&state.name===room?room:null,base=name?origin(name):'';
  return {
   name,...name?{address:base,mcp:base+'/mcp'}:{},
   reachable:!!name&&!!remoteStatus?.connected,remote:!!remoteStatus?.enabled,
   devices:state.passkeys.filter(p=>!p.visitor).map(p=>({id:p.id,name:p.label,addedAt:iso(p.createdAt)!,...p.usedAt?{usedAt:iso(p.usedAt)}:{}})),
   visitors:state.visitors.map(v=>({id:v.id,name:v.name,sees:state.shares.filter(s=>v.shares.includes(s.id)).map(s=>s.title),...v.audit.length?{seenAt:iso(v.audit.at(-1)!.at)}:{}})),
   shares:state.shares.map(s=>({id:s.id,title:s.title,open:s.open,...base?{link:base+'/s/'+s.id}:{},people:state.visitors.filter(v=>v.shares.includes(s.id)).length})),
  };
 }
 const fail=(message:string)=>{throw new Error(message);};
 return {
  status,mcpAddress,
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
