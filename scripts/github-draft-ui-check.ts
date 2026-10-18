import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
// An Agent's GitHub draft on its Attention card (core/agent/GRANTS.md#github-drafts): the card names the Agent and the
// repository, shows exactly the text that will be written (as plain text, not rendered) and a link to the target, and
// Approve and Dismiss go to the host's `githubDraft` with only the draft's ID, never the ordinary item status. A stale
// target's refusal is said in the card's own words. Bundled UI, faked bridge, fictional draft.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];w.opened=[];
  const text='Fixed on main in **#20**.\nPlease retry <b>now</b>.';
  const draft=(id:string,title:string)=>({id:'ghd-'+id,provider:'agents',kind:'task',title,reason:'Codex drafted a GitHub change',context:text,
   summary:'Codex wants to write this on GitHub. It ends with the line “Drafted by Codex in Worldlet”. Nothing is written until you approve it.',attentionReason:'Codex wants to write this on GitHub. It ends with the line “Drafted by Codex in Worldlet”. Nothing is written until you approve it.',
   attentionContentVersion:1,status:'open',statusOrigin:'agent',policyVersion:2,sources:[{provider:'agents',id,quote:'Build fails on Windows',url:'https://github.com/example/app/issues/12'}],
   agentId:'codex',agentName:'Codex',githubDraftId:id,githubDraftStatus:'pending',githubDraftRepo:'example/app',githubDraftWrite:'issue.comment',githubDraftUrl:'https://github.com/example/app/issues/12',githubDraftText:text});
  w.fixture={workspaceId:'github-draft',revision:0,sources:[],knowledge:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,connections:[],
   worldItems:[draft('dddd0001','Comment on example/app#12'),draft('dddd0002','Comment on example/app#13'),draft('dddd0003','Comment on example/app#14')]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='githubDraft'){
    const item=w.fixture.worldItems.find((i:any)=>i.githubDraftId===b.id);
    const result=b.operation==='dismiss'?{ok:true,status:'dismissed'}:b.id==='dddd0002'?{ok:true,status:'stale',reason:'It changed on GitHub after this was drafted, so nothing was written. Ask the Agent to read it again and draft anew.'}
     :{ok:true,status:'written',url:'https://github.com/example/app/issues/12#issuecomment-1'};
    item.status=result.status==='written'?'done':'dismissed';item.githubDraftStatus=result.status;w.fixture.revision++;
    return result;
   }
   if(b.action==='browserCommand'||b.action==='openExternal')w.opened.push(b);
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());
 const row=(id:string)=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview'),line=preview.locator('.attention-preview-review');
 await row('ghd-dddd0001').waitFor();
 await waitForWorld(page);
 await row('ghd-dddd0001').click();await preview.waitFor({state:'visible'});
 await line.waitFor({state:'visible'});
 assert.equal(await line.locator('.attention-preview-review-text').textContent(),'Codex drafted this for example/app','the card names the Agent and the repository');
 assert.equal(await line.locator('.attention-preview-review-quote').innerText(),'Fixed on main in **#20**.\nPlease retry <b>now</b>.','exactly the text, not rendered');
 assert.equal(await line.locator('.attention-preview-review-quote b').count(),0,'no markup from the draft is drawn');
 const link=line.locator('a.attention-preview-review-link');
 assert.deepEqual([await link.textContent(),await link.getAttribute('href')],['Open on GitHub','https://github.com/example/app/issues/12']);
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Approve','Dismiss']);
 await preview.getByRole('button',{name:'Approve'}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='githubDraft'));
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='githubDraft')),[{action:'githubDraft',operation:'approve',id:'dddd0001'}],'only the draft\'s ID: never an Agent, a text or a status');
 // A stale target: refused, said plainly, and the draft leaves the Center.
 await row('ghd-dddd0002').click();await line.waitFor({state:'visible'});
 await preview.getByRole('button',{name:'Approve'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='githubDraft').length===2);
 await page.waitForFunction(()=>document.body.innerText.includes('It changed on GitHub after this was drafted'));
 // Dismiss.
 await row('ghd-dddd0003').click();await line.waitFor({state:'visible'});
 await preview.getByRole('button',{name:'Dismiss'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='githubDraft').length===3);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='githubDraft')[2]),{action:'githubDraft',operation:'dismiss',id:'dddd0003'});
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='worldItemStatus')),false);
 assert.deepEqual(errors,[]);
});
console.log('PASS GitHub draft on its Attention card: names the Agent and repository, the exact text as plain text, a link to the target, Approve and Dismiss send only the draft ID, a stale refusal said plainly');
