import {boxPlace,openBox,pairKeys,readWebPairLink,sealBox,sha256Hex,type PairKeys} from './pairing.ts';
import type {WebClientOptions,WebMessage,WebView} from './web-client.ts';
import {WebPairingEnded} from './web-client.ts';
import {RTC_ANSWER_PLACE,RTC_CHANNEL,RTC_ICE_SERVERS,RTC_OFFER_PLACE,channelJoiner,channelPieces,gathered} from './rtc.ts';

// The pairing room (README.md#web; worker/room.ts in the operations repository, owner decision 2026-10-13: "我们不要存，
// 用户应该从他安装worldlet的设备直接serve"). The computer and a browser on another device meet in a room on the relay that
// only passes what one sends to the other while both are connected, in memory: no slot, no queue, no token is stored.
// The computer is the only source: when a browser joins, it sends that browser everything it has.
// A side opens the room with its own token and the other side's token hash; the room's name is the hash of both hashes
// (desktop first), so the relay keeps no record of pairings. Inside the room's `data` the two sides exchange frames,
// every one sealed as on the relay: `{s:<slot>,b:<box>}` (a slot, `slot:<name>`), `{m:<box>}` (a message to the computer,
// `to:desktop`), `{e:<box>}` (the pairing ended, `slot:end`) and `{r:<box>}` (a direct line's offer or answer, rtc.ts).
export const ROOM_PROTOCOL='worldlet-room.v1';
/** A browser link that meets the computer in the room carries `m=room` (older links use the relay's slots). */
export const ROOM_LINK_MODE='room';
export type RoomFrame={s:string,b:string}|{m:string}|{e:string}|{r:string};
type Socket={readyState:number,send(data:string):void,close(code?:number,reason?:string):void,
 onopen:((event:unknown)=>void)|null,onmessage:((event:{data:unknown})=>void)|null,onclose:((event:unknown)=>void)|null,onerror:((event:unknown)=>void)|null};
export type RoomSocketFactory=new (url:string,protocols:string[])=>Socket;

/** The room's address on `relay` and the WebSocket subprotocols `side` opens it with. */
export async function roomEntry(keys:PairKeys,relay:string,side:'desktop'|'phone'){
 const desktop=await sha256Hex(keys.desktopToken),phone=await sha256Hex(keys.phoneToken);
 const name=await sha256Hex(desktop+':'+phone);
 return {url:relay.replace(/^http/,'ws')+'/api/room/'+name,
  protocols:[ROOM_PROTOCOL,side==='desktop'?`desktop.${keys.desktopToken}.${phone}`:`phone.${keys.phoneToken}.${desktop}`]};
}
/** A frame read from the room's `data`, or null. */
export function readRoomFrame(data:unknown):RoomFrame|null{
 if(typeof data!=='string')return null;
 let value:any;try{value=JSON.parse(data);}catch{return null;}
 if(typeof value?.s==='string'&&typeof value.b==='string')return {s:value.s,b:value.b};
 if(typeof value?.m==='string')return {m:value.m};
 if(typeof value?.e==='string')return {e:value.e};
 if(typeof value?.r==='string')return {r:value.r};
 return null;
}
/** Whether a browser link meets the computer in the room. */
export const isRoomLink=(link:string)=>new URLSearchParams(link.slice(link.indexOf('#')+1)).get('m')===ROOM_LINK_MODE;
/** What the Agent's `world/link` answers (agent/gate controls.ts `share_world_link`): the room link for another device's
 * browser, from the pairing's status, and what to do with it. Anyone who has the link can see and act in the World, so
 * the Agent is told to send it to the person alone. */
export function worldLinkReply(status:{state?:unknown,link?:unknown},local=''):{ok:true,link:string,opened:boolean,message:string,localLink?:string}|{error:string}{
 const link=typeof status?.link==='string'&&isRoomLink(status.link)?status.link:'';
 if(!link)return {error:'Worldlet could not make the browser link. Ask the person to use Copy link on the Mobile page in Worldlet.'};
 const here=isLocalWorldLink(local)?local:'';
 return {ok:true,link,opened:status.state==='paired',message:'Send the person this link, to them alone, with one line: it opens their World in any web browser, on any device, while this computer is on and Worldlet is running: the full World where the device can draw it, the Attention Center and Fox on a phone or a weaker device. Anyone who has it can see and act in their World, so never post it where others can read it. They can turn it off on the Mobile page in Worldlet.'+
  (here?' localLink opens the full 3D World in a browser on this computer only (it does not work from another device); give it instead when they are at this computer.':''),...here?{localLink:here}:{}};
}
/** The full World's link on this computer (contracts/web-world.ts worldLink): 127.0.0.1 or localhost, /world/, a token. */
export const isLocalWorldLink=(link:string)=>/^http:\/\/(127\.0\.0\.1|localhost):\d+\/world\/#t=[A-Za-z0-9_-]{43}$/.test(link);

const SLOTS=['attention','conversation','live','desktop'] as const;
const OFFLINE='Your computer is not reachable.';
type Channel={readyState:string,send(data:string):void,close():void,onopen:((event:unknown)=>void)|null,onmessage:((event:{data:unknown})=>void)|null,onclose:((event:unknown)=>void)|null};
type Connection={iceGatheringState:string,connectionState:string,signalingState:string,localDescription:{sdp:string}|null,
 createDataChannel(label:string,options?:object):Channel,createOffer():Promise<{type:string,sdp?:string}>,setLocalDescription(description:{type:string,sdp?:string}):Promise<void>,
 setRemoteDescription(description:{type:string,sdp:string}):Promise<void>,close():void,onconnectionstatechange:((event:unknown)=>void)|null,
 addEventListener(type:string,listener:()=>void):void,removeEventListener(type:string,listener:()=>void):void};
export type PeerConnectionFactory=new (config:{iceServers:{urls:string}[]})=>Connection;
/** A browser's side of the room: the same `poll`, `send` and `end` as createWebClient, so the page uses either. `poll`
 * returns what the computer has sent once something new arrives or `wait` seconds pass; it throws while the computer is
 * not in the room, and WebPairingEnded once the computer ended the pairing. Where the browser has WebRTC, it also offers
 * the computer a direct line (rtc.ts) and uses it while it is open. */
export function createRoomWebClient(options:Omit<WebClientOptions,'fetch'>&{WebSocket?:RoomSocketFactory,RTCPeerConnection?:PeerConnectionFactory|null}){
 const link=readWebPairLink(options.link),relay=link.relay||options.relay;
 const WS=options.WebSocket??(globalThis as unknown as {WebSocket:RoomSocketFactory}).WebSocket;
 const PC=options.RTCPeerConnection===undefined?(globalThis as unknown as {RTCPeerConnection?:PeerConnectionFactory}).RTCPeerConnection:options.RTCPeerConnection;
 let keys:PairKeys|null=null,socket:Socket|null=null,computer=false,heard=false,ended=false,fresh=false;
 let connection:Connection|null=null,channel:Channel|null=null,offered=0;
 const view:WebView={},waiters=new Set<()=>void>();
 const wake=()=>{fresh=true;for(const resolve of [...waiters])resolve();};
 const wait=(seconds:number)=>new Promise<void>(resolve=>{const timer=setTimeout(done,seconds*1000);function done(){clearTimeout(timer);waiters.delete(done);resolve();}waiters.add(done);});
 const frame=async(value:RoomFrame)=>{
  const text=JSON.stringify(value);
  if(channel?.readyState==='open'){for(const piece of channelPieces(text))channel.send(piece);return;}
  if(socket?.readyState===1)socket.send(JSON.stringify({data:text}));
 };
 const introduce=async()=>frame({s:'phone',b:await sealBox(keys!,boxPlace('slot','phone'),{name:options.name.slice(0,60),version:options.version.slice(0,40)})});
 function hangUp(){const c=connection;connection=null;channel=null;try{c?.close();}catch{}}
 /** Offers the computer a direct line; what it cannot reach stays on the room. */
 async function offer(){
  if(!PC||connection||!keys)return;
  offered=Date.now();
  let c:Connection;try{c=new PC({iceServers:RTC_ICE_SERVERS});}catch{return;}
  connection=c;
  const dc=c.createDataChannel(RTC_CHANNEL,{ordered:true}),join=channelJoiner();
  dc.onopen=()=>{if(connection===c)channel=dc;};
  dc.onmessage=event=>{const text=join(event.data);if(text!==null&&connection===c)queue=queue.then(()=>fromComputer(text,true));};
  dc.onclose=()=>{if(connection===c)hangUp();};
  c.onconnectionstatechange=()=>{if(connection===c&&(c.connectionState==='failed'||c.connectionState==='closed'))hangUp();};
  try{
   await c.setLocalDescription(await c.createOffer());
   await gathered(c);
   if(connection!==c||!c.localDescription)return;
   await frame({r:await sealBox(keys,RTC_OFFER_PLACE,{offer:c.localDescription.sdp})});
  }catch{if(connection===c)hangUp();}
 }
 let queue=Promise.resolve();
 async function fromComputer(data:unknown,direct=false){
  const value=readRoomFrame(data);if(!value)return;
  try{
   // While the line is open, slots come over it: one the room still carried may be older.
   if('s' in value&&(SLOTS as readonly string[]).includes(value.s)){if(!direct&&channel)return;(view as any)[value.s]=await openBox(keys!,boxPlace('slot',value.s),value.b);wake();}
   else if('e' in value){await openBox(keys!,boxPlace('slot','end'),value.e);ended=true;hangUp();socket?.close(1000);wake();}
   else if('r' in value&&connection){
    // The computer's answer, or word that its side of the line is gone (the room's slots count again).
    const answer:any=await openBox(keys!,RTC_ANSWER_PLACE,value.r);
    if(answer?.hangup===true)hangUp();
    else if(typeof answer?.answer==='string'&&connection.signalingState==='have-local-offer')await connection.setRemoteDescription({type:'answer',sdp:answer.answer});
   }
  }catch{/* Not sealed with this pairing's key, or an answer that does not fit: dropped. */}
 }
 async function receive(text:unknown){
  let message:any;try{message=JSON.parse(String(text));}catch{return;}
  if(message?.t==='desktop'){computer=!!message.online;heard=true;if(computer){await introduce();void offer();}else hangUp();wake();return;}
  if(message?.t!=='msg'||message.from!=='desktop')return;
  await fromComputer(message.data);
 }
 async function connect(){
  if(socket&&socket.readyState<=1)return;
  keys??=await pairKeys(link.secret);
  const {url,protocols}=await roomEntry(keys,relay,'phone'),ws=new WS(url,protocols);
  socket=ws;heard=false;
  // One at a time, in order: an end that is still being opened is not overtaken by the computer leaving.
  ws.onmessage=event=>{queue=queue.then(()=>receive(event.data));};
  ws.onclose=()=>{if(socket!==ws)return;socket=null;computer=false;heard=true;hangUp();wake();};
  ws.onerror=()=>{};
 }
 async function poll(seconds=0):Promise<WebView>{
  if(ended)throw new WebPairingEnded('This link is off. Open Worldlet on your computer and make a new one.');
  await connect();
  // Until the room says whether the computer is there, a first poll waits for it.
  for(let i=0;i<50&&!heard;i++)await wait(0.1);
  // A line that closed is offered again now and then.
  if(computer&&!connection&&Date.now()-offered>30_000)void offer();
  if(computer&&seconds&&!fresh)await wait(seconds);
  fresh=false;
  if(ended)throw new WebPairingEnded('This link is off. Open Worldlet on your computer and make a new one.');
  if(!computer)throw new Error(OFFLINE);
  return {...view};
 }
 async function send(message:WebMessage){
  await connect();
  if(!computer||!keys)throw new Error(OFFLINE);
  await frame({m:await sealBox(keys,boxPlace('to','desktop'),{...message,at:new Date().toISOString()})});
 }
 /** Turns the link off for every browser, as Turn off on the computer does. */
 async function end(){
  if(keys&&computer){
   // Through the room as well: closing the line at once may drop what it still had to send.
   const off:RoomFrame={e:await sealBox(keys,boxPlace('slot','end'),{end:true})};
   await frame(off);if(channel&&socket?.readyState===1)socket.send(JSON.stringify({data:JSON.stringify(off)}));
  }
  ended=true;hangUp();socket?.close(1000);
 }
 return {poll,send,end,get computer(){return view.desktop?.name||link.name;},get view(){return {...view};},
  /** Whether the direct line is open. */
  get direct(){return !!channel;}};
}
