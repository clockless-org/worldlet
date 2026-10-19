import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// A reply Fox prepares by itself (owner decision 2026-10-09, context/artifacts/replies.ts) on the World page: a new Worth
// Doing item from a Gmail thread that waits for the person gets a background request (no card, no reply line, a label in
// the archive) that reads that thread and prepares a draft; a card beside Fox says what Fox is doing
// that goes when it is done, and the Journal in the top-right corner holds the draft as a reply card; the item's Attention card says Fox drafted
// a reply, and its Review opens the Journal too. Nothing is sent. Bundled UI with a faked native bridge and a fixed
// clock (the ask polls every 30 s); fictional mail and people, no model or account.
const t0=new Date(2026,9,9,15,5);
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.clock.setFixedTime(t0);
 await page.addInitScript((now:number)=>{
  // Unasked work skips automated browsers; this check plays a person's own browser.
  Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false});
  // Someone who used Worldlet yesterday, whose World settled after its first run two hours ago.
  localStorage.setItem('worldlet-daily-artifacts-reply-fixture',JSON.stringify({used:{'2026-10-08':now-20*3600000},plan:['2026-10-09'],summary:['2026-10-08']}));
  localStorage.setItem('worldlet-prepared-replies-reply-fixture',JSON.stringify({prepared:[],days:{},since:now-2*3600000}));
  localStorage.setItem('worldlet-attention-focus',JSON.stringify({ids:['venue-reply'],held:[],reviewedAt:now}));
  const w=window as any;w.calls=[];w.kept=new Map();w.reviews=[];w.statuses=[];
  window.addEventListener('worldlet:fox-status',(e:any)=>w.statuses.push(e.detail));
  w.finish=null;
  const item={id:'venue-reply',kind:'task',provider:'gmail',title:'Answer Priya about the venue',reason:'Priya needs an answer by Friday.',attentionContentVersion:1,context:'Priya needs an answer by Friday.',
   summary:'- Priya asks whether the **Thursday venue** works.',status:'open',policyVersion:2,receivedAt:new Date(now-3*3600000).toISOString(),
   sources:[{provider:'gmail',id:'thread:18c2a1',quote:'Can you confirm the venue by Friday?'}]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
   w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'reply-fixture',revision:0,sources:[],knowledge:[],worldItems:[item],connections:[{id:'gmail',provider:'gmail',connected:true,syncStatus:'connected'}],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true};
   if(b.action==='emailAction'){
    if(b.operation==='list')return {reviews:w.reviews};
    return {ok:true};
   }
   if(b.action==='artifacts'){
    if(b.operation==='list')return {artifacts:[...w.kept.values()]};
    if(b.operation==='save'){const at=Math.floor(Date.now()/1000),saved={...b.artifact,createdAt:at,updatedAt:at};w.kept.set(saved.id,saved);return {ok:true,artifact:saved};}
   }
   if(b.action==='agentChat'&&b.background){
    // The host keeps the draft quietly and tells the page (worldlet:email-drafted); the turn ends when the check says.
    await new Promise(resolve=>{w.finish=resolve;});
    w.reviews.push({id:'R9',draft:{from:'me@example.com',to:'Priya Shah <priya@example.com>',subject:'Re: Venue',body:'Hi Priya,\n\nThursday works. I will confirm the time by [day].',threadId:'18c2a1'},attempted:false,confirmed:false,createdAt:Math.floor(Date.now()/1000)});
    window.dispatchEvent(new CustomEvent('worldlet:email-drafted',{detail:{id:'R9'}}));
    return {message:'A reply to Priya is ready for your review.'};
   }
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 },t0.getTime());
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 const row=page.locator('.world-matter[data-world-item-id="venue-reply"]');
 await row.waitFor();
 // Within a poll, Fox is asked in a background session about exactly that thread.
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='agentChat'),null,{timeout:45000});
 const sent=await page.evaluate(()=>(window as any).calls.find((c:any)=>c.action==='agentChat'));
 assert.equal(sent.background,true,'a background session beside the conversation, never in it');
 assert.equal(sent.shown,'Prepared reply','the archive keeps a label, never the request in the person’s name');
 assert.ok(sent.text.includes('id "thread:18c2a1"')&&sent.text.includes('prepare_email once with threadId "18c2a1"')&&sent.text.includes('you never send it'),'it reads the item’s own thread and prepares one draft, never sending');
 // Beside Fox, on its right, a card says what Fox is doing (ui/hud/task-panel.ts; Scheduled on its left).
 const panel=page.locator('.task-panel');
 const working=panel.locator('.task-group[data-group=now] .task-card[data-task-id="fox:reply"]');
 await working.locator('.task-when',{hasText:'Drafting a reply: Answer Priya about the venue…'}).waitFor();
 const box=await working.boundingBox(),fox=await page.locator('.companion-avatar').boundingBox(),view=page.viewportSize()!;
 assert.ok(box&&fox&&box.x>fox.x+fox.width&&box.y>view.height*.8,'on Fox’s right, at the bottom: '+JSON.stringify({box,fox}));
 assert.equal(await page.locator('#foxArtifact').isVisible(),false,'no card opens');
 await page.screenshot({path:path.join(tmpdir(),'worldlet-prepared-reply-working.png'),clip:{x:0,y:view.height-240,width:view.width,height:240}}).catch(()=>{});
 await page.evaluate(()=>(window as any).finish());
 // Then its card goes: what was done lives only in the Journal (owner request 2026-10-11), not beside Fox.
 await working.waitFor({state:'detached'});
 assert.equal(await panel.locator('.task-group[data-group=done]').count(),0,'nothing finished beside Fox');
 assert.deepEqual(await page.evaluate(()=>(window as any).statuses),[{source:'reply',text:'Drafting a reply: Answer Priya about the venue…'},{source:'reply',text:'',done:'1 reply ready'}]);
 await page.screenshot({path:path.join(tmpdir(),'worldlet-prepared-reply-done.png'),clip:{x:0,y:view.height-240,width:view.width,height:240}}).catch(()=>{});
 const dialogue=await page.locator('#companionDialogue').innerText().catch(()=>'');
 assert.ok(!dialogue.includes('ready for your review')&&!dialogue.includes('In the background'),'Fox says nothing in the conversation');
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('worldlet-prepared-replies-reply-fixture')||'{}')).prepared,['venue-reply','thread:18c2a1'],'the item and its thread are prepared once, across restarts');
 // The Journal in the top-right corner opens today's page with the draft as a reply card.
 await page.locator('.world-today-open').click();
 const book=page.locator('#journalBook');
 await book.waitFor({state:'visible'});
 const reply=book.locator('.companion-reply').filter({hasText:'Re: Venue'});
 await reply.waitFor();
 assert.match(await reply.innerText(),/Reply · Priya Shah[\s\S]*Thursday works\./i,'the draft waits as a reply card');
 assert.deepEqual(await reply.locator('button').allTextContents(),['Send','Edit','Skip'],'only the person sends it');
 await page.keyboard.press('Escape');
 await book.waitFor({state:'hidden'});
 // The item's Attention card points at the draft made for it.
 await row.click();
 const drafted=page.locator('#attentionPreview .attention-preview-drafted');
 await drafted.waitFor({state:'visible'});
 assert.equal((await drafted.innerText()).replace(/\s+/g,' ').trim(),'Fox drafted a reply Review');
 await page.locator('#attentionPreview').screenshot({path:path.join(tmpdir(),'worldlet-prepared-reply-card.png')}).catch(()=>{});
 await drafted.getByRole('button',{name:'Review'}).click();
 await book.waitFor({state:'visible'});
 assert.equal(await page.locator('#attentionPreview').isVisible(),false,'the card gives way to the Journal');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='emailAction'&&c.operation==='send').length),0,'nothing is sent');
 assert.deepEqual(errors,[]);
});
console.log('PASS prepared reply UI: a new mail task gets a reply prepared in a background session, the card beside Fox says it is drafting and goes when it is done, the Journal shows the draft as a reply card, the item’s card points at it, and nothing is sent');
