import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {platform:'macos',workspaceId:'sim-contract-check',sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail','app-google-calendar','app-apple-notes','app-apple-reminders'],hiddenApplets:[]},sampleEnabled:false};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};});
 await page.goto(worldUrl());await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='sim-dom');
 await page.locator('.village-map').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-world.png'});
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'activate',id:'app-gmail'}));
 await page.locator('.village-surface[data-kind=mail]').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-mail.png'});
 assert.equal(await page.locator('.village-map').isVisible(),false);
 const overlap=await page.evaluate(()=>{const a=document.querySelector('[data-sim-slot=content]')!.getBoundingClientRect(),b=document.querySelector('.ui-theme-speech')!.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});assert.equal(overlap,false,'Fox speech stays outside Applet content');
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'overview'}));await page.locator('.village-map').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log('PASS full World shell: boot, Sim world, public navigation to mail and back, no runtime errors');
});
