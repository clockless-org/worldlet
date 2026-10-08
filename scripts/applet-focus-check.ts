import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('output/applet-layout',{recursive:true});
import {withBrowser,fileAccess,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {appHudIcon} from '../ui/applets/visuals.ts';
const OPENED=['gmail','google-calendar','apple-notes','apple-reminders','weather','messages','github','notion','youtube','airbnb','browser','game-2048'];
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.calls=[];window.fixture={workspaceId:'applet-full-view',revision:0,sources:[],knowledge:[],connections:[{provider:'gmail',status:'connected',resultCount:3,summary:'Two messages need a reply'},...['apple-notes','apple-reminders','google-calendar','notion','github','paypal','stripe','doordash','youtube','x','google-drive'].map(provider=>({provider,status:'connected'}))],onboarding:{completed:true},sampleEnabled:false};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:false};if(b.action==='appContent')return {pages:[]};if(['codexSession','developmentSessions'].includes(b.action))return {providers:[]};if(b.action==='doorDash')return {ok:true,installed:true,enabled:false};if(b.action==='agentChat')return {message:'You can keep chatting while setup waits.'};return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 const panel=page.locator('#notionContent');
 // A ground pin is only its device's lamp/label anchor (ae021887); the Pixi device takes the tap.
 // Aim at its painted pixels once the camera and any panel framing have settled.
 const tapDevice=async(id:string)=>{
  await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.renderer==='pixi-webgl'&&m.camera.settled&&m.framing.amount<.01;});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  // Fox's card stays over the World (it never shifts, #2158): where it covers the aim, the nearest uncovered
  // point of the device's painted area takes the tap, as a person would click there.
  const p=await page.evaluate(id=>{
   const d=document.querySelector<any>('#notionWorld').sceneMetrics.modules.find(d=>d.id===id),stage=document.querySelector('#notionStage').getBoundingClientRect();
   const open=(x:number,y:number)=>{const e=document.elementFromPoint(x,y);return e instanceof HTMLCanvasElement&&!!e.closest('#notionWorld');};
   const aim={x:stage.x+d.peekHit.x,y:stage.y+d.peekHit.y};
   if(open(aim.x,aim.y))return aim;
   const b=d.peekBounds,points=[];
   for(const across of [.5,.35,.65,.2,.8])for(const down of [.45,.3,.6,.2,.75])points.push({x:stage.x+b.x+b.width*across,y:stage.y+b.y+b.height*down});
   return points.find(q=>open(q.x,q.y))||aim;
  },id);
  await page.mouse.click(p.x,p.y);
  return p;
 };
 // Devices are listed while the World still loads its lighting; Applet pins are placed, and the
 // devices take taps, only once it is ready, which on a slow host comes seconds later (#1467).
 await page.waitForFunction(n=>{const m=document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics;return m?.renderer==='pixi-webgl'&&m.modules.length===n;},WORLD_APPS.length);
 // Notes and Reminders are local Mac Applets: they unfold their native records
 // in-world. Other current entries retain their explicitly declared route.
 for(const key of ['apple-notes','apple-reminders']){
  const app=WORLD_APPS.find(a=>a.key===key);
  assert.equal(app.fullView.kind,'scene',key+' has an in-world Open stage');
  assert.equal(app.connection.kind,'native',key+' reads through its local adapter');
 }
 // A representative few open in turn, one of each way in (owner request 2026-10-05: no RC opens every Applet, and
 // an RC finishes within 20 minutes): the Home Applets on their stages (Home has more than its five ground places, so
 // one opens from the region shelf), GitHub and Notion on theirs, YouTube, Airbnb and the Browser as websites, and a
 // game board. New launch-only entries have their own all-30 route/pagination fixture.
 for(const key of OPENED)assert.ok(WORLD_APPS.some(a=>a.key===key&&a.installByDefault!==false),key+' is a default Applet');
 for(const app of WORLD_APPS.filter(a=>OPENED.includes(a.key))){
  await page.evaluate(id=>location.hash=id?'building=building-'+id:'',app.region);
  if(app.key==='youtube'){await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled);await page.screenshot({path:'output/applet-layout/explore-region.png'});}
  const showsAtEntry=await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length);
  const pin=page.locator('.notion-pin[data-page="place-'+app.id+'"]');
  const onGround=await pin.waitFor({timeout:8000}).then(()=>true,()=>false);
  let tapped=null;
  if(onGround)tapped=await tapDevice(app.id);
  else {
   // Beyond a region's five ground places, the Area panel lists the person's other Applets under Recently used, and
   // catalog Applets they do not have under Recommended or, behind one button, All.
   const region=await page.evaluate(id=>document.querySelector<any>('#notionWorld').sceneMetrics.modules.find(module=>module.id===id).region,app.id);
   await page.evaluate(()=>{location.hash='';});
   await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='overview');
   await page.locator('[data-action="region-more"][data-page="'+region+'"]').click();
   const tile=page.locator('.region-shelf-grid').getByRole('button',{name:app.title,exact:true});if(!await tile.count())await page.locator('.region-shelf-all').click();await tile.click();
  }
  // When the Applet does not open, say what the World was doing, so a failure on a release host
  // can be diagnosed from its log alone (#1468).
  await page.waitForFunction(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active===id,app.id).catch(async error=>{
   const state=await page.evaluate(({id,tapped})=>{const m=document.querySelector<any>('#notionWorld').sceneMetrics,d=m.modules.find(d=>d.id===id),hit=tapped&&document.elementFromPoint(tapped.x,tapped.y);
    return {renderer:m.renderer,level:m.level,active:m.active,frames:m.performance.frames,device:d&&{visible:d.visible,unlocked:d.unlocked,peekHit:d.peekHit},tapped,elementAtTap:hit&&(hit.tagName+(hit.className?'.'+String(hit.className).trim().split(/\s+/).join('.'):'')),pins:document.querySelectorAll('.notion-pin').length,hash:location.hash};},{id:app.id,tapped});
   throw new Error(app.key+' did not open from its '+(onGround?'device':'region shelf')+': '+JSON.stringify(state)+(errors.length?' page errors: '+errors.join(' | '):''),{cause:error});
  });
  // Permission guidance (Voice Memos Full Disk Access) and Fox, which opens its companion panel, are not Applet steps.
  assert.equal(await page.getByRole('button',{name:/^Open (?!permission settings$|companion panel$)/}).and(page.locator('button:not(.applet-mode-web):not([data-slot=companion])')).count(),0,app.key+' has no intermediate Open control');
  assert.equal(await page.locator('.notion-pin[data-kind=app-action]').count(),0);
  if(app.fullView.kind==='web'){
   await panel.locator('.browser-viewport').waitFor();
   await page.waitForFunction(({key,platform,url})=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===key&&calls.some(c=>c.action==='browserShow'&&c.platform===platform&&(!url||c.url===url)),{key:app.key,platform:app.fullView.platform,url:['web','notion'].includes(app.fullView.platform)?app.fullView.url:null});
   // Entry never starts a Fox turn: the dialogue shows this place's conversation, or a
   // local line saying what Fox can do here (fox-greeting.ts).
   assert.equal(await page.evaluate(()=>calls.some(c=>['agentChat','cloudRequest'].includes(c.action))),false,app.key+' opens its website without a Fox turn');
   if(await page.locator('.companion-dialogue').isVisible())assert.doesNotMatch(await page.locator('.companion-dialogue').innerText(),/Something went wrong|could not/i,app.key+' shows only its local context line');
   assert.equal(await panel.locator('h1').count(),0);
   const logo=page.locator('.companion-app-logo');
   assert.equal(await page.locator('.companion-context-icon[data-kind=emoji]').isVisible(),false,'no emoji fallback');
   if(await logo.isVisible())await page.waitForFunction(()=>document.querySelector<HTMLImageElement>('.companion-app-logo').naturalWidth>0);
   // The corner Settings control is hidden in the current console; when shown, the website leaves room for it.
   const viewport=await panel.locator('.browser-viewport').boundingBox(),gear=await page.locator('#notionAccount').boundingBox();if(gear)assert.ok(viewport.x+viewport.width+12<=gear.x||viewport.y+viewport.height+12<=gear.y,'website leaves room for settings: '+JSON.stringify({viewport,gear}));
   // The recovery Settings menu was removed; the layout screenshot remains for review.
   if(['notion','airbnb'].includes(app.key))await page.screenshot({path:'output/applet-layout/'+app.key+'.png'});
   const shows=await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length);
   await page.evaluate(()=>{fixture.activityRevision=(fixture.activityRevision||0)+1;return worldletReceive(structuredClone(fixture));});
   assert.equal(await panel.isVisible(),true);assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),shows,'background updates preserve '+app.key);
  }else if(app.fullView.kind==='scene'){
   // The world does not go away: the device becomes the stage, in place.
   await page.waitForFunction(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.id===id,app.id);
   // Weather keeps its device stage and reads the seven-day forecast in the Village HUD panel.
   if(app.key==='weather')await page.locator('#notionContent[data-template=weather]').waitFor();
   else assert.equal(await panel.isVisible(),false,app.key+' opens in the world, not in a reader panel');
   assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),showsAtEntry,app.key+' opens no website of its own accord');
   await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.renderer==='pixi-webgl'&&m.camera.settled&&m.presentation.foregroundWidth>180;});
  }else if(app.fullView.kind==='game'){
   // A game opens its board in the Village HUD beside its device; nothing else is read or shown.
   await page.locator('#notionContent[data-template=game] .game-board').waitFor();
   assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),showsAtEntry,app.key+' opens no website');
  }else await panel.locator('.app-device-inventory').waitFor();
  assert.match(await page.locator('.world-context').innerText(),new RegExp(app.title));
  // Pointer release schedules HUD context separately from the reduced-motion camera.
  await page.waitForFunction(title=>document.querySelector('.companion-context .companion-name')?.textContent===title,app.title);
  await page.locator('.companion-app-logo').waitFor({state:appHudIcon(app).source?'visible':'hidden'});
  assert.equal(await page.locator('.companion-app-logo').isVisible(),!!appHudIcon(app).source,app.key+' shows a title icon only for a genuine brand');
  if(['gmail','google-calendar','apple-notes','apple-reminders','weather','browser'].includes(app.key))assert.equal(appHudIcon(app).source,'','generic Applets have no identity icon');
  if(app.key==='weather')await page.screenshot({path:'output/applet-layout/weather-focus.png'});
  if(app.key==='airbnb')await page.screenshot({path:'/tmp/applet-airbnb-full-view.png'});
  const before=await page.evaluate(()=>calls.filter(c=>c.action==='browserHide').length);
  await leaveApplet(page);
  // Back returns to where the Applet was opened: its region, or the overview for shelf entries.
  const expected=app.region&&onGround?'building-'+app.region:'overview';
  try{await page.waitForFunction(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active===id,expected);}
  catch(error){throw new Error(app.key+' did not return to '+expected+'; active='+await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.active)+'; '+error.message);}
  assert.equal(await panel.isVisible(),false,app.key+' returns directly to Preview');
  if(app.fullView.kind==='web')await page.waitForFunction(n=>calls.filter(c=>c.action==='browserHide').length>n,before);
 }
 assert.equal(await page.evaluate(()=>calls.some(c=>['connect','agentChat','original'].includes(c.action))),false,'viewing never authorizes accounts or requests private content');
 // Four core Applets and Notion read their records; the Meetings radar also refreshes the
 // connected calendar about once a minute in the background (c48dbb10), so its count varies.
 const reads=await page.evaluate(()=>calls.filter(c=>c.action==='appContent').map(c=>c.provider));
 assert.deepEqual(reads.filter(p=>p!=='google-calendar'),['gmail','apple-notes','apple-reminders','notion'],'only the Applets with records read them');
 assert.ok(reads.includes('google-calendar'),'Calendar and Meetings read the calendar');
 // Legacy Fox/setup entry points preserve the actual entry region.
 const legacyEntry=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active);
 for(const key of ['airbnb','tiktok','discord']){
  await page.evaluate(key=>worldletShowControls('sources',key),key);
  await page.waitForFunction(key=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===key&&!document.querySelector<HTMLElement>('#notionContent').hidden,key);
  assert.equal(await page.evaluate(()=>calls.some(c=>['agentChat','cloudRequest'].includes(c.action))),false,'legacy entry starts no Fox turn either');
 }
 await page.evaluate(()=>worldletShowControls('sources','github'));
 await page.locator('.pixi-applet-stage[data-applet=github]').waitFor();
 assert.equal(await panel.isVisible(),false,'GitHub legacy entry also opens its native repository stage');
 const shows=await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length);
 await page.evaluate(()=>worldletShowControls('sources','discord'));
 await panel.locator('.browser-viewport').waitFor();
 // The host reports a page's failure only after showing it; until browserShow, an error is from a
 // page out of sight, which Fox does not speak over the current place.
 await page.waitForFunction(n=>calls.filter(c=>c.action==='browserShow').length>n,shows);
 // Discord uses the shared website lifecycle even when loading/sign-in fails.
 await page.evaluate(()=>dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'error',platform:'web',message:'Fixture: Discord is offline',externalSignIn:true,retry:true}})));
 // Since 6e0de323 Fox owns load/sign-in failures; the panel caption stays empty.
 assert.equal(await panel.locator('.browser-caption').innerText(),'');
 await page.locator('.notion-hud').getByText(/Discord is offline/).first().waitFor();
 assert.equal(await panel.getByRole('button',{name:/Retry|Open .* in browser/}).count(),0,'website has no Worldlet recovery toolbar');
 await leaveApplet(page);
 // The catalog loop can end in a region (DoorDash belongs to Home).
 // Returning must preserve that origin rather than assuming the overview.
 try{await page.waitForFunction(expected=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active===expected&&m.camera.settled;},legacyEntry);}
 catch(error){throw new Error('Legacy Applet back expected '+legacyEntry+'; '+JSON.stringify(await page.evaluate(()=>({hash:location.hash,active:document.querySelector<HTMLElement>("#notionWorld").sceneMetrics.active})))+'; '+error.message);}
 // Reopen Discord from its current region (or that region's shelf when it is not on the ground).
 const discordRegion=await page.evaluate(()=>document.querySelector<any>('#notionWorld').sceneMetrics.modules.find(m=>m.id==='app-discord').region);
 await page.evaluate(region=>location.hash='building='+region,discordRegion);
 await page.waitForFunction(region=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active===region&&m.camera.settled;},discordRegion);
 const discordShows=await page.evaluate(()=>calls.filter(c=>c.action==='browserShow'&&c.url==='https://discord.com/app').length);
 const discordPin=page.locator('.notion-pin[data-page="place-app-discord"]');
 if(await discordPin.count())await tapDevice('app-discord');
 else {await page.evaluate(()=>{location.hash='';});await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='overview');await page.locator('[data-action="region-more"][data-page="'+discordRegion+'"]').click();const discord=page.locator('.region-shelf-grid').getByRole('button',{name:'Discord',exact:true});if(!await discord.count())await page.locator('.region-shelf-all').click();await discord.click();}
 await page.waitForFunction(n=>calls.filter(c=>c.action==='browserShow'&&c.url==='https://discord.com/app').length>n,discordShows);
 assert.equal(await panel.locator('.browser-caption.is-error').count(),0,'reopen clears the failed page');
 // A stage that hides the website, then the website again before the next frame (a slow host): it is shown anew.
 const quick=await page.evaluate(()=>new Promise<number>(resolve=>{const content=document.querySelector<HTMLElement>('#notionContent'),n=calls.filter(c=>c.action==='browserShow').length;
  new MutationObserver((_,o)=>{if(!content.hidden)return;o.disconnect();queueMicrotask(()=>{worldletShowControls('sources','discord');resolve(n);});}).observe(content,{attributes:true});
  worldletShowControls('sources','github');}));
 await page.waitForFunction(n=>calls.filter(c=>c.action==='browserShow').length>n,quick);
 // Opening an unconnected account Applet starts its authorization directly; no status panel or Connect button in between.
 await page.evaluate(()=>{fixture.connections=fixture.connections.filter(c=>c.provider!=='apple-reminders');fixture.revision++;return worldletReceive(structuredClone(fixture));});
 await page.evaluate(()=>location.hash='object=app-apple-reminders');
 await page.waitForFunction(()=>calls.some(c=>c.action==='connect'&&c.provider==='apple-reminders'));
 assert.equal(await page.getByRole('button',{name:'Connect Reminders',exact:true}).count(),0,'no intermediate Connect panel');
 assert.equal(await page.locator('.module-state').count(),0,'no support/connection status label');
 const regions=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.buildings.map(b=>b.id));
 assert.deepEqual([...regions].sort(),['building-health','building-home','building-library','building-money','building-travel','building-work'],'six areas remain (People merged away)');
 // A service that is not wanted is deleted, not hidden: every definition is in the world.
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.filter(m=>m.entity==='app').length),WORLD_APPS.length,'every definition takes a place in the world');
 for(const key of ['readwise','ynab','apple-health','google-contacts'])
  assert.equal(WORLD_APPS.some(a=>a.key===key),false,key+' is gone from the roster, not hidden behind a flag');
 const work=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.filter(m=>m.region==='building-work').map(m=>m.id));
 for(const id of ['app-claude-code','app-codex','app-github','app-meetings'])assert.ok(work.includes(id),'GitHub, Codex, Claude Code and the Meetings radar dock in Work: '+id);
 // In the right third Fox keeps a lane of its own: centred between its two wings,
 // no action pressed against it or past the third, and labels that wrap rather than
 // clip. Measure the actual Applet controls at both supported narrow widths.
 // Model setup suggestions belong to Fox and are not permanent Applet controls.
 const wings=async()=>page.evaluate(()=>{
  const pet=document.querySelector<HTMLElement>('.companion-pet').getBoundingClientRect(),hud=document.querySelector<HTMLElement>('.notion-hud').getBoundingClientRect();
  return {offset:Math.round((pet.left+pet.right)/2-(hud.left+hud.right)/2),
   buttons:[...document.querySelectorAll<HTMLElement>('.world-actions .world-capsule')].map(b=>{const r=b.getBoundingClientRect(),t=b.querySelector('span');
    return {label:b.innerText.trim().replace(/\s+/g,' '),cut:!!t&&(t.scrollWidth>t.clientWidth+1||t.scrollHeight>t.clientHeight+1),
     gap:Math.round(r.right<=pet.left?pet.left-r.right:r.left-pet.right),out:r.left<hud.left-1||r.right>hud.right+1};})};
 });
 for(const width of [1280,1024]){
  await page.setViewportSize({width,height:width===1280?850:820});
  await page.evaluate(()=>location.hash='object=app-airbnb');
  await page.locator('#notionContent .browser-viewport').waitFor();
  // The page's Back shows only with somewhere to go (owner request 2026-10-07); it marks a website page either way.
  await page.locator('.browser-back[data-web-page]').waitFor({state:'attached'});
  const lane=await wings();
  // The page's Back and Forward beside the title and no World button there; World and the Applet's actions sit in
  // Fox's lane (owner feedback 2026-10-04, owner request 2026-10-06).
  assert.equal(await page.locator('.applet-bar-left [data-slot=home]').count(),0,width+'px: no World button beside Back');
  assert.ok(lane.buttons.some(b=>b.label==='World'),width+'px: World stands beside Fox: '+JSON.stringify(lane));
  assert.ok(lane.buttons.every(b=>b.gap>=8),width+'px: the Applet\'s actions sit beside Fox: '+JSON.stringify(lane));
  assert.ok(Math.abs(lane.offset)<=2,width+'px: Fox sits centred between its two wings, off by '+lane.offset+'px');
  assert.deepEqual(lane.buttons.filter(b=>b.cut).map(b=>b.label),[],width+'px: an action label wraps rather than being cut');
  assert.deepEqual(lane.buttons.filter(b=>b.out||b.gap<8).map(b=>b.label),[],width+'px: no action crowds Fox or leaves the right third');
 }
 await page.setViewportSize({width:1280,height:850});
 await page.evaluate(()=>location.hash='');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='overview');
 assert.equal(await page.locator('.region-emoji').count(),0,'Region names are plain text');
 await page.evaluate(()=>location.hash='building=building-home');
 await page.waitForFunction(()=>document.querySelectorAll('.notion-pin[data-kind=app]').length>=4);
 assert.equal(await page.locator('.notion-pin[data-kind=app] .applet-icon').count(),0,'Peek names have no icon or emoji');
 await page.evaluate(()=>location.hash='');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='overview');
 await page.waitForFunction(()=>document.querySelector('.companion-context .companion-name')?.textContent==='Worldlet');
 assert.equal(await page.locator('.companion-context').isVisible(),true,'overview shows the Worldlet title');
 assert.equal(await page.locator('.companion-context-icon[data-kind=mark]').isVisible(),true,'World title uses the standard brand mark');
 await page.evaluate(()=>location.hash='building=building-health');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='building-health');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.companion-context').innerText.includes('Games'));
 assert.equal(await page.locator('.companion-context-icon').isVisible(),false,'Region title has no emoji');
 // Start the pixel-hit scenario with a fresh page, independent of the preceding
 // 25-Applet navigation/authorization fixture and its deferred HUD callbacks.
 await page.reload();
 await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,WORLD_APPS.length);
 // Click the actual cinema pixels, not its HTML title (WKWebView users do both).
 // The device keeps easing into place after the camera settles, so a hit read one
 // frame early can land outside its alpha mask and do nothing, and a second click
 // on an open scene means "back". Reset to Explore and take the whole entry again.
 for(let attempt=0;;attempt++){
  await page.evaluate(()=>location.hash='building=building-travel');
  await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active==='building-travel'&&m.camera.settled;});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  // While the world still frames itself for a detail panel, the left two thirds
  // belong to that panel and a pixel aimed at the device lands on empty world,
  // which reads as "go back". Wait for the plain Region framing first.
  // An Applet panel left open from an earlier step keeps the world framed for it,
  // and the left two thirds then belong to that panel: a pixel aimed at the device
  // lands on empty world, which reads as "go back". Close it through its own route.
  while(await page.locator('#notionContent').isVisible()){
   await leaveApplet(page);
   await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden,{},{timeout:4000});
  }
  await page.evaluate(()=>location.hash='building=building-travel');
  await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active==='building-travel'&&m.camera.settled;});
  try{await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.framing.amount<.01,{},{timeout:5000});}
  catch(error){if(attempt===3)throw error;continue;}
  if(!attempt)await page.screenshot({path:'output/applet-layout/explore-peek.png'});
  const cinema=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics,d=m.modules.find(d=>d.id==='app-youtube'),stage=document.querySelector('#notionStage').getBoundingClientRect();return {x:stage.x+d.peekHit.x,y:stage.y+d.peekHit.y};});
  await page.mouse.click(cinema.x,cinema.y);
  try{
   await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='app-youtube',{},{timeout:4000});
   await panel.locator('.browser-viewport').waitFor({timeout:8000});
   await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.focusScenery,{},{timeout:12000});
   break;
  }catch(error){if(attempt===3)throw new Error('the painted cinema did not open YouTube Focus: '+error.message);}
 }
 // Opening the cinema translates the existing Fox group without resizing or
 // replacing the user's draft or dialogue nodes.
 await page.evaluate(()=>location.hash='building=building-travel');
 await page.locator('.notion-pin[data-page="place-app-youtube"]').waitFor();
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Keep this draft');
 const geometry=()=>page.evaluate(()=>Object.fromEntries(['.notion-hud','.companion-pet','.companion-dialogue','.companion-text-entry'].map(selector=>{const e=document.querySelector<HTMLElement>(selector),r=e.getBoundingClientRect();return [selector,{width:r.width,height:r.height,font:getComputedStyle(e).fontSize}];})));
 const before=await geometry();
 await page.evaluate(()=>(window as any).savedFoxDialogue=document.querySelector('.companion-dialogue'));
 await tapDevice('app-youtube');
 await panel.locator('.browser-viewport').waitFor();
 // The dialogue shows the new context's line. It is max-content between 25vw and a
 // third of the window, so its width and height follow the text within those bounds.
 const settled=await geometry(),withoutDialogueSize=(g:any)=>({...g,'.companion-dialogue':{...g['.companion-dialogue'],width:0,height:0}});
 assert.deepEqual(withoutDialogueSize(settled),withoutDialogueSize(before),'Focus preserves Fox component widths, fonts and the other sizes');
 const dialogueWidth=settled['.companion-dialogue'].width,viewportWidth=page.viewportSize().width;
 assert.ok(dialogueWidth>=viewportWidth/4-1&&dialogueWidth<=viewportWidth/3+1,'Fox dialogue stays within its width bounds: '+dialogueWidth);
 assert.equal(await page.locator('#notionInput').inputValue(),'Keep this draft');
 assert.ok(await page.evaluate(()=>(window as any).savedFoxDialogue===document.querySelector('.companion-dialogue')),'the same dialogue node survives');
 const frame=await page.evaluate(()=>{
  const panel=document.querySelector<HTMLElement>('#notionContent'),p=panel.getBoundingClientRect(),slot=panel.querySelector('.browser-viewport').getBoundingClientRect();
  const rect=(window as any).calls.filter(c=>c.action==='browserShow'||c.action==='browserLayout').at(-1).rect;
  return {titleBottom:document.querySelector('.companion-context').getBoundingClientRect().bottom,left:p.left,top:p.top,bottom:innerHeight-p.bottom,inside:rect.x>=p.left+7&&rect.y>=p.top+7&&rect.x+rect.width<=p.right-7&&rect.y+rect.height<=p.bottom-7,slotRight:slot.right,panelRight:p.right};
 });
 assert.equal(frame.left,16,'browser frame stays near the window edge');
 assert.ok(frame.top>=frame.titleBottom+8,'browser frame leaves the context title visible');
 assert.ok(Math.abs(frame.bottom-frame.left)<1,'browser bottom and left margins match');
 assert.ok(frame.inside&&frame.slotRight<frame.panelRight,'native web surface stays inside the painted rim');
 await page.screenshot({path:'output/applet-layout/youtube-focus.png'});
 // Inside an Applet a click on empty scenery acts as Back, one level (owner request 2026-10-05), but while the
 // person is typing (the draft above keeps Fox's message bar focused) it only ends typing (#1901).
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'notionInput','the draft is still being typed');
 await page.mouse.click(1280*.72,850*.48);
 await page.waitForFunction(()=>document.activeElement?.id!=='notionInput');
 assert.equal(await panel.isVisible(),true,'a scenery click while typing only ends typing and keeps the Applet');
 assert.equal(await page.locator('#notionInput').inputValue(),'Keep this draft');
 await page.mouse.click(1280*.72,850*.48);
 await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active==='building-travel'&&m.camera.settled;});
 assert.equal(await panel.isVisible(),false,'a scenery click returns one level and closes the website');
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.focusScenery),false);

 assert.deepEqual(errors,[]);const kinds=WORLD_APPS.reduce((count,app)=>({...count,[app.fullView.kind]:(count[app.fullView.kind]||0)+1}),{} as Record<string,number>);
 console.log('PASS '+OPENED.length+' representative Applets opened and closed; all '+WORLD_APPS.length+' Applets, every definition in the world: '+kinds.web+' direct websites, '+kinds.scene+' stages, '+(kinds.game||0)+' games, '+(kinds.native||0)+' native views, context titles, single Back, background preservation, direct authorization, legacy Fox entry, region icons and the context title.');
});
