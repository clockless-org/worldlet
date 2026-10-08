import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
import {tmpdir} from 'node:os';
const platform=process.platform==='win32'?'windows':'macos';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {POPULAR_APPS} from '../core/applets/popular-apps.ts';
import {WEB_GAME_APPLETS} from '../core/applets/definitions/web-games.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:940},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(({ids,platform})=>{
  const w=window as any;w.calls=[];w.nativeInstalled=true;
  w.fixture={platform,workspaceId:'popular-apps',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:ids},sampleEnabled:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);if(b.action==='snapshot')return structuredClone(w.fixture);if(b.action==='openInstalledApplet')return {opened:w.nativeInstalled};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};
  if(platform==='windows')w.worldletHost={version:1,platform,request:w.webkit.messageHandlers.worldlet.postMessage};
 },{ids:APP_DEFINITIONS.map(a=>a.id),platform});
 await page.goto(worldUrl());
 await page.waitForFunction(n=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.modules.length===n,APP_DEFINITIONS.length);
 await page.locator('#worldStartup').waitFor({state:'detached'});
 for(const app of [...POPULAR_APPS,...WEB_GAME_APPLETS]){
  const region=await page.evaluate(id=>document.querySelector<any>('#notionWorld').sceneMetrics.modules.find(module=>module.id===id).region,app.id);
  await page.evaluate(region=>{location.hash='building='+region;window.dispatchEvent(new HashChangeEvent('hashchange'));},region);
  await page.waitForFunction(region=>document.querySelector<any>('#notionWorld').sceneMetrics.active===region,region);
  const pin=page.locator('.notion-pin[data-page="place-'+app.id+'"]');
  if(await pin.count()){
   // Devices are drawn on the canvas; tap the device where the peek name points.
   await page.waitForFunction(()=>{const m=document.querySelector<any>('#notionWorld').sceneMetrics;return m.camera.settled&&m.framing.amount<.01;});
   const p=await page.evaluate(id=>{const d=document.querySelector<any>('#notionWorld').sceneMetrics.modules.find(d=>d.id===id),stage=document.querySelector('#notionStage').getBoundingClientRect();return {x:stage.x+d.peekHit.x,y:stage.y+d.peekHit.y};},app.id);
   await page.mouse.click(p.x,p.y);
  }
  else {
   await page.evaluate(()=>{location.hash='';});
   await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='overview');
   await page.locator('[data-action="region-more"][data-page="'+region+'"]').click();
   // Beyond a region's five ground places, the Area panel lists the person's other Applets under Recently used, and
   // catalog Applets they do not have under Recommended or, behind one button, All.
   const open=page.locator('.region-shelf-grid').getByRole('button',{name:app.title,exact:true});if(!await open.count()&&await page.locator('.region-shelf-all').count())await page.locator('.region-shelf-all').click();
   assert.equal(await open.count(),1,app.key+' is reachable through its region shelf');await open.click();
  }
  await page.waitForFunction(id=>document.querySelector<any>('#notionWorld').sceneMetrics.active===id,app.id);
  if(app.fullView.kind==='web'||platform==='windows'){
   await page.waitForFunction(({key,url})=>(window as any).calls.some(c=>c.action==='browserShow'&&c.platform==='web'&&c.url===url)&&document.querySelector<HTMLElement>('#notionContent').dataset.applet===key,{key:app.key,url:app.fullView.url});
   assert.equal(await page.locator('.browser-viewport').isVisible(),true,app.key+' gets an embedded browser');
  }else await page.waitForFunction(key=>(window as any).calls.some(c=>c.action==='openInstalledApplet'&&c.key===key),app.key);
  const image=page.locator('.companion-app-logo');if(await image.count())await page.waitForFunction(()=>document.querySelector<HTMLImageElement>('.companion-app-logo')?.naturalWidth>0);
  if(['chatgpt','spotify','figma'].includes(app.key))await page.screenshot({path:path.join(tmpdir(),'worldlet-'+app.key+'-'+platform+'-focus.png')});
 }
 // Only Mac attempts installed-app launching; Windows website fallback is checked above.
 if(platform==='macos')for(const app of POPULAR_APPS.filter(a=>a.fullView.kind==='launcher')){
  await page.evaluate(()=>{(window as any).nativeInstalled=false;location.hash='';});
  await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='overview');
  await page.evaluate(id=>location.hash='object='+id,app.id);
  await page.waitForFunction(id=>document.querySelector<any>('#notionWorld').sceneMetrics.active===id,app.id);
  await page.waitForFunction(url=>(window as any).calls.some(c=>c.action==='browserShow'&&c.url===url),app.fullView.url);
 }
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>['connect','agentChat'].includes(c.action))),false,'Opening apps does not authorize accounts or send prompts');
 if(platform==='windows')assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='openInstalledApplet')),false,'Windows uses publisher websites without unsupported native launch');
 assert.deepEqual(errors,[]);
 console.log(`PASS ${platform}: ${POPULAR_APPS.length} Applet and ${WEB_GAME_APPLETS.length} web game routes, visible places and region-shelf overflow, website/native capability routing and bundled icons`);
});
