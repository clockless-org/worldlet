import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {worldUrl,waitForWorld} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try {
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];w.delayStart=false;
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   w.calls.push(b.action);
   if(b.action==='snapshot')return {workspaceId:'speech-focus',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxChooseFiles')return {paths:['/Users/alex/Plan.pdf']};
   if(b.action==='speechStart'&&w.delayStart)await new Promise(resolve=>w.releaseStart=resolve);
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await waitForWorld(page);
 // The message bar rests low-key without its microphone (#1766); pointing at the bar brings it back.
 const bar=page.locator('#notionCommand'),button=page.locator('.companion-speech-button'),world=page.locator('#notionWorld');
 const mic={click:async()=>{await bar.hover();await button.click();}};
 await mic.click();await page.waitForFunction(()=>document.querySelector('#notionWorld')?.classList.contains('is-listening'));
 await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:app-inactive')));
 assert.equal(await world.evaluate(el=>el.classList.contains('is-listening')),false);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(a=>a==='speechCancel').length),1);
 // A delayed permission/start reply must not put the HUD back into recording.
 await page.evaluate(()=>(window as any).delayStart=true);await mic.click();
 await page.waitForFunction(()=>(window as any).releaseStart);
 await page.evaluate(()=>{window.dispatchEvent(new Event('worldlet:app-inactive'));(window as any).releaseStart();});
 assert.equal(await world.evaluate(el=>el.classList.contains('is-listening')||el.classList.contains('is-preparing-speech')),false);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(a=>a==='speechCancel').length),2);
 await page.evaluate(()=>(window as any).delayStart=false);await mic.click();
 await page.waitForFunction(()=>document.querySelector('#notionWorld')?.classList.contains('is-listening'));
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(a=>a==='speechCancel').length),3);
 assert.equal(await page.evaluate(()=>(window as any).calls.includes('speechStop')),false,'Losing focus cancels rather than submits speech');
 // While it listens the bar works like Claude's (owner request 2026-10-12): ✕ cancels, a dotted wave follows the voice,
 // Stop puts the words into the line unsent, and the microphone (now Send) sends.
 const cancelVoice=page.locator('.companion-voice-cancel'),stopVoice=page.locator('.companion-voice-stop'),input=page.locator('#notionInput');
 const count=(action:string)=>page.evaluate(a=>(window as any).calls.filter(c=>c===a).length,action);
 await mic.click();await page.waitForFunction(()=>document.querySelector('#notionWorld')?.classList.contains('is-listening'));
 assert(await cancelVoice.isVisible()&&await stopVoice.isVisible(),'✕ and Stop stand in the listening bar');
 for(const level of [0.1,0.5,0.9,0.3])await page.evaluate(l=>(window as any).worldletSpeech({phase:'level',text:String(l)}),level);
 assert.equal(await page.locator('.companion-input-wave i.is-heard').count(),4,'each moment of the voice is one dot of the wave');
 await page.screenshot({path:'/tmp/worldlet-voice-listening.png'});
 const cancels=await count('speechCancel');await cancelVoice.click();
 assert.equal(await count('speechCancel'),cancels+1,'✕ cancels the recording');assert.equal(await cancelVoice.isVisible(),false);
 await mic.click();await page.waitForFunction(()=>document.querySelector('#notionWorld')?.classList.contains('is-listening'));
 const stops=await count('speechStop');await stopVoice.click();
 await page.waitForFunction(n=>(window as any).calls.filter(c=>c==='speechStop').length>n,stops);
 await page.evaluate(()=>(window as any).worldletSpeech({phase:'final',text:'Plan my morning'}));
 await page.waitForFunction(()=>(document.querySelector('#notionInput') as HTMLTextAreaElement).value==='Plan my morning');
 assert(await input.evaluate(e=>e===document.activeElement),'Stop leaves the words in the line to edit');
 assert.equal(await count('agentChat'),0,'Stop does not send');
 // Once voice starts the bar keeps the length it had (owner Order 2026-10-12): holding the open bar to speak does not
 // shrink it, and the wave stands at that same length until the voice ends.
 await page.keyboard.press('Escape');await page.mouse.move(5,5);await page.waitForTimeout(400);
 await bar.hover();await page.waitForTimeout(400);
 const open=(await bar.boundingBox())!;
 await page.mouse.move(open.x+open.width/2,open.y+open.height/2);await page.mouse.down();
 await page.waitForFunction(()=>document.querySelector('#notionWorld')?.classList.contains('is-listening'));await page.waitForTimeout(400);
 {const w=(await page.locator('.companion-input-wave').boundingBox())!;assert(Math.abs(w.width-open.width)<1,'the wave keeps the open bar\'s length: '+JSON.stringify({w,open}));}
 const heard=await count('speechStop');await page.mouse.up();
 await page.waitForFunction(n=>(window as any).calls.filter(c=>c==='speechStop').length>n,heard);
 assert.equal(await page.locator('.companion-text-entry').evaluate(e=>getComputedStyle(e).getPropertyValue('--companion-bar-width').trim()),Math.round(open.width)+'px','the bar keeps its length while the words are understood');
 await page.evaluate(()=>(window as any).worldletSpeech({phase:'final',text:''}));
 // "+" at the open bar's far left adds the files the person picks to the line (owner request 2026-10-12).
 await page.keyboard.press('Escape');await page.mouse.move(5,5);await page.waitForTimeout(400);
 await bar.hover();await page.waitForTimeout(400);const plus=page.locator('.companion-plus-button');
 assert(await plus.isVisible(),'"+" shows while the bar is open');
 {const p=(await plus.boundingBox())!,b=(await bar.boundingBox())!;assert(p.x-b.x<=6,'"+" stands at the bar\'s far left');}
 await plus.click();await page.waitForFunction(()=>(document.querySelector('#notionInput') as HTMLTextAreaElement).value.includes('/Users/alex/Plan.pdf'));
 console.log('PASS speech deactivation/page teardown cancellation and delayed-start isolation; ✕, the dotted wave and Stop to edit; voice keeps the bar\'s length; "+" adds files; no microphone accessed.');
} finally {await browser.close();}
