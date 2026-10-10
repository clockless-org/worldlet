// Moment Applets on the World page (core/artifacts/README.md): an Applet Fox made for today stands on the Home ground
// as its own device under its own name, leads the Attention Center's Now, opens its page in the host's sandboxed view
// laid over the panel's slot, Back hides that view, and Delete goes to the host. There is no Widgets Applet.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
import {READY_APPLETS,widgetDocument,readWidgetConsole} from '../core/artifacts/index.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 // A fixed morning in a fixed zone: the end three hours later reads the same on every host at any hour.
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce',timezoneId:'America/Los_Angeles'}),errors=pageErrors(page);
 await page.clock.setFixedTime(new Date('2026-10-03T10:00:00-07:00'));
 await page.addInitScript(()=>{const w=window as any;w.calls=[];
  const end=Date.now()/1000+3*3600,getty={id:'wgt-getty2abcd',title:'Getty Center today',blurb:'Stops, map and artworks to tick off',color:'#c8553d',createdAt:Date.now()/1000,updatedAt:Date.now()/1000,version:1,endsAt:end,pinned:false,archivedAt:null};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return {workspaceId:'moments-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail']},sampleEnabled:false,cloudConsent:true,
   momentApplets:[{id:getty.id,title:getty.title,blurb:getty.blurb,color:getty.color,endsAt:end,pinned:false,createdAt:getty.createdAt}],appletArt:{'app-wgt-getty2abcd':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='}};
  if(b.action==='appletArt')return b.operation==='get'?{art:{icon:'',background:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',madeAt:1}}:{ok:true,painter:'codex',queued:[]};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='widgets')return b.operation==='list'?{now:[getty],finished:[]}:{ok:true};
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 // Its own device on the Home ground, never waiting to be unlocked; no catalog "Widgets" device.
 await page.waitForFunction(()=>((document.querySelector('#notionWorld') as any)?.sceneMetrics?.modules||[]).some(m=>m.id==='app-wgt-getty2abcd'&&m.visible!==false));
 const modules=await page.evaluate(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.modules.map(m=>m.id));
 assert.ok(!modules.includes('app-widgets'),'no Widgets Applet');
 // It is the person's own Applet: the World marks it (core/applets/MY-APPLETS.md).
 assert.equal(await page.evaluate(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.modules.find(m=>m.id==='app-wgt-getty2abcd')?.mine),'page');
 // Its pictures are asked of the host's painter by name and kind (core/applets/MY-APPLETS.md#pictures).
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='appletArt'&&c.operation==='ensure'&&c.applets.some(a=>a.applet==='app-wgt-getty2abcd'&&a.kind==='page'&&a.title==='Getty Center today')));
 await page.screenshot({path:'/tmp/moment-world.png'});
 const row=page.locator('.world-task-group[data-group=widget] .world-widget');
 await row.waitFor();
 assert.equal(await page.locator('.world-task-group[data-group=widget] h2').textContent(),'For now');
 assert.match(await row.textContent()||'',/Getty Center today/);assert.match(await row.textContent()||'',/Until 1:00 PM/);
 assert.doesNotMatch(await row.getAttribute('aria-label')||'',/Widget/);
 // Selecting it opens that Applet; the host lays the sandboxed view over the slot.
 await row.click();
 const panel=page.locator('#notionContent[data-template=moment] .moment-applet');await panel.waitFor();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='widgetPlayer'&&c.operation==='show'));
 const show=await page.evaluate(()=>(window as any).calls.find(c=>c.action==='widgetPlayer'&&c.operation==='show'));
 assert.equal(show.id,'wgt-getty2abcd');assert.ok(show.rect.width>300&&show.rect.height>300,'the slot is a real area: '+JSON.stringify(show.rect));
 assert.match(await panel.locator('.moment-until').textContent()||'',/Until 1:00 PM/);
 // It sits on the background painted for it.
 await page.waitForFunction(()=>document.querySelector('.moment-applet')?.hasAttribute('data-own-background'));
 // Its title shows where the open Applet is named (the Applet shelf hides Fox's context line while it stands).
 await page.getByText('Getty Center today',{exact:true}).filter({visible:true}).first().waitFor();
 assert.doesNotMatch(await page.locator('#notionContent').textContent()||'',/[Ww]idget/);
 await page.screenshot({path:'/tmp/moment-open.png'});
 // Keeping it and deleting it go to the host.
 await panel.getByRole('button',{name:'Keep it'}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='widgets'&&c.operation==='pin'&&c.id==='wgt-getty2abcd'));
 await panel.getByRole('button',{name:'Delete'}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='widgets'&&c.operation==='delete'&&c.id==='wgt-getty2abcd'));
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='widgetPlayer'&&c.operation==='hide'));
 assert.deepEqual(errors,[]);
 // Each ready-made page at phone size, as the host plays it: it draws, works and reports what was ticked.
 for(const ready of READY_APPLETS){
  const phone=await browser.newPage({viewport:{width:390,height:844}}),phoneErrors=pageErrors(phone),lines:string[]=[];
  phone.on('console',message=>lines.push(message.text()));
  await phone.setContent(widgetDocument(ready.html,{state:{'art-irises':'1'},scroll:0}));
  await phone.getByText(ready.title,{exact:true}).first().waitFor();
  assert.equal(await phone.locator('#art-irises').isChecked(),true,'stored ticks come back');
  // Its pictures travel inside the page and all draw.
  assert.ok(await phone.evaluate(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0)),'every picture draws');
  // The page batches its report on a timer, so a loaded host can deliver it well after the tick draws.
  const reported=phone.waitForEvent('console',{predicate:message=>!!readWidgetConsole(message.text())?.state?.['stop-tram'],timeout:30000}).catch(()=>null);
  await phone.locator('.stop button').first().click();
  await phone.waitForFunction(()=>document.querySelector('.stop')?.classList.contains('done'));
  await reported;
  const state=lines.map(readWidgetConsole).filter(Boolean).map(r=>r!.state).filter(Boolean).at(-1)||{};
  assert.ok(state['stop-tram']&&state['art-irises']==='1','the tick is reported with what was kept: '+JSON.stringify(state));
  await phone.screenshot({path:`/tmp/ready-${ready.key}.png`,fullPage:false});
  assert.deepEqual(phoneErrors,[]);await phone.close();
 }
 console.log('PASS Moment Applets: one Fox made stands in the World as its own Applet, leads Now, opens its page over the sandboxed view, Keep it and Delete go to the host, its pictures are asked for and its background shows, and each ready-made page draws, works and reports at phone size.');
}finally{await browser.close();}
