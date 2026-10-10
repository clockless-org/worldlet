import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {hermesRequestModel,WORLD_TOOL_SERVER,acpApprovalOutcome,acpModels,acpPromptUsage,acpUsageUpdate,addHarnessUsage,isHarnessModelId,usageSince,acpChangesAsked,acpChangesUpdate,approvalChanges,changesAnswered,changesAsked,isHarnessAgentId,acpApprovalRequest,harnessSessionName,openClawApprovalFor,openClawApprovalRequest,openClawChangesEvent,openClawConnect,openClawDecision,openClawDeviceProof,
 harnessTurnText,openClawResponsesBody,openClawSessionIs,openClawUserInput,readOpenClawFrame,hermesAcpAnnouncement,readResponsesChunk,remoteGatewaySocketUrl,responsesBody,responsesStream,type ApprovalChanges,type HermesAnnouncedCall,type ResponsesTool,type ResponsesTurn} from '../../../../../core/agent/index.ts';
import {worldGatewayTools} from '../../../../../core/tools/index.ts';
import type {HarnessApprovalChoice,HarnessApprovalRequest,HarnessApprovalResult,HarnessApprovals,HarnessConversation,HarnessModel,HarnessSession,HarnessSessionKey,HarnessTurnEvent,HarnessTurnInput,HarnessUsage} from '../../../../../contracts/harness-services.ts';
import {WorldletError,writeAtomic} from '../../files.ts';
import {AgentCancelled,stopChild} from './protocol.ts';
import {openWorldToolBridge,worldGateway,type WorldToolBridge} from './world-tool-bridge.ts';
import type {Row} from './types.ts';

// Resident sessions for the person's own Agent (contracts/harness-services.ts `conversation` and `approvals`): one
// Harness session per Fox thread that keeps the context, so a turn sends only the new line. Hermes Agent: one
// long-lived `hermes acp` process, `session/new` (or `session/load` after a restart) once per thread and
// `session/prompt` per turn, its permission prompts surfaced as approval events. OpenClaw: its running Gateway's
// `/v1/responses`, a session key per thread, World tools as client function tools, and while a turn runs its exec
// approvals for that session from the Gateway's WebSocket, answered there (GatewayApprovals). Core owns the rules
// (core/agent/harness-sessions.ts); LocalHarnessRuntime falls back to a process per turn when `unavailable` says why.
// A thread answered by another of the person's agents (HarnessSessionKey.agent, the `agents` service): Hermes Agent
// runs one `hermes -p <profile> acp` process per profile (AgentConversations); OpenClaw's Gateway takes the agent per
// request (`openclaw/<id>`).
// What an approved action changed (`approval_result`, core/agent/harness-approvals.ts): Hermes Agent's ACP tool calls
// report their diffs as they start and finish; OpenClaw's Gateway sends the turn's tool events to a client that
// subscribes to its session (`sessions.messages.subscribe`, scope operator.read), an exec's output but no files.
// Model and usage (the `models` service, core/agent/harness-models.ts and harness-usage.ts): an Applet's chosen model is
// set with ACP `session/set_model` before its turn (and again back to the Agent's own when the choice goes), or sent as
// OpenClaw's `x-openclaw-model` header; each turn resolves with the usage the Agent reported. `open` is idempotent, also
// while a first open is still under way, so the World can open a thread's session as the person starts typing.
// Hermes Agent's resident API server (owner decision 2026-10-08: one path to whichever Hermes Agent Fox uses, kept
// running as a service, agent-runtime/hermes-service.ts): `/v1/responses` like OpenClaw's Gateway, a session key per
// thread (`X-Hermes-Session-Key`), used while it answers and its profile has Worldlet's World tools (HermesServerConversation), its
// `hermes acp` otherwise (FirstAvailable).

/** Where a session lives: the Fox scope's home (its MCP server and token files) and whether it is the practice world. */
export interface SessionPlace {home:string;sample:boolean}
/** `hold` keeps the turn's idle deadline from running out while the person decides an approval. */
/** `announce`: Hermes announced a call to Worldlet's standing server before running it (core HermesOwnCalls). */
export type TurnOptions={hold?:<T>(work:Promise<T>)=>Promise<T>;announce?:(call:HermesAnnouncedCall)=>void};
/** A host session: the turn's World tool calls reach `dispatch`, which the runtime sets for each turn. */
export interface ResidentSession extends HarnessSession {
 dispatch:(name:string,args:Row)=>Promise<Row>;
 send(input:HarnessTurnInput,onEvent:(event:HarnessTurnEvent)=>void,options?:TurnOptions):Promise<{text:string;usage?:HarnessUsage}>;
 /** Puts the session on `model` (absent: the Agent's own) ahead of a turn, so warming a thread also switches it. */
 prepare(model?:string):Promise<void>;
}
export interface ResidentConversation extends HarnessConversation {
 /** null when the resident interface answers (for `agent`, else the main agent); otherwise why turns use a process each. */
 unavailable(agent?:string):Promise<string|null>;
 /** The models it can switch a thread to (contracts/harness-services.ts `models`), as far as it knows them now. */
 models?(agent?:string):HarnessModel[];
 open(key:HarnessSessionKey,place?:SessionPlace):Promise<ResidentSession>;
 readonly approvals:HarnessApprovals|null;
 /** Whether a fallback was already told for this reason (noted once, never silently). */
 noted:string|null;
 shutdown():void;
}
/** Tells the World a Harness session is Fox's own (ledger rememberOwnHarnessSession), so the `history` sync leaves its
 * turns out instead of bringing them back as another conversation. */
export type OwnSession=(session:string,thread:string)=>void;
const unavailableTool=async():Promise<Row>=>({error:'World tool is unavailable.'});
/** How long an unused helper process (a source read, an Applet task's lane) waits before it is stopped. The
 * conversation's own Agent never idles out: it stays up while the app is open (owner 2026-10-08, "Hermes 不应该一直在线吗"). */
export const RESIDENT_IDLE_MS=30*60_000;
const SESSIONS_FILE='harness-sessions.json';
function savedSessions(home:string):Record<string,string> {
 try{const value=JSON.parse(fs.readFileSync(path.join(home,SESSIONS_FILE),'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function saveSession(home:string,name:string,id:string|null){
 const sessions=savedSessions(home);
 if(id)sessions[name]=id;else delete sessions[name];
 fs.mkdirSync(home,{recursive:true,mode:0o700});writeAtomic(path.join(home,SESSIONS_FILE),JSON.stringify(sessions)+'\n',0o600);
}

// Hermes Agent over the Agent Client Protocol ----------------------------------------------------------------------

type Pending={resolve:(value:Row)=>void;reject:(error:Error)=>void};
type AcpProcess={child:ChildProcess;pending:Map<number,Pending>;next:number;loadSession:boolean;stderr:{text:string};ready:Promise<void>};
type Approval={session:AcpSession;rpc:unknown;params:unknown;timer:NodeJS.Timeout;settle:()=>void};

/** One `hermes acp` process for every Fox thread, started on the first turn and kept while it is used. */
export class AcpConversation implements ResidentConversation,HarnessApprovals {
 readonly approvals:HarnessApprovals=this;
 noted:string|null=null;
 private process:AcpProcess|null=null;
 private readonly sessions=new Map<string,AcpSession>();
 /** Sessions being opened, so a warm-up and the turn after it share one `session/new`. */
 private readonly opening=new Map<string,Promise<ResidentSession>>();
 /** The models the last `session/new` or `session/load` listed (`models.availableModels`). */
 private known:HarnessModel[]=[];
 private readonly asks=new Map<string,Approval>();
 private idle:NodeJS.Timeout|null=null;
 readonly title:string;
 private readonly command:{command:string;args:string[];env:()=>Record<string,string>};
 private readonly own:OwnSession;
 constructor(title:string,command:{command:string;args:string[];env:()=>Record<string,string>},own:OwnSession=()=>{}){this.title=title;this.command=command;this.own=own;}
 async unavailable(){
  try{await this.start(process.cwd());return null;}
  catch(error){return (error as Error)?.message||`${this.title} did not start its conversation interface.`;}
 }
 /** Starts the process and its `initialize` once; a process that exited is started again. */
 private start(cwd:string):Promise<void> {
  if(this.process)return this.process.ready;
  let child:ChildProcess;
  try{child=spawn(this.command.command,[...this.command.args,'acp'],{cwd,env:this.command.env(),stdio:['pipe','pipe','pipe'],windowsHide:true});}
  catch(error){return Promise.reject(error);}
  const proc:AcpProcess={child,pending:new Map(),next:1,loadSession:false,stderr:{text:''},ready:Promise.resolve()};
  this.process=proc;
  child.stdin!.on('error',()=>{});
  child.stderr!.on('data',(chunk:Buffer)=>{proc.stderr.text=(proc.stderr.text+chunk.toString('utf8')).slice(-8000);});
  let buffer='';
  child.stdout!.on('data',(chunk:Buffer)=>{
   buffer+=chunk.toString('utf8');let end:number;
   while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);this.receive(proc,line);}
   if(buffer.length>16_000_000)stopChild(child);
  });
  const exited=(error:Error)=>{
   if(this.process!==proc)return;
   this.process=null;
   for(const pending of proc.pending.values())pending.reject(error);
   proc.pending.clear();
   for(const session of [...this.sessions.values()])session.closed(error);
  };
  child.once('error',error=>exited(new WorldletError(`${this.title} could not start: ${error.message}`)));
  // On its exit, its last output read first: a helper it started may keep its output open long after.
  child.once('exit',()=>setTimeout(()=>{const detail=proc.stderr.text.trim().split('\n').filter(Boolean).pop();exited(new WorldletError(detail?`${this.title} stopped: ${detail.slice(0,300)}`:`${this.title} stopped.`));},300).unref());
  proc.ready=this.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}}).then(result=>{
   proc.loadSession=result.agentCapabilities?.loadSession===true;
  });
  proc.ready.catch(()=>{if(this.process===proc)stopChild(child);});
  return proc.ready;
 }
 request(method:string,params:Row):Promise<Row> {
  const proc=this.process;
  if(!proc)return Promise.reject(new WorldletError(`${this.title} is not running.`));
  const id=proc.next++;
  return new Promise<Row>((resolve,reject)=>{
   proc.pending.set(id,{resolve,reject});
   proc.child.stdin!.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
 }
 notify(method:string,params:Row){this.process?.child.stdin!.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');}
 reply(id:unknown,message:Row){if(this.process?.child.stdin!.writable)this.process.child.stdin!.write(JSON.stringify({jsonrpc:'2.0',id,...message})+'\n');}
 private receive(proc:AcpProcess,line:string){
  let message:Row;
  try{message=JSON.parse(line);}catch{return;}
  if(!message||typeof message!=='object')return;
  const params=message.params&&typeof message.params==='object'?message.params as Row:{};
  const session=[...this.sessions.values()].find(item=>item.id===params.sessionId);
  if(typeof message.method==='string'){
   if(message.method==='session/update'){session?.update(params.update);return;}
   if(message.id===undefined||message.id===null)return;
   if(message.method==='session/request_permission'&&session){session.permission(message.id,params);return;}
   // Requests this client did not offer (files, terminals) are refused.
   this.reply(message.id,message.method==='session/request_permission'?{result:{outcome:{outcome:'cancelled'}}}:{error:{code:-32601,message:'Method not found'}});
   return;
  }
  const pending=proc.pending.get(Number(message.id));
  if(!pending)return;
  proc.pending.delete(Number(message.id));
  if(message.error!==undefined)pending.reject(new WorldletError(typeof message.error?.message==='string'&&message.error.message?message.error.message:`${this.title} could not answer.`));
  else pending.resolve(message.result&&typeof message.result==='object'?message.result:{});
 }
 models(){return this.known.map(model=>({...model}));}
 open(key:HarnessSessionKey,place:SessionPlace={home:process.cwd(),sample:false}):Promise<ResidentSession> {
  const name=harnessSessionName(key),open=this.sessions.get(name);
  if(open)return Promise.resolve(open);
  let opening=this.opening.get(name);
  if(!opening){opening=this.create(key,name,place).finally(()=>this.opening.delete(name));this.opening.set(name,opening);}
  return opening;
 }
 private async create(key:HarnessSessionKey,name:string,place:SessionPlace):Promise<ResidentSession> {
  await this.start(place.home);
  this.touch();
  const session=new AcpSession(this,key,name);
  const bridge=await openWorldToolBridge(place.home,{sample:place.sample,dispatch:(tool,args)=>session.call(tool,args)});
  session.bridge=bridge;
  const {command,args,env}=bridge.server;
  const mcpServers=[{name:WORLD_TOOL_SERVER,command,args,env:Object.entries(env).map(([name,value])=>({name,value}))}];
  try{
   // The thread's earlier session, reloaded after a restart (Hermes keeps ACP sessions in its state.db), else a new one.
   const saved=savedSessions(place.home)[name];
   let id:string|null=null,opened:Row={};
   if(saved&&this.process?.loadSession)try{opened=await this.request('session/load',{sessionId:saved,cwd:place.home,mcpServers});id=saved;}catch{}
   if(!id){
    opened=await this.request('session/new',{cwd:place.home,mcpServers});
    if(typeof opened.sessionId!=='string')throw new WorldletError(`${this.title} did not start a conversation.`);
    id=opened.sessionId;saveSession(place.home,name,id);
   }
   session.id=id;
   // Its models and the one it starts on: an Applet's choice switches from it, and clearing the choice switches back.
   const models=acpModels(opened);
   if(models.length)this.known=models;
   session.defaultModel=models.find(model=>model.current)?.id??null;
  }catch(error){bridge.close();throw error;}
  try{this.own(session.id,key.thread);}catch{}
  this.sessions.set(name,session);
  return session;
 }
 /** The person's answer to one of the Harness's own permission prompts. */
 async answer(id:string,choice:HarnessApprovalChoice){
  const ask=this.asks.get(id);
  if(!ask)throw new WorldletError('This request was already answered or has expired.');
  this.settle(id,choice);
 }
 ask(session:AcpSession,rpc:unknown,params:unknown):{id:string;answered:Promise<void>} {
  const id='acp-'+crypto.randomUUID().slice(0,12);
  let settle=()=>{};const answered=new Promise<void>(resolve=>{settle=resolve;});
  // Unanswered, it is declined, as Hermes itself declines a prompt that times out.
  const timer=setTimeout(()=>this.settle(id,'deny'),10*60_000);timer.unref?.();
  this.asks.set(id,{session,rpc,params,timer,settle});
  return {id,answered};
 }
 settle(id:string,choice:HarnessApprovalChoice|null){
  const ask=this.asks.get(id);if(!ask)return;
  this.asks.delete(id);clearTimeout(ask.timer);
  this.reply(ask.rpc,{result:choice?acpApprovalOutcome(ask.params,choice):{outcome:{outcome:'cancelled'}}});
  ask.session.answered(id,choice);
  ask.settle();
 }
 settleAll(session:AcpSession){for(const [id,ask] of [...this.asks])if(ask.session===session)this.settle(id,null);}
 forget(session:AcpSession){if(this.sessions.get(session.name)===session)this.sessions.delete(session.name);}
 /** The resident process carries the conversation, so it stays up while the app is open; it stops on shutdown or
  * when the Agent changes. */
 touch(){if(this.idle)clearTimeout(this.idle);this.idle=null;}
 shutdown(){
  if(this.idle)clearTimeout(this.idle);this.idle=null;
  for(const session of [...this.sessions.values()])session.closed(new AgentCancelled());
  const proc=this.process;this.process=null;
  if(proc){for(const pending of proc.pending.values())pending.reject(new AgentCancelled());stopChild(proc.child);}
 }
}

class AcpSession implements ResidentSession {
 id='';
 bridge:WorldToolBridge|null=null;
 /** The model the session started on, and the one Worldlet last switched it to (null: never switched). */
 defaultModel:string|null=null;
 private model:string|null=null;
 /** The session's usage totals after the last turn (ACP reports totals), and its latest `usage_update`. */
 private totals:HarnessUsage|null=null;
 private context:HarnessUsage|null=null;
 dispatch:(name:string,args:Row)=>Promise<Row>=unavailableTool;
 private instructions:string|null=null;
 private turn:{onEvent:(event:HarnessTurnEvent)=>void;text:string;tools:boolean;hold?:TurnOptions['hold'];announce?:TurnOptions['announce'];stop:()=>void;changes:ApprovalChanges}|null=null;
 private readonly owner:AcpConversation;
 readonly key:HarnessSessionKey;
 readonly name:string;
 constructor(owner:AcpConversation,key:HarnessSessionKey,name:string){this.owner=owner;this.key=key;this.name=name;}
 get busy(){return this.turn!==null;}
 /** World tool calls from the session's MCP server; a turn without World tools (a greeting) refuses them. */
 call(name:string,args:Row):Promise<Row> {return this.turn?.tools?this.dispatch(name,args):Promise.resolve({error:'This turn cannot act in Worldlet.'});}
 /** `session/set_model` when the thread's model is not the one it is on; the Agent builds the session's agent again, so
  * its usage totals start over. A model it refuses fails the turn with its reason. One switch at a time (a warm-up's
  * and the turn's), and never in the middle of a turn. */
 prepare(model?:string):Promise<void> {
  const next=this.switching.then(async()=>{
   const wanted=isHarnessModelId(model)?model:this.model!==null?this.defaultModel:null;
   const known=this.owner.models();
   if(this.turn||!wanted||wanted===(this.model??this.defaultModel)||known.length&&!known.some(item=>item.id===wanted))return;
   await this.owner.request('session/set_model',{sessionId:this.id,modelId:wanted});
   this.model=wanted;this.totals=null;
  });
  this.switching=next.catch(()=>{});
  return next;
 }
 private switching:Promise<void>=Promise.resolve();
 async send(input:HarnessTurnInput,onEvent:(event:HarnessTurnEvent)=>void,options:TurnOptions={}):Promise<{text:string;usage?:HarnessUsage}> {
  if(this.turn)throw new WorldletError('This Agent is already working.');
  await this.prepare(input.model);
  // A cancelled turn ends here at once; the Harness's own `cancelled` reply, when it comes, is not waited for.
  let stop=()=>{};const stopped=new Promise<never>((_resolve,reject)=>{stop=()=>reject(new AgentCancelled());});stopped.catch(()=>{});
  this.turn={onEvent,text:'',tools:input.tools,hold:options.hold,announce:options.announce,stop,changes:approvalChanges()};
  // The session has no system prompt of its own: the instructions lead the first message, and again only when they change.
  const text=(input.instructions&&input.instructions!==this.instructions?input.instructions+'\n\n':'')+harnessTurnText(input);
  try{
   const result=await Promise.race([this.owner.request('session/prompt',{sessionId:this.id,prompt:[{type:'text',text}]}),stopped]);
   this.instructions=input.instructions;
   if(result.stopReason==='cancelled')throw new AgentCancelled();
   if(result.stopReason==='refusal')throw new WorldletError(`${this.owner.title} declined to answer.`);
   // ACP reports the session's totals: this turn used the difference; the context and any cost come from `usage_update`.
   const totals=addHarnessUsage(acpPromptUsage(result),this.context?.cost?{cost:this.context.cost}:null);
   const usage=addHarnessUsage(usageSince(this.totals,totals),this.context?.context?{context:this.context.context}:null);
   if(totals)this.totals=totals;
   return {text:this.turn.text,...usage?{usage}:{}};
  }finally{this.owner.settleAll(this);this.turn=null;this.owner.touch();}
 }
 update(value:unknown){
  const update=value&&typeof value==='object'?value as Row:{},content=update.content&&typeof update.content==='object'?update.content as Row:{};
  if(this.turn)this.report(acpChangesUpdate(this.turn.changes,update));
  const used=acpUsageUpdate(update);if(used)this.context=used;
  const announced=this.turn?hermesAcpAnnouncement(update):null;if(announced)this.turn!.announce?.(announced);
  // A reloaded session replays its history first; only a running turn's answer is Fox's words.
  if(!this.turn||update.sessionUpdate!=='agent_message_chunk'||content.type!=='text'||typeof content.text!=='string'||!content.text)return;
  this.turn.text+=content.text;this.turn.onEvent({type:'delta',text:content.text});
 }
 permission(rpc:unknown,params:Row){
  if(!this.turn){this.owner.reply(rpc,{result:{outcome:{outcome:'cancelled'}}});return;}
  const {id,answered}=this.owner.ask(this,rpc,params);
  acpChangesAsked(this.turn.changes,id,params);
  if(this.turn.hold)void this.turn.hold(answered);
  this.turn.onEvent({type:'approval',request:{...acpApprovalRequest(id,params,{title:this.owner.title}),thread:this.key.thread,...this.key.agent?{agent:this.key.agent}:{}}});
 }
 /** The person answered one of this turn's prompts: once its tool call finishes, what it changed is reported. */
 answered(id:string,choice:HarnessApprovalChoice|null){if(this.turn)this.report(changesAnswered(this.turn.changes,id,choice));}
 private report(results:HarnessApprovalResult[]){for(const result of results)this.turn?.onEvent({type:'approval_result',result});}
 cancel(){if(this.turn){this.owner.settleAll(this);this.owner.notify('session/cancel',{sessionId:this.id});this.turn.stop();}}
 closed(_error:Error){this.owner.settleAll(this);this.bridge?.close();this.bridge=null;this.owner.forget(this);}
 async close(){this.closed(new AgentCancelled());}
}

/** Hermes Agent's profiles: one resident conversation per profile (`make(null)` the main one), each started on its
 * first turn and stopped when idle; approvals are answered by whichever holds the request. */
export class AgentConversations implements ResidentConversation,HarnessApprovals {
 noted:string|null=null;
 private readonly each=new Map<string,ResidentConversation>();
 private readonly make:(agent:string|null)=>ResidentConversation;
 constructor(make:(agent:string|null)=>ResidentConversation){this.make=make;}
 private of(agent?:string){
  const name=isHarnessAgentId(agent)?agent:'';
  let conversation=this.each.get(name);
  if(!conversation){conversation=this.make(name||null);this.each.set(name,conversation);}
  return conversation;
 }
 get approvals():HarnessApprovals|null {return this.of().approvals?this:null;}
 unavailable(agent?:string){return this.of(agent).unavailable();}
 models(agent?:string){return this.of(agent).models?.()??[];}
 open(key:HarnessSessionKey,place?:SessionPlace){return this.of(key.agent).open(key,place);}
 async answer(id:string,choice:HarnessApprovalChoice){
  let last:unknown=new WorldletError('This request was already answered or has expired.');
  for(const conversation of this.each.values()){
   if(!conversation.approvals)continue;
   try{await conversation.approvals.answer(id,choice);return;}catch(error){last=error;}
  }
  throw last;
 }
 shutdown(){for(const conversation of this.each.values())conversation.shutdown();this.each.clear();}
}

// OpenClaw through its Gateway ------------------------------------------------------------------------------------

/** `base`: a Gateway on another computer at that address (agent-runtime/remote-gateway.ts); absent, this computer's port. */
export type GatewaySettings={port:number;secret:string|null;responses:boolean|null;base?:string;worldTools?:boolean};
/** Where a Gateway is, in what Fox says: its port here, or the other computer's address. */
const gatewayWhere=({port,base}:GatewaySettings)=>base?'at '+base.replace(/^\w+:\/\//,''):'on port '+port;
type GatewayWatch={stop:()=>void;problem:string|null};
type ClawAsk={name:string;timer:NodeJS.Timeout;settle:()=>void};
/** One turn listening on the Gateway: its prompts, where it is said (the request's `thread`, `agent`) and what an
 * approved command did (`onResult`). */
type ClawWatch={onAsk:(request:HarnessApprovalRequest,answered:Promise<void>)=>void;onResult:(result:HarnessApprovalResult)=>void;thread?:string;agent?:string;changes:ApprovalChanges};
const DEVICE_FILE='openclaw-device.json';
/** Worldlet's own Ed25519 device for the Gateway, kept in Worldlet's folder (never in OpenClaw's): its id is the
 * SHA-256 of the raw public key, as OpenClaw derives it. */
function gatewayDevice(home:string):{id:string;publicKey:string;key:crypto.KeyObject} {
 const file=path.join(home,DEVICE_FILE);
 let pem='';
 try{pem=String(JSON.parse(fs.readFileSync(file,'utf8')).privateKey??'');}catch{}
 let key:crypto.KeyObject;
 try{key=crypto.createPrivateKey(pem);if(key.asymmetricKeyType!=='ed25519')throw Error();}
 catch{
  key=crypto.generateKeyPairSync('ed25519').privateKey;
  fs.mkdirSync(home,{recursive:true,mode:0o700});writeAtomic(file,JSON.stringify({privateKey:key.export({type:'pkcs8',format:'pem'})})+'\n',0o600);
 }
 const publicKey=String(crypto.createPublicKey(key).export({format:'jwk'}).x);
 return {id:crypto.createHash('sha256').update(Buffer.from(publicKey,'base64url')).digest('hex'),publicKey,key};
}

/** OpenClaw's exec approvals (contracts/harness-services.ts `approvals`): they come only over its Gateway WebSocket, so
 * while a Fox turn runs on a Gateway session one socket is open, signed in as an operator device that takes approvals;
 * a request for that session becomes the World's approval card and the answer goes back as `exec.approval.resolve`.
 * The socket closes when no turn listens. Port and secret are read from openclaw.json or the environment only; a
 * Gateway on another computer is reached at its address (wss over HTTPS), where its device must be approved there. */
export class GatewayApprovals implements HarnessApprovals {
 noted:string|null=null;
 private socket:WebSocket|null=null;
 private opening:Promise<void>|null=null;
 private next=1;
 private readonly calls=new Map<string,{resolve:(payload:Row)=>void;reject:(error:Error)=>void}>();
 private readonly watchers=new Map<string,ClawWatch>();
 private readonly asks=new Map<string,ClawAsk>();
 private readonly title:string;
 private readonly gateway:()=>GatewaySettings;
 private readonly timeoutMs:number;
 constructor(title:string,gateway:()=>GatewaySettings,timeoutMs=1500){this.title=title;this.gateway=gateway;this.timeoutMs=timeoutMs;}
 /** Listens for `session`'s approvals during one turn; `problem` says why none can reach Fox (the turn goes on, and
  * OpenClaw decides by its own settings when nobody answers). Its tool events are subscribed to as well, so an
  * approved command's output comes back (`onResult`); a Gateway that refuses that subscription just reports none. */
 async watch(session:string,home:string,onAsk:(request:HarnessApprovalRequest,answered:Promise<void>)=>void,{onResult=()=>{},thread,agent}:{onResult?:(result:HarnessApprovalResult)=>void;thread?:string;agent?:string}={}):Promise<GatewayWatch> {
  const watcher:ClawWatch={onAsk,onResult,thread,agent,changes:approvalChanges({reported:false})};
  this.watchers.set(session,watcher);
  const stop=()=>{
   if(this.watchers.get(session)!==watcher)return;
   this.watchers.delete(session);
   // A request still open when the turn ends (cancelled, stopped) is declined, as an unanswered Hermes prompt is.
   for(const [id,ask] of [...this.asks])if(ask.name===session){this.call('exec.approval.resolve',{id,decision:openClawDecision('deny')}).catch(()=>{});this.settle(id);}
   if(!this.watchers.size)this.close();
  };
  try{
   await this.open(home);
   this.call('sessions.messages.subscribe',{key:session}).catch(()=>{});
   return {stop,problem:null};
  }
  catch(error){return {stop,problem:(error as Error)?.message||'its Gateway did not answer'};}
 }
 private open(home:string):Promise<void> {
  if(this.opening)return this.opening;
  const settings=this.gateway(),{secret}=settings,where=gatewayWhere(settings),device=gatewayDevice(home);
  let socket:WebSocket;
  try{socket=new WebSocket(settings.base?remoteGatewaySocketUrl(settings.base):`ws://127.0.0.1:${settings.port}`);}catch(error){return Promise.reject(error);}
  this.socket=socket;
  const opening=new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>fail(new WorldletError(`its Gateway did not take Worldlet's approvals connection ${where}`)),this.timeoutMs);
   const fail=(error:Error)=>{clearTimeout(timer);reject(error);if(this.socket===socket)this.close();};
   socket.addEventListener('error',()=>fail(new WorldletError(`its Gateway is not reachable ${where}`)));
   socket.addEventListener('close',()=>{fail(new WorldletError('its Gateway closed the approvals connection'));if(this.socket===socket)this.close();});
   socket.addEventListener('message',message=>{
    const frame=readOpenClawFrame(typeof message.data==='string'?message.data:Buffer.from(message.data as ArrayBuffer).toString('utf8'));
    if(!frame)return;
    if(frame.type==='res'){
     const call=this.calls.get(frame.id);if(!call)return;
     this.calls.delete(frame.id);
     if(frame.ok)call.resolve(frame.payload);else call.reject(new WorldletError(frame.error||`${this.title}'s Gateway refused.`));
     return;
    }
    if(frame.event==='connect.challenge'){
     const nonce=String(frame.payload.nonce??''),signedAt=Number.isInteger(frame.payload.ts)?Number(frame.payload.ts):Date.now();
     const signature=crypto.sign(null,Buffer.from(openClawDeviceProof({device:device.id,nonce,signedAt,secret,platform:process.platform})),device.key).toString('base64url');
     const id=String(this.next++);
     this.calls.set(id,{resolve:hello=>{
      const scopes=Array.isArray(hello.auth?.scopes)?hello.auth.scopes:[];
      if(!scopes.includes('operator.approvals'))return fail(new WorldletError('its Gateway did not let Worldlet answer approvals (approve the Worldlet device: openclaw devices list)'));
      clearTimeout(timer);resolve();
     },reject:error=>fail(new WorldletError(`Worldlet could not sign in to its Gateway: ${error.message}`))});
     socket.send(JSON.stringify(openClawConnect({id,nonce,signedAt,secret,platform:process.platform,version:'1',device:{id:device.id,publicKey:device.publicKey,signature}})));
     return;
    }
    if(frame.event==='exec.approval.requested')this.requested(frame.payload);
    else if(frame.event==='exec.approval.resolved'&&typeof frame.payload.id==='string'){this.decided(frame.payload.id,frame.payload.decision);this.settle(frame.payload.id);}
    else if(frame.event==='agent'||frame.event==='session.tool')this.tool(frame.payload);
   });
  });
  this.opening=opening;opening.catch(()=>{});
  return opening;
 }
 private requested(payload:Row){
  const session=[...this.watchers.keys()].find(name=>openClawApprovalFor(payload,name));
  const found=session?openClawApprovalRequest(payload,{title:this.title}):null;
  if(!session||!found||this.asks.has(found.id))return;
  const watcher=this.watchers.get(session)!,request={...found,...watcher.thread?{thread:watcher.thread}:{},...watcher.agent?{agent:watcher.agent}:{}};
  const call=(payload.request as Row|undefined)?.toolCallId;
  changesAsked(watcher.changes,request.id,{call:typeof call==='string'?call:null});
  let settle=()=>{};const answered=new Promise<void>(resolve=>{settle=resolve;});
  // The Gateway expires it by its own timeout (then `exec.approval.resolved` comes); the card goes with it.
  const timer=setTimeout(()=>this.settle(request.id),Math.max(1000,Math.min((request.expiresAt??Date.now()+10*60_000)-Date.now(),30*60_000)));timer.unref?.();
  this.asks.set(request.id,{name:session,timer,settle});
  watcher.onAsk(request,answered);
 }
 /** A decision, made here or in OpenClaw itself: an allowed command's output is reported when it finishes. */
 private decided(id:string,decision:unknown){
  const ask=this.asks.get(id),watcher=ask?this.watchers.get(ask.name):undefined;
  if(!watcher)return;
  const choice=decision==='allow-once'?'once':decision==='allow-always'?'always':'deny';
  for(const result of changesAnswered(watcher.changes,id,choice))watcher.onResult(result);
 }
 /** A tool event for a watched session (`agent` or `session.tool`, keyed by its session). */
 private tool(payload:Row){
  const session=[...this.watchers.keys()].find(name=>openClawSessionIs(payload.sessionKey,name));
  const watcher=session?this.watchers.get(session):undefined;
  if(watcher)for(const result of openClawChangesEvent(watcher.changes,payload))watcher.onResult(result);
 }
 private settle(id:string){const ask=this.asks.get(id);if(!ask)return;this.asks.delete(id);clearTimeout(ask.timer);ask.settle();}
 private call(method:string,params:Row):Promise<Row> {
  const socket=this.socket;
  if(!socket||socket.readyState!==WebSocket.OPEN)return Promise.reject(new WorldletError(`${this.title}'s Gateway is not connected.`));
  const id=String(this.next++);
  return new Promise<Row>((resolve,reject)=>{this.calls.set(id,{resolve,reject});socket.send(JSON.stringify({type:'req',id,method,params}));});
 }
 async answer(id:string,choice:HarnessApprovalChoice){
  if(!this.asks.has(id))throw new WorldletError('This request was already answered or has expired.');
  await this.call('exec.approval.resolve',{id,decision:openClawDecision(choice)});
  this.decided(id,openClawDecision(choice));
  this.settle(id);
 }
 close(){
  const socket=this.socket;this.socket=null;this.opening=null;
  for(const call of this.calls.values())call.reject(new AgentCancelled());
  this.calls.clear();
  for(const id of [...this.asks.keys()])this.settle(id);
  try{socket?.close();}catch{}
 }
}

/** The person's running OpenClaw Gateway (docs.openclaw.ai/gateway/openresponses-http-api). Its `/v1/responses` is off
 * by default; Worldlet does not turn it on in their configuration, it says once that turns run one process each until
 * they do. */
export class GatewayConversation implements ResidentConversation {
 approvals:GatewayApprovals|null;
 noted:string|null=null;
 private readonly sessions=new Map<string,GatewaySession>();
 protected checked=0;
 readonly title:string;
 readonly gateway:()=>GatewaySettings;
 protected readonly timeoutMs:number;
 /** Only calls to the tools Fox offered are Fox's to run (a server that runs its own tools reports those as calls too). */
 readonly offeredOnly:boolean=false;
 /** World tools go with each request as client function tools; false when the Agent reaches them on its own (Hermes'
  * registered `worldlet` server). */
 readonly clientTools:boolean=true;
 private readonly own:OwnSession;
 /** The models the person's configuration names for an agent (the host reads openclaw.json; core openClawModels). */
 catalog:(agent?:string)=>HarnessModel[]=()=>[];
 constructor(title:string,gateway:()=>GatewaySettings,own:OwnSession=()=>{},timeoutMs=1500){this.title=title;this.gateway=gateway;this.own=own;this.timeoutMs=timeoutMs;this.approvals=new GatewayApprovals(title,gateway,timeoutMs);}
 models(agent?:string){return this.catalog(agent);}
 url(route:string){const {base,port}=this.gateway();return base?base+route:`http://127.0.0.1:${port}${route}`;}
 /** The secret goes only to the Gateway itself: its requests follow no redirect. */
 headers(extra:Record<string,string>={}){const secret=this.gateway().secret;return {...secret?{authorization:'Bearer '+secret}:{},...extra};}
 async unavailable(){
  if(Date.now()-this.checked<30_000)return null;
  const settings=this.gateway();
  const off=`its Gateway's /v1/responses endpoint is off (gateway.http.endpoints.responses.enabled in openclaw.json)`;
  if(settings.responses===false)return off;
  let status=0;
  try{status=(await fetch(this.url('/v1/models'),{headers:this.headers(),redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)})).status;}
  catch{return settings.base?`its Gateway did not answer ${gatewayWhere(settings)}`:`its Gateway is not running on port ${settings.port} (openclaw gateway)`;}
  if(status===401||status===403)return settings.base?'Worldlet could not sign in to its Gateway (check the token in Settings › Model)':`Worldlet could not sign in to its Gateway (gateway.auth in openclaw.json)`;
  if(status===404||status===405)return off;
  if(status<200||status>=300)return `its Gateway answered ${status}`;
  this.checked=Date.now();
  return null;
 }
 async open(key:HarnessSessionKey,place:SessionPlace={home:'',sample:false}):Promise<ResidentSession> {
  const name=harnessSessionName(key);
  let session=this.sessions.get(name);
  if(!session){session=new GatewaySession(this,key,name,place);this.sessions.set(name,session);try{this.own(name,key.thread);}catch{}}
  return session;
 }
 /** The headers that name a turn's session, agent and model: OpenClaw's `x-openclaw-*`. */
 turnHeaders(session:string,agent:string|null,model:string|null):Record<string,string> {return {'x-openclaw-session-key':session,...agent?{'x-openclaw-agent-id':agent}:{},...model?{'x-openclaw-model':model}:{}};}
 turnBody(turn:ResponsesTurn,agent:string|null,_model:string|null=null):Record<string,unknown> {return openClawResponsesBody({...turn,agent});}
 /** The Gateway refused a request: check it again before the next turn. */
 failed(){this.checked=0;}
 forget(session:GatewaySession){if(this.sessions.get(session.name)===session)this.sessions.delete(session.name);}
 shutdown(){for(const session of this.sessions.values())session.cancel();this.sessions.clear();this.approvals?.close();}
}

const TOOL_ROUNDS=24;
class GatewaySession implements ResidentSession {
 dispatch:(name:string,args:Row)=>Promise<Row>=unavailableTool;
 private controller:AbortController|null=null;
 private readonly owner:GatewayConversation;
 readonly key:HarnessSessionKey;
 readonly name:string;
 private readonly place:SessionPlace;
 constructor(owner:GatewayConversation,key:HarnessSessionKey,name:string,place:SessionPlace){this.owner=owner;this.key=key;this.name=name;this.place=place;}
 /** The model goes with each request (`x-openclaw-model`); there is nothing to switch ahead of it. */
 async prepare(){}
 async send(input:HarnessTurnInput,onEvent:(event:HarnessTurnEvent)=>void,options:TurnOptions={}):Promise<{text:string;usage?:HarnessUsage}> {
  if(this.controller)throw new WorldletError('This Agent is already working.');
  const controller=new AbortController();this.controller=controller;
  // Its exec approvals for this session, while the turn runs: the card in the World, the turn held until it is answered.
  const approvals=this.owner.approvals,watch=approvals&&this.place.home?await approvals.watch(this.name,this.place.home,(request,answered)=>{
   if(options.hold)void options.hold(answered);
   onEvent({type:'approval',request});
  },{onResult:result=>onEvent({type:'approval_result',result}),thread:this.key.thread,...this.key.agent?{agent:this.key.agent}:{}}):null;
  if(approvals&&watch?.problem&&approvals.noted!==watch.problem){approvals.noted=watch.problem;onEvent({type:'progress',name:`${this.owner.title}'s approval requests cannot reach Fox: ${watch.problem}. It decides them by its own settings.`});}
  else if(approvals&&watch&&!watch.problem)approvals.noted=null;
  const tools:ResponsesTool[]|null=input.tools&&this.owner.clientTools?worldGatewayTools.map(tool=>({name:tool.name,description:tool.description,parameters:tool.parameters as Record<string,unknown>})):null;
  let items:unknown[]=openClawUserInput(harnessTurnText(input)),previous:string|null=null,text='',usage:HarnessUsage|null=null;
  const agent=isHarnessAgentId(this.key.agent)?this.key.agent:null,model=isHarnessModelId(input.model)?input.model:null;
  try{
   for(let round=0;round<TOOL_ROUNDS;round++){
    const response=await fetch(this.owner.url('/v1/responses'),{method:'POST',signal:controller.signal,redirect:'error',
     headers:this.owner.headers({'content-type':'application/json',accept:'text/event-stream',...this.owner.turnHeaders(this.name,agent,model)}),
     body:JSON.stringify(this.owner.turnBody({input:items,instructions:input.instructions,tools,previous},agent,model))});
    if(!response.ok){
     let detail='';try{const body=await response.json();detail=typeof body?.error?.message==='string'?body.error.message:'';}catch{}
     throw new WorldletError(detail?`${this.owner.title} could not answer: ${detail.slice(0,300)}`:`${this.owner.title}'s Gateway answered ${response.status}.`);
    }
    const state=responsesStream(),decoder=new TextDecoder();
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>){
     const delta=readResponsesChunk(state,decoder.decode(chunk,{stream:true}));
     for(const call of state.announced.splice(0))options.announce?.(call);
     if(delta){text+=delta;onEvent({type:'delta',text:delta});}
     if(state.done)break;
    }
    if(state.error)throw new WorldletError(state.error);
    // Each response of the turn (one per tool round) reports its own usage: the turn used their sum.
    usage=addHarnessUsage(usage,state.usage);
    const calls=this.owner.offeredOnly?state.calls.filter(call=>tools?.some(tool=>tool.name===call.name)):state.calls;
    if(!calls.length){
     if(!text&&state.final){text=state.final;onEvent({type:'delta',text});}
     return {text,...usage?{usage}:{}};
    }
    // Client function tools: each call runs through the same World gateway as the MCP server, then the response continues.
    const outputs:unknown[]=[];
    for(const call of calls){
     let args:unknown={};try{args=JSON.parse(call.arguments||'{}');}catch{}
     const result=input.tools?await worldGateway(call.name,args,{sample:this.place.sample,dispatch:this.dispatch}):{error:'This turn cannot act in Worldlet.'};
     outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result??{error:'World tool is unavailable.'})});
    }
    items=outputs;previous=state.id;
   }
   throw new WorldletError(`${this.owner.title} called too many World tools in one turn.`);
  }catch(error){
   if(controller.signal.aborted)throw new AgentCancelled();
   // The Gateway stopped or refused mid-turn: the next turn checks it again and may use a process of its own.
   this.owner.failed();
   throw error instanceof WorldletError?error:new WorldletError(`${this.owner.title}'s Gateway did not answer: ${(error as Error)?.message??error}`);
  }finally{this.controller=null;watch?.stop();}
 }
 cancel(){this.controller?.abort();}
 async close(){this.cancel();this.owner.forget(this);}
}

// Hermes Agent's resident API server ---------------------------------------------------------------------------------

/** Hermes Agent's API server (gateway/platforms/api_server.py, the gateway Worldlet keeps running as a service:
 * hermes-service.ts): `POST /v1/responses` streamed, the thread's session name as `X-Hermes-Session-Key` so Hermes keeps
 * the thread (its own memory and compaction), the key as a bearer token, no client tools: Hermes 0.21.3's server runs
 * only its own tools, so World tools reach it as the `worldlet` MCP server registered in the profile (owner decision
 * 2026-10-08 19:15Z), whose calls come back to this turn through the standing endpoint (world-tool-bridge.ts
 * holdStandingTurn, held by LocalHarnessRuntime). Ready when `/v1/capabilities` answers with that key and the profile
 * has that server (`worldTools`); otherwise the conversation keeps `hermes acp` (or, for the standard Hermes Agent, the
 * built-in runtime). Its `/v1/responses` sends no approval events (only `/v1/runs` does): a command that needs one is
 * not run, as `chat -q` declines it. The model goes as Hermes picks it. */
export class HermesServerConversation extends GatewayConversation {
 override readonly offeredOnly=true;
 override readonly clientTools=false;
 constructor(title:string,server:()=>GatewaySettings,own:OwnSession=()=>{},timeoutMs=1500){super(title,server,own,timeoutMs);this.approvals?.close();this.approvals=null;}
 override turnHeaders(session:string):Record<string,string> {return {'X-Hermes-Session-Key':session};}
 /** A chosen model ("provider:model", model-providers.ts) goes as the explicit `provider` and `model` its API server
  * honours for one request (gateway/platforms/api_server.py `_request_agent_overrides`); its own default otherwise. */
 override turnBody(turn:ResponsesTurn,_agent:string|null=null,model:string|null=null):Record<string,unknown> {return {...responsesBody(turn),...hermesRequestModel(model)};}
 override async unavailable(){
  if(Date.now()-this.checked<30_000)return null;
  const {port,secret,worldTools}=this.gateway();
  if(!secret)return 'its API server has no key yet (API_SERVER_KEY)';
  if(worldTools!==true)return 'its profile does not have Worldlet\'s World tools (mcp_servers.worldlet) yet';
  let response:Response;
  try{response=await fetch(this.url('/v1/capabilities'),{headers:this.headers(),redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});}
  catch{return `its API server is not running on port ${port} (hermes gateway)`;}
  if(response.status===401||response.status===403)return 'Worldlet could not sign in to its API server (API_SERVER_KEY)';
  if(!response.ok)return `its API server answered ${response.status}`;
  this.checked=Date.now();
  return null;
 }
}

/** The first conversation while it answers, else the second (Hermes Agent: its API server, else its `hermes acp`). The
 * reason the first does not answer goes to `note` once, never into Fox's reply: the second still keeps the thread. */
export class FirstAvailable implements ResidentConversation {
 noted:string|null=null;
 private current:ResidentConversation;
 private readonly first:ResidentConversation;
 private readonly second:ResidentConversation;
 private readonly note:(reason:string)=>void;
 constructor(first:ResidentConversation,second:ResidentConversation,note:(reason:string)=>void=()=>{}){this.first=first;this.second=second;this.note=note;this.current=second;}
 get approvals():HarnessApprovals|null {
  const all=[this.first.approvals,this.second.approvals].filter((item):item is HarnessApprovals=>item!==null);
  if(!all.length)return null;
  return {answer:async(id,choice)=>{let last:unknown=new WorldletError('This request was already answered or has expired.');for(const approvals of all){try{await approvals.answer(id,choice);return;}catch(error){last=error;}}throw last;}};
 }
 async unavailable(agent?:string){
  const reason=await this.first.unavailable(agent);
  if(reason===null){this.first.noted=null;this.current=this.first;return null;}
  if(this.first.noted!==reason){this.first.noted=reason;try{this.note(reason);}catch{}}
  this.current=this.second;
  return this.second.unavailable(agent);
 }
 models(agent?:string){return this.current.models?.(agent)??[];}
 open(key:HarnessSessionKey,place?:SessionPlace){return this.current.open(key,place);}
 shutdown(){this.first.shutdown();this.second.shutdown();}
}
