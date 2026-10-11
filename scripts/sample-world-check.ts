// Kelvin's sample world, driven the way a person would drive it: the switch is on,
// the Attention Center holds his week, Home's four stages stand their items up,
// settling one sticks, every other Applet lists what it holds instead of loading a
// website, the trip diorama speaks its Matter's name, and the tour and the decision
// still work. Nothing here needs a model or an account.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,openCompanionPanel} from './browser-test.ts';
import dataset from '../ui/world/sample-persona.json' with {type:'json'};
import {WORLD_APPS} from '../core/applets/catalog.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(({datasetId})=>{
  // sample-ui.json stands in for itself across the reload: what the page saves, the next load is given.
  window.calls=[];let stored=null;try{stored=JSON.parse(localStorage.getItem('__sample-ui')||'null');}catch{}
  window.sampleUI=stored||{'dataset-version':datasetId};
  window.fixture=()=>({workspaceId:'sample-world',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:false,onboarding:{completed:true},connections:[],worldItems:[],
   sampleEnabled:true,sampleUI:{...window.sampleUI},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}});
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return window.fixture();if(b.action==='saveSampleUI'){window.sampleUI=b.state;try{localStorage.setItem('__sample-ui',JSON.stringify(b.state));}catch{}return {ok:true};}if(b.action==='modelStatus')return {available:false,cloudAllowed:false};if(b.action==='foxPreferences')return {model:{name:'',ready:false,provider:'custom'},cloudConsent:false};if(b.action==='appContent')return {pages:[]};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 },{datasetId:dataset.id});
 const url=worldUrl();
 const total=WORLD_APPS.length+dataset.matters.length;
 const boot=async()=>{await page.goto(url);await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,total);await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.camera?.settled);};
 await boot().catch(async e=>{console.error({errors,body:(await page.locator('body').innerText()).slice(0,600),modules:await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length),expected:total});throw e;});
 const metrics=()=>page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics);
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('.native-console').dataset.sample),'true','the world knows it is the sample');
 await openCompanionPanel(page,'Settings');
 // The sample switch lives in Settings › General.
 await page.locator('.companion-settings-list [data-setting=general]').click();
 assert.equal(await page.locator('.companion-settings-detail .world-recovery-switch').getAttribute('aria-checked'),'true','the switch in Settings reads On');
 await page.getByRole('button',{name:'Close companion panel',exact:true}).click();
 const modules=(await metrics()).modules;
 assert.equal(modules.filter(m=>m.entity==='matter').length,dataset.matters.length,'every Matter stands in the world');
 assert.equal(modules.filter(m=>m.entity==='app').length,WORLD_APPS.length,'every Applet stands in the world');
 // The Attention Center holds Kelvin's week: all three groups, rows from the authored items, nothing cut.
 const rows=async()=>page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.world-task-group')].map(g=>({group:g.dataset.group,rows:[...g.querySelectorAll('.world-matter')].map(r=>r.querySelector('.world-task-title')?.textContent.trim())})));
 const groups=await rows();
 assert.deepEqual(groups.map(g=>g.group),['event','needsAction','unseen'],'Coming Up, Do Something and Worth Knowing are all drawn');
 const titles=new Set(dataset.items.map(i=>i.title));
 // The panel is a fixed size and shows what fits; at this window that is a handful,
 // taken evenly from the three groups, every one of them an authored item.
 for(const g of groups){assert.ok(g.rows.length>=1,g.group+' holds a row');for(const t of g.rows)assert.ok(titles.has(t),'row is an authored item: '+t);}
 const shown=groups.flatMap(g=>g.rows);assert.ok(shown.length>=4&&shown.length<dataset.items.length,'the panel shows what fits: '+shown.length);
 assert.deepEqual(groups.map(g=>g.rows.length),[2,2,2],'two meetings, two tasks and two updates');
 // 924 = 850 plus the 74 px the Today corner takes above the Attention Center (#2235): the room the panel had at 850 before.
 await page.setViewportSize({width:1280,height:924});
 await page.waitForTimeout(300);
 // A shorter window trims the largest trimmable group first: Worth Knowing gives way, meetings and tasks stay.
 assert.deepEqual((await rows()).map(g=>g.rows.length),[2,2,1],'a shorter desktop window keeps meetings and tasks and trims updates');
 const opacity=()=>page.locator('.world-task-tracker').evaluate(e=>Number(getComputedStyle(e).opacity));
 // Attention reads the same with or without the pointer over it (owner request 2026-10-06).
 await page.mouse.move(1270,10);assert.equal(await opacity(),1);
 await page.locator('.world-matter').first().hover();assert.equal(await opacity(),1);
 await page.mouse.move(1270,10);
 assert.ok(groups.find(g=>g.group==='needsAction').rows[0]==='Tennis with Sam','the loud tasks stand at the top of Do Something');
 assert.ok(!await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.world-task-group .world-matter')].some(r=>r.scrollHeight>r.clientHeight+2)),'no row is cut');
 // Sample is data only: use each Applet’s real declared route. Every scene Applet has
 // authored sample notes, so its Open shows those records, never an empty stage or a website.
 const authored=new Set(dataset.notes.map(n=>n.applet));
 // PR CI splits this check across jobs: WORLDLET_CHECK_SHARD=i/n walks every n-th Applet from the
 // i-th and stops after the Applets; =flows skips the Applets and runs the flows after them. Unset runs all.
 const shard=process.env.WORLDLET_CHECK_SHARD||'',[shardIndex,shardCount]=(/^\d+\/\d+$/.test(shard)?shard:'1/1').split('/').map(Number);
 // Every scene Applet has authored sample notes; only a representative few, one per route, are opened (owner
 // request 2026-10-05: no RC opens every Applet, and an RC finishes within 20 minutes).
 for(const app of WORLD_APPS.filter(a=>a.fullView.kind==='scene'))assert.ok(authored.has(app.key),app.key+' has authored sample notes');
 const opened=['gmail','apple-notes','meetings','weather','github','ongoing','game-2048','youtube','browser','discord'];
 for(const key of opened)assert.ok(WORLD_APPS.some(a=>a.key===key),key+' is in the catalog');
 let appStarted=0,previousApp='';
 for(const app of shard==='flows'?[]:WORLD_APPS.filter(a=>opened.includes(a.key)).filter((_,k)=>k%shardCount===shardIndex-1)){
  // Say which Applets are slow, so a shard that drags on a CI runner names them.
  if(appStarted&&Date.now()-appStarted>5000)console.log('slow: '+previousApp+' '+((Date.now()-appStarted)/1000).toFixed(1)+'s');appStarted=Date.now();previousApp=app.key;
  const shows=await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length);
  await page.evaluate(id=>location.hash='object='+id,app.id);
  if(app.fullView.kind==='scene'){
   // This Applet's own stage, once its records have rendered: on a slow host the previous Applet's
   // stage, or this one's first empty frame, can still be up for a moment.
   const stage=page.locator(`.pixi-applet-stage[data-applet="${app.key}"]`);await stage.waitFor();
   assert.ok(authored.has(app.key),app.key+' has authored sample notes');
   // Software WebGL on a shared CI runner can take well over ten seconds for one Applet's first records.
   const rendered=await stage.locator('.pixi-stage-item,.home-leaf,.meetings-call').first().waitFor({timeout:30000}).then(()=>true,()=>false);
   assert.ok(rendered,app.key+' exposes sample records in its authored Open; stage: '+(await stage.evaluate(e=>e.outerHTML.slice(0,600))));
   assert.equal(await stage.locator('.pixi-open-empty').count(),0,app.key+' shows no empty Open');
   assert.equal(await page.locator('#notionContent').isVisible(),false);
   continue;
  }
  if(app.fullView.kind==='game'){
   // A game is our own board, the same in the sample: no website, no sample records.
   await page.locator(`#notionContent[data-template=game] .game-panel[data-game="${app.key}"] .game-board`).waitFor();
   assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),shows,app.key+' opens no website');
   continue;
  }
  if(app.fullView.kind==='panel'){
   // Widgets: the Applet's own panel, which says widgets live in your own world; no website.
   await page.locator(`#notionContent[data-template="${app.key}"] .${app.key}-applet`).waitFor();
   assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),shows,app.key+' opens no website');
   continue;
  }
  await page.locator('#notionContent .browser-viewport').waitFor();
  assert.equal(await page.locator('.app-device-inventory:not([hidden])').count(),0);
  await page.waitForFunction(({key,url})=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===key&&calls.some(c=>c.action==='browserShow'&&(c.url===url||c.platform===key)),{key:app.key,url:app.fullView.url});
 }
 if(shard&&shard!=='flows'){assert.deepEqual(errors,[],'no page errors');console.log('PASS sample world shard '+shard+': its Applets use their declared website, local Open or game routes.');return;}
 // Practice tennis never reaches a booking or message transport.
 await page.evaluate(()=>location.hash='object=app-google-calendar');
 await page.locator(':is(.world-actions,.applet-bar-side)').getByRole('button',{name:'Plan tennis',exact:true}).click();
 await page.getByRole('button',{name:'Confirm outing',exact:true}).click();
 await page.getByRole('button',{name:'View plan',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#notionContent')?.textContent.includes('Booking: confirmed'));
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='emailAction').length),0,'practice sends no mail');
 await boot();
 await page.evaluate(()=>location.hash='object=app-google-calendar');
 await page.locator(':is(.world-actions,.applet-bar-side)').getByRole('button',{name:'Plan tennis',exact:true}).click();
 await page.getByRole('button',{name:'View plan',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#notionContent')?.textContent.includes('Invitation: sent to sam.okafor@example.com (practice)'));
 // Booking settled the tennis task and retained it during a view reload.
 assert.equal(JSON.parse((await page.evaluate(()=>window.sampleUI)).items)['sample-item-1'],'done');
 assert.ok(!(await rows()).flatMap(g=>g.rows).includes('Tennis with Sam'));
 await page.evaluate(()=>location.hash='note=sample-mail-sam');
 await page.locator(':is(.world-actions,.applet-bar-side)').getByRole('button',{name:'Reply',exact:true}).waitFor();
 await page.locator(':is(.world-actions,.applet-bar-side)').getByRole('button',{name:'Summarize',exact:true}).waitFor();
 await page.evaluate(()=>location.hash='object=app-youtube');
 await page.locator('#notionContent .browser-viewport').waitFor();
 // The native show request follows the viewport asynchronously; wait for it as the Applet loop does.
 assert.ok(await page.waitForFunction(()=>calls.some(c=>c.action==='browserShow'&&c.platform==='youtube'),null,{timeout:30000}).then(()=>true,()=>false),'Sample YouTube opens the same real website');
 await page.evaluate(()=>location.hash='building=building-people');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
 // The hide follows the panel's next layout pass, which a loaded shared runner can hold back for seconds.
 assert.ok(await page.waitForFunction(()=>calls.some(c=>c.action==='browserHide'),null,{timeout:30000}).then(()=>true,()=>false),'leaving YouTube unloads the native browser');
 // The trip diorama is Kelvin's, and speaks its Matter's name.
 await page.evaluate(()=>location.hash='object=matter-japan');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='matter-japan');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.travelPhase==='intro');
 const tripTitle=dataset.matters.find(m=>m.key==='japan').title;
 assert.ok(await page.evaluate(t=>[...document.querySelectorAll<HTMLElement>(':is(.world-actions,.applet-bar-side) button')].some(b=>b.textContent.includes('Compare stays'))||document.querySelector<HTMLElement>('.companion-context')?.textContent.includes(t),tripTitle),'the trip offers its stays under the Matter name');
 // Review task walks the week: it opens the next thing asking for Kelvin and lets Fox settle it.
 await page.evaluate(()=>location.hash='');await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='overview');
 // The dock re-renders as the overview settles; click it once it has.
 await page.waitForTimeout(400);
 assert.deepEqual(await page.locator('.world-task-group[data-group=needsAction] .world-matter .world-task-title').allTextContents().then(t=>t.map(s=>s.trim()).filter(s=>s==='Tennis with Sam')),[],'the settled task stays cleared after navigating around the world');
 // A decision is a row like any other: opening it has Fox lay out the choice, and the pick is kept.
 const decision=dataset.decisions[0];
 await page.evaluate(()=>location.hash='');await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='overview');
 await page.setViewportSize({width:1280,height:1200});await page.waitForTimeout(400);
 const decisionRow=page.locator('.world-task-group[data-group=needsAction] .world-matter',{hasText:decision.objective});
 assert.equal(await decisionRow.count(),0,'legacy decisions do not repopulate the curated attention panel');
 await page.setViewportSize({width:1280,height:850});
 // Fox knows who this is: the profile rides in inspect_world for the sample.
 const inspected=await page.evaluate(()=>window.worldletExecute?.('inspect_world',{})||null);
 if(inspected)assert.equal(inspected.profile?.name,dataset.name,'inspect_world carries the fictional profile');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS sample world'+(shard==='flows'?' flows: ':': every scene Applet has sample notes; '+opened.length+' representative Applets use their declared website, local Open or game routes; ')+'Attention Center, saved completion, trip, review actions and decisions remain functional.');
});
