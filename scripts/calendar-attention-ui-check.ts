// The person's own Calendar events in Attention (ui/applets/google-calendar/applet.md#local-events): what is on in the
// next day stands in Coming Up in time order, an event whose 10-minute alert has come leads it, and opening one shows
// its day in Calendar. The same rows go to the paired phone (native-hud onAttention).
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce',timezoneId:'America/Los_Angeles'}),errors=pageErrors(page);
 await page.clock.setFixedTime(new Date('2026-10-06T12:55:00-07:00'));
 await page.addInitScript(()=>{const w=window as any;w.calls=[];
  const event=(id:string,title:string,start:string,end:string,extra={})=>({id,title,start:new Date(start).toISOString(),end:new Date(end).toISOString(),allDay:false,location:'',notes:'',alert:10,repeat:'none',skip:[],createdAt:1,updatedAt:1,...extra});
  let events=[
   event('ev-lunch0000000','Lunch with Ana','2026-10-06T13:00:00-07:00','2026-10-06T14:00:00-07:00',{location:'Cafe Ana'}),
   event('ev-swim00000000','Swim','2026-10-07T07:00:00-07:00','2026-10-07T08:00:00-07:00',{repeat:'daily',alert:null}),
   event('ev-later0000000','Next week','2026-10-14T09:00:00-07:00','2026-10-14T10:00:00-07:00'),
  ];
  const snapshot=()=>({workspaceId:'calendar-attention-fixture',revision:1,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail','app-google-calendar']},sampleEnabled:false,cloudConsent:true});
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
   if(b.action==='snapshot')return snapshot();
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='calendarEvents'){
    if(b.operation==='list')return {events};
    if(b.operation==='delete'){events=events.filter(e=>e.id!==b.id);setTimeout(()=>window.dispatchEvent(new CustomEvent('worldlet:calendar-events',{detail:{id:b.id}})));return {ok:true};}
   }
   return {ok:true};
  }}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 const group=page.locator('.world-task-group[data-group=event]');await group.locator('.world-own-event').first().waitFor();
 assert.equal(await group.locator('h2').textContent(),'Coming Up');
 const rows=group.locator('.world-own-event');
 assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>[e.querySelector('.world-task-title')?.textContent,e.getAttribute('data-alerting')])),[['Lunch with Ana','true'],['Swim',null]],'What is on in the next day, the alerting one first; next week waits');
 assert.match(await rows.first().textContent()||'',/Cafe Ana/);
 assert.equal(await rows.first().getAttribute('data-attention-level'),'5','An alert is as urgent as it gets');
 assert.equal(await rows.nth(1).getAttribute('data-calendar-event'),'ev-swim00000000@2026-10-07','Each time a repeating event happens is its own row');
 await page.screenshot({path:'/tmp/calendar-attention.png'});
 // Opening it shows its day in Calendar.
 await rows.nth(1).click();
 await page.locator('.home-calendar-day[data-date="2026-10-07"]').waitFor();
 assert.equal(await page.locator('.home-calendar-day').count(),1,'Calendar opens on that day');
 assert.equal(await page.locator('.home-leaf[data-local=true][data-repeat=daily]').count(),1);
 await page.screenshot({path:'/tmp/calendar-attention-open.png'});
 // A change in Calendar (or by Fox) shows in Attention at once.
 await page.evaluate(()=>(window as any).webkit.messageHandlers.worldlet.postMessage({action:'calendarEvents',operation:'delete',id:'ev-lunch0000000'}));
 await page.waitForFunction(()=>!document.querySelector('.world-own-event[data-calendar-event="ev-lunch0000000"]'));
 assert.deepEqual(errors,[]);
 console.log('PASS Calendar in Attention: the next day\'s own events stand in Coming Up, an alerting one first; opening one shows its day; changes show at once');
}finally{await browser.close();}
