// Moving between the World, an area and an Applet zooms (owner Order 2026-10-07, ui/world/level-zoom.ts): entering an
// Applet zooms in from where it was opened, leaving it zooms back out, Back from an Applet opened in an area panel returns
// to that panel, and the panel's close zooms out to the World. The move itself is never delayed, the zoom takes no
// clicks, moving between two Applets does not zoom, and nothing zooms under reduced motion.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';

await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=pageErrors(page);
 page.setDefaultTimeout(20000);
 await page.addInitScript(()=>{
  // Every zoom veil as it appears: the zoom is a third of a second, faster than a check's round trip.
  (window as any).veils=[];
  new MutationObserver(list=>{for(const r of list)for(const n of r.addedNodes)if(n instanceof HTMLElement&&n.classList.contains('world-level-zoom'))(window as any).veils.push({direction:n.dataset.direction,pointerEvents:getComputedStyle(n).pointerEvents,pictures:n.querySelectorAll('canvas').length,active:(document.querySelector('#notionWorld') as any)?.sceneMetrics?.active});}).observe(document,{childList:true,subtree:true});
  (window as any).fixture={workspaceId:'level-zoom',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},worldItems:[],connections:[],
   sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  (window as any).calls=[];
  (window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){const w=window as any;if(/^browser(Show|Layout|Hide)$/.test(b.action))w.calls.push(b);if(b.action==='snapshot')return structuredClone(w.fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};if(b.action==='appContent')return {pages:[]};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(n=>{const m=document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics;return m?.renderer==='pixi-webgl'&&m.modules.length===n;},WORLD_APPS.length,{timeout:120000});
 const metrics=()=>page.evaluate(()=>{const m=(document.querySelector('#notionWorld') as any).sceneMetrics;return {active:m.active as string,level:m.level as string,zoom:m.levelZoom as {running:boolean;direction:string|null;count:number;last:string|null},area:m.camera.area as string|null,settled:m.camera.settled as boolean};});
 const veil=page.locator('.world-level-zoom');
 const veils=()=>page.evaluate(()=>(window as any).veils as {direction:string;pointerEvents:string;pictures:number;active:string}[]);
 // Each move zooms once in the expected direction and the veil is gone again within a moment.
 const zoomed=async(count:number,direction:string,what:string)=>{
  const m=await metrics();
  assert.equal(m.zoom.count,count,what+' zooms once');assert.equal(m.zoom.last,direction,what+' zooms '+direction);
  await veil.waitFor({state:'detached',timeout:3000}).catch(async e=>{throw new Error(what+' left its zoom on screen: '+JSON.stringify(await page.evaluate(()=>({veils:document.querySelectorAll('.world-level-zoom').length,animations:document.getAnimations().map(a=>a.playState+':'+Math.round(Number(a.currentTime))+':'+((a.effect as KeyframeEffect).target as HTMLElement)?.className)}))),{cause:e});});
 };
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.camera.settled);
 const start=(await metrics()).zoom.count;

 // A device in the World: the Applet opens at once and its surface grows out of the device.
 const device=await page.evaluate(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.modules.find((d:any)=>d.id==='app-google-calendar'&&d.visible));
 assert(device,'Calendar stands in the World');
 await page.mouse.click(device.peekHit.x,device.peekHit.y);
 const opened=await metrics();
 assert.equal(opened.active,'app-google-calendar','the Applet opens at once, not after the zoom');
 const first=(await veils())[0];
 assert(first,'entering an Applet shows the zoom');
 assert.equal(first.direction,'in');
 assert.equal(first.pointerEvents,'none','the zoom never takes a click');
 assert.equal(first.pictures,1,'the zoom starts from a picture of the World');
 await zoomed(start+1,'in','Opening an Applet');

 // Another Applet from inside one is a move between equals: no zoom.
 await page.evaluate(()=>location.hash='object=app-apple-notes');
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.active==='app-apple-notes');
 assert.equal((await metrics()).zoom.count,start+1,'moving between two Applets does not zoom');

 // Back to the World zooms out.
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.level==='overview');
 assert.equal((await veils()).at(-1)?.direction,'out','leaving an Applet zooms out');
 await zoomed(start+2,'out','Leaving an Applet');

 // An area panel: its Applet zooms in from the panel's row, Back zooms out to the same panel, and closing the panel
 // zooms the World's camera back out.
 const shelf=page.locator('.region-shelf');
 await page.locator('.notion-pin[data-page="building-home"][data-action="region-more"]').click();
 await shelf.waitFor();
 await page.waitForFunction(()=>{const c=(document.querySelector('#notionWorld') as any).sceneMetrics.camera;return c.settled&&!!c.area;});
 await shelf.locator('.region-shelf-applet[aria-label="Notes"]').click();
 assert.equal((await metrics()).active,'app-apple-notes','the area\'s Applet opens');
 assert.equal(await shelf.count(),0,'the panel gives way to the Applet');
 await zoomed(start+3,'in','Opening an Applet from its area');
 await page.locator('#notionBack').click();
 await shelf.waitFor();
 assert.equal(await shelf.getByRole('heading',{level:2}).textContent(),'Home','Back returns to the area the Applet was opened from');
 assert.equal((await metrics()).level,'overview');
 await zoomed(start+4,'out','Going back out to the area');
 await page.waitForFunction(()=>{const c=(document.querySelector('#notionWorld') as any).sceneMetrics.camera;return c.settled&&!!c.area;});
 // Esc folds Fox's open chat first (native-chat.ts), then closes the panel.
 for(let i=0;i<3&&await shelf.count();i++){await page.keyboard.press('Escape');await page.waitForTimeout(200);}
 await shelf.waitFor({state:'detached'});
 await page.waitForFunction(()=>{const c=(document.querySelector('#notionWorld') as any).sceneMetrics.camera;return c.settled&&!c.area;});

 // A website Applet (owner Order 2026-10-08: Discord, left and entered again, showed its page at 60%): its panel does
 // not grow with the zoom, because the host places the native page at the panel's rect as measured, and the page ends
 // up filling the panel once the zoom is over.
 await page.evaluate(()=>location.hash='object=app-discord');
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='browserShow'));
 await zoomed(start+5,'in','Opening a website Applet');
 await page.waitForTimeout(150);
 const placed=await page.evaluate(()=>{const calls=(window as any).calls.filter((c:any)=>c.action==='browserShow'||c.action==='browserLayout'),slot=document.querySelector('.browser-viewport')!.getBoundingClientRect();
  return {first:calls.find((c:any)=>c.action==='browserShow').rect,last:calls.at(-1).rect,slot:{width:slot.width,height:slot.height}};});
 assert(Math.abs(placed.last.width-placed.slot.width)<=4&&Math.abs(placed.last.height-placed.slot.height)<=4,'the website page fills its panel after the zoom: '+JSON.stringify(placed));
 assert(placed.first.width>=placed.slot.width-4,'the website page is placed at the panel\'s full size, not mid-zoom: '+JSON.stringify(placed));
 // Website Applets have no Back; the World button leaves them, as the person did.
 await page.evaluate(()=>{location.hash='';});
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.level==='overview');
 await zoomed(start+6,'out','Leaving a website Applet');
 assert((await page.evaluate(()=>(window as any).calls.at(-1).action))==='browserHide','leaving hides the website page');

 // Reduced motion: the same moves, nothing zooms.
 await page.emulateMedia({reducedMotion:'reduce'});
 const before=(await veils()).length;
 await page.mouse.click(device.peekHit.x,device.peekHit.y);
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.active==='app-google-calendar');
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.level==='overview');
 assert.equal((await veils()).length,before,'nothing zooms under reduced motion');
 assert.equal((await metrics()).zoom.count,start+6,'reduced motion never zooms');
 assert.deepEqual(errors,[]);
});
console.log('World level zoom check passed');
