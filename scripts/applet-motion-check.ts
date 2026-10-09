// Applet artwork is static (4c6b36d1): hover stays interactive and foreground presentations settle without rig motion.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce',...(process.env.MOTION_VIDEO?{recordVideo:{dir:process.env.MOTION_VIDEO,size:{width:1280,height:850}}}:{})}),errors=pageErrors(page);
 page.setDefaultTimeout(20000);
 await page.addInitScript(()=>{
  window.calls=[];
  const soon=n=>new Date(Date.now()+n).toISOString();
  const item=(id,provider,kind,title,extra={})=>({id,kind,provider,status:'open',title,context:'One short line.',summary:'The longer version Fox says when the item is opened.',...(kind==='task'?{attentionReason:'r'}:{}),sources:[{provider,id:id+'s',quote:'q'}],createdAt:1,updatedAt:2,...extra});
  window.fixture={workspaceId:'applet-stage',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   connections:['gmail','google-calendar','apple-notes','apple-reminders'].map(provider=>({id:'c-'+provider,provider,label:provider,syncStatus:'connected',connected:true,running:false,failed:false,needsAttention:true,savedItemCount:2,records:[]})),
   worldItems:[item('m1','gmail','task','Confirm school pickup'),item('m2','gmail','update','Airline refund cleared'),...Array.from({length:4},(_,i)=>item('more'+i,'gmail','task',['Confirm appointment','Review the quote','Choose a delivery','Reply to Alex'][i])),
    item('c1','google-calendar','event','Dentist',{start:soon(3*3600000)}),item('c2','google-calendar','event','Flight to Lisbon',{start:soon(2*86400000)}),item('c3','google-calendar','event','Design standup',{start:soon(26*3600000)}),
    item('n1','apple-notes','update','Cabin packing list'),item('n2','apple-notes','update','Loft measurements'),
    item('r1','apple-reminders','task','Renew the parking permit')],
   sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='appContent'&&['gmail','google-calendar'].includes(b.provider))return {pages:Array.from({length:b.provider==='gmail'?8:5},(_,i)=>({id:'live:'+b.provider+':'+i,title:b.provider==='gmail'?'Letter '+(i+1):'Appointment '+(i+1),from:'Alex',...(b.provider==='google-calendar'?{start:new Date().toISOString()}:{})}))};
   if(b.action==='appContent')return {pages:b.provider==='apple-notes'?['Cabin packing list','Loft measurements','Garden ideas','A note for Monday','Weekend reading','Books to borrow','Cabin packing list','Recipes'].map((title,i)=>({id:'live:apple-notes:'+i,title})): [{id:'live:apple-reminders:1',title:'Renew the parking permit',list:'Personal',due:new Date().toISOString(),completed:'false'},{id:'live:apple-reminders:2',title:'Already completed',completed:'true'}]};
   if(b.action==='agentChat')return {message:Array.from({length:4},(_,i)=>'**'+['Today','Next step','Background','Summary'][i]+'**\n\nReview the proposal, confirm the delivery date, and tell Alex which option you prefer.').join('\n\n')};
   if(b.action==='original')return {title:'Local original',text:'From: Alice Chen <alice@example.com>\nTo: Kelvin <kelvin@example.com>\nDate: September 23, 10:32\nSubject: School pickup plan\n\nThe complete original from this Mac.'};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,WORLD_APPS.length);

 await waitForWorld(page);
 await page.evaluate(()=>location.hash='building=building-home');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled);
 for(const key of ['google-calendar','apple-notes','apple-reminders']){
  const hit=await page.evaluate(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(d=>d.id==='app-'+id).peekHit,key);
  await page.mouse.move(hit.x,hit.y);
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.hoveredRegion==='building-home');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(d=>d.id==='app-'+id)?.presentation.rigMotion,key),0,key+' artwork stays static on hover');
  await page.mouse.move(640,50);
 }
 for(const key of ['gmail','google-calendar','apple-notes','apple-reminders','weather']){
  await page.evaluate(id=>location.hash='object=app-'+id,key);
  await page.waitForFunction(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='app-'+id&&document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled,key);
  if(key==='gmail')await page.waitForFunction(()=>{const device=document.querySelector<HTMLElement>('.mail-shared-device');return !!device&&!device.dataset.motionFrame;});
  else assert.equal(await page.evaluate(id=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(d=>d.id==='app-'+id)?.presentation.rigMotion,key),0,key+' foreground artwork stays static');
  await page.screenshot({path:'/tmp/worldlet-motion-'+key+'.png'});
  if(process.env.MOTION_VIDEO)await page.waitForTimeout(1600);
 }
 await page.evaluate(()=>location.hash='');
 await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.level==='overview'&&m.camera.settled&&m.modules.filter(d=>d.visible).every(d=>d.presentation.rigMotion===0);});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.filter(d=>d.visible).every(d=>d.presentation.rigMotion===0));
 await page.evaluate(()=>location.hash='object=app-gmail');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='app-gmail');
 await page.locator('#notionInput').click();await page.locator('#notionInput').fill('Summarize my next steps');await page.locator('#notionInput').press('Enter');
 try{await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Review the proposal'));}catch(e){console.log(await page.evaluate(()=>({calls:calls.map(c=>c.action),text:document.querySelector('#companionDialogue')?.textContent})));throw e;}
 const bubble=page.locator('#companionDialogue');await bubble.waitFor({state:'visible'});
 // One turn is one card, never paged. Beside an Applet the tall column usually fits it; when
 // it does not, the card scrolls inside its room and a small down arrow says more waits below.
 assert.equal(await bubble.getAttribute('data-pages'),'1','a conversation card never pages');
 const bounds=await bubble.boundingBox();assert.ok(bounds.y>=60&&bounds.y+bounds.height<=850,'Concise dialogue stays on screen with long replies');
 assert.equal(await page.locator('.companion-more').count(),0,'no Show more: a long reply scrolls in its card');
 if(await page.evaluate(()=>document.querySelector<HTMLElement>('#worldConversation').dataset.scrollable==='true')){
  assert.equal(await page.locator('.companion-scroll-hint').isVisible(),true,'a long reply shows the down arrow');
  const reply=await page.locator('#worldConversation').boundingBox();
  await page.mouse.move(reply.x+reply.width/2,reply.y+reply.height/2);await page.mouse.wheel(0,2000);
  await page.waitForFunction(()=>{const log=document.querySelector<HTMLElement>('#worldConversation');return log.scrollTop>0&&log.dataset.more==='false';});
  assert.equal(await page.locator('.companion-scroll-hint').isVisible(),false,'the arrow leaves at the end of the reply');
  assert.equal(await bubble.getAttribute('data-expanded'),'false','scrolling a reply leaves the earlier turns folded');
 }
 await page.screenshot({path:'/tmp/worldlet-expanded-dialogue.png'});
 assert.deepEqual(errors,[]);const video=page.video();await page.close();if(video)console.log('Video:',await video.path());console.log('PASS Home static Applet artwork on hover and in foreground, quiet World, reduced motion and a long Fox reply kept as one card.');
});
