import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});const errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.calls=[];let selected='',playing=false,connected=false;
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'memo-fixture',sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false};
   if(b.action==='voiceMemos'){
    if(b.operation==='permissions')return {awaitingPermission:true,appName:'Worldlet Test'};
    if(b.operation==='connect')throw Error('Access is not active yet.');
    if(b.operation==='choose')connected=true;
    if(b.operation==='disconnect')connected=false;
    if(['list','choose','disconnect'].includes(b.operation))return {connected,pages:connected?Array.from({length:6},(_,i)=>({id:'memo-'+i+'.m4a',title:'Recording '+(i+1),list:'M4A · Local recording'})):[],scope:'Fixture recordings'};
    if(b.operation==='select'){selected=b.id;playing=false;return {id:selected,duration:90,transcript:'An actual supplied transcript from the fixture.'};}
    if(b.operation==='play')playing=true;if(b.operation==='pause')playing=false;if(b.operation==='stop'){playing=false;selected='';}
    return {id:selected,playing,position:0,duration:90};
   }
   if(b.action==='foxPreferences')return {model:{ready:true,name:'Fixture'},cloudConsent:false};if(b.action==='modelStatus')return {available:true};if(b.action==='weatherLoad')return null;return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>!!document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics);
 await page.evaluate(()=>location.hash='object=app-voice-memos');
 for(let i=0;i<10&&await page.getByRole('button',{name:'Next page'}).isVisible();i++)await page.getByRole('button',{name:'Next page'}).click();
 await page.getByRole('button',{name:'Open permission settings',exact:true}).click();
 await page.getByText(/Drag the selected Worldlet Test app from Finder/).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:app-active')));
 // Read failures stay quiet: Fox keeps the setup guide and retries later instead of echoing the backend error.
 await page.waitForFunction(()=>calls.some(c=>c.operation==='connect'));
 assert.equal(await page.getByText('Access is not active yet.').count(),0,'backend read errors are not shown');
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.operation==='connect').length),1,'returning retries once');
 await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:app-active')));
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.operation==='connect').length),1,'ordinary activation does not retry repeatedly');
 // Fox's guide re-renders asynchronously; wait for the button instead of sampling once (RC 6158b2de, #1223).
 await page.getByRole('button',{name:'Restart Worldlet',exact:true}).waitFor({timeout:5000});
 await page.getByRole('button',{name:'Choose recordings',exact:true}).click();
 // Every recording shows at once; the item area scrolls rather than paging (owner Order 2026-10-07).
 await page.waitForFunction(()=>document.querySelectorAll('.pixi-stage-item').length===6);
 await page.screenshot({path:'/tmp/worldlet-voice-memos-open.png'});
 assert.equal(await page.getByRole('button',{name:'Next',exact:true}).count(),0,'no page arrows');
 await page.locator('.pixi-stage-item').first().click();
 await page.getByText('An actual supplied transcript from the fixture.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await page.screenshot({path:'/tmp/worldlet-voice-memos-focus.png'});
 await page.getByRole('button',{name:'Next item',exact:true}).click();
 await page.waitForFunction(()=>calls.some(c=>c.operation==='select'&&c.id==='memo-1.m4a'));
 await page.getByRole('button',{name:'Play',exact:true}).waitFor();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 // Close Focus only once playback has settled and the reader is the open view: on the slower
 // Windows release host the close could otherwise land mid-update (#1303). A click on bare
 // scenery acts as Back and closes it (owner request 2026-10-05).
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await page.getByText('An actual supplied transcript from the fixture.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.elementFromPoint(1370,420)?.matches('canvas[data-renderer]')),true,'the scenery click lands on bare scenery');
 await page.mouse.click(1370,420);
 // On failure, say where the World went instead of only that the stage stayed hidden.
 await page.locator('.pixi-applet-stage').waitFor().catch(async e=>{
  const state=await page.evaluate(()=>{const m=document.querySelector<any>('#notionWorld')?.sceneMetrics,c=document.querySelector<HTMLElement>('#notionContent');
   return {hash:location.hash,level:m?.level,active:m?.active,content:{hidden:c?.hidden,template:c?.dataset.template},calls:calls.slice(-12).map(c=>c.action+(c.operation?'/'+c.operation:''))};});
  throw Error(e.message+'\nWorld after the scenery click: '+JSON.stringify(state));
 });
 assert.ok(await page.evaluate(()=>calls.filter(c=>c.operation==='stop').length>=2),'switching item and closing Focus both stop audio');
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 for(let i=0;i<10&&await page.getByRole('button',{name:'Next page'}).isVisible();i++)await page.getByRole('button',{name:'Next page'}).click();
 await page.getByRole('button',{name:'Choose recordings',exact:true}).waitFor();
 assert.equal(await page.locator('.pixi-stage-item').count(),0);
 assert.equal(await page.evaluate(()=>calls.some(c=>['agentChat','browserShow'].includes(c.action))),false,'local listening neither uploads nor opens a browser');
 assert.deepEqual(errors,[]);
 console.log('PASS Voice Memos: folder setup, Open showing every recording, native Focus transcript, Fox playback actions, adjacent recordings, stop on exit and disconnect.');
});
