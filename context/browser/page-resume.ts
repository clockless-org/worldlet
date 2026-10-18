import {getApp} from '../applets/index.ts';

/**
 * Resume where the person left off in a website Applet.
 *
 * - `livePages` hidden pages stay alive (media paused and muted) for `liveMs` after
 *   the person leaves, so returning is instant and keeps scroll, form input and video
 *   position. Hosts release them sooner under memory pressure (`PAGE_MEMORY`).
 * - After release or a restart the Applet reopens its last remembered page instead.
 *   At most `remembered` Applets keep one page each, on this device only.
 */
export const PAGE_RESUME=Object.freeze({livePages:2,liveMs:10*60_000,remembered:48,maxURL:4096});

/**
 * Memory pressure for live pages. Every `sampleMs` while a page is kept, the host reads free
 * system memory and the app's footprint (all its processes); while either crosses its bound it
 * releases the oldest kept page, one per reading. The visible and picture-in-picture pages stay.
 * Free memory is low below `minFreeMB` or `minFreeShare` of the total, whichever is smaller.
 */
export const PAGE_MEMORY=Object.freeze({sampleMs:30_000,minFreeMB:512,minFreeShare:0.05,maxAppMB:3072});
/** `freeMB` is memory the system can hand out now (on macOS free, inactive, speculative and purgeable pages, not
 * only free ones); `appMB` counts every process of the app, the website engine's included; `pressure` is the
 * system's own memory-pressure level where it reports one (macOS). */
export type MemoryReading={freeMB:number;totalMB:number;appMB:number;pressure?:'normal'|'warn'|'critical'};
/** Why kept pages should go now, or null; an unreadable reading never releases a page. */
export function memoryPressure(reading:MemoryReading|null):'lowMemory'|'appFootprint'|null {
 if(!reading)return null;
 const {freeMB,totalMB,appMB}=reading;
 if(reading.pressure==='warn'||reading.pressure==='critical')return 'lowMemory';
 if(Number.isFinite(freeMB)&&Number.isFinite(totalMB)&&totalMB>0&&freeMB>=0&&freeMB<Math.min(PAGE_MEMORY.minFreeMB,totalMB*PAGE_MEMORY.minFreeShare))return 'lowMemory';
 if(Number.isFinite(appMB)&&appMB>PAGE_MEMORY.maxAppMB)return 'appFootprint';
 return null;
}

type Page={url:string;at:number};
export interface PageStore {getItem(key:string):string|null;setItem(key:string,value:string):void}
const STORE_KEY='worldlet-applet-pages-v1';

// Site-locked browser platforms open only their own site. Keep identical to
// BrowserDevice.sitePage (Mac); contracts/fixtures/parity/browser-applet-site.json replays both.
const exact=(...hosts:string[])=>(u:URL)=>hosts.includes(u.hostname);
const SITES:Record<string,(u:URL)=>boolean>={
 x:exact('x.com','www.x.com','twitter.com','www.twitter.com'),
 youtube:exact('youtube.com','www.youtube.com','m.youtube.com','youtu.be'),
 tiktok:exact('tiktok.com','www.tiktok.com','m.tiktok.com'),
 airbnb:u=>u.hostname==='airbnb.com'||u.hostname.endsWith('.airbnb.com'),
 'google-maps':u=>u.hostname==='maps.google.com'||['google.com','www.google.com'].includes(u.hostname)&&(u.pathname==='/maps'||u.pathname.startsWith('/maps/')),
};
function https(raw:unknown){
 if(typeof raw!=='string'||!raw||raw.length>PAGE_RESUME.maxURL)return null;
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')?u:null;}catch{return null;}
}
/** Whether a site-locked platform opens this address. */
export function sitePage(platform:string,raw:unknown):boolean {const u=https(raw);return !!u&&!!SITES[platform]?.(u);}

/** The website an Applet opens in the Browser panel, or null when it has none. */
export function appletSite(key:string):{url:string;platform:string}|null {
 const view:any=getApp(key)?.fullView,site=view?.original||view;
 if(!site?.url||!['web','launcher','scene'].includes(view.kind))return null;
 return {url:site.url,platform:site.platform||key};
}

// Sign-in, consent and callback pages carry one-time state; reopening them later fails or repeats a step.
const AUTH_PATH=/(?:^|[/._-])(?:log-?in|log-?out|sign-?in|sign-?up|oauth2?|authori[sz]e|callback|sso)(?=$|[/._-])/i;
const AUTH_HOSTS=new Set(['accounts.google.com','appleid.apple.com','login.microsoftonline.com','login.live.com']);
/**
 * The address to remember for this Applet, or null. Only public HTTPS pages the
 * person reached in that Applet qualify; a site-locked Applet keeps only its own site.
 */
export function resumablePage(key:string,raw:unknown):string|null {
 const site=appletSite(key),u=https(raw);
 if(!site||!u||AUTH_HOSTS.has(u.hostname)||AUTH_PATH.test(u.pathname))return null;
 if(site.platform!=='web'&&!SITES[site.platform]?.(u))return null;
 return u.href;
}

/**
 * Last page per Applet. With `storage` it survives restarts on this device; without
 * one (the practice world) it lasts only for this page session and never reads the
 * real world's pages.
 */
export function createPageMemory(storage:PageStore|null){
 let pages:Record<string,Page>={};
 try{
  const saved=JSON.parse(storage?.getItem(STORE_KEY)||'null');
  if(saved?.version===1&&saved.pages&&typeof saved.pages==='object')
   for(const [key,page] of Object.entries<any>(saved.pages))if(resumablePage(key,page?.url)&&Number.isFinite(page.at))pages[key]={url:page.url,at:page.at};
 }catch{}
 const save=()=>{try{storage?.setItem(STORE_KEY,JSON.stringify({version:1,pages}));}catch{}};
 return {
  get(key:string):string|null {return pages[key]?.url||null;},
  remember(key:string,raw:unknown,now=Date.now()):boolean {
   const url=resumablePage(key,raw);if(!url)return false;
   if(pages[key]?.url===url)return false;
   pages[key]={url,at:now};
   const keys=Object.keys(pages).sort((a,b)=>pages[b].at-pages[a].at);
   for(const old of keys.slice(PAGE_RESUME.remembered))delete pages[old];
   save();return true;
  },
  forget(key:string){if(!pages[key])return;delete pages[key];save();},
  /** When the remembered page was last in view: its visit, or the person leaving it (browser-home.ts). */
  seen(key:string,now=Date.now()){if(!pages[key])return;pages[key].at=now;save();},
  last(key:string):number|null {return pages[key]?.at??null;},
 };
}

/**
 * Which kept Applet pages the host may keep alive now: the most recently left hidden
 * pages, each for `liveMs`, `livePages` in all (the host's budget, budget.ts; `PAGE_RESUME.livePages`
 * without one). A picture-in-picture page (`pip`, see picture-in-picture.ts) is live for as long
 * as it shows and takes one of those places. `nextCheck` is when this answer next changes.
 */
export function livePagePlan(hidden:ReadonlyMap<string,number>,now:number,pip:string|null=null,livePages:number=PAGE_RESUME.livePages):{live:string[];nextCheck:number|null} {
 const fresh=[...hidden].filter(([key,at])=>key!==pip&&now-at<PAGE_RESUME.liveMs).sort((a,b)=>b[1]-a[1]).slice(0,Math.max(0,livePages-(pip?1:0)));
 return {live:[...pip?[pip]:[],...fresh.map(([key])=>key)],nextCheck:fresh.length?Math.min(...fresh.map(([,at])=>at+PAGE_RESUME.liveMs)):null};
}
