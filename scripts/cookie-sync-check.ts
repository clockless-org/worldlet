// One sign-in across both website engines (core/browser/cookie-sync.ts, owner report 2026-10-08): how cookies are read
// from either storage, and what a look at one storage changes in the other. The engine and Electron themselves are
// checked in platform/electron/src/modules/browser/engine/check.ts (1b).
import assert from 'node:assert/strict';
import {COOKIE_SYNC,cookieKey,cookiePlan,cookieUrl,isHostCookie,queueCookieChange,readSyncCookie,type SyncCookie} from '../core/browser/index.ts';

// Electron marks a host cookie with hostOnly; the engine by a domain without a leading dot.
const electronHost=readSyncCookie({name:'auth_token',value:'a',domain:'x.com',hostOnly:true,path:'/',secure:true,httpOnly:true,sameSite:'no_restriction',expirationDate:2_000_000_000});
assert.deepEqual(electronHost,{name:'auth_token',value:'a',domain:'x.com',path:'/',secure:true,httpOnly:true,sameSite:'no_restriction',expires:2_000_000_000});
assert.equal(readSyncCookie({name:'ct0',value:'b',domain:'.x.com',hostOnly:false,path:'/'})!.domain,'.x.com');
assert.equal(readSyncCookie({name:'ct0',value:'b',domain:'x.com',hostOnly:false,path:'/'})!.domain,'.x.com','a domain cookie keeps its dot');
assert.equal(readSyncCookie({name:'sid',value:'c',domain:'.Google.com',path:'/',expires:0})!.domain,'.google.com');
assert.equal(readSyncCookie({name:'sid',value:'c',domain:'accounts.google.com',path:''})!.path,'/');
assert.equal(readSyncCookie({name:'s',value:'v',domain:'a.example',sameSite:'weird'})!.sameSite,'unspecified');
for(const value of [null,[],{name:'a',value:'b',domain:''},{name:'a',value:'b',domain:'a b'},{name:'a',value:'x'.repeat(COOKIE_SYNC.maxValue+1),domain:'a.example'}])
 assert.equal(readSyncCookie(value),null,JSON.stringify(value)?.slice(0,60));
assert.equal(cookieUrl(electronHost!),'https://x.com/');
assert.equal(cookieUrl(readSyncCookie({name:'n',value:'v',domain:'.example.com',path:'/app',secure:false})!),'http://example.com/app');
assert.equal(isHostCookie(electronHost!),true);
console.log('PASS cookies read alike from Electron and the engine: host and domain cookies, paths, SameSite, expiry, limits.');

const now=1_900_000_000_000;
const c=(name:string,value:string,extra:Partial<SyncCookie>={}):SyncCookie=>({name,value,domain:'.x.com',path:'/',secure:true,httpOnly:true,sameSite:'lax',expires:0,...extra});
const names=(list:SyncCookie[])=>list.map(cookie=>cookie.name+'='+cookie.value).sort();
// The first look only fills what the other side lacks: a stale copy never replaces a fresh sign-in.
let plan=cookiePlan({before:null,after:[c('auth_token','old'),c('guest','g')],target:[c('auth_token','fresh')],now});
assert.deepEqual([names(plan.set),plan.remove],[['guest=g'],[]]);
// Later looks carry what changed since: added, changed and deleted cookies.
plan=cookiePlan({before:[c('auth_token','a1'),c('ct0','t1'),c('gone','x')],after:[c('auth_token','a2'),c('ct0','t1'),c('new','n')],target:[c('auth_token','a1'),c('ct0','t1'),c('gone','x')],now});
assert.deepEqual(names(plan.set),['auth_token=a2','new=n']);assert.deepEqual(names(plan.remove),['gone=x']);
// Nothing to do when the target already matches, nor to delete what it never had; expired cookies are never set.
plan=cookiePlan({before:[c('a','1'),c('b','2')],after:[c('a','2'),c('e','x',{expires:now/1000-1})],target:[c('a','2')],now});
assert.deepEqual([plan.set,names(plan.remove)],[[],[]]);
// A cookie of the same name on another domain or path is another cookie.
assert.notEqual(cookieKey(c('sid','1')),cookieKey(c('sid','1',{domain:'.google.com'})));
assert.notEqual(cookieKey(c('sid','1')),cookieKey(c('sid','1',{path:'/i'})));
console.log('PASS what a look changes on the other side: only what it lacks at first, then added, changed and deleted cookies; expired ones stay out.');

// Changes waiting for the engine: the latest per cookie, the oldest go past the bound.
const pending=new Map<string,{cookie:SyncCookie;removed:boolean}>();
queueCookieChange(pending,c('a','1'),false);queueCookieChange(pending,c('b','1'),false);queueCookieChange(pending,c('a','2'),true);
assert.deepEqual([...pending.values()].map(v=>v.cookie.name+(v.removed?' removed':'='+v.cookie.value)),['b=1','a removed']);
for(let i=0;i<COOKIE_SYNC.maxPending+5;i++)queueCookieChange(pending,c('n'+i,'v'),false);
assert.equal(pending.size,COOKIE_SYNC.maxPending);assert.ok(!pending.has(cookieKey(c('b','1'))),'the oldest went first');
console.log('PASS changes wait for the engine as the latest per cookie, within the bound.');
