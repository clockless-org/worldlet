import fs from 'node:fs';
import path from 'node:path';
import {WebContentsView,type Rectangle,type Session,type View,type WebContents} from 'electron';
import {WorldletError} from '../../files.ts';
import {googleSignInPage} from '../../../../../core/browser/index.ts';
import {MAX_POPUPS,httpsUpgrade,opensAsTab,popupAllowed,publicPage,signInPage} from './rules.ts';
import type {Row} from '../../host/types.ts';
import type {WebRecordLink} from './web-page.ts';

/** A browser operation abandoned because its page navigated, closed or was replaced. */
export class Cancelled extends Error {constructor(){super('The browser operation was cancelled.');this.name='AbortError';}}
export interface AgentLink {receiveCDP(message:Row):void;invalidate():void;stop():void;run(args:Row):Promise<Row>;
 /** The refs of the latest snapshot that Fox may act on. */
 controls():string[]}
export interface PermissionRequest {kind:'location'|'media';origin:string;media:number;answer(allow:boolean):void}
const owners=new WeakMap<WebContents,PageView>();
/** The page (opener or one of its popups) that owns these contents, for session-wide handlers. */
export const pageOf=(contents:WebContents)=>owners.get(contents);
// Development builds serve the fictional rehearsal site (platform/browser/demo) at a reserved
// `.test` HTTPS origin, so public-page, receipt and outcome rules apply unchanged (Mac DemoSite).
export const DEMO_HOST='demo.worldlet.test';
export const DEMO_PAGES:Record<string,string>={'/brightsmile':'brightsmile.html','/streambox':'streambox.html','/citywater':'citywater.html'};
const GESTURE_MS=5000;

/** One website page in its own Chromium view (Mac ChromiumView): popups stack over their opener in
 * the same panel, CDP reaches only the visible one, and the isolated observer world talks back
 * through Runtime bindings. Website views never get a preload or the World bridge. */
export class PageView {
 private views:WebContentsView[]=[];
 private parent:View;
 private session:Session;
 private webRoot:string;
 private demo:boolean;
 private frame:Rectangle={x:0,y:0,width:0,height:0};
 private hiddenView=true;
 private muted=false;
 private fullscreen=false;
 private closed=false;
 private pending=new Set<(error:Error)=>void>();
 private isolatedContext:number|null=null;
 private contextTask:Promise<number>|null=null;
 private demoEnabled=false;
 private demoInstalling=false;
 private lastGesture=0;
 private agentEnabled=false;
 private shielded=new WeakSet<WebContents>();
 driver:AgentLink|null=null;
 /** Keeps what happens on the page (recorder.ts), when the World records this page. */
 recorder:WebRecordLink|null=null;
 makeDriver:((view:PageView)=>AgentLink)|null=null;
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
 /** A link the person followed that the rules kept from opening (engine/page.ts `onRefused`). */
 onRefused=(_refused:{kind:string,reason:string,scheme:string,host:string})=>{};
 /** A Browser tab's page: a link for a new tab opens the Browser's next tab (`onOpenTab`), not a popup. */
 tabs=false;
 /** The page asked for a passkey, which Electron's views cannot offer (passkey-watch.js). */
 onPasskey=()=>{};
 /** A page or its popup starts Google's sign-in, which Google refuses in Electron's views (#1089); once per contents. */
 onGoogleSignIn=(_url:string,_popup:boolean)=>{};
 private readonly googleAsked=new WeakSet<WebContents>();
 private readonly passkeyAsked=new WeakSet<WebContents>();
 onOpenTab=(_url:string,_background:boolean)=>{};
 onPress=()=>{};
 /** A document script the first document gets before its own, once (the storage a moved page carries, core/browser/storage-carry.ts). */
 private early='';
 constructor(parent:View,session:Session,webRoot:string,demo:boolean,url:string,early=''){
  this.parent=parent;this.session=session;this.webRoot=webRoot;this.demo=demo;this.early=early;
  const view=new WebContentsView({webPreferences:{session,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false,disableDialogs:false,safeDialogs:true}});
  this.adopt(view,false);
  this.load(url);
 }
 get automation():AgentLink {if(!this.driver){if(!this.makeDriver)throw new WorldletError('The browser driver is missing. Rebuild or reinstall Worldlet.');this.driver=this.makeDriver(this);}return this.driver;}
 private get top(){return this.views[this.views.length-1];}
 get contents():WebContents|null {const view=this.top;return view&&!view.webContents.isDestroyed()?view.webContents:null;}
 /** The view that draws the page in the window, for a picture of what the person sees (Order). */
 get pictureContents():WebContents|null {return this.contents;}
 get url(){return this.contents?.getURL()??'';}
 get title(){return this.contents?.getTitle()??'';}
 get isLoading(){return this.contents?.isLoading()??false;}
 get canGoBack(){return !!this.contents?.navigationHistory.canGoBack()||this.views.length>1;}
 get canGoForward(){return !!this.contents?.navigationHistory.canGoForward();}
 get hasPopup(){return this.views.length>1;}
 get hidden(){return this.hiddenView;}
 get isClosed(){return this.closed;}
 /** The visible document is an account sign-in page that the panel leaves uninspected. */
 get isShielded(){const contents=this.contents;return !!contents&&this.shielded.has(contents);}
 owns(contents:WebContents){return this.views.some(view=>view.webContents===contents);}
 /** The visible page's view is attached to the window and shown. */
 isPresented(){const top=this.top;return !!top&&!this.closed&&!top.webContents.isDestroyed()&&this.parent.children.includes(top)&&top.getVisible();}
 frameRect(){return {...this.frame};}

 private adopt(view:WebContentsView,popup:boolean){
  const contents=view.webContents;
  owners.set(contents,this);
  view.setBorderRadius(12);
  view.setBackgroundColor('#ffffff');
  view.setBounds(this.frame);
  contents.setAudioMuted(this.muted);
  this.views.push(view);this.parent.addChildView(view);this.applyVisibility();
  const active=()=>!this.closed&&this.contents===contents;
  contents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'||input.type==='rawKeyDown')this.lastGesture=Date.now();});
  contents.on('before-mouse-event',(_event,mouse)=>{if(mouse.type==='mouseDown')this.lastGesture=Date.now();});
  // Account sign-in pages (rules.ts SIGN_IN_HOSTS) get no DevTools session, isolated observer or
  // agent (#1089): the session detaches as the main frame starts there and returns on the next page.
  const shield=(url:string)=>{
   if(!signInPage(url)){this.shielded.delete(contents);return;}
   this.shielded.add(contents);
   try{if(contents.debugger.isAttached())contents.debugger.detach();}catch{}
  };
  const starting=(details:{url:string,isMainFrame:boolean,isSameDocument:boolean})=>{
   if(!details.isMainFrame||details.isSameDocument||!signInPage(details.url))return;
   shield(details.url);
   if(googleSignInPage(details.url)&&!this.closed&&!this.googleAsked.has(contents)){this.googleAsked.add(contents);const url=details.url;setImmediate(()=>{if(!this.closed)this.onGoogleSignIn(url,popup);});}
  };
  contents.on('did-start-navigation',starting);
  contents.on('did-redirect-navigation',starting);
  contents.on('did-start-loading',()=>{if(active())this.onChange();});
  contents.on('did-stop-loading',()=>{shield(contents.getURL());if(active())this.onChange();});
  contents.on('page-title-updated',()=>{if(active())this.onChange();});
  const navigated=()=>{shield(contents.getURL());if(!active())return;this.driver?.invalidate();this.failPending();this.onActivityEnd('navigation');this.onNavigation();this.onChange();};
  contents.on('did-navigate',navigated);
  contents.on('did-navigate-in-page',(_event,_url,isMainFrame)=>{if(isMainFrame)navigated();});
  contents.on('did-finish-load',()=>{
   if(!active())return;
   this.isolatedContext=null;this.contextTask=null;this.onChange();this.onLoaded();
   void this.context().catch(()=>{});
  });
  contents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{
   if(!isMainFrame||code===-3||!active()||this.demoInstalling)return;
   this.failPending();this.onActivityEnd('unavailable');this.onError(code);
  });
  contents.on('render-process-gone',()=>{if(active()){this.failPending();this.onActivityEnd('unavailable');this.onError(-2);}});
  contents.on('enter-html-full-screen',()=>{if(active()){this.fullscreen=true;this.place();}});
  contents.on('leave-html-full-screen',()=>{this.fullscreen=false;this.place();});
  // Main-frame and frame navigations stay on public pages; a popup may start blank. An http:// page on a
  // public host opens at its https:// address instead (rules.ts httpsUpgrade), once per address, as the engine does.
  let upgraded='',upgradedAt=0;
  const upgrade=(url:string)=>{
   const target=httpsUpgrade(url);if(!target||target===upgraded&&Date.now()-upgradedAt<10_000)return;
   upgraded=target;upgradedAt=Date.now();setImmediate(()=>{if(!contents.isDestroyed())void contents.loadURL(target).catch(()=>{});});
  };
  // A refused link the person followed is reported, as the engine does (`refused`).
  const refuse=(kind:string,reason:string,raw:string)=>{if(!active())return;let url:URL|null=null;try{url=new URL(raw);}catch{}this.onRefused({kind,reason,scheme:(url?.protocol??raw.split(':')[0]).replace(/:$/,'').slice(0,32),host:url?.hostname??''});};
  contents.on('will-frame-navigate',details=>{if(!(publicPage(details.url)||details.url==='about:blank'||!details.isMainFrame&&/^(about:srcdoc|data:|blob:)/.test(details.url))){details.preventDefault();if(details.isMainFrame){upgrade(details.url);if(!httpsUpgrade(details.url))refuse('navigation','address',details.url);}}});
  contents.on('will-redirect',details=>{if(details.isMainFrame&&!publicPage(details.url)){details.preventDefault();upgrade(details.url);}});
  contents.setWindowOpenHandler(details=>{
   const gesture=Date.now()-this.lastGesture<GESTURE_MS;
   if(this.closed)return {action:'deny'};
   const tab=details.disposition==='foreground-tab'||details.disposition==='background-tab';
   if(this.tabs&&opensAsTab(gesture,tab,details.url)){if(active())this.onOpenTab(httpsUpgrade(details.url)??details.url,details.disposition==='background-tab');return {action:'deny'};}
   if(!popupAllowed(gesture,this.views.length-1,details.url)){if(gesture)refuse('popup',this.views.length-1>=MAX_POPUPS?'popups':'address',details.url);return {action:'deny'};}
   return {action:'allow',createWindow:options=>{
    const child=new WebContentsView({webContents:(options as any).webContents});
    const before=this.hasPopup;
    this.adopt(child,true);
    if(!before)this.popupChanged(true);
    return child.webContents;
   }};
  });
  // window.close(): Electron emits an undocumented 'close' before destroying the contents; the view
  // must leave the window first or the main process stops servicing its event loop.
  (contents as any).on('close',()=>this.removed(view,popup));
  contents.on('destroyed',()=>{owners.delete(contents);setImmediate(()=>this.removed(view,popup));});
  contents.debugger.on('message',(_event,method,params,sessionId)=>this.devtools(contents,method,params,sessionId));
  // Attached before the first document, so it already has the passkey watch.
  try{this.attach(contents);}catch{}
  contents.debugger.on('detach',()=>{if(contents===this.contents){this.failPending();}});
 }
 /** A popup closed itself (window.close) or was closed by Back without history. */
 private removed(view:WebContentsView,popup:boolean){
  const index=this.views.indexOf(view);if(index<0)return;
  const wasTop=index===this.views.length-1;
  this.views.splice(index,1);try{this.parent.removeChildView(view);}catch{}
  if(this.closed)return;
  if(popup&&this.views.length===1)this.popupChanged(false);
  if(wasTop){this.applyVisibility();this.driver?.invalidate();this.failPending();this.onActivityEnd('closed');this.onNavigation();this.onChange();}
 }
 private static release(view:WebContentsView){
  const contents=view.webContents;
  if(contents.isDestroyed())return;
  try{if(contents.debugger.isAttached())contents.debugger.detach();}catch{}
  contents.close();
 }
 private popupChanged(active:boolean){this.driver?.stop();this.driver=null;this.failPending();this.onPopupChange(active);}
 private applyVisibility(){
  const top=this.top;
  for(const view of this.views)view.setVisible(!this.hiddenView&&view===top);
 }
 private place(){
  let rect=this.frame;
  if(this.fullscreen){const bounds=this.parent.getBounds();rect={x:0,y:0,width:bounds.width,height:bounds.height};}
  for(const view of this.views)view.setBounds(rect);
 }
 /** Electron's views always take the rect's size; `page` and `press` need the CEF engine (#1175). */
 setFrame(rect:Rectangle,_page?:{width:number,height:number},_press=false){this.frame={x:Math.round(rect.x),y:Math.round(rect.y),width:Math.max(0,Math.round(rect.width)),height:Math.max(0,Math.round(rect.height))};this.place();}
 setHidden(hidden:boolean){
  this.hiddenView=hidden;this.applyVisibility();
  // A visible pane keeps rendering while the window is covered; a kept page may be throttled.
  for(const view of this.views)if(!view.webContents.isDestroyed())view.webContents.setBackgroundThrottling(hidden);
 }
 /** Raises the page (and its popups) above other views in the panel. */
 raise(){for(const view of this.views)this.parent.addChildView(view);}
 mute(muted:boolean){this.muted=muted;for(const view of this.views)if(!view.webContents.isDestroyed())view.webContents.setAudioMuted(muted);}
 /** A page out of sight that must keep playing (a zero-size picture-in-picture window). */
 keepRunning(){for(const view of this.views)if(!view.webContents.isDestroyed())view.webContents.setBackgroundThrottling(false);}
 markGesture(){this.lastGesture=Date.now();}

 load(url:string){
  const contents=this.contents;if(!contents)return;
  let parsed:URL|null=null;try{parsed=new URL(url);}catch{}
  if(!parsed||!publicPage(parsed))return;
  if(this.demo&&parsed.hostname.toLowerCase()===DEMO_HOST&&!this.demoEnabled){
   this.demoInstalling=true;
   void (async()=>{
    // A just-created page may not accept CDP yet; never navigate uninstalled.
    for(let attempt=0;attempt<50&&!this.closed;attempt++){
     try{await this.cdp('Fetch.enable',{patterns:[{urlPattern:`https://${DEMO_HOST}/*`,requestStage:'Request'}]},2);this.demoEnabled=true;this.demoInstalling=false;void this.contents?.loadURL(url).catch(()=>{});return;}
     catch{await new Promise(resolve=>setTimeout(resolve,100));}
    }
    this.demoInstalling=false;if(!this.closed)this.onError(-105);
   })();
   return;
  }
  void contents.loadURL(url).catch(()=>{});
 }
 goBack(){const contents=this.contents;if(!contents)return;if(contents.navigationHistory.canGoBack())contents.navigationHistory.goBack();else if(this.views.length>1){const top=this.top;this.removed(top,true);PageView.release(top);}}
 goForward(){this.contents?.navigationHistory.goForward();}
 reload(){this.contents?.reload();}
 stopLoading(){this.contents?.stop();}
 close(){
  if(this.closed)return;
  this.driver?.stop();this.driver=null;this.closed=true;this.failPending();
  for(const view of [...this.views].reverse()){
   try{this.parent.removeChildView(view);}catch{}
   PageView.release(view);
  }
  this.views=[];
 }

 // DevTools IO ------------------------------------------------------------------------------
 private attach(contents:WebContents){
  if(contents.debugger.isAttached())return;
  try{contents.debugger.attach('1.3');}catch{throw new WorldletError('The page is not ready yet.');}
  // Every DevTools session gives each new document the passkey watch (passkey-watch.js), in the page's own world.
  let source='';try{source=fs.readFileSync(path.join(this.webRoot,'browser/passkey-watch.js'),'utf8');}catch{return;}
  for(const [method,params] of [['Page.enable',{}],['Runtime.enable',{}],['Runtime.addBinding',{name:'worldletPasskey'}],['Page.addScriptToEvaluateOnNewDocument',{source}]] as const)
   void contents.debugger.sendCommand(method,params).catch(()=>{});
  if(this.early){void contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:this.early}).catch(()=>{});this.early='';}
 }
 failPending(){
  this.isolatedContext=null;this.contextTask=null;
  const waiting=[...this.pending];this.pending.clear();
  for(const reject of waiting)reject(new Cancelled());
 }
 /** One DevTools command to the visible page, cancelled when that page navigates or closes. */
 cdp(method:string,params:Row={},timeoutSeconds=15):Promise<Row> {
  const contents=this.contents;
  if(this.closed||!contents||this.shielded.has(contents))return Promise.reject(new Cancelled());
  return new Promise((resolve,reject)=>{
   let done=false;
   const finish=(error:Error|null,value?:Row)=>{if(done)return;done=true;this.pending.delete(cancel);clearTimeout(timer);if(error)reject(error);else resolve(value??{});};
   const cancel=(error:Error)=>finish(error);
   this.pending.add(cancel);
   const timer=setTimeout(()=>finish(new WorldletError('The browser operation timed out. Inspect the page before retrying.')),timeoutSeconds*1000);
   try{this.attach(contents);}catch(error){finish(error);return;}
   contents.debugger.sendCommand(method,params).then(value=>finish(null,value),()=>finish(new WorldletError('The page changed. Inspect it again before continuing.')));
  });
 }
 private devtools(contents:WebContents,method:string,params:Row,sessionId:string){
  if(this.closed||contents!==this.contents)return;
  if(this.agentEnabled&&!sessionId)this.driver?.receiveCDP({method,params});
  if(method==='Runtime.bindingCalled'&&params.name==='worldletPasskey'){
   // A passkey request on the page (passkey-watch.js): only the page in view, once per document.
   if(!sessionId&&contents===this.contents&&!this.closed&&!this.passkeyAsked.has(contents)){this.passkeyAsked.add(contents);this.onPasskey();}
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

 // Recording (recorder.ts) --------------------------------------------------------------------
 /** Starts keeping what happens on this page; network events flow from now on, page text after the
  * next load installs the observer. */
 record(link:WebRecordLink){
  this.recorder=link;
  const contents=this.contents;
  if(!contents||this.closed||this.shielded.has(contents))return;
  try{this.attach(contents);void contents.debugger.sendCommand('Network.enable',{maxTotalBufferSize:50_000_000,maxResourceBufferSize:10_000_000}).catch(()=>{});}catch{}
 }

 // agent-browser transport: only the visible page's own commands and events -----------------
 enableAgentTransport(enabled:boolean){this.agentEnabled=enabled;}
 discardAgentCommands(){this.enableAgentTransport(false);}
 sendAgentCDP(message:Row){
  const contents=this.contents,id=message.id;
  if(typeof id!=='number')return;
  const reply=(body:Row)=>this.driver?.receiveCDP({id,...body});
  const method=typeof message.method==='string'?message.method:'';
  if(!contents||this.closed||this.shielded.has(contents)||!method||message.sessionId!==undefined||method.startsWith('Target.')||method.startsWith('Browser.')){reply({error:{code:-32601,message:'Only the visible page is available'}});return;}
  if(['Input.dispatchMouseEvent','Input.dispatchKeyEvent','Input.insertText','Input.dispatchTouchEvent'].includes(method))this.lastGesture=Date.now();
  try{this.attach(contents);}catch{reply({error:{code:-32000,message:'The visible page is unavailable.'}});return;}
  contents.debugger.sendCommand(method,message.params??{}).then(result=>{if(contents===this.contents)reply({result});},error=>{if(contents===this.contents)reply({error:{code:-32000,message:String(error?.message??'The visible page is unavailable.')}});});
 }
}
