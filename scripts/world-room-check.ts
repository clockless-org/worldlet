// The full World on another device (core/phone/README.md#the-world-on-another-device): a `world` pairing of its own,
// met in the pairing room, which only forwards. 1. The link, the sealed `{w}` pieces (big frames cut, replay and
// reordering refused) and ROOM_ALLOWED. 2. The host's side in process (world-room-link.ts, host/web-page.ts with
// roomDenied, createPagePair's third page) against the memory room, with a page written out from core's helpers.
// 3. The real thing: the built Node host meets the built World bundle, served as static files at /world/<version>/
// beside a room stand-in on one local origin (as worldlet.ai will serve both), in headless Chromium. The page renders
// the World (pixi-webgl) with its seeded item, asks only what ROOM_ALLOWED lets through, and every room message stays
// under the room's size limit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {Duplex} from 'node:stream';
import {withTempDir} from './test-temp.ts';
import {memoryRoom} from './memory-room.ts';
import {launchTestBrowser,pageErrors,waitForWorld} from './browser-test.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {acceptWebSocket} from '../platform/electron/src/modules/phone/web-socket.ts';
import {resolveWorldFile} from '../platform/electron/src/world/world-file.ts';
import {createWorldRoomLink,WORLD_ROOM_VAULT} from '../platform/electron/src/modules/phone/world-room-link.ts';
import {createWebPage} from '../platform/electron/src/host/web-page.ts';
import {createPagePair,NO_PAGE} from '../platform/electron/src/host/world-web.ts';
import {ROOM_ALLOWED,ROOM_DENIED_MESSAGE,WEB_DENIED_MESSAGE,WEB_PAGE_FEATURES,WEB_PAGE_UNAVAILABLE,roomDenied} from '../contracts/web-world.ts';
import {newPairSecret,openHello,pairKeys,readWorldRoomFrame,readWorldRoomLink,roomEntry,sealJoin,worldBundlePath,worldRoomLink,worldRoomNonce,worldRoomSession,WORLD_ROOM_PIECE,ROOM_PROTOCOL,isWorldRoomPage} from '../core/phone/index.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
/** The room's own limit on one message (worker/room.ts in the operations repository). */
const ROOM_MESSAGE_LIMIT=300_000;
const within=<T>(promise:Promise<T>,what:string,ms=10_000)=>Promise.race([promise,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Timed out: '+what)),ms))]);

// 1. The link, the pieces and the allow list.
{
 const secret=newPairSecret(),link=worldRoomLink({base:'https://worldlet.ai'+worldBundlePath('2026.1015.1'),secret,name:'Studio Mac'});
 assert.match(link,/^https:\/\/worldlet\.ai\/world\/2026\.1015\.1\/#v=1&s=[A-Za-z0-9_-]{43}&n=Studio\+Mac&m=room$/);
 const read=readWorldRoomLink(link);
 assert.deepEqual([...read.secret],[...secret]);assert.equal(read.relay,'https://worldlet.ai');assert.equal(read.name,'Studio Mac');
 assert.equal(readWorldRoomLink(link.slice(link.indexOf('#'))).relay,'','a bare fragment: the page uses its own origin');
 assert.throws(()=>readWorldRoomLink(link.replace('/world/2026.1015.1/','/open/')),/not a Worldlet World link/,'only the World bundle\'s address');
 assert.throws(()=>readWorldRoomLink(link.replace('&m=room','')),/no World/);
 assert.ok(isWorldRoomPage('/world/2026.1015.1/',link.slice(link.indexOf('#')))&&!isWorldRoomPage('/world/',link.slice(link.indexOf('#'))),'the computer\'s own /world/ page is not a room page');

 const keys=await pairKeys(secret),host=worldRoomNonce(),page=worldRoomNonce();
 const desktop=worldRoomSession(keys,host,page,'desktop'),browser=worldRoomSession(keys,host,page,'page');
 const big=JSON.stringify({c:1,name:'worldletReceive',args:[{art:'data:image/png;base64,'+'A'.repeat(350_000)}]});
 const pieces=await desktop.seal(big);
 assert.equal(pieces.length,Math.ceil(big.length/WORLD_ROOM_PIECE),'a big frame goes in pieces');
 assert.ok(pieces.every(data=>JSON.stringify({data,to:'p1'}).length<ROOM_MESSAGE_LIMIT),'each under the room\'s limit');
 let whole:string|null=null;for(const data of pieces)whole=await browser.open(readWorldRoomFrame(data)!.box);
 assert.equal(whole,big,'and comes back whole');
 const [first]=await desktop.seal('{"v":"x"}');
 await browser.open(readWorldRoomFrame(first)!.box);
 await assert.rejects(browser.open(readWorldRoomFrame(first)!.box),'a replayed piece is refused');
 await desktop.seal('{"v":"a"}');
 const [b]=await desktop.seal('{"v":"b"}');
 const fresh=worldRoomSession(keys,host,page,'page');for(const data of pieces)await fresh.open(readWorldRoomFrame(data)!.box);await fresh.open(readWorldRoomFrame(first)!.box);
 await assert.rejects(fresh.open(readWorldRoomFrame(b)!.box),'a piece out of order is refused');
 await assert.rejects(worldRoomSession(keys,host,worldRoomNonce(),'page').open(readWorldRoomFrame(pieces[0])!.box),'another session\'s piece is refused');
 await assert.rejects(worldRoomSession(keys,host,page,'desktop').open(readWorldRoomFrame(pieces[0])!.box),'and one going the other way');

 for(const action of ['snapshot','agentChat','worldItemStatus','artifacts','appContent','calendarEvents','widgets'])assert.equal(roomDenied({action}),'',action+' is allowed');
 assert.equal(roomDenied({action:'artifactPages',operation:'get'}),'');
 assert.equal(roomDenied({action:'artifactPages',operation:'show'}),ROOM_DENIED_MESSAGE,'no native view on the computer\'s screen');
 for(const action of ['connect','modelSettings','harnessConnections','settings','widgetPlayer','madeGamePlayer','openInstalledApplet','appUpdate','exportDiagnostics','madeGameDelete','deleteWorldItem','nothing'])assert.equal(roomDenied({action}),ROOM_DENIED_MESSAGE,action+' is refused');
 assert.equal(roomDenied({action:'phonePair',kind:'world',operation:'status'}),ROOM_DENIED_MESSAGE,'pairing, even its status');
 assert.equal(roomDenied({action:'dataBackup'}),WEB_DENIED_MESSAGE,'WEB_DENIED holds first');
 assert.equal(roomDenied({action:'browserShow'}),WEB_PAGE_UNAVAILABLE.websitePages,'and what a browser window cannot do');
 for(const action of Object.keys(ROOM_ALLOWED))assert.equal(roomDenied({action,operation:'get'}),'',action);
 console.log('PASS world room link and frames: the World bundle\'s address with the pairing in the fragment; sealed pieces under the room\'s limit, whole again on the other side, replay, reordering and another session refused; ROOM_ALLOWED with WEB_DENIED and WEB_PAGE_ACTIONS before it');
}

/** A page written out from core's helpers: joins the room as the `phone` side and speaks the World's frames. */
async function roomPage(Socket:any,link:string){
 const read=readWorldRoomLink(link),keys=await pairKeys(read.secret),{url,protocols}=await roomEntry(keys,read.relay,'phone');
 const ws=new Socket(url,protocols),frames:any[]=[],waiters:{test:(f:any)=>boolean,resolve:(f:any)=>void}[]=[];
 let session:ReturnType<typeof worldRoomSession>|null=null,queue=Promise.resolve();
 const got=(frame:any)=>{frames.push(frame);for(const w of [...waiters])if(w.test(frame)){waiters.splice(waiters.indexOf(w),1);w.resolve(frame);}};
 ws.onmessage=(event:{data:string})=>{queue=queue.then(async()=>{
  const message=JSON.parse(event.data);if(message.t!=='msg')return;
  const frame=readWorldRoomFrame(message.data);if(!frame)return;
  if(frame.kind==='hello'){const host=await openHello(keys,frame.box),page=worldRoomNonce();session=worldRoomSession(keys,host,page,'page');ws.send(JSON.stringify({data:await sealJoin(keys,host,page)}));return;}
  const text=await session!.open(frame.box);if(text!==null)got(JSON.parse(text));
 });};
 return {frames,ws,
  next:(test:(f:any)=>boolean)=>{const found=frames.find(test);return found?Promise.resolve(found):new Promise<any>(resolve=>waiters.push({test,resolve}));},
  async send(frame:unknown){for(const data of await session!.seal(JSON.stringify(frame)))ws.send(JSON.stringify({data}));},
 };
}

// 2. The host's side in process.
await (async()=>{
 const room=memoryRoom(),secrets=new Map<string,string>(),vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,v:string)=>void secrets.set(id,v),delete:(id:string)=>void secrets.delete(id)};
 const dispatched:Record<string,unknown>[]=[],statuses:string[]=[];
 let pages!:ReturnType<typeof createPagePair>;
 const remote=createWebPage({platform:'linux',denied:roomDenied,dispatch:async body=>{dispatched.push(body);pages.note('remote',body);return body.action==='snapshot'?{revision:3}:{ok:true};},loaded(){},gone(){}});
 const webCalls:string[]=[];
 const web={call:async(name:string)=>{webCalls.push(name);return 'web' as any;},event(){},documentEvent(){},ready:()=>false};
 pages=createPagePair(NO_PAGE,web,remote.page);
 const link=createWorldRoomLink({vault,name:()=>'Studio Mac',version:'2026.1015.1',relay:'https://worldlet.ai',accept:socket=>remote.connect(socket),WebSocket:room.Socket as any,onChange:s=>statuses.push(s.state)});
 assert.deepEqual(link.status(),{state:'none'});
 const started=await link.start();
 assert.equal(started.state,'waiting');
 assert.match(started.link!,/^https:\/\/worldlet\.ai\/world\/2026\.1015\.1\/#v=1&s=[A-Za-z0-9_-]{43}&n=Studio\+Mac&m=room$/,'the World bundle of this version');
 assert.ok(secrets.has(WORLD_ROOM_VAULT),'the pairing is in the vault');
 const tab=await roomPage(room.Socket,started.link!);
 const hello=await within(tab.next(f=>'h' in f),'handshake');
 assert.deepEqual(hello.h,{version:1,platform:'linux',features:{...WEB_PAGE_FEATURES}},'the same handshake as a browser here');
 assert.equal(link.status().state,'paired');assert.equal(pages.page.ready(),true,'the remote page is the World\'s page now');
 await tab.send({q:1,body:{action:'snapshot'}});
 assert.deepEqual(await within(tab.next(f=>f.a===1),'snapshot'),{a:1,ok:true,value:{revision:3}});
 await tab.send({q:2,body:{action:'connect',provider:'gmail'}});
 assert.deepEqual(await within(tab.next(f=>f.a===2),'connect'),{a:2,ok:false,error:ROOM_DENIED_MESSAGE},'ROOM_ALLOWED holds in the host');
 await tab.send({q:3,body:{action:'phonePair',kind:'world',operation:'status'}});
 assert.equal((await within(tab.next(f=>f.a===3),'pair')).ok,false);
 assert.deepEqual(dispatched.map(b=>b.action),['snapshot'],'the router saw only what was allowed');
 // A big call from the host comes through whole, and the page's answer goes back.
 const art='data:image/png;base64,'+'B'.repeat(400_000);
 const call=pages.page.call('worldletReceive',{art});
 const asked=await within(tab.next(f=>f.name==='worldletReceive'),'big call');
 assert.equal(asked.args[0].art,art,'a snapshot larger than a room message arrives whole');
 await tab.send({r:asked.c,value:'taken'});
 assert.equal(await within(call,'answer'),'taken');
 // A Fox turn the remote page started: its tools go back to it.
 await tab.send({q:4,body:{action:'agentChat',id:'turn-remote',text:'Hi'}});
 await within(tab.next(f=>f.a===4),'agentChat');
 assert.equal(pages.owner('turn-remote'),'remote');
 const tool=pages.page.call('worldletAgentTool','turn-remote',{name:'inspect_world'});
 const toolAsk=await within(tab.next(f=>f.name==='worldletAgentTool'),'tool');
 await tab.send({r:toolAsk.c,value:{ok:true}});
 assert.deepEqual(await tool,{ok:true});
 assert.deepEqual(webCalls,[],'nothing went to the browser page here');
 // One remote page at a time: a newer tab takes over and the older one is told so.
 const second=await roomPage(room.Socket,started.link!);
 await within(second.next(f=>'h' in f),'second handshake');
 assert.ok(await within(tab.next(f=>f.x==='elsewhere'),'takeover'),'the older tab hears the World is open elsewhere');
 // The computer's room connection goes: the page is gone; turning the link off ends it for good.
 await link.end();
 assert.equal(pages.page.ready(),false,'the page went with the room');
 assert.equal(secrets.has(WORLD_ROOM_VAULT),false);
 assert.deepEqual(link.status(),{state:'none'});
 console.log('PASS world room host: a `world` link of its own, a page in the room gets the same handshake as a browser here, ROOM_ALLOWED enforced before the router, a snapshot bigger than a room message whole, its Fox turn\'s tools back to it, one remote page at a time, and turning the link off ends it');
})();

// 3. The built Node host and the built World bundle, in headless Chromium.
const web=path.join(root,'dist/WorldletWeb');
if(!fs.existsSync(path.join(web,'applet-runtime.json')))execFileSync('npm',['run','build:native-ui'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
const TYPES:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm','.m4a':'audio/mp4','.mp3':'audio/mpeg','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm','.riv':'application/octet-stream','.md':'text/markdown','.txt':'text/plain','.gif':'image/gif'};
await withTempDir('wl-room-',async temp=>{
 // The relay stand-in: the World bundle as static files that hold no data at /world/<version>/, and the room at
 // /api/room/<name>, on one origin. Every room message is measured against the room's limit.
 const room=memoryRoom(),oversized:number[]=[],realRoot=fs.realpathSync(web),opened:Duplex[]=[];
 let roomMessages=0;
 const server=http.createServer((req,res)=>void (async()=>{
  const url=new URL(req.url||'/','http://relay');
  const match=/^\/world\/[^/]+(\/.*)$/.exec(url.pathname);
  const file=match&&await resolveWorldFile(realRoot,match[1]);
  if(!file||!TYPES[path.extname(file).toLowerCase()]){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':TYPES[path.extname(file).toLowerCase()]});fs.createReadStream(file).pipe(res);
 })().catch(()=>{res.writeHead(500).end();}));
 server.on('upgrade',(req,socket:Duplex,head)=>{
  opened.push(socket);
  const url=new URL(req.url||'/','http://relay'),protocols=String(req.headers['sec-websocket-protocol']||'').split(',').map(p=>p.trim());
  if(!url.pathname.startsWith('/api/room/')){socket.destroy();return;}
  const page=acceptWebSocket(req,socket,head,ROOM_PROTOCOL);if(!page)return;
  void room.connect('ws://relay'+url.pathname,protocols,text=>page.send(text),()=>page.close()).then(side=>{
   if(!side){page.close(4003,'Refused');return;}
   page.onMessage(text=>{roomMessages++;if(text.length>ROOM_MESSAGE_LIMIT)oversized.push(text.length);else side.send(text);});
   page.onClose(()=>side.leave());
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const relay=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const program=path.join(temp,'program'),library=path.join(temp,'library'),title='Renew the library card';
 execFileSync(process.execPath,[path.join(root,'scripts/build-node-host.ts'),'--out',program],{cwd:root,stdio:'inherit'});
 fs.symlinkSync(web,path.join(program,'WorldletWeb'),process.platform==='win32'?'junction':'dir');
 const ledger=new WorldLedger(library);
 ledger.saveConfiguration({version:1,workspaceId:'WORLD-ROOM-CHECK',revision:1,sources:[],knowledge:[],layout:null,codexPath:'',model:'',cloudConsent:true,lastJob:'',autoSync:false,
  connections:[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true}],
  onboarding:{unlockedApplets:['app-gmail','app-browser'],version:1,presets:['home'],completed:true,introStep:9}});
 ledger.upsert([{kind:'task',provider:'gmail',status:'open',title,context:'Due Friday.',reason:'Due Friday.',summary:'The library wrote about the card.',attentionContentVersion:1,policyVersion:2,attentionReason:'due',
  sources:[{provider:'gmail',id:'library-mail',quote:'Your card expires Friday.'}],createdAt:1,updatedAt:2}],'world-room-check',true);
 ledger.close();
 const child=spawn(process.execPath,[path.join(program,'worldlet.cjs')],{cwd:temp,env:{...process.env,WORLDLET_PROFILE_ROOT:library,WORLDLET_PAIR_RELAY:relay},stdio:['ignore','pipe','pipe',...process.platform==='win32'?['ipc' as const]:[]]});
 let out='';child.stdout.on('data',chunk=>{out+=chunk;});child.stderr.on('data',chunk=>{out+=chunk;});
 const exited=new Promise<number|null>(resolve=>child.on('exit',code=>resolve(code)));
 try{
  const deadline=Date.now()+30_000;
  while(!/World link for another device ready in /.test(out)&&child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  assert.match(out,/World link for another device ready in .*world-room-link\.txt/,'the host makes the World link for another device: '+out.slice(-600));
  const file=path.join(library,'world-room-link.txt'),link=fs.readFileSync(file,'utf8').trim();
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600,'owner-only');
  assert.ok(link.startsWith(relay+'/world/')&&readWorldRoomLink(link).secret.length===32,'the World bundle on the relay, the pairing in the fragment');
  assert.ok(!out.includes(link.slice(link.indexOf('#')+1)),'the log never holds the link');
  assert.ok(!fs.readFileSync(path.join(library,'vault.json'),'utf8').includes(new URLSearchParams(link.slice(link.indexOf('#')+1)).get('s')!),'the vault holds the pairing sealed');
  const browser=await launchTestBrowser();
  try{
   const context=await browser.newContext({viewport:{width:1280,height:800}});
   const page=await context.newPage(),errors=pageErrors(page);
   await page.goto(link);
   await waitForWorld(page);
   await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement&{sceneMetrics?:{renderer?:string}})?.sceneMetrics?.renderer==='pixi-webgl',undefined,{timeout:120_000});
   await page.getByText(title).first().waitFor({timeout:60_000});
   assert.equal(new URL(page.url()).hash,'','the pairing leaves the address once the page has it');
   assert.deepEqual(await page.evaluate(()=>(window as any).worldletWebHost.features),{...WEB_PAGE_FEATURES},'the page hears what its window cannot do');
   const ask=(body:Record<string,unknown>)=>page.evaluate(body=>(window as any).worldletWebHost.request(body).then(()=>'',(error:Error)=>error.message),body);
   assert.equal(await ask({action:'snapshot'}),'','the World is there');
   assert.equal(await ask({action:'connect',provider:'gmail'}),ROOM_DENIED_MESSAGE,'connecting an account is refused');
   assert.equal(await ask({action:'phonePair',kind:'phone',operation:'start'}),WEB_DENIED_MESSAGE,'pairing is refused');
   assert.equal(await ask({action:'speechStart'}),WEB_PAGE_UNAVAILABLE.voice,'the microphone is refused');
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.worldClosed??''),'','the World stays open');
   assert.deepEqual(errors,[],'no page errors');
   // A second device takes the World; the first says where it is.
   const second=await context.newPage();
   await second.goto(link);
   await waitForWorld(second);
   await page.waitForFunction(()=>document.documentElement.dataset.worldClosed==='true',undefined,{timeout:30_000});
   assert.match(await page.locator('#nativeNotice').textContent()||'',/open in another browser tab or device/);
   await second.getByText(title).first().waitFor({timeout:60_000});
  }finally{await browser.close();}
  assert.ok(roomMessages>10,'the World went through the room');
  assert.deepEqual(oversized,[],'every room message under the room\'s limit');
  console.log(`PASS world room end to end: the Node host writes the World link for another device; the built World bundle, served as static files beside a room stand-in, joins from the fragment and renders the World (pixi-webgl) with its item; ROOM_ALLOWED, WEB_DENIED and WEB_PAGE_ACTIONS refused in the host; one device at a time; ${roomMessages} room messages, none over the room's limit`);
 }finally{
  if(process.platform==='win32')child.send({type:'worldlet:stop'});else child.kill('SIGTERM');
  const code=await Promise.race([exited,new Promise<'hung'>(resolve=>setTimeout(()=>resolve('hung'),20_000))]);
  if(code==='hung')child.kill('SIGKILL');
  for(const socket of opened)socket.destroy();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  assert.equal(code,0,'stops cleanly with a remote World page open: '+out.slice(-400));
 }
},process.platform==='win32'?os.tmpdir():'/tmp');
