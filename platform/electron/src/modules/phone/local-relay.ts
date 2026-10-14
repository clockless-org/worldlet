import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

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
/** Serves the page from `pageRoot` at `/open/` and the relay at `/api/pair` on 127.0.0.1, on the first free port from
 * `ports`. Only requests addressed to this computer by name are answered (`Host` must be 127.0.0.1 or localhost on that
 * port), so a website cannot reach it through a name it points at 127.0.0.1, and no answer allows another origin to
 * read it. */
export async function serveLocalRelay({relay,pageRoot,ports}:{relay:LocalRelay,pageRoot:string,ports:number[]}){
 let port=0;
 const server=http.createServer((req,res)=>void answer(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();}));
 async function answer(req:http.IncomingMessage,res:http.ServerResponse){
  const host=String(req.headers.host||'');
  if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`){res.writeHead(421).end();return;}
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
  if(url.pathname==='/'||url.pathname==='/open'){res.writeHead(302,{Location:'/open/'}).end();return;}
  const file=url.pathname==='/open/'?'index.html':url.pathname.startsWith('/open/')?url.pathname.slice(6):'';
  if(!file||!/^[a-z0-9.-]+$/i.test(file)||!TYPES[path.extname(file)]){res.writeHead(404).end();return;}
  let data:Buffer;try{data=await fs.promises.readFile(path.join(pageRoot,file));}catch{res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':TYPES[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});
  res.end(data);
 }
 for(const candidate of ports){
  const ok=await new Promise<boolean>(resolve=>{
   const failed=()=>{server.off('listening',listening);resolve(false);},listening=()=>{server.off('error',failed);resolve(true);};
   server.once('error',failed);server.once('listening',listening);server.listen(candidate,'127.0.0.1');
  });
  if(ok){port=(server.address() as {port:number}).port;break;}
 }
 if(!port)throw new Error('No free port on this computer for Worldlet in a browser.');
 return {origin:`http://127.0.0.1:${port}`,port,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}
