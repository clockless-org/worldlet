import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  window.calls=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(body){
   window.calls.push(body);
   if(body.action==='snapshot')return {workspaceId:'history-check',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(body.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(body.action==='browserCommand'&&body.operation==='endTyping')return {typing:(window as any).pageTyping===true&&!((window as any).pageTyping=false)};
   if(body.action==='browserCommand'&&body.operation==='history')return {items:[{title:'Sage linen shirt',url:'https://shop.example.com/products/linen?color=green',visitedAt:'2026-09-10T12:00:00Z',text:'Green linen shirt'}]};
   if(body.action==='agentChat'){
    const found=await window.worldletAgentTool(body.id,{id:'history',name:'browse_web',args:{operation:'history',query:'衣服 shirt',after:'2026-09-07',before:'2026-09-14'}});
    if(!found.items?.length)throw Error('History unavailable');
    const opened=await window.worldletAgentTool(body.id,{id:'reopen',name:'browse_web',args:{operation:'open',url:found.items[0].url}});
    if(!opened.ok)throw Error('Could not reopen');
    return {message:'Here is the green linen shirt you visited last week.'};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('#notionInput').click();
 await page.locator('#notionInput').fill('打开我上周看过的绿色衣服');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>window.calls.some(c=>c.action==='browserCommand'&&c.operation==='open'));
 const calls=await page.evaluate(()=>window.calls),search=calls.find(c=>c.action==='browserCommand'&&c.operation==='history');
 assert.deepEqual(search.args,{query:'衣服 shirt',after:'2026-09-07',before:'2026-09-14',offset:0});
 assert.equal(calls.find(c=>c.action==='browserCommand'&&c.operation==='open').args.url,'https://shop.example.com/products/linen?color=green');
 // Fox's page opens where the person is, not in the Browser Applet (owner request 2026-10-06).
 assert.equal(await page.locator('#notionContent').getAttribute('data-applet'),'web');
 assert.notEqual(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.page),'app-browser');
 assert.equal(await page.locator('#notionContent .notion-reader-head h1').textContent(),'shop.example.com','the page names its site, not Browser');
 assert.ok(calls.some(c=>c.action==='browserShow'&&c.platform==='web'));
 assert.equal(calls.find(c=>c.action==='browserShow').url,'https://shop.example.com/products/linen?color=green','The first native navigation goes directly to the target, never Google');
 const failure='Hermes stopped before completing the task. Try again.';
 await page.evaluate(message=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'error',message}})),failure);
 assert.equal(await page.locator('.browser-caption').textContent(),'','Applet browser must not repeat backend errors in its top-left corner');
 assert.ok(!(await page.locator('#notionContent').textContent()).includes(failure));
 // Fox says it in its one card; there is no second bubble over Fox's head.
 await page.locator('#companionDialogue',{hasText:failure}).waitFor();assert.equal(await page.locator('.companion-head-status').count(),0);
 let popups=0;page.on('popup',()=>popups++);
 await page.evaluate(()=>{const a=document.createElement('a');a.href='https://example.com/original';a.target='_blank';a.textContent='Original';document.querySelector<HTMLElement>('#notionContent').append(a);a.click();});
 await page.waitForFunction(()=>window.calls.some(c=>c.action==='browserShow'&&c.url==='https://example.com/original'));
 assert.equal(popups,0,'World links must remain in the embedded browser');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url:'https://example.com/native'}})));
 await page.waitForFunction(()=>window.calls.some(c=>c.action==='browserShow'&&c.url==='https://example.com/native'));
 for(const width of [760,1280]){
  await page.setViewportSize({width,height:850});
  await page.waitForFunction(()=>{
   const panel=document.querySelector<HTMLElement>('#notionContent'),slot=panel.querySelector('.browser-viewport'),r=slot.getBoundingClientRect();
   const sent=window.calls.filter(c=>['browserShow','browserLayout'].includes(c.action)).at(-1)?.rect;
   return sent&&Math.abs(sent.x-r.x)<2&&Math.abs(sent.width-r.width)<2&&getComputedStyle(panel).animationName==='none'&&getComputedStyle(panel).transform==='none';
  });
 }
 // A URL opened from the overview opens over the World, never as the Browser Applet; Back returns to the overview.
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled);
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
 for(const via of ['native','fox-link']){
  await page.evaluate(via=>{
   if(via==='native')window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url:'https://example.com/from-world'}}));
   else {const a=document.createElement('a');a.href='https://example.com/fox';a.target='_blank';document.querySelector<HTMLElement>('#notionWorld').append(a);a.click();a.remove();}
  },via);
  await page.waitForFunction(()=>!document.querySelector<HTMLElement>('#notionContent').hidden&&document.querySelector<HTMLElement>('#notionContent').dataset.applet==='web');
  assert.notEqual(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.page),'app-browser');
  await page.waitForFunction(url=>window.calls.some(c=>c.action==='browserShow'&&c.url===url),via==='native'?'https://example.com/from-world':'https://example.com/fox');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled);
  const hides=await page.evaluate(()=>window.calls.filter(c=>c.action==='browserHide').length);
  await page.locator('#notionBack').click();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
  await page.waitForFunction(n=>window.calls.filter(c=>c.action==='browserHide').length>n,hides);
  assert.notEqual(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.page),'app-browser','Back returns where the page was opened, not to the Browser');
 }
 // Only the Browser's own entry is the Browser Applet: its last page, with Home beside Refresh.
 const shows=await page.evaluate(()=>window.calls.filter(c=>c.action==='browserShow').length);
 await page.evaluate(()=>{location.hash='object=app-browser';});
 await page.locator('#notionContent[data-applet=browser]').waitFor();
 await page.waitForFunction(n=>window.calls.filter(c=>c.action==='browserShow').length>n,shows);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='browserShow').at(-1).url),'https://www.google.com/','pages opened elsewhere never become the Browser’s page');
 // Home in the toolbar is ready only once the page has left its home page, and takes the page itself there (owner request 2026-10-07).
 const pageAt=(url:string)=>page.evaluate(url=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'page',platform:'web',loading:false,url,title:'Google'}})),url);
 await pageAt('https://www.google.com/');
 assert.equal(await page.locator('.browser-home').isDisabled(),true,'Home rests on the home page');
 await pageAt('https://www.google.com/search?q=worldlet');
 await page.locator('.browser-home:not([disabled])').click();
 await page.waitForFunction(()=>window.calls.some(c=>c.action==='browserCommand'&&c.operation==='open'&&c.args?.url==='https://www.google.com/'));
 await pageAt('https://www.google.com/#home');
 await page.locator('.browser-home[disabled]').waitFor({state:'attached'});
 // Fox's panel (Settings) opens over the page: the native page, drawn over the World, puts itself away
 // meanwhile and comes back when the panel closes (owner report 2026-10-07: Settings stood behind it).
 const hidesBefore=await page.evaluate(()=>window.calls.filter(c=>c.action==='browserHide').length);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings'}})));
 await page.waitForFunction(n=>window.calls.filter(c=>c.action==='browserHide').length>n,hidesBefore);
 const showsBefore=await page.evaluate(()=>window.calls.filter(c=>c.action==='browserShow').length);
 await page.keyboard.press('Escape');
 await page.waitForFunction(n=>window.calls.filter(c=>c.action==='browserShow').length>n,showsBefore);
 // Saved sign-ins (owner request 2026-10-07): a sign-in is saved without asking (owner 2026-10-08) and a notice says
 // so; on a site's sign-in form, a button per saved account fills it in. The password itself never comes this way.
 const browserEvent=(detail:object)=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail})),detail);
 await pageAt('https://play.pokemonshowdown.com/');
 await browserEvent({phase:'login-saved',site:'play.pokemonshowdown.com',username:'AshK',update:false});
 await page.getByText('Password saved for AshK on play.pokemonshowdown.com').waitFor();
 await browserEvent({phase:'login-fill',site:'play.pokemonshowdown.com',accounts:['AshK','Misty']});
 const fills=page.locator('.browser-login-fill:not([hidden]) button');
 assert.deepEqual(await fills.allTextContents(),['Fill in AshK','Fill in Misty']);
 await fills.first().click();
 await page.waitForFunction(()=>window.calls.some(c=>c.action==='browserCommand'&&c.operation==='loginFill'&&c.args?.username==='AshK'));
 await page.locator('.browser-login-fill[hidden]').waitFor({state:'attached'});
 // Another site's page drops a fill offer.
 await browserEvent({phase:'login-fill',site:'play.pokemonshowdown.com',accounts:['AshK']});
 await page.locator('.browser-login-fill:not([hidden])').waitFor();
 await pageAt('https://www.google.com/');
 await page.locator('.browser-login-fill[hidden]').waitFor({state:'attached'});
 await page.locator('.fox-action-left [data-slot=home]').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
 // Pixi handles pointertap on pointerup before the browser dispatches click.
 // Reproduce that ordering on the real canvas: opening must survive the click.
 await page.evaluate(()=>{
  const canvas=document.querySelector('#notionStage canvas');
  canvas.addEventListener('pointerup',()=>window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url:'https://example.com/same-gesture'}})),{once:true});
 });
 await page.mouse.click(1280*.96,850*.48);
 await page.waitForFunction(()=>window.calls.some(c=>c.action==='browserShow'&&c.url==='https://example.com/same-gesture'));
 assert.equal(await page.locator('#notionContent').isVisible(),true,'the opening gesture must not dismiss the new browser');
 await page.waitForTimeout(400);
 assert.equal(await page.locator('#notionContent').getAttribute('data-applet'),'web');
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.page),'','nor open the place under it over the page');
 // A tap on the World behind the page closes it, like Back.
 await page.mouse.click(1150,250);
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.page),'','the tap only closes the page');
 assert.equal(await page.locator('.region-shelf').count(),0,'no area panel is left over the World or the page');
 // The rest is the Browser Applet itself, entered from its own entry: its layout puts scenery at the right edge.
 await page.evaluate(()=>{location.hash='object=app-browser';});
 await page.locator('#notionContent[data-applet=browser]').waitFor();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.camera.settled);
 // While the person types, a scenery click only ends typing and the Applet stays (owner request 2026-10-06):
 // first in Fox's message bar, then in the website page, which keeps its own focus.
 await page.locator('#notionInput').focus();
 await page.mouse.click(1280*.96,850*.48);
 assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'notionInput','the click ends typing in the message bar');
 await page.waitForTimeout(400);
 assert.equal(await page.locator('#notionContent').isVisible(),true,'a scenery click while typing to Fox keeps the Applet');
 await page.evaluate(()=>{(window as any).pageTyping=true;window.dispatchEvent(new Event('focus'));});
 await page.mouse.click(1280*.96,850*.48);
 await page.waitForFunction(()=>(window as any).pageTyping===false);
 await page.waitForTimeout(400);
 assert.equal(await page.locator('#notionContent').isVisible(),true,'a scenery click while typing in the page keeps the Applet');
 // Inside an Applet a click on empty scenery acts as Back (owner request 2026-10-05).
 await page.mouse.click(1280*.96,850*.48);
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
 console.log('PASS opening gesture keeps Browser visible; a following scenery click leaves it like Back.');
 console.log('PASS URL links open over the World, not in the Browser Applet; Back returns there and unloads the native page; the Browser keeps its own page and Home.');
 console.log('PASS browser viewport remains aligned without entrance transforms at narrow and wide sizes.');
 console.log('PASS world links and native navigation route to the embedded browser without a popup.');
 console.log('PASS Fox dated history lookup → exact saved clothing URL → Worldlet Browser Focus, using the actual tool bridge.');
});
