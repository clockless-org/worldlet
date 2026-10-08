import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl,openCompanionPanel} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:940},reducedMotion:'reduce'});
 page.setDefaultTimeout(10000);
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {platform:'macos',workspaceId:'empty-area-check',sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:[],hiddenApplets:[]},sampleEnabled:false};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};});
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl',undefined,{timeout:60000});
 await page.locator('#worldStartup').waitFor({state:'detached',timeout:60000});

 await openCompanionPanel(page);
 const fox=page.locator('.companion-info-panel');await fox.waitFor();
 const palette=await fox.evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,radius:getComputedStyle(n).borderRadius}));
 assert.equal(await fox.locator('.companion-info-nav').evaluate(n=>getComputedStyle(n).borderBottomWidth),'0px');
 for(const tab of await fox.getByRole('tab').all())assert.equal(await tab.evaluate(n=>getComputedStyle(n).borderBottomWidth),'0px');
 await fox.getByRole('tab',{name:'Profile',exact:true}).click();
 for(const button of await fox.locator('.companion-info-card button:visible').all()){const b=(await button.boundingBox())!;assert(b.height>=44&&b.width>=44);}
 await page.screenshot({path:'/tmp/worldlet-fox-hud-panel.png'});
 await page.getByRole('button',{name:'Close companion panel'}).click();
 await page.locator('[data-kind=region-add][data-page=building-work]').click();
 const area=page.locator('.region-shelf');
 assert.deepEqual(await area.evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,radius:getComputedStyle(n).borderRadius})),palette,'Panels share the same material and ink');
 await page.screenshot({path:'/tmp/worldlet-area-hud-panel.png'});
 await page.setViewportSize({width:600,height:600});
 const box=(await area.boundingBox())!;assert(box.x>=0&&box.y>=0&&box.x+box.width<=600&&box.y+box.height<=600);
 console.log('PASS shared panel material, divider-free tabs, 44px controls, bounded narrow layout');
});
