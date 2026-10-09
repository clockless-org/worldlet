import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {platform:'macos',workspaceId:'sim-contract-check',sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail','app-google-calendar','app-apple-notes','app-apple-reminders','app-weather'],hiddenApplets:[]},sampleEnabled:false};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};});
 await page.goto(worldUrl());await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='sim-dom');
 await page.locator('.village-map').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-world.png'});
 // An Applet the theme has no art of its own for shows the host's picture, never a two-letter placeholder.
 assert.equal(await page.locator('.village-map-generic').count(),0,'every Applet has a picture');assert.equal(await page.locator('[data-sim-id=app-weather] img').count(),1);
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'activate',id:'app-gmail'}));
 await page.locator('.village-surface[data-kind=mail]').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-mail.png'});
 assert.equal(await page.locator('.village-map').isVisible(),false);
 const overlap=await page.evaluate(()=>{const a=document.querySelector('[data-sim-slot=content]')!.getBoundingClientRect(),b=document.querySelector('.ui-theme-speech')!.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});assert.equal(overlap,false,'Fox speech stays outside Applet content');
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'overview'}));await page.locator('.village-map').waitFor({state:'visible'});
 // One step: Settings → Theme → Blueprint replaces the whole World in place, with the same Applet still reachable.
 await page.locator('.companion-panel-button').click();await page.locator('#companionInfo [data-setting=theme]').click();
 await page.locator('#companionInfo [data-action=theme-blueprint]').click();
 await page.locator('.blueprint-plan').waitFor({state:'visible'});assert.equal(await page.locator('.village-map').count(),0,'the old theme is disposed');
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.buildTheme),'blueprint');
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll<HTMLLinkElement>('link[data-theme-style]')].map(l=>l.dataset.themeStyle)),['blueprint'],'only the active theme stylesheet is attached');
 await page.locator('#companionInfo [data-action=theme-blueprint][aria-pressed=true]').waitFor();
 await page.keyboard.press('Escape');await page.screenshot({path:'/tmp/worldlet-sim-shell-blueprint-world.png'});
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'activate',id:'app-gmail'}));
 await page.locator('.blueprint-sheet').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-blueprint-mail.png'});
 const sheetOverlap=await page.evaluate(()=>{const a=document.querySelector('[data-sim-slot=content]')!.getBoundingClientRect(),b=document.querySelector('.ui-theme-speech')!.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});assert.equal(sheetOverlap,false,'Fox speech stays outside Blueprint content');
 // The choice is saved on this computer: a reload starts in Blueprint.
 await page.reload();await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.theme==='blueprint');
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'overview'}));await page.locator('.blueprint-plan').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log('PASS full World shell: boot, Sim world, public navigation to mail and back, Settings → Theme switches Village to Blueprint in place and after reload, no runtime errors');
});
