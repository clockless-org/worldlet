// Worldlet in a web browser (core/phone/README.md#web): the computer's `web` pairing (platform/electron/src/modules/
// phone/relay.ts) and the page (ui/web) against the relay this computer serves itself (local-relay.ts), which answers
// like worker/pairing.ts, over real HTTP on 127.0.0.1: the link, the
// first poll completing the pairing with the browser's name, the Center reaching the page, Done and a chat line
// reaching the computer, the fragment leaving the address bar, a reload from storage, and the page ending with the link.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createPhoneRelay} from '../platform/electron/src/modules/phone/relay.ts';
import {createLocalRelay,serveLocalRelay,LOCAL_RELAY_LIMITS} from '../platform/electron/src/modules/phone/local-relay.ts';
import {createWebClient,readWebPairLink,WebPairingEnded,pairKeys,fromBase64url,sha256Hex,type PhoneMessage} from '../core/phone/index.ts';
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
await server.close();await rm(out,{recursive:true,force:true});

// A line said in the browser or on the phone while the World page is not there (core/phone/README.md#web, Fox without
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
 assert.match(phone,/\{relay:local,open:localOpen,listening:localListening,phone:true\}\]/,'the local browser link runs like the others');
 assert.match(phone,/if\(request\.kind==='local'\)try\{await serveLocal\(\);\}/,'its server starts before its link is made');
 assert.match(phone,/fetch:async\(input,init\)=>\{await adopted;return localRelay\.fetch/,'a kept pairing is handed back before the computer reads the relay');
 console.log('PASS a line said in a browser or on the phone reaches Fox without the World page.');
}
