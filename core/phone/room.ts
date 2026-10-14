import {boxPlace,openBox,pairKeys,readWebPairLink,sealBox,sha256Hex,type PairKeys} from './pairing.ts';
import type {WebClientOptions,WebMessage,WebView} from './web-client.ts';
import {WebPairingEnded} from './web-client.ts';

// The pairing room (README.md#web; worker/room.ts in the operations repository, owner decision 2026-10-13: "我们不要存，
// 用户应该从他安装worldlet的设备直接serve"). The computer and a browser on another device meet in a room on the relay that
// only passes what one sends to the other while both are connected, in memory: no slot, no queue, no token is stored.
// The computer is the only source: when a browser joins, it sends that browser everything it has.
// A side opens the room with its own token and the other side's token hash; the room's name is the hash of both hashes
// (desktop first), so the relay keeps no record of pairings. Inside the room's `data` the two sides exchange frames,
// every one sealed as on the relay: `{s:<slot>,b:<box>}` (a slot, `slot:<name>`), `{m:<box>}` (a message to the computer,
// `to:desktop`) and `{e:<box>}` (the pairing ended, `slot:end`).
export const ROOM_PROTOCOL='worldlet-room.v1';
/** A browser link that meets the computer in the room carries `m=room` (older links use the relay's slots). */
export const ROOM_LINK_MODE='room';
export type RoomFrame={s:string,b:string}|{m:string}|{e:string};
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
 return null;
}
/** Whether a browser link meets the computer in the room. */
export const isRoomLink=(link:string)=>new URLSearchParams(link.slice(link.indexOf('#')+1)).get('m')===ROOM_LINK_MODE;

const SLOTS=['attention','conversation','live','desktop'] as const;
const OFFLINE='Your computer is not reachable.';
/** A browser's side of the room: the same `poll`, `send` and `end` as createWebClient, so the page uses either. `poll`
 * returns what the computer has sent once something new arrives or `wait` seconds pass; it throws while the computer is
 * not in the room, and WebPairingEnded once the computer ended the pairing. */
export function createRoomWebClient(options:Omit<WebClientOptions,'fetch'>&{WebSocket?:RoomSocketFactory}){
 const link=readWebPairLink(options.link),relay=link.relay||options.relay;
 const WS=options.WebSocket??(globalThis as unknown as {WebSocket:RoomSocketFactory}).WebSocket;
 let keys:PairKeys|null=null,socket:Socket|null=null,computer=false,heard=false,ended=false,fresh=false;
 const view:WebView={},waiters=new Set<()=>void>();
 const wake=()=>{fresh=true;for(const resolve of [...waiters])resolve();};
 const wait=(seconds:number)=>new Promise<void>(resolve=>{const timer=setTimeout(done,seconds*1000);function done(){clearTimeout(timer);waiters.delete(done);resolve();}waiters.add(done);});
 const frame=async(value:RoomFrame)=>{if(socket?.readyState===1)socket.send(JSON.stringify({data:JSON.stringify(value)}));};
 const introduce=async()=>frame({s:'phone',b:await sealBox(keys!,boxPlace('slot','phone'),{name:options.name.slice(0,60),version:options.version.slice(0,40)})});
 async function receive(text:unknown){
  let message:any;try{message=JSON.parse(String(text));}catch{return;}
  if(message?.t==='desktop'){computer=!!message.online;heard=true;if(computer)await introduce();wake();return;}
  if(message?.t!=='msg'||message.from!=='desktop')return;
  const value=readRoomFrame(message.data);if(!value)return;
  try{
   if('s' in value&&(SLOTS as readonly string[]).includes(value.s)){(view as any)[value.s]=await openBox(keys!,boxPlace('slot',value.s),value.b);wake();}
   else if('e' in value){await openBox(keys!,boxPlace('slot','end'),value.e);ended=true;socket?.close(1000);wake();}
  }catch{/* Not sealed with this pairing's key: dropped. */}
 }
 async function connect(){
  if(socket&&socket.readyState<=1)return;
  keys??=await pairKeys(link.secret);
  const {url,protocols}=await roomEntry(keys,relay,'phone'),ws=new WS(url,protocols);
  socket=ws;heard=false;
  // One at a time, in order: an end that is still being opened is not overtaken by the computer leaving.
  let queue=Promise.resolve();
  ws.onmessage=event=>{queue=queue.then(()=>receive(event.data));};
  ws.onclose=()=>{if(socket!==ws)return;socket=null;computer=false;heard=true;wake();};
  ws.onerror=()=>{};
 }
 async function poll(seconds=0):Promise<WebView>{
  if(ended)throw new WebPairingEnded('This link is off. Open Worldlet on your computer and make a new one.');
  await connect();
  // Until the room says whether the computer is there, a first poll waits for it.
  for(let i=0;i<50&&!heard;i++)await wait(0.1);
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
  if(keys&&computer)await frame({e:await sealBox(keys,boxPlace('slot','end'),{end:true})});
  ended=true;socket?.close(1000);
 }
 return {poll,send,end,get computer(){return view.desktop?.name||link.name;},get view(){return {...view};}};
}
