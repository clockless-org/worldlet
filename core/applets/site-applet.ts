import type {WorldApp} from './catalog.ts';
// Website Applets the person makes from the built-in Browser (owner request 2026-10-05): the button at the top of the
// Browser turns the web app open there into an Applet of its own. It opens that site's page in the same browser
// session (sign-ins carry over), under the site's name and icon, and stands on the Home ground at once. None is in the
// catalog; each made one is a record in this World's `site-applets` bucket until the person deletes it.

export const SITE_APPLET_LIMITS={applets:40,title:40,icon:96_000} as const;
/** The painted device every made website Applet stands on: the Browser's, with the site's icon over it. */
export const SITE_APPLET_ART='browser';
const PALETTE=['#5f7f8f','#7a6a92','#6f8c5a','#a0714f','#4f7a6a','#8a5f6f','#6a7fa0','#8f8350'];

export interface SiteAppletRecord {id:string;title:string;url:string;host:string;color:string;icon:string;createdAt:number}

export const siteAppletId=(id:string)=>'app-'+id;
export const validSiteAppletId=(id:unknown):id is string=>typeof id==='string'&&/^site-[a-z0-9]{6,32}$/.test(id);

/** The page a made Applet opens: a public HTTPS page that is not a sign-in step, without its fragment. */
export function siteAppletPage(raw:unknown):URL|null {
 let url:URL;try{url=new URL(String(raw));}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return null;
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!host.includes('.')||host==='localhost'||/^[\d.]+$/.test(host)||host.includes(':'))return null;
 if(/(?:^|\/)(?:login|signin|sign-in|oauth|oauth2|authorize|callback)(?:\/|$)/i.test(url.pathname))return null;
 url.hash='';return url;
}
const siteHost=(url:URL)=>url.hostname.toLowerCase().replace(/^www\./,'');

/** The site's name: the part of the page title that names the site ("Inbox - Linear" → "Linear"), else its host. */
export function siteAppletName(title:unknown,url:URL):string {
 const host=siteHost(url),words=host.split('.').filter(w=>w.length>2&&!['com','org','net','app','dev','www'].includes(w));
 const parts=String(title??'').replace(/\s+/g,' ').split(/\s+[-|·—–:•]\s+/).map(p=>p.trim()).filter(Boolean);
 const named=parts.find(p=>words.some(w=>p.toLowerCase().replace(/[^a-z0-9]/g,'').includes(w.replace(/[^a-z0-9]/g,''))));
 const fallback=host.split('.').slice(-2)[0]??host,base=fallback.charAt(0).toUpperCase()+fallback.slice(1);
 const name=named??(parts.length>1&&parts.at(-1)!.length<=24?parts.at(-1)!:parts.length===1&&parts[0].length<=24?parts[0]:base);
 return [...name].slice(0,SITE_APPLET_LIMITS.title).join('');
}

/** A new made Applet's record. `icon` is a data: image the host read, or empty for none. */
export function siteAppletRecord({url,title,icon=''}:{url:URL;title:unknown;icon?:string},{id,now}:{id:string;now:number}):SiteAppletRecord {
 const host=siteHost(url);let hash=0;for(const c of host)hash=(hash*31+c.charCodeAt(0))>>>0;
 return {id,title:siteAppletName(title,url),url:url.href,host,color:PALETTE[hash%PALETTE.length],
  icon:/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(icon)&&icon.length<=SITE_APPLET_LIMITS.icon?icon:'',createdAt:now};
}

export function readSiteApplet(row:unknown):SiteAppletRecord|null {
 const r=row as any;const url=siteAppletPage(r?.url);
 if(!r||!validSiteAppletId(r.id)||!url||typeof r.title!=='string'||!r.title.trim()||typeof r.createdAt!=='number')return null;
 return {id:r.id,title:r.title.slice(0,SITE_APPLET_LIMITS.title),url:url.href,host:siteHost(url),color:typeof r.color==='string'&&/^#[0-9a-f]{6}$/i.test(r.color)?r.color:PALETTE[0],
  icon:typeof r.icon==='string'&&r.icon.startsWith('data:image/')&&r.icon.length<=SITE_APPLET_LIMITS.icon?r.icon:'',createdAt:r.createdAt};
}

/** The made Applet already standing for this page's site, if any: one Applet per site. */
export function siteAppletFor(records:readonly SiteAppletRecord[],raw:unknown):SiteAppletRecord|null {
 const url=siteAppletPage(raw);if(!url)return null;
 const host=siteHost(url);return records.find(r=>r.host===host)??null;
}

/** One made website Applet as the World places it: on the Home ground, the site's name, its live page. */
export function siteApplet(record:SiteAppletRecord):WorldApp {
 return {
  id:siteAppletId(record.id),key:record.id,title:record.title,region:'home',version:1,
  description:`${record.host}, made into an Applet from the Browser. It opens the site's own page with your sign-ins.`,
  purpose:'Open '+record.title,
  fullView:{kind:'web',url:record.url,platform:'web'},scene:{template:'device',color:record.color,renderer:'painted-device',version:1},
  connection:{kind:'embedded-browser',provider:null,capability:'browser'},content:{activity:'Browsing'},installByDefault:false,
  art:SITE_APPLET_ART,mine:'site',icon:record.icon||undefined,site:{id:record.id,host:record.host,createdAt:record.createdAt},
  // It comes into the World as if just used, so it stands among the Home ground's recent places.
  arrivedAt:record.createdAt*1000,
  shape:'device',color:record.color,provider:undefined,capability:'browser',
 } as WorldApp;
}
