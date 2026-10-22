import type {HarnessApprovalChoice,HarnessApprovalRequest} from '../../../../contracts/harness-services.ts';
import {REMOTE_TURN_LIMITS,ROOM_LINK_MODE,base64url,boxPlace,fromBase64url,openBox,pairKeys,readPairLink,readRemoteHostInfo,readRemoteToClient,readRoomFrame,remoteAssembler,remoteParts,remoteTurnRequest,roomEntry,sealBox,stalePhoneMessage,type PairKeys,type RemoteHostInfo,type RemoteToClient,type RoomFrame,type RoomSocketFactory} from '../../../web/index.ts';

// The client side of Fox on another computer's Agent (platform/web/README.md#another-computers-agent), free of Electron
// so scripts/remote-agent-check.ts drives it with the host in process. It pairs with the host's `worldlet://agent` code
// in the phone's role (same keys and boxes) and meets the host in the pairing room (platform/web/README.md#room), which
// passes frames only while both are connected and keeps nothing; the pairing stays in the vault. A turn sends the chat
// body as a sealed `turn` (this computer's instructions and view), then takes the host's messages to it: `events` stream
// the reply, each `tool` is a World tool call that runs here through `onEvent` (this World, its permissions) and is
// answered with `tool-result`, an `approval` shows the host Agent's permission prompt on this computer's approval card
// (`answer` sends the choice as `approval-answer`), and `done` ends it. Stopping sends `cancel`.
export type RemoteAgentStatus={state:'none'|'paired',computer?:string,version?:string,seenAt?:number|null,error?:string};
type Saved={secret:string,relay:string,computer:string,version?:string,agents?:RemoteHostInfo['agents'],room?:true};
type Row=Record<string,unknown>;
export type RemoteAgentEvent={type:'response_start'}|{type:'delta';text:string}|{type:'progress';name:string}|{type:'status';stage:string}|{type:'tool';id:string;name:string;args:Row}|{type:'approval';request:HarnessApprovalRequest};
export type RemoteAgentOptions={
 vault:{get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void},
 /** This computer's name and Worldlet version, shown on the host. */
 name:()=>string,
 version:string,
 /** The host ended the pairing, heard in the room. */
 onEnded?:()=>void,
 /** Replaces the global WebSocket in checks. */
 WebSocket?:RoomSocketFactory,
};
const VAULT_ID='remote-agent';
/** How long pairing waits for a newer `desktop` slot after one that does not name the turn protocol. */
const REMOTE_PAIR_SETTLE_MS=3_000;
/** How long a read waits for the room to say whether the host is there. */
const REMOTE_ROOM_HEAR_MS=5_000;
const cancelled=()=>Object.assign(new Error('Cancelled.'),{name:'AbortError'});
export function createRemoteAgentLink(options:RemoteAgentOptions){
 let saved:Saved|null=null,keys:PairKeys|null=null,seenAt:number|null=null,error='',info:RemoteHostInfo|null=null;
 // The room: the socket while connected, whether the host is in it, whether the room said so yet, and whatever waits
 // for the next thing to arrive.
 let socket:InstanceType<RoomSocketFactory>|null=null,computer=false,heard=false,fresh=false,desktopAt=0;
 const waiters=new Set<()=>void>();
 // The turns waiting now (the person's, and background work beside it): each its messages from the host and the host
 // Agent's permission prompts open in it, until answered or expired. Messages for any other turn are dropped.
 type Waiting={lane:'person'|'background',inbox:RemoteToClient[],asking:Map<string,number>};
 const waiting=new Map<string,Waiting>();
 const LANES=2;
 const taken=new Set<string>(),parts=remoteAssembler();
 try{const raw=options.vault.get(VAULT_ID);if(raw)saved=JSON.parse(raw);}catch{saved=null;}
 const save=()=>{if(saved)options.vault.set(VAULT_ID,JSON.stringify(saved));else options.vault.delete(VAULT_ID);};
 // A pairing made on the relay before (2026-10-21: the relay's phone API is gone) is forgotten: pair again.
 if(saved&&!saved.room){saved=null;save();}
 const ensureKeys=async()=>keys??=saved?await pairKeys(fromBase64url(saved.secret)):null;
 const wake=()=>{fresh=true;for(const resolve of [...waiters])resolve();};
 const leave=()=>{const ws=socket;socket=null;if(computer){computer=false;seenAt=Date.now();}heard=false;try{ws?.close(1000);}catch{}};
 const forget=()=>{leave();saved=null;keys=null;seenAt=null;info=null;desktopAt=0;for(const turn of waiting.values())turn.inbox.length=0;save();wake();};
 const status=():RemoteAgentStatus=>!saved?{state:'none'}:{state:'paired',computer:saved.computer,...saved.version?{version:saved.version}:{},seenAt:computer?Date.now():seenAt,...error?{error}:{}};
 const away=()=>`Worldlet on ${saved?.computer||'your other computer'} is away${seenAt?' (last seen '+new Date(seenAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})+')':''}. Wake it and open Worldlet there, then try again.`;
 function frame(value:RoomFrame){
  if(socket?.readyState!==1||!computer)throw new Error(away());
  socket.send(JSON.stringify({data:JSON.stringify(value)}));
 }
 const introduce=async()=>{const k=await ensureKeys();if(k&&computer)frame({s:'phone',b:await sealBox(k,boxPlace('slot','phone'),{v:1,name:options.name().slice(0,60),version:options.version,kind:'agent'})});};
 async function receive(ws:InstanceType<RoomSocketFactory>,text:unknown){
  if(socket!==ws||!saved)return;
  let event:any;try{event=JSON.parse(String(text));}catch{return;}
  const k=(await ensureKeys())!;
  if(event?.t==='desktop'){
   computer=event.online===true;heard=true;seenAt=Date.now();
   if(computer)await introduce().catch(()=>{});
   wake();return;
  }
  if(event?.t!=='msg'||event.from!=='desktop')return;
  const value=readRoomFrame(event.data);if(!value)return;
  try{
   if('s' in value&&value.s==='desktop'){
    const slot:any=await openBox(k,boxPlace('slot','desktop'),value.b);
    saved.computer=String(slot?.name||saved.computer).slice(0,60);saved.version=String(slot?.version||'').slice(0,40);
    info=readRemoteHostInfo(slot);saved.agents=info?.agents;desktopAt||=Date.now();save();
   }else if('m' in value){
    const sealed=await openBox(k,boxPlace('to','phone'),value.m);
    if(stalePhoneMessage(sealed,Date.now()))return;
    const got=readRemoteToClient(sealed),whole=got?.type==='part'?readRemoteToClient(parts.add(got)):got;
    const message=whole&&whole.type!=='part'?whole:null;
    if(!message||taken.has(message.id))return;
    taken.add(message.id);if(taken.size>2000)taken.delete(taken.values().next().value!);
    waiting.get(message.turn)?.inbox.push(message);
   }else if('e' in value){
    // The host ended the pairing.
    await openBox(k,boxPlace('slot','end'),value.e);forget();options.onEnded?.();return;
   }else return;
  }catch{return;/* Not sealed with this pairing's key: dropped. */}
  wake();
 }
 async function connect(){
  if(!saved||socket&&socket.readyState<=1)return;
  const k=(await ensureKeys())!;
  const WS=options.WebSocket??(globalThis as unknown as {WebSocket:RoomSocketFactory}).WebSocket;
  const {url,protocols}=await roomEntry(k,saved.relay,'phone'),ws=new WS(url,protocols);
  socket=ws;heard=false;
  // One at a time, in order, as the room sent them.
  let queue=Promise.resolve();
  ws.onmessage=event=>{queue=queue.then(()=>receive(ws,event.data));};
  ws.onclose=()=>{if(socket!==ws)return;socket=null;if(computer){computer=false;seenAt=Date.now();}heard=true;wake();};
  ws.onerror=()=>{if(socket===ws)error='Could not reach the pairing room.';};
  ws.onopen=()=>{if(socket===ws)error='';};
 }
 /** Waits up to `seconds` for something new from the room (or `signal`). */
 async function news(seconds:number,signal?:AbortSignal){
  if(fresh||signal?.aborted)return;
  await new Promise<void>(resolve=>{
   const timer=setTimeout(done,seconds*1000);signal?.addEventListener('abort',done);
   function done(){clearTimeout(timer);waiters.delete(done);signal?.removeEventListener('abort',done);resolve();}
   waiters.add(done);
  });
 }
 /** Connects when needed and waits (`wait` seconds at most) for news; the first read waits until the room says whether
  * the host is there. */
 async function read(wait=0,signal?:AbortSignal){
  await connect();
  const until=Date.now()+REMOTE_ROOM_HEAR_MS;
  while(!heard&&saved&&Date.now()<until&&!signal?.aborted){fresh=false;await news((until-Date.now())/1000,signal);}
  if(wait)await news(wait,signal);
  fresh=false;
 }
 /** Sends one message to the host, in parts when it is longer than one box. */
 async function post(message:{id:string,at:number}&Row){
  const k=(await ensureKeys())!;
  for(const piece of remoteParts(message))frame({m:await sealBox(k,boxPlace('to','desktop'),piece)});
 }
 /** Pairs with a `worldlet://agent` code. Meeting the host in the room completes the pairing; the host answers with its
  * `desktop` slot at its next check, which proves it is there. Without it the pairing ends. */
 async function pair(text:string){
  const link=readPairLink(text,'agent');
  if(new URLSearchParams(text.slice(text.indexOf('?')+1)).get('m')!==ROOM_LINK_MODE)throw new Error('This code is from an older Worldlet. Update Worldlet on your other computer, then make a new code.');
  if(saved)await end().catch(()=>{});
  saved={secret:base64url(link.secret),relay:link.relay,computer:link.name||'your other computer',room:true};keys=null;info=null;desktopAt=0;
  try{
   // A host whose `desktop` slot does not name the turn protocol gets a moment for a newer one before it counts as too old.
   for(const until=Date.now()+30_000;saved&&!info&&Date.now()<(desktopAt?Math.min(until,desktopAt+REMOTE_PAIR_SETTLE_MS):until);)await read(1);
   if(!saved)throw new Error('Worldlet on your other computer ended the pairing.');
   if(!desktopAt)throw new Error(`Worldlet on ${saved.computer} did not answer. Open Worldlet there, make a new code and try again.`);
   if(!info)throw new Error(`Worldlet on ${saved.computer} is too old to run Fox for this computer. Update it there, then make a new code.`);
  }catch(e){
   await end().catch(()=>{});throw e;
  }
  save();
  return status();
 }
 /** Ends the pairing: the host hears it when it is in the room now. */
 async function end(){
  const k=await ensureKeys().catch(()=>null);
  if(k)try{frame({e:await sealBox(k,boxPlace('slot','end'),{end:true})});}catch{}
  forget();
  return status();
 }
 /** A short read that keeps the room open, so the host is seen. */
 async function heartbeat(){
  if(!saved)return status();
  try{await read();}catch(e){error=(e as Error).message;}
  return status();
 }
 /** One of Fox's turns on the host's Agent: `body` is the chat body agentChat gives the Agent. Events stream as the host
  * sends them; a `tool` event is a World tool call, and what `onEvent` returns for it goes back as its answer.
  * `lane` background: work beside the conversation (an Attention check, an Applet task), up to two at once, run on the
  * host's background lane; a host that does not say it runs them (`lanes`) is sent none. */
 async function turn(body:Row,onEvent:(event:RemoteAgentEvent)=>unknown,signal?:AbortSignal,lane?:'background'){
  if(!saved)throw new Error('Pair with Worldlet on your other computer first.');
  const kind=lane==='background'?'background':'person',busy=[...waiting.values()].filter(turn=>turn.lane===kind).length;
  if(kind==='person'?busy>0:busy>=LANES)throw new Error(kind==='person'?'Fox is already working.':'Fox is busy with other background work. Try again later.');
  await read(0,signal);
  if(!saved)throw new Error('Pair with Worldlet on your other computer first.');
  const name=saved.computer;
  if(!computer)throw new Error(away());
  if(!info)throw new Error(`Worldlet on ${name} is too old to run Fox for this computer. Update it there.`);
  if(kind==='background'&&!info.lanes)throw new Error(`Worldlet on ${name} needs an update to run Fox’s background work. Update it there.`);
  const id=crypto.randomUUID(),turnRequest=remoteTurnRequest(body,{id,at:Date.now(),...lane?{lane}:{}});
  if(!turnRequest.text.trim())throw new Error('Fox needs a message.');
  const stop=()=>void post({type:'cancel',id:crypto.randomUUID(),at:Date.now(),turn:id}).catch(()=>{});
  const mine:Waiting={lane:kind,inbox:[],asking:new Map()},{inbox,asking}=mine;
  waiting.set(id,mine);
  let last=Date.now(),heard=false,said='',started=false,finished:Extract<RemoteToClient,{type:'done'}>|null=null;
  try{
   await post(turnRequest);
   while(!finished){
    if(signal?.aborted){stop();throw cancelled();}
    if(!saved)throw new Error('Worldlet on your other computer ended the pairing. Pair again with a new code from it.');
    // While a permission prompt waits for the person, the host waits as long.
    const open=[...asking.values()].some(until=>until>Date.now());
    if(Date.now()-last>(open?REMOTE_TURN_LIMITS.approvalMs:heard?REMOTE_TURN_LIMITS.idleMs:REMOTE_TURN_LIMITS.startMs)){stop();throw new Error(`Worldlet on ${name} did not answer. Check that it is awake and open, then try again.`);}
    if(!inbox.length)try{await read(15,signal);}catch(e){if(signal?.aborted){stop();throw cancelled();}throw e;}
    for(const message of inbox.splice(0)){
     last=Date.now();heard=true;
     if(message.type==='done'){finished=message;break;}
     if(message.type==='approval'){asking.set(message.request.id,message.request.expiresAt??Date.now()+REMOTE_TURN_LIMITS.approvalMs);await onEvent({type:'approval',request:message.request});}
     if(message.type==='events')for(const event of message.events){
      if(event.type==='delta'){said+=event.text;started=true;}else if(event.type==='response_start')started=true;
      await onEvent(event);
     }
     if(message.type==='tool'){
      // Runs here, in this World, as a local Agent's call would; a step this side refuses is the Agent's error.
      let result:unknown;
      try{result=await onEvent({type:'tool',id:message.call,name:message.name,args:message.args});}
      catch(e){if(signal?.aborted||(e as Error)?.name==='AbortError'){stop();throw e;}result={error:(e as Error)?.message||'World tool failed.'};}
      let answer:Row=result&&typeof result==='object'&&!Array.isArray(result)?result as Row:{error:'World tool is unavailable.'};
      if(JSON.stringify(answer).length>REMOTE_TURN_LIMITS.result)answer={error:'The result was too large to send to the other computer.'};
      await post({type:'tool-result',id:crypto.randomUUID(),at:Date.now(),turn:id,call:message.call,result:answer});
      last=Date.now();
     }
    }
   }
  }finally{waiting.delete(id);}
  if(finished.cancelled)throw cancelled();
  if(finished.error)throw new Error(finished.error);
  const message=finished.message||said;
  if(!started&&message){await onEvent({type:'response_start'});await onEvent({type:'delta',text:message});}
  return {message};
 }
 /** The person's answer on this computer's card to a prompt of the host's Agent in a turn running now. */
 async function answer(approval:string,choice:HarnessApprovalChoice){
  const [turnId,turn]=[...waiting].find(([,turn])=>turn.asking.has(approval))??[];
  const until=turn?.asking.get(approval);
  if(!turnId||!turn||!until||until<Date.now())throw new Error('This request was already answered or has expired.');
  turn.asking.delete(approval);
  await post({type:'approval-answer',id:crypto.randomUUID(),at:Date.now(),turn:turnId,approval,choice});
 }
 return {status,pair,end,heartbeat,turn,answer,
  /** The person's agents on the host (its `agents` service), from its last `desktop` slot. */
  agents:()=>(info?.agents??saved?.agents??[]).map(a=>({...a})),
  /** Whether the host runs background work beside the conversation (`lanes`). */
  get lanes(){return info?.lanes===true;},
  get paired(){return !!saved;}};
}
export type RemoteAgentLink=ReturnType<typeof createRemoteAgentLink>;
