import type {BrowserSurfaceAction,BrowserSurfaceBodies,SurfaceRect} from '../../contracts/browser-surface.ts';
import {appletForWebsite} from './applet-match.ts';
import {getApp,siteAppletPage} from '../../core/applets/index.ts';
import {uiIcon} from '../components/index.ts';
import {BROWSER_TABS,appletSite,appletHomeLanding,atAppletHome,atBrowserHome,browserStartsHome,createBrowserHome,createBrowserTabs,createPageMemory,canAddTab,isBrowserTab,tabApplet,tabLabel,pageAddress,typedAddress,livePagePlan,pictureInPictureApplet,foxCopyPlacement,foxStepsStart,foxStepsAdd,foxStepsFinish,foxStepsView,foxStepsWorthShowing,loginSite,loginSavedText,loginFillText} from '../../core/browser/index.ts';
import {createPictureInPictureOffer,createPictureInPictureWindow} from './picture-in-picture.ts';
import {createAppletTaskScreen} from './applet-task-screen.ts';


export function createBrowserPanel({root,content,native,notify,openApplet=(_id:string)=>{},openPage=(_url:string)=>{},leave=()=>{},canReturn=()=>false,onPage=(_applet:string,_page:{title:string,url:string},_byFox:boolean)=>{},sample=false,madeApplets=null as null|{find:(url:string)=>{id:string,title:string}|null,make:(page:{title:string,url:string})=>Promise<{id:string,title:string}>}}){
 const visits=new Map<string,{title:string,url:string}>();let appletKey='';
 // Resume where the person left off (core/browser/page-resume.ts). The practice world keeps
 // its pages in memory only, so they never reach the real world's.
 const store=sample?null:(()=>{try{return globalThis.localStorage;}catch{return null;}})();
 const memory=createPageMemory(store),browserHome=createBrowserHome(store);
 // The Browser's tabs (owner request 2026-10-07, core/browser/browser-tabs.ts): each tab is its own kept page under its
 // own key ('browser', 'browser--2'…) in `resumeKey`, `hidden` and the host's kept pages, so the live budget and resume
 // serve them as they serve Applets. Its page memory (the Browser's one page before tabs) becomes the first tab once.
 const tabs=createBrowserTabs(store,()=>browserHome.get(),{url:memory.get('browser'),at:memory.last('browser')});
 // A page the person reached is remembered for its Applet, or for its tab in the Browser.
 const remember=(key:string,href:string)=>{if(isBrowserTab(key))tabs.note(key,{url:href});else memory.remember(key,href);};
 const forget=(key:string)=>{if(isBrowserTab(key))tabs.forget(key);else memory.forget(key);};
 const hidden=new Map<string,number>(),foxPages=new Set<string>();
 let resumeKey='',resuming=false,restoring=false,fallback=null,foxNavigating=false,liveTimer=0,shows=0,settled=true;
 // The host's budget (core/browser/budget.ts) sets how many pages stay live.
 function livePages(){
  const plan=livePagePlan(hidden,Date.now(),pip||null,native?.browser?.budget?.()?.livePages);for(const key of [...hidden.keys()])if(!plan.live.includes(key))hidden.delete(key);
  clearTimeout(liveTimer);if(plan.nextCheck!==null)liveTimer=window.setTimeout(expire,Math.max(0,plan.nextCheck-Date.now())+50);
  return plan.live;
 }
 // A hidden page that outlived its time is released now, not at the next browser change.
 function expire(){
  const before=hidden.size;livePages();if(hidden.size===before||!native?.browser)return;
  if(showing){showing=false;lastRect='';geometry();}else void queue('browserHide',{live:livePages()});
 }
 window.addEventListener('worldlet:fox-idle',()=>{foxNavigating=false;});
 // A page Fox opens may finish loading after its turn ends, so its address is noted up front.
 function foxPage(value:unknown){try{if(foxPages.size>=64)foxPages.clear();foxPages.add(new URL(String(value)).href);}catch{}}
 let platform='x',address=null,onLoaded=null,title='X',slot,caption,frameID,flushGeometry:(()=>void)|null=null,opened=false,showing=false,lastRect='',pending=Promise.resolve(),geometryReady=Promise.resolve();
 const appletOffer=document.createElement('button');appletOffer.type='button';appletOffer.className='browser-applet-offer';appletOffer.hidden=true;root.append(appletOffer);
 let matchedApplet=null,adding=false;
 // While Fox drives the page (from its first browser command until its turn ends, or a
 // quiet safety timeout) the panel's frame turns into a moving color border. A host that
 // can draw over its native page (browserFoxOverlay) keeps the page where it is and glows
 // that border inward over the page edge, with the label on a tab grown from the top edge.
 // Other hosts inset the page so the ring and label show around it; the top band is
 // taller so the label sits inside the ring, not under the native view.
 // The control belongs to Fox's turn, not to one rendering of the panel: a World refresh
 // re-renders the open page (applyWorld → open → mount, a new slot) while Fox still drives
 // it, and the host's glow and Fox's pointer must not drop mid-task (#967). A new slot
 // takes the control over; only the turn's end or the quiet timeout end it.
 const FOX_RING=6,FOX_BAND=28,FOX_LABEL='Fox is working on this page';let foxControl=false,foxTimer=0,foxTurnStart:CSSNumberish|null=null;
 const hostGlow=()=>!!native?.browser?.foxOverlay?.();
 // Fox's copy of the page (owner request 2026-10-09, core/browser/picture-in-picture.ts FOX_COPY): when Fox
 // starts working on the page in view, the host makes Fox a copy of it in the panel's top-right corner,
 // and the person keeps their own page. `copyPage` is the copy's own size while there is one; the
 // glow, Fox's pointer and the steps card go to the copy, and the panel's frame stays plain.
 // `copyOff` keeps Fox on the panel's page for the rest of the turn (the host had no copy, or the
 // person took Fox's page into the panel); `copyTake` asks the host to make the copy the panel's page.
 let copyPage:{width:number,height:number}|null=null,copyOff=false,copyTake=false;
 const foxOnPanel=()=>foxControl&&!copyPage;
 // Fox's next step makes a copy: the page is in view in a panel with room for one, on a host that draws pages smaller.
 const copyWanted=()=>!copyOff&&!taskPip&&taskHost()&&pageInPanel()&&!!panelRect&&!!foxCopyPlacement({panel:panelRect,page:panelRect});
 function markFoxControl(){
  if(!slot)return;const on=foxOnPanel();slot.classList.toggle('is-fox-control',on);
  if(on)slot.dataset.foxLabel=foxLabel();else delete slot.dataset.foxLabel;
  if(on&&hostGlow())slot.dataset.foxOverlay='host';else delete slot.dataset.foxOverlay;
 }
 // Applet tasks Fox handed off run beside the conversation: the conversation's turn ending does not
 // end Fox's control of the page while one runs; the last task's end does.
 const appletTasks=new Set<string>();
 // The page's own status is the one place its status lives (owner feedback 2026-10-02: the window's
 // status, not the same words again in Fox's bubble and a note). On a host that draws over the page
 // it is a small card listing Fox's steps, each ticked as Fox moves on, and after Fox's turn the
 // result in the same place (#1619, core/browser/fox-steps.ts). Other hosts label the ring with the
 // step Fox is on, like the small screen over the device ("Fox · Filling in the form…").
 let foxStepText='',foxSteps=foxStepsStart(),foxReply={message:'',ok:true},finishTimer=0,finishedApplet='',finishedAt=0;
 // Seen in the panel, the finished card stays this long; unseen, it is kept this long for a return.
 const FINISHED_MS=8000,FINISHED_KEPT_MS=10*60_000;
 const foxLabel=()=>foxStepText?('Fox · '+foxStepText).slice(0,72):FOX_LABEL;
 const cardLabel=()=>foxSteps.finished?(foxSteps.ok?'Fox · Done':'Fox stopped'):/^thinking\b/i.test(foxSteps.now)?'Fox · Thinking…':foxSteps.steps.length?FOX_LABEL:foxLabel();
 // The finished card waits for the person to see Fox's page in its panel, then stays a few seconds.
 const showsFinished=()=>foxSteps.finished&&!foxControl&&finishedApplet===appletKey&&Date.now()-finishedAt<FINISHED_KEPT_MS&&foxStepsWorthShowing(foxSteps);
 function clearFinished(){clearTimeout(finishTimer);finishTimer=0;if(!foxSteps.finished)return;foxSteps=foxStepsStart();finishedApplet='';geometry();}
 window.addEventListener('worldlet:fox-step',(event:any)=>{
  const {text,applet}=event.detail||{};
  if(typeof text!=='string'||!text||applet&&(getApp(applet)?.id||applet)!==(getApp(appletKey)?.id||appletKey)||text===foxStepText)return;
  // A new turn's first step replaces the last turn's finished card.
  if(foxSteps.finished){clearTimeout(finishTimer);finishTimer=0;foxSteps=foxStepsStart();}
  foxStepText=text;foxSteps=foxStepsAdd(foxSteps,text);if(foxControl){markFoxControl();geometry();}
 });
 // What Fox said when its turn ended is the result the card shows (native-chat.ts).
 window.addEventListener('worldlet:fox-reply',(event:any)=>{
  const {message,outcome}=event.detail||{};foxReply={message:typeof message==='string'?message:'',ok:outcome==='complete'};
 });
 function setFoxControl(active:boolean){
  clearTimeout(foxTimer);if(active)foxTimer=window.setTimeout(()=>setFoxControl(!!appletTasks.size),90000);
  if(foxControl===active)return;foxControl=active;foxTurnStart=null;foxStepText='';
  // A new turn may have its copy again; one already showing goes on as Fox's.
  // Fox's work done, its copy closes by itself (owner Order 2026-10-10: 「任务做完，自己的小窗口就可以关了」);
  // the result is Fox's reply, so no finished card moves onto the person's page.
  const closesCopy=!active&&!!copyPage;
  if(!active){copyOff=false;copyPage=null;}
  // A new turn on the page starts a new list, whatever the last turn's card still showed.
  if(active){clearTimeout(finishTimer);finishTimer=0;if(foxSteps.finished)foxSteps=foxStepsStart();}
  // The turn is over: Fox's steps become its finished card with the reply as the result; a turn
  // that never reached a page step leaves no card.
  else if(!closesCopy&&foxStepsWorthShowing(foxSteps)){foxSteps=foxStepsFinish(foxSteps,{ok:foxReply.ok,result:foxReply.message});finishedApplet=taskPip||appletKey;finishedAt=Date.now();}
  else foxSteps=foxStepsStart();
  foxReply={message:'',ok:true};
  markFoxControl();syncPipOffer();renderTabs();
  if(taskPip)taskWindow().working(active);
  if(!active){taskWatched=false;taskApplet=taskPip;}
  geometry();
  // The turn is over: a page Fox kept working on out of sight is left like any page the person left,
  // and its device says Fox is done.
  if(!active&&taskPip&&!away)finishTask();
 }
 // The palette and pace live in CSS with the frame they color, so both surfaces agree.
 function foxGlow(){
  if(!foxControl&&!showsFinished()||!hostGlow()||!slot)return null;
  const style=getComputedStyle(slot),colors=style.getPropertyValue('--fox-ring-colors').split(',').map(color=>color.trim()).filter(Boolean);
  if(colors.length<2)return null;
  const turnSeconds=matchMedia('(prefers-reduced-motion: reduce)').matches?0:parseFloat(style.getPropertyValue('--fox-ring-turn'))||0;
  // The frame's turn is already running; the host starts its glow at the same point. A
  // re-rendered panel restarts the frame's CSS turn while the host's glow keeps turning,
  // so the frame continues from when Fox's control began and the two stay in step.
  const turn=content.getAnimations().find(a=>(a as CSSAnimation).animationName==='fox-ring-turn');
  if(turn){if(foxTurnStart===null)foxTurnStart=turn.startTime??document.timeline.currentTime;else if(turn.startTime!==foxTurnStart)turn.startTime=foxTurnStart;}
  const elapsed=Number(turn?.currentTime)||0;
  const view=foxStepsView(foxSteps);
  return {label:'🦊 '+cardLabel(),colors,turnSeconds,phaseSeconds:turnSeconds?elapsed/1000%turnSeconds:0,
   ...view.steps.length?{steps:view.steps,earlier:view.earlier}:{},...view.finished?{finished:true,...view.result?{result:view.result}:{}}:{}};
 }
 window.addEventListener('worldlet:fox-idle',()=>{
  if(!appletTasks.size)setFoxControl(false);
  // A turn that never drove the page leaves no steps behind for the next one.
  if(!foxControl&&!foxSteps.finished){foxSteps=foxStepsStart();foxStepText='';}
 });
 window.addEventListener('worldlet:applet-task',(event:any)=>{
  const {id,status}=event.detail||{};if(typeof id!=='string')return;
  if(status==='started'){appletTasks.add(id);return;}
  if(appletTasks.delete(id)&&!appletTasks.size&&foxControl){
   foxReply={message:status==='complete'&&typeof event.detail.message==='string'?event.detail.message:'',ok:status==='complete'};
   setFoxControl(false);
  }
  // A finished task leaves a Done mark over its Applet's device, unless the person is looking at it.
  const app=getApp(event.detail.applet);
  if(status==='complete'&&app&&!(opened&&!content.hidden&&getApp(appletKey)?.id===app.id))screen.done(app.id);
 });
 function syncAppletOffer(url?:string){
  if(url!==undefined)matchedApplet=appletForWebsite(url);
  const layout=root.appletLayout,visible=appletKey==='browser'&&opened&&slot?.isConnected&&!content.hidden&&content.dataset.template==='browser';
  appletOffer.hidden=!visible||!matchedApplet||!layout?.available(matchedApplet.id);
  if(appletOffer.hidden)return;
  const installed=layout.has(matchedApplet.id);
  appletOffer.textContent=(installed?'Open ':'Add ')+matchedApplet.title+(installed?' Applet':' to World');
  appletOffer.disabled=adding;
 }
 appletOffer.onclick=async event=>{
  event.stopPropagation();const app=matchedApplet;if(!app||adding)return;adding=true;syncAppletOffer();
  try{if(!root.appletLayout.has(app.id))await root.appletLayout.add(app.id);openApplet(app.id);}
  catch{notify('Could not add this Applet. Please try again.');}
  finally{adding=false;syncAppletOffer();}
 };
 root.addEventListener('worldlet:applet-layout',()=>syncAppletOffer());
 // The page's toolbar (owner request 2026-10-09: "website based，下面多个框，显示url，前进后退，home之类的按钮"): one plain row
 // along the top of the panel, above the page, in every website Applet and the Browser, under the Applet shelf
 // (ui/hud/applet-shelf.ts) that now names the Applet: Back, Forward, Refresh, Home, the page's address and Focus.
 // It sits in the panel above the page, since the host draws the page over anything placed on it.
 const toolbar=document.createElement('div');toolbar.className='browser-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Page');
 // Refresh, in the top bar of every website Applet and the Browser (owner request 2026-10-05): the page showing
 // in the panel loads again, also one stuck on a blank page. A bar control like Back: its icon, its name the label.
 const refresh=document.createElement('button');refresh.type='button';refresh.className='scene-control browser-refresh';refresh.hidden=true;
 refresh.innerHTML=uiIcon('refresh');refresh.append(Object.assign(document.createElement('span'),{textContent:'Refresh'}));refresh.title='Refresh this page';
 // The bar's page controls follow the panel, not each show of its page: a re-render of the open Applet
 // (a World update re-visits it) replaces the viewport and shows the page again a frame later, and
 // the controls flashing off and on for it read as a flicker (owner report 2026-10-06, YouTube).
 function pageInPanel(){
  return !!native?.browser&&opened&&!taskPip&&!!slot?.isConnected&&!content.hidden&&content.dataset.template==='browser'&&!covered();
 }
 // The native page is drawn over the World, so whatever opens over the panel puts the page away while it is
 // open: a dialog, and Fox's own panel (Settings, Profile…), which stood behind the page (owner report 2026-10-07).
 function covered(){return !!root.querySelector('#notionDialog')?.open||root.classList.contains('companion-info-open');}
 for(const name of ['worldlet:companion-info-opened','worldlet:companion-info-closed'])root.addEventListener(name,()=>geometry());
 function syncRefresh(){
  const visible=pageInPanel();
  if(refresh.hidden===visible)refresh.hidden=!visible;
  // Home shows once the page has gone somewhere other than the home page (owner request 2026-10-07): the Browser's,
  // or a website Applet's own (owner request 2026-10-08).
  // In the toolbar it stays, resting while the page is already its home page.
  const start=visible&&!!page.url?appletHome():'';
  const away=!!start&&(appletKey==='browser'?!atBrowserHome(page.url,start):!atAppletHome(page.url,[start,landedHomes.get(appletKey)||'']));
  homeButton.hidden=!visible||!appletHome();homeButton.disabled=!away;
  const bar=visible&&appletKey!=='web';if(toolbar.hidden===bar){toolbar.hidden=!bar;root.dispatchEvent(new CustomEvent('worldlet:page-controls'));}
  syncAddress(visible?page.url:'');
 }
 // Where the page is (owner request 2026-10-08), now in the toolbar's address field (owner request 2026-10-09): the page's
 // address while it is read, the whole address to edit once the field is clicked. Enter opens what was typed here: an
 // address (core/browser/typed-address.ts), or a search for anything else.
 const addressForm=document.createElement('form');addressForm.className='browser-address';
 const addressField=document.createElement('input');addressField.type='text';addressField.spellcheck=false;addressField.autocomplete='off';
 addressField.setAttribute('aria-label','Page address');addressField.placeholder='Type an address or search';addressForm.append(addressField);
 let addressUrl='';
 function syncAddress(url:string){
  addressUrl=url;if(document.activeElement===addressField)return;
  const shown=url?pageAddress(url):'';if(addressField.value!==shown)addressField.value=shown;addressField.title=url;
 }
 addressField.onfocus=()=>{addressField.value=addressUrl;addressField.select();};
 addressField.onblur=()=>syncAddress(addressUrl);
 addressField.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();addressField.value=addressUrl;addressField.blur();}};
 addressForm.onsubmit=event=>{
  event.preventDefault();const text=addressField.value.trim();if(!text)return;
  const url=typedAddress(text)||'https://www.google.com/search?q='+encodeURIComponent(text);
  addressField.blur();void command('open',{url});
 };
 // Each website Applet's home page is the address it opens at (core/browser/page-resume.ts appletSite); the Browser's is
 // the one in Settings › Browser. A page over the World ('web') has none. Where that address first lands (a redirect,
 // x.com/ → x.com/home) is its home too, for this session.
 const landedHomes=new Map<string,string>();let landingHome=false;
 function appletHome(){return appletKey==='browser'?browserHome.get():appletKey==='web'?'':appletSite(appletKey)?.url||'';}
 refresh.onclick=event=>{event.stopPropagation();if(!refresh.hidden)void command('reload');};
 // Home, in the Browser (owner request 2026-10-06) and every website Applet (owner request 2026-10-08):
 // its home page; the Browser's is Google unless the person chose another in Settings › Browser. The page itself goes there: opening the Browser again at the
 // address it was opened at changed nothing once the person had searched from it (owner report 2026-10-07).
 const homeButton=document.createElement('button');homeButton.type='button';homeButton.className='scene-control browser-home';homeButton.hidden=true;
 homeButton.innerHTML=uiIcon('home');homeButton.append(Object.assign(document.createElement('span'),{textContent:'Home'}));homeButton.title='Go to the home page';
 homeButton.onclick=event=>{event.stopPropagation();const url=appletHome();if(homeButton.hidden||!url)return;landingHome=appletKey!=='browser';void command('open',{url});};
 // Back and Forward, left of the title on a website Applet's page (owner request 2026-10-06): they follow the page's own
 // history, as the host reports it (`canBack`, `canForward`), and stand where the Applet's Back was; the way back to the
 // World is World beside Fox in its dock (ui/hud/native-hud.ts). Each shows only while there is somewhere to go (owner
 // request 2026-10-07; they rested, greyed, before): Back at the first page only when the page was opened from something
 // in the Applet (a link in an email), which it then returns to. A page over the World ('web') keeps its own close.
 const pageBack=document.createElement('button'),pageForward=document.createElement('button');
 for(const [button,name,label,tip] of [[pageBack,'back','Back','Go back a page'],[pageForward,'forward','Forward','Go forward a page']] as const){
  button.type='button';button.className='scene-control browser-'+name;button.hidden=true;button.disabled=true;
  button.innerHTML=uiIcon(name);button.append(Object.assign(document.createElement('span'),{textContent:label}));button.title=tip;
  toolbar.append(button);
 }
 toolbar.append(refresh,homeButton,addressForm);
 let pageHistory={back:false,forward:false};
 function syncHistory(){
  const visible=pageInPanel()&&appletKey!=='web',back=visible&&(pageHistory.back||canReturn()),forward=visible&&pageHistory.forward;
  // `data-web-page` marks a website page even while both rest hidden: the Applet's own Back stays away (World beside
  // Fox leaves the page, ui/hud/native-hud.ts) instead of standing in for the page's Back.
  // In the toolbar both stay, resting while there is nowhere to go.
  if(pageBack.hidden===visible||pageBack.hasAttribute('data-web-page')!==visible){pageBack.hidden=pageForward.hidden=!visible;pageBack.toggleAttribute('data-web-page',visible);root.dispatchEvent(new CustomEvent('worldlet:page-controls'));}
  pageBack.disabled=!back;pageForward.disabled=!forward;
 }
 function goBack(){if(pageBack.disabled)return;if(pageHistory.back)void command('back');else if(canReturn())leave();}
 function goForward(){if(!pageForward.disabled&&pageHistory.forward)void command('forward');}
 pageBack.onclick=event=>{event.stopPropagation();goBack();};
 pageForward.onclick=event=>{event.stopPropagation();goForward();};
 window.addEventListener('worldlet:browser-navigate',(event:any)=>{
  if(event.detail==='back')goBack();else if(event.detail==='forward')goForward();
  // The Applet shelf's + (ui/hud/applet-shelf.ts) entering the Browser: its address is ready to type.
  else if(event.detail==='address'){if(toolbar.isConnected&&!toolbar.hidden)addressField.focus();}
  // The File menu's tab keys (⌘T, ⌘W, ⌘⇧] and ⌘⇧[; Ctrl+T, Ctrl+W, Ctrl+Tab and Ctrl+Shift+Tab elsewhere) act on the Browser's tabs
  // while it shows; taken, the menu does nothing else (⌘W closes the window anywhere else).
  else if(typeof event.detail==='string'&&event.detail.endsWith('-tab')&&tabsInPanel()){
   event.preventDefault();
   if(event.detail==='new-tab')newTab();else if(event.detail==='close-tab')closeTab(resumeKey);
   else if(event.detail==='next-tab')pickTab(tabs.step(1).active);else if(event.detail==='previous-tab')pickTab(tabs.step(-1).active);
  }
 });
 // Tabs, in the Browser only (owner request 2026-10-07: booking flights and hotels needs several pages; website Applets keep
 // one page). A slim strip along the panel's top edge above the page, always there in the Browser so it is found: each tab
 // the page's title (or its site) and a close, the active one lit, and + at the end for a new tab on the home page. Up to
 // BROWSER_TABS.max; pages beyond the host's live budget are released and open again at their last address when picked.
 // While Fox works on the page the strip rests: Fox drives the page in view, and another tab would take it away.
 const tabStrip=document.createElement('div');tabStrip.className='browser-tabs';tabStrip.setAttribute('role','tablist');tabStrip.setAttribute('aria-label','Browser tabs');
 const tabsInPanel=()=>appletKey==='browser'&&opened&&!!slot?.isConnected&&!content.hidden&&content.dataset.template==='browser'&&!taskPip&&!foxControl;
 function renderTabs(){
  if(appletKey!=='browser'||!native?.browser){if(tabStrip.isConnected)tabStrip.remove();return;}
  const state=tabs.state,resting=foxControl,full=!canAddTab(state);
  tabStrip.toggleAttribute('data-resting',resting);
  const items=state.tabs.map(tab=>{
   const label=tabLabel(tab),active=tab.key===state.active,item=document.createElement('div');
   item.className='browser-tab';item.dataset.tab=tab.key;item.toggleAttribute('data-active',active);
   const pick=document.createElement('button');pick.type='button';pick.className='browser-tab-pick';pick.setAttribute('role','tab');pick.setAttribute('aria-selected',String(active));
   pick.textContent=label;pick.title=label;pick.disabled=resting&&!active;pick.onclick=event=>{event.stopPropagation();pickTab(tab.key);};
   const close=document.createElement('button');close.type='button';close.className='browser-tab-close';close.innerHTML=uiIcon('close');close.disabled=resting;
   close.setAttribute('aria-label','Close '+label);close.title='Close tab';close.onclick=event=>{event.stopPropagation();closeTab(tab.key);};
   item.append(pick,close);return item;
  });
  const add=document.createElement('button');add.type='button';add.className='browser-tab-new';add.innerHTML=uiIcon('plus');add.disabled=resting||full;
  add.setAttribute('aria-label','New tab');add.title=full?'Up to '+state.tabs.length+' tabs':'New tab';add.onclick=event=>{event.stopPropagation();newTab();};
  tabStrip.replaceChildren(...items,add);
 }
 // Another tab comes into view: the page that showed is left like a page the person left (kept while the budget allows),
 // and the picked tab's page returns as it was, or opens again at its last address.
 function showTab(key:string){
  if(showing&&resumeKey&&resumeKey!==key)hidden.set(resumeKey,Date.now());
  const tab=tabs.get(key),home=browserHome.get();if(!tab)return;
  const kept=hidden.has(key);
  resumeKey=key;resuming=true;fallback=home;restoring=!kept&&!!tab.url&&tab.url!==home;address=tab.url||home;
  showing=false;lastRect='';pageHistory={back:false,forward:false};page={title:'',url:''};focusState=null;videoPlaying=false;signInBlocked=false;matchedApplet=null;
  if(caption)caption.textContent='Loading '+tabLabel(tab)+'…';
  renderTabs();geometry(true);
 }
 function pickTab(key:string){if(!tabsInPanel()||key===resumeKey&&tabs.state.active===key)return;tabs.select(key);showTab(key);}
 function newTab(){if(!tabsInPanel()||!canAddTab(tabs.state))return;showTab(tabs.add().active);addressField.focus();}
 // A link the page opened for a new tab (target=_blank, ⌘-click; owner request 2026-10-08): the next tab, in front or,
 // for a background click, behind the page. Away from the strip (the task window) the link opens in this page.
 function openTab(url:string,background:boolean){
  if(!url)return;
  if(!tabsInPanel()){void command('open',{url});return;}
  if(!canAddTab(tabs.state)){notify('Close a tab to open another (up to '+BROWSER_TABS.max+' tabs).');return;}
  const next=tabs.add(url,background);
  if(background)renderTabs();else showTab(next.active);
 }
 function closeTab(key:string){
  if(!tabsInPanel()||!tabs.get(key))return;
  const next=tabs.close(key).active;hidden.delete(key);
  // The active tab's page goes when the next tab shows (it is no longer `live`); another tab's kept page goes now.
  if(key===resumeKey){resumeKey='';showTab(next);return;}
  renderTabs();resuming=true;if(showing){showing=false;lastRect='';geometry(true);}
 }
 // Focus, first of the Applet's controls right of the title (owner request 2026-10-05, core/browser/page-focus.ts; it stood
 // left after Back until the page's Back and Forward took that side, 2026-10-06, and the title's room): on by default, a website
 // page shows its main content (an article alone, an app without its distractions); pressed, the whole page shows again,
 // and the site keeps that choice. The host says what Focus does on each page it shows (`focus` reports).
 const focusButton=document.createElement('button');focusButton.type='button';focusButton.className='scene-control browser-focus';focusButton.hidden=true;
 focusButton.innerHTML=uiIcon('focus');focusButton.append(Object.assign(document.createElement('span'),{textContent:'Focus'}));
 toolbar.append(focusButton);
 let focusState:{on:boolean,reader:boolean,paused:boolean,available?:boolean}|null=null,focusBusy=false;
 // Its place is kept while the host has not yet said what Focus does on the page, so the controls beside it
 // do not jump aside when the answer comes (owner report 2026-10-06).
 function syncFocus(){
  const visible=pageInPanel()&&focusState?.available!==false;
  if(focusButton.hidden===visible)focusButton.hidden=!visible;
  const waiting=visible&&!focusState?'hidden':'';
  if(focusButton.style.visibility!==waiting)focusButton.style.visibility=waiting;
  if(!focusState||focusState.available===false)return;
  const on=focusState.on&&!focusState.paused;focusButton.setAttribute('aria-pressed',String(on));focusButton.disabled=focusBusy;
  focusButton.title=focusState.paused?'Focus is off while Fox works on this page. Press to turn it back on':
   on?(focusState.reader?'Showing only the article. Press to show the whole page':'Distractions hidden. Press to show the whole page'):'Press to show only the main content';
 }
 focusButton.onclick=async event=>{
  event.stopPropagation();if(focusButton.hidden||!focusState||focusState.available===false||focusBusy)return;
  // Paused for Fox, a press brings Focus back; otherwise it switches.
  const on=focusState.paused||!focusState.on;focusBusy=true;focusState={...focusState,on,paused:false};syncFocus();
  try{const result:any=await command('focus',{on});if(result&&!result.error)focusState={on:result.on===true,reader:result.reader===true,paused:false};}
  finally{focusBusy=false;syncFocus();}
 };
 // Make Applet, at the top of the Browser (owner request 2026-10-05): the web app open here becomes an Applet of its
 // own (core/applets/site-applet.ts), on the Home ground at once; a site that already has one opens it instead. A site
 // with a catalog Applet keeps the offer above, which adds or opens that one.
 const makeOffer=document.createElement('button');makeOffer.type='button';makeOffer.className='scene-control browser-make-applet';makeOffer.hidden=true;
 makeOffer.innerHTML=uiIcon('makeApplet');const makeLabel=document.createElement('span');makeOffer.append(makeLabel);
 (root.querySelector('.applet-bar-controls')||root).append(makeOffer);
 let page={title:'',url:''},making=false;
 // Until the World is projected again with the new Applet, the panel remembers what it just made.
 const justMade=new Map<string,{id:string,title:string}>();
 const siteKey=(url:string)=>siteAppletPage(url)?.hostname.toLowerCase().replace(/^www\./,'')||'';
 const madeFor=(url:string)=>madeApplets?.find(url)||justMade.get(siteKey(url))||null;
 function syncMakeOffer(){
  const visible=!!madeApplets&&appletKey==='browser'&&opened&&!!slot?.isConnected&&!content.hidden&&content.dataset.template==='browser'&&!matchedApplet&&!!siteAppletPage(page.url);
  const made=visible?madeFor(page.url):null;
  if(makeOffer.hidden===!visible&&makeOffer.dataset.made===(made?'true':'false')&&makeOffer.disabled===making)return;
  makeOffer.hidden=!visible;makeOffer.disabled=making;makeOffer.dataset.made=made?'true':'false';
  makeLabel.textContent=made?'Open Applet':'Make Applet';
  makeOffer.title=made?'Open '+made.title+', the Applet made from this site':'Make this site an Applet in your World';
 }
 makeOffer.onclick=async event=>{
  event.stopPropagation();if(!madeApplets||making||makeOffer.hidden)return;
  const made=madeFor(page.url);if(made){openApplet(made.id);return;}
  making=true;syncMakeOffer();
  try{const result=await madeApplets.make({...page});justMade.set(siteKey(page.url),result);notify(result.title+' is now an Applet in your World');}
  catch(error){notify(error?.message||'Could not make this Applet. Please try again.');}
  finally{making=false;syncMakeOffer();}
 };
 root.addEventListener('worldlet:applet-layout',()=>syncMakeOffer());
 // A sign-in the website refuses here (core/browser/sign-in.ts) gets one explicit way out: the
 // Applet's site in the system browser. It shows until the page moves on; nothing opens by itself.
 // Saved sign-ins (core/browser/saved-logins.ts, owner request 2026-10-07): after the person signs in, an offer beside the
 // page to save the account (its password stays in the host); on a site's sign-in form, a button per saved account fills
 // it in. Both stand over the World beside the page, where the page's other offers are, since the page covers the panel.
 let loginFill:{site:string,accounts:string[]}|null=null,loginBusy=false;
 const loginFills=document.createElement('div');loginFills.className='browser-login-fill';loginFills.setAttribute('role','group');loginFills.setAttribute('aria-label','Saved passwords');loginFills.hidden=true;root.append(loginFills);
 const loginButton=(label:string,run:()=>Promise<unknown>,primary=false)=>{
  const button=document.createElement('button');button.type='button';button.textContent=label;if(primary)button.className='primary';
  button.onclick=async event=>{event.stopPropagation();if(loginBusy)return;loginBusy=true;button.disabled=true;try{await run();}finally{loginBusy=false;syncLogin();}};
  return button;
 };
 function syncLogin(){
  const visible=pageInPanel();
  loginFills.hidden=!visible||!loginFill?.accounts.length||loginSite(page.url)!==loginFill?.site;
  if(loginFills.hidden)delete loginFills.dataset.key;
  if(!loginFills.hidden&&loginFills.dataset.key!==JSON.stringify(loginFill)){
   loginFills.dataset.key=JSON.stringify(loginFill);
   loginFills.replaceChildren(...loginFill!.accounts.map(account=>loginButton(loginFillText(account),async()=>{const result=await command('loginFill',{username:account});if(!result?.error)loginFill=null;})));
  }
 }
 const signInOffer=document.createElement('button');signInOffer.type='button';signInOffer.className='browser-applet-offer browser-sign-in-offer';signInOffer.hidden=true;root.append(signInOffer);
 let signInBlocked=false;
 function syncSignInOffer(){
  signInOffer.hidden=!signInBlocked||!opened||!slot?.isConnected||content.hidden||content.dataset.template!=='browser';
  if(!signInOffer.hidden)signInOffer.textContent='Open '+title+' in your browser ↗';
 }
 signInOffer.onclick=event=>{event.stopPropagation();void command('external',{platform});};
 // Picture in picture (core/browser/picture-in-picture.ts). `pip` is the Applet whose page is
 // the World's small window and `pipPlatform` the platform its page opened with; choosing it
 // marks the next leave (`pipWanted`) to keep the page there, playing, instead of hiding it.
 // The host reports whether the page plays a video.
 let pip='',pipPlatform='',pipWanted='',videoPlaying=false;
 const pipHost=()=>!!native?.browser?.pictureInPicture?.();
 const pipWindow=createPictureInPictureWindow({root,place:rect=>{if(pip)void queue('browserPip',{applet:pip,rect,live:livePages()});},open:()=>restorePip(),close:()=>closePip()});
 // One window: a page already in it leaves first, so it does not reappear in the World on the way.
 // While Fox drives the page the same icon shrinks it into the task window: leaving moves Fox's
 // page there (see geometry), also one the person took back from the window earlier this turn.
 const pipOffer=createPictureInPictureOffer(root,()=>{if(pip&&pip!==resumeKey)closePip();pipWanted=resumeKey;leave();});
 function syncPipOffer(){
  const open=opened&&showing&&!!slot?.isConnected&&!content.hidden;
  // Picture in picture is for videos; Fox's pages stay in their Applet (owner feedback 2026-10-02).
  pipOffer.sync(open&&pipHost()&&content.dataset.template==='browser'&&!!resumeKey&&resumeKey!==pip&&pictureInPictureApplet(tabApplet(resumeKey))&&videoPlaying&&!foxControl&&!taskPip);
 }
 // One window: another page takes it over and the previous one is left kept and paused; the page
 // already in it stays as it is.
 function startPip(key:string){if(pip===key)return;if(pip)closePip();pip=key;pipPlatform=platform;hidden.delete(key);pipWindow.show(key);}
 // Pressing the window, or its name, opens the Applet; its page then returns into the panel as it is.
 function restorePip(){const id=pip&&getApp(tabApplet(pip))?.id;if(id)openApplet(id);}
 // Closing leaves the page as any page the person left: kept for a while, paused and muted.
 function closePip(){if(!pip)return;const key=pip;pip='';pipWindow.hide();hidden.set(key,Date.now());void queue('browserPip',{applet:key,live:livePages()});}
 // Fox's page out of sight (#1175, owner decisions 2026-10-02): when the person leaves the Applet
 // while Fox drives its page, the page keeps its size and Fox keeps working; the host draws it
 // smaller in a small screen over the Applet's device in the World (applet-task-screen.ts), never in
 // a window at the bottom-right, which is for videos only. Where the device is not drawn the page
 // waits unseen (a zero rect). Opening the Applet takes the page back into the panel as it is; after
 // Fox's turn the page is left like any page the person left and the device shows a Done mark.
 // `taskPip` is the Applet whose page it holds, `taskPage` the page's size in the panel and
 // `screenRect` the screen's slot.
 let taskPip='',taskPage:{width:number,height:number}|null=null,panelRect:SurfaceRect|null=null,screenRect:SurfaceRect|null=null;
 // The person came back to the page during Fox's turn: it stays in the panel until the turn ends.
 let taskWatched=false;
 // The Applet whose page Fox works on from the window this turn, also once the person took it back
 // into the panel: Fox's steps reach that page wherever the person is (`foxPageHeld`).
 let taskApplet='';
 // The World window is away for the desktop Companion: the host shows Fox's page beside it and stops
 // the others (`keptAway` says whether this panel's page was Fox's, so it is still alive).
 let away=false,keptAway=false;
 window.addEventListener('worldlet:desktop-companion',(event:any)=>{
  const next=event.detail===true;if(next===away)return;
  if(next)keptAway=showing&&(!!taskPip||foxControl);
  // The host takes Fox's copy along beside the Companion while Fox works, and closes it otherwise.
  if(next&&copyPage){copyPage=null;if(foxControl)copyOff=true;markFoxControl();}
  // Back in the World: a page the host stopped opens again; Fox's page is placed where it was.
  else if(showing&&!keptAway)showing=false;
  away=next;lastRect='';geometry();
  // Fox's turn ended while the World was away: its page is left like any page the person left.
  if(!away&&taskPip&&!foxControl)finishTask();
 });
 const taskHost=()=>!!native?.browser?.taskPictureInPicture?.();
 // The World hears whether Fox is working on an Applet's page out of sight (`worldlet:fox-task`).
 const announce=(applet:string,working:boolean)=>root.dispatchEvent(new CustomEvent('worldlet:fox-task',{detail:{applet:getApp(applet)?.id||applet,working}}));
 const screen=createAppletTaskScreen({root,openApplet,place:rect=>{if(!taskPip)return;screenRect=rect;geometry();}});
 const taskWindow=()=>({show(key:string){screen.show(key,taskPage!);announce(key,foxControl);},working(busy:boolean){if(!taskPip)return;screen.working(busy);announce(taskPip,busy);}});
 function enterTask(rect:SurfaceRect){
  // Fox's copy goes to the screen in place of the person's page, at its own size (FOX_COPY).
  if(copyPage){copyTake=true;copyOff=true;}
  taskPip=taskApplet=appletKey;taskPage=copyPage??{width:rect.width,height:rect.height};screenRect=null;copyPage=null;
  taskWindow().show(appletKey);taskWindow().working(foxControl);
 }
 // Fox's turn ended with its page out of sight: the page is left and its device says Fox is done.
 function finishTask(){const key=taskPip;closeTask();if(key&&!taskPip)screen.done(key);}
 // Pressing the window, or its name, opens the Applet; its page returns into the panel as it is.
 function restoreTask(){const id=taskPip&&getApp(taskPip)?.id;if(id)openApplet(id);}
 // Closing (only once Fox's turn has ended) leaves the page as any page the person left.
 function closeTask(){
  if(!taskPip||foxControl)return;
  endTask();taskApplet='';
  if(showing&&content.hidden){showing=false;lastRect='';if(resumeKey)hidden.set(resumeKey,Date.now());void queue('browserHide',{live:livePages()});}
 }
 function endTask(){if(!taskPip)return;announce(taskPip,false);taskPip='';taskPage=null;screenRect=null;screen.hide();}
 function queue<K extends BrowserSurfaceAction>(action:K,body:BrowserSurfaceBodies[K]){pending=pending.catch(()=>{}).then(()=>native.browser.call(action,body));return pending;}
 async function command(operation,args={},agent=false){
  if(!native?.browser)return {error:'The X terminal needs the Mac app. The web sample can only open X in a separate tab.'};
  try{return await native.browser.command(operation,args,agent);}catch(e){if(!agent){if(caption)caption.textContent='';notify(e.message);}return {error:e.message};}
 }
 // `now` lays out at once instead of on the next frame: the panel was just hidden, so an Applet
 // opened before that frame (another one, then this one again) still shows its page anew.
 function geometry(now?:unknown){
  // Observers and events pass their own argument; only `true` lays out at once.
  const immediate=now===true;
  syncAppletOffer();syncMakeOffer();syncPipOffer();syncSignInOffer();syncRefresh();syncFocus();syncHistory();syncLogin();
  if(frameID){if(immediate)flushGeometry?.();return;}frameID=true;geometryReady=new Promise<void>(resolve=>{
   // WebKit may suspend animation frames while a window is occluded. The native
   // browser still needs its initial frame so opening the panel cannot stall.
   let done=false;let timer=0;let animation=0;
   const update=()=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(animation);frameID=false;flushGeometry=null;try{
   const left=!opened||!slot?.isConnected||content.hidden,visible=!left&&!covered(),wanted=pipWanted;pipWanted='';
   // Away on the desktop the host keeps Fox's page beside the Companion (#1175); layouts only say
   // whether Fox is working.
   if(away){
    if(showing&&keptAway){
     const glow=foxGlow(),key=JSON.stringify({away:true,fox:glow&&{...glow,phaseSeconds:undefined}});
     if(key!==lastRect){lastRect=key;void queue('browserLayout',{rect:{x:0,y:0,width:0,height:0},...taskPip&&taskPage?{page:taskPage,press:true}:{},...glow?{fox:glow}:{}});}
    }
    syncPipOffer();return;
   }
   // The person leaves Fox's page during Fox's turn: it stays Fox's, out of sight, instead of
   // hiding, and Fox keeps working on it.
   if(left&&showing&&!taskPip&&foxControl&&taskHost()&&panelRect&&appletKey&&(taskApplet===appletKey||!taskWatched))enterTask(panelRect);
   if(!visible&&taskPip&&showing&&taskPage){
    // Fox's page keeps its size, drawn smaller in the screen over its device (zero-size where the
    // device is not drawn), while Fox works on it.
    const rect=screenRect??{x:0,y:0,width:0,height:0},glow=foxGlow(),fox=glow?{fox:glow}:{};
    const key=JSON.stringify({task:rect,fox:glow&&{...glow,phaseSeconds:undefined}});
    const take=copyTake?{takeCopy:true}:{};copyTake=false;
    if(key!==lastRect||take.takeCopy){lastRect=key;void queue('browserLayout',{rect,page:taskPage,press:true,...fox,...take});}
    syncPipOffer();return;
   }
   if(!visible){
    // A page put away takes Fox's copy with it (the host closes the copy).
    if(copyPage){copyPage=null;markFoxControl();}
    if(showing){showing=false;lastRect='';
     // Chosen picture in picture: the page leaves the panel for the small window, still playing.
     if(wanted&&wanted===resumeKey&&pipHost())startPip(wanted);
     else{if(resumeKey){hidden.set(resumeKey,Date.now());if(isBrowserTab(resumeKey))tabs.seen();else memory.seen(resumeKey);}void queue('browserHide',{live:livePages()});}
    }
    syncPipOffer();return;
   }
   // The native view is a sibling overlay, so CSS overflow cannot clip it.
   // Bound it to the inner rim and round inward to avoid fractional overhang.
   // A panel still moving (an animation's transform) is measured again once it rests: a transform's end
   // resizes nothing, so no observer would place the page again. Endless ones (Fox's ring) never rest.
   const moving=content.getAnimations().filter(a=>(a.playState==='running'||a.pending)&&Number.isFinite(Number(a.effect?.getComputedTiming().endTime)));
   if(moving.length)void Promise.allSettled(moving.map(a=>a.finished)).then(()=>geometry());
   const r=slot.getBoundingClientRect(),p=content.getBoundingClientRect(),style=getComputedStyle(content);
   const x=Math.ceil(Math.max(r.left,p.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft))),y=Math.ceil(Math.max(r.top,p.top+parseFloat(style.borderTopWidth)+parseFloat(style.paddingTop)));
   const right=Math.floor(Math.min(r.right,p.right-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight))),bottom=Math.floor(Math.min(r.bottom,p.bottom-parseFloat(style.borderBottomWidth)-parseFloat(style.paddingBottom)));
   const glow=foxGlow(),ring=foxOnPanel()&&!glow,inset=ring?FOX_RING:0,top=ring?FOX_BAND:0;
   const rect={x:x+inset,y:y+top,width:Math.max(0,right-x-2*inset),height:Math.max(0,bottom-y-top-inset)};
   if(rect.width<1||rect.height<1)return;
   panelRect=rect;
   // Fox's copy above Fox's conversation box (else the panel's corner); a panel grown too small for it takes Fox's page in instead.
   const copyRect=copyPage?foxCopyPlacement({panel:rect,page:copyPage,dialogue:dialogueRect()}):null;
   if(copyPage&&!copyRect){copyPage=null;copyTake=true;copyOff=true;markFoxControl();}
   const copy=copyPage&&copyRect?{copy:{rect:copyRect,page:copyPage}}:{},take=copyTake&&showing?{takeCopy:true}:{};copyTake=false;
   const fox=glow?{fox:glow}:{},key=JSON.stringify({rect,fox:glow&&{...glow,phaseSeconds:undefined},...copy,...take});
   if(showsFinished()&&!finishTimer)finishTimer=window.setTimeout(clearFinished,FINISHED_MS);
   if(!showing){
    showing=true;lastRect=key;hidden.delete(resumeKey);const restored=restoring?resumeKey:'',show=++shows;settled=false;syncPipOffer();
    // Until the host confirms, page reports may still describe the previous Applet's page.
    void queue('browserShow',{rect,platform,...address?{url:address}:{},...resumeKey?{applet:resumeKey,resume:resuming}:{},...restored?{hold:true}:{},live:livePages(),...fox,...copy}).then(()=>{if(show===shows)settled=true;},e=>{
     // A remembered page the host no longer opens is forgotten; the Applet opens its start page.
     if(restored){forget(restored);renderTabs();if(restored===resumeKey&&restoring){restoring=false;address=fallback;showing=false;lastRect='';geometry();}return;}
     caption.textContent='';notify(e.message);
    });
   }
   else if(key!==lastRect){lastRect=key;void queue('browserLayout',{rect,...fox,...copy,...take});}
  }finally{syncRefresh();syncFocus();syncHistory();resolve();}};
   flushGeometry=update;if(immediate)update();else{animation=requestAnimationFrame(update);timer=window.setTimeout(update,80);}
  });
 }
 const observer=new MutationObserver(()=>geometry(content.hidden));observer.observe(content,{attributes:true,childList:true});observer.observe(root.querySelector('#notionDialog'),{attributes:true,attributeFilter:['open']});
 const resize=new ResizeObserver(geometry);resize.observe(content);
 // Fox's conversation box, which Fox's copy sits above (FOX_COPY): it is watched once it exists, as it grows with Fox's reply.
 let dialogue:HTMLElement|null=null;
 function dialogueRect():SurfaceRect|null {
  const node=root.querySelector('#companionDialogue') as HTMLElement|null;
  if(node&&node!==dialogue){if(dialogue)resize.unobserve(dialogue);dialogue=node;resize.observe(node);observer.observe(node,{attributes:true,attributeFilter:['hidden','class','style']});}
  if(!node||node.hidden||getComputedStyle(node).visibility==='hidden')return null;
  const r=node.getBoundingClientRect();return r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
 }content.addEventListener('animationend',geometry);content.addEventListener('transitionend',geometry);window.addEventListener('resize',geometry);content.addEventListener('scroll',geometry);
 window.addEventListener('worldlet:browser',(event: any)=>{
  const value=event.detail;
  // The window's page reports a press on it, or that the host closed it.
  if(value?.phase==='task-pip'){
   if(taskPip&&value.event==='press')restoreTask();
   // The host closed Fox's page beside the desktop Companion after Fox's turn.
   else if(value.event==='closed'){endTask();taskApplet='';keptAway=false;if(showing){showing=false;lastRect='';}syncPipOffer();}
   return;
  }
  // Fox's copy: a press takes Fox's page into the panel, its close (after Fox's turn) leaves the
  // person's page, and the host says when there is no copy.
  if(value?.phase==='fox-copy'){
   if(value.event==='press'&&copyPage){copyPage=null;copyTake=true;copyOff=true;}
   else if(value.event==='close'&&copyPage&&!foxControl)copyPage=null;
   else if(value.event==='ended'&&copyPage){copyPage=null;if(foxControl)copyOff=true;}
   else return;
   markFoxControl();geometry();return;
  }
  if(value?.phase==='pip'){if(pip&&value.applet===pip){if(value.event==='press')restorePip();else if(value.event==='ended'){pip='';pipWindow.hide();}}return;}
  if(!opened||value.platform&&value.platform!==platform)return;
  if(value.phase==='video'){videoPlaying=value.playing===true;syncPipOffer();return;}
  // A sign-in is saved without asking (owner 2026-10-08); the panel only says so.
  if(value.phase==='login-saved'){if(pageInPanel())notify(loginSavedText(value.update===true?'update':'save',String(value.site||''),String(value.username||'')));return;}
  // A note about the page, such as a sign-in that moved to the website engine.
  if(value.phase==='notice'){if(pageInPanel())notify(String(value.message||''));return;}
  if(value.phase==='open-tab'){openTab(String(value.url||''),value.background===true);return;}
  if(value.phase==='login-fill'){loginFill={site:String(value.site||''),accounts:Array.isArray(value.accounts)?value.accounts.filter((a:unknown)=>typeof a==='string').slice(0,3):[]};syncLogin();return;}
  if(value.phase==='focus'){focusState=value.available?{on:value.on===true,reader:value.reader===true,paused:value.paused===true}:{on:false,reader:false,paused:false,available:false};syncFocus();return;}
  // The page shows in the panel, or in the task window while the person is elsewhere.
  const shown=showing&&(!!taskPip||!!slot?.isConnected&&!content.hidden);
  // The first page the Applet's home address loads is its home too.
  if(value.phase==='page'&&!value.loading&&shown&&landingHome&&value.url){landingHome=false;const landed=appletHomeLanding(appletHome(),String(value.url));if(landed)landedHomes.set(appletKey,landed);}
  if(value.phase==='page'&&!value.loading&&shown&&value.title&&value.url){
   try{const url=new URL(value.url);if(['https:','http:'].includes(url.protocol)&&!/(?:login|signin|oauth|authorize|callback)/i.test(url.pathname)){
    const before=visits.get(appletKey),page={title:String(value.title).slice(0,120),url:url.href};
    visits.set(appletKey,page);if(visits.size>32)visits.delete(visits.keys().next().value);
    // Each website is its own place to talk with Fox: the World hears when the page changes.
    if(before?.url!==page.url||before?.title!==page.title)onPage(appletKey,page,!copyPage&&(foxNavigating||foxControl)||!!taskPip);
   }}catch{}
   // Remember only pages the person reached; a page Fox navigated to stays Fox's, as does any page
   // the task window shows (it takes no input there).
   if(resumeKey&&settled){
    // Beside Fox's copy the panel's page is the person's own.
    if(!copyPage&&(foxNavigating||foxControl)||taskPip)foxPage(value.url);
    else{let href='';try{href=new URL(value.url).href;}catch{}if(!foxPages.has(href))remember(resumeKey,href);}
    // The tab's label follows the page it shows, Fox's pages too.
    if(isBrowserTab(resumeKey)&&appletKey==='browser'){tabs.note(resumeKey,{title:String(value.title||'')},false);renderTabs();}
   }
  }
  if(value.phase==='page'||value.phase==='error'){signInBlocked=value.phase==='error'&&value.signIn==='google';syncSignInOffer();}
  if(value.phase==='page'&&shown){pageHistory={back:value.canBack===true,forward:value.canForward===true};syncHistory();}
  if(value.phase==='page'&&loginFill&&loginSite(value.url)!==loginFill.site){loginFill=null;syncLogin();}
  if(value.phase==='page'){page={title:String(value.title||''),url:String(value.url||'')};syncAppletOffer(value.url||'');syncMakeOffer();syncRefresh();caption.textContent=value.loading?'Loading '+title+'…':'';}
  if(value.phase==='page'&&!value.loading&&shown)onLoaded?.(value.url);
  if(value.phase==='download'){caption.textContent=value.message;notify(value.message);}
  // A link the page's rules kept out says so, on the page the person is looking at (owner report 2026-10-06).
  if(value.phase==='refused'&&showing&&!taskPip&&!!slot?.isConnected&&!content.hidden)notify(value.message);
  if(value.phase==='error'){
   // The Applet panel belongs entirely to the website; Fox owns errors and recovery. Only the
   // page the person is looking at speaks: a page they left, or Fox's page out of sight, failing
   // is not said over the place they are in now (owner report 2026-10-05, Meetings); Fox's own
   // step on that page gets the failure as its result.
   if(showing&&!taskPip&&!!slot?.isConnected&&!content.hidden)notify(value.message);
   caption.textContent='';
  }
  if(value.phase==='saved'){
   caption.textContent=value.fresh?'Saved to Fox · On this device':'Already in your memory';
   notify(value.fresh?'Saved to memory':'Already remembered');
   if(value.fresh){const fox=root.querySelector('.companion-avatar'),from=slot.getBoundingClientRect(),to=fox.getBoundingClientRect();const spark=document.createElement('span');spark.className='browser-memory-flight';spark.textContent='✦';spark.setAttribute('aria-hidden','true');root.append(spark);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const motion=spark.animate([{transform:`translate(${from.x+from.width/2}px,${from.y+15}px) scale(1)`,opacity:1},{transform:`translate(${to.x+to.width/2}px,${to.y+to.height/3}px) scale(.25)`,opacity:0}],{duration:reduced?0:750,easing:'cubic-bezier(.35,0,.2,1)',fill:'forwards'});motion.onfinish=()=>spark.remove();
    fox.animate([{filter:'brightness(1)'},{filter:'brightness(1.3)'},{filter:'brightness(1)'}],{duration:reduced?0:500,delay:reduced?0:500});
   }
  }
 });
 return {
  lastVisit(key){return visits.get(key)||null;},
  mount(key='x',{url=null,onLoad=null,platform:wanted=null,release=false}={}){
   const previous=appletKey;
   // The same Applet drawn again keeps what the host said about its page (Focus): the host says it
   // again only when the page itself changes.
   // Another Applet's page leaves Fox's copy behind (the host closes it with the page).
   if(previous!==key){copyPage=null;copyTake=false;}
   appletKey=key;matchedApplet=null;signInBlocked=false;page={title:'',url:''};if(previous!==key)focusState=null;if(slot)resize.unobserve(slot);videoPlaying=false;
   // The window's own Applet takes its page back into the panel (browserShow), still playing,
   // on the platform it had: a page opened from a link in the Applet is a web page there.
   // A Browser tab's page in the window returns into the Browser as its active tab.
   const returning=pip&&(pip===key||key==='browser'&&isBrowserTab(pip)&&!!tabs.get(pip))?pipPlatform:'';if(returning){if(key==='browser')tabs.select(pip);pip='';pipWindow.hide();}
   // Its own Applet takes the task window's page back into the panel at the same size; another
   // website Applet takes the panel itself (the host keeps or releases the page as `live` says).
   // Either way the person chose where to look for the rest of Fox's turn.
   if(taskPip){taskWatched=true;endTask();}
   // Opening an Applet is seeing what Fox finished there.
   screen.seen(key);
   // Another Applet takes the panel from Fox's page: Fox's steps no longer follow the person.
   if(taskApplet!==key)taskApplet='';
   // A scene Applet keeps its website under `original`: the browser is where its
   // account lives, not where the Applet lives.
   const app=getApp(key),view: any=app?.fullView,site=view?.original||view,target=wanted||returning||site?.platform||key,home=key==='browser'?browserHome.get():site?.url||'https://www.google.com/';
   // Opening an Applet without a specific page resumes its last one: the live hidden
   // page when the host kept it, otherwise the remembered address.
   // A page that moved on to another Applet (`release`, notion-world.ts carryToApplet) is let go: the host closes
   // it, and the Applet it left opens on its own website next time.
   if(previous!==key&&resumeKey&&release){hidden.delete(resumeKey);forget(resumeKey);visits.delete(previous);}
   else if(previous!==key&&resumeKey&&showing&&!hidden.has(resumeKey))hidden.set(resumeKey,Date.now());
   const previousPage=resumeKey;
   resumeKey=appletSite(key)?key:'';resuming=!!resumeKey&&(!url||url===site?.url);
   // The Browser entered again after a while away starts on its home page (core/browser/browser-home.ts),
   // never while its page is in view (a World refresh re-mounts the open Browser): its tabs start again as one.
   if(key==='browser'&&!url&&!returning&&!(previous===key&&showing)&&browserStartsHome(tabs.last(),Date.now())){resuming=false;for(const gone of tabs.reset())hidden.delete(gone);memory.forget(key);}
   // The Browser shows its active tab; a page opened in the Browser opens there.
   const tab=key==='browser'?tabs.active():null;if(tab)resumeKey=tab.key;
   const remembered=!resuming?null:tab?(tab.url&&tab.url!==home?tab.url:null):memory.get(key);
   fallback=url||(target==='web'||target==='notion'?home:null);restoring=!!remembered;
   // A World refresh re-mounting the page in view lands nowhere new.
   landingHome=key!=='browser'&&key!=='web'&&!remembered&&(!url||url===site?.url)&&!(previous===key&&showing);
   const destination=remembered||fallback;
   if(platform!==target||address!==destination||previous!==key||previousPage!==resumeKey){showing=false;lastRect='';pageHistory={back:false,forward:false};}
   platform=target;address=destination;onLoaded=onLoad;title=app?.title||(key==='web'?'the page':'Browser');opened=true;content.dataset.template='browser';content.dataset.applet=app?.key||key;
   // A page opened outside any Applet ('web') keeps the panel's own title and close; Applets show theirs in the top bar.
   if(key!=='web')content.querySelector('.notion-reader-head')?.remove();
   if(!native?.browser){const p=document.createElement('p');p.textContent='Open the Mac app to browse '+title+' here. Browsing does not connect account sync.';const link=document.createElement('a');link.href=address||home;link.target='_blank';link.rel='noopener noreferrer';link.textContent=title+' ↗';content.append(p,link);return;}
   caption=document.createElement('p');caption.className='browser-caption';caption.setAttribute('role','status');caption.textContent='Loading '+title+'…';
   slot=document.createElement('div');slot.className='browser-viewport';slot.setAttribute('aria-label','Native '+title+' browser');markFoxControl();content.append(caption,...key==='browser'?[tabStrip]:[],...key!=='web'?[toolbar]:[],slot);renderTabs();resize.observe(slot);syncAppletOffer(destination||home);syncMakeOffer();geometry();
  },
  async automate(args){if(!['receipts'].includes(args?.operation)){
   // Fox's first step on the page in view: Fox works on a copy, and the person keeps the page (FOX_COPY).
   if(!copyPage&&copyWanted()&&panelRect){copyPage={width:panelRect.width,height:panelRect.height};markFoxControl();geometry();}
   setFoxControl(true);foxNavigating=true;if(args?.operation==='open')foxPage(args.url);}await geometryReady;await pending.catch(()=>{});return command('automate',args,true);},
  foxControl(active:boolean){setFoxControl(active);},
  /** Fox's page is in the task picture-in-picture window: it is still open for Fox's steps. */
  inTaskPicture(){return !!taskPip;},
  /** Fox's steps reach its page wherever the person is in the World: the page is in the task window,
   * or the person took it back from there into the panel this turn (companion-ai's view guard). */
  foxPageHeld(){return !!taskPip||!!taskApplet&&taskApplet===appletKey&&showing||!!copyPage;},
  /** Fox works on its copy of the page in view (FOX_COPY): there is one, or Fox's next step makes one.
   * Pages Fox opens then load in the copy, never in the person's page. */
  foxCopy(){return !!copyPage||copyWanted();},
  async agent(args){
   // Pages Fox reaches this turn are Fox's, including the one it is opening right now.
   if(!['history','saved','records','record','outline','focus'].includes(args.operation)){foxNavigating=true;if(args.operation==='open')foxPage(args.url);}
   // Let the native viewport finish opening before issuing the first agent command.
   await geometryReady;await pending.catch(()=>{});
   if(args.operation==='history')return command('history',{query:args.query||'',after:args.after||'',before:args.before||'',offset:args.offset||0},true);
   if(args.operation==='saved')return command('saved',{query:args.query||''},true);
   // Focus rules for the site open here (core/browser/page-focus.ts): its parts to choose from, then the ones to hide.
   if(args.operation==='outline')return command('outline',{},true);
   if(args.operation==='focus')return command('focus',{hide:Array.isArray(args.hide)?args.hide:null},true);
   // What the built-in browser recorded (core/browser/web-record.ts): search visits, then read one.
   if(args.operation==='records')return command('records',{query:args.query||'',site:args.site||'',after:args.after||'',before:args.before||'',offset:args.offset||0},true);
   if(args.operation==='record')return command('record',{id:args.id||'',query:args.query||'',only:args.only||'',offset:args.offset||0,full:args.full===true},true);
   return command(args.operation,{url:args.url||'',direction:args.direction||'down'},true);
  }
 };
}
