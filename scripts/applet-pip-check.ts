// Picture in picture for website Applets (#919, #950, core/browser/picture-in-picture.ts), driven
// through the real World UI with a faked native bridge. The offer on the top bar (#951) shows
// only while the page plays a video, never while Fox drives it and never on a host without
// browserPictureInPicture. Choosing it returns to the World with the page as a 16:9 window in the
// World's right third that covers neither Fox, its dialogue nor the footer; the person can resize
// it and the size is kept. Inside another Applet it waits out of sight and returns in the World.
// Choosing it on another site's video moves the one window there. Pressing the window returns to
// the Applet with the same page; Close leaves the page kept and paused, like any page left behind.
// Set PIP_SHOTS=<dir> to keep screenshots.
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {launchTestBrowser,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {PICTURE_IN_PICTURE} from '../core/browser/index.ts';
const shots=process.env.PIP_SHOTS;
const browser=await launchTestBrowser({args:['--allow-file-access-from-files']});
type Box={x:number;y:number;width:number;height:number};
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
async function open({pip=true,width=1440,height=840,share=null as number|null}={}){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(([pip,share])=>{
  const w=window as any;w.calls=[];
  if(share!==null)localStorage.setItem('worldlet-pip-share-v1',JSON.stringify(share));
  const features={localDataDeletion:true,nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,voiceMemos:true,folderManagement:false,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,browserBookmarks:true,installedAppDetection:true,browserFoxOverlay:true,browserPictureInPicture:pip,leadingWindowControls:true};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(/^browser(Show|Layout|Hide|Pip)$/.test(b.action))w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'pip-check',revision:0,activityRevision:0,hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
   if(b.action==='browserCommand')return {ok:true,documentId:'fixture',elements:[]};
   // The native panel reports the page it shows.
   if(b.action==='browserShow')setTimeout(()=>w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url:b.url||(b.platform==='youtube'?'https://www.youtube.com/watch?v=pip':'https://x.com/home'),title:'Page'}),0);
   return {ok:true};
  }}}};
 },[pip,share] as const);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled&&!document.getElementById('worldStartup'));
 return {page,errors};
}
const calls=(page:Page,action:string)=>page.evaluate(a=>(window as any).calls.filter(c=>c.action===a),action);
const count=async(page:Page,action:string)=>(await calls(page,action)).length;
const host=(page:Page,value:any)=>page.evaluate(v=>(window as any).worldletBrowser(v),value);
async function enter(page:Page,key:string){
 const shows=await count(page,'browserShow');
 await page.evaluate(id=>{if(location.hash==='#object='+id)history.replaceState(null,'','#');location.hash='object='+id;},'app-'+key);
 await page.waitForFunction(k=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===k&&!document.querySelector<HTMLElement>('#notionContent').hidden,key);
 await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserShow').length>n,shows);
 return (await calls(page,'browserShow')).at(-1);
}
async function settled(page:Page){
 await page.waitForFunction(()=>new Promise(done=>{const at=()=>JSON.stringify(document.querySelector('.browser-pip')?.getBoundingClientRect());const first=at();setTimeout(()=>done(at()===first),400);}),undefined,{polling:500});
}
const offer=(page:Page)=>page.locator('.browser-pip-offer');
const frame=(page:Page)=>page.locator('.browser-pip');
async function rects(page:Page){
 return page.evaluate(()=>{
  const box=(s:string)=>{const e=document.querySelector<HTMLElement>(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
  return {frame:box('.browser-pip'),slot:box('.browser-pip-video'),fox:box('.companion-avatar'),dock:box('.companion-dock'),hud:box('#notionHUD'),dialogue:box('#companionDialogue'),footer:box('.world-watermark'),panel:box('#notionContent'),back:box('.browser-back'),offer:box('.browser-pip-offer')};
 });
}
// The window: 16:9, its frame `share` of the World with the margin all round unless it had to
// narrow, at the right edge, the native rect exactly its slot, and clear of Fox, its dialogue,
// the footer and an open Applet panel.
const {margin,minWidth,maxShare}=PICTURE_IN_PICTURE;
async function assertWindow(page:Page,sent:Box,label:string,share:number|null=PICTURE_IN_PICTURE.share){
 const r=await rects(page),view=page.viewportSize();
 assert.ok(r.frame&&r.slot,label+': the window shows');
 assert.deepEqual(sent,{x:Math.round(r.slot.x),y:Math.round(r.slot.y),width:Math.round(r.slot.width),height:Math.round(r.slot.height)},label+': the host draws the page exactly in the slot');
 assert.ok(sent.width>=minWidth&&r.frame.width<=view.width*maxShare,label+': width '+sent.width);
 if(share!==null)assert.equal(Math.round(r.frame.width),Math.round(view.width*share-2*margin),label+': the frame takes its share of the World');
 assert.ok(Math.abs(sent.height-sent.width*9/16)<=1,label+': 16:9, '+sent.width+'x'+sent.height);
 assert.equal(Math.round(r.frame.x+r.frame.width),view.width-PICTURE_IN_PICTURE.margin,label+': at the right edge');
 assert.ok(r.frame.y+r.frame.height<=view.height-margin&&r.frame.y>=margin,label+': inside the World');
 // At its default size it keeps to the lower part; a larger chosen size may have to move up past Fox.
 if(share===PICTURE_IN_PICTURE.share)assert.ok(r.frame.y>view.height/4,label+': in the lower part of the World '+JSON.stringify(r));
 for(const [name,box] of Object.entries({fox:r.fox,dock:r.dock,hud:r.hud,dialogue:r.dialogue,footer:r.footer,panel:r.panel}))if(box)assert.ok(!overlaps(r.frame,box),label+': the window covers '+name+' '+JSON.stringify({frame:r.frame,[name]:box}));
 return r;
}
const lastPip=async(page:Page)=>(await calls(page,'browserPip')).at(-1);
try{
 {
  const {page,errors}=await open();
  let shown=await enter(page,'youtube');
  assert.equal(shown.applet,'youtube');
  assert.equal(await offer(page).isVisible(),false,'no offer before a video plays');
  await host(page,{phase:'video',platform:'youtube',playing:true});
  await offer(page).waitFor();
  // The page has one before it, so its Back shows (owner request 2026-10-07: only with somewhere to go).
  await host(page,{phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/watch?v=pip',title:'Page',canBack:true});
  await page.locator('.browser-back:not([hidden])').waitFor();
  // At the end of the bar's row, above the panel, in the material of Fox's round controls (the page's Back, Focus and
  // Refresh are its toolbar's, in the panel, owner request 2026-10-09).
  const props=['backgroundColor','color','borderTopColor','borderTopWidth','height','backdropFilter','boxShadow'];
  const style=await page.evaluate(props=>{const pick=(e:Element)=>Object.fromEntries(props.map(p=>[p,getComputedStyle(e)[p]]));return {fox:pick(document.querySelector('.companion-controls>.companion-world-button')),offer:pick(document.querySelector('.browser-pip-offer'))};},props);
  assert.deepEqual(style.offer,style.fox,'the offer is the same control as Fox\'s');
  let r=await rects(page);
  assert.ok(r.offer.y+r.offer.height<=r.panel.y&&r.offer.x+r.offer.width<=r.panel.x+r.panel.width&&r.offer.x+r.offer.width>=r.panel.x+r.panel.width-24,'the offer ends the bar\'s row above the panel: '+JSON.stringify({offer:r.offer,panel:r.panel}));
  assert.equal(await offer(page).textContent(),'Picture in picture');
  if(shots)await page.screenshot({path:path.join(shots,'pip-offer.png')});
  // Fox driving the page keeps it in the panel.
  await page.evaluate(()=>{void (window as any).worldletExecute('automate_browser',{operation:'snapshot'});});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('.browser-pip-offer').hidden);
  await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:fox-idle')));
  await offer(page).waitFor();
  await host(page,{phase:'video',platform:'youtube',playing:false});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('.browser-pip-offer').hidden);
  await host(page,{phase:'video',platform:'youtube',playing:true});
  await offer(page).waitFor();
  console.log('PASS the offer shows at the end of the Applet\'s top bar, in Fox\'s control style, only while a video plays and Fox is not driving the page.');

  // Choosing it returns to the World with the page as the window, not hidden.
  const hides=await count(page,'browserHide');
  await offer(page).click();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserPip'));
  assert.equal(await count(page,'browserHide'),hides,'the page is not hidden: it becomes the window');
  // The World settles around the window (Fox's card, the dock) after it opens; a busy host may place it
  // once around a passing layout first (Mac RC 3075). Read it when it has stayed put for a moment.
  await settled(page);
  let pip=await lastPip(page);
  assert.equal(pip.applet,'youtube');assert.equal(pip.live[0],'youtube','the window\'s page counts as live');
  assert.notEqual(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.depth),'object','back in the World');
  r=await assertWindow(page,pip.rect,'World');
  assert.equal(Math.round(r.frame.x),Math.round(1440*2/3+margin),'by default the right third');
  assert.equal(await offer(page).isVisible(),false);
  assert.equal(await frame(page).getByRole('button',{name:'Return to YouTube'}).textContent(),'YouTube');
  assert.equal(await frame(page).getByRole('button',{name:'Close picture in picture'}).isVisible(),true);
  // No shrink or fade, with reduced motion and without.
  assert.deepEqual(await page.evaluate(()=>['.browser-pip','.browser-pip-offer'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [c.animationName,c.transitionDuration];})),[['none','0s'],['none','0s']]);
  if(shots)await page.screenshot({path:path.join(shots,'pip-world.png')});

  // Resizing from the corner grip: bigger by dragging, smaller by keyboard, the size kept.
  const grip=await page.locator('.browser-pip-grip').boundingBox(),wide=pip.rect.width;
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(grip.x-110,grip.y-60,{steps:8});await page.mouse.up();
  await page.waitForFunction(w=>(window as any).calls.filter(c=>c.action==='browserPip').at(-1).rect?.width>w+80,wide);
  const grown=JSON.parse(await page.evaluate(()=>localStorage.getItem('worldlet-pip-share-v1')));
  assert.ok(grown>PICTURE_IN_PICTURE.share&&grown<=maxShare,'the chosen size is kept: '+grown);
  await page.waitForTimeout(200);await assertWindow(page,(await lastPip(page)).rect,'resized',grown);
  await page.locator('.browser-pip-grip').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(g=>JSON.parse(localStorage.getItem('worldlet-pip-share-v1'))<g,grown);
  const chosen=JSON.parse(await page.evaluate(()=>localStorage.getItem('worldlet-pip-share-v1')));
  await page.waitForTimeout(200);await assertWindow(page,(await lastPip(page)).rect,'resized by keyboard',chosen);
  if(shots)await page.screenshot({path:path.join(shots,'pip-resized.png')});
  console.log('PASS the window opens in the World\'s right third, clear of Fox, its dialogue and the footer; the grip resizes it and the size is kept.');

  // Another Applet: the window waits out of sight, still live, and returns in the World.
  const ends=(await calls(page,'browserPip')).filter(c=>!c.rect).length;
  shown=await enter(page,'x');
  assert.deepEqual(shown.live,['youtube'],'the window keeps its page live');
  await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='browserPip').at(-1).rect?.width===0);
  assert.deepEqual((await lastPip(page)).rect,{x:0,y:0,width:0,height:0},'the host draws nothing while another Applet is open');
  assert.equal(await frame(page).isVisible(),false,'the frame waits too');
  assert.equal(shown.hold,undefined,'the Applet\'s own page is not held for the window');
  if(shots)await page.screenshot({path:path.join(shots,'pip-other-applet.png')});
  const hidden=await (async()=>{const n=await count(page,'browserHide');await leaveApplet(page);await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserHide').length>n,n);return (await calls(page,'browserHide')).at(-1);})();
  assert.deepEqual(hidden.live,['youtube','x'],'the window takes one of the two live places');
  await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='browserPip').at(-1).rect?.width>0);
  await page.waitForTimeout(200);await assertWindow(page,(await lastPip(page)).rect,'back in the World',chosen);
  assert.equal((await calls(page,'browserPip')).filter(c=>!c.rect).length,ends,'nothing ended the window');
  // A smaller World keeps the share; the window still covers nothing.
  const before=JSON.stringify((await lastPip(page)).rect);
  await page.setViewportSize({width:1200,height:800});
  await page.waitForFunction(b=>{const p=(window as any).calls.filter(c=>c.action==='browserPip').at(-1);return p.rect&&JSON.stringify(p.rect)!==b;},before);
  await page.waitForTimeout(200);
  await assertWindow(page,(await lastPip(page)).rect,'smaller World',null);
  console.log('PASS inside another Applet the window waits out of sight, still live, and returns in the World; a smaller World keeps it clear.');

  // Pressing the window returns to the Applet with the same page, still playing.
  await page.setViewportSize({width:1440,height:840});await page.waitForTimeout(200);
  const pips=await count(page,'browserPip'),shows=await count(page,'browserShow');
  await host(page,{phase:'pip',applet:'youtube',event:'press'});
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserShow').length>n,shows);
  shown=(await calls(page,'browserShow')).at(-1);
  assert.equal(shown.applet,'youtube');assert.equal(shown.resume,true,'the same page returns');
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionContent').dataset.applet),'youtube');
  assert.equal(await frame(page).isVisible(),false,'the window is gone');
  assert.equal(await count(page,'browserPip'),pips,'returning ends nothing: the host takes the page back');
  assert.deepEqual(shown.live,['x'],'the page is visible again, not live-hidden');
  console.log('PASS pressing the window returns to the Applet with the same page.');

  // Close: the page is left as any page the person leaves, kept and paused.
  await host(page,{phase:'video',platform:'youtube',playing:true});
  await offer(page).click();
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserPip').length>n,pips);
  await frame(page).getByRole('button',{name:'Close picture in picture'}).click();
  await page.waitForFunction(()=>!(window as any).calls.filter(c=>c.action==='browserPip').at(-1).rect);
  pip=await lastPip(page);
  assert.deepEqual(pip,{action:'browserPip',applet:'youtube',live:['youtube','x']},'Close keeps the page as live and hidden');
  assert.equal(await frame(page).isVisible(),false);
  shown=await enter(page,'youtube');
  assert.equal(shown.resume,true,'reopening resumes the kept page');
  // A window the host closes by itself (world closed) disappears without a request.
  await host(page,{phase:'video',platform:'youtube',playing:true});
  await offer(page).click();
  await frame(page).waitFor();
  const quiet=await count(page,'browserPip');
  await host(page,{phase:'pip',applet:'youtube',event:'ended'});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('.browser-pip').hidden);
  assert.equal(await count(page,'browserPip'),quiet);
  // A page opened in the Applet from a link is a web page there; it returns as one, not as the Applet's start.
  await enter(page,'youtube');
  const linked=await count(page,'browserShow');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url:'https://www.youtube.com/watch?v=linked'}})));
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserShow').length>n,linked);
  assert.deepEqual((({platform,applet,url})=>({platform,applet,url}))((await calls(page,'browserShow')).at(-1)),{platform:'web',applet:'youtube',url:'https://www.youtube.com/watch?v=linked'});
  await host(page,{phase:'video',platform:'web',playing:true});
  await offer(page).click();await frame(page).waitFor();
  const pressed=await count(page,'browserShow');
  await host(page,{phase:'pip',applet:'youtube',event:'press'});
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserShow').length>n,pressed);
  shown=(await calls(page,'browserShow')).at(-1);
  assert.deepEqual({platform:shown.platform,applet:shown.applet,resume:shown.resume},{platform:'web',applet:'youtube',resume:true},'the window\'s page returns on the platform it had');
  console.log('PASS Close leaves the page kept and paused; a window the host closes disappears; a linked page returns as it was.');

  // Switching: another site's video takes the one window over; the previous page is left kept and paused.
  await host(page,{phase:'video',platform:'web',playing:true});
  await offer(page).click();await frame(page).waitFor();
  shown=await enter(page,'x');
  await host(page,{phase:'video',platform:'x',playing:true});
  await offer(page).waitFor();
  const before2=await count(page,'browserPip');
  await offer(page).click();
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserPip').length>=n+2,before2);
  const [end,next]=(await calls(page,'browserPip')).slice(before2);
  assert.deepEqual(end,{action:'browserPip',applet:'youtube',live:['youtube']},'the previous page leaves the window kept and paused');
  assert.equal(next.applet,'x');assert.deepEqual(next.live,['x','youtube'],'one window, the previous page still live');
  await page.waitForTimeout(200);
  await assertWindow(page,(await lastPip(page)).rect,'switched',chosen);
  assert.equal(await frame(page).getByRole('button',{name:'Return to X'}).isVisible(),true,'the window is X\'s now');
  assert.equal(await page.locator('.browser-pip').count(),1,'one window');
  assert.equal((await calls(page,'browserPip')).filter(c=>c.applet==='x'&&!c.rect).length,0,'nothing ends X\'s window: its video keeps playing');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS another site\'s video takes the one window over; the previous page is left kept and paused, the new one keeps playing.');
 }
 {
  // The smallest World window (900x650), with a large remembered size: Fox's column reaches the
  // corner, so the window narrows and moves up past it; the offer, now only its icon, still
  // clears the Applet's title.
  const {page,errors}=await open({width:900,height:650,share:0.45});
  await enter(page,'youtube');
  await host(page,{phase:'video',platform:'youtube',playing:true});
  await offer(page).waitFor();
  const title=await page.evaluate(()=>{const r=document.querySelector('.companion-context')?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height};});
  const capsule=(await rects(page)).offer;
  assert.ok(title&&capsule&&!overlaps(capsule,title),'the offer clears the Applet title: '+JSON.stringify({capsule,title}));
  if(shots)await page.screenshot({path:path.join(shots,'pip-offer-small.png')});
  await offer(page).click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserPip'));
  await page.waitForTimeout(300);
  await assertWindow(page,(await lastPip(page)).rect,'smallest World',null);
  if(shots)await page.screenshot({path:path.join(shots,'pip-narrow.png')});
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // The shared page script (platform/bridge/picture-in-picture.js, built into WorldletWeb/browser/)
  // run as the Mac host runs it, in an isolated world, on a page with a strict style-src policy
  // whose player is transformed, contained and clipped under a fixed masthead.
  const page=await browser.newPage({viewport:{width:900,height:700}}),errors=pageErrors(page);
  const script=await readFile('dist/WorldletWeb/browser/picture-in-picture.js','utf8');
  // The page's own layout comes from a stylesheet its policy allows; the policy blocks any added <style>.
  await page.route('https://pip.test/page.css',route=>route.fulfill({status:200,headers:{'content-type':'text/css'},body:'#masthead{position:fixed;inset:0 0 auto;height:56px;z-index:2000;background:#c00}#player{margin-top:60px;width:640px;height:360px;transform:translateZ(0);contain:paint;overflow:hidden;position:relative;z-index:1}#main{position:absolute;left:0;top:0;width:640px;height:360px}#controls{position:absolute;inset:auto 0 0;height:40px;z-index:50;background:#0c0}'}));
  await page.route('https://pip.test/',route=>route.fulfill({status:200,headers:{'content-type':'text/html','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'unsafe-inline'"},body:`<!doctype html><head><link rel="stylesheet" href="/page.css"></head><body>
   <header id="masthead">Masthead</header>
   <div id="player"><video id="main" muted></video><div id="controls">Controls</div></div>
   <video id="preview" muted width="160" height="90"></video>
   <script>for(const id of ['main','preview']){const c=document.createElement('canvas');c.width=64;c.height=36;const g=c.getContext('2d');setInterval(()=>{g.fillStyle='hsl('+Date.now()/9%360+',70%,50%)';g.fillRect(0,0,64,36)},40);document.getElementById(id).srcObject=c.captureStream(15);}</script></body>`}));
  await page.goto('https://pip.test/');
  const cdp=await page.context().newCDPSession(page),{frameTree}=await cdp.send('Page.getFrameTree');
  const {executionContextId}=await cdp.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'WorldletBrowser'});
  const run=async(mode:string)=>(await cdp.send('Runtime.evaluate',{expression:`${script}(${JSON.stringify(mode)})`,contextId:executionContextId,returnByValue:true})).result.value;
  const play=(id:string,on:boolean)=>page.evaluate(([id,on])=>{const v=document.getElementById(id as string) as HTMLVideoElement;return on?v.play():v.pause();},[id,on] as const);
  assert.deepEqual(await page.evaluate(()=>{const c=getComputedStyle(document.getElementById('player'));return [c.transform!=='none',c.contain];}),[true,'paint'],'the page\'s own layout applies');
  await play('preview',true);await page.waitForTimeout(200);
  assert.equal(await run('probe'),false,'a playing preview is not offered');
  await play('main',true);await page.waitForTimeout(200);
  assert.equal(await run('probe'),true,'a playing player is offered');
  await page.setViewportSize({width:336,height:189});
  assert.equal(await run('enter'),true);
  const shown=await page.evaluate(()=>{const r=document.getElementById('main').getBoundingClientRect();return {rect:[r.x,r.y,r.width,r.height],top:document.elementFromPoint(168,94)?.id,masthead:getComputedStyle(document.getElementById('masthead')).visibility,controls:getComputedStyle(document.getElementById('controls')).visibility,sheets:document.adoptedStyleSheets.length};});
  assert.deepEqual(shown,{rect:[0,0,336,189],top:'main',masthead:'hidden',controls:'hidden',sheets:1},'only the video shows, filling the window despite the page\'s policy and layout');
  assert.equal(await page.evaluate(()=>!(document.getElementById('main') as HTMLVideoElement).paused),true,'it keeps playing');
  await page.setViewportSize({width:900,height:700});
  assert.equal(await run('leave'),true);
  assert.deepEqual(await page.evaluate(()=>{const r=document.getElementById('main').getBoundingClientRect();return {width:r.width,sheets:document.adoptedStyleSheets.length,marks:document.querySelectorAll('[data-worldlet-pip-video],[data-worldlet-pip-path],[data-worldlet-pip-window]').length};}),{width:640,sheets:0,marks:0},'leaving restores the page');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS the page script shows only the playing video, under a strict style-src policy and a contained player, and leaving restores the page.');
 }
 {
  // A host without browserPictureInPicture (Windows) never offers it.
  const {page,errors}=await open({pip:false});
  await enter(page,'youtube');
  await host(page,{phase:'video',platform:'youtube',playing:true});
  await page.waitForTimeout(300);
  assert.equal(await offer(page).isVisible(),false,'no offer without the host feature');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS a narrow World keeps the window clear of Fox; a host without the feature never offers it.');
 }
}finally{await browser.close();}
