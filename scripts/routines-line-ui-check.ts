import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// The World's top-right shows the person's routines (owner request 2026-10-10, ui/hud/routines-line.ts): under what Fox
// is doing, a short timeline, each routine under the day it runs with its time, read from their Agent's scheduler
// (`foxRoutines`); a routine that ran makes it read again, and with none the line is gone. Bundled UI, faked bridge,
// fixed clock, fictional routines.
const t0=new Date(2026,9,10,7,30);
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.clock.setFixedTime(t0);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  w.jobs=[
   {id:'a',name:'Morning brief',kind:'prompt',paused:false,when:{cron:'0 8 * * *'}},
   {id:'b',name:'Flight prices',kind:'prompt',paused:false,when:{everySeconds:3600}},
   {id:'c',name:'Weekly review',kind:'prompt',paused:false,when:{cron:'0 17 * * 5'}},
   {id:'d',name:'Old one',kind:'prompt',paused:true,when:{cron:'0 7 * * *'}},
   {id:'e',name:'Water the plants',kind:'prompt',paused:false,when:{cron:'0 19 * * *'}},
   {id:'f',name:'Pay rent',kind:'prompt',paused:false,when:{cron:'0 9 1 * *'}},
   {id:'g',name:'Sunday plan',kind:'prompt',paused:false,when:{cron:'0 18 * * 0'}},
   {id:'h',name:'Gym',kind:'prompt',paused:false,when:{cron:'30 6 * * 1,3,5'}}
  ];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
   w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'routines-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true};
   if(b.action==='foxRoutines')return {jobs:w.jobs};
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 const line=page.locator('.notion-top .world-environment .fox-routines');
 // A timeline: Now, then each routine soonest first under the day it runs, with its time; paused ones are left out;
 // five, then "+N more".
 await line.locator('.fox-routine').first().waitFor();
 const rows=await line.locator('.fox-timeline>li').evaluateAll(list=>list.map(li=>li.classList.contains('fox-routine')&&!li.classList.contains('fox-routine-more')?li.querySelector('.fox-routine-name')!.textContent+' | '+li.querySelector('.fox-routine-when')!.textContent:li.textContent));
 assert.deepEqual(rows,['Now','Today','Morning brief | 8:00 AM','Water the plants | 7:00 PM','Tomorrow','Sunday plan | 6:00 PM','Mon','Gym | 6:30 AM','Fri','Weekly review | 5:00 PM','+2 more'],JSON.stringify(rows));
 assert.equal(await line.locator('.fox-routine-more').getAttribute('title'),'Flight prices\nPay rent','the rest are named on hover; those with no time in the next week come last');
 // The dots sit on one rail.
 const rail=await line.locator('.fox-timeline>li.fox-routine').evaluateAll(list=>list.map(li=>{const r=li.getBoundingClientRect(),dot=getComputedStyle(li,'::after');return Math.round(r.right-parseFloat(dot.right)-parseFloat(dot.width)/2);}));
 assert.ok(rail.every(x=>Math.abs(x-rail[0])<=1),'one rail: '+JSON.stringify(rail));
 const box=await line.boundingBox();
 assert.ok(box&&box.x+box.width>1440*.7&&box.y<900*.25,'it sits in the top-right corner: '+JSON.stringify(box));
 await page.screenshot({path:path.join(tmpdir(),'worldlet-routines-line.png'),clip:{x:940,y:0,width:500,height:340}});
 // A routine ran: the line reads again; with none left it is gone.
 await page.evaluate(()=>{(window as any).jobs=[];window.dispatchEvent(new CustomEvent('worldlet:routines',{detail:{ran:true,job:{name:'Morning brief',last_status:'ok'}}}));});
 await line.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
});
console.log('PASS routines line UI: top-right timeline of routines by day, soonest first, on one rail, five then +N more, paused left out, reread after a run, hidden with none');
