// Synthetic bridge and durable fixture only: no mailbox, model or account calls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1372,height:720},reducedMotion:'reduce'});
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;
  const items=Array.from({length:14},(_,i)=>({id:'task-'+i,provider:'gmail',kind:'task',status:'open',priority:'high',title:'Follow up item '+i,reason:'Needs a reply this week',summary:'A fictional follow-up.',attentionContentVersion:1,sources:[{provider:'gmail',id:'source-'+i,quote:'Synthetic obligation '+i}]}));
  // Exact duplicate of the lead: one row must settle both durable members.
  items.push({...items[0],id:'task-0-copy'});
  w.fixture=JSON.parse(localStorage.getItem('fixture-692')||'null')||{workspaceId:'no-refill',revision:1,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:items,onboarding:{completed:true,journeyStage:'finish',unlockedApplets:['app-gmail']},sampleEnabled:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='worldItemStatus'){
    const item=w.fixture.worldItems.find(i=>i.id===b.id);item.status=b.status;item.snoozedUntil=b.snoozedUntil;
    localStorage.setItem('fixture-692',JSON.stringify(w.fixture));return {ok:true};
   }
   return {ok:true};
  }}}};
 });
 const url=worldUrl();
 const rows=()=>page.locator('.world-task-list .world-matter[data-world-item-id]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-world-item-id')));
 const row=(id:string)=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview');
 await page.goto(url);
 await page.locator('#worldStartup').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor();
 const initial=await rows();assert.ok(initial.length>2&&initial.length<14,'Fixture must have visible members and trimmed pressing backlog');
 // Dismiss only closes the card: nothing leaves the Center (owner decision).
 await row(initial[0]).click();await preview.getByRole('button',{name:'Dismiss',exact:true}).click();
 await preview.waitFor({state:'hidden'});
 assert.deepEqual(await rows(),initial,'Dismiss keeps every row in place');
 const groupedLead=initial.find(id=>id==='task-0'||id==='task-0-copy');assert.ok(groupedLead,'Grouped lead is visible');
 for(const [id,action] of [[groupedLead,'Done'],[initial.find(id=>id!==groupedLead)!,'Done']]){
  const before=await rows();await row(id).click();
  await preview.getByRole('button',{name:action,exact:true}).click();
  await row(id).waitFor({state:'detached'});
  // Force repeated source projections and elapsed review time; neither can refill.
  await page.evaluate(()=>{const w=window as any;for(let n=0;n<3;n++){w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));}const saved=JSON.parse(localStorage.getItem('worldlet-attention-focus')!);saved.reviewedAt-=86400000;localStorage.setItem('worldlet-attention-focus',JSON.stringify(saved));window.dispatchEvent(new Event('resize'));});
  await page.waitForTimeout(150);
  assert.deepEqual(await rows(),before.filter(other=>other!==id),'Count falls by one; surviving rows retain their order without a replacement');
 }
 assert.deepEqual(await page.evaluate(()=>(window as any).fixture.worldItems.filter(i=>i.id==='task-0'||i.id==='task-0-copy').map(i=>i.status)),['done','done'],'Every clustered member is durably settled');
 const settled=await rows();
 await page.reload();await page.locator('#worldStartup').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor();
 assert.deepEqual(await rows(),settled,'Restart preserves the reduced focus set and settled duplicate');
 await page.evaluate(()=>{const w=window as any;w.fixture.worldItems.push({...w.fixture.worldItems[0],id:'re-extracted-old',status:'open'});w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 assert.deepEqual(await rows(),settled,'Background re-extraction of settled old evidence cannot resurrect a card');
 await page.evaluate(()=>{const w=window as any;w.fixture.worldItems.push({...w.fixture.worldItems[1],id:'new-urgent',title:'New urgent evidence',priority:'urgent',status:'open',sources:[{provider:'gmail',id:'new-source',quote:'New synthetic urgent obligation'}]});w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await row('new-urgent').waitFor();assert.equal((await rows()).length,settled.length+1,'New material urgent evidence can enter');
 await row('new-urgent').click();await preview.getByRole('button',{name:'Later',exact:true}).click();
 await row('new-urgent').waitFor({state:'detached'});
 assert.ok(await page.evaluate(()=>Date.parse((window as any).fixture.worldItems.find(i=>i.id==='new-urgent').snoozedUntil)>Date.now()),'One-click Later saves a future deadline');
 assert.deepEqual(await rows(),settled,'Later hides only the snoozed item and does not refill');
 await page.evaluate(()=>{const w=window as any;w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 assert.equal(await row('new-urgent').count(),0,'Refresh does not end a valid snooze');
 await page.evaluate(()=>{const w=window as any;w.fixture.worldItems.find(i=>i.id==='new-urgent').snoozedUntil=new Date(Date.now()-1000).toISOString();w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await row('new-urgent').waitFor();
 assert.equal((await rows()).length,settled.length+1,'Expired Later returns only its reserved member');
 await page.getByRole('button',{name:'Go to Later',exact:true}).click();
 await page.getByRole('button',{name:'Back to Now',exact:true}).waitFor();
 assert.ok((await page.locator('.world-matter-later').count())>0,'the Later page lists the unchanged backlog');
 assert.deepEqual(errors,[]);
 console.log('PASS synthetic Attention: Done, Dismiss keeps the row, grouped settlement, stable survivor order, refresh/restart, new urgent evidence, Later and the Later page');
}finally{await browser.close();}
