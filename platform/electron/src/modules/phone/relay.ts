import {DEFAULT_PAIR_RELAY,PUSH_BOX_PLACE,base64url,boxPlace,fromBase64url,newPairSecret,openBox,pairKeys,pairLink,readPhoneMessage,sealBox,sha256Hex,phoneMessageKey,stalePhoneMessage,PHONE_SEEN_LIMIT,type PairKeys,type PairKind,type PhoneMessage,type PhonePush} from '../../../../../core/phone/index.ts';

// The desktop side of phone pairing (core/phone/README.md), free of Electron so scripts/phone-pairing-check.ts can drive
// it against the relay Worker in process. It keeps one pairing: the secret in the vault, the relay cursor in memory.
// The host runs one for the phone and one for another Worldlet that uses this computer's Agent (`kind: 'agent'`,
// core/phone/README.md#another-computers-agent): the same relay, keys and boxes, with a code and vault entry of its own.
// Slots the desktop owns are sealed and written only when their content changes; the phone's messages go to `deliver`,
// and a message is acknowledged (by advancing the cursor) only after `deliver` accepted it. The agent pairing reads its
// client's messages with `read` (core/phone readRemoteToHost) instead of a phone's, and `send` queues one to the client. `notify` asks the relay to
// wake the phone with a sealed notification; `push` in the status says whether the phone registered for them.
export type PhoneState='none'|'waiting'|'paired';
export type PhoneStatus={state:PhoneState,link?:string,phone?:{name:string,version:string}|null,seenAt?:number|null,push?:{platform:string}|null,error?:string};
/** The relay's answer to a notification: sent, or why not (no-device, not-configured, device-gone, or an error). */
export type PhoneNotifyResult={sent:boolean,reason?:string,error?:string};
type Saved={secret:string,relay:string,name:string,paired:boolean,phone?:{name:string,version:string}|null};
export type PhoneRelayOptions<M extends {type:string,id:string}=PhoneMessage>={
 fetch:typeof fetch,
 vault:{get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void},
 name:()=>string,
 userAgent:string,
 relay?:string,
 /** `agent`: the pairing is with another Worldlet, not a phone. Default `phone`. */
 kind?:PairKind,
 /** Reads an opened message; anything it returns null for is dropped. Default: a phone's (readPhoneMessage). */
 read?:(value:unknown)=>M|null,
 /** The phone's message; resolve true once the desktop took it (the page queued the chat or settled the item). `key`
  * names this one delivery (core/phone phoneMessageKey): the same key is the same message delivered again. */
 deliver:(message:M,key:string)=>Promise<boolean>,
 onChange?:(status:PhoneStatus)=>void,
};
export function createPhoneRelay<M extends {type:string,id:string}=PhoneMessage>(options:PhoneRelayOptions<M>){
 const relay=options.relay||DEFAULT_PAIR_RELAY,kind=options.kind??'phone',read=options.read??(readPhoneMessage as unknown as (value:unknown)=>M|null);
 const VAULT_ID=kind+'-pairing',SEEN_ID=kind+'-pairing-seen';
 let saved:Saved|null=null,keys:PairKeys|null=null,cursor=0,seenAt:number|null=null,push:{platform:string}|null|undefined,error='';
 const published=new Map<string,string>(),latest=new Map<string,unknown>();
 try{const raw=options.vault.get(VAULT_ID);if(raw)saved=JSON.parse(raw);}catch{saved=null;}
 let seen:string[]=[];
 try{const raw=options.vault.get(SEEN_ID);const list=raw?JSON.parse(raw):[];if(Array.isArray(list))seen=list.filter(key=>typeof key==='string').slice(-PHONE_SEEN_LIMIT);}catch{seen=[];}
 const seenSet=new Set(seen);
 const remember=(key:string)=>{
  seen.push(key);seenSet.add(key);
  while(seen.length>PHONE_SEEN_LIMIT)seenSet.delete(seen.shift()!);
  options.vault.set(SEEN_ID,JSON.stringify(seen));
 };
 const forgetSeen=()=>{seen=[];seenSet.clear();options.vault.delete(SEEN_ID);};
 const save=()=>{if(saved)options.vault.set(VAULT_ID,JSON.stringify(saved));else{options.vault.delete(VAULT_ID);forgetSeen();}};
 const ensureKeys=async()=>keys??=saved?await pairKeys(fromBase64url(saved.secret)):null;
 const status=():PhoneStatus=>!saved?{state:'none'}:saved.paired?{state:'paired',phone:saved.phone??null,seenAt,...(push!==undefined?{push}:{}),...(error?{error}:{})}
  :{state:'waiting',link:pairLink({secret:fromBase64url(saved.secret),relay:saved.relay,name:saved.name,kind}),...(error?{error}:{})};
 const changed=()=>options.onChange?.(status());
 async function request(path:string,init:RequestInit={},token?:string,timeout=20_000){
  const k=await ensureKeys();
  const response=await options.fetch((saved?.relay||relay)+path,{...init,headers:{'User-Agent':options.userAgent,'Content-Type':'application/json',...(token||k?{Authorization:'Bearer '+(token||k!.desktopToken)}:{})},signal:AbortSignal.timeout(timeout)});
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok){const e:any=new Error(body?.error||`Pairing relay answered ${response.status}.`);e.status=response.status;throw e;}
  return body;
 }
 // The pairing ended on the other side (the phone unpaired, or the relay forgot it): forget it here too.
 const ended=(e:any)=>{if(e?.status===404){saved=null;keys=null;cursor=0;push=undefined;published.clear();save();changed();return true;}return false;};

 async function start(){
  await end().catch(()=>{});
  const secret=newPairSecret(),k=await pairKeys(secret);
  await request('/api/pair',{method:'POST',body:JSON.stringify({id:k.id,desktop:await sha256Hex(k.desktopToken),phone:await sha256Hex(k.phoneToken)})},k.desktopToken);
  saved={secret:base64url(secret),relay,name:options.name(),paired:false,phone:null};keys=k;cursor=0;push=undefined;published.clear();error='';
  forgetSeen();save();changed();
  return status();
 }
 async function end(){
  if(!saved)return status();
  const k=await ensureKeys();
  try{await request('/api/pair/'+k!.id,{method:'DELETE'});}catch(e){if(!(e as any)?.status)throw e;}
  saved=null;keys=null;cursor=0;push=undefined;published.clear();save();changed();
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
  try{return await put(slot,value);}catch(e){if(!ended(e))error=(e as Error).message;return false;}
 }
 /** Wake the paired phone with a notification, sealed whole (only the phone opens it). Never throws. */
 async function notify(value:PhonePush,collapse?:string):Promise<PhoneNotifyResult>{
  const k=await ensureKeys().catch(()=>null);if(!k||!saved?.paired)return {sent:false,reason:'not-paired'};
  try{
   const answer=await request(`/api/pair/${k.id}/notify`,{method:'POST',body:JSON.stringify({box:await sealBox(k,PUSH_BOX_PLACE,value),...(collapse?{collapse}:{})})});
   if(answer?.reason==='device-gone'&&push){push=null;changed();}
   return {sent:answer?.sent===true,...(typeof answer?.reason==='string'?{reason:answer.reason}:{})};
  }catch(e){if(!ended(e))error=(e as Error).message;return {sent:false,error:(e as Error).message};}
 }
 /** One poll: pick up the phone's slot and messages. With `wait` (seconds) the relay holds it until one arrives.
  * Returns whether anything arrived. */
 async function poll(wait=0){
  const k=await ensureKeys();if(!k||!saved)return false;
  let view:any;
  try{view=await request(`/api/pair/${k.id}?after=${cursor}${wait?`&wait=${wait}`:''}`,{},undefined,wait*1000+15_000);error='';}
  catch(e){if(!ended(e)){error=(e as Error).message;}return false;}
  seenAt=view.peer?.seenAt??null;
  // An older relay sends no `push`: the status then says nothing about notifications.
  if('push' in view){const next=view.push?.platform?{platform:String(view.push.platform)}:null;if(JSON.stringify(next)!==JSON.stringify(push)){push=next;changed();}}
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
 return {status,start,end,publish,notify,poll,send,get paired(){return !!saved?.paired;},get pairing(){return !!saved;}};
}
export type PhoneRelay=ReturnType<typeof createPhoneRelay>;
