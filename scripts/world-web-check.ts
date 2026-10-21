// The World in a browser beside the app's window (host/world-web.ts): the app serves the same World page on its local
// relay while it runs, with the same guards as the Node host (Host 421, Origin 403, the token 401, WEB_DENIED), and
// writes the link to the library's owner-only world-link.txt from a token the vault keeps. Its two pages do not fight
// over "one page at a time": the window stays the World's page, a browser's page is an extra one (the newest browser
// tab takes over an older one), events and snapshots reach both, window calls only the window, and a call about a Fox
// turn goes back to the page that started it. The Agent's `world/link` adds this computer's link to the room link.
// The World document carries the web policy as a header in place of the window's meta tag, and the host refuses what
// the page's window cannot do (WEB_PAGE_ACTIONS).
// Electron itself does not run here: main.ts only wires these pieces together.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import type {Duplex} from 'node:stream';
import {withTempDir} from './test-temp.ts';
import {createLocalRelay,serveLocalRelay} from '../platform/host/modules/windows/local-relay.ts';
import {createWebPage} from '../platform/host/web-page.ts';
import {createPagePair,serveWorldWeb,WORLD_LINK_FILE,WORLD_TOKEN_VAULT} from '../platform/host/world-web.ts';
import type {PageBridge} from '../platform/host/types.ts';
import {WEB_DENIED_MESSAGE,WEB_PAGE_ACTIONS,WEB_PAGE_FEATURES,WEB_PAGE_UNAVAILABLE,WORLD_ELSEWHERE_CODE,WORLD_PAGE_CSP,WORLD_PROTOCOL,webDenied,webEventDetail,worldLinkToken,worldTokenProtocol,worldWebCsp} from '../contracts/web-world.ts';
import {worldLinkReply} from '../platform/web/index.ts';

const opened:Duplex[]=[];
/** A WebSocket client written out, so the check chooses every header a browser would set itself. */
function connect(port:number,headers:Record<string,string>){
 return new Promise<{status:number;socket?:Duplex;frames:any[];closed:Promise<number>;send(value:unknown):void;next(test:(frame:any)=>boolean):Promise<any>}>((resolve,reject)=>{
  const request=http.request({host:'127.0.0.1',port,path:'/world/socket',headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':crypto.randomBytes(16).toString('base64'),...headers}});
  request.on('response',response=>{response.resume();resolve({status:response.statusCode||0,frames:[],closed:Promise.resolve(0),send(){},next:()=>Promise.reject(Error('closed'))});});
  request.on('upgrade',(response,socket,head)=>{
   opened.push(socket);
   const frames:any[]=[],waiters:{test:(frame:any)=>boolean;resolve:(frame:any)=>void}[]=[];
   let buffer=Buffer.alloc(0),closeCode:(code:number)=>void=()=>{};
   const closed=new Promise<number>(done=>{closeCode=done;});
   const read=(chunk:Buffer)=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=2){
     let length=buffer[1]&0x7f,offset=2;
     if(length===126){length=buffer.readUInt16BE(2);offset=4;}else if(length===127){length=Number(buffer.readBigUInt64BE(2));offset=10;}
     if(buffer.length<offset+length)return;
     const opcode=buffer[0]&0x0f,payload=buffer.subarray(offset,offset+length);buffer=buffer.subarray(offset+length);
     if(opcode===8){closeCode(payload.length>=2?payload.readUInt16BE(0):1005);socket.destroy();return;}
     const frame=JSON.parse(payload.toString('utf8'));frames.push(frame);
     for(const waiter of [...waiters])if(waiter.test(frame)){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(frame);}
    }
   };
   // What came with the answer's headers (the handshake, often) is the first data.
   if(head.length)queueMicrotask(()=>read(head));
   socket.on('data',read);
   socket.on('close',()=>closeCode(1006));
   const send=(value:unknown)=>{
    const payload=Buffer.from(JSON.stringify(value)),mask=crypto.randomBytes(4),masked=Buffer.from(payload.map((byte,i)=>byte^mask[i&3]));
    const header=payload.length<126?Buffer.from([0x81,0x80|payload.length]):Buffer.from([0x81,0x80|126,payload.length>>8,payload.length&255]);
    socket.write(Buffer.concat([header,mask,masked]));
   };
   const next=(test:(frame:any)=>boolean)=>{const found=frames.find(test);if(found)return Promise.resolve(found);return new Promise(resolve=>waiters.push({test,resolve}));};
   resolve({status:response.statusCode||0,socket,frames,closed,send,next});
  });
  request.on('error',reject);request.end();
 });
}
const within=<T>(promise:Promise<T>,what:string)=>Promise.race([promise,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Timed out: '+what)),5000))]);

await withTempDir('worldlet-world-web-',async root=>{
 // 1. The link: a token the vault keeps, the link in an owner-only file, the same across a restart.
 const secrets=new Map<string,string>(),vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,secret:string)=>void secrets.set(id,secret)};
 const webRoot=path.join(root,'WorldletWeb');fs.mkdirSync(webRoot);fs.writeFileSync(path.join(webRoot,'index.html'),`<!doctype html><meta http-equiv="Content-Security-Policy" content="${WORLD_PAGE_CSP}"><title>World</title>`);
 fs.writeFileSync(path.join(webRoot,'gallery.html'),'<!doctype html><title>Gallery</title>');
 const server=await serveLocalRelay({relay:createLocalRelay(),pageRoot:path.join(root,'open'),ports:[0]});
 try{
  // The window's page, as host/page.ts gives it: what it was called with, and whether it is loaded.
  let nativeReady=true;
  const nativeCalls:[string,...unknown[]][]=[],nativeEvents:string[]=[];
  const native:PageBridge={call:async(name,...args)=>{nativeCalls.push([name,...args]);return 'native' as any;},event:name=>{nativeEvents.push(name);},documentEvent:name=>{nativeEvents.push('document:'+name);},ready:()=>nativeReady};
  const dispatched:Record<string,unknown>[]=[];
  let pages!:ReturnType<typeof createPagePair>;
  const web=createWebPage({platform:'macos',dispatch:async body=>{pages.note('web',body);dispatched.push(body);const value={ok:true,id:body.action==='appletTaskStart'?'task-web':undefined};pages.note('web',body,value);return value;},loaded(){},gone(){}});
  pages=createPagePair(native,web.page);
  const served=serveWorldWeb({root,webRoot,vault,server,accept:socket=>web.connect(socket)});
  const file=path.join(root,WORLD_LINK_FILE),link=fs.readFileSync(file,'utf8').trim();
  assert.equal(link,served.link);
  assert.match(link,/^http:\/\/127\.0\.0\.1:\d+\/world\/#t=[A-Za-z0-9_-]{43}$/,'the World link: this computer, a 32-byte token in the fragment');
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600,'the link file is owner-only');
  const token=worldLinkToken(new URL(link).hash);
  assert.equal(secrets.get(WORLD_TOKEN_VAULT),token,'the vault keeps the token');
  assert.equal(serveWorldWeb({root,webRoot,vault,server,accept:socket=>web.connect(socket)}).link,link,'a restart keeps the same link');
  console.log('PASS world web link: a token the vault keeps, the link in an owner-only world-link.txt, the same after a restart');

  // 2. The guards, as the Node host's.
  const here=`127.0.0.1:${server.port}`,origin=`http://${here}`,protocols=`${WORLD_PROTOCOL}, ${worldTokenProtocol(token)}`;
  const get=(pathname:string,host=here)=>new Promise<{status:number;headers:http.IncomingHttpHeaders;body:string}>((resolve,reject)=>http.get({host:'127.0.0.1',port:server.port,path:pathname,headers:{Host:host}},response=>{
   let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;});response.on('end',()=>resolve({status:response.statusCode||0,headers:response.headers,body}));}).on('error',reject));
  const page=await get('/world/');
  assert.equal(page.status,200,'the World page is served');
  // The web policy as a header, for the name the browser used, in place of the window's meta tag.
  assert.equal(page.headers['content-security-policy'],worldWebCsp(origin),'the World page carries the web policy');
  assert.equal(page.body,'<!doctype html><title>World</title>','and the window\'s meta policy is taken out');
  assert.equal(Number(page.headers['content-length']),Buffer.byteLength(page.body));
  assert.equal((await get('/world/index.html',`localhost:${server.port}`)).headers['content-security-policy'],worldWebCsp(`http://localhost:${server.port}`),'by either name');
  assert.equal((await get('/world/gallery.html')).headers['content-security-policy'],"frame-ancestors 'none'",'another page keeps its own policy');
  const policy=worldWebCsp(origin);
  assert.ok(policy.includes(`connect-src 'self' ws://${here}/world/socket;`)&&policy.includes("frame-ancestors 'none'"),'it connects only to its own origin and socket, and no site frames it');
  assert.ok(!/worldlet:|https:/.test(policy),'and reaches no other origin');
  // The window's policy is the one the interface build writes, unchanged.
  assert.ok(fs.readFileSync(path.join(import.meta.dirname,'build-native-ui.ts'),'utf8').includes('content="${WORLD_PAGE_CSP}"'),'the build writes the window\'s policy');
  assert.equal(WORLD_PAGE_CSP,"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com; connect-src 'self' worldlet://app; worker-src blob:; media-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",'the window keeps its policy');
  assert.equal((await connect(server.port,{Host:`worldlet.example.com:${server.port}`,Origin:origin,'Sec-WebSocket-Protocol':protocols})).status,421,'another Host is refused');
  assert.equal((await connect(server.port,{Host:here,Origin:'https://worldlet.example.com','Sec-WebSocket-Protocol':protocols})).status,403,'another Origin is refused');
  assert.equal((await connect(server.port,{Host:here,Origin:origin,'Sec-WebSocket-Protocol':WORLD_PROTOCOL})).status,401,'a missing token is refused');
  assert.equal((await connect(server.port,{Host:here,Origin:origin,'Sec-WebSocket-Protocol':`${WORLD_PROTOCOL}, ${worldTokenProtocol('A'.repeat(43))}`})).status,401,'another token is refused');

  // 3. A browser's page beside the window.
  const first=await connect(server.port,{Host:here,Origin:origin,'Sec-WebSocket-Protocol':protocols});
  assert.equal(first.status,101,'the socket opens with the token');
  assert.deepEqual((await within(first.next(frame=>'h' in frame),'handshake')).h,{version:1,platform:'macos',features:{...WEB_PAGE_FEATURES}},'it hears what its window cannot do');
  first.send({q:1,body:{action:'dataBackup',operation:'restore'}});
  assert.deepEqual(await within(first.next(frame=>frame.a===1),'denied'),{a:1,ok:false,error:WEB_DENIED_MESSAGE},'WEB_DENIED holds');
  first.send({q:2,body:{action:'phonePair',kind:'local',operation:'world'}});
  assert.deepEqual(await within(first.next(frame=>frame.a===2),'world link denied'),{a:2,ok:false,error:WEB_DENIED_MESSAGE},'a browser\'s page cannot ask for the World link');
  // What the page's window cannot do is refused too, with the reason Fox's tools give, before the router.
  let request=10;
  for(const [feature,actions] of Object.entries(WEB_PAGE_ACTIONS))for(const action of Object.keys(actions!)){
   first.send({q:++request,body:{action,operation:'show'}});
   assert.deepEqual(await within(first.next(frame=>frame.a===request),action),{a:request,ok:false,error:WEB_PAGE_UNAVAILABLE[feature as keyof typeof WEB_PAGE_UNAVAILABLE]},action+' is refused');
  }
  assert.deepEqual(dispatched,[],'and the router never saw them');
  first.send({q:++request,body:{action:'browserCommand',operation:'visitedSites',args:{},agent:false}});
  await within(first.next(frame=>frame.a===request),'visitedSites');
  assert.deepEqual(dispatched.splice(0),[{action:'browserCommand',operation:'visitedSites',args:{},agent:false}],'the sites the browser visited stay readable');
  assert.equal(webDenied({action:'analyticsConfig'}),WEB_DENIED_MESSAGE,'no web capture in a browser, so nothing goes to /ingest');
  assert.equal(webDenied({action:'snapshot'}),'','the World itself is not refused');
  assert.equal(pages.page.ready(),true);

  // A Fox turn the browser's page started: its tool calls go back to it, not to the window.
  first.send({q:3,body:{action:'agentChat',id:'turn-web',text:'Hello'}});
  await within(first.next(frame=>frame.a===3),'agentChat');
  assert.equal(pages.owner('turn-web'),'web');
  const tool=pages.page.call('worldletAgentTool','turn-web',{type:'tool',name:'inspect_world'});
  const asked=await within(first.next(frame=>frame.name==='worldletAgentTool'),'tool call');
  assert.deepEqual(asked.args,['turn-web',{type:'tool',name:'inspect_world'}]);
  first.send({r:asked.c,value:{ok:true,from:'web'}});
  assert.deepEqual(await within(tool,'tool answer'),{ok:true,from:'web'},'the browser\'s page answers its turn\'s tool');
  // An Applet task the host started for that page's turn (its id came back in the answer) goes there too.
  first.send({q:4,body:{action:'appletTaskStart',applet:'app-notes',task:'Sum up'}});
  await within(first.next(frame=>frame.a===4),'appletTaskStart');
  assert.equal(pages.owner('task-web'),'web','the task the host answered with is the browser page\'s');
  // A turn the window started stays the window's.
  pages.note('native',{action:'agentChat',id:'turn-native'});
  assert.equal(await pages.page.call('worldletAgentTool','turn-native',{type:'tool'}),'native');
  assert.deepEqual(nativeCalls.at(-1),['worldletAgentTool','turn-native',{type:'tool'}]);
  // Window calls reach only the window; the World's snapshot and events reach both pages.
  const callsBefore=first.frames.filter(frame=>'c' in frame).length;
  await pages.page.call('worldletDesktopCompanion',true);
  assert.deepEqual(nativeCalls.at(-1),['worldletDesktopCompanion',true]);
  const receive=pages.page.call('worldletReceive',{revision:7});
  const snapshot=await within(first.next(frame=>frame.name==='worldletReceive'),'snapshot');
  assert.deepEqual(snapshot.args,[{revision:7}]);first.send({r:snapshot.c});
  assert.equal(await receive,'native','the window answers the snapshot as before');
  assert.deepEqual(nativeCalls.at(-1),['worldletReceive',{revision:7}],'and the window gets it too');
  assert.equal(first.frames.filter(frame=>'c' in frame).length,callsBefore+1,'the browser never hears a window call');
  pages.page.event('worldlet:job',{phase:'done'});
  assert.deepEqual((await within(first.next(frame=>frame.v==='worldlet:job'),'event')).detail,{phase:'done'});
  assert.ok(nativeEvents.includes('worldlet:job'),'events reach both pages');
  // A pairing's status event reaches the browser's page without its link (the pairing's secret), as its reply does.
  for(const name of ['worldlet:phone-status','worldlet:web-pair-status','worldlet:local-pair-status','worldlet:agent-pair-status','worldlet:world-pair-status']){
   pages.page.event(name,{state:'waiting',link:'https://relay.example.com/open/#s=secret'});
   assert.deepEqual((await within(first.next(frame=>frame.v===name),name)).detail,{state:'waiting'},name+' comes without its link');
  }
  assert.deepEqual(webEventDetail('worldlet:job',{link:'kept'}),{link:'kept'},'other events are unchanged');
  // Anything else goes to the window while it is loaded, else to the browser's page.
  assert.equal(await pages.page.call('worldletCodexEvent',{id:'x'}),'native');
  nativeReady=false;
  const fallback=pages.page.call('worldletCodexEvent',{id:'y'});
  const codex=await within(first.next(frame=>frame.name==='worldletCodexEvent'),'fallback call');first.send({r:codex.c,value:'web'});
  assert.equal(await fallback,'web','with no window page, the browser\'s page answers');
  nativeReady=true;

  // One browser page at a time: a newer tab takes over the older one, and the window is not touched.
  const second=await connect(server.port,{Host:here,Origin:origin,'Sec-WebSocket-Protocol':protocols});
  assert.equal(second.status,101);
  await within(second.next(frame=>'h' in frame),'second handshake');
  assert.equal(await within(first.closed,'takeover'),WORLD_ELSEWHERE_CODE,'the older browser tab is told the World is open elsewhere');
  assert.ok(first.frames.some(frame=>frame.x==='elsewhere'));
  const nativeCount=nativeCalls.length;
  assert.equal(await pages.page.call('worldletShowControls','preferences'),'native','the window keeps its page');
  assert.equal(nativeCalls.length,nativeCount+1);
  web.close();
  assert.equal(await within(second.closed,'host stops'),1001,'the browser page is closed when the app quits');
  assert.equal(pages.page.ready(),true,'and the window stays');
  console.log('PASS world web beside the window: the same guards (Host 421, Origin 403, token 401, WEB_DENIED, WEB_PAGE_ACTIONS) and the web policy in place of the window\'s; a browser\'s page is extra: the window keeps the World, the newest browser tab takes over an older one, events and snapshots reach both, window calls only the window, and a Fox turn\'s calls go back to the page that started it');
 }finally{for(const socket of opened)socket.destroy();await server.close();}
});

// 4. The Agent's world/link: the room link as before, and this computer's World link beside it when the host serves it.
const room='https://worldlet.ai/open/#m=room&k=abc';
const before=worldLinkReply({state:'waiting',link:room});
assert.ok('link' in before&&before.link===room&&!('localLink' in before),'without the local World, the reply is as before');
const local='http://127.0.0.1:47630/world/#t='+'A'.repeat(43);
const both=worldLinkReply({state:'paired',link:room},local);
assert.ok('link' in both&&both.link===room&&both.localLink===local&&both.message.includes('this computer only'),'the local World link comes beside the room link');
assert.ok(!('localLink' in worldLinkReply({state:'paired',link:room},'https://example.com/world/#t='+'A'.repeat(43))),'only a link to this computer');
console.log('PASS world web link for the Agent: world/link returns the room link as before, with this computer\'s World link beside it');
