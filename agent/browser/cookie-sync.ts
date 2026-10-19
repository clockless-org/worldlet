// One sign-in across both website engines (owner report 2026-10-08: "有的browser用electron，有的用CEF以后，登录状态不能
// share了"). Website pages run on the CEF engine, and on Electron's own views for the Applets whose video needs H.264
// (X, Douyin, Twitch) or a site seen needing it; each engine keeps its own cookie storage, so signing in on one did
// not reach the other. The host keeps the two alike (platform/electron/src/modules/browser/cookie-bridge.ts):
//
// - A cookie Electron's storage sets or deletes is set or deleted in the engine's at once (or when the engine next runs).
// - The engine has no cookie events, so the host compares its cookies with the last look after each page loads,
//   when a page closes and every half minute while a page shows, and makes the same changes in Electron's storage.
// - The first look at an engine that just started has nothing to compare with: then each side only gains the
//   cookies it lacks, so a stale copy never replaces a fresh sign-in.
//
// Cookies travel only between the two storages of one world on this computer; nothing here is kept or sent elsewhere.

export const COOKIE_SYNC=Object.freeze({
 /** How often a showing engine page's cookies are compared. */
 everyMs:30_000,
 /** How long after a page loads its cookies are compared (sign-ins set cookies over a few redirects). */
 settleMs:1500,
 /** Changes kept for the engine while it does not run. */
 maxPending:5000,
 /** Larger values are not copied (browsers cap a cookie at 4 KB). */
 maxValue:4096,
});

export type SameSite='unspecified'|'no_restriction'|'lax'|'strict';
/** A cookie as both storages are told it: `domain` keeps a leading dot for a domain cookie and has none for a
 * host cookie; `expires` is Unix seconds, 0 for a session cookie. */
export type SyncCookie={name:string;value:string;domain:string;path:string;secure:boolean;httpOnly:boolean;sameSite:SameSite;expires:number};
export type CookiePlan={set:SyncCookie[];remove:SyncCookie[]};

const SAME_SITE:SameSite[]=['unspecified','no_restriction','lax','strict'];
const text=(value:unknown)=>typeof value==='string'?value:'';

/** A cookie either storage reported, or null for anything that is not one. `hostOnly` is Electron's flag; the
 * engine marks a host cookie by its domain without a leading dot. */
export function readSyncCookie(value:unknown):SyncCookie|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>,name=text(row.name),raw=text(row.domain).toLowerCase();
 const bare=raw.replace(/^\./,'');
 if(!bare||/[\s/]/.test(bare)||text(row.value).length>COOKIE_SYNC.maxValue)return null;
 const hostOnly=typeof row.hostOnly==='boolean'?row.hostOnly:!raw.startsWith('.');
 const expires=Number(row.expires??row.expirationDate)||0;
 const path=text(row.path).startsWith('/')?text(row.path):'/';
 return {name,value:text(row.value),domain:hostOnly?bare:'.'+bare,path,secure:row.secure===true,httpOnly:row.httpOnly===true,
  sameSite:SAME_SITE.includes(row.sameSite as SameSite)?row.sameSite as SameSite:'unspecified',expires:expires>0?expires:0};
}

export function cookieKey(cookie:SyncCookie):string {return cookie.domain+'\t'+cookie.path+'\t'+cookie.name;}
/** The address a cookie is set or deleted for. */
export function cookieUrl(cookie:SyncCookie):string {return (cookie.secure?'https':'http')+'://'+cookie.domain.replace(/^\./,'')+cookie.path;}
export const isHostCookie=(cookie:SyncCookie)=>!cookie.domain.startsWith('.');
const same=(a:SyncCookie,b:SyncCookie)=>a.value===b.value&&a.secure===b.secure&&a.httpOnly===b.httpOnly&&a.sameSite===b.sameSite&&Math.round(a.expires)===Math.round(b.expires);
const live=(cookie:SyncCookie,now:number)=>!cookie.expires||cookie.expires*1000>now;

/**
 * What to change in the `target` storage after looking at the `source` one: with a `before` look, the cookies
 * added or changed since then are set and the ones gone are deleted; without one (the first look), only the
 * cookies `target` lacks are set. Expired cookies are never set.
 */
export function cookiePlan({before,after,target,now}:{before:SyncCookie[]|null;after:SyncCookie[];target:SyncCookie[];now:number}):CookiePlan {
 const has=new Map(target.map(cookie=>[cookieKey(cookie),cookie]));
 if(!before)return {set:after.filter(cookie=>live(cookie,now)&&!has.has(cookieKey(cookie))),remove:[]};
 const earlier=new Map(before.map(cookie=>[cookieKey(cookie),cookie])),present=new Set(after.map(cookieKey));
 const set=after.filter(cookie=>{const was=earlier.get(cookieKey(cookie)),there=has.get(cookieKey(cookie));return live(cookie,now)&&(!was||!same(was,cookie))&&!(there&&same(there,cookie));});
 const remove=before.filter(cookie=>!present.has(cookieKey(cookie))&&has.has(cookieKey(cookie)));
 return {set,remove};
}

/** Changes waiting for the engine, by cookie: a later change of one cookie replaces the earlier; the oldest go past the bound. */
export function queueCookieChange(pending:Map<string,{cookie:SyncCookie;removed:boolean}>,cookie:SyncCookie,removed:boolean){
 const key=cookieKey(cookie);pending.delete(key);pending.set(key,{cookie,removed});
 while(pending.size>COOKIE_SYNC.maxPending)pending.delete(pending.keys().next().value!);
}
