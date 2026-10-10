declare global { var Env:any; var saved:any; var mount:any; var env:any; }
import assert from 'node:assert/strict';
import {contextThread,cleanRecall} from '../ui/attention/context-recall.ts';
import {attentionFocus,attentionOrder} from '../core/attention/attention-focus.ts';
import {bundleScript,fileAccess,launchTestBrowser,pageErrors,worldUrl} from './browser-test.ts';
assert.notEqual(contextThread('mail','1'),contextThread('mail','2'));
assert.deepEqual(cleanRecall([{key:'mail',view:'1',text:'Hi',history:[{role:'system',text:'bad'},{role:'assistant',text:'okay'}]}])[0].history,[{role:'assistant',text:'okay'}]);
assert.equal(attentionFocus('auto',new Date(2026,8,21,10)),'work');
assert.equal(attentionFocus('auto',new Date(2026,8,20,10)),'personal');
const things=[{id:'personal',region:'home',level:2},{id:'work',region:'work',level:2},{id:'urgent',region:'home',level:5}];
assert.deepEqual(attentionOrder(things,{mode:'work',region:x=>x.region,importance:x=>x.level}).map(x=>x.id),['urgent','work','personal']);
assert.deepEqual(attentionOrder(things,{mode:'personal',region:x=>x.region,importance:x=>x.level}).map(x=>x.id),['urgent','personal','work']);
const browser=await launchTestBrowser(fileAccess);
try {
 const page=await browser.newPage(),errors=pageErrors(page);
 const envBundle=await bundleScript({entryPoints:['ui/world/world-environment.ts'],globalName:'Env'});
 await page.setContent('<main><div class="notion-top"></div></main>');
 await page.addScriptTag({content:envBundle});
 await page.evaluate(async()=>{
  window.saved={};window.mount=recording=>Env.mountWorldEnvironment({root:document.querySelector('main'),recording,onChange:()=>{},adapter:{load:async()=>saved,save:async x=>{saved=x},presets:true},dialog:null,close:null});
  window.env=mount(false);await new Promise(r=>setTimeout(r,10));
 });
 assert.equal(await page.locator('main').getAttribute('data-scene-weather'),'actual');
 assert.equal(await page.locator('main').getAttribute('data-scene-lighting'),'actual');
 await page.evaluate(async()=>{env.setSceneWeather('rain');await new Promise(r=>setTimeout(r,10));env.destroy();env=mount(true);await new Promise(r=>setTimeout(r,10));});
 assert.equal(await page.locator('main').getAttribute('data-scene-weather'),'clear','personal overrides cannot leak into recording');
 await page.evaluate(async()=>{env.setSceneWeather('snow');await new Promise(r=>setTimeout(r,10));env.destroy();env=mount(false);await new Promise(r=>setTimeout(r,10));});
 assert.equal(await page.locator('main').getAttribute('data-scene-weather'),'rain','personal override survives restart without a location');
 await page.evaluate(()=>env.destroy());
 // The real UI persists replies and bounded history through a native storage bridge.
 await page.addInitScript(()=>{
  window.calls=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'audit',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='conversationRecall'){if(b.rows)localStorage.setItem('audit-recall',JSON.stringify(b.rows));return JSON.parse(localStorage.getItem('audit-recall')||'[]');}
   if(b.action==='companionProfile')return {name:'Pip',attentionFocus:'work'};
   if(b.action==='agentChat')return {message:'We saved the decision to ship tomorrow.'};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 await page.evaluate(()=>location.hash='building=building-work');await page.waitForTimeout(500);
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Remember our decision');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>calls.some(c=>c.action==='conversationRecall'&&c.rows?.some(r=>r.text.includes('ship tomorrow')||r.entries?.some(e=>e.text.includes('ship tomorrow')))));
 assert.ok(await page.evaluate(()=>calls.some(c=>c.action==='speakReply'&&c.text?.includes('ship tomorrow'))));
 await page.reload();await page.locator('.companion-avatar').waitFor();await page.waitForTimeout(600);
 await page.locator('.companion-avatar').hover();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('ship tomorrow'));
 await page.locator('#notionInput').click();await page.locator('#notionInput').fill('Continue');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>calls.some(c=>c.action==='agentChat'));
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('audit-recall')).some(r=>r.history.some(h=>h.text==='Remember our decision'))),'correct thread history restored');
 await page.evaluate(()=>location.hash='');await page.waitForTimeout(400);await page.locator('.companion-avatar').hover();
 assert.doesNotMatch(await page.locator('#worldConversation').innerText(),/ship tomorrow/,'world cannot display a work reply');
 assert.deepEqual(errors,[]);
 console.log('PASS attention focus, urgent overrides, recording separation, persisted context restart and speech bridge');
}finally{await browser.close();}
