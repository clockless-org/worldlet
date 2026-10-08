import type {Row} from '../../host/types.ts';
import type {AgentEventHandler,AgentRuntime,AgentRoutines,AgentSourceConnections} from '../../host/services.ts';
import type {HarnessAgents,HarnessApprovals,HarnessModels,HarnessCalls,HarnessEvents,HarnessSchedule,HarnessSkills,HarnessTools} from '../../../../../contracts/harness-services.ts';
import type {Profile} from '../../profile.ts';
export type {Row,AgentEventHandler,AgentRuntime,AgentRoutines,AgentSourceConnections};

/** What the adapters need from the host; kept small so check.ts can supply it without Electron. */
export interface RuntimeContext {
 profile:Profile;
 root:string;
 development:boolean;
 /** Stable pseudonymous model analytics ID, or '' when analytics is off. */
 analyticsID():string;
 openExternal(url:string):Promise<void>;
 /** Writes one journal entry into world.sqlite; false when it could not be recorded. */
 record(entry:Row):boolean;
 failure(error:unknown,operation:string):void;
 changed(reason:'runtime-ready'|'model-changed'|'agent-changed'):void;
 /** A Harness session that is Fox's own (a resident session per Fox thread), kept out of that Harness's history sync. */
 ownSession?(source:string,session:string,thread:string):void;
}

/** The selected Agent implementation (Mac AgentAdapter + AgentProfiles + AgentCompanionTransfer). */
export interface Adapter {
 readonly id:string;
 readonly memoryAuthority:string;
 readonly supportsBackgroundChecks:boolean;
 readonly available:boolean;
 hasInteractiveWork():boolean;
 make():AgentRuntime;
 /** Present only when Fox can hand an Applet task to a lane beside the conversation. */
 makeTask?():AgentRuntime;
 /** A runtime for background work beside the conversation (a local Harness's Attention check), which is not the
  * person's interactive work. Absent: `make`. */
 makeLane?():AgentRuntime;
 /** The adapter background work runs on when it is not this one (a local Harness hands it to the built-in Hermes
  * while that has a model). Absent or null: this adapter, when it `supportsBackgroundChecks`. */
 background?():Adapter|null;
 makeModelAccess():AgentRuntime;
 makeSourceAccess():AgentRuntime;
 makeSourceConnections():AgentSourceConnections;
 /** The adapter that connects and reads accounts when it is not this one (a local Harness hands
  * them to the built-in Hermes). Absent: this adapter owns them. */
 accountOwner?():Adapter;
 makeRoutines():AgentRoutines;
 /** The local Harness this adapter talks through, and its own scheduler (`schedule: 'files'`); absent for the built-in Agent. */
 readonly harness?:{id:string;title:string};
 schedule?():HarnessSchedule|null;
 /** The Harness's own permission prompts, when it surfaces them (contracts/harness-services.ts `approvals`). */
 approvals?():HarnessApprovals|null;
 /** A standing rule of `harness` was revoked: a Harness that reads its rules only when it starts
  * (`approvalFeatures.revoke: 'restart'`) has the process Worldlet runs of it started again once idle. */
 forgetApprovals?(harness:string):void;
 /** The Harness's own `events`, `calls` and `tools` services (contracts/harness-services.ts); absent or null: not provided. */
 harnessEvents?():HarnessEvents|null;
 harnessCalls?():HarnessCalls|null;
 harnessTools?():HarnessTools|null;
 /** The Harness's own skills (contracts/harness-services.ts `skills`), listed and added to its own way. */
 harnessSkills?():HarnessSkills|null;
 /** The person's own agents or profiles in that Harness (contracts/harness-services.ts `agents`). */
 agents?():HarnessAgents|null;
 /** The models the same Agent can answer a thread with (contracts/harness-services.ts `models`). */
 models?():HarnessModels|null;
 helperPython():Promise<string>;
 status(home:string):Promise<Row>;
 /** Installs the runtime when it is not `available` yet; absent when there is nothing to install. */
 prepare?():Promise<void>;
 home(scope:'private'|'sample'|'setup'):string;
 /** Starts the runtime ahead of work. `prime`: a conversation turn's body without its message, so a runtime that
  * resumes sessions gets the conversation ready while the person is still typing. */
 warm(home:string,prime?:Row):void;
 shutdown():Promise<void>;
 /** Shuts down and starts nothing until `work` settles. Absent: shutdown, then `work`. */
 whileStopped?<T>(work:()=>Promise<T>):Promise<T>;
 checkpointCompanion(archive:Row):Row;
 /** `imported`: the World holds a session marker (an import or memory edit), so the Harness's own conversations are not added. */
 captureCompanion(archive:Row,imported:boolean):Row;
 /** Replaces Fox with `archive`: the adapter prepares it and its recovery copy, `install` saves them in the World. */
 installCompanion(archive:Row,current:Row,imported:boolean,install:(archive:Row,recovery:Row|null)=>string|null):string|null;
 allowsBackupPath(relative:string):boolean;
 validateBackupEntry(relative:string,data:Buffer):void;
 diagnosticFiles(home:string):[string,string][];
 profile(discover:boolean):Row;
 bindProfile(path:string):Row;
 resetRetainedPaths():Set<string>;
 resetExplanation():string;
 /** Present only when this adapter's durable memory files are user-editable. */
 replaceCompanionMemories?(memories:Row[],commit:()=>void):void;
}
