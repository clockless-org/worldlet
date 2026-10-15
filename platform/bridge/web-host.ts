import type {HostFeatures,HostRequest,HostTransport} from '../../contracts/platform.ts';
import {WORLD_ELSEWHERE_CODE,WORLD_PROTOCOL,WORLD_TOKEN,WORLD_SOCKET_PATH,WORLD_WEB_PATH,worldLinkToken,worldTokenProtocol,type WorldHostFrame} from '../../contracts/web-world.ts';
// The World page in a web browser on this computer (contracts/web-world.ts): `worldletHost` over the socket the host
// serves beside the page, instead of the app's IPC. Requests go as `{q,body}` and come back as `{a,ok,value|error}`;
// the host calls page globals with `{c,name,args}` (answered `{r,value}`) and sends events as `{v,detail,doc?}`. The
// platform, and what the page's window cannot do, come from the handshake. host.ts picks this only when the app gave the page no `worldletHost`.
const TOKEN_KEY='worldlet-world-token';
const NOTICE={
 elsewhere:'This World is open in another browser tab. Close this one or reload it to bring the World back here.',
 stopped:'Worldlet stopped on this computer. This page comes back when it runs again.',
 refused:'This link has ended. Open the World link Worldlet wrote on this computer again.',
};
type Pending={resolve:(value:unknown)=>void;reject:(error:Error)=>void};
/** `features`: the HostFeatures the handshake turned off for this page (platform/bridge/features.ts pageFeatures). */
type WebHost=HostTransport&{readonly platform:HostTransport['platform'];features:Readonly<Partial<Record<keyof HostFeatures,boolean>>>};

/** What a link's fragment carries (`read` returns it, or ''), kept in this tab under `key` for a reload and taken out of
 * the address (the World uses the fragment for its places); else what this tab kept, when `kept` accepts it. */
export function takeFragment(scope:any,key:string,read:(hash:string)=>string,kept:(value:string)=>boolean):string {
 const fromLink=read(String(scope.location.hash||''));
 let storage:Storage|null=null;try{storage=scope.sessionStorage;}catch{}
 if(fromLink){
  try{storage?.setItem(key,fromLink);}catch{}
  try{scope.history.replaceState(scope.history.state,'',scope.location.pathname+scope.location.search);}catch{}
  return fromLink;
 }
 try{const value=storage?.getItem(key)||'';return kept(value)?value:'';}catch{return '';}
}
/** Says on the page why it holds no World (a notice the World's own errors use too). */
export function notice(scope:any,text:string){
 const node=scope.document?.getElementById('nativeNotice');
 if(node)node.textContent=text;
 scope.document?.documentElement?.setAttribute('data-world-closed','true');
}

/** What the host's frames do on the page, whatever carries them: the local socket here, or the pairing room for a page
 * on another device (room-host.ts). `send` carries a page frame; `receive` takes a host frame; `closed` ends every
 * request still waiting. The handshake (`h`) resolves `ready`. */
export function createFrameHost(scope:any,send:(frame:unknown)=>boolean){
 let platform:HostTransport['platform']|undefined,next=0,elsewhere=false,ended='';
 const pending=new Map<number,Pending>();
 let opened:()=>void,failed:(error:Error)=>void;
 const ready=new Promise<void>((resolve,reject)=>{opened=resolve;failed=reject;});
 ready.catch(()=>{});
 const host:WebHost={
  version:1,
  get platform(){return platform??'linux';},
  features:{},
  async request(request:HostRequest){
   await ready;
   if(ended)throw new Error(ended);
   const id=++next;
   return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});if(!send({q:id,body:request})){pending.delete(id);reject(new Error(NOTICE.stopped));}});
  },
 };
 function receive(frame:WorldHostFrame){
  if('h' in frame){
   platform=frame.h.platform;
   // What this page's window cannot do (contracts/web-world.ts WEB_PAGE_FEATURES): only `false` flags are kept.
   const features=frame.h.features&&typeof frame.h.features==='object'?frame.h.features:{};
   host.features=Object.freeze(Object.fromEntries(Object.entries(features).filter(([,on])=>on===false)));
   opened();return;
  }
  if('a' in frame){
   const call=pending.get(frame.a);if(!call)return;
   pending.delete(frame.a);
   if(frame.ok===true)call.resolve(frame.value);else call.reject(new Error(frame.error||'Worldlet did not respond. Please try again.'));
   return;
  }
  if('c' in frame){
   const id=frame.c,run=scope[frame.name];
   void Promise.resolve().then(()=>typeof run==='function'?run(...frame.args):undefined).then(value=>send({r:id,value}),()=>send({r:id}));
   return;
  }
  if('v' in frame){
   const target=frame.doc?scope.document:scope;
   target.dispatchEvent('detail' in frame?new scope.CustomEvent(frame.v,{detail:frame.detail}):new scope.Event(frame.v));
   return;
  }
  if('x' in frame)elsewhere=true;
 }
 /** The carrier closed: requests still waiting fail with `text`, and so do later ones. */
 function closed(text:string){
  ended=text;
  const error=new Error(text);
  failed(error);
  for(const call of pending.values())call.reject(error);
  pending.clear();
 }
 return {host,receive,closed,get platform(){return platform;},get elsewhere(){return elsewhere;}};
}

/** The web transport for a World page served at /world/ with its token, or undefined anywhere else. One per page. */
export function webHost(scope:any):HostTransport|undefined {
 if(scope.worldletWebHost)return scope.worldletWebHost;
 const location=scope.location;
 if(!location||!/^https?:$/.test(location.protocol)||location.pathname!==WORLD_WEB_PATH&&location.pathname!==WORLD_WEB_PATH+'index.html'||typeof scope.WebSocket!=='function')return undefined;
 const token=takeFragment(scope,TOKEN_KEY,worldLinkToken,value=>WORLD_TOKEN.test(value));
 if(!token)return undefined;
 const socket:WebSocket=new scope.WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${WORLD_SOCKET_PATH}`,[WORLD_PROTOCOL,worldTokenProtocol(token)]);
 const frames=createFrameHost(scope,frame=>{if(socket.readyState!==1)return false;socket.send(JSON.stringify(frame));return true;});
 socket.onmessage=event=>{
  let frame:WorldHostFrame;try{frame=JSON.parse(String(event.data));}catch{return;}
  frames.receive(frame);
 };
 socket.onclose=event=>{
  const elsewhere=event.code===WORLD_ELSEWHERE_CODE||frames.elsewhere;
  // Before the handshake the host refused the socket: a link whose token is no longer this computer's.
  const reason=elsewhere?NOTICE.elsewhere:frames.platform?NOTICE.stopped:NOTICE.refused;
  frames.closed(reason);notice(scope,reason);
  if(elsewhere||!frames.platform)return;
  // The host stopped: the page reloads once it answers again, and starts over with it.
  const retry=()=>void scope.fetch(location.pathname,{method:'HEAD',cache:'no-store'}).then((response:Response)=>{if(response.ok)location.reload();else setTimeout(retry,2000);},()=>setTimeout(retry,2000));
  setTimeout(retry,2000);
 };
 scope.worldletWebHost=frames.host;
 return frames.host;
}
