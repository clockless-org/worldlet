// Browse with me (owner request 2026-10-08): in an Applet Fox asks for a browse line a few seconds after it opens
// (owner 2026-10-12 「进一个 applet 就开始推荐说话」) and shows it in its card with its own arrival effect. There is no switch to
// turn it off (owner 2026-10-13 「他就该说话就说话」), and in a game the host follows, Fox keeps playing along at the game's pace.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withBrowser,fileAccess,worldUrl,pageErrors} from './browser-test.ts';

await mkdir('output/fox-browse',{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.clock.install();
 await page.addInitScript(()=>{
  const w=window as any;
  w.calls=[];w.game=false;w.openResult=null;
  w.webkit={messageHandlers:{worldlet:{async postMessage(body:any){
   w.calls.push(body);
   if(body.action==='snapshot')return {workspaceId:'fox-browse',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(body.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(body.action==='foxProactive'){
    // The host answers later with the line, as a page event (modules/fox proactiveRunTurn).
    setTimeout(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-proactive',{detail:{id:'proactive-1',line:'This video is the one your calendar note links to.',thread:body.thread,moment:body.moment}})),10);
    return {started:true,id:'proactive-1',...w.game?{game:true}:{}};
   }
   if(body.action==='agentChat'){
    w.openResult=await w.worldletAgentTool(body.id,{id:'open-youtube',name:'open_applet',args:{id:'app-youtube'}});
    return {message:'YouTube is open.'};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 const card=page.locator('#companionDialogue');
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Take me to YouTube');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>(window as any).openResult!==null);
 assert.equal(await page.locator('#notionContent').getAttribute('data-applet'),'youtube');
 // A few seconds after the Applet opens (out of Fox's message bar): the opening browse ask for this visit.
 await page.locator('#notionInput').blur();
 for(let i=0;i<3;i++)await page.clock.fastForward(2_000);
 // The fake clock stops waitForFunction's polling, so the ask is read once the timers have run.
 assert.ok(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='foxProactive')),'Fox was asked after the look');
 const asks=await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='foxProactive'));
 assert.equal(asks.length,1);assert.equal(asks[0].moment,'browsing');assert.match(asks[0].visit,/@\d+$/);assert.equal(asks[0].opened,true,'the opening ask');
 await page.clock.fastForward(1000);
await card.getByText('This video is the one your calendar note links to.').waitFor();
 // A line Fox said first wears its own effect: the warm ring on the card.
 assert.equal(await card.getAttribute('data-proactive'),'true');
 assert.equal(await card.locator('.companion-proactive-glow').count(),1);
 assert.equal(await card.getByRole('button',{name:/Browse with me|Don’t bother/}).count(),0,'no switch in Fox’s card');
 await page.screenshot({path:'output/fox-browse/browse-line.png'});
 // Still in the same visit: Fox's own line showing does not hold the next look (owner 2026-10-13 「说的再勤一点」), which
 // comes a minute on (every Applet keeps talking, owner 2026-10-13 「每一个 app…更主动一点」), and is not the opening one.
for(let i=0;i<8;i++)await page.clock.fastForward(15_000);
 const looks=await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='foxProactive'&&c.moment==='browsing'));
 assert.ok(looks.length>=2,`later looks in the same visit (${looks.length})`);assert.equal(looks[1].visit,looks[0].visit);assert.notEqual(looks[1].opened,true);
 // Back in the World after a couple of minutes there, Fox wraps the visit up, with what YouTube showed when they left.
 await page.locator('body').click({position:{x:4,y:4}}).catch(()=>{});
 await page.keyboard.press('Escape');
 for(let i=0;i<3;i++)await page.clock.fastForward(2_000);
 assert.ok(await page.locator('#notionContent').isHidden(),'back in the World');
 const wraps=await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='foxProactive'&&c.moment==='wrapup'));
 assert.equal(wraps.length,1,'one wrap up on the way out');assert.ok(wraps[0].left.minutes>=2);assert.match(JSON.stringify(wraps[0].left),/youtube/i);
 // A game the host follows: once the host says so, the looks keep coming at the game's pace, past an ordinary visit's.
 await page.evaluate(()=>{(window as any).game=true;(window as any).openResult=null;});
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('Take me to YouTube');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>(window as any).openResult!==null);
 await page.locator('#notionInput').blur();
 for(let i=0;i<24;i++)await page.clock.fastForward(15_000);
 const played=await page.evaluate((first:string)=>(window as any).calls.filter((c:any)=>c.action==='foxProactive'&&c.moment==='browsing'&&c.visit!==first).length,looks[0].visit);
 assert.ok(played>=5,`Fox keeps playing along in a game (${played} looks)`);
 assert.deepEqual(errors,[]);
 console.log('PASS Browse with me: an opening browse ask as the Applet opens, its line arriving with its own effect and no switch in Fox’s card, later looks in the same visit, a wrap up back in the World, and the game pace once the host says the place is a game');
});
