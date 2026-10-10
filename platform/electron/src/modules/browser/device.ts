import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {WebContentsView,screen,session,shell,type BaseWindow,type Rectangle,type View} from 'electron';
import {PAGE_MEMORY,RAW_KINDS,WEB_RECORD,type WebRecord,webSite,desktopTaskPictureInPicturePlacement,googleSignInRejected,memoryPressure,focusHost,pageFocusPlan,readSiteFocus,siteFocusFor,siteFocusRecord,PAGE_FOCUS_LIMITS,type PageFocusPlan,type SiteFocusRecord,signInRejectedMessage,linkRefusedMessage,type RefusedLink,sitePage,taskPictureInPictureAspect,type MemoryReading,VIDEO_FORMATS,needsProprietaryVideo,videoFormatHost,carriedStorage,storageCarryScript,STORAGE_READ,readLoginSignal,loginSite,loginUsername,loginOffer,loginsFor,tabApplet,isBrowserTab} from '../../../../../core/browser/index.ts';
import {SavedLogins} from './logins.ts';
import {WorldletError} from '../../files.ts';
import {Cancelled,PageView,type PermissionRequest} from './page.ts';
import {CefPageView} from './engine/page.ts';
import {cookieBridge} from './cookie-bridge.ts';
import {pageEngine,sharedEngine,sharedEnginePid,surfacePreload} from './engine/process.ts';
import {readMemory,refreshMemory} from './memory.ts';
import type {WebPage} from './web-page.ts';
import {AgentBrowser,type AgentBrowserEnvironment} from './agent.ts';
import {FoxGlow,glowStyle,type GlowStyle} from './glow.ts';
import {PressOverlay,TaskWindow} from './task-window.ts';
import {BrowserHistory,historyDestination} from './history.ts';
import {ActivityRecorder} from './activity.ts';
import {WebRecorder,manageRecordings,readRecordings,type RecordedVisit} from './recorder.ts';
import {BattleReviews} from './battle-review.ts';
import {MeetingTranscriber} from './meeting-transcript.ts';
import {transcriptLine} from '../../../../../core/applets/index.ts';
import {Surface,websiteSession} from './surface.ts';
import {blockedMediaDevices,explainBlockedMedia,mediaDevices,type MediaDevice} from './media-access.ts';
import {HOMES,SIGN_IN_HOSTS,signInPage,isGoogleMaps,isNotion,isX,parse,publicPage,sameURL} from './rules.ts';
import type {Host,Row} from '../../host/types.ts';
import {ANALYTICS,FOX,SPEECH,USER_ACTIVITY,type AnalyticsService,type FoxService,type SpeechService,type UserActivityService} from '../../host/services.ts';
import {userIdle} from '../../../../../core/tasks/index.ts';
import {timingBucket} from '../../../../../core/diagnostics/index.ts';
import {GAME_REVIEW_APPLET} from '../../../../../core/games/index.ts';

type Kept={view:WebPage;platform:string;requestedURL:URL|null};
type Layout={rect:Row;fox?:Row;page?:Row;press:boolean;copy?:Row};
type Pip=Kept&{key:string;applet:string;press:WebContentsView};
/** Fox's copy of the visible page in the panel's corner (foxCopyPlacement), its overlay and its own size. */
type Copy={view:CefPageView;overlay:PressOverlay;page:{width:number;height:number}};
/** A local calendar day, YYYY-MM-DD, of a time in seconds. */
const localDay=(at:number)=>{const date=new Date(at*1000);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
/** How long a browser step waits for a loading page before telling Fox to try again. */
const LOAD_WAIT_MS=8000;
/** How long after a click, scroll or open the page is given to start changing before it is read. */
const PAGE_AFTER_MS=300;
/** How long the same page goes before its text is read again for browsing history. */
const HISTORY_REREAD_MS=30_000;
const MEETING_HOSTS=['meet.google.com','zoom.us','teams.microsoft.com','teams.live.com'];
/** Focus on website pages (core/browser/page-focus.ts): each site's choice is a record in the World. */
const FOCUS_BUCKET='site-focus';
/** Sites whose video needs H.264/AAC (core/browser/video-formats.ts): one record each in the World. */
// v2 (2026-10-07): sites the first version moved for a failed sound, not a video, open on CEF again with their sign-ins.
const VIDEO_BUCKET='video-formats-v2';
/** Fox works on the site's own page: Focus steps aside from Fox's first step there until this long after its last. */
const FOX_FOCUS_HOLD_MS=90_000;
// After a Google sign-in moves a page to the CEF engine, its video does not move it back for this long.
const GOOGLE_SIGN_IN_MS=3*60_000;
const meetingPage=(url:string)=>{const host=parse(url)?.hostname.toLowerCase()??'';return MEETING_HOSTS.includes(host)||host.endsWith('.zoom.us');};

/** The website panel (Mac BrowserDevice). Which pages stay alive, the picture-in-picture rule and
 * every browser command policy are shared Core/UI rules; this host keeps, shows and releases pages. */
export class BrowserDevice {
 private host:Host;
 readonly surface:Surface;
 private browser:WebPage|null=null;
 private glow=new FoxGlow();
 private timer:NodeJS.Timeout|null=null;
 private history:BrowserHistory|null=null;
 private activity:ActivityRecorder;
 private capturingActivity=false;
 private activityGeneration=0;
 private contextRead=false;
 private platform='x';
 private requestedURL:URL|null=null;
 private pageIssue:Row|null=null;
 // The last refused link said, so one click is said once (a page may retry it at once).
 private refusedLink:{key:string,at:number}|null=null;
 private signingInUntil=0;
 private historyRead:{view:WebPage;url:string;at:number}|null=null;
 // Website Applet pages the person left, kept hidden with media paused and muted so returning
 // resumes them (core/browser/page-resume.ts sends `live`). Keys include the world scope.
 private parked=new Map<string,Kept>();
 private pageKey:string|null=null;
 // Newly opened remembered pages whose media is held from their first load (`hold`).
 private held=new Set<WebPage>();
 private pipPage:Pip|null=null;
 // Electron has no memory-pressure event: kept pages are sampled instead (`watchMemory`).
 private memoryTimer:NodeJS.Timeout|null=null;
 sampleMemory:()=>MemoryReading|null=readMemory;
 private videoPlaying=false;
 private pagesScope:string|null=null;
 private pagesWindow:BaseWindow|null=null;
 private watchedWindow:BaseWindow|null=null;
 makeAgent:((view:WebPage)=>AgentBrowser)|null=null;
 // Task picture in picture (#1175). `worldLayout` is where the World last placed the visible page,
 // applied again when the World comes back. While the World window is away for the desktop
 // Companion, Fox's page waits beside it in `task` (task-window.ts), at `taskSize`.
 private worldLayout:Layout|null=null;
 private away=false;
 private task:TaskWindow|null=null;
 // Fox's copy of the visible page while the person keeps it (core/browser/picture-in-picture.ts FOX_COPY).
 private copy:Copy|null=null;
 private taskSize:{width:number;height:number}|null=null;
 private taskFox:GlowStyle|null=null;
 // Fox's pointer moves over the page as it shows: smaller in a task window.
 private pointerScale=1;
 private pointer={point:(x:number,y:number)=>this.glow.point(x*this.pointerScale,y*this.pointerScale)};
 // The call being transcribed (Meetings; it starts with the call and the person can stop it): its page, the transcriber and session.
 private transcript:{view:CefPageView;transcriber:MeetingTranscriber;session:string;meeting:string;visit:string}|null=null;
 /** When Fox last took a step on a page: Focus stays aside for a while after (FOX_FOCUS_HOLD_MS). */
 private foxDrovePage=0;
 /** What Focus last did on each page, said again when a kept page returns to the panel. */
 private focusState=new WeakMap<WebPage,Row>();
 // Camera and microphone the person allowed a meeting page, kept while it stays on that site.
 private mediaGrants=new WeakMap<WebPage,{host:string,media:number}>();
 private mediaAsking=new WeakMap<WebPage,Promise<boolean>>();
 /** Brings the World window back (the desktop Companion's Back to World). */
 restoreWorld:()=>Promise<void>|void=()=>{};
 constructor(host:Host,agent:Omit<AgentBrowserEnvironment,'pointer'>){
  this.host=host;this.surface=new Surface(host);this.activity=new ActivityRecorder(host.store);
  this.battles=new BattleReviews({day:at=>localDay(at),local:at=>new Date(at*1000).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}),
   start:review=>this.startGameReview(review),onError:error=>this.host.diagnostics.record(error,'gameReview')});
  this.makeAgent=view=>new AgentBrowser(view,{...agent,pointer:()=>view===this.foxPage()&&this.glow.isShowing?this.pointer:null});
  // Recordings expire whether or not a page is opened: shortly after start, then every hour.
  setTimeout(()=>this.pruneRecordings(true),60_000).unref?.();
  setInterval(()=>this.pruneRecordings(true),3_600_000).unref?.();
 }
 // Fox reviews the games the person just played, without being asked (#1598).
 readonly battles:BattleReviews;
 private startGameReview(review:{task:string;request:string}):'started'|'later'|'never'{
  if(this.sample||!this.store.writable)return 'never';
  // Nobody at the computer: the games wait for the person to come back (no background spend while idle, #1664).
  try{if(userIdle({idleSeconds:this.host.optional<UserActivityService>(USER_ACTIVITY)?.idleSeconds()??0}))return 'later';}catch{}
  const fox=this.host.optional<FoxService>(FOX);if(!fox)return 'never';
  if(fox.scope().setup)return 'later';
  try{fox.reviewGames({applet:GAME_REVIEW_APPLET,task:review.task,request:review.request});return 'started';}
  catch(error){
   const text=error instanceof Error?error.message:String(error);
   // Busy Applets free up; an Agent without a task lane or a world without consent stays that way.
   if(/already working|Several Applets/.test(text))return 'later';
   this.host.diagnostics.record(error,'gameReview');return 'never';
  }
 }
 private get store(){return this.host.store;}
 private get webRoot(){return this.host.profile.webRoot;}
 private get sample(){return this.store.sampleEnabled();}
 // Sites seen needing H.264/AAC; the World keeps them, the practice world only for this run.
 private videoHostsLoaded:Set<string>|null=null;
 private get scope(){return this.sample?'practice':'personal';}
 get privateContextWasRead(){return this.contextRead;}
 get visiblePage(){return this.browser;}
 /** The page Fox's steps go to: its copy while there is one, otherwise the visible page. */
 private foxPage():WebPage|null {return this.copy?.view??this.browser;}
 private emit(event:Row){void this.host.page.call('worldletBrowser',event);}
 private scripts=new Map<string,string>();
 /** Page scripts from the packaged UI, read once; Dev builds reread them so a rebuild applies. */
 private script(name:string){
  const cached=this.host.profile.channel==='dev'?undefined:this.scripts.get(name);
  if(cached!==undefined)return cached;
  const text=fs.readFileSync(path.join(this.webRoot,name),'utf8');
  if(this.host.profile.channel!=='dev')this.scripts.set(name,text);
  return text;
 }

 /** Pages belong to one world and one window; a switch of either releases them all. */
 private prepare(){
  const window=this.surface.window();
  if(this.pagesScope&&(this.pagesScope!==this.scope||this.pagesWindow!==window))this.stop();
  if(window&&this.watchedWindow!==window){
   this.watchedWindow=window;
   const follow=()=>{if(this.watchedWindow===window&&this.browser&&this.glow.isShowing){const screen=this.surface.toScreen(this.browser.frameRect());if(screen)this.glow.place(screen);}};
   window.on('move',follow);window.on('resize',follow);
  }
  return window;
 }
 private create(url:string,force?:'cef',early=''){
  const parent=this.surface.parent();
  if(!parent)throw new WorldletError('The world is not ready.');
  const demo=this.host.profile.channel==='dev';
  // A Browser tab's page ('browser--2', core/browser/browser-tabs.ts) belongs to the Browser Applet.
  const key=this.pageKey?.split(':').slice(1).join(':')||'',applet=tabApplet(key)||this.platform,tabs=isBrowserTab(key);
  // Website pages run on the CEF engine when it is built for this host (#1170); Google accepts its
  // sign-in, which it refuses in Electron's own views (#1089). Otherwise Electron's views serve, and
  // always for X, Douyin and Twitch, whose H.264 video the standard CEF build cannot play (ELECTRON_VIEW_APPLETS).
  // A site seen needing H.264/AAC opens there too (core/browser/video-formats.ts). A page that asks for a passkey
  // reopens on CEF (`force`, passkeyRequested): Electron's views draw no passkey dialogs.
  const engine=force==='cef'||!this.videoHosts().has(videoFormatHost(url))&&pageEngine(this.host.profile,this.platform,applet)==='cef'?sharedEngine(this.host.profile):null;
  // A crashed website renderer or engine reaches PostHog like Electron's own processes (allowlisted type and reason).
  if(engine)engine.onGone=(type,reason)=>this.host.optional<AnalyticsService>(ANALYTICS)?.recordProductEvent('app_process_gone','',{process_type:type,exit_reason:reason});
  const view:WebPage=engine
   ?new CefPageView({engine,parent,window:()=>this.surface.window(),scope:this.scope,webRoot:this.webRoot,demo,url,preload:surfacePreload(),
     // Meetings pages in the personal world can transcribe their call when the person asks.
     meeting:applet==='meetings'&&this.scope==='personal'&&this.store.writable,
     tabs,early,
     // One sign-in across both engines: the engine page opens with Electron's cookies (cookie-bridge.ts).
     before:cookieBridge(this.scope,engine).beforeEnginePage(()=>this.browser instanceof CefPageView&&!this.browser.hidden),
     onDownload:message=>{if(this.browser===view)this.emit({phase:'download',platform:this.platform,message});}})
   :new PageView(parent,websiteSession(this.scope,(contents,message)=>{if((this.browser as PageView|null)?.owns(contents))this.emit({phase:'download',platform:this.platform,message});}),this.webRoot,demo,url,early);
  if(view instanceof PageView)view.tabs=tabs;
  view.makeDriver=(page:any)=>this.makeAgent!(page);
  this.pagesScope=this.scope;this.pagesWindow=this.surface.window();
  // What happens on the page is kept in the World (core/browser/web-record.ts); the practice world keeps nothing.
  if(this.scope==='personal'&&this.store.writable){
   view.record(new WebRecorder(view,(visits,records)=>this.recorded(visits,records),
    {applet,onError:error=>this.host.diagnostics.record(error,'webRecord')}));
   this.pruneRecordings();
  }
  return view;
 }

 // Recordings --------------------------------------------------------------------------------
 /** A recorder's batch: kept in the World, and followed for games to review. */
 recorded(visits:RecordedVisit[],records:(WebRecord&{visit:string})[]){
  if(!this.store.writable||this.sample)return;
  this.store.ledger().recordWeb(visits,records);
  this.battles.observe(visits,records);
 }
 private prunedAt=0;
 /** Raw network records older than WEB_RECORD.rawDays go, and the oldest when over the size limit; at most
  * hourly when a page opens, and on the start and hourly timers. */
 private pruneRecordings(timer=false){
  const now=Date.now()/1000;if(!timer&&now-this.prunedAt<3600)return;this.prunedAt=now;
  try{if(!this.store.writable||this.sample)return;this.store.ledger().pruneWeb({rawKinds:RAW_KINDS,rawBefore:now-WEB_RECORD.rawDays*86400,maxBytes:WEB_RECORD.maxBytes});}catch(error){this.host.diagnostics.record(error,'webRecord');}
 }
 show(body:Row){
  const requested=typeof body.platform==='string'?body.platform:'x',address:string|undefined=body.url;
  const home=HOMES[requested];
  if(!home)throw new WorldletError('Unsupported browsing destination.');
  const destination=parse(address??home);
  const valid=!!destination&&(requested==='web'?publicPage(destination):address===undefined||(requested==='notion'?isNotion(destination):sitePage(requested,destination.href)));
  if(!destination||!valid)throw new WorldletError('Choose a valid HTTPS page for this browser.');
  if(!this.prepare()||!this.surface.parent())throw new WorldletError('The world is not ready.');
  const live:string[]|undefined=body.live,resume=body.resume===true;
  const key=typeof body.applet==='string'?this.scope+':'+body.applet:null;
  // The panel starts without a video; the next probe tells it again if one plays.
  this.videoPlaying=false;
  // Another Applet's page steps aside (kept or closed); this Applet's kept page returns as it was.
  if(this.browser&&(this.platform!==requested||key!==this.pageKey))this.park(live);
  // The picture-in-picture page returns to the panel as it is, still playing.
  if(!this.browser&&key&&this.pipPage?.key===key){
   const page=this.pipPage;this.pipPage=null;this.removePress(page.press);
   if(page.platform===requested){
    this.browser=page.view;this.requestedURL=page.requestedURL;this.pageIssue=null;page.view.setHidden(false);
    void this.pictureInPicture(page.view,'leave');
    if(!resume&&address!==undefined&&!sameURL(address,page.view.url)){this.requestedURL=destination;page.view.load(destination.href);}
   }else page.view.close();
  }
  if(!this.browser&&key&&this.parked.has(key)){
   const kept=this.parked.get(key)!;this.parked.delete(key);
   if(kept.platform===requested){
    this.browser=kept.view;this.requestedURL=kept.requestedURL;this.pageIssue=null;this.resumeMedia(kept.view);
    if(!resume&&address!==undefined&&!sameURL(address,kept.view.url)){this.requestedURL=destination;kept.view.load(destination.href);}
   }else kept.view.close();
  }
  this.platform=requested;this.pageKey=key;this.release(live);
  if(!this.browser){
   const view=this.create(destination.href);
   this.browser=view;this.requestedURL=destination;this.pageIssue=null;
   if(body.hold===true){view.mute(true);this.held.add(view);}
   this.bind(view);
  }else if(!resume&&address!==undefined&&!sameURL(address,this.requestedURL?.href)){
   this.pageIssue=null;this.requestedURL=destination;this.browser.load(destination.href);
  }
  this.browser.raise();
  this.layout(body.rect,body.fox,body.page,body.press,body.copy);this.browser.setHidden(false);this.status();
  const focused=this.focusState.get(this.browser);if(focused)this.emit({...focused,platform:this.platform});
  this.startTimer();
 }
 // Focus (core/browser/page-focus.ts) -----------------------------------------------------------
 private focusRecords():SiteFocusRecord[]{
  if(this.sample||!this.store.writable)return [];
  try{return this.store.ledger().records(FOCUS_BUCKET).flatMap(row=>{const record=readSiteFocus(row);return record?[record]:[];});}
  catch(error){this.host.diagnostics.record(error,'pageFocus');return [];}
 }
 /** Applies a plan to the page (platform/bridge/page-focus.ts) and tells the panel what Focus does there. */
 private async focus(view:WebPage,plan:PageFocusPlan|null,paused=false):Promise<Row|null>{
  let result:Row|null=null;
  if(plan&&(plan.on&&!paused||this.focusState.get(view)?.active)){
   let script='';try{script=this.script('browser/page-focus.js');}catch{}
   if(script)try{result=await view.evaluate('if(!globalThis.worldletPageFocus){'+script+'\n}return globalThis.worldletPageFocus(plan);',{plan:paused?{...plan,on:false}:plan},{timeoutSeconds:5}) as Row;}catch{}
  }
  const state={phase:'focus',url:view.url,available:!!plan,on:!!plan?.on,paused,reader:result?.reader===true,active:result?.on===true};
  this.focusState.set(view,state);
  if(this.browser===view)this.emit({...state,platform:this.platform});
  return result;
 }
 /** A page that finished loading gets its site's Focus, unless Fox is working on it. */
 private applyFocus(view:WebPage){
  const plan=pageFocusPlan(view.url,siteFocusFor(this.focusRecords(),view.url));
  return this.focus(view,plan,Date.now()-this.foxDrovePage<FOX_FOCUS_HOLD_MS);
 }
 /** Fox takes a step on the page: Focus steps aside first, so Fox sees and acts on the site's own page. */
 private async foxDrives(view:WebPage){
  // Fox's copy leaves the person's page and its Focus as they are.
  if(view!==this.browser)return;
  this.foxDrovePage=Date.now();
  const state=this.focusState.get(view);
  if(state?.active||state&&!state.paused)await this.focus(view,pageFocusPlan(view.url,siteFocusFor(this.focusRecords(),view.url)),true);
 }
 /** The person turns Focus on or off for the page's site; the choice is kept in the World for that site. */
 private async setFocus(on:boolean):Promise<Row>{
  const browser=this.browser;
  if(!browser||browser.hidden)throw new WorldletError('Open a website first.');
  const host=focusHost(browser.url);if(!host)throw new WorldletError('Focus works on website pages.');
  const records=this.focusRecords(),previous=records.find(r=>r.host===host)??null;
  const record=siteFocusRecord(previous,host,{off:!on},Math.floor(Date.now()/1000));
  if(!this.sample&&this.store.writable){
   const ledger=this.store.ledger();
   // The oldest choices make room once a World holds many sites.
   if(!previous)for(const old of records.sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,Math.max(0,records.length+1-PAGE_FOCUS_LIMITS.records)))ledger.delete(FOCUS_BUCKET,old.id);
   ledger.put(FOCUS_BUCKET,record.id,record as any);
  }
  // The person's choice applies now, also while Fox's hold would keep Focus aside.
  this.foxDrovePage=0;
  const result=await this.focus(browser,pageFocusPlan(browser.url,record));
  return {ok:true,on,reader:result?.reader===true};
 }
 /** The site's parts for Fox to choose from (platform/bridge/page-focus.ts `outline`), with the rules it already has. */
 private async focusOutline():Promise<Row>{
  const browser=this.browser;
  if(!browser||browser.hidden)throw new WorldletError('Open the website first.');
  const host=focusHost(browser.url);if(!host)throw new WorldletError('Focus works on website pages.');
  const script=this.script('browser/page-focus.js');
  let page:Row;
  try{page=await browser.evaluate('if(!globalThis.worldletPageFocus){'+script+'\n}return globalThis.worldletPageFocus.outline();',{},{timeoutSeconds:8}) as Row;}
  catch{throw new WorldletError('This page could not be outlined. Wait for it to load and try again.');}
  this.contextRead=true;
  const record=siteFocusFor(this.focusRecords(),browser.url),plan=pageFocusPlan(browser.url,record);
  return {site:host,page,saved:record?.hide??[],focusOn:plan?.on??false,untrustedContent:true};
 }
 /** Fox saves the parts of the page's site that Focus hides (replacing the ones it saved before); they apply now. */
 private async saveFocusRules(hide:unknown):Promise<Row>{
  const browser=this.browser;
  if(!browser||browser.hidden)throw new WorldletError('Open the website first.');
  const host=focusHost(browser.url);if(!host)throw new WorldletError('Focus works on website pages.');
  if(!Array.isArray(hide))throw new WorldletError('Pass hide as a list of CSS selectors from outline.');
  const records=this.focusRecords(),previous=records.find(r=>r.host===host)??null;
  const record=siteFocusRecord(previous,host,{hide},Math.floor(Date.now()/1000));
  const refused=hide.length-record.hide.length;
  if(!this.sample&&this.store.writable){
   const ledger=this.store.ledger();
   if(!previous)for(const old of records.sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,Math.max(0,records.length+1-PAGE_FOCUS_LIMITS.records)))ledger.delete(FOCUS_BUCKET,old.id);
   ledger.put(FOCUS_BUCKET,record.id,record as any);
  }
  // Fox's rules show at once, so the person sees what Focus now hides.
  this.foxDrovePage=0;
  const plan=pageFocusPlan(browser.url,record),result=await this.focus(browser,plan);
  return {ok:true,site:host,saved:record.hide,hiddenNow:typeof result?.hidden==='number'?result.hidden:0,focusOn:plan?.on??false,
   ...refused>0?{refused,guidance:'Some selectors were refused: one plain CSS selector each, never the whole page.'}:{},
   ...plan?.on===false?{guidance:'Focus is off for this site; the person turns it on with the Focus switch after Back.'}:{}};
 }
 private startTimer(){
  if(this.timer)return;
  const tick=async()=>{
   if(!this.timer)return;
   this.checkEngine();await this.captureActivity();await this.captureHistory();await this.captureVideo();await this.captureVideoFormats();
   if(this.timer)this.timer=setTimeout(tick,3000);
  };
  this.timer=setTimeout(tick,3000);
 }
 private stopTimer(){if(this.timer)clearTimeout(this.timer);this.timer=null;}
 /** The visible CEF page has drawn nothing since it came into view: its engine stalled (ENGINE_STALL), so it
  * restarts and the page loads again; diagnostics get the outcome only, never the page. */
 private checkEngine(){
  const view=this.browser;
  if(!(view instanceof CefPageView)||this.away||!this.surface.windowVisible())return;
  const outcome=view.checkStall();
  if(outcome)this.host.diagnostics.record(new Error(outcome==='restarted'?'The website engine drew nothing; it restarted.':'The website engine drew nothing after a restart.'),'webEngineStall');
 }
 // Every callback acts only while its view is the visible page; a kept page stays silent.
 private bind(view:WebPage){
  const visible=()=>this.browser===view;
  const recording=()=>this.store.writable&&!this.sample;
  // page_load_timing: from the page's document starting to load to it loaded or failed; buckets and the engine only.
  // Both engines count the main frame only (isLoadingMainFrame): an iframe loading after the document finished would run
  // until the next navigation. CEF sends its loading state false only after every load end, so a CEF page that stops
  // loading with no 'loaded' still open is dropped, not timed.
  let loadStart=0;
  const loadEnded=(outcome:'complete'|'error')=>{
   if(!loadStart)return;
   const ms=Date.now()-loadStart;loadStart=0;
   if(!this.sample)this.host.optional<AnalyticsService>(ANALYTICS)?.recordProductEvent('page_load_timing',timingBucket(ms),{timing_outcome:outcome,page_engine:view instanceof CefPageView?'cef':'electron'});
  };
  view.onNavigation=()=>{if(visible()){this.pageIssue=null;this.videoStopped();}};
  // An engine page's sign-in reaches Electron's storage a moment after it loads (cookie-bridge.ts).
  const cookies=view instanceof CefPageView?sharedEngine(this.host.profile):null;
  view.onActivityEnd=reason=>{if(!visible())return;this.activityGeneration+=1;if(recording())this.activity.observe({active:false,close:true,endReason:reason});};
  view.onPopupChange=active=>{
   if(!visible())return;this.activityGeneration+=1;
   if(!recording())return;
   this.activity.observe({active:false,close:true,endReason:'popup'});
   this.activity.event({kind:'capture.popup',data:{active}});
  };
  if(view instanceof CefPageView)view.onMeetingAudio=value=>{if(this.transcript?.view===view)this.transcript.transcriber.audio(value);};
  view.onLoaded=()=>{
   loadEnded('complete');
   if(cookies)cookieBridge(this.scope,cookies).enginePageChanged();
   // A new document of the call (Zoom moves from its join page into the call): capture continues there.
   if(this.transcript?.view===view)void view.meetingAudio(true);
   // A call page in Meetings can be heard now: the World starts its transcript (owner request 2026-10-06).
   else if(!this.transcript&&view instanceof CefPageView&&view.meetingAudioReady&&meetingPage(view.url)&&this.browser===view&&!view.hidden)this.emit({phase:'meeting-ready'});
   // A new document in the window shows only its video again.
   if(this.pipPage?.view===view){void this.pictureInPicture(view,'enter');return;}
   if(!visible())return;
   if(this.held.delete(view))this.resumeMedia(view);
   void this.captureActivity();
   void this.applyFocus(view);
  };
  view.onActivity=page=>{
   if(!visible()||view.hidden||view.isLoading||view.hasPopup||this.sample||!this.store.writable||page.url!==view.url)return;
   this.activity.observe({page,active:this.surface.appActive()&&!view.hidden});
  };
  view.onChange=()=>{
   if(view.isLoadingMainFrame){if(!loadStart)loadStart=Date.now();}
   else if(view instanceof CefPageView&&!view.isLoading)loadStart=0;
   if(visible())this.status();
  };
  view.onError=code=>{loadEnded('error');if(visible())this.navigationFailed(code);};
  view.onBookmark=value=>{
   if(!visible()||!isX(view.url)||value.kind!=='bookmark')return;
   try{const fresh=this.save(value);this.emit({phase:'saved',fresh,title:typeof value.title==='string'?value.title:'Saved from X',url:typeof value.url==='string'?value.url:''});}
   catch{this.emit({phase:'error',message:'Could not save this post locally. Try Save to Fox.'});}
  };
  view.onLogin=value=>{if(visible())this.loginSignal(view,value);};
  if(view instanceof PageView)view.onPasskey=()=>{if(visible())this.passkeyRequested(view);};
  if(view instanceof PageView)view.onGoogleSignIn=(url,popup)=>{if(visible())this.googleSignIn(view,url,popup);};
  // A link for a new tab in a Browser tab's page: the panel opens it as the Browser's next tab.
  view.onOpenTab=(url,background)=>{if(visible())this.emit({phase:'open-tab',url,background});};
  view.onPermission=request=>void this.permission(view,request);
  view.onRefused=refused=>{if(visible())this.linkRefused(refused);};
  // A press on the task picture-in-picture window; the shared UI decides what follows.
  view.onPress=()=>{if(!visible())return;if(this.away)this.pressTask();else this.emit({phase:'task-pip',event:'press'});};
 }
 private async permission(view:WebPage,request:PermissionRequest){
  const origin=parse(request.origin),page=parse(view.url);
  if(this.browser!==view||!origin||origin.protocol!=='https:'||!page||origin.hostname!==page.hostname){request.answer(false);return;}
  if(request.kind==='location'){
   // Google Maps only; Chromium's own location provider answers after the OS grants it.
   request.answer(isGoogleMaps(view.url));return;
  }
  const host=origin.hostname;
  if(!meetingPage(origin.href)||!request.media){request.answer(false);return;}
  // A call asks for its microphone and camera several times (a preview, joining, a device change);
  // once the person allows them, this page keeps them while it stays on the site.
  // Requests that arrive together (the microphone and the camera at once) wait for one question.
  for(let pending=this.mediaAsking.get(view);pending;pending=this.mediaAsking.get(view))await pending;
  const current=()=>this.browser===view&&parse(view.url)?.hostname===host;
  const kept=this.mediaGrants.get(view),had=kept?.host===host?kept.media:0;
  if((had&request.media)===request.media){request.answer(current());return;}
  const asking=(async()=>{
   // A meeting site the person opened gets its camera and microphone without a question from Worldlet (owner
   // request 2026-10-07: 「你不用问用户，直接请求，操作系统也会问的」); the call's own buttons turn them on and off.
   // The OS has its own switch for each device and asks the first time; a page it blocks would get silence and a
   // black picture.
   return await this.systemMedia(mediaDevices(request.media)).catch(()=>false)&&current();
  })();
  this.mediaAsking.set(view,asking);
  let allowed=false;
  try{allowed=await asking;}finally{if(this.mediaAsking.get(view)===asking)this.mediaAsking.delete(view);}
  if(allowed)this.mediaGrants.set(view,{host,media:had|request.media});
  request.answer(allowed);
 }
 /** Whether the OS lets Worldlet use the devices (media-access.ts), saying where to turn them on when
  * not; checks stand in for the OS. */
 systemMedia=async(devices:MediaDevice[])=>{
  const blocked=await blockedMediaDevices(devices);
  if(blocked.length)void explainBlockedMedia(this.surface.window(),blocked);
  return !blocked.length;
 };
 private screenRect(frame:Rectangle){return this.surface.toScreen(frame);}
 layout(rect:Row,fox?:Row,page?:Row,press=false,copy?:Row,takeCopy=false){
  // While the World is away, the page keeps its window beside the Companion; layouts only say
  // whether Fox is working.
  if(this.away){this.taskGlow(glowStyle(fox));return;}
  this.worldLayout={rect,fox,page,press,copy};
  // Fox's copy lasts while layouts carry it; taken, it becomes the visible page.
  if(takeCopy)this.takeCopy();else if(!copy)this.closeCopy();
  const browser=this.browser,frame=this.surface.toParent(rect);
  if(!browser||!frame)return;
  // Task picture in picture (#1175): the page keeps its own size and shows scaled into the rect.
  const size=this.pageSize(page);
  browser.setFrame(frame,size?{width:size.width,height:size.height}:undefined,!!size&&press===true);
  this.pointerScale=size&&size.width>0?frame.width/size.width:1;
  const style=glowStyle(fox),copied=copy?this.showCopy(copy,style):null;
  // Fox's glow, pointer and status go with Fox's copy; the person's page carries none of them.
  if(copied){this.pointerScale=copied.width/this.copy!.page.width;this.applyGlow(style,copied);}
  else this.applyGlow(style,frame);
 }
 // Fox's copy (core/browser/picture-in-picture.ts FOX_COPY) ----------------------------------------
 /** Shows Fox's copy at `request.rect`, made the first time from the visible page: its address on the
  * same engine, so the same sign-in, at `request.page` as its own size. Only the CEF engine draws a
  * page smaller than its own size; elsewhere there is no copy and Fox works on the person's page. */
 private showCopy(request:Row,style:GlowStyle|null):Rectangle|null {
  const browser=this.browser,frame=this.surface.toParent(request.rect),parent=this.surface.parent();
  if(!browser||!frame||!parent||frame.width<1||frame.height<1)return null;
  if(!this.copy){
   const size=this.pageSize(request.page),address=parse(browser.url);
   // A call page is never copied: the copy would join the call a second time.
   if(!(browser instanceof CefPageView)||browser.hidden||!size||!address||!publicPage(address)||meetingPage(address.href)){this.emit({phase:'fox-copy',event:'ended'});return null;}
   const view=this.create(address.href,'cef');
   if(!(view instanceof CefPageView)){view.close();this.emit({phase:'fox-copy',event:'ended'});return null;}
   // The person's page keeps the sound; Fox's copy plays muted.
   view.mute(true);
   const cookies=sharedEngine(this.host.profile);
   view.onLoaded=()=>{if(cookies)cookieBridge(this.scope,cookies).enginePageChanged();};
   const overlay=new PressOverlay({onPress:()=>{if(this.copy?.view===view)this.emit({phase:'fox-copy',event:'press'});},onClose:()=>{if(this.copy?.view===view)this.emit({phase:'fox-copy',event:'close'});}});
   this.copy={view,overlay,page:{width:size.width,height:size.height}};
  }
  const copy=this.copy;
  copy.view.setFrame(frame,copy.page,true);copy.view.setHidden(false);copy.view.raise();
  // The overlay lies over the copy and takes its input; its close control shows once Fox's turn has ended.
  parent.addChildView(copy.overlay.view);copy.overlay.view.setBounds(frame);
  copy.overlay.closable(!style||style.finished);
  return frame;
 }
 /** Fox's copy closes (the UI no longer lays it out, or its page went). The person's page stays. */
 private closeCopy(){
  const copy=this.copy;if(!copy)return;
  this.copy=null;this.dropGlow();
  try{this.surface.parent()?.removeChildView(copy.overlay.view);}catch{}
  copy.overlay.destroy();copy.view.driver?.stop();copy.view.driver=null;copy.view.close();
  this.emit({phase:'fox-copy',event:'ended'});
 }
 /** Fox's copy becomes the visible page, in place of the person's, which closes: the person pressed it
  * to see Fox's page, or it goes with Fox's work out of sight. Fox's steps go on there. */
 private takeCopy(){
  const copy=this.copy;if(!copy)return;
  this.copy=null;
  try{this.surface.parent()?.removeChildView(copy.overlay.view);}catch{}
  copy.overlay.destroy();
  const previous=this.browser;
  if(previous){
   this.endTranscript();this.activityGeneration+=1;this.activity.observe({active:false,close:true,endReason:'navigation'});
   this.held.delete(previous);previous.close();
  }
  const view=copy.view;
  this.browser=view;this.requestedURL=parse(view.url);this.pageIssue=null;this.videoPlaying=false;
  this.bind(view);view.mute(false);view.raise();this.status();
 }
 private pageSize(page?:Row){return page&&typeof page.width==='number'&&typeof page.height==='number'?this.surface.toParent({x:0,y:0,width:page.width,height:page.height},false):null;}
 /** The World window leaves for the desktop Companion. Fox's page, in the task window or driven by
  * Fox in the panel, stays alive to show beside the Companion (#1175); every other page stops. */
 detach(){
  const layout=this.worldLayout,fox=glowStyle(layout?.fox),working=!!fox&&!fox.finished;
  // Fox's copy goes along in place of the person's page while Fox works on it; after Fox's turn it closes.
  const copied=working&&this.copy?this.copy.page:null;
  if(copied)this.takeCopy();else this.closeCopy();
  if(layout)layout.copy=undefined;
  const view=this.browser;
  const size=!(view instanceof CefPageView)||!layout?null:copied??(layout.press&&layout.page||working?this.pageSize(layout.page)??view.frameRect():null);
  if(!size||size.width<1||size.height<1){this.stop();return;}
  this.endPictureInPicture();
  for(const page of this.parked.values())page.view.close();
  this.parked.clear();this.stopMemoryWatch();this.dropGlow();
  this.away=true;this.taskSize={width:size.width,height:size.height};this.taskFox=fox;
 }
 /** Once the Companion's window shows, Fox's page shows beside it (core/browser/picture-in-picture.ts). */
 placeTask(companion:Rectangle|null){
  const view=this.browser,size=this.taskSize;
  if(!this.away||!(view instanceof CefPageView)||!size)return;
  const area=screen.getDisplayMatching(companion??this.surface.window()?.getBounds()??screen.getPrimaryDisplay().bounds).workArea;
  const bounds=desktopTaskPictureInPicturePlacement({area,companion,aspect:taskPictureInPictureAspect(size)});
  const task=this.task??=new TaskWindow({onPress:()=>this.pressTask(),onClose:()=>this.closeTask()});
  task.place(bounds);
  view.moveTo(task.contentView,()=>task.window);
  view.setFrame({x:0,y:0,width:bounds.width,height:bounds.height},size,true);
  task.raise();task.show();
  this.pointerScale=bounds.width/size.width;
  this.taskGlow(this.taskFox);
 }
 /** Fox's glow follows the page beside the Companion; the close control shows only after Fox's turn
  * (a finished card with Fox's result is after it). */
 private taskGlow(style:GlowStyle|null){
  this.taskFox=style;
  const task=this.task;
  task?.closable(!style||!!style.finished);
  if(!style||!task?.visible){this.glow.hide();return;}
  this.glow.apply(style,task.window,task.window.getContentBounds());
 }
 /** A press beside the Companion brings the World back; the shared UI then opens the page's Applet. */
 private pressTask(){
  if(!this.away)return;
  void Promise.resolve(this.restoreWorld()).then(()=>this.emit({phase:'task-pip',event:'press'}),()=>{});
 }
 /** Close beside the Companion, once Fox's turn has ended, leaves the page, and the UI's window ends. */
 private closeTask(){
  if(!this.away||this.taskFox&&!this.taskFox.finished)return;
  this.close();this.away=false;this.taskSize=null;this.worldLayout=null;this.task?.hide();
  this.emit({phase:'task-pip',event:'closed'});
 }
 /** The World window is back: the page returns to it where it last was, and the UI places it again. */
 attach(){
  if(!this.away)return;
  this.away=false;this.taskSize=null;this.taskFox=null;
  const view=this.browser,parent=this.surface.parent();
  if(view instanceof CefPageView&&parent)view.moveTo(parent,()=>this.surface.window());
  this.task?.hide();this.dropGlow();
  const layout=this.worldLayout;
  if(layout)this.layout(layout.rect,layout.fox,layout.page,layout.press);
 }
 /** Every layout carries the current glow; absent means Fox is not driving the page. */
 private applyGlow(style:GlowStyle|null,frame:Rectangle){
  if(!style){this.glow.hide();return;}
  this.glow.apply(style,this.surface.window(),this.screenRect(frame));
 }
 /** Leaving the panel keeps this Applet's page alive when the shared rule lists it in `live`. */
 hide(live?:string[]){if(this.away){this.release(live);return;}this.park(live);}
 /** Closes the visible page and every kept page (world closed, world switched, backup restored). */
 stop(){
  this.close();this.endPictureInPicture();
  for(const page of this.parked.values())page.view.close();
  this.parked.clear();this.held.clear();this.pagesScope=null;this.pagesWindow=null;this.stopMemoryWatch();
  this.away=false;this.taskSize=null;this.taskFox=null;this.worldLayout=null;this.task?.destroy();this.task=null;
 }
 private close(){
  this.closeCopy();this.endTranscript();
  this.activityGeneration+=1;this.dropGlow();this.activity.observe({active:false,close:true});this.stopTimer();
  if(this.browser){this.held.delete(this.browser);this.browser.close();}
  this.browser=null;this.requestedURL=null;this.pageIssue=null;this.pageKey=null;this.videoPlaying=false;
 }
 // Fox's glow belongs to the visible page; a kept or closed page leaves without it.
 private dropGlow(){this.glow.hide();}
 private park(live?:string[]){
  this.closeCopy();this.endTranscript();
  const view=this.browser,key=this.pageKey;
  if(!view||!key||!live||!live.some(applet=>this.scope+':'+applet===key)){this.close();this.release(live);return;}
  this.activityGeneration+=1;this.activity.observe({active:false,close:true,endReason:'hidden'});this.stopTimer();
  this.dropGlow();view.driver?.stop();view.driver=null;view.setHidden(true);view.mute(true);this.held.delete(view);void this.holdMedia(view);
  this.parked.set(key,{view,platform:this.platform,requestedURL:this.requestedURL});this.watchMemory();
  this.browser=null;this.requestedURL=null;this.pageIssue=null;this.pageKey=null;this.videoPlaying=false;
  this.release(live);
 }
 /** browserPip: with `rect` the Applet's page is the picture-in-picture window there, entering
  * from the visible page or moving (zero size draws nothing, still playing); without, it ends. */
 pip(applet:string,rect:Row|undefined,live?:string[]){
  this.prepare();
  const key=this.scope+':'+applet;
  if(!rect){this.endPip(key,live);return;}
  if(this.pipPage?.key!==key){
   // One window: another Applet's page leaves it first.
   if(this.pipPage)this.endPip(this.pipPage.key,live);
   const view=this.browser,parent=this.surface.parent();
   // No page of that Applet to show: the UI drops its window.
   if(!view||!parent||this.pageKey!==key){this.release(live);this.emit({phase:'pip',applet,event:'ended'});return;}
   // The page leaves the panel as when kept, but stays shown, playing and audible.
   this.closeCopy();this.activity.observe({active:false,close:true});this.stopTimer();
   this.dropGlow();view.driver?.stop();view.driver=null;this.held.delete(view);view.mute(false);
   const press=this.createPress(parent,()=>this.emit({phase:'pip',applet,event:'press'}));
   this.pipPage={view,platform:this.platform,requestedURL:this.requestedURL,key,applet,press};
   this.browser=null;this.requestedURL=null;this.pageIssue=null;this.pageKey=null;this.videoPlaying=false;
   void this.pictureInPicture(view,'enter');
  }
  const page=this.pipPage,frame=this.surface.toParent(rect);
  if(page&&frame){
   page.view.setFrame(frame);page.press.setBounds(frame);
   const hidden=frame.width<1||frame.height<1;
   page.view.setHidden(hidden);page.press.setVisible(!hidden);
   // Still playing while out of sight.
   if(hidden)page.view.keepRunning();
  }
  this.release(live);
 }
 /** The window ends as the person leaving its page: kept hidden, media paused and muted, when
  * `live` lists it, otherwise closed. */
 private endPip(key:string,live?:string[]){
  const page=this.pipPage;
  if(!page||page.key!==key){this.release(live);return;}
  this.pipPage=null;this.removePress(page.press);
  if(live&&live.some(applet=>this.scope+':'+applet===key)){
   page.view.setHidden(true);page.view.mute(true);
   void this.pictureInPicture(page.view,'leave').then(()=>this.holdMedia(page.view));
   this.parked.set(key,{view:page.view,platform:page.platform,requestedURL:page.requestedURL});this.watchMemory();
  }else page.view.close();
  this.release(live);
 }
 /** Closes the window without the UI asking (world closed or reloaded) and tells the UI. */
 endPictureInPicture(){
  const page=this.pipPage;if(!page)return;
  this.pipPage=null;this.removePress(page.press);page.view.close();
  this.emit({phase:'pip',applet:page.applet,event:'ended'});
 }
 /** Closes kept pages the shared rule no longer lists; without a list nothing changes. */
 private release(live?:string[]){
  if(!live)return;
  const allowed=new Set(live.map(applet=>this.scope+':'+applet));
  for(const [key,page] of [...this.parked])if(!allowed.has(key)){this.parked.delete(key);page.view.close();}
 }
 /** Samples memory every PAGE_MEMORY.sampleMs while a page is kept (Mac: the memory-pressure event). */
 private watchMemory(){
  if(this.memoryTimer||!this.parked.size)return;
  // The probes run in the background (memory.ts); a stop while they read ends the watch.
  const timer:NodeJS.Timeout=setTimeout(()=>void refreshMemory(sharedEnginePid()).then(()=>{
   if(this.memoryTimer!==timer)return;
   this.memoryTimer=null;this.relieveMemory(this.sampleMemory());this.watchMemory();
  }),PAGE_MEMORY.sampleMs);
  this.memoryTimer=timer;
  this.memoryTimer.unref?.();
 }
 private stopMemoryWatch(){if(this.memoryTimer)clearTimeout(this.memoryTimer);this.memoryTimer=null;}
 /** Under pressure the oldest kept page closes, one per reading; the visible and the
  * picture-in-picture page never do. Diagnostics get the reason only, never the page. */
 relieveMemory(reading:MemoryReading|null){
  const reason=memoryPressure(reading);if(!reason)return null;
  const oldest=[...this.parked].find(([,page])=>page.view!==this.browser&&page.view!==this.pipPage?.view);
  if(!oldest)return null;
  const [key,page]=oldest;this.parked.delete(key);this.held.delete(page.view);page.view.close();
  this.host.diagnostics.record(new Error('Kept page released under memory pressure ('+reason+').'),'keptPageRelease');
  return reason;
 }
 /** Lies over the picture-in-picture page and reports a press, so the page itself takes no input
  * there (Mac BrowserPipPress). The shared UI decides what follows. */
 private createPress(parent:View,onPress:()=>void){
  const nonce=crypto.randomBytes(16).toString('hex');
  const view=new WebContentsView({webPreferences:{session:session.fromPartition('worldlet-overlay'),contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false}});
  view.setBackgroundColor('#00000000');
  const contents=view.webContents;
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  contents.on('will-navigate',event=>event.preventDefault());
  contents.on('console-message',details=>{if(details.message===nonce&&details.frame===contents.mainFrame)onPress();});
  const html=`<!doctype html><html><body style="margin:0;width:100vw;height:100vh;cursor:pointer;background:transparent;user-select:none"><script>let down=false;addEventListener('pointerdown',()=>{down=true});addEventListener('pointercancel',()=>{down=false});addEventListener('pointerup',e=>{const inside=e.clientX>=0&&e.clientY>=0&&e.clientX<=innerWidth&&e.clientY<=innerHeight;if(down&&inside)console.log(${JSON.stringify(nonce)});down=false});</script></body></html>`;
  void contents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)).catch(()=>{});
  parent.addChildView(view);
  return view;
 }
 private removePress(press:WebContentsView){
  try{this.surface.parent()?.removeChildView(press);}catch{}
  if(!press.webContents.isDestroyed())press.webContents.close();
 }
 // Shared page script (media-hold.js): pauses media and keeps site-started playback paused until
 // the person interacts with the page.
 private async holdMedia(view:WebPage){
  let script="for(const media of document.querySelectorAll('video,audio'))try{media.pause()}catch{}";
  try{script=this.script('browser/media-hold.js');}catch{}
  try{await view.evaluate('return '+script,{},{timeoutSeconds:2});}catch{}
 }
 // A kept or restored page returns held and muted; sound comes back once the hold is in place.
 private resumeMedia(view:WebPage){void this.holdMedia(view).then(()=>{if(this.browser===view)view.mute(false);});}
 // Shared page script (picture-in-picture.js): "probe" for a playing video, "enter" and "leave".
 private async pictureInPicture(view:WebPage,mode:string):Promise<unknown> {
  let script:string;try{script=this.script('browser/picture-in-picture.js');}catch{return null;}
  try{return await view.evaluate('return '+script+'(mode)',{mode},{timeoutSeconds:2});}catch{return null;}
 }
 /** Reports whether the visible page plays a video; the UI decides whether to offer the window. */
 private async captureVideo(){
  const view=this.browser;
  if(!view||view.hidden||view.isLoading||!this.surface.windowVisible())return;
  const playing=await this.pictureInPicture(view,'probe')===true;
  if(view!==this.browser||playing===this.videoPlaying)return;
  this.videoPlaying=playing;this.emit({phase:'video',platform:this.platform,playing});
 }
 // Video formats (core/browser/video-formats.ts) -----------------------------------------------
 private videoHosts(){
  if(this.videoHostsLoaded)return this.videoHostsLoaded;
  const hosts=new Set<string>();
  if(!this.sample&&this.store.writable)try{for(const row of this.store.ledger().records(VIDEO_BUCKET)){const host=typeof (row as Row)?.host==='string'?(row as Row).host:'';if(host)hosts.add(host);}}
  catch(error){this.host.diagnostics.record(error,'videoFormats');}
  return this.videoHostsLoaded=hosts;
 }
 private rememberVideoHost(host:string){
  const hosts=this.videoHosts();hosts.add(host);
  if(this.sample||!this.store.writable)return;
  try{
   const ledger=this.store.ledger(),rows=ledger.records(VIDEO_BUCKET) as Row[];
   for(const old of rows.sort((a,b)=>(a.at??0)-(b.at??0)).slice(0,Math.max(0,rows.length+1-VIDEO_FORMATS.maxHosts)))if(old.host!==host)ledger.delete(VIDEO_BUCKET,String(old.id));
   ledger.put(VIDEO_BUCKET,host,{id:host,host,at:Date.now()} as any);
  }catch(error){this.host.diagnostics.record(error,'videoFormats');}
 }
 /** A CEF page whose video needs H.264/AAC moves to Electron's views, which play it, at the same
  * address; its site opens there from now on (owner Order 2026-10-07: 越自动越好). Not while Fox drives it. */
 private async captureVideoFormats(){
  const view=this.browser;
  if(!(view instanceof CefPageView)||view.hidden||view.isLoading||this.away||!this.surface.windowVisible()||Date.now()<this.signingInUntil)return;
  const fox=glowStyle(this.worldLayout?.fox);if(fox&&!fox.finished)return;
  let report:unknown=null;
  try{report=await view.evaluate('return globalThis.__worldletVideoFormats?.()??null',{},{isolated:false,timeoutSeconds:2});}catch{return;}
  if(view!==this.browser||!needsProprietaryVideo(report))return;
  const host=videoFormatHost(view.url);if(!host)return;
  this.rememberVideoHost(host);
  // A move is expected behaviour, not a failure: it goes to the log, not to the error reports.
  this.host.diagnostics.log('Video needs H.264/AAC on '+host+'; the page moved to Electron views.');
  // The page's sign-in goes along: Electron's storage gets the engine's latest cookies first (cookie-bridge.ts).
  const engine=sharedEngine(this.host.profile);
  if(engine)await cookieBridge(this.scope,engine).pull();
  if(view!==this.browser)return;
  void this.move(view,view.url);
 }
 /** A page Electron's views cannot sign in on, a passkey request (passkey-watch.js; owner report 2026-10-08:
  * LinkedIn), reopens on the CEF engine at the same address, whose Chromium draws the passkey and phone dialogs.
  * Its site still opens on Electron's views later for its video, signed in alike (cookie-bridge.ts). */
 private passkeyRequested(view:WebPage){
  if(!(view instanceof PageView)||view!==this.browser||view.hidden||this.away||!sharedEngine(this.host.profile))return;
  this.host.diagnostics.log('A passkey sign-in on '+(parse(view.url)?.hostname??'a page')+'; the page moved to the website engine.');
  void this.move(view,view.url,'cef');
 }
 /** Google's sign-in, refused in Electron's views (#1089), continues on the CEF engine, which Google accepts. A page's
  * own sign-in reopens there at Google's address, so its return to the site finishes there; a sign-in popup, whose
  * opener waits for it, reopens its page there to start again. The video move back waits until the sign-in is done;
  * the cookies go along both ways (cookie-bridge.ts). */
 private googleSignIn(view:WebPage,url:string,popup:boolean){
  if(!(view instanceof PageView)||view!==this.browser||view.hidden||this.away||!sharedEngine(this.host.profile))return;
  this.host.diagnostics.log('A Google sign-in on '+(parse(view.url)?.hostname??'a page')+(popup?' (popup)':'')+'; the page moved to the website engine.');
  this.signingInUntil=Date.now()+GOOGLE_SIGN_IN_MS;
  void this.move(view,popup?view.url:url,'cef');
  if(popup)this.emit({phase:'notice',platform:this.platform,message:'Google sign-in works on this page now. Choose Sign in with Google again.'});
 }
 /** The site's localStorage, for a move that stays on its origin (core/browser/storage-carry.ts): each engine keeps its
  * own, so it goes along as the cookies do. Account sign-in pages stay uninspected; a page that does not answer quickly moves without it. */
 private async carriedStorage(view:WebPage,url:string){
  const from=parse(view.url),to=parse(url);
  if(!from||!to||from.protocol!=='https:'||from.origin!==to.origin||signInPage(from)||view.isShielded)return '';
  try{const items=carriedStorage(await view.evaluate(STORAGE_READ,{},{isolated:true,timeoutSeconds:1}));return items?.length?storageCarryScript(from.origin,items,Date.now(),crypto.randomUUID()):'';}
  catch{return '';}
 }
 /** The page in view reopens at `url` on another engine (`cef`, or as `create` chooses). */
 private async move(view:WebPage,url:string,engine?:'cef'){
  const early=await this.carriedStorage(view,url);
  if(view!==this.browser||view.isClosed)return;
  const layout=this.worldLayout;
  this.endTranscript();this.activityGeneration+=1;this.activity.observe({active:false,close:true,endReason:'navigation'});this.dropGlow();
  this.held.delete(view);view.close();
  const next=this.create(url,engine,early);
  this.browser=next;this.pageIssue=null;this.videoPlaying=false;this.bind(next);next.raise();
  if(layout)this.layout(layout.rect,layout.fox,layout.page,layout.press,layout.copy);
  next.setHidden(false);this.status();
 }
 private videoStopped(){if(!this.videoPlaying)return;this.videoPlaying=false;this.emit({phase:'video',platform:this.platform,playing:false});}
 status(){
  const current=this.browser;if(!current)return;
  if(!this.pageIssue&&googleSignInRejected(current.url))this.signInRejected();
  if(this.pageIssue){this.emit(this.pageIssue);return;}
  const url=parse(current.url);
  this.emit({phase:'page',platform:this.platform,loading:current.isLoading,url:current.url,title:current.title,host:url?.hostname??'',canBack:current.canGoBack,canForward:current.canGoForward});
 }
 private navigationFailed(code:number){
  if(code===-3)return;
  // The code and host (never the path) say which failure it was the next time someone reports one, in the
  // diagnostics and in the World's activity record an Order carries (owner report 2026-10-06).
  const url=this.browser?.url||'',host=parse(url)?.hostname??'',signIn=signInPage(url),failure='net '+code+(host?' '+host:'');
  if(this.store.writable&&!this.sample)this.activity.event({kind:'capture.error',data:{operation:'browser',status:'failed',reason:'browser-error',target:failure}});
  this.host.diagnostics.record(new Error((code===-106?'offline':code===-7?'timeout':'unavailable')+' '+failure),'browser');
  // A failed step of an account sign-in (a form page Google will not resubmit, a dropped engine)
  // is not "ask Fox to retry": the sign-in starts over, or continues in the system browser.
  if(signIn&&code!==-106){
   this.pageIssue={phase:'error',platform:this.platform,message:'This sign-in step didn’t finish loading. Start the sign-in again, or sign in in your browser.',externalSignIn:true,signIn:'google',retry:true};this.status();return;
  }
  const message=code===-106?'You’re offline. Reconnect, then retry this page.':code===-7?'This page took too long to respond. Ask Fox to retry.':'This page could not load here. Ask Fox to retry.';
  this.pageIssue={phase:'error',platform:this.platform,message,externalSignIn:true,retry:true};this.status();
 }
 /** A link the person followed went nowhere because the rules keep it out of the panel (not a public https page, or
  * too many windows open): it is recorded and said, never silent (owner report 2026-10-06, "点了不跳转"). */
 private linkRefused(refused:RefusedLink){
  const where=refused.host||refused.scheme||'this address',key=refused.kind+' '+refused.reason+' '+where;
  if(this.refusedLink?.key===key&&Date.now()-this.refusedLink.at<10_000)return;
  this.refusedLink={key,at:Date.now()};
  this.host.diagnostics.log('Browser: refused '+refused.kind+' ('+refused.reason+') to '+(refused.scheme?refused.scheme+':':'')+(refused.host?'//'+refused.host:''));
  if(this.store.writable&&!this.sample)this.activity.event({kind:'capture.error',data:{operation:'browser',status:'refused',reason:'browser-refused-'+refused.kind,target:(refused.scheme?refused.scheme+':':'')+(refused.host?'//'+refused.host:'')}});
  this.emit({phase:'refused',platform:this.platform,message:linkRefusedMessage(refused)});
 }
 // Google's refusal page stays visible; the panel explains it and offers the system browser (#1089).
 private signInRejected(){
  this.host.diagnostics.record(new Error('google-sign-in-rejected'),'browser');
  this.pageIssue={phase:'error',platform:this.platform,message:signInRejectedMessage(this.platform),externalSignIn:true,signIn:'google'};
 }
 // Generic website Applets retain their own page when Fox sends them to the system browser.
 private externalDestination(key:string){
  const home=HOMES[key];if(!home)throw new WorldletError('Unsupported browsing destination.');
  const current=parse(this.browser?.url);
  if(key==='web'&&this.platform==='web'){
   if(current&&publicPage(current)&&!SIGN_IN_HOSTS.includes(current.hostname.toLowerCase()))return current.href;
   if(this.requestedURL&&publicPage(this.requestedURL))return this.requestedURL.href;
  }
  if(key==='notion'&&key===this.platform&&current&&isNotion(current))return current.href;
  if(key==='youtube'&&key===this.platform&&current&&publicPage(current)&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(current.hostname.toLowerCase()))return current.href;
  return home;
 }
 resetHistory(){this.history=null;}
 private historyStore(){if(!this.history)this.history=new BrowserHistory(this.store.ledger());return this.history;}
 private async captureActivity(){
  const view=this.browser;
  if(this.capturingActivity||!this.store.writable||this.sample||!view)return;
  const active=this.surface.appActive()&&!view.hidden&&!view.isLoading&&!view.hasPopup&&this.surface.windowVisible();
  const url=view.url;
  if(!active||!url){this.activity.observe({active:false});return;}
  this.capturingActivity=true;
  const generation=this.activityGeneration;
  try{
   const page=await view.evaluate('return '+this.script('browser/activity-observer.js'));
   if(!page||typeof page!=='object'||generation!==this.activityGeneration||view!==this.browser||view.url!==url||view.hidden||view.isLoading||view.hasPopup||this.sample)return;
   this.activity.observe({page,active:this.surface.appActive()});
  }catch{
   if(generation!==this.activityGeneration||view!==this.browser||view.hidden||view.hasPopup||!this.store.writable||this.sample)return;
   this.activity.observe({active:false,close:true,endReason:'unavailable'});this.activity.event({kind:'capture.error',data:{reason:'browser-observation-unavailable'}});
  }finally{this.capturingActivity=false;}
 }
 private async captureHistory(){
  const view=this.browser;
  if(!this.store.writable||this.sample||!view||view.hasPopup||view.hidden||view.isLoading||!this.surface.windowVisible())return;
  const url=view.url;
  if(!url||!historyDestination(url))return;
  // Reading a page's text walks its whole document: the same page is read again only after
  // HISTORY_REREAD_MS, not on every 3 s tick (owner report 2026-10-05: browsing felt slow).
  if(this.historyRead?.view===view&&this.historyRead.url===url&&Date.now()-this.historyRead.at<HISTORY_REREAD_MS)return;
  this.historyRead={view,url,at:Date.now()};
  // Isolated JS reads text only. Never copy form values, cookies or storage.
  const script=`if(document.querySelector('input[type=password]'))return null;
const root=document.querySelector('main,[role=main],article')||document.body;
const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,parts=[],length=0,count=0;
while((node=walker.nextNode())&&length<5500&&count++<12000){
  const p=node.parentElement;if(!p||p.closest('script,style,noscript,form,input,textarea,select,[contenteditable],nav,header,footer,[hidden],[aria-hidden=true]'))continue;
  if(!p.getClientRects().length||getComputedStyle(p).visibility==='hidden')continue;
  const t=node.textContent.trim();if(t){parts.push(t);length+=t.length;}
}
const images=[...root.querySelectorAll('img[alt]')].filter(e=>e.getClientRects().length).slice(0,15).map(e=>e.alt).join(' ');
return {title:document.title,text:(parts.join(' ')+ ' '+images).slice(0,6000),url:location.href};`;
  try{
   const value=await view.evaluate(script);
   if(!value||typeof value!=='object'||this.sample||view!==this.browser||view.hidden||view.url!==url||value.url!==url)return;
   this.historyStore().record(url,typeof value.title==='string'?value.title:'',typeof value.text==='string'?value.text:'');
  }catch{this.emit({phase:'history-error',message:`This page could not be remembered on this ${process.platform==='darwin'?'Mac':'computer'}.`});}
 }
 private save(value:Row){
  const url=parse(value.url),text=value.text;
  if(!url||!isX(url)||!/^\/[^/]+\/status\/[0-9]+$/.test(url.pathname)||typeof text!=='string'||!text.trim()||Buffer.byteLength(text,'utf8')>30_000)throw new WorldletError('Open a post, or select a post\'s text first.');
  const title=[...(typeof value.title==='string'?value.title:'Saved from X')].slice(0,180).join('');
  const canonical='https://x.com'+url.pathname;
  return this.store.ingest({title,text:text+'\n\nSource: '+canonical,origin:'x-bookmark',externalId:canonical,sourceURL:canonical});
 }
 /** Waits (after `startMs`) while the page's document loads, up to LOAD_WAIT_MS. True when it is loaded and still shown.
  * The document only: iframes (ads, widgets, chat) that keep loading after it would hold every step for the whole wait. */
 private async settled(browser:WebPage,startMs=0){
  if(startMs)await new Promise(resolve=>setTimeout(resolve,startMs));
  const loadedBy=Date.now()+LOAD_WAIT_MS;
  while(browser.isLoadingMainFrame&&!browser.isClosed&&this.foxPage()===browser&&Date.now()<loadedBy)await new Promise(resolve=>setTimeout(resolve,100));
  return this.foxPage()===browser&&!browser.hidden&&!browser.isClosed&&!browser.isLoadingMainFrame;
 }
 /** `result` with the page as it stands after Fox's step, as a fresh snapshot in `page`, when that
  * page loads and Fox may read it; otherwise `result` unchanged, and Fox takes a snapshot itself. */
 private async withPageAfter(browser:WebPage,result:Row):Promise<Row> {
  if(!await this.settled(browser,PAGE_AFTER_MS))return {...result,loading:browser.isLoadingMainFrame};
  const current=parse(browser.url);
  if(!current||!publicPage(current)||SIGN_IN_HOSTS.includes(current.hostname))return result;
  try{
   const page=await browser.automation.run({operation:'snapshot'}) as Row;
   if(page.ok!==true)return result;
   return {...result,page,untrustedContent:true,guidance:'page is the page after this step, with its documentId and refs. Act on it directly; take another snapshot only after the page changes again.'};
  }catch(error){if(error instanceof Cancelled)throw error;return result;}
 }
 /** A call in Meetings: its transcript runs, or a meeting page (shown or kept) holds the microphone the person allowed
  * it. The wake word rests meanwhile ((voice/wake.ts)). */
 get inCall(){
  if(this.transcript)return true;
  return [this.browser,...[...this.parked.values()].map(page=>page.view)].some(view=>{
   if(!view||!meetingPage(view.url))return false;
   const grant=this.mediaGrants.get(view);return !!grant&&(grant.media&1)!==0&&parse(view.url)?.hostname===grant.host;
  });
 }
 // Meeting transcripts ------------------------------------------------------------------------
 /** Starts or stops transcribing the call on screen. The World turns it on when the call opens and the
  * person may stop or restart it, never Fox; it ends when they stop it or the call's page leaves the
  * panel. Text only, through local Whisper. */
 private async transcribe(args:Row):Promise<Row> {
  if(args.on!==true){this.endTranscript();return {ok:true,active:false};}
  if(this.sample||!this.store.writable)throw new WorldletError('Transcripts are kept only in your own world.');
  const speech=this.host.optional<SpeechService>(SPEECH);
  if(!speech?.localSupported)throw new WorldletError('Local speech recognition is not available on this computer.');
  const view=this.browser;
  if(!(view instanceof CefPageView)||view.hidden||!view.meetingAudioReady||!meetingPage(view.url))throw new WorldletError('Open a Google Meet, Zoom or Teams call in Meetings first.');
  if(this.transcript?.view===view)return {ok:true,active:true,session:this.transcript.session};
  this.endTranscript();
  const meeting=(typeof args.meeting==='string'?args.meeting:'').trim().slice(0,200)||view.title.slice(0,200)||'Meeting';
  const session=crypto.randomUUID();
  const state={view,session,meeting,visit:''};
  const transcriber=new MeetingTranscriber({
   transcribe:(pcm,signal)=>speech.transcribe(pcm,'multi',signal),
   save:line=>{
    const meta={speaker:line.speaker,meeting,session,start:line.start,end:line.end},body=transcriptLine(line.side,line.text);
    // Lines finished after the page closed still join the call's visit.
    const recorder=view.recorder,visit=recorder?.openVisit?.()||'';
    if(visit&&recorder?.note){state.visit=visit;recorder.note('transcript',body,meta);}
    else if(state.visit)this.recorded([],[{visit:state.visit,at:Date.now()/1000,kind:'transcript',url:view.url,meta,body}]);
   },
   // The call's visit, once a line is kept: the World asks Fox for its summary from it when the transcript ends.
   emit:value=>this.emit({phase:'transcript',session,meeting,...state.visit?{visit:state.visit}:{},...value}),
   onError:error=>this.host.diagnostics.record(error,'meetingTranscript')
  });
  this.transcript={...state,transcriber};
  if(!await view.meetingAudio(true)){
   if(this.transcript?.transcriber===transcriber)this.transcript=null;
   transcriber.cancel();
   throw new WorldletError('This call page cannot be transcribed. Reload it and try again.');
  }
  this.emit({phase:'transcript',session,meeting,active:true,lines:0,waiting:0,dropped:0});
  return {ok:true,active:true,session};
 }
 private endTranscript(){
  const current=this.transcript;if(!current)return;
  this.transcript=null;
  void current.view.meetingAudio(false);
  current.transcriber.stop();
 }

 // Saved sign-ins (core/browser/saved-logins.ts) ------------------------------------------------
 private logins=new SavedLogins(()=>this.store.ledger() as any);
 // The account typed on its own step before a password page.
 private recentUsername:{site:string;value:string;at:number}|null=null;
 private loginsKept(){return !this.sample&&this.store.writable&&this.logins.available;}
 private loginSignal(view:WebPage,value:Row){
  if(!this.loginsKept()||view.hidden)return;
  const signal=readLoginSignal(value),site=loginSite(view.url);
  // The report speaks for the page it came from: a frame or a stale document cannot name another site.
  if(!signal||!site||loginSite(signal.url)!==site)return;
  const now=Date.now();
  if(signal.kind==='username'){this.recentUsername={site,value:signal.value,at:now};return;}
  if(signal.kind==='form'){
   const accounts=loginsFor(site,this.logins.list());
   if(accounts.length)this.emit({phase:'login-fill',site,url:view.url,accounts:accounts.slice(0,5).map(login=>login.username)});
   return;
  }
  const username=loginUsername(signal,this.recentUsername,now);
  const offer=loginOffer({site,username,saved:this.logins.list(),never:this.logins.never(),samePassword:this.logins.password(site,username)===signal.password});
  if(offer==='none'){this.logins.used(site,username,now);return;}
  // Saved without asking (owner 2026-10-08); the panel only says so.
  if(this.logins.save(site,username,signal.password,now))this.emit({phase:'login-saved',site,username,update:offer==='update'});
 }
 private async loginCommand(op:string,args:Row):Promise<Row> {
  if(op==='logins')return {available:this.loginsKept(),logins:this.loginsKept()?this.logins.list().sort((a,b)=>a.site.localeCompare(b.site)||a.username.localeCompare(b.username)):[]};
  if(!this.loginsKept())throw new WorldletError('Saved passwords are unavailable here.');
  if(op==='loginDelete'){
   if(typeof args.site!=='string'||typeof args.username!=='string')throw new WorldletError('Choose a saved password.');
   this.logins.remove(args.site,args.username);return {ok:true};
  }
  if(op==='loginFill'){
   const view=this.browser,site=loginSite(view?.url),username=typeof args.username==='string'?args.username:'';
   if(!view||view.hidden||!site)throw new WorldletError('Open the sign-in page first.');
   const password=this.logins.password(site,username);
   if(password===null)throw new WorldletError('This password can no longer be opened on this computer. Delete it in Settings › Browser.');
   const result=await view.evaluate('return globalThis.__worldletLoginFill?.(username,password)??{filled:false}',{username,password},{userGesture:true,timeoutSeconds:3}).catch(()=>null) as Row|null;
   if(result?.filled!==true)throw new WorldletError('Could not find the sign-in form on this page.');
   this.logins.used(site,username);
   return {ok:true};
  }
  throw new WorldletError('Unsupported browser operation.');
 }
 async command(op:string,args:Row,agent:boolean):Promise<Row> {
  const store=this.store;
  // The person's own choices about saved passwords; Fox neither reads nor uses them.
  if(op==='logins'||op.startsWith('login')){
   if(agent)throw new WorldletError('Only the person uses saved passwords.');
   return this.loginCommand(op,args);
  }
  if(op==='transcribe'||op==='transcripts'||op==='transcript'){
   // Starting a transcript is the person's own choice; Fox reads finished ones through records.
   if(agent)throw new WorldletError('Only the person can transcribe a meeting or open its transcripts here.');
   if(op==='transcribe')return this.transcribe(args);
   if(this.sample)return op==='transcripts'?{transcripts:[]}:{lines:[]};
   if(op==='transcripts')return {transcripts:store.ledger().meetingTranscripts(20),active:this.transcript?{session:this.transcript.session,meeting:this.transcript.meeting}:null};
   if(typeof args.session!=='string'||!/^[0-9a-f-]{36}$/.test(args.session))throw new WorldletError('Choose a transcript.');
   return {lines:store.ledger().meetingTranscript(args.session)};
  }
  if(op==='automate'){
   if(!agent||!store.state.cloudConsent||this.sample)throw new WorldletError('Allow private context in your personal world before browser automation.');
   if(args.operation==='receipts')return {receipts:store.ledger().records('browser-actions').map(row=>{const value={...row};delete value.task;return value;})};
   // Fox's copy of the page when it has one (FOX_COPY): the person's own page stays theirs.
   const browser=this.foxPage();
   if(!browser||browser.hidden)throw new WorldletError('Open the Worldlet browser first.');
   this.contextRead=true;
   await this.foxDrives(browser);
   const operation=typeof args.operation==='string'?args.operation:'';
   if(operation==='open'){
    const url=parse(args.url);
    if(!url||!publicPage(url))throw new WorldletError('Choose a public HTTPS page.');
    if(browser!==this.browser)browser.load(url.href);
    else if(!(this.requestedURL?.href===url.href&&browser.isLoading)){this.platform='web';this.requestedURL=url;browser.load(url.href);}
    return this.withPageAfter(browser,{ok:true});
   }
   // Fox's next step waits for the page it just opened or clicked through to finish loading,
   // rather than spending a whole model turn on being told to try again.
   await this.settled(browser);
   if(this.foxPage()!==browser||browser.hidden||browser.isClosed)throw new WorldletError('Open the Worldlet browser first.');
   if(browser.isLoadingMainFrame)return {error:'The page is still loading. Request another snapshot shortly.'};
   const current=parse(browser.url);
   if(!current||!publicPage(current))throw new WorldletError('Open a public HTTPS page and wait for it to load before using browser automation.');
   if(SIGN_IN_HOSTS.includes(current.hostname))throw new WorldletError('Finish signing in manually before using browser automation.');
   if(operation==='back'){if(browser.canGoBack)browser.goBack();return {ok:true};}
   if(operation==='forward'){if(browser.canGoForward)browser.goForward();return {ok:true};}
   if(operation==='outcome'){
    if(typeof args.receiptId!=='string')throw new WorldletError('Choose a browser receipt first.');
    const id=args.receiptId;
    store.ledger().browserAction(id);
    const snapshot=await browser.automation.run({operation:'snapshot'}) as Row;
    const observedURL=typeof snapshot.text==='string'&&snapshot.text?(typeof snapshot.url==='string'?snapshot.url:''):'';
    const receipt={...store.ledger().observeBrowserAction(id,observedURL)};delete receipt.task;
    return {receipt,observation:snapshot,outcome:receipt.status??'unverified',guidance:'Read the current page. A click is not completion; say what the page shows. Do not repeat the original submission.'};
   }
   if(!['snapshot','prepare','click','fill','submit','scroll'].includes(operation))throw new WorldletError('Unsupported browser action.');
   let receipt:Row|null=null;
   if(operation==='click'||operation==='submit'){
    const prepared=await browser.automation.run({...args,operation:'prepare',intent:operation}) as Row;
    if(prepared.ok!==true)return prepared;
    if(operation==='submit'&&prepared.editable!==true)return {error:'Choose an editable text field to submit.'};
    const page=parse(browser.url);
    if(prepared.receipt===true&&page){
     // A fresh snapshot on the same site after an earlier step of this task is that step's
     // inspection (the Core origin check still applies), so a flow such as cancel-then-confirm
     // continues. The same control on the same page never repeats.
     if(typeof args.taskId==='string'&&typeof args.documentId==='string'){
      for(const row of store.ledger().records('browser-actions'))
       if(row.taskID===args.taskId&&row.status==='unverified'&&row.inspectedAt==null&&typeof row.id==='string'&&typeof row.attemptKey==='string'&&!row.attemptKey.startsWith(args.documentId+':'))store.ledger().observeBrowserAction(row.id,page.href);
     }
     receipt=store.ledger().beginBrowserAction(typeof prepared.label==='string'?prepared.label:'Submit',page,typeof args.taskId==='string'?args.taskId:undefined,(typeof args.documentId==='string'?args.documentId:'')+':'+String(args.ref??''));
    }
   }
   try{
    let result=await browser.automation.run(args) as Row;
    // A click or scroll without a receipt brings back the page it leads to, so Fox acts on it
    // without spending a model turn on another snapshot (receipt steps are inspected instead).
    if(!receipt&&result.ok===true&&(operation==='click'||operation==='scroll'))result=await this.withPageAfter(browser,result);
    if(receipt){
     if(typeof receipt.id==='string'){store.ledger().transitionRuntimeOperation(receipt.id,'uncertain');result.operationId=receipt.id;}
     const shown={...receipt};delete shown.task;result.receipt=shown;result.outcome='unverified';
    }
    return result;
   }catch(error){
    if(receipt){
     if(typeof receipt.id==='string')try{store.ledger().transitionRuntimeOperation(receipt.id,'uncertain');}catch{}
     const shown={...receipt};delete shown.task;
     return {error:'Submission result is unknown. Check the page before doing anything else; do not submit again.',receipt:shown,outcome:'unverified'};
    }
    throw error;
   }
  }
  // The Area panel's recommendations: hosts and visit counts only, read by the person's own World, never by Fox.
  if(op==='visitedSites'){
   if(agent)throw new WorldletError('Only the World reads visited sites.');
   return {hosts:this.sample?{}:this.historyStore().sites()};
  }
  if(op==='history'){
   if(this.sample)throw new WorldletError('Personal browsing history is unavailable in the practice world.');
   if(agent&&!store.state.cloudConsent)throw new WorldletError('Allow selected private context before Fox searches browsing history.');
   if(agent)this.contextRead=true;
   return this.historyStore().search(args);
  }
  if(op==='recordings'||op==='deleteRecordings'){
   const views=[this.browser,this.copy?.view,...[...this.parked.values()].map(kept=>kept.view),this.pipPage?.view];
   return manageRecordings(op,args,{agent,sample:this.sample,ledger:store.ledger(),recorders:views.map(view=>view?.recorder)});
  }
  if(op==='records'||op==='record'){
   if(this.sample)throw new WorldletError('Browsing recordings are unavailable in the practice world.');
   if(agent&&!store.state.cloudConsent)throw new WorldletError('Allow selected private context before Fox reads browsing recordings.');
   if(agent)this.contextRead=true;
   // What the open pages are still holding is saved first, so a read sees up to this moment.
   const recorders=[this.browser,this.copy?.view,...[...this.parked.values()].map(kept=>kept.view),this.pipPage?.view].map(view=>view?.recorder);
   for(const recorder of recorders)recorder?.flush?.();
   const onScreen=this.browser&&!this.browser.hidden?this.browser.recorder?.openVisit?.()??'':'';
   return readRecordings(op,args,{ledger:store.ledger(),onScreen,now:Date.now()/1000,offsetMinutes:-new Date().getTimezoneOffset()});
  }
  if(op==='external'){
   const target=this.externalDestination(typeof args.platform==='string'?args.platform:this.platform);
   try{await shell.openExternal(target);}catch{throw new WorldletError('Could not open your browser. Try again.');}
   return {ok:true};
  }
  // This applies even in sample mode: a live X account is never fictional data.
  if(agent&&['read','saved'].includes(op)&&!store.state.cloudConsent)throw new WorldletError('Ask Fox to allow selected context before reading your real X content. Browsing and local saving still work.');
  if(agent&&['read','saved'].includes(op))this.contextRead=true;
  if(op==='saved'){
   const query=(typeof args.query==='string'?args.query:'').toLowerCase(),items:Row[]=[];
   for(const source of store.state.sources.filter((s:Row)=>s.origin==='x-bookmark'&&s.enabled!==false).slice(-100).reverse()){
    const original=store.original(source.id);
    if(query&&!(String(original.title??'')+String(original.text??'')).toLowerCase().includes(query))continue;
    items.push({id:source.id,title:original.title,text:[...String(original.text??'')].slice(0,2200).join(''),url:source.sourceURL??''});
    if(items.length===4)break;
   }
   return {items,untrustedContent:true};
  }
  // The person turns Focus on or off; Fox saves which parts of a site Focus hides, after reading its outline.
  if(op==='focus')return agent?this.saveFocusRules(args.hide):this.setFocus(args.on===true);
  if(op==='outline'){
   if(!agent)throw new WorldletError('Unsupported browser operation.');
   if(!store.state.cloudConsent)throw new WorldletError('Allow selected private context before Fox reads this page.');
   return this.focusOutline();
  }
  const browser=this.browser;
  if(!browser||browser.hidden)throw new WorldletError('Open a browsing Applet first.');
  // A scenery tap while the person types in the page ends typing there instead of leaving the Applet
  // (owner request 2026-10-06). Same field rule as ui/shell/notion-world.ts; the page keeps its text.
  if(op==='endTyping'){
   if(agent)throw new WorldletError('Unsupported browser operation.');
   const typing=await browser.evaluate(`let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;
const typing=!!el&&(el.isContentEditable||el.matches?.(${JSON.stringify("textarea,input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image])")})===true);
if(typing)el.blur();return typing;`,{},{timeoutSeconds:2}).catch(()=>false);
   return {typing:typing===true};
  }
  if(agent)await this.foxDrives(browser);
  switch(op){
   case 'back':browser.goBack();break;
   case 'forward':browser.goForward();break;
   case 'reload':browser.reload();break;
   case 'home':browser.load(HOMES[this.platform]);break;
   case 'bookmarks':browser.load('https://x.com/i/bookmarks');break;
   case 'open':{
    const url=parse(args.url);
    // Site-locked Applets (YouTube, TikTok, Airbnb, Maps) open their own site, as browserShow does: the
    // panel's Home button opens the Applet's home page this way (owner report 2026-10-08, YouTube).
    const allowed=!!url&&(this.platform==='web'?publicPage(url):this.platform==='notion'?isNotion(url):this.platform==='x'?isX(url)&&!url.search&&!url.hash:sitePage(this.platform,url.href));
    if(!url||!allowed)throw new WorldletError('Use a valid page URL for this Applet.');
    // browserShow may already have started this exact navigation. Do not cancel and restart it
    // when the opening tool command follows.
    if(this.requestedURL?.href!==url.href||(!browser.isLoading&&!sameURL(browser.url,url.href))){this.requestedURL=url;browser.load(url.href);}
    break;
   }
   case 'scroll':{
    if(!['up','down'].includes(args.direction))throw new WorldletError('Choose up or down.');
    // Local viewport control does not read or return website content.
    return await browser.automation.run({operation:'scroll',direction:args.direction});
   }
   case 'read':case 'save':{
    const url=parse(browser.url);
    if(!url||!isX(url)||url.pathname.includes('/flow/'))throw new WorldletError('Finish signing in to X first.');
    const result=await browser.evaluate('return window.worldletXReader?.read() || {}');
    const page=result&&typeof result==='object'?result:{};
    if(op==='read')return {page,untrustedContent:true};
    const selected=page.selected;
    if(!selected||typeof selected!=='object')throw new WorldletError('Open one post or select its text, then save it to Fox.');
    const fresh=this.save(selected);
    this.emit({phase:'saved',fresh,title:typeof selected.title==='string'?selected.title:'Saved from X',url:typeof selected.url==='string'?selected.url:''});
    return {ok:true,savedLocally:true,fresh};
   }
   default:throw new WorldletError('Unsupported browser operation.');
  }
  return {ok:true};
 }
}
