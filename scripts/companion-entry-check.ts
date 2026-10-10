import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,openCompanionPanel,SETTINGS_BUTTON,waitForWorld} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.calls=[];w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return {workspaceId:'entry-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='agentChat'){w.turn=b.id;w.worldletAgentEvent(b.id,{type:'status',stage:'waiting'});await new Promise(resolve=>w.finish=resolve);return {message:'Done.'};}
  return {ok:true};
 }}}};});
 const url=worldUrl();await page.goto(url);await waitForWorld(page);
 const avatar=page.locator('.companion-avatar'),type=page.locator('#notionInput'),mic=page.locator('.companion-speech-button'),panel=page.locator('#companionInfo'),form=page.locator('#notionCommand');
 const typing=()=>page.evaluate(()=>(document.querySelector('.notion-world') as HTMLElement).dataset.entryExpanded==='true');
 // One bar under Fox (owner decision 2026-10-04): the field and Send; the microphone is its own round button on the bar's right (owner 2026-10-07).
 assert(await form.isVisible());assert.equal(await form.locator('.companion-speech-button').count(),0,'the microphone is not inside the bar');
 {const [m,b]=await Promise.all([mic.boundingBox(),form.boundingBox()]);assert(m.x>=b.x+b.width&&Math.abs((m.y+m.height/2)-(b.y+b.height/2))<4,'the microphone sits on the bar\'s right');}
 // At rest the bar is low-key: narrow, its name only (owner request 2026-10-05); pointing at it brings the microphone and Send.
 await page.mouse.move(5,5);await page.waitForTimeout(300);
 const quietWidth=(await form.boundingBox()).width;
 assert.equal(await page.locator('.companion-text-entry').getAttribute('data-quiet'),'true','the bar rests quiet');
 assert.equal(await type.getAttribute('placeholder'),'Message Fox');assert(await mic.isVisible()&&!await form.locator('#notionSend').isVisible(),'the microphone stays, no Send at rest');
 // Two sizes only (owner Order 2026-10-08): pointing at the bar brings the hint but keeps its size; focus makes it larger.
 await form.hover();await page.waitForTimeout(400);
 assert(await mic.isVisible());assert(!await form.locator('#notionSend').isVisible(),'no Send while there is nothing to send');
 assert.match(await type.getAttribute('placeholder'),/to type · hold to speak/);
 assert.equal((await form.boundingBox()).width,quietWidth,'pointing at the bar does not resize it');
 await type.click();await page.waitForTimeout(400);
 assert((await form.boundingBox()).width>quietWidth+100,'focus makes the bar larger');await page.keyboard.press('Escape');await page.mouse.move(5,5);await page.waitForTimeout(400);
 assert.equal((await form.boundingBox()).width,quietWidth,'and it returns to the small size');
 await form.hover();await page.waitForTimeout(400);
 await page.screenshot({path:'/tmp/companion-idle.png'});
 // Clicking Fox types, like the bar; the settings button on Fox's left opens the companion panel (owner feedback 2026-10-04).
 await avatar.click();assert(await typing(),'Clicking Fox starts typing');assert(!await panel.isVisible(),'Clicking Fox does not open the panel');await page.keyboard.press('Escape');assert(!await typing());
 {const s=await page.locator(SETTINGS_BUTTON).boundingBox(),f=await avatar.boundingBox();assert(s.x+s.width<=f.x+f.width/2&&s.width>44,'the settings button sits on Fox\'s left, with its name');
  assert.equal((await page.locator(SETTINGS_BUTTON).innerText()).trim(),'Settings','Settings shows its name beside its icon');}
 // Settings opens Settings directly, on its Settings tab, with no menu between (owner Order 2026-10-07). The
 // tutorial's switch lives in the World's top-right corner instead.
 await page.locator(SETTINGS_BUTTON).click();await panel.waitFor();
 assert.equal(await page.getByRole('menuitem').count(),0,'no menu between Settings and Settings');
 assert.equal(await panel.getByRole('tab',{name:'Settings',exact:true}).getAttribute('aria-selected'),'true','Settings lands on the Settings tab');
 assert.equal(await page.locator(SETTINGS_BUTTON).getAttribute('aria-haspopup'),null,'Settings opens no menu');
 await page.getByRole('button',{name:'Close companion panel'}).click();await panel.waitFor({state:'hidden'});
 // The Journal lives in the World's top-left corner, today's date at the head of the Attention Center; Fox keeps
 // only Settings beside it (owner request 2026-10-08).
 {assert.equal(await page.locator('.companion-side .fox-side-button').count(),1,'Settings is Fox\'s one side button');
  const journal=page.locator('.world-today-open'),j=await journal.boundingBox();
  assert(j&&j.x<200&&j.y<120,'the Journal is the top-left corner');
  assert.match(await journal.innerText(),/Journal/i,'it is named the Journal');
  const book=page.locator('#journalBook');await journal.click();await book.waitFor();assert(!await panel.isVisible(),'it opens the Journal, a book of its own');
  await page.getByRole('button',{name:'Close journal'}).click();await book.waitFor({state:'hidden'});}
 {const corner=page.locator('.world-environment .world-tutorial');assert.equal(await corner.getAttribute('aria-checked'),'false','the Tutorial switch is in the World\'s corner, off');}
 await openCompanionPanel(page,'Settings');await panel.waitFor();assert(!await typing());await panel.locator('[data-setting=troubleshoot]').click();await page.getByRole('button',{name:'Restart Fox',exact:true}).waitFor();assert.equal(await page.locator('.world-recovery-toggle').count(),0);
 await page.screenshot({path:'/tmp/companion-settings.png'});
 await page.getByRole('tab',{name:'Profile',exact:true}).click();await page.getByRole('tab',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Restart Fox',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Restart Fox',exact:true}).count(),1,'Settings reopens on the setting last chosen');
 await page.getByRole('button',{name:'Close companion panel'}).click();
 await type.click();assert(await typing());await page.locator('#notionInput').fill('Keep this draft');await page.keyboard.press('Escape');assert(!await typing());await type.click();assert.equal(await page.locator('#notionInput').inputValue(),'Keep this draft');
 // A long draft grows the field upward (six lines at most), Shift-Enter starts a line, and a stray click outside keeps the draft open.
 const field=page.locator('#notionInput'),oneLine=(await form.boundingBox()).height;await field.fill('A long message for Fox. '.repeat(8));await field.press('Shift+Enter');await field.pressSequentially('next line');
 assert.match(await field.inputValue(),/\nnext line$/);const grown=(await form.boundingBox()).height;assert(grown>oneLine+30,`Field grows with the draft (${oneLine} → ${grown})`);
 await field.fill('A long message for Fox. '.repeat(40));assert(await field.evaluate(e=>e.scrollHeight>e.clientHeight&&e.clientHeight<200),'Very long drafts scroll inside six lines');
 await page.evaluate(()=>{document.querySelector('.notion-world').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));(document.querySelector('#notionInput') as HTMLElement).blur();});await page.waitForTimeout(50);
 assert(await typing(),'A draft stays open after clicking outside');await page.keyboard.press('Escape');await type.click();await field.fill('Keep this draft');assert(Math.abs((await form.boundingBox()).height-oneLine)<2,'Short draft returns to one line');
 // Holding the resting bar speaks instead of typing.
 await field.fill('');await page.keyboard.press('Escape');assert(!await typing());{const b=await field.boundingBox(),before=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart').length);await page.mouse.move(b.x+20,b.y+b.height/2);await page.mouse.down();await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='speechStart').length>n,before);await page.mouse.up();await page.keyboard.press('Escape');assert(!await typing(),'Holding the bar speaks, it does not open typing');}
 await type.click();
 await page.locator('#notionInput').fill('Status fixture');await page.locator('#notionInput').press('Enter');await page.locator('.companion-asked',{hasText:'Status fixture'}).waitFor();
 await page.evaluate(()=>{const w=window as any;w.worldletAgentEvent(w.turn,{type:'progress',name:'read_content_page',activity:'reading'});});await page.waitForFunction(()=>/…\s*$/.test(document.querySelector('#worldConversation')?.textContent||''));assert.equal(await page.locator('.companion-head-status').isVisible(),false,'a turn\'s progress lives on its card, not above Fox');
 await page.screenshot({path:'/tmp/companion-working-card.png'});
 await page.evaluate(()=>(window as any).finish());await page.getByText('Done.',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await mic.click();await page.waitForFunction(()=>document.querySelector('#notionWorld').classList.contains('is-listening'));assert(await page.locator('.companion-input-wave').isVisible());await mic.click();assert(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='speechStop')));await page.keyboard.press('Escape');
 const m=await mic.boundingBox();await page.mouse.move(m.x+22,m.y+22);await page.mouse.down();await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='speechStart').length===3);await page.mouse.up();await page.keyboard.press('Escape');
 const a=await avatar.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='speechStart').length===4);await page.mouse.up();assert(!await panel.isVisible());await page.keyboard.press('Escape');
 const before=await avatar.boundingBox();// One task: under software rendering a frame can outlast the 280 ms hold-to-talk timer before a real move lands.
 await avatar.evaluate((el,[x,y])=>{const at=(type:string,dx:number,dy:number)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x+dx,clientY:y+dy}));
  at('pointerdown',0,0);for(let i=1;i<=12;i++)at('pointermove',-15*i,-160/12*i);at('pointerup',-180,-160);},[before.x+60,before.y+60]);assert(!await panel.isVisible());
 const saved=await page.evaluate(()=>localStorage.getItem('worldlet.companion.position'));assert(saved);
 const moved=await avatar.boundingBox();assert(moved.x<before.x-100);await page.reload();await waitForWorld(page);await page.waitForFunction(()=>document.querySelector('#notionHUD').getAttribute('data-positioned')==='true');
 assert(Math.abs((await avatar.boundingBox()).x-moved.x)<3,'Restart retains drag position');
 // Dragged to the bottom, Fox stops where the message bar and its buttons still fit in the window (owner Order 2026-10-08).
 {const restore=async(anchor:string)=>{await page.evaluate(a=>localStorage.setItem('worldlet.companion.position',a),anchor);await page.reload();await waitForWorld(page);await page.waitForFunction(()=>document.querySelector('#notionHUD').getAttribute('data-positioned')==='true');await page.waitForTimeout(200);};
  await restore(JSON.stringify([JSON.parse(saved)[0],1]));
  const lowest=await page.evaluate(()=>Math.max(...[...document.querySelectorAll('#notionCommand,.companion-controls')].map(e=>e.getBoundingClientRect().bottom)));
  assert(lowest<=850-12,`the bar stays inside the window when Fox is dragged down (bottom ${lowest})`);
  assert.equal(await page.evaluate(()=>document.querySelector('#notionWorld')!.scrollTop),0,'the World never scrolls out of place');
  await restore(saved);}
 await page.evaluate(()=>location.hash='object=app-browser');await page.locator('#notionContent[data-template=browser]').waitFor();await page.waitForTimeout(400);assert((await avatar.boundingBox()).x>moved.x+100,'Applet reader positions Fox in its reserved right lane');
 const reader=await page.locator('#notionContent').boundingBox();assert.equal(reader.x,16);assert.equal(reader.y,150,'the panel starts below the Applet shelf (ui/hud/applet-shelf.ts)');assert.equal(850-reader.y-reader.height,16);
 assert(!await page.locator(SETTINGS_BUTTON).isVisible()&&!await page.locator('.world-today-open').isVisible(),'Journal and Settings step aside inside an Applet');
 await page.screenshot({path:'/tmp/companion-bar.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await type.click();const f=await form.boundingBox();assert(f.x>=0&&f.x+f.width<=390);await page.screenshot({path:'/tmp/companion-entry-narrow.png'});
 assert.deepEqual(errors,[]);console.log('PASS Companion: one message bar (click to type, hold to speak, Send) with the mic on its right, clicking Fox types, the top-left Journal corner opens the Journal and Settings, Fox’s one side button, opens the panel (both hidden inside an Applet), hold-to-speak on Fox and the mic, retained draft, no bubble over Fox’s head, drag/reload/Applet persistence and narrow bounds. Mock speech only.');
});
