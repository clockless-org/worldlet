import {DEFAULT_PAIR_RELAY,PUSH_BOX_PLACE,ROOM_LINK_MODE,readRoomFrame,roomEntry,base64url,boxPlace,fromBase64url,newPairSecret,openBox,pairKeys,pairLink,readPhoneMessage,sealBox,sha256Hex,phoneMessageKey,stalePhoneMessage,phonePushToken,PHONE_SEEN_LIMIT,type PairKeys,type PairKind,type PhoneMessage,type PhonePush,type RoomFrame,type RoomSocketFactory} from '../../../../../core/phone/index.ts';

// The desktop side of phone pairing (core/phone/README.md), free of Electron so scripts/phone-pairing-check.ts can drive
// it against the relay Worker in process. It keeps one pairing: the secret in the vault, the relay cursor in memory.
// The host runs one for the phone and one for another Worldlet that uses this computer's Agent (`kind: 'agent'`,
// core/phone/README.md#another-computers-agent): the same relay, keys and boxes, with a code and vault entry of its own.
// Slots the desktop owns are sealed and written only when their content changes; the phone's messages go to `deliver`,
// and a message is acknowledged (by advancing the cursor) only after `deliver` accepted it. The agent pairing reads its
// client's messages with `read` (core/phone readRemoteToHost) instead of a phone's, and `send` queues one to the client. `notify` asks the relay to
// wake the phone with a sealed notification; `push` in the status says whether the phone registered for them. A phone
// that hands its notification token to the computer (a `push` message, core/phone/README.md#push) has it kept in the
// vault, never delivered: `notify` then sends the token with the box to the relay's `/api/push`, which stores nothing.
// With `room` (the phone's pairing, core/phone/README.md#room) the computer also waits in the pairing room (core/phone
// room.ts), and its code says so (`m=room`): a phone app that meets it there moves the pairing into the room for good,
// the relay's pairing is deleted with everything it kept, and from then on slots and messages pass only while both are
// connected, as with a browser (room-link.ts). An older app keeps using the relay.
export type PhoneState='none'|'waiting'|'paired';
export type PhoneStatus={state:PhoneState,link?:string,phone?:{name:string,version:string}|null,seenAt?:number|null,push?:{platform:string}|null,error?:string};
/** The relay's answer to a notification: sent, or why not (no-device, not-configured, device-gone, or an error). */
export type PhoneNotifyResult={sent:boolean,reason?:string,error?:string};
type Saved={secret:string,relay:string,name:string,paired:boolean,phone?:{name:string,version:string}|null,room?:true};
type Device={platform:string,token:string};
export type PhoneRelayOptions<M extends {type:string,id:string}=PhoneMessage>={
 fetch:typeof fetch,
 vault:{get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void},
 name:()=>string,
 userAgent:string,
 /** The relay a new pairing uses; a function when it is known only when the pairing starts (this computer's own, local-relay.ts). */
 relay?:string|(()=>string),
 /** `agent`: the pairing is with another Worldlet, not a phone. Default `phone`. */
 kind?:PairKind,
 /** Its vault entries' name, when two pairings of one kind keep their own (the browser on this computer, `local`). Default the kind. */
 vaultName?:string,
 /** Reads an opened message; anything it returns null for is dropped. Default: a phone's (readPhoneMessage). */
 read?:(value:unknown)=>M|null,
 /** The phone's message; resolve true once the desktop took it (the page queued the chat or settled the item). `key`
  * names this one delivery (core/phone phoneMessageKey): the same key is the same message delivered again. */
 deliver:(message:M,key:string)=>Promise<boolean>,
 onChange?:(status:PhoneStatus)=>void,
 /** Also meet the phone in the pairing room (the phone's pairing). `WebSocket` replaces the global one in checks. */
 room?:{WebSocket?:RoomSocketFactory},
};
export function createPhoneRelay<M extends {type:string,id:string}=PhoneMessage>(options:PhoneRelayOptions<M>){
 const relayOf=()=>(typeof options.relay==='function'?options.relay():options.relay)||DEFAULT_PAIR_RELAY,kind=options.kind??'phone',read=options.read??(readPhoneMessage as unknown as (value:unknown)=>M|null);
 const VAULT_ID=(options.vaultName??kind)+'-pairing',SEEN_ID=(options.vaultName??kind)+'-pairing-seen',PUSH_ID=(options.vaultName??kind)+'-pairing-push';
 let saved:Saved|null=null,keys:PairKeys|null=null,cursor=0,seenAt:number|null=null,push:{platform:string}|null|undefined,error='';
 const published=new Map<string,string>(),latest=new Map<string,unknown>();
 // The pairing room: the socket while connected, the phones in it now, messages the desktop did not take yet, and
 // whatever waits for the next thing to arrive.
 let socket:InstanceType<RoomSocketFactory>|null=null,heard=false;
 const peers=new Set<string>(),pending:{message:M,key:string}[]=[],waiters=new Set<()=>void>();
 const inRoom=()=>!!saved?.room;
 try{const raw=options.vault.get(VAULT_ID);if(raw)saved=JSON.parse(raw);}catch{saved=null;}
 // The phone's notification token, when it handed it to this computer.
 let device:Device|null=null;
 try{const raw=options.vault.get(PUSH_ID),value=raw?JSON.parse(raw):null;if(saved&&phonePushToken(value?.platform,value?.token))device={platform:value.platform,token:value.token};}catch{device=null;}
 if(device)push={platform:device.platform};
 const keep=(next:Device|null)=>{device=next;if(next)options.vault.set(PUSH_ID,JSON.stringify(next));else options.vault.delete(PUSH_ID);};
 let seen:string[]=[];
 try{const raw=options.vault.get(SEEN_ID);const list=raw?JSON.parse(raw):[];if(Array.isArray(list))seen=list.filter(key=>typeof key==='string').slice(-PHONE_SEEN_LIMIT);}catch{seen=[];}
 const seenSet=new Set(seen);
 const remember=(key:string)=>{
  seen.push(key);seenSet.add(key);
  while(seen.length>PHONE_SEEN_LIMIT)seenSet.delete(seen.shift()!);
  options.vault.set(SEEN_ID,JSON.stringify(seen));
 };
 const forgetSeen=()=>{seen=[];seenSet.clear();options.vault.delete(SEEN_ID);};
 const save=()=>{if(saved)options.vault.set(VAULT_ID,JSON.stringify(saved));else{options.vault.delete(VAULT_ID);forgetSeen();keep(null);}};
 const ensureKeys=async()=>keys??=saved?await pairKeys(fromBase64url(saved.secret)):null;
 const link=()=>pairLink({secret:fromBase64url(saved!.secret),relay:saved!.relay,name:saved!.name,kind})+(options.room?'&m='+ROOM_LINK_MODE:'');
 // A phone in the room now is seen now.
 const seenNow=()=>peers.size?Date.now():seenAt;
 // A browser's link stays shown once paired: any browser that opens it joins the same pairing (core/phone/README.md#web).
 const status=():PhoneStatus=>!saved?{state:'none'}:saved.paired?{state:'paired',...(kind==='web'?{link:link()}:{}),phone:saved.phone??null,seenAt:seenNow(),...(push!==undefined?{push}:{}),...(error?{error}:{})}
  :{state:'waiting',link:link(),...(error?{error}:{})};
 const changed=()=>options.onChange?.(status());
 async function request(path:string,init:RequestInit={},token?:string,timeout=20_000){
  const k=await ensureKeys();
  const response=await options.fetch((saved?.relay||relayOf())+path,{...init,headers:{'User-Agent':options.userAgent,'Content-Type':'application/json',...(token||k?{Authorization:'Bearer '+(token||k!.desktopToken)}:{})},signal:AbortSignal.timeout(timeout)});
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok){const e:any=new Error(body?.error||`Pairing relay answered ${response.status}.`);e.status=response.status;throw e;}
  return body;
 }
 const leaveRoom=()=>{const ws=socket;socket=null;peers.clear();pending.length=0;try{ws?.close(1000);}catch{}};
 const forget=()=>{leaveRoom();saved=null;keys=null;cursor=0;push=undefined;published.clear();save();changed();};
 // The pairing ended on the other side (the phone unpaired, or the relay forgot it): forget it here too. A pairing in
 // the room has no relay pairing left to end.
 const ended=(e:any)=>{if(e?.status===404&&!inRoom()){forget();return true;}return false;};
 const wake=()=>{heard=true;for(const resolve of [...waiters])resolve();};
 /** A phone's `push` message: the token is kept (or dropped) here and never delivered. True when it was one. */
 function handed(message:M){
  if(message.type!=='push')return false;
  const m=message as unknown as PhoneMessage&{type:'push'};
  // Only a phone pairing takes one.
  if(kind==='phone'){keep(m.platform?{platform:m.platform,token:m.token}:null);const next=device?{platform:device.platform}:null;if(JSON.stringify(next)!==JSON.stringify(push)){push=next;changed();}}
  return true;
 }
 async function take(message:M,key:string){
  if(seenSet.has(key))return;
  if(handed(message)||await options.deliver(message,key).catch(()=>false))remember(key);
  else if(!pending.some(p=>p.key===key))pending.push({message,key});
 }
 const roomSend=(value:RoomFrame,to?:string)=>{if(socket?.readyState!==1)return false;socket.send(JSON.stringify({data:JSON.stringify(value),...(to?{to}:{})}));return true;};
 const sealSlot=async(slot:string,value:unknown)=>({s:slot,b:await sealBox(keys!,boxPlace('slot',slot),value)});
 async function roomReceive(ws:InstanceType<RoomSocketFactory>,text:unknown){
  if(socket!==ws||!saved)return;
  let event:any;try{event=JSON.parse(String(text));}catch{return;}
  if(event?.t==='peer'&&typeof event.id==='string'){
   seenAt=Date.now();
   if(!event.online){peers.delete(event.id);changed();return;}
   peers.add(event.id);
   // The phone came to the room: the pairing lives here from now on, and the relay's copy is deleted.
   if(!saved.room){
    const k=keys!;saved.room=true;saved.paired=true;published.clear();save();
    if(!device&&push)push=null;
    void request('/api/pair/'+k.id,{method:'DELETE'}).catch(()=>{});
   }
   changed();wake();
   // What this computer has, to the phone that came.
   for(const [slot,value] of latest)roomSend(await sealSlot(slot,value),event.id);
   return;
  }
  if(event?.t!=='msg'||typeof event.from!=='string'||!inRoom())return;
  const frame=readRoomFrame(event.data);if(!frame)return;
  seenAt=Date.now();
  try{
   if('s' in frame&&frame.s==='phone'){const v:any=await openBox(keys!,boxPlace('slot','phone'),frame.b);saved.phone={name:String(v?.name||'Phone').slice(0,60),version:String(v?.version||'').slice(0,40)};save();changed();wake();}
   else if('m' in frame){
    const sealed=await openBox(keys!,boxPlace('to','desktop'),frame.m),message=read(sealed);
    wake();
    // An unreadable message is dropped, and so is one sealed more than a week ago or one already taken.
    if(message&&!stalePhoneMessage(sealed,Date.now()))await take(message,await phoneMessageKey(message,frame.m));
   }
   else if('e' in frame){await openBox(keys!,boxPlace('slot','end'),frame.e);forget();}
  }catch{/* Not sealed with this pairing's key: dropped. */}
 }
 async function connectRoom(){
  if(!options.room||!saved||socket&&socket.readyState<=1)return;
  const k=await ensureKeys();if(!k)return;
  const WS=options.room.WebSocket??(globalThis as unknown as {WebSocket:RoomSocketFactory}).WebSocket;
  const {url,protocols}=await roomEntry(k,saved.relay,'desktop'),ws=new WS(url,protocols);
  socket=ws;
  // One at a time, in order, as the room sent them.
  let queue=Promise.resolve();
  ws.onmessage=event=>{queue=queue.then(()=>roomReceive(ws,event.data));};
  ws.onclose=()=>{if(socket!==ws)return;socket=null;if(peers.size){peers.clear();seenAt=Date.now();changed();}};
  ws.onerror=()=>{if(socket===ws&&inRoom()&&!error){error='Could not reach the pairing room.';changed();}};
  ws.onopen=()=>{if(inRoom()&&error){error='';changed();}};
 }

 async function start(){
  await end().catch(()=>{});
  const secret=newPairSecret(),k=await pairKeys(secret),relay=relayOf();
  await request('/api/pair',{method:'POST',body:JSON.stringify({id:k.id,desktop:await sha256Hex(k.desktopToken),phone:await sha256Hex(k.phoneToken)})},k.desktopToken);
  leaveRoom();
  saved={secret:base64url(secret),relay,name:options.name(),paired:false,phone:null};keys=k;cursor=0;push=undefined;keep(null);published.clear();error='';
  forgetSeen();save();changed();
  await connectRoom().catch(()=>{});
  return status();
 }
 async function end(){
  if(!saved)return status();
  const k=await ensureKeys();
  // The phone in the room hears that the pairing is off; one that comes later finds the computer away.
  if(inRoom())roomSend({e:await sealBox(k!,boxPlace('slot','end'),{end:true})});
  else try{await request('/api/pair/'+k!.id,{method:'DELETE'});}catch(e){if(!(e as any)?.status)throw e;}
  forget();
  return status();
 }
 async function put(slot:string,value:unknown){
  const k=await ensureKeys();if(!k||!saved?.paired)return false;
  const text=JSON.stringify({...(value as object),at:undefined});
  if(published.get(slot)===text)return false;
  await request(`/api/pair/${k.id}/slots/${slot}`,{method:'PUT',body:JSON.stringify({box:await sealBox(k,boxPlace('slot',slot),value)})});
  published.set(slot,text);return true;
 }
 /** Remember the newest value of a desktop slot and send it when paired and changed. */
 async function publish(slot:'attention'|'conversation'|'live'|'widgets'|'desktop',value:unknown){
  latest.set(slot,value);
  if(inRoom()){
   if(!peers.size||!await ensureKeys())return false;
   const text=JSON.stringify({...(value as object),at:undefined});
   if(published.get(slot)===text)return false;
   if(!roomSend(await sealSlot(slot,value)))return false;
   published.set(slot,text);return true;
  }
  try{return await put(slot,value);}catch(e){if(!ended(e))error=(e as Error).message;return false;}
 }
 /** Wake the paired phone with a notification, sealed whole (only the phone opens it). Never throws. */
 async function notify(value:PhonePush,collapse?:string):Promise<PhoneNotifyResult>{
  const k=await ensureKeys().catch(()=>null);if(!k||!saved?.paired)return {sent:false,reason:'not-paired'};
  try{
   const box=await sealBox(k,PUSH_BOX_PLACE,value),extra=collapse?{collapse}:{};
   // A relay without `/api/push` (older, or one of the person's own) answers 404: that is not the pairing ending, and the
   // relay's own registration is tried instead.
   const direct=device&&await request('/api/push',{method:'POST',body:JSON.stringify({pair:k.id,platform:device.platform,token:device.token,box,...extra})})
    .catch(e=>{if(e?.status===404||e?.status===405)return null;throw e;});
   if(!direct&&inRoom())return {sent:false,reason:'no-device'};
   const answer=direct||await request(`/api/pair/${k.id}/notify`,{method:'POST',body:JSON.stringify({box,...extra})});
   if(answer?.reason==='device-gone'){if(device)keep(null);if(push){push=null;changed();}}
   return {sent:answer?.sent===true,...(typeof answer?.reason==='string'?{reason:answer.reason}:{})};
  }catch(e){if(!ended(e))error=(e as Error).message;return {sent:false,error:(e as Error).message};}
 }
 /** One poll: pick up the phone's slot and messages. With `wait` (seconds) the relay holds it until one arrives.
  * Returns whether anything arrived. */
 async function poll(wait=0){
  const k=await ensureKeys();if(!k||!saved)return false;
  try{await connectRoom();}catch(e){if(inRoom())error=(e as Error).message;}
  if(inRoom()){
   for(const p of pending.splice(0))await take(p.message,p.key);
   if(wait&&!heard)await new Promise<void>(resolve=>{const timer=setTimeout(done,wait*1000);function done(){clearTimeout(timer);waiters.delete(done);resolve();}waiters.add(done);});
   const any=heard;heard=false;return any;
  }
  let view:any;
  try{view=await request(`/api/pair/${k.id}?after=${cursor}${wait?`&wait=${wait}`:''}`,{},undefined,wait*1000+15_000);error='';}
  catch(e){if(!ended(e)){error=(e as Error).message;}return false;}
  seenAt=view.peer?.seenAt??null;
  // An older relay sends no `push`: the status then says nothing about notifications. A token this computer keeps wins.
  if('push' in view&&!device){const next=view.push?.platform?{platform:String(view.push.platform)}:null;if(JSON.stringify(next)!==JSON.stringify(push)){push=next;changed();}}
  let arrived=false;
  if(!saved.paired&&view.peer?.pairedAt){
   saved.paired=true;save();arrived=true;changed();
   published.clear();for(const [slot,value] of latest)await put(slot,value).catch(()=>{});
  }
  for(const slot of view.slots||[])if(slot.name==='phone'){
   try{const v:any=await openBox(k,boxPlace('slot','phone'),slot.box);saved.phone={name:String(v?.name||'Phone').slice(0,60),version:String(v?.version||'').slice(0,40)};save();changed();}catch{}
  }
  let next=view.version;
  for(const m of view.messages||[]){
   let message:M|null=null,sealed:unknown=null;
   try{sealed=await openBox(k,boxPlace('to','desktop'),m.box);message=read(sealed);}catch{}
   arrived=true;
   // An unreadable or unknown message is dropped, and so is one already taken (the relay queued it again, also
   // after a restart) or one sealed more than a week ago; a readable new one waits until the desktop takes it.
   if(!message||stalePhoneMessage(sealed,Date.now()))continue;
   const key=await phoneMessageKey(message,String(m.box));
   if(seenSet.has(key))continue;
   if(handed(message)){remember(key);continue;}
   if(!await options.deliver(message,key).catch(()=>false)){next=m.seq-1;break;}
   remember(key);
  }
  cursor=Math.max(cursor,next);
  return arrived;
 }
 /** Queues a message to the other side (the agent pairing's client). Throws when the relay refuses it. */
 async function send(value:unknown){
  const k=await ensureKeys();if(!k||!saved?.paired)throw new Error('Not paired.');
  try{await request(`/api/pair/${k.id}/messages`,{method:'POST',body:JSON.stringify({box:await sealBox(k,boxPlace('to','phone'),value)})});}
  catch(e){ended(e);throw e;}
 }
 return {status,start,end,publish,notify,poll,send,get paired(){return !!saved?.paired;},get pairing(){return !!saved;},get open(){return peers.size>0;},get room(){return inRoom();}};
}
export type PhoneRelay=ReturnType<typeof createPhoneRelay>;
