// The world is a physical place, so its rules are physical. Every Applet is a device
// you could walk up to: one of a kind in its region, standing on the ground it was
// given, at a size that reads next to a bench and a tree.
import assert from 'node:assert/strict';
import {launchTestBrowser} from './browser-test.ts';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {VILLAGE_SITES} from '../ui/world/village-sites.ts';
import {appletStyle} from '../ui/components/style.ts';


// Two Applets in one region with the same device are two Applets you cannot tell apart.
// A painted device is its own authored painting, not the shared template.
const seen=new Map();
for(const app of WORLD_APPS){
 const key=(app.region||'bridge')+':'+app.scene.template+':'+app.scene.renderer+(app.scene.renderer==='painted-device'?':'+appletStyle(app.key).peek:'');
 assert.equal(seen.has(key),false,app.key+' and '+seen.get(key)+' would stand in '+(app.region||'the bridge')+' as the same device');
 seen.set(key,app.key);
}
// Every region has five places on the ground; members beyond five wait on its shelf.
for(const [region,recipe] of Object.entries(VILLAGE_SITES)){
 const held=WORLD_APPS.filter(app=>app.region===region).length;
 assert.ok(recipe.slots.length===5&&held>0,region+' has '+recipe.slots.length+' ground places for '+held+' Applets');
}
// Food delivery belongs with daily living in Life, not out in a field.
assert.equal(WORLD_APPS.find(app=>app.key==='doordash').region,'money');
const browser=await launchTestBrowser({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));const consoleErrors:string[]=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,200));});
 // A wait that times out says which line waited and where the World stood, since the RC keeps only the first line.
 const waitFor=page.waitForFunction.bind(page);
 page.waitForFunction=(async(fn:any,arg?:any,options?:any)=>{
  const line=new Error().stack?.split('\n')[2]?.match(/:(\d+):\d+\)?$/)?.[1];
  try{return await waitFor(fn,arg,options);}
  catch(error){const state=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics;return m?{active:m.active,level:m.level,hovered:m.hoveredRegion,camera:m.camera,shelf:!!document.querySelector('.region-shelf')}:null;}).catch(()=>null);throw new Error('world-scene-check.ts:'+line+' wait timed out; the World: '+JSON.stringify(state),{cause:error});}
 }) as typeof page.waitForFunction;
 await page.addInitScript(()=>{
  const item=(id,kind,title,extra={})=>({id,kind,provider:'gmail',status:'open',title,context:'One line.',reason:'One line.',summary:'Saved context',attentionContentVersion:1,policyVersion:2,...(kind==='task'?{attentionReason:'r'}:{}),sources:[{provider:'gmail',id:id+'s',quote:'q'}],createdAt:1,updatedAt:2,...extra});
  window.fixture={workspaceId:'scene',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   worldItems:[item('a','task','Confirm school pickup',{priority:'urgent'}),item('b','task','Send the signed lease'),item('c','update','Refund cleared')],
   connections:[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true,running:false,failed:false,needsAttention:true,savedItemCount:3,resultCount:3,summary:'Two things need a reply',records:[]}],sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};if(b.action==='appContent')return {pages:[]};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 });
 await page.goto(pathToFileURL(path.resolve('dist/WorldletWeb/index.html')).href);
 // Devices are listed while the World still loads its lighting; region names and Applet pins are
 // placed only once it is ready, which on a slow host comes seconds later.
 // A timeout says how far the World got and what the page threw, not only that it timed out.
 await page.waitForFunction(n=>{const m=document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics;return m?.renderer==='pixi-webgl'&&m.modules.length===n;},WORLD_APPS.length).catch(async error=>{
  const state=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics;const gl=document.createElement('canvas').getContext('webgl2');return {renderer:m?.renderer??null,modules:m?.modules.length??null,webgl2:gl?gl.getParameter(gl.VERSION):null};}).catch(e=>({unreadable:String(e)}));
  throw new Error('World not ready: '+JSON.stringify({...state,expected:WORLD_APPS.length,errors,console:consoleErrors.slice(0,10)}),{cause:error});
 });

 await page.waitForFunction(()=>document.querySelector('.companion-context .companion-name')?.textContent==='Worldlet');
 assert.equal(await page.locator('.companion-context').isVisible(),true,'overview shows the Worldlet title');
 // No area floats a plus; the region name is the only label, and it opens the region shelf.
 assert.equal(await page.locator('.notion-pin[data-action="add-applet"]').count(),0,'No area offers a floating plus');
 const area=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.buildings.find(b=>b.id==='building-travel'));
 assert(area,'Entertainment uses its persisted region identity');
 const name=page.locator('.notion-pin[data-page="building-travel"][data-action="region-more"]');
 assert.equal(await name.count(),1,'Entertainment shows one clickable region name');
 assert.equal(await name.locator('strong').textContent(),'Entertainment');
 const nameBox=await name.boundingBox();assert(nameBox,'region name target is visible');assert.ok(nameBox.width>=24&&nameBox.height>=24,'region name is large enough to click');

 // Nothing is buried in the ground or floating over it, and nothing overlaps its neighbour.
 const placed=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.filter(m=>m.entity==='app').map(m=>({id:m.id,region:m.region,position:m.position,visible:m.visible})));
 assert.equal(placed.length,WORLD_APPS.length);
 for(const device of placed)assert.ok(Number.isFinite(device.position[1]),device.id+' has no ground under it');
 for(const region of new Set(placed.map(d=>d.region))){
  // Weather lives in the top-right HUD and takes no ground slot (#35).
  const here=placed.filter(d=>d.region===region&&d.visible),held=WORLD_APPS.filter(a=>'building-'+a.region===region&&a.installByDefault!==false&&a.key!=='weather').length;
  assert.equal(here.length,Math.min(held,5),region+' stands at most five of its '+held+' installed Applets on the ground');
  for(let i=0;i<here.length;i++)for(let j=i+1;j<here.length;j++){
   const gap=Math.hypot(here[i].position[0]-here[j].position[0],here[i].position[1]-here[j].position[1]);
   assert.ok(gap>.015,here[i].id+' and '+here[j].id+' stand '+gap.toFixed(1)+' apart; they would share the same ground');
  }
 }

 // The camera never zooms: a Region keeps the whole world in view, exactly as the overview frames it.
 const viewport=()=>page.evaluate(()=>{const v=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.framing.viewport;return {x:v.x,y:v.y,scale:v.scale};});
 const overviewViewport=await viewport();
 for(const region of [...new Set(WORLD_APPS.map(a=>a.region).filter(Boolean))]){
  await page.evaluate(id=>location.hash='building=building-'+id,region);
  await page.waitForFunction(id=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active==='building-'+id&&m.camera.settled;},region);
  assert.deepEqual(await viewport(),overviewViewport,region+' does not zoom the world');
  assert.equal(await page.locator('.companion-context').isVisible(),true,'Region keeps its title');
  const expected=placed.filter(d=>d.region==='building-'+region&&d.visible).map(d=>d.id);
  try{await page.waitForFunction(ids=>ids.every(id=>{const pin=document.querySelector<HTMLElement>('.notion-pin[data-page="place-'+id+'"]');return pin&&pin.style.visibility!=='hidden';}),expected,{timeout:8000});}
  catch{throw new Error(region+' does not show all of its ground Applets: '+JSON.stringify(await page.evaluate(ids=>ids.filter(id=>!document.querySelector<HTMLElement>('.notion-pin[data-page="place-'+id+'"]')),expected)));}
  if(process.env.WORLD_LAYOUT_SCREENSHOTS){await mkdir('output/world-layout',{recursive:true});await page.screenshot({path:'output/world-layout/'+region+'.png'});}
 }
 await page.evaluate(()=>location.hash='');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled);
 // The whole area is clickable: its ground and its landmark open the same area panel as its name, while a
 // device standing in the area still opens its Applet. On a wide window the panel docks on the right and the
 // World zooms the area into the space left of it without entering it; closing the panel zooms back out.
 const shelf=page.locator('.region-shelf');
 // Under reduced motion a closed panel or a new hash snaps the camera and reports it settled at once, but the World's hit
 // test and pins follow only on its next painted frame: a point read before it hit what the zoomed-in area painted there
 // (Mac RC 4d736e7a: Explore's landmark read as Work's). Each point is read two painted frames after the camera moved.
 const painted=async()=>{const from=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.performance.frames);await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.performance.frames>=n+2,from);};
 const opensArea=async(x:number,y:number,title:string,what:string)=>{
  assert.equal(await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.tagName,[x,y]),'CANVAS',what+' is tapped on the world itself');
  await page.mouse.move(x,y);
  await page.waitForFunction(()=>!!document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.hoveredRegion);
  await page.mouse.click(x,y);
  await shelf.waitFor({timeout:5000}).catch(async e=>{throw new Error(what+' '+JSON.stringify(await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return {active:m.active,level:m.level,hovered:m.hoveredRegion};})));});
  assert.equal(await shelf.getByRole('heading',{level:2}).textContent(),title,what+' opens the '+title+' panel');
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active),'overview',what+' does not enter the area');
  const side=await shelf.boundingBox();
  const width=page.viewportSize()!.width;
  assert(side&&Math.abs(side.x+side.width+12-width)<2&&side.x>width/2-100,what+' opens the panel on the right half');
  await page.waitForFunction(()=>{const c=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera;return c.settled&&!!c.area&&c.span<1;});
  assert.ok((await viewport()).scale>overviewViewport.scale,what+' zooms the area in');
  // Applets keep their overview size while the area is zoomed; the room goes to more of its Applets (owner request 2026-10-08).
  const sizes=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.modules.filter(d=>d.visible&&d.entity==='app'&&d.region==='building-'+String(m.camera.area).replace(/^building-/,'')).map(d=>d.scale[0]*m.framing.viewport.scale);});
  assert.ok(sizes.length&&sizes.every(size=>Math.abs(size/overviewViewport.scale-1)<.01),what+' keeps Applets at their overview size: '+JSON.stringify(sizes.map(size=>+(size/overviewViewport.scale).toFixed(3))));
  await page.keyboard.press('Escape');await shelf.waitFor({state:'detached'});
  await page.waitForFunction(()=>{const c=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera;return c.settled&&!c.area;});
  assert.deepEqual(await viewport(),overviewViewport,what+' zooms back out when the panel closes');
 };
 await painted();
 const travel=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(d=>d.region==='building-travel'&&d.visible);return m.arrivalBounds;});
 await opensArea(travel.x+travel.width/2,travel.y+travel.height+30,'Entertainment','Entertainment ground');
 // Tap each landmark where its own paint shows, not under a device or its attention mark.
 // Every sampled point is kept with what covers it, so a landmark with no reachable paint says why: what the World's
 // own hit test finds there (a device, ground, the landmark) and which page element is on top, counted, kept short
 // enough for the RC's one-line failure.
 // Each landmark is read right before its tap, with the pointer off the World: the previous tap's hover label
 // and the pins it moved are gone by then (a list read once went stale on Mac RC 2947).
 const readLandmarks=()=>page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;const tally=(list:string[])=>Object.entries(list.reduce((n,k)=>({...n,[k]:(n[k]||0)+1}),{} as Record<string,number>)).map(([k,n])=>k+'×'+n).join(' ');return m.landmarks.map(l=>{const tried=l.hits.map(p=>{const e=document.elementFromPoint(p.x,p.y);return {...p,on:e?.tagName==='CANVAS'?'world':e?e.tagName.toLowerCase()+(e.className?'.'+String(e.className).trim().split(/\s+/).join('.'):''):'nothing'};});return {id:l.id,hit:tried.find(p=>p.landmark&&p.on==='world'),title:m.buildings.find(b=>b.id===l.id)?.title,why:{night:l.nightAmount,top:tally(tried.map(p=>p.top)),on:tally(tried.map(p=>p.on)),at:tried.slice(0,3).map(p=>Math.round(p.x)+','+Math.round(p.y))}};});});
 const ids=(await readLandmarks()).map(l=>l.id);
 assert.ok(ids.length>=5,'every area stands a landmark');
 for(const id of ids){await page.mouse.move(0,0);await painted();const landmark=(await readLandmarks()).find(l=>l.id===id);assert(landmark.hit,landmark.id+' landmark shows paint a pointer can reach: '+JSON.stringify(landmark.why));await opensArea(landmark.hit.x,landmark.hit.y,landmark.title,landmark.id+' landmark');}
 await page.mouse.move(0,0);await painted();
 const device=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(d=>d.region==='building-travel'&&d.visible&&d.entity==='app'));
 await page.mouse.click(device.peekHit.x,device.peekHit.y);
 await page.waitForFunction(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active===id,device.id);
 assert.equal(await shelf.count(),0,'a device in the area opens its Applet, not the area panel');
 await page.evaluate(()=>location.hash='');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='overview');
 await page.waitForFunction(()=>document.querySelector('.companion-context .companion-name')?.textContent==='Worldlet');
 assert.equal(await page.locator('.companion-context').isVisible(),true,'return restores the Worldlet title');
 // Attention is asked for in one place. The panel holds what is waiting; the world
 // is left to be a world, with no badges floating over its roofs.
 await page.locator('.world-matter').first().waitFor();
 assert.equal(await page.evaluate(()=>document.querySelectorAll<HTMLElement>('.world-roof-action').length),0,'the world floats no attention marks over its regions');
 assert.ok(await page.evaluate(()=>document.querySelectorAll<HTMLElement>('.world-matter').length)>0,'what is waiting is still asked for, in the panel');
 const frame=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics);
 assert.equal(frame.renderer,'pixi-webgl');
 assert.equal(frame.representation,'layered-2.5d');
 if(process.env.WORLD_LAYOUT_SCREENSHOTS)await page.screenshot({path:'output/world-layout/overview.png'});
 const bridgePosition=placed.find(d=>d.id==='app-doordash').position;
 assert.deepEqual(bridgePosition,[.644,.426],'DoorDash uses its Life slot');
 assert.deepEqual(errors,[]);
 console.log('PASS world scene: '+WORLD_APPS.length+' Applets, each a device of its own in its region, at most five on each region ground, clear of its neighbours; no plus or mark floats over the world and the panel carries what is waiting; DoorDash uses its Life slot; the ground and landmark of an area open its panel on the right and zoom the area in until it closes, while its devices open their Applets.');
}finally{await browser.close();}
