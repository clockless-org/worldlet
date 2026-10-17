import {DEFAULT_PAIR_RELAY} from '../../../../../core/phone/index.ts';
import {MCP_FRONT_ORIGIN,REMOTE_MCP_LIMITS,agentRevoked,createRemoteMcpServer,emptyRemoteMcpState,newRemoteMcpToken,readRemoteMcpRequest,readRemoteMcpState,remoteConsentItem,
 remoteMcpAddress,remoteMcpAgent,remoteMcpHostEntry,remoteMcpResponseFrame,remoteMcpRoom,type RemoteMcpConsent,type RemoteMcpResponse,type RemoteMcpServer,type RemoteMcpState} from '../../../../../core/agent/index.ts';
import type {AgentAccess,VaultService} from '../../host/services.ts';
import {toolText,worldToolList,type StandingWorldTools} from './world-tool-bridge.ts';
import type {Row} from './types.ts';

// Remote MCP on this computer (core/agent/REMOTE-MCP.md): while the person has it on, one WebSocket to the front
// (`<relay>/api/mcp-host/<room>`) carries each HTTP request a cloud MCP client makes at `mcp.worldlet.ai/<room>`, and
// core's server answers it here. The host token, the registered clients and the hashes of each connection's tokens are
// kept only in the vault (`remote-mcp`); the tokens themselves only ever go to the client that asked. A connection the
// person allows becomes an Agent of its own (`remote`), whose calls go through the standing server's call
// (world-tool-bridge.ts) with its own Grants and audit. Its consent card is the host's own Attention item.

export const REMOTE_MCP_VAULT='remote-mcp';
type Saved={enabled:boolean;token:string;state:RemoteMcpState};
/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type ConsentLedger={remoteConsents():Row[];saveRemoteConsent(consent:Row,item:Row,origin:'user'|'agent'):void};
type Socket={readyState:number;send(data:string):void;close(code?:number,reason?:string):void;
 onopen:((event:unknown)=>void)|null;onmessage:((event:{data:unknown})=>void)|null;onclose:((event:{code?:number})=>void)|null;onerror:((event:unknown)=>void)|null};
export type RemoteMcpSocketFactory=new (url:string,protocols:string[])=>Socket;
export type RemoteMcpStatus={enabled:boolean;connected:boolean;address?:string;connectors:{id:string;name:string;token?:true}[]};
export interface RemoteMcpHost {
 status():Promise<RemoteMcpStatus>;
 /** Turns remote access on (a new address the first time) and connects. */
 enable():Promise<RemoteMcpStatus>;
 /** Turns it off: the address stops answering; the address and connections are kept for turning it on again. */
 disable():Promise<RemoteMcpStatus>;
 /** A new address: every connection and registration ends, and connectors must be added again. */
 renew():Promise<RemoteMcpStatus>;
 /** A token for an Agent that cannot open a browser (a script, a daemon on another computer): a new remote Agent named
  * `name`, or a new token for the remote Agent `id` (its old one stops working). Shown once; only its hash is kept. */
 token(name:unknown,id?:unknown):Promise<Row>;
 /** The person's Allow or Deny on a consent card. */
 decide(id:unknown,allow:boolean):Row;
 close():void;
}
const PING_MS=30_000,MAX_BACKOFF_MS=60_000;

export function createRemoteMcpHost({vault,access,tools,ledger,changed,relay=DEFAULT_PAIR_RELAY,front,WebSocket,now=()=>Date.now(),onByDefault=false}:
 {vault:VaultService;access:AgentAccess;tools:()=>Promise<StandingWorldTools>|null;ledger:()=>ConsentLedger|null;changed:()=>void;relay?:string;front?:string;WebSocket?:RemoteMcpSocketFactory;now?:()=>number;onByDefault?:boolean}):RemoteMcpHost {
 const WS=WebSocket??(globalThis as unknown as {WebSocket:RemoteMcpSocketFactory}).WebSocket;
 // Off worldlet.ai (a development relay), the same Worker serves the front at `<relay>/mcp/<room>`.
 const frontOrigin=front??(relay.replace(/\/+$/,'')===DEFAULT_PAIR_RELAY?MCP_FRONT_ORIGIN:relay.replace(/\/+$/,'')+'/mcp');
 const read=():Saved|null=>{
  try{const raw=vault.get(REMOTE_MCP_VAULT);if(!raw)return null;const v=JSON.parse(raw);
   return typeof v?.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v.token)?{enabled:v.enabled===true,token:v.token,state:readRemoteMcpState(v.state)}:null;}catch{return null;}
 };
 const write=(saved:Saved)=>vault.set(REMOTE_MCP_VAULT,JSON.stringify(saved));
 const active=(agentId:string)=>{const identity=access.identity(agentId);return !!identity&&!agentRevoked(identity,new Date(now()).toISOString());};
 function show(consent:RemoteMcpConsent,origin:'user'|'agent'='agent'){
  const db=ledger();if(!db)return false;
  try{db.saveRemoteConsent(consent as unknown as Row,remoteConsentItem(consent) as unknown as Row,origin);changed();return true;}catch{return false;}
 }
 // A consent still waiting from an earlier run can no longer be answered: its page and its code are gone.
 try{const db=ledger();for(const row of db?.remoteConsents()??[])if(row.status==='pending')show({...row,status:'expired'} as unknown as RemoteMcpConsent);}catch{}
 let answering:'user'|'agent'='agent';
 const server:RemoteMcpServer=createRemoteMcpServer({
  load:()=>read()?.state??emptyRemoteMcpState(),
  save:state=>{const saved=read();if(saved)write({...saved,state});},
  show:consent=>show(consent,answering),
  connect:consent=>{try{const agent=remoteMcpAgent(consent.client);access.ensure(agent);return agent.id;}catch{return null;}},
  active,
  tools:()=>worldToolList(),
  call:async(agentId,name,args)=>{
   const identity=access.identity(agentId),standing=tools();
   if(!identity||!standing)return {text:JSON.stringify({error:'Worldlet is still starting. Try again in a moment.'}),isError:true};
   return toolText(await (await standing).call(identity,{name,arguments:args}));
  },
  now,
 });
 access.onRevoke(agentId=>server.forget(agentId));

 let socket:Socket|null=null,connected=false,timer:ReturnType<typeof setTimeout>|null=null,ping:ReturnType<typeof setInterval>|null=null,backoff=1000,closed=false;
 const send=(ws:Socket,id:string,response:RemoteMcpResponse)=>{
  const fitted=response.body.length>REMOTE_MCP_LIMITS.body?{status:502,headers:{'content-type':'application/json'},body:JSON.stringify({error:'The answer was too large to send.'})}:response;
  if(socket===ws&&ws.readyState===1)try{ws.send(remoteMcpResponseFrame(id,fitted));}catch{}
 };
 async function connect(){
  const saved=read();
  if(closed||!saved?.enabled||socket)return;
  const {url,protocols}=await remoteMcpHostEntry(saved.token,relay);
  if(closed||socket)return;
  const ws=new WS(url,protocols);socket=ws;
  ws.onopen=()=>{
   if(socket!==ws)return;
   backoff=1000;connected=true;changed();
   ping=setInterval(()=>{try{if(ws.readyState===1)ws.send('{"t":"ping"}');}catch{}},PING_MS);
  };
  ws.onmessage=event=>{
   const request=readRemoteMcpRequest(event.data);if(!request)return;
   void server.handle(request).then(response=>send(ws,request.id,response));
  };
  ws.onclose=event=>{
   if(socket!==ws)return;
   socket=null;connected=false;if(ping){clearInterval(ping);ping=null;}changed();
   // Another computer took the same address (4000): it is left to it for a while.
   if(event?.code===4000)backoff=MAX_BACKOFF_MS;
   schedule();
  };
  ws.onerror=()=>{};
 }
 function schedule(){
  if(closed||timer||!read()?.enabled)return;
  timer=setTimeout(()=>{timer=null;void connect().catch(()=>schedule());},backoff);
  backoff=Math.min(backoff*2,MAX_BACKOFF_MS);
 }
 function hangUp(){
  if(timer){clearTimeout(timer);timer=null;}
  const ws=socket;socket=null;connected=false;if(ping){clearInterval(ping);ping=null;}
  try{ws?.close(1000);}catch{}
 }
 async function status():Promise<RemoteMcpStatus>{
  const saved=read();
  if(!saved)return {enabled:false,connected:false,connectors:[]};
  const seen=new Set<string>(),connectors:RemoteMcpStatus['connectors']=[];
  for(const c of saved.state.connections)if(!seen.has(c.agentId)&&active(c.agentId)){seen.add(c.agentId);connectors.push({id:c.agentId,name:access.identity(c.agentId)?.name??c.agentId});}
  for(const t of saved.state.tokens)if(!seen.has(t.agentId)&&active(t.agentId)){seen.add(t.agentId);connectors.push({id:t.agentId,name:access.identity(t.agentId)?.name??t.agentId,token:true});}
  return {enabled:saved.enabled,connected:saved.enabled&&connected,address:remoteMcpAddress(await remoteMcpRoom(saved.token),frontOrigin),connectors};
 }
 // On by default (owner decision 2026-10-17) in the library the installed app opens: its first run makes the address
 // and opens the room. Nothing gets in without a connection the person allows on a card or a token they make, and
 // Turn off is kept across restarts. Development builds, checks and other libraries stay off until turned on.
 try{if(onByDefault&&!vault.get(REMOTE_MCP_VAULT))write({enabled:true,token:newRemoteMcpToken(),state:emptyRemoteMcpState()});}catch{}
 if(read()?.enabled)void connect().catch(()=>schedule());
 return {
  status,
  async enable(){
   const saved=read();
   write(saved?{...saved,enabled:true}:{enabled:true,token:newRemoteMcpToken(),state:emptyRemoteMcpState()});
   backoff=1000;await connect().catch(()=>schedule());changed();
   return status();
  },
  async disable(){
   const saved=read();if(saved)write({...saved,enabled:false});
   hangUp();changed();
   return status();
  },
  async renew(){
   const saved=read();
   server.reset();
   write({enabled:saved?.enabled??false,token:newRemoteMcpToken(),state:emptyRemoteMcpState()});
   hangUp();backoff=1000;await connect().catch(()=>schedule());changed();
   return status();
  },
  async token(name,id){
   const saved=read();
   if(!saved?.enabled)return {ok:false,error:'Turn on remote access first.'};
   let agentId:string;
   if(id!==undefined){
    const identity=typeof id==='string'?access.identity(id):null;
    if(!identity||identity.kind!=='remote'||!active(identity.id))return {ok:false,error:'That Agent is not a remote Agent here.'};
    agentId=identity.id;
   }else{
    const label=typeof name==='string'?name.replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';
    if(!label||[...label].length>40)return {ok:false,error:'Name the Agent this token is for, in up to 40 characters.'};
    const agent={...remoteMcpAgent(label),harness:'token'};access.ensure(agent);agentId=agent.id;
   }
   const token=await server.mint(agentId);changed();
   return {ok:true,token,address:(await status()).address,agent:{id:agentId,name:access.identity(agentId)?.name??agentId}};
  },
  decide(id,allow){
   if(typeof id!=='string'||!id)return {ok:false,error:'That request is not known here.'};
   answering='user';
   try{
    if(!server.decide(id,allow))return {ok:false,error:'This request is no longer waiting. Start connecting again from the connector.'};
    return {ok:true,status:server.consents().find(consent=>consent.id===id)?.status??(allow?'allowed':'denied')};
   }
   finally{answering='agent';}
  },
  close(){closed=true;hangUp();},
 };
}
