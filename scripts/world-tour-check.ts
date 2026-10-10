// The guided tour after first arrival (ui/onboarding/world-tour.ts): Fox says hello and introduces
// itself from where it always stands (no hop to the middle, owner feedback 2026-10-04) (and take a new name), shows an Applet at work,
// then boxes the Attention Center; once first value is over, the tour's last step offers Fox on the phone (owner request 2026-10-06). Esc does nothing: a click anywhere (blank space included), Enter
// or → moves a step that only tells, and nothing beneath responds, also between steps (the lock).
// The Tutorial switch in the World's bottom-right corner (owner Order 2026-10-07; bottom-right since 2026-10-10) is on while the tour runs; turning it
// off ends the first run, and it stays in the corner, off, to turn the tour on again. Mail that
// still needs signing in is boxed and waits for Connect Mail in Fox's bubble (or Not now, which moves on). Visiting a place lifts
// the spotlight and resumes the same step on return. The tour hands over to first value, which
// boxes the item for the person to click.
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {launchTestBrowser} from './browser-test.ts';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const browser=await launchTestBrowser({args:['--allow-file-access-from-files']});
type Box={x:number;y:number;width:number;height:number};
const contains=(outer:Box|null,inner:Box|null)=>!!outer&&!!inner&&outer.x<=inner.x+1&&outer.y<=inner.y+1&&outer.x+outer.width>=inner.x+inner.width-1&&outer.y+outer.height>=inner.y+inner.height-1;
async function open(connections:any[],journeyStage='world-tour',viewport={width:1372,height:895},proposals:any[]=[],clock=false){
 const page=await browser.newPage({viewport,reducedMotion:'reduce'});
 // A page that waits out the minutes before the phone step runs on a clock the check can move forward.
 if(clock)await page.clock.install();
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(([connections,journeyStage,proposals])=>{const w=window as any;w.calls=[];
  w.fixture={workspaceId:'tour',revision:1,activityRevision:0,sources:[],knowledge:[],connections,worldItems:[],onboarding:{completed:true,journeyStage,unlockedApplets:['app-gmail','app-browser']},sampleEnabled:false};
  w.proposals=proposals;
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);if(b.action==='snapshot')return structuredClone(w.fixture);if(b.action==='ongoing'&&b.operation==='list')return {proposals:w.proposals,kept:[]};if(b.action==='ongoing'&&['later','decline'].includes(b.operation)){w.proposals=w.proposals.filter(p=>p.id!==b.id);return {ok:true};}if(b.action==='agentChat'&&/read_companion_archive/.test(b.text||'')){if(!w.makeFails)await w.worldletAgentTool(b.id,{id:'t1',name:'show_artifact',args:{title:'Eating well this autumn',body:'Lunches are steady.\n\n## Next\nKeep the salmon bowl.',chart:null,size:'large',actions:[]}});return {message:w.makeFails?'I could not read them.':'Here is your page.'};}if(b.action==='phonePair'){if(b.operation==='start')w.pairing={state:'waiting',link:'worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac'};if(b.operation==='end')w.pairing={state:'none'};return w.pairing||{state:'none'};}if(b.action==='onboarding'&&b.operation==='journey'){if(typeof b.itemId==='string'&&!(w.fixture.worldItems||[]).some(item=>item.id===b.itemId))throw Error('This attention item is no longer available.');Object.assign(w.fixture.onboarding,{journeyStage:b.stage,journeyItemId:b.itemId});return {ok:true};}if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};},[connections,journeyStage,proposals] as const);
 await page.goto(pathToFileURL(path.resolve('dist/WorldletWeb/index.html')).href);
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl');
 return {page,errors};
}
const root=(page:Page,key:string)=>page.evaluate(key=>document.querySelector<HTMLElement>('#notionWorld').dataset[key],key);
const step=(page:Page)=>root(page,'tourStep');
const waitStep=(page:Page,key:string)=>page.waitForFunction(key=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourStep===key,key,{timeout:20000});
const ring=(page:Page)=>page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)').boundingBox();
// Fox, its ears, its bubble and the bubble's name tag share one softly lit area.
const guide=(page:Page)=>page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring.is-guide').boundingBox();
const depth=(page:Page)=>root(page,'depth');
// The Tutorial switch in the World's corner: the tour's own copy, on, while the tour runs; the corner's own, off, after.
const SWITCH='.tour-switch:visible, .world-tutorial:visible';
const tutorialSwitch=(page:Page)=>page.locator(SWITCH).first();
// Exactly one switch shows; if that never holds, say what both were doing over a few frames.
async function settled(page:Page){
 const one=()=>{const shown=(e:Element|null)=>!!e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';return shown(document.querySelector('.tour-switch'))!==shown(document.querySelector('.world-tutorial'));};
 try{await page.waitForFunction(one,null,{timeout:10000});}catch{
  const frames=await page.evaluate(()=>new Promise(done=>{const out:any[]=[];const look=()=>{const at=(e:Element|null)=>e&&{hidden:(e as HTMLElement).hidden,rect:(({x,y,width,height})=>[x,y,width,height].map(Math.round).join(","))(e.getBoundingClientRect()),visibility:getComputedStyle(e).visibility,display:getComputedStyle(e).display};
   const w=document.querySelector<HTMLElement>('#notionWorld')!;out.push({tour:at(document.querySelector('.tour-switch')),tours:document.querySelectorAll('.tour-switch').length,corner:at(document.querySelector('.world-tutorial')),data:{...w.dataset}});if(out.length<6)requestAnimationFrame(look);else done(out);};look();}));
  throw new Error('the Tutorial switch never settled to one: '+JSON.stringify(frames));
 }
}
async function tutorialOn(page:Page){await settled(page);return await tutorialSwitch(page).getAttribute('aria-checked')==='true';}
async function turn(page:Page,on:boolean){assert.equal(await tutorialOn(page),!on,'the Tutorial switch is '+(on?'off':'on')+' before turning it '+(on?'on':'off'));await tutorialSwitch(page).click();}
try{
 {
  const {page,errors}=await open([{provider:'gmail',connected:true,running:true}],undefined,undefined,undefined,true);
  const dialogue=page.locator('#companionDialogue');
  // 1. Hello: Fox stays where it always stands, the World dims, nothing is boxed.
  await waitStep(page,'hello');
  assert.match(await dialogue.innerText(),/Welcome! This is your World\. Everything you have can live here now\./);
  assert.equal(await root(page,'tourFox'),undefined,'Fox does not hop to the middle');
  assert.equal(await page.locator('.tour-spotlight:not([hidden])').count(),1,'the spotlight covers the World');
  assert.equal(await page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)').isVisible(),false,'hello boxes nothing but Fox');
  // The Tutorial switch, on, stands in the World's bottom-right corner above the spotlight, over the corner's own;
  // nothing else offers a way out, and Settings beside Fox steps aside.
  const skip=page.locator('.tour-switch');
  await skip.waitFor({state:'visible',timeout:5000});
  assert.equal(await page.getByRole('button',{name:/^Skip/}).count(),0,'no other Skip');
  assert.equal(await page.locator('.companion-side .companion-panel-button').isVisible()&&await page.locator('.companion-side .companion-panel-button').evaluate(e=>getComputedStyle(e).visibility!=='hidden'),false,'Settings steps aside during the tour');
  {const [s,c]=[await skip.boundingBox(),await page.locator('.world-tutorial').boundingBox()];
   assert.ok(s.x+s.width>1372*.75&&s.y>895*.75,'the switch sits in the bottom-right corner '+JSON.stringify(s));
   assert.ok(c&&Math.abs(c.x+c.width-(s.x+s.width))<=2&&Math.abs(c.y+c.height/2-(s.y+s.height/2))<=2,'over the corner\'s own switch '+JSON.stringify({s,c}));
   const top=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.tour-switch')!==null,{x:s.x+s.width/2,y:s.y+s.height/2});
   assert.ok(top,'the switch takes clicks above the spotlight');}
  assert.equal(await tutorialOn(page),true,'during the tour the Tutorial switch is on');
  assert.equal(await skip.getAttribute('role'),'switch');
  // Choices in Fox's bubble are underlined words, never filled buttons (owner feedback 2026-10-06).
  assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).getAttribute('class'),'world-tour-primary');
  {const look=await page.getByRole('button',{name:'Continue',exact:true}).evaluate(b=>{const c=getComputedStyle(b);return {line:c.textDecorationLine,background:c.backgroundColor,image:c.backgroundImage};});
   assert.ok(look.line.includes('underline')&&/rgba\(0, 0, 0, 0\)|transparent/.test(look.background)&&look.image==='none','Continue is an underlined word: '+JSON.stringify(look));}
  assert.equal(await step(page),'hello','looking at the switch leaves the tour where it was');
  // Fox stays in its place through the hello, and its bubble is on screen.
  await page.waitForTimeout(900);
  const [foxBox,bubbleBox]=[await page.locator('.companion-avatar').boundingBox(),await page.locator('#companionDialogue').boundingBox()];
  assert.ok(bubbleBox.y>=0&&bubbleBox.y+bubbleBox.height<=895,'the bubble is on screen: '+JSON.stringify(bubbleBox));
  // Nothing in the World lights up or names itself under the spotlight.
  const device=await page.evaluate(()=>{const root=document.querySelector<any>('#notionWorld'),c=root.querySelector('canvas[data-renderer="pixi-webgl"]').getBoundingClientRect(),m=root.sceneMetrics.modules.find(m=>m.visible!==false&&m.peekBounds&&m.id!=='app-gmail')||root.sceneMetrics.modules.find(m=>m.peekBounds);return {x:c.left+m.peekBounds.x+m.peekBounds.width/2,y:c.top+m.peekBounds.y+m.peekBounds.height/2};});
  await page.mouse.move(device.x-30,device.y-30);await page.mouse.move(device.x,device.y,{steps:5});await page.waitForTimeout(300);
  assert.equal(await page.locator('.applet-hover-name:not([hidden])').count(),0,'hovering a device under the spotlight shows no name');
  // Esc does not end the tour.
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  assert.equal(await step(page),'hello','Esc does not leave the tour');
  // A click on blank sky moves on; it reaches nothing beneath.
  await page.mouse.click(686,120);
  // 2. Fox, back in its circle: the box surrounds Fox and the bubble takes a new name.
  await waitStep(page,'fox');
  assert.equal(await root(page,'tourFox'),undefined,'Fox is still in its place');
  {const now=await page.locator('.companion-avatar').boundingBox();assert.ok(Math.abs(now.x-foxBox.x)<=2&&Math.abs(now.y-foxBox.y)<=2,'Fox said hello from the same place '+JSON.stringify({now,foxBox}));}
  assert.equal(await depth(page),'overview','a click never opens a place');
  assert.match(await dialogue.innerText(),/I’m Fox, your companion/);
  assert.ok(contains(await guide(page),await page.locator('.companion-avatar').boundingBox()),'the lit area surrounds Fox');
  assert.ok(contains(await guide(page),await page.locator('#companionDialogue').boundingBox()),'and its bubble');
  assert.equal(await page.locator('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)').isVisible(),false,'Fox needs no second box');
  {const look=(name:string)=>page.getByRole('button',{name,exact:true}).evaluate(b=>{const c=getComputedStyle(b);return {background:c.backgroundColor,colour:c.color};});
   const [main,quiet]=[await look('Continue'),await look('Change my name')];
   assert.equal(await page.getByRole('button',{name:'Change my name',exact:true}).getAttribute('class'),'world-tour-quiet');
   assert.equal(main.background,quiet.background,'neither choice is filled: '+JSON.stringify({main,quiet}));
   assert.notEqual(main.colour,quiet.colour,'the second choice is muted beside the main one: '+JSON.stringify({main,quiet}));}
  const typed=await page.evaluate(()=>{const input=document.querySelector<HTMLElement>('[aria-label="Message Fox"]:is(input,textarea)');input?.focus();return document.activeElement===input;});
  assert.equal(typed,false,'Fox\'s message input does not take focus during the tour');
  // Renaming is an action under the bubble; the name field shows only once it is chosen.
  assert.equal(await page.getByRole('textbox',{name:'Fox’s name'}).count(),0,'no name field until Change my name');
  await page.getByRole('button',{name:'Change my name',exact:true}).click();
  const name=page.getByRole('textbox',{name:'Fox’s name'});
  await name.fill('Rusty');
  await name.press('Enter');
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='foxPreferenceChange'&&c.setting==='companion_name'&&c.value==='Rusty'));
  // Saving returns to Fox's introduction under its new name; Continue moves on from there.
  await page.waitForFunction(()=>/I’m Rusty, your companion/.test(document.querySelector('#companionDialogue')?.textContent||''));
  assert.equal(await step(page),'fox','Save stays on Fox');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  // 3. Applets: Mail is boxed, and Fox points at its lights.
  await waitStep(page,'applets');
  assert.match(await dialogue.innerText(),/Mail/);
  assert.ok((await page.locator('#companionDialogue strong').allInnerTexts()).includes('Mail'),'the Applet\'s name is bold');
  const mail=await page.evaluate(()=>{const root=document.querySelector<any>('#notionWorld'),m=root.sceneMetrics.modules.find(m=>m.id==='app-gmail'),c=root.querySelector('canvas[data-renderer="pixi-webgl"]').getBoundingClientRect();return m&&m.visible!==false?{x:c.left+m.peekBounds.x,y:c.top+m.peekBounds.y,width:m.peekBounds.width,height:m.peekBounds.height}:null;});
  const applet=await ring(page);
  assert.ok(applet,'an Applet is boxed');
  if(mail)assert.ok(contains(applet,mail),'the box surrounds Mail '+JSON.stringify({applet,mail}));
  // Every choice is made at Fox, so Fox's lit area looks unlike the box around what Fox explains (owner request 2026-10-06).
  {const style=(selector:string)=>page.locator(selector).evaluate(e=>{const c=getComputedStyle(e);return {border:c.borderTopColor+' '+c.borderTopWidth,animation:c.animationName};});
   const [fox,target]=[await style('.tour-spotlight:not([hidden]) .tour-spotlight-ring.is-guide'),await style('.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)')];
   assert.notEqual(fox.border,target.border,'Fox\'s ring is not the target\'s halo: '+JSON.stringify({fox,target}));}
  // Clicking the boxed Applet does not open it while the step only tells.
  await page.mouse.click(applet.x+applet.width/2,applet.y+applet.height/2);
  // 4. The Attention Center, drawn and boxed before its first item.
  await waitStep(page,'attention');
  assert.equal(await depth(page),'overview','the boxed Applet does not open');
  const tracker=page.locator('.world-task-tracker');
  await tracker.waitFor({state:'visible'});
  assert.match(await tracker.evaluate(e=>e.textContent||''),/Coming Up.*Worth Doing.*Worth Knowing/s,'The empty Center names its groups');
  assert.ok(contains(await ring(page),await tracker.boundingBox()),'the box surrounds the Attention Center');
  assert.match(await dialogue.innerText(),/Attention Center.*Pick anything/s);
  // Typing goes nowhere and letters do not move on.
  await page.keyboard.type('xyz');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll<HTMLInputElement>('input,textarea')].some(e=>e.value.includes('xyz'))),false,'typing goes nowhere');
  assert.equal(await step(page),'attention','typing letters does not move on');
  // A snapshot that momentarily lacks the journey stage must not rewind the tour.
  await page.evaluate(()=>{const w=window as any;const blank=structuredClone(w.fixture);delete blank.onboarding.journeyStage;blank.activityRevision=1;w.worldletReceive(blank);});
  await page.waitForTimeout(400);
  await page.evaluate(()=>{const w=window as any;w.fixture.activityRevision=2;w.worldletReceive(structuredClone(w.fixture));});
  await page.waitForTimeout(2500);
  assert.equal(await step(page),'attention','A transient snapshot does not restart the tour');
  // A place opened another way lifts the spotlight; back in the overview the same step returns.
  await page.evaluate(async()=>{const ui=(window as any).worldletUI;const work=ui.snapshot().targets.find(t=>t.kind==='region'&&/work/i.test(t.label+t.id));await ui.dispatch({version:1,action:'activate',id:work.id});});
  await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').dataset.depth!=='overview',null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight===undefined,null,{timeout:10000});
  await page.evaluate(()=>(window as any).worldletUI.dispatch({version:1,action:'overview'}));
  await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').dataset.depth==='overview');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight==='true'&&/Attention Center/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:10000});
  assert.equal(await step(page),'attention','The tour resumes at the same step');
  // While what was connected is still being read the Center shows three hopping dots, no line of text (owner feedback 2026-10-06).
  assert.equal(await page.locator('.world-task-waiting.is-reading i').count(),3,'three dots while Mail is read');
  assert.equal(await page.locator('.world-task-waiting.is-reading').innerText(),'','no reading line');
  assert.equal(await page.locator('.world-task-waiting.is-reading').getAttribute('aria-label'),'Reading what you connected');
  // The first item arrives; Continue hands over to first value, which boxes the item to click.
  await page.evaluate(()=>{const w=window as any;w.fixture.worldItems=[{id:'tour-item',provider:'gmail',kind:'task',status:'open',priority:'high',title:'Reply to Sam',reason:'Sam asked for a date',summary:'Sam asked when the fictional review can happen.',attentionContentVersion:1,policyVersion:2,sources:[{provider:'gmail',id:'tour-source',quote:'When works?'}]}];w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
  await page.locator('.world-task-tracker .world-matter').first().waitFor({timeout:10000});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='first-value'));
  await page.waitForFunction(()=>/I picked this one for you/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:20000});
  assert.equal(await page.locator('#companionDialogue strong').allInnerTexts().then(t=>t.join('|')),'Reply to Sam','only the item is bold');
  assert.equal(await page.getByRole('button',{name:'Show me',exact:true}).count(),1,'Fox offers Show me, not Do it for me');
  const row=page.locator('.world-matter[data-world-item-id="tour-item"]');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight==='true',null,{timeout:10000});
  await page.waitForTimeout(600);
  assert.ok(contains(await ring(page),await row.boundingBox()),'first value boxes the item for the person to click');
  // 5. A click elsewhere does nothing; a click on the boxed item opens its card.
  await page.mouse.click(686,120);await page.waitForTimeout(300);
  assert.equal(await page.locator('#attentionPreview:not([hidden])').count(),0,'a click away opens nothing');
  const foxBefore=await page.locator('.companion-avatar').boundingBox();
  await page.getByRole('button',{name:'Show me',exact:true}).click();
  await page.locator('#attentionPreview:not([hidden])').waitFor({timeout:10000});
  // 6. The card opens in the middle, the box moves to it, and Fox asks to do it.
  await page.getByRole('button',{name:'Do it for me',exact:true}).waitFor({timeout:10000});
  assert.match(await dialogue.innerText(),/Can I do this for you/);
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='first-value-review'&&c.itemId==='tour-item')),true);
  await page.waitForTimeout(600);
  // The card is lit to its own edge, with no ring around it (#1617).
  const card=await page.locator('#attentionPreview').boundingBox(),hole=await page.locator('.tour-spotlight mask rect[fill="black"]').first().evaluate(r=>({x:+r.getAttribute('x'),y:+r.getAttribute('y'),width:+r.getAttribute('width'),height:+r.getAttribute('height')}));
  assert.ok(Math.abs(hole.x-card.x)<=1&&Math.abs(hole.y-card.y)<=1&&Math.abs(hole.width-card.width)<=1&&Math.abs(hole.height-card.height)<=1,'the card is lit to its edge '+JSON.stringify({hole,card}));
  assert.equal(await ring(page),null,'the card needs no ring');
  // Fox stays where it stands while the card is open: it no longer moves up under the card (owner feedback 2026-10-06).
  {const now=await page.locator('.companion-avatar').boundingBox();assert.ok(Math.abs(now.x-foxBefore.x)<=2&&Math.abs(now.y-foxBefore.y)<=2,'Fox does not move for the card '+JSON.stringify({now,foxBefore}));}
  assert.equal(await root(page,'tourFox'),undefined,'Fox is not lifted under the card');
  // The card's own Done takes clicks under the spotlight; Dismiss and Later wait (owner request 2026-10-04).
  const done=page.locator('#attentionPreview .attention-preview-action-primary');
  assert.equal(await done.innerText(),'Done');
  const reachable=await done.evaluate(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;});
  assert.ok(reachable,'the card\'s Done is not under the spotlight\'s catcher');
  assert.equal(await page.locator('#attentionPreview .attention-preview-action:not(.attention-preview-action-primary)').evaluateAll(list=>list.filter(b=>(b as HTMLElement).offsetParent).length),0,'Dismiss and Later are hidden during the tour');
  await done.click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&c.itemId==='tour-item'),null,{timeout:10000});
  await page.waitForFunction(()=>/first win/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:10000});
  // 8. The tour's last step (owner request 2026-10-06): Fox can be used on the phone too, a code to get the app, then the
  // pairing code; it waits for a choice. It never follows the first win's fireworks (owner feedback 2026-10-06): the World
  // is the person's first, and the phone comes a couple of minutes later, at a calm moment.
  await page.waitForTimeout(6000);
  assert.equal(await step(page),undefined,'no phone step right after the first win');
  await page.waitForFunction(()=>{const w=document.querySelector<HTMLElement>('#notionWorld');return w.dataset.tourLock===undefined&&w.dataset.tourSpotlight===undefined;},null,{timeout:5000});
  await page.clock.fastForward('02:05');
  await waitStep(page,'phone');
  assert.match(await dialogue.innerText(),/also use me on your phone/);
  assert.equal(await page.locator('.world-tour-phone-qr').getAttribute('aria-label'),'Code to get the Worldlet iPhone app');
  assert.ok(contains(await guide(page),await page.locator('.world-tour-phone-qr').boundingBox()),'the code is lit with Fox\'s bubble');
  assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.operation==='start')),'no pairing starts before it is asked for');
  assert.equal(await page.getByRole('button',{name:'Show pairing code',exact:true}).getAttribute('class'),'world-tour-primary');
  assert.equal(await page.getByRole('button',{name:'Not now',exact:true}).getAttribute('class'),'world-tour-quiet');
  await page.mouse.click(686,120);await page.waitForTimeout(400);
  assert.equal(await step(page),'phone','blank space does not skip the phone');
  await page.screenshot({path:'/tmp/worldlet-tour-phone.png'});
  await page.getByRole('button',{name:'Show pairing code',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.world-tour-phone-qr')?.getAttribute('aria-label')==='Pairing code for the Worldlet phone app',null,{timeout:10000});
  {const code=await page.locator('.world-tour-phone-qr svg').boundingBox();assert.ok(code&&code.width>=150&&Math.abs(code.width-code.height)<2,'the pairing code is square and large enough to scan');}
  await page.screenshot({path:'/tmp/worldlet-tour-phone-code.png'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:phone-status',{detail:{state:'paired',phone:{name:'Kelvin’s iPhone',version:'1.0'},seenAt:Date.now()}})));
  await page.waitForFunction(()=>/Kelvin’s iPhone is paired/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:10000});
  await page.screenshot({path:'/tmp/worldlet-tour-phone-paired.png'});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.waitForFunction(()=>{const w=document.querySelector<HTMLElement>('#notionWorld');return w.dataset.tourStep===undefined&&w.dataset.tourSpotlight===undefined&&w.dataset.tourLock===undefined;},null,{timeout:10000});
  assert.equal(await tutorialOn(page),false,'the first run is over once the phone step closes');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // Between spotlight steps the World stays locked; turning the switch off ends the first run, and it stays, off.
  const {page,errors}=await open([{provider:'gmail',connected:true,running:true}],'first-value');
  await page.waitForFunction(()=>/still reading/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:20000});
  // Fox stops boxing to wait out a busy turn: the lock alone keeps the World still.
  await page.evaluate(()=>{const s=document.querySelector('.tour-spotlight') as HTMLElement;s.hidden=true;delete document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight;});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourLock==='true',null,{timeout:5000});
  const target=await page.evaluate(()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight/3);return e?.className||'';});
  assert.equal(target,'tour-lock','the lock is on top of the World between steps');
  assert.equal(await page.evaluate(()=>{const input=document.querySelector<HTMLElement>('[aria-label="Message Fox"]:is(input,textarea)');input?.focus();return document.activeElement===input;}),false,'Fox\'s input stays locked');
  await turn(page,false);
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&!c.itemId),null,{timeout:5000});
  await page.waitForFunction(()=>[...document.querySelectorAll('.tour-coach:not([hidden])')].some(n=>/Turn the tutorial back on here/.test(n.textContent||'')),null,{timeout:5000});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourLock===undefined&&document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight===undefined,null,{timeout:5000});
  assert.equal(await page.locator('.tour-switch').isVisible(),false,'the tour\'s switch goes once skipped');
  assert.equal(await tutorialOn(page),false,'the corner\'s switch stays, off');
  // A snapshot from before the skip was saved does not bring the tour back.
  await page.evaluate(()=>{const w=window as any;const old=structuredClone(w.fixture);old.onboarding.journeyStage='first-value';old.activityRevision=9;w.worldletReceive(old);});
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight),undefined,'a stale snapshot does not restart the tour');
  // Turning the switch on reopens it.
  await turn(page,true);
  await waitStep(page,'hello');
  await turn(page,false);
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourStep===undefined,null,{timeout:10000});
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // A brought Agent with no item yet: Fox starts with what the person keeps talking about with it, and the artifact
  // Fox makes from those conversations is the first win (owner requests 2026-10-06 and 2026-10-07: an artifact with a
  // subject, not one conversation made into an Applet).
  const thing={id:'job-a1b2c3d4e5f6',source:'openclaw',session:'OpenClaw · Discord · #diet-and-health',title:'#diet-and-health',where:'OpenClaw · Discord',state:'proposed',proposedAt:Date.now()/1000,decidedAt:null,laterUntil:null,turns:80,userTurns:40,first:'2026-09-01T00:00:00Z',last:new Date(Date.now()-86_400_000).toISOString()};
  const {page,errors}=await open([],'first-value',undefined,[thing]);
  await page.getByRole('button',{name:'Show me',exact:true}).waitFor({timeout:20000});
  assert.match(await page.locator('#companionDialogue').innerText(),/what you eat/);
  assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight),'true','the theme is boxed');
  assert.match(await page.locator('.world-ongoing[data-ongoing=food]').innerText(),/What you eat, on one page/);
  await page.getByRole('button',{name:'Show me',exact:true}).click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='agentChat'&&/#diet-and-health/.test(c.text)),null,{timeout:5000});
  await page.locator('#foxArtifact',{hasText:'Eating well this autumn'}).waitFor({timeout:10000});
  assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='ongoing'&&c.operation==='keep')),'no Applet is made');
  // The artifact is not an Attention item: the finished journey names no item, as the host refuses one it does not
  // hold (Order 2026-10-07: “Your progress could not be saved” after the first win).
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&!('itemId' in c)),null,{timeout:5000});
  await page.waitForFunction(()=>/first win/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:10000});
  assert.ok(!/could not be saved/.test(await page.locator('#companionDialogue').innerText()),'the first win is saved');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // Fox could not make the page: the tour ends and the World is free, without a first win.
  const thing={id:'job-a1b2c3d4e5f7',source:'openclaw',session:'OpenClaw · Discord · #gym',title:'#gym',where:'OpenClaw · Discord',state:'proposed',proposedAt:Date.now()/1000,decidedAt:null,laterUntil:null,turns:80,userTurns:40,first:'2026-09-01T00:00:00Z',last:new Date(Date.now()-86_400_000).toISOString()};
  const {page,errors}=await open([],'first-value',undefined,[thing]);
  await page.evaluate(()=>{(window as any).makeFails=true;});
  await page.getByRole('button',{name:'Show me',exact:true}).click({timeout:20000});
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&!('itemId' in c)),null,{timeout:10000});
  await page.waitForFunction(()=>/yours to explore/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:5000});
  assert.ok(!/first win/.test(await page.locator('#companionDialogue').innerText()));
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // Nothing connected and nothing brought: the tour ends after a short wait and the World is free, not locked
  // until an item arrives (owner request 2026-10-06).
  const {page,errors}=await open([],'first-value');
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&!c.itemId),null,{timeout:25000});
  await page.waitForFunction(()=>/yours to explore/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:5000});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourLock===undefined&&document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight===undefined,null,{timeout:5000});
  // The phone closes the tour here too, and turning the switch off closes it.
  await waitStep(page,'phone');
  await turn(page,false);
  await page.waitForFunction(()=>{const w=document.querySelector<HTMLElement>('#notionWorld');return w.dataset.tourStep===undefined&&w.dataset.tourSpotlight===undefined;},null,{timeout:5000});
  assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.operation!=='status')),'skipping the phone asks the host for nothing');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // Mail that is not connected: Fox offers Connect Mail or Not now in its bubble, and blank space waits. Not now moves
  // on, and with nothing connected Fox never waits on an empty Attention Center (owner request 2026-10-06).
  const {page,errors}=await open([]);
  await waitStep(page,'hello');
  await page.mouse.click(686,120);
  await waitStep(page,'fox');
  await page.keyboard.press('Enter');
  await waitStep(page,'applets');
  await page.waitForFunction(()=>/isn’t connected yet\. Connect Mail/.test(document.querySelector('#companionDialogue')?.textContent||''),null,{timeout:10000});
  assert.equal(await page.getByRole('button',{name:'Connect Mail',exact:true}).getAttribute('class'),'world-tour-primary');
  assert.equal(await page.getByRole('button',{name:'Not now',exact:true}).getAttribute('class'),'world-tour-quiet');
  await page.mouse.click(686,120);await page.waitForTimeout(400);
  assert.equal(await step(page),'applets','blank space does not skip signing in');
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='foxPreferenceChange')),false,'an unchanged name is not saved');
  // Connect Mail in the bubble goes straight to the sign-in from the World, without opening the Mail Applet (owner
  // feedback 2026-10-06); when the sign-in ends (here it does not finish) the step asks again.
  await page.getByRole('button',{name:'Connect Mail',exact:true}).click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='connect'&&c.provider==='gmail'),null,{timeout:10000});
  assert.equal(await depth(page),'overview','Connect Mail does not open the Mail Applet');
  await page.getByRole('button',{name:'Not now',exact:true}).waitFor({timeout:10000});
  assert.equal(await step(page),'applets','the step returns after the sign-in');
  assert.equal(await depth(page),'overview');
  // Not now keeps the choice with the person and moves on.
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  await waitStep(page,'attention');
  assert.match(await page.locator('#companionDialogue').innerText(),/fills up once your mail or calendar is connected/);
  // Nothing will arrive: first value does not wait on the Center, the tour ends and the phone closes it.
  await page.waitForTimeout(Math.max(0,18000-await page.evaluate(()=>performance.now())));
  const before=Date.now();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.stage==='finish'&&!c.itemId),null,{timeout:5000});
  assert.ok(Date.now()-before<4000,'Fox does not wait on an empty Attention Center');
  assert.equal(await page.evaluate(()=>/still reading|Give me a moment/.test(document.querySelector('#companionDialogue')?.textContent||'')),false,'no waiting message');
  await waitStep(page,'phone');
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  await page.waitForFunction(()=>{const w=document.querySelector<HTMLElement>('#notionWorld');return w.dataset.tourStep===undefined&&w.dataset.tourSpotlight===undefined&&w.dataset.tourLock===undefined;},null,{timeout:10000});
  assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.operation!=='status')),'skipping the phone asks the host for nothing');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 // Replay (#1327): after the first run (completed, or left at first value's end), the Tutorial button
 // shows the same tour again without touching the journey, setup or connections.
 for(const [label,viewport] of [['wide',{width:1372,height:895}],['narrow',{width:760,height:640}]] as const){
  const {page,errors}=await open([],'finish',viewport);
  const entry=page.locator('.world-tutorial');
  await entry.waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(2500);
  assert.equal(await step(page),undefined,label+': a finished journey does not restart the tour by itself');
  const before=await page.evaluate(()=>(window as any).calls.length);
  const focusFox=()=>page.evaluate(()=>{const input=document.querySelector<HTMLElement>('[aria-label="Message Fox"]:is(input,textarea)');input?.focus();const ok=!!input&&document.activeElement===input;input?.blur();return ok;});
  const focusable=await focusFox();
  // The keyboard reaches the corner's switch; while the tour runs it is on, so no second one starts.
  assert.equal(await entry.getAttribute('aria-checked'),'false',label+': the switch is off after the first run');
  {const c=await entry.boundingBox();assert.ok(c&&c.x+c.width>viewport.width*.6&&c.y+c.height>viewport.height*.6,label+': the switch is in the bottom-right corner '+JSON.stringify(c));}
  await entry.focus();await page.keyboard.press('Enter');
  await waitStep(page,'hello');
  assert.equal(await root(page,'tourReplay'),'true');
  assert.equal(await tutorialOn(page),true,label+': one tour at a time, and a replay can be turned off');
  assert.equal(await page.locator('.tour-spotlight:not([hidden])').count(),1,label+': one tour, one spotlight');
  await page.mouse.click(Math.round(viewport.width/2),60);
  await waitStep(page,'fox');
  await page.keyboard.press('Enter');
  // A replay never asks to sign in: Mail (not connected) is only told about.
  await waitStep(page,'applets');
  assert.doesNotMatch(await page.locator('#companionDialogue').innerText(),/Connect Mail/,label+': no sign-in in a replay');
  assert.equal(await page.getByRole('button',{name:'Connect Mail',exact:true}).count(),0,label+': no Connect Mail in a replay');
  await page.keyboard.press('Enter');
  await waitStep(page,'attention');
  await page.keyboard.press('Enter');
  // The phone, last in a replay too, only tells.
  await waitStep(page,'phone');
  assert.equal(await page.locator('.world-tour-phone-qr').count(),0,label+': no codes in a replay');
  // Esc leaves, the spotlight goes and input works again.
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourStep===undefined&&document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight===undefined,null,{timeout:10000});
  assert.equal(await focusFox(),focusable,label+': Fox\'s input takes focus again after Esc, as before the replay');
  // Close and reopen: it starts from hello again, and Skip ends it the same way.
  await turn(page,true);
  await waitStep(page,'hello');
  await turn(page,false);
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourSpotlight===undefined,null,{timeout:10000});
  // Played through to the end: the journey is left as it was.
  await turn(page,true);
  await waitStep(page,'hello');
  for(const key of ['fox','applets','attention','phone']){await page.getByRole('button',{name:'Continue',exact:true}).click();await waitStep(page,key);}
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.tourStep===undefined,null,{timeout:10000});
  const calls=await page.evaluate(n=>(window as any).calls.slice(n).map(c=>c.action),before);
  assert.equal(calls.includes('onboarding'),false,label+': a replay never moves the journey: '+calls.join(','));
  assert.equal(calls.includes('connect'),false,label+': a replay starts no sign-in');
  assert.equal(await page.evaluate(()=>(window as any).fixture.onboarding.journeyStage),'finish');
  assert.equal(await page.locator('.tour-spotlight:not([hidden])').count(),0);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 {
  // While the first run is on, the switch is on: no second tour.
  const {page}=await open([{provider:'gmail',connected:true,running:true}]);
  await waitStep(page,'hello');
  assert.equal(await tutorialOn(page),true,'the switch is on during the first run');
  await page.close();
 }
 console.log('PASS world tour replay: the Tutorial switch in the World\'s bottom-right corner replays the tour for finished journeys by pointer or keyboard, one at a time, and turning it off or Esc ends it, no sign-in and no journey change, wide and narrow');
 console.log('PASS world tour: Fox says hello where it stands (no hop to the middle), takes a new name, boxes Mail (offering Connect Mail, which signs in from the World, or Not now in its bubble when it is not connected) and the Attention Center, and closes with the phone a couple of minutes after the first win; Fox never moves for the card; with nothing connected Fox never waits on the Center; choices are underlined words, second ones muted; Fox\'s ring differs from the target\'s halo; the Tutorial switch in the World\'s top-right corner, turned off, ends it and stays there, off, the World stays locked between steps, the card’s own Done works; no Esc, a click anywhere, Enter or → moves a telling step and nothing beneath responds; a transient snapshot never rewinds it; visiting a place resumes the same step; first value boxes the item, Show me or a click on it opens the card and the box moves to it; a theme of a brought Agent\'s conversations is the first value when no item waits, and the artifact Fox makes of it the first win, and with nothing at all the tour ends and frees the World; renaming is a Change my name action; only key words are bold');
}finally{await browser.close();}
