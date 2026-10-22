// Native URL facts of the website panel (Mac BrowserDevice / BrowserPublicPage / popup-policy.h).
// contracts/fixtures/parity/browser-public-page.json and browser-popup.json replay these rules.
// WHATWG URL parsing is Chromium's own canonicalization, so hosts are judged as the page sees them.
export const HOMES:Record<string,string>={web:'https://www.google.com/',airbnb:'https://www.airbnb.com/','google-maps':'https://www.google.com/maps/',notion:'https://www.notion.so/login',x:'https://x.com/home',youtube:'https://www.youtube.com/',tiktok:'https://www.tiktok.com/'};
export const SIGN_IN_HOSTS=['accounts.google.com','appleid.apple.com'];
export function parse(raw:unknown):URL|null {if(typeof raw!=='string')return null;try{return new URL(raw);}catch{return null;}}
const secure=(url:URL|null):url is URL=>!!url&&url.protocol==='https:'&&!url.username&&!url.password;
export function publicPage(raw:unknown):boolean {
 const url=raw instanceof URL?raw:parse(raw);
 if(!secure(url)||url.port&&url.port!=='443')return false;
 let host=url.hostname.toLowerCase();
 if(host.endsWith('.'))host=host.slice(0,-1);
 const labels=host.split('.');
 if(labels.length<2||labels.includes('')||host.includes(':'))return false;
 if(['.localhost','.local','.invalid'].some(suffix=>host.endsWith(suffix)))return false;
 // A numeric last label (decimal, octal or 0x hex) makes the whole host an IPv4 address.
 const last=labels[labels.length-1];
 return !(/^[0-9]+$/.test(last)||/^0x[0-9a-f]*$/.test(last));
}
/** The https:// address an http:// page on a public host opens at, as Chrome's HTTPS-Upgrades do; null for anything else.
 * Sites still send people to http:// addresses: Xiaohongshu's QR sign-in returns to http://www.xiaohongshu.com/explore,
 * and refusing that navigation left a white page after the scan (owner report 2026-10-05). */
export function httpsUpgrade(raw:unknown):string|null {
 const url=raw instanceof URL?parse(raw.href):parse(raw);
 // The default port 80 is already dropped by parsing; any other port keeps the page refused.
 if(!url||url.protocol!=='http:'||url.username||url.password||url.port)return null;
 url.protocol='https:';
 return publicPage(url)?url.href:null;
}
const hostOf=(url:URL)=>url.hostname.toLowerCase();
/** A main document on an account sign-in host; the panel never inspects or automates it (#1089). */
export function signInPage(raw:unknown){const url=raw instanceof URL?raw:parse(raw);return secure(url)&&SIGN_IN_HOSTS.includes(hostOf(url));}
export function isX(raw:unknown){const url=raw instanceof URL?raw:parse(raw);return secure(url)&&['x.com','www.x.com','twitter.com','www.twitter.com'].includes(hostOf(url));}
export function isGoogleMaps(raw:unknown){
 const url=raw instanceof URL?raw:parse(raw);if(!secure(url))return false;
 const host=hostOf(url);
 return (host==='maps.google.com'||host==='www.google.com'||host==='google.com')&&(host==='maps.google.com'||url.pathname==='/maps'||url.pathname.startsWith('/maps/'));
}
export function isNotion(raw:unknown){
 const url=raw instanceof URL?raw:parse(raw);if(!secure(url))return false;
 const host=hostOf(url);return ['notion.so','notion.com','notion.site'].some(name=>host===name||host.endsWith('.'+name));
}
export const MAX_POPUPS=4;
/** A user gesture, fewer than MAX_POPUPS open windows and a public page (or an http:// one it upgrades) or blank start. */
export function popupAllowed(gesture:boolean,open:number,url:string){return gesture&&open<MAX_POPUPS&&(!url||url==='about:blank'||publicPage(url)||httpsUpgrade(url)!==null);}
/** A link the person opened for a new tab (a `tab` disposition) on a public page, not an account sign-in page: in a Browser tab it opens the next tab. */
export function opensAsTab(gesture:boolean,tab:boolean,url:string){return gesture&&tab&&!signInPage(url)&&(publicPage(url)||httpsUpgrade(url)!==null);}
export const sameURL=(a:string|null|undefined,b:string|null|undefined)=>{const x=parse(a),y=parse(b);return !!x&&!!y&&x.href===y.href;};
