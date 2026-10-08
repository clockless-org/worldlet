import type {BrowserVisit} from '../../contracts/browser-history.ts';
import {characters} from '../companion/index.ts';
const clip=(value:string,count:number)=>characters(value).slice(0,count).join('');
const normalized=(value:string)=>value.normalize('NFC').toLowerCase();
const privateHosts=['accounts.google.com','appleid.apple.com','mail.google.com','outlook.live.com','outlook.office.com','calendar.google.com','notion.so','notion.site','notion.com','discord.com','slack.com'];
const privatePath=/(^|\/)(login|signin|sign-in|oauth|authorize|callback|checkout|payment|account|settings|messages|inbox)(\/|$)/i;
// Like Uri.UnescapeDataString: decode valid UTF-8 escape runs and keep malformed bytes literally.
const unescaped=(value:string)=>value.replace(/(%[0-9A-Fa-f]{2})+/g,run=>{try{return decodeURIComponent(run);}catch{return run.replace(/%[0-7][0-9A-Fa-f]/g,decodeURIComponent);}});
/** The history destination for a host-parsed public HTTPS page, or null when it must not be remembered.
 * Hosts keep the public-page gate and URL parsing; host engines have no URL class, so this is string-only. */
export function browserHistoryDestination(url:string):string|null {
 if(typeof url!=='string'||url.length>4096)return null;
 const hash=url.indexOf('#'),fragment=hash<0?null:url.slice(hash+1),page=hash<0?url:url.slice(0,hash);
 const mark=page.indexOf('?'),base=mark<0?page:page.slice(0,mark),query=mark<0?'':page.slice(mark+1);
 const address=/^https:\/\/([^/]+)(.*)$/i.exec(base);if(!address)return null;
 const host=address[1].toLowerCase().replace(/\.$/,'');
 if(privateHosts.some(name=>host===name||host.endsWith('.'+name))||privatePath.test(unescaped(address[2])))return null;
 const parts=query.split('&').filter(Boolean),key=(part:string)=>unescaped(part.split('=')[0]).toLowerCase();
 if(parts.some(part=>/token|secret|password|code|session|signature|credential/.test(key(part)))||/token=|secret=|code=|session=/i.test(unescaped(fragment??'')))return null;
 const kept=parts.filter(part=>!key(part).startsWith('utm_')&&key(part)!=='fbclid'&&key(part)!=='gclid');
 return base+(kept.length?'?'+kept.join('&'):'')+(fragment===null?'':'#'+fragment);
}
export function recordBrowserVisit(visits:BrowserVisit[],item:BrowserVisit,sameDay:boolean[]):BrowserVisit[]|null {
 const next=visits.slice();
 const bounded={...item,title:clip(item.title,240),text:clip(item.text,6000)};
 let index=-1;for(let i=visits.length-1;i>=0;i--)if(visits[i].url.normalize('NFC')===item.url.normalize('NFC')&&sameDay[i]){index=i;break;}
 if(index>=0){const previous=visits[index];if(previous.title.normalize('NFC')===bounded.title.normalize('NFC')&&previous.text.normalize('NFC')===bounded.text.normalize('NFC')&&item.visitedAt-previous.visitedAt<300)return null;next.splice(index,1);}
 next.push(bounded);return next.slice(-10000);
}
export function searchBrowserHistory(visits:BrowserVisit[],query:string,offset:number,after:number|null,before:number|null){
 const terms=normalized(query).split(/[\s\u0085]+/u).filter(Boolean);
 const ranked=visits.filter(v=>(after===null||v.visitedAt>=after)&&(before===null||v.visitedAt<before)).map(visit=>{
  const title=normalized(visit.title+' '+visit.url),text=normalized(visit.text);
  return {visit,score:terms.reduce((score,term)=>score+(title.includes(term)?3:text.includes(term)?1:0),0)};
 }).filter(v=>!terms.length||v.score>0).sort((a,b)=>b.score-a.score||b.visit.visitedAt-a.visit.visitedAt);
 const seen=new Set<string>();const unique=ranked.filter(({visit})=>{const key=visit.url.normalize('NFC');if(seen.has(key))return false;seen.add(key);return true;});
 const start=Number.isInteger(offset)?Math.max(0,offset):0;
 return {items:unique.slice(start,start+12).map(({visit})=>({...visit,text:clip(visit.text,2200)})),total:unique.length,offset:start,untrustedContent:true,scope:'Pages visited inside Worldlet only; snippets may be incomplete. Times are actual visits, not page publication dates.'};
}
