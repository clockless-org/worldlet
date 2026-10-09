import fs from 'node:fs';
import path from 'node:path';
import {app,BaseWindow,type WebContents} from 'electron';
import {core} from '../../core.ts';
import {isoSeconds,uuid} from '../../files.ts';
import {platformName} from '../../profile.ts';
import {AGENT,type AgentService,type AnalyticsService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {buildInfo,distribution,releaseBuild} from './release.ts';
import {AGENTS_FOUND,COUNT_BUCKETS,ERROR_CODES,LOCAL_AGENT_IDS,UPDATE_WAIT_BUCKETS} from '../../../../../core/diagnostics/index.ts';
import {WORLD_APPS} from '../../../../../core/applets/index.ts';
import {PROACTIVE_MOMENTS} from '../../../../../core/companion/index.ts';

// Explicit product events and account/installation profiles; no private content or autocapture.
// Identity and delivery markers keep the Mac host's UserDefaults names in preferences.json.
const ENABLED='WorldletUsageAnalyticsEnabled',ACCOUNT='WorldletUsageAccount',ANONYMOUS='WorldletUsageAnonymousID',INSTALLATION='WorldletUsageInstallID';
// Download tracking (website/README.md#download-tracking): the opaque token of the download press this installation came
// from, and whether this installation has asked. Never an email.
const INVITE='WorldletInviteToken',INVITE_ASKED='WorldletInviteClaimAsked',LAST_DAY='WorldletUsageLastDay';
export const INSTALL_CLAIM_URL='https://worldlet.ai/api/install/claim';
/** This computer's analytics choice and identity: kept across World backup restores (preferences.json is not World data). */
export const INSTALLATION_KEYS=[ENABLED,ACCOUNT,ANONYMOUS,INSTALLATION,INVITE,INVITE_ASKED];
const EVENTS=new Set(['external_outcome_confirmed','content_opened','world_tool_started','world_tool_completed','world_tool_cancelled','world_tool_failed','source_connect_started','source_connect_completed','source_connect_cancelled','source_connect_failed','source_disconnect_started','source_disconnect_completed','source_disconnect_cancelled','source_disconnect_failed','onboarding_started','onboarding_apps_viewed','local_agent_selected','local_agents_detected','local_agent_select_failed','agent_bring_completed','agent_bring_failed','tour_skipped','first_win','world_entered','google_connection_present','google_connection_absent','applet_opened','google_connect_started','google_connect_completed','google_connect_cancelled','google_connect_failed','fox_turn_started','fox_turn_completed','fox_turn_cancelled','fox_turn_failed','content_read_started','content_read_completed','content_read_cancelled','content_read_failed','item_update_started','item_update_completed','item_update_cancelled','item_update_failed','applet_task_started','applet_task_completed','applet_task_cancelled','applet_task_failed','app_process_gone','app_unclean_exit','fox_timing','app_startup_timing','page_load_timing','update_prepared','update_applied','update_failed','app_build_changed','fox_proactive_asked','fox_proactive_shown','fox_browse_changed','order_sent','order_stopped']);
/** Coarse timing only: turn and tool buckets, the longer ones of Applet tasks (`taskDuration` in modules/fox) and
 * Fox and startup timings (`timingBucket` in core/diagnostics). */
const DURATIONS=['under_1s','1_5s','5_15s','over_15s','15_60s','1_5m','5_15m','over_15m'];
const ALLOWED:Record<string,string[]>={
 applet:['google','gmail','google-drive','google-calendar','apple-notes','apple-reminders','notion','obsidian','browser','youtube','x','github','codex','claude-code','weather','meetings','voice-memos','messages','stripe','paypal','airbnb','doordash','oura','strava','folder',
  // Built-in catalog keys (public app names); custom Applets stay `other`.
  ...WORLD_APPS.map(app=>app.key)],
 operation:['appContent','original','notionContent','worldItemStatus','connect','disconnectSource'],
 outcome_type:['email_delivery','notion_content','browser_user_confirmation'],
 item_status:['open','done','dismissed','snoozed'],
 tool_category:['reading','browser','navigation','other'],
 // Whether the person's own gesture started it (user) or not: Fox's tools, restores, retries, scheduled work (background).
 trigger:['user','background'],
 // user_engaged: what the person did first that day.
 engagement_kind:['input','fox_message','applet_open'],
 // Core's classified failure (core/diagnostics/report.ts); never the error text.
 error_code:ERROR_CODES,
 // Electron render-process-gone / child-process-gone; a clean exit is not reported.
 process_type:['renderer','gpu','utility','other','web_engine','web_page'],
 exit_reason:['abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure','memory-eviction'],
 // fox_timing / app_startup_timing: parts of a turn or a start, bucketed (core/diagnostics/fox-timing.ts foxTimingEvent).
 timing_outcome:['complete','error','cancelled'],
 first_text_bucket:DURATIONS,model_bucket:DURATIONS,tools_bucket:DURATIONS,first_frame_bucket:DURATIONS,
 // app_unclean_exit: whether Crashpad wrote a crash report during that run (the report itself stays on the device).
 native_crash:['yes','no'],
 // Setup with a local Agent (core/diagnostics/setup-events.ts): its public product ID, coarse counts and outcomes.
 local_agent:LOCAL_AGENT_IDS,recommended_agent:[...LOCAL_AGENT_IDS,'none'],agents_found:[...AGENTS_FOUND],
 // Who answers for Fox: the built-in Hermes Agent on a model Fox has, or the chosen Agent on its own sign-in.
 fox_brain:['built_in','agent'],
 bring_conversations:[...COUNT_BUCKETS],bring_notes:[...COUNT_BUCKETS],bring_skills:[...COUNT_BUCKETS],bring_routines:[...COUNT_BUCKETS],
 bring_model:['yes','no'],bring_memory:['yes','no'],integrations_came_over:[...COUNT_BUCKETS],integrations_reconnect:[...COUNT_BUCKETS],
 // page_load_timing: which engine loaded a page in the browser device (no URL, no site).
 page_engine:['cef','electron'],
 // Updates (modules/shell/updates.ts): how long a prepared update waited for Update, and which step failed.
 update_wait:[...UPDATE_WAIT_BUCKETS],update_stage:['check','folder','download','prepare','install'],
 // Fox's speak-first ask (modules/fox proactiveRunTurn): the moment and whether Fox spoke, never the line.
 proactive_moment:[...PROACTIVE_MOMENTS],proactive_status:['spoke','passed'],
 // fox_browse_changed: Browse with me turned on or Don't bother chosen in Fox's card.
 fox_browse:['on','off'],
 // Order (modules/shell/order.ts): where a sent Order went, and why one ended unsent; never what was said.
 order_result:['woke','stored','failed'],
 order_stop:['cancelled','stopped_early','left_app','speech_error','no_speech','page_closed'],
 // tour_skipped: the step of the first run's eight-step tour it was skipped on (ui/onboarding/README.md).
 tour_step:['1','2','3','4','5','6','7','8']
};
export function safeDimensions(input:Row):Record<string,string> {
 const result:Record<string,string>={};
 for(const [key,values] of Object.entries(ALLOWED))if(typeof input[key]==='string')result[key]=values.includes(input[key])?input[key]:'other';
 if(typeof input.outcome_key==='string'&&/^[a-f0-9]{64}$/.test(input.outcome_key))result.outcome_key=input.outcome_key;
 // app_build_changed: the Build the previous launch ran (modules/shell/updates.ts), a public release number.
 if(typeof input.from_build==='string'&&/^[1-9]\d{0,4}$/.test(input.from_build))result.from_build=input.from_build;
 return result;
}
/** Input that is a person at the World: a key, a mouse button or the wheel, never a mouse move or key release.
 * Script-dispatched DOM events never reach the host's input hooks; a page with a debugger attached is being driven
 * by automation (CDP) and does not count, nor does input while no window of the app is focused. */
export const PERSON_INPUT=new Set(['keyDown','rawKeyDown','mouseDown','mouseWheel']);
export function personInput(type:unknown,{focused,automated}:{focused:boolean,automated:boolean}){return typeof type==='string'&&PERSON_INPUT.has(type)&&focused&&!automated;}
const CHANNELS=['website','homebrew','steam','microsoft-store','mac-app-store','itch','setapp','winget'];

/** Module checks replace the release configuration, the network, the focus test and the clock. */
export interface AnalyticsOverrides {config?:{key:string,url:string,version:string,build:string,channel:string},fetch?:typeof fetch,focused?:()=>boolean,now?:()=>number,system?:NodeJS.Platform}
export class UsageAnalytics implements AnalyticsService {
 private host:Host;
 private send:typeof fetch;
 private focused:()=>boolean;
 private now:()=>number;
 private system:NodeJS.Platform;
 private engagedCheckedAt=-Infinity;
 private session=uuid();
 private sending=new Map<string,AbortController>();
 private exceptions=new Set<string>();
 private config:{key:string,url:string,version:string,build:string,channel:string}|null=null;
 private listeners:(()=>void)[]=[];
 constructor(host:Host,overrides:AnalyticsOverrides={}){
  this.host=host;
  this.send=overrides.fetch??(((input,init)=>fetch(input,init)) as typeof fetch);
  this.focused=overrides.focused??(()=>BaseWindow.getFocusedWindow()!==null);
  this.now=overrides.now??Date.now;
  this.system=overrides.system??process.platform;
  // Development builds (the Dev app runs from a checkout, unpackaged) and command-line checks never report, even with
  // release credentials. Every installed app reports, whichever channel it follows (owner 2026-10-06: Dev sends no
  // errors; Alpha, Beta and Production all do); each event names that channel in `update_channel`.
  const settings=distribution(host,'Analytics.json');
  if(releaseBuild(host)&&settings&&typeof settings.projectKey==='string'&&settings.projectKey.startsWith('phc_')&&settings.projectKey.length>4&&['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(settings.host)){
   const info=buildInfo(host);
   this.config={key:settings.projectKey,url:settings.host+'/capture/',version:typeof info.version==='string'?info.version:app.getVersion(),build:info.build==null?'':String(info.build),
    channel:CHANNELS.includes(info.distributionChannel)?info.distributionChannel:'unknown'};
  }
  if(overrides.config)this.config=overrides.config;
 }
 onChange(listener:()=>void){this.listeners.push(listener);}
 private get prefs(){return this.host.preferences;}
 enabled(){return this.prefs.get(ENABLED)!==false;}
 private profile():Record<string,string> {
  const agent=this.host.optional<AgentService>(AGENT);
  const google=agent?.googleAccount?.();
  // The World's own Google connection; until it has read the mailbox once, the profile Fox's Hermes wrote before.
  const value=google?.authorized()?google.profile():null;
  if(google&&!google.authorized())return {};
  if(value){
   if(!value.email.includes('@')||value.email.length>320||!/^google-[a-f0-9]{64}$/.test(value.user_id))return {};
   return {email:value.email,user_id:value.user_id,...value.name?{name:value.name.slice(0,200)}:{}};
  }
  const home=agent?agent.home('private'):path.join(this.host.profile.root,'agent/private/hermes');
  try{
   if(!fs.existsSync(path.join(home,'google_token.json')))return {};
   const raw=JSON.parse(fs.readFileSync(path.join(home,'google_profile.json'),'utf8'));
   const email=raw?.email,user=raw?.user_id;
   if(typeof email!=='string'||!email.includes('@')||email.length>320||typeof user!=='string'||!/^google-[a-f0-9]{64}$/.test(user))return {};
   const result:Record<string,string>={email,user_id:user};
   if(typeof raw.name==='string'&&raw.name)result.name=raw.name.slice(0,200);
   return result;
  }catch{return {};}
 }
 private updateChannel:()=>string=()=>'';
 /** The update channel this app follows (updates.ts), named on every event so Alpha and Beta can be told apart. */
 followChannel(channel:()=>string){this.updateChannel=channel;}
 installation(){return this.installationID();}
 private installationID(){const id=this.prefs.string(INSTALLATION)||uuid();if(this.prefs.string(INSTALLATION)!==id)this.prefs.set(INSTALLATION,id);return id;}
 private identity(profile:Record<string,string>){
  const account=profile.user_id??'',previous=this.prefs.string(ACCOUNT);
  // Never reuse an anonymous ID already linked to a different account.
  if(account!==previous){if(previous)this.prefs.set(ANONYMOUS,uuid());this.prefs.set(ACCOUNT,account);}
  const anonymous=this.prefs.string(ANONYMOUS)||this.installationID();
  if(this.prefs.string(ANONYMOUS)!==anonymous)this.prefs.set(ANONYMOUS,anonymous);
  return account||anonymous;
 }
 modelAnalyticsID(){return this.config&&this.enabled()?this.identity(this.profile()):'';}
 private claiming:Promise<void>|null=null;
 /** A fresh installation (it never reported a day) asks worldlet.ai once whether a browser on this network
  * pressed a download for this system in the last three days; the answer is that person's opaque token, sent with
  * every event from then on so admin can tell which download (and its source) became this app. Release builds with sharing on only. */
 claimInvite():Promise<void> {
  if(!this.config||!this.enabled()||this.prefs.get(INVITE_ASKED)===true||this.prefs.string(LAST_DAY))return Promise.resolve();
  const platform=this.system==='darwin'?'mac':this.system==='win32'?'windows':'';
  if(!platform)return Promise.resolve();
  return this.claiming??=this.send(INSTALL_CLAIM_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform}),signal:AbortSignal.timeout(8_000)})
   .then(async response=>{
    if(!response.ok)return;
    const token=(await response.json() as Row)?.token;
    if(typeof token==='string'&&/^[a-f0-9]{32}$/.test(token))this.prefs.set(INVITE,token);
    this.prefs.set(INVITE_ASKED,true);
   })
   // Offline: the next activation asks again, while this installation has not reported a day.
   .catch(()=>{})
   .finally(()=>{this.claiming=null;});
 }
 recordActiveDay(){
  if(!this.config||!this.enabled())return;
  // The first day waits for the download answer, so the first app_active already carries it.
  if(!this.prefs.string(LAST_DAY)&&this.prefs.get(INVITE_ASKED)!==true){void this.claimInvite().finally(()=>this.reportActiveDay());return;}
  this.reportActiveDay();
 }
 private reportActiveDay(){
  if(!this.config||!this.enabled())return;
  const profile=this.profile(),id=this.identity(profile),day=id+':'+isoSeconds().slice(0,10);
  if(Object.keys(profile).length)this.record('$identify','WorldletUsageIdentifiedDay.'+id,day);
  this.record('app_active',LAST_DAY,day);
 }
 /** A person really used the app: `user_engaged` once per identity per UTC day, with what they did first. After
  * a check the next one waits 30 s, so a stream of clicks costs no file reads. `app_active` only says the app ran. */
 recordUserEngaged(kind:string){
  if(!this.config||!this.enabled())return;
  const now=this.now();
  if(now-this.engagedCheckedAt<30_000)return;
  this.engagedCheckedAt=now;
  const id=this.identity(this.profile()),day=id+':'+isoSeconds(new Date(now)).slice(0,10);
  this.record('user_engaged','WorldletUsageEngagedDay',day,true,'',{engagement_kind:safeDimensions({engagement_kind:kind}).engagement_kind??'input'});
 }
 /** The World page's own input counts as real use (main process, before the page sees it). A mouse press may arrive
  * just before the click focuses the window, so an unfocused press is looked at again shortly after. */
 watchInput(contents:WebContents){
  const seen=(type:unknown)=>{
   if(typeof type!=='string'||!PERSON_INPUT.has(type)||contents.isDestroyed())return;
   const automated=contents.debugger.isAttached();
   if(personInput(type,{focused:this.focused(),automated}))this.recordUserEngaged('input');
   else if(!automated&&type==='mouseDown')setTimeout(()=>{if(!contents.isDestroyed()&&personInput(type,{focused:this.focused(),automated:contents.debugger.isAttached()}))this.recordUserEngaged('input');},150);
  };
  contents.on('before-input-event',(_event,input)=>seen(input.type));
  contents.on('before-mouse-event',(_event,mouse)=>seen(mouse.type));
 }
 recordOnboardingCompleted(){this.record('onboarding_completed','WorldletUsageOnboardingReported','1');}
 recordProductEvent(event:string,duration:string,dimensions:Row){
  // The World page reports the person's own Fox message or Applet opening; only when this app is focused.
  if(event==='user_engaged'){if(this.focused())this.recordUserEngaged(typeof dimensions?.engagement_kind==='string'?dimensions.engagement_kind:'');return;}
  if(!EVENTS.has(event))return;
  if(['google_connect_completed','google_connection_present','google_connection_absent'].includes(event))this.recordActiveDay();
  const timing=DURATIONS.includes(duration)?duration:'';
  const safe=safeDimensions(dimensions??{});
  if(event==='external_outcome_confirmed'){
   if(!safe.outcome_key||!safe.outcome_type)return;
   this.record(event,'WorldletOutcome:'+safe.outcome_key,'1',true,'',safe);return;
  }
  this.record(event,uuid(),'1',false,timing,safe);
 }
 /** PostHog error tracking: type, Core's failure code and sanitized frames of our own code, never the message.
  * Each distinct exception is sent once per run, at most 30 per run. */
 recordException(error:unknown,area:'main'|'renderer'|'host',operation=''){
  if(!this.config||!this.enabled()||this.exceptions.size>=30)return;
  const raw=error instanceof Error||(error&&typeof error==='object')?error as Row:{message:String(error)};
  let report:Row;
  try{report=core<Row>('exceptionReport',{name:raw.name,message:typeof raw.message==='string'?raw.message:'',stack:raw.stack,area,operation});}catch{return;}
  const frames=Array.isArray(report.frames)?report.frames:[];
  const key=[report.area,report.type,report.code,report.operation,...frames.slice(-5).map((f:Row)=>f.filename+':'+f.function+':'+f.lineno)].join('|');
  if(this.exceptions.has(key))return;
  this.exceptions.add(key);
  this.record('$exception',uuid(),'1',false,'',{
   $exception_list:[{type:report.type,value:`${report.type} (${report.code})`,mechanism:{handled:report.handled===true,synthetic:false,type:'generic'},stacktrace:{type:'raw',frames}}],
   $exception_level:report.level,error_code:report.code,error_area:report.area,...(report.operation?{operation:report.operation}:{}),...(typeof report.rule==='string'?{error_rule:report.rule}:{})
  });
 }
 /** A native crash of an earlier run (native-crashes.ts), as an unhandled `$exception` grouped by its module + offset
  * frames: the crashed process, exception and build, never memory, registers, paths or other threads. */
 recordNativeCrash(crash:Row){
  if(!this.config||!this.enabled())return;
  let report:Row;
  try{report=core<Row>('nativeCrashReport',crash);}catch{return;}
  const frames=Array.isArray(report.frames)?report.frames:[];
  this.record('$exception',uuid(),'1',false,'',{
   $exception_list:[{type:report.type,value:`${report.type} in ${report.module||'unknown'} (${report.program})`,mechanism:{handled:false,synthetic:false,type:'native'},stacktrace:{type:'raw',frames}}],
   $exception_level:'fatal',error_code:'nativeCrash',error_area:'native',crash_process:report.program,
   ...(report.signal?{crash_signal:report.signal}:{}),...(report.build?{crash_build:report.build}:{}),...(report.arch?{crash_arch:report.arch}:{}),...(report.moduleId?{crash_module_id:report.moduleId}:{}),
   electron_version:process.versions.electron??''
  });
 }
 preferenceChanged(setting:string,value:unknown){if(setting==='usage_analytics'&&typeof value==='boolean')this.setEnabled(value);}
 setEnabled(enabled:boolean){
  this.prefs.set(ENABLED,enabled);
  if(enabled)this.recordActiveDay();
  else{for(const controller of this.sending.values())controller.abort();this.sending.clear();}
  for(const listener of this.listeners)try{listener();}catch{}
 }
 private record(event:string,marker:string,value:string,persist=true,duration='',dimensions:Row={}){
  const config=this.config;
  if(!config||!this.enabled()||this.sending.has(marker)||this.prefs.string(marker)===value)return;
  const account=this.profile(),id=this.identity(account),identified=Object.keys(account).length>0;
  const platform=platformName();
  const person:Row={...account,identity_kind:identified?'google':'installation',platform,app_version:config.version};
  if(event==='google_connection_present'||event==='google_connect_completed')person.google_connected=true;
  if(event==='google_connection_absent')person.google_connected=false;
  if(event==='onboarding_completed')person.onboarding_completed=true;
  const invite=this.prefs.string(INVITE);
  const pendingKey=marker+'.'+id+'.pending';
  const saved=persist?this.prefs.get<Row|undefined>(pendingKey):undefined;
  // A retry resends the same event: same UUID, time and dimensions (user_engaged keeps its first kind).
  const envelope=saved?.value===value&&saved?.uuid&&saved?.timestamp?saved:{value,uuid:uuid(),timestamp:isoSeconds(new Date(this.now())),...(Object.keys(dimensions).length?{dimensions}:{})};
  if(persist)this.prefs.set(pendingKey,envelope);
  if(envelope.dimensions&&typeof envelope.dimensions==='object')dimensions=envelope.dimensions;
  const properties:Row={
   surface:'app',environment:'production',install_channel:config.channel,...(this.updateChannel()?{update_channel:this.updateChannel()}:{}),distinct_id:id,$session_id:this.session,analytics_schema:4,installation_id:this.installationID(),
   app_build:config.build,platform,app_version:config.version,duration_bucket:duration,os_version:process.getSystemVersion(),
   language:(app.getPreferredSystemLanguages()[0]??'und').split('-')[0]||'und',$set:person,$set_once:{first_profile_seen_at:isoSeconds(),...(invite?{invite_token:invite}:{})},$process_person_profile:identified,$geoip_disable:true,
   ...(invite?{invite_token:invite}:{}),...dimensions
  };
  if(event==='$identify'&&identified&&this.prefs.string(ANONYMOUS))properties.$anon_distinct_id=this.prefs.string(ANONYMOUS);
  const controller=new AbortController();
  this.sending.set(marker,controller);
  void this.send(config.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:config.key,event,timestamp:envelope.timestamp,uuid:envelope.uuid,properties}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)])})
   .then(response=>{if(persist&&response.ok&&!controller.signal.aborted&&this.enabled()){this.prefs.set(marker,value);this.prefs.remove(pendingKey);}})
   // Analytics never interrupts the app; a later activation retries.
   .catch(()=>{})
   .finally(()=>{if(this.sending.get(marker)===controller)this.sending.delete(marker);});
 }
}
