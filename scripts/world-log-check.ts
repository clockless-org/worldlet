// The world log: Core turns saved history into plain lines and finds the next scheduled check.
// Nothing of it shows in the World's corner (owner Orders 2026-10-06 and 2026-10-10); the History
// page is a running feed of the lines, each going to its Applet or site. The brand stays hidden unless a development build is ready to apply.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import path from 'node:path';
import {worldLogKeeps,worldLogLines,worldLogNext,worldLogNow,WORLD_LOG_KINDS} from '../core/activity/index.ts';
import {pageErrors,worldUrl,waitForWorld} from './browser-test.ts';

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
 await waitForWorld(page);
 // Nothing of the log shows in the World: the bottom-right next-check line is gone too (owner Order 2026-10-10).
 await page.waitForFunction(()=>(window as any).logCalls.length>=1);
 assert.equal(await page.locator('.world-log,.world-log-next,.world-log-lines,.world-log-line').count(),0,'no log in the World corner');
 assert.equal(await page.locator('.world-watermark').isVisible(),false,'the brand stays hidden without a build to apply');
 // New events and what an Applet is doing now reach History.
 await page.evaluate(()=>{const w=window as any;w.entries.push({seq:6,at:Date.now()/1000,kind:'activity.page.opened',key:'',body:{id:'6',data:{url:'https://news.example.org/a'}}});});
 await page.evaluate(()=>{const w=window as any;w.fixture.connections=[{provider:'gmail',connected:true,running:true}];w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(window as any).logCalls.length>=3,null,{timeout:12000});
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
 // The companion panel's History page is a running feed of the plain lines.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'History'}})));
 const recent=page.locator('#companionInfo .companion-world-log');
 await recent.getByText('You visited news.example.org',{exact:true}).waitFor({timeout:10000});
 assert(await recent.locator('button').count()>=6,'every line in History goes somewhere');
 assert.equal(await page.locator('#companionInfo').getByText(/Next sync|check at/).count(),0,'History has no next-sync line either (owner Order 2026-10-10)');
 assert.equal(await page.locator('#companionInfo [data-section=History] .companion-history-records').count(),0,'raw records stay out of History (Settings › Troubleshoot)');
 await page.screenshot({path:'output/world-log/history.png'}).catch(()=>{});
 await recent.locator('button').first().click();
 await page.locator('#companionInfo').waitFor({state:'hidden'});
 assert(await page.evaluate(()=>(window as any).logCalls.every(b=>typeof b.tasks==='boolean')),'every read says whether it needs the schedule');
 assert.deepEqual(errors,[]);
 console.log('PASS world log: nothing in the World corner, History is a running feed of plain lines, brand hidden, Applet task result');
}finally{await browser.close();}
