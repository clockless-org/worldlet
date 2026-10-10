import type {HostCall} from '../../contracts/platform.ts';
import {diagnosticError,timingBucket} from '../../core/diagnostics/index.ts';
/** Explicit product events only. Request bodies, replies and error text never enter telemetry;
 * a failure carries only Core's classified `error_code` (timeout, authentication, …) so it can be debugged. */
function reporter(host,enabled){
 return (event:string,duration='',dimensions={})=>{if(enabled())void Promise.resolve().then(()=>enabled()?host('usageEvent',{event,duration,...dimensions}):undefined).catch(()=>{});};
}
/** The person's own gesture just happened in this page. Chromium grants transient activation (about five seconds) only
 * for trusted input — a real click, key press or tap — never for script-dispatched events, so Fox's DOM steps and
 * automation do not set it. */
export const personGesture=()=>{try{return (globalThis as any).navigator?.userActivation?.isActive===true;}catch{return false;}};
let foxActing=0;
/** Fox's tool step: whatever it opens, reads or changes synchronously is Fox's doing, not the person's. */
export function asFoxAction<T>(run:()=>T):T{foxActing++;try{return run();}finally{foxActing--;}}
/** `trigger` of a product event: `user` only right after the person's own gesture and outside Fox's tool steps;
 * otherwise `background` (Fox's tools, restores, retries, snapshot refreshes, scheduled work). */
export const eventTrigger=():'user'|'background'=>!foxActing&&personGesture()?'user':'background';
/** The person sent Fox a message or opened an Applet themselves: `user_engaged`, at most once a day (the host keeps
 * the daily marker). Without a fresh gesture nothing is reported. */
export function reportEngagement(kind:'fox_message'|'applet_open'){
 if(!personGesture()||foxActing)return;
 try{window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event:'user_engaged',engagement_kind:kind}}));}catch{/* Analytics never interrupts the app. */}
}
/** `applet_opened`, timed from the open to the second frame after it (the panel's first painted frame). A hidden
 * window paints no frames: after five seconds hidden it reports without a time. */
export function reportAppletOpened(applet:string,trigger:'user'|'background'){
 const start=performance.now();let sent=false;
 const send=(timed:boolean)=>{
  if(sent)return;sent=true;
  try{window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event:'applet_opened',applet,trigger,duration:timed?timingBucket(performance.now()-start):''}}));}catch{/* Analytics never interrupts the app. */}
 };
 // Only a hidden window falls back: a busy page delays both, and its frame time is the signal.
 setTimeout(()=>{if(document.hidden)send(false);},5000);
 try{requestAnimationFrame(()=>requestAnimationFrame(()=>send(true)));}catch{send(false);}
}
const errorCode=(message:unknown)=>{try{return String(diagnosticError({message:typeof message==='string'?message:''}).code);}catch{return 'operationFailed';}};
async function measured(run,base,track){
 const start=performance.now();track(base+'_started');
 const timing=()=>timingBucket(performance.now()-start);
 try{
  const value=await run();
  if(value?.cancelled)track(base+'_cancelled',timing());
  else if(value?.error||value?.ok===false||(['google_connect','source_connect'].includes(base)&&value?.connected===false))track(base+'_failed',timing(),{error_code:errorCode(value?.error)});
  else track(base+'_completed',timing());
  return value;
 }catch(error){
  if(error?.name==='AbortError'||/cancelled|canceled/i.test(String(error?.message)))track(base+'_cancelled',timing());
  else track(base+'_failed',timing(),{error_code:errorCode(error?.message)});
  throw error;
 }
}
/** Count a user-visible turn, including preflight failures and direct coding-session routes.
 * Agent calls and background jobs are not turns; greetings are not user requests. */
export function withFoxTurnAnalytics(run,host,enabled=()=>true){
 const track=reporter(host,enabled);
 return body=>body?.invitation||!enabled()?run(body):measured(()=>run(body),'fox_turn',track);
}
/** World tools executed through the shared UI gateway; never include arguments or output. */
export function withToolAnalytics(run,host,enabled=()=>true){
 const report=reporter(host,enabled);
 return (name,args,meta)=>{
  const tool_category=['read_content','find_content','inspect_world','read_companion_archive'].includes(name)?'reading':
   ['browse_web','automate_browser','scroll_browser'].includes(name)?'browser':
   ['open_applet','open_content','visit_place','move_view','perform_action'].includes(name)?'navigation':'other';
  // Fox calls these tools itself: what they open or change is not the person's own action (eventTrigger).
  const step=()=>asFoxAction(()=>run(name,args,meta));
  return !enabled()?step():measured(step,'world_tool',(event,duration,extra={})=>report(event,duration,{...extra,tool_category}));
 };
}
/** PostHog's standard web capture in the World page (owner 2026-10-10: follow PostHog's best practice): the host
 * answers `analyticsConfig` only in a release app with sharing on, and then the page loads posthog-web.js
 * (ui/shell/posthog-web.ts) with it. Sharing switched off stops it at once; switched on starts it again. */
export function startWebAnalytics(host:HostCall,load=(src:string)=>{const script=document.createElement('script');script.src=src;document.head.appendChild(script);}){
 const scope=window as any;
 const sync=async()=>{
  let config:unknown=null;
  try{config=await host('analyticsConfig',{});}catch{/* Not the app, or the host is busy: nothing loads. */}
  scope.worldletWebAnalyticsConfig=config&&typeof config==='object'?config:null;
  if(scope.worldletWebAnalytics)scope.worldletWebAnalytics.update(scope.worldletWebAnalyticsConfig);
  else if(scope.worldletWebAnalyticsConfig&&!scope.worldletWebAnalyticsLoading){scope.worldletWebAnalyticsLoading=true;load('posthog-web.js');}
 };
 void sync();
 // Sharing changed, or the person signed in or out since: the identity the host reports may have moved.
 for(const name of ['worldlet:analytics-changed','worldlet:app-active'])window.addEventListener(name,()=>void sync());
}
export function withProductAnalytics(host:HostCall,enabled=()=>true){
 const track=reporter(host,enabled);
 const call:HostCall=async(action:string,body:any={})=>{
  const base=action==='connect'&&['google','gmail','google-calendar'].includes(body.provider)?'google_connect':action==='connect'?'source_connect':action==='disconnectSource'?'source_disconnect':['appContent','original','notionContent'].includes(action)?'content_read':action==='worldItemStatus'?'item_update':null;
  // Decided once when the operation starts, so its outcome events carry the same trigger.
  const trigger=base?eventTrigger():'background';
  const operation=['appContent','original','notionContent','worldItemStatus','connect','disconnectSource'].includes(action)?action:'other';
  const result=await (base?measured(()=>host(action,body),base,(event,duration,extra={})=>track(event,duration,{...extra,operation,trigger,...(['connect','disconnectSource'].includes(action)?{applet:body.provider}:{}),...(action==='worldItemStatus'?{item_status:body.status}:{})})):host(action,body));
  const outcome_type=action==='emailAction'&&result?.status==='sent'?'email_delivery':action==='notionReview'&&result?.status==='verified'?'notion_content':action==='browserOutcomeAction'&&result?.status==='user_confirmed'?'browser_user_confirmation':null;
  if(outcome_type&&enabled()&&typeof body.id==='string'&&body.id.length<=160){
   // Only a hash of a local receipt is used for deduplication. No URL, draft or page text.
   try{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(outcome_type+':'+body.id));const outcome_key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');track('external_outcome_confirmed','',{outcome_type,outcome_key});}catch{/* Analytics must not interrupt a completed action. */}
  }
  return result;
 };
 return {call,track};
}
