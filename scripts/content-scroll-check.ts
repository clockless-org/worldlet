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
 await page.getByRole('button',{name:'Enter Home',exact:true}).click();if(!await page.locator('.area-view').isVisible())await page.getByRole('button',{name:'Enter Home',exact:true}).click();
 // The Area lays its Applets out in one scrolling list with no paging; its heading stays put.
 const view=page.locator('.area-view'),heading=view.getByRole('heading',{name:'Home',exact:true}),headBefore=await heading.boundingBox();
 assert.equal(await view.locator('.ui-pagination').count(),0);assert(await view.locator('.area-view-applet').count()>=5);
 await view.locator('.area-view-applet').last().scrollIntoViewIfNeeded();assert(Math.abs((await heading.boundingBox()).y-headBefore.y)<1);
 assert.deepEqual(errors,[]);console.log('PASS fixture: no Applets catalog in the companion panel, Area list scroll with fixed heading and no forced paging.');
});
