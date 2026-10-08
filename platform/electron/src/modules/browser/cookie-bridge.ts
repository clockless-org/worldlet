import {session,type Cookie,type Session} from 'electron';
import {COOKIE_SYNC,cookieKey,cookiePlan,cookieUrl,isHostCookie,queueCookieChange,readSyncCookie,type SyncCookie} from '../../../../../core/browser/index.ts';
import type {WebEngine} from './engine/process.ts';

type Scope='personal'|'practice';
const partition=(scope:Scope)=>scope==='practice'?'persist:website-practice':'persist:website';
const bridges=new Map<Scope,CookieBridge>();

/** The bridge of a world's website storage, made once per world (core/browser/cookie-sync.ts says what it does). */
export function cookieBridge(scope:Scope,engine:WebEngine):CookieBridge {
 let bridge=bridges.get(scope);
 if(!bridge){bridge=new CookieBridge(scope,engine,session.fromPartition(partition(scope)));bridges.set(scope,bridge);}
 return bridge;
}

const fromElectron=(cookie:Cookie)=>readSyncCookie(cookie);
const toEngine=(cookie:SyncCookie)=>({...cookie,url:cookieUrl(cookie),domain:isHostCookie(cookie)?'':cookie.domain});

/**
 * Keeps Electron's website storage and the CEF engine's alike for one world, so a sign-in on either engine holds
 * on the other (owner report 2026-10-08). Native IO only; the rules are core/browser/cookie-sync.ts.
 */
export class CookieBridge {
 private readonly scope:Scope;
 private readonly engine:WebEngine;
 private readonly session:Session;
 /** The engine's cookies at the last look, for the engine process that was looked at. */
 private seen:{pid:number,cookies:SyncCookie[]}|null=null;
 /** Electron's changes not yet in the engine (it was not running, or had not been looked at yet). */
 private readonly pending=new Map<string,{cookie:SyncCookie;removed:boolean}>();
 /** Cookies this bridge is writing into Electron's storage: their change events are its own. */
 private readonly writing=new Set<string>();
 private pulling:Promise<void>|null=null;
 private again=false;
 private settle:ReturnType<typeof setTimeout>|null=null;
 private timer:ReturnType<typeof setInterval>|null=null;
 private showing=()=>false;

 constructor(scope:Scope,engine:WebEngine,store:Session){
  this.scope=scope;this.engine=engine;this.session=store;
  store.cookies.on('changed',(_event,cookie,cause,removed)=>{
   // An overwrite reports the old cookie removed, then the new one set.
   if(removed&&cause==='overwrite')return;
   const value=fromElectron(cookie);if(!value||this.writing.has(cookieKey(value)))return;
   queueCookieChange(this.pending,value,removed);
   if(this.seen&&this.seen.pid===this.engine.pid)this.flush();
  });
 }

 /** The engine is about to open a page: settles once the engine has Electron's cookies (messages to the engine keep
  * their order), at most `COOKIE_SYNC.settleMs` later, so the page's first load is already signed in.
  * `showing` says whether one of its pages still shows, for the half-minute looks. */
 beforeEnginePage(showing:()=>boolean):Promise<void> {
  this.showing=showing;
  const looked=this.engine.start().then(()=>this.seen&&this.seen.pid===this.engine.pid?this.flush():this.pull(),()=>{});
  this.ensureTimer();
  return Promise.race([looked,new Promise<void>(resolve=>{setTimeout(resolve,COOKIE_SYNC.settleMs).unref?.();})]);
 }
 private ensureTimer(){
  if(!this.timer){this.timer=setInterval(()=>{if(this.engine.running&&this.showing())void this.pull();},COOKIE_SYNC.everyMs);this.timer.unref?.();}
 }
 /** An engine page loaded or closed: its cookies are compared a moment later. */
 enginePageChanged(){
  if(this.settle)clearTimeout(this.settle);
  this.settle=setTimeout(()=>{this.settle=null;void this.pull();},COOKIE_SYNC.settleMs);
  this.settle.unref?.();
 }

 /** Sends Electron's waiting changes to the engine, and notes them as the engine's own so they do not come back. */
 private flush(){
  if(!this.engine.running||!this.pending.size)return;
  const changes=[...this.pending.values()];this.pending.clear();
  this.engine.setCookies(this.scope,changes.filter(change=>!change.removed).map(change=>toEngine(change.cookie)),
   changes.filter(change=>change.removed).map(change=>({url:cookieUrl(change.cookie),name:change.cookie.name})));
  if(!this.seen)return;
  const known=new Map(this.seen.cookies.map(cookie=>[cookieKey(cookie),cookie]));
  for(const change of changes){if(change.removed)known.delete(cookieKey(change.cookie));else known.set(cookieKey(change.cookie),change.cookie);}
  this.seen={pid:this.seen.pid,cookies:[...known.values()]};
 }

 /** Looks at the engine's cookies and brings Electron's storage up to them; one look at a time. */
 pull():Promise<void> {
  if(this.pulling){this.again=true;return this.pulling;}
  this.pulling=this.look().catch(()=>{}).finally(()=>{this.pulling=null;if(this.again){this.again=false;void this.pull();}});
  return this.pulling;
 }
 private async look(){
  const pid=this.engine.pid;if(!pid)return;
  const reported=await this.engine.cookies(this.scope);
  if(!reported||this.engine.pid!==pid)return;
  const after=reported.map(readSyncCookie).filter((cookie):cookie is SyncCookie=>!!cookie);
  const electron=(await this.session.cookies.get({})).map(fromElectron).filter((cookie):cookie is SyncCookie=>!!cookie);
  const first=!this.seen||this.seen.pid!==pid,now=Date.now();
  const plan=cookiePlan({before:first?null:this.seen!.cookies,after,target:electron,now});
  this.seen={pid,cookies:after};
  if(first){
   // A just-started engine gains the cookies it lacks from Electron's storage, then Electron's waiting changes.
   for(const cookie of cookiePlan({before:null,after:electron,target:after,now}).set)queueCookieChange(this.pending,cookie,false);
  }
  this.flush();
  await this.apply(plan.set,plan.remove);
 }
 private async apply(set:SyncCookie[],remove:SyncCookie[]){
  const keys=[...set,...remove].map(cookieKey);keys.forEach(key=>this.writing.add(key));
  try{
   await Promise.all([
    ...set.map(cookie=>this.session.cookies.set({url:cookieUrl(cookie),name:cookie.name,value:cookie.value,...isHostCookie(cookie)?{}:{domain:cookie.domain},
     path:cookie.path,secure:cookie.secure,httpOnly:cookie.httpOnly,sameSite:cookie.sameSite,...cookie.expires?{expirationDate:cookie.expires}:{}}).catch(()=>{})),
    ...remove.map(cookie=>this.session.cookies.remove(cookieUrl(cookie),cookie.name).catch(()=>{})),
   ]);
  }finally{setTimeout(()=>keys.forEach(key=>this.writing.delete(key)),0);}
 }
}
