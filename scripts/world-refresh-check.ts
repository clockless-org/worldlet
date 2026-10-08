// Background state updates from the Mac (an Applet read starting or finishing,
// a world check saving items) must not rebuild the scene or move the camera.
// The Attention Center keeps one size and place; it shows only the groups that hold
// something, never counts what it is holding, never labels itself, and is never scrolled:
// what does not fit is dropped whole, rather than cut off or hidden below a fold.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.calls=[];
  // Core delivers Attention items only after the model has written their text (bd6bdcac).
  window.processed=f=>({...structuredClone(f),worldItems:(f.worldItems||[]).map(i=>({attentionContentVersion:1,...i}))});
  window.fixture={workspaceId:'world-refresh',revision:0,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   connections:[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true,running:false,failed:false,needsAttention:false,savedItemCount:0,records:[]},
    {id:'c-cal',provider:'google-calendar',label:'Google Calendar',syncStatus:'connected',connected:true,running:false,failed:false,needsAttention:false,savedItemCount:0,records:[]}],
   sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true,provider:'custom'},cloudConsent:true};if(b.action==='appContent')return {pages:[]};if(b.action==='weatherLoad')return null;if(b.action==='agentChat')return {message:'Ocean Shore is playing.',session:'s'};return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,WORLD_APPS.length);
 const tracker=page.locator('.world-task-tracker');
 assert.equal(await page.evaluate(()=>!!document.querySelector<HTMLElement>('.world-attention-title')),false,'the panel shows its contents, not a heading over them');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector<HTMLElement>('.world-task-tracker')).pointerEvents),'none','the panel lies over the world without swallowing clicks on it');
 assert.equal(await tracker.locator('.world-task-group').count(),0,'nothing needs the user, so the panel shows no groups');
 assert.doesNotMatch(await tracker.innerText(),/Quiet/);
 // Nothing waiting is the best outcome, not a gap to apologise for: an empty panel
 // says nothing at all rather than asking to be filled.
 assert.equal((await tracker.innerText()).trim(),'','an empty panel asks for nothing, connected or not');
 assert.equal(await tracker.isVisible(),false,'empty Attention Center has no visible panel');
 await page.evaluate(()=>{location.hash='building=building-home';});
 await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active==='building-home'&&m.camera.settled;});
 await page.evaluate(()=>{document.querySelector<HTMLElement>('#notionStage canvas').dataset.generation='first';});
 const before=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return {span:m.camera.span,anchor:m.camera.anchor,frames:m.performance.frames,viewport:m.framing.viewport};});
 const send=patch=>page.evaluate(patch=>{fixture.activityRevision+=1;Object.assign(fixture,patch);return worldletReceive(processed(fixture));},patch);
 // A check starts reading Gmail: activity facts change, nothing structural does.
 await page.evaluate(()=>{fixture.connections[0].running=true;});
 await send({});
 await page.waitForTimeout(300);
 let after: any=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return {generation:document.querySelector<HTMLElement>('#notionStage canvas')?.dataset.generation,active:m.active,span:m.camera.span,anchor:m.camera.anchor,settled:m.camera.settled,frames:m.performance.frames};});
 assert.equal(after.generation,'first','an Applet read starting must not rebuild the scene');
 assert.equal(after.active,'building-home');
 assert.ok(after.settled&&Math.abs(after.span-before.span)<.01,'camera stays where it was: '+JSON.stringify({before,after}));
 // The check finishes and saves one task: the panel updates, the scene still stands.
 await page.evaluate(()=>{fixture.connections[0].running=false;fixture.connections[0].savedItemCount=1;fixture.worldItems=[{id:'item-1',kind:'task',provider:'gmail',status:'open',title:'Confirm school pickup',context:'Ms. Alvarez needs an answer by Thursday.',attentionReason:'A reply is expected',sources:[{provider:'gmail',id:'t1',quote:'Please confirm by Thursday.',url:'https://mail.google.com/mail/u/0/#inbox/t1'}],createdAt:Date.now()/1000,updatedAt:Date.now()/1000}];});
 await send({});
 await tracker.locator('.world-matter').first().waitFor();
 after=await page.evaluate(()=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return {generation:document.querySelector<HTMLElement>('#notionStage canvas')?.dataset.generation,active:m.active,gmail:m.modules.find(d=>d.id==='app-gmail')};});
 assert.equal(after.generation,'first','saved items must not rebuild the scene');
 assert.equal(after.active,'building-home');
 assert.equal(await tracker.locator('.world-task-group').count(),1,'only the group that holds something appears');
 assert.equal(await tracker.locator('.world-matter').count(),1);
 assert.equal(await tracker.locator('.world-task-heading').innerText(),'WORTH DOING','the heading names the group and nothing else');
 assert.deepEqual(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.framing.viewport),before.viewport,'showing Attention Center must not move or shrink the world');
 const shortBacking=await page.locator('.world-task-list').boundingBox();
 assert.ok(Math.abs(shortBacking.y+shortBacking.height/2-page.viewportSize().height/2)<2,'short Attention Center stays vertically centered');
 // An event says when it is, beside its name, in both the forms a person uses.
 await page.evaluate(()=>{const at=new Date(Date.now()+2*3600*1000).toISOString();
  fixture.worldItems=[...fixture.worldItems,{id:'item-2',kind:'event',provider:'google-calendar',status:'open',title:'Dentist',context:'Bring the referral letter.',start:at,sources:[{provider:'google-calendar',id:'e1',quote:'Dentist 3:00 PM'}],createdAt:1,updatedAt:2}];});
 await send({});
 await page.waitForFunction(()=>document.querySelectorAll<HTMLElement>('.world-matter').length===2);
 // When it is leads the key-facts line under the name (#1281); the full time stays in its label.
 const soon=tracker.locator('.world-task-group[data-group=event] .world-task-time');
 assert.match(await soon.innerText(),/^Starts in 2 hr\. · \d{1,2}:\d{2}\s?(AM|PM)$/,'the time says how far away it is and the clock time');
 // Which time it is (#764) stays in its label too.
 assert.match(await soon.getAttribute('title'),/^Starts: /,'the label says the time is its start');
 const columns=await tracker.locator('.world-task-copy').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().width>0).map(el=>el.getBoundingClientRect().left));
 assert.ok(columns.every(x=>Math.abs(x-columns[0])<1),'Real HUD titles align');
 const nearTiming=await page.evaluate(()=>{const title=document.querySelector<HTMLElement>('.world-task-group[data-group=event] .world-task-title').getBoundingClientRect(),time=document.querySelector<HTMLElement>('.world-task-group[data-group=event] .world-task-time'),facts=time.parentElement;return {under:time.getBoundingClientRect().top>=title.bottom-1,leads:facts.classList.contains('world-task-objective')&&facts.firstElementChild===time};});
 assert.deepEqual(nearTiming,{under:true,leads:true},'the time leads the line under the title');
 assert.deepEqual((await tracker.locator('.world-task-heading').allInnerTexts()),['COMING UP','WORTH DOING'],'time-bound items come first, under their own name');
 assert.doesNotMatch(await tracker.innerText(),/Calendar|Mail|Gmail/,'a row says the thing, never which Applet it came from');
 // Shapes say kind; importance remains data, while rows use a neutral hover.
 const shapes=()=>page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.world-matter')].map(r=>{const svg=r.querySelector('.matter-icon svg');return r.dataset.matterState+':'+svg.firstElementChild.tagName+':'+(svg.children.length-1);}));
 assert.deepEqual(await shapes(),['event:path:0','needsAction:rect:0'],'an event is a diamond and an ordinary task a plain square');
 await page.evaluate(()=>{fixture.worldItems=fixture.worldItems.map(i=>i.kind==='task'?{...i,priority:'urgent'}:i);});
 await send({});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-matter[data-matter-state=needsAction]')?.dataset.attentionLevel==='5');
 assert.deepEqual(await shapes(),['event:path:0','needsAction:rect:0'],'urgent tasks remain pure squares');
 assert.equal(await tracker.locator('[data-matter-state=event]').getAttribute('data-attention-level'),'3');
 const backgrounds=[];
 for(const [index,priority] of ['normal','elevated','important','high','urgent'].entries()){
  await page.evaluate(priority=>{fixture.worldItems=fixture.worldItems.map(i=>i.kind==='task'?{...i,priority}:i);},priority);
  await send({});
  const row=tracker.locator('[data-matter-state=needsAction]');
  assert.equal(await row.getAttribute('data-attention-level'),String(index+1));
  const appearance=await row.evaluate(e=>({image:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).backgroundColor}));
  assert.equal(appearance.image,'none','importance does not add a colored backing');
  assert.equal(appearance.color,'rgba(0, 0, 0, 0)','no solid rectangular backing');
  backgrounds.push(appearance.image);
 }
 assert.equal(new Set(backgrounds).size,1,'all importance levels share the quiet idle style');
 await tracker.locator('[data-matter-state=needsAction]').hover();
 // Hover is a soft neutral light (8f272611): near-white, grey and translucent, never a hue.
 await page.waitForFunction(()=>{const m=getComputedStyle(document.querySelector('.world-matter[data-matter-state=needsAction]')).backgroundColor.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);if(!m)return false;const [r,g,b,a]=m.slice(1).map(Number);return Math.min(r,g,b)>=220&&Math.max(r,g,b)-Math.min(r,g,b)<=4&&a>0&&a<.3;});
 await page.mouse.move(1270,10);
 await page.screenshot({path:'/tmp/worldlet-attention-levels.png'});
 console.log('PASS Attention: pure shapes, five semantic importance levels, transparent idle, neutral hover and event urgency.');

 // The relative day reads beside the title; the complete time stays in its label.
 await page.evaluate(()=>{const at=new Date();at.setDate(at.getDate()+2);at.setHours(14,0,0,0);fixture.worldItems=[{id:'date-event',kind:'event',provider:'google-calendar',status:'open',title:'Design review',context:'Bring the revised layout.',start:at.toISOString(),sources:[{provider:'google-calendar',id:'date-e',quote:'Design review'}],createdAt:1,updatedAt:2}];});
 await send({});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-task-title')?.innerText==='Design review');
 assert.equal(await tracker.locator('.world-task-time').count(),1,'the event says when it is');
 assert.match(await tracker.locator('.world-task-time').getAttribute('title'),/^Starts: .*, 2:00:00 PM /,'the clock time remains readable');
 assert.match(await tracker.locator('.world-task-time').innerText(),/^Starts in [23] days · 2:00\sPM$/,'how many days away it is reads under the title');
 // Time leads the line under the title, before the context.
 const calendarTiming=await page.evaluate(()=>{const title=document.querySelector<HTMLElement>('.world-task-title').getBoundingClientRect(),when=document.querySelector<HTMLElement>('.world-task-time');return {underTitle:when.getBoundingClientRect().top>=title.bottom-1,beforeContext:when.parentElement.firstElementChild===when&&/Bring the revised layout\.$/.test(when.parentElement.textContent)};});
 assert.equal(calendarTiming.underTitle,true,'the time reads under the title');
 assert.equal(calendarTiming.beforeContext,true,'the context follows the time');

 // More than fits: the panel drops whole rows, evenly, and never scrolls or cuts a word.
 await page.evaluate(()=>{const soon=n=>new Date(Date.now()+n).toISOString();
  fixture.worldItems=[...Array(9)].flatMap((_,i)=>[
   {id:'e'+i,kind:'event',provider:'google-calendar',status:'open',title:'Design standup',context:'You present the new region art.',start:soon((i+2)*3600000),sources:[{provider:'google-calendar',id:'ev'+i,quote:'Standup'}],createdAt:1,updatedAt:2},
   {id:'t'+i,kind:'task',provider:'gmail',status:'open',title:'Confirm school pickup',context:'Ms. Alvarez needs an answer by Thursday.',attentionReason:'A reply is expected',sources:[{provider:'gmail',id:'ta'+i,quote:'Confirm'}],createdAt:1,updatedAt:2},
   {id:'u'+i,kind:'update',provider:'gmail',status:'open',title:'Airline refund cleared',context:'$412 back on the card ending 6411.',sources:[{provider:'gmail',id:'up'+i,quote:'Refund'}],createdAt:1,updatedAt:2}]);});
 await send({});
 await page.waitForFunction(()=>document.querySelectorAll<HTMLElement>('.world-matter').length>2);
 const panel=await page.evaluate(()=>{const l=document.querySelector<HTMLElement>('.world-task-list');return {scroll:l.scrollHeight,client:l.clientHeight,rows:l.querySelectorAll('.world-matter').length,groups:[...l.querySelectorAll('.world-task-group')].length,cut:[...l.querySelectorAll('.world-task-title,.world-task-objective')].some(e=>e.textContent.includes('\u2026')||e.scrollHeight>e.clientHeight+1)};});
 assert.ok(panel.scroll<=panel.client+1,'27 items and the panel still does not scroll: '+JSON.stringify(panel));
 const tallBacking=await page.locator('.world-task-list').boundingBox();
 assert.ok(tallBacking.height>shortBacking.height*2,'backing grows with the content');
 assert.ok(Math.abs(tallBacking.y+tallBacking.height/2-page.viewportSize().height/2)<2,'long Attention Center stays vertically centered');
 assert.equal(panel.cut,false,'copy written to the contract fits the row it is given, uncut');
 assert.equal(panel.groups,3,'every kind keeps a place; one kind does not crowd the others out');
 assert.ok(panel.rows>=3&&panel.rows<27,'the panel holds what fits and drops the rest: '+JSON.stringify(panel));
 assert.deepEqual(await tracker.locator('.world-task-heading').allInnerTexts(),['COMING UP','WORTH DOING','WORTH KNOWING'],'the groups are named the way a person would say them');
 const headingColours=await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.world-task-heading')].map(h=>getComputedStyle(h).color));
 assert.deepEqual(headingColours,['rgb(165, 212, 220)','rgb(237, 196, 125)','rgb(177, 211, 171)'],'each section name carries the same semantic colour as its items');
 // The time beside a title must not change how much room the title gets. A clock
 // reading 10:17 PM is wider than 4:17 AM, and a title at the authored limit used
 // to fit at one hour and be cut at the other: a limit that depends on the time of
 // day is not a limit. Both readings are rendered here, whatever hour it is now.
 const budgets=[];
 for(const hour of [4,22]){
  await page.evaluate(h=>{const d=new Date();d.setDate(d.getDate()+2);d.setHours(h,17,0,0);
   fixture.worldItems=[{id:'clock',kind:'event',provider:'google-calendar',status:'open',title:'Renew the parking permit',context:'Short.',start:d.toISOString(),sources:[{provider:'google-calendar',id:'c',quote:'q'}],createdAt:1,updatedAt:2}];
   fixture.revision++;fixture.activityRevision++;return worldletReceive(processed(fixture));},hour);
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-task-title')?.innerText.trim()==='Renew the parking permit');
  budgets.push(await page.evaluate(()=>{const t=document.querySelector<HTMLElement>('.world-task-title');
   return {width:t.clientWidth,cut:t.scrollHeight>t.clientHeight+1,clock:document.querySelector<HTMLElement>('.world-task-time')?.title};}));
 }
 assert.deepEqual(budgets.map(b=>b.cut),[false,false],'a title at the authored limit is cut: '+JSON.stringify(budgets));

 // A distant event's marker still belongs to its title, and the day leads the line under it.
 const row=await page.evaluate(()=>{const r=document.querySelector<HTMLElement>('.world-matter');
  const i=r.querySelector('.matter-icon').getBoundingClientRect(),t=r.querySelector('.world-task-title').getBoundingClientRect();
  const when=r.querySelector('.world-task-time'),o=r.querySelector('.world-task-objective');
  return {drift:Math.abs((i.y+i.height/2)-(t.y+t.height/2)),
   whenUnder:when?when.getBoundingClientRect().top>=t.bottom-1:null,
   whenLeads:when?o.firstElementChild===when:null,
   contextAlpha:o?Number(getComputedStyle(o).opacity):1};});
 assert.ok(row.drift<1.5,'the mark and its title do not share a centre line: '+JSON.stringify(row));
 assert.equal(row.whenUnder,true,'the day must sit under the title: '+JSON.stringify(row));
 assert.equal(row.whenLeads,true,'the day must lead the key facts: '+JSON.stringify(row));
 assert.ok(row.contextAlpha<.85,'the context is as loud as the title it explains: '+row.contextAlpha);

 // A title at the limit, four words and 24 characters, still takes one line;
 // a context at 64 characters still takes two. The contract is what the row can hold.
 await page.evaluate(()=>{const soon=n=>new Date(Date.now()+n).toISOString();
  fixture.worldItems=[{id:'max-e',kind:'event',provider:'google-calendar',status:'open',title:'Renew the parking permit',context:'The city stops accepting the old form at the end of next Friday.',start:soon(26*3600000),sources:[{provider:'google-calendar',id:'me',quote:'q'}],createdAt:1,updatedAt:2},
   {id:'max-t',kind:'task',provider:'gmail',status:'open',title:'Withdraw the warehouse bid',context:'The warehouse manager wants a written answer before Wednesday.',attentionReason:'r',sources:[{provider:'gmail',id:'mt',quote:'q'}],createdAt:1,updatedAt:2}];});
 await send({});
 await page.waitForFunction(()=>document.querySelectorAll<HTMLElement>('.world-matter').length===2);
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.world-matter')].map(r=>{
  const t=r.querySelector('.world-task-title'),c=r.querySelector('.world-task-objective');
  return [Math.round(t.scrollHeight/Math.round(parseFloat(getComputedStyle(t).lineHeight))),Math.round(c.scrollHeight/Math.round(parseFloat(getComputedStyle(c).lineHeight))),t.scrollHeight>t.clientHeight+1||c.scrollHeight>c.clientHeight+1];
 })),[[1,3,false],[1,2,false]],'copy at the limit is one line of title and two of context (plus the time leading it, #1281), uncut');
 // Fox is told what the world is right now -- the time, the sky, the sound --
 // because these are a handful of characters and constantly what a question turns
 // on. History is the opposite and stays behind read_world_history.
 await page.evaluate(()=>{window.calls.length=0;
  window.audio={ambience:{state:'playing',track:'Ocean Shore',trackID:'ocean',volume:.2},music:{state:'stopped'}};
  window.dispatchEvent(new CustomEvent('worldlet:audio',{detail:structuredClone(window.audio)}));});
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('what is playing');
 await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>window.calls?.some(s=>s.action==='agentChat'),null,{timeout:8000});
 const told=await page.evaluate(()=>window.calls.find(s=>s.action==='agentChat').context);
 assert.match(told.now||'','/^\\w{3}, \\w{3} \\d/'.slice(1,-1)&&/\w{3}, \w{3} \d/,'Fox is told the time a person would read');
 assert.ok(!Number.isNaN(Date.parse(told.instant||'')),'and the instant a machine can compare: '+told.instant);
 assert.equal(told.sound,'Ocean Shore playing','Fox is told what is sounding, by name');
 assert.equal('weather' in told,false,'an unset weather button is a thing to click, not a forecast to repeat');
 // State, not contents: how many things are waiting, never what they say.
 assert.match(told.waiting||'',/\d+ (coming up|do something|worth knowing)/,'Fox is told what the panel is holding: '+told.waiting);
 const said=JSON.stringify(told);
 for(const secret of ['Dentist','Bring the referral letter','Confirm school pickup'])
  assert.ok(!said.includes(secret),'the world state recited an item instead of counting it: '+secret);

 assert.deepEqual(errors,[]);
 console.log('PASS world refresh: Applet activity and saved items update in place; scene and camera stay; the Attention Center keeps its size, shows only what it holds, times its events and names no Applets; Fox is told the time, the sky and the sound in the air.');
});
