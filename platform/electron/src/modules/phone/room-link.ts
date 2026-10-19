import {DEFAULT_PAIR_RELAY,ROOM_LINK_MODE,RTC_ANSWER_PLACE,RTC_OFFER_PLACE,base64url,boxPlace,fromBase64url,newPairSecret,openBox,pairKeys,pairLink,phoneMessageKey,readPhoneMessage,readRoomFrame,roomEntry,sealBox,stalePhoneMessage,PHONE_SEEN_LIMIT,type PairKeys,type PhoneMessage,type RoomFrame,type RoomSocketFactory} from '../../../../../agent/phone/index.ts';
import type {PhoneNotifyResult,PhoneStatus} from './relay.ts';
import type {RtcHost} from './rtc-host.ts';

// A browser on another device, met in the pairing room (agent/phone/README.md#web, agent/phone room.ts): the relay passes
// what each side sends while both are connected and stores nothing, so this computer is the only place the browser's
// content lives. It keeps the same face as the relay pairing (relay.ts: status, start, end, publish, poll), so the phone
// module runs it in the same loop. A browser that joins gets every slot this computer has at once; a changed slot goes
// to every browser in the room. Its messages are taken like a phone's, each once (the same persistent seen list).
// A browser takes no notifications. A browser that offers a direct line (agent/phone rtc.ts) is answered through `rtc`;
// while its line is open, frames to and from it go over the line and the room only says it is there.
type Saved={secret:string,relay:string,name:string,paired:boolean,phone?:{name:string,version:string}|null};
export type RoomLinkOptions={
 vault:{get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void},
 /** The vault entries' name. */
 vaultName:string,
 name:()=>string,
 relay?:string,
 deliver:(message:PhoneMessage,key:string)=>Promise<boolean>,
 onChange?:(status:PhoneStatus)=>void,
 WebSocket?:RoomSocketFactory,
 /** Answers browsers' direct lines (rtc-host.ts); without it every frame goes through the room. */
 rtc?:RtcHost,
 now?:()=>number,
};
export function createRoomLink(options:RoomLinkOptions){
 const WS=options.WebSocket??(globalThis as unknown as {WebSocket:RoomSocketFactory}).WebSocket,now=options.now??Date.now;
 const VAULT_ID=options.vaultName+'-pairing',SEEN_ID=options.vaultName+'-pairing-seen';
 let saved:Saved|null=null,keys:PairKeys|null=null,socket:InstanceType<RoomSocketFactory>|null=null,seenAt:number|null=null,arrived=false,error='';
 const latest=new Map<string,unknown>(),published=new Map<string,string>(),peers=new Set<string>(),direct=new Set<string>(),pending:{message:PhoneMessage,key:string}[]=[],waiters=new Set<()=>void>();
 try{const raw=options.vault.get(VAULT_ID);if(raw)saved=JSON.parse(raw);}catch{saved=null;}
 let seen:string[]=[];
 try{const raw=options.vault.get(SEEN_ID);const list=raw?JSON.parse(raw):[];if(Array.isArray(list))seen=list.filter(key=>typeof key==='string').slice(-PHONE_SEEN_LIMIT);}catch{seen=[];}
 const seenSet=new Set(seen);
 const remember=(key:string)=>{seen.push(key);seenSet.add(key);while(seen.length>PHONE_SEEN_LIMIT)seenSet.delete(seen.shift()!);options.vault.set(SEEN_ID,JSON.stringify(seen));};
 const save=()=>{if(saved)options.vault.set(VAULT_ID,JSON.stringify(saved));else{options.vault.delete(VAULT_ID);options.vault.delete(SEEN_ID);seen=[];seenSet.clear();}};
 const link=()=>pairLink({secret:fromBase64url(saved!.secret),relay:saved!.relay,name:saved!.name,kind:'web'})+'&m='+ROOM_LINK_MODE;
 // A browser in the room now is seen now.
 const seenNow=()=>peers.size?now():seenAt;
 const status=():PhoneStatus=>!saved?{state:'none'}:saved.paired?{state:'paired',link:link(),phone:saved.phone??null,seenAt:seenNow(),...(error?{error}:{})}
  :{state:'waiting',link:link(),...(error?{error}:{})};
 const changed=()=>options.onChange?.(status());
 const wake=()=>{arrived=true;for(const resolve of [...waiters])resolve();};
 const ensureKeys=async()=>keys??=saved?await pairKeys(fromBase64url(saved.secret)):null;
 const send=(value:RoomFrame,to?:string)=>{if(socket?.readyState!==1)return false;socket.send(JSON.stringify({data:JSON.stringify(value),...(to?{to}:{})}));return true;};
 /** To one browser: over its line when open, else through the room. */
 const sendTo=async(peer:string,value:RoomFrame)=>direct.has(peer)&&await options.rtc!.send(peer,JSON.stringify(value))||send(value,peer);
 /** To every browser: over each open line, and through the room when a browser has none (one with a line ignores
  * the room's slots). */
 const sendAll=async(value:RoomFrame)=>{
  let sent=false,room=false;
  for(const peer of peers)if(direct.has(peer)&&await options.rtc!.send(peer,JSON.stringify(value)))sent=true;else room=true;
  if(room&&send(value))sent=true;
  return sent;
 };
 const hangUp=(peer:string)=>{direct.delete(peer);options.rtc?.close(peer);};
 const sealSlot=async(slot:string,value:unknown)=>({s:slot,b:await sealBox(keys!,boxPlace('slot',slot),value)});
 async function take(message:PhoneMessage,key:string){
  if(seenSet.has(key))return;
  if(await options.deliver(message,key).catch(()=>false))remember(key);
  else if(!pending.some(p=>p.key===key))pending.push({message,key});
 }
 async function receive(ws:InstanceType<RoomSocketFactory>,text:unknown){
  if(socket!==ws||!saved)return;
  let event:any;try{event=JSON.parse(String(text));}catch{return;}
  if(event?.t==='peer'&&typeof event.id==='string'){
   seenAt=now();
   if(!event.online){peers.delete(event.id);hangUp(event.id);changed();return;}
   peers.add(event.id);
   if(!saved.paired){saved.paired=true;save();}
   changed();wake();
   // What this computer has, to the browser that came.
   for(const [slot,value] of latest)await sendTo(event.id,await sealSlot(slot,value));
   return;
  }
  if(event?.t!=='msg'||typeof event.from!=='string')return;
  await fromBrowser(event.from,event.data);
 }
 async function fromBrowser(peer:string,data:unknown){
  if(!saved)return;
  const frame=readRoomFrame(data);if(!frame)return;
  seenAt=now();
  try{
   if('s' in frame&&frame.s==='phone'){const v:any=await openBox(keys!,boxPlace('slot','phone'),frame.b);saved.phone={name:String(v?.name||'Browser').slice(0,60),version:String(v?.version||'').slice(0,40)};save();changed();wake();}
   else if('m' in frame){
    const sealed=await openBox(keys!,boxPlace('to','desktop'),frame.m),message=readPhoneMessage(sealed);
    wake();
    // An unreadable message is dropped, and so is one sealed more than a week ago or one already taken.
    if(message&&!stalePhoneMessage(sealed,now()))await take(message,await phoneMessageKey(message,frame.m));
   }
   else if('e' in frame){await openBox(keys!,boxPlace('slot','end'),frame.e);await end();}
   else if('r' in frame&&options.rtc&&peers.has(peer)){
    const offer:any=await openBox(keys!,RTC_OFFER_PLACE,frame.r);if(typeof offer?.offer!=='string')return;
    direct.delete(peer);
    // Answering takes a few seconds of gathering addresses; the room's other frames do not wait for it.
    const rtc=options.rtc,k=keys!;
    void rtc.answer(peer,offer.offer).then(async answer=>{if(answer&&peers.has(peer)&&saved&&keys===k)send({r:await sealBox(k,RTC_ANSWER_PLACE,{answer})},peer);}).catch(()=>{});
   }
  }catch{/* Not sealed with this pairing's key: dropped. */}
 }
 async function connect(){
  if(!saved||socket&&socket.readyState<=1)return;
  const k=await ensureKeys();if(!k)return;
  const {url,protocols}=await roomEntry(k,saved.relay,'desktop'),ws=new WS(url,protocols);
  socket=ws;
  ws.onopen=()=>{if(error){error='';changed();}};
  // One at a time, in order, as the room sent them.
  let queue=Promise.resolve();
  ws.onmessage=event=>{queue=queue.then(()=>receive(ws,event.data));};
  ws.onclose=()=>{if(socket!==ws)return;socket=null;for(const peer of peers)hangUp(peer);if(peers.size){peers.clear();seenAt=now();changed();}};
  ws.onerror=()=>{if(socket===ws&&!error){error='Could not reach the pairing room.';changed();}};
 }
 async function start(){
  await end();
  saved={secret:base64url(newPairSecret()),relay:options.relay||DEFAULT_PAIR_RELAY,name:options.name(),paired:false,phone:null};
  keys=null;published.clear();error='';save();
  await connect();changed();
  return status();
 }
 async function end(){
  if(!saved)return status();
  // Browsers in the room hear that the link is off; one that comes later finds the computer away.
  if(await ensureKeys().catch(()=>null)){
   const off:RoomFrame={e:await sealBox(keys!,boxPlace('slot','end'),{end:true})};
   // Through the room as well: closing a line at once may drop what it still had to send.
   if(options.rtc)for(const peer of direct)await options.rtc.send(peer,JSON.stringify(off));
   send(off);
  }
  for(const peer of [...direct])hangUp(peer);
  const ws=socket;socket=null;try{ws?.close(1000);}catch{}
  saved=null;keys=null;peers.clear();published.clear();pending.length=0;seenAt=null;save();changed();
  return status();
 }
 /** The link as it is, or a new one when there is none: what the Agent hands the person (`world/link`). An existing
  * link is kept, so a browser that already opened it stays paired. */
 async function ensure(){return saved?status():await start();}
 /** Remember the newest value of a slot and send it to the browsers in the room when it changed. */
 async function publish(slot:'attention'|'conversation'|'live'|'widgets'|'desktop',value:unknown){
  latest.set(slot,value);
  if(!saved?.paired||!peers.size||!await ensureKeys())return false;
  const text=JSON.stringify({...(value as object),at:undefined});
  if(published.get(slot)===text)return false;
  if(!await sendAll(await sealSlot(slot,value)))return false;
  published.set(slot,text);return true;
 }
 /** Keeps the room open, offers again what the page did not take, and waits up to `wait` seconds for something from a
  * browser. Returns whether anything arrived since the last poll. */
 async function poll(wait=0){
  if(!saved)return false;
  try{await connect();}catch(e){error=(e as Error).message;}
  for(const p of pending.splice(0))await take(p.message,p.key);
  if(wait&&!arrived)await new Promise<void>(resolve=>{const timer=setTimeout(done,wait*1000);function done(){clearTimeout(timer);waiters.delete(done);resolve();}waiters.add(done);});
  const any=arrived;arrived=false;return any;
 }
 // A line opened: everything again over it, since the room's slots are ignored from now on. A line closed: everything
 // again through the room.
 options.rtc?.listen({
  open:peer=>{if(!peers.has(peer)||!saved){options.rtc!.close(peer);return;}direct.add(peer);void everything(peer);},
  message:(peer,frame)=>{if(peers.has(peer))queue=queue.then(()=>fromBrowser(peer,frame));},
  closed:peer=>{if(!direct.delete(peer)||!peers.has(peer))return;void hungUp(peer);},
 });
 // The browser may not notice yet that the line is gone: it hears it through the room before the slots that follow.
 async function hungUp(peer:string){if(await ensureKeys()){send({r:await sealBox(keys!,RTC_ANSWER_PLACE,{hangup:true})},peer);await everything(peer);}}
 let queue=Promise.resolve();
 async function everything(peer:string){if(await ensureKeys())for(const [slot,value] of latest)await sendTo(peer,await sealSlot(slot,value));}
 const notify=async():Promise<PhoneNotifyResult>=>({sent:false,reason:'no-device'});
 return {status,start,ensure,end,publish,notify,poll,get paired(){return !!saved?.paired;},get pairing(){return !!saved;},get open(){return peers.size>0;},
  /** How many browsers have a direct line open. */
  get direct(){return direct.size;}};
}
export type RoomLink=ReturnType<typeof createRoomLink>;
