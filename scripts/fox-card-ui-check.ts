// Fox points to Attention (owner decision 2026-10-10: Attention is the one place to act). A line Fox says first about
// something waiting on the person carries that item's id (`card`, from the host's speak-first ask): Fox's card offers
// Open card, which opens the item's Attention card. Bundled UI with a faked native
// bridge and a fake clock; fictional mail and people, no model or account.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withBrowser,fileAccess,worldUrl,pageErrors} from './browser-test.ts';

await mkdir('output/fox-card',{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 page.setDefaultTimeout(15000);
 await page.clock.install();
 await page.addInitScript(()=>{
  const w=window as any;
  w.calls=[];w.lines=[{line:'Priya still needs your venue answer by Friday.',card:'venue-reply'}];
  const item={id:'venue-reply',kind:'task',provider:'gmail',title:'Answer Priya about the venue',reason:'Priya needs an answer by Friday.',attentionContentVersion:1,context:'Priya needs an answer by Friday.',
   summary:'- Priya asks whether the **Thursday venue** works.',status:'open',policyVersion:2,receivedAt:new Date(Date.now()-3*3600000).toISOString(),
   sources:[{provider:'gmail',id:'thread:18c2a1',quote:'Can you confirm the venue by Friday?'}]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(body:any){
   w.calls.push(body);
   if(body.action==='snapshot')return {workspaceId:'fox-card',revision:0,sources:[],knowledge:[],worldItems:[item],connections:[{id:'gmail',provider:'gmail',connected:true,syncStatus:'connected'}],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(body.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(body.action==='appContent')return {pages:[]};
   if(body.action==='weatherLoad')return null;
   if(body.action==='foxProactive'){
    const next=w.lines.shift();
    if(!next)return {started:false,reason:'day'};
    // The host answers later with the line, as a page event (modules/companion proactiveRunTurn).
    setTimeout(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-proactive',{detail:{id:'proactive-'+w.calls.length,thread:body.thread,moment:body.moment,...next}})),10);
    return {started:true,id:'proactive-'+w.calls.length};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 await page.locator('.world-matter[data-world-item-id="venue-reply"]').waitFor();
 const card=page.locator('#companionDialogue'),open=card.getByRole('button',{name:'Open card',exact:true});
 const asked=()=>page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='foxProactive').length);
 // The person settles into the World and pauses: Fox is asked, and its line points to the venue card.
 for(let i=0;i<10&&!await asked();i++)await page.clock.fastForward(15_000);
 assert.equal(await asked(),1,'Fox was asked once the person settled');
 await page.clock.fastForward(1000);
 await card.getByText('Priya still needs your venue answer by Friday.').waitFor();
 await open.waitFor();
 await page.screenshot({path:'output/fox-card/line.png'});
 await open.click();
 await page.locator('#attentionPreview:not([hidden])').waitFor();
 await page.locator('#attentionPreview').getByText('Answer Priya about the venue').first().waitFor();
 await page.screenshot({path:'output/fox-card/card.png'});
 assert.equal(await card.getByText('Priya still needs your venue answer by Friday.').isVisible(),false,'the line gives way to the card');
 // A line is about its moment: one nothing replaced goes after half an hour instead of showing into the next day.
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{const w=window as any,thread=w.calls.find((c:any)=>c.action==='foxProactive').thread;
  window.dispatchEvent(new CustomEvent('worldlet:fox-proactive',{detail:{id:'proactive-late',thread,moment:'late',line:'The day is done; rest well.'}}));});
 const late=card.getByText('The day is done; rest well.');
 await late.waitFor();
 await page.clock.fastForward(20*60_000);
 assert.equal(await late.isVisible(),true,'still showing after twenty minutes');
 await page.clock.fastForward(11*60_000);
 await late.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 console.log('PASS Fox points to Attention: a line about a waiting item offers Open card, which opens that item’s Attention card; a line nothing replaced goes after half an hour');
});
