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
 console.log('PASS speech deactivation/page teardown cancellation and delayed-start isolation; no microphone accessed.');
} finally {await browser.close();}
