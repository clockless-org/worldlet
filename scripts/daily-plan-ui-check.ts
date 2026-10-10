import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// The morning brief on the World page (core/artifacts/README.md#the-days-plan-and-summary): made at 6 AM by itself,
// quietly, in a background session beside the conversation (owner Orders 2026-10-07). For someone who used Worldlet
// lately, Fox is asked once in the morning, with the window hidden and before the person touches anything; the
// request carries the parts they wrote under Morning brief; its card never opens, no "You · Morning brief" line and no
// reply line show, the request reaches the host with its label for the archive, and the plan opens the Journal on
// today's page when the person wakes the screen (owner request 2026-10-08). The evening asks nothing. Then the Journal: each reply draft the brief left is a card on today's page, and
// Edit, Send and Skip act on that exact draft; Morning brief saves the person's own list. Bundled UI with a faked
// native bridge and a fixed clock (the ask polls every 30 s); fictional turns, mail and drafts, no model or account.
const run=async(browser,hour:number,hidden=false)=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.clock.setFixedTime(new Date(2026,9,7,hour,5));
 await page.addInitScript((hidden:boolean)=>{
  // The daily ask skips automated browsers; this check plays a person's own browser.
  Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false});
  // The screen is asleep at 6 AM.
  (window as any).asleep=hidden;Object.defineProperty(Document.prototype,'hidden',{get:()=>(window as any).asleep===true});
  // Someone who used Worldlet yesterday evening, whose summary of yesterday is made.
  localStorage.setItem('worldlet-daily-artifacts-daily-fixture',JSON.stringify({used:{'2026-10-06':new Date(2026,9,6,20).getTime()},plan:[],summary:['2026-10-06']}));
  const w=window as any;w.calls=[];w.kept=new Map();w.statuses=[];w.prefs=[];window.addEventListener('worldlet:fox-status',(e:any)=>w.statuses.push(e.detail));
  w.reviews=[];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'daily-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true,autoSync:true,morningBrief:'今天的日程\n把邮件都看一遍起草回复'};
   if(b.action==='foxPreferenceChange'){w.prefs.push(b);return {ok:true,morningBrief:String(b.value).trim()};}
   if(b.action==='emailAction'){
    if(b.operation==='list')return {reviews:w.reviews};
    const r=w.reviews.find(x=>x.id===b.id);if(!r)throw Error('This email review is unavailable.');
    if(b.operation==='revise'){const next={...r,id:r.id+'-edited',draft:{...r.draft,body:b.body}};w.reviews=[...w.reviews.filter(x=>x!==r),next];return {id:next.id,draft:next.draft};}
    if(b.operation==='send'){r.attempted=true;return {status:'sent'};}
    if(b.operation==='acknowledge'||b.operation==='cancel'){w.reviews=w.reviews.filter(x=>x!==r);return {ok:true};}
   }
   if(b.action==='artifacts'){
    if(b.operation==='list')return {artifacts:[...w.kept.values()]};
    if(b.operation==='save'){const now=Math.floor(Date.now()/1000),saved={...b.artifact,createdAt:now,updatedAt:now};w.kept.set(saved.id,saved);return {ok:true,artifact:saved};}
   }
   if(b.action==='agentChat'){
    if(b.text.startsWith('Good morning.')){
     // The brief's drafts are saved quietly by the host; the Journal hears of them.
     const now=Math.floor(Date.now()/1000);
     w.reviews.push({id:'R1',draft:{from:'me@example.com',to:'Priya Shah <priya@example.com>',subject:'Re: Q4 roadmap',body:'Hi Priya,\n\nI will send the draft by [day].'},attempted:false,confirmed:false,createdAt:now},
      {id:'R2',draft:{from:'me@example.com',to:'sam@example.com',subject:'Re: Numbers',body:'Hi Sam, tomorrow.'},attempted:false,confirmed:false,createdAt:now});
     window.dispatchEvent(new CustomEvent('worldlet:email-drafted',{detail:{id:'R2'}}));
     await w.worldletAgentTool(b.id,{id:'p1',name:'show_artifact',args:{title:'Plan · Wed, Oct 7',body:'**Today**\n\nA quiet day. Two replies wait for you.',chart:null,size:'large',actions:null}});
     return {message:'Your brief is ready as one artifact.'};
    }
    return {message:'Short answer to '+b.text};
   }
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 },hidden);
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 return {page,errors};
};
await withBrowser(fileAccess,async browser=>{
 {
  const {page,errors}=await run(browser,6,true);
  await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='agentChat'&&c.text.startsWith('Good morning.')),null,{timeout:45000});
  const sent=await page.evaluate(()=>(window as any).calls.find((c:any)=>c.action==='agentChat'));
  assert.equal(sent.shown,'Morning brief','the host archives the label, never the long request in the person’s name');
  assert.equal(sent.background,true,'it runs in a background session beside the conversation, never in it (owner Order 2026-10-07)');
  assert.ok(sent.text.includes(JSON.stringify('今天的日程\n把邮件都看一遍起草回复'))&&sent.text.includes('prepare_email'),'the brief holds the parts the person wrote, mail drafts included');
  // The brief is kept, and waits for the person: no card, and the Journal stays shut while the screen sleeps.
  await page.waitForFunction(()=>(window as any).kept.size===1);
  assert.equal(await page.locator('#foxArtifact').isVisible(),false,'the brief opens no card (owner request 2026-10-08)');
  assert.equal(await page.locator('#journalBook').isVisible(),false,'nothing opens while the screen sleeps');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('worldlet-daily-artifacts-daily-fixture')||'{}').journal),'2026-10-07','today’s page waits for the person, across a restart too');
  // Waking up, the Journal lies open on today's page with the brief first.
  await page.evaluate(()=>{(window as any).asleep=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('#journalBook').waitFor({state:'visible'});
  await page.locator('#journalBook .companion-artifact-title').first().waitFor();
  assert.equal(await page.locator('#journalBook .companion-artifact-title').first().textContent(),'Plan · Wed, Oct 7','the morning brief opens the Journal on its page');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('worldlet-daily-artifacts-daily-fixture')||'{}').journal),undefined,'seen: it opens once');
  await page.waitForTimeout(1500);
  const dialogue=await page.locator('#companionDialogue').innerText().catch(()=>'');
  assert.ok(!dialogue.includes('Your brief is ready'),'Fox says nothing about it');
  assert.ok(!dialogue.includes('Morning brief'),'no “You · Morning brief” line in Fox’s card');
  assert.ok(!dialogue.includes('Good morning'),'the request never shows');
  assert.deepEqual(await page.evaluate(()=>(window as any).statuses),[{source:'daily',text:'Making your morning brief…'},{source:'daily',text:'',done:'Morning brief and 1 reply ready'}],'what Fox is doing is announced for a status line, then cleared with what was made');
  await page.waitForTimeout(31000);
  assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='agentChat').length),1,'once a day');

  // The Journal: the plan first, then a card for each reply draft, on today's page.
  const journal=page.locator('#journalBook [data-section=Journal]');
  const replies=journal.locator('.companion-reply');
  await replies.first().waitFor();
  assert.deepEqual(await journal.locator('.companion-artifact').evaluateAll(cards=>cards.map(c=>[(c as HTMLElement).dataset.kind,(c as HTMLElement).dataset.size])),[['answer','large'],['reply','medium'],['reply','medium']],'the brief first, then its two reply drafts');
  const priya=replies.filter({hasText:'Re: Q4 roadmap'});
  assert.match(await priya.innerText(),/Reply · Priya Shah[\s\S]*I will send the draft by \[day\]\./i,'the card shows who it goes to and the whole draft');
  // Edit changes the words in place: a new reviewed draft, the old one dropped.
  await priya.getByRole('button',{name:'Edit'}).click();
  await priya.getByRole('textbox').fill('Hi Priya,\n\nI will send the draft by Thursday.');
  await priya.getByRole('button',{name:'Save'}).click();
  await priya.getByText('Saved.').waitFor();
  assert.match(await priya.locator('.companion-reply-text').innerText(),/by Thursday\./);
  // Send sends exactly that draft, and the card leaves.
  await priya.getByRole('button',{name:'Send'}).click();
  await journal.getByText('Sent to Priya Shah.').waitFor();
  const mail=await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='emailAction'&&c.operation!=='list').map((c:any)=>[c.operation,c.id]));
  assert.deepEqual(mail,[['revise','R1'],['send','R1-edited'],['acknowledge','R1-edited']],'the edited draft is the one sent');
  assert.equal(await replies.count(),1);
  // Skip drops a draft without sending it.
  await replies.first().getByRole('button',{name:'Skip'}).click();
  await page.waitForFunction(()=>!document.querySelector('#companionInfo .companion-reply'));
  assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='emailAction'&&c.operation==='send').length),1,'skipping sends nothing');
  // Morning brief: the person's own list of what it holds.
  await journal.getByRole('button',{name:'Morning brief'}).click();
  const list=journal.getByLabel('Every morning at 6, Fox makes your brief with these parts, one a line.');
  assert.equal(await list.inputValue(),'今天的日程\n把邮件都看一遍起草回复','it shows what the brief holds now');
  await list.fill('今天的日程\nX 上的 AI 新闻');
  await journal.getByRole('button',{name:'Save',exact:true}).click();
  await journal.getByText('Saved. Tomorrow’s brief follows it.').waitFor();
  assert.deepEqual(await page.evaluate(()=>(window as any).prefs),[{action:'foxPreferenceChange',setting:'morning_brief',value:'今天的日程\nX 上的 AI 新闻'}]);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // The screen is on at 6 but nobody is at the computer (owner Order 2026-10-08): the book waits for the person's
  // first touch, then lies open on today's first page.
  const {page,errors}=await run(browser,6);
  await page.waitForFunction(()=>(window as any).kept.size===1,null,{timeout:45000});
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#journalBook').isVisible(),false,'nothing opens for an empty room');
  await page.mouse.move(700,400);
  await page.locator('#journalBook').waitFor({state:'visible'});
  assert.equal(await page.locator('#journalBook .companion-artifact-title').first().textContent(),'Plan · Wed, Oct 7','the first touch of the morning opens the Journal on the brief');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  const {page,errors}=await run(browser,18);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event:'user_engaged'}})));
  await page.waitForTimeout(33000);
  assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='agentChat').length),0,'no brief in the evening');
  assert.deepEqual(errors,[]);
  await page.close();
 }
});
console.log('PASS daily plan UI: the morning brief made once at 6 AM with the screen asleep and nobody at it, from the person’s own list, quietly (no Fox card, no reply line, archived by its label), opening the Journal on today’s page when the screen wakes or at the first touch, never for an empty room; its reply drafts as Journal cards that Edit, Send and Skip; Morning brief saved; none in the evening');
