import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,openCompanionPanel,SETTINGS_BUTTON,waitForWorld} from './browser-test.ts';
import path from 'node:path';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'desktop-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,provider:'hermes',cloudAllowed:true};
   if(b.action==='companionProfile')return {name:'Fox'};
   if(b.action==='conversationRecall')return [];
   if(b.action==='agentChat'){await new Promise(resolve=>w.finishThinking=resolve);return {message:'I’m still here with you.'};}
   if(b.action==='openWorld'){if(w.failRestore)throw Error('Fixture restore failed');if(w.delayRestore)await new Promise(resolve=>w.finishRestore=resolve);w.worldletDesktopCompanion(false);return {ok:true};}
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await waitForWorld(page);
 await page.waitForFunction(()=>typeof (window as any).worldletDesktopCompanion==='function');
 // Wait for the CSS transitions themselves, not a wall-clock guess: a busy main thread (Fox's
 // Rive frames under software rendering) can hold a transition at its start for over 300 ms.
 const settle=()=>page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));
 assert(await page.evaluate(()=>(window as any).worldletCompanionGeometry(true)),'Ready world permits automatic desktop Companion');
 await page.evaluate(()=>(window as any).worldletCompanionBackdrop(true));
 assert(!await page.locator('.companion-pet').isVisible(),'Inactive backdrop excludes a duplicate Fox');
 assert.equal(await page.locator('.companion-controls:visible').count(),0,'Inactive backdrop excludes duplicate controls');
 assert(await page.locator('#notionStage').isVisible(),'World remains painted for native snapshot');
 await page.screenshot({path:'/tmp/worldlet-inactive-backdrop.png'});
 await page.evaluate(()=>(window as any).worldletCompanionBackdrop(false));
 assert(await page.locator('.companion-pet').isVisible(),'Cancelled capture restores live Fox');
 const painted=await page.evaluate(async()=>{
  const w=window as any;w.worldletDesktopCompanion(true);
  const frames=()=>(document.querySelector('#notionWorld') as any).sceneMetrics.performance.frames;
  let resolved=false;const ready=w.worldletRestoreWorld().then(()=>resolved=true);
  const worldVisible=!document.documentElement.classList.contains('desktop-companion'),from=frames();
  await new Promise(requestAnimationFrame);const firstFramePending=!resolved;
  await ready;return {worldVisible,firstFramePending,resolved,worldDrew:frames()>=from+2};
 });
 assert.deepEqual(painted,{worldVisible:true,firstFramePending:true,resolved:true,worldDrew:true},'World restore waits beyond DOM changes until the World itself has drawn again');
 const entry=page.locator(SETTINGS_BUTTON),type=page.locator('#notionInput'),mic=page.locator('.companion-speech-button'),controls=page.locator('.companion-controls>button:visible:not(.companion-order-button,.companion-speech-button)'),form=page.locator('#notionCommand'),panel=page.locator('#companionInfo');
 const typing=()=>page.evaluate(()=>(document.querySelector('.notion-world') as HTMLElement).dataset.entryExpanded==='true');
 // One message bar under Fox (owner decision 2026-10-04): the field and Send, the microphone on its right (2026-10-07); the settings button beside Fox opens the panel.
 assert.equal(await controls.count(),0,'No icon row in the World');assert(await form.isVisible(),'The message bar is always there');
 // At rest the bar is low-key (owner request 2026-10-05); pointing at it shows the microphone, Send and the hint.
 assert.equal(await page.locator('.companion-text-entry').getAttribute('data-quiet'),'true','The bar rests quiet');
 await form.hover();await page.waitForTimeout(400);
 assert.deepEqual(await form.locator('button').evaluateAll(b=>b.filter(e=>(e as HTMLElement).offsetParent).map(e=>e.id||e.className)),[],'No Send while there is nothing to send; the microphone is its own button on the bar\'s right');assert(await mic.isVisible());
 assert.equal((await form.boundingBox()).width,160,'The resting bar is small (two sizes, owner Order 2026-10-08)');assert.match(await type.getAttribute('placeholder'),/Click to type · hold to speak/);
 assert.match(await form.evaluate(e=>getComputedStyle(e).backdropFilter),/blur/,'The bar is frosted');
 await openCompanionPanel(page);assert(await panel.isVisible(),'The settings button opens the companion panel');assert(!await typing(),'Opening the panel does not start typing');
 await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
 assert(await entry.evaluate(e=>e===document.activeElement),'The panel returns keyboard focus to its button');
 await type.click();assert(await typing());assert(await type.evaluate(e=>e===document.activeElement),'Clicking the bar focuses the input');
 await page.waitForFunction(()=>Math.round(document.querySelector('#notionCommand').getBoundingClientRect().width)===300);
 await page.keyboard.press('Escape');assert(!await typing(),'Escape returns the bar to rest');
 const originalPet=await page.locator('.companion-pet').boundingBox(),originalEntry=await page.locator('.companion-text-entry').boundingBox();
 const hudShape=()=>page.evaluate(()=>['#notionHUD','.companion-pet','.companion-avatar canvas','.companion-text-entry','#notionCommand','.companion-dock'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {selector,x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,font:s.fontSize};}));
 const originalBar=await form.boundingBox();
 const worldShape=await hudShape();
 await page.evaluate(()=>{(window as any).worldletCompanionGeometry();(window as any).worldletDesktopCompanion(true);});
 const fox=page.locator('.companion-avatar');
 assert.deepEqual(await hudShape(),worldShape,'The lower Companion cluster keeps the shared layout');
 await page.getByRole('button',{name:'Back to World',exact:true}).waitFor();
 assert.deepEqual(await controls.evaluateAll(b=>b.map(e=>e.className)),['companion-world-button'],'The desktop adds only the return button');
 assert.deepEqual(await form.boundingBox(),originalBar,'The bar stays put when the return button appears');
 async function assertDesktopRow(){
  const back=await page.locator('.companion-world-button').boundingBox(),bar=await form.boundingBox(),pet=await fox.boundingBox();
  assert(back&&back.width===44&&back.height===44,'Return is a 44px target');
  assert(back.x+back.width<=bar.x&&bar.x-(back.x+back.width)<=8,'Return sits just left of the bar');
  assert(Math.abs(bar.y+bar.height-(back.y+back.height))<1,'Return and the bar share their bottom edge');
  assert(Math.abs(bar.x+bar.width/2-(pet.x+pet.width/2))<=2,'The bar is centered under Fox');
  const crop=await page.evaluate(()=>(window as any).worldletCompanionGeometry());
  assert(crop.x<=back.x&&crop.x+crop.width>=bar.x+bar.width,'Native crop contains the return button and the bar');
 }
 await assertDesktopRow();
 assert.equal(await page.locator('.companion-dock').getByRole('button',{name:'Back to World',exact:true}).count(),0,'No duplicate large return action');
 // The first close after setup says once why Fox stayed and how to go back or quit (no platform here: no Dock or tray named).
 await page.getByText('I’ll keep working here in the background. Right-click me to go',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet.companion.desktop-hint')),'1','The desktop hint is remembered for this installation');
 const backRect=await page.locator('.companion-world-button').boundingBox();
 assert.equal(backRect.width,44);assert.equal(backRect.height,44);
 const returnCrop=await page.evaluate(()=>(window as any).worldletCompanionGeometry());
 assert(returnCrop.x+returnCrop.width>=backRect.x+backRect.width,'Native crop includes fourth button');
 assert.equal(await page.locator('.companion-context').isVisible(),false,'Global title stays in World');
 assert.equal(await page.locator('.world-task-tracker').isVisible(),false,'Attention Center is not part of the movable cluster');
 const detachedPet=await page.locator('.companion-pet').boundingBox(),detachedEntry=await page.locator('.companion-text-entry').boundingBox();
 assert.deepEqual(detachedPet,originalPet);assert.deepEqual(detachedEntry,originalEntry,'Native crop must not resize or reposition any HUD control');
 assert.equal(detachedEntry.y+detachedEntry.height-detachedPet.y-detachedPet.height,originalEntry.y+originalEntry.height-originalPet.y-originalPet.height,'Status bar stays at the same relative position');
 await type.click();
 await page.locator('#notionInput').fill('Continue on the desktop');
 assert.equal(await page.locator('#notionInput').isVisible(),true);
 assert.equal(await page.locator('#notionStage').isVisible(),false);
 const box=await fox.boundingBox();assert(box&&box.x>=0&&box.y>=0);
 await page.locator('#notionSend').click();
 // A working turn shows its progress on its own card; there is no thinking window above Fox.
 await page.waitForFunction(()=>/Getting ready/.test(document.querySelector('#worldConversation')?.textContent||''));
 assert.equal(await page.locator('.companion-head-status').isVisible(),false);
 assert.equal(await page.locator('.companion-thought').isVisible(),false,'the working card replaces the thinking dots');
 await page.emulateMedia({reducedMotion:'no-preference'});
 const cardBox=await page.locator('#companionDialogue').boundingBox();assert(cardBox&&cardBox.y>=0&&cardBox.y<box.y,'The working card is anchored above Fox');
 await page.screenshot({path:'/tmp/worldlet-companion-thinking.png',omitBackground:true});
 await page.evaluate(()=>(window as any).finishThinking());
 await page.getByText('I’m still here with you.',{exact:true}).waitFor();
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Getting ready…/,'Completed response replaces the working steps');
 const turn=await page.evaluate(()=>(window as any).calls.find(c=>c.action==='agentChat'));
 assert.equal(turn.context.location,'Desktop Companion');
 assert.equal(turn.context.view,undefined,'Hidden world content is omitted from the desktop environment');
 const bubble=await page.locator('#companionDialogue').boundingBox();
 assert(bubble&&bubble.width>=1380/4&&bubble.width<=1380*.4+1,'Desktop reuses world reply width');
 const crop=await page.evaluate(()=>(window as any).worldletCompanionGeometry());
 assert(crop.y<=bubble.y&&crop.y+crop.height>=originalEntry.y+originalEntry.height,'Native crop encloses reply and status bar');
 await page.screenshot({path:'/tmp/worldlet-desktop-companion.png',omitBackground:true,clip:crop});
 await page.keyboard.press('Escape');
 const speechBefore=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart').length);
 await page.mouse.move(box.x+60,box.y+60);await page.mouse.down();await page.mouse.move(box.x+100,box.y+90,{steps:3});await page.mouse.up();await page.waitForTimeout(350);
 const drag=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='desktopCompanionDrag').map(c=>c.phase));
 assert.deepEqual(drag,['start','end'],'Dragging Fox invokes native HUD movement');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart').length),speechBefore,'Dragging does not start speech');
 const press=await mic.boundingBox();await page.mouse.move(press.x+press.width/2,press.y+press.height/2);await page.mouse.down();await page.waitForTimeout(420);await page.mouse.up();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart').length),speechBefore+1,'Holding the desktop microphone uses the existing native microphone path');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'error',text:'Fixture microphone ended'}})));
 await fox.click({button:'right'});assert(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='companionMenu')),'Fox exposes the native full-quit menu');
 const panelEntry=page.locator(SETTINGS_BUTTON);
 const back=page.getByRole('button',{name:'Back to World',exact:true});
 const backBox=await panelEntry.boundingBox();assert(backBox&&backBox.width>=44&&backBox.height>=44,'The panel entry keeps a large target');
 await back.click();
 assert.equal(await page.locator('#companionInfo').isVisible(),false,'Back to World only restores the world');
 assert(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='openWorld')));
 await page.setViewportSize({width:1380,height:900});
 for(const size of [{width:1380,height:900},{width:375,height:812},{width:812,height:375}]){
  await page.setViewportSize(size);
  await page.waitForTimeout(400);await settle(); // Let the shared world's existing responsive transition settle.
  const a=await fox.boundingBox(),bar=await form.boundingBox();
  assert(bar.y>=a.y+a.height/2&&bar.x>=0&&bar.x+bar.width<=size.width&&bar.y+bar.height<=size.height,'The bar sits below Fox and fits the viewport');
  assert(Math.abs(bar.x+bar.width/2-(a.x+a.width/2))<=2,'The bar is centered under Fox');
  await type.click();const input=await form.boundingBox();assert(input&&input.x>=0&&input.x+input.width<=size.width&&input.y+input.height<=size.height,'Input fits viewport');
  await page.waitForTimeout(300);assert((await form.boundingBox()).width<=300,'Editor is compact');
  if(size.width===1380)await page.screenshot({path:'/tmp/worldlet-companion-card.png'});
  await page.keyboard.press('Escape');await page.waitForTimeout(300);await settle(); // The bar narrows back to its resting width.
  const shared=await hudShape();await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));await settle();
  assert.deepEqual(await hudShape(),shared,'Small/landscape viewport HUD is reused without a second responsive layout');
  await assertDesktopRow();
  await page.evaluate(()=>(window as any).worldletDesktopCompanion(false));
 }
 await page.setViewportSize({width:1380,height:900});
 await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));
 const speechHeld=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart').length);
 const hold=await fox.boundingBox();await page.mouse.move(hold.x+hold.width/2,hold.y+hold.height/2);await page.mouse.down();await page.waitForTimeout(420);await page.mouse.up();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart').length),speechHeld+1,'Holding desktop Fox records speech');
 assert.equal(await panel.isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('desktop-companion')),true,'Holding Fox stays on the desktop');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'error',text:'Fixture Fox recording ended'}})));
 await page.keyboard.press('Escape');
 // Leaving and returning to the desktop never moves the bar.
 await page.evaluate(()=>(window as any).worldletDesktopCompanion(false));await settle();
 {const world=await form.boundingBox();await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));await settle();assert.deepEqual(await form.boundingBox(),world,'The bar keeps its place on the desktop');}
 await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));
 await settle();
 await assertDesktopRow();
 await openCompanionPanel(page);assert(await panel.isVisible());
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('desktop-companion')),false,'Desktop panel entry restores the world before opening the panel');
 assert.equal(await page.locator('#notionStage').isVisible(),true);
 await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'no-preference'});
 // Focus and sample in one step so a slow runner cannot finish the .22s widening first. It widens from
 // the low-key resting bar (owner request 2026-10-05).
 const widths=await form.evaluate(async e=>{e.querySelector<HTMLTextAreaElement>('#notionInput')!.focus();const animation=e.getAnimations()[0];if(!animation)throw Error('Missing bar widening');animation.pause();const result=[];for(const time of [0,110,220]){animation.currentTime=time;result.push(e.getBoundingClientRect().width);}animation.finish();return result;});
 assert(widths[0]>=140&&widths[0]<widths[1]&&widths[1]<widths[2]&&widths[2]<=300,'The bar widens smoothly from rest to typing');
 await page.screenshot({path:'/tmp/worldlet-companion-input-short.png'});
 await page.keyboard.press('Escape');
 await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));
 await settle();
 await page.screenshot({path:'/tmp/worldlet-companion-desktop-bar.png',omitBackground:true,clip:await page.evaluate(()=>(window as any).worldletCompanionGeometry())});
 await page.evaluate(()=>(window as any).failRestore=true);
 await back.click();await page.locator('#companionDialogue',{hasText:'Could not reopen World. Try again.'}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.classList.contains('desktop-companion')),'Failed restore keeps desktop visible');
 assert(await back.isEnabled(),'Failed restore can be retried');
 await page.evaluate(()=>(window as any).failRestore=false);await back.click();
 assert(!await page.evaluate(()=>document.documentElement.classList.contains('desktop-companion')),'Fourth button retries restoration');
 assert.deepEqual(errors,[]);
 console.log('PASS desktop Companion UI: three world/four desktop icons, compact animated typing, microphone hold, reply, desktop context, native crop, responsive layouts and restoration failure/retry');
});
