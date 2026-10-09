import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){
  if(b.action==='snapshot')return {workspaceId:'scroll-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},cloudConsent:false,sampleEnabled:true};
  if(b.action==='modelStatus')return {available:true};return {ok:true};
 }}}};});
 const url=worldUrl();await page.goto(url);await waitForWorld(page);assert.equal(page.url(),url);assert.equal(await page.title(),'Worldlet');
 // The companion panel no longer lists Applets (owner feedback 2026-10-03): they live in their areas.
 await openCompanionPanel(page);assert.equal(await page.getByRole('tab',{name:'Applets',exact:true}).count(),0);
 await page.getByRole('button',{name:'Close companion panel',exact:true}).click();
 await page.getByRole('button',{name:'Manage Home',exact:true}).click();if(!await page.locator('.region-shelf').isVisible())await page.getByRole('button',{name:'Manage Home',exact:true}).click();
 assert.equal(await page.locator('.region-shelf .ui-pagination').count(),0);assert.equal(await page.locator('[data-ground-slot]').count(),5);
 const shelf=page.locator('.region-shelf'),heading=shelf.getByRole('heading',{name:'Home',exact:true}),headBefore=await heading.boundingBox();
 await shelf.locator('.region-shelf-applet').last().scrollIntoViewIfNeeded();assert(Math.abs((await heading.boundingBox()).y-headBefore.y)<1);assert(await shelf.evaluate(e=>e.scrollHeight<=e.clientHeight+1));
 assert.deepEqual(errors,[]);console.log('PASS fixture: no Applets catalog in the companion panel, region shelf scroll with fixed heading, region slots and no forced paging.');
});
