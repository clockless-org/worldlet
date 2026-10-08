// Fox on another computer's Agent (README.md#another-computers-agent). A Worldlet whose Harness location is remote
// pairs with the Worldlet on that computer as a phone does and sends it each of Fox's turns as a sealed `turn` message
// with this computer's instructions and view; the host runs it on its own Agent in a session per Fox thread, streams it
// back as `events`, asks for each World tool call with `tool` (run here, under this computer's permissions, answered
// with `tool-result`), forwards its Agent's permission prompts as `approval` (answered with `approval-answer`; none in
// time is Deny) and ends it with `done`; `cancel` stops it there. A message too long for one box goes as `part`s.
// Shared rules only: the message shapes and bounds, the turn body the host runs and the parts. The relay calls belong
// to the hosts (platform/electron/src/modules/phone/remote.ts and remote-host.ts).
import {base64url,fromBase64url} from './pairing.ts';
import {harnessSessionThread,harnessThreadPlace,isHarnessAgentId,isHarnessApprovalChoice,readHarnessApprovalRequest,readWorldSince} from '../agent/index.ts';
import type {HarnessApprovalChoice,HarnessApprovalRequest} from '../../contracts/harness-services.ts';

/** The turn protocol a host speaks; it says so in its `desktop` slot, so a client never sends a turn to an older one. */
export const REMOTE_AGENT_VERSION=2;
/** `startMs`: a host may take this long to start a turn (`skewMs` more by its own clock); `idleMs`: then this long
 * between messages (`toolMs` for a World tool here). `partBytes`: the most one message carries (a 256 KiB box holds it base64-encoded twice, sealed). */
export const REMOTE_TURN_LIMITS=Object.freeze({startMs:120_000,skewMs:300_000,idleMs:300_000,toolMs:600_000,approvalMs:600_000,partBytes:96_000,parts:40,partsAlive:600_000,
 text:20_000,instructions:40_000,view:60_000,history:6,historyText:2000,step:400,events:400,result:1_000_000,reply:1_000_000});
type Row=Record<string,unknown>;
export type RemoteHistory={role:'user'|'assistant';text:string};
/** Client to host. */
export type RemoteTurnRequest={type:'turn';id:string;at:number;text:string;thread:string;instructions:string;view:Row;history:RemoteHistory[];agent?:string;session?:string;world?:string};
export type RemoteToolResult={type:'tool-result';id:string;at:number;turn:string;call:string;result:Row};
export type RemoteCancel={type:'cancel';id:string;at:number;turn:string};
export type RemoteApprovalAnswer={type:'approval-answer';id:string;at:number;turn:string;approval:string;choice:HarnessApprovalChoice};
export type RemoteToHost=RemoteTurnRequest|RemoteToolResult|RemoteCancel|RemoteApprovalAnswer;
/** Host to client. */
/** `status`: the Agent there is still working (a long model wait), which keeps the client waiting. */
export type RemoteTurnEvent={type:'response_start'}|{type:'delta';text:string}|{type:'progress';name:string}|{type:'status';stage:string};
export type RemoteEvents={type:'events';id:string;at:number;turn:string;events:RemoteTurnEvent[]};
export type RemoteToolCall={type:'tool';id:string;at:number;turn:string;call:string;name:string;args:Row};
export type RemoteDone={type:'done';id:string;at:number;turn:string;message?:string;error?:string;cancelled?:true};
/** A permission prompt of the Agent there, shown on the client's approval card; `expiresAt` is the client's deadline. */
export type RemoteApproval={type:'approval';id:string;at:number;turn:string;request:HarnessApprovalRequest};
export type RemoteToClient=RemoteEvents|RemoteToolCall|RemoteDone|RemoteApproval;
/** Either way: one piece of a message longer than `partBytes` (its JSON's UTF-8 bytes, base64url). */
export type RemotePart={type:'part';id:string;at:number;whole:string;index:number;of:number;data:string};
/** What the host's `desktop` slot adds for its client: the protocol and the person's agents there (contracts `agents`). */
export type RemoteHostInfo={v:number;agents:{id:string;name:string;model?:string;main?:true}[]};

const record=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):'';
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const id=(value:unknown)=>typeof value==='string'&&ID.test(value)?value:'';
const at=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:0;
const size=(value:unknown)=>JSON.stringify(value)?.length??0;
const THREAD=/^(main|item:[^\u0000]{1,200}|applet:[^\u0000]{1,120})$/;
const history=(value:unknown):RemoteHistory[]=>(Array.isArray(value)?value:[]).map(record).filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.text==='string'&&m.text.trim())
 .slice(-REMOTE_TURN_LIMITS.history).map(m=>({role:m.role as RemoteHistory['role'],text:text(m.text,REMOTE_TURN_LIMITS.historyText)}));

/** A view that fits: the largest parts of what the person is looking at are left out first. */
export function fitRemoteView(view:unknown,limit:number=REMOTE_TURN_LIMITS.view):Row {
 const fitted={...record(view)};
 while(Object.keys(fitted).length&&size(fitted)>limit){
  const largest=Object.keys(fitted).sort((a,b)=>size(fitted[b])-size(fitted[a]))[0];
  delete fitted[largest];
 }
 return fitted;
}
const worldNote=(value:unknown)=>{const note=readWorldSince(value);return note?{world:note}:{};};
/** The `turn` a client sends for one of Fox's chat turns (the body agentChat gives the Agent): the line, the Fox thread
 * it is said in, the companion's instructions (`style`: personality, memory, guidance), the current view (`context`),
 * the last turns for a Harness without sessions, the person's agent chosen for the thread there, and what happened in
 * that computer's World since the thread last replied (`world`, core/agent/world-since.ts). */
export function remoteTurnRequest(body:unknown,{id:turn,at:sent}:{id:string;at:number}):RemoteTurnRequest {
 const input=record(body);
 const session=typeof input.session==='string'?input.session.replace(/[^A-Za-z0-9_.:-]+/g,'-').slice(0,100):'';
 return {type:'turn',id:turn,at:sent,text:text(input.text,REMOTE_TURN_LIMITS.text),thread:harnessSessionThread(input.thread),instructions:text(input.style,REMOTE_TURN_LIMITS.instructions),
  view:fitRemoteView(input.context),history:history(input.history),...isHarnessAgentId(input.harnessAgent)?{agent:input.harnessAgent}:{},...session?{session}:{},...worldNote(input.worldSince)};
}
/** What the host takes from its client once the box opened: a turn, a tool's answer, a cancel or a part of one. Nothing
 * a phone sends (a chat line, an item action, an Order, a widget edit, a web record) is read. */
export function readRemoteToHost(value:unknown):RemoteToHost|RemotePart|null {
 const v=record(value),mid=id(v.id),sent=at(v.at);
 if(!mid||!sent)return null;
 if(v.type==='part')return readPart(v,mid,sent);
 if(v.type==='turn'){
  const line=text(v.text,REMOTE_TURN_LIMITS.text);
  if(!line.trim()||typeof v.thread!=='string'||!THREAD.test(v.thread))return null;
  const session=typeof v.session==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v.session)?v.session:'';
  return {type:'turn',id:mid,at:sent,text:line,thread:v.thread,instructions:text(v.instructions,REMOTE_TURN_LIMITS.instructions),view:fitRemoteView(v.view),history:history(v.history),
   ...isHarnessAgentId(v.agent)?{agent:v.agent}:{},...session?{session}:{},...worldNote(v.world)};
 }
 const turn=id(v.turn);
 if(!turn)return null;
 if(v.type==='tool-result'){const call=id(v.call),result=record(v.result);return call&&size(result)<=REMOTE_TURN_LIMITS.result?{type:'tool-result',id:mid,at:sent,turn,call,result}:null;}
 if(v.type==='cancel')return {type:'cancel',id:mid,at:sent,turn};
 if(v.type==='approval-answer'){const approval=id(v.approval);return approval&&isHarnessApprovalChoice(v.choice)?{type:'approval-answer',id:mid,at:sent,turn,approval,choice:v.choice}:null;}
 return null;
}
/** What the client takes from its host for the turn it waits on. */
export function readRemoteToClient(value:unknown):RemoteToClient|RemotePart|null {
 const v=record(value),mid=id(v.id),sent=at(v.at);
 if(!mid||!sent)return null;
 if(v.type==='part')return readPart(v,mid,sent);
 const turn=id(v.turn);
 if(!turn)return null;
 if(v.type==='events'){
  const events:RemoteTurnEvent[]=[];
  for(const e of (Array.isArray(v.events)?v.events:[]).slice(0,REMOTE_TURN_LIMITS.events).map(record)){
   if(e.type==='response_start')events.push({type:'response_start'});
   else if(e.type==='delta'&&typeof e.text==='string'&&e.text)events.push({type:'delta',text:e.text.slice(0,REMOTE_TURN_LIMITS.reply)});
   else if(e.type==='progress'&&typeof e.name==='string'&&e.name.trim())events.push({type:'progress',name:e.name.trim().slice(0,REMOTE_TURN_LIMITS.step)});
   else if(e.type==='status'&&typeof e.stage==='string'&&/^[a-z_-]{1,40}$/.test(e.stage))events.push({type:'status',stage:e.stage});
  }
  return {type:'events',id:mid,at:sent,turn,events};
 }
 if(v.type==='tool'){
  const call=id(v.call),name=typeof v.name==='string'&&/^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/.test(v.name)?v.name:'';
  return call&&name?{type:'tool',id:mid,at:sent,turn,call,name,args:record(v.args)}:null;
 }
 if(v.type==='approval'){const request=readHarnessApprovalRequest(v.request);return request?{type:'approval',id:mid,at:sent,turn,request}:null;}
 if(v.type==='done'){
  if(v.cancelled===true)return {type:'done',id:mid,at:sent,turn,cancelled:true};
  if(typeof v.error==='string'&&v.error.trim())return {type:'done',id:mid,at:sent,turn,error:v.error.trim().slice(0,2000)};
  return {type:'done',id:mid,at:sent,turn,message:text(v.message,REMOTE_TURN_LIMITS.reply)};
 }
 return null;
}
function readPart(v:Row,mid:string,sent:number):RemotePart|null {
 const whole=id(v.whole),index=Number(v.index),of=Number(v.of),data=typeof v.data==='string'&&/^[A-Za-z0-9_-]+$/.test(v.data)?v.data:'';
 if(!whole||!data||!Number.isInteger(of)||of<2||of>REMOTE_TURN_LIMITS.parts||!Number.isInteger(index)||index<0||index>=of||data.length>Math.ceil(REMOTE_TURN_LIMITS.partBytes*4/3)+4)return null;
 return {type:'part',id:mid,at:sent,whole,index,of,data};
}
/** The chat body the host's Agent runs for its client's turn: that computer's instructions and view, the session of that
 * Fox thread in `world` (the client's, apart from the host's own threads) and the agent chosen there when the host has it. */
export function remoteTurnBody(turn:RemoteTurnRequest,{world,agents}:{world:string;agents:readonly string[]}):Row {
 return {action:'chat',mode:'chat',session:'remote-'+(turn.session||'main'),text:turn.text,history:turn.history,context:turn.view,thread:harnessThreadPlace(turn.thread),
  style:turn.instructions,harnessWorld:world,...turn.agent&&agents.includes(turn.agent)?{harnessAgent:turn.agent}:{},...turn.world?{worldSince:turn.world}:{}};
}
/** The session world of a client's threads on the host, from the client's name. */
export const remoteSessionWorld=(client:string)=>'remote:'+(client.replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'computer');

/** The messages that carry `message`: itself when it fits one box, else its parts in order. */
export function remoteParts<M extends {id:string;at:number}>(message:M):(M|RemotePart)[] {
 const bytes=new TextEncoder().encode(JSON.stringify(message)),step=REMOTE_TURN_LIMITS.partBytes;
 if(bytes.length<=step)return [message];
 const of=Math.ceil(bytes.length/step);
 if(of>REMOTE_TURN_LIMITS.parts)throw Error('This message is too long to send to the other computer.');
 return Array.from({length:of},(_,index)=>({type:'part' as const,id:message.id+'.'+index,at:message.at,whole:message.id,index,of,data:base64url(bytes.subarray(index*step,(index+1)*step))}));
}
/** Puts parts back together: `add` returns the whole message once its last part arrived, else null. A message whose
 * parts stop coming is dropped after `partsAlive`, and at most four are pieced together at once. */
export function remoteAssembler(now:()=>number=Date.now){
 const pending=new Map<string,{of:number;parts:(string|undefined)[];count:number;since:number}>();
 return {add(part:RemotePart):unknown {
  for(const [key,value] of pending)if(now()-value.since>REMOTE_TURN_LIMITS.partsAlive)pending.delete(key);
  let entry=pending.get(part.whole);
  if(!entry){
   if(pending.size>=4)pending.delete(pending.keys().next().value!);
   entry={of:part.of,parts:new Array(part.of).fill(undefined),count:0,since:now()};pending.set(part.whole,entry);
  }
  if(entry.of!==part.of||entry.parts[part.index]!==undefined)return null;
  entry.parts[part.index]=part.data;entry.count++;
  if(entry.count<entry.of)return null;
  pending.delete(part.whole);
  const chunks=entry.parts.map(data=>fromBase64url(data!)),bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));
  let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
 }};
}
/** The `agent` field a host adds to its `desktop` slot for its client: the protocol and the person's agents there. */
export function remoteHostInfo(agents:readonly {id:string;name:string;model?:string;main?:boolean}[]):RemoteHostInfo {
 return {v:REMOTE_AGENT_VERSION,agents:agents.filter(a=>isHarnessAgentId(a.id)&&a.name).slice(0,50).map(a=>({id:a.id,name:a.name.slice(0,80),...a.model?{model:a.model.slice(0,80)}:{},...a.main?{main:true as const}:{}}))};
}
/** The client's reading of it; an older host has none and is sent no turn. */
export function readRemoteHostInfo(value:unknown):RemoteHostInfo|null {
 const v=record(record(value).agent);
 if(typeof v.v!=='number'||!Number.isInteger(v.v)||v.v<REMOTE_AGENT_VERSION)return null;
 return remoteHostInfo((Array.isArray(v.agents)?v.agents:[]).map(record).filter(a=>typeof a.name==='string'&&typeof a.id==='string')
  .map(a=>({id:a.id as string,name:(a.name as string).trim(),...typeof a.model==='string'?{model:a.model}:{},main:a.main===true})));
}
