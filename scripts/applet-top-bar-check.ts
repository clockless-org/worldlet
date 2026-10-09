// The Applet top bar (#951), driven through the real World UI with a faked native bridge.
// Inside an Applet the title is centered over the Applet's side, the area beside Fox's column
// (the left two thirds of a wide window; Fox's column never narrows below 464px). Every control
// is an icon circle in the darker frosted material of Fox's three controls, right beside the
// title on its row (owner feedback 2026-10-03): one Back on its left (owner feedback 2026-10-04:
// no second World button; on a website page the page's own Back and Forward, with World left of Fox
// in its dock and Focus moved right, owner request 2026-10-06), the Applet's own controls (Refresh on a website page, owner request
// 2026-10-05, Picture in picture, the Native / Web switch) on its right, clear of the Mac traffic lights and never over the title. What Fox can
// do here, such as Summarize, sits beside Fox in its dock, not in the bar. A stacked narrow window puts the title below
// them. The World keeps its title centered on the window.
// Set TOP_BAR_SHOTS=<dir> to keep screenshots.
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
const shots=process.env.TOP_BAR_SHOTS;
await withBrowser(fileAccess,async browser=>{
type Box={x:number;y:number;width:number;height:number};
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
const right=(b:Box)=>b.x+b.width,middle=(b:Box)=>b.y+b.height/2,center=(b:Box)=>b.x+b.width/2;
// The Mac's close, minimize and full-screen buttons on the transparent titlebar (#895).
const TRAFFIC_LIGHTS={x:10,y:8,width:52,height:12};
async function open({width=1440,height=840,leading=true}={}){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(leading=>{
  const w=window as any;w.calls=[];
  const features={localDataDeletion:true,nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,voiceMemos:true,folderManagement:false,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,browserBookmarks:true,installedAppDetection:true,browserFoxOverlay:true,browserPictureInPicture:true,leadingWindowControls:leading};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(/^browser(Show|Layout|Hide|Pip|Command)$/.test(b.action))w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'top-bar-check',revision:0,activityRevision:0,hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
   if(b.action==='browserCommand')return {ok:true,documentId:'fixture',elements:[]};
   if(b.action==='browserShow')setTimeout(()=>w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url:b.url||'https://www.youtube.com/watch?v=bar',title:'Page'}),0);
   return {ok:true};
  }}}};
 },leading);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled&&!document.getElementById('worldStartup'));
 return {page,errors};
}
async function enter(page:Page,key:string,title:string){
 await page.evaluate(id=>{if(location.hash==='#object='+id)history.replaceState(null,'','#');location.hash='object='+id;},'app-'+key);
 await page.waitForFunction(id=>(document.querySelector<HTMLElement>('#notionWorld') as any).sceneMetrics.active===id&&document.querySelector<HTMLElement>('#notionWorld').dataset.depth==='object',`app-${key}`);
 await page.waitForFunction(title=>document.querySelector('.companion-context .companion-name')?.textContent===title,title);
}
// A website Applet offers picture in picture while its video plays.
async function playing(page:Page){
 await page.locator('.browser-viewport').waitFor();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserShow'));
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'video',platform:'youtube',playing:true}));
 await page.locator('.browser-pip-offer').waitFor();
 // The host says Focus applies on the page (core/browser/page-focus.ts): its switch follows Back.
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'focus',platform:'youtube',available:true,on:true,reader:false}));
 await page.locator('.browser-focus').waitFor();
 // The page has one before and one after it, so its Back and Forward show.
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/watch?v=bar',title:'Page',canBack:true,canForward:true}));
 await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.browser-back').hidden&&!document.querySelector<HTMLButtonElement>('.browser-forward').hidden);
}
async function bar(page:Page){
 await page.mouse.move(2,(page.viewportSize()?.height||600)-2);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return page.evaluate(()=>{
  const box=(s:string)=>{const e=document.querySelector<HTMLElement>(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
  return {back:box('.browser-back')||box('#notionBack'),forward:box('.browser-forward'),leftCount:[...document.querySelector('.applet-bar-left').children].filter(e=>getComputedStyle(e).display!=='none').length,dockLeft:[...document.querySelectorAll('.fox-action-left button')].filter(b=>(b as HTMLElement).offsetWidth).map(b=>b.textContent.trim()),home:box('.applet-bar-left [data-slot=home]'),left:box('.applet-bar-left'),right:box('.applet-bar-right'),title:box('.companion-context'),offer:box('.browser-pip-offer'),refresh:box('.browser-refresh'),focus:box('.browser-focus'),focusPlace:!!document.querySelector('.browser-focus:not([hidden])'),toggle:box('.applet-mode-toggle'),panel:box('#notionContent'),hud:box('.notion-hud'),bar:[...document.querySelectorAll('.applet-bar-side button')].filter(b=>(b as HTMLElement).offsetWidth&&!b.closest('.applet-mode-toggle')).map(b=>b.id==='notionBack'?'Back':b.classList.contains('browser-pip-offer')?'Picture in picture':b.classList.contains('browser-refresh')?'Refresh':b.textContent.trim()),dock:[...document.querySelectorAll('.world-actions button')].filter(b=>(b as HTMLElement).offsetWidth).map(b=>b.textContent.trim())};
 });
}
// Fox's dock is centered in its column, so the Applet's side is what lies left of that column.
function side(r:any,width:number){const lane=2*(width-center(r.hud));return {width:width-lane,center:(width-lane)/2};}
function assertRow(r:any,end:Box,width:number,label:string){
 const applet=side(r,width);
 assert.ok(Math.abs(center(r.title)-applet.center)<=2,label+': the title is centered over the Applet\'s side '+JSON.stringify({title:r.title,side:applet}));
 assert.ok(Math.abs(right(r.left)+10-r.title.x)<=1,label+': Back sits right before the title '+JSON.stringify({left:r.left,title:r.title}));
 assert.equal(r.home,null,label+': no World button left of the title');
 // A website page's Back and Forward (owner request 2026-10-06); elsewhere Back is the left side's one circle.
 assert.deepEqual([r.left.width,r.left.height],[r.leftCount*44+(r.leftCount-1)*8,44],label+': the left side is its circles, Back first '+JSON.stringify({left:r.left,count:r.leftCount}));
 if(r.forward)assert.ok(Math.abs(right(r.back)+8-r.forward.x)<=1,label+': Forward follows Back '+JSON.stringify({back:r.back,forward:r.forward}));
 // A website page's Focus switch leads the Applet's controls, its place kept until the host reports so they never
 // jump aside (owner report 2026-10-06).
 if(r.focusPlace)assert.ok(Math.abs(right(r.title)+10-r.right.x)<=1&&(!r.focus||Math.abs(r.focus.x-r.right.x)<=1),label+': Focus leads the controls right of the title '+JSON.stringify({title:r.title,focus:r.focus}));
 assert.ok(Math.abs(right(r.title)+10-r.right.x)<=1,label+': the Applet\'s controls start right after the title '+JSON.stringify({title:r.title,right:r.right}));
 assert.ok(end.x>=r.right.x&&right(end)<=right(r.right)+1,label+': the Applet\'s own control is on the title\'s right '+JSON.stringify({end,right:r.right}));
 for(const [name,box] of Object.entries({back:r.back,end}))assert.ok(Math.abs(middle(box)-middle(r.title))<=2,label+': '+name+' shares the title\'s row');
 assert.ok(right(r.right)<=applet.width,label+': the controls stay over the Applet\'s side');
 assert.ok(r.bar.every((name:string)=>['Back','Forward','Refresh','Focus','Picture in picture'].includes(name)),label+': only Back and the Applet\'s own controls are in the bar '+JSON.stringify(r.bar));
 if(r.panel)assert.ok(!overlaps(r.right,r.panel)&&!overlaps(r.left,r.panel)&&!overlaps(r.title,r.panel),label+': the bar sits above the panel');
}
// Back, the offer and the switch wear the material of Fox's round controls (the desktop return button).
const MATERIAL=['backgroundColor','color','borderTopColor','borderTopWidth','borderTopStyle','backdropFilter','textShadow','boxShadow'];
const material=(page:Page,selector:string)=>page.evaluate(([selector,props])=>{const pick=(e:Element)=>Object.fromEntries((props as string[]).map(p=>[p,getComputedStyle(e)[p]]));return {control:pick(document.querySelector(selector as string)),fox:pick(document.querySelector('.companion-controls>.companion-world-button'))};},[selector,MATERIAL] as const);
async function assertMaterial(page:Page,selector:string,label:string){
 const {control,fox}=await material(page,selector);
 assert.deepEqual(control,fox,label+' is a darker frosted control, like Fox\'s');
 assert.match(control.backdropFilter,/blur/,label+' is frosted');
}
// A color token as the World resolves it.
const token=(page:Page,name:string)=>page.evaluate(name=>{const probe=document.createElement('i');probe.style.color=`var(${name})`;document.querySelector('#notionWorld').append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;},name);
const shot=(page:Page,name:string,height=96)=>shots?page.screenshot({path:path.join(shots,name),clip:{x:0,y:0,width:page.viewportSize().width,height}}):null;
 for(const [width,height] of [[1440,840],[1100,760]]){
  const {page,errors}=await open({width,height});
  await enter(page,'youtube','YouTube');await playing(page);
  const r=await bar(page);
  assertRow(r,r.offer,width,'YouTube '+width);
  if(width===1440)assert.ok(Math.abs(center(r.title)-width/3)<=2,'at 1440 the Applet\'s side is the left two thirds');
  assert.ok(r.back.x>=right(TRAFFIC_LIGHTS)+8&&!overlaps(r.back,TRAFFIC_LIGHTS),'Back clears the Mac traffic lights '+JSON.stringify(r.back));
  assert.ok(!overlaps(r.title,TRAFFIC_LIGHTS)&&!overlaps(r.offer,TRAFFIC_LIGHTS));
  assert.deepEqual(r.bar,['Back','Forward','Focus','Refresh','Picture in picture'],'the page\'s Back and Forward and Focus, then Refresh first among the website Applet\'s own controls');
  assert.ok(r.dockLeft.includes('World'),'World, the way back to the World, stands left of Fox in its dock '+JSON.stringify(r.dockLeft));
  assert.ok(Math.abs(right(r.focus)+8-r.refresh.x)<=1,'Refresh follows Focus '+JSON.stringify({focus:r.focus,refresh:r.refresh}));
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.applet-bar-side button:not([hidden])')].filter(b=>(b as HTMLElement).offsetWidth).map(b=>b.querySelector('span').getBoundingClientRect().width<=1)),[true,true,true,true,true],'Back, Forward, Focus, Refresh and Picture in picture show only their icons');
  assert.ok(r.dock.includes('Summarize'),'the Applet\'s action, Summarize, sits beside Fox in its dock '+JSON.stringify(r.dock));
  for(const box of [r.back,r.forward,r.refresh,r.focus,r.offer])assert.deepEqual([box.width,box.height],[44,44],'each control is its icon circle');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.applet-bar-side button')).borderRadius),'22px','a circle');
  await assertMaterial(page,'.browser-back','Back');
  await assertMaterial(page,'.browser-forward','Forward');
  await assertMaterial(page,'.browser-pip-offer','Picture in picture');
  await assertMaterial(page,'.browser-refresh','Refresh');
  // Focus wears the same material, and while it is on it stays in the pressed (hover) shade.
  const focusReport=(on:boolean)=>page.evaluate(on=>(window as any).worldletBrowser({phase:'focus',platform:'youtube',available:true,on,reader:false}),on);
  await focusReport(false);await assertMaterial(page,'.browser-focus','Focus');await focusReport(true);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.browser-focus')).backgroundColor),await token(page,'--system-glass-hover'),'Focus on is pressed');
  // Refresh loads the page shown again.
  await page.locator('.browser-refresh').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='reload'));
  // Hover darkens, as Fox's controls do; keyboard focus draws Fox's ring; nothing moves.
  await page.hover('.browser-back');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.browser-back')).backgroundColor),await token(page,'--system-glass-hover'),'hover uses the darker hover');
  await page.mouse.move(2,height-2);
  await page.keyboard.press('Shift');await page.locator('.browser-back').focus();
  const ring=await page.evaluate(()=>{const e=document.querySelector('.browser-back'),c=getComputedStyle(e);return {visible:e.matches(':focus-visible'),style:c.outlineStyle,width:c.outlineWidth,color:c.outlineColor};});
  assert.deepEqual(ring,{visible:true,style:'solid',width:'2px',color:'rgb(255, 253, 244)'},'keyboard focus shows Fox\'s ring');
  assert.deepEqual(await page.evaluate(()=>['.browser-back','.browser-pip-offer','.companion-context'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [c.animationName,c.transitionDuration];})),[['none','0s'],['none','0s'],['none','0s']],'the bar appears in place, without motion');
  await page.locator('.browser-back').blur();
  if(width===1440)await shot(page,'applet-top-bar-1440.png');
  // A long title gives way to the controls instead of running under them.
  await page.evaluate(()=>{document.querySelector('.companion-context .companion-name').textContent='A long reading-room title that would never fit between the controls, however wide the window may be';});
  const long=await bar(page),cut=await page.evaluate(()=>{const n=document.querySelector<HTMLElement>('.companion-context .companion-name');return {cut:n.scrollWidth>n.clientWidth,ellipsis:getComputedStyle(n).textOverflow};});
  assert.ok(right(long.left)+8<=long.title.x&&right(long.title)+8<=long.right.x,'a long title stays between the two sides '+JSON.stringify(long));
  assert.ok(long.back.x>=right(TRAFFIC_LIGHTS)+8,'and still clears the traffic lights');
  assert.deepEqual(cut,{cut:true,ellipsis:'ellipsis'});
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // Back and Forward follow the page's own history (owner request 2026-10-06): each shows only while there is somewhere
  // to go (owner request 2026-10-07), the File menu's keys do the same, and World beside Fox leaves for the World.
  const {page,errors}=await open();
  await enter(page,'youtube','YouTube');await page.locator('.browser-viewport').waitFor();
  const report=(canBack:boolean,canForward:boolean)=>page.evaluate(([canBack,canForward])=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/watch?v=bar',title:'Page',canBack,canForward}),[canBack,canForward]);
  const state=()=>page.evaluate(()=>['.browser-back','.browser-forward'].map(s=>document.querySelector<HTMLButtonElement>(s).hidden));
  const sent=(operation:string)=>page.evaluate(operation=>(window as any).calls.filter(c=>c.action==='browserCommand'&&c.operation===operation).length,operation);
  await report(false,false);
  assert.deepEqual(await state(),[true,true],'at the first page Back and Forward are not shown');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#notionBack')).display),'none','nor the Applet\'s Back in their place: World beside Fox leaves the page');
  assert.ok((await page.evaluate(()=>[...document.querySelectorAll('.fox-action-left button')].filter(b=>(b as HTMLElement).offsetWidth).map(b=>b.textContent.trim()))).includes('World'),'World stands beside Fox');
  assert.equal(await sent('back'),0);
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.depth),'object');
  await report(true,false);assert.deepEqual(await state(),[false,true]);
  await page.locator('.browser-back').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='back'));
  await report(false,true);assert.deepEqual(await state(),[true,false]);
  await page.locator('.browser-forward').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='forward'));
  // The menu's Back (⌘[ on the Mac, Alt+← on Windows) reaches the page in the panel.
  await report(true,false);
  await page.evaluate(()=>(window as any).worldletBrowserNavigate('back'));
  await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='browserCommand'&&c.operation==='back').length===2);
  // World stands left of Fox and returns to the World.
  const world=page.locator('.fox-action-left [data-slot=home]');
  // The dock gains World on the HUD's next sync after the page's Back shows (Mac RC 3198 measured before it: null).
  // Every HUD sync rebuilds the dock's buttons, so both boxes are read in one frame from the live nodes: a separate
  // boundingBox() can land on a button a later sync already replaced (Windows RC 0027de2e measured that: null).
  await world.waitFor({state:'visible'});
  const {worldBox,foxBox}=await page.evaluate(()=>{const box=(s:string)=>{const e=document.querySelector<HTMLElement>(s),r=e?.getBoundingClientRect();return e?.checkVisibility()&&r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};return {worldBox:box('.fox-action-left [data-slot=home]'),foxBox:box('.companion-avatar')};});
  assert.ok(worldBox&&foxBox&&worldBox.x+worldBox.width<=foxBox.x,'World is left of Fox '+JSON.stringify({worldBox,foxBox}));
  await world.click();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.depth==='overview');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS a website page\'s Back and Forward follow its history and show only with somewhere to go, the menu\'s keys reach it, and World beside Fox returns to the World.');
 }
 {
  // Where the page is (owner request 2026-10-08): the pointer on the title opens the page's address in the name's place,
  // the sides still right beside it; a click copies the whole address; leaving brings the name back.
  const {page,errors}=await open();
  await enter(page,'youtube','YouTube');await page.locator('.browser-viewport').waitFor();
  const url='https://www.youtube.com/watch?v=bar&list=a-very-long-playlist-name-that-goes-on-and-on-and-on-and-on-and-on';
  await page.evaluate(url=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url,title:'Page',canBack:true}),url);
  await page.evaluate(()=>{(window as any).copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async (text:string)=>{(window as any).copied.push(text);}}});});
  const shown=()=>page.evaluate(()=>{const v=(s:string)=>{const e=document.querySelector<HTMLElement>(s);return !!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;};return {name:v('.companion-context .companion-name'),address:v('.companion-context .browser-address')};});
  const rest=await bar(page);
  assert.deepEqual(await shown(),{name:true,address:false},'at rest the title names the Applet');
  await page.mouse.move(center(rest.title),middle(rest.title));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.deepEqual(await shown(),{name:false,address:true},'the pointer on the title shows the page\'s address');
  const open_=await page.evaluate(()=>{const e=document.querySelector<HTMLElement>('.companion-context .browser-address'),b=(s:string)=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   return {text:e.textContent,cut:e.scrollWidth>e.clientWidth,title:b('.companion-context'),left:b('.applet-bar-left'),right:b('.applet-bar-right')};});
  assert.match(open_.text,/^youtube\.com\/watch\?v=bar&list=/,'without scheme or www.');
  assert.ok(open_.cut,'a long address ends in an ellipsis');
  assert.ok(open_.title.width>rest.title.width,'the title widens for the address '+JSON.stringify({rest:rest.title,open:open_.title}));
  assert.ok(Math.abs(right(open_.left)+10-open_.title.x)<=1&&Math.abs(right(open_.title)+10-open_.right.x)<=1,'the sides stay right beside it '+JSON.stringify(open_));
  assert.ok(right(open_.right)<=side(rest,1440).width,'and over the Applet\'s side');
  await shot(page,'applet-top-bar-address.png');
  await page.locator('.companion-context .browser-address').click();
  assert.deepEqual(await page.evaluate(()=>(window as any).copied),[url],'a click copies the whole address');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.companion-context .browser-address'),'::before').content),'"Copied"','it says Copied');
  await page.mouse.move(2,838);
  assert.deepEqual(await shown(),{name:true,address:false},'leaving brings the name back');
  // The Order's place names the Applet, not its address.
  assert.equal(await page.evaluate(()=>document.querySelector('.companion-context .companion-name').textContent),'YouTube');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS the pointer on a website page\'s title shows its address in the name\'s place, the sides beside it; a click copies it.');
 }
 {
  // Elsewhere in an Applet the bar keeps its one Back and no World beside Fox.
  const {page,errors}=await open();
  await enter(page,'stripe','Stripe');await page.locator('.applet-mode-toggle').waitFor();
  const r=await bar(page);
  assert.equal(r.forward,null,'no Forward outside a website page');
  assert.ok(!r.dockLeft.includes('World'),'no World beside Fox: Back leads out '+JSON.stringify(r.dockLeft));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS at 1440 and 1100 the title is centered over the Applet\'s side, Back and Forward right before it and Focus, Refresh and Picture in picture right after it, icon circles in Fox\'s darker frosted controls, clear of the traffic lights; Summarize sits beside Fox.');

 {
  // The Native / Web switch of a hybrid Applet stays a capsule of two buttons, the chosen view lit, on the title's right.
  const {page,errors}=await open();
  await enter(page,'stripe','Stripe');
  await page.locator('.applet-mode-toggle').waitFor();
  const r=await bar(page);
  assertRow(r,r.toggle,1440,'Stripe Open');
  assert.equal(r.toggle.height,44,'the capsule is as tall as the circles');
  await assertMaterial(page,'.applet-mode-toggle','The Native / Web switch');
  const lit=()=>page.evaluate(()=>[...document.querySelectorAll('.applet-mode-toggle button')].map(b=>[b.getAttribute('aria-pressed'),getComputedStyle(b).backgroundColor]));
  const [nativeLit,webDark]=await lit();
  assert.equal(nativeLit[0],'true');assert.notEqual(nativeLit[1],webDark[1],'the chosen view is lit');
  await shot(page,'applet-top-bar-switch.png');
  await page.locator('.applet-mode-web').click();
  await page.locator('.browser-viewport').waitFor();
  const web=await bar(page);
  assertRow(web,web.toggle,1440,'Stripe Web');
  const [nativeDark,webLit]=await lit();
  assert.deepEqual([nativeDark[0],webLit[0]],['false','true']);assert.notEqual(webLit[1],nativeDark[1]);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS the Native / Web switch is a capsule right of the title, in the same material, lighting the chosen view.');
 }
 {
  // The smallest Mac window keeps the icons, with their names for assistive technology.
  const {page,errors}=await open({width:900,height:650});
  await enter(page,'youtube','YouTube');await playing(page);
  const r=await bar(page);
  assertRow(r,r.offer,900,'YouTube 900');
  for(const box of [r.back,r.forward,r.refresh,r.offer])assert.deepEqual([box.width,box.height],[44,44],'narrow windows keep each control to its icon');
  assert.equal(await page.getByRole('button',{name:'Back',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Forward',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Picture in picture'}).isVisible(),true,'the hidden label stays the offer\'s name');
  assert.equal(await page.getByRole('button',{name:'Refresh'}).isVisible(),true,'and Refresh\'s');
  assert.ok(r.back.x>=right(TRAFFIC_LIGHTS)+8);
  await assertMaterial(page,'.browser-back','Back, narrow');
  await shot(page,'applet-top-bar-900.png');
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // A stacked narrow window puts the title below the bar; the sides start it, the right one following the left.
  const {page,errors}=await open({width:700,height:760});
  await enter(page,'youtube','YouTube');await playing(page);
  const r=await bar(page);
  assert.ok(r.title.y>=r.back.y+r.back.height,'the title sits below the bar '+JSON.stringify(r));
  assert.ok(Math.abs(center(r.title)-350)<=2,'and stays centered on the window');
  assert.ok(r.back.x>=right(TRAFFIC_LIGHTS)+8,'Back clears the traffic lights');
  assert.ok(r.right.x>right(r.left)&&r.right.x-right(r.left)<=12&&Math.abs(r.right.y-r.left.y)<=1,'the Applet\'s controls follow Back '+JSON.stringify({left:r.left,right:r.right}));
  for(const box of [r.left,r.right])assert.ok(!overlaps(box,r.title)&&!overlaps(box,r.panel));
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // Without window controls in the corner (Windows), the bar is the same.
  const {page,errors}=await open({width:1100,height:760,leading:false});
  await enter(page,'youtube','YouTube');await playing(page);
  const r=await bar(page);
  assertRow(r,r.offer,1100,'YouTube without traffic lights');
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // The World keeps its title centered on the window, where it was.
  const {page,errors}=await open();
  const r=await bar(page);
  assert.equal(r.back,null,'no Back in the World');
  assert.ok(Math.abs(center(r.title)-720)<=1&&Math.abs(r.title.y-24)<=1,'the World title stays centered at the top '+JSON.stringify(r.title));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS narrow windows keep icons with their names, a stacked window puts the title below the bar, the bar is the same without traffic lights, and the World title stays centered.');
});
