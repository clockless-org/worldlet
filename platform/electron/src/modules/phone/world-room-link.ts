import {DEFAULT_PAIR_RELAY,base64url,fromBase64url,newPairSecret,openJoin,pairKeys,readWorldRoomFrame,roomEntry,sealHello,worldBundlePath,worldRoomLink,worldRoomNonce,worldRoomSession,type PairKeys,type RoomSocketFactory,type WorldRoomSession} from '../../../../../agent/base/index.ts';
import type {PhoneNotifyResult,PhoneStatus} from './relay.ts';
import type {TextSocket} from './web-socket.ts';

// The full World on another device (agent/base/README.md#the-world-on-another-device, agent/base/world-room.ts): a
// `world` pairing of its own, met in the pairing room, which only forwards and stores nothing. Each browser tab in the
// room is one World page: once it answered this computer's hello, it is handed to `accept` as a socket, which the host
// treats as it treats a browser's World page on this computer (host/web-page.ts), with only what ROOM_ALLOWED lets
// through. It keeps the face of the other pairings (relay.ts: status, start, end, publish, poll) so the phone module
// runs it in the same loop; it publishes no slots, since the page asks for what it shows.
type Saved={secret:string,relay:string,name:string,paired:boolean};
export type WorldRoomLinkOptions={
 vault:{get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void},
 name:()=>string,
 /** The app's version: the link opens the World bundle of the same version. */
 version:string,
 relay?:string,
 /** A page that joined, as a socket (host/web-page.ts PageSocket). */
 accept:(socket:TextSocket)=>void,
 onChange?:(status:PhoneStatus)=>void,
 WebSocket?:RoomSocketFactory,
 now?:()=>number,
};
export const WORLD_ROOM_VAULT='world-room-pairing';
type Peer={host:string,session:WorldRoomSession|null,socket:{messages:((text:string)=>void)[],closes:(()=>void)[]}|null,queue:Promise<void>,sending:Promise<void>};

export function createWorldRoomLink(options:WorldRoomLinkOptions){
 const WS=options.WebSocket??(globalThis as unknown as {WebSocket:RoomSocketFactory}).WebSocket,now=options.now??Date.now;
 let saved:Saved|null=null,keys:PairKeys|null=null,socket:InstanceType<RoomSocketFactory>|null=null,seenAt:number|null=null,error='';
 const peers=new Map<string,Peer>();
 try{const raw=options.vault.get(WORLD_ROOM_VAULT);if(raw)saved=JSON.parse(raw);}catch{saved=null;}
 const save=()=>{if(saved)options.vault.set(WORLD_ROOM_VAULT,JSON.stringify(saved));else options.vault.delete(WORLD_ROOM_VAULT);};
 // The bundle of this app's version, so after an update the same link opens the matching page.
 const link=()=>worldRoomLink({base:saved!.relay+worldBundlePath(options.version),secret:fromBase64url(saved!.secret),name:saved!.name});
 const status=():PhoneStatus=>!saved?{state:'none'}:saved.paired?{state:'paired',link:link(),phone:null,seenAt:peers.size?now():seenAt,...(error?{error}:{})}
  :{state:'waiting',link:link(),...(error?{error}:{})};
 const changed=()=>options.onChange?.(status());
 const ensureKeys=async()=>keys??=saved?await pairKeys(fromBase64url(saved.secret)):null;
 const send=(data:string,to:string)=>{if(socket?.readyState!==1)return false;socket.send(JSON.stringify({data,to}));return true;};
 /** The page went (it left the room, or broke its session): its socket closes. */
 function drop(id:string){
  const peer=peers.get(id);if(!peer)return;
  peers.delete(id);
  const closes=peer.socket?.closes??[];peer.socket=null;peer.session=null;
  for(const listener of closes)try{listener();}catch{}
 }
 /** A page's socket over the room: what the host sends is sealed in pieces, in order. */
 function open(id:string,peer:Peer,session:WorldRoomSession):TextSocket{
  const state={messages:[] as ((text:string)=>void)[],closes:[] as (()=>void)[]};
  peer.socket=state;
  return {
   send(text){if(peer.session!==session)return;peer.sending=peer.sending.then(async()=>{if(peer.session!==session)return;for(const data of await session.seal(text))send(data,id);}).catch(()=>{});},
   close(){if(peer.session!==session)return;void peer.sending.then(()=>{if(peers.get(id)===peer&&peer.session===session)drop(id);});},
   onMessage(listener){state.messages.push(listener);},
   onClose(listener){state.closes.push(listener);},
  };
 }
 async function arrived(id:string){
  if(!await ensureKeys())return;
  drop(id);
  const peer:Peer={host:worldRoomNonce(),session:null,socket:null,queue:Promise.resolve(),sending:Promise.resolve()};
  peers.set(id,peer);
  seenAt=now();
  if(saved&&!saved.paired){saved.paired=true;save();}
  changed();
  send(await sealHello(keys!,peer.host),id);
 }
 async function fromPage(id:string,data:unknown){
  const peer=peers.get(id),frame=readWorldRoomFrame(data);
  if(!peer||!frame||!keys)return;
  seenAt=now();
  if(frame.kind==='join'){
   // One session per hello: a second join is not taken.
   if(peer.session)return;
   const page=await openJoin(keys,peer.host,frame.box);if(!page||peers.get(id)!==peer)return;
   const session=worldRoomSession(keys,peer.host,page,'desktop');
   peer.session=session;
   options.accept(open(id,peer,session));
   return;
  }
  if(frame.kind!=='piece'||!peer.session||!peer.socket)return;
  let text:string|null;
  try{text=await peer.session.open(frame.box);}catch{drop(id);return;}
  if(text!==null)for(const listener of peer.socket?.messages??[])listener(text);
 }
 async function receive(ws:InstanceType<RoomSocketFactory>,text:unknown){
  if(socket!==ws||!saved)return;
  let event:any;try{event=JSON.parse(String(text));}catch{return;}
  if(event?.t==='peer'&&typeof event.id==='string'){
   if(event.online)await arrived(event.id);
   else{drop(event.id);seenAt=now();changed();}
   return;
  }
  if(event?.t!=='msg'||typeof event.from!=='string')return;
  // One page's frames in order, each page on its own.
  const peer=peers.get(event.from);if(!peer)return;
  peer.queue=peer.queue.then(()=>fromPage(event.from,event.data)).catch(()=>{});
 }
 async function connect(){
  if(!saved||socket&&socket.readyState<=1)return;
  const k=await ensureKeys();if(!k)return;
  const {url,protocols}=await roomEntry(k,saved.relay,'desktop'),ws=new WS(url,protocols);
  socket=ws;
  ws.onopen=()=>{if(error){error='';changed();}};
  let queue=Promise.resolve();
  ws.onmessage=event=>{queue=queue.then(()=>receive(ws,event.data)).catch(()=>{});};
  ws.onclose=()=>{if(socket!==ws)return;socket=null;const had=peers.size>0;for(const id of [...peers.keys()])drop(id);if(had){seenAt=now();changed();}};
  ws.onerror=()=>{if(socket===ws&&!error){error='Could not reach the pairing room.';changed();}};
 }
 async function end(){
  if(!saved)return status();
  for(const id of [...peers.keys()])drop(id);
  const ws=socket;socket=null;try{ws?.close(1000);}catch{}
  saved=null;keys=null;seenAt=null;save();changed();
  return status();
 }
 async function start(){
  await end();
  const relay=options.relay||DEFAULT_PAIR_RELAY;
  saved={secret:base64url(newPairSecret()),relay,name:options.name(),paired:false};
  keys=null;error='';save();
  await connect();changed();
  return status();
 }
 /** The link there is, or a new one: an existing link is kept, so a page that opened it stays paired. Callers at the
  * same moment get the same new link. */
 let starting:Promise<PhoneStatus>|null=null;
 async function ensure(){return saved?status():await (starting??=start().finally(()=>{starting=null;}));}
 /** Keeps the room open. Pages ask for what they show, so nothing is waited for. */
 async function poll(){
  if(!saved)return false;
  try{await connect();}catch(e){error=(e as Error).message;}
  return false;
 }
 const publish=async()=>false;
 const notify=async():Promise<PhoneNotifyResult>=>({sent:false,reason:'no-device'});
 return {status,start,ensure,end,publish,notify,poll,get paired(){return !!saved?.paired;},get pairing(){return !!saved;},get open(){return peers.size>0;}};
}
export type WorldRoomLink=ReturnType<typeof createWorldRoomLink>;
