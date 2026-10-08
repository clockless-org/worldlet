import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {tmpdir} from 'node:os';
import {localPathName} from '../core/context/local-path.ts';
import path from 'node:path';
assert.equal(localPathName('C:\\Projects\\worldlet'), 'worldlet');
assert.equal(localPathName('/Users/fixture/worldlet/'), 'worldlet');
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.calls=[];window.fixture={workspaceId:'work-applets',revision:0,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  const sessions=provider=>Array.from({length:6},(_,i)=>({id:provider+':'+i,sessionId:'00000000-0000-4000-8000-00000000000'+i,provider,title:['Refine the village','Review navigation','Repair the calendar','Improve the mail tray','Write release notes','Polish the dock'][i],cwd:'C:\\sample\\worldlet',status:i===0?'Running':'Saved'}));
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {cloudConsent:true,model:{ready:true,provider:'custom',name:'Test'}};
   if(b.action==='codexSession'&&b.operation==='usage')return {rateLimits:{secondary:{windowDurationMins:10080,usedPercent:25,resetsAt:Date.now()/1000+3600}}};
   if(b.action==='codexSession'&&b.operation==='send'){
    window.worldletCodexEvent({method:'turn/started',params:{threadId:b.threadId,turn:{id:'live-turn'}}});
    if(b.text!=='Wait for stop')window.worldletCodexEvent({method:'worldlet/request',params:{threadId:b.threadId,requestId:'approval',kind:'item/fileChange/requestApproval',details:{reason:'Fixture edit needs approval',itemId:'edit-one'}}});
    return {turn:{id:'live-turn'}};
   }
   if(b.action==='codexSession'&&b.operation==='respond'){
    if(b.serverRequestId!=='approval'||b.decision!=='accept')throw Error('Unexpected fixture approval');
    window.worldletCodexEvent({method:'item/agentMessage/delta',params:{threadId:b.threadId,delta:'Codex fixture completed.'}});
    window.worldletCodexEvent({method:'turn/completed',params:{threadId:b.threadId,turn:{id:'live-turn',status:'completed'}}});return {ok:true};
   }
   if(b.action==='codexSession'&&b.operation==='interrupt'){
    window.worldletCodexEvent({method:'turn/completed',params:{threadId:b.threadId,turn:{id:'live-turn',status:'interrupted'}}});return {ok:true};
   }
   if(b.action==='codexSession')return b.operation==='list'?{providers:[{provider:'codex',state:'ready',sessions:sessions('codex')}]}:{session:sessions('codex').find(s=>s.sessionId===b.threadId),turns:[{id:'turn-1',items:[{type:'userMessage',content:[{type:'text',text:'Please improve the village.'}]},{type:'agentMessage',text:'The Codex conversation is visible.'}]}]};
   if(b.action==='developmentSessions'){
    if(b.provider==='github')return b.operation==='read'?{repository:{name:b.id,description:'A personal world',branch:'main'},pullRequests:[{number:12,title:'Improve the village',author:'Sample'}],issues:[]}:{repositories:[{id:'sample/worldlet',title:'worldlet',description:'A personal world',status:'Private'},{id:'sample/notes',title:'notes',status:'Public'}]};
    return b.operation==='read'?{messages:[{role:'user',text:'Please review the scene.'},{role:'assistant',text:'The Claude conversation is visible.'}],scope:'Saved conversation.'}:{providers:[{provider:'claude',state:'ready',sessions:sessions('claude')}]};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length>0);
 for(const key of ['github','codex','claude-code']){
  await page.evaluate(key=>location.hash='object=app-'+key,key);
  await page.locator('.pixi-applet-stage[data-work=true]').waitFor();
  // Every session shows at once; more than the four folios scroll inside the item area instead of paging.
  await page.waitForFunction(count=>document.querySelectorAll('.pixi-stage-item').length===count,key==='github'?2:6);
  assert.equal(await page.locator('#notionContent').isVisible(),false);
  await page.screenshot({path:path.join(tmpdir(),'worldlet-'+key+'-open.png')});
  assert.equal(await page.locator('.pixi-open-pagination').count(),0,'no page arrows');
  if(key!=='github')assert.deepEqual(await page.locator('.pixi-open-contents').evaluate(e=>({scroll:e.dataset.scroll,overflowY:getComputedStyle(e).overflowY,scrolls:e.scrollHeight>e.clientHeight})),{scroll:'true',overflowY:'auto',scrolls:true},'more sessions than folios scroll in place');
  await page.locator('.pixi-stage-item').first().click();
  await page.getByText(key==='github'?'#12 · Improve the village':key==='codex'?'The Codex conversation is visible.':'The Claude conversation is visible.',{exact:true}).waitFor();
  await page.locator('.pixi-selected-item').waitFor();
  const card=await page.locator('.pixi-selected-item').boundingBox(),nextArrow=await page.getByRole('button',{name:'Next item',exact:true}).boundingBox();
  assert.ok(nextArrow.x>=card.x+card.width,'next arrow lives outside the item');
  if(key!=='github'){await page.emulateMedia({reducedMotion:'no-preference'});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(key=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(m=>m.id==='app-'+key)?.presentation.rigMotion===0,key);}
  await page.getByRole('button',{name:'Next item',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.pixi-selected-item strong')?.textContent==='Review navigation'||document.querySelector('.pixi-selected-item strong')?.textContent==='notes');
  await page.getByRole('button',{name:'Previous item',exact:true}).click();
  // The Applet's immersive background paints its device, so the Pixi device is not duplicated.
  await page.waitForFunction(key=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.focusRoom?.key===key&&m.focusRoom.framing==='scene-fit'&&m.presentation.deviceVisible===false;},key);
  if(key==='codex')await page.waitForFunction(()=>document.querySelector('.applet-weekly-battery[data-applet=codex]')?.getAttribute('aria-valuenow')==='75');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-'+key+'-focus.png')});
  await page.locator('#notionBack').click();await page.locator('.pixi-applet-stage').waitFor();
 }
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),0,'Work Applets never silently redirect to websites');
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.operation==='send').length),0,'reading never starts coding');
 await page.evaluate(()=>location.hash='object=app-codex');
 await page.locator('.pixi-stage-item').first().click();
 await page.getByText('The Codex conversation is visible.',{exact:true}).waitFor();
 await page.evaluate(()=>window.worldletShowControls('preferences'));
 await page.locator('#notionInput').fill('Continue this task');await page.locator('#notionInput').press('Enter');
 await page.getByRole('button',{name:'Allow once',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Codex fixture completed.'));
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='agentChat').length),0,'selected Codex session never sends to Hermes');
 await page.evaluate(()=>window.worldletShowControls('preferences'));
 await page.locator('#notionInput').fill('Wait for stop');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>calls.some(c=>c.action==='codexSession'&&c.operation==='send'&&c.text==='Wait for stop'));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>calls.some(c=>c.action==='codexSession'&&c.operation==='interrupt'));
 assert.deepEqual(errors,[]);
 console.log('PASS work Applets: Windows project labels, inventories/history, in-place scrolling, activity, Codex explicit send/approval, streamed completion and Escape interruption.');
});
