import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {attentionFailure} from '../core/attention/attention-failure.ts';
import {firstValueCandidate,firstValueLinks,firstValueRequest,updateOnboarding} from '../core/onboarding/index.ts';
import {helpNarration,narrateHelp} from '../ui/companion/help-narration.ts';
import {bundleScript} from './browser-test.ts';
assert.deepEqual(attentionFailure("Worldlet's included AI service needs a billing update.",100),{code:'service_credits',nextAt:1000});
const item={id:'refund',kind:'task',status:'open',summary:'A duplicate charge may be refundable; check the policy.',attentionContentVersion:1,sources:[{provider:'gmail',id:'receipt',quote:'Charged twice'}]};
assert.equal(firstValueCandidate([item])?.id,'refund');
for(const patch of [{status:'done'},{status:'dismissed'},{status:'candidate'},{attentionFresh:false},{attentionContentVersion:undefined},{sources:[]},{snoozedUntil:'2099-01-01'}])assert.equal(firstValueCandidate([{...item,...patch}]),undefined);
assert.equal(firstValueCandidate([]),undefined);
assert.equal(updateOnboarding({version:1,presets:['home'],completed:false},{operation:'setup',applets:['app-gmail']}).journeyStage,'world-tour','Setup hands over to the guided introduction first');
assert.equal(updateOnboarding({version:1,presets:['home'],completed:true,journeyStage:'world-tour'},{operation:'journey',stage:'first-value'}).journeyStage,'first-value');
// First value is something Fox can finish: a verified website outranks a higher priority without one.
const bookable={...item,id:'book',priority:'normal',websiteURLs:['https://demo.worldlet.test/brightsmile','http://insecure.example','javascript:alert(1)']};
assert.equal(firstValueCandidate([{...item,id:'lease',priority:'high'},bookable])?.id,'book');
assert.deepEqual(firstValueLinks(bookable),['https://demo.worldlet.test/brightsmile']);
// A sign-in chore never leads the tour (nobody is signed in to a website in a new world): a plain
// task without a website outranks reviewing a Google sign-in, even one with a verified link.
const review={...item,id:'google-sign-in',priority:'urgent',title:'Review the new sign-in to your Google Account',websiteURLs:['https://myaccount.google.com/notifications']};
assert.equal(firstValueCandidate([review,{...item,id:'reply',priority:'normal'}])?.id,'reply');
assert.equal(firstValueCandidate([{...bookable,id:'reset',summary:'Reset your password before Friday.'},bookable])?.id,'book');
assert.equal(firstValueCandidate([{...bookable,id:'portal',websiteURLs:['https://accounts.example.com/x']},bookable])?.id,'book');
assert.equal(firstValueCandidate([review])?.id,'google-sign-in','with nothing else, it is still offered');
// A bill Fox would have to pay never leads either (Fox never pays; RC run f0421ae8 picked the water
// bill over the dental booking because the model ranked it elevated, and Fox could only hand it back).
const water={...item,id:'water',priority:'elevated',title:'Pay September water bill',actionLabel:'Review invoice',reason:'A utility payment is due Oct 8',websiteURLs:['https://demo.worldlet.test/citywater']};
const dental={...bookable,id:'dental',title:'Book dental cleaning',actionLabel:'Book cleaning',reason:'You are due and openings are held',summary:'Book by Oct 9; no payment is due until the visit.'};
const cancel={...item,id:'cancel',priority:'high',title:'Confirm StreamBox cancellation',reason:'A pending confirmation prevents a recurring charge.',summary:'Without confirmation, the trial converts to a $15.99 monthly charge.',websiteURLs:['https://demo.worldlet.test/streambox']};
assert.equal(firstValueCandidate([water,dental])?.id,'dental');
assert.equal(firstValueCandidate([water,dental,cancel])?.id,'cancel','avoiding a charge is not paying one');
assert.equal(firstValueCandidate([water,{...item,id:'reply',priority:'normal'}])?.id,'reply');
assert.equal(firstValueCandidate([water])?.id,'water','with nothing else, it is still offered');
// Fox picks a row the Center shows; one it keeps under Later (off screen) needs the Later page to be boxed.
assert.equal(firstValueCandidate([{...item,id:'lease',priority:'high'},{...item,id:'reply',priority:'urgent'}],Date.now(),['lease'])?.id,'lease','a shown row outranks a held one Fox can finish no better');
assert.equal(firstValueCandidate([{...bookable,id:'lease',priority:'high'},{...bookable,priority:'urgent'}],Date.now(),['lease'])?.id,'lease');
// ...but not one Fox can finish better: RC run f0421ae8's retry showed only "Send Q4 roadmap draft"
// (no website) while the StreamBox and dental tasks waited under Later, and Fox never opened a page.
assert.equal(firstValueCandidate([{...item,id:'lease',priority:'high'},bookable],Date.now(),['lease'])?.id,'book','a held website task outranks a shown task without one');
assert.equal(firstValueCandidate([water,dental],Date.now(),['water'])?.id,'dental','a held booking outranks a shown bill');
assert.equal(firstValueCandidate([{...item,id:'lease',priority:'high'},bookable],Date.now(),['lease','book'])?.id,'book');
assert.equal(firstValueCandidate([bookable],Date.now(),['other'])?.id,'book','with no eligible row shown, the best item is still offered');
assert.ok(firstValueRequest('book',firstValueLinks(bookable)).includes('https://demo.worldlet.test/brightsmile'));
assert.ok(!/request the normal approval/.test(firstValueRequest('book')),'Fox acts directly on website steps');
const bundle=await bundleScript({entryPoints:['ui/onboarding/first-value.ts'],globalName:'FirstValue'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.setContent('<main id="world"></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(item=>{
  const w=window as any;w.calls=[];w.guides=[];w.root=document.getElementById('world');w.fixture={revision:1,onboarding:{completed:true,journeyStage:'first-value'},worldItems:[]};
  w.controller=w.FirstValue.mountFirstValue({root:w.root,state:w.fixture,view:w.view={current:'overview',busy:false,guideSource:'',setGuide(g){this.guideSource=g?.source||'';w.guides.push(g);w.root.replaceChildren(...g.actions);},revealGuide(){},previewAttention(id){w.preview=id;},helpWithAttention(id){w.helped=id;return true;},async settleAttention(id,status,options){w.settled=[id,status,options];return true;}},call:async(action,args)=>{w.calls.push({action,...args});w.fixture={...w.fixture,revision:w.fixture.revision+1,onboarding:{...w.fixture.onboarding,journeyStage:args.stage,journeyItemId:args.itemId}};return {ok:true};}});
  w.item=item;w.controller.update({...w.fixture,revision:2,worldItems:[item]});
 },item);
 // 5. Fox names the item; Show me (or a click on it) opens its card. There is no button to skip it.
 await page.waitForFunction(()=>(window as any).guides.some(g=>/I picked/.test(g.text)));
 assert.deepEqual(await page.getByRole('button').allInnerTexts(),['Show me'],'Show me is the only way on');
 await page.getByRole('button',{name:'Show me'}).click();
 await page.waitForFunction(()=>(window as any).preview==='refund');
 // 6. Opening the card (the spotlight's act) records the review stage; Fox asks to do it.
 await page.evaluate(()=>{const w=window as any;w.root.dataset.attentionPreview='true';});
 await page.evaluate(async()=>{const w=window as any;await w.controller.update({...w.fixture,onboarding:{completed:true,journeyStage:'first-value-review',journeyItemId:'refund'},worldItems:[w.item]});});
 await page.getByRole('button',{name:'Do it for me'}).click();
 assert.equal(await page.evaluate(()=>(window as any).helped),'refund');
 await page.evaluate(()=>{const w=window as any;w.root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id:'refund',phase:'started'}}));});
 await page.evaluate(()=>{const w=window as any;w.root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id:'refund',phase:'finished',result:{outcome:'error'}}}));});
 assert.equal(await page.evaluate(()=>(window as any).calls.at(-1).stage),'first-value-review');
 await page.evaluate(()=>{const w=window as any;w.root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id:'refund',phase:'started'}}));});
 // While Fox works on the page, a note by Back says what the person can do: watch, step in, or
 // shrink the page into the world while Fox carries on.
 await page.evaluate(()=>{const w=window as any;w.view.current='applet';const back=document.createElement('button');back.id='notionBack';back.textContent='Back';w.root.append(back);});
 await page.locator('.tour-coach:not([hidden])').waitFor({timeout:5000});
 assert.match(await page.locator('.tour-coach').textContent(),/Press Back to shrink this page into your world/);
 await page.evaluate(()=>{const w=window as any;w.view.current='overview';});
 await page.locator('.tour-coach').waitFor({state:'hidden',timeout:5000});
 await page.evaluate(()=>{const w=window as any;w.root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id:'refund',phase:'finished',result:{outcome:'complete',text:'The policy permits a request; nothing has been submitted.'}}}));});
 await page.waitForFunction(()=>(window as any).calls.at(-1)?.stage==='first-value-outcome');
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.stage==='finish')),false,'Agent completion must not finish onboarding');
 assert.equal(await page.evaluate(()=>(window as any).settled),undefined,'Nothing is marked done without the user');
 // A background check re-reading the item's sources leaves it briefly not fresh. Fox's reply and its
 // one confirmation stay in front meanwhile, also with the person in the World (task picture in
 // picture, #1175): nothing replaces them.
 const guides=await page.evaluate(()=>(window as any).guides.length);
 await page.evaluate(item=>{const w=window as any;w.controller.update({...w.fixture,revision:3,onboarding:{completed:true,journeyStage:'first-value-outcome',journeyItemId:'refund'},worldItems:[{...item,attentionFresh:false,status:'candidate'}]});},item);
 await page.waitForTimeout(1700);
 assert.equal(await page.evaluate(()=>(window as any).guides.length),guides,'Fox\'s confirmation stays in front while the item is briefly stale');
 // Fox's turn ended with the item still open, so Fox says so; Mark it done records that Fox did it.
 assert.match(String(await page.evaluate(()=>(window as any).guides.at(-1)?.text)),/It’s still open/);
 await page.getByRole('button',{name:'Mark it done'}).click();
 assert.deepEqual(await page.evaluate(()=>(window as any).settled),['refund','done',{by:'fox'}],'the decision records that Fox did it');
 // The user's Done on the card is the first win; it stays on this item instead of advancing.
 const kept=await page.evaluate(()=>{const w=window as any;w.winEvents=0;w.root.addEventListener('worldlet:first-win',()=>w.winEvents++);return w.root.dispatchEvent(new CustomEvent('worldlet:attention-settled',{cancelable:true,detail:{id:'refund',status:'done'}}));});
 assert.equal(kept,false,'The first win keeps the view instead of advancing');
 await page.waitForFunction(()=>(window as any).calls.at(-1)?.stage==='finish'&&(window as any).winEvents===1);
 assert.equal(await page.evaluate(()=>(window as any).root.dispatchEvent(new CustomEvent('worldlet:attention-settled',{cancelable:true,detail:{id:'refund',status:'done'}}))),true,'Only the journey item, once');
 // The person's Go ahead on Fox's last step settles the item while Fox is still replying: no
 // question afterwards, and the first win waits for Fox's reply.
 await page.evaluate(item=>{const w=window as any;w.calls.length=0;w.winEvents=0;w.view.busy=true;w.controller.update({...w.fixture,revision:4,onboarding:{completed:true,journeyStage:'first-value-running',journeyItemId:'refund'},worldItems:[item]});w.root.dispatchEvent(new CustomEvent('worldlet:attention-settled',{cancelable:true,detail:{id:'refund',status:'done'}}));},item);
 await page.waitForFunction(()=>(window as any).calls.at(-1)?.stage==='finish');
 await page.waitForTimeout(600);
 assert.equal(await page.evaluate(()=>(window as any).winEvents),0,'the first win waits while Fox replies');
 await page.evaluate(()=>{const w=window as any;w.view.busy=false;window.dispatchEvent(new Event('worldlet:fox-idle'));});
 await page.waitForFunction(()=>(window as any).winEvents===1);
 assert.equal(await page.getByRole('button',{name:'Mark it done'}).count(),0,'nothing asks after the Go ahead');
 // A removed/dismissed source cannot leave a resume button pointing at nothing.
 await page.evaluate(()=>{const w=window as any;w.controller.update({...w.fixture,onboarding:{completed:true,journeyStage:'first-value-running',journeyItemId:'missing'},worldItems:[]});});
 await page.getByRole('button',{name:'Pick another'}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls.at(-1).stage),'first-value');
 await page.evaluate(()=>{const w=window as any;w.controller.destroy();w.beforeDestroyCalls=w.calls.length;w.root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id:'refund',phase:'started'}}));});
 assert.equal(await page.evaluate(()=>{const w=window as any;return w.calls.length===w.beforeDestroyCalls;}),true,'Unmounted controller must not write progress');
 console.log('PASS first-value selection, Show me pick step, Do it for me on the card, publication gate, failed-run recovery, and explicit outcome confirmation. Fixture only.');
}finally{await browser.close();}
// Fox keeps talking through its ~20s of planning, never claims a page action, and yields to real work.
const lines=helpNarration('Book dental cleaning',true);
assert.ok(lines.every((l,i)=>i===0||l.at>lines[i-1].at)&&lines.at(-1)!.at>=30000,'lines cover the planning time in order');
assert.match(lines[0].text,/On it: \*\*Book dental cleaning\*\*/);
assert.ok(lines.every(l=>!/booked|cancelled|clicked|submitted|done/i.test(l.text)),'narration never claims an outcome');
const said:string[]=[];const narrator=narrateHelp([{at:0,text:'a'},{at:20,text:'b'},{at:5000,text:'late'}],t=>said.push(t));
await new Promise(r=>setTimeout(r,60));narrator.acting();await new Promise(r=>setTimeout(r,60));narrator.acting();
assert.deepEqual(said,['a','b','Watch me on the page, or step in any time.'],'the first page step replaces the plan lines, once, without repeating the page\'s own status');
console.log('PASS Fox narrates its planning time until its first page step.');
