import type {HarnessApprovalChoice,HarnessApprovalRequest} from '../../../../../contracts/harness-services.ts';
import {REMOTE_TURN_LIMITS,base64url,boxPlace,fromBase64url,openBox,pairKeys,readPairLink,readRemoteHostInfo,readRemoteToClient,remoteAssembler,remoteParts,remoteTurnRequest,sealBox,stalePhoneMessage,type PairKeys,type RemoteHostInfo,type RemoteToClient} from '../../../../../core/phone/index.ts';

// The client side of Fox on another computer's Agent (core/phone/README.md#another-computers-agent), free of Electron
// so scripts/remote-agent-check.ts drives it against the relay Worker and the host in process. It pairs with the host's
// `worldlet://agent` code in the phone's role (same keys, boxes and relay) and keeps the pairing in the vault. A turn
// sends the chat body as a sealed `turn` (this computer's instructions and view), then reads the host's messages to it:
// `events` stream the reply, each `tool` is a World tool call that runs here through `onEvent` (this World, its
// permissions) and is answered with `tool-result`, an `approval` shows the host Agent's permission prompt on this
// computer's approval card (`answer` sends the choice as `approval-answer`), and `done` ends it. Stopping sends `cancel`.
export type RemoteAgentStatus={state:'none'|'paired',computer?:string,version?:string,seenAt?:number|null,error?:string};
type Saved={secret:string,relay:string,computer:string,version?:string,agents?:RemoteHostInfo['agents']};
type Row=Record<string,unknown>;
export type RemoteAgentEvent={type:'response_start'}|{type:'delta';text:string}|{type:'progress';name:string}|{type:'status';stage:string}|{type:'tool';id:string;name:string;args:Row}|{type:'approval';request:HarnessApprovalRequest};
export type RemoteAgentOptions={
 fetch:typeof fetch,
 vault:{get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void},
 /** This computer's name and Worldlet version, shown on the host. */
 name:()=>string,
 version:string,
 userAgent:string,
 /** The host ended the pairing (or the relay forgot it), noticed at a read. */
 onEnded?:()=>void,
};
const VAULT_ID='remote-agent';
/** A host that has not reached the relay for this long is away: a line is not queued for it. */
export const REMOTE_HOST_AWAY_MS=90_000;
/** How long pairing waits for a newer `desktop` slot after one that does not name the turn protocol. */
const REMOTE_PAIR_SETTLE_MS=3_000;
const cancelled=()=>Object.assign(new Error('Cancelled.'),{name:'AbortError'});
export function createRemoteAgentLink(options:RemoteAgentOptions){
 let saved:Saved|null=null,keys:PairKeys|null=null,cursor=0,seenAt:number|null=null,error='',info:RemoteHostInfo|null=null;
 // Messages from the host for the turn waiting now; reads that overlap (a heartbeat during a turn) are told apart by id.
 let waiting:string|null=null;
 // The host Agent's permission prompts open in the turn waiting now, until answered or expired.
 const asking=new Map<string,number>();
 const inbox:RemoteToClient[]=[],taken=new Set<string>(),parts=remoteAssembler();
 try{const raw=options.vault.get(VAULT_ID);if(raw)saved=JSON.parse(raw);}catch{saved=null;}
 const save=()=>{if(saved)options.vault.set(VAULT_ID,JSON.stringify(saved));else options.vault.delete(VAULT_ID);};
 const ensureKeys=async()=>keys??=saved?await pairKeys(fromBase64url(saved.secret)):null;
 const forget=()=>{saved=null;keys=null;cursor=0;seenAt=null;info=null;inbox.length=0;save();};
 const status=():RemoteAgentStatus=>!saved?{state:'none'}:{state:'paired',computer:saved.computer,...saved.version?{version:saved.version}:{},seenAt,...error?{error}:{}};
 async function request(path:string,init:RequestInit={},timeout=20_000,signal?:AbortSignal){
  const k=await ensureKeys();if(!k||!saved)throw new Error('Pair with Worldlet on your other computer first.');
  const response=await options.fetch(saved.relay+path,{...init,headers:{'User-Agent':options.userAgent,'Content-Type':'application/json',Authorization:'Bearer '+k.phoneToken},
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)});
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok){
   // The host unpaired, or the relay forgot the pairing: forget it here too.
   if(response.status===404&&saved){forget();options.onEnded?.();}
   const e:any=new Error(response.status===404?'Worldlet on your other computer ended the pairing. Pair again with a new code from it.':body?.error||`Pairing relay answered ${response.status}.`);e.status=response.status;throw e;
  }
  return body;
 }
 /** Sends one message to the host, in parts when it is longer than one box. */
 async function post(message:{id:string,at:number}&Row,signal?:AbortSignal){
  const k=(await ensureKeys())!;
  for(const piece of remoteParts(message))await request(`/api/pair/${k.id}/messages`,{method:'POST',body:JSON.stringify({box:await sealBox(k,boxPlace('to','desktop'),piece)})},20_000,signal);
 }
 /** One read of the host's slots and messages after the cursor (`wait` seconds at most); returns the slots that opened.
  * Messages for the turn waiting now join its inbox; any other is dropped (a turn this side stopped waiting for). */
 async function read(wait=0,signal?:AbortSignal){
  const k=(await ensureKeys())!;
  const view=await request(`/api/pair/${k.id}?after=${cursor}${wait?`&wait=${wait}`:''}`,{},wait*1000+15_000,signal);
  seenAt=view.peer?.seenAt??null;error='';
  const opened:{name:string,value:unknown}[]=[];
  for(const slot of view.slots||[]){
   let value:any;try{value=await openBox(k,boxPlace('slot',slot.name),slot.box);}catch{continue;}
   if(slot.name==='desktop'&&saved){
    saved.computer=String(value?.name||saved.computer).slice(0,60);saved.version=String(value?.version||'').slice(0,40);
    info=readRemoteHostInfo(value);saved.agents=info?.agents;save();
   }
   opened.push({name:slot.name,value});
  }
  for(const m of view.messages||[]){
   let value:unknown;try{value=await openBox(k,boxPlace('to','phone'),m.box);}catch{continue;}
   if(stalePhoneMessage(value,Date.now()))continue;
   const got=readRemoteToClient(value),whole=got?.type==='part'?readRemoteToClient(parts.add(got)):got;
   const message=whole&&whole.type!=='part'?whole:null;
   if(!message||taken.has(message.id))continue;
   taken.add(message.id);if(taken.size>2000)taken.delete(taken.values().next().value!);
   if(message.turn===waiting)inbox.push(message);
  }
  cursor=Math.max(cursor,Number(view.version)||0);
  return opened;
 }
 /** Pairs with a `worldlet://agent` code. The first read completes the pairing; the host answers with its own slot at
  * its next check (every two seconds while its code waits), which proves it is there. Without it the pairing ends. */
 async function pair(text:string){
  const link=readPairLink(text,'agent');
  if(saved)await end().catch(()=>{});
  saved={secret:base64url(link.secret),relay:link.relay,computer:link.name||'your other computer'};keys=null;cursor=0;info=null;
  try{
   const k=(await ensureKeys())!;
   await read();
   await request(`/api/pair/${k.id}/slots/phone`,{method:'PUT',body:JSON.stringify({box:await sealBox(k,boxPlace('slot','phone'),{v:1,name:options.name().slice(0,60),version:options.version,kind:'agent'})})});
   // A host sends its slots' last values again when a pairing completes, just before its fresh ones, so the first
   // `desktop` slot can be one it kept from before (relay.ts publish). One without the turn protocol gets a moment for
   // a newer one before the host counts as too old.
   let answered=0;
   for(const until=Date.now()+30_000;!info&&Date.now()<(answered?Math.min(until,answered+REMOTE_PAIR_SETTLE_MS):until);)
    if((await read(answered?1:10)).some(slot=>slot.name==='desktop'))answered||=Date.now();
   if(!answered)throw new Error(`Worldlet on ${saved.computer} did not answer. Open Worldlet there, make a new code and try again.`);
   if(!info)throw new Error(`Worldlet on ${saved.computer} is too old to run Fox for this computer. Update it there, then make a new code.`);
  }catch(e){
   const k=keys;
   if(k&&saved)await request('/api/pair/'+k.id,{method:'DELETE'}).catch(()=>{});
   forget();throw e;
  }
  save();
  return status();
 }
 async function end(){
  const k=await ensureKeys();
  if(k)await request('/api/pair/'+k.id,{method:'DELETE'}).catch(e=>{if(!e?.status)throw e;});
  forget();
  return status();
 }
 /** A short read that keeps the host listening closely (it long-polls while this side reached the relay lately). */
 async function heartbeat(){
  if(!saved)return status();
  try{await read();}catch(e){error=(e as Error).message;}
  return status();
 }
 /** One of Fox's turns on the host's Agent: `body` is the chat body agentChat gives the Agent. Events stream as the host
  * sends them; a `tool` event is a World tool call, and what `onEvent` returns for it goes back as its answer. */
 async function turn(body:Row,onEvent:(event:RemoteAgentEvent)=>unknown,signal?:AbortSignal){
  const k=await ensureKeys();
  if(!k||!saved)throw new Error('Pair with Worldlet on your other computer first.');
  if(waiting)throw new Error('Fox is already working.');
  await read(0,signal);
  const computer=saved.computer;
  if(!seenAt||Date.now()-seenAt>REMOTE_HOST_AWAY_MS)throw new Error(`Worldlet on ${computer} is away${seenAt?' (last seen '+new Date(seenAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})+')':''}. Wake it and open Worldlet there, then try again.`);
  if(!info)throw new Error(`Worldlet on ${computer} is too old to run Fox for this computer. Update it there.`);
  const id=crypto.randomUUID(),turnRequest=remoteTurnRequest(body,{id,at:Date.now()});
  if(!turnRequest.text.trim())throw new Error('Fox needs a message.');
  const stop=()=>void post({type:'cancel',id:crypto.randomUUID(),at:Date.now(),turn:id}).catch(()=>{});
  waiting=id;inbox.length=0;asking.clear();
  let last=Date.now(),heard=false,said='',started=false,finished:Extract<RemoteToClient,{type:'done'}>|null=null;
  try{
   await post(turnRequest,signal);
   while(!finished){
    if(signal?.aborted){stop();throw cancelled();}
    // While a permission prompt waits for the person, the host waits as long.
    const open=[...asking.values()].some(until=>until>Date.now());
    if(Date.now()-last>(open?REMOTE_TURN_LIMITS.approvalMs:heard?REMOTE_TURN_LIMITS.idleMs:REMOTE_TURN_LIMITS.startMs)){stop();throw new Error(`Worldlet on ${computer} did not answer. Check that it is awake and open, then try again.`);}
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
      await post({type:'tool-result',id:crypto.randomUUID(),at:Date.now(),turn:id,call:message.call,result:answer},signal);
      last=Date.now();
     }
    }
   }
  }finally{waiting=null;inbox.length=0;asking.clear();}
  if(finished.cancelled)throw cancelled();
  if(finished.error)throw new Error(finished.error);
  const message=finished.message||said;
  if(!started&&message){await onEvent({type:'response_start'});await onEvent({type:'delta',text:message});}
  return {message};
 }
 /** The person's answer on this computer's card to a prompt of the host's Agent in the turn running now. */
 async function answer(approval:string,choice:HarnessApprovalChoice){
  const turnId=waiting,until=asking.get(approval);
  if(!turnId||!until||until<Date.now())throw new Error('This request was already answered or has expired.');
  asking.delete(approval);
  await post({type:'approval-answer',id:crypto.randomUUID(),at:Date.now(),turn:turnId,approval,choice});
 }
 return {status,pair,end,heartbeat,turn,answer,
  /** The person's agents on the host (its `agents` service), from its last `desktop` slot. */
  agents:()=>(info?.agents??saved?.agents??[]).map(a=>({...a})),
  get paired(){return !!saved;}};
}
export type RemoteAgentLink=ReturnType<typeof createRemoteAgentLink>;
