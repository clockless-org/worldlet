// Fox's page out of sight (#1175, owner feedback 2026-10-02), driven through the real World UI with
// a faked native bridge that declares browserTaskPictureInPicture (the CEF website engine).
// - When Fox starts working on the page, the person keeps it full size in the Applet, and Fox gets a
//   copy of it in the panel's top-right corner (owner request 2026-10-09, FOX_COPY): the copy keeps
//   the panel's size as its own and carries Fox's glow. No window moves the page to the World's
//   bottom-right. A press on the copy takes Fox's page into the panel; after Fox's turn the copy
//   stays until closed; a host without a copy leaves Fox on the panel's page.
// - When the person leaves the Applet while Fox works, Fox's page (the copy) is never hidden: the host draws it in
//   a small screen over the Applet's device (owner decision 2026-10-02), the screen's slot as the rect
//   with the panel's size as the page's own size and `press`, and Fox's next steps still reach it.
//   Where the device is not drawn the rect is zero.
// - The screen (or opening the Applet) returns the page to the panel at the same size; Fox keeps
//   working there.
// - After Fox's turn the page out of sight is left like any page left behind, the screen goes and the
//   device shows a Done mark until the person opens the Applet.
// - While the World window is away for the desktop Companion, the host shows Fox's page beside it;
//   the UI only says whether Fox works.
// - Without the capability Fox works in the panel as before.
// Set TASK_PIP_SHOTS=<dir> to keep screenshots.
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
const shots=process.env.TASK_PIP_SHOTS;
await withBrowser(fileAccess,async browser=>{
type Box={x:number;y:number;width:number;height:number};
async function open({task=true}={}){
 const page=await browser.newPage({viewport:{width:1440,height:840},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(task=>{
  const w=window as any;w.surface=[];w.commands=[];
  const features={localDataDeletion:true,nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,voiceMemos:true,folderManagement:false,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,browserBookmarks:true,installedAppDetection:true,browserFoxOverlay:true,browserPictureInPicture:true,browserTaskPictureInPicture:task,leadingWindowControls:true};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(/^browser(Show|Layout|Hide|Pip)$/.test(b.action))w.surface.push(b);
   if(b.action==='browserCommand'){w.commands.push(b);return {ok:true,documentId:'fixture',elements:[]};}
   if(b.action==='snapshot')return {workspaceId:'task-pip',revision:0,activityRevision:0,hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
   if(b.action==='browserShow')setTimeout(()=>w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url:b.url||'https://www.google.com/',title:'Page'}),0);
   return {ok:true};
  }}}};
 },task);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled&&!document.getElementById('worldStartup'));
 await page.evaluate(()=>{location.hash='object=app-browser';});
 await page.locator('.browser-viewport').waitFor();
 await page.waitForFunction(()=>(window as any).surface.some(b=>b.action==='browserShow'));
 return {page,errors};
}
const last=(page:Page)=>page.evaluate(()=>(window as any).surface.at(-1));
const foxStep=(page:Page)=>page.evaluate(()=>(window as any).worldletExecute('automate_browser',{operation:'snapshot'}));
const foxIdle=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('worldlet:fox-idle')));
const host=(page:Page,value:unknown)=>page.evaluate(v=>(window as any).worldletBrowser(v),value);
const appletOpen=(page:Page)=>page.evaluate(()=>{const c=document.querySelector<HTMLElement>('#notionContent');return !!c&&!c.hidden&&c.dataset.template==='browser';});
// The screen over the device and the Done mark, when they show.
const screen=(page:Page)=>page.evaluate(()=>{const b=document.querySelector<HTMLElement>('.applet-task-screen');if(!b||b.hidden)return null;const r=b.getBoundingClientRect(),s=b.querySelector('.applet-task-screen-slot')!.getBoundingClientRect();return {text:b.textContent||'',label:b.querySelector('.applet-task-screen-bar')?.getAttribute('aria-label')||'',frame:{x:r.x,y:r.y,width:r.width,height:r.height},slot:{x:Math.round(s.x),y:Math.round(s.y),width:Math.round(s.width),height:Math.round(s.height)}};});
const doneMark=(page:Page)=>page.evaluate(()=>{const b=document.querySelector<HTMLElement>('.applet-task-done');if(!b||b.hidden)return null;const r=b.getBoundingClientRect();return {text:b.textContent||'',label:b.getAttribute('aria-label')||'',x:r.x,y:r.y,width:r.width,height:r.height};});
const deviceTop=(page:Page)=>page.evaluate(()=>{const m=((document.querySelector('#notionWorld') as any).sceneMetrics?.modules||[]).find(m=>m.id==='app-browser');const c=document.querySelector('#notionWorld canvas')!.getBoundingClientRect();return m?c.top+m.peekBounds.y:null;});
const taskEvents=(page:Page)=>page.evaluate(()=>(window as any).taskEvents as {applet:string,working:boolean}[]);
const heldByFox=(page:Page)=>page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&b.page&&b.press;});
 {
  const {page,errors}=await open();
  await page.evaluate(()=>{const w=window as any;w.taskEvents=[];document.querySelector('#notionWorld')!.addEventListener('worldlet:fox-task',(e:any)=>w.taskEvents.push(e.detail));});
  const shown:Box=(await page.evaluate(()=>(window as any).surface.find(b=>b.action==='browserShow'))).rect;
  // Fox's first step: the page stays full size in the Applet, and nothing offers to shrink it.
  const first=await foxStep(page);
  assert.ok(!first?.error,'Fox\'s first step reaches the page: '+JSON.stringify(first));
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  await page.waitForTimeout(400);
  const working=await last(page);
  assert.equal(working.action,'browserLayout');assert.deepEqual(working.rect,shown,'the person keeps the page in the panel');assert.equal(working.page,undefined);
  // Fox's copy sits in the panel's top-right corner, smaller, at the panel's size as its own.
  const copy=working.copy;
  assert.ok(copy,'Fox works on a copy of the page: '+JSON.stringify(working));
  assert.deepEqual(copy.page,{width:shown.width,height:shown.height},'the copy lays out at the panel\'s size');
  assert.ok(copy.rect.width<shown.width/2&&copy.rect.width>=280,'the copy is small: '+JSON.stringify(copy.rect));
  assert.ok(copy.rect.x+copy.rect.width<=shown.x+shown.width&&shown.x+shown.width-(copy.rect.x+copy.rect.width)<=16&&copy.rect.y-shown.y<=16&&copy.rect.y>=shown.y,'in the panel\'s top-right corner');
  assert.ok(working.fox,'Fox\'s glow goes with the copy');
  assert.equal(await page.evaluate(()=>document.querySelector('.browser-viewport')!.classList.contains('is-fox-control')),false,'the person\'s page carries no Fox frame');
  assert.equal(await appletOpen(page),true,'the Applet stays open for the person to watch and step in');
  assert.equal(await page.locator('.browser-pip-offer').isVisible(),false,'Picture in picture is not offered for Fox\'s page');
  assert.equal(await page.locator('.browser-task-pip').count(),0,'no task window exists');
  // The person goes back to the World while Fox works: Fox's copy goes to the screen over its device.
  await page.locator('.fox-action-left [data-slot=home]').click();
  await heldByFox(page);
  assert.ok(await page.evaluate(()=>(window as any).surface.some(b=>b.action==='browserLayout'&&b.takeCopy&&b.page&&b.press)),'the copy goes along in place of the person\'s page');
  assert.equal(await appletOpen(page),false,'the person is back in the World');
  assert.ok(!(await page.evaluate(()=>(window as any).surface.some(b=>b.action==='browserHide'))),'the page was never hidden');
  assert.deepEqual((await taskEvents(page)).at(-1),{applet:'app-browser',working:true},'the World hears Fox works on the Browser Applet');
  const visible=await page.evaluate(()=>((document.querySelector('#notionWorld') as any).sceneMetrics?.modules||[]).some(m=>m.id==='app-browser'&&m.visible!==false));
  assert.ok(visible,'the Browser device is drawn in the World the person returns to');
  await page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&b.page&&b.rect.width>0;});
  const away=await last(page),shownScreen=await screen(page);
  assert.ok(shownScreen&&/Fox is working|…/.test(shownScreen.text)&&/Browser/.test(shownScreen.label),'the device carries the running screen: '+JSON.stringify(shownScreen));
  // The screen's bar says the step Fox is on, from the conversation or from this Applet's task only.
  const barText=()=>page.evaluate(()=>document.querySelector('.applet-task-screen-label')?.textContent);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-step',{detail:{text:'Filling in the form…'}})));
  assert.equal(await barText(),'Filling in the form…');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-step',{detail:{text:'Opening amazon.com…',applet:'app-amazon'}})));
  assert.equal(await barText(),'Filling in the form…','another Applet\'s task step is not this screen\'s');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-step',{detail:{text:'Thinking…',applet:'app-browser'}})));
  assert.equal(await barText(),'Thinking…');
  assert.deepEqual(away.rect,shownScreen.slot,'the host draws Fox\'s page exactly in the screen\'s slot');
  assert.deepEqual(away.page,{width:shown.width,height:shown.height},'the page keeps the panel\'s size');
  assert.ok(away.fox,'Fox\'s glow stays with the page');
  assert.ok(away.rect.width<shown.width/3,'the screen is small');
  const top=await deviceTop(page);
  assert.ok(top!=null&&shownScreen.frame.y+shownScreen.frame.height<=top,'the screen sits over the device\'s head: '+JSON.stringify({frame:shownScreen.frame,top}));
  const view=page.viewportSize()!;
  assert.ok(shownScreen.frame.x+shownScreen.frame.width<view.width-40||shownScreen.frame.y+shownScreen.frame.height<view.height-200,'not the bottom-right picture in picture');
  if(shots)await page.screenshot({path:path.join(shots,'applet-task-screen.png')});
  // Fox's next steps still reach its page.
  const commands=await page.evaluate(()=>(window as any).commands.length);
  assert.ok(!(await foxStep(page))?.error,'Fox\'s next step reaches the page in the screen');
  assert.ok(await page.evaluate(n=>(window as any).commands.length>n,commands),'the step went to the host');
  // The screen's bar returns to the Applet with the page (the host reports a press on the page itself).
  await page.locator('.applet-task-screen-bar').click();
  await page.waitForFunction(()=>{const c=document.querySelector<HTMLElement>('#notionContent');return !!c&&!c.hidden&&c.dataset.template==='browser';});
  await page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&!b.page&&b.rect.width>0;});
  const back=await last(page);
  assert.deepEqual({width:back.rect.width,height:back.rect.height},{width:shown.width,height:shown.height},'the page returns to the panel at the same size');
  assert.ok(back.fox,'Fox is still working on it');
  assert.equal(await screen(page),null,'the screen leaves with the page');
  // Leaving again, a press the host reports on the page in the screen also opens the Applet.
  await page.locator('.fox-action-left [data-slot=home]').click();
  await heldByFox(page);
  await host(page,{phase:'task-pip',event:'press'});
  await page.waitForFunction(()=>{const c=document.querySelector<HTMLElement>('#notionContent');return !!c&&!c.hidden&&c.dataset.template==='browser';});
  // Leaving again, then Fox's turn ends: the page is left like any page, the screen goes and a Done mark stays.
  await page.locator('.fox-action-left [data-slot=home]').click();
  await heldByFox(page);
  await foxIdle(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.action==='browserHide');
  assert.deepEqual((await taskEvents(page)).at(-1),{applet:'app-browser',working:false});
  assert.equal(await screen(page),null,'no screen after Fox\'s turn');
  await page.waitForFunction(()=>!document.querySelector<HTMLElement>('.applet-task-done')?.hidden);
  const mark=await doneMark(page),markTop=await deviceTop(page);
  assert.ok(mark&&/Done/.test(mark.text)&&/Browser/.test(mark.label),'the device says Fox is done: '+JSON.stringify(mark));
  assert.equal(await page.locator('.applet-task-done .applet-task-check').textContent(),'✓','done is a green check, not an exclamation');
  assert.ok(markTop!=null&&mark.y+mark.height<=markTop+1,'the Done mark sits over the device');
  if(shots)await page.screenshot({path:path.join(shots,'applet-task-done.png')});
  await page.locator('.applet-task-done').click();
  await page.waitForFunction(()=>{const c=document.querySelector<HTMLElement>('#notionContent');return !!c&&!c.hidden&&c.dataset.template==='browser';});
  assert.equal(await page.locator('.applet-task-done').count(),0,'opening the Applet clears the Done mark');
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS Fox works on a copy in the panel\'s corner while the person keeps the page; leaving shows it live in a small screen over the device; the screen returns to it; after Fox\'s turn the device shows Done until opened');
 }
 {
  // Fox's copy in the panel: pressed, Fox's page takes the panel; after Fox's turn it stays until its close.
  const {page,errors}=await open();
  const shown:Box=(await page.evaluate(()=>(window as any).surface.find(b=>b.action==='browserShow'))).rect;
  await foxStep(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.copy);
  if(shots)await page.screenshot({path:path.join(shots,'fox-copy.png')});
  await host(page,{phase:'fox-copy',event:'press'});
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.takeCopy);
  const taken=await last(page);
  assert.deepEqual(taken.rect,shown,'Fox\'s page takes the panel');assert.equal(taken.copy,undefined);
  await page.waitForTimeout(200);
  assert.equal((await last(page)).copy,undefined,'no new copy this turn: Fox goes on in the panel');
  assert.ok(!(await foxStep(page))?.error,'Fox\'s next step reaches the page in the panel');
  await page.waitForTimeout(200);
  assert.equal((await last(page)).copy,undefined);
  await foxIdle(page);
  // Next turn: a new copy; after it, the copy stays; its close (only after the turn) closes it.
  await foxStep(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.copy);
  await host(page,{phase:'fox-copy',event:'close'});
  await page.waitForTimeout(200);
  assert.ok((await last(page)).copy,'the copy cannot be closed while Fox works on it');
  await foxIdle(page);
  await page.waitForTimeout(200);
  assert.ok((await last(page)).copy,'after Fox\'s turn the copy stays with Fox\'s result');
  await host(page,{phase:'fox-copy',event:'close'});
  await page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&!b.copy;});
  assert.deepEqual((await last(page)).rect,shown,'the person\'s page stays');
  // A page Fox opens loads in its copy; the person's page stays where it is.
  const shows=await page.evaluate(()=>(window as any).surface.filter(b=>b.action==='browserShow').length);
  const opened=await page.evaluate(()=>(window as any).worldletExecute('automate_browser',{operation:'open',url:'https://example.com/'}));
  assert.ok(!opened?.error,'Fox opens a page: '+JSON.stringify(opened));
  assert.ok((await last(page)).copy,'in a new copy');
  assert.equal(await page.evaluate(()=>(window as any).surface.filter(b=>b.action==='browserShow').length),shows,'the person\'s page did not move');
  assert.equal(await page.evaluate(()=>(window as any).commands.at(-1)?.args?.operation),'open','the host opens it in the copy');
  await foxIdle(page);
  await host(page,{phase:'fox-copy',event:'close'});
  await page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&!b.copy;});
  // A host without a copy (a page not on the website engine) leaves Fox on the panel's page, framed.
  await foxStep(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.copy);
  await host(page,{phase:'fox-copy',event:'ended'});
  await page.waitForFunction(()=>document.querySelector('.browser-viewport')!.classList.contains('is-fox-control'));
  assert.equal((await last(page)).copy,undefined);
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS Fox\'s copy: a press takes Fox\'s page into the panel; after Fox\'s turn it stays until closed; without one Fox works in the panel');
 }
 {
  // The World window goes away for the desktop Companion while Fox works: the host shows Fox's page
  // beside the Companion, so the UI only tells it whether Fox works, and Fox's steps go on. Back in
  // the World the page is where it was. Closed beside the Companion after Fox's turn, the World's
  // window ends too.
  const {page,errors}=await open();
  await foxStep(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  await page.locator('.fox-action-left [data-slot=home]').click();
  await heldByFox(page);
  const sent=await page.evaluate(()=>(window as any).surface.length);
  await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));
  await page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&b.rect.width===0&&b.press;});
  const away=await last(page);
  assert.ok(away.fox&&away.page,'the host hears that Fox works on the page it shows beside the Companion: '+JSON.stringify(away));
  const commands=await page.evaluate(()=>(window as any).commands.length);
  assert.ok(!(await foxStep(page))?.error,'Fox\'s next step reaches the page while the World is away');
  assert.ok(await page.evaluate(n=>(window as any).commands.length>n,commands));
  await foxIdle(page);
  await page.waitForFunction(()=>{const b=(window as any).surface.at(-1);return b?.action==='browserLayout'&&b.rect.width===0&&!b.fox;});
  assert.ok(await page.evaluate(n=>(window as any).surface.slice(n).every(b=>b.action==='browserLayout'),sent),'nothing hid or reopened the page while away');
  // Back in the World after Fox's turn, the page is left like any page and no screen stays.
  await page.evaluate(()=>(window as any).worldletDesktopCompanion(false));
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.action==='browserHide');
  assert.equal(await screen(page),null,'no screen is left in the World');
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS with the World away for the desktop Companion, Fox\'s page stays Fox\'s beside it; back after Fox\'s turn it is left like any page');
 }
 {
  // Ordinary browsing: the host stops pages when the World goes away; back in the World the panel
  // opens its page again instead of staying blank.
  const {page,errors}=await open();
  const shows=await page.evaluate(()=>(window as any).surface.filter(b=>b.action==='browserShow').length);
  await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>(window as any).surface.at(-1)?.press),undefined,'nothing of Fox\'s is held');
  await page.evaluate(()=>(window as any).worldletDesktopCompanion(false));
  await page.waitForFunction(n=>(window as any).surface.filter(b=>b.action==='browserShow').length>n,shows);
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS ordinary browsing: back from the desktop Companion the panel opens its page again');
 }
 {
  // A host that draws pages at their own size only (Electron's views): Fox works in the panel.
  const {page,errors}=await open({task:false});
  const shown:Box=(await page.evaluate(()=>(window as any).surface.find(b=>b.action==='browserShow'))).rect;
  await foxStep(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  const working=await last(page);
  assert.equal(working.action,'browserLayout');assert.deepEqual(working.rect,shown);assert.equal(working.page,undefined);assert.equal(working.copy,undefined,'no copy');
  assert.equal(await appletOpen(page),true,'the Applet stays open');
  assert.equal(await page.locator('.browser-task-pip').count(),0,'no task window');
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS without browserTaskPictureInPicture Fox works in the panel as before');
 }
});
