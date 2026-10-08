/** Worldlet Harness services v2 (contracts/HARNESS.md#harness-services-v2): one contract every Harness adapter implements,
 * so what a person did with OpenClaw, Hermes Agent, Claude Code, Codex or pi keeps working in the World. Each service is
 * optional and declared; the World asks for a service, never for a Harness by name. Times are epoch milliseconds. */
import type {AgentEvent} from './agent.ts';
export const HARNESS_SERVICES_VERSION=2;
export const HARNESS_SERVICE_NAMES=['conversation','history','schedule','approvals','agents','models','events','calls','tools','send','voice','location','connections','skills'] as const;
export type HarnessServiceName=typeof HARNESS_SERVICE_NAMES[number];
/** How an adapter provides a service: `native` through the Harness's own interface (Gateway, ACP, API server, its own
 * command line), `files` by reading the Harness's own folder read-only, `worldlet` by Worldlet standing in for it. */
export type HarnessServiceMode='native'|'files'|'worldlet';
export type HarnessServices={version:2;harness:string;services:Partial<Record<HarnessServiceName,HarnessServiceMode>>;approvalFeatures?:HarnessApprovalFeatures};

/** conversation: a resident session per Fox thread. The Harness keeps the context (compaction included); Worldlet sends
 * only the new line, its instructions and World tools. `model`: one the `models` service listed, for this turn and
 * the ones after it (absent: the Agent's own). `world`: a short bounded note of what happened in the World since this
 * session last replied (core/agent/world-since.ts), which leads the turn's input after the instructions, so the session
 * keeps it like any line (core harnessTurnText); absent when nothing happened. */
export type HarnessSessionKey={world:string;thread:string;agent?:string};
export type HarnessTurnInput={text:string;instructions:string;tools:boolean;attachments?:string[];model?:string;world?:string};
export type HarnessTurnEvent=AgentEvent|{type:'approval';request:HarnessApprovalRequest}|{type:'approval_result';result:HarnessApprovalResult};
/** What one turn used, as the Harness reported it, never estimated: tokens (`cachedTokens` and `reasoningTokens` are
 * parts of input and output), its cost only when the Harness gives one, and how full the session's context is. */
export type HarnessUsage={inputTokens?:number;outputTokens?:number;totalTokens?:number;cachedTokens?:number;reasoningTokens?:number;
 cost?:{amount:number;currency:string};context?:{used:number;size:number}};
export interface HarnessSession {
 readonly key:HarnessSessionKey;
 /** One turn; events stream through `onEvent`; resolves with the final reply text and what it used, when reported. */
 send(input:HarnessTurnInput,onEvent:(event:HarnessTurnEvent)=>void):Promise<{text:string;usage?:HarnessUsage}>;
 cancel():void;
 close():Promise<void>;
}
/** `open` is idempotent and cheap to repeat: the World opens a thread's session as soon as the person starts typing or
 * opens Fox (warm-up), and the turn that follows gets the same session, never a second one. */
export interface HarnessConversation {open(key:HarnessSessionKey):Promise<HarnessSession>;}

/** history: the Harness's own conversations (channels, threads, DMs, sessions), read continuously, not copied once.
 * `shared` marks a thread other people write in too (a group or channel), not only the person with their Agent. */
export type HarnessThread={id:string;title:string;channel?:string;agent?:string;shared?:boolean;updatedAt:number};
export type HarnessTurnRecord={id:string;role:'user'|'assistant';text:string;at:number};
export interface HarnessHistory {
 /** A thread may be listed with an empty title when naming it means reading it; its turns then carry the title. */
 threads(since?:number):Promise<HarnessThread[]>;
 /** Turns after `cursor` (an id this service returned), oldest first, at most `limit`. */
 turns(thread:string,cursor?:string,limit?:number):Promise<{turns:HarnessTurnRecord[];cursor?:string;title?:string}>;
 /** Calls `onChange` soon after the Harness writes to its history (a file it writes, a Gateway event), so new turns are
  * read as they arrive; absent, the World reads again on its own clock. Returns how to stop. */
 watch?(onChange:()=>void):()=>void;
}

/** schedule: jobs run on the Harness's own scheduler; each run's result comes back to the World (Attention, phone). */
export type HarnessJobKind='prompt'|'script'|'condition'|'command';
export type HarnessJob={id:string;name:string;kind:HarnessJobKind;paused:boolean;
 when:{cron:string}|{everySeconds:number}|{at:number};prompt?:string;agent?:string;
 /** Where the Harness delivers results today, e.g. "telegram", "discord", "webhook"; absent when it keeps them. */
 delivery?:string};
export type HarnessJobRun={id:string;job:string;at:number;status:'ok'|'failed'|'silent';output:string};
export interface HarnessSchedule {
 jobs():Promise<HarnessJob[]>;
 runs(cursor?:string):Promise<{runs:HarnessJobRun[];cursor?:string}>;
 /** Whether the Harness's scheduler is running now (its Gateway or cron process); null when it cannot tell. */
 running():Promise<boolean|null>;
 /** How the person starts that scheduler (a command), for the World's note when it is not running. */
 readonly start?:string;
}

/** approvals: the Harness's own permission prompts (dangerous commands, tool policy), answered in the World. `rule` is
 * what Always would allow, in the Harness's own terms (a Hermes Agent pattern key, an OpenClaw command); `agent` and
 * `thread` say which of the person's agents asked and in which Fox thread (core harnessSessionThread). */
export type HarnessApprovalChoice='once'|'always'|'deny';
export type HarnessApprovalRequest={id:string;title:string;detail:string;choices:HarnessApprovalChoice[];expiresAt?:number;rule?:string;agent?:string;thread?:string};
export interface HarnessApprovals {answer(id:string,choice:HarnessApprovalChoice):Promise<void>;}
/** What an approved command or edit did, as the Harness reported it when it finished: the files it changed (a line
 * diff each) and its output. `files` empty with `reported: false`: the Harness says nothing about files. */
export type HarnessChangedFile={path:string;change:'add'|'edit'|'delete';diff:string};
export type HarnessApprovalResult={id:string;status:'completed'|'failed';files:HarnessChangedFile[];reported:boolean;output?:string};
/** The standing rules an Always left in the Harness, read from where the Harness keeps them; `revoke` makes the
 * Harness forget one its own way. `grantedAt`/`lastUsedAt` only when the Harness records them; `main`: the rule is
 * the agent's Fox talks through when no other is chosen (or every agent's). */
export type HarnessStandingRule={id:string;allows:string;agent:string;kind:'command'|'tool'|'automation';grantedAt?:number;lastUsedAt?:number;note?:string;main?:boolean};
export interface HarnessStandingRules {list():Promise<HarnessStandingRule[]>;revoke(id:string):Promise<void>;}
/** How a Harness that declares `approvals` keeps and reports them beyond answering. `rules`: where its standing rules
 * are read (absent: it keeps none Worldlet can read). `revoke`: `live` takes effect at once, `restart` when the Harness
 * next starts (Worldlet restarts its own process of it), absent: it cannot be revoked from the World, `revokeNote`
 * says how. `changes`: `diffs` when it reports the files an approved action changed, `output` when only its output. */
export type HarnessApprovalFeatures={rules?:HarnessServiceMode;revoke?:'live'|'restart';revokeNote?:string;changes?:'diffs'|'output'};

/** agents: the Harness's own agents or profiles, each with its instructions, so an Applet or theme can use one. `main`
 * marks the one Fox talks through when no other is chosen; `HarnessSessionKey.agent` names another by its `id`. */
export type HarnessAgent={id:string;name:string;instructions?:string;model?:string;main?:boolean};
export interface HarnessAgents {list():Promise<HarnessAgent[]>;}

/** models: the models the same Agent can answer with (its own sign-in and providers, never Worldlet's), so an Applet's
 * thread can use a cheaper one (`HarnessTurnInput.model`). `current` marks the one it uses now; `agent` lists another
 * agent's (`HarnessSessionKey.agent`). */
export type HarnessModel={id:string;name:string;current?:boolean};
export interface HarnessModels {list(agent?:string):Promise<HarnessModel[]>;}

/** events: things that start the Harness from outside (webhooks, mail triggers, hooks), shown in the World. */
export type HarnessExternalEvent={id:string;source:'webhook'|'email'|'hook'|'channel';title:string;text:string;at:number};
export interface HarnessEvents {subscribe(onEvent:(event:HarnessExternalEvent)=>void):()=>void;}

/** calls: phone calls the Harness placed or answered (a voice-call plugin), as the Harness recorded them, handed over
 * again whenever one changes (ringing, then ended with its transcript). Not an `events` source: a call is a record
 * with a party, a direction, a duration and an outcome, and the Agent places most of them itself. `peer` is the other
 * party's number or address; `requestedBy` the Harness session that asked for it (a Fox thread's resident session
 * when Fox asked); `transcript` and `summary` are there only when the Harness keeps them. */
export type HarnessCallOutcome='in-progress'|'completed'|'missed'|'no-answer'|'busy'|'voicemail'|'failed'|'rejected';
export type HarnessCallLine={speaker:'agent'|'peer';text:string;at:number};
/** Where a call in progress stands, when the Harness records it: still dialing out, ringing, or connected. */
export type HarnessCallLive='dialing'|'ringing'|'talking';
export type HarnessCall={id:string;direction:'outbound'|'inbound';peer:string;startedAt:number;answeredAt?:number;endedAt?:number;
 outcome:HarnessCallOutcome;live?:HarnessCallLive;transcript:HarnessCallLine[];summary?:string;message?:string;requestedBy?:string;agent?:string};
/** A call the person confirmed in the World: the number (E.164) and what the Agent says first when it connects (who it
 * calls for, why, what it needs to find out); the Agent carries the conversation on from there. */
export type HarnessCallRequest={to:string;message:string};
export interface HarnessCalls {
 /** Each call, and again whenever it changes; while one is in progress the Harness is read often enough to follow it
  * live (its status and each transcript line). */
 subscribe(onCall:(call:HarnessCall)=>void):()=>void;
 /** Whether `place` can dial now; when it cannot, `note` says plainly how the person sets it up. Absent with `place`:
  * this Harness only records calls. */
 placing?():{ready:true}|{ready:false;note:string};
 /** Dials through the Harness's own calling (only after the person confirmed this exact request); resolves with the
  * id the call carries in `subscribe`, rejects with the Harness's reason. */
 place?(request:HarnessCallRequest):Promise<{id:string}>;
 /** Hangs up a call in progress. */
 hangUp?(id:string):Promise<void>;
}

/** tools: what the Harness itself can do beyond World tools (phone calls, image generation, shell), listed so Fox can
 * offer them and the World can show their results. Calls go through the Harness, under its own approvals. */
export type HarnessTool={name:string;title:string;kind:'call'|'media'|'shell'|'web'|'other'};
export interface HarnessTools {list():Promise<HarnessTool[]>;}

/** send: a message into one of the Harness's own channel threads (the Discord channel or Telegram chat a `history`
 * thread came from), sent by the Harness itself with its own channel sign-in. Worldlet sends only text the person
 * approved exactly as shown; a thread the Harness cannot send to has no `route`. */
export type HarnessSendRoute={thread:string;channel:string;where:string};
export interface HarnessSend {
 /** Where a message in `thread` (a `history` thread id) would go, or null when the Harness cannot send there. */
 route(thread:string):Promise<HarnessSendRoute|null>;
 /** Sends `text` there; resolves when the Harness reports it sent, rejects with its reason otherwise. */
 send(thread:string,text:string):Promise<{id?:string}>;
}

/** voice: the Harness's own text-to-speech, with the provider, voice and persona the person set up there, so Fox's
 * spoken replies sound like their Agent. One clip per call (`audio`, `mimeType` such as audio/mpeg); it rejects when
 * the Harness cannot speak it, and the World then reads the reply with a system voice. */
export type HarnessSpokenClip={audio:Uint8Array;mimeType:string;provider?:string};
export interface HarnessVoice {speak(text:string):Promise<HarnessSpokenClip>;}

/** connections: the MCP servers (`mcp`) and chat accounts (`account`: a Telegram bot, a Discord app) the person set up
 * in their Agent, so the World lists them with what each was last used for and adds or removes a server through the
 * Agent's own commands, each change confirmed by the person first. Never a secret: `where` is an address or command
 * with any token masked, and `sign` says only how it signs in. `lastUsed`: the newest call of one of its tools (or, for
 * an account, the newest conversation on that channel) in the Agent's own history, with that conversation's title. */
export type HarnessConnectionUse={at:number;tool?:string;thread?:string};
export type HarnessConnection={id:string;kind:'mcp'|'account';name:string;where:string;enabled:boolean;
 sign?:'oauth'|'token'|'none'|'needs-sign-in';agent?:string;main?:boolean;removable?:boolean;lastUsed?:HarnessConnectionUse};
/** A server to add: an address (HTTP, no sign-in from Worldlet) or a command with its arguments (run by the Agent). */
export type HarnessConnectionAdd={name:string;url:string}|{name:string;command:string;args:string[]};
export type HarnessConnectionChange={add:HarnessConnectionAdd}|{remove:string};
export interface HarnessConnections {
 list():Promise<HarnessConnection[]>;
 /** The Agent's own command a change runs, as the person sees it before confirming (secrets never appear in it);
  * absent with `change`: this Harness's connections are read-only here. */
 preview?(change:HarnessConnectionChange):Promise<string>;
 /** Runs that command (only after the person confirmed this exact preview); rejects with the Agent's reason. */
 change?(change:HarnessConnectionChange):Promise<void>;
}
/** skills: the Agent's own skills (a folder each with a SKILL.md: its name, a one-line description, then the steps), so
 * the World shows them with when each last ran, as the Agent recorded it (`lastUsedAt`; absent when it records none, and
 * the World's synced turns that invoked it count too). `save` adds a new one the person confirmed where the Agent keeps
 * its own, its own way (its command line in mode `native`; in mode `files`, a new SKILL.md folder exactly where the
 * Agent's own skill tool creates one, never changing or removing an existing one); it rejects with the Agent's reason.
 * Absent: Worldlet has no way to add one there, and the World keeps the skill itself. `where` is the folder. */
export type HarnessSkill={name:string;description:string;where:string;lastUsedAt?:number};
export type HarnessSkillDraft={name:string;description:string;body:string};
export interface HarnessSkills {list():Promise<HarnessSkill[]>;save?(draft:HarnessSkillDraft):Promise<{name:string;where:string}>;}

/** location: where the Harness runs. A remote one is reached through a paired Worldlet on that computer, or directly
 * (`direct`: its own network interface, such as an OpenClaw Gateway's address and token). */
export type HarnessLocation={kind:'local'}|{kind:'remote';computer:string;direct?:true};

export const HARNESS_SERVICE_MODES:readonly HarnessServiceMode[]=['native','files','worldlet'];
export function validateHarnessServices(value:unknown):HarnessServices {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Harness services.');
 const v=value as HarnessServices;
 if(v.version!==HARNESS_SERVICES_VERSION||typeof v.harness!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(v.harness))throw Error('Harness services require version 2 and a Harness id.');
 if(!v.services||typeof v.services!=='object'||Array.isArray(v.services))throw Error('Harness services must be an object.');
 const services:HarnessServices['services']={};
 for(const [name,mode] of Object.entries(v.services)){
  if(!(HARNESS_SERVICE_NAMES as readonly string[]).includes(name))continue;
  if(!HARNESS_SERVICE_MODES.includes(mode as HarnessServiceMode))throw Error('Unknown Harness service mode: '+String(mode));
  services[name as HarnessServiceName]=mode as HarnessServiceMode;
 }
 if(v.approvalFeatures===undefined)return {version:2,harness:v.harness,services};
 const f=v.approvalFeatures as Record<string,unknown>;
 if(!f||typeof f!=='object'||Array.isArray(f)||!services.approvals)throw Error('Approval features need the approvals service.');
 if(f.rules!==undefined&&!HARNESS_SERVICE_MODES.includes(f.rules as HarnessServiceMode))throw Error('Unknown approval rules mode: '+String(f.rules));
 if(f.revoke!==undefined&&(f.rules===undefined||!['live','restart'].includes(f.revoke as string)))throw Error('Revoking needs readable rules and live or restart.');
 if(f.changes!==undefined&&!['diffs','output'].includes(f.changes as string))throw Error('Unknown approval changes: '+String(f.changes));
 if(f.revokeNote!==undefined&&(typeof f.revokeNote!=='string'||f.revokeNote.length>300))throw Error('Revoke note must be a short string.');
 const approvalFeatures:HarnessApprovalFeatures={};
 for(const key of ['rules','revoke','revokeNote','changes'] as const)if(f[key]!==undefined)(approvalFeatures as Record<string,unknown>)[key]=f[key];
 return {version:2,harness:v.harness,services,approvalFeatures};
}
