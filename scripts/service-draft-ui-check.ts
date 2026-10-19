import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
// An Agent's PostHog or Notion draft on its Attention card (agent/gate/GRANTS.md#posthog-and-notion-drafts): the card
// names the Agent and where it writes, shows exactly what will be written (as plain text, not rendered) and a link to
// the target, and Approve and Dismiss go to the host's `serviceDraft` with only the draft's ID, never the ordinary item
// status. A stale target's refusal is said in the card's own words. Bundled UI, faked bridge, fictional drafts.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  const draft=(id:string,provider:string,write:string,where:string,title:string,text:string,url:string)=>({id:'svd-'+id,provider:'agents',kind:'task',title,reason:'Codex drafted a change',context:text,
   summary:'Codex wants to write this. Nothing is written until you approve it.',attentionReason:'Codex wants to write this. Nothing is written until you approve it.',
   attentionContentVersion:1,status:'open',statusOrigin:'agent',policyVersion:2,sources:[{provider:'agents',id,quote:title,url}],
   agentId:'codex',agentName:'Codex',serviceDraftId:id,serviceDraftStatus:'pending',serviceDraftProvider:provider,serviceDraftWrite:write,serviceDraftWhere:where,serviceDraftUrl:url,serviceDraftText:text});
  w.fixture={workspaceId:'service-draft',revision:0,sources:[],knowledge:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,connections:[],
   worldItems:[
    draft('eeee0001','posthog','flag.set','PostHog · new-checkout','Turn on the feature flag new-checkout','Turn on “new-checkout” (it is off now).','https://us.posthog.com/project/1/feature_flags/7'),
    draft('eeee0002','notion','page.append','Notion · Launch notes','Add to the Notion page Launch notes','Shipped **today**.\n<b>Retry</b> if it fails.','https://www.notion.so/example-page'),
    draft('eeee0003','notion','page.create','Notion · Roadmap','New Notion page in Roadmap','Q4\n\nPlans.','https://www.notion.so/example-db')]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='serviceDraft'){
    const item=w.fixture.worldItems.find((i:any)=>i.serviceDraftId===b.id);
    const result=b.operation==='dismiss'?{ok:true,status:'dismissed'}:b.id==='eeee0002'?{ok:true,status:'stale',reason:'It changed in Notion after this was drafted, so nothing was written. Ask the Agent to read it again and draft anew.'}
     :{ok:true,status:'written',url:'https://us.posthog.com/project/1/feature_flags/7'};
    item.status=result.status==='written'?'done':'dismissed';item.serviceDraftStatus=result.status;w.fixture.revision++;
    return result;
   }
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());
 const row=(id:string)=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview'),line=preview.locator('.attention-preview-review');
 const calls=()=>page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='serviceDraft'));
 await row('svd-eeee0001').waitFor();
 await waitForWorld(page);
 // A PostHog flag: names the Agent and the flag, links to it, Approve sends only the ID.
 await row('svd-eeee0001').click({timeout:30000});await preview.waitFor({state:'visible'});
 await line.waitFor({state:'visible'});
 assert.equal(await line.locator('.attention-preview-review-text').textContent(),'Codex drafted this for PostHog · new-checkout','the card names the Agent and where it writes');
 assert.equal(await line.locator('.attention-preview-review-quote').innerText(),'Turn on “new-checkout” (it is off now).');
 const link=line.locator('a.attention-preview-review-link');
 assert.deepEqual([await link.textContent(),await link.getAttribute('href')],['Open in PostHog','https://us.posthog.com/project/1/feature_flags/7']);
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Approve','Dismiss']);
 await preview.getByRole('button',{name:'Approve'}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='serviceDraft'));
 assert.deepEqual(await calls(),[{action:'serviceDraft',operation:'approve',id:'eeee0001'}],'only the draft\'s ID: never an Agent, a text, a key or a status');
 // A Notion append: exactly the text as plain text; stale on Approve, said plainly.
 await row('svd-eeee0002').click({timeout:30000});await line.waitFor({state:'visible'});
 assert.equal(await line.locator('.attention-preview-review-text').textContent(),'Codex drafted this for Notion · Launch notes');
 assert.equal(await line.locator('.attention-preview-review-quote').innerText(),'Shipped **today**.\n<b>Retry</b> if it fails.','exactly the text, not rendered');
 assert.equal(await line.locator('.attention-preview-review-quote b').count(),0,'no markup from the draft is drawn');
 assert.equal(await line.locator('a.attention-preview-review-link').textContent(),'Open in Notion');
 await preview.getByRole('button',{name:'Approve'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='serviceDraft').length===2);
 await page.waitForFunction(()=>document.body.innerText.includes('It changed in Notion after this was drafted'));
 // Dismiss a new Notion page.
 await row('svd-eeee0003').click({timeout:30000});await line.waitFor({state:'visible'});
 await preview.getByRole('button',{name:'Dismiss'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='serviceDraft').length===3);
 assert.deepEqual((await calls())[2],{action:'serviceDraft',operation:'dismiss',id:'eeee0003'});
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='worldItemStatus'||c.action==='githubDraft')),false);
 assert.deepEqual(errors,[]);
});
console.log('PASS PostHog and Notion drafts on their Attention cards: name the Agent and where they write, the exact text as plain text, a link to the target, Approve and Dismiss send only the draft ID, a stale refusal said plainly');
