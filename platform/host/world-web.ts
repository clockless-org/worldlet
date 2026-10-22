import crypto from 'node:crypto';
import path from 'node:path';
import {writeAtomic} from './files.ts';
import {WORLD_TOKEN,worldLink} from '../../contracts/web-world.ts';
import type {PageBridge} from './types.ts';
import type {PageSocket} from './web-page.ts';
// The World in a web browser on this computer (contracts/web-world.ts), as both hosts serve it: the Node host, whose
// only page it is, and the Electron app, beside its own window. Kept free of Electron so scripts/world-web-check.ts
// runs it as the app does.

/** The World's link on this computer, owner-only in the library (the Node host's and the app's). */
export const WORLD_LINK_FILE='world-link.txt';
/** The World's token for a browser on this computer, kept in the vault so the link survives a restart. */
export const WORLD_TOKEN_VAULT='world-web-token';

type TokenVault={get(id:string):string|null;set(id:string,secret:string):void};
/** The token the vault keeps, made once (32 random bytes). */
export function worldWebToken(vault:TokenVault):string {
 let token=vault.get(WORLD_TOKEN_VAULT)??'';
 if(!WORLD_TOKEN.test(token)){token=crypto.randomBytes(32).toString('base64url');vault.set(WORLD_TOKEN_VAULT,token);}
 return token;
}

/** Serves the World at /world/ on this computer's own server (modules/windows/local-relay.ts) and writes its link to the
 * library's owner-only `world-link.txt`. The link carries the token: it goes only into that file, never to a log. */
export function serveWorldWeb({root,webRoot,vault,server,accept}:{root:string;webRoot:string;vault:TokenVault;
 server:{origin:string;serveWorld(route:{webRoot:string;token:string;accept(socket:PageSocket):void}):void};accept(socket:PageSocket):void}){
 const token=worldWebToken(vault);
 server.serveWorld({webRoot,token,accept});
 const link=worldLink(server.origin,token),file=path.join(root,WORLD_LINK_FILE);
 writeAtomic(file,link+'\n',0o600);
 return {link,file,origin:server.origin};
}

/** No page: the Node host has no window, so its pair starts with this (platform/server). */
export const NO_PAGE:PageBridge={call:async()=>undefined,event(){},documentEvent(){},ready:()=>false};

/** Which page the host reaches: the app's own window's World page (`native`), a browser's on this computer (`web`) or
 * one on another device, met through the pairing room (`remote`). */
export type PageOrigin='native'|'web'|'remote';
/** Calls only the app's window answers: its native views and menus, sound, voice and the desktop Companion. A browser's
 * page has none of these (WEB_PAGE_FEATURES). */
export const WINDOW_CALLS:ReadonlySet<string>=new Set(['worldletRestoreWorld','worldletDesktopCompanion','worldletCompanionBackdrop','worldletCompanionGeometry',
 'worldletBrowserNavigate','worldletBrowser','worldletYouTubePlayer','worldletAudio','worldletLocalMusic','worldletSpeech','worldletShowControls']);
/** Calls every open page takes: the World's snapshot and the app's update state. */
export const SHARED_CALLS:ReadonlySet<string>=new Set(['worldletReceive','worldletAppUpdate']);
/** Calls whose first argument names work a page started (a Fox turn, an Applet task, a cloud stream): they go back to
 * that page. */
export const OWNED_CALLS:ReadonlySet<string>=new Set(['worldletAgentTool','worldletAgentEvent','worldletCloudStream']);
const OWNERS_KEPT=500;

/** The host's World pages as the one PageBridge its modules use. The app's window is the native page and stays the
 * World's page whatever a browser does; a browser's page on this computer and one on another device are extra pages
 * beside it, each with its own rule (one page of each at a time, the newest takes over: host/web-page.ts), so none
 * takes the World from another.
 * - Events and the World's snapshot go to every open page.
 * - Window calls go to the native page only.
 * - A call about work a page started (by the `id` or `streamId` its request named, or the `id` the host answered with)
 *   goes to that page; anything else goes to the first loaded of the native page, the browser's here, the remote one. */
export function createPagePair(native:PageBridge,web:PageBridge,remote?:PageBridge){
 const owners=new Map<string,PageOrigin>();
 const own=(value:unknown,origin:PageOrigin)=>{
  if(typeof value!=='string'||!value||value.length>200)return;
  owners.delete(value);owners.set(value,origin);
  if(owners.size>OWNERS_KEPT)owners.delete(owners.keys().next().value as string);
 };
 const pages:[PageOrigin,PageBridge][]=[['native',native],['web',web],...remote?[['remote',remote] as [PageOrigin,PageBridge]]:[]];
 const pageOf=(origin:PageOrigin)=>pages.find(([name])=>name===origin)?.[1]??native;
 const primary=()=>pages.find(([,one])=>one.ready())?.[1]??native;
 const page:PageBridge={
  call<T>(name:string,...args:unknown[]):Promise<T|undefined>{
   if(SHARED_CALLS.has(name)){
    const answers=pages.filter(([,one])=>one.ready()).map(([,one])=>one.call<T>(name,...args));
    return answers[0]??Promise.resolve(undefined);
   }
   if(WINDOW_CALLS.has(name))return native.call<T>(name,...args);
   const owner=OWNED_CALLS.has(name)&&typeof args[0]==='string'?owners.get(args[0]):undefined;
   return (owner&&pageOf(owner).ready()?pageOf(owner):primary()).call<T>(name,...args);
  },
  event(name,detail){for(const [,one] of pages)one.event(name,detail);},
  documentEvent(name,detail){for(const [,one] of pages)one.documentEvent(name,detail);},
  ready:()=>pages.some(([,one])=>one.ready()),
 };
 return {
  page,
  /** A request a page made, and what the host answered: the work it names is that page's. */
  note(origin:PageOrigin,body:unknown,value?:unknown){
   if(body&&typeof body==='object'){const {id,streamId}=body as {id?:unknown;streamId?:unknown};own(id,origin);own(streamId,origin);}
   if(value&&typeof value==='object'&&!Array.isArray(value))own((value as {id?:unknown}).id,origin);
  },
  owner:(id:string)=>owners.get(id),
 };
}
