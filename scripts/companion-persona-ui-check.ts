import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
import {companionPersona} from '../core/companion/index.ts';

await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  (window as any).persona='';
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return {workspaceId:'persona-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='companionProfile')return {name:'Nova',createdAt:'2026-09-01T12:00:00Z',personality:(window as any).persona};
   if(b.action==='modelStatus')return {available:true,provider:'hermes'};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await waitForWorld(page);
 for(const personality of ['', 'Formal, precise, and calm.', '']){
  await page.evaluate(value=>{(window as any).persona=value;},personality);
  await openCompanionPanel(page);
  const panel=page.locator('#companionInfo');
  await panel.getByText(companionPersona(personality).summary,{exact:true}).waitFor();
  assert.equal(await panel.locator('.companion-info-profile h2').textContent(),'Nova');
  assert.equal(await panel.locator('.companion-profile-facts dd').first().textContent(),'Sep 1, 2026');
  if(!personality)await page.screenshot({path:'/tmp/worldlet-default-persona.png'});
  await page.keyboard.press('Escape');
 }
 console.log('PASS persona UI: inherited default, custom override and reset; name/date unchanged');
});
