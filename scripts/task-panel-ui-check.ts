import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// The World's tasks beside Fox (owner request 2026-10-11, ui/hud/task-panel.ts, core/tasks/task-panel.ts): what the
// Agent is doing now on Fox's left and the Routines about to run on its right, on the message bar's line, each one small
// card in the same style (a picture, a name, one line), Fox and its message bar between them. Two cards a side in a wide
// World, then "+N", which opens the whole list. A running card opens its window above it (the step, when it started, who
// does it and every line it said), or the page Fox drives, which a click opens; a routine card opens a read-only
// popover. Nothing finished shows: it lives in the Journal. They never cover the Attention Center or the message bar;
// during the tour only Routines show; they stay clear of the message bar while the person types and step aside beside an open Applet; at
// 800px wide each side is only its count, and in a window 540px tall they are gone. Bundled UI, faked bridge, fixed
// clock, fictional jobs, mail and page.
const t0=new Date(2026,9,10,9,30);
const SCREEN=process.env.WORLDLET_TASK_PANEL_SCREEN||path.join(tmpdir(),'worldlet-task-panel.png');
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.clock.setFixedTime(t0);
 await page.addInitScript((now:number)=>{
  const w=window as any,s=(minutes:number)=>now/1000+minutes*60,iso=(minutes:number)=>new Date(now+minutes*60000).toISOString();
  w.calls=[];w.opened=[];w.foxPage=null;
  // The page would open in the World's browser; the check only records that it was asked to.
  window.addEventListener('worldlet:open-url',(e:any)=>{w.opened.push(e.detail?.url);e.stopImmediatePropagation();});
  w.panel={
   jobs:[
    {id:'a',name:'Morning news',kind:'prompt',paused:false,when:{cron:'0 6 * * *'}},
    {id:'b',name:'Water the plants',kind:'prompt',paused:false,when:{cron:'0 19 * * *'}},
    {id:'c',name:'Flight prices',kind:'prompt',paused:false,when:{everySeconds:3600}},
    {id:'d',name:'Weekly review',kind:'prompt',paused:false,when:{cron:'0 17 * * 5'}},
    {id:'e',name:'Old one',kind:'prompt',paused:true,when:{cron:'0 7 * * *'}},
   ],
   harness:'OpenClaw',
   // Finished work in today's history: none of it shows in the panel.
   history:[
    ...[1,2,3].map(n=>({seq:n,at:s(-30*n),kind:'applet.check',key:'gmail',body:{status:'complete'}})),
    {seq:11,at:s(-90),kind:'routine.run',body:{status:'complete',name:'Check the weather'}},
    {seq:13,at:s(-150),kind:'applet.task',key:'youtube',body:{status:'complete',runId:'task-0'}},
   ],
   tasks:[{id:'applet:gmail:check',owner:'gmail',status:'queued',enabled:true,nextAt:s(20)}],
   runs:[{id:'flight-run',title:'Flight prices',at:now-10*60000,failed:true}],
   working:[{id:'task-1',applet:'youtube',at:s(-2)}],
  };
  const item={id:'flight-run',kind:'task',provider:'harness:openclaw',title:'Flight prices',reason:'OpenClaw could not finish it',attentionContentVersion:1,context:'OpenClaw could not finish it',
   summary:'It stopped without saying why.',status:'open',policyVersion:2,priority:'elevated',occurredAt:iso(-10),receivedAt:iso(-10),sources:[{provider:'harness:openclaw',id:'run-2',quote:'Flight prices'}]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
   w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'task-panel-fixture',revision:0,sources:[],knowledge:[],worldItems:[item],connections:[{id:'gmail',provider:'gmail',connected:true,syncStatus:'connected'}],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true};
   if(b.action==='taskPanel')return w.panel;
   if(b.action==='taskPanelPage')return {page:w.foxPage};
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 },t0.getTime());
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 const panel=page.locator('.task-panel');
 const now=panel.locator('.task-group[data-group=now]'),next=panel.locator('.task-group[data-group=routines]');
 await now.locator('.task-card').first().waitFor();
 const cards=async(side=next)=>side.locator('.task-cards>.task-card').evaluateAll(list=>list.map(c=>c.querySelector('.task-title')!.textContent+' · '+c.querySelector('.task-when')!.textContent));
 // Next: the two soonest of the person's routines, then "+2" for the rest; paused jobs left out, and the Mail check is
 // the Applet's own work, not the person's routine (owner rule 2026-10-11).
 assert.deepEqual(await cards(),['Water the plants · 7:00 PM','Morning news · Tomorrow 6:00 AM']);
 assert.equal((await next.locator('.task-more').innerText()).trim(),'+2');
 assert.equal(await panel.getByText('Check Mail').count(),0,'no Applet checks');
 // Doing now: the Applet's task, a turning ring, a bar that moves on its own while how far along is not known.
 assert.deepEqual(await cards(now),['YouTube · Working on a task from Fox']);
 assert.equal(await now.locator('.task-card-bar[data-unknown=true]').count(),1);
 assert.equal(await now.locator('.task-more').isVisible(),false,'nothing more to show');
 // Either side of Fox on the message bar's line, the same card on both sides, clear of the Attention Center.
 const geometry=()=>page.evaluate(()=>{
  const box=(q:string)=>{const r=document.querySelector(q)!.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  return {fox:box('.companion-avatar'),now:box('.task-group[data-group=now] .task-card'),next:box('.task-group[data-group=routines] .task-card'),
   tracker:box('.world-task-tracker'),cards:[...document.querySelectorAll('.task-panel .task-card')].map(c=>{const r=c.getBoundingClientRect();return [r.width,r.height];})};
 });
 await page.locator('.world-task-tracker .world-matter[data-world-item-id="flight-run"]').waitFor();
 {
  const g=await geometry();
  assert.ok(g.now.right<g.fox.x&&g.next.x>g.fox.right,'one side on Fox’s left, the other on its right: '+JSON.stringify(g));
  assert.ok(g.now.bottom<=900-8&&g.now.bottom>=900-40&&Math.abs(g.now.bottom-g.next.bottom)<1,'at the bottom, on one line: '+JSON.stringify(g));
  assert.ok(g.cards.every(([w,h])=>w===g.cards[0][0]&&h===g.cards[0][1]),'one card size: '+JSON.stringify(g.cards));
  assert.ok(g.now.y>=g.tracker.bottom,'below the Attention Center: '+JSON.stringify(g));
 }
 // Only the cards take the pointer: the strip between them lets a tap reach the World.
 const through=await page.evaluate(()=>{const r=document.querySelector('.task-group[data-group=now] .task-card')!.getBoundingClientRect(),hit=document.elementFromPoint(r.right+40,r.y+r.height/2);return !hit?.closest('.task-panel');});
 assert.ok(through,'a tap beside a card reaches what is under it');
 // Fox's own background work gets a card of its own, newest nearest Fox.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Reading the thread with Sam…'}})));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Drafting a reply: Answer Sam about the venue…'}})));
 const foxCard=now.locator('.task-card[data-task-id="fox:reply"]');
 await foxCard.waitFor();
 assert.deepEqual(await cards(now),['Fox · Drafting a reply: Answer Sam about the venue…','YouTube · Working on a task from Fox']);
 {
  const [a,b]=await now.locator('.task-cards>.task-card').evaluateAll(list=>list.map(c=>c.getBoundingClientRect().x));
  assert.ok(a>b,'the newest stands nearest Fox');
 }
 // A click opens its window above it: the step, when it started, who does it, and every line it said.
 const popover=page.locator('.task-popover');
 await foxCard.click();
 await popover.locator('.task-terminal-facts').waitFor();
 assert.deepEqual(await popover.locator('.task-terminal-fact').allTextContents(),['step: Drafting a reply: Answer Sam about the venue…','started: 9:30 AM','by: Fox']);
 assert.deepEqual(await popover.locator('.task-terminal-line').evaluateAll(list=>list.map(l=>l.lastChild!.textContent)),['Reading the thread with Sam…','Drafting a reply: Answer Sam about the venue…']);
 assert.match(await popover.locator('.task-terminal').evaluate(e=>getComputedStyle(e).fontFamily),/mono|Menlo|Consolas/i,'monospace');
 {
  const [p,c]=[await popover.boundingBox(),await foxCard.boundingBox()];
  assert.ok(p&&c&&p.y+p.height<=c.y,'above the card: '+JSON.stringify({p,c}));
 }
 assert.equal(await foxCard.getAttribute('aria-expanded'),'true');
 await foxCard.click();
 await popover.waitFor({state:'hidden'});
 // Fox drives a web page: its card first, the page's picture beside its step, the bar showing the steps done.
 await page.evaluate(()=>{(window as any).foxPage={url:'https://www.example.com/courts',title:'Book a court',steps:[{text:'Opening the booking page',done:true},{text:'Choosing a court time',done:false}],
  image:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f6f1e4"/><rect x="0" y="0" width="320" height="34" fill="#2f6b4f"/><text x="14" y="23" font-family="sans-serif" font-size="15" fill="#fff">Example Courts</text><rect x="20" y="56" width="130" height="56" rx="8" fill="#d9e8d2"/><rect x="170" y="56" width="130" height="56" rx="8" fill="#e9d8b8"/><rect x="20" y="126" width="280" height="44" rx="8" fill="#2f6b4f"/><text x="118" y="154" font-family="sans-serif" font-size="15" fill="#fff">Book 6 PM</text></svg>')};});
 const pageCard=now.locator('.task-card[data-task-id="page:example.com"]');
 await pageCard.waitFor({timeout:10000});
 assert.deepEqual(await cards(now),['example.com · Choosing a court time','Fox · Drafting a reply: Answer Sam about the venue…']);
 assert.equal((await now.locator('.task-more').innerText()).trim(),'+1');
 assert.equal(await pageCard.locator('.task-card-icon').getAttribute('data-icon'),'page');
 assert.equal(await pageCard.locator('.task-card-bar i').evaluate(i=>(i as HTMLElement).style.width),'50%','one of two steps done');
 await page.screenshot({path:SCREEN});
 await pageCard.click();
 await popover.locator('.task-page img').waitFor();
 assert.equal(await popover.locator('.task-page-step').textContent(),'Fox · Choosing a court time');
 await popover.locator('.task-page').click();
 assert.deepEqual(await page.evaluate(()=>(window as any).opened),['https://www.example.com/courts'],'a click opens the page');
 await page.evaluate(()=>{(window as any).foxPage=null;});
 await pageCard.waitFor({state:'detached',timeout:10000});
 // When Fox's work ends its card goes; what it made is in the Journal, not here.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'',done:'1 reply ready'}})));
 await foxCard.waitFor({state:'detached'});
 assert.equal(await panel.getByText('1 reply ready').count(),0,'nothing finished');
 // "+2" opens every routine, soonest first; a routine opens a read-only popover with when, how often and who runs it.
 await next.locator('.task-more').click();
 await popover.locator('.task-list').waitFor();
 assert.deepEqual(await popover.locator('.task-list .task-title').allTextContents(),['Water the plants','Morning news','Weekly review','Flight prices']);
 await popover.locator('.task-list .task-card',{hasText:'Morning news'}).click();
 await popover.locator('.task-popover-facts').waitFor();
 assert.equal((await popover.innerText()).replace(/\s+/g,' ').trim(),'Morning news When Tomorrow 6:00 AM How often Every day Runs on OpenClaw’s scheduler');
 assert.equal(await popover.locator('button').count(),0,'view only');
 await page.keyboard.press('Escape');
 await popover.waitFor({state:'hidden'});
 // A routine paused in Settings › Agent leaves at once: Settings announces `worldlet:routines` after the Agent's own
 // command ran (ui/companion/agent-routines.ts), and the panel reads its jobs again; resumed, it is back.
 const pause=(paused:boolean)=>page.evaluate(paused=>{const w=window as any;w.panel={...w.panel,jobs:w.panel.jobs.map((j:any)=>j.id==='b'?{...j,paused}:j)};window.dispatchEvent(new CustomEvent('worldlet:routines',{detail:{changed:true}}));},paused);
 await pause(true);
 await next.locator('.task-card',{hasText:'Water the plants'}).waitFor({state:'detached'});
 assert.deepEqual(await cards(),['Morning news · Tomorrow 6:00 AM','Weekly review · Fri 5:00 PM']);
 await pause(false);
 await next.locator('.task-card',{hasText:'Water the plants'}).waitFor();
 // During the tour only Routines show.
 const shown=async()=>panel.locator('.task-group:visible').evaluateAll(list=>list.map(g=>(g as HTMLElement).dataset.group));
 await page.evaluate(()=>{(document.querySelector('.native-console') as HTMLElement).dataset.tourStep='hello';});
 assert.deepEqual(await shown(),['routines'],'Doing now waits for the tour to end');
 await page.evaluate(()=>{delete (document.querySelector('.native-console') as HTMLElement).dataset.tourStep;});
 assert.deepEqual(await shown(),['now','routines']);
 // While the person types to Fox the message bar opens wider; the cards stay clear of it and its buttons.
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Hello');
 {
  const clear=await page.evaluate(()=>{const entry=document.querySelector('.companion-text-entry')!,bars=[entry,...entry.querySelectorAll('button')].map(e=>e.getBoundingClientRect()).filter(r=>r.width),cards=[...document.querySelectorAll('.task-panel .task-card,.task-panel .task-more')].filter(c=>(c as HTMLElement).offsetParent).map(c=>c.getBoundingClientRect());return {bars:bars.map(b=>[b.x,b.right]),overlap:cards.filter(c=>bars.some(bar=>c.right>bar.x&&c.x<bar.right&&c.bottom>bar.y&&c.y<bar.bottom)).length,count:cards.length};});
  assert.ok(clear.count>0&&clear.overlap===0,'clear of the open message bar: '+JSON.stringify(clear));
 }
 await page.locator('#notionInput').fill('');
 await page.keyboard.press('Escape');
 // Beside an open Applet they step aside.
 await page.evaluate(()=>{const r=document.querySelector('.native-console') as HTMLElement;r.dataset.depth='object';r.dataset.page='app-gmail';});
 await panel.waitFor({state:'hidden'});
 // At 800px wide each side is only its count, beside the message bar, which opens the whole list; a click outside closes it.
 const narrow=await browser.newPage({viewport:{width:800,height:900},reducedMotion:'reduce'});narrow.setDefaultTimeout(15000);
 const narrowErrors=pageErrors(narrow);
 await narrow.clock.setFixedTime(t0);
 await narrow.addInitScript(()=>{
  const w=window as any;w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
   if(b.action==='snapshot')return {workspaceId:'task-panel-narrow',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true};
   if(b.action==='taskPanel')return {jobs:[{id:'a',name:'Morning news',kind:'prompt',paused:false,when:{cron:'0 6 * * *'}},{id:'b',name:'Water the plants',kind:'prompt',paused:false,when:{cron:'0 19 * * *'}}],working:[{id:'t',applet:'youtube',at:Date.now()/1000}]};
   if(b.action==='taskPanelPage')return {page:null};
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 });
 await narrow.goto(worldUrl());
 await narrow.locator('.companion-avatar').waitFor();
 const counts=narrow.locator('.task-panel .task-more:visible');
 await counts.first().waitFor();
 assert.deepEqual((await counts.allInnerTexts()).map(t=>t.trim()),['Doing now 1','Next 2']);
 assert.equal(await narrow.locator('.task-panel .task-card:visible').count(),0,'no cards in a narrow World');
 await narrow.locator('.task-group[data-group=routines] .task-more').click();
 await narrow.locator('.task-popover .task-list .task-title',{hasText:'Morning news'}).waitFor();
 await narrow.mouse.click(400,300);
 await narrow.locator('.task-popover').waitFor({state:'hidden'});
 // In a window 560px tall it is gone, like the Attention Center.
 await narrow.setViewportSize({width:1200,height:540});
 await narrow.locator('.task-panel').waitFor({state:'hidden'});
 assert.deepEqual(narrowErrors,[]);
 assert.deepEqual(errors,[]);
});
console.log('PASS tasks beside Fox: doing now on its left and the next Routines on its right, on the message bar’s line, one card style, two a side then +N for the whole list; a running card opens its window or the page Fox drives, a routine its read-only facts, read again when Settings pauses or resumes one; nothing finished; only Routines in the tour, clear of the open message bar, aside beside an Applet, counts only at 800px wide and gone at 540px tall');
