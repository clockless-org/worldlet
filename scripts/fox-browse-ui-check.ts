// Browse with me (owner request 2026-10-08): in an Applet Fox asks for one browse line per visit after a short look,
// shows it in its card with Browse with me | Don't bother, and Don't bother goes to the host and stays on Fox's cards
// in the Applet so it can be turned back on there; the World never shows the switch.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withBrowser,fileAccess,worldUrl,pageErrors,leaveApplet} from './browser-test.ts';

await mkdir('output/fox-browse',{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.clock.install();
 await page.addInitScript(()=>{
  const w=window as any;
  w.calls=[];w.browse=true;w.openResult=null;
  w.webkit={messageHandlers:{worldlet:{async postMessage(body:any){
   w.calls.push(body);
   if(body.action==='snapshot')return {workspaceId:'fox-browse',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(body.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(body.action==='foxBrowse'){if(typeof body.on==='boolean')w.browse=body.on;return {on:w.browse};}
   if(body.action==='foxProactive'){
    if(!w.browse)return {started:false,reason:'off'};
    // The host answers later with the line, as a page event (modules/fox proactiveRunTurn).
    setTimeout(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-proactive',{detail:{id:'proactive-1',line:'This video is the one your calendar note links to.',thread:body.thread,moment:body.moment}})),10);
    return {started:true,id:'proactive-1'};
   }
   if(body.action==='agentChat'){
    w.openResult=await w.worldletAgentTool(body.id,{id:'open-youtube',name:'open_applet',args:{id:'app-youtube'}});
    return {message:'YouTube is open.'};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 const card=page.locator('#companionDialogue'),on=card.getByRole('button',{name:'Browse with me',exact:true}),off=card.getByRole('button',{name:'Don’t bother',exact:true});
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Take me to YouTube');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>(window as any).openResult!==null);
 assert.equal(await page.locator('#notionContent').getAttribute('data-applet'),'youtube');
 assert.equal(await on.isVisible(),false,'Fox’s own reply carries no switch while Browse with me is on');
 // About 30 seconds of looking (out of Fox's message bar): one browse ask for this visit.
 await page.locator('#notionInput').blur();
 for(let i=0;i<4;i++)await page.clock.fastForward(15_000);
 // The fake clock stops waitForFunction's polling, so the ask is read once the timers have run.
 assert.ok(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='foxProactive')),'Fox was asked after the look');
 const asks=await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='foxProactive'));
 assert.equal(asks.length,1);assert.equal(asks[0].moment,'browsing');assert.match(asks[0].visit,/@\d+$/);
 await page.clock.fastForward(1000);
await card.getByText('This video is the one your calendar note links to.').waitFor();
 await on.waitFor();
 assert.equal(await on.getAttribute('aria-pressed'),'true');assert.equal(await off.getAttribute('aria-pressed'),'false');
 await page.screenshot({path:'output/fox-browse/browse-line.png'});
 // Still in the same visit: no second ask.
for(let i=0;i<8;i++)await page.clock.fastForward(15_000);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='foxProactive'&&c.moment==='browsing').length),1,'one line per visit');
 await off.click();
 assert.ok(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='foxBrowse'&&c.on===false)));
 assert.equal(await off.getAttribute('aria-pressed'),'true');
 await page.screenshot({path:'output/fox-browse/dont-bother.png'});
 await on.click();
 assert.ok(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='foxBrowse'&&c.on===true)));
 assert.equal(await on.getAttribute('aria-pressed'),'true');
 // The World shows no switch.
 await off.click();await leaveApplet(page);
 await page.clock.fastForward(5000);
 assert.equal(await page.locator('.companion-browse:visible').count(),0,'never in the World');
 assert.deepEqual(errors,[]);
 console.log('PASS Browse with me: one browse ask per Applet visit, its line in Fox’s card with Browse with me | Don’t bother, the choice sent to the host, no switch in the World');
});
