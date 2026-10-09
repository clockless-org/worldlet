// The Applet top bar (#951) and a website page's toolbar, driven through the real World UI with a faked native bridge.
// Inside an Applet on a wide window the Applet shelf (scripts/applet-shelf-ui-check.ts) names the Applet in the title's
// place (owner request 2026-10-09); the bar's row keeps Back at its start, clear of the Mac traffic lights, and the
// Applet's own controls (Picture in picture, the Native / Web switch) at the end of the Applet's side, icon circles in
// the darker frosted material of Fox's three controls. A website page's Back, Forward, Refresh, Home, address and
// Focus are its toolbar's, one row in the panel above the page (owner request 2026-10-09); World left of Fox in its
// dock leaves the page. What Fox can do here, such as Summarize, sits beside Fox in its dock, not in the bar. A stacked
// narrow window has no shelf: the title sits below the bar's row. The World keeps its title centered on the window.
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
  const box=(s:string)=>{const e=document.querySelector<HTMLElement>(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
  const shown=(e:Element)=>(e as HTMLElement).offsetWidth>0&&getComputedStyle(e).visibility!=='hidden';
  return {back:box('#notionBack'),left:box('.applet-bar-left'),right:box('.applet-bar-right'),title:box('.companion-context'),shelf:box('.applet-shelf'),add:box('.applet-shelf-new'),
   toolbar:box('.browser-toolbar'),viewport:box('.browser-viewport'),offer:box('.browser-pip-offer'),toggle:box('.applet-mode-toggle'),panel:box('#notionContent'),hud:box('.notion-hud'),
   tools:[...document.querySelectorAll('.browser-toolbar>*')].filter(shown).map(e=>e.classList.contains('browser-address')?'Address':e.querySelector('span')?.textContent?.trim()||''),
   toolBoxes:[...document.querySelectorAll('.browser-toolbar>*')].filter(shown).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),
   bar:[...document.querySelectorAll('.applet-bar-side button')].filter(b=>(b as HTMLElement).offsetWidth&&!b.closest('.applet-mode-toggle')).map(b=>b.id==='notionBack'?'Back':b.classList.contains('browser-pip-offer')?'Picture in picture':b.textContent.trim()),
   dockLeft:[...document.querySelectorAll('.fox-action-left button')].filter(b=>(b as HTMLElement).offsetWidth).map(b=>b.textContent.trim()),
   dock:[...document.querySelectorAll('.world-actions button')].filter(b=>(b as HTMLElement).offsetWidth).map(b=>b.textContent.trim())};
 });
}
// Fox's dock is centered in its column, so the Applet's side is what lies left of that column.
function side(r:any,width:number){const lane=2*(width-center(r.hud));return {width:width-lane,center:(width-lane)/2};}
// Back and the Applet's controls wear the material of Fox's round controls (the desktop return button).
const MATERIAL=['backgroundColor','color','borderTopColor','borderTopWidth','borderTopStyle','backdropFilter','textShadow','boxShadow'];
const material=(page:Page,selector:string)=>page.evaluate(([selector,props])=>{const pick=(e:Element)=>Object.fromEntries((props as string[]).map(p=>[p,getComputedStyle(e)[p]]));return {control:pick(document.querySelector(selector as string)),fox:pick(document.querySelector('.companion-controls>.companion-world-button'))};},[selector,MATERIAL] as const);
async function assertMaterial(page:Page,selector:string,label:string){
 const {control,fox}=await material(page,selector);
 assert.deepEqual(control,fox,label+' is a darker frosted control, like Fox\'s');
 assert.match(control.backdropFilter,/blur/,label+' is frosted');
}
const shot=(page:Page,name:string,height=240)=>shots?page.screenshot({path:path.join(shots,name),clip:{x:0,y:0,width:page.viewportSize().width,height}}):null;
// The row under the shelf: Back at its start, the Applet's controls ending at the edge of the Applet's side, + just before them.
function assertShelfRow(r:any,width:number,label:string,leading=true){
 const applet=side(r,width);
 assert.ok(r.shelf&&!r.title,label+': the shelf takes the title\'s place '+JSON.stringify({shelf:r.shelf,title:r.title}));
 assert.ok(Math.abs(r.shelf.width-applet.width)<=2,label+': the shelf spans the Applet\'s side '+JSON.stringify({shelf:r.shelf,side:applet}));
 if(r.back&&leading)assert.ok(r.back.x>=right(TRAFFIC_LIGHTS)+8&&!overlaps(r.back,TRAFFIC_LIGHTS),label+': Back clears the Mac traffic lights '+JSON.stringify(r.back));
 if(r.right){
  assert.ok(Math.abs(right(r.right)-(applet.width-16))<=2,label+': the Applet\'s controls end at the edge of its side '+JSON.stringify({right:r.right,side:applet}));
  assert.ok(right(r.add)<=r.right.x,label+': + stands before them '+JSON.stringify({add:r.add,right:r.right}));
 }
 if(r.panel)assert.ok(r.panel.y>=r.shelf.y+r.shelf.height-2,label+': the panel starts below the shelf '+JSON.stringify({panel:r.panel,shelf:r.shelf}));
}
 for(const [width,height] of [[1440,840],[1100,760]]){
  const {page,errors}=await open({width,height});
  await enter(page,'youtube','YouTube');await playing(page);
  const r=await bar(page);
  assertShelfRow(r,width,'YouTube '+width);
  assert.equal(r.back,null,'on a website page the toolbar\'s Back is the one Back');
  assert.deepEqual(r.bar,['Picture in picture'],'the bar holds only the Applet\'s own control '+JSON.stringify(r.bar));
  assert.ok(r.dockLeft.includes('World'),'World, the way back to the World, stands left of Fox in its dock '+JSON.stringify(r.dockLeft));
  assert.ok(r.dock.includes('Summarize'),'the Applet\'s action, Summarize, sits beside Fox in its dock '+JSON.stringify(r.dock));
  assert.deepEqual([r.offer.width,r.offer.height],[44,44],'Picture in picture is its icon circle');
  await assertMaterial(page,'.browser-pip-offer','Picture in picture');
  // The toolbar: one row in the panel above the page, as wide as the page.
  assert.deepEqual(r.tools,['Back','Forward','Refresh','Home','Address','Focus'],'the toolbar, in order '+JSON.stringify(r.tools));
  assert.ok(r.toolbar.y>=r.panel.y&&r.toolbar.y+r.toolbar.height<=r.viewport.y,'the toolbar is in the panel above the page '+JSON.stringify({toolbar:r.toolbar,viewport:r.viewport}));
  assert.ok(Math.abs(r.toolbar.x-r.viewport.x)<=1&&Math.abs(r.toolbar.width-r.viewport.width)<=1,'as wide as the page '+JSON.stringify({toolbar:r.toolbar,viewport:r.viewport}));
  for(const b of r.toolBoxes)assert.ok(Math.abs(middle(b)-middle(r.toolbar))<=1,'every tool shares its row');
  const address=r.toolBoxes[4];assert.ok(address.width>r.toolbar.width/2,'the address takes the row\'s room '+JSON.stringify(address));
  // Refresh loads the page shown again.
  await page.locator('.browser-toolbar .browser-refresh').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='reload'));
  await shot(page,'applet-top-bar-'+width+'.png');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS at 1440 and 1100 the shelf takes the title\'s place, the Applet\'s own control ends the bar\'s row in Fox\'s material, and a website page\'s toolbar (Back, Forward, Refresh, Home, address, Focus) is one row in the panel above the page.');
 {
  // Back and Forward follow the page's own history (owner request 2026-10-06): in the toolbar both stay, resting while
  // there is nowhere to go; the File menu's keys do the same, and World beside Fox leaves for the World.
  const {page,errors}=await open();
  await enter(page,'youtube','YouTube');await page.locator('.browser-viewport').waitFor();
  const report=(canBack:boolean,canForward:boolean)=>page.evaluate(([canBack,canForward])=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/watch?v=bar',title:'Page',canBack,canForward}),[canBack,canForward]);
  const state=()=>page.evaluate(()=>['.browser-back','.browser-forward'].map(s=>{const b=document.querySelector<HTMLButtonElement>(s);return [b.hidden,b.disabled];}));
  const sent=(operation:string)=>page.evaluate(operation=>(window as any).calls.filter(c=>c.action==='browserCommand'&&c.operation===operation).length,operation);
  await report(false,false);
  assert.deepEqual(await state(),[[false,true],[false,true]],'at the first page Back and Forward rest');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#notionBack')).display),'none','and the Applet\'s Back stays away: World beside Fox leaves the page');
  await page.locator('.browser-back').click({force:true});
  assert.equal(await sent('back'),0,'a resting Back does nothing');
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.depth),'object');
  await report(true,false);assert.deepEqual(await state(),[[false,false],[false,true]]);
  await page.locator('.browser-back').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='back'));
  await report(false,true);assert.deepEqual(await state(),[[false,true],[false,false]]);
  await page.locator('.browser-forward').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='forward'));
  // The menu's Back (⌘[ on the Mac, Alt+← on Windows) reaches the page in the panel.
  await report(true,false);
  await page.evaluate(()=>(window as any).worldletBrowserNavigate('back'));
  await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='browserCommand'&&c.operation==='back').length===2);
  // Home rests on the home page (where the Applet first landed counts too) and takes the page there from anywhere else.
  await page.evaluate(()=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/feed/subscriptions',title:'Subscriptions',canBack:true}));
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLButtonElement>('.browser-home').disabled),false,'away from the home page Home works');
  await page.locator('.browser-home').click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='open'&&/youtube\.com/.test(c.args?.url||'')));
  await page.evaluate(()=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/',title:'YouTube'}));
  await page.waitForFunction(()=>document.querySelector<HTMLButtonElement>('.browser-home').disabled);
  // World stands left of Fox and returns to the World.
  const world=page.locator('.fox-action-left [data-slot=home]');
  await world.waitFor({state:'visible'});
  const {worldBox,foxBox}=await page.evaluate(()=>{const box=(s:string)=>{const e=document.querySelector<HTMLElement>(s),r=e?.getBoundingClientRect();return e?.checkVisibility()&&r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};return {worldBox:box('.fox-action-left [data-slot=home]'),foxBox:box('.companion-avatar')};});
  assert.ok(worldBox&&foxBox&&worldBox.x+worldBox.width<=foxBox.x,'World is left of Fox '+JSON.stringify({worldBox,foxBox}));
  await world.click();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.depth==='overview');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS a website page\'s Back and Forward follow its history and rest with nowhere to go, Home takes it home, the menu\'s keys reach it, and World beside Fox returns to the World.');
 }
 {
  // Where the page is (owner requests 2026-10-08 and 2026-10-09): the toolbar's field shows the page's address, the whole
  // address once clicked; Enter opens an address typed there, or searches for anything else; Escape puts the page's back.
  const {page,errors}=await open();
  await enter(page,'youtube','YouTube');await page.locator('.browser-viewport').waitFor();
  const url='https://www.youtube.com/watch?v=bar&list=a-very-long-playlist-name-that-goes-on-and-on-and-on-and-on-and-on';
  await page.evaluate(url=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url,title:'Page',canBack:true}),url);
  const field=page.locator('.browser-toolbar .browser-address input');
  assert.match(await field.inputValue(),/^youtube\.com\/watch\?v=bar&list=/,'without scheme or www.');
  await field.click();
  assert.equal(await field.inputValue(),url,'clicked, the whole address');
  await page.keyboard.press('Escape');
  assert.match(await field.inputValue(),/^youtube\.com\//,'Escape puts the page\'s address back');
  const opened=()=>page.evaluate(()=>(window as any).calls.filter(c=>c.action==='browserCommand'&&c.operation==='open').map(c=>c.args?.url));
  await field.click();await field.fill('example.com/news');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='open'&&c.args?.url==='https://example.com/news'));
  await field.click();await field.fill('tennis lessons near me');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserCommand'&&c.operation==='open'&&/google\.com\/search\?q=tennis%20lessons%20near%20me$/.test(c.args?.url||'')));
  assert.equal((await opened()).length,2,'one page each '+JSON.stringify(await opened()));
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS the toolbar\'s field shows where the page is, the whole address to edit, and opens an address or a search.');
 }
 {
  // Elsewhere in an Applet the bar keeps its one Back, no toolbar and no World beside Fox; the Native / Web switch
  // of a hybrid Applet stays a capsule of two buttons ending the row, the chosen view lit.
  const {page,errors}=await open();
  await enter(page,'stripe','Stripe');await page.locator('.applet-mode-toggle').waitFor();
  const r=await bar(page);
  assertShelfRow(r,1440,'Stripe Open');
  assert.ok(r.back,'Back leads out');assert.equal(r.toolbar,null,'no toolbar outside a website page');
  assert.ok(!r.dockLeft.includes('World'),'no World beside Fox: Back leads out '+JSON.stringify(r.dockLeft));
  assert.equal(r.toggle.height,44,'the capsule is as tall as the circles');
  await assertMaterial(page,'#notionBack','Back');
  await assertMaterial(page,'.applet-mode-toggle','The Native / Web switch');
  const lit=()=>page.evaluate(()=>[...document.querySelectorAll('.applet-mode-toggle button')].map(b=>[b.getAttribute('aria-pressed'),getComputedStyle(b).backgroundColor]));
  const [nativeLit,webDark]=await lit();
  assert.equal(nativeLit[0],'true');assert.notEqual(nativeLit[1],webDark[1],'the chosen view is lit');
  await shot(page,'applet-top-bar-switch.png');
  await page.locator('.applet-mode-web').click();
  await page.locator('.browser-viewport').waitFor();
  const web=await bar(page);
  assertShelfRow(web,1440,'Stripe Web');
  const [nativeDark,webLit]=await lit();
  assert.deepEqual([nativeDark[0],webLit[0]],['false','true']);assert.notEqual(webLit[1],nativeDark[1]);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS elsewhere in an Applet Back leads out, and the Native / Web switch is a capsule ending the row in the same material, lighting the chosen view.');
 }
 {
  // The smallest Mac window keeps the shelf and the icons, with their names for assistive technology.
  const {page,errors}=await open({width:900,height:650});
  await enter(page,'youtube','YouTube');await playing(page);
  const r=await bar(page);
  assertShelfRow(r,900,'YouTube 900');
  for(const name of ['Back','Forward','Refresh','Home','Focus'])assert.equal(await page.getByRole('button',{name,exact:true}).isVisible(),true,name+' keeps its name');
  assert.equal(await page.getByRole('button',{name:'Picture in picture'}).isVisible(),true,'the hidden label stays the offer\'s name');
  await shot(page,'applet-top-bar-900.png');
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // A stacked narrow window has no shelf: the title sits below the bar's row; the sides start it, the right one following the left.
  const {page,errors}=await open({width:700,height:760});
  await enter(page,'stripe','Stripe');await page.locator('.applet-mode-toggle').waitFor();
  const r=await bar(page);
  assert.equal(r.shelf,null,'no shelf in a stacked window');
  assert.ok(r.title.y>=r.back.y+r.back.height,'the title sits below the bar '+JSON.stringify(r));
  assert.ok(Math.abs(center(r.title)-350)<=2,'and stays centered on the window');
  assert.ok(r.back.x>=right(TRAFFIC_LIGHTS)+8,'Back clears the traffic lights');
  assert.ok(r.right.x>right(r.left)&&r.right.x-right(r.left)<=12&&Math.abs(r.right.y-r.left.y)<=1,'the Applet\'s controls follow Back '+JSON.stringify({left:r.left,right:r.right}));
  for(const box of [r.left,r.right])assert.ok(!overlaps(box,r.title));
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // Without window controls in the corner (Windows), the row is the same.
  const {page,errors}=await open({width:1100,height:760,leading:false});
  await enter(page,'stripe','Stripe');await page.locator('.applet-mode-toggle').waitFor();
  const r=await bar(page);
  assertShelfRow(r,1100,'Stripe without traffic lights',false);
  assert.ok(r.back.x>=16&&r.back.x<=17,'Back starts the row 16px in '+JSON.stringify(r.back));
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  // The World keeps its title centered on the window, where it was, and no shelf.
  const {page,errors}=await open();
  const r=await bar(page);
  assert.equal(r.back,null,'no Back in the World');assert.equal(r.shelf,null,'no shelf in the World');
  assert.ok(Math.abs(center(r.title)-720)<=1&&Math.abs(r.title.y-24)<=1,'the World title stays centered at the top '+JSON.stringify(r.title));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS 900px keeps the shelf and the named icons, a stacked window has no shelf and puts the title below the bar, the row is the same without traffic lights, and the World title stays centered.');
});
