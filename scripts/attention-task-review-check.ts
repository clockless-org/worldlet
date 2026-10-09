import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
// Changed task evidence a background pass found waits on the task's Attention card as one line of text-link
// choices, never over Fox's dialog (owner Order 2026-10-07). Bundled UI, faked bridge, fictional mail.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  localStorage.setItem('worldlet-attention-focus',JSON.stringify({ids:['Verify identity','Pay invoice'],held:[],reviewedAt:Date.now()}));
  const item=(id:string)=>({id,kind:'task',provider:'gmail',title:id,reason:'Evidence for '+id,attentionContentVersion:1,context:'Evidence for '+id,summary:'- Upload a photo ID.',status:'open',policyVersion:2,sources:[{provider:'gmail',id:id+'s',quote:'Actual evidence'}]});
  w.fixture={workspaceId:'attention-task-review',revision:0,sources:[],knowledge:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,
   connections:[{id:'gmail',provider:'gmail',connected:true,syncStatus:'connected'}],worldItems:[item('Verify identity'),item('Pay invoice')],
   taskReviews:[{id:'review-1',provider:'gmail',items:['Verify identity']}]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='taskReviewAction'){w.fixture.taskReviews=[];w.fixture.revision++;return {ok:true,ids:['Verify identity'],status:'open'};}
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());
 const row=(id:string)=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview'),line=preview.locator('.attention-preview-review');
 await row('Verify identity').waitFor();
 await waitForWorld(page);
 await row('Pay invoice').click();await preview.waitFor({state:'visible'});
 assert.equal(await line.isVisible(),false,'another task’s card has no review line');
 await row('Verify identity').click();
 await line.waitFor({state:'visible'});
 assert.equal(await line.locator('.attention-preview-review-text').textContent(),'Mail has something new about this task.');
 assert.deepEqual(await line.locator('button').allTextContents(),['Update this task','Add as a new task','Ignore']);
 assert.equal(await line.locator('button').first().evaluate(e=>getComputedStyle(e).textDecorationLine),'underline','text links, like Fox’s choices');
 assert.ok(!(await page.locator('#companionDialogue').innerText().catch(()=>'')).includes('something new'),'Fox’s dialog stays clear');
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Done','Dismiss','Later'],'the card’s own outcomes are unchanged');
 await line.getByRole('button',{name:'Update this task'}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='taskReviewAction'));
 assert.deepEqual(await page.evaluate(()=>{const c=(window as any).calls.find((c:any)=>c.action==='taskReviewAction');return [c.id,c.choice,c.candidateId];}),['review-1','same','Verify identity']);
 await line.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
});
console.log('PASS task review on its Attention card: one quiet line, text-link choices naming this task, Fox’s dialog untouched');
