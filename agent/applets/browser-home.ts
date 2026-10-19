import {typedAddress} from './typed-address.ts';
import type {PageStore} from './page-resume.ts';

/**
 * The Browser Applet's home page (owner request 2026-10-06). The Browser is entered only from its
 * own entry; pages opened from anywhere else open where the person is, not in it. Entering it again
 * within `idleMs` of leaving resumes the page that was showing; after that it starts on the home
 * page, Google unless the person chose another in Settings › General. Kept on this device only.
 */
export const BROWSER_HOME=Object.freeze({url:'https://www.google.com/',idleMs:30*60_000});
const STORE_KEY='worldlet-browser-home-v1';

/** The home page an address typed in Settings names, or null: an https page like the Browser's own address bar takes. */
export function browserHomePage(raw:unknown):string|null {return typedAddress(String(raw??''));}

export function createBrowserHome(storage:PageStore|null){
 // Read each time: Settings and the Browser panel each hold one, on the same storage.
 let kept='';
 const get=()=>{try{kept=browserHomePage(storage?.getItem(STORE_KEY)||'')||'';}catch{}return kept||BROWSER_HOME.url;};
 return {
  get,
  /** Saves a new home page; '' goes back to Google. Returns the page now in use, or null when the address is not one. */
  set(raw:string):string|null {
   const value=String(raw??'').trim(),page=value?browserHomePage(value):null;
   if(value&&!page)return null;
   kept=page&&page!==BROWSER_HOME.url?page:'';
   try{storage?.setItem(STORE_KEY,kept);}catch{}
   return kept||BROWSER_HOME.url;
  },
 };
}

/** Whether a page is the home page itself (its address without the fragment): Home shows only once the page has gone somewhere else (owner request 2026-10-07). */
export function atBrowserHome(url:string,home:string):boolean {
 try{const page=new URL(url),start=new URL(home);page.hash='';start.hash='';return page.href===start.href;}catch{return false;}
}

/** Whether entering the Browser starts on the home page: it was last seen `idleMs` or longer ago. Never seen: no page to resume anyway. */
export function browserStartsHome(lastSeen:number|null,now:number):boolean {
 return Number.isFinite(lastSeen)&&now-(lastSeen as number)>=BROWSER_HOME.idleMs;
}

/** A page's place on its site for Home on a website Applet: its origin and path, without a trailing slash, query or fragment. */
function sitePlace(raw:string):string|null {
 try{const u=new URL(raw);return u.protocol==='https:'||u.protocol==='http:'?u.origin+u.pathname.replace(/\/+$/,''):null;}catch{return null;}
}
const AUTH_PLACE=/(?:^|[/._-])(?:log-?in|sign-?in|sign-?up|oauth2?|authori[sz]e|callback|sso)(?=$|[/._-])/i;

/**
 * Whether a website Applet's page is its home page (owner request 2026-10-08: a kid on 小红书 could not get back):
 * the address the Applet opens at, or the page that address first landed on (a redirect), its query and fragment aside.
 * Home shows on every other page.
 */
export function atAppletHome(url:string,homes:readonly string[]):boolean {
 const place=sitePlace(url);return !!place&&homes.some(home=>!!home&&sitePlace(home)===place);
}

/** The page a website Applet's home address landed on, kept as its home too, or null: only a page on the same site, never a sign-in page. */
export function appletHomeLanding(home:string,url:string):string|null {
 try{
  const start=new URL(home),page=new URL(url),site=(u:URL)=>u.hostname.toLowerCase().replace(/^www\./,'');
  return site(start)===site(page)&&!AUTH_PLACE.test(page.pathname)&&sitePlace(page.href)?page.href:null;
 }catch{return null;}
}
