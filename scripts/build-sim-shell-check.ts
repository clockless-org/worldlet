import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {platform:'macos',workspaceId:'sim-contract-check',sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail','app-google-calendar','app-apple-notes','app-apple-reminders','app-weather'],hiddenApplets:[]},sampleEnabled:false};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};});
 await page.goto(worldUrl());await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl');
 // The default theme is the Village package: the animated Pixi World in the host's own Applet pages, so only its
 // stylesheet is attached and no scene slot restyles the shared HUD.
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.buildTheme),undefined);
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll<HTMLLinkElement>('link[data-theme-style]')].map(l=>l.dataset.themeStyle)),['village']);
 // What the companion and HUD read. Fox is the host's in every theme; HUD material and sounds come from the theme.
 const companion=()=>page.evaluate(()=>{const env=(globalThis as any).__WORLDLET_ENV_ASSETS__;return {name:document.querySelector('#companionDialogue')?.getAttribute('aria-label'),rive:!!env.companionRive,portrait:env.companionPortrait,skin:document.documentElement.dataset.themeSkin||null,mail:env.surfaces?.sounds?.events?.['mail.received']||null};});
 const fox=await companion();assert.equal(fox.name,'Fox reply');
 const pick=async(id:string)=>{await page.locator('.companion-panel-button').click();await page.locator('#companionInfo [data-setting=theme]').click();
  await page.locator(`#companionInfo [data-action=theme-${id}]`).click();await page.locator(`#companionInfo [data-action=theme-${id}][aria-pressed=true]`).waitFor();await page.keyboard.press('Escape');};
 await pick('village-map');
 await page.locator('.village-map').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.renderer),'sim-dom');
 await page.screenshot({path:'/tmp/worldlet-sim-shell-world.png'});
 // An Applet the theme has no art of its own for shows the host's picture, never a two-letter placeholder.
 assert.equal(await page.locator('.village-map-generic').count(),0,'every Applet has a picture');assert.equal(await page.locator('[data-sim-id=app-weather] img').count(),1);
 // The theme's own icon (presentation.json `icons`) reaches the World through the host, as it does every host surface.
 assert.match(await page.locator('[data-sim-id=app-gmail] img').getAttribute('src')||'',/theme-assets\/village-map\/gmail-icon\.png$/);
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'activate',id:'app-gmail'}));
 await page.locator('.village-surface[data-kind=mail]').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-mail.png'});
 assert.equal(await page.locator('.village-map').isVisible(),false);
 const overlap=await page.evaluate(()=>{const a=document.querySelector('[data-sim-slot=content]')!.getBoundingClientRect(),b=document.querySelector('.ui-theme-speech')!.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});assert.equal(overlap,false,'Fox speech stays outside Applet content');
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'overview'}));await page.locator('.village-map').waitFor({state:'visible'});
 // One step: Settings → Theme → Blueprint replaces the whole World in place, with the same Applet still reachable.
 await pick('blueprint');
 await page.locator('.blueprint-plan').waitFor({state:'visible'});assert.equal(await page.locator('.village-map').count(),0,'the old theme is disposed');
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.buildTheme),'blueprint');
 // Blueprint paints the Attention Center and world log and gives new mail its own sound; Fox stays Fox.
 assert.deepEqual(await companion(),{...fox,skin:'attention log',mail:'theme-assets/blueprint/mail-chime.wav'});
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll<HTMLLinkElement>('link[data-theme-style]')].map(l=>l.dataset.themeStyle)),['blueprint'],'only the active theme stylesheet is attached');
 await page.screenshot({path:'/tmp/worldlet-sim-shell-blueprint-world.png'});
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'activate',id:'app-gmail'}));
 await page.locator('.blueprint-sheet').waitFor({state:'visible'});await page.screenshot({path:'/tmp/worldlet-sim-shell-blueprint-mail.png'});
 const sheetOverlap=await page.evaluate(()=>{const a=document.querySelector('[data-sim-slot=content]')!.getBoundingClientRect(),b=document.querySelector('.ui-theme-speech')!.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});assert.equal(sheetOverlap,false,'Fox speech stays outside Blueprint content');
 // The choice is saved on this computer: a reload starts in Blueprint.
 await page.reload();await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.theme==='blueprint');
 await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'overview'}));await page.locator('.blueprint-plan').waitFor({state:'visible'});
 // Back to the Village: the Pixi World returns and no other package's stylesheet or scene slot is left behind.
 await pick('village');await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any)?.sceneMetrics?.renderer==='pixi-webgl');
 assert.equal(await page.locator('.blueprint-plan').count(),0);assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll<HTMLLinkElement>('link[data-theme-style]')].map(l=>l.dataset.themeStyle)),['village']);
 assert.deepEqual(await companion(),fox,'Fox and the built-in HUD come back');
 assert.deepEqual(await page.evaluate(()=>({theme:document.documentElement.dataset.buildTheme,slots:[...document.documentElement.style].filter(name=>name.startsWith('--sim-'))})),{theme:undefined,slots:[]});
 assert.deepEqual(errors,[]);console.log('PASS full World shell: Village boots the Pixi World, Settings → Theme switches to Village Map and Blueprint in place (Blueprint with its own HUD material and sound and the same Fox, kept after reload) and back to Village, no runtime errors');
});
