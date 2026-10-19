import type {HostTransport} from '../../contracts/platform.ts';
import type {WorldHostFrame} from '../../contracts/web-world.ts';
import {isWorldRoomPage,openHello,pairKeys,readWorldRoomFrame,readWorldRoomLink,roomEntry,sealJoin,worldRoomNonce,worldRoomSession,type PairKeys,type WorldRoomSession} from '../../agent/windows/index.ts';
import {createFrameHost,notice,takeFragment} from './web-host.ts';
// The World page on another device (agent/windows/README.md#the-world-on-another-device, agent/windows/world-room.ts): the
// same World bundle, served as static files that hold no data (served at worldlet.ai/world/<version>/), joins this
// computer in the pairing room from its link's fragment and speaks the frames a World page in a browser on that computer
// speaks over its socket (web-host.ts), each sealed with the pairing's key and cut in pieces. The room is on the
// origin that served the page. host.ts picks this only when the app gave the page no `worldletHost` and the page is
// not the one a computer serves itself.
const LINK_KEY='worldlet-world-room';
const NOTICE={
 away:'Your computer is not reachable. This World comes back when Worldlet runs there again.',
 elsewhere:'This World is open in another browser tab or device. Reload this page to bring it back here.',
 refused:'This link has ended. Open Worldlet on your computer and copy a new World link.',
};

/** The room transport for a World page opened from a `world` link, or undefined anywhere else. One per page. */
export function roomHost(scope:any):HostTransport|undefined {
 if(scope.worldletWebHost)return scope.worldletWebHost;
 const location=scope.location;
 if(!location||!/^https?:$/.test(location.protocol)||typeof scope.WebSocket!=='function'||!scope.crypto?.subtle)return undefined;
 // The link's fragment, kept in this tab for a reload (takeFragment).
 const isRoomPage=(hash:string)=>isWorldRoomPage(location.pathname,hash);
 const fragment=takeFragment(scope,LINK_KEY,hash=>isRoomPage(hash)?hash:'',isRoomPage);
 if(!fragment)return undefined;
 const link=readWorldRoomLink(fragment);
 let socket:WebSocket|null=null,keys:PairKeys|null=null,session:WorldRoomSession|null=null,joined=false,computer=false,away=false;
 let sending=Promise.resolve(),receiving=Promise.resolve();
 const room=(data:string)=>{if(socket?.readyState===1)socket.send(JSON.stringify({data}));};
 const frames=createFrameHost(scope,frame=>{
  const current=session;if(!current||socket?.readyState!==1)return false;
  sending=sending.then(async()=>{for(const data of await current.seal(JSON.stringify(frame)))if(session===current)room(data);}).catch(()=>{});
  return true;
 });
 const end=(text:string)=>{frames.closed(text);notice(scope,text);session=null;try{socket?.close(1000);}catch{}};
 async function fromComputer(data:unknown){
  const frame=readWorldRoomFrame(data);if(!frame||!keys)return;
  if(frame.kind==='hello'){
   const host=await openHello(keys,frame.box);if(!host)return;
   // A second hello: the computer started over (it restarted, or its room connection came back). So does the page,
   // and so does one that said the computer was away.
   if(joined||away){location.reload();return;}
   joined=true;
   const page=worldRoomNonce();
   session=worldRoomSession(keys,host,page,'page');
   room(await sealJoin(keys,host,page));
   return;
  }
  if(frame.kind!=='piece'||!session)return;
  let text:string|null;
  try{text=await session.open(frame.box);}catch{return end(NOTICE.away);}
  if(text===null)return;
  let value:WorldHostFrame;try{value=JSON.parse(text);}catch{return;}
  frames.receive(value);
  // A newer page took the World: this one closes, as a tab on the computer does.
  if('x' in value)end(NOTICE.elsewhere);
 }
 void (async()=>{
  keys=await pairKeys(link.secret);
  const {url,protocols}=await roomEntry(keys,link.relay||location.origin,'phone');
  const ws:WebSocket=new scope.WebSocket(url,protocols);socket=ws;
  ws.onmessage=event=>{
   let message:any;try{message=JSON.parse(String(event.data));}catch{return;}
   if(message?.t==='desktop'){
    const was=computer;computer=!!message.online;
    // The computer left: the World waits, and starts over with it when it comes back (its hello).
    if(was&&!computer){frames.closed(NOTICE.away);notice(scope,NOTICE.away);}
    else if(!computer&&!joined){away=true;notice(scope,NOTICE.away);}
    return;
   }
   if(message?.t==='msg'&&message.from==='desktop')receiving=receiving.then(()=>fromComputer(message.data)).catch(()=>{});
  };
  // The room went (the network, or the relay): the page tries again now and then, and starts over once it gets in.
  ws.onclose=()=>{if(socket!==ws||frames.elsewhere)return;end(NOTICE.away);setTimeout(()=>location.reload(),10_000);};
  ws.onerror=()=>{};
 })().catch(()=>end(NOTICE.refused));
 scope.worldletWebHost=frames.host;
 return frames.host;
}
