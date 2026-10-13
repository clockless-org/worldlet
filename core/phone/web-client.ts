import {boxPlace,openBox,pairKeys,readWebPairLink,sealBox,type PairKeys} from './pairing.ts';
import type {PhoneAttention,PhoneConversation,PhoneDesktop,PhoneLive,PhoneMessage} from './payloads.ts';

// The phone's side of pairing, for a web browser (README.md#web): the page at `<relay>/open/` pairs with the computer
// like the phone apps do, through the same relay, keys and boxes, as the `phone` role. Free of the DOM, so
// scripts/web-open-check.ts drives it against the desktop's own relay code in process.
/** What the computer has sent, newest of each; a slot it never wrote is absent. */
export type WebView={attention?:PhoneAttention,conversation?:PhoneConversation,live?:PhoneLive,desktop?:PhoneDesktop};
export type WebClientOptions={fetch:typeof fetch,link:string,relay:string,name:string,version:string};
/** Messages the browser may send: the same shapes as the phone apps' (payloads.ts readPhoneMessage). */
export type WebMessage=Extract<PhoneMessage,{type:'attention'|'chat'|'option'|'approval'|'connect'|'applet'}>;
/** The relay said the pairing is gone (the computer unpaired, or the code expired). */
export class WebPairingEnded extends Error {}
const SLOTS=['attention','conversation','live','desktop'] as const;

export function createWebClient(options:WebClientOptions){
 const link=readWebPairLink(options.link),relay=link.relay||options.relay;
 let keys:PairKeys|null=null,cursor=0,introduced=false;
 const view:WebView={};
 const ensure=async()=>keys??=await pairKeys(link.secret);
 async function request(path:string,init:RequestInit={},timeout=20_000){
  const k=await ensure();
  const response=await options.fetch(relay+'/api/pair/'+k.id+path,{...init,headers:{'Content-Type':'application/json',Authorization:'Bearer '+k.phoneToken},signal:AbortSignal.timeout(timeout)});
  const body:any=await response.json().catch(()=>({}));
  if(response.status===404)throw new WebPairingEnded(body?.error||'This link has ended. Open Worldlet on your computer and copy a new one.');
  if(!response.ok)throw new Error(body?.error||`The relay answered ${response.status}.`);
  return body;
 }
 /** One poll: the computer's slots after the last one seen. With `wait` (seconds) the relay holds it until something
  * changes. The first poll completes the pairing and tells the computer this browser's name. */
 async function poll(wait=0):Promise<WebView>{
  const k=await ensure();
  const answer=await request(`?after=${cursor}${wait?`&wait=${wait}`:''}`,{},wait*1000+15_000);
  for(const slot of answer.slots||[]){
   if(!(SLOTS as readonly string[]).includes(slot.name))continue;
   try{(view as any)[slot.name]=await openBox(k,boxPlace('slot',slot.name),slot.box);}catch{}
  }
  if(Number.isSafeInteger(answer.version))cursor=Math.max(cursor,answer.version);
  if(!introduced){
   introduced=true;
   await request('/slots/phone',{method:'PUT',body:JSON.stringify({box:await sealBox(k,boxPlace('slot','phone'),{name:options.name.slice(0,60),version:options.version.slice(0,40)})})}).catch(()=>{introduced=false;});
  }
  return {...view};
 }
 /** Sends what the person did here to the computer, sealed with the time it was sent. */
 async function send(message:WebMessage){
  const k=await ensure();
  await request('/messages',{method:'POST',body:JSON.stringify({box:await sealBox(k,boxPlace('to','desktop'),{...message,at:new Date().toISOString()})})});
 }
 /** Unpairs this browser (the computer forgets it at its next poll). */
 async function end(){await request('',{method:'DELETE'}).catch(error=>{if(!(error instanceof WebPairingEnded))throw error;});}
 return {poll,send,end,get computer(){return view.desktop?.name||link.name;},get view(){return {...view};}};
}
export type WebClient=ReturnType<typeof createWebClient>;
