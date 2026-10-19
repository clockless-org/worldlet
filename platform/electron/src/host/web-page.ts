import {errorMessage} from '../files.ts';
import {WEB_PAGE_FEATURES,WORLD_ELSEWHERE_CODE,webDenied,webEventDetail,webReply,type WorldHostFrame} from '../../../../contracts/web-world.ts';
import type {PageBridge} from './types.ts';
// The World page in a web browser on this computer (contracts/web-world.ts), as a PageBridge: the host reaches it over
// the page's socket (modules/shell/local-relay.ts) as the app reaches its own World page over IPC, and its requests go
// to the same router. One page at a time: a newer one takes over and the older one is told the World is open elsewhere.

/** A page's open socket (modules/shell/web-socket.ts TextSocket). */
export interface PageSocket {
 send(text:string):void;
 close(code?:number,reason?:string):void;
 onMessage(listener:(text:string)=>void):void;
 onClose(listener:()=>void):void;
}
export interface WebPageOptions {
 platform:'macos'|'windows'|'linux';
 /** The router (HostRouter.dispatch with the `web` transport). */
 dispatch(body:Record<string,unknown>):Promise<unknown>;
 /** A page connected (onPageLoaded) and one went away (onPageReload). */
 loaded():void;
 gone():void;
 /** A request that failed, for the host's diagnostics. */
 failed?(body:Record<string,unknown>,error:unknown):void;
 /** Why this page may not make a request, or '': WEB_DENIED and WEB_PAGE_ACTIONS (webDenied) for a browser on this
  * computer, ROOM_ALLOWED as well (roomDenied) for a page on another device. */
 denied?(body:unknown):string;
}

export function createWebPage(options:WebPageOptions){
 let current:{socket:PageSocket,calls:Map<number,(value:unknown)=>void>}|null=null,next=0;
 const send=(socket:PageSocket,frame:WorldHostFrame)=>{try{socket.send(JSON.stringify(frame));}catch{}};
 /** The page is gone: what it was asked returns nothing, as a call on a page that navigated away does in the app. */
 const drop=(session:NonNullable<typeof current>)=>{
  if(current!==session)return;
  current=null;
  for(const resolve of session.calls.values())resolve(undefined);
  session.calls.clear();
  options.gone();
 };
 async function request(session:NonNullable<typeof current>,id:number,body:Record<string,unknown>){
  const denied=(options.denied??webDenied)(body);
  if(denied)return send(session.socket,{a:id,ok:false,error:denied});
  try{
   const value=webReply(body,await options.dispatch(body));
   if(current===session)send(session.socket,value===undefined?{a:id,ok:true}:{a:id,ok:true,value});
  }catch(error){
   options.failed?.(body,error);
   if(current===session)send(session.socket,{a:id,ok:false,error:errorMessage(error)});
  }
 }
 const page:PageBridge={
  call:<T>(name:string,...args:unknown[])=>{
   const session=current;if(!session)return Promise.resolve(undefined);
   const id=++next;
   return new Promise<T|undefined>(resolve=>{session.calls.set(id,resolve as (value:unknown)=>void);send(session.socket,{c:id,name,args});});
  },
  // A pairing's link stays on the host here too (webEventDetail), as in replies (webReply).
  event:(name,detail)=>{if(current)send(current.socket,detail===undefined?{v:name}:{v:name,detail:webEventDetail(name,detail)});},
  documentEvent:(name,detail)=>{if(current)send(current.socket,detail===undefined?{v:name,doc:true}:{v:name,detail:webEventDetail(name,detail),doc:true});},
  ready:()=>current!==null,
 };
 return {
  page,
  /** A page connected with the World's token (local-relay.ts checked it): it becomes the World page. */
  connect(socket:PageSocket){
   if(current){const old=current;send(old.socket,{x:'elsewhere'});old.socket.close(WORLD_ELSEWHERE_CODE,'Open elsewhere');drop(old);}
   const session={socket,calls:new Map<number,(value:unknown)=>void>()};
   current=session;
   socket.onClose(()=>drop(session));
   socket.onMessage(text=>{
    if(current!==session)return;
    let frame:Record<string,unknown>;try{frame=JSON.parse(text);}catch{return socket.close(1007,'Not JSON');}
    if(!frame||typeof frame!=='object')return;
    if(typeof frame.q==='number'&&frame.body&&typeof frame.body==='object'&&!Array.isArray(frame.body))return void request(session,frame.q,frame.body as Record<string,unknown>);
    if(typeof frame.r==='number'){const resolve=session.calls.get(frame.r);session.calls.delete(frame.r);resolve?.(frame.value);}
   });
   // The page hears what its window cannot do, and hides or replaces those controls (contracts/web-world.ts).
   send(socket,{h:{version:1,platform:options.platform,features:{...WEB_PAGE_FEATURES}}});
   options.loaded();
  },
  /** The host stops: the page is closed. */
  close(){if(current){const session=current;session.socket.close(1001,'Worldlet stopped');drop(session);}},
 };
}
