import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
// System glass and app material preview with a mocked native bridge; no account calls.
// HUD_MATERIAL_SHOTS=<directory> retains the actual rendered day/night evidence.
const out=process.env.HUD_MATERIAL_SHOTS;
await withBrowser(fileAccess,async browser=>{
 for(const night of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  await page.addInitScript(night=>{
   (window as any).webkit={messageHandlers:{worldlet:{async postMessage(b:any){
    if(b.action==='snapshot')return {workspaceId:'preview',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:true};
    if(b.action==='weatherLoad')return {presentation:{recording:{lighting:night?'night':'day',weather:'clear'}}};
    if(b.action==='modelStatus')return {available:false};return {ok:true};
   }}}};
  },night);
  await page.goto(worldUrl());
  await page.waitForFunction(()=>{const m=(document.querySelector('#notionWorld') as any)?.sceneMetrics;return m?.camera?.settled&&!document.querySelector('#worldStartup');});
  if(out)await page.screenshot({path:`${out}/system-${night?'night':'day'}.png`});
  await page.evaluate(()=>{location.hash='object=app-gmail';});
  await page.getByRole('button',{name:'Pilot newsletter #6',exact:true}).click();
  await page.waitForTimeout(600);
  if(out)await page.screenshot({path:`${out}/app-${night?'night':'day'}.png`});
  const art=await page.locator('.mail-focus').evaluate(el=>getComputedStyle(el,'::before').borderImageSource);
  assert.match(art,/country-stationery\.png/);
  await page.evaluate(async()=>{for(const name of ['country-stationery','country-rail']){const img=new Image();img.src='hud/'+name+'.png';await img.decode();if(img.naturalWidth!==1024)throw Error('Missing country asset: '+name);}});
  for(const width of [600,375]){
   await page.setViewportSize({width,height:800});await page.waitForTimeout(200);
   const box=await page.locator('.mail-focus').boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1,'Mail fits narrow viewport');
   const title=await page.locator('.mail-page-title').boundingBox(),nav=await page.locator('.mail-reader-switch').boundingBox();assert.ok(title&&nav&&title.x+title.width<=nav.x-4,'subject leaves navigation space');
   await page.locator('.mail-paper').focus();await page.keyboard.press('End');
   await page.locator('.mail-paper').evaluate((el:HTMLElement)=>{el.scrollTop=0;el.blur();});
   if(out)await page.screenshot({path:`${out}/mail-${night?'night':'day'}-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:800});
  {
   const cdp=await page.context().newCDPSession(page);
   await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
   const style=await page.locator('#notionBack').evaluate(e=>{const c=getComputedStyle(e);return {blur:c.backdropFilter,color:c.backgroundColor};});
   assert.equal(style.blur,'none');assert.ok(!style.color.includes('rgba'),'opaque fallback');
   if(out)await page.screenshot({path:`${out}/opaque-${night?'night':'day'}.png`});
   await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  }
  await page.evaluate(()=>{location.hash='object=app-game-2048';});
  await page.locator('.game-panel').waitFor();await page.waitForTimeout(300);
  assert.match(await page.locator('.game-header').evaluate(el=>getComputedStyle(el,'::before').borderImageSource),/country-rail\.png/);
  if(out)await page.screenshot({path:`${out}/game-${night?'night':'day'}.png`});
  await page.close();
 }
});
console.log('PASS day/night app glass and opaque reduced-transparency fallback');
