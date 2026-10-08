import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);let missing=false;
 page.on('console',m=>{if(m.text().includes('Focus scenery unavailable youtube'))missing=true;});
 await page.addInitScript(()=>{
  let payload;Object.defineProperty(globalThis,'__WORLDLET_25D_ASSETS__',{configurable:true,get:()=>payload,set(v){payload=v;if(v.focus?.youtube)v.focus.youtube.script='assets/focus-deliberately-missing.js';}});
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {workspaceId:'missing-background',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false};if(b.action==='modelStatus')return {available:true};return {ok:true};}}}};
 });
 await page.goto(worldUrl());await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.modules.length>0);
 await page.evaluate(()=>location.hash='object=app-youtube');await page.locator('.browser-viewport').waitFor();
 await page.waitForTimeout(1500);assert.equal(missing,true,'failure was exercised');
 assert.equal(await page.evaluate(()=>document.querySelector<any>('#notionWorld').sceneMetrics.presentation.focusScenery),false,'missing image keeps the underlying world');
 await page.screenshot({path:'output/immersive/missing-image-fallback.png'});await page.locator('.fox-action-left [data-slot=home]').click();
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active!=='app-youtube');assert.deepEqual(errors,[]);
 console.log('PASS missing background preserves content and Back without a page exception');
});
