// Home’s four core Applets unfold authorized records in painted Open installations.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 page.setDefaultTimeout(20000);
 await page.clock.install({time:new Date('2026-09-28T12:00:00')});
 await page.addInitScript(()=>{
  window.calls=[];
  const soon=n=>new Date(Date.now()+n).toISOString();
  const item=(id,provider,kind,title,extra={})=>({id,kind,provider,status:'open',title,context:'One short line.',reason:'One short line.',attentionContentVersion:1,policyVersion:2,summary:'The longer version Fox says when the item is opened.',...(kind==='task'?{attentionReason:'r'}:{}),sources:[{provider,id:id+'s',quote:'q'}],createdAt:1,updatedAt:2,...extra});
  window.fixture={workspaceId:'applet-stage',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   connections:['gmail','google-calendar','apple-notes','apple-reminders'].map(provider=>({id:'c-'+provider,provider,label:provider==='gmail'?'reader@example.test':provider,syncStatus:'connected',connected:true,running:false,failed:false,needsAttention:true,savedItemCount:2,records:[]})),
   worldItems:[item('m1','gmail','task','Confirm school pickup'),item('m2','gmail','update','Airline refund cleared'),...Array.from({length:4},(_,i)=>item('more'+i,'gmail','task',['Confirm appointment','Review the quote','Choose a delivery','Reply to Alex'][i])),
    item('c1','google-calendar','event','Dentist',{start:soon(3*3600000)}),item('c2','google-calendar','event','Flight to Lisbon',{start:soon(2*86400000)}),item('c3','google-calendar','event','Design standup',{start:soon(26*3600000)}),
    item('n1','apple-notes','update','Cabin packing list'),item('n2','apple-notes','update','Loft measurements'),
    item('r1','apple-reminders','task','Renew the parking permit')],
   sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='appContent'&&['gmail','google-calendar'].includes(b.provider))return {pages:Array.from({length:b.provider==='gmail'?8:5},(_,i)=>({id:'live:'+b.provider+':'+i,title:b.provider==='gmail'?'Letter '+(i+1):'Appointment '+(i+1),from:'Alex',date:'2026-09-23T10:32:00Z',...(b.provider==='google-calendar'?{start:new Date().toISOString()}:{})}))};
   if(b.action==='appContent')return {pages:b.provider==='apple-notes'?['Cabin packing list','Loft measurements','Garden ideas','A note for Monday','Weekend reading','Books to borrow','Cabin packing list','Recipes'].map((title,i)=>({id:'live:apple-notes:'+i,title})): [{id:'live:apple-reminders:1',title:'Renew the parking permit',list:'Personal',due:new Date().toISOString(),completed:'false'},{id:'live:apple-reminders:2',title:'Already completed',completed:'true'}]};
   if(b.action==='original')return {title:'Local original',text:'From: Alice Chen <alice@example.com>\nTo: Kelvin <kelvin@example.com>\nDate: 2026-09-23T10:32:00Z\nSubject: School pickup plan\n\nThe complete original from this Mac.'};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,WORLD_APPS.length);
 const stage=()=>page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation);

 for(const [key,id,items] of [['gmail','app-gmail',6],['google-calendar','app-google-calendar',8],['apple-notes','app-apple-notes',10],['apple-reminders','app-apple-reminders',2]] as const){
  const app=WORLD_APPS.find(a=>a.key===key);
  assert.equal(app.fullView.kind,'scene',key+' declares an in-world Open stage');
  await page.evaluate(id=>location.hash='object='+id,id);
  await page.waitForFunction(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.stage&&document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.id===id,id);
  await page.waitForFunction(count=>document.querySelectorAll('.pixi-stage-item,.home-leaf').length===count,items).catch(async e=>{throw Error(key+': '+JSON.stringify(await page.evaluate(()=>({calls,stage:document.querySelector('.pixi-applet-stage')?.textContent})))+' '+e.message)});
  const itemSelector=key==='gmail'?'.pixi-stage-item':'.home-leaf';
  const dock=await page.locator('.notion-hud').boundingBox();
  assert.ok(dock.x+dock.width/2>1280*.7,key+' places Fox on the right in Open');
  const view=await stage();
  const backBox=await page.locator('#notionBack').boundingBox(),titleBox=await page.locator('.companion-context').boundingBox();assert.ok(backBox.x>=70&&backBox.y<24&&backBox.x<titleBox.x,key+': Back is on the title\'s left, clear of the Mac traffic lights (x 10-62, y 8-20): '+JSON.stringify({backBox,titleBox}));
  assert.equal(view.stage.items,items,key+' exposes its saved local records');
  assert.equal(await page.locator('.pixi-applet-stage '+itemSelector).count(),items,key+' renders each record as a selectable Open item');
  assert.equal(await page.locator('#notionContent').isVisible(),false,key+' opens in the world without a website');
  assert.equal(await page.locator(key==='gmail'?'.mail-shared-device':'.home-open-sheet').count(),1,'Open uses its painted installation');
  if(key==='gmail'){
   assert.equal((await stage()).deviceVisible,false,'Mail foreground uses the HTML device only');
   await page.screenshot({path:'/tmp/worldlet-gmail-open.png'});
   assert.equal(await page.locator('.mail-open-desk').evaluate(e=>getComputedStyle(e).overflowY),'hidden','Mail pinboard does not scroll');
   // The nine-letter attention pinboard (57c1e5cd) replaced the three bins.
   assert.equal(await page.locator('.mail-open-piles,.mail-bin-spread').count(),0,'Mail Open has no bins');
   assert.ok(await page.locator('.mail-open-desk').evaluate(d=>d.scrollHeight<=d.clientHeight&&d.scrollWidth<=d.clientWidth),'attention letters fit the pinboard');
   assert.equal(await page.locator('.mail-open-desk .pixi-stage-item').count(),6,'ordinary letters never replace attention mail');

  }
  if(key==='gmail')await page.waitForFunction(()=>document.querySelector('.mail-letter-sender')?.textContent==='Alice Chen');
  if(key==='google-calendar'){
   assert.equal(await page.locator('.home-calendar-day').count(),7);
   await page.getByRole('button',{name:'Month',exact:true}).click();
   assert.equal(await page.locator('.home-calendar-day').count(),30);
   await page.getByRole('button',{name:'Week',exact:true}).click();
  }
  const marks=page.locator(itemSelector+' .applet-attention');
  assert.ok(await marks.count()>0,key+' carries attention onto individual Open items');
  assert.equal(await page.locator('.pixi-stage-item[data-curated=false] .applet-attention').count(),0,'raw records never invent attention');
  const markBox=await marks.first().boundingBox(),itemBox=await page.locator(itemSelector+':has(.applet-attention)').first().boundingBox();
  if(key==='gmail')assert.ok(markBox.y+markBox.height<itemBox.y&&Math.abs(markBox.x+markBox.width/2-itemBox.x-itemBox.width/2)<2,'Mail attention mark is centered above the envelope');
  await page.mouse.move(20,40);
  await page.screenshot({path:'/tmp/worldlet-'+key+'-open.png'});
  if(key!=='gmail'){await page.setViewportSize({width:600,height:740});await page.screenshot({path:'/tmp/worldlet-'+key+'-narrow.png'});assert.ok(await page.locator('.home-open-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'narrow content has no horizontal overflow');await page.setViewportSize({width:1280,height:850});}
  if(key==='gmail'){
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.mailWorking='true');
   assert.equal(await page.locator('.mail-open-flight').count(),0,'a busy model must not throw letters');
   await page.evaluate(()=>{fixture.connections.find(c=>c.provider==='gmail').reading=true;fixture.revision++;(window as any).worldletReceive(structuredClone(fixture));});
   // The pinboard (57c1e5cd) records a provider read without throwing letters.
   await page.locator('.pixi-applet-stage[data-mail-reading=true]').waitFor({state:'attached'});
   assert.equal(await page.locator('.mail-open-flight').count(),0,'a provider read throws no letters over the pinboard');
   await page.evaluate(()=>{fixture.connections.find(c=>c.provider==='gmail').reading=false;fixture.revision++;(window as any).worldletReceive(structuredClone(fixture));});
   await page.locator('.pixi-applet-stage[data-mail-reading=false]').waitFor({state:'attached'});
   await page.evaluate(()=>delete document.querySelector<HTMLElement>('#notionWorld').dataset.mailWorking);
   await page.emulateMedia({reducedMotion:'reduce'});

  }
  const mailDeviceBox=key==='gmail'?await page.locator('.mail-shared-device').boundingBox():null;
  const browserShows=await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length);
  const selectedTitle=await page.locator(itemSelector+' strong').first().textContent();
  await page.locator(itemSelector).first().click();
  if(key==='gmail')await page.locator('.mail-paper').waitFor();
  await page.getByText('The complete original from this Mac.').waitFor();
  if(key!=='gmail')assert.ok(Math.abs((await stage()).foregroundWidth-view.foregroundWidth)<1,'Open and Focus keep device scale');
  await page.locator('.pixi-applet-stage').waitFor({state:'hidden'});
  await page.locator('.pixi-selected-item').waitFor({state:key==='gmail'?'hidden':'visible'});
  assert.equal(await page.locator('.pixi-selected-item strong').textContent(),selectedTitle,'Focus preserves the selected Open item');
  if(key==='gmail'){await page.locator('.mail-account-status').hover();assert.ok(await page.getByRole('tooltip').isVisible());assert.ok((await page.getByRole('tooltip').innerText()).includes('reader@example.test'));await page.mouse.move(20,40);assert.equal(await page.getByRole('tooltip').isVisible(),false);assert.deepEqual(await page.locator('.mail-shared-device').boundingBox(),mailDeviceBox,'Mail device stays in exactly the same place in Open and Focus');assert.equal(await page.locator('.mail-sender-name').textContent(),'From Alice Chen');
   assert.equal(await page.locator('.pixi-selected-item .pixi-focus-switch').count(),0);
   assert.ok(await page.locator('.mail-reader-switch').isVisible());
   await page.getByRole('button',{name:'Next email',exact:true}).click();
   await page.waitForFunction(title=>document.querySelector('.pixi-selected-item strong')?.textContent!==title,selectedTitle);
   await page.getByRole('button',{name:'Previous email',exact:true}).click();
   await page.waitForFunction(title=>document.querySelector('.pixi-selected-item strong')?.textContent===title,selectedTitle);
  }
  await page.screenshot({path:'/tmp/worldlet-'+key+'-focus.png'});
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='browserShow').length),browserShows,'local Focus never opens a browser');
  // A backdrop tap inside an Applet acts as Back, one step (owner request 2026-10-05).
  await page.mouse.click(1120,450);
  await page.locator('#notionContent').waitFor({state:'hidden'});
  await page.locator('.pixi-applet-stage').waitFor();
  assert.equal((await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics)).active,'app-'+key,'Focus backdrop returns to the same Applet');
 }
 // Returning dismisses the accessible stage without replacing the world.
 await page.evaluate(()=>location.hash='building=building-home');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.level==='building');
 assert.equal((await stage()).stage,null,'no stage stands once the Applet is left');
 assert.deepEqual(errors,[]);
 console.log('PASS Applet stages: Mail, Calendar, Notes and Reminders unfold source records and enter Focus originals.');
});
