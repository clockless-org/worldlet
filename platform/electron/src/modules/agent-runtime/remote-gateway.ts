import {REMOTE_GATEWAY_HARNESS_ID,harnessSessionThread,harnessTurnTimings,localHarnessTurn,readRemoteGatewayToken,readRemoteGatewayUrl,type RemoteGatewayAddress} from '../../../../../core/agent/index.ts';
import {WorldletError} from '../../files.ts';
import {ExecutionJournal} from './journal.ts';
import {idleStop} from './external.ts';
import {AgentCancelled,AgentEventWait,agentEvent} from './protocol.ts';
import {GatewayConversation,type GatewaySettings,type OwnSession,type ResidentSession} from './harness-sessions.ts';
import {ElsewhereAdapter} from './remote-harness.ts';
import type {Adapter,AgentEventHandler,AgentRuntime,Row} from './types.ts';

// Fox on an OpenClaw Gateway on another computer, reached directly (core/phone/README.md#an-agent-gateway-on-another-computer;
// Harness `remote-openclaw`, location `native`): no Worldlet runs there. The person types its address and token in
// Settings › Model; the token is kept in the vault (safeStorage: the OS keychain's key), never in a settings file, a
// log or what the page reads. Fox's conversation turns go to its `/v1/responses` in a session per Fox thread, the same
// GatewayConversation a local OpenClaw uses, with World tools as client function tools that run in this World; its
// exec approvals come over its WebSocket while a turn runs, once its device is approved there. Everything else stays
// with the built-in Agent on this computer (ElsewhereAdapter). Free of Electron, so scripts/remote-gateway-check.ts
// drives it against a fixture Gateway.
export type RemoteGatewaySaved={v:1;url:string;token:string;active:boolean};
type Vault={get(id:string):string|null,set(id:string,v:string):void,delete(id:string):void};
const VAULT_ID='remote-gateway';
/** The saved Gateway (address, token, whether Fox uses it now), or null. */
export function readRemoteGateway(vault:Vault):RemoteGatewaySaved|null {
 try{
  const v=JSON.parse(vault.get(VAULT_ID)??'null');
  if(v?.v!==1||typeof v.token!=='string'||!v.token)return null;
  return {v:1,url:readRemoteGatewayUrl(v.url).base,token:v.token,active:v.active===true};
 }catch{return null;}
}
export function writeRemoteGateway(vault:Vault,saved:RemoteGatewaySaved|null){if(saved)vault.set(VAULT_ID,JSON.stringify(saved));else vault.delete(VAULT_ID);}
/** What the page may see of it: the address and whether it is in use, never the token. */
export const remoteGatewayView=(saved:RemoteGatewaySaved|null)=>saved?{url:saved.url,host:readRemoteGatewayUrl(saved.url).host,active:saved.active}:null;
/** How long a request to a Gateway on another computer may take to begin answering (a check of `/v1/models`). */
const CHECK_MS=8000;
const settings=(address:RemoteGatewayAddress,token:string):GatewaySettings=>({port:0,secret:token,responses:null,base:address.base});
/** Proves a typed address and token answer (`GET /v1/models`, as a turn checks it) before Fox switches; throws why not. */
export async function checkRemoteGateway(url:unknown,token:unknown):Promise<{url:string;token:string;host:string}> {
 let address:RemoteGatewayAddress,secret:string;
 try{address=readRemoteGatewayUrl(url);secret=readRemoteGatewayToken(token);}catch(error){throw new WorldletError((error as Error).message);}
 const probe=new GatewayConversation('OpenClaw',()=>settings(address,secret),()=>{},CHECK_MS);
 const reason=await probe.unavailable();
 probe.shutdown();
 if(reason)throw new WorldletError(`Fox could not use the Gateway at ${address.host}: ${reason}.`);
 return {url:address.base,token:secret,host:address.host};
}

export class RemoteGatewayRuntime implements AgentRuntime {
 private session:ResidentSession|null=null;
 private cancelled=false;
 private eventWait:AgentEventWait|null=null;
 private readonly conversation:GatewayConversation;
 private readonly host:string;
 private readonly local:()=>AgentRuntime;
 private readonly onActivity:(running:boolean)=>void;
 /** `background`: a lane beside the conversation (makeLane): each turn in a session of its own, forgotten after it. */
 private readonly lane:'background'|undefined;
 constructor(conversation:GatewayConversation,host:string,local:()=>AgentRuntime,onActivity:(running:boolean)=>void=()=>{},lane?:'background'){this.conversation=conversation;this.host=host;this.local=local;this.onActivity=onActivity;this.lane=lane;}
 get title(){return this.conversation.title;}
 get isRunning(){return this.session!==null;}
 cancel(){this.cancelled=true;this.eventWait?.cancel();this.session?.cancel();}
 async steer(){return false;}
 status():Row {
  return {ready:true,name:this.title,provider:REMOTE_GATEWAY_HARNESS_ID,location:{kind:'remote',computer:this.host},
   capabilities:{streaming:true,tools:true,cancel:true,steer:false,memory:false,sessions:true,routines:false}};
 }
 run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  if(body.action==='status')return Promise.resolve(this.status());
  if(body.action==='warmup')return this.warm(body,home);
  // Every chat turn goes to the Gateway: the person's, and background work (a lane's, or one Worldlet started).
  if(body.action!=='chat'||typeof body.text!=='string'||!body.text.trim())return this.local().run(body,home,onEvent);
  return ExecutionJournal.run(body,home,onEvent,observed=>this.execute(body,home,observed));
 }
 /** The practice world's threads and a paired client's (core/phone remoteTurnBody) keep sessions of their own. */
 private world(body:Row){return body.sample===true?'sample':typeof body.harnessWorld==='string'&&/^remote:[A-Za-z0-9._-]{1,60}$/.test(body.harnessWorld)?body.harnessWorld:'private';}
 private key(body:Row){return {world:this.world(body),thread:harnessSessionThread(body.thread)};}
 private async warm(body:Row,home:string):Promise<Row> {
  if(this.session||body._background===true||body.mode==='setup')return {warm:false};
  try{if(await this.conversation.unavailable()!==null)return {warm:false};await this.conversation.open(this.key(body),{home,sample:body.sample===true});return {warm:true};}
  catch{return {warm:false};}
 }
 private async execute(body:Row,home:string,onEvent:AgentEventHandler):Promise<Row> {
  if(this.session)throw new WorldletError('Fox is already working.');
  this.cancelled=false;
  // Unlike a local OpenClaw there is no process to fall back to: a Gateway that does not answer is the turn's error.
  const reason=await this.conversation.unavailable();
  if(reason!==null)throw new WorldletError(`${this.title} cannot answer: ${reason}.`);
  const events=new AgentEventWait();this.eventWait=events;
  let chain:Promise<unknown>=Promise.resolve(),started=false;
  const emit=(event:Row)=>{const next=chain.then(()=>events.run(()=>onEvent(agentEvent(event))));chain=next.catch(()=>{});return next;};
  const say=async(text:string)=>{if(!text)return;if(!started){started=true;await emit({type:'response_start'});}await emit({type:'delta',text});};
  // Background work: World tools only for a check that may use them (a monitor), as on a local Agent.
  const background=this.lane==='background'||body._background===true||body.mode==='setup';
  const tools=body.allowActions!==false&&(body._background!==true||body.monitor===true);
  const turn=localHarnessTurn(body,{worldTools:tools,own:true,resident:!background});
  const opening=performance.now();
  let session:ResidentSession;
  const key=background?{world:'background',thread:'run-'+crypto.randomUUID()}:this.key(body);
  try{session=await this.conversation.open(key,{home,sample:body.sample===true});}
  catch(error){events.cancel();this.eventWait=null;throw error;}
  const sessionMs=performance.now()-opening;
  let calls=0,timedOut=false;
  const deadline=idleStop(body,()=>{timedOut=true;events.cancel(new WorldletError(`${this.title} took too long to answer. Try again.`));session.cancel();});
  // A World tool call from the Gateway runs here, in this World, as a local Agent's would.
  session.dispatch=async(name,args)=>{
   const answer=await deadline.hold(emit({type:'tool',id:`world-${++calls}`,name,args}));
   return answer&&typeof answer==='object'?answer as Row:{error:'World tool is unavailable.'};
  };
  this.session=session;if(!background)this.onActivity(true);
  let shown:Promise<unknown>=Promise.resolve(),firstText:number|null=null;const sent=performance.now();
  try{
   const result=await session.send({text:turn.prompt,instructions:turn.system,tools},event=>{
    deadline.touch();
    if(event.type==='delta'&&firstText===null&&event.text)firstText=performance.now()-sent;
    shown=event.type==='delta'?say(event.text):emit(event);
    shown.catch(()=>{});
   },{hold:work=>deadline.hold(work)});
   await shown;
   if(this.cancelled)throw new AgentCancelled();
   if(timedOut)throw new WorldletError(`${this.title} took too long to answer. Try again.`);
   const message=result.text.trim();
   if(!message)throw new WorldletError(`${this.title} did not answer.`);
   if(!started)await say(message);
   return {message,...result.usage?{usage:result.usage}:{},timings:harnessTurnTimings({sessionMs,firstTextMs:firstText??performance.now()-sent,usage:result.usage})};
  }catch(error){
   if(this.cancelled)throw new AgentCancelled();
   throw error;
  }finally{
   deadline.stop();session.dispatch=async()=>({error:'World tool is unavailable.'});
   events.cancel();this.eventWait=null;
   if(background)this.conversation.forget(session as Parameters<GatewayConversation['forget']>[0]);
   this.session=null;if(!background)this.onActivity(false);
  }
 }
}

export class RemoteGatewayAdapter extends ElsewhereAdapter implements Adapter {
 readonly id=REMOTE_GATEWAY_HARNESS_ID;
 private readonly host:string;
 readonly conversation:GatewayConversation;
 constructor(saved:{url:string;token:string},builtIn:()=>Adapter,own:OwnSession=()=>{}){
  super(builtIn);
  const address=readRemoteGatewayUrl(saved.url),token=saved.token;
  this.host=address.host;
  this.conversation=new GatewayConversation(`OpenClaw at ${address.host}`,()=>settings(address,token),own,CHECK_MS);
 }
 /** The Harness Fox talks through, for the services the World asks of it (core harnessService `remote-openclaw`). */
 get harness(){return {id:REMOTE_GATEWAY_HARNESS_ID,title:this.conversation.title};}
 make():AgentRuntime {return new RemoteGatewayRuntime(this.conversation,this.host,()=>this.b.make(),this.activity);}
 makeLane():AgentRuntime {return new RemoteGatewayRuntime(this.conversation,this.host,()=>this.b.make(),()=>{},'background');}
 /** Its exec approvals, answered on this computer's card and sent back over its WebSocket. */
 approvals(){return this.conversation.approvals;}
 async status(_home:string){return new RemoteGatewayRuntime(this.conversation,this.host,()=>this.b.make()).status();}
 warm(home:string){this.b.warm(home);}
 override async shutdown(){this.conversation.shutdown();await super.shutdown();}
 resetExplanation(){return `This deletes Worldlet’s companion archive, conversations, saved items and local connections on this computer and forgets the Gateway at ${this.host}. OpenClaw there keeps its own data. Worldlet then starts onboarding again. This cannot be undone.`;}
}
