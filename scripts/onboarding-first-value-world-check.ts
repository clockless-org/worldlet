import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  w.fixture={workspaceId:'first-value-world',revision:1,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true,journeyStage:'first-value',unlockedApplets:['app-gmail','app-browser']},sampleEnabled:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='onboarding'&&b.operation==='journey'){Object.assign(w.fixture.onboarding,{journeyStage:b.stage,journeyItemId:b.itemId});return {ok:true};}
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='devBuildStatus')return {supported:true,online:true,candidate:{id:'f'.repeat(24),revision:'2'.repeat(40)}};
   if(b.action==='devBuildApply')throw Error('Fixture never applies a Dev build');
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl');
 assert.equal(await page.getByRole('button',{name:/Take a look|Show me first|Do it for me/}).count(),0,'Do not invent a recommendation');
 await page.waitForFunction(()=>/look around your world/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:20000});
 // Until the tour is over nothing else responds, also while Fox waits for a first item (owner request 2026-10-04);
 // with nothing connected that wait is short, then the tour ends and frees the World (owner request 2026-10-06).
 // Fox boxes the Center while it looks, so the spotlight (or, between boxes, the lock) takes the clicks.
 await page.waitForFunction(()=>{const d=(document.querySelector('#notionWorld') as HTMLElement).dataset;return d.tourLock==='true'||d.tourSpotlight==='true';});
 {const waiting=await page.locator('.dev-build-update-label').boundingBox();
  await page.mouse.click(waiting.x+waiting.width/2,waiting.y+waiting.height/2);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='devBuildApply')),false,'the World is locked while Fox waits');}
 // The Tutorial switch in the World's top-right corner, on, is the way out meanwhile (owner Order 2026-10-07).
 assert.equal(await page.locator('.tour-switch').getAttribute('aria-checked'),'true','the Tutorial switch, on, is the way out meanwhile');
 assert.equal(await page.locator('.tour-switch').isVisible(),true);
 await page.evaluate(()=>{const w=window as any;w.fixture.activityRevision++;
  w.fixture.worldItems=[{id:'fixture-charge',provider:'gmail',kind:'task',status:'open',title:'Review duplicate charge',reason:'You may have paid twice',summary:'Two fictional receipts show the same charge. Check the merchant policy before requesting a refund.',attentionContentVersion:1,sources:[{provider:'gmail',id:'receipt-1',quote:'Charged twice',url:'https://example.com/receipt'}]}];
  w.worldletReceive(structuredClone(w.fixture));
 });
 await page.waitForFunction(()=>/I picked this one for you: Review duplicate charge/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:20000});
 // The offered item is boxed like the tour's steps: the World waits for the person to click it.
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.tourSpotlight==='true');
 await page.waitForTimeout(600);
 const rowBox=()=>page.locator('.world-matter[data-world-item-id="fixture-charge"]').boundingBox();
 const ring=await page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)').boundingBox(),row=await rowBox();
 assert.ok(ring&&row&&ring.x<=row.x&&ring.y<=row.y&&ring.x+ring.width>=row.x+row.width&&ring.y+ring.height>=row.y+row.height,'The box surrounds the offered item '+JSON.stringify({ring,row}));
 // A click elsewhere (here, where the Dev build notice is) reaches nothing beneath and keeps the step.
 const notice=await page.locator('.dev-build-update-label').boundingBox();
 await page.mouse.click(notice.x+notice.width/2,notice.y+notice.height/2);
 await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.tourSpotlight),'true','A click away keeps the step');
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='devBuildApply')),false);
 // Clicking the boxed item opens its card, where Fox asks to do it.
 const foxHome=await page.locator('.companion-avatar').boundingBox();
 await page.mouse.click(row.x+row.width/2,row.y+row.height/2);
 await page.locator('#attentionPreview:not([hidden])').waitFor();
 assert.match(await page.locator('#attentionPreview').innerText(),/Review duplicate charge/);
 await page.getByRole('button',{name:'Do it for me',exact:true}).waitFor();
 assert.match(await page.locator('#companionDialogue').innerText(),/Can I do this for you/);
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='first-value-review')),true);
 // The card is lit to its own edge with no ring around it; Fox stays where it always stands (owner feedback 2026-10-06:
 // moving up under the card read as a jump), its bubble above it and clear of the card.
 await page.waitForTimeout(900);
 assert.equal(await page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)').isVisible(),false,'The card needs no ring');
 const [card,fox,bubble]=await Promise.all(['#attentionPreview','.companion-avatar','#companionDialogue'].map(s=>page.locator(s).boundingBox()));
 const hole=await page.locator('.tour-spotlight mask rect[fill="black"]').first().evaluate(r=>({x:+r.getAttribute('x'),y:+r.getAttribute('y'),width:+r.getAttribute('width'),height:+r.getAttribute('height'),soft:r.hasAttribute('filter')&&!!r.getAttribute('filter')}));
 assert.ok(Math.abs(hole.x-card.x)<=1&&Math.abs(hole.y-card.y)<=1&&Math.abs(hole.width-card.width)<=1&&Math.abs(hole.height-card.height)<=1&&!hole.soft,'The light is cut to the card\'s edge '+JSON.stringify({hole,card}));
 assert.equal(await page.evaluate(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.tourFox),undefined,'Fox is not lifted under the card');
 assert.ok(Math.abs(fox.y-foxHome.y)<=2&&Math.abs(fox.x-foxHome.x)<=2,'Fox stays where it stands '+JSON.stringify({fox,foxHome}));
 assert.ok(bubble.y+bubble.height<=fox.y+1&&bubble.y>=card.y+card.height,'Fox\'s bubble sits above Fox, clear of the card '+JSON.stringify({fox,bubble,card}));
 await page.screenshot({path:'/tmp/worldlet-first-value-preview.png'});
 // The card's own Done takes a real click too and settles the item as the first win; Dismiss and
 // Later wait until the tour is over (owner request 2026-10-04: the card could not be clicked).
 assert.equal(await page.locator('#attentionPreview button',{hasText:/^(Dismiss|Later)$/}).evaluateAll(list=>list.filter(b=>(b as HTMLElement).offsetParent).length),0,'Dismiss and Later are hidden during the tour');
 const done=await page.locator('#attentionPreview button',{hasText:'Done'}).boundingBox();
 await page.mouse.click(done.x+done.width/2,done.y+done.height/2);
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&c.itemId==='fixture-charge'),null,{timeout:10000});
 await page.waitForFunction(()=>/first win/i.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:10000});
 assert.deepEqual(errors,[]);
 console.log('PASS full bundled world: with nothing connected Fox waits briefly with the World locked and the Tutorial switch, on, in the World’s corner, activity-only publication, the offered item boxed until it is clicked (a click away reaches nothing beneath), its source-backed card lit to its edge with Fox and its question under it and Fox asking to do it; the card’s own Done settles it as the first win while Dismiss and Later wait. No real account or Agent execution.');
});
