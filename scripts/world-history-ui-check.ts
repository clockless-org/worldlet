import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {worldHistoryPage} from '../core/items/index.ts';
import {worldEvent,recentWorldHistory} from '../core/items/world-events.ts';
import {pageErrors,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
assert.equal(worldEvent('worldHistory',{}),null,'History reads must not journal themselves');
assert.deepEqual(recentWorldHistory([{kind:'conversation.message',at:'now',body:{preview:'private'}},{kind:'applet.check',key:'gmail',at:'now',body:{status:'complete'}}],8),[{kind:'applet.check',applet:'gmail',at:'now',status:'complete'}]);
const browser=await chromium.launch({executablePath:process.env.WORLDLET_TEST_BROWSER,args:['--allow-file-access-from-files',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
try{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{Object.assign(window,{historyHead:60,historyCalls:0,historyFail:false,historyFixture:JSON.parse(sessionStorage.getItem('history-fixture')||'null')});window.webkit={messageHandlers:{worldlet:{async postMessage(b){
  if(b.action==='snapshot')return {workspaceId:'history-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail']},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true};
  if(b.action==='companionProfile')return {name:'Fox',createdAt:'2026-09-01T12:00:00Z',personality:'Curious and thoughtful.'};
if(b.action==='worldHistory'){(window as any).historyCalls++;if((window as any).historyFail)throw Error('Fixture offline');if((window as any).historySample)return {entries:[],sample:true};if((window as any).historyFixture){const rows=(window as any).historyFixture;return {entries:rows.filter(row=>!b.before||row.seq<b.before).slice(0,50)};}const head=b.before?b.before-1:(window as any).historyHead;return {entries:Array.from({length:Math.min(50,head)},(_,i)=>({seq:head-i,at:1720000000+head-i,kind:(head-i)%7===0?'applet.check':'conversation.message',key:'gmail',body:(head-i)%7===0?{status:'complete'}:{actor:(head-i)%4===2?'fox':'user',preview:'Fixture message '+(head-i)+' <b>plain text</b>'}}))};}
  return {ok:true};
 }}}};});
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());await waitForWorld(page);
 await openCompanionPanel(page);
 // Every recorded event lives in Settings › Help, folded under For the Worldlet team; History is the plain feed.
 const panel=page.locator('#companionInfo'),history=panel.locator('.companion-history-records');
 await panel.locator('[data-setting=help]').click();await panel.getByText('For the Worldlet team',{exact:true}).click();await history.getByText('Fixture message 60 <b>plain text</b>',{exact:true}).waitFor();
 assert.equal(await history.locator('li').count(),50);assert.equal(await history.locator('b').count(),0);
 assert(await history.getByRole('img',{name:'You',exact:true}).count()>0);assert(await history.getByRole('img',{name:'Fox',exact:true}).count()>0);assert(await history.getByRole('img',{name:'Mail',exact:true}).count()>0);
 await history.locator('li').first().evaluate(e=>(window as any).retainedHistoryRow=e);
 await page.evaluate(()=>{(window as any).historyHead=61;});await history.getByText('Fixture message 61 <b>plain text</b>',{exact:true}).waitFor();
 assert(await page.evaluate(()=>(window as any).retainedHistoryRow.isConnected),'Live feed retains existing rows instead of rebuilding them');
 await history.getByRole('button',{name:'Older',exact:true}).click();await history.getByText('Fixture message 11 <b>plain text</b>',{exact:true}).waitFor();
 await page.evaluate(()=>{(window as any).historyHead=62;});await history.getByRole('button',{name:'New activity · Latest',exact:true}).waitFor();assert.equal(await history.locator('li').count(),11);
 await history.getByRole('button',{name:'New activity · Latest',exact:true}).click();await history.getByText('Fixture message 62 <b>plain text</b>',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/world-history-desktop.png'});
 await page.setViewportSize({width:375,height:812});assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'/tmp/world-history-small.png'});
 await page.evaluate(()=>{(window as any).historyFail=true;});await history.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(await history.locator('li').count(),50);
 await page.evaluate(()=>{(window as any).historyFail=false;(window as any).historySample=true;});await history.getByRole('button',{name:'Retry',exact:true}).click();await history.getByText('History is available in your personal world.',{exact:true}).waitFor();assert.equal(await history.locator('li').count(),0);

 // Both current native bridges flatten with worldHistoryPage and convert event
 // time to seconds. Also retain coverage for the pre-#811 Mac envelope shape.
 const raw=[
  {seq:109,at:1720000109,kind:'activity.capture.gap',key:'browser',body:{version:1,id:'gap',observedAt:1720000200,data:{reason:'poll-gap',unobservedMs:9000}}},
  {seq:108,at:1720000108,kind:'task.interrupted',key:'agent',body:{version:1,id:'interrupted',observedAt:1720000200,data:{errorCode:'process_interrupted',status:'paused'}}},
  {seq:107,at:1720000107,kind:'applet.activity',key:'gmail',body:{operation:'_source_result'}},
  {seq:106,at:1720000106,kind:'activity.page.visibility',key:'browser',body:{version:1,id:'visible',observedAt:1720000200,data:{active:true,status:'complete'}}},
  {seq:105,at:1720000105,kind:'world.action',key:'gmail',body:{version:1,id:'requested',observedAt:1720000200,data:{action:'send',phase:'requested'}}},
  {seq:104,at:1720000104,kind:'world.action',key:'gmail',body:{version:1,id:'completed',observedAt:1720000200,data:{action:'send',phase:'succeeded'}}},
  {seq:103,at:1720000103,kind:'tool.failed',key:'agent',body:{version:1,id:'failed',observedAt:1720000200,data:{}}},
  {seq:102,at:1720000102,kind:'conversation.message',key:'main',body:{version:1,id:'chat',observedAt:1720000200,actor:'user',data:{preview:'Synthetic <b>text</b> Bearer fixture-private-secret',password:'fixture-private-secret'}}},
  {seq:101,at:1720000101,kind:'tool.result',key:'agent',body:{version:1,id:'partial',observedAt:1720000200,data:{truncated:true}}},
 ];
 const projected=worldHistoryPage({rows:raw,limit:50}).events.map(row=>({...row,at:Date.parse(String(row.at))/1000}));
 for(const [host,fixture] of [['legacy-mac',raw],['mac',projected],['windows',projected]] as const){
  await page.evaluate(rows=>{(window as any).historySample=false;(window as any).historyFixture=rows;sessionStorage.setItem('history-fixture',JSON.stringify(rows));},fixture);
  await page.reload();await waitForWorld(page);
  await openCompanionPanel(page);await panel.locator('[data-setting=help]').click();await panel.getByText('For the Worldlet team',{exact:true}).click();await history.getByText('Source: Browser',{exact:false}).first().waitFor();
  assert.equal(await history.locator('li').count(),9,host+' retained fixture after reload');
  assert.deepEqual(await history.locator('li').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.seq)),raw.map(row=>String(row.seq)));
  assert.equal(await history.getByText('Some activity may be missing. Outcome unknown.',{exact:true}).count(),2);
  assert.equal(await history.getByText('Legacy record · Identity or save-time metadata unavailable.',{exact:true}).count(),1);
  assert.equal(await history.locator('[data-seq="107"] p').first().textContent(),'Outcome unknown');
  assert.match(await history.locator('[data-seq="106"]').textContent(),/Does not establish reading or external success/);
  assert.match(await history.locator('[data-seq="105"]').textContent(),/Requested · Outcome unknown/);
  assert.match(await history.locator('[data-seq="104"]').textContent(),/Action completed · External outcome not verified/);
  assert.equal(await history.locator('[data-seq="103"] p').first().textContent(),'Failed');
  assert.match(await history.locator('[data-seq="101"]').textContent(),/Partial record/);
  assert.equal(await history.locator('[data-seq="109"] time').first().getAttribute('datetime'),new Date(1720000109*1000).toISOString());
  assert.equal(await history.locator('[data-seq="109"] time').nth(1).getAttribute('datetime'),new Date(1720000200*1000).toISOString());
  assert.equal(await history.locator('b').count(),0);assert(!(await history.textContent()).includes('fixture-private-secret'));
  assert(await history.getByRole('button',{name:'Older',exact:true}).isDisabled());
  assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:'/tmp/world-history-'+host+'-gaps.png'});
 }
 // An ISO event time is rendered accurately without turning missing times into epoch dates.
 await page.evaluate(()=>{(window as any).historyFixture=[{seq:1,at:'2026-09-01T12:00:00Z',kind:'applet.activity',body:{}},{seq:0,kind:'applet.activity',body:{}}];});
 await history.getByText('Event time unknown',{exact:true}).waitFor();
 assert.equal(await history.locator('[data-seq="1"] time').getAttribute('datetime'),'2026-09-01T12:00:00.000Z');
 await page.evaluate(()=>{(window as any).historyFixture=[];});await history.getByText('No activity recorded yet.',{exact:true}).waitFor();assert.equal(await history.locator('li').count(),0);
 await page.keyboard.press('Escape');const calls=await page.evaluate(()=>(window as any).historyCalls);await page.waitForTimeout(2300);assert.equal(await page.evaluate(()=>(window as any).historyCalls),calls,'Closed panel must not poll');
 assert.deepEqual(errors,[]);console.log('PASS history UI: live updates, cursor pages, both host shapes, reload, gap/legacy/outcomes, source/event/save times, empty, privacy, safe text, responsive, failure preserves rows, close stops polling.');
}finally{await browser.close();}
