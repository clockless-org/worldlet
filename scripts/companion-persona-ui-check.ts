import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
import {companionPersona} from '../agent/fox/index.ts';

await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  (window as any).persona='';(window as any).renamed=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return {workspaceId:'persona-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='companionProfile')return {name:'Nova',createdAt:'2026-09-01T12:00:00Z',personality:(window as any).persona};
   if(b.action==='foxPreferenceChange'){(window as any).renamed.push(b.payload??b);return {ok:true};}
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
 // Rename in Settings › Fox: click the name, type, Enter. It saves like telling Fox; the host then announces the name,
 // and the message bar follows it.
 await openCompanionPanel(page);
 const panel=page.locator('#companionInfo');
 await panel.locator('.companion-name-text').click();
 const field=panel.locator('.companion-name-edit input');
 await field.fill('Pip');await field.press('Enter');
 await panel.locator('.companion-name-text',{hasText:'Pip'}).waitFor();
 const sent=JSON.stringify(await page.evaluate(()=>(window as any).renamed));
 assert(sent.includes('"companion_name"')&&sent.includes('"Pip"'),'rename saves the companion name: '+sent);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-appearance',{detail:{name:'Pip'}})));
 await page.waitForFunction(()=>(document.querySelector('.companion-text-entry input,.companion-text-entry textarea') as HTMLInputElement|null)?.placeholder==='Message Pip');
 // Escape while renaming cancels the edit and keeps the panel open.
 await panel.locator('.companion-name-rename').click();
 await field.press('Escape');
 assert(await panel.isVisible(),'Escape in the name field keeps Settings open');
 assert.equal(await panel.locator('.companion-name-edit').count(),0);
 console.log('PASS persona UI: inherited default, custom override and reset; name/date unchanged; rename from Settings › Fox');
});
