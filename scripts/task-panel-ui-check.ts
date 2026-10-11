import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// The World's Task panel on the right (owner layout 2026-10-10 and feedback 2026-10-11, ui/hud/task-panel.ts,
// core/tasks/task-panel.ts): it floats on the World beside the Attention Center without touching it. Routines come
// first, a timeline going down from Now whose rows open a read-only popover. Below them, Doing now is one small window
// per running task, stacked: a dark terminal with Fox in its corner and the last status lines, which a click opens to
// the whole log, or, while Fox drives a web page, that page small, which a click opens. There is no Done list and no
// Journal link: finished work lives in the Journal. The whole column scrolls as one when it is taller than the World.
// On the left, the date and Journal corner stands on the Attention Center's edge, width and backing. During the tour
// only Routines show; beside an open Applet it is hidden; at 800px wide it is a chip that opens the panel, and in a
// window 560px tall it is gone. Bundled UI, faked bridge, fixed clock, fictional jobs, mail and page.
const t0=new Date(2026,9,10,9,30);
const SCREEN=process.env.WORLDLET_TASK_PANEL_SCREEN||path.join(tmpdir(),'worldlet-task-panel.png');
const LEFT_SCREEN=process.env.WORLDLET_TOP_LEFT_SCREEN||path.join(tmpdir(),'worldlet-top-left.png');
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
 const windows=panel.locator('.task-window');
 await windows.first().waitFor();
 // Routines on top, then Doing now; nothing else (owner request 2026-10-11: finished work lives only in the Journal).
 const groups=async()=>panel.locator('.task-group').evaluateAll(list=>list.map(g=>(g as HTMLElement).dataset.group+':'+g.querySelector('.task-group-heading')!.textContent));
 assert.deepEqual(await groups(),['routines:Routines','now:Doing now']);
 assert.equal(await panel.locator('.task-more,.task-journal,.task-row,.task-group[data-group=done]').count(),0,'no Done list, no Journal link, no "+N more"');
 // Routines: a timeline going down from Now, each time beside its dot, the day where it changes; paused jobs left out.
 const timeline=await panel.locator('.task-timeline>li').evaluateAll(list=>list.map(li=>li.classList.contains('task-timeline-item')?li.querySelector('.task-time')!.textContent+' · '+li.querySelector('.task-title')!.textContent:li.textContent));
 assert.deepEqual(timeline,['Now','9:50 AM · Check Mail','7:00 PM · Water the plants','Tomorrow','6:00 AM · Morning news','Fri','5:00 PM · Weekly review','Repeating','every hour · Flight prices'],JSON.stringify(timeline));
 const dots=await panel.locator('.task-step .task-dot').evaluateAll(list=>list.map(d=>{const r=d.getBoundingClientRect();return Math.round(r.x+r.width/2);}));
 assert.ok(dots.every(x=>Math.abs(x-dots[0])<=1),'one rail: '+JSON.stringify(dots));
 const times=await panel.locator('.task-step .task-time').evaluateAll(list=>list.map(t=>t.getBoundingClientRect().right));
 assert.ok(times.every(x=>x<dots[0]),'times on the left of the line');
 // Doing now: the Applet's task in its own dark terminal window, Fox in its corner, its status lines.
 assert.equal(await windows.count(),1);
 const youtube=panel.locator('.task-window[data-task-id="applet:task-1"]');
 assert.equal(await youtube.getAttribute('data-mode'),'terminal');
 assert.equal(await youtube.locator('.task-terminal-fox').count(),1,'Fox works in the window');
 const lines=async(win=youtube)=>win.locator('.task-terminal-line').evaluateAll(list=>list.map(l=>l.lastChild!.textContent));
 assert.deepEqual(await lines(),['Fox handed YouTube a task','YouTube is working on it']);
 const terminalLook=await youtube.locator('.task-terminal').evaluate(e=>{const c=getComputedStyle(e);return {font:c.fontFamily,bg:getComputedStyle(e.closest('.task-window')!).backgroundColor};});
 assert.match(terminalLook.font,/mono|Menlo|Consolas/i,'monospace');assert.equal(terminalLook.bg,'rgb(12, 16, 14)','near-black');
 const [routinesBox,nowBox]=await panel.evaluate(p=>['routines','now'].map(g=>{const r=p.querySelector(`.task-group[data-group=${g}]`)?.getBoundingClientRect();return r?{y:r.y,height:r.height}:null;}));
 assert.ok(routinesBox&&nowBox&&routinesBox.y+routinesBox.height<=nowBox.y,'Routines above Doing now');
 // It floats beside the Attention Center, on the same kind of soft backing, and never overlaps it.
 const tracker=page.locator('.world-task-tracker');
 await tracker.locator('.world-matter[data-world-item-id="flight-run"]').waitFor();
 const [right,left]=[await panel.boundingBox(),await tracker.boundingBox()];
 assert.ok(right&&left&&right.x>left.x+left.width,'beside, not over, the Attention Center: '+JSON.stringify({right,left}));
 assert.ok(right!.x+right!.width<=1440-20&&right!.x+right!.width>=1440-30,'24px from the right edge: '+JSON.stringify(right));
 const backing=await panel.locator('.task-panel-body').evaluate(e=>getComputedStyle(e,'::before').backgroundColor);
 assert.notEqual(backing,'rgba(0, 0, 0, 0)','a soft dark backing like the Attention Center’s, a little deeper');
 // Fox's own background work gets a window of its own, newest first, stacked above the Applet's.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Reading the thread with Sam…'}})));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Drafting a reply: Answer Sam about the venue…'}})));
 const foxWin=panel.locator('.task-window[data-task-id="fox:reply"]');
 await foxWin.waitFor();
 assert.deepEqual(await windows.evaluateAll(list=>list.map(w=>(w as HTMLElement).dataset.taskId+':'+w.querySelector('.task-window-title')!.textContent)),['fox:reply:Fox','applet:task-1:YouTube'],'one window per task, stacked');
 assert.deepEqual(await lines(foxWin),['Reading the thread with Sam…','Drafting a reply: Answer Sam about the venue…']);
 // Both boxes in one read: a refresh redraws the windows, so two separate reads could fall either side of it.
 const [a,b]=await panel.evaluate(p=>['fox:reply','applet:task-1'].map(id=>{const r=p.querySelector(`.task-window[data-task-id="${id}"]`)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;}));
 assert.ok(a&&b&&a.y+a.height<=b.y&&Math.abs(a.x-b.x)<1&&Math.abs(a.width-b.width)<1,'one under the other, the same width: '+JSON.stringify({a,b}));
 // A click opens that window's whole status: the step, when it started, who does it; the other stays closed.
 await foxWin.click();
 await foxWin.locator('.task-terminal-facts').waitFor();
 assert.deepEqual(await foxWin.locator('.task-terminal-fact').allTextContents(),['step: Drafting a reply: Answer Sam about the venue…','started: 9:30 AM','by: Fox']);
 assert.equal(await foxWin.getAttribute('aria-expanded'),'true');
 assert.equal(await youtube.getAttribute('aria-expanded'),'false');
 await foxWin.click();
 await foxWin.locator('.task-terminal-facts').waitFor({state:'detached'});
 // Fox drives a web page: a window that shows that page small, with Fox's step, first in the stack; a click opens it.
 await page.evaluate(()=>{(window as any).foxPage={url:'https://www.example.com/courts',title:'Book a court',steps:[{text:'Opening the booking page',done:true},{text:'Choosing a court time',done:false}],
  image:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f6f1e4"/><rect x="0" y="0" width="320" height="34" fill="#2f6b4f"/><text x="14" y="23" font-family="sans-serif" font-size="15" fill="#fff">Example Courts</text><rect x="20" y="56" width="130" height="56" rx="8" fill="#d9e8d2"/><rect x="170" y="56" width="130" height="56" rx="8" fill="#e9d8b8"/><rect x="20" y="126" width="280" height="44" rx="8" fill="#2f6b4f"/><text x="118" y="154" font-family="sans-serif" font-size="15" fill="#fff">Book 6 PM</text></svg>')};});
 const pageWin=panel.locator('.task-window[data-mode=page]');
 await pageWin.waitFor({timeout:10000});
 assert.deepEqual(await windows.evaluateAll(list=>list.map(w=>(w as HTMLElement).dataset.mode)),['page','terminal','terminal']);
 assert.equal(await pageWin.locator('.task-window-title').textContent(),'example.com');
 assert.equal(await pageWin.locator('.task-window-step').textContent(),'Fox · Choosing a court time');
 assert.ok(await pageWin.locator('.task-window-page img').evaluate(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0),'the page, small');
 await page.screenshot({path:SCREEN});
 // The top-left corner and the Attention Center read as one column: the same left edge and width, the same backing.
 {
  const corner=page.locator('.world-today'),[c,t]=[await corner.boundingBox(),await tracker.boundingBox()];
  assert.ok(c&&t&&Math.abs(c.x-t.x)<1&&Math.abs(c.width-t.width)<1,'the corner on the Attention Center’s left edge and width: '+JSON.stringify({c,t}));
  assert.ok(c!.y+c!.height<=t!.y+1,'above it');
  const look=await page.evaluate(()=>{const s=(q:string,p?:string)=>getComputedStyle(document.querySelector(q)!,p);return {corner:s('.world-today','::before').backgroundColor,list:s('.world-task-list','::before').backgroundColor,cornerBlur:s('.world-today','::before').filter,listBlur:s('.world-task-list','::before').filter,ink:s('.world-today').color,matterInk:s('.world-task-tracker').getPropertyValue('--ui-matter-ink').trim()};});
  assert.equal(look.corner,look.list,'the same soft backing');assert.equal(look.cornerBlur,look.listBlur);
  const firstLine=await page.evaluate(()=>{const x=(q:string)=>document.querySelector(q)!.getBoundingClientRect().x;return {date:x('.world-today-open'),heading:x('.world-task-tracker .world-task-heading')};});
  assert.ok(Math.abs(firstLine.date-firstLine.heading)<=1,'the date starts where the Attention Center’s headings do: '+JSON.stringify(firstLine));
  await page.screenshot({path:LEFT_SCREEN,clip:{x:0,y:0,width:480,height:900}});
 }
 await pageWin.click();
 assert.deepEqual(await page.evaluate(()=>(window as any).opened),['https://www.example.com/courts'],'a click opens the page');
 await page.evaluate(()=>{(window as any).foxPage=null;});
 await pageWin.waitFor({state:'detached',timeout:10000});
 // When Fox's work ends its window goes; what it made is in the Journal, not here.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'',done:'1 reply ready'}})));
 await foxWin.waitFor({state:'detached'});
 assert.equal(await panel.getByText('1 reply ready').count(),0,'no Done row');
 assert.equal(await windows.count(),1);
 // A routine: a read-only popover with when, how often and who runs it; no buttons.
 await panel.locator('.task-step',{hasText:'Morning news'}).click();
 const popover=panel.locator('.task-popover');
 await popover.waitFor({state:'visible'});
 assert.equal((await popover.innerText()).replace(/\s+/g,' ').trim(),'Morning news When Tomorrow 6:00 AM How often Every day Runs on OpenClaw’s scheduler');
 assert.equal(await popover.locator('button').count(),0,'view only');
 await page.keyboard.press('Escape');
 await popover.waitFor({state:'hidden'});
 // During the tour only Routines show.
 const shown=async()=>panel.locator('.task-group:visible').evaluateAll(list=>list.map(g=>(g as HTMLElement).dataset.group));
 await page.evaluate(()=>{(document.querySelector('.native-console') as HTMLElement).dataset.tourStep='hello';});
 assert.deepEqual(await shown(),['routines'],'Doing now waits for the tour to end');
 await page.evaluate(()=>{delete (document.querySelector('.native-console') as HTMLElement).dataset.tourStep;});
 assert.deepEqual(await shown(),['routines','now']);
 // More than the World holds: the column scrolls as one, its backing still, nothing cut to "+N more".
 await page.evaluate(()=>{const w=window as any;w.panel={...w.panel,jobs:[...w.panel.jobs,...Array.from({length:10},(_,i)=>({id:'x'+i,name:'Extra routine '+(i+1),kind:'prompt',paused:false,when:{cron:`0 ${8+i} * * 1`}}))],
  working:[...w.panel.working,{id:'task-2',applet:'gmail',at:Date.now()/1000-60},{id:'task-3',applet:'google-calendar',at:Date.now()/1000-30}]};window.dispatchEvent(new CustomEvent('worldlet:applet-task',{detail:{}}));});
 await panel.locator('.task-step',{hasText:'Extra routine 10'}).waitFor({state:'attached'});
 await page.waitForFunction(()=>document.querySelectorAll('.task-panel .task-window').length===3);
 const scroller=panel.locator('.task-panel-scroll');
 const fit=await scroller.evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));
 assert.ok(fit.scroll>fit.client+40,'taller than the World: it scrolls '+JSON.stringify(fit));
 assert.ok(fit.top>=60&&fit.bottom<=900-60,'inside the World’s right side: '+JSON.stringify(fit));
 const last=panel.locator('.task-window').last();
 const hiddenAtFirst=await last.evaluate((w,bottom)=>w.getBoundingClientRect().top>bottom,fit.bottom);
 assert.ok(hiddenAtFirst,'the last window is further down');
 await scroller.hover();await page.mouse.wheel(0,2000);
 await page.waitForFunction(()=>{const s=document.querySelector('.task-panel-scroll')!;return s.scrollTop+s.clientHeight>=s.scrollHeight-2;});
 const seen=await last.evaluate((w,bottom)=>w.getBoundingClientRect().bottom<=bottom+1,fit.bottom);
 assert.ok(seen,'scrolling the column brings the last window into view');
 assert.equal(await panel.locator('.task-more').count(),0);
 // Beside an open Applet the panel leaves the right third to Fox.
 await page.evaluate(()=>{const r=document.querySelector('.native-console') as HTMLElement;r.dataset.depth='object';r.dataset.page='app-gmail';});
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
 assert.equal((await chip.innerText()).trim(),'Routines 2 · Doing now 1');
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
console.log('PASS task panel UI: floats beside the Attention Center on its backing; Routines on top as a timeline down from Now with a read-only popover; below them one window per running task, a terminal with Fox and its status lines that a click opens to the whole log, or the page Fox drives shown small that a click opens; no Done list or Journal link; one column that scrolls as one; the date and Journal corner on the Attention Center’s edge, width and backing; only Routines in the tour, hidden beside an open Applet, a chip at 800px wide and gone at 560px tall');
