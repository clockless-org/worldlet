import {phoneAttention,phoneActionStatus,phoneLive,type PhoneMessage,type PhoneWorld} from '../../core/phone/index.ts';
import {attentionLaterUntil} from '../../core/attention/index.ts';
import {attentionSceneArt} from '../attention/index.ts';

// The World page's half of phone pairing (core/phone/README.md). It sends the Attention Center's Now and Later to the
// host when they change, and carries out what the paired phone asks: a chat line goes to Fox's main conversation as the
// person's own message (queued behind a running turn, like a typed one), and Done, Later or Remove settles the item the
// way the desktop card does, and Connect opens that account's sign-in here, where the person finishes it (the phone never
// signs in to anything). An Order said on the phone goes to Claude like the computer's own Order button (never to Fox as a
// chat line), and Fox says here how it went. The host calls window.worldletPhoneMessage and acknowledges the message
// when it returns true.
// The Applet world rides with the Center: the World's Applets, what each is doing and its own thread (core/phone
// phoneApplets), so the phone's swipe down from Now shows them and each item links to its Applet.
const LIVE_GAP=250;
type Settle=(item:{worldItemId:string},status:string,snoozedUntil:string|null)=>Promise<unknown>;
type Account={provider:string,title:string,action:string,run:()=>unknown};
export function mountPhoneBridge({publish,publishLive=async()=>{},answer=()=>false,ask,askItem=(_id,text)=>ask(text),askApplet=(_key,text)=>ask(text),openApplet=()=>false,order=()=>false,world=()=>null,choose=()=>false,itemFox=()=>null,settle,kindOf,ready=()=>true}:{
 publish:(value:unknown)=>Promise<unknown>,
 /** Sends the turn Fox is streaming (core/phone phoneLive). */
 publishLive?:(value:unknown)=>Promise<unknown>,
 /** The phone's answer to the Agent's permission prompt that rides with the live turn (core/phone PhoneLive `approval`). */
 answer?:(id:string,choice:'once'|'always'|'deny')=>unknown,
 ask:(text:string)=>unknown,
 /** A line the person said on the phone with an item's card open: it joins that item's conversation, as on the computer. */
 askItem?:(id:string,text:string)=>unknown,
 /** A line the person said inside an Applet's page on the phone: the Applet opens here, so the line joins its thread. */
 askApplet?:(key:string,text:string)=>unknown,
 /** Open on the computer, asked from an Applet's page on the phone. */
 openApplet?:(key:string)=>unknown,
 /** What the person said with the phone's Order button: sent as an Order from this computer (ui/companion/native-chat.ts). */
 order?:(said:string)=>unknown,
 /** The Applet world (core/phone PhoneWorld), or null where there is none. */
 world?:()=>PhoneWorld|null,
 /** The option Fox offers on an item's card (its primary help), chosen on the phone. */
 choose?:(id:string)=>unknown,
 /** What Fox says on an item's card and that item's latest turns (core/phone/payloads.ts PhoneItemFox). */
 itemFox?:(id:string)=>unknown,
 settle:Settle,
 kindOf:(id:string)=>string|undefined,
 ready?:()=>boolean,
}){
 let view:{now:any[],later:any[]}|null=null,pending:{now:any[],later:any[]}|null=null,accounts:Account[]=[],sent='',timer:ReturnType<typeof setTimeout>|null=null;
 const soon=()=>{timer??=setTimeout(()=>void flush(),1500);};
 async function flush(){
  timer=null;if(!view)return;
  pending={now:view.now.map(withItem),later:view.later.map(withItem)};
  const value=phoneAttention({...pending,accounts,world:world()??undefined},Date.now()),text=JSON.stringify({...value,at:''});
  if(text===sent)return;
  sent=text;
  try{await publish(value);}catch{sent='';}
 }
 const handled=new Set<string>();
 (globalThis as any).worldletPhoneMessage=async(message:PhoneMessage,key?:string)=>{
  // Retried deliveries (the host could not record the acknowledgement) are taken once. The host names each delivery
  // (core/phone phoneMessageKey): an Attention message's id is its item's, so "Later" then "Done" on one item are two.
  const delivery=typeof key==='string'&&key?key:message?.type==='attention'?'':message?.id;
  if(delivery&&handled.has(delivery))return true;
  if(!ready())return false;
  if(message.type==='chat')void Promise.resolve(message.item?askItem(message.item,message.text):message.applet?askApplet(message.applet,message.text):ask(message.text)).catch(()=>{});
  else if(message.type==='applet')void Promise.resolve(openApplet(message.applet)).catch(()=>{});
  else if(message.type==='order')void Promise.resolve(order(message.said)).catch(()=>{});
  else if(message.type==='option')void Promise.resolve(choose(message.item)).catch(()=>{});
  else if(message.type==='approval')void Promise.resolve(answer(message.approval,message.choice)).catch(()=>{});
  else if(message.type==='attention'){
   const {status,later}=phoneActionStatus(message.action,kindOf(message.id)||'task');
   try{await settle({worldItemId:message.id},status,later?attentionLaterUntil(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone):null);}
   catch{/* The item is gone or already settled; the next Attention snapshot shows the phone the truth. */}
  }else if(message.type==='connect'){
   // The sign-in opens on the computer; an account that no longer needs it is ignored.
   const account=accounts.find(a=>a.provider===message.provider);
   if(account)void Promise.resolve(account.run()).catch(()=>{});
  }else return true;
  if(delivery)handled.add(delivery);if(handled.size>500)handled.delete(handled.values().next().value);
  return true;
 };
 // The card's illustration, chosen the way the desktop card chooses it (ui/attention/attention-preview.ts); the phone
 // bundles the same pictures.
 // Fox's line and the item's own turns come with it, so the phone's dialogue follows the open card.
 const withItem=(m:any)=>({...m,art:attentionSceneArt({title:m.fullAction||m.title,reason:m.fullContext,summary:m.summary,
  image:m.state==='event'?'coming-up':m.state==='needsAction'?'do-something':'worth-knowing'}),fox:m.worldItemId?itemFox(m.worldItemId):null});
 // The streaming turn goes out at most every quarter second (each send is one relay write); the finished reply at once.
 let liveTurn:any=null,lastTurn:any=null,asking:any=null,liveTimer:ReturnType<typeof setTimeout>|null=null,liveSending=false;
 async function flushLive(){
  liveTimer=null;if(!liveTurn||liveSending)return;
  const value=phoneLive(liveTurn,Date.now());liveTurn=null;if(!value)return;
  liveSending=true;
  try{await publishLive(value);}catch{}finally{liveSending=false;if(liveTurn)liveTimer??=setTimeout(()=>void flushLive(),LIVE_GAP);}
 }
 return {
  /** Fox's turn as it streams (native-chat `worldlet:fox-live`). */
  live(turn:any){lastTurn=turn;if(turn?.done)asking=null;liveTurn=asking?{...turn,approval:asking}:turn;if(turn?.done){if(liveTimer)clearTimeout(liveTimer);liveTimer=null;void flushLive();}else liveTimer??=setTimeout(()=>void flushLive(),LIVE_GAP);},
  /** The Agent's permission prompt (`worldlet:harness-approval`): it rides with the running turn until it is settled. */
  approval(request:any){if(!request?.id)return;if(request.settled){if(asking?.id!==request.id)return;asking=null;}else asking=request;if(lastTurn&&!lastTurn.done)this.live(lastTurn);},
  /** The Center's current Now and Later rows (native-hud onAttention); sent at most every 1.5 seconds. */
  attention(next:{now:any[],later:any[]}){view=next;soon();},
  /** The Applet world changed (a world log line, a lamp, a widget): send it again if it differs. */
  world(){if(view)soon();},
  /** Fox's conversation changed (a turn started or finished): send the items' dialogue again. */
  refresh(){soon();},
  /** Accounts that need the person on the computer (the page's `worldlet:source-issues`). */
  accounts(list:Account[]){accounts=Array.isArray(list)?list:[];soon();},
 };
}
