import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type {Duplex} from 'node:stream';
import {resolveWorldFile} from '../../world/world-file.ts';
import {acceptWebSocket,refuseUpgrade,type TextSocket} from './web-socket.ts';
import {WORLD_PAGE_CSP_META,WORLD_PROTOCOL,WORLD_SOCKET_PATH,WORLD_TOKEN,worldTokenFrom,worldWebCsp} from '../../../../../contracts/web-world.ts';

// Worldlet in a browser on this computer, served by this computer (owner decision 2026-10-13: "我们不要存，用户应该从他
// 安装worldlet的设备直接serve"; core/phone/README.md#web). The app answers on 127.0.0.1 with the browser page (ui/web,
// built into the interface's `open/` folder) and the relay protocol the page and the computer already speak
// (worker/pairing.ts in the operations repository: the link, the first poll completing the pairing, slots, messages),
// kept in this process's memory. Nothing goes over the internet and nothing is written to disk: the boxes are sealed as
// on any relay, and a restart leaves only the pairing itself, which the computer hands back (`adopt`).
const SLOT_OWNER:Record<string,'desktop'|'phone'>={attention:'desktop',conversation:'desktop',live:'desktop',widgets:'desktop',desktop:'desktop',phone:'phone'};
const ID=/^[A-Za-z0-9_-]{22}$/,HASH=/^[a-f0-9]{64}$/;
export const LOCAL_RELAY_LIMITS=Object.freeze({body:4_000_000,messages:500,wait:25});
const ENDED='This link has ended. Open Worldlet on your computer and choose Open in browser again.';
type Pair={desktop:string,phone:string,version:number,phoneSeen:number|null,desktopSeen:number|null,pairedAt:number|null,
 slots:Map<string,{version:number,box:string}>,messages:{to:'desktop'|'phone',seq:number,box:string}[],waiters:Set<()=>void>};
const hex=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

/** The relay, in memory: `fetch` answers `/api/pair…` requests as worker/pairing.ts does for what both sides use. */
export function createLocalRelay({now=()=>Date.now()}:{now?:()=>number}={}){
 const pairs=new Map<string,Pair>();
 const make=(desktop:string,phone:string,pairedAt:number|null):Pair=>({desktop,phone,version:0,phoneSeen:null,desktopSeen:now(),pairedAt,slots:new Map(),messages:[],waiters:new Set()});
 const wake=(pair:Pair)=>{const waiters=[...pair.waiters];pair.waiters.clear();for(const resolve of waiters)resolve();};
 function view(pair:Pair,role:'desktop'|'phone',after:number){
  const peer=role==='desktop'?'phone':'desktop';
  return {version:pair.version,role,peer:{seenAt:role==='desktop'?pair.phoneSeen:pair.desktopSeen,pairedAt:pair.pairedAt},
   slots:[...pair.slots].filter(([slot,s])=>SLOT_OWNER[slot]===peer&&s.version>after).map(([slot,s])=>({name:slot,version:s.version,box:s.box})),
   messages:pair.messages.filter(m=>m.to===role&&m.seq>after).map(m=>({seq:m.seq,box:m.box}))};
 }
 async function fetch(request:Request):Promise<Response>{
  const url=new URL(request.url),method=request.method;
  const [,api,pairPath,id='',part='',name='',extra]=url.pathname.split('/');
  if(api!=='api'||pairPath!=='pair'||extra!==undefined)return json({error:'Not found'},404);
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>LOCAL_RELAY_LIMITS.body)return json({error:'Too large.'},413);
  const text=method==='GET'||method==='DELETE'?'':await request.text();
  if(text.length>LOCAL_RELAY_LIMITS.body)return json({error:'Too large.'},413);
  let body:any={};try{body=text?JSON.parse(text):{};}catch{return json({error:'Not JSON.'},400);}
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,''),digest=token?await hex(token):'';
  if(!id&&method==='POST'){
   if(!ID.test(String(body.id))||!HASH.test(String(body.desktop))||!HASH.test(String(body.phone))||digest!==body.desktop)return json({error:'Pairing token required.'},401);
   const old=pairs.get(body.id);if(old)wake(old);
   pairs.set(body.id,make(body.desktop,body.phone,null));
   return json({id:body.id},201);
  }
  const pair=pairs.get(id),role=pair?.desktop===digest?'desktop':pair?.phone===digest?'phone':null;
  if(!pair||!role)return json({error:ENDED},404);
  if(!part&&method==='DELETE'){pairs.delete(id);wake(pair);return json({ended:true});}
  if(!part&&method==='GET'){
   const after=Math.max(0,Number(url.searchParams.get('after'))||0),wait=Math.min(LOCAL_RELAY_LIMITS.wait,Math.max(0,Number(url.searchParams.get('wait'))||0));
   // What the asker took up to `after` is acknowledged.
   pair.messages=pair.messages.filter(m=>!(m.to===role&&m.seq<=after));
   const seen=()=>{if(role==='phone'){pair.phoneSeen=now();if(pair.pairedAt===null){pair.pairedAt=now();wake(pair);}}else pair.desktopSeen=now();};
   seen();
   let answer=view(pair,role,after);
   if(wait&&!answer.slots.length&&!answer.messages.length){
    await new Promise<void>(resolve=>{const timer=setTimeout(done,wait*1000);function done(){clearTimeout(timer);pair.waiters.delete(done);resolve();}pair.waiters.add(done);});
    if(pairs.get(id)!==pair)return json({error:ENDED},404);
    seen();answer=view(pair,role,after);
   }
   return json(answer);
  }
  if(part==='slots'&&method==='PUT'){
   if(SLOT_OWNER[name]!==role)return json({error:'This side cannot write that slot.'},403);
   if(typeof body.box!=='string')return json({error:'A sealed box is required.'},400);
   pair.slots.set(name,{version:++pair.version,box:body.box});wake(pair);
   return json({version:pair.version});
  }
  if(part==='messages'&&method==='POST'&&!name){
   if(typeof body.box!=='string')return json({error:'A sealed box is required.'},400);
   if(pair.messages.length>=LOCAL_RELAY_LIMITS.messages)return json({error:'Too many messages are waiting.'},429);
   const seq=++pair.version;pair.messages.push({to:role==='desktop'?'phone':'desktop',seq,box:body.box});wake(pair);
   return json({seq},201);
  }
  // A browser takes no notifications.
  if(part==='notify'&&method==='POST'&&role==='desktop')return json({sent:false,reason:'no-device'});
  return json({error:'Not found'},404);
 }
 return {
  fetch,
  /** A pairing the computer kept from before this launch: the relay knows it again, already paired if it was. */
  adopt(id:string,desktop:string,phone:string,paired:boolean){if(!pairs.has(id))pairs.set(id,make(desktop,phone,paired?now():null));},
 };
}
export type LocalRelay=ReturnType<typeof createLocalRelay>;

const TYPES:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
/** What the World page loads from the interface build; anything else there (the local tools' Python) is not served. */
const WORLD_TYPES:Record<string,string>={...TYPES,'.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg',
 '.gif':'image/gif','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.m4a':'audio/mp4','.mp3':'audio/mpeg',
 '.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.wasm':'application/wasm','.riv':'application/octet-stream','.md':'text/markdown; charset=utf-8',
 '.txt':'text/plain; charset=utf-8'};
/** The World served to a browser on this computer (contracts/web-world.ts): the interface build at /world/ and its
 * socket at /world/socket, which needs the World's token. */
export interface WorldRoute {webRoot:string;token:string;accept(socket:TextSocket):void}
/** Constant-time comparison of two tokens of any length. */
export function sameToken(given:string,expected:string){
 const a=crypto.createHash('sha256').update(given).digest(),b=crypto.createHash('sha256').update(expected).digest();
 return crypto.timingSafeEqual(a,b)&&given.length===expected.length;
}
/** Serves the page from `pageRoot` at `/open/` and the relay at `/api/pair` on 127.0.0.1, on the first free port from
 * `ports`, and the World once `serveWorld` gives it a route. Only requests addressed to this computer by name are
 * answered (`Host` must be 127.0.0.1 or localhost on that port), so a website cannot reach it through a name it points at
 * 127.0.0.1, and no answer allows another origin to read it. The World's socket also needs the page's own origin and
 * the World's token. */
export async function serveLocalRelay({relay,pageRoot,ports}:{relay:LocalRelay,pageRoot:string,ports:number[]}){
 let port=0,world:WorldRoute|null=null,worldRoot:{from:string,root:string}|null=null;
 const server=http.createServer((req,res)=>void answer(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();}));
 const named=(host:string)=>host===`127.0.0.1:${port}`||host===`localhost:${port}`;
 async function answer(req:http.IncomingMessage,res:http.ServerResponse){
  const host=String(req.headers.host||'');
  if(!named(host)){res.writeHead(421).end();return;}
  const url=new URL(req.url||'/',`http://${host}`);
  if(url.pathname.startsWith('/api/pair')){
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>LOCAL_RELAY_LIMITS.body){res.writeHead(413).end();return;}chunks.push(chunk as Buffer);}
   const headers=new Headers();for(const key of ['authorization','content-type'])if(typeof req.headers[key]==='string')headers.set(key,req.headers[key] as string);
   const method=req.method||'GET';
   const response=await relay.fetch(new Request(url,{method,headers,...(method==='GET'||method==='HEAD'?{}:{body:Buffer.concat(chunks)})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   return;
  }
  if(world&&(url.pathname==='/world'||url.pathname.startsWith('/world/')))return answerWorld(world,url,req,res);
  if(url.pathname==='/'||url.pathname==='/open'){res.writeHead(302,{Location:'/open/'}).end();return;}
  const file=url.pathname==='/open/'?'index.html':url.pathname.startsWith('/open/')?url.pathname.slice(6):'';
  if(!file||!/^[a-z0-9.-]+$/i.test(file)||!TYPES[path.extname(file)]){res.writeHead(404).end();return;}
  let data:Buffer;try{data=await fs.promises.readFile(path.join(pageRoot,file));}catch{res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':TYPES[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});
  res.end(data);
 }
 // The interface build, read-only: GET and HEAD, files inside it after resolving links, types the page loads. The World
 // document's Content-Security-Policy is the web variant, as a header (contracts/web-world.ts worldWebCsp): its own
 // meta tag, the app window's policy, is taken out. Any other page keeps its own and the answer adds that no other
 // site may frame it.
 async function answerWorld(route:WorldRoute,url:URL,req:http.IncomingMessage,res:http.ServerResponse){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  if(url.pathname==='/world'){res.writeHead(302,{Location:'/world/'}).end();return;}
  if(worldRoot?.from!==route.webRoot){try{worldRoot={from:route.webRoot,root:await fs.promises.realpath(route.webRoot)};}catch{res.writeHead(404).end();return;}}
  const file=await resolveWorldFile(worldRoot.root,url.pathname.slice('/world'.length));
  const type=file&&WORLD_TYPES[path.extname(file).toLowerCase()];
  if(!file||!type){res.writeHead(404).end();return;}
  const headers={'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'};
  if(file===path.join(worldRoot.root,'index.html')){
   const page=Buffer.from((await fs.promises.readFile(file,'utf8')).replace(WORLD_PAGE_CSP_META,''));
   res.writeHead(200,{...headers,'Content-Length':page.length,'Content-Security-Policy':worldWebCsp(`http://${String(req.headers.host)}`)});
   res.end(req.method==='HEAD'?undefined:page);return;
  }
  const stat=await fs.promises.stat(file);
  res.writeHead(200,{...headers,'Content-Length':stat.size,...(type.startsWith('text/html')?{'Content-Security-Policy':"frame-ancestors 'none'"}:{})});
  if(req.method==='HEAD'){res.end();return;}
  fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }
 // The World's socket: this computer by name, the page's own origin, and the token as a subprotocol.
 server.on('upgrade',(req:http.IncomingMessage,socket:Duplex,head:Buffer)=>{
  socket.on('error',()=>socket.destroy());
  const host=String(req.headers.host||'');
  if(!named(host))return refuseUpgrade(socket,421,'Misdirected Request');
  const url=new URL(req.url||'/',`http://${host}`);
  if(!world||url.pathname!==WORLD_SOCKET_PATH)return refuseUpgrade(socket,404,'Not Found');
  const origin=String(req.headers.origin||'');
  if(origin!==`http://127.0.0.1:${port}`&&origin!==`http://localhost:${port}`)return refuseUpgrade(socket,403,'Forbidden');
  const token=worldTokenFrom(String(req.headers['sec-websocket-protocol']||''));
  if(!token||!sameToken(token,world.token))return refuseUpgrade(socket,401,'Unauthorized');
  const page=acceptWebSocket(req,socket,head,WORLD_PROTOCOL);
  if(page)world.accept(page);
 });
 for(const candidate of ports){
  const ok=await new Promise<boolean>(resolve=>{
   const failed=()=>{server.off('listening',listening);resolve(false);},listening=()=>{server.off('error',failed);resolve(true);};
   server.once('error',failed);server.once('listening',listening);server.listen(candidate,'127.0.0.1');
  });
  if(ok){port=(server.address() as {port:number}).port;break;}
 }
 if(!port)throw new Error('No free port on this computer for Worldlet in a browser.');
 return {origin:`http://127.0.0.1:${port}`,port,
  /** Serves the World at /world/ from now on; its token must be 32 random bytes (contracts/web-world.ts). */
  serveWorld(route:WorldRoute){if(!WORLD_TOKEN.test(route.token))throw new Error('The World needs a 32-byte token.');world=route;},
  close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}
export type LocalServer=Awaited<ReturnType<typeof serveLocalRelay>>;
