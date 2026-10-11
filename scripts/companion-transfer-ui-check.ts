import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'});
await page.addInitScript(()=>{window.calls=[];window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return {appName:'Worldlet Dev — codex/long-worktree-companion-profile · a26c46',workspaceId:'transfer',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail']},sampleEnabled:false,cloudConsent:true};if(b.action==='companionProfile')return {name:'Fox',createdAt:'2026-09-01T12:00:00Z',personality:'Curious, thoughtful and playful.'};if(b.action==='modelStatus')return {available:true,provider:'hermes'};if(b.action==='companionArchive'&&b.operation==='choose')return {id:'reviewed',name:'Imported Fox',memories:2,messages:7};return {ok:true};}}}};});
 await page.goto(worldUrl());
 await waitForWorld(page);
 assert.equal(await page.title(),'Worldlet Dev — codex/long-worktree-companion-profile · a26c46');
 await page.locator('.companion-context').getByText('Worldlet Dev — codex/long-worktree-companion-profile · a26c46',{exact:true}).waitFor();
 assert(await page.locator('.companion-context .companion-name').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&getComputedStyle(e).overflow!=='hidden'),'Full worktree name remains readable');
 await openCompanionPanel(page);
 const panel=page.locator('#companionInfo');
 const list=panel.locator('.companion-settings-list'),detail=panel.locator('.companion-settings-detail');await list.waitFor();
 await panel.getByText('Curious, thoughtful and playful.',{exact:true}).waitFor();
 assert(await panel.getByRole('img',{name:'Fox portrait'}).isVisible());
 assert.equal(await panel.locator('.companion-profile-facts dd').first().textContent(),'Sep 1, 2026');
 assert.equal(await panel.getAttribute('data-section'),'Profile');
 await page.screenshot({path:'/tmp/companion-profile-tab.png'});
 // One list of sections on the left, the chosen one's details on the right, no tabs (owner request 2026-10-10).
 assert.equal(await panel.getByRole('tab').count(),0,'no tabs');
 assert.deepEqual(await list.locator('[data-setting] strong').allTextContents(),['Fox','Your Agent','Accounts','Phone','General','Help'],'Fox first, no Energy, Journal, Approvals, History, Sounds, Privacy or Feedback');
 const wheel=()=>detail.dispatchEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});
 await wheel();await page.waitForTimeout(260);await wheel();assert.equal(await panel.getAttribute('data-section'),'Profile','the wheel never turns the page');
 assert.equal(await panel.getByRole('button',{name:/^(Import|Export)$/}).count(),0);
 const initial=await list.boundingBox(),box=await panel.boundingBox();assert(box.width>=1000&&box.height>=620,'a larger panel: '+JSON.stringify(box));
 const viewport=page.viewportSize();assert(Math.abs(box.x+box.width/2-viewport.width/2)<2&&Math.abs(box.y+box.height/2-viewport.height/2)<2,'Panel is independent and centered');
 assert.equal(await panel.evaluate(e=>getComputedStyle(e,'::after').display),'none','Panel has no Fox connector');
 // Every section opens beside the list, which stays where it is.
 for(const id of ['fox','model','integrations','phone','general','help']){
  await list.locator(`[data-setting="${id}"]`).click();await list.locator(`[data-setting="${id}"][aria-current=true]`).waitFor();
  const d=await detail.boundingBox(),l=await list.boundingBox();assert(d&&l&&l.x+l.width<=d.x,id+' opens right of the list');
  assert(await panel.evaluate(e=>e.scrollHeight<=e.clientHeight+1),id+' fits the panel');
 }
 const after=await list.boundingBox();assert.equal(after.y,initial.y,'Navigation stays fixed');
 await list.locator('[data-setting=fox]').click();
 // Profile on the left, what Fox can do on the right, scrolling on its own.
 const profileBox=await panel.locator('.companion-profile-page .companion-info-profile').boundingBox(),abilities=panel.locator('.companion-profile-page .companion-abilities'),abilitiesBox=await abilities.boundingBox();
 assert(profileBox&&abilitiesBox&&profileBox.x+profileBox.width<=abilitiesBox.x,'abilities sit right of the profile');
 assert(await abilities.getByText('Your memory',{exact:true}).count()===1);
 assert.equal(await abilities.evaluate(e=>getComputedStyle(e).overflowY),'auto','abilities scroll');
 await page.screenshot({path:'/tmp/companion-panel-desktop.png'});
 for(const viewport of [{width:375,height:812},{width:812,height:375}]){
  await page.setViewportSize(viewport);
  await page.waitForFunction(()=>{const p=document.querySelector('#companionInfo').getBoundingClientRect();return p.right<=innerWidth&&p.bottom<=innerHeight;});
  const box=await panel.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);
  assert(await detail.evaluate(e=>e.clientHeight>70&&e.scrollWidth<=e.clientWidth+1),'Content fits and remains scrollable');
  await list.locator('[data-setting=model]').click();
  assert(await list.isVisible());assert(await list.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'the list wraps rather than scrolls sideways');
 }
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'/tmp/companion-panel-small.png'});
 await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='companionArchive')),false);
 console.log('PASS companion panel: larger layout, one list of six sections and no tabs, pages that fit, no transfer controls, fixed section list, responsive scroll and Escape');
});
