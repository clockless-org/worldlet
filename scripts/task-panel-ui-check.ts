import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// The World's Task panel on the right (owner layout 2026-10-10 and feedback 2026-10-11, ui/hud/task-panel.ts,
// core/tasks/task-panel.ts): it floats on the World beside the Attention Center without touching it. Doing now is a
// small window: a dark terminal with Fox in its corner and the last status lines, which a click opens to the whole
// log, or, while Fox drives a web page, that page small, which a click opens. Planned is a timeline going down from
// Now; a row opens a read-only popover. Done today is a short list: a check opens its Applet (where the panel gives
// the right third to Fox), a scheduled job's result points at its Attention item, more than four end in
// "N today · Journal". During the tour only Planned shows; at 800px wide it is a chip that opens the panel, and in a
// window 560px tall it is gone. Bundled UI, faked bridge, fixed clock, fictional jobs, mail and page.
const t0=new Date(2026,9,10,9,30);
const SCREEN=process.env.WORLDLET_TASK_PANEL_SCREEN||path.join(tmpdir(),'worldlet-task-panel.png');
const TERMINAL_SCREEN=process.env.WORLDLET_TASK_PANEL_TERMINAL_SCREEN||path.join(tmpdir(),'worldlet-task-panel-terminal.png');
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
   history:[
    ...[1,2,3,4,5,6].map(n=>({seq:n,at:s(-30*n),kind:'applet.check',key:'gmail',body:{status:'complete'}})),
    {seq:10,at:s(-200),kind:'applet.check',key:'google-calendar',body:{status:'error'}},
    {seq:11,at:s(-90),kind:'routine.run',body:{status:'complete',name:'Check the weather'}},
    {seq:12,at:s(-60*20),kind:'routine.run',body:{status:'complete',name:'Yesterday’s run'}},
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
 const win=panel.locator('.task-window');
 await win.waitFor();
 // Doing now: the Applet's task in a dark terminal window, Fox in its corner, its status lines.
 assert.equal(await win.getAttribute('data-mode'),'terminal');
 assert.equal(await win.locator('.task-terminal-fox').count(),1,'Fox works in the window');
 const lines=async()=>win.locator('.task-terminal-line').evaluateAll(list=>list.map(l=>l.lastChild!.textContent));
 assert.deepEqual(await lines(),['Fox handed YouTube a task','YouTube is working on it']);
 const terminalLook=await win.locator('.task-terminal').evaluate(e=>{const c=getComputedStyle(e);return {font:c.fontFamily,bg:getComputedStyle(e.closest('.task-window')!).backgroundColor};});
 assert.match(terminalLook.font,/mono|Menlo|Consolas/i,'monospace');assert.equal(terminalLook.bg,'rgb(12, 16, 14)','near-black');
 // Planned: a timeline going down from Now, each time beside its dot, the day where it changes; paused jobs left out.
 const timeline=await panel.locator('.task-timeline>li').evaluateAll(list=>list.map(li=>li.classList.contains('task-timeline-item')?li.querySelector('.task-time')!.textContent+' · '+li.querySelector('.task-title')!.textContent:li.textContent));
 assert.deepEqual(timeline,['Now','9:50 AM · Check Mail','7:00 PM · Water the plants','Tomorrow','6:00 AM · Morning news','Fri','5:00 PM · Weekly review'],JSON.stringify(timeline));
 assert.equal(await panel.locator('.task-group[data-group=planned] .task-more').textContent(),'+1 more');
 const dots=await panel.locator('.task-step .task-dot').evaluateAll(list=>list.map(d=>{const r=d.getBoundingClientRect();return Math.round(r.x+r.width/2);}));
 assert.ok(dots.every(x=>Math.abs(x-dots[0])<=1),'one rail: '+JSON.stringify(dots));
 const times=await panel.locator('.task-step .task-time').evaluateAll(list=>list.map(t=>t.getBoundingClientRect().right));
 assert.ok(times.every(x=>x<dots[0]),'times on the left of the line');
 // Done today: newest first, a day's checks folded, a failure marked, four then the day's total.
 const done=await panel.locator('.task-group[data-group=done] .task-row').evaluateAll(list=>list.map(r=>r.querySelector('.task-title')!.textContent+' | '+r.querySelector('.task-when')!.textContent));
 assert.deepEqual(done,['Flight prices · Not finished | 9:20 AM','Checked Mail · 6 times | 9:00 AM','Check the weather | 8:00 AM','YouTube finished a task | 7:00 AM'],JSON.stringify(done));
 assert.equal((await panel.locator('.task-journal').innerText()).trim(),'5 today · Journal');
 assert.equal(await panel.locator('.task-row[data-state=failed]').count(),1,'a failed row is marked');
 // It floats beside the Attention Center, on the same kind of soft backing, and never overlaps it.
 const tracker=page.locator('.world-task-tracker');
 await tracker.locator('.world-matter[data-world-item-id="flight-run"]').waitFor();
 const [right,left]=[await panel.boundingBox(),await tracker.boundingBox()];
 assert.ok(right&&left&&right.x>left.x+left.width,'beside, not over, the Attention Center: '+JSON.stringify({right,left}));
 assert.ok(right!.x+right!.width<=1440-20&&right!.x+right!.width>=1440-30,'24px from the right edge: '+JSON.stringify(right));
 const backing=await panel.locator('.task-panel-body').evaluate(e=>getComputedStyle(e,'::before').backgroundColor);
 assert.notEqual(backing,'rgba(0, 0, 0, 0)','a soft dark backing like the Attention Center’s, a little deeper');
 // Fox's own background work is newer: the window follows it, its steps scroll, and the Applet's task is "+1 more".
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Reading the thread with Sam…'}})));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Drafting a reply: Answer Sam about the venue…'}})));
 await win.locator('.task-window-title',{hasText:'Fox'}).waitFor();
 assert.deepEqual(await lines(),['Reading the thread with Sam…','Drafting a reply: Answer Sam about the venue…']);
 assert.equal(await panel.locator('.task-group[data-group=now] .task-more').textContent(),'+1 more · YouTube is working on a task');
 await page.screenshot({path:TERMINAL_SCREEN});
 // A click opens its whole status: the step, when it started, who does it; another closes it.
 await win.click();
 await win.locator('.task-terminal-facts').waitFor();
 assert.deepEqual(await win.locator('.task-terminal-fact').allTextContents(),['step: Drafting a reply: Answer Sam about the venue…','started: 9:30 AM','by: Fox']);
 assert.equal(await win.getAttribute('aria-expanded'),'true');
 await win.click();
 await win.locator('.task-terminal-facts').waitFor({state:'detached'});
 // When the work ends, what it made is under Done today.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'',done:'1 reply ready'}})));
 await panel.locator('.task-group[data-group=done] .task-row[data-source=fox]',{hasText:'1 reply ready'}).waitFor();
 await win.locator('.task-window-title',{hasText:'YouTube'}).waitFor();
 // Fox drives a web page: the window shows that page small, with Fox's step; a click opens the page.
 await page.evaluate(()=>{(window as any).foxPage={url:'https://www.example.com/courts',title:'Book a court',steps:[{text:'Opening the booking page',done:true},{text:'Choosing a court time',done:false}],
  image:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f6f1e4"/><rect x="0" y="0" width="320" height="34" fill="#2f6b4f"/><text x="14" y="23" font-family="sans-serif" font-size="15" fill="#fff">Example Courts</text><rect x="20" y="56" width="130" height="56" rx="8" fill="#d9e8d2"/><rect x="170" y="56" width="130" height="56" rx="8" fill="#e9d8b8"/><rect x="20" y="126" width="280" height="44" rx="8" fill="#2f6b4f"/><text x="118" y="154" font-family="sans-serif" font-size="15" fill="#fff">Book 6 PM</text></svg>')};});
 await page.waitForFunction(()=>document.querySelector('.task-window')?.getAttribute('data-mode')==='page',null,{timeout:10000});
 assert.equal(await win.locator('.task-window-title').textContent(),'example.com');
 assert.equal(await win.locator('.task-window-step').textContent(),'Fox · Choosing a court time');
 assert.ok(await win.locator('.task-window-page img').evaluate(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0),'the page, small');
 assert.equal(await panel.locator('.task-group[data-group=now] .task-more').textContent(),'+1 more · YouTube is working on a task');
 await page.screenshot({path:SCREEN});
 await win.click();
 assert.deepEqual(await page.evaluate(()=>(window as any).opened),['https://www.example.com/courts'],'a click opens the page');
 await page.evaluate(()=>{(window as any).foxPage=null;});
 await page.waitForFunction(()=>document.querySelector('.task-window')?.getAttribute('data-mode')==='terminal',null,{timeout:10000});
 // A planned row: a read-only popover with when, how often and who runs it; no buttons.
 await panel.locator('.task-step',{hasText:'Morning news'}).click();
 const popover=panel.locator('.task-popover');
 await popover.waitFor({state:'visible'});
 assert.equal((await popover.innerText()).replace(/\s+/g,' ').trim(),'Morning news When Tomorrow 6:00 AM How often Every day Runs on OpenClaw’s scheduler');
 assert.equal(await popover.locator('button').count(),0,'view only');
 await page.keyboard.press('Escape');
 await popover.waitFor({state:'hidden'});
 // A scheduled job's result points at its Attention item on the left.
 await panel.locator('.task-row',{hasText:'Flight prices · Not finished'}).click();
 await page.waitForFunction(()=>document.querySelector('.world-matter[data-world-item-id="flight-run"]')?.classList.contains('is-pointed'));
 // More than four done: the day's total opens the Journal.
 await panel.locator('.task-journal').click();
 await page.locator('#journalBook').waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await page.locator('#journalBook').waitFor({state:'hidden'});
 // During the tour only Planned shows.
 const shown=async()=>panel.locator('.task-group:visible').evaluateAll(list=>list.map(g=>(g as HTMLElement).dataset.group));
 await page.evaluate(()=>{(document.querySelector('.native-console') as HTMLElement).dataset.tourStep='hello';});
 assert.deepEqual(await shown(),['planned'],'Doing now and Done today wait for the tour to end');
 await page.evaluate(()=>{delete (document.querySelector('.native-console') as HTMLElement).dataset.tourStep;});
 assert.deepEqual(await shown(),['now','planned','done']);
 // A done check opens its Applet, and the panel leaves the right third to Fox.
 await panel.locator('.task-row',{hasText:'Checked Mail'}).click();
 await page.waitForFunction(()=>(document.querySelector('.native-console') as HTMLElement)?.dataset.depth==='object');
 await panel.waitFor({state:'hidden'});
 // At 800px wide it is a chip in the top-right that opens the same panel; a click outside closes it.
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
 const chip=narrow.locator('.task-panel-chip');
 await chip.waitFor({state:'visible'});
 assert.equal((await chip.innerText()).trim(),'Doing now 1 · Planned 2');
 const chipBox=await chip.boundingBox();
 assert.ok(chipBox&&chipBox.x+chipBox.width>800-40&&chipBox.y<140,'top-right: '+JSON.stringify(chipBox));
 assert.equal(await narrow.locator('.task-panel-body').isVisible(),false,'closed until asked');
 await chip.click();
 await narrow.locator('.task-panel-body .task-step',{hasText:'Morning news'}).waitFor();
 await narrow.locator('.task-panel-body .task-window').waitFor();
 await narrow.mouse.click(400,450);
 await narrow.locator('.task-panel-body').waitFor({state:'hidden'});
 // In a window 560px tall it is gone, like the Attention Center.
 await narrow.setViewportSize({width:1200,height:540});
 await narrow.locator('.task-panel').waitFor({state:'hidden'});
 assert.deepEqual(narrowErrors,[]);
 assert.deepEqual(errors,[]);
});
console.log('PASS task panel UI: floats beside the Attention Center on its backing; Doing now as a terminal window with Fox and its status lines that a click opens to the whole log, or the page Fox drives shown small that a click opens; Planned as a timeline down from Now with a read-only popover; Done today with a result pointing at its Attention item and the day’s total opening the Journal; only Planned in the tour, hidden beside an open Applet, a chip at 800px wide and gone at 560px tall');
