import type {ServiceRead} from '../../../../contracts/services.ts';
import type {NativeImage} from 'electron';
import type {Row} from './types.ts';
import type {HarnessApprovals,HarnessCalls,HarnessEvents,HarnessSend,HarnessSkills,HarnessTools,HarnessVoice} from '../../../../contracts/harness-services.ts';
import type {PhonePushRequest} from '../../../../core/phone/index.ts';
import type {AgentAuditEntry,AgentIdentity,Grant} from '../../../../contracts/agent-identity.ts';
import type {McpSession,PosthogSettings} from '../../../../core/accounts/index.ts';
import type {PosthogRequest} from '../../../../core/agent/index.ts';
// Cross-module service contracts inside the Electron host. A module provides one with
// `host.provide(NAME, impl)` and others reach it with `host.use(NAME)` / `host.optional(NAME)`.
// Modules never import each other's implementation files.

// Agent runtime (modules/agent-runtime) ---------------------------------------------------
/** One Harness conversation lane. `onEvent` receives adapter events; returning a value
 * answers a `tool` event (the value becomes the tool result). */
export type AgentEventHandler=(event:Row)=>Promise<Row|null|undefined>|Row|null|undefined;
export interface AgentRuntime {
 run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row>;
 steer(text:string):Promise<boolean>;
 cancel():void;
}
export interface AgentSourceConnection {provider:string;target:string;transport:string;connector?:string;cursors?:Record<string,string>}
export interface AgentSourceConnections {
 providers(provider:string):string[];
 cancel():void;
 /** `onStage` is Google sign-in progress ('browser' only once consent was opened, with its validated address, then 'preparing'/'verifying').
  * `settings`: what a Service connected with a pasted key also needs (PostHog's address and project), checked by its owner. */
 connect(options:{provider:string,target:string,endpoint:string,token:string,settings?:Record<string,string>,home:string,mock?:boolean,onStage:(stage:string,url?:string)=>void,
  /** A code the person types on the service's own page (GitHub's device flow), shown on the World page (SIGN_IN_CODE_EVENT). */
  onCode?:(code:{provider:string;code:string;url:string})=>void,onConnected:(connection:AgentSourceConnection)=>void}):Promise<void>;
 disconnect(connection:Row,home:string):Promise<string[]>;
 clientReady(provider:string,home:string):Promise<boolean>;
 configureClient(provider:string,file:string,home:string):Promise<void>;
}
/** `wake` ticks at once (the computer woke from sleep) instead of waiting for the next minute. `elsewhere`: routine key
 * prefixes of brought copies whose jobs the chosen Harness's own scheduler runs, which therefore stay paused here. */
export interface AgentRoutines {start(isAllowed:()=>boolean,onResult:(result:Row)=>void,elsewhere?:()=>string[]):void;stop():void;wake():void}
export type AgentScope='private'|'sample'|'setup';
export interface AgentService {
 readonly id:string;
 readonly memoryAuthority:string;
 readonly available:boolean;
 readonly supportsBackgroundChecks:boolean;
 hasInteractiveWork():boolean;
 /** Foreground Fox chat lane. */
 make():AgentRuntime;
 /** Fox's Applet tasks, beside the conversation; absent when the Agent cannot run them apart. */
 readonly makeTask?:()=>AgentRuntime;
 /** Background checks and derivations (Mail, Attention): the built-in Hermes while Fox talks through a local Harness. */
 makeBackground?():AgentRuntime;
 makeModelAccess():AgentRuntime;
 /** Account connections belong to Worldlet's connector, not to Fox's Agent: the built-in Hermes
  * keeps them while Fox talks through a local Harness, so choosing or changing Fox's Agent never
  * drops a connection. `accountsId` is the `transport` its connections carry. */
 readonly accountsId:string;
 accountsHome():string;
 makeSourceAccess():AgentRuntime;
 /** Owner-enabled periodic reads, without model execution or conversational payload history. */
 collectServicePage?(request:ServiceRead,signal:AbortSignal):Promise<Row>;
 /** Opaque binding for the World's own Notion OAuth connection; never an Agent token or a provider call. */
 worldNotionBinding?():string|null;
 /** The World's own PostHog and Notion connections, lent to PostHog and Notion drafts for a write the person approved
  * (agent-runtime/service-drafts.ts): PostHog's settings and a request function that keeps its key, and a Notion
  * session the caller closes. Either is null when that Service is not connected. */
 serviceDraftConnections?():{posthog():{settings:PosthogSettings;request:PosthogRequest}|null;notion():(McpSession&{close():Promise<void>})|null};
 makeSourceConnections():AgentSourceConnections;
 /** The World's own Google connection, when this build has one: the signed-in account for analytics and greetings. */
 googleAccount?():{authorized():boolean;profile():{email:string;user_id:string;name?:string}|null}|null;
 makeRoutines():AgentRoutines;
 /** The Harness Fox talks through (contracts/harness-services.ts; its services are core `harnessService(id, …)`), or
  * null for the built-in Agent. */
 readonly harness?:{id:string;title:string}|null;
 /** That Harness's own scheduler, when it declares the `schedule` service. */
 schedule?():import('../../../../contracts/harness-services.ts').HarnessSchedule|null;
 /** The Harness's own permission prompts (contracts/harness-services.ts `approvals`), answered in the World; null when
  * Fox's Agent surfaces none. */
 approvals?():HarnessApprovals|null;
 /** The standing rules an Always left in each Harness on this computer that keeps them where Worldlet can read them
  * (`approvalFeatures.rules`), Fox's or not; revoking one makes that Harness forget it its own way. */
 standingRules?():{harness:string;title:string;rules:import('../../../../contracts/harness-services.ts').HarnessStandingRules}[];
 /** The MCP servers and chat accounts in each Harness on this computer that declares `connections`, Fox's or not; a
  * change runs that Harness's own command. */
 harnessConnections?():{harness:string;title:string;connections:import('../../../../contracts/harness-services.ts').HarnessConnections}[];
 /** The scheduled jobs and skills in each Harness on this computer that declares `schedule` or `skills`, Fox's or not
  * (Settings › Agents); a change runs that Harness's own command. */
 harnessSchedules?():{harness:string;title:string;schedule:import('../../../../contracts/harness-services.ts').HarnessSchedule}[];
 harnessSkillSets?():{harness:string;title:string;skills:HarnessSkills}[];
 /** The same Agents' memory (Settings › Context), read only. */
 harnessMemories?():{harness:string;title:string;memory:import('../../../../contracts/harness-services.ts').HarnessMemory}[];
 /** The person's Harness's `events`, `calls` and `tools` services (contracts/harness-services.ts), null when it provides none. */
 harnessEvents?():HarnessEvents|null;
 harnessCalls?():HarnessCalls|null;
 harnessTools?():HarnessTools|null;
 /** Fox's Harness's own skills (`skills`), null when it declares none: the World then keeps a saved skill itself. */
 harnessSkills?():HarnessSkills|null;
 /** The `send` service of the person's `source` Agent on this computer (any brought one, not only Fox's), null when it
  * declares none or is not installed here: a reply the person approved goes into that Agent's channel thread. */
 channelSend?(source:string):HarnessSend|null;
 /** Where a World tool call that reaches Worldlet outside any Fox turn goes (World tools on Hermes: another Hermes channel,
  * owner decision 2026-10-08 19:15Z); Fox's module answers it as a turn of its own. `agent` is the Agent whose token made
  * the call (core/agent/GRANTS.md). */
 onChannelTool?(handler:(name:string,args:Row,agent?:string)=>Promise<Row>):void;
 /** Each Agent's identity, Grants and audit (core/agent/GRANTS.md); null where the host keeps none. */
 agentAccess?():AgentAccess|null;
 /** Fox's Harness's own text-to-speech (`voice`), null when it declares none or is not installed here: spoken replies
  * then use a system voice. */
 voice?():HarnessVoice|null;
 /** The person's own agents or profiles in that Harness, when it declares the `agents` service; an Applet's thread can
  * be answered by one of them (`harnessAgent` on its chat turns). */
 agents?():import('../../../../contracts/harness-services.ts').HarnessAgents|null;
 /** The models the same Agent can answer with, when it declares the `models` service; an Applet's thread can use a
  * cheaper one (`harnessModel` on its chat turns). */
 models?():import('../../../../contracts/harness-services.ts').HarnessModels|null;
 status(home:string):Promise<Row>;
 /** Finishes installing the Agent's runtime while it is not `available` (the built-in Agent after an update).
  * Absent: the Agent has nothing to install. */
 prepare?():Promise<void>;
 /** Agent home for a Fox scope; private homes are journaled into the execution journal. */
 home(scope:AgentScope):string;
 isolatedHome(scope:'derivation'|'monitor'|'applet-analysis'):string;
 warm(home:string,prime?:Row):void;
 shutdown():Promise<void>;
 /** Shuts the Agent down and starts no Agent process until `work` settles (Reset moves its files). */
 whileStopped<T>(work:()=>Promise<T>):Promise<T>;
 /** Notified when the runtime finished installing or the model changed. */
 onChanged(listener:(reason:'runtime-ready'|'model-changed'|'agent-changed')=>void):void;
 // Companion transfer and profiles (AgentCompanionTransfer / AgentProfiles).
 checkpointCompanion(archive:Row):Row;
 /** `imported`: the World holds a session marker (an import or memory edit), so the Harness's own conversations are not added. */
 captureCompanion(archive:Row,imported:boolean):Row;
 /** Replaces Fox with `archive`: the adapter prepares it and its recovery copy, `install` saves them in the World. */
 installCompanion(archive:Row,current:Row,imported:boolean,install:(archive:Row,recovery:Row|null)=>string|null):string|null;
 allowsBackupPath(relative:string):boolean;
 validateBackupEntry(relative:string,data:Buffer):void;
 diagnosticFiles(home:string):[string,string][];
 profile(discover?:boolean):Row;
 bindProfile(path:string):Row;
 resetRetainedPaths():Set<string>;
 resetExplanation():string;
 /** Reset Fox: forget the local Agent chosen at setup and return to the built-in one. */
 forgetSetupChoice?():Promise<void>;
 /** Writes user-managed memory sections into the private home, then runs `commit`; restores
  * the files when either fails (Mac `HermesMemoryTransfer.replace`). Absent: memory is not editable. */
 replaceCompanionMemories?(memories:Row[],commit:()=>void):void;
}
export const AGENT='agent';

// World tools, Attention and scheduling (modules/attention) ---------------------------------
export interface WorldToolsService {
 readonly names:string[];
 /** Validation errors come back as `{error,guidance}` tool results; cancellation throws. */
 reply(name:string,args:Row,turn:string,monitorProvider?:string):Promise<Row>;
 /** Start/stop the background loop (source checks, Applet analysis, Attention synthesis). */
 start():void;
 stop():void;
 requestAttentionSynthesis():void;
 requestAppletAnalysis():void;
 checkWorldIfDue(only?:string):Promise<void>;
 /** Makes every enabled source check due now and wakes the check lanes (World menu "Read connected apps"). */
 readConnectedApps():void;
 startOnboardingMailCheck():void;
 observeWeather(value:Row):void;
 /** Brought conversations recently active, as Attention context (core/tasks/attention.ts). */
 observeConversations(records:Row[]):void;
 /** What the person's own Agent picked out for the Center at setup (core/tasks attentionFromAgent); the keys saved. */
 seedFromAgent(entries:{key:string;item:Row}[]):string[];
 runtimeTaskReport():Row;
 /** Cancels a provider's background reader and analysis lane (a check was paused/removed). */
 cancelProvider(provider:string):void;
 /** Ends a Fox turn's read tickets, evidence and acknowledgements (Mac finishWorldToolTurn's store part). */
 finishTurn(turn:string,cancelled?:boolean):void;
}
export const WORLD_TOOLS='worldTools';

// Sources and connections (modules/sources) -------------------------------------------------
export interface SourcesService {
 /** Persisted owner-collected Notion context. No live provider fallback. Caller keeps ordinary World Grants. */
 readNotionContext?(request:Row):Row;
 /** `context/search` and `context/read` (core/context/service-context.ts) over the World's saved Service context,
  * limited to the Services `canRead` allows. */
 serviceContext?(request:Row,canRead:(provider:string)=>boolean):Row;
 /** `world-item:` original reads (Gmail thread, Notion page, local source). */
 itemOriginal(id:string):Promise<Row>;
 /** Applet live-activity events from a Harness turn. */
 receiveAppletEvent(event:Row,turn:string):void;
 describeApplet(body:Row,turn:string):Row;
 finishAppletTurn(turn:string,cancelled?:boolean):void;
 /** Reviewed email drafts (mail/reviews.json), cleared by Gmail data deletion. */
 clearMailReviews():void;
 cancel():void;
 /** World tool host services served during chat (prepare_home_change, prepare_notion_change, _email_review). */
 serviceReply(name:string,args:Row,turn:string,home:string,options?:{quiet?:boolean}):Promise<Row|null>;
 /** macOS EventKit/JXA rows (Mac `AppleSources.read(provider,authorize:false)`); absent where unsupported. */
 readNative?(provider:string,options?:{includeCancelled?:boolean}):Promise<Record<string,string>[]>;
 /** Mac `presentMailRead`: live Gmail originals and the Mail page's read list. */
 presentMailRead?(records:Row[],accumulate?:boolean):Row[];
 /** The World UI's `importFiles` and `organizeSources` actions, shared with the Mac World menu. */
 importFiles(body:Row):Promise<Row>;
 organizeSources(body:Row):Row;
}
export const SOURCES='sources';
/** Local coding-tool inventories (codex, claude, github, docker): the owner of the `developmentSessions`
 * action provides this so curated Applet reads (`curatedSourceContent` `localTool`) share it. */
export interface DevelopmentSessionsService {list(provider:string,operation:string,id:string,offset?:number):Promise<Row>}
export const DEVELOPMENT_SESSIONS='developmentSessions';

// Companion profile (owner of the companion_profile records, CompanionArchiveStore) -----------------
export interface CompanionService {
 /** The private companion archive, checkpointed with the Agent's memory (Mac `companionArchive()`). */
 archive():Row;
 /** Private archive plus rotated history segments (Mac `CompanionTransfer.capture`). */
 capture():Row;
 /** `read_companion_archive`: shared Core recall over the captured archive (Mac `CompanionRecall.read`). */
 recall(args:Row):Row;
}
export const COMPANION='companion';

// Fox foreground conversation (modules/fox) --------------------------------------------------
export interface FoxService {
 /** Mac `foxScope()`: chat, status, warm-up and privacy gates address the same Agent home. */
 scope():{sample:boolean,setup:boolean};
 /** A foreground Fox turn is running (backup and transfer wait for it). */
 turnActive():boolean;
 /** Fox's part of Mac `cancelCloud`: ends the foreground turn. */
 cancel():void;
 stopRoutines():void;
 startRoutines():void;
 /** Hands work to an Applet as a background task, as `start_applet_task` does (the Game Factory). */
 startAppletTask(request:{applet:string,task:string,request:string,parent?:string}):Row;
 /** The same, started by Worldlet itself when the person stops playing games in the browser (#1598):
  * no person's words are behind it, so it starts untrusted (reads and answers, no guarded writes). */
 reviewGames(request:{applet:string,task:string,request:string}):Row;
 /** The task that writes an Artifact page (context/artifacts/artifact-render.ts), started by Worldlet after a card is
  * shown: untrusted like a review, and quiet, so its result never joins the conversation. */
 makeArtifactPage(request:{task:string,request:string}):Row;
 /** The Applet ID of a running Applet task, or null once it has ended. */
 appletTask(id:string):string|null;
 /** What answers for Fox now (`modelSource`): an Agent with its own sign-in, the ChatGPT plan, or none. */
 modelSource():Promise<{source:'chatgpt'|'own'|'none'}>;
 /** Fox says one line in a chat thread unasked (how a call it placed went, modules/tasks/harness-calls.ts): it joins
  * that thread's history in the person's own world, shows in the Fox bar when the person is there, and reaches the
  * paired phone. False when there is no own world to say it in (setup, the practice world). */
 report?(line:string,thread:string):boolean;
 /** A line said in a browser or on the phone while the World page is not there: it runs in Fox's main conversation
  * on the host alone, after the running turn, and resolves with Fox's reply. `place`: said on an item's card or in an
  * Applet instead, the thread the page would say it in (ui/attention contextThread) and that place's name. */
 converse?(text:string,place?:{thread:string,location:string}):Promise<{user:string,text:string}>;
 /** Answers the Agent's permission prompt (as the `harnessApproval` action does), for a phone or browser without the page. */
 answerApproval?(id:string,choice:string):Promise<void>;
 /** What the Task panel draws from (core/tasks TaskPanelInput: the Agent's scheduled jobs, the Applet tasks working now),
  * for the host's own Center while the World page is not there (modules/phone). */
 taskPanel?():Promise<Row>;
}
export const FOX='fox';

// Phone pairing (modules/phone) and widgets (modules/artifacts) ------------------------------------
export interface PhoneService {
 /** Sends a desktop slot to the paired phone when it changed (kept for a phone that pairs later). */
 publish(slot:'widgets',value:unknown):Promise<boolean>;
 /** Seconds since the paired phone was last open or sent something; null when it never was. */
 idleSeconds():number|null;
 /** Notifies the paired phone (core/phone PhonePush), only while it is paired and not open and never in setup or the
  * sample world; resolves whether the relay sent it. Routines and background task reports call it directly. */
 notify(push:PhonePushRequest):Promise<boolean>;
 /** The turn Fox is streaming (core/phone phoneLive) for an open phone or browser, from a turn the host runs without the
  * World page (FoxService.converse); the done update also pushes the reply to a phone that is put away. */
 live?(value:Row):Promise<boolean>;
 /** The browser link to this World for another device (core/phone/README.md#web, `kind: 'web'`): the one there is, or a
  * new one when there is none. The Agent's `world/link` hands it to the person; it needs no World page. */
 worldLink?():Promise<Row>;
 /** The full World's link for another device (`kind: 'world'`, core/phone/world-room.ts): the one there is, or a new one. */
 worldRoomLink?():Promise<Row>;
 /** A new full World link in place of the old one, whose pages close (a browser signed out of the World's address). */
 worldRoomRenew?():Promise<Row>;
 /** This computer's own server on 127.0.0.1 (modules/phone/local-relay.ts), started on first use on the port it used
  * last: a browser link on this computer, and the World page a host without a window serves there (platform/node). */
 localServer?():Promise<import('../modules/phone/local-relay.ts').LocalServer>;
}
export const PHONE='phone';
/** Opens the page that runs browsers' direct lines (modules/phone/rtc-host.ts): a hidden window in the Electron host
 * (rtc-window.ts), provided before the modules install. A host without it runs a browser link through the room only. */
export type RtcPageFactory=()=>import('../modules/phone/rtc-host.ts').RtcPage;
export const RTC_PAGE='rtcPage';
/** The person's activity fact for background admission (Core `userIdle`, #1650): seconds since their last input on
 * this computer or on an open paired phone. Owned by modules/shell. */
export interface UserActivityService {
 idleSeconds():number;
}
export const USER_ACTIVITY='userActivity';
export interface WidgetsService {
 /** Merges what the person changed in a widget on the phone (context/artifacts mergeWidgetState). */
 applyPhoneState(widget:string,state:unknown):void;
}
export const WIDGETS='widgets';
export interface OngoingService {
 /** Reads the brought conversations again and proposes what looks like one job (core/tasks ongoingRefresh). */
 refresh():void;
 /** New channel messages that may need the person (core/tasks channelMessageEvent), as Attention context. */
 channelEvents?(events:import('../../../../contracts/harness-services.ts').HarnessExternalEvent[]):void;
}
export const ONGOING='ongoing';

// Browser (modules/browser) -----------------------------------------------------------------
export interface BrowserService {
 /** The website page the panel shows, on either engine, for the release-gate checks. */
 visiblePage():import('../modules/browser/web-page.ts').WebPage|null;
 /** A link from the World page or a website: opens in the in-app browser or the system browser. */
 openExternalRequest(url:string):void;
 stop():void;
 endPictureInPicture():void;
 /** True once private context from a personal browser page was read into the sample world. */
 privateContextWasRead():boolean;
 /** A Meetings call is on: its transcript runs or a meeting page holds the microphone . */
 inCall():boolean;
 resetHistory():void;
 /** What a website page's recorder saved: kept in the World and followed for game reviews (the release-gate
  * game review check records Showdown battles through it). */
 recorded(visits:import('../modules/browser/recorder.ts').RecordedVisit[],records:(import('../../../../core/browser/index.ts').WebRecord&{visit:string})[]):void;
 /** Starts a proactive game review if one is due (context/games battleReviewDue); the games handed to Fox, if any. */
 reviewGamesNow():import('../../../../context/games/index.ts').FinishedBattle[]|null;
 /** The game on the page on screen, when it is one Worldlet can follow (a Showdown battle): what is being played now and
  * how the person's games there went today, for Fox's tips while they play. Null on any other page. */
 gameNow():({site:string}&ReturnType<typeof import('../../../../context/games/index.ts').battleNow>)|null;
}
export const BROWSER='browser';

// The media surface (modules/media) ------------------------------------------------------------
/** The host-owned playback and capture surface the World's sound, Fox's voice and Voice Memos share. */
export interface MediaService {readonly surface:import('../modules/media/surface.ts').MediaSurface}
export const MEDIA='media';

// World sound (modules/world-audio) and Fox's voice (modules/voice) -----------------------------
export interface AudioService {setDucked(active:boolean,reason:'live'|'recording'|'spoken-reply'):void;snapshot():Row;stop():void}
export const AUDIO='audio';
export interface SpeechService {
 cancelCapture():void;stopSpeaking():void;warm():void;
 /** Ends local speech setup and waits until its helpers have left the library. */
 stopLocal():Promise<void>;
 /** Spoken Fox reply (`speakReply`): with `agent`, the Agent's own voice (its `voice` service) when `voiceId` is '',
  * else, or when it cannot, a system voice; `voiceId` '' picks one for the text's language. */
 speak(text:string,enabled:boolean,voiceId:string,agent?:HarnessVoice|null):Promise<boolean>;
 /** Installed system voices for Fox preferences. */
 voices():Promise<{id:string,name:string,language:string}[]>;
 /** Whether local Whisper runs on this computer (Mac and Windows). */
 readonly localSupported:boolean;
 /** Local Whisper on up to 45 s of 16 kHz mono PCM16 (meeting transcripts); sets it up first when needed. */
 transcribe(pcm:Buffer,language:string,signal:AbortSignal):Promise<string>;
}
export const SPEECH='speech';

// App shell (modules/shell) -------------------------------------------------------------------
export interface DesktopCompanionService {
 readonly isDesktop:boolean;
 /** Window close/minimize keeps Fox on the desktop instead of quitting; so does the World losing the foreground. */
 shouldKeepOpen():boolean;
 restoreWorld():Promise<void>;
 syncPresentation():void;
 beforeDetach(listener:()=>void):void;
 /** After the Companion's window shows on the desktop (`true`) or the World view is back in the World
  * window (`false`). */
 onPresentation(listener:(desktop:boolean)=>void):void;
 /** While any check is true, another app coming to the foreground leaves Fox in the World. */
 keepInWorld(check:()=>boolean):void;
 /** The Companion's floating window on screen while on the desktop. */
 panelBounds():{x:number;y:number;width:number;height:number}|null;
 /** Fox's hide button: the Companion's window goes away until the World is opened again. */
 hide():void;
 readonly isHidden:boolean;
 /** Run in background: no Worldlet window stays on screen while the app keeps running; false until onboarding is over. */
 background():boolean;
 /** While Fox is on the desktop because another app is in front: the World as the window behind Fox shows it. */
 backdropImage?():NativeImage|null;
}
export const DESKTOP_COMPANION='desktopCompanion';
/** Run in background (core/phone/README.md#web): a preference set from the browser link's section (modules/phone) and
 * cleared when that link ends. Closing the World then leaves no window, not even Fox, and a login launch opens none. */
export const RUN_IN_BACKGROUND='worldlet.runInBackground';
export interface AppUpdatesService {snapshot():Row;activate():Promise<Row>}
export const APP_UPDATES='appUpdates';
export interface AnalyticsService {
 recordProductEvent(name:string,duration:string,dimensions:Row):void;
 recordOnboardingCompleted():void;
 preferenceChanged(setting:string,value:unknown):void;
 /** Stable pseudonymous ID passed to the included model service for usage reporting. */
 modelAnalyticsID():string;
 /** This installation's id, the `installation_id` every event carries; an Order names it so its errors can be found. */
 installation():string;
 setEnabled(enabled:boolean):void;
 enabled():boolean;
 /** The World page's PostHog web client settings, or null when it must not load (modules/shell/analytics.ts). */
 webConfig():Row|null;
 /** The World page's worldlet://app/ingest/… requests, forwarded to PostHog. */
 ingest(request:Request):Promise<Response>;
}
export const ANALYTICS='analytics';

// Credentials (src/vault.ts, always present) -----------------------------------------------------
/** Per-Agent identity, Grants and audit (core/agent/GRANTS.md), kept by the Agent runtime: identities and Grants with
 * Fox's setup choices (`agent_settings`), token hashes in the vault, audit entries in the World's ledger. */
export interface AgentAccess {
 /** The Agent's identity, made on first use; its default Grants are written again each run. A revoked one stays revoked. */
 ensure(agent:{id:string;name:string;harness:string;kind:'local'|'remote'}):AgentIdentity;
 /** A new token for this run; only its hash is kept (in the vault). Null for a revoked Agent. */
 issueToken(agentId:string):string|null;
 /** The Agent a token belongs to; null for an unknown token or a revoked Agent. */
 identify(token:string):AgentIdentity|null;
 identity(agentId:string):AgentIdentity|null;
 grants(agentId:string):Grant[];
 /** Records one decision (and the Agent's last use). */
 audit(entry:AgentAuditEntry):void;
 /** Every Agent, newest use first, with its Grants and newest audit entries. */
 list(auditLimit?:number):{identity:AgentIdentity;grants:Grant[];audit:AgentAuditEntry[]}[];
 /** Stamps revokedAt, removes its token and tells listeners (its endpoint files go). */
 revoke(agentId:string):void;
 /** "Can read <Service>" (Settings › Agents): a standing read Grant naming only that Service's read targets
  * (core serviceReadGrant), or that Grant revoked. Each change is audited. False for an unknown or revoked Agent or a
  * name that is not a Service; the Agent's next call sees the change. */
 grantService(agentId:string,provider:string):boolean;
 ungrantService(agentId:string,provider:string):boolean;
 /** "Can ask you" (`ask`: asks/post and asks/read) and "Can take work" (`work`: asks/claim and asks/resolve), the
  * same way: a standing Grant naming only those targets (core askGrant), each change audited. */
 grantAsks(agentId:string,kind:string):boolean;
 ungrantAsks(agentId:string,kind:string):boolean;
 /** "Can see your board" (`read`: board/read) and "Can set up your board" (`define`: board/define), the same way
  * (core boardGrant), each change audited. */
 grantBoard(agentId:string,kind:string):boolean;
 ungrantBoard(agentId:string,kind:string):boolean;
 /** "Can draft GitHub changes" (github-drafts/create and read), the same way (core githubDraftGrant), each change audited. */
 grantGithubDrafts(agentId:string):boolean;
 ungrantGithubDrafts(agentId:string):boolean;
 /** "Can report its work" (`report`: agents/report) and "Can see other Agents" (`list`: agents/list), the same way
  * (core reportGrant), each change audited. */
 grantReports(agentId:string,kind:string):boolean;
 ungrantReports(agentId:string,kind:string):boolean;
 /** "Can update Issues in <repo> without asking" (github-writes/run on one repository, core githubWriteGrant): built
  * from the repository, the choice (`comment`, `labels`, `comment-labels`) and its label prefix only, one per
  * repository (choosing again replaces it), at most GITHUB_WRITE_LIMITS.grantsPerAgent; removed by repository. Each
  * change audited. False for an unknown or revoked Agent or a choice Core refuses. */
 grantGithubWrites(agentId:string,repo:unknown,choice:unknown,labelPrefix?:unknown):boolean;
 ungrantGithubWrites(agentId:string,repo:unknown):boolean;
 /** "Can save to your Journal" (`save`: agent-artifacts/save and read) and "Can read Agents' Journal artifacts" (`read`:
  * agent-artifacts/read), the same way (core artifactGrant), each change audited. */
 grantArtifacts(agentId:string,kind:string):boolean;
 ungrantArtifacts(agentId:string,kind:string):boolean;
 /** "Can draft PostHog changes" and "Can draft Notion changes" (`<provider>-drafts/create` and read), the same way (core
  * serviceDraftGrant), each change audited. */
 grantServiceDrafts(agentId:string,provider:string):boolean;
 ungrantServiceDrafts(agentId:string,provider:string):boolean;
 onRevoke(listener:(agentId:string)=>void):void;
}
export interface VaultService {
 get(id:string):string|null;
 set(id:string,secret:string):void;
 delete(id:string):void;
 deleteAll():void;
}
export const VAULT='vault';

// The World in a web browser on this computer (host/world-web.ts) ----------------------------------------------------
export interface WorldWebService {
 /** The full World's link on this computer (`http://127.0.0.1:<port>/world/#t=<token>`), serving the World first when it
  * is not yet. The token is the secret: the link goes only to the person (a file of theirs, their browser, `world/link`). */
 link():Promise<string>;
}
export const WORLD_WEB='worldWeb';
/** The World page on another device, met through the pairing room (modules/phone/world-room-link.ts): the host takes
 * each page that joined as it takes a browser's World page here (host/web-page.ts), with only what ROOM_ALLOWED lets
 * through (contracts/web-world.ts). */
export interface WorldRoomPageService {
 accept(socket:import('../modules/phone/web-socket.ts').TextSocket):void;
}
export const WORLD_ROOM_PAGE='worldRoomPage';
