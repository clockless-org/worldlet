// The Order / Feedback button (core/distribution/order.ts) on the real World page with a fake host: one round bug
// standing on its own just left of Fox's message bar on every channel (owner 2026-10-06, kept there 2026-10-07), with
// the microphone as its twin on the bar's right and a Send button that stands out inside the bar (owner 2026-10-07).
// Where the host says this copy may send (Alpha or Dev on an enrolled computer) it is Order: one click (or ⌘B / Ctrl+B)
// starts Fox's voice mode (button pressed and red) with nothing else on screen changing, not even when pointed at, the
// second click stops it and the button turns a spinner, and the final words go to the host's send with the place, then
// Fox says it was sent. A second page plays Beta: the same button is Feedback and opens Fox's Feedback page, never an
// Order. A third plays a failed instant post: Fox says plainly that it did not reach Claude right away, and why. A fourth
// leaves the window while it listens: what was heard is still sent, and an Order stopped otherwise says so. Space
// tapped on the World opens typing to Fox.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
const fixture=(tell:{wakeError?:string}&object)=>{const w=window as any;w.calls=[];w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
 if(b.action==='snapshot')return {workspaceId:'tell-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
 if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
 if(b.action==='order')return b.operation==='send'?{available:true,ready:true,sent:{id:'order:order.x.'+b.id,screenshots:2,logLines:9,woke:!tell.wakeError,...(tell.wakeError?{wakeError:tell.wakeError}:{})}}:tell;
 return {ok:true};
}}}};};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(fixture,{available:true,ready:true});
 await page.goto(worldUrl());await waitForWorld(page);
 const tell=page.locator('.companion-order-button'),bar=page.locator('#notionCommand'),root=page.locator('.notion-world');
 await tell.waitFor({state:'visible'});
 assert.equal(await page.locator('.companion-side .companion-order-button').count(),0,'no longer beside Fox');
 // On its own just left of the bar, outside it; the microphone mirrors it on the right (owner 2026-10-07).
 {const t=(await tell.boundingBox())!,b=(await bar.boundingBox())!,m=(await page.locator('.companion-speech-button').boundingBox())!;
  assert(t.x+t.width<=b.x&&b.x-(t.x+t.width)<16,'just left of the message bar, outside it');
  assert(m.x>=b.x+b.width&&m.x-(b.x+b.width)<16,'the microphone just right of the bar, outside it');
  assert.equal(await page.locator('#notionCommand .companion-speech-button').count(),0,'no microphone inside the bar');
  assert(Math.abs(m.width-t.width)<1&&Math.abs(m.y-t.y)<1,'the twin of the bug');
  assert(Math.abs((t.y+t.height)-(b.y+b.height))<2,'level with the bar');
  assert(Math.abs(t.width-t.height)<1&&await tell.evaluate(e=>getComputedStyle(e).borderRadius)==='50%','round');}
 assert.equal((await tell.innerText()).trim(),'','an icon only');assert.equal(await tell.getAttribute('aria-label'),'Order');assert.equal(await tell.locator('svg').count(),1,'the bug icon');
 // Pointing at it leaves the bar as it is: a widening bar would slide the button out from under the pointer (owner Order 2026-10-07).
 const entry=page.locator('.companion-text-entry'),card=page.locator('#worldConversation');
 const barWidth=async()=>(await bar.boundingBox())!.width,cardShown=()=>card.isVisible();
 const restWidth=await barWidth(),restCard=await cardShown(),restQuiet=await entry.getAttribute('data-quiet');
 await tell.hover();await page.waitForTimeout(400);
 assert.equal(await barWidth(),restWidth,'pointing at the button does not widen the bar');
 {const t=(await tell.boundingBox())!,b=(await bar.boundingBox())!;assert(t.x+t.width<=b.x,'the button stays where the pointer is');}
 await tell.click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='speechStart'&&c.purpose==='order'));
 await page.waitForTimeout(300);
 // Nothing else changes while it listens: the bar, its hint, Fox's card and Fox stay as they were.
 assert.equal(await barWidth(),restWidth,'the bar keeps its width while it listens');assert.equal(await entry.getAttribute('data-quiet'),restQuiet);
 assert.notEqual(await page.locator('#notionInput').getAttribute('placeholder'),'Listening…','the bar does not switch to voice mode');
 assert.equal(await cardShown(),restCard,'Fox’s card neither opens nor closes');
 assert.equal(await root.evaluate(e=>e.classList.contains('is-listening')),false,'Fox does not switch to listening');
 assert.equal(await root.getAttribute('data-order'),'listening','the visible sign while it listens');assert.equal(await tell.getAttribute('aria-pressed'),'true');
 assert.match(await tell.evaluate(e=>getComputedStyle(e).backgroundColor),/^rgba?\(194, 65, 46/,'the button turns red while it listens');
 await page.screenshot({path:'/tmp/order-listening.png'});
 await tell.click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='speechStop'));
 // Once it stops listening, the button alone turns a spinner until the Order is sent.
 assert.equal(await root.getAttribute('data-order'),'sending');assert.equal(await tell.getAttribute('aria-busy'),'true');
 assert.equal(await tell.evaluate(e=>getComputedStyle(e,'::after').animationName),'order-sending','a turning ring in place of the bug');
 assert.equal(await barWidth(),restWidth,'the bar still keeps its width');
 await page.evaluate(()=>(window as any).worldletSpeech({phase:'final',text:'把设置里的按钮改大一点'}));
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='order'&&c.operation==='send'));
 const sent=await page.evaluate(()=>(window as any).calls.find((c:any)=>c.action==='order'&&c.operation==='send'));
 assert.equal(sent.said,'把设置里的按钮改大一点');assert.match(sent.id,/^[a-f0-9]{8}$/);assert.equal(typeof sent.place,'string');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='agentChat').length),0,'the words go to Claude, not to Fox');
 await page.locator('#worldConversation',{hasText:'Order sent to Claude'}).waitFor();
 assert.equal(await root.getAttribute('data-order'),null,'the sign goes once sent');assert.equal(await tell.getAttribute('aria-busy'),null);
 await page.screenshot({path:'/tmp/order-sent.png'});
 assert.deepEqual(errors,[]);
 const beta=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});
 await beta.addInitScript(fixture,{available:false,reason:'Only the Alpha and Dev apps can send an Order.'});
 await beta.goto(worldUrl());await beta.locator('#worldStartup').waitFor({state:'detached'});
 await beta.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='order'));
 // Beta and Production: the same button is Feedback, and it opens Fox's Feedback page (owner 2026-10-07).
 const feedback=beta.locator('.companion-order-button');await feedback.waitFor({state:'visible'});
 assert.equal(await feedback.getAttribute('aria-label'),'Feedback');assert.equal(await feedback.getAttribute('data-mode'),'feedback');
 {const t=(await feedback.boundingBox())!,b=(await beta.locator('#notionCommand').boundingBox())!;assert(t.x+t.width<=b.x,'the same place, left of the bar');}
 await feedback.click();
 await beta.locator('.companion-feedback').waitFor({state:'visible'});
 assert.equal(await beta.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='speechStart'||c.action==='order'&&c.operation==='send')),false,'never an Order');
 await beta.screenshot({path:'/tmp/feedback-open.png'});
 await page.close();await beta.close();
 const failed=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),failedErrors=pageErrors(failed);
 await failed.addInitScript(fixture,{available:true,ready:true,wakeError:'Claude Code is not signed in'});
 await failed.goto(worldUrl());await failed.locator('#worldStartup').waitFor({state:'detached'});
 const button=failed.locator('.companion-order-button');await button.waitFor({state:'visible'});
 await button.click();await failed.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='speechStart'));
 await button.click();await failed.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='speechStop'));
 await failed.evaluate(()=>(window as any).worldletSpeech({phase:'final',text:'修一下登录'}));
 await failed.locator('#worldConversation',{hasText:'Order NOT sent to Claude right away (Claude Code is not signed in)'}).waitFor();
 assert.equal(await failed.locator('#worldConversation',{hasText:'Order sent to Claude'}).count(),0,'never reads as sent');
 assert.deepEqual(failedErrors,[]);
 // Leaving the window never drops an Order without a word (owner Order 2026-10-07: 「怎么发不了bug了」): while it listens
 // the microphone stops and what was heard is sent; while its words are recognised, leaving again changes nothing.
 const away=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),awayErrors=pageErrors(away);
 await away.addInitScript(fixture,{available:true,ready:true});
 await away.goto(worldUrl());await away.locator('#worldStartup').waitFor({state:'detached'});
 const bug=away.locator('.companion-order-button');await bug.waitFor({state:'visible'});
 await away.waitForFunction(()=>document.querySelector('.companion-order-button')?.getAttribute('data-mode')==='order');
 await bug.click();await away.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='speechStart'&&c.purpose==='order'));
 await away.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await away.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='speechStop'));
 assert.equal(await away.locator('.notion-world').getAttribute('data-order'),'sending','leaving while it listens sends what was heard');
 await away.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('worldlet:app-inactive'));});
 assert.equal(await away.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='speechCancel')),false,'never cancelled by leaving');
 await away.evaluate(()=>(window as any).worldletSpeech({phase:'final',text:'怎么发不了bug了'}));
 await away.locator('#worldConversation',{hasText:'Order sent to Claude'}).waitFor();
 // Stopped some other way, Fox says so: an Order never ends in silence.
 await bug.click();await away.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='speechStart').length===2);
 await away.keyboard.press('Escape');
 await away.locator('#worldConversation',{hasText:'The Order stopped before it was sent'}).waitFor();
 assert.deepEqual(await away.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='order'&&c.operation==='stopped').map((c:any)=>c.reason)),['cancelled'],'the host hears why, as one bucket');
 assert.deepEqual(awayErrors,[]);
});
console.log('PASS Order UI: a round bug left of Fox’s message bar on every channel, the microphone its twin on the right, Space opens typing, ⌘B/Ctrl+B presses the bug; where the host allows it an Order: pointing at it changes nothing, click starts listening with only the button showing it, second click stops and the button spins until sent, the words go to Claude with the place and Fox confirms, or says plainly the instant post failed and why; on Beta it opens Fox’s Feedback page instead.');
