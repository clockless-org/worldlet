import type {HarnessApprovalChoice} from '../../../../../contracts/harness-services.ts';
import {REMOTE_TURN_LIMITS,readRemoteToHost,remoteAssembler,remoteParts,remoteSessionWorld,remoteTurnBody,type RemotePart,type RemoteToHost,type RemoteTurnEvent,type RemoteTurnRequest} from '../../../../../core/phone/index.ts';

// The host side of Fox on another computer's Agent (core/phone/README.md#another-computers-agent), free of Electron so
// scripts/remote-agent-check.ts drives it in process. The paired client's `turn` runs on this computer's Agent (`run`,
// the Agent service's own runtime, not the World page): in that Fox thread's session for the client, with the client's
// instructions and view. Its words and steps go back as `events` (gathered for a quarter second), each World tool call
// goes to the client as `tool` and the turn waits for the client's `tool-result` (the client runs it in its own World),
// a permission prompt of the Agent here goes as `approval` to the client's approval card and is answered by its
// `approval-answer` (Deny when none comes in time or the turn ends), and `done` ends it; `cancel` stops it. One of the
// person's turns at a time, and beside it up to two background turns (`lane`: an Attention check or Applet task of the
// client's, run on this computer's background lane). Nothing else the client may send is carried out.
type Row=Record<string,unknown>;
export type RemoteHostOptions={
 /** Queues a message to the client (the agent pairing's `send`); throws when the relay refuses it. */
 send:(message:unknown)=>Promise<void>,
 /** Runs a chat body on this computer's Agent (its background lane for `background`). Each event's answer goes back to
  * the Agent; `signal` stops it. */
 run:(body:Row,onEvent:(event:Row)=>Promise<Row|null>,signal:AbortSignal,lane?:'background')=>Promise<Row>,
 /** The client's name (its `phone` slot), which keeps its threads' sessions apart from this computer's own. */
 client:()=>string,
 /** This computer's name, said in a refusal. */
 name:()=>string,
 /** The ids of the person's agents here; a turn's chosen agent is used only when it is one of them. */
 agents:()=>Promise<string[]>,
 /** Answers a permission prompt of the Agent here (its `approvals`) with the client's choice, or Deny. */
 answer?:(id:string,choice:HarnessApprovalChoice)=>void,
 /** How long the client has to answer a permission prompt (ms). */
 approvalMs?:number,
 onError?:(error:unknown)=>void,
 /** How long events gather before they go (ms). */
 gather?:number,
};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export function createRemoteAgentHost(options:RemoteHostOptions){
 const parts=remoteAssembler(),gather=options.gather??250;
 type Run={id:string,lane:'person'|'background',controller:AbortController,calls:Map<string,(result:Row)=>void>,approvals:Map<string,(choice:HarnessApprovalChoice)=>void>};
 const runs=new Map<string,Run>();
 const LANES=2;
 // Messages go one at a time, in order; a full inbox at the relay (429) is tried again while the client catches up.
 let chain:Promise<unknown>=Promise.resolve();
 async function deliver(message:unknown){
  for(let attempt=0;;attempt++){
   try{return await options.send(message);}
   catch(e){if((e as {status?:number})?.status!==429||attempt>=20)throw e;await sleep(500);}
  }
 }
 const post=(message:{id:string,at:number}&Row)=>{
  const next=chain.then(async()=>{for(const piece of remoteParts(message))await deliver(piece);});
  chain=next.catch(error=>options.onError?.(error));
  return next;
 };
 const message=(turn:string,fields:Row)=>({...fields,id:crypto.randomUUID(),at:Date.now(),turn});
 async function start(turn:RemoteTurnRequest){
  const lane=turn.lane==='background'?'background':'person',busy=[...runs.values()].filter(run=>run.lane===lane).length;
  if(lane==='person'?busy>0:busy>=LANES)return void post(message(turn.id,{type:'done',error:lane==='person'?`Fox on ${options.name()} is still answering your other message. Try again when it has finished.`:`Fox on ${options.name()} is busy with other background work. Try again later.`})).catch(()=>{});
  // The client stops waiting for a turn that has not started by then (and sends `cancel`); one sealed long before this
  // computer read it (it slept) does not run, allowing for the two clocks to differ.
  if(Date.now()-turn.at>REMOTE_TURN_LIMITS.startMs+REMOTE_TURN_LIMITS.skewMs)return;
  const controller=new AbortController(),calls=new Map<string,(result:Row)=>void>(),approvals=new Map<string,(choice:HarnessApprovalChoice)=>void>(),run:Run={id:turn.id,lane,controller,calls,approvals};
  runs.set(turn.id,run);
  let pending:RemoteTurnEvent[]=[],timer:ReturnType<typeof setTimeout>|null=null,count=0;
  const flush=()=>{
   if(timer){clearTimeout(timer);timer=null;}
   if(!pending.length)return chain;
   const events=pending;pending=[];
   return post(message(turn.id,{type:'events',events}));
  };
  const queue=(event:RemoteTurnEvent)=>{
   pending.push(event);
   if(pending.length>=REMOTE_TURN_LIMITS.events)void flush().catch(()=>{});
   else timer??=setTimeout(()=>void flush().catch(()=>{}),gather);
  };
  const onEvent=async(event:Row):Promise<Row|null>=>{
   if(controller.signal.aborted)throw Object.assign(new Error('Cancelled.'),{name:'AbortError'});
   if(event.type==='delta'&&typeof event.text==='string'&&event.text)queue({type:'delta',text:event.text});
   else if(event.type==='response_start')queue({type:'response_start'});
   else if(event.type==='progress'&&typeof event.name==='string')queue({type:'progress',name:event.name});
   else if(event.type==='status'&&typeof event.stage==='string')queue({type:'status',stage:event.stage});
   else if(event.type==='approval'){
    // The person answers it on the client's approval card; the Agent here waits for `answer`, as for its own card.
    const request=event.request as Row|undefined,approval=typeof request?.id==='string'?request.id:'';
    if(!approval||approvals.has(approval))return null;
    const limit=options.approvalMs??REMOTE_TURN_LIMITS.approvalMs;
    const settle=(choice:HarnessApprovalChoice)=>{approvals.delete(approval);clearTimeout(late);try{options.answer?.(approval,choice);}catch(error){options.onError?.(error);}};
    const late=setTimeout(()=>settle('deny'),limit);
    approvals.set(approval,settle);
    await flush();
    await post(message(turn.id,{type:'approval',request:{...request,expiresAt:Date.now()+limit}}));
   }else if(event.type==='tool'&&typeof event.name==='string'){
    // A World tool: the client runs it in its own World, under its own permissions, and answers.
    const call='c'+(++count);
    await flush();
    const answer=new Promise<Row>(resolve=>{
     const done=(result:Row)=>{calls.delete(call);clearTimeout(late);controller.signal.removeEventListener('abort',stop);resolve(result);};
     const late=setTimeout(()=>done({error:'Your other computer did not answer this step in time. Tell the person, and do not repeat it unless they ask.'}),REMOTE_TURN_LIMITS.toolMs);
     const stop=()=>done({error:'Cancelled.'});
     controller.signal.addEventListener('abort',stop);
     calls.set(call,done);
    });
    await post(message(turn.id,{type:'tool',call,name:event.name,args:event.args&&typeof event.args==='object'?event.args:{}}));
    return await answer;
   }
   return null;
  };
  try{
   const agents=await options.agents().catch(()=>[] as string[]);
   const result=await options.run(remoteTurnBody(turn,{world:remoteSessionWorld(options.client()),agents}),onEvent,controller.signal,lane==='background'?'background':undefined);
   await flush();
   await post(message(turn.id,controller.signal.aborted?{type:'done',cancelled:true}:{type:'done',message:typeof result?.message==='string'?result.message:''}));
  }catch(error){
   await flush().catch(()=>{});
   const cancelled=controller.signal.aborted||(error as Error)?.name==='AbortError';
   if(!cancelled)options.onError?.(error);
   await post(message(turn.id,cancelled?{type:'done',cancelled:true}:{type:'done',error:(error as Error)?.message||'Fox could not answer.'})).catch(()=>{});
  }finally{
   if(timer)clearTimeout(timer);
   // A prompt still open when the turn ends is declined.
   for(const settle of [...approvals.values()])settle('deny');
   if(runs.get(turn.id)===run)runs.delete(turn.id);
  }
 }
 /** One opened message from the client (core/phone readRemoteToHost); resolves true once taken. */
 async function receive(value:RemoteToHost|RemotePart):Promise<boolean>{
  if(value.type==='part'){
   const whole=readRemoteToHost(parts.add(value));
   return whole&&whole.type!=='part'?receive(whole):true;
  }
  if(value.type==='turn'){void start(value).catch(error=>options.onError?.(error));return true;}
  // A cancel or a tool's answer counts only for a turn running now.
  const run=runs.get(value.turn);
  if(value.type==='cancel')run?.controller.abort();
  if(value.type==='tool-result')run?.calls.get(value.call)?.(value.result);
  if(value.type==='approval-answer')run?.approvals.get(value.approval)?.(value.choice);
  return true;
 }
 return {receive,get busy(){return runs.size>0;},
  /** Stops the running turns (the pairing ended or the app quits). */
  stop(){for(const run of runs.values())run.controller.abort();}};
}
export type RemoteAgentHost=ReturnType<typeof createRemoteAgentHost>;
