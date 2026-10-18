import {resumablePage,type PageStore} from './page-resume.ts';

/**
 * Tabs in the Browser Applet (owner request 2026-10-07: booking flights and hotels needs several
 * pages). Only the generic Browser has them; website Applets (YouTube, X…) keep one page each.
 *
 * - Each tab is its own kept page, keyed like an Applet (`browser`, `browser--2`…), so the panel's
 *   live/hidden pages, the host's budget (budget.ts, `livePagePlan`) and resume do the work: a tab
 *   whose page the host released opens again at its last address when it is picked.
 * - At most `max` tabs. A new tab opens on the Browser's home page (browser-home.ts) at the end and
 *   becomes the active one; closing the active tab moves to its right-hand neighbour, else its left;
 *   closing the last tab leaves one fresh tab on the home page, never an empty Browser.
 * - The tabs, each one's last address the person reached and its title, are kept on this device only,
 *   like the page memory (page-resume.ts); the practice world keeps them in memory. After the
 *   Browser's idle time away (`BROWSER_HOME.idleMs`) the tabs start again as one tab on the home page.
 */
export const BROWSER_TABS=Object.freeze({applet:'browser',max:8,maxTitle:80});
export type BrowserTab={key:string;url:string;title:string};
export type BrowserTabs={tabs:BrowserTab[];active:string};
const STORE_KEY='worldlet-browser-tabs-v1';
const KEY=/^browser(?:--([2-9]|[1-9][0-9]))?$/;

/** Whether a page key is one of the Browser's tabs. */
export function isBrowserTab(key:unknown):key is string {return typeof key==='string'&&KEY.test(key);}
/** The Applet a page key belongs to: the Browser for each of its tabs, otherwise the key itself. */
export function tabApplet(key:string):string {return isBrowserTab(key)?BROWSER_TABS.applet:key;}
const keyAt=(n:number)=>n===1?BROWSER_TABS.applet:BROWSER_TABS.applet+'--'+n;
/** The first free key, never one just closed (`avoid`), so a new tab never reuses that tab's page. */
function freeKey(tabs:BrowserTab[],avoid=''):string {
 for(let n=1;n<=99;n++){const key=keyAt(n);if(key!==avoid&&!tabs.some(tab=>tab.key===key))return key;}
 return keyAt(99);
}
const tidy=(title:unknown)=>String(title??'').replace(/\s+/g,' ').trim().slice(0,BROWSER_TABS.maxTitle);

export function browserTabsStart(home:string):BrowserTabs {return {tabs:[{key:BROWSER_TABS.applet,url:home,title:''}],active:BROWSER_TABS.applet};}
export function activeTab(state:BrowserTabs):BrowserTab {return state.tabs.find(tab=>tab.key===state.active)??state.tabs[0];}
/** Whether another tab can open. */
export function canAddTab(state:BrowserTabs):boolean {return state.tabs.length<BROWSER_TABS.max;}
/** A new tab on `url` (the home page, or a link opened for a new tab) at the end, now the active one, or behind
 * the active one for a link opened in the background (⌘-click); unchanged at `max` tabs. */
export function addTab(state:BrowserTabs,url:string,background=false):BrowserTabs {
 if(!canAddTab(state))return state;
 const key=freeKey(state.tabs);
 return {tabs:[...state.tabs,{key,url,title:''}],active:background?state.active:key};
}
export function selectTab(state:BrowserTabs,key:string):BrowserTabs {return state.tabs.some(tab=>tab.key===key)?{...state,active:key}:state;}
/** The tab `step` places from the active one, round the ends (⌘⇧] is +1, ⌘⇧[ is -1). */
export function stepTab(state:BrowserTabs,step:number):BrowserTabs {
 const index=state.tabs.findIndex(tab=>tab.key===state.active),count=state.tabs.length;
 return {...state,active:state.tabs[((index+step)%count+count)%count].key};
}
/** Closes a tab. The active one hands over to its right-hand neighbour, else its left; the last tab
 * leaves one fresh tab on `home` under a new key, so its page is released, not reused. */
export function closeTab(state:BrowserTabs,key:string,home:string):BrowserTabs {
 const index=state.tabs.findIndex(tab=>tab.key===key);if(index<0)return state;
 const tabs=state.tabs.filter(tab=>tab.key!==key);
 if(!tabs.length){const fresh=freeKey([],key);return {tabs:[{key:fresh,url:home,title:''}],active:fresh};}
 if(state.active!==key)return {...state,tabs};
 return {tabs,active:(tabs[index]??tabs[index-1]).key};
}
/** What a tab's page reported: its title for the label, and the address to reopen it at when the
 * person reached it (Fox's pages and sign-in pages are not remembered: `remember` false, page-resume.ts). */
export function noteTabPage(state:BrowserTabs,key:string,page:{url?:string;title?:string},remember=true):BrowserTabs {
 const url=remember?resumablePage(BROWSER_TABS.applet,page.url):null,title=page.title===undefined?undefined:tidy(page.title);
 let changed=false;
 const tabs=state.tabs.map(tab=>{
  if(tab.key!==key)return tab;
  const next={...tab,...url?{url}:{},...title!==undefined?{title}:{}};
  changed=next.url!==tab.url||next.title!==tab.title;return next;
 });
 return changed?{...state,tabs}:state;
}
/** A tab's label: its page's title, else the site's name, else New tab. */
export function tabLabel(tab:BrowserTab):string {
 if(tab.title)return tab.title;
 try{const host=new URL(tab.url).hostname.replace(/^www\./,'');if(host)return host;}catch{}
 return 'New tab';
}
/** A page's address as the top bar shows it: no scheme, `www.` or lone trailing slash, readable characters
 *  (x.com/home, zh.wikipedia.org/wiki/狐); the bar's title cuts what does not fit. Not a web address: shown whole. */
export function pageAddress(url:string):string {
 let parsed:URL;try{parsed=new URL(url);}catch{return url;}
 if(!/^https?:$/.test(parsed.protocol))return url;
 let shown=parsed.hostname.replace(/^www\./,'')+(parsed.port?':'+parsed.port:'')+parsed.pathname+parsed.search+parsed.hash;
 if(parsed.pathname==='/'&&!parsed.search&&!parsed.hash)shown=shown.slice(0,-1);
 try{return decodeURI(shown);}catch{return shown;}
}
/** Reads stored tabs: valid keys once each, at most `max`, addresses revalidated (resumablePage); else null. */
export function readBrowserTabs(value:unknown,home:string):BrowserTabs|null {
 const saved=value&&typeof value==='object'?value as {tabs?:unknown;active?:unknown}:null;
 if(!saved||!Array.isArray(saved.tabs))return null;
 const tabs:BrowserTab[]=[];
 for(const item of saved.tabs.slice(0,BROWSER_TABS.max)){
  const key=(item as any)?.key;if(!isBrowserTab(key)||tabs.some(tab=>tab.key===key))continue;
  tabs.push({key,url:resumablePage(BROWSER_TABS.applet,(item as any).url)||home,title:tidy((item as any).title)});
 }
 if(!tabs.length)return null;
 return {tabs,active:tabs.some(tab=>tab.key===saved.active)?saved.active as string:tabs[0].key};
}

/**
 * The Browser's tabs on this device. With `storage` they survive restarts; without one (the practice
 * world) they last for this page session. `seed` is the Browser's one remembered page from before tabs
 * (page-resume.ts), which becomes the first tab once.
 */
export function createBrowserTabs(storage:PageStore|null,home:()=>string,seed:{url:string|null;at:number|null}={url:null,at:null}){
 let state:BrowserTabs,seen:number|null=null;
 try{
  const saved=JSON.parse(storage?.getItem(STORE_KEY)||'null');
  state=saved?.version===1&&readBrowserTabs(saved,home())||null as any;
  if(state&&Number.isFinite(saved.at))seen=saved.at;
 }catch{state=null as any;}
 if(!state){state=browserTabsStart(seed.url||home());seen=seed.at;}
 const save=()=>{try{storage?.setItem(STORE_KEY,JSON.stringify({version:1,...state,at:seen}));}catch{}};
 const apply=(next:BrowserTabs)=>{if(next!==state){state=next;save();}return state;};
 return {
  get state(){return state;},
  active:()=>activeTab(state),
  get:(key:string)=>state.tabs.find(tab=>tab.key===key)??null,
  add:(url=home(),background=false)=>apply(addTab(state,url,background)),
  select:(key:string)=>apply(selectTab(state,key)),
  step:(step:number)=>apply(stepTab(state,step)),
  close:(key:string)=>apply(closeTab(state,key,home())),
  note:(key:string,page:{url?:string;title?:string},remember=true)=>apply(noteTabPage(state,key,page,remember)),
  /** A tab whose remembered page no longer opens goes back to the home page. */
  forget:(key:string)=>apply({...state,tabs:state.tabs.map(tab=>tab.key===key?{...tab,url:home(),title:''}:tab)}),
  /** Starts again: one tab on the home page (after the idle time away). Returns the keys that went. */
  reset(){const gone=state.tabs.map(tab=>tab.key);state=browserTabsStart(home());save();return gone;},
  /** When the Browser was last in view (browser-home.ts `browserStartsHome`). */
  seen(now=Date.now()){seen=now;save();},
  last:():number|null=>seen,
 };
}
