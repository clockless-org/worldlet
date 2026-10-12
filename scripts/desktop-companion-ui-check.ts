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
   if(b.action==='order')return w.orderReady?{available:true,ready:true}:{available:false};
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
 assert.deepEqual(await form.locator('button').evaluateAll(b=>b.filter(e=>(e as HTMLElement).offsetParent).map(e=>e.id||e.className)),[],'No Send while there is nothing to send; the microphone stands inside the bar\'s right end');assert(await mic.isVisible());
 assert.equal((await form.boundingBox()).width,300,'Pointed at, the bar opens to its typing size, the microphone inside it (owner Orders 2026-10-08, 2026-10-11 and 2026-10-12)');assert.match(await type.getAttribute('placeholder'),/Click to type · hold to speak/);
 assert.match(await form.evaluate(e=>getComputedStyle(e).backdropFilter),/blur/,'The bar is frosted');
 await openCompanionPanel(page);assert(await panel.isVisible(),'The settings button opens the companion panel');assert(!await typing(),'Opening the panel does not start typing');
 await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
 assert(await entry.evaluate(e=>e===document.activeElement),'The panel returns keyboard focus to its button');
 await type.click();assert(await typing());assert(await type.evaluate(e=>e===document.activeElement),'Clicking the bar focuses the input');
 await page.waitForFunction(()=>Math.round(document.querySelector('#notionCommand').getBoundingClientRect().width)===300);
 await page.keyboard.press('Escape');assert(!await typing(),'Escape returns the bar to rest');
 const originalPet=await page.locator('.companion-pet').boundingBox(),originalEntry=await page.locator('.companion-text-entry').boundingBox();
 const hudShape=()=>page.evaluate(()=>['#notionHUD','.companion-pet','.companion-avatar canvas','.companion-text-entry'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {selector,x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,font:s.fontSize};}));
 const originalBar=await form.boundingBox();
 const worldShape=await hudShape();
 const sameLine=(a,b,label)=>{assert(Math.abs(a.x+a.width/2-(b.x+b.width/2))<1&&Math.abs(a.y+a.height-(b.y+b.height))<1,label+' '+JSON.stringify({a,b}));};
 await page.evaluate(()=>{(window as any).worldletCompanionGeometry();(window as any).worldletDesktopCompanion(true);});
 const fox=page.locator('.companion-avatar');
 assert.deepEqual(await hudShape(),worldShape,'The lower Companion cluster keeps the shared layout');
 // On the desktop Fox stands with its bar alone (owner request 2026-10-11): nothing beside Fox or the bar, and the
 // microphone (with the bug, when Orders can be sent) inside the bar's right end; right-click Fox goes back to the World.
 await settle();
 assert.equal(await controls.count(),0,'No button stands beside the bar on the desktop');
 assert.equal(await page.getByRole('button',{name:'Back to World',exact:true}).count(),0,'No return button: right-click Fox, the Dock or the tray goes back');
 sameLine(await form.boundingBox(),originalBar,'The bar keeps its center and bottom edge on the desktop');
 await page.mouse.move(5,5);await page.waitForTimeout(400);
 assert.equal((await form.boundingBox()).width,168,'The desktop bar is the World\'s, the microphone inside it (owner request 2026-10-11)');
 async function assertDesktopRow(){
  const bar=await form.boundingBox(),pet=await fox.boundingBox(),micBox=await mic.boundingBox();
  assert.equal(await page.locator(SETTINGS_BUTTON).isVisible(),false,'No Settings beside desktop Fox');
  assert.equal(await page.locator('.companion-dock').isVisible(),false,'No dock actions beside desktop Fox');
  assert.equal(await page.locator('.companion-dock .world-capsule:visible').count(),0);
  assert(micBox&&micBox.width===36&&micBox.height===36,'The microphone is a 36px icon inside the bar');
  assert(micBox.x>=bar.x&&micBox.x+micBox.width<=bar.x+bar.width&&micBox.y>=bar.y&&micBox.y+micBox.height<=bar.y+bar.height,'The microphone sits inside the bar '+JSON.stringify({micBox,bar}));
  assert(bar.x+bar.width-(micBox.x+micBox.width)<=6,'The microphone ends the bar');
  assert(Math.abs(bar.x+bar.width/2-(pet.x+pet.width/2))<=2,'The bar is centered under Fox');
  const crop=await page.evaluate(()=>(window as any).worldletCompanionGeometry());
  assert(crop.x<=bar.x&&crop.x+crop.width>=bar.x+bar.width,'Native crop contains the bar');
 }
 await assertDesktopRow();
 await form.hover();assert.equal(await type.getAttribute('placeholder'),'Message Fox','The desktop bar says only Message Fox, even when pointed at');
 // The first close after setup says once why Fox stayed and how to go back or quit (no platform here: no Dock or tray named).
 await page.getByText('I’ll keep working here in the background. Right-click me to go',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet.companion.desktop-hint')),'1','The desktop hint is remembered for this installation');
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
 await page.evaluate(()=>(window as any).worldletRestoreWorld());
 assert.equal(await page.locator('#companionInfo').isVisible(),false,'Back to World only restores the world');
 assert(await page.locator(SETTINGS_BUTTON).isVisible(),'Settings is beside Fox again in the World');
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
 {const world=await form.boundingBox();await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));await settle();sameLine(await form.boundingBox(),world,'The bar keeps its place on the desktop');}
 await assertDesktopRow();
 // When Orders can be sent, the bug joins the microphone inside the bar, in the World and on the desktop alike (owner
 // request 2026-10-11).
 const order=page.locator('.companion-order-button');
 await page.evaluate(()=>{(window as any).worldletDesktopCompanion(false);(window as any).orderReady=true;window.dispatchEvent(new Event('worldlet:app-update'));});
 await order.waitFor();await settle();
 {const bug=await order.boundingBox(),micBox=await mic.boundingBox(),bar=await form.boundingBox();assert(bug.width===36&&bug.x>=bar.x&&bug.x-bar.x<=6&&bug.x+bug.width<micBox.x,'In the World the bug sits inside the bar at its left end '+JSON.stringify({bug,micBox,bar}));}
 await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));await page.mouse.move(5,5);await page.waitForTimeout(400);await settle();
 {const bug=await order.boundingBox(),micBox=await mic.boundingBox(),bar=await form.boundingBox();
  assert.equal(await order.evaluate(e=>e.parentElement===document.querySelector('.companion-speech-button').parentElement),true,'The bug and the microphone are one group on the desktop');
  assert(bug.width===36&&bug.x>=bar.x&&bug.x-bar.x<=6&&bar.x+bar.width-(micBox.x+micBox.width)<=6&&Math.abs(bug.y-micBox.y)<1,'The bug sits inside the bar at its left end, the microphone at its right '+JSON.stringify({bug,micBox,bar}));
  assert.equal(bar.width,168);
  const crop=await page.evaluate(()=>(window as any).worldletCompanionGeometry());assert(crop.x<=bar.x&&crop.x+crop.width>=bar.x+bar.width);
  await page.screenshot({path:'/tmp/worldlet-companion-desktop-order.png',omitBackground:true,clip:crop});}
 await page.evaluate(()=>(window as any).worldletDesktopCompanion(false));await settle();
 {const bug=await order.boundingBox(),bar=await form.boundingBox();assert(bug.x>=bar.x&&bug.x+bug.width<=bar.x+bar.width,'Back in the World the bug is still inside the bar');}
 await page.evaluate(()=>{(window as any).orderReady=false;window.dispatchEvent(new Event('worldlet:app-update'));});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.companion-order-button').hidden);
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
 assert.deepEqual(errors,[]);
 console.log('PASS desktop Companion UI: Fox and its bar alone on the desktop, microphone and bug inside the bar, compact animated typing, microphone hold, reply, desktop context, native crop, responsive layouts and restoration');
});
