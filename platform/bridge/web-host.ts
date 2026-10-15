import type {HostRequest,HostTransport} from '../../contracts/platform.ts';
import {WORLD_ELSEWHERE_CODE,WORLD_PROTOCOL,WORLD_SOCKET_PATH,WORLD_WEB_PATH,worldLinkToken,worldTokenProtocol,type WorldHostFrame} from '../../contracts/web-world.ts';
// The World page in a web browser on this computer (contracts/web-world.ts): `worldletHost` over the socket the host
// serves beside the page, instead of the app's IPC. Requests go as `{q,body}` and come back as `{a,ok,value|error}`;
// the host calls page globals with `{c,name,args}` (answered `{r,value}`) and sends events as `{v,detail,doc?}`. The
// platform comes from the handshake. host.ts picks this only when the app gave the page no `worldletHost`.
const TOKEN_KEY='worldlet-world-token';
const NOTICE={
 elsewhere:'This World is open in another browser tab. Close this one or reload it to bring the World back here.',
 stopped:'Worldlet stopped on this computer. This page comes back when it runs again.',
 refused:'This link has ended. Open the World link Worldlet wrote on this computer again.',
};
type Pending={resolve:(value:unknown)=>void;reject:(error:Error)=>void};
type WebHost=HostTransport&{readonly platform:HostTransport['platform']};

/** The token from the link's fragment, which is then taken out of the address (the World uses the fragment for its
 * places), or the one this tab kept for a reload. */
function takeToken(scope:any):string {
 const fromLink=worldLinkToken(String(scope.location.hash||''));
 let storage:Storage|null=null;try{storage=scope.sessionStorage;}catch{}
 if(fromLink){
  try{storage?.setItem(TOKEN_KEY,fromLink);}catch{}
  try{scope.history.replaceState(scope.history.state,'',scope.location.pathname+scope.location.search);}catch{}
  return fromLink;
 }
 try{return storage?.getItem(TOKEN_KEY)||'';}catch{return '';}
}
function notice(scope:any,text:string){
 const node=scope.document?.getElementById('nativeNotice');
 if(node)node.textContent=text;
 scope.document?.documentElement?.setAttribute('data-world-closed','true');
}

/** The web transport for a World page served at /world/ with its token, or undefined anywhere else. One per page. */
export function webHost(scope:any):HostTransport|undefined {
 if(scope.worldletWebHost)return scope.worldletWebHost;
 const location=scope.location;
 if(!location||!/^https?:$/.test(location.protocol)||location.pathname!==WORLD_WEB_PATH&&location.pathname!==WORLD_WEB_PATH+'index.html'||typeof scope.WebSocket!=='function')return undefined;
 const token=takeToken(scope);
 if(!token)return undefined;
 let platform:HostTransport['platform']|undefined,next=0,closed='';
 const pending=new Map<number,Pending>();
 let opened:(socket:WebSocket)=>void,failed:(error:Error)=>void;
 const ready=new Promise<WebSocket>((resolve,reject)=>{opened=resolve;failed=reject;});
 ready.catch(()=>{});
 const socket:WebSocket=new scope.WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${WORLD_SOCKET_PATH}`,[WORLD_PROTOCOL,worldTokenProtocol(token)]);
 const sendFrame=(frame:unknown)=>{if(socket.readyState===1)socket.send(JSON.stringify(frame));};
 const fail=(text:string)=>{
  const error=new Error(text);
  failed(error);
  for(const call of pending.values())call.reject(error);
  pending.clear();
 };
 socket.onmessage=event=>{
  let frame:WorldHostFrame;try{frame=JSON.parse(String(event.data));}catch{return;}
  if('h' in frame){platform=frame.h.platform;opened(socket);return;}
  if('a' in frame){
   const call=pending.get(frame.a);if(!call)return;
   pending.delete(frame.a);
   if(frame.ok===true)call.resolve(frame.value);else call.reject(new Error(frame.error||'Worldlet did not respond. Please try again.'));
   return;
  }
  if('c' in frame){
   const id=frame.c,run=scope[frame.name];
   void Promise.resolve().then(()=>typeof run==='function'?run(...frame.args):undefined).then(value=>sendFrame({r:id,value}),()=>sendFrame({r:id}));
   return;
  }
  if('v' in frame){
   const target=frame.doc?scope.document:scope;
   target.dispatchEvent('detail' in frame?new scope.CustomEvent(frame.v,{detail:frame.detail}):new scope.Event(frame.v));
   return;
  }
  if('x' in frame)closed='elsewhere';
 };
 socket.onclose=event=>{
  if(event.code===WORLD_ELSEWHERE_CODE)closed='elsewhere';
  // Before the handshake the host refused the socket: a link whose token is no longer this computer's.
  const reason=closed==='elsewhere'?NOTICE.elsewhere:platform?NOTICE.stopped:NOTICE.refused;
  fail(reason);notice(scope,reason);
  if(closed==='elsewhere'||!platform)return;
  // The host stopped: the page reloads once it answers again, and starts over with it.
  const retry=()=>void scope.fetch(location.pathname,{method:'HEAD',cache:'no-store'}).then((response:Response)=>{if(response.ok)location.reload();else setTimeout(retry,2000);},()=>setTimeout(retry,2000));
  setTimeout(retry,2000);
 };
 const host:WebHost={
  version:1,
  get platform(){return platform??'linux';},
  async request(request:HostRequest){
   const open=await ready;
   if(open.readyState!==1)throw new Error(NOTICE.stopped);
   const id=++next;
   return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});open.send(JSON.stringify({q:id,body:request}));});
  },
 };
 scope.worldletWebHost=host;
 return host;
}
