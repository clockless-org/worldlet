// Fox's first-value pick is a row the tour's box surrounds. In a short window the Center keeps what
// does not fit under Later; here the only task Fox can finish on a website is one of those, so Fox
// picks it anyway (not a shown task it could only draft for) and the tour turns to the Later page to box it.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:620},reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  const w=window as any;
  const src=(id)=>[{provider:'gmail',id,quote:'Fictional',url:'https://example.com/'+id}];
  const soon=(h)=>new Date(Date.now()+h*3600e3).toISOString();
  const items=[
   ...[1,2,3,4].map(i=>({id:'event-'+i,provider:'google-calendar',kind:'event',status:'open',title:'Fictional meeting '+i,summary:'A fictional meeting.',startsAt:soon(i),attentionContentVersion:1,sources:src('e'+i)})),
   ...['alpha','bravo','charlie','delta'].map((n,i)=>({id:'task-'+n,provider:'gmail',kind:'task',status:'open',title:'Fictional task '+n,reason:'Fictional reason',summary:'A fictional task to finish.',priority:i===3?'normal':'urgent',...i===3?{websiteURLs:['https://example.com/delta']}:{},attentionContentVersion:1,sources:src(n)})),
   {id:'update-echo',provider:'gmail',kind:'update',status:'open',title:'Fictional update',summary:'A fictional update.',attentionContentVersion:1,sources:src('echo')},
  ];
  w.fixture={workspaceId:'first-value-rows',revision:1,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:items,onboarding:{completed:true,journeyStage:'first-value',unlockedApplets:['app-gmail','app-browser']},sampleEnabled:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='onboarding'&&b.operation==='journey'){Object.assign(w.fixture.onboarding,{journeyStage:b.stage,journeyItemId:b.itemId});return {ok:true};}
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>/I picked/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:30000});
 await page.waitForTimeout(1500);
 const said=await page.locator('#companionDialogue').textContent();
 const picked=/I picked this one for you: Fictional task (\w+)/.exec(said||'')?.[1];
 assert.equal(picked,'delta','Fox picks the task it can finish on a website: '+said);
 assert.ok(await page.locator('.world-attention-later [data-zone="later"] .world-matter[data-world-item-id="task-delta"]').count(),'The window is short enough that the Center holds it under Later, and its Later page reveals it');
 const rows=await page.$$eval('.world-matter[data-world-item-id]',r=>r.filter(x=>x.getClientRects().length).map(x=>(x as HTMLElement).dataset.worldItemId));
 assert.ok(rows.includes('task-delta'),'The picked row is shown: '+rows.join(','));
 const ring=await page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)').boundingBox();
 assert.ok(ring,'The picked item is boxed in the Attention Center');
 const row=await page.locator('.world-matter[data-world-item-id="task-'+picked+'"]').boundingBox();
 assert.ok(row&&ring.x<=row.x&&ring.y<=row.y&&ring.x+ring.width>=row.x+row.width&&ring.y+ring.height>=row.y+row.height,'The box surrounds the picked row '+JSON.stringify({ring,row}));
 const vh=await page.evaluate(()=>innerHeight);
 assert.ok(row.y>=0&&row.y+row.height<=vh,'The picked row is on screen '+JSON.stringify(row));
});
