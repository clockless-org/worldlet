import path from 'node:path';
import {WorldletError} from '../../files.ts';
import {ExecutionJournal} from './journal.ts';
import {AgentCancelled,UnsupportedRuntime,agentEvent} from './protocol.ts';
import type {RemoteAgentLink} from '../phone/remote.ts';
import type {HarnessApprovalChoice} from '../../../../../contracts/harness-services.ts';
import {NO_ROUTINES,PortableAdapter} from './external.ts';
import type {Adapter,AgentEventHandler,AgentRoutines,AgentRuntime,Row,RuntimeContext} from './types.ts';

// Fox's Agent on another computer (core/phone/README.md#another-computers-agent; Harness service `location` remote):
// the person's always-on computer runs Worldlet with their Agent, and this Worldlet is paired with it. Fox's turns go
// there (the main conversation, an item card's and an Applet's thread, each its own session there) with this
// companion's instructions and the current view, and their World tool calls come back to run here, so Fox still acts in
// this World. Its background work runs there too (owner decision 2026-10-09: the Harness runs the conversation and the
// background work alike, wherever it is): Attention checks, Applet tasks and Fox's own look-arounds go to the other
// computer's background lane, beside its conversation, when its Worldlet runs them (`lanes`). Accounts are read in this
// computer's Platform. Worldlet keeps the companion's memory and conversations, as for a local Harness.
export const REMOTE_HARNESS_ID='remote';
export class RemoteHarnessRuntime implements AgentRuntime {
 private controller:AbortController|null=null;
 private readonly link:RemoteAgentLink;
 private readonly onActivity:(running:boolean)=>void;
 /** What is not a chat turn: the Agent's own business there (ElsewhereAdapter `local`). */
 private readonly local:()=>AgentRuntime;
 /** `background`: a lane beside the conversation (makeLane), not the person's turn. */
 private readonly lane:'background'|undefined;
 constructor(link:RemoteAgentLink,local:()=>AgentRuntime,onActivity:(running:boolean)=>void=()=>{},lane?:'background'){this.link=link;this.local=local;this.onActivity=onActivity;this.lane=lane;}
 get isRunning(){return this.controller!==null;}
 /** Stops the turn: here at once, and on the host with a `cancel` message. */
 cancel(){this.controller?.abort();}
 async steer(){return false;}
 status():Row {
  const s=this.link.status(),computer=s.computer||'your other computer';
  if(s.state!=='paired')return {ready:false,name:'Agent on another computer',provider:REMOTE_HARNESS_ID,error:'Pair with Worldlet on your other computer again.'};
  return {ready:true,name:`Agent on ${computer}`,provider:REMOTE_HARNESS_ID,location:{kind:'remote',computer},seenAt:s.seenAt??null,
   capabilities:{streaming:true,tools:true,cancel:true,steer:false,memory:false,sessions:true,routines:false}};
 }
 run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  if(body.action==='status')return Promise.resolve(this.status());
  if(body.action==='warmup'){void this.link.heartbeat();return Promise.resolve({});}
  // Every chat turn goes to the other computer: the person's, and background work on a lane (or one Worldlet started).
  if(body.action!=='chat'||typeof body.text!=='string'||!body.text.trim())return this.local().run(body,home,onEvent);
  return ExecutionJournal.run(body,home,onEvent,observed=>this.execute(body,observed));
 }
 private async execute(body:Row,onEvent:AgentEventHandler):Promise<Row> {
  if(this.controller)throw new WorldletError('Fox is already working.');
  const controller=new AbortController(),lane=this.lane??(body._background===true||body.mode==='setup'?'background':undefined);
  this.controller=controller;if(!lane)this.onActivity(true);
  // A `tool` event is a World tool call from the Agent there: the World here answers it, as for a local Agent.
  try{return await this.link.turn(body,event=>onEvent(agentEvent(event as Row)),controller.signal,lane);}
  catch(error){if(controller.signal.aborted)throw new AgentCancelled();throw error;}
  finally{this.controller=null;if(!lane)this.onActivity(false);}
 }
}

/** An Agent elsewhere that runs Fox's conversation and its background work (Attention checks, Applet tasks) on a lane
 * of its own (`makeLane`). Like a local Harness, Worldlet keeps the companion's memory and conversations, and the World's
 * accounts are read in this computer's Platform (owner decision 2026-10-09: no built-in Agent; a local and a remote
 * Harness are one contract). RemoteHarnessAdapter and the direct remote Gateway (remote-gateway.ts) share it. */
export abstract class ElsewhereAdapter extends PortableAdapter {
 readonly available=true;
 protected running=0;
 /** Counts the conversation's turns running there, for `hasInteractiveWork`. */
 protected activity=(running:boolean)=>{this.running+=running?1:-1;};
 /** Mail and Attention checks read accounts in this computer's Platform and think on the Agent elsewhere. */
 override get supportsBackgroundChecks(){return true;}
 hasInteractiveWork(){return this.running>0;}
 /** Background work and Applet tasks run on the Agent elsewhere, beside its conversation. */
 background(){return this;}
 abstract makeLane():AgentRuntime;
 get makeTask(){return ()=>this.makeLane();}
 /** What is not a chat turn (a model or account change) is the Agent's own business there. */
 protected local=():AgentRuntime=>new UnsupportedRuntime(`Fox uses ${this.title()}. Manage its models and accounts there.`);
 protected abstract title():string;
 makeModelAccess(){return this.local();}
 makeSourceAccess(){return new UnsupportedRuntime(`${this.title()} does not read connected accounts for Worldlet.`);}
 makeRoutines():AgentRoutines {return NO_ROUTINES;}
 home(scope:'private'|'sample'|'setup'){return path.join(this.context.root,'agent',scope,this.id);}
 async shutdown(){}
}

export class RemoteHarnessAdapter extends ElsewhereAdapter implements Adapter {
 readonly id=REMOTE_HARNESS_ID;
 /** The Harness Fox talks through, for the services the World asks of it (core harnessService `remote`). */
 get harness(){return {id:REMOTE_HARNESS_ID,title:`Agent on ${this.link.status().computer||'your other computer'}`};}
 private readonly link:RemoteAgentLink;
 private heartbeat:ReturnType<typeof setInterval>;
 constructor(context:RuntimeContext,link:RemoteAgentLink){
  super(context);this.link=link;
  // While this runs, a read a minute keeps the host listening closely, so a line reaches it within about a second.
  this.heartbeat=setInterval(()=>void link.heartbeat(),60_000);this.heartbeat.unref?.();void link.heartbeat();
 }
 make():AgentRuntime {return new RemoteHarnessRuntime(this.link,this.local,this.activity);}
 makeLane():AgentRuntime {return new RemoteHarnessRuntime(this.link,this.local,()=>{},'background');}
 /** Permission prompts of the Agent there, answered on this computer's approval card. */
 approvals(){const link=this.link;return {answer:(id:string,choice:HarnessApprovalChoice)=>link.answer(id,choice)};}
 /** The person's agents on the other computer (its `desktop` slot), so an Applet's thread can be answered by one. */
 agents(){const link=this.link;return {list:async()=>link.agents()};}
 async status(_home:string){return new RemoteHarnessRuntime(this.link,this.local).status();}
 override warm(){void this.link.heartbeat();}
 protected title(){return this.harness.title;}
 override async shutdown(){clearInterval(this.heartbeat);await super.shutdown();}
 override resetExplanation(){const computer=this.link.status().computer||'your other computer';return `This deletes Worldlet’s companion archive, conversations, saved items and local connections on this computer and ends the pairing with ${computer}. Worldlet and the Agent on ${computer} keep their own data. Worldlet then starts onboarding again. This cannot be undone.`;}
}
