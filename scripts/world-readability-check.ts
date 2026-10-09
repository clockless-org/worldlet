import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
const label=process.argv[2]||'after';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){
  if(b.action==='snapshot')return {workspaceId:'readability',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:true,cloudConsent:false};
  if(b.action==='modelStatus')return {available:true};if(b.action==='weatherLoad')return null;return {ok:true};
 }}}};});
 await page.goto(worldUrl());
 await waitForWorld(page);
 assert.equal(await page.title(),'Worldlet');
 for(const lighting of ['day','night']){
  await page.evaluate(lighting=>(window as any).worldletExecute('set_scene_lighting',{lighting}),lighting);
  await page.waitForTimeout(1800);
  assert(await page.locator('[data-renderer=pixi-webgl]').isVisible());
  await page.screenshot({path:`/tmp/world-readability-${label}-${lighting}.png`});
 }
 await page.evaluate(()=>{(window as any).worldletExecute('set_scene_lighting',{lighting:'day'});location.hash='building=building-home';});
 await page.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-depth')==='building');
 await page.waitForTimeout(1800);
 await page.screenshot({path:`/tmp/world-readability-${label}-home.png`});
 await page.setViewportSize({width:900,height:700});
 await page.waitForTimeout(1000);
 assert(await page.locator('[data-renderer=pixi-webgl]').isVisible());
 await page.screenshot({path:`/tmp/world-readability-${label}-compact.png`});
 assert.deepEqual(errors,[]);
 console.log('PASS World day/night overview, Home navigation and compact rendering; screenshots /tmp/world-readability-'+label+'-*.png');
}finally{await browser.close();}
