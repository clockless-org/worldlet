import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {app,dialog,screen,type BaseWindow,type Rectangle,type View,type WebContents} from 'electron';
import {WorldletError} from '../../../files.ts';
import {PROPRIETARY_VIDEO,TASK_PICTURE_IN_PICTURE,pageFrameRate} from '../../../../../../core/browser/index.ts';
import {Cancelled,DEMO_HOST,DEMO_PAGES,type AgentLink,type PermissionRequest} from '../page.ts';
import {publicPage,signInPage} from '../rules.ts';
import {downloadPath} from '../download-path.ts';
import {SurfaceView} from './surface.ts';
import type {EngineMessage,WebEngine} from './process.ts';
import type {Row} from '../../../host/types.ts';
import type {WebRecordLink} from '../web-page.ts';

// The agent's DevTools ids are remapped above the panel's own.
const AGENT_IDS=1_000_000_000;
// `ready` settles once the engine has made the page (or it is gone); until then the engine drops what is sent to it.
interface Entry {id:number;url:string;title:string;loading:boolean;documentLoaded:boolean;back:boolean;forward:boolean;shielded:boolean;created:boolean;ready:Promise<void>;settle:()=>void;pending:string|null}
export interface CefPageOptions {
 engine:WebEngine;parent:View;window:()=>BaseWindow|null;scope:'personal'|'practice';
 webRoot:string;demo:boolean;url:string;preload:string;onDownload:(message:string)=>void;
 /** A Meetings page: the call-audio hooks (meeting-audio.js) are in place before its first document. */
 meeting?:boolean;
 /** A Browser tab's page: a link for a new tab opens the Browser's next tab (`onOpenTab`), not a popup. */
 tabs?:boolean;
 /** Settles when the page may open: the engine has the World's cookies from Electron's storage (cookie-bridge.ts). */
 before?:Promise<unknown>;
 /** A document script the first document gets before its own, once (the storage a moved page carries, core/browser/storage-carry.ts). */
 early?:string;
}
/** The refresh rate (Hz) of the display a page shows on, for its full frame rate (pageFrameRate).
 * Linux draws software frames, which stay at the base rate. */
export function displayRefresh(rect:Rectangle):number|undefined {
 if(process.platform==='linux')return undefined;
 const hz=screen.getDisplayMatching(rect).displayFrequency;
 return hz>0?hz:undefined;
}
/** A shown page that has drawn nothing for `ms` has a stalled engine (owner Order 2026-10-07: every website stayed
 * white after an update on a computer short of memory): the engine restarts and the page loads again, at most once
 * per `restartMs`; a page still blank after that says it could not load instead of staying white. */
export const ENGINE_STALL=Object.freeze({ms:12_000,restartMs:120_000});
// Engine page ids → the panel page that owns them, for the engine's questions.
const owners=new Map<number,CefPageView>();
let questionsHooked=false;

/** One website page on the CEF engine, with the same contract as the Electron PageView (page.ts):
 * popups stack over their opener in the same panel, DevTools reaches only the visible one, and the
 * isolated observer world talks back through Runtime bindings. The page runs in the engine; this
 * view places it, forwards input and answers the engine's questions. */
export class CefPageView {
 private stack:Entry[]=[];
 private engine:WebEngine;
 private surface:SurfaceView;
 private parent:View;
 private window:()=>BaseWindow|null;
 private scope:'personal'|'practice';
 private tabs=false;
 private before:Promise<unknown>|null=null;
 private early='';
 private webRoot:string;
 private demo:boolean;
 private preload:string;
 private onDownload:(message:string)=>void;
 private frame:Rectangle={x:0,y:0,width:0,height:0};
 // The page's own size when it shows scaled into `frame` (task picture in picture, #1175).
 private pageSize:{width:number,height:number}|null=null;
 private pressOnly=false;
 // Frames per second the pages render at, by where they show (pageFrameRate).
 private fps:number=TASK_PICTURE_IN_PICTURE.fps.panel;
 /** Whether the surface has the focus (and so the visible page should). */
 private focused=false;
 private hiddenView=true;
 private muted=false;
 private fullscreen=false;
 private closed=false;
 private dead=false;
 private nextCDP=1;
 private pending=new Map<number,{resolve:(value:Row)=>void,reject:(error:Error)=>void,timer:NodeJS.Timeout}>();
 private agentReplies=new Map<number,number>();
 private isolatedContext:number|null=null;
 private contextTask:Promise<number>|null=null;
 private demoEnabled=false;
 private demoInstalling=false;
 private lastGesture=0;
 private agentEnabled=false;
 private downloads=new Map<number,boolean>();
 // Meetings pages: the random binding the call-audio hooks talk through, and whether they are installed.
 private meetingBinding:string|null=null;
 private meetingReady=false;
 private meetingInstalling=false;
 // Scripts every document of the page gets before its own (video-formats.js): installed once per
 // engine page, before its first load; the address waiting for them; the blank start Back must not reach.
 private documentReady=false;
 private documentInstalling=false;
 private documentURL:string|null=null;
 private videoWatch=false;
 private blankStart=false;
 // Stall watch (ENGINE_STALL): when the page last came into view, the address it was last asked to load,
 // the address to reopen once a restarted engine is up, and whether a page still blank was reported.
 private shownAt=0;
 private wanted:string|null=null;
 private recovering:string|null=null;
 private stallReported=false;
 driver:AgentLink|null=null;
 /** Keeps what happens on the page (recorder.ts), when the World records this page. */
 recorder:WebRecordLink|null=null;
 makeDriver:((view:CefPageView)=>AgentLink)|null=null;
 onNavigation=()=>{};
 onChange=()=>{};
 onLoaded=()=>{};
 onError=(_code:number)=>{};
 onActivityEnd=(_reason:string)=>{};
 onPopupChange=(_active:boolean)=>{};
 onActivity=(_page:Row)=>{};
 onBookmark=(_value:Row)=>{};
 /** What the sign-in watch reported (login-watch.js): a sign-in form, an account typed, or a sign-in. */
 onLogin=(_value:Row)=>{};
 onPermission=(request:PermissionRequest)=>request.answer(false);
 /** A link the person followed that the rules kept from opening (`kind` navigation or popup, `reason` address or
  * popups, `scheme` and `host` of where it led). */
 onRefused=(_refused:{kind:string,reason:string,scheme:string,host:string})=>{};
 /** A link the person opened for a new tab, in a Browser tab's page (rules.ts opensAsTab). */
 onOpenTab=(_url:string,_background:boolean)=>{};
 onPress=()=>{};
 /** One second or so of one side of a call, while transcription runs (meeting-audio.js). */
 onMeetingAudio=(_value:Row)=>{};
 constructor(options:CefPageOptions){
  this.engine=options.engine;this.parent=options.parent;this.window=options.window;this.scope=options.scope;
  this.webRoot=options.webRoot;this.demo=options.demo;this.preload=options.preload;this.onDownload=options.onDownload;
  this.tabs=!!options.tabs;this.before=options.before??null;this.early=options.early??'';
  if(options.meeting)this.meetingBinding='worldletMeeting'+crypto.randomUUID().replace(/-/g,'');
  if(!questionsHooked){questionsHooked=true;this.engine.onQuestion(message=>owners.get(message.id)?.question(message));}
  this.surface=new SurfaceView(this.engine,this.preload);
  this.surface.onInput=message=>this.input(message);
  // Frames that arrived before the view was ready were not drawn, and a still page sends no more (#1233).
  this.surface.onReady=()=>{if(!this.closed){this.place();this.applyVisibility();}};
  this.surface.view.setBorderRadius(12);
  this.parent.addChildView(this.surface.view);
  this.applyVisibility();
  this.openRoot(options.url);
 }
 get automation():AgentLink {if(!this.driver){if(!this.makeDriver)throw new WorldletError('The browser driver is missing. Rebuild or reinstall Worldlet.');this.driver=this.makeDriver(this);}return this.driver;}
 private get top():Entry|undefined {return this.stack[this.stack.length-1];}
 get url(){return this.top?.url??'';}
 get title(){return this.top?.title??'';}
 get isLoading(){return this.top?.loading??false;}
 /** Only the top document is loading. CEF's loading state counts every frame, so an ad or widget iframe
  * that keeps loading after the document finished would hold it true; `loaded` and `failed` here are the main frame's. */
 get isLoadingMainFrame(){const top=this.top;return !!top&&top.loading&&!top.documentLoaded;}
 get canGoBack(){return !!this.top?.back||this.stack.length>1;}
 get canGoForward(){return !!this.top?.forward;}
 get hasPopup(){return this.stack.length>1;}
 get hidden(){return this.hiddenView;}
 get isClosed(){return this.closed;}
 /** The visible document is an account sign-in page that the panel leaves uninspected. */
 get isShielded(){return !!this.top?.shielded;}
 frameRect(){return {...this.frame};}
 /** The view that draws the page in the window, for a picture of what the person sees (Order). */
 get pictureContents():WebContents|null {const contents=this.surface.contents;return this.closed||contents.isDestroyed()?null:contents;}
 /** The surface showing the page is attached to the window and shown. */
 isPresented(){const view=this.surface.view;return !this.closed&&!this.dead&&!view.webContents.isDestroyed()&&this.parent.children.includes(view)&&view.getVisible();}

 // Engine pages ---------------------------------------------------------------------------------
 private track(id:number,url:string){
  let settle=()=>{};const ready=new Promise<void>(resolve=>{settle=resolve;});
  const entry:Entry={id,url,title:'',loading:true,documentLoaded:false,back:false,forward:false,shielded:signInPage(url),created:false,ready,settle,pending:null};
  this.stack.push(entry);owners.set(id,this);
  this.engine.listen(id,message=>this.handle(entry,message));
  return entry;
 }
 /** The first page; a dead engine's page reopens here on the next load. */
 private openRoot(url:string){
  this.dead=false;this.demoEnabled=false;this.documentReady=false;this.videoWatch=false;this.shownAt=Date.now();
  let parsed:URL|null=null;try{parsed=new URL(url);}catch{}
  // Every page starts blank and loads once its document scripts (and a meeting page's hooks, the
  // rehearsal site's answers) are installed (load()), so they see the first document too.
  const deferred=!!parsed&&publicPage(parsed);
  const start='about:blank';this.blankStart=deferred;
  const entry=this.track(this.engine.allocate(),start);
  this.engine.start().then(()=>this.before).then(()=>{
   if(this.closed||!this.stack.includes(entry))return;
   this.engine.send({t:'create',id:entry.id,scope:this.scope,url:start,hidden:this.hiddenView,tabs:this.tabs,...this.geometry()});
   if(deferred)this.load(parsed!.href);
  },()=>{entry.settle();if(!this.closed&&this.top===entry){this.dead=true;this.onActivityEnd('unavailable');this.onError(-2);}});
 }
 private handle(entry:Entry,message:EngineMessage){
  if(this.closed)return;
  const active=entry===this.top;
  switch(message.t){
   case 'created':
    entry.created=true;this.enableRecording(entry);if(this.muted)this.engine.send({t:'mute',id:entry.id,muted:true});
    if(this.fps!==TASK_PICTURE_IN_PICTURE.fps.panel)this.engine.send({t:'fps',id:entry.id,fps:this.fps});
    // What was sent while the engine was still making the page was dropped: its place, whether it
    // shows, and the address it waits to load (owner Order 2026-10-07: LinkedIn stayed white after
    // a slow start under memory pressure).
    if(active){this.shownAt=Date.now();this.place();this.applyVisibility();}
    if(entry.pending){const url=entry.pending;entry.pending=null;this.engine.send({t:'load',id:entry.id,url});}
    entry.settle();
    if(active&&this.focused)this.refocus();
    break;
   case 'navigate':entry.documentLoaded=false;if(signInPage(message.url))entry.shielded=true;break;
   case 'shield':entry.shielded=!!message.on;break;
   case 'tab':if(active&&typeof message.url==='string')this.onOpenTab(message.url,message.background===true);break;
   case 'refused':if(active)this.onRefused({kind:String(message.kind??''),reason:String(message.reason??''),scheme:String(message.scheme??''),host:String(message.host??'')});break;
   case 'address':
    entry.url=String(message.url??'');entry.shielded=signInPage(entry.url);
    if(active){this.driver?.invalidate();this.failPending();this.onActivityEnd('navigation');this.onNavigation();this.onChange();}
    break;
   case 'loading':entry.loading=!!message.loading;entry.back=!!message.back;entry.forward=!!message.forward;if(active)this.onChange();break;
   case 'title':entry.title=String(message.title??'');if(active)this.onChange();break;
   case 'loaded':
    entry.documentLoaded=true;
    if(!active)break;
    if(this.blankStart&&entry===this.stack[0]&&entry.url!=='about:blank'){this.blankStart=false;void this.forgetBlank(entry);}
    this.isolatedContext=null;this.contextTask=null;this.onChange();this.onLoaded();
    void this.context().catch(()=>{});
    break;
   case 'failed':
    // An aborted load (-3) is usually replaced by the next navigation, which is still loading.
    if(message.main&&message.code!==-3)entry.documentLoaded=true;
    if(!message.main||message.code===-3||!active||this.demoInstalling)break;
    this.failPending();this.onActivityEnd('unavailable');this.onError(message.code);
    break;
   case 'gone':
    // status -1: the engine itself stopped; the next load starts a new one.
    if(message.status===-1)this.dead=true;
    entry.settle();
    // The engine was restarted because it stopped drawing: the page reopens instead of reporting a failure.
    if(message.status===-1&&this.recovering){
     if(entry===this.stack[0]){this.failPending();setTimeout(()=>{const url=this.recovering;this.recovering=null;if(url)this.load(url);},0);}
     break;
    }
    if(active){this.failPending();this.onActivityEnd('unavailable');this.onError(-2);}
    break;
   case 'fullscreen':if(active){this.fullscreen=!!message.on;this.place();}break;
   case 'popup':{
    const before=this.hasPopup;
    this.track(message.id,String(message.url??''));
    this.surface.send({t:'clear'});this.shownAt=Date.now();this.applyVisibility();
    if(!before)this.popupChanged(true);
    break;
   }
   case 'closed':this.removed(entry);break;
   case 'frame':if(active&&!this.hiddenView)this.surface.present(entry.id,message);else this.surface.skip(entry.id,message);break;
   case 'widget':case 'cursor':case 'tooltip':case 'ime':if(active)this.surface.send(message);break;
   case 'download':this.download(message);break;
   case 'devtools':this.devtools(entry,message.m);break;
  }
 }
 /** A popup closed itself (window.close) or was closed by Back without history. */
 private removed(entry:Entry){
  const index=this.stack.indexOf(entry);if(index<0)return;
  const wasTop=index===this.stack.length-1;
  this.stack.splice(index,1);owners.delete(entry.id);this.engine.unlisten(entry.id);entry.settle();
  if(this.closed)return;
  if(index>0&&this.stack.length===1)this.popupChanged(false);
  if(wasTop&&this.top){
   this.surface.send({t:'clear'});this.shownAt=Date.now();this.applyVisibility();this.refocus();
   this.driver?.invalidate();this.failPending();this.onActivityEnd('closed');this.onNavigation();this.onChange();
  }
 }
 private popupChanged(active:boolean){this.driver?.stop();this.driver=null;this.failPending();this.onPopupChange(active);}

 // Placement ------------------------------------------------------------------------------------
 private geometry(){
  const window=this.window(),content=window&&!window.isDestroyed()?window.getContentBounds():null;
  const parent=this.parent.getBounds();
  const rect=this.fullscreen?{x:0,y:0,width:parent.width,height:parent.height}:this.frame;
  const view={x:(content?.x??0)+rect.x,y:(content?.y??0)+rect.y,width:Math.max(1,rect.width),height:Math.max(1,rect.height)};
  // A scaled page keeps its own size; the surface shows it smaller.
  const page=!this.fullscreen&&this.pageSize?this.pageSize:{width:view.width,height:view.height};
  const display=screen.getDisplayMatching(view);
  const box=(r:Rectangle)=>[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];
  return {w:Math.max(1,Math.round(page.width)),h:Math.max(1,Math.round(page.height)),scale:display.scaleFactor||1,view:box(view),window:box(window&&!window.isDestroyed()?window.getBounds():view),screen:box(display.bounds),available:box(display.workArea)};
 }
 private place(){
  const parent=this.parent.getBounds();
  const rect=this.fullscreen?{x:0,y:0,width:parent.width,height:parent.height}:this.frame;
  this.surface.view.setBounds(rect);
  const geometry=this.geometry();
  this.surface.send({t:'page',w:geometry.w,h:geometry.h});
  this.surface.send({t:'mode',press:this.pressOnly&&!this.fullscreen});
  for(const entry of this.stack)this.engine.send({t:'resize',id:entry.id,...geometry});
  const fps=pageFrameRate({width:rect.width,height:rect.height,scaled:!this.fullscreen&&!!this.pageSize,refresh:displayRefresh(this.surface.view.getBounds())});
  if(fps!==this.fps){this.fps=fps;for(const entry of this.stack)if(entry.created)this.engine.send({t:'fps',id:entry.id,fps});}
 }
 private applyVisibility(){
  this.surface.view.setVisible(!this.hiddenView);
  const top=this.top;
  for(const entry of this.stack)this.engine.send({t:'show',id:entry.id,hidden:this.hiddenView||entry!==top});
  if(top&&!this.hiddenView)this.engine.send({t:'repaint',id:top.id,k:0});
 }
 /** Where the page shows. With `page` it keeps that size and shows scaled into `rect`; `press` makes
  * it take no input there and report a press instead (task picture in picture, #1175). */
 setFrame(rect:Rectangle,page?:{width:number,height:number},press=false){
  this.frame={x:Math.round(rect.x),y:Math.round(rect.y),width:Math.max(0,Math.round(rect.width)),height:Math.max(0,Math.round(rect.height))};
  this.pageSize=page&&page.width>0&&page.height>0?{width:page.width,height:page.height}:null;
  this.pressOnly=!!this.pageSize&&press;
  this.place();
 }
 setHidden(hidden:boolean){
  const showing=this.hiddenView&&!hidden;
  if(showing)this.shownAt=Date.now();
  this.hiddenView=hidden;this.applyVisibility();
  // A kept page whose engine stopped while it was out of sight opens again as it comes back.
  const address=this.address();if(showing&&this.dead&&address)this.load(address);
 }
 /** Called while the page is the visible one (device.ts, every few seconds): an engine that has drawn nothing
  * since the page came into view is restarted and the page reopens (ENGINE_STALL); 'restarted', 'failed'
  * (still blank after a recent restart, reported once) or null. */
 checkStall(now=Date.now()):'restarted'|'failed'|null {
  if(this.closed||this.dead||this.hiddenView||this.recovering||this.frame.width<1||this.frame.height<1||!this.shownAt||now-this.shownAt<ENGINE_STALL.ms||this.surface.lastDrawn>=this.shownAt)return null;
  const url=this.address();if(!url)return null;
  if(now-this.engine.restartedAt>=ENGINE_STALL.restartMs){
   this.recovering=url;
   if(this.engine.restart())return 'restarted';
   this.recovering=null;
  }
  if(this.stallReported)return null;
  this.stallReported=true;this.onActivityEnd('unavailable');this.onError(-2);
  return 'failed';
 }
 /** Where the page is, or where it was last asked to go while still blank: what it reopens at. */
 private address(){return this.url&&this.url!=='about:blank'?this.url:this.wanted;}
 /** A page out of sight keeps playing in the engine; nothing more is needed. */
 keepRunning(){}
 /** Raises the page above other views in the panel. */
 raise(){this.parent.addChildView(this.surface.view);}
 /** Shows the page in another window's view, as it is: the task window beside the desktop Companion
  * while the World window is away, and back (#1175). The page itself goes on unchanged. */
 moveTo(parent:View,window:()=>BaseWindow|null){
  if(parent===this.parent||this.closed)return;
  try{this.parent.removeChildView(this.surface.view);}catch{}
  this.parent=parent;this.window=window;
  parent.addChildView(this.surface.view);
  this.place();this.applyVisibility();
 }
 mute(muted:boolean){this.muted=muted;for(const entry of this.stack)this.engine.send({t:'mute',id:entry.id,muted});}
 markGesture(){this.lastGesture=Date.now();}
 /** The person's input on the surface, for the visible page. */
 private input(message:EngineMessage){
  const top=this.top;if(!top||this.closed)return;
  if(message.t==='press'){if(this.pressOnly)this.onPress();return;}
  if(this.pressOnly)return;
  if((message.t==='mouse'&&message.e==='down')||(message.t==='key'&&message.e==='down'))this.lastGesture=Date.now();
  if(message.t==='focus')this.focused=!!message.focus;
  if(['mouse','key','ime','edit','focus'].includes(message.t))this.engine.send({...message,id:top.id});
 }
 /** Focus follows the visible page: a popup that opens over its opener, or the opener it closes back to,
  * gets the surface's focus, or it takes keys without a caret. */
 private refocus(){
  const top=this.top;if(this.closed)return;
  for(const entry of this.stack)if(entry.created)this.engine.send({t:'focus',id:entry.id,focus:entry===top&&this.focused});
 }

 load(url:string){
  let parsed:URL|null=null;try{parsed=new URL(url);}catch{}
  if(!parsed||!publicPage(parsed)||this.closed)return;
  this.wanted=parsed.href;this.stallReported=false;
  if(this.dead){for(const entry of [...this.stack]){owners.delete(entry.id);this.engine.unlisten(entry.id);entry.settle();}this.stack=[];this.openRoot(parsed.href);return;}
  const top=this.top;if(!top)return;
  if(!this.documentReady){
   this.documentURL=parsed.href;
   if(this.documentInstalling)return;
   this.documentInstalling=true;
   void (async()=>{
    // The engine answers DevTools only once it has made the page, which can take many seconds on a
    // busy computer; the attempts start then. A just-created page may not accept DevTools yet.
    // Without the scripts the page still opens; only its video formats go unnoticed.
    await top.ready;
    for(let attempt=0;attempt<50&&!this.closed;attempt++){
     try{await this.installDocumentScripts();break;}
     catch{await new Promise(resolve=>setTimeout(resolve,100));}
    }
    this.documentInstalling=false;this.documentReady=true;
    const next=this.documentURL;this.documentURL=null;
    if(!this.closed&&next)this.load(next);
   })();
   return;
  }
  if(this.meetingBinding&&!this.meetingReady){
   if(this.meetingInstalling)return;
   this.meetingInstalling=true;
   void (async()=>{
    // As with the demo site: a just-created page may not accept DevTools yet. Without the hooks the
    // page still opens; only transcription is unavailable on it.
    await top.ready;
    for(let attempt=0;attempt<50&&!this.closed&&!this.meetingReady;attempt++){
     try{await this.installMeetingAudio();this.meetingReady=true;}
     catch{await new Promise(resolve=>setTimeout(resolve,100));}
    }
    this.meetingInstalling=false;
    if(!this.closed&&this.top)this.navigate(this.top,parsed!.href);
   })();
   return;
  }
  if(this.demo&&parsed.hostname.toLowerCase()===DEMO_HOST&&!this.demoEnabled){
   this.demoInstalling=true;
   void (async()=>{
    // A just-created page may not accept DevTools yet; never navigate uninstalled.
    await top.ready;
    for(let attempt=0;attempt<50&&!this.closed;attempt++){
     try{await this.cdp('Fetch.enable',{patterns:[{urlPattern:`https://${DEMO_HOST}/*`,requestStage:'Request'}]},2);this.demoEnabled=true;this.demoInstalling=false;if(this.top)this.navigate(this.top,parsed!.href);return;}
     catch{await new Promise(resolve=>setTimeout(resolve,100));}
    }
    this.demoInstalling=false;if(!this.closed)this.onError(-105);
   })();
   return;
  }
  this.navigate(top,parsed.href);
 }
 /** Loads `url` in the page, or once the engine has made it (it drops a load sent before). */
 private navigate(entry:Entry,url:string){
  entry.documentLoaded=false;
  if(entry.created)this.engine.send({t:'load',id:entry.id,url});else entry.pending=url;
 }
 goBack(){
  const top=this.top;if(!top)return;
  if(top.back){this.engine.send({t:'nav',id:top.id,op:'back'});return;}
  if(this.stack.length>1){this.removed(top);this.engine.send({t:'close',id:top.id});}
 }
 goForward(){const top=this.top;if(top)this.engine.send({t:'nav',id:top.id,op:'forward'});}
 reload(){
  if(this.dead){this.load(this.url||'about:blank');return;}
  const top=this.top;if(top)this.engine.send({t:'nav',id:top.id,op:'reload'});
 }
 stopLoading(){const top=this.top;if(top)this.engine.send({t:'nav',id:top.id,op:'stop'});}
 close(){
  if(this.closed)return;
  this.driver?.stop();this.driver=null;this.closed=true;this.failPending();
  for(const entry of [...this.stack].reverse()){owners.delete(entry.id);this.engine.send({t:'close',id:entry.id});this.engine.unlisten(entry.id);entry.settle();}
  this.stack=[];
  this.surface.destroy(this.parent);
 }

 // The engine's questions ------------------------------------------------------------------------
 private answer(q:number,body:Row={}){this.engine.send({t:'answer',q,...body});}
 private question(message:EngineMessage){
  const q=message.q,details=(message.d??{}) as Row,window=this.window();
  const owner=window&&!window.isDestroyed()?window:null;
  if(this.closed){this.answer(q);return;}
  switch(message.kind){
   case 'media':case 'location':{
    let done=false;
    this.onPermission({kind:message.kind==='media'?'media':'location',origin:String(details.origin??''),media:(details.audio?1:0)|(details.video?2:0),
     answer:allow=>{if(done)return;done=true;this.answer(q,{allow:allow&&!this.closed});}});
    return;
   }
   case 'dialog':{
    if(details.type==='prompt'){this.answer(q,{ok:false});return;}
    let host='';try{host=new URL(String(details.origin??'')).hostname;}catch{}
    const buttons=details.type==='confirm'?['OK','Cancel']:['OK'];
    const options={type:'none' as const,title:host,message:host||'This page says',detail:String(details.message??'').slice(0,4000),buttons,defaultId:0,cancelId:buttons.length-1};
    void (owner?dialog.showMessageBox(owner,options):dialog.showMessageBox(options)).then(result=>this.answer(q,{ok:result.response===0}),()=>this.answer(q,{ok:false}));
    return;
   }
   case 'file':{
    const mode=String(details.mode??'open');
    if(mode==='save'){
     const options={defaultPath:String(details.path??'')||undefined};
     void (owner?dialog.showSaveDialog(owner,options):dialog.showSaveDialog(options)).then(result=>this.answer(q,{paths:result.canceled||!result.filePath?[]:[result.filePath]}),()=>this.answer(q,{paths:[]}));
     return;
    }
    const properties:('openFile'|'multiSelections'|'openDirectory')[]=mode==='folder'?['openDirectory']:mode==='multiple'?['openFile','multiSelections']:['openFile'];
    void (owner?dialog.showOpenDialog(owner,{properties}):dialog.showOpenDialog({properties})).then(result=>this.answer(q,{paths:result.canceled?[]:result.filePaths}),()=>this.answer(q,{paths:[]}));
    return;
   }
   case 'download':{
    // Saved straight into Downloads, with no save dialog (download-path.ts).
    this.downloads.set(Number(details.download),false);
    this.answer(q,{path:downloadPath(app.getPath('downloads'),String(details.name??''))});
    return;
   }
   default:this.answer(q);
  }
 }
 private download(message:EngineMessage){
  const id=Number(message.download);if(!this.downloads.has(id))return;
  const file=path.basename(String(message.path??''));
  if(message.state==='progressing'){if(!this.downloads.get(id)&&file){this.downloads.set(id,true);this.onDownload('Downloading '+file+'…');}return;}
  this.downloads.delete(id);
  this.onDownload(message.state==='completed'?'Saved '+file:'Download interrupted: '+message.state+'. Try the download again.');
 }

 // DevTools IO ----------------------------------------------------------------------------------
 failPending(){
  this.isolatedContext=null;this.contextTask=null;
  const waiting=[...this.pending.values()];this.pending.clear();
  for(const call of waiting){clearTimeout(call.timer);call.reject(new Cancelled());}
 }
 /** One DevTools command to the visible page, cancelled when that page navigates or closes. */
 cdp(method:string,params:Row={},timeoutSeconds=15):Promise<Row> {
  const top=this.top;
  if(this.closed||!top||!top.created||top.shielded)return Promise.reject(new Cancelled());
  const id=this.nextCDP++;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new WorldletError('The browser operation timed out. Inspect the page before retrying.'));},timeoutSeconds*1000);
   this.pending.set(id,{resolve,reject,timer});
   this.engine.send({t:'devtools',id:top.id,m:JSON.stringify({id,method,params})});
  });
 }
 private devtools(entry:Entry,raw:unknown){
  let message:Row;try{message=JSON.parse(String(raw));}catch{return;}
  if(typeof message.id==='number'){
   if(message.id<0)return;
   if(message.id>=AGENT_IDS){
    const id=this.agentReplies.get(message.id);this.agentReplies.delete(message.id);
    if(id!==undefined&&entry===this.top)this.driver?.receiveCDP(message.error?{id,error:{code:-32000,message:String(message.error.message??'The visible page is unavailable.')}}:{id,result:message.result??{}});
    return;
   }
   const call=this.pending.get(message.id);if(!call)return;
   this.pending.delete(message.id);clearTimeout(call.timer);
   if(message.error)call.reject(new WorldletError('The page changed. Inspect it again before continuing.'));else call.resolve(message.result??{});
   return;
  }
  const method=String(message.method??''),params=(message.params??{}) as Row;
  if(entry!==this.top||this.closed)return;
  if(this.agentEnabled&&!message.sessionId)this.driver?.receiveCDP({method,params});
  if(method==='Runtime.bindingCalled'&&this.meetingBinding&&params.name===this.meetingBinding){
   // The page's main world (meeting-audio.js); only the host knows the binding's name.
   let value:unknown;try{value=JSON.parse(params.payload);}catch{return;}
   if(value&&typeof value==='object'&&!Array.isArray(value))this.onMeetingAudio(value as Row);
   return;
  }
  if(method==='Runtime.bindingCalled'){
   if(params.executionContextId!==this.isolatedContext||!['worldletBookmark','worldletActivity','worldletRecord','worldletLogin'].includes(params.name))return;
   let value:unknown;try{value=JSON.parse(params.payload);}catch{return;}
   if(!value||typeof value!=='object'||Array.isArray(value))return;
   if(params.name==='worldletActivity')this.onActivity(value as Row);else if(params.name==='worldletLogin')this.onLogin(value as Row);else if(params.name==='worldletRecord')this.recorder?.observed(value as Row);else this.onBookmark(value as Row);
  }else if(method.startsWith('Network.'))this.recorder?.event(method,params);
  else if(method==='Fetch.requestPaused'&&this.demoEnabled)void this.fulfillDemo(params);
 }
 private async fulfillDemo(params:Row){
  const page=this.demoPage(params.request?.url);
  const html=(body:string,type:string)=>({requestId:params.requestId,responseCode:page?200:404,responseHeaders:[{name:'Content-Type',value:type},...page?[{name:'Cache-Control',value:'no-store'}]:[]],body});
  try{await this.cdp('Fetch.fulfillRequest',page?html(page,'text/html; charset=utf-8'):html(Buffer.from('Not found').toString('base64'),'text/plain'));}catch{}
 }
 private demoPage(raw:unknown){
  let url:URL;try{url=new URL(String(raw));}catch{return null;}
  if(url.protocol!=='https:'||url.hostname.toLowerCase()!==DEMO_HOST)return null;
  const key=url.pathname.length>1&&url.pathname.endsWith('/')?url.pathname.slice(0,-1):url.pathname;
  const name=DEMO_PAGES[key];if(!name)return null;
  try{return fs.readFileSync(path.join(this.webRoot,'demo',name)).toString('base64');}catch{return null;}
 }
 private context():Promise<number> {
  if(this.isolatedContext!==null)return Promise.resolve(this.isolatedContext);
  if(this.contextTask)return this.contextTask;
  const task=(async()=>{
   const tree=await this.cdp('Page.getFrameTree');
   const frame=tree.frameTree?.frame?.id;if(typeof frame!=='string')throw new WorldletError('The page is not ready yet.');
   const world=await this.cdp('Page.createIsolatedWorld',{frameId:frame,worldName:'WorldletBrowser'});
   const context=world.executionContextId;if(typeof context!=='number')throw new WorldletError('The browser could not inspect this page.');
   await this.cdp('Runtime.enable');
   await this.cdp('Runtime.addBinding',{name:'worldletBookmark',executionContextName:'WorldletBrowser'});
   await this.cdp('Runtime.addBinding',{name:'worldletActivity',executionContextName:'WorldletBrowser'});
   await this.cdp('Runtime.addBinding',{name:'worldletLogin',executionContextName:'WorldletBrowser'});
   if(this.recorder){
    await this.cdp('Runtime.addBinding',{name:'worldletRecord',executionContextName:'WorldletBrowser'});
    await this.cdp('Network.enable',{maxTotalBufferSize:50_000_000,maxResourceBufferSize:10_000_000});
   }
   await this.evaluateExpression('window.webkit={messageHandlers:{worldletBookmark:{postMessage:value=>worldletBookmark(JSON.stringify(value))}}};',context);
   const source=fs.readFileSync(path.join(this.webRoot,'browser-observer.js'),'utf8');
   await this.evaluateExpression(`if(!window.worldletXReader){${source}\n}`,context);
   if(this.recorder)await this.evaluateExpression(fs.readFileSync(path.join(this.webRoot,'browser/web-record.js'),'utf8'),context);
   // Saved sign-ins (core/browser/saved-logins.ts): an older build without the script still browses.
   try{await this.evaluateExpression(fs.readFileSync(path.join(this.webRoot,'browser/login-watch.js'),'utf8'),context);}catch{}
   if(this.contextTask===task)this.isolatedContext=context;
   return context;
  })();
  this.contextTask=task;
  task.catch(()=>{if(this.contextTask===task)this.contextTask=null;});
  return task;
 }
 private async evaluateExpression(expression:string,context?:number,userGesture=false,timeoutSeconds=15){
  const args:Row={expression,awaitPromise:true,returnByValue:true,userGesture};
  if(context!==undefined)args.contextId=context;
  const value=await this.cdp('Runtime.evaluate',args,timeoutSeconds);
  if(value.exceptionDetails)throw new WorldletError('This page could not complete the browser operation.');
  return value.result?.value;
 }
 /** Runs `script` as an async function body with `args` bound by name, in the isolated world by default. */
 async evaluate(script:string,args:Row={},{isolated=true,userGesture=false,timeoutSeconds=15}:{isolated?:boolean,userGesture?:boolean,timeoutSeconds?:number}={}){
  const names=Object.keys(args).sort();
  const expression=`(async (${names.join(',')})=>{${script}\n})(...${JSON.stringify(names.map(name=>args[name]))})`;
  return this.evaluateExpression(expression,isolated?await this.context():undefined,userGesture,timeoutSeconds);
 }

 // Document scripts -------------------------------------------------------------------------------
 /** Video formats (video-formats.js, core/browser/video-formats.ts): the page's main world counts
  * what it was told about H.264/AAC, so the panel can move a page that needs them (device.ts). */
 private async installDocumentScripts(){
  if(this.videoWatch)return;
  // CEF runs scripts added for new documents only while the Page domain is on (RC b1cb76b0); this
  // also covers the meeting hooks installed after it.
  await this.cdp('Page.enable',{},2);
  if(this.early){await this.documentScript(this.early);this.early='';}
  let source:string;
  try{source=fs.readFileSync(path.join(this.webRoot,'browser/video-formats.js'),'utf8');}catch{this.videoWatch=true;return;}
  await this.documentScript(`${source}(${JSON.stringify(PROPRIETARY_VIDEO.source)})`);
  this.videoWatch=true;
 }
 /** One script every later document runs before its own. The engine runs such scripts only while
  * the Page domain is enabled: without it they register and never run. */
 private async documentScript(source:string){
  await this.cdp('Page.enable',{},2);
  await this.cdp('Page.addScriptToEvaluateOnNewDocument',{source},2);
 }
 /** The blank start is not a page to go Back to. */
 private async forgetBlank(entry:Entry){
  try{await this.cdp('Page.resetNavigationHistory',{},5);}catch{return;}
  if(this.top===entry&&!this.closed){entry.back=false;this.onChange();}
 }

 // Meeting audio (meeting-audio.js) ------------------------------------------------------------
 /** Whether this page can transcribe its call: a Meetings page whose hooks are installed. */
 get meetingAudioReady(){return this.meetingReady;}
 private async installMeetingAudio(){
  const name=this.meetingBinding!;
  const source=fs.readFileSync(path.join(this.webRoot,'browser/meeting-audio.js'),'utf8');
  await this.cdp('Runtime.addBinding',{name},2);
  await this.documentScript(`${source}(${JSON.stringify(name)})`);
 }
 /** Starts or stops capturing the call on the page now showing (a user gesture, so its audio may
  * start). False when the page is not a call the hooks follow. */
 async meetingAudio(on:boolean):Promise<boolean> {
  if(!this.meetingReady)return false;
  try{return await this.evaluateExpression(`globalThis.__worldletMeetingAudio?.${on?'start':'stop'}()===true`,undefined,true,5)===true;}catch{return false;}
 }

 // Recording (recorder.ts) --------------------------------------------------------------------
 /** Starts keeping what happens on this page; network events flow from now on, page text after the
  * next load installs the observer. */
 record(link:WebRecordLink){this.recorder=link;for(const entry of this.stack)this.enableRecording(entry);}
 private enableRecording(entry:Entry){
  if(!this.recorder||!entry.created||entry.shielded||this.closed)return;
  // A negative id: the engine's reply is ignored (devtools()).
  this.engine.send({t:'devtools',id:entry.id,m:JSON.stringify({id:-1,method:'Network.enable',params:{maxTotalBufferSize:50_000_000,maxResourceBufferSize:10_000_000}})});
 }

 // agent-browser transport: only the visible page's own commands and events -----------------
 enableAgentTransport(enabled:boolean){this.agentEnabled=enabled;}
 discardAgentCommands(){this.enableAgentTransport(false);this.agentReplies.clear();}
 sendAgentCDP(message:Row){
  const top=this.top,id=message.id;
  if(typeof id!=='number')return;
  const reply=(body:Row)=>this.driver?.receiveCDP({id,...body});
  const method=typeof message.method==='string'?message.method:'';
  if(!top||!top.created||this.closed||top.shielded||!method||message.sessionId!==undefined||method.startsWith('Target.')||method.startsWith('Browser.')){reply({error:{code:-32601,message:'Only the visible page is available'}});return;}
  if(['Input.dispatchMouseEvent','Input.dispatchKeyEvent','Input.insertText','Input.dispatchTouchEvent'].includes(method))this.lastGesture=Date.now();
  const internal=AGENT_IDS+this.nextCDP++;
  this.agentReplies.set(internal,id);
  this.engine.send({t:'devtools',id:top.id,m:JSON.stringify({id:internal,method,params:message.params??{}})});
 }
}
