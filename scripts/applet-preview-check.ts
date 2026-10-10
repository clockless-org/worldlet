// The core loop for a Home Applet, from its Preview: connect without leaving the
// region, sync in the background, ask for the user in the left panel and nowhere
// else, and come forward as its own stage in the world. The account's website is the original,
// opened only when it is asked for.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.calls=[];
  // Core delivers Attention items only after the model has written their text (bd6bdcac).
  window.processed=f=>({...structuredClone(f),worldItems:(f.worldItems||[]).map(i=>({attentionContentVersion:1,...i}))});
  window.fixture={workspaceId:'applet-preview',revision:0,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   connections:[],sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true,provider:'custom'},cloudConsent:true};if(b.action==='appContent')return {pages:[]};if(b.action==='original')return {title:'School pickup',text:'From: Ms. Alvarez <teacher@example.com>\nSubject: School pickup\n\nPlease confirm by Thursday.'};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 });
 const connects=()=>page.evaluate(()=>calls.filter(c=>c.action==='connect').map(c=>c.provider));
 const active=()=>page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active);
 await page.goto(worldUrl());
 await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,WORLD_APPS.length);
 await page.evaluate(()=>location.hash='building=building-home');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='building-home');

 // Entering a region does not initiate account authorization. The user selects
 // the Applet itself; there is no permanent source-connect button in Fox's dock.
 assert.equal((await connects()).length,0,'region entry never connects an account');
 assert.equal(await page.locator('#notionContent').isVisible(),false);

 // Peek enters Mail's authored Open even without a read grant; opening does not
 // authorize sync, and the account's website stays behind View original.
 // The active setup bubble overlaps this label; exercise its keyboard route.
 await page.locator('.notion-pin[data-page="place-app-gmail"]').focus();await page.keyboard.press('Enter');
 await page.locator('.pixi-applet-stage[data-applet=gmail]').waitFor();
 // Opening an unconnected account Applet offers the read grant once, beside the
 // offer already made from Peek — once per entry, never repeatedly while open.
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='connect'&&c.provider==='gmail').length),1,'opening offers the read grant once, not repeatedly');
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='browserShow')),false,'Mail opens its painted installation, not a website');

 // Back in Preview, a saved task fills the left panel, and only the left panel.
 await page.evaluate(()=>location.hash='building=building-home');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='building-home');
 await page.evaluate(()=>{
  fixture.connections=[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true,running:false,failed:false,needsAttention:true,savedItemCount:1,records:[]}];
  fixture.worldItems=[{id:'item-1',kind:'task',provider:'gmail',status:'open',title:'Confirm school pickup',context:'Ms. Alvarez needs an answer by Thursday.',summary:'The after-school club moved Friday pickup to 2:30 PM and Ms. Alvarez needs a yes or no before Thursday noon so she can set the roster.',attentionReason:'A reply is expected',sources:[{provider:'gmail',id:'t1',quote:'Please confirm by Thursday.',url:'https://mail.google.com/mail/u/0/#inbox/t1'}],createdAt:1,updatedAt:2}];
  fixture.revision++;fixture.activityRevision++;return worldletReceive(processed(fixture));
 });
 await page.locator('.world-matter').first().waitFor();
 // Attention is asked for in one place. The shape is the kind: a square asks
 // something of the user, and an ordinary task carries no stroke inside it.
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.matter-icon svg')].map(s=>[s.firstElementChild.tagName,s.children.length])),[['rect',1]],'a task wears a plain square, once, in the panel');
 assert.equal(await page.evaluate(()=>document.querySelectorAll<HTMLElement>('.world-roof-action').length),0,'the world carries no second set of marks over the Applet');
 assert.equal(await active(),'building-home','a background check does not move the view');
 // The World hears of the connection through the Theme contract: Mail's lamp is lit. Its finding is no lamp color
 // or mark of its own; the Attention Center is its only reminder (ui/world/applet-lamp.ts).
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(m=>m.id==='app-gmail')?.lamp?.state==='ready');

 // Connected and disconnected Peek entries take the same route into Mail's
 // authored Open; the account's website stays behind View original.
 const askedBefore=(await connects()).length;
 await page.locator('.notion-pin[data-page="place-app-gmail"]').focus();await page.keyboard.press('Enter');
 await page.locator('.pixi-applet-stage[data-applet=gmail]').waitFor();
 assert.equal((await connects()).length,askedBefore,'opening a connected Applet asks for nothing');
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='browserShow'&&c.url==='https://mail.google.com/mail/u/0/')),false,'a connected Mail does not open the website on entry');

 // Opening an item takes the user into its Applet, and Fox offers only what this
 // item can settle there. Settling is local: nothing is done in the outside service.
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='building-home');
 // A row previews the item in place; its source opens the original thread on the web.
 const preview=page.locator('#attentionPreview');
 await page.locator('.world-matter').first().click();
 await preview.waitFor();
 // Cards show the self-contained summary; the short reason line was removed (#666).
 assert.match(await preview.innerText(),/Ms\. Alvarez needs a yes or no before Thursday noon/);
 await preview.getByRole('button',{name:'Open Mail',exact:true}).click();
 await page.waitForFunction(()=>calls.some(c=>c.action==='browserShow'&&c.url==='https://mail.google.com/mail/u/0/#inbox/t1'));
 // Dismiss only closes the preview; the item stays in the Center (owner decision).
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='building-home');
 const rows=await page.locator('.world-matter').count();
 await page.locator('.world-matter').first().click();
 await preview.waitFor();
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});
 await dismiss.waitFor();
 await dismiss.click();
 await preview.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='worldItemStatus')),false,'Dismiss settles nothing');
 assert.equal(await page.locator('.world-matter').count(),rows,'Dismiss keeps the item in the Center');

 assert.deepEqual(errors,[]);
 console.log('PASS Applet preview: explicit region connection, website Focus independent of account grant, background items and Fox item completion.');
});
