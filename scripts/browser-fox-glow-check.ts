import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
import {GLOW_PAGE} from '../platform/electron/src/modules/browser/glow-page.ts';
// Fox working on a page: the frame turns colorful and the host draws the page's one status, a card
// listing Fox's steps (ticked as Fox moves on, then Fox's result, #1619), over the page, which keeps
// its rect, until Fox's turn ends, through a World refresh too (#967). Hosts that cannot draw over
// the page keep the inset ring.
// The World's Back button is a darker frosted control like Fox's three controls (#951).
// Set FOX_GLOW_SHOTS=<dir> to keep screenshots.
const shots=process.env.FOX_GLOW_SHOTS;
await withBrowser(fileAccess,async browser=>{
async function open({overlay=true,reducedMotion='reduce' as 'reduce'|'no-preference',place='object=app-browser'}={}){
 const page=await browser.newPage({viewport:{width:1440,height:840},reducedMotion}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(overlay=>{
  const w=window as any;w.surface=[];
  const features={localDataDeletion:true,nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,voiceMemos:true,folderManagement:false,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,browserBookmarks:true,installedAppDetection:true,browserFoxOverlay:overlay};
  // Kept on the page so a check can send it again as a newer snapshot (a World refresh).
  w.fixture={workspaceId:'fox-glow',revision:0,hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(/^browser(Show|Layout|Hide)$/.test(b.action))w.surface.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad')return null;
   if(b.action==='browserCommand')return {ok:true,documentId:'fixture',elements:[]};
   return {ok:true};
  }}}};
 },overlay);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length>0);
 await page.evaluate(place=>location.hash=place,place);
 await page.locator('.browser-viewport').waitFor();
 await page.waitForFunction(()=>(window as any).surface.some(b=>b.action==='browserShow'));
 return {page,errors};
}
const last=page=>page.evaluate(()=>(window as any).surface.at(-1));
const foxWorks=page=>page.evaluate(()=>{void (window as any).worldletExecute('automate_browser',{operation:'snapshot'});});
const frameImage=page=>page.evaluate(()=>getComputedStyle(document.querySelector('#notionContent')).backgroundImage);
// The panel zooms open (with motion allowed) and lays the page out on every frame of that zoom;
// wait until it has finished and its layouts have stopped, so later layouts are the check's own.
async function opened(page){
 await page.evaluate(()=>Promise.all(document.querySelector('#notionContent').getAnimations().map(a=>a.finished)));
 let count=-1;const deadline=Date.now()+15000;
 for(;;){const now=await page.evaluate(()=>(window as any).surface.length);if(now===count)return;assert.ok(Date.now()<deadline,'the opened panel stops laying out its page');count=now;await page.waitForTimeout(300);}
}
 {
  const {page,errors}=await open();
  const shown=(await page.evaluate(()=>(window as any).surface.find(b=>b.action==='browserShow'))).rect;
  assert.doesNotMatch(await frameImage(page),/conic-gradient/,'the frame is plain before Fox works');
  if(shots)await page.screenshot({path:path.join(shots,'fox-glow-before.png')});
  await foxWorks(page);
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  const working=await last(page);
  assert.equal(working.action,'browserLayout');
  assert.deepEqual(working.rect,shown,'the page keeps its size and place while Fox works');
  assert.equal(working.fox.label,'🦊 Fox is working on this page');
  assert.deepEqual(working.fox.colors,['#ff8a3d','#ffd166','#6ee7a8','#4cc9f0','#a78bfa','#f472b6','#ff8a3d'],'the host glows with the frame palette');
  assert.equal(working.fox.turnSeconds,0,'reduced motion keeps the glow still');
  assert.equal(working.fox.phaseSeconds,0);
  assert.equal(working.fox.steps,undefined,'no steps before Fox takes one');
  // The page's card is where its status lives (owner feedback 2026-10-02): Fox's steps, each ticked
  // once Fox moves on, with Thinking in the heading, never as a step (#1619).
  const step=text=>page.evaluate(text=>window.dispatchEvent(new CustomEvent('worldlet:fox-step',{detail:{text}})),text);
  await step('Filling in the form…');
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox?.steps?.length===1);
  assert.deepEqual((await last(page)).fox.steps,[{text:'Filling in the form',done:false}]);
  assert.equal((await last(page)).fox.label,'🦊 Fox is working on this page','the step is said once, in the list, not again in the heading');
  await step('Thinking…');
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox?.label==='🦊 Fox · Thinking…');
  assert.deepEqual((await last(page)).fox.steps,[{text:'Filling in the form',done:true}],'thinking ticks the step before it');
  await step('Click Continue…');
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox?.steps?.length===2);
  assert.deepEqual((await last(page)).fox.steps,[{text:'Filling in the form',done:true},{text:'Click Continue',done:false}]);
  assert.match(await frameImage(page),/conic-gradient/,'the existing frame turns colorful');
  const slot=await page.evaluate(()=>{const s=document.querySelector('.browser-viewport'),c=getComputedStyle(s);return {background:c.backgroundImage,fill:c.backgroundColor,label:getComputedStyle(s,'::after').content,shadow:c.boxShadow};});
  assert.deepEqual(slot,{background:'none',fill:'rgba(0, 0, 0, 0)',label:'none',shadow:'none'},'no second ring, glow or floating badge in the World page; the frame fills the seam at the page edge');
  if(shots)await page.screenshot({path:path.join(shots,'fox-glow-working.png')});
  // Fox's turn ends: the card says Done, ticks every step and shows the start of Fox's reply.
  await page.evaluate(()=>{
   window.dispatchEvent(new CustomEvent('worldlet:fox-reply',{detail:{outcome:'complete',message:'**Done.** You are signed up for the [newsletter](https://example.com).'}}));
   window.dispatchEvent(new Event('worldlet:fox-idle'));
  });
  await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox?.finished===true);
  const finished=(await last(page)).fox;
  assert.equal(finished.label,'🦊 Fox · Done');
  assert.deepEqual(finished.steps,[{text:'Filling in the form',done:true},{text:'Click Continue',done:true}]);
  assert.equal(finished.result,'Done. You are signed up for the newsletter.','the result is plain text in the same card');
  assert.deepEqual((await last(page)).rect,shown,'the page stays put when Fox finishes');
  assert.doesNotMatch(await frameImage(page),/conic-gradient/,'the frame returns to normal');
  // A few seconds later the card leaves too.
  await page.waitForFunction(()=>!(window as any).surface.at(-1)?.fox,null,{timeout:12000});
  // A turn that never took a page step leaves no card behind.
  await foxWorks(page);await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:fox-idle')));
  await page.waitForFunction(()=>!(window as any).surface.at(-1)?.fox);
  // A website page's Back is its toolbar's (owner request 2026-10-09): in the panel above the page, left of the address.
  // It works once the page has somewhere to go back to.
  await page.evaluate(()=>(window as any).worldletBrowser({phase:'page',platform:'web',loading:false,title:'Page',url:'https://example.com/next',canBack:true,canForward:false}));
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.browser-toolbar>.browser-back').disabled);
  {const back=await page.locator('.browser-back').boundingBox(),address=await page.locator('.browser-toolbar>.browser-address').boundingBox(),page_=await page.locator('.browser-viewport').boundingBox();
   assert.ok(back.x+back.width<address.x&&back.y+back.height<=page_.y,'Back sits left of the address, above the page '+JSON.stringify({back,address,page:page_}));}
  if(shots){const box=await page.locator('.browser-back').boundingBox();await page.screenshot({path:path.join(shots,'back-button.png'),clip:{x:Math.max(0,box.x-40),y:0,width:box.width+400,height:box.y+box.height+40}});}
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS Fox working: page keeps its rect, the frame turns colorful, the host gets the steps card, ticks each step, shows Fox\'s result when Fox finishes, then clears; the toolbar\'s Back sits above the page.');
 }
 {
  const {page,errors}=await open({reducedMotion:'no-preference'});
  await foxWorks(page);await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  const turning=(await last(page)).fox;
  assert.equal(turning.turnSeconds,2.4,'the glow turns with the frame');
  assert.ok(turning.phaseSeconds>=0&&turning.phaseSeconds<2.4,'the glow starts where the frame\'s turn is: '+turning.phaseSeconds);
  // A later layout while Fox works moves the glow with the page but does not restart its turn.
  const sent=await page.evaluate(()=>(window as any).surface.length);
  await page.setViewportSize({width:1400,height:820});
  await page.waitForFunction(sent=>(window as any).surface.length>sent,sent);
  const moved=await last(page);
  assert.ok(moved.fox&&moved.action==='browserLayout','the resized page keeps its glow');
  await page.waitForTimeout(300);const settled=await page.evaluate(()=>(window as any).surface.length);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>(window as any).surface.length),settled,'a turning glow sends no layout churn');
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await open({overlay:false});
  const shown=(await page.evaluate(()=>(window as any).surface.find(b=>b.action==='browserShow'))).rect;
  await foxWorks(page);
  await page.waitForFunction(shown=>{const b=(window as any).surface.at(-1);return b.action==='browserLayout'&&b.rect.y>shown.y;},shown);
  const inset=await last(page);
  assert.equal(inset.fox,undefined,'a host without glow gets no glow request');
  assert.ok(inset.rect.width<shown.width&&inset.rect.height<shown.height,'without host glow the page is inset for the ring');
  assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('.browser-viewport'),'::after').content),/Fox is working on this page/);
  assert.doesNotMatch(await frameImage(page),/conic-gradient/);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS hosts without glow keep the inset ring and label; motion follows the reduced-motion preference.');
 }
 {
  // A World refresh while Fox works (#967). A newer snapshot re-renders the open page: the X
  // reader (#note=device-x, where Fox's browse_web opens pages) opens again and mounts the
  // panel afresh. That used to reset Fox's control, so the next layout went without `fox` and
  // the host dropped Fox's glow and pointer mid-task.
  const {page,errors}=await open({place:'note=device-x',reducedMotion:'no-preference'});
  // A refresh of a page that is still zooming open could meet one of the zoom's layouts first.
  await opened(page);
  // The person had reached a post, so the refreshed panel shows that remembered page again
  // (browserShow with resume) instead of only laying out the same one.
  await page.evaluate(()=>(window as any).worldletBrowser({phase:'page',platform:'x',loading:false,title:'Post',url:'https://x.com/avery/status/123456'}));
  await foxWorks(page);await page.waitForFunction(()=>(window as any).surface.at(-1)?.fox);
  const turn=()=>page.evaluate(()=>document.querySelector('#notionContent').getAnimations().find(a=>(a as CSSAnimation).animationName==='fox-ring-turn')?.startTime);
  const turning=await turn();
  assert.ok(typeof turning==='number','the frame turns while Fox works');
  const sent=await page.evaluate(()=>{const w=window as any;document.querySelector('.browser-viewport').classList.add('before-refresh');w.fixture.revision++;void w.worldletReceive(structuredClone(w.fixture));return w.surface.length;});
  // The refresh re-rendered the panel: a new slot replaced the one Fox started on.
  await page.waitForFunction(()=>document.querySelector('.browser-viewport')&&!document.querySelector('.browser-viewport.before-refresh'));
  await page.waitForFunction(sent=>(window as any).surface.length>sent,sent);
  await page.waitForTimeout(300);
  const refreshed=await page.evaluate(sent=>(window as any).surface.slice(sent),sent);
  assert.equal(refreshed[0].action,'browserShow','the refreshed panel shows the remembered page again');
  assert.ok(refreshed.every(b=>b.fox?.label==='🦊 Fox is working on this page'),'every layout after the refresh keeps Fox\'s glow: '+JSON.stringify(refreshed.map(b=>b.action+(b.fox?'+fox':''))));
  assert.match(await frameImage(page),/conic-gradient/,'the frame stays colorful');
  assert.deepEqual(await page.evaluate(()=>{const s=document.querySelector<HTMLElement>('.browser-viewport');return [s.classList.contains('is-fox-control'),s.dataset.foxOverlay];}),[true,'host'],'the new slot takes over Fox\'s control');
  // Start times carry float noise (4175.1 vs 4175.099999999999); a restart would move it by far more than 1 ms.
  const kept=await turn();
  assert.ok(typeof kept==='number'&&Math.abs(kept-turning)<1,`the frame keeps its turn, in step with the host's glow, which never restarts: ${kept} vs ${turning}`);
  // Control is kept, not merely unsent: the next layout still carries the glow, until Fox's turn ends.
  const before=await page.evaluate(()=>(window as any).surface.length);
  await page.setViewportSize({width:1400,height:820});
  await page.waitForFunction(n=>(window as any).surface.length>n,before);
  assert.ok((await last(page)).fox,'a later layout still carries the glow');
  await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:fox-idle')));
  await page.waitForFunction(()=>!(window as any).surface.at(-1)?.fox);
  assert.doesNotMatch(await frameImage(page),/conic-gradient/,'the frame returns to normal when Fox finishes');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS a World refresh while Fox works re-renders the panel without dropping the glow or restarting its turn; Fox finishing clears it (#967).');
 }
 {
  // The host's overlay page: the glow reaches right into every corner of the page, so no sliver of
  // a less rounded page shows white between the glow and the frame (owner report 2026-10-04).
  const page=await browser.newPage({viewport:{width:480,height:320}}),errors=pageErrors(page);
  await page.setContent(GLOW_PAGE);
  await page.evaluate(()=>(window as any).glow.apply({label:'🦊 Fox is working on this page',colors:['#ff8a3d','#f472b6','#ff8a3d'],turnSeconds:0,phaseSeconds:0,steps:[],earlier:0,result:'',finished:false}));
  const corners=await page.evaluate(async()=>{
   const root=document.getElementById('root'),paint=document.getElementById('paint');
   const image=new Image();image.src=/url\("?(.*?)"?\)$/.exec(paint.style.webkitMaskImage)[1];await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const g=canvas.getContext('2d');g.drawImage(image,0,0);
   const alpha=(x,y)=>g.getImageData(x,y,1,1).data[3];
   const w=image.width-1,h=image.height-1,mid=Math.round(h/2);
   return {radius:getComputedStyle(root).borderRadius,size:[image.width,image.height],corners:[alpha(0,0),alpha(w,0),alpha(0,h),alpha(w,h)],side:alpha(0,mid),inner:alpha(Math.round(w/2),mid)};
  });
  assert.equal(corners.radius,'0px','the overlay is not rounded short of the page corners');
  assert.deepEqual(corners.size,[480,320]);
  for(const alpha of corners.corners)assert.ok(alpha>=corners.side-1,`every corner glows as strongly as the sides: ${JSON.stringify(corners)}`);
  assert.equal(corners.inner,0,'the middle of the page stays clear');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS the overlay\'s glow reaches every corner of the page, leaving no sliver between it and the frame.');
 }
});
