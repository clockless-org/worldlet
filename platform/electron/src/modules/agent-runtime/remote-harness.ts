import {WorldletError} from '../../files.ts';
import {ExecutionJournal} from './journal.ts';
import {AgentCancelled,UnsupportedRuntime,agentEvent} from './protocol.ts';
import type {RemoteAgentLink} from '../phone/remote.ts';
import type {HarnessApprovalChoice} from '../../../../../contracts/harness-services.ts';
import type {Adapter,AgentEventHandler,AgentRuntime,Row} from './types.ts';

// Fox's Agent on another computer (core/phone/README.md#another-computers-agent; Harness service `location` remote):
// the person's always-on computer runs Worldlet with their Agent, and this Worldlet is paired with it. Fox's turns go
// there (the main conversation, an item card's and an Applet's thread, each its own session there) with this
// companion's instructions and the current view, and their World tool calls come back to run here, so Fox still acts in
// this World. Accounts, Attention checks, Applet tasks and routines stay with the built-in Agent on this computer (and
// run only while it has a model of the person's). Every other part of the Adapter is the built-in one's.
export const REMOTE_HARNESS_ID='remote';
export class RemoteHarnessRuntime implements AgentRuntime {
 private controller:AbortController|null=null;
 private readonly link:RemoteAgentLink;
 private readonly onActivity:(running:boolean)=>void;
 /** The built-in Agent here, for what is not the person's line in Fox's conversation (setup, practice, background). */
 private readonly local:()=>AgentRuntime;
 constructor(link:RemoteAgentLink,local:()=>AgentRuntime,onActivity:(running:boolean)=>void=()=>{}){this.link=link;this.local=local;this.onActivity=onActivity;}
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
  // Only what the person says to Fox (in any thread) goes to the other computer, never work Worldlet starts here.
  if(body.action!=='chat'||body._background===true||body.mode!=='chat'||body.sample===true||typeof body.text!=='string'||!body.text.trim())return this.local().run(body,home,onEvent);
  return ExecutionJournal.run(body,home,onEvent,observed=>this.execute(body,observed));
 }
 private async execute(body:Row,onEvent:AgentEventHandler):Promise<Row> {
  if(this.controller)throw new WorldletError('Fox is already working.');
  const controller=new AbortController();this.controller=controller;this.onActivity(true);
  // A `tool` event is a World tool call from the Agent there: the World here answers it, as for a local Agent.
  try{return await this.link.turn(body,event=>onEvent(agentEvent(event as Row)),controller.signal);}
  catch(error){if(controller.signal.aborted)throw new AgentCancelled();throw error;}
  finally{this.controller=null;this.onActivity(false);}
 }
}

/** An Agent elsewhere that answers only Fox's conversation: everything else (accounts, background work, Applet tasks,
 * routines, the companion's files) stays with the built-in Agent on this computer. RemoteHarnessAdapter and the direct
 * remote Gateway (remote-gateway.ts) share it. */
export abstract class ElsewhereAdapter {
 readonly available=true;
 private readonly makeBuiltIn:()=>Adapter;
 private builtInAdapter:Adapter|null=null;
 protected running=0;
 constructor(builtIn:()=>Adapter){this.makeBuiltIn=builtIn;}
 protected get b(){return this.builtInAdapter??=this.makeBuiltIn();}
 /** Counts the conversation's turns running there, for `hasInteractiveWork`. */
 protected activity=(running:boolean)=>{this.running+=running?1:-1;};
 get memoryAuthority(){return this.b.memoryAuthority;}
 get supportsBackgroundChecks(){return this.b.supportsBackgroundChecks;}
 hasInteractiveWork(){return this.running>0||this.b.hasInteractiveWork();}
 /** Background work and Applet tasks stay on this computer's built-in Agent. */
 background(){return this.b.available?this.b:null;}
 makeLane():AgentRuntime {return this.b.makeLane?.()??new UnsupportedRuntime('Background work runs on this computer’s own Agent.');}
 get makeTask(){const b=this.b;return b.makeTask?()=>b.makeTask!():undefined;}
 accountOwner(){return this.b;}
 makeModelAccess(){return this.b.makeModelAccess();}
 makeSourceAccess(){return this.b.makeSourceAccess();}
 makeSourceConnections(){return this.b.makeSourceConnections();}
 makeRoutines(){return this.b.makeRoutines();}
 prepare(){return this.b.prepare?.()??Promise.resolve();}
 home(scope:'private'|'sample'|'setup'){return this.b.home(scope);}
 async shutdown(){await this.builtInAdapter?.shutdown();}
 whileStopped<T>(work:()=>Promise<T>):Promise<T> {const b=this.builtInAdapter;return b?.whileStopped?b.whileStopped(work):(b?.shutdown()??Promise.resolve()).then(work);}
 checkpointCompanion(archive:Row){return this.b.checkpointCompanion(archive);}
 captureCompanion(archive:Row,imported:boolean){return this.b.captureCompanion(archive,imported);}
 installCompanion(archive:Row,current:Row,imported:boolean,install:(archive:Row,recovery:Row|null)=>string|null){return this.b.installCompanion(archive,current,imported,install);}
 allowsBackupPath(relative:string){return this.b.allowsBackupPath(relative);}
 validateBackupEntry(relative:string,data:Buffer){this.b.validateBackupEntry(relative,data);}
 diagnosticFiles(home:string){return this.b.diagnosticFiles(home);}
 profile(discover:boolean){return this.b.profile(discover);}
 bindProfile(file:string){return this.b.bindProfile(file);}
 resetRetainedPaths(){return this.b.resetRetainedPaths();}
 get replaceCompanionMemories(){const b=this.b;return b.replaceCompanionMemories?(memories:Row[],commit:()=>void)=>b.replaceCompanionMemories!(memories,commit):undefined;}
}

export class RemoteHarnessAdapter extends ElsewhereAdapter implements Adapter {
 readonly id=REMOTE_HARNESS_ID;
 /** The Harness Fox talks through, for the services the World asks of it (core harnessService `remote`). */
 get harness(){return {id:REMOTE_HARNESS_ID,title:`Agent on ${this.link.status().computer||'your other computer'}`};}
 private readonly link:RemoteAgentLink;
 private heartbeat:ReturnType<typeof setInterval>;
 constructor(link:RemoteAgentLink,builtIn:()=>Adapter){
  super(builtIn);this.link=link;
  // While this runs, a read a minute keeps the host listening closely, so a line reaches it within about a second.
  this.heartbeat=setInterval(()=>void link.heartbeat(),60_000);this.heartbeat.unref?.();void link.heartbeat();
 }
 make():AgentRuntime {return new RemoteHarnessRuntime(this.link,()=>this.b.make(),this.activity);}
 /** Permission prompts of the Agent there, answered on this computer's approval card. */
 approvals(){const link=this.link;return {answer:(id:string,choice:HarnessApprovalChoice)=>link.answer(id,choice)};}
 /** The person's agents on the other computer (its `desktop` slot), so an Applet's thread can be answered by one. */
 agents(){const link=this.link;return {list:async()=>link.agents()};}
 async status(_home:string){return new RemoteHarnessRuntime(this.link,()=>this.b.make()).status();}
 warm(home:string,prime?:Row){void this.link.heartbeat();this.b.warm(home,prime);}
 override async shutdown(){clearInterval(this.heartbeat);await super.shutdown();}
 resetExplanation(){const computer=this.link.status().computer||'your other computer';return `This deletes Worldlet’s companion archive, conversations, saved items and local connections on this computer and ends the pairing with ${computer}. Worldlet and the Agent on ${computer} keep their own data. Worldlet then starts onboarding again. This cannot be undone.`;}
}
