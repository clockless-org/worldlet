import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';

await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  window.calls=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(body){
   window.calls.push(body);
   if(body.action==='snapshot')return {workspaceId:'reply-actions',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(body.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(body.action==='agentChat')return {message:'Playing now — Up First.\n\n[Turn it up](#fox-action=music.louder)\n\n[Next episode](#fox-action=music.next)\n<worldlet-replies>["Turn it up a bit"]</worldlet-replies>'};
   if(body.action==='backgroundMusic')return {state:'playing',channel:'music',track:'Up First',volume:.4};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 const input=page.locator('#notionInput'),bubble=page.locator('#companionDialogue');
 await page.locator('#notionInput').click();
 await input.fill('Play a podcast');await input.press('Enter');
 const actions=bubble.locator('.companion-action-footer a');
 await actions.first().waitFor();
 assert.deepEqual(await actions.allTextContents(),['Turn it up','Next episode']);
 assert.equal(await bubble.locator('.companion-suggestions').count(),0);
 assert.doesNotMatch(await bubble.innerText(),/Reply:|worldlet-replies/);
 const before=await bubble.locator('#worldConversation').innerText();
 for(const [index,operation] of ['louder','next'].entries()){
  await actions.nth(index).click();
  await page.waitForFunction(op=>window.calls.some(c=>c.action==='backgroundMusic'&&c.operation===op),operation);
  await page.waitForFunction(()=>!document.querySelector('.companion-action-footer [aria-busy=true]'));
  assert.equal(await input.inputValue(),'');
  assert.equal(await bubble.locator('#worldConversation').innerText(),before);
 }
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='agentChat').length),1,'actions do not send new chat turns');
 console.log('PASS Fox footer actions execute directly, preserve the reply and never draft or send a user message.');
});
