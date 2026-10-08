// The world log: Core turns saved history into plain lines and finds the next scheduled check.
// The World's bottom-right corner shows only that next check (owner Order 2026-10-06), quiet but
// readable until hovered and clear of Fox's lane; it opens the History page, a running feed of the
// lines, each going to its Applet or site. The brand stays hidden unless a development build is ready to apply.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import path from 'node:path';
import {worldLogKeeps,worldLogLines,worldLogNext,worldLogNow,WORLD_LOG_KINDS} from '../core/activity/index.ts';
import {pageErrors,worldUrl} from './browser-test.ts';

const t=1_800_000_000;
const rows=[
 {seq:1,at:t,kind:'applet.check',key:'gmail',body:{id:'1',status:'started'}},
 {seq:2,at:t+1,kind:'applet.check',key:'gmail',body:{id:'2',status:'complete'}},
 {seq:3,at:t+2,kind:'applet.activity',key:'gmail',body:{id:'3',operation:'_source_result',status:'complete',count:5}},
 {seq:4,at:t+3,kind:'applet.activity',key:'gmail',body:{id:'4',operation:'upsert_world_items',status:'complete',count:1,actor:'fox'}},
 {seq:5,at:t+4,kind:'activity.page.opened',key:'',body:{id:'5',data:{url:'https://user:pw@www.example.com/private/path?token=x#y'}}},
 {seq:6,at:t+5,kind:'activity.page.opened',key:'',body:{id:'6',data:{url:'https://worldlet.local/world'}}},
 {seq:7,at:t+6,kind:'activity.ui.open',key:'',body:{id:'7',data:{appletId:'app-github',region:'work'}}},
 {seq:8,at:t+7,kind:'activity.ui.open',key:'',body:{id:'8',data:{appletId:'app-github',region:'work'}}},
 {seq:9,at:t+8,kind:'activity.ui.open',key:'',body:{id:'9',data:{appletId:'',region:'life'}}},
 {seq:10,at:t+9,kind:'applet.check',key:'google-calendar',body:{id:'10',status:'error'}},
 {seq:11,at:t+10,kind:'applet.activity',key:'gmail',body:{id:'11',operation:'_source_result',status:'error',count:3}},
 {seq:12,at:t+11,kind:'conversation.message',key:'',body:{id:'12',actor:'user',preview:'private words'}},
 {seq:13,at:t+12,kind:'world.action',key:'',body:{id:'13',actor:'user',data:{action:'saveOverlay',phase:'succeeded'}}},
 {seq:14,at:t+13,kind:'world.action',key:'',body:{id:'14',actor:'user',appletId:'gmail',data:{action:'worldItemStatus',status:'done',phase:'succeeded'}}},
];
const lines=worldLogLines(rows);
assert.deepEqual(lines.map(l=>l.text),[
 'Checked Mail','Read 5 emails in Mail','Fox saved 1 finding from Mail','You visited example.com','You opened GitHub','Calendar check didn’t finish · will retry','You finished an item from Mail',
],'plain lines; started checks, failed reads, region walks and plumbing actions skipped; repeats collapsed; only a site’s host shown');
assert.deepEqual(lines.map(l=>l.who),['world','world','fox','you','you','world','you']);
assert.equal(lines.find(l=>l.site)!.site,'example.com','a site line goes to its host');
assert.equal(lines.at(-2)!.failed,true);
assert.equal(lines.find(l=>l.text==='You opened GitHub')!.seq,8,'a repeated line keeps the latest time');
assert(!JSON.stringify(lines).includes('private'),'no path, query, credentials or conversation text');
assert.deepEqual(worldLogLines(rows,2).map(l=>l.seq),[10,14],'newest last, bounded');
assert.equal(WORLD_LOG_KINDS.includes('conversation.message' as any),false,'conversations stay in Fox history');
const tasks=[
 {id:'applet:gmail:check',owner:'gmail',status:'queued',enabled:true,nextAt:t+1800},
 {id:'applet:google-calendar:check',owner:'google-calendar',status:'queued',enabled:true,nextAt:t+600},
 {id:'applet:apple-notes:check',owner:'apple-notes',status:'paused',enabled:false,nextAt:t+60},
 {id:'applet:gmail:analyze',owner:'gmail',status:'queued',nextAt:t+30},
 {id:'attention:center',owner:'attention-center',status:'queued',nextAt:t+10},
];
assert.deepEqual(worldLogNext(tasks,t),{owner:'google-calendar',title:'Calendar',at:t+600},'the soonest enabled source check');
assert.equal(worldLogNext([],t),null);
assert.deepEqual(worldLogNow([{provider:'gmail',connected:true,running:true},{provider:'google-calendar',status:'syncing'},{provider:'apple-notes',connected:true},{provider:'gmail',connected:true,running:true,sample:true}]),
 [{applet:'gmail',text:'Reading Mail…'},{applet:'google-calendar',text:'Syncing Calendar…'}],'live work reads as what each Applet is doing');
// Applet tasks Fox handed off: a line when one starts and when it ends, and a live line while it works.
assert.deepEqual(worldLogLines([
 {seq:1,at:t,kind:'applet.task',key:'youtube',body:{id:'a',status:'started',actor:'fox'}},
 {seq:2,at:t+60,kind:'applet.task',key:'youtube',body:{id:'b',status:'complete',actor:'fox'}},
 {seq:3,at:t+70,kind:'applet.task',key:'amazon',body:{id:'c',status:'failed',actor:'fox'}},
 {seq:4,at:t+80,kind:'applet.task',key:'youtube',body:{id:'d',status:'cancelled',actor:'fox'}},
]).map(l=>[l.who,l.text,l.applet,l.failed??false]),[
 ['fox','Fox handed a task to YouTube','youtube',false],['world','YouTube finished a task','youtube',false],['world','Amazon couldn’t finish a task','amazon',true],
],'task lines; a cancelled task leaves none');
assert.deepEqual(worldLogNow([{provider:'gmail',connected:true,running:true}],[{applet:'app-youtube'},{applet:'app-youtube'}]),
 [{applet:'youtube',text:'YouTube is working on a task…'},{applet:'gmail',text:'Reading Mail…'}],'an Applet working on a task is the newest live line');
// Host traffic records a world.action per call; the host keeps only rows that make a line, so a
// busy minute of reads and analytics never leaves the log empty (it had vanished, 2026-10-03).
assert.deepEqual(rows.filter(row=>row.kind==='world.action').map(worldLogKeeps),[false,true]);
assert.equal(worldLogKeeps({seq:99,at:t,kind:'world.action',key:'',body:{id:'99',data:{action:'usageEvent',phase:'succeeded'}}}),false);
console.log('PASS world log lines, live work, Applet tasks and next check');

const browser=await chromium.launch({executablePath:process.env.WORLDLET_TEST_BROWSER,args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any,now=Date.now()/1000;
  w.logCalls=[];w.sample=false;
  w.fixture={workspaceId:'log',revision:0,sources:[],knowledge:[],worldItems:[],connections:[{provider:'gmail',connected:true}],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  w.entries=[1,2,3,4,5].map(i=>({seq:i,at:now-600+i*60,kind:'applet.activity',key:'gmail',body:{id:String(i),operation:'_source_result',status:'complete',count:i}}));
  w.tasks=[{id:'applet:gmail:check',owner:'gmail',status:'queued',enabled:true,nextAt:now+1200,lastSuccessAt:now-60}];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='worldLog'){w.logCalls.push(b);return w.sample?{entries:[],tasks:[],sample:true}:{entries:w.entries,...(b.tasks?{tasks:w.tasks}:{})};}
   if(b.action==='modelStatus')return {available:true};if(b.action==='appContent')return {pages:[]};if(b.action==='weatherLoad')return null;
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('#worldStartup').waitFor({state:'detached'});
 const log=page.locator('.world-log');
 // The corner keeps only the next scheduled check; the live log is gone from it (owner Order 2026-10-06).
 await log.locator('.world-log-next').waitFor();
 assert.match(await log.locator('.world-log-next').textContent(),/^Next · Mail check at \d\d:\d\d$/);
 assert.equal(await page.locator('.world-log-lines,.world-log-line').count(),0,'no live log lines in the corner');
 const box=(await log.boundingBox())!;
 assert(box.x+box.width>1380&&box.y+box.height>860,'the line sits bottom right: '+JSON.stringify(box));
 assert.equal(await page.locator('.world-watermark').isVisible(),false,'the brand stays hidden without a build to apply');
 // Quieter than when hovered, but readable at rest over any scenery (RC UI reviews 2737/2743, #1699).
 const opacity=()=>log.evaluate(e=>Number(getComputedStyle(e).opacity));
 assert(await opacity()<1,'quieter at rest');
 const legible=await log.evaluate(e=>{
  const rgba=(c:string)=>{const [r,g,b,a=1]=c.match(/[\d.]+/g)!.map(Number);return {rgb:[r,g,b],a};};
  const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>t*v+(1-t)*b[i]);
  const lum=(c:number[])=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
  const ratio=(a:number[],b:number[])=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
  const s=getComputedStyle(e),group=Number(s.opacity),back=rgba(s.backgroundColor),white=[255,255,255];
  const behind=mix(back.rgb,white,back.a*group);
  const t=e.querySelector('.world-log-next')!,ink=rgba(getComputedStyle(t).color),line=Number(getComputedStyle(t).opacity)*ink.a;
  const cover=line+back.a*(1-line),color=ink.rgb.map((v,i)=>(line*v+back.a*(1-line)*back.rgb[i])/cover);
  return {contrast:ratio(mix(color,white,cover*group),behind),size:parseFloat(s.fontSize)};
 });
 assert(legible.size>=13,'large enough to read: '+legible.size);
 assert(legible.contrast>=4.5,'readable over a white landscape at rest: '+legible.contrast);
 await log.hover();await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.world-log')!).opacity)>.95);
 await page.screenshot({path:'output/world-log/next.png'}).catch(()=>{});
 // New events and what an Applet is doing now stay out of the corner; they reach History.
 await page.evaluate(()=>{const w=window as any;w.entries.push({seq:6,at:Date.now()/1000,kind:'activity.page.opened',key:'',body:{id:'6',data:{url:'https://news.example.org/a'}}});});
 await page.evaluate(()=>{const w=window as any;w.fixture.connections=[{provider:'gmail',connected:true,running:true}];w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(window as any).logCalls.length>=3,null,{timeout:12000});
 assert.equal(await page.locator('.world-log-lines,.world-log-line').count(),0,'still no live lines in the corner');
 assert.equal(await page.locator('.applet-lamp-label:not([hidden])').count(),0,'no Running badge over the device');
 await page.evaluate(()=>{const w=window as any;w.fixture.connections=[{provider:'gmail',connected:true}];w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 // An Applet working on a task Fox handed it: when it is done, Fox says the result.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:applet-task',{detail:{id:'task-1',applet:'app-youtube',status:'started',request:'Find me short cooking videos'}})));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:applet-task',{detail:{id:'task-1',applet:'app-youtube',status:'complete',message:'Found three videos under ten minutes.'}})));
 await page.waitForFunction(()=>(document.querySelector('#companionDialogue') as HTMLElement|null)?.innerText.includes('YouTube: Found three videos under ten minutes.'),null,{timeout:5000});
 assert.equal(await page.locator('#companionDialogue button',{hasText:'Open YouTube'}).count(),1,'the result offers its Applet');
 await page.waitForFunction(()=>!!document.querySelector('.applet-task-done:not([hidden])'),null,{timeout:5000});
 await page.screenshot({path:'output/world-log/task-done.png'}).catch(()=>{});
 await page.keyboard.press('Escape');
 // The line opens the companion panel's History page, a running feed of the plain lines.
 await page.evaluate(()=>window.addEventListener('worldlet:companion-info',(e:any)=>{(window as any).opened=e.detail?.tab;}));
 await log.hover();await log.locator('.world-log-next').click();
 await page.waitForFunction(()=>(window as any).opened==='History');
 const recent=page.locator('#companionInfo .companion-world-log');
 await recent.getByText('You visited news.example.org',{exact:true}).waitFor({timeout:10000});
 assert(await recent.locator('button').count()>=6,'every line in History goes somewhere');
 assert.equal(await page.locator('#companionInfo [data-section=History] .companion-history-records').count(),0,'raw records stay out of History (Settings › Troubleshoot)');
 await page.screenshot({path:'output/world-log/history.png'}).catch(()=>{});
 await recent.locator('button').first().click();
 await page.locator('#companionInfo').waitFor({state:'hidden'});
 // Fox's lane: the log never draws behind the actions beside Fox, the message bar or Fox (#1699).
 // Inside an Applet Fox's dock moves to the right third and Check mail sits where the log was, so
 // the log steps aside; back in the World it returns.
 const clash=()=>page.evaluate(()=>{
  const e=document.querySelector<HTMLElement>('.world-log')!,r=e.getBoundingClientRect();
  const shown=!e.hidden&&r.width>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const hits=shown?[...document.querySelectorAll('.world-actions :is(button,.world-capsule),.companion-text-entry,.companion-pet')].filter(o=>{const b=o.getBoundingClientRect();return b.width&&b.height&&b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top;}).map(o=>o.textContent?.trim()||o.className):[];
  return {shown,hits};
 });
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const toWorld=async()=>{
  await page.evaluate(()=>{location.hash='';});
  await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement)?.dataset.depth==='overview'&&document.querySelector('.world-log')?.getAttribute('data-crowded')==='false',null,{timeout:8000});
 };
 await page.mouse.move(2,2);
 for(const [width,height] of [[1440,900],[1024,700],[820,620]]){
  await page.setViewportSize({width,height});await toWorld();await settle();
  const world=await clash();
  assert(world.shown&&!world.hits.length,`${width}: the log shows in the World, clear of Fox's lane `+JSON.stringify(world));
  await page.evaluate(()=>{location.hash='object=app-gmail';});
  await page.locator('.world-actions .world-capsule',{hasText:'Check mail'}).waitFor();await settle();
  const mail=await clash();
  assert.deepEqual(mail.hits,[],`${width}: inside Mail the log is never behind Check mail, the message bar or Fox`);
  if(width===1440)assert.equal(mail.shown,false,'inside Mail Check mail takes the corner, so the log steps aside');
  await toWorld();
 }
 await page.setViewportSize({width:1440,height:900});
 // The practice world has no log of its own.
 await page.evaluate(()=>{(window as any).sample=true;});
 await log.waitFor({state:'hidden',timeout:12000});
 assert(await page.evaluate(()=>(window as any).logCalls.every(b=>typeof b.tasks==='boolean')),'every read says whether it needs the schedule');
 assert.deepEqual(errors,[]);
 console.log('PASS world log: the corner holds only the next scheduled check, readable at rest and brighter when hovered, clear of Fox\'s actions and message bar, opens History (a running feed of plain lines), brand hidden, Applet task result');
}finally{await browser.close();}
