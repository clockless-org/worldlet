import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{window.calls=[];(window as any).failFeedback=true;window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return {workspaceId:'feedback-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail']},sampleEnabled:false,cloudConsent:true};if(b.action==='modelStatus')return {available:true,provider:'hermes'};if(b.action==='feedback'){if((window as any).failFeedback)throw Error('Fixture offline');return {ok:true,id:b.id};}return {ok:true};}}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 await page.evaluate(()=>{const r=document.querySelector<HTMLElement>('#notionWorld')!;r.dataset.depth='object';r.dataset.page='app-gmail';});
 await page.locator('#notionInput').click();
 assert.equal(await page.locator('#companionInfo').evaluate(e=>(e as HTMLDetailsElement).open),false,'Clicking the message bar in an Applet does not open the panel');
 assert.equal(await page.locator('#notionInput').evaluate(e=>e===document.activeElement),true,'Clicking the message bar focuses the conversation');
 await page.evaluate(()=>{const r=document.querySelector<HTMLElement>('#notionWorld')!;r.dataset.depth='overview';r.dataset.page='';});
 await page.keyboard.press('Escape');
 // A button in the World's bottom-right corner with a small panel of its own (owner request 2026-10-10).
 const panel=page.locator('#worldFeedback'),corner=page.locator('.world-feedback-button');
 const viewport=page.viewportSize()!,c=(await corner.boundingBox())!;assert(c.x+c.width>viewport.width-40&&c.y+c.height>viewport.height-40,'Feedback sits in the bottom-right corner: '+JSON.stringify(c));
 assert.equal(await page.locator('#companionInfo [data-setting=feedback]').count(),0,'no Feedback section in Settings');
 const openFeedback=async()=>{if(!await panel.isVisible())await corner.click();await panel.waitFor();};await openFeedback();
 const draft=panel.getByLabel('Your feedback',{exact:true}),send=panel.getByRole('button',{name:'Send',exact:true}),mic=panel.getByRole('button',{name:'Hold to talk',exact:true});
 // Very simple (owner feedback 2026-10-03): the box to type in and the microphone are right there.
 assert.equal(await draft.isVisible(),true,'The box is ready to type in');assert.equal(await mic.isVisible(),true);assert.equal(await send.isDisabled(),true,'Nothing to send yet');
 assert.equal(await panel.locator('input[type=email]').count(),0);await draft.fill('The fixture world needs a softer sun.');
 await send.click();await panel.getByText(/Fixture offline/).waitFor();assert.equal(await draft.inputValue(),'The fixture world needs a softer sun.');
 await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false,'Escape closes it');await openFeedback();assert.equal(await draft.inputValue(),'The fixture world needs a softer sun.');
 await page.evaluate(()=>{(window as any).failFeedback=false;});await send.click();await panel.getByText(/Received by Worldlet/).waitFor();assert.equal(await draft.inputValue(),'');
 const calls=await page.evaluate(()=>window.calls.filter(c=>c.action==='feedback'));assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);assert.equal(calls[0].confirmed,true);
 const fox=page.locator('.companion-avatar');
 // Fox's paws show under the centered panel (its name tag hangs below them); hold Fox there.
 const hold=async()=>{const r=await fox.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-16);await page.mouse.down();await page.waitForFunction(()=>document.querySelector('#notionWorld').getAttribute('data-feedback-voice')==='listening');};
 await hold();await page.mouse.up();await page.waitForFunction(()=>window.calls.some(c=>c.action==='speechStop'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'final',text:'A dictated suggestion.'}})));
 assert.equal(await draft.inputValue(),'A dictated suggestion.');assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='feedback').length),2,'Voice only drafts; never sends automatically');
 assert.equal(await draft.isVisible(),true,'Spoken words land in the box to review');
 // The page's own microphone: hold to talk, release to stop; the words join the box.
 const m=(await mic.boundingBox())!;await page.mouse.move(m.x+m.width/2,m.y+m.height/2);await page.mouse.down();
 await page.waitForFunction(()=>document.querySelector('#notionWorld').getAttribute('data-feedback-voice')==='listening');
 const stops=await page.evaluate(()=>window.calls.filter(c=>c.action==='speechStop').length);await page.mouse.up();
 await page.waitForFunction(n=>window.calls.filter(c=>c.action==='speechStop').length>n,stops);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'final',text:'And more.'}})));
 assert.equal(await draft.inputValue(),'A dictated suggestion.\nAnd more.');assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='feedback').length),2,'The microphone never sends');
 assert.equal(await page.evaluate(()=>window.calls.some(c=>['agentChat','hermesChat','chat'].includes(c.action))),false,'Feedback never becomes a normal agent request');
 await hold();await page.keyboard.press('Escape');await page.mouse.up();assert(await page.evaluate(()=>window.calls.some(c=>c.action==='speechCancel')));
 await openFeedback();
 await page.mouse.click(40,300);assert.equal(await panel.isVisible(),false,'a click in the World closes it');
 await openFeedback();
 await page.screenshot({path:'/tmp/worldlet-feedback-desktop.png'});
 await page.setViewportSize({width:375,height:812});await openFeedback();
 const small=(await panel.boundingBox())!;assert(small.x>=0&&small.y>=0&&small.x+small.width<=375&&small.y+small.height<=812,'fits a phone: '+JSON.stringify(small));assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'/tmp/worldlet-feedback-small.png'});
 assert.deepEqual(errors,[]);console.log('PASS feedback UI: a corner button with its own panel, the box and microphone up front, Escape and outside click close it, retry/dedup, retained draft, receipt-only success, reviewed dictation, cancellation and small viewport.');
});
