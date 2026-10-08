import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const evidence=path.join(tmpdir(),'worldlet-attention-actions');
await mkdir(evidence,{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];w.failRead=false;w.failAcknowledgement=true;
  // Card behavior, not selection: pin every fixture item into the Center's focus set.
  localStorage.setItem('worldlet-attention-focus',JSON.stringify({ids:['Confirmed meeting','Optional tennis','Refund arrived','Local note task','Claim credit'],held:[],reviewedAt:Date.now()}));
  const start=new Date();start.setDate(start.getDate()+1);start.setHours(9,0,0,0);
  const item=(id,kind,extra={})=>({id,kind,provider:'gmail',title:id,reason:'Evidence for '+id,attentionContentVersion:1,context:'Evidence for '+id,summary:'- Confirm attendance by **5 PM**.\n- Bring **2 documents**.',status:'open',policyVersion:2,sources:[{provider:'gmail',id:id+'s',quote:'Actual evidence'}],...extra});
  w.fixture={workspaceId:'attention-actions',revision:0,sources:[],knowledge:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,
   connections:[{id:'gmail',provider:'gmail',connected:true,syncStatus:'connected'}],worldItems:[item('Confirmed meeting','event',{start:start.toISOString(),end:new Date(start.getTime()+3600000).toISOString(),location:'Convention Center',sources:[{provider:'gmail',id:'event',quote:'Confirmed',url:'https://example.com/event'}],eventDisposition:'confirmed'}),item('Optional tennis','task',{start:new Date(Date.now()+7200000).toISOString(),eventDisposition:'optional'}),item('Refund arrived','update'),item('Claim credit','task',{sources:[{provider:'gmail',id:'thread:c1a1',title:'Claim your credit',quote:'Claim by Friday'}]}),item('Local note task','task',{provider:'note',sources:[{provider:'note',id:'local-note',quote:'Local evidence'}]})]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='agentChat')return {message:'The forecast is clear. Bring water.'};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='original'){if(w.failRead)throw Error('Synthetic read failure');return {title:'Original',text:'From: Alex <alex@example.com>\n\nActual evidence for this item.'};}
   if(b.action==='worldItemRead'&&w.failAcknowledgement){w.failAcknowledgement=false;return {ok:false,error:'Synthetic acknowledgement failure'};}
   if(b.action==='worldItemStatus'||b.action==='worldItemRead'){const item=w.fixture.worldItems.find(i=>i.id===b.id);if(b.action==='worldItemStatus'||item.status==='open'&&item.kind==='update'){item.status=b.status||'read';item.snoozedUntil=b.snoozedUntil;}return {ok:true};}
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());
 const row=id=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview'),dialogue=page.locator('#companionDialogue');
 await row('Confirmed meeting').waitFor();
 await page.locator('#worldStartup').waitFor({state:'detached'});
 const mailPin=page.locator('.notion-pin[data-page="place-app-gmail"]');
 assert.equal(await mailPin.locator('.applet-attention').count(),0,'Ordinary findings do not require an Applet intervention');
 await page.evaluate(()=>{const w=window as any;w.savedMailPin=document.querySelector('.notion-pin[data-page="place-app-gmail"]');w.savedMailMarker=w.savedMailPin.querySelector('.applet-attention');w.fixture.connections[0].running=true;w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(window as any).savedMailPin.dataset.running==='true');
 assert.equal(await page.locator('.notion-pin[data-page="place-app-gmail"]').getAttribute('data-lamp-state'),'processing');
 assert.equal(await mailPin.locator('strong').evaluate(e=>getComputedStyle(e).opacity),'0','Reading does not reveal the name');
 await page.evaluate(()=>{const w=window as any;w.fixture.connections[0].running=false;w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(window as any).savedMailPin.dataset.running==='false');
 assert.equal(await page.locator('.notion-pin[data-page="place-app-gmail"]').getAttribute('data-lamp-state'),'ready','Unread findings stay in the Center; the lamp shows no result state');
 await page.evaluate(()=>{const w=window as any;w.fixture.connections[0].failed=true;w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(window as any).savedMailPin.dataset.lampState==='error');
 await page.screenshot({path:evidence+'/applet-error-lamp.png'});
 await page.evaluate(()=>{const w=window as any;w.fixture.connections[0].failed=false;w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(window as any).savedMailPin.dataset.lampState==='ready');
 assert(await page.evaluate(()=>{const w=window as any;return w.savedMailPin===document.querySelector('.notion-pin[data-page="place-app-gmail"]')&&w.savedMailMarker===w.savedMailPin.querySelector('.applet-attention');}),'Routine reads preserve the pin and do not replay Attention arrival');
 assert.equal(await row('Confirmed meeting').getAttribute('data-matter-state'),'event');
 assert.equal(await row('Optional tennis').getAttribute('data-matter-state'),'needsAction');
 await row('Confirmed meeting').click();
 await preview.waitFor({state:'visible'});
 await page.locator('[data-action-id="attention:help:Confirmed meeting"]').waitFor();
 assert.equal(await page.locator('#notionWorld').getAttribute('data-depth'),'overview','A HUD preview never navigates the world');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='original').length),0,'A preview uses saved evidence without reading sources');
 await dialogue.getByText('Shall we get ready for this?',{exact:true}).waitFor();
 assert.equal(await preview.locator('.attention-preview-location').textContent(),'Convention Center');
 assert.match(await preview.locator('.attention-preview-location').getAttribute('href'),/^https:\/\/www.google.com\/maps\/search/);
 assert.equal(await row('Confirmed meeting').getAttribute('aria-current'),'location');
 assert.equal(await row('Confirmed meeting').locator('.world-task-title').evaluate(e=>getComputedStyle(e).textDecorationLine),'none');
 assert.equal(await preview.locator('h2').evaluate(e=>getComputedStyle(e).fontSize),'28px');
 assert.equal(await preview.getByRole('button',{name:'Help prepare',exact:true}).count(),0,'Help stays with Fox');
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Got it','Dismiss','Later'],'The card owns a clear outcome for an event');
 assert.equal(await dialogue.locator('.companion-guide-actions button').count(),1,'Fox owns the primary action');
 // Fox's options are bold underlined words (owner decision, #952).
 assert.deepEqual(await dialogue.getByRole('button',{name:'Help prepare',exact:true}).evaluate(e=>{const c=getComputedStyle(e);return [c.textDecorationLine,Number(c.fontWeight)>=700];}),['underline',true]);
 assert.equal(await dialogue.getByRole('button',{name:'Later',exact:true}).count(),0,'Outcomes are not duplicated beside Fox');
 assert.equal(await preview.locator('.attention-preview-summary strong').first().textContent(),'5 PM');
 assert.equal(await preview.locator('.attention-preview-summary li').count(),2);
 assert.equal(await preview.locator('.attention-preview-reason').count(),0);
 assert.notEqual(await preview.getByRole('button',{name:'Got it',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),await preview.getByRole('button',{name:'Later',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),'The primary outcome is visually distinct');
 await page.evaluate(()=>{const t=document.querySelector('.applet-hover-name') as HTMLElement;t.hidden=false;t.textContent='Background Applet';});
 assert.equal(await page.locator('.applet-hover-name').evaluate(e=>getComputedStyle(e).display),'none');
 assert.equal(await preview.locator('.attention-preview-fact-label').count(),0,'Facts do not need field labels');
 // The picture is the card's background, strongest on the right; the title keeps the left half under the paper scrim (#2218).
 const headingBox=await preview.locator('h2').boundingBox(),artBox=await preview.locator('img').boundingBox(),cardBox=await preview.boundingBox();
 assert.ok(headingBox.x+headingBox.width<=cardBox.x+cardBox.width/2+1&&artBox.x<=headingBox.x&&artBox.x+artBox.width>=cardBox.x+cardBox.width-1,'Title stays in the left half over the full-card picture '+JSON.stringify({headingBox,artBox,cardBox}));
 for(const size of [{width:1440,height:1000},{width:1100,height:800}]){
  await page.setViewportSize(size);
  await page.waitForTimeout(150);
  const card=await preview.boundingBox(),fox=await dialogue.boundingBox();
  // An Attention card is a medium artifact: it sits above Fox, who stays in the middle (owner decision 2026-10-06).
  assert.equal(await page.locator('#notionWorld').getAttribute('data-fox-lane'),'false','A medium card keeps Fox in the middle');
  assert.ok(card.y+card.height<=fox.y,'Preview does not cover the Fox dialogue '+JSON.stringify({card,fox,size}));
  const list=await page.locator('.world-task-tracker').boundingBox();assert.ok(list.x+list.width<card.x,'Preview leaves the Attention Center clickable: '+JSON.stringify({list,card,size}));
  assert.ok(await preview.evaluate(e=>e.scrollHeight<=e.clientHeight+2),'Card has no vertical overflow');
  assert.ok(await page.locator('.world-task-tracker .world-matter').evaluateAll(rows=>rows.every(r=>[...r.querySelectorAll('.world-task-time')].every(t=>[...t.getClientRects()].every(b=>b.right<=r.getBoundingClientRect().right-1)))),'A long time wraps inside its Attention row');
  // Loading is asynchronous: a busy RC host can still be decoding the art here.
  assert.ok(await page.waitForFunction(()=>{const e=document.querySelector('#attentionPreview img') as HTMLImageElement;return e.complete&&e.naturalWidth>0;}).then(()=>true,()=>false),'Category art loads');
  await page.screenshot({path:evidence+'/attention-preview-event-'+size.width+'.png'});
 }
 await page.setViewportSize({width:1440,height:1000});
 await dialogue.getByRole('button',{name:'Help prepare',exact:true}).click();
 await dialogue.getByText('The forecast is clear. Bring water.',{exact:true}).waitFor();
 assert.ok(await preview.isVisible(),'Starting a task preserves its card');
 assert.equal(await page.locator('#notionWorld').getAttribute('data-depth'),'overview');
 assert.equal(await dialogue.getByRole('button',{name:'Help prepare',exact:true}).count(),0,'Old invitation does not return');
 assert.ok(await preview.getByRole('button',{name:'Later',exact:true}).isEnabled(),'Management actions survive the conversation');
 await row('Optional tennis').click();
 await preview.getByRole('heading',{name:'Optional tennis',exact:true}).waitFor();
 await page.locator('[data-action-id="attention:help:Optional tennis"]').waitFor();
 assert.equal(await preview.locator('img').getAttribute('src'),'attention/scene-tennis.webp');
 // Only rendered actions: the Browse with me | Don't bother switch is hidden outside Applets (#2230).
 assert.ok(await dialogue.evaluate(e=>{const box=e.getBoundingClientRect();return [...e.querySelectorAll('.companion-action-bar button')].filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom;});}),'Guide actions fit inside the dialogue');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='worldItemStatus').length),0,'Switching does not settle either item');
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Done','Dismiss','Later'],'A task is marked done from its card');
 await page.screenshot({path:evidence+'/attention-preview-task.png'});
 // Clearing from the card advances to the next row still in the Center.
 const order=await page.locator('.world-matter').evaluateAll(n=>n.map(e=>(e as HTMLElement).dataset.worldItemId));
 const after=(id:string)=>{const rest=order.filter(x=>x!==id),i=order.indexOf(id);return [...order.slice(i+1),...order.slice(0,i)].find(x=>rest.includes(x));};
 await preview.getByRole('button',{name:'Done',exact:true}).click();
 await row('Optional tennis').waitFor({state:'detached'});
 await preview.getByRole('heading',{name:after('Optional tennis'),exact:true}).waitFor();
 assert.ok(await preview.isVisible(),'Done advances instead of closing');
 await row('Confirmed meeting').click();
 const deferredAt=Date.now();
 await preview.getByRole('button',{name:'Later',exact:true}).click();
 assert.equal(await preview.getByRole('button',{name:'In 1 hour',exact:true}).count(),0);
 await row('Confirmed meeting').waitFor({state:'detached'});
 await preview.getByRole('heading',{name:after('Confirmed meeting')==='Optional tennis'?'Refund arrived':after('Confirmed meeting'),exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>(window as any).calls.some(b=>b.action==='worldItemStatus'&&b.snoozedUntil&&b.status==='open')));
 const savedUntil=await page.evaluate(()=>(window as any).fixture.worldItems.find(i=>i.id==='Confirmed meeting').snoozedUntil);
 const expectedUntil=new Date(deferredAt);expectedUntil.setDate(expectedUntil.getDate()+1);
 assert(Math.abs(Date.parse(savedUntil)-+expectedUntil)<5000,'Later saves the next local calendar day with one click');
 await page.evaluate(()=>{const w=window as any;w.fixture.revision++;w.worldletReceive(JSON.parse(JSON.stringify(w.fixture)));});
 assert.equal(await row('Confirmed meeting').count(),0,'Snapshot sync preserves deferral');

 await row('Local note task').click();
 await preview.getByRole('heading',{name:'Local note task',exact:true}).waitFor();
 await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
 assert.ok(await row('Local note task').isVisible(),'Closing preserves pending tasks');
 // Opening an informational card does not acknowledge or remove its row.
 await page.evaluate(()=>{(window as any).failRead=true;});
 await row('Refund arrived').click();
 await preview.getByRole('heading',{name:'Refund arrived',exact:true}).waitFor();
 assert.ok(await row('Refund arrived').isVisible());
 assert.equal(await preview.getByRole('button',{name:'Manage attention',exact:true}).count(),0);
 assert.equal(await page.locator('.fox-action-side [data-action-id^="attention:"]').count(),0);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='worldItemRead').length),0);
 await page.evaluate(()=>{const w=window as any;w.fixture.revision++;w.fixture.appName='Attention refresh verified';w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>document.title==='Attention refresh verified');
 assert.ok(await preview.isVisible());assert.ok(await row('Refund arrived').isVisible());
 await dialogue.locator('[data-action-id="attention:explore:Refund arrived"]').waitFor();
 assert.equal(await preview.locator('img').getAttribute('src'),'attention/scene-refund.webp');
 await page.screenshot({path:evidence+'/attention-preview-update.png'});
 await preview.getByRole('button',{name:'Close preview',exact:true}).click();
 assert.ok(await row('Refund arrived').isVisible(),'Closing does not dismiss the update');
 await row('Refund arrived').click();
 // A saved-evidence source opens its excerpt explicitly: no remote read, no navigation.
 await preview.getByRole('button',{name:'Open Mail',exact:true}).click();
 await preview.waitFor({state:'hidden'});
 const excerpt=page.locator('#notionDialog');
 await excerpt.getByText('Mail · Saved excerpt',{exact:false}).waitFor();
 assert.ok(await excerpt.getByText('Actual evidence',{exact:true}).isVisible(),'The saved quote is shown');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='original').length),0,'No original read for saved evidence');
 assert.equal(await page.locator('#notionWorld').getAttribute('data-depth'),'overview');
 await page.keyboard.press('Escape');await excerpt.waitFor({state:'hidden'});
 // An item read from an email opens that email in Mail, read again from Gmail (#1618).
 await row('Claim credit').click();
 await preview.locator('.attention-preview-provenance.is-link').click();
 await preview.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelector('#notionContent')?.getAttribute('data-template')==='app-source'&&document.querySelector('#notionContent')?.getAttribute('data-applet')==='gmail');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='original').map(b=>b.id)),['world-item:Claim credit'],'Source reads the original email of this item');
 await page.evaluate(()=>{(window as any).calls=(window as any).calls.filter(b=>b.action!=='original');location.hash='';});
 await page.waitForFunction(()=>document.querySelector('#notionWorld').getAttribute('data-depth')==='overview');
 // Opening a preview inside an Applet keeps that Applet context.
 await page.evaluate(()=>location.hash='object=app-gmail');
 await page.waitForFunction(()=>document.querySelector('#notionWorld').getAttribute('data-depth')==='object');
 await page.evaluate(()=>{(document.querySelector('.world-matter[data-world-item-id="Local note task"]') as HTMLButtonElement).click();});await preview.waitFor({state:'visible'});
 assert.equal(await page.locator('#notionWorld').getAttribute('data-depth'),'object','Preview preserves an existing Applet context');
 await page.waitForFunction(()=>{const card=document.querySelector('#attentionPreview').getBoundingClientRect(),bubble=document.querySelector('#companionDialogue').getBoundingClientRect();return bubble.width>=innerWidth/4-1&&bubble.width<=innerWidth/3+1;});
 await page.locator('#notionStage').click({position:{x:20,y:120}});
 await preview.waitFor({state:'hidden'});
 // Applet context keeps Fox's ordinary card visible (CONVERSATION.md); only the Attention guide closes.
 assert.ok(await dialogue.isVisible(),'The Applet keeps its contextual Fox card');
 assert.equal(await dialogue.locator('[data-action-id^="attention:"]').count(),0,'The closed Attention guide leaves no item actions');
 // Inside an Applet a background click with a card open closes only the card; the Applet stays.
 assert.equal(await page.locator('#notionWorld').getAttribute('data-depth'),'object','Clicking the background inside an Applet stays in it');
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>document.querySelector('#notionWorld').getAttribute('data-depth')==='overview');
 assert.ok(await row('Local note task').isVisible(),'Clicking the background closes the HUD without settling its item');
 await row('Local note task').click();
 // Dismiss only closes the card; the item stays in the Center (owner decision).
 const statusCalls=await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='worldItemStatus').length);
 await preview.getByRole('button',{name:'Dismiss',exact:true}).click();
 await preview.waitFor({state:'hidden'});
 assert.ok(await row('Local note task').isVisible(),'Dismiss keeps the item in the Center');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(b=>b.action==='worldItemStatus').length),statusCalls,'Dismiss settles nothing');
 assert.equal(await page.evaluate(()=>(window as any).fixture.worldItems.find(i=>i.id==='Local note task').status),'open');
 assert.deepEqual(errors,[]);
 console.log('PASS HUD previews, category art, card outcomes and advance, Fox context, non-overlap, explicit source excerpts and Applet context');
});
