import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
// An Agent's ask on its Attention card (agent/gate/GRANTS.md#agent-asks): the card names the Agent, its choices are
// pills with an optional note, and Done and Dismiss settle the ask itself through the host's `agentAsk` answer, never
// the ordinary item status. Bundled UI, faked bridge, fictional ask.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  const ask=(id:string,title:string,choices:string[])=>({id:'ask-'+id,provider:'agents',kind:choices.length?'task':'update',title,reason:'Codex asks you',context:'Which deploy window works?',summary:'Which deploy window works?',
   attentionReason:'Codex asks you to choose.',attentionContentVersion:1,status:'open',statusOrigin:'agent',policyVersion:2,sources:[{provider:'agents',id,quote:title}],
   agentId:'codex',agentName:'Codex',askId:id,askKind:'ask',askRevision:1,askStatus:'open',askChoices:choices});
  w.fixture={workspaceId:'agent-ask',revision:0,sources:[],knowledge:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,connections:[],
   worldItems:[ask('aaaa0001','Pick a deploy window',['Tonight','Tomorrow']),{...ask('aaaa0002','Release notes ready',[]),askAttachments:[{id:'att-1',name:'screen.png',type:'image/png',size:68},{id:'att-2',name:'app.log',type:'text/plain',size:2048}]},
    {...ask('aaaa0003','Ship the release comments?',['Approve','Not now']),askDraftIds:['dddd0001','dddd0002']}]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   // A 1x1 picture for the screenshot; only this computer's page reads it, by the ask's and the attachment's IDs.
   if(b.action==='agentAsk'&&b.operation==='attachment')return {id:b.attachment,name:'screen.png',type:'image/png',size:68,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'};
   if(b.action==='agentAsk'){const item=w.fixture.worldItems.find((i:any)=>i.askId===b.id);item.status=b.outcome==='skipped'?'dismissed':'done';item.askStatus=b.outcome;w.fixture.revision++;
    return {ok:true,status:b.outcome,...b.operation==='approveDrafts'?{drafts:[{id:'dddd0001',status:'written',resultUrl:'https://github.com/example/app/issues/1#issuecomment-1'},{id:'dddd0002',status:'stale',reason:'It changed on GitHub after this was drafted, so nothing was written.'}]}:{}};}
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());
 const row=(id:string)=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview'),line=preview.locator('.attention-preview-review');
 await row('ask-aaaa0001').waitFor();
 await waitForWorld(page);
 await row('ask-aaaa0001').click();await preview.waitFor({state:'visible'});
 await line.waitFor({state:'visible'});
 assert.equal(await line.locator('.attention-preview-review-text').textContent(),'Codex asks','the card names the Agent');
 assert.deepEqual(await line.locator('button').allTextContents(),['Tonight','Tomorrow'],'its own choices, as pills');
 assert.equal(await line.locator('button').first().evaluate(e=>getComputedStyle(e).borderRadius),'999px');
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Done','Dismiss']);
 await line.locator('input').fill('After 9 PM please.');
 await line.getByRole('button',{name:'Tomorrow'}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='agentAsk'&&c.operation!=='attachment'));
 const sent=await page.evaluate(()=>(window as any).calls.filter((c:any)=>['agentAsk','worldItemStatus'].includes(c.action)));
 assert.deepEqual(sent,[{action:'agentAsk',operation:'answer',id:'aaaa0001',outcome:'answered',choice:'Tomorrow',note:'After 9 PM please.'}],'the answer names the ask and the choice, never an Agent or a status');
 // An ask with no choices: Reply with a note, or Done and Dismiss.
 await row('ask-aaaa0002').click();await line.waitFor({state:'visible'});
 assert.deepEqual(await line.locator('button').allTextContents(),['Reply']);
 // An ask carrying a screenshot and a log: the picture as a thumbnail read from the host, the log by name and size.
 const attached=preview.locator('.attention-preview-attachments');
 await attached.waitFor({state:'visible'});
 assert.deepEqual(await attached.locator('.attention-preview-attachment-name').allTextContents(),['screen.png','app.log']);
 assert.deepEqual(await attached.locator('.attention-preview-attachment-size').allTextContents(),['1 KB','2 KB']);
 const thumb=attached.locator('img.attention-preview-attachment-image');
 await thumb.waitFor({state:'visible'});
 assert.equal(await thumb.count(),1,'only the picture is drawn');
 assert.match(await thumb.getAttribute('src')??'',/^data:image\/png;base64,/);
 assert.equal(await thumb.getAttribute('alt'),'screen.png');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='agentAsk'&&c.operation==='attachment')),[{action:'agentAsk',operation:'attachment',id:'aaaa0002',attachment:'att-1'}],'the log is never read');
 await preview.getByRole('button',{name:'Dismiss'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='agentAsk'&&c.operation!=='attachment').length===2);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='agentAsk'&&c.operation!=='attachment')[1]),{action:'agentAsk',operation:'answer',id:'aaaa0002',outcome:'skipped'});
 // An ask that carries GitHub drafts: the line says Approve writes them, and Approve is sent as approveDrafts, which only
 // this computer's pages may send; what became of each is said.
 await row('ask-aaaa0003').click();await line.waitFor({state:'visible'});
 assert.equal(await line.locator('.attention-preview-review-text').textContent(),'Codex asks · Approve writes its 2 GitHub drafts');
 await line.getByRole('button',{name:'Approve'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='agentAsk'&&c.operation!=='attachment').length===3);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='agentAsk'&&c.operation!=='attachment')[2]),{action:'agentAsk',operation:'approveDrafts',id:'aaaa0003',outcome:'answered',choice:'Approve'});
 await page.waitForFunction(()=>document.body.innerText.includes('1 written on GitHub; 1 not written.'));
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='worldItemStatus')),false);
 assert.deepEqual(errors,[]);
});
console.log('PASS Agent ask on its Attention card: names the Agent, choice pills with a note, Done and Dismiss answer the ask itself, Approve on an ask carrying GitHub drafts approves them, an ask\'s screenshot as a thumbnail and its files by name');
