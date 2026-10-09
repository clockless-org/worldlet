import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';

// Browser plugin unavailable. Existing local bundle, mocked host, no accounts.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
   if(b.action==='snapshot')return {workspaceId:'desktop-root-check',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,provider:'hermes',cloudAllowed:true};
   if(b.action==='companionProfile')return {name:'Fox'};
   if(b.action==='conversationRecall')return [];
   if(b.action==='openWorld'){w.worldletDesktopCompanion(false);return {ok:true};}
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await waitForWorld(page);
 await page.waitForFunction(()=>typeof (window as any).worldletDesktopCompanion==='function');
 for(let cycle=0;cycle<3;cycle++){
  await page.evaluate(()=>(window as any).worldletDesktopCompanion(true));
  assert.equal(await page.locator('#notionWorld #notionBack').count(),1,'Desktop must not detach the world navigation control');
  assert.equal(await page.locator('#notionBack').isVisible(),false);
  // World restore can call home while the outgoing desktop HUD is still
  // present. sceneState must retain its required node throughout the handoff.
  await page.locator('#notionWorld').evaluate(root=>root.dispatchEvent(new Event('worldlet:return-world')));
  await page.getByRole('button',{name:'Back to World',exact:true}).click();
  await page.waitForFunction(()=>!document.documentElement.classList.contains('desktop-companion'));
  assert.equal(await page.locator('#notionWorld #notionBack').count(),1,'World restore keeps the navigation control rooted');
  assert.equal(await page.locator('#notionWorld').getAttribute('data-depth'),'overview');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS three desktop → world cycles: navigation control stays rooted, desktop-hidden, restored in the world HUD, home scene updates without errors.');
});
