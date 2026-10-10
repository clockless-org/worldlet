// The UI smoke check (`npm run test:ui:smoke`): the part of the UI suite that holds back Alpha and Beta (owner decision
// 2026-10-10: the interface still changes a lot, so a release waits only on the big things). The World starts and
// draws, Fox answers a message, an Applet opens and Back returns to the World, with no page error on the way. It asserts
// no position, pixel, size, wording or motion: the rest of test:ui checks those and reports without holding a release.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld,leaveApplet} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 page.setDefaultTimeout(30000);
 await page.addInitScript(()=>{const w=window as any;
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
   if(b.action==='snapshot')return {workspaceId:'smoke',revision:0,sources:[],knowledge:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,
    connections:[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true,running:false,failed:false,records:[]}]};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='agentChat')return {message:'Smoke reply to '+b.text+'.'};
   if(b.action==='appContent')return {pages:[{id:'live:mail:1',title:'Letter one',from:'Alex',date:'2026-09-23T10:32:00Z'}]};
   if(b.action==='weatherLoad')return null;
   return {ok:true};
  }}}};
 });
 const scene=()=>page.evaluate(()=>(document.querySelector('#notionWorld') as any)?.sceneMetrics);
 const step=async(what:string,wait:Promise<unknown>)=>{try{await wait;}catch(error){throw Error(what+(errors.length?'; page errors: '+errors.join(' | '):''),{cause:error});}};

 // The World starts and draws on WebGL.
 await page.goto(worldUrl());await waitForWorld(page);
 await step('The World never drew on WebGL',page.waitForFunction(()=>(document.querySelector('#notionWorld') as any)?.sceneMetrics?.renderer==='pixi-webgl'));

 // Fox answers a message typed to it.
 if(!await page.locator('#notionInput').isVisible())await page.locator('.companion-avatar').click();
 await page.locator('#notionInput').fill('hello fox');await page.locator('#notionInput').press('Enter');
 await step('Fox\'s answer never showed',page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent?.includes('Smoke reply to hello fox')));
 await page.keyboard.press('Escape');

 // An Applet opens, and Back returns to the World.
 await page.evaluate(()=>{location.hash='object=app-gmail';});
 await step('Mail never opened',page.waitForFunction(()=>{const p=(document.querySelector('#notionWorld') as any)?.sceneMetrics?.presentation;return !!p?.stage&&p.id==='app-gmail';}));
 await leaveApplet(page);
 await step('Back never returned to the World',page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement)?.dataset.depth==='overview'));

 assert.deepEqual(errors,[],'no page errors');
 assert.equal((await scene())?.renderer,'pixi-webgl');
 console.log('PASS UI smoke: the World draws, Fox answers, Mail opens and Back returns to the World');
});
