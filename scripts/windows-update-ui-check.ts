declare global {var updateClicks:number;}
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.updateClicks=0;window.webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {workspaceId:'update-fixture',platform:'windows',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,appUpdate:{state:'current',label:'Up to date',visible:false,enabled:false,detail:'Fixture'}};if(b.action==='appUpdate'){window.updateClicks++;return {state:'installing',label:'Updating…',visible:true,enabled:false};}if(b.action==='modelStatus')return {available:true};return {ok:true};}}}};});
 await page.goto(worldUrl());
 const update=page.locator('.world-footer-update:not(.dev-build-update)');
 // Downloading and verifying happen in the background: no button until the update is ready.
 await page.waitForFunction(()=>typeof window.worldletAppUpdate==='function');
 assert.equal(await update.isVisible(),false);
 await page.evaluate(()=>window.worldletAppUpdate({state:'ready',label:'Update',visible:true,enabled:true,detail:'Verified installer'}));
 await update.waitFor({state:'visible'});
 for(const viewport of [{width:1280,height:800},{width:375,height:812}]){
  await page.setViewportSize(viewport);
  const style=await update.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,bottom:innerHeight-r.bottom,height:r.height,background:s.backgroundColor,blur:s.backdropFilter,radius:s.borderRadius,wrap:s.whiteSpace};});
  assert.equal(style.left,16);assert.equal(style.bottom,16);assert.equal(style.height,44);assert.equal(style.wrap,'nowrap');
  // Compare the current Fox message bar, not a detached retired panel-button skin.
  const fox=await page.locator('#notionCommand').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,blur:s.backdropFilter};});
  assert.equal(style.background,fox.background);assert.equal(style.blur,fox.blur);assert.equal(style.radius,'999px');
 }
 await page.getByRole('button',{name:'Update',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.updateClicks),1);
 assert(await page.getByRole('button',{name:'Updating…',exact:true}).isDisabled());
 console.log('PASS shared update HUD: hidden while the update downloads, one Update click installs it, disabled handoff.');
});
