// Worldlet in a web browser (core/phone/README.md#web): the computer's `web` pairing (platform/electron/src/modules/
// phone/relay.ts) and the page (ui/web) against an in-memory relay that answers like worker/pairing.ts: the link, the
// first poll completing the pairing with the browser's name, the Center reaching the page, Done and a chat line
// reaching the computer, the fragment leaving the address bar, a reload from storage, and the page ending with the link.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createPhoneRelay} from '../platform/electron/src/modules/phone/relay.ts';
import {createWebClient,readWebPairLink,WebPairingEnded,type PhoneMessage} from '../core/phone/index.ts';
import {buildWebOpen} from './build-web-open.ts';

const ORIGIN='http://127.0.0.1:8788';
// The relay (worker/pairing.ts), only what both sides use, in memory.
function fakeRelay(){
 const pairs=new Map<string,{desktop:string,phone:string,version:number,phoneSeen:number|null,desktopSeen:number|null,pairedAt:number|null,slots:Map<string,{version:number,box:string}>,messages:{to:string,seq:number,box:string}[]}>();
 const SLOT_OWNER:Record<string,string>={attention:'desktop',conversation:'desktop',live:'desktop',widgets:'desktop',desktop:'desktop',phone:'phone'};
 const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 return async(input:string,init:RequestInit={}):Promise<Response>=>{
  const url=new URL(input),method=init.method||'GET',body=init.body?JSON.parse(String(init.body)):{};
  const [,,,id='',part='',name='']=url.pathname.split('/');
  if(!id&&method==='POST'){pairs.set(body.id,{desktop:body.desktop,phone:body.phone,version:0,phoneSeen:null,desktopSeen:Date.now(),pairedAt:null,slots:new Map(),messages:[]});return json({id:body.id},201);}
  const pair=pairs.get(id),token=String(new Headers(init.headers).get('Authorization')||'').replace('Bearer ','');
  const digest=await hash(token),role=pair?.desktop===digest?'desktop':pair?.phone===digest?'phone':'';
  if(!pair||!role)return json({error:'This pairing has ended. Pair again from Worldlet on your computer.'},404);
  if(!part&&method==='DELETE'){pairs.delete(id);return json({ended:true});}
  if(!part&&method==='GET'){
   const after=Number(url.searchParams.get('after')||0);
   pair.messages=pair.messages.filter(m=>!(m.to===role&&m.seq<=after));
   if(role==='phone'){pair.phoneSeen=Date.now();pair.pairedAt??=Date.now();}else pair.desktopSeen=Date.now();
   const peer=role==='desktop'?'phone':'desktop';
   return json({version:pair.version,role,peer:{seenAt:role==='desktop'?pair.phoneSeen:pair.desktopSeen,pairedAt:pair.pairedAt},
    slots:[...pair.slots].filter(([slot,s])=>SLOT_OWNER[slot]===peer&&s.version>after).map(([slot,s])=>({name:slot,version:s.version,box:s.box})),
    messages:pair.messages.filter(m=>m.to===role&&m.seq>after).map(m=>({seq:m.seq,box:m.box}))});
  }
  if(part==='slots'&&method==='PUT'){if(SLOT_OWNER[name]!==role)return json({error:'This side cannot write that slot.'},403);pair.slots.set(name,{version:++pair.version,box:body.box});return json({version:pair.version});}
  if(part==='messages'&&method==='POST'){const seq=++pair.version;pair.messages.push({to:role==='desktop'?'phone':'desktop',seq,box:body.box});return json({seq},201);}
  return json({error:'Not found'},404);
 };
}
const relayFetch=fakeRelay();
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

// The page, built as the website serves it, against the same relay.
const root=fileURLToPath(new URL('../',import.meta.url)),out=await mkdtemp(path.join(os.tmpdir(),'web-open-'));
await buildWebOpen(root,out);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(ORIGIN+'/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.startsWith('/api/pair')){
   const response=await relayFetch(request.url(),{method:request.method(),headers:await request.allHeaders(),body:request.postData()??undefined});
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }
  const file=url.pathname==='/open/'?'index.html':url.pathname.replace('/open/','');
  try{return route.fulfill({body:await readFile(path.join(out,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}
  catch{return route.fulfill({status:404,body:''});}
 });
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
}finally{await browser.close();await rm(out,{recursive:true,force:true});}
await assert.rejects(client.poll(),WebPairingEnded);
console.log('PASS Worldlet in a web browser: link, pairing, Center, Done, chat, reload and turning the link off.');

// A line said in the browser or on the phone while the World page is not there (core/phone/README.md#web, Fox without
// the page): the host gives it to Fox's main conversation on its own, and the turn is not ended for want of the page.
{
 const phone=readFileSync('platform/electron/src/modules/phone/index.ts','utf8'),fox=readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
 assert.match(phone,/if\(!host\.page\.ready\(\)\)\{[\s\S]{0,2400}message\.type!=='chat'\|\|!fox\?\.converse[\s\S]{0,1600}fox\.converse\(message\.text,place\)/,'a main-conversation line without the page goes to Fox on the host');
 assert.match(phone,/if\(!host\.page\.ready\(\)\)\{[\s\S]{0,800}message\.type==='attention'&&hostRows\.has\(message\.id\)[\s\S]{0,600}host\.store\.setWorldItemStatus\(id,status,until\)/,'Done or Later without the page settles the item on the host');
 assert.match(phone,/if\(link\.phone\)await hostCenter\(\);/,'the host publishes the Center while the page is not there');
 assert.match(phone,/thread:JSON\.stringify\(\['attention:'\+message\.item,'attention:'\+message\.item\]\)[\s\S]{0,200}thread:JSON\.stringify\(\['object:app-'\+app\.key,''\]\)/,'a line on a card or in an Applet runs in that place\'s thread, as the page says it');
 assert.match(fox,/agentChat\(\{id,text,\.\.\.place\?\{thread:place\.thread,context:\{location:place\.location\}\}:\{\}\}\)/,'Fox takes the place\'s thread and name');
 assert.match(phone,/fox\.taskPanel\?\.\(\)[\s\S]{0,200}taskPanel\(\{jobs:panel\.jobs,harness:panel\.harness,working:panel\.working\}[\s\S]{0,400}artifactRows\(\)[\s\S]{0,1200}phoneAttention\(\{now:center\.now,later:center\.later,tasks,journal\}/,'its Center carries the Task panel and today\'s Journal');
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
 console.log('PASS a line said in a browser or on the phone reaches Fox without the World page.');
}
