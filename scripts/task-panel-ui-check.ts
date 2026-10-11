import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// The World's Task panel on the right (owner layout 2026-10-10, ui/hud/task-panel.ts, core/tasks/task-panel.ts): on a
// desktop window Doing now, Planned and Done today stand on the right without touching the Attention Center on the
// left; a planned row opens a read-only popover; a done check opens its Applet, where the panel gives the right third
// to Fox; a scheduled job's result points at its Attention item; more than four done end in "N today · Journal";
// Fox's background work comes and goes; during the tour only Planned shows; at 800px wide it is a chip that opens the
// list, and in a window 560px tall it is gone. Bundled UI, faked bridge, fixed clock, fictional jobs and mail.
const t0=new Date(2026,9,10,9,30);
const SCREEN=process.env.WORLDLET_TASK_PANEL_SCREEN||path.join(tmpdir(),'worldlet-task-panel.png');
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.clock.setFixedTime(t0);
 await page.addInitScript((now:number)=>{
  const w=window as any,s=(minutes:number)=>now/1000+minutes*60,iso=(minutes:number)=>new Date(now+minutes*60000).toISOString();
  w.calls=[];
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
    {seq:13,at:s(-150),kind:'applet.task',key:'youtube',body:{status:'complete',runId:'task-0'}},
    {seq:12,at:s(-60*20),kind:'routine.run',body:{status:'complete',name:'Yesterday’s run'}},
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
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 },t0.getTime());
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 const panel=page.locator('.task-panel');
 await panel.locator('.task-row').first().waitFor();
 const groups=async()=>panel.locator('.task-group:visible').evaluateAll(list=>list.map(g=>({group:(g as HTMLElement).dataset.group,heading:g.querySelector('.task-group-heading')!.textContent,
  rows:[...g.querySelectorAll('.task-row')].map(r=>r.querySelector('.task-title')!.textContent+' | '+(r.querySelector('.task-when')?.textContent??'')),
  more:g.querySelector('.task-more')?.textContent??''})));
 // Three groups on the right, Doing now first, each in its order; paused jobs and yesterday left out.
 assert.deepEqual(await groups(),[
  {group:'now',heading:'Doing now',rows:['YouTube is working on a task | In progress'],more:''},
  {group:'planned',heading:'Planned',rows:['Check Mail | 9:50 AM','Water the plants | 7:00 PM','Morning news | Tomorrow 6:00 AM','Weekly review | Fri 5:00 PM'],more:'+1 more'},
  {group:'done',heading:'Done today',rows:['Flight prices · Not finished | 9:20 AM','Checked Mail · 6 times | 9:00 AM','Check the weather | 8:00 AM','YouTube finished a task | 7:00 AM'],more:'5 today · Journal'},
 ],JSON.stringify(await groups()));
 assert.equal(await panel.locator('.task-row[data-state=failed]').count(),1,'a failed row is marked');
 // It mirrors the Attention Center and never overlaps it.
 const tracker=page.locator('.world-task-tracker');
 await tracker.locator('.world-matter[data-world-item-id="flight-run"]').waitFor();
 const [right,left]=[await panel.boundingBox(),await tracker.boundingBox()];
 assert.ok(right&&left&&right.x>left.x+left.width,'beside, not over, the Attention Center: '+JSON.stringify({right,left}));
 assert.ok(right!.x+right!.width<=1440-20&&right!.x+right!.width>=1440-30,'24px from the right edge: '+JSON.stringify(right));
 const rows=await panel.locator('.task-row').evaluateAll(list=>list.map(r=>{const b=r.getBoundingClientRect();return b.height;}));
 assert.ok(rows.every(h=>h<40),'one line per row: '+JSON.stringify(rows));
 await page.screenshot({path:SCREEN});
 // A planned row: a read-only popover with when, how often and who runs it; no buttons.
 await panel.locator('.task-row',{hasText:'Morning news'}).click();
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
 // Fox's own background work: its step under Doing now, then what it made under Done today.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'Drafting a reply: Answer Sam about the venue…'}})));
 await panel.locator('.task-group[data-group=now] .task-row[data-source=fox]',{hasText:'Drafting a reply'}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'reply',text:'',done:'1 reply ready'}})));
 await panel.locator('.task-group[data-group=done] .task-row[data-source=fox]',{hasText:'1 reply ready'}).waitFor();
 assert.equal(await panel.locator('.task-group[data-group=now] .task-row[data-source=fox]').count(),0);
 // During the tour only Planned shows.
 await page.evaluate(()=>{(document.querySelector('.native-console') as HTMLElement).dataset.tourStep='hello';});
 assert.deepEqual((await groups()).map(g=>g.group),['planned'],'Doing now and Done today wait for the tour to end');
 await page.evaluate(()=>{delete (document.querySelector('.native-console') as HTMLElement).dataset.tourStep;});
 // A done check opens its Applet, and the panel leaves the right third to Fox.
 await panel.locator('.task-row',{hasText:'Checked Mail'}).click();
 await page.waitForFunction(()=>(document.querySelector('.native-console') as HTMLElement)?.dataset.depth==='object');
 await panel.waitFor({state:'hidden'});
 await page.goBack().catch(()=>{});
 // At 800px wide it is a chip in the top-right that opens the same list; a click outside closes it.
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
 await narrow.locator('.task-panel-body .task-row',{hasText:'Morning news'}).waitFor();
 await narrow.mouse.click(400,450);
 await narrow.locator('.task-panel-body').waitFor({state:'hidden'});
 // In a window 560px tall it is gone, like the Attention Center.
 await narrow.setViewportSize({width:1200,height:540});
 await narrow.locator('.task-panel').waitFor({state:'hidden'});
 assert.deepEqual(narrowErrors,[]);
 assert.deepEqual(errors,[]);
});
console.log('PASS task panel UI: Doing now, Planned and Done today on the right beside the Attention Center, a planned row’s read-only popover, a result pointing at its Attention item, the day’s total opening the Journal, Fox’s work coming and going, only Planned in the tour, hidden beside an open Applet, a chip at 800px wide and gone at 560px tall');
