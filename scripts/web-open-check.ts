// Worldlet in a web browser (agent/base/README.md#web): the computer's `web` pairing (platform/electron/src/modules/
// phone/relay.ts) and the page (ui/web) against the relay this computer serves itself (local-relay.ts), which answers
// like worker/pairing.ts, over real HTTP on 127.0.0.1: the link, the
// first poll completing the pairing with the browser's name, the Center reaching the page, Done and a chat line
// reaching the computer, the fragment leaving the address bar, a reload from storage, and the page ending with the link.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createPhoneRelay} from '../platform/electron/src/modules/phone/relay.ts';
import {createLocalRelay,serveLocalRelay,LOCAL_RELAY_LIMITS} from '../platform/electron/src/modules/phone/local-relay.ts';
import {createRoomLink} from '../platform/electron/src/modules/phone/room-link.ts';
import {createRtcHost,type RtcPage} from '../platform/electron/src/modules/phone/rtc-host.ts';
import {RTC_PAGE_SCRIPT} from '../platform/electron/src/modules/phone/rtc-page.ts';
import {memoryRoom} from './memory-room.ts';
import {createWebClient,createRoomWebClient,isRoomLink,readWebPairLink,WebPairingEnded,pairKeys,fromBase64url,sha256Hex,worldLinkReply,type PhoneMessage} from '../agent/base/index.ts';
import {resolveAction,worldActions} from '../agent/gate/index.ts';
import {buildWebOpen} from './build-web-open.ts';

// The relay this computer serves itself (local-relay.ts), on a free port, with the page built as the app ships it.
const root=fileURLToPath(new URL('../',import.meta.url)),out=await mkdtemp(path.join(os.tmpdir(),'web-open-'));
await buildWebOpen(root,out);
const local=createLocalRelay(),server=await serveLocalRelay({relay:local,pageRoot:out,ports:[0]}),ORIGIN=server.origin;
const relayFetch=(input:string,init?:RequestInit)=>local.fetch(new Request(input,init));
const memoryVault=()=>{const values=new Map<string,string>();return {get:(id:string)=>values.get(id)??null,set:(id:string,v:string)=>{values.set(id,v);},delete:(id:string)=>{values.delete(id);}};};
const delivered:PhoneMessage[]=[];
const desktop=createPhoneRelay({fetch:(input,init)=>relayFetch(String(input),init),vault:memoryVault(),name:()=>'Studio Mac',userAgent:'check',relay:ORIGIN,kind:'web',
 deliver:async message=>{delivered.push(message);return true;}});
const item=(id:string,group:'event'|'needsAction'|'unseen',action:string)=>({id,ids:[id],group,title:action,action,context:'From Sam',start:null,when:'Today',level:2,snoozed:false});
const attention=(now:any[])=>({v:1,at:new Date().toISOString(),now,later:[],accounts:[{provider:'gmail',title:'Gmail',action:'reconnect'}],
 tasks:{now:[{id:'t1',name:'Today’s prep',status:'Reading Mail',when:'In progress',icon:'fox'}],routines:[{id:'r1',name:'Wrap up today',status:'',when:'6:00 PM',icon:'clock',every:'Every day'}]},
 journal:[{id:'j1',title:'Replied to Sam',kind:'attention',at:new Date().toISOString(),text:'Sent the draft.'}]});

// The link: the relay's own page, the secret in the fragment; a bare fragment reads the same.
const started=await desktop.start();
assert.equal(started.state,'waiting');
const link=started.link!;
assert.match(link,new RegExp('^'+ORIGIN.replace(/[.]/g,'\\.')+'/open/#v=1&s=[A-Za-z0-9_-]{43}&n=Studio\\+Mac$'));
assert.deepEqual(readWebPairLink(link.slice(link.indexOf('#'))).secret,readWebPairLink(link).secret);
assert.equal(readWebPairLink(link).relay,ORIGIN);
assert.throws(()=>readWebPairLink('https://example.com/other/#v=1&s=x'),/not a Worldlet link/);
assert.throws(()=>readWebPairLink('#v=1'),/no pairing code/);

// The protocol alone: the browser's first poll pairs, its name reaches the computer, the Center reaches the browser.
const client=createWebClient({fetch:(input,init)=>relayFetch(String(input),init),link,relay:ORIGIN,name:'Chrome on Mac',version:'web'});
await client.poll();
await desktop.poll();
assert.equal(desktop.status().state,'paired');
assert.equal(desktop.status().phone?.name,'Chrome on Mac');
assert.equal(desktop.status().link,link,'a paired browser link stays shown, so another browser can open it');
await desktop.publish('attention',attention([item('a1','needsAction','Reply to Sam')]));
assert.equal((await client.poll()).attention?.now[0].action,'Reply to Sam');
await client.send({type:'attention',id:'a1',action:'done'});
await desktop.poll();
assert.deepEqual(delivered.map(m=>[m.type,(m as any).action]),[['attention','done']]);

// The page as this computer serves it: real HTTP on 127.0.0.1, nothing routed or faked.
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await desktop.publish('attention',attention([item('a2','event','Dinner with Alex'),item('a3','needsAction','Send the invoice')]));
 await desktop.publish('desktop',{v:1,at:new Date().toISOString(),name:'Studio Mac',version:'2026.1013.4400'});
 await page.goto(link);
 await page.getByText('Send the invoice').waitFor();
 assert.equal(new URL(page.url()).hash,'','the secret leaves the address bar');
 assert.equal(await page.locator('.web-computer').textContent(),'Studio Mac');
 await page.getByText('Connect Gmail on your computer').waitFor();
 await page.getByRole('heading',{name:'Coming up'}).waitFor();
 await page.screenshot({path:path.join(os.tmpdir(),'web-open-needs-you.png')});
 // Done on the page settles the item on the computer and takes it off the page at once.
 await page.locator('.web-item',{hasText:'Send the invoice'}).getByRole('button',{name:'Done'}).click();
 assert.equal(await page.locator('.web-item',{hasText:'Dinner with Alex'}).getByRole('button').first().textContent(),'Got it','an event is acknowledged, as on the computer');
 await page.getByText('Send the invoice').waitFor({state:'detached'});
 for(let i=0;i<50&&!delivered.some(m=>m.type==='attention'&&m.id==='a3');i++){await desktop.poll();await new Promise(r=>setTimeout(r,100));}
 assert(delivered.some(m=>m.type==='attention'&&m.id==='a3'&&m.action==='done'),'Done from the page reaches the computer');
 // What the Agent is doing, and today's Journal.
 await page.getByRole('button',{name:'Working'}).click();
 await page.getByText('Reading Mail').waitFor();await page.getByText('Wrap up today').waitFor();
 await page.getByRole('button',{name:'Today'}).click();
 await page.getByText('Replied to Sam').waitFor();
 // A line for Fox is the person's own message on the computer.
 await page.getByRole('button',{name:'Fox'}).click();
 await page.getByPlaceholder('Message Fox').fill('What is next?');
 await page.getByRole('button',{name:'Send'}).click();
 for(let i=0;i<50&&!delivered.some(m=>m.type==='chat');i++){await desktop.poll();await new Promise(r=>setTimeout(r,100));}
 assert.equal((delivered.find(m=>m.type==='chat') as any)?.text,'What is next?');
 // A reload (or a bookmark of /open/) keeps the link from this browser's storage.
 await page.goto(ORIGIN+'/open/');
 await page.getByRole('button',{name:'Needs you'}).waitFor();
 // Turned off on the computer: the page says so and forgets the link.
 await desktop.end();
 await page.getByRole('heading',{name:'This link is off'}).waitFor({timeout:30000});
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet-web-link')),null);
 // Without a link, the page says where to get one.
 await page.goto(ORIGIN+'/open/');
 await page.getByRole('heading',{name:'Open Worldlet here'}).waitFor();
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
await assert.rejects(client.poll(),WebPairingEnded);
console.log('PASS Worldlet in a web browser: link, pairing, Center, Done, chat, reload and turning the link off.');

// This computer's server (local-relay.ts): only requests addressed to 127.0.0.1 or localhost by name, only the page's
// files, and no answer another origin may read.
{
 const raw=(pathname:string,host:string,headers:Record<string,string>={})=>new Promise<{status:number,headers:http.IncomingHttpHeaders,body:string}>((resolve,reject)=>{
  const request=http.request({host:'127.0.0.1',port:server.port,path:pathname,headers:{Host:host,...headers}},response=>{let body='';response.on('data',c=>body+=c);response.on('end',()=>resolve({status:response.statusCode!,headers:response.headers,body}));});
  request.on('error',reject);request.end();
 });
 const own='127.0.0.1:'+server.port;
 assert.equal((await raw('/open/',own)).status,200);
 assert.equal((await raw('/open/','localhost:'+server.port)).status,200);
 assert.equal((await raw('/open/','attacker.example:'+server.port)).status,421,'a name pointed at 127.0.0.1 is refused');
 assert.equal((await raw('/api/pair/x',own.replace(/\d+$/,'1'))).status,421);
 const page=await raw('/open/',own,{Origin:'https://attacker.example'});
 assert.equal(page.headers['access-control-allow-origin'],undefined);
 assert.match(String(page.headers['content-security-policy']),/default-src 'self'/);
 assert.equal((await raw('/',own)).headers.location,'/open/');
 for(const bad of ['/open/../package.json','/open/%2e%2e%2fpackage.json','/open/missing.js','/open/index.json','/secret','/api/pairing'])assert.equal((await raw(bad,own)).status,404,bad);
 assert.equal((await raw('/api/pair/AAAAAAAAAAAAAAAAAAAAAA',own)).status,404,'an unknown pairing looks ended');
 console.log('PASS this computer serves only the page and the relay, only to itself by name, and lets no other origin read them.');
}

// The relay in memory: a pairing kept from before a restart is handed back already paired; a long poll wakes when the
// other side writes; a browser takes no notifications; a queue that nobody reads is capped.
{
 const vault=new Map<string,string>(),got:PhoneMessage[]=[];
 const memory={get:(id:string)=>vault.get(id)??null,set:(id:string,v:string)=>{vault.set(id,v);},delete:(id:string)=>{vault.delete(id);}};
 const first=createLocalRelay(),computer=(relay:ReturnType<typeof createLocalRelay>)=>createPhoneRelay({fetch:(input,init)=>relay.fetch(new Request(input,init)),vault:memory,vaultName:'local',name:()=>'Studio Mac',userAgent:'check',relay:()=>ORIGIN,kind:'web',deliver:async m=>{got.push(m);return true;}});
 const before=computer(first),{link:made}=await before.start();
 assert(vault.has('local-pairing'),'its own vault entry, beside the relay browser\'s');
 const tab=createWebClient({fetch:(input,init)=>first.fetch(new Request(String(input),init)),link:made!,relay:ORIGIN,name:'Safari on Mac',version:'web'});
 await tab.poll();await before.poll();assert.equal(before.status().state,'paired');
 // Restart: a new relay knows nothing until the computer hands the kept pairing back.
 const second=createLocalRelay(),saved=JSON.parse(vault.get('local-pairing')!),k=await pairKeys(fromBase64url(saved.secret));
 second.adopt(k.id,await sha256Hex(k.desktopToken),await sha256Hex(k.phoneToken),true);
 const after=computer(second),again=createWebClient({fetch:(input,init)=>second.fetch(new Request(String(input),init)),link:made!,relay:ORIGIN,name:'Safari on Mac',version:'web'});
 await after.poll();assert.equal(after.status().state,'paired','still paired after the restart');
 await after.publish('attention',attention([item('r1','needsAction','Pay the rent')]));
 assert.equal((await again.poll()).attention?.now[0].action,'Pay the rent');
 // A long poll returns as soon as the browser says something.
 await after.poll();
 const began=Date.now(),waiting=after.poll(10);
 await new Promise(r=>setTimeout(r,200));await again.send({type:'chat',id:'c1',text:'Hello'});
 assert.equal(await waiting,true);assert(Date.now()-began<5000,'the long poll woke at once');
 assert.equal((got.at(-1) as any).text,'Hello');
 assert.deepEqual(await after.notify({title:'x',body:'y'} as any),{sent:false,reason:'no-device'});
 const flood=createWebClient({fetch:(input,init)=>second.fetch(new Request(String(input),init)),link:made!,relay:ORIGIN,name:'x',version:'web'});
 let refused=false;for(let i=0;i<=LOCAL_RELAY_LIMITS.messages+1&&!refused;i++)await flood.send({type:'chat',id:'f'+i,text:'x'}).catch(()=>{refused=true;});
 assert(refused,'a queue nobody reads stops growing');
 await after.end();await assert.rejects(again.poll(),WebPairingEnded);
 console.log('PASS the in-memory relay: a kept pairing survives a restart, a long poll wakes at once, no notifications, a capped queue.');
}

// Another device's browser meets the computer in the pairing room (agent/base room.ts, room-link.ts), here in memory
// (memory-room.ts).
const room=memoryRoom(),RoomSocket=room.Socket;
// Polls a browser until what it shows passes `ok` (a poll returns once anything new arrives).
const until=async(client:{poll(wait?:number):Promise<any>},ok:(view:any)=>boolean)=>{let view:any=null;for(let i=0;i<30&&!(view&&ok(view));i++)view=await client.poll(1).catch(async()=>{await new Promise(r=>setTimeout(r,100));return null;});return view;};
{
 const vault=new Map<string,string>(),got:PhoneMessage[]=[];
 const memory={get:(id:string)=>vault.get(id)??null,set:(id:string,v:string)=>{vault.set(id,v);},delete:(id:string)=>{vault.delete(id);}};
 const mac=createRoomLink({vault:memory,vaultName:'web-room',name:()=>'Studio Mac',deliver:async m=>{got.push(m);return true;},WebSocket:RoomSocket as any});
 const {link:made,state}=await mac.start();
 assert.equal(state,'waiting');
 assert.match(made!,/^https:\/\/worldlet\.ai\/open\/#v=1&s=[A-Za-z0-9_-]{43}&n=Studio\+Mac&m=room$/);
 assert(isRoomLink(made!)&&isRoomLink(made!.slice(made!.indexOf('#')+1))&&!isRoomLink(started.link!));
 await mac.publish('attention',attention([item('m1','needsAction','Book the flight')]));
 await mac.publish('desktop',{v:1,at:new Date().toISOString(),name:'Studio Mac',version:'2026.1014.4402'});
 const tab=createRoomWebClient({link:made!,relay:'https://worldlet.ai',name:'Safari on iPhone',version:'web',WebSocket:RoomSocket as any});
 // Joining pairs, and the computer sends what it has at once.
 const seen=await until(tab,v=>!!v.attention&&!!v.desktop);
 assert.equal(seen.attention?.now[0].action,'Book the flight');
 assert.equal(tab.computer,'Studio Mac');
 // The browser's name reaches the computer on one of its next polls (the room may still be relaying the hello).
 await mac.poll();
 for(let i=0;i<50&&mac.status().phone?.name!=='Safari on iPhone';i++)await mac.poll(0.1);
 assert.equal(mac.status().state,'paired');assert.equal(mac.status().phone?.name,'Safari on iPhone');
 assert.equal(mac.status().link,made,'the link stays, so another browser can open it');
 assert(mac.open,'a browser is in the room');
 // A changed slot reaches the browser; an unchanged one is not sent again.
 const dentist=attention([item('m2','event','Dentist at 3')]);
 await mac.publish('attention',dentist);
 assert.equal((await until(tab,v=>v.attention?.now[0].action==='Dentist at 3'))?.attention?.now[0].action,'Dentist at 3');
 assert.equal(await mac.publish('attention',{...dentist,at:new Date().toISOString()}),false);
 // Done and a chat line from the browser are taken once, even when the same sealed frame comes again.
 await tab.send({type:'attention',id:'m2',action:'done'});await tab.send({type:'chat',id:'c9',text:'Hi Fox'});
 for(let i=0;i<20&&got.length<2;i++)await mac.poll(1);
 assert.deepEqual(got.map(m=>m.type),['attention','chat']);
 // A second browser on the same link joins the same pairing and gets everything at once.
 const second=createRoomWebClient({link:made!,relay:'https://worldlet.ai',name:'Firefox on Windows',version:'web',WebSocket:RoomSocket as any});
 const other=await until(second,v=>!!v.attention);
 assert.equal(other.attention?.now[0].action,'Dentist at 3');
 // The computer away: the browser says so and keeps what it had; back, it sends everything again.
 room.dropDesktop();
 await new Promise(r=>setTimeout(r,50));
 await assert.rejects(tab.poll(),/not reachable/);
 await mac.publish('attention',attention([item('m3','needsAction','Water the plants')]));
 await mac.poll();
 const back=await until(tab,v=>v.attention?.now[0].action==='Water the plants');
 assert.equal(back?.attention?.now[0].action,'Water the plants');
 // A side without the right token is refused; a frame sealed with another key is dropped.
 const stranger=createRoomWebClient({link:'#v=1&s='+'A'.repeat(43)+'&m=room',relay:'https://worldlet.ai',name:'x',version:'web',WebSocket:RoomSocket as any});
 await assert.rejects(stranger.poll(),/not reachable/,'a pairing nobody made has no computer');
 // The Agent's `world/link` (agent/gate share_world_link) keeps the link a browser already opened.
 assert.equal((await mac.ensure()).link,made,'an existing link is kept');
 const reply=worldLinkReply(mac.status());
 assert.ok('ok' in reply&&reply.link===made&&reply.opened===true);
 assert.match(String((reply as {message:string}).message),/to them alone.*any web browser.*while this computer is on/);
 assert.ok('error' in worldLinkReply({state:'none'}),'no link, no success');
 assert.ok('error' in worldLinkReply({state:'waiting',link:'#v=1&s=x'}),'only a room link goes out');
 // Turning the link off reaches every browser in the room.
 await mac.end();
 const ends=async(client:{poll(wait?:number):Promise<unknown>})=>{for(let i=0;i<30;i++)try{await client.poll(1);}catch(e){if(e instanceof WebPairingEnded)return true;}return false;};
 assert(await ends(tab)&&await ends(second),'every browser in the room hears the link is off');
 assert.equal(vault.has('web-room-pairing'),false);
 // With no link, `world/link` makes one and then keeps it.
 const fresh=await mac.ensure();
 assert.equal(fresh.state,'waiting');assert.ok(isRoomLink(fresh.link!)&&fresh.link!==made,'a new link when there was none');
 assert.equal((await mac.ensure()).link,fresh.link,'and keeps it');
 await mac.end();
 console.log('PASS another device meets the computer in the room: link, pairing, everything at once, changes, Done and chat once, away and back, turning off, world/link.');
}

// The page itself on another device: the built page at worldlet.ai/open with its WebSocket bridged to the memory room,
// and the computer's side of the direct line (rtc-host.ts) on the hidden window's page (rtc-page.ts), here a page of the
// same browser: real WebRTC between the two.
{
 const vault=new Map<string,string>(),got:PhoneMessage[]=[];
 const memory={get:(id:string)=>vault.get(id)??null,set:(id:string,v:string)=>{vault.set(id,v);},delete:(id:string)=>{vault.delete(id);}};
 const browser=await chromium.launch();
 const hosts:import('playwright').Page[]=[];
 const openHost=():RtcPage=>{
  const ready=browser.newPage().then(async host=>{hosts.push(host);await host.addScriptTag({content:RTC_PAGE_SCRIPT});return host;});
  return {run:code=>ready.then(host=>host.evaluate(code)),close:()=>void ready.then(host=>host.close()).catch(()=>{})};
 };
 const mac=createRoomLink({vault:memory,vaultName:'web-room',name:()=>'Studio Mac',deliver:async m=>{got.push(m);return true;},WebSocket:RoomSocket as any,rtc:createRtcHost(openHost)});
 const {link:made}=await mac.start();
 await mac.publish('attention',attention([item('w1','needsAction','Sign the lease')]));
 await mac.publish('desktop',{v:1,at:new Date().toISOString(),name:'Studio Mac',version:'2026.1014.4402'});
 // What the page sends through the room, by frame kind.
 const viaRoom:string[]=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://worldlet.ai/open/**',async route=>{
   const file=new URL(route.request().url()).pathname.replace('/open/','')||'index.html';
   try{return route.fulfill({body:await readFile(path.join(out,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   catch{return route.fulfill({status:404,body:''});}
  });
  // The page's WebSocket goes to the memory room through the test (the room's own protocol, unchanged).
  const sides=new Map<number,{send(text:string):void,leave():void}>();let opened=0;
  await page.exposeFunction('roomOpen',async(url:string,protocols:string[])=>{
   const id=++opened;
   const side=await room.connect(url,protocols,text=>void page.evaluate(([n,t])=>(window as any).roomDeliver(n,t),[id,text] as const).catch(()=>{}),()=>void page.evaluate(n=>(window as any).roomClosed(n),id).catch(()=>{}));
   if(!side)return 0;sides.set(id,side);return id;
  });
  await page.exposeFunction('roomSend',(id:number,text:string)=>{try{viaRoom.push(Object.keys(JSON.parse(JSON.parse(text).data))[0]);}catch{}sides.get(id)?.send(text);});
  await page.exposeFunction('roomClose',(id:number)=>{sides.get(id)?.leave();sides.delete(id);});
  await page.addInitScript(()=>{
   const w=window as any,open=new Map<number,any>(),early=new Map<number,string[]>();
   // What the room says while the socket is still opening waits for it, as on a real WebSocket.
   w.roomDeliver=(id:number,text:string)=>{const ws=open.get(id);if(ws)ws.onmessage?.({data:text});else early.set(id,[...early.get(id)??[],text]);};
   w.roomClosed=(id:number)=>{const ws=open.get(id);if(ws){ws.readyState=3;open.delete(id);ws.onclose?.({});}};
   w.WebSocket=class{
    readyState=0;onopen:any=null;onmessage:any=null;onclose:any=null;onerror:any=null;id=0;
    constructor(url:string,protocols:string[]){void w.roomOpen(url,protocols).then((id:number)=>{if(!id){this.readyState=3;this.onclose?.({});return;}this.id=id;open.set(id,this);this.readyState=1;this.onopen?.({});for(const text of early.get(id)??[])this.onmessage?.({data:text});early.delete(id);});}
    send(text:string){void w.roomSend(this.id,text);}
    close(){if(this.readyState===3)return;this.readyState=3;open.delete(this.id);void w.roomClose(this.id);}
   };
  });
  await page.goto(made!);
  await page.getByText('Sign the lease').waitFor();
  assert.equal(new URL(page.url()).hash,'','the secret leaves the address bar');
  assert.equal(await page.locator('.web-computer').textContent(),'Studio Mac');
  assert.match(String(mac.status().phone?.name),/^Chrome on /,'the browser told the computer its name');
  // The page offers a direct line through the room, and the computer answers it.
  for(let i=0;i<100&&!mac.direct;i++)await mac.poll(0.1);
  assert.equal(mac.direct,1,'the page and the computer have a direct line');
  assert(viaRoom.includes('r'),'the offer went through the room');
  // Over the line: a changed slot reaches the page, and Done reaches the computer without the room.
  await mac.publish('attention',attention([item('w1','needsAction','Sign the lease'),item('w2','needsAction','Pay the rent')]));
  await page.getByText('Pay the rent').waitFor();
  const before=viaRoom.length;
  await page.locator('.web-item',{hasText:'Sign the lease'}).getByRole('button',{name:'Done'}).click();
  for(let i=0;i<50&&!got.some(m=>m.type==='attention');i++)await mac.poll(0.1);
  assert(got.some(m=>m.type==='attention'&&m.id==='w1'&&m.action==='done'),'Done from the page reaches the computer');
  assert.deepEqual(viaRoom.slice(before),[],'Done went over the direct line, not through the room');
  // The line goes (the hidden window closed): everything goes through the room again.
  await hosts[0].close();
  for(let i=0;i<100&&mac.direct;i++)await mac.poll(0.1);
  assert.equal(mac.direct,0);
  await mac.publish('attention',attention([item('w2','needsAction','Pay the rent'),item('w3','needsAction','Call Mom')]));
  await page.getByText('Call Mom').waitFor();
  await page.locator('.web-item',{hasText:'Pay the rent'}).getByRole('button',{name:'Done'}).click();
  for(let i=0;i<50&&!got.some(m=>m.type==='attention'&&m.id==='w2');i++)await mac.poll(0.1);
  assert(got.some(m=>m.type==='attention'&&m.id==='w2'&&m.action==='done'),'Done reaches the computer through the room when the line is gone');
  assert(viaRoom.slice(before).includes('m'));
  // Turned off on the computer: the page says so and forgets the link.
  await mac.end();
  await page.getByRole('heading',{name:'This link is off'}).waitFor({timeout:30000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet-web-link')),null);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 console.log('PASS the page on another device works through the room and a direct line: the Center, Done, the line going, and turning the link off.');
}
await server.close();await rm(out,{recursive:true,force:true});

// A line said in the browser or on the phone while the World page is not there (agent/base/README.md#web, Fox without
// the page): the host gives it to Fox's main conversation on its own, and the turn is not ended for want of the page.
{
 const phone=readFileSync('platform/electron/src/modules/phone/index.ts','utf8'),fox=readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
 assert.match(phone,/if\(!host\.page\.ready\(\)\)\{[\s\S]{0,2400}message\.type!=='chat'\|\|!fox\?\.converse[\s\S]{0,1600}fox\.converse\(message\.text,place\)/,'a main-conversation line without the page goes to Fox on the host');
 assert.match(phone,/if\(!host\.page\.ready\(\)\)\{[\s\S]{0,800}message\.type==='attention'&&hostRows\.has\(message\.id\)[\s\S]{0,600}host\.store\.setWorldItemStatus\(id,status,until\)/,'Done or Later without the page settles the item on the host');
 assert.match(phone,/if\(link\.phone\)await hostCenter\(\);/,'the host publishes the Center while the page is not there');
 assert.match(phone,/thread:JSON\.stringify\(\['attention:'\+message\.item,'attention:'\+message\.item\]\)[\s\S]{0,200}thread:JSON\.stringify\(\['object:app-'\+app\.key,''\]\)/,'a line on a card or in an Applet runs in that place\'s thread, as the page says it');
 assert.match(fox,/agentChat\(\{id,text,\.\.\.place\?\{thread:place\.thread,context:\{location:place\.location\}\}:\{\}\}\)/,'Fox takes the place\'s thread and name');
 assert.match(phone,/fox\.taskPanel\?\.\(\)[\s\S]{0,200}taskPanel\(\{jobs:panel\.jobs,harness:panel\.harness,working:panel\.working\}[\s\S]{0,400}artifactRows\(\)[\s\S]{0,1200}phoneAttention\(\{now:center\.now,later:center\.later,world,tasks,journal\}/,'its Center carries the Task panel and today\'s Journal');
 assert.match(phone,/live:async value=>\{if\(value\.done===true\)finished\(value\);return publishLive\(value\);\}/,'its turn streams to an open phone or browser, and the reply is pushed like any other');
 assert.match(phone,/message\.type==='approval'&&fox\?\.answerApproval/,'the Agent\'s permission prompt is answered without the page');
 assert.match(fox,/if\(headless\.has\(id\)\)headlessLive\?\.event\(event\);/,'the host streams a headless turn itself');
 assert.match(fox,/headlessLive\?\.settled\(id\);/,'an answered prompt leaves the live turn');
 assert.match(fox,/if\(!active\(\)\|\|!page\.ready\(\)&&!headless\.has\(id\)\)throw new Cancelled\(\)/,'a turn said without the page is not cancelled for want of it');
 assert.match(fox,/if\(!page\.ready\(\)\)return tool\?NEEDS_WORLD:null;/,'its page-only steps say the window must be open');
 assert.match(fox,/host\.onPageReload\(\(\)=>\{if\(agentTurn!==null&&!headless\.has\(agentTurn\)\)cancelCloud\(\)/,'a page reload leaves it running');
 // Run in background starts the host's own work with no World page, and loads the page only when the World is shown.
 const main=readFileSync('platform/electron/src/main.ts','utf8'),attentionModule=readFileSync('platform/electron/src/modules/attention/index.ts','utf8');
 assert.match(main,/if\(hidden\)\{\s*world\.window\.once\('show',\(\)=>void loadWorld\(\)[\s\S]{0,120}startServices\(\);[\s\S]{0,120}\}else await loadWorld\(\);/,'a background launch loads no page and starts the host');
 assert.match(main,/loaded:\(\)=>\{sent='';startServices\(\);/,'a normal launch starts the host with the first page load');
 assert.match(attentionModule,/host\.onStarted\(\(\)=>center\.start\(\)\)/,'Attention reads without the page');
 assert.match(fox,/host\.onStarted\(begin\);/,'routines and history run without the page');
 assert.match(phone,/host\.onStarted\(\(\)=>\{for\(const link of links\)link\.schedule\(1000\);\}\);/,'the phone and browser links run without the page');
 assert.match(fox,/report,converse,answerApproval,taskPanel:taskPanelInput\}\)/,'FoxService offers converse, answerApproval and the Task panel');
 // The browser on this computer has a pairing and loop of its own, served here before its link is made.
 assert.match(phone,/\{relay:local,open:localOpen,listening:localListening,phone:true\}[,\]]/,'the local browser link runs like the others');
 assert.match(phone,/if\(request\.kind==='local'\)try\{await serveLocal\(\);\}/,'its server starts before its link is made');
 assert.match(phone,/fetch:async\(input,init\)=>\{await adopted;return localRelay\.fetch/,'a kept pairing is handed back before the computer reads the relay');
 assert.match(phone,/const browser=createRoomLink\(\{/,'another device\'s browser meets the computer in the room');
 // The Agent's `world/link` is answered on the host before the World page is asked, through the room link.
 assert.match(phone,/worldLink:async\(\)=>\{await worldRoom\.ensure\(\);const status=await browser\.ensure\(\);.*return webStatus\(status\);\}/,'world/link keeps or makes the room link, carrying the World\'s');
 const served=fox.indexOf("if(name==='share_world_link'){"),paged=fox.indexOf("if(!page.ready())return tool?NEEDS_WORLD:null;");
 assert.ok(served>0&&paged>served,'world/link is answered without the page');
 assert.equal(resolveAction(worldActions(),'world','link',{}).name,'share_world_link');
 assert.match(phone,/if\(vault\.get\('web-pairing'\)\)void createPhoneRelay\([\s\S]{0,300}\.end\(\)/,'a browser link from before the room is ended on the relay once');
 console.log('PASS a line said in a browser or on the phone reaches Fox without the World page.');
}
