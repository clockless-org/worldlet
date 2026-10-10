import {mountHomeReview} from './companion/index.ts';
import {snapshotInbox} from './shell/index.ts';
import {mountMemoryManager} from './companion/index.ts';
import {connectionLive} from '../core/applets/index.ts';
import {startWebAnalytics,withProductAnalytics} from './shell/index.ts';
import {settleItemPage} from '../core/items/index.ts';
import {installDesktopCompanion} from './companion/index.ts';
import {mountDesktopCompanionHint,mountFirstValue,mountLoginItemOffer,mountWorldTour} from './onboarding/index.ts';
import {landSetupDevices} from './onboarding/index.ts';
import {mountStartupSetup} from './onboarding/index.ts';
import {celebrateWorld,celebrateWin} from './shell/index.ts';
import {callHost} from '../platform/bridge/host.ts';
import {hostBrowserBudget,hostFeatures} from '../platform/bridge/features.ts';
import {createWorldProjector} from './world/index.ts';
import {mountLocalMusic,mountWorldAudio} from './shell/index.ts';
import {mountChannelReply,mountHarnessApproval,mountHarnessCall,mountWriteNotice} from './companion/index.ts';
import {mountNotionReview} from './companion/index.ts';
import {mountEmailReview} from './companion/index.ts';
import {createFoxPreferences} from './companion/index.ts';
import {applyTextScale} from './components/index.ts';
import {prepareUIFonts} from './components/index.ts';
import {SAMPLE_DATASET_ID} from './world/index.ts';
import {makeSampleWorld} from './world/index.ts';
import {createNativeCompanion} from './companion/index.ts';
import {mountWorldOnboarding} from './onboarding/index.ts';
import {onboardingUnfinished} from '../core/onboarding/index.ts';
import {mountNotionWorld} from './shell/index.ts';
import {setMailAvatarLookup} from './applets/index.ts';
import {setAttentionImageLookup} from './attention/index.ts';
import {EMPTY_OVERLAY,validateOverlay} from '../core/context/index.ts';
const savedLanguage=localStorage.getItem('worldlet-interface-language');
if(savedLanguage&&['en','zh','ja','es'].includes(savedLanguage))document.documentElement.lang=savedLanguage;
const {call,track}=withProductAnalytics(callHost,()=>!sample);
// Uncaught World page errors go to the host, which reports only their type, failure code and sanitized frames.
const reportException=(error:any)=>{if(error&&typeof error==='object')void Promise.resolve(callHost('reportException',{name:String(error.name??''),message:String(error.message??''),stack:String(error.stack??'')})).catch(()=>{});};
window.addEventListener('error',event=>reportException(event.error));
window.addEventListener('unhandledrejection',event=>reportException(event.reason));
// PostHog's standard web capture (autocapture, sessions, masked replay): only in a release app with sharing on.
startWebAnalytics(callHost);
// Only allowlisted dimensions pass (the host allowlists them again): an Applet key, `trigger` user|background,
// setup's `dimensions` (core/diagnostics/setup-events.ts) with a `duration` bucket and, for user_engaged, its kind. user_engaged is reported in the practice world too: a person exploring it is using the app.
window.addEventListener('worldlet:product-event',(e:Event)=>{const detail=(e as CustomEvent).detail;if(typeof detail==='string')track(detail);else if(detail?.event==='user_engaged')void Promise.resolve(callHost('usageEvent',{event:'user_engaged',engagement_kind:detail.engagement_kind})).catch(()=>{});else if(detail)track(detail.event,typeof detail.duration==='string'?detail.duration:'',{...(detail.dimensions&&typeof detail.dimensions==='object'?detail.dimensions:{}),...(detail.applet?{applet:detail.applet}:{}),...(detail.trigger?{trigger:detail.trigger}:{})});});
installDesktopCompanion();
window.worldletAudio=value=>window.dispatchEvent(new CustomEvent('worldlet:audio',{detail:value}));
window.worldletLocalMusic=value=>window.dispatchEvent(new CustomEvent('worldlet:local-music',{detail:value}));
window.worldletYouTubePlayer=value=>window.dispatchEvent(new CustomEvent('worldlet:youtube-player',{detail:value}));
window.worldletBrowser=value=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:value}));
// The menu's Back and Forward (Mac ⌘[ ⌘], Windows Alt+← Alt+→) reach the website page in the panel, if one is, and its
// tab keys the Browser's tabs; it answers whether the page took the key (a Browser tab action), so ⌘W closes the window otherwise.
window.worldletBrowserNavigate=value=>{const event=new CustomEvent('worldlet:browser-navigate',{detail:value,cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};
const browser={call:(action,body)=>call(action,body),command:(operation,args,agent)=>call('browserCommand',{operation,args,agent}),foxOverlay:()=>hostFeatures(current).browserFoxOverlay,pictureInPicture:()=>hostFeatures(current).browserPictureInPicture,taskPictureInPicture:()=>hostFeatures(current).browserTaskPictureInPicture,budget:()=>hostBrowserBudget(current)};
let startupSetup,setupFinished=false,agentMoved=false;
let sample=false,mountedSample=null,current,view,onboarding,preferences,values=new Map(),save=Promise.resolve();
mountEmailReview(call,()=>view);
mountNotionReview(call,()=>view);
mountHomeReview(call,()=>view);
mountWriteNotice(call,()=>view);
mountHarnessApproval(call,()=>view);
mountChannelReply(call,()=>view);
mountHarnessCall(call,()=>view);
mountMemoryManager(call,()=>view);
// Mail sender portraits: the host reads public pictures; the practice world never looks any up.
setMailAvatarLookup(address=>sample?Promise.resolve(null):call('mailAvatar',{address}));
// An email's own picture for its Attention card, read by the host only when the card opens.
setAttentionImageLookup(url=>sample?Promise.resolve(null):call('attentionImage',{url}));
let sampleValues: Record<string,string>={};
window.worldletFlushWrites=()=>save;
// Keep practice edits in the native app session across web-view reloads.
function enqueueSave(action,body){save=save.catch(()=>{}).then(()=>call(action,body));save.catch(e=>window.dispatchEvent(new CustomEvent('worldlet:sync',{detail:{message:'Could not save: '+e.message,error:true}})));return save;}
const storage={getItem:key=>sample?(sampleValues[key]||null):(values.get(key)||null),setItem(key,value){
 if(sample){sampleValues[key]=value;enqueueSave('saveSampleUI',{state:{...sampleValues}});return;}
 values.set(key,value);enqueueSave('saveOverlay',{state:validateOverlay(JSON.parse(value))});
}};
function savedItemStatus(){try{const value=JSON.parse(sampleValues.items||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
async function resetSample(){await enqueueSave('saveSampleUI',{state:{'dataset-version':SAMPLE_DATASET_ID}});sampleValues={'dataset-version':SAMPLE_DATASET_ID};localStorage.removeItem('aladdin-notion-read-Sample world');}
window.addEventListener('worldlet:text-scale',(e: any)=>enqueueSave('setTextScale',{value:e.detail}));

let setupArrivalPending=false;
const worldProjector=createWorldProjector();
window.addEventListener('pagehide',()=>worldProjector.dispose(),{once:true});

let appUpdate={visible:false};
window.worldletAppUpdate=value=>{appUpdate=value;window.dispatchEvent(new CustomEvent('worldlet:app-update',{detail:value}));};
// Updating and switching worlds wait for queued writes to settle, not succeed: a stale save failure must not block them.
const updates={snapshot:()=>appUpdate,failure:error=>window.worldletAppUpdate({...appUpdate,visible:true,enabled:true,label:'Retry update',detail:error.message}),activate:async()=>{await save.catch(()=>{});window.worldletAppUpdate(await call('appUpdate'));}};
window.worldletSpeech=value=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:value}));
async function toggleSample(){await save.catch(()=>{});await call('setSampleEnabled',{enabled:!sample});const url=new URL(location.href);url.hash='';location.replace(url.href)}


let firstValue=null,worldTour=null,loginItemOffer=null,desktopHint=null;
let lastGoogleState:string|null=null,reportedWorld=false;
async function applyReceivedSnapshot(state,isCurrent=()=>true){
 if(!state.sampleEnabled){
  const connected=(state.connections||[]).some(c=>['gmail','google-calendar'].includes(c.provider)&&connectionLive(c));
  const event=connected?'google_connection_present':'google_connection_absent';
  if(event!==lastGoogleState){lastGoogleState=event;track(event);}
 }

 if(startupSetup){startupSetup.update(state);return;}
 // Someone who used Fox's own Hermes chooses the Agent Fox runs on, once, on the same page (host foxNeedsAgent).
 if(!view&&!state.sampleEnabled&&state.onboarding?.completed&&state.agentNeeded===true&&!agentMoved){
  startupSetup=mountStartupSetup({state,call,move:true,complete:async next=>{startupSetup=null;agentMoved=true;await receive(next);}});return;
 }
 if(!view&&!state.sampleEnabled&&!state.onboarding?.completed&&!setupFinished){
  startupSetup=mountStartupSetup({state,call,complete:async (next,icons)=>{
   startupSetup=null;setupFinished=true;setupArrivalPending=true;
   document.addEventListener('worldlet:world-opening',async()=>{
    const root=document.getElementById('notionWorld');
    const arrival=new CustomEvent('worldlet:intro-devices',{detail:next.onboarding.unlockedApplets||[]});
    root.dispatchEvent(new CustomEvent('worldlet:prepare-arrival',{detail:next.onboarding.unlockedApplets||[]}));
    // Fox waits for the devices to land rather than speaking under them.
    root.dataset.arriving='true';
    // Fox, its bubble and its buttons stay out of the welcome (owner feedback 2026-10-02): the tour's
    // hello brings Fox in, in the middle of the window, once the celebration ends.
    root.dataset.foxAway='true';
    root.addEventListener('worldlet:celebration-done',()=>setTimeout(()=>{if(!root.dataset.tourStep)delete root.dataset.foxAway;},4000),{once:true});
    await landSetupDevices(root,()=>{setupArrivalPending=false;Object.assign(arrival,{settled:true});root.dispatchEvent(arrival);});
    delete root.dataset.arriving;
    window.dispatchEvent(new Event('worldlet:applet-arrival'));
    celebrateWorld(root);
   },{once:true});
   await receive(next);
  }});return;
 }
 document.getElementById('nativeNotice').textContent='';
 window.worldletAppUpdate(state.appUpdate||{visible:false});
 // Font loading runs alongside scene creation; system fonts are a usable fallback.
 void prepareUIFonts();
 document.dispatchEvent(new CustomEvent('worldlet:startup-phase',{detail:'scene'}));
 if(current&&state.revision===current.revision&&state.activityRevision===current.activityRevision)return;
 const nextSample=state.sampleEnabled===true;
 // A page is mounted as one world or the other. If the preference changed under a
 // running page (the switch itself reloads, but a check or another process may
 // flip it), reload rather than swap worlds in place: Fox, its tools and the
 // storage were all wired for the world that was mounted.
 if(view&&nextSample!==mountedSample){const url=new URL(location.href);url.hash='';location.replace(url.href);return;}
 if(view&&nextSample){current=state;return;}
 const prepared=nextSample?null:await worldProjector.project(state);
 if(!isCurrent())return;
 current=state;sample=nextSample;
 window.dispatchEvent(new Event('worldlet:weather-opt-in'));
 if(!view){document.documentElement.dataset.firstVisit=String(setupFinished||!sample&&!state.onboarding?.completed&&(state.onboarding?.introStep||0)<3);mountedSample=sample;sampleValues=state.sampleUI?.['dataset-version']===SAMPLE_DATASET_ID?state.sampleUI:{'dataset-version':SAMPLE_DATASET_ID};}
 // Settled practice items survive view reloads; a new app session resets them.
 const world=sample?makeSampleWorld({itemStatus:savedItemStatus()}):prepared;
 if(!sample&&setupArrivalPending)world.unlockedApplets=[];
 if(sample){let snoozes={};try{snoozes=JSON.parse(storage.getItem('itemSnoozes')||'{}');}catch{}for(const page of world.pages)if(snoozes[page.worldItemId])settleItemPage(page,page.worldItemStatus,snoozes[page.worldItemId]);}
 world.appName=typeof state.appName==='string'&&state.appName.trim()?state.appName:'Worldlet';
 world.platform=state.platform;world.hostCapabilities=state.hostCapabilities;
 // Corner controls leave room for the window's own buttons (the Mac's traffic lights).
 document.documentElement.toggleAttribute('data-leading-window-controls',hostFeatures(state).leadingWindowControls);
 if(!view){if(state.textScale)localStorage.setItem('worldlet-ui-text-scale',String(state.textScale));values.set('aladdin-content-v1:Worldlet',JSON.stringify(state.overlay||EMPTY_OVERLAY()));view=mountNotionWorld(world,{storage,updates,browser,editApplet:body=>call('onboarding',body),unlockApplet:id=>call('onboarding',{operation:'unlock',applet:id}),launchApplet:hostFeatures(state).nativeAppletLaunch?key=>call('openInstalledApplet',{key}):undefined,installedApplets:hostFeatures(state).installedAppDetection&&!sample?()=>call('installedApplets',{icons:false}):undefined,visitedSites:sample?undefined:()=>call('browserCommand',{operation:'visitedSites',args:{},agent:false}),copyAppletPrototype:html=>call('copyAppletPrototype',{html}),resetSample:sample?resetSample:null,chat:createNativeCompanion(call,{sample}),toggleSample,setup:(screen,region,moduleKey)=>screen==='preferences'?preferences?.show():onboarding?.show(screen,region,moduleKey),weather:{autoLocate:()=>!sample&&current?.onboarding?.completed===true&&current?.onboarding?.unlockedApplets?.includes('app-weather')&&!current?.onboarding?.hiddenApplets?.includes('app-weather'),load:()=>call('weatherLoad'),save:value=>call('weatherSave',{value}),request:(operation,params)=>call('weatherRequest',{operation,params}),locate:()=>call('weatherLocate')},firstRun:()=>!sample&&onboardingUnfinished(current?.onboarding),settings:()=>view?.openText(),connect:(provider,region)=>call('connect',{provider,...(region?{region}:{})}),stripe:body=>call('stripe',body),paypalContent:body=>call('paypalContent',body),curatedSourceContent:body=>call('curatedSourceContent',body),youtube:body=>call('youtube',body),youtubePlayer:body=>call('youtubePlayer',body),widgets:sample?undefined:body=>call('widgets',body),widgetPlayer:sample?undefined:body=>call('widgetPlayer',body),artifactPages:sample?undefined:body=>call('artifactPages',body),ongoing:sample?undefined:body=>call('ongoing',body),morningBrief:sample?undefined:()=>call('foxPreferences').then(info=>info?.morningBrief),emailReviews:sample?undefined:()=>call('emailAction',{operation:'list'}).then(value=>Array.isArray(value?.reviews)?value.reviews:[]),artifacts:sample?undefined:body=>call('artifacts',body),calendarEvents:body=>call('calendarEvents',body),siteApplets:sample?undefined:body=>call('siteApplets',body),appletArt:sample?undefined:body=>call('appletArt',body),doorDash:body=>call('doorDash',body),codexSession:body=>call('codexSession',body),claudeSession:body=>call('claudeSession',body),developmentSessions:(provider,options={})=>call('developmentSessions',{provider,...options}),appContent:body=>call('appContent',body),notionContent:body=>call('notionContent',body),voiceMemos:body=>call('voiceMemos',body),messages:body=>call('messages',body),obsidianContent:body=>call('obsidianContent',body),browserOutcome:(id,done)=>call('browserOutcomeAction',{id,done}),itemRead:id=>call('worldItemRead',{id}),taskReview:sample?undefined:(id,choice,candidateId)=>call('taskReviewAction',{id,choice,candidateId}),phonePublish:sample?undefined:(value,slot='attention')=>call('phonePublish',{slot,value}),harnessApproval:(id,choice)=>call('harnessApproval',{id,choice}),harnessAgents:sample?undefined:body=>call('harnessAgents',body),harnessModels:sample?undefined:body=>call('harnessModels',body),itemStatus:(id,status,snoozedUntil,by)=>call('worldItemStatus',{id,status,...(snoozedUntil?{snoozedUntil}:{}),...(by?{by}:{})}),original:id=>call('original',{id})});mountWorldAudio(call);if(hostFeatures(state).localMusic)mountLocalMusic(call)}else view.applyWorld(world,true);
 if(!sample){if(!firstValue)firstValue=mountFirstValue({root:document.getElementById('notionWorld'),view,call,state,arriving:setupArrivalPending});else firstValue.update(state);}
 if(!sample&&!worldTour){const worldRoot=document.getElementById('notionWorld');worldRoot?.addEventListener('worldlet:first-win',()=>celebrateWin(worldRoot));}
 if(!sample){if(!worldTour)worldTour=mountWorldTour({root:document.getElementById('notionWorld'),view,call,state,arriving:setupArrivalPending});else worldTour.update(state);}
 if(!sample){if(!loginItemOffer)loginItemOffer=mountLoginItemOffer({root:document.getElementById('notionWorld'),view,call,state});else loginItemOffer.update(state);}
 if(!sample){if(!desktopHint)desktopHint=mountDesktopCompanionHint({root:document.getElementById('notionWorld'),view,state});else desktopHint.update(state);}
 if(!sample&&!reportedWorld){reportedWorld=true;track('world_entered');}
 if(setupFinished&&!onboarding)document.getElementById('notionWorld').dispatchEvent(new CustomEvent('worldlet:intro-devices',{detail:[]}));
 if(!sample){if(!onboarding)onboarding=mountWorldOnboarding({root:document.getElementById('notionWorld'),call,view,state,toggleSample,applySnapshot:receive});else onboarding.update(state);}
 if(!preferences)preferences=createFoxPreferences({call,view,root:document.getElementById('notionWorld'),toggleSample,setup:(screen,provider)=>onboarding?.show(provider?(screen==='connection'?'connection':'app'):screen,'home',provider)});
 document.title=world.appName;
 // The rendered world may contain transient Hermes results; never export it automatically.
}
let pendingControls=null;
window.worldletApplyTextScale=value=>{applyTextScale(document.getElementById('notionWorld'),value);localStorage.setItem('worldlet-ui-text-scale',String(value));};
window.worldletShowControls=(screen='preferences',provider)=>{const node=document.getElementById('notionWorld');if(node?.dataset.replyBusy==='true'&&node?.dataset.onboarding!=='true'){pendingControls=[screen,provider];return;}return preferences?.show(screen,provider);};
window.addEventListener('worldlet:fox-idle',()=>{if(pendingControls){const args=pendingControls;pendingControls=null;void preferences?.show(...args);}});
window.worldletStatus=value=>window.dispatchEvent(new CustomEvent('worldlet:job',{detail:value}));
const backgroundSnapshot=snapshotInbox(applyReceivedSnapshot);
function receive(state){return backgroundSnapshot(state);}
window.worldletReceive=state=>receive(state).catch(e=>{document.getElementById('nativeNotice').textContent=e.message;document.dispatchEvent(new Event('worldlet:world-error'))});
call('snapshot').then(receive).catch(e=>{document.getElementById('nativeNotice').textContent=e.message;document.dispatchEvent(new Event('worldlet:world-error'))});
