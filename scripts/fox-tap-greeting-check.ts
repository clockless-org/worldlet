import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,openCompanionPanel} from './browser-test.ts';
import {mkdir} from 'node:fs/promises';
await mkdir('output/fox-mac',{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  window.calls=[];window.privateConsent=true;window.delaySpeech=false;
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='restartFox'){sessionStorage.setItem('fox-restarted','yes');return {ok:true};}
   if(b.action==='resetFox'){sessionStorage.setItem('fox-reset','cancelled');return {cancelled:true};}
   if(b.action==='showDebug')return {ok:true};
   if(b.action==='snapshot')return {workspaceId:'mac-controls',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:privateConsent};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:privateConsent};
   if(b.action==='modelCatalog')return {providers:[{id:'openai-codex',name:'Codex',provider:'openai-codex',nativeSetup:true,auth:'device_code'},{id:'qwen-cloud',name:'Qwen Cloud',provider:'qwen-cloud',nativeSetup:true,auth:'api_key'}]};
   if(b.action==='foxPreferences'){if(typeof b.cloudConsent==='boolean')privateConsent=b.cloudConsent;return {model:{name:'DeepSeek V4 Flash',ready:true},cloudConsent:privateConsent,autoSync:true};}
   if(b.action==='agentChat'&&b.text?.includes('The user tapped Fox')){
    window.worldletAgentEvent(b.id,{type:'delta',text:'A model greeting for this view.'});
    return {message:'A model greeting for this view.'};
   }
   if(b.action==='agentChat'&&b.text==='Interrupted fixture'){window.worldletAgentEvent(b.id,{type:'delta',text:'Your note is saved.\n'});window.worldletAgentEvent(b.id,{type:'delta',text:'[response inter'});await new Promise(r=>setTimeout(r,80));window.worldletAgentEvent(b.id,{type:'delta',text:'rupted]'});return {message:'[response interrupted]'};}
   if(b.action==='agentChat'&&b.text==='Empty interrupted fixture')return {message:'[response interrupted]'};
   if(b.action==='agentChat'){window.lastContext=b.context;if(b.text==='Latency check'){window.worldletAgentEvent(b.id,{type:'status',stage:'waiting'});await new Promise(resolve=>window.finishLatency=resolve);}if(b.text==='Make the text larger')await window.worldletAgentTool(b.id,{id:'preference-call',name:'set_worldlet_preference',args:{setting:'text_size',value:1.25}});if(b.text==='Speak briefly')await window.worldletAgentTool(b.id,{id:'style-call',name:'set_worldlet_preference',args:{setting:'companion_style',value:'briefly, warmly'}});return {message:'Hello from Fox.'};}
   if(b.action==='speechStart'&&delaySpeech)await new Promise(resolve=>window.resolveSpeech=resolve);
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   if(b.action==='weatherLoad')return {place:{name:'Test city',latitude:37.77,longitude:-122.42,timezone:'America/Los_Angeles'},weather:{code:0,temperature:21,cloud:0,wind:8,fetchedAt:Date.now(),observedAt:Date.now(),timezone:'America/Los_Angeles'}};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 const fox=page.locator('.companion-avatar');await fox.waitFor();
 await page.waitForTimeout(600);
 const count=()=>page.evaluate(()=>calls.filter(b=>b.action==='agentChat'&&b.text?.includes('The user tapped Fox')).length);
 assert.equal(await count(),0,'Opening world does not ask for a greeting');
 await openCompanionPanel(page);await page.locator('.companion-info-panel[open]').waitFor();
 await page.getByRole('button',{name:'Close companion panel'}).click();
 assert.equal(await count(),0,'Opening the companion panel does not request a model greeting');
 await page.locator('#notionInput').click();assert(await page.evaluate(()=>document.activeElement?.id==='notionInput'),'Clicking the bar always opens typing');
 assert.equal(await page.locator('.companion-info-panel[open]').count(),0);
 // With no conversation yet, Fox says what it can do here. It is a local line, not a turn.
 assert.ok(await page.locator('#companionDialogue').isVisible(),'Typing always shows the Fox bubble');
 assert.match(await page.locator('#worldConversation').textContent(),/This is your world/,'a new conversation says what Fox can do');
 assert.equal(await page.locator('.companion-asked').isVisible(),false,'a greeting is not a turn');
 assert.equal(await page.locator('.companion-topic').isVisible(),false,'the card points at Fox and carries no name tag (owner Order 2026-10-08)');
 assert.equal(await count(),0,'Opening typing does not spend a model call on a greeting');
 await page.mouse.move(1200,700);
 await fox.hover();await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('This is your world'));
 await page.mouse.move(1200,700);
 await page.evaluate(()=>location.hash='building=building-work');
 await page.waitForTimeout(500);await fox.hover();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('This is Work'));
 assert.equal(await count(),0,'Context greetings never request a model');
 assert.equal(await page.evaluate(()=>calls.filter(b=>b.action==='agentChat').length),0);
 if(await page.locator('#notionInput').isVisible())await page.locator('#notionInput').focus();
 else await page.locator('#notionInput').click();
 // A real subject, so the answered greeting stays its own card (turns stack by topic, #2171).
 await page.locator('#notionInput').fill('Plan a weekend trip to Tokyo');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Hello from Fox.'));
 await fox.hover();await page.waitForTimeout(450);
 assert.match(await page.locator('#worldConversation').textContent(),/Hello from Fox/,'hover preserves an ongoing conversation');
 await page.mouse.move(1200,700);
 await page.evaluate(()=>location.hash='');
 await page.waitForTimeout(400);
 await fox.hover();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('This is your world'));
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Hello from Fox/,'hover never recalls another region’s reply');
 // Context navigation can retain an already-open composer; do not require
 // clicking its deliberately hidden collapsed handle in that state.
 if(await page.locator('#notionInput').isVisible())await page.locator('#notionInput').focus();
 else await page.locator('#notionInput').click();
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Hello from Fox/,'typing never recalls another region’s reply');
 assert.equal(await page.locator('.companion-recall-label').isVisible(),false);
 assert.equal(await page.locator('.companion-reply-nav').isVisible(),false,'conversation cards have no page arrows');
 await page.mouse.move(1200,700);
 await page.evaluate(()=>location.hash='building=building-work');
 await page.waitForTimeout(400);
 await fox.hover();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Hello from Fox.'));
 assert.equal(await page.evaluate(()=>calls.filter(b=>b.action==='agentChat').length),1,'hover restores local context without a model request');
 assert.equal(await page.getByText('Previous reply · World',{exact:true}).count(),0);
 // Expanded, the conversation is one chat window (owner Order 2026-10-12): every turn a pair of bubbles, oldest first.
 if(await page.locator('#notionInput').isVisible())await page.locator('#notionInput').focus();
 else await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Again');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>calls.filter(b=>b.action==='agentChat').length===2&&document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true');
 await page.locator('.companion-earlier',{hasText:'Expand'}).click();
 const bubbles=page.locator('.fox-chat-window .fox-chat-card');
 assert.match(await bubbles.first().textContent(),/This is Work/,'the answered greeting leads the window');
 assert.equal(await page.locator('.fox-chat-asked',{hasText:'Again'}).count(),1,'the person\'s words head their turn\'s card');
 const [win,foxBox]=[await page.locator('.fox-chat-window').boundingBox(),await page.locator('.companion-avatar').boundingBox()];
 assert.ok(win&&foxBox&&win.y+win.height<=foxBox.y+8,'the window stands above Fox: '+JSON.stringify({win,foxBox}));
 assert.equal(await page.locator('.companion-thread-list').isVisible(),false,'no stacked cards beside the window');
 assert.deepEqual(await bubbles.evaluateAll(b=>[...new Set(b.map(e=>getComputedStyle(e.querySelector('.fox-chat-body')!).fontSize))]),['15px'],'one type size for every message');
 await page.screenshot({path:'output/fox-mac/cards-expanded.png'});
 assert.deepEqual(errors,[]);console.log('PASS local place lines without model calls; hover and click show the same card; conversation preserved per place');
});
