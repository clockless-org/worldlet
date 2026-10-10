import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// Artifacts on the World page (core/artifacts/README.md): what Fox shows is kept, the Journal page of Fox's panel
// lays it out a page a day, opening it shows it again, × forgets it, and Fox finds and opens earlier ones. An Attention card
// whose item has left the World opens as it was. Bundled UI with a faked native bridge that keeps artifacts in
// memory; fictional turns, no model or account.
// Usage: node scripts/artifacts-ui-check.ts [screenshot directory]
const shots=process.argv[2];
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any,now=Date.now()/1000;
  // Yesterday at noon on the local clock: "25 hours ago" is the day before yesterday when the check runs just after
  // midnight (Mac RC 2931 ran at 00:24 PDT).
  const noon=new Date();noon.setDate(noon.getDate()-1);noon.setHours(12,0,0,0);const yesterday=noon.getTime()/1000;
  w.kept=new Map([['attention-cal:gone',{id:'attention-cal:gone',kind:'attention',title:'Dinner at Nopa',body:'At **7 PM** with Sam.',chart:null,size:'medium',category:'Coming Up',origin:{type:'attention',item:'cal:gone'},createdAt:yesterday,updatedAt:yesterday}]]);
  const today9=new Date();today9.setHours(9,0,0,0);const morning=Math.min(now-120,today9.getTime()/1000);
  const label=(d:Date)=>d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  w.kept.set('art-planplanplan',{id:'art-planplanplan',kind:'answer',title:'Plan · '+label(new Date()),body:'**Today** A quiet day.',chart:null,size:'large',origin:{type:'conversation',place:'world'},createdAt:morning,updatedAt:morning});
  // Yesterday's summary, caught up this morning, stands on yesterday's page, last.
  w.kept.set('art-summsummsumm',{id:'art-summsummsumm',kind:'answer',title:'Summary · '+label(noon),body:'Shipped the journal.',chart:null,size:'large',origin:{type:'conversation',place:'world'},createdAt:morning-60,updatedAt:morning-60});
  for(let i=0;i<30;i++)w.kept.set('art-older'+String(i).padStart(7,'0'),{id:'art-older'+String(i).padStart(7,'0'),kind:'answer',title:'Older plan '+i,body:'Step '+i,chart:null,size:['small','medium','large'][i%3],origin:{type:'conversation',place:'world'},createdAt:yesterday-i,updatedAt:yesterday-i});
  w.calls=[];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'x',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,
    momentApplets:[{id:'wgt-getty2abcd',title:'Getty Center today',blurb:'Stops and artworks',color:'#c8553d',endsAt:now+3*3600,pinned:false,createdAt:now-60}]};
   if(b.action==='widgets'&&b.operation==='list')return {now:[{id:'wgt-getty2abcd',title:'Getty Center today',blurb:'Stops and artworks',color:'#c8553d',endsAt:now+3*3600,pinned:false,createdAt:now-60,updatedAt:now-60,archivedAt:null}],
    finished:[{id:'wgt-dinner2abcd',title:'Dinner timer board',blurb:'Five timers',color:'#315f48',endsAt:yesterday+10000,pinned:false,createdAt:yesterday,updatedAt:yesterday,archivedAt:yesterday+10000}]};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true,autoSync:true};
   if(b.action==='artifacts'){
    if(b.operation==='list')return {artifacts:[...w.kept.values()].sort((a,b)=>b.updatedAt-a.updatedAt)};
    if(b.operation==='get')return {artifact:w.kept.get(b.id)??null};
    if(b.operation==='save'){const t=Date.now()/1000,previous=w.kept.get(b.artifact.id);const saved={...b.artifact,createdAt:previous?.createdAt??t,updatedAt:t};w.kept.set(saved.id,saved);setTimeout(()=>window.dispatchEvent(new CustomEvent('worldlet:artifacts',{detail:{id:saved.id}})));return {ok:true,artifact:saved};}
    if(b.operation==='delete'){w.kept.delete(b.id);return {ok:true};}
   }
   if(b.action==='agentChat'){
    if(b.text==='plan'){await w.worldletAgentTool(b.id,{id:'t1',name:'show_artifact',args:{title:'Three CASA labs',body:'| Lab | Price |\n| --- | --- |\n| TAC | $540 |',chart:null,size:null,actions:[{label:'Book TAC',request:'Book the TAC Security assessment'}]}});return {message:'Here it is.'};}
    if(b.text==='pancakes'){await w.worldletAgentTool(b.id,{id:'t4',name:'show_artifact',args:{title:'Pancakes for four',body:'Fluffy in **20 minutes**.',chart:null,size:null,actions:null,blocks:[
     {type:'scale',label:'Servings',unit:'guests',base:4,min:1,max:12,step:1,rows:[{label:'Flour',amount:250,unit:'g'},{label:'Milk',amount:300,unit:'ml'},{label:'Eggs',amount:2,unit:''}]},
     {type:'checklist',label:'Steps',items:['Whisk the batter','Rest it 10 minutes','Cook on medium heat']}]}});return {message:'Here you go.'};}
    if(b.text==='bike'){await w.worldletAgentTool(b.id,{id:'t5',name:'show_artifact',args:{title:'How a bicycle works',body:'Five systems work together.',chart:null,size:null,actions:null,blocks:[
     {type:'parts',label:'Systems',parts:[{name:'Frame',detail:'Holds every part and carries the rider.'},{name:'Wheels',detail:'Roll and carry the load.'},{name:'Drivetrain',detail:'Turns pedalling into motion.'},{name:'Brakes',detail:'Slow the wheels by friction.'},{name:'Cockpit',detail:'Steer, shift and brake.'}]},
     {type:'choice',label:'What next?',options:[{label:'Fix a flat',request:'Show me how to fix a flat tire'},{label:'Pick a bike',request:'Help me pick a commuter bike'}]}]}});return {message:'Tap a part.'};}
    if(b.text==='labs'){await w.worldletAgentTool(b.id,{id:'t6',name:'show_artifact',args:{title:'Which CASA lab to book',body:'All three are approved by Google; **TAC** is the quickest to a letter.',chart:null,size:null,actions:[{label:'Book TAC',request:'Book the TAC Security assessment'}],tone:'honey',art:null,blocks:[
     {type:'stats',label:'TAC at a glance',items:[{value:'$540',label:'Price',note:'lowest'},{value:'3 wks',label:'To a letter',note:''},{value:'Tier 2',label:'Assessment',note:''}]},
     {type:'compare',label:'Labs',options:[{name:'TAC Security',note:'Fastest',points:['$540','Self-scan first'],pick:true},{name:'Leviathan',note:'Well known',points:['$1,500','5 weeks'],pick:false},{name:'DEKRA',note:'',points:['$2,000'],pick:false}]},
     {type:'callout',label:'Before you pay',text:'Run the self-scan first: a failed scan costs a second fee.',tone:'clay'}]}});return {message:'Here are the labs.'};}
    if(b.text==='trip'){await w.worldletAgentTool(b.id,{id:'t7',name:'show_artifact',args:{title:'Flight to Seattle',body:'Leave home by **3:15 PM** to make it comfortably.',chart:null,size:'large',actions:null,tone:'teal',art:'flight',blocks:[
     {type:'facts',label:'Trip',rows:[{icon:'time',text:'Fri 4:46 PM · SFO → SEA, Alaska 341'},{icon:'place',text:'Terminal 1, Gate B12'},{icon:'person',text:'With Jordan'}]},
     {type:'steps',label:'Getting there',items:[{title:'Leave home',detail:'Traffic on 101 is heavy after 3.',when:'3:15 PM'},{title:'Check in and drop the bag',detail:'',when:'3:55 PM'},{title:'Board',detail:'Group C',when:'4:16 PM'}]},
     {type:'tags',label:'Pack',items:['Passport','Charger','Jacket']}]}});return {message:'Safe travels.'};}
    if(b.text==='Book the TAC Security assessment')return {message:'Booking it.'};
    if(b.text==='find'){w.found=await w.worldletAgentTool(b.id,{id:'t2',name:'list_artifacts',args:{query:'casa',limit:5}});w.reopened=await w.worldletAgentTool(b.id,{id:'t3',name:'open_artifact',args:{id:w.found?.artifacts?.[0]?.id}});return {message:'That one.'};}
    return {message:'Short answer to '+b.text};
   }
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 const card=page.locator('#foxArtifact'),panel=page.locator('#companionInfo');
 const ask=async(text:string,reply:string)=>{await page.locator('#notionInput').click();await page.locator('#notionInput').fill(text);await page.locator('#notionInput').press('Enter');await page.locator('#companionDialogue').getByText(reply,{exact:true}).waitFor();};

 await ask('plan','Here it is.');
 await card.waitFor({state:'visible'});
 await page.waitForFunction(()=>[...(window as any).kept.values()].some(a=>a.kind==='answer'&&a.title==='Three CASA labs'&&a.size==='medium'&&a.origin.type==='conversation'));
 if(shots)await page.screenshot({path:shots+'/artifact-actions.png'});
 // A next step on the card drafts the person's request; it reaches Fox only when they send it.
 await card.getByRole('button',{name:'Book TAC',exact:true}).click();
 assert.equal(await page.locator('#notionInput').inputValue(),'Book the TAC Security assessment','The click drafts the request');
 assert.ok(!(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='agentChat'&&c.text==='Book the TAC Security assessment'))),'Nothing is sent until the person sends it');
 await page.locator('#notionInput').press('Enter');
 await page.locator('#companionDialogue').getByText('Booking it.',{exact:true}).waitFor();
 await page.waitForFunction(()=>[...(window as any).kept.values()].some(a=>a.title==='Three CASA labs'&&a.actions?.[0]?.label==='Book TAC'));
 // The size the person picks is kept with it.
 await card.getByRole('button',{name:'Make artifact larger'}).click();
 await page.waitForFunction(()=>[...(window as any).kept.values()].some(a=>a.title==='Three CASA labs'&&a.size==='large'));
 await card.getByRole('button',{name:'Close artifact'}).click();
 // Closed, it goes into the Journal: the top-left corner takes it (owner request 2026-10-08).
 await page.locator('.world-today-open.is-receiving').waitFor();

 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Artifacts'}})));
 const book=page.locator('#journalBook'),tab=book.locator('[data-section=Journal]');
 // The Journal: one page a day, today's first, cards in time order with the plan first, each at its size.
 await tab.getByText('Three CASA labs').waitFor();
 assert.ok(await book.isVisible()&&!await panel.isVisible(),'An old link to Artifacts opens the Journal, a book of its own');
 assert.equal(await panel.getByRole('tab',{name:'Journal'}).count(),0,'Fox\'s panel has no Journal tab any more');
 assert.equal(await tab.locator('.companion-journal-day[aria-pressed=true]').textContent(),'Today');
 const titles=async()=>tab.locator('.companion-artifact-title').allTextContents();
 const today=await titles();
 assert.match(today[0],/^Plan · /,'The plan opens the day');
 assert.ok(today.includes('Three CASA labs')&&today.includes('Getty Center today'),'Today holds what was shown and made today '+JSON.stringify(today));
 assert.equal(await tab.locator('.companion-artifact',{hasText:'Three CASA labs'}).getAttribute('data-size'),'large','A card keeps its size on the page');
 assert.equal(await tab.locator('.companion-artifact',{hasText:'Getty'}).getAttribute('data-size'),'small','A page Fox made is small');
 assert.match(await tab.locator('.companion-artifact',{hasText:'Getty'}).locator('.companion-artifact-preview').first().textContent(),/^Applet until /);
 const box=async(t:string)=>(await tab.locator('.companion-artifact',{hasText:t}).first().boundingBox())!;
 const plan=await box('Plan · '),casa=await box('Three CASA labs'),getty=await box('Getty');
 assert.ok(Math.abs(plan.width-casa.width)<2&&Math.abs(plan.height-casa.height)<2&&casa.width>getty.width*1.8&&plan.height>getty.height*1.8,'Large is two by two, small one cell '+JSON.stringify({plan,casa,getty}));
 if(shots)await page.screenshot({path:shots+'/journal-today.png'});
 assert.ok(await tab.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'The day fits the book; its pages scroll on their own');
 // No card scrolls (owner Order 2026-10-09): each shows the fullest version its cell holds, marked More when shortened.
 const cardsFit=()=>tab.locator('.companion-artifact-open[data-fit]').evaluateAll(cards=>cards.map(c=>({fit:(c as HTMLElement).dataset.fit,overflow:getComputedStyle(c).overflowY,fits:c.scrollHeight<=c.clientHeight+1})));
 {const fits=await cardsFit();assert.ok(fits.length>=2&&fits.every(f=>f.overflow==='hidden'&&(f.fits||f.fit==='brief')),'Journal cards fit their cells without scrolling '+JSON.stringify(fits));}
 {const [left,right]=await Promise.all(['.companion-journal-leaf-left','.companion-journal-leaf-right'].map(sel=>tab.locator(sel).boundingBox()));assert.ok(left&&right&&Math.abs(left.width-right.width)<2&&right.x>=left.x+left.width-1,'The book lies open on two leaves');
  assert.ok((await tab.locator('.companion-journal-leaf-left').innerText()).includes('Plan · '),'The plan is written on the left leaf');}

 // ‹ turns to yesterday: the older cards, and the summary caught up this morning, last.
 await tab.getByRole('button',{name:'Earlier day'}).click();
 assert.equal(await tab.locator('.companion-journal-day[aria-pressed=true]').textContent(),'Yesterday');
 const yesterday=await titles();
 assert.match(yesterday.at(-1)!,/^Summary · /,'The day\'s summary closes its own day '+JSON.stringify(yesterday.slice(-3)));
 assert.ok(yesterday.includes('Dinner at Nopa')&&yesterday.includes('Dinner timer board'));
 assert.equal(await tab.locator('.companion-artifact',{hasText:'Dinner at Nopa'}).getAttribute('data-size'),'small','An Attention card is small');
 const medium=await box('Older plan 1'),small=await box('Dinner at Nopa');
 assert.equal(await tab.locator('.companion-artifact',{hasText:'Older plan 1'}).first().getAttribute('data-size'),'medium');
 assert.ok(medium.width>small.width*1.8&&Math.abs(medium.height-small.height)<2,'Medium is two by one '+JSON.stringify({medium,small}));
 assert.ok(await tab.locator('.companion-journal-leaf-right .companion-journal-page').evaluate(e=>e.scrollHeight>e.clientHeight),'A full day scrolls inside its right leaf');
 if(shots)await page.screenshot({path:shots+'/journal-yesterday.png'});
 assert.equal(await tab.getByRole('button',{name:'Earlier day'}).isDisabled(),true,'Nothing older');
 // A narrow window shows one leaf.
 await page.setViewportSize({width:720,height:820});await tab.locator('.companion-journal-day',{hasText:'Today'}).click();
 assert.equal(await tab.getAttribute('data-leaves'),'1','A narrow window shows the day on one leaf');
 if(shots)await page.screenshot({path:shots+'/journal-narrow.png'});
 await page.setViewportSize({width:1440,height:900});await tab.locator('.companion-journal-day',{hasText:'Yesterday'}).click();
 await tab.locator('.companion-journal-day',{hasText:'Today'}).click();
 assert.equal(await tab.locator('.companion-journal-day[aria-pressed=true]').textContent(),'Today','A day chip turns to its page');
 assert.equal(await tab.locator('h3').textContent(),await page.evaluate(()=>new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})),'The page names its date');
 await tab.getByRole('button',{name:'Earlier day'}).click();

 // A finished one comes back only when the person keeps it.
 await tab.getByRole('button',{name:'Keep and open',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='widgets'&&c.operation==='pin'&&c.id==='wgt-dinner2abcd'));
 // One whose moment lasts opens as its Applet.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Journal'}})));
 await tab.locator('.companion-artifact',{hasText:'Getty'}).locator('.companion-artifact-open').click();
 await page.locator('#notionContent[data-template=moment] .moment-applet').waitFor();
 await page.keyboard.press('Escape');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Journal'}})));
 await tab.getByRole('button',{name:'Earlier day'}).click();
 // An Attention card whose item has left the World opens as it was.
 await tab.locator('.companion-artifact',{hasText:'Dinner at Nopa'}).locator('.companion-artifact-open').click();
 await card.waitFor({state:'visible'});
 assert.equal(await book.evaluate(e=>(e as HTMLDialogElement).open),false,'The Journal steps aside');
 assert.equal(await card.locator('h2').textContent(),'Dinner at Nopa');
 assert.equal(await card.locator('.fox-artifact-origin').textContent(),'Coming Up · earlier');
 // Still over the moment's Applet: a card opens small in its corner there (ui/artifacts/fox-artifact.ts, #108).
 assert.equal(await card.getAttribute('data-size'),'small');
 await card.getByRole('button',{name:'Close artifact'}).click();

 // Fox finds an earlier one and opens it.
 await ask('find','That one.');
 assert.deepEqual(await page.evaluate(()=>(window as any).found.artifacts.map(a=>a.title)),['Three CASA labs']);
 assert.equal(await page.evaluate(()=>(window as any).reopened.ok),true);
 assert.equal(await card.locator('h2').textContent(),'Three CASA labs');
 assert.equal(await card.locator('.fox-artifact-origin').textContent(),'From an earlier conversation');
 assert.equal(await card.getAttribute('data-size'),'small','Over an Applet it opens small, whatever size it was kept at');
 await card.getByRole('button',{name:'Close artifact'}).click();

 // × forgets it.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Journal'}})));
 await tab.getByRole('button',{name:'Earlier day'}).click();
 await tab.getByRole('button',{name:'Forget Dinner at Nopa'}).click();
 await tab.locator('.companion-artifact',{hasText:'Dinner at Nopa'}).waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>(window as any).kept.has('attention-cal:gone')),false);
 await page.keyboard.press('Escape');

 // The card system (ui/artifacts/CARD-SYSTEM.md): a tone, a painted picture and showing blocks, all in the Attention
 // card's design.
 if(await book.evaluate(e=>(e as HTMLDialogElement).open))await book.getByRole('button',{name:'Close journal'}).click();
 await ask('labs','Here are the labs.');
 await card.waitFor({state:'visible'});
 // Three blocks are more than a medium card holds: it leaves out the last (owner Order 2026-10-09, no scrolling), and
 // Show all makes it large with every block.
 {const drawn=await card.locator('.artifact-block').count();assert.ok(drawn>=1&&drawn<3&&await card.locator('.artifact-block[data-type=callout]').count()===0,'A small card leaves out its last blocks '+drawn);}
 // Over an Applet Show all grows the card one size at a time until every block shows.
 await card.getByRole('button',{name:'Show all'}).click();
 assert.equal(await card.getAttribute('data-size'),'medium');
 if(await card.getByRole('button',{name:'Show all'}).isVisible())await card.getByRole('button',{name:'Show all'}).click();
 assert.equal(await card.getAttribute('data-size'),'large');
 assert.equal(await card.getAttribute('data-tone'),'honey');
 assert.equal(await card.evaluate(c=>getComputedStyle(c).getPropertyValue('--attention-accent').trim()),'#946e2b','The tone is the card\'s accent');
 assert.equal(await card.locator('.artifact-block[data-type=callout]').evaluate(e=>getComputedStyle(e).getPropertyValue('--attention-accent').trim()),'#a04e33','A callout carries its own tone');
 assert.equal(await card.locator('.artifact-stat').count(),3);
 assert.equal(await card.locator('.artifact-option[data-pick=true] .artifact-option-name').textContent(),'TAC Security','The recommended option stands out');
 assert.match(await card.locator('.fox-artifact-art').getAttribute('src')||'',/attention\/.*\.webp$/,'An answer has the Attention card\'s painted picture');
 if(shots)await page.screenshot({path:shots+'/card-system-compare.png'});
 await card.getByRole('button',{name:'Close artifact'}).click();
 await ask('trip','Safe travels.');
 // Over an Applet the card is in the corner and shows what fits there; Show all grows it a size at a time (#108).
 while(!await card.locator('.artifact-steps').isVisible())await card.getByRole('button',{name:'Show all'}).click();
 assert.notEqual(await card.getAttribute('data-size'),'small');
 assert.match(await card.locator('.fox-artifact-art').getAttribute('src')||'',/flight\.webp$/,'Fox can name the scene');
 assert.equal(await card.locator('.artifact-facts li').count(),3);
 assert.equal(await card.locator('.artifact-step-when').first().textContent(),'3:15 PM');
 if(shots)await page.screenshot({path:shots+'/card-system-steps.png'});
 await card.getByRole('button',{name:'Close artifact'}).click();

 // Blocks (owner Order 2026-10-08): Worldlet's own components on the card in the Attention card's style; a scale and a
 // checklist work in place and are kept, parts show one at a time, a choice drafts the person's answer.
 await ask('pancakes','Here you go.');
 await card.waitFor({state:'visible'});
 // Over an Applet it opens small; Show all grows it a size at a time until its blocks fit (#108).
 assert.equal(await card.getAttribute('data-size'),'small');
 while(await card.locator('.fox-artifact-more').isVisible())await card.getByRole('button',{name:'Show all'}).click();
 assert.notEqual(await card.getAttribute('data-size'),'small','A scale and a checklist need more than the small corner card');
 // The person makes it large, and the Journal keeps it at that size (below).
 if(await card.getAttribute('data-size')!=='large')await card.getByRole('button',{name:'Make artifact larger'}).click();
 assert.equal(await card.getAttribute('data-size'),'large');
 const amounts=async()=>card.locator('.artifact-scale-amount').allTextContents();
 assert.deepEqual(await amounts(),['250 g','300 ml','2']);
 await card.getByRole('button',{name:'More guests'}).click();await card.getByRole('button',{name:'More guests'}).click();
 assert.equal(await card.locator('.artifact-scale-value').textContent(),'6 guests');
 assert.deepEqual(await amounts(),['375 g','450 ml','3'],'Amounts follow the count');
 await card.getByText('Rest it 10 minutes').click();
 assert.equal(await card.locator('.artifact-block-count').textContent(),'1 / 3');
 await page.waitForFunction(()=>[...(window as any).kept.values()].some(a=>a.title==='Pancakes for four'&&a.blocks?.[0]?.value===6&&a.blocks?.[1]?.done?.[0]===1),null,{timeout:5000});
 {const [accent,check]=await card.evaluate(c=>[getComputedStyle(c).getPropertyValue('--attention-accent').trim(),getComputedStyle(c.querySelector('li[data-done=true] .artifact-check-mark')!).backgroundColor]);
  assert.ok(accent&&check!=='rgba(0, 0, 0, 0)','A ticked step takes the card\'s accent');}
 assert.equal(await card.locator('.artifact-block-label').first().evaluate(e=>getComputedStyle(e).textTransform),'uppercase','A block\'s label is the card\'s accent label');
 if(shots)await page.screenshot({path:shots+'/artifact-blocks-recipe.png'});
 await card.getByRole('button',{name:'Close artifact'}).click();
 await ask('bike','Tap a part.');
 await card.locator('.artifact-part-detail',{hasText:'Holds every part'}).waitFor();
 await card.getByRole('button',{name:'Brakes',exact:true}).click();
 assert.equal(await card.locator('.artifact-part-detail').textContent(),'Slow the wheels by friction.');
 assert.equal(await card.getByRole('button',{name:'Brakes',exact:true}).getAttribute('aria-pressed'),'true');
 if(shots)await page.screenshot({path:shots+'/artifact-blocks-parts.png'});
 await card.getByRole('button',{name:'Fix a flat',exact:true}).click();
 assert.equal(await page.locator('#notionInput').inputValue(),'Show me how to fix a flat tire','A choice drafts the person\'s answer');
 await page.locator('#notionInput').fill('');
 await card.getByRole('button',{name:'Close artifact'}).click();
 // The Journal shows them still, as the person left them.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Journal'}})));
 const pancakes=tab.locator('.companion-artifact',{hasText:'Pancakes for four'});
 await pancakes.locator('.artifact-scale-value',{hasText:'6 guests'}).waitFor();
 // A cell shows the blocks it holds, first first, and says More for the rest (owner Order 2026-10-09: no scrolling).
 const shownOrMore=async(card,block:string)=>(await card.locator(block).count())>0||await card.locator('.companion-artifact-open').getAttribute('data-shortened')==='true';
 if(await pancakes.locator('.artifact-checklist').count())assert.equal(await pancakes.locator('li[data-done=true]').count(),1);
 else assert.equal(await pancakes.locator('.companion-artifact-open').getAttribute('data-shortened'),'true','A cell that leaves out a block says More');
 assert.ok(((await pancakes.locator('.companion-artifact-title').boundingBox())?.height??0)>10,'Its title keeps its room above the blocks');
 // It keeps the card as it was shown (owner request 2026-10-08: "journal 里保留卡片"): its picture, tone and details.
 const trip=tab.locator('.companion-artifact',{hasText:'Flight to Seattle'});
 assert.match(await trip.locator('.companion-artifact-art').getAttribute('src')||'',/flight\.webp$/,'A Journal card keeps its picture');
 assert.equal(await trip.getAttribute('data-tone'),'teal');
 if(await trip.locator('.artifact-steps').count())assert.ok(await trip.locator('.artifact-step-detail',{hasText:'Traffic on 101'}).evaluate(e=>getComputedStyle(e).display!=='none'),'A step keeps its detail');
 else assert.ok(await shownOrMore(trip,'.artifact-steps'));
 assert.equal(await tab.locator('.companion-artifact',{hasText:'Which CASA lab'}).locator('.artifact-stat-note',{hasText:'lowest'}).count(),1,'A figure keeps its note');
 if(shots)await page.screenshot({path:shots+'/artifact-blocks-journal.png'});
 await page.keyboard.press('Escape');

 // No Keep as Applet on the card (Kelvin 2026-10-07: set aside for now; if it comes back, it is beside Fox).
 await ask('plan','Here it is.');
 await card.waitFor({state:'visible'});
 assert.equal(await card.getByRole('button',{name:/Keep as Applet/}).count(),0,'the card offers no Keep as Applet');
 assert.deepEqual(errors,[]);
 console.log('PASS journal: what Fox shows is kept with its size, a page a day in Fox\'s panel (plan first, summary last on its own day, large two by two, medium two by one, small one cell, turned by ‹ › and day chips, a full day scrolling inside its page), a next step drafted for the person to send, pages Fox made (open as their Applet, a finished one kept and opened), opened again in the World (an Attention card whose item left as it was), found and opened by Fox, and forgotten with ×');
});
