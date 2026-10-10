import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
import dataset from '../ui/world/sample-persona.json' with {type:'json'};
const PAPER_READERS=['apple-notes','google-calendar','apple-reminders','gmail'];
const contrast=(a: string,b: string)=>{const lum=(c: string)=>{const [r,g,bl]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(v=>{const x=Number(v)/255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*bl;};const [h,l]=[lum(a),lum(b)].sort((x,y)=>y-x);return (h+.05)/(l+.05);};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors:string[]=[];
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(datasetId=>{(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){
  if(b.action==='snapshot')return {workspaceId:'hud-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},cloudConsent:false,sampleEnabled:true,sampleUI:{'dataset-version':datasetId},overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null}};
  if(b.action==='modelStatus')return {available:true};return {ok:true};
 }}}};},dataset.id);
 await page.goto(worldUrl());await page.locator('#worldStartup').waitFor({state:'detached',timeout:60000});
 for(const key of ['apple-notes','google-calendar','apple-reminders','notion','obsidian','gmail','voice-memos','stripe','paypal','github','codex','claude-code']){
  // Start each Applet from the overview, not from the previous Applet's open reader.
  await page.evaluate(()=>location.hash='');await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='overview');
  await page.evaluate(key=>location.hash='object=app-'+key,key);
  const item=page.locator(`.pixi-applet-stage[data-applet="${key}"] :is(.pixi-stage-item,.home-leaf)`).first();
  // Use keyboard selection: Calendar's separately owned day grid can overlap its item hitbox.
  await item.focus();await item.press('Enter');
  const host=page.locator('#notionContent');await host.waitFor();
  const surface=key==='gmail'?host.locator('.mail-focus.ui-applet-surface'):host.locator(':scope[data-reader-hud=true]');
  await surface.waitFor();
  const outer=await surface.boundingBox();
  // The Applet shelf (ui/hud/applet-shelf.ts) stands above an open Applet; the reader starts under it.
  const top=await page.locator('#notionWorld').evaluate(e=>e.hasAttribute('data-applet-shelf'))?150:64;
  assert(Math.abs(outer.x-64)<2&&Math.abs(outer.y-top)<2&&Math.abs(1000-outer.y-outer.height-64)<2,key+' equal left/bottom Focus gutters, top under the shelf: '+JSON.stringify(outer));
  assert(await surface.locator('.ui-applet-header').isVisible(),key+' header');
  assert(await surface.locator('.ui-applet-body').innerText(),key+' original is present');
  for(const theme of ['day','night']){
   await page.evaluate(theme=>(window as any).worldletExecute('set_scene_lighting',{lighting:theme}),theme);
   await page.waitForFunction(theme=>document.querySelector('#notionWorld')?.getAttribute('data-time-of-day')===theme,theme);
   const colors=await surface.evaluate(e=>{const probe=document.createElement('span');probe.style.color='var(--control-ink)';probe.style.background='var(--control-paper)';e.append(probe);const expected={bg:getComputedStyle(probe).backgroundColor,ink:getComputedStyle(probe).color};probe.remove();return {bg:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage,ink:getComputedStyle(e).color,paper:getComputedStyle(e,'::before').borderImageSource,expected};});
   // Mail's paper is the approved country stationery behind it (#1638), not the flat shared paper.
   if(key==='gmail'){assert.equal(colors.bg,'rgba(0, 0, 0, 0)',key+' no flat paper over the stationery');assert.match(colors.paper,/country-stationery\.png/,key+' stationery paper');}
   else assert.equal(colors.bg,colors.expected.bg,key+' shared surface');
   assert.equal(colors.ink,colors.expected.ink,key+' readable ink');
   // Painted paper (Mail's stationery, the Home Notes/Reminders/Calendar pages) keeps day ink at night;
   // the other readers turn deep forest with light ink. Night's light ink on the Calendar's paper was
   // unreadable while the flat background color still matched (Order 2026-10-06), so the ink is checked
   // against what is painted: the paper art's own color when there is one.
   const painted=key==='gmail'||/hud\/paper\.png/.test(colors.image);
   assert.equal(painted,PAPER_READERS.includes(key),key+' paper material');
   assert.equal(colors.ink,theme==='night'&&!painted?'rgb(244, 240, 229)':'rgb(32, 59, 48)',key+' '+theme+' ink');
   assert(contrast(colors.ink,painted?'rgb(244, 240, 229)':colors.bg)>=7,key+' '+theme+' ink contrast');
   if(key==='apple-notes'){await page.waitForTimeout(2400);await page.screenshot({path:'/tmp/text-hud-notes-'+theme+'.png'});}
  }
  await page.screenshot({path:'/tmp/text-hud-'+key+'.png'});
  console.log('PASS HUD '+key);
 }
 // Stress the production reader shell with a long original, not a second mock UI.
 await page.evaluate(()=>location.hash='');await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='overview');
 await page.evaluate(()=>location.hash='object=app-apple-notes');await page.locator('.pixi-applet-stage[data-applet=apple-notes] .home-leaf').first().click();
 await page.locator('#notionContent[data-reader-hud=true]').waitFor();
 await page.locator('.ui-reader-body .notion-prose').evaluate(e=>{for(let i=0;i<35;i++){const p=document.createElement('p');p.textContent='Long original paragraph '+i+'. Original words remain readable, with one continuous scroll area.';e.append(p);}});
 for(const size of [{width:900,height:650},{width:390,height:844}]){
  await page.setViewportSize(size);const head=page.locator('#notionContent>.ui-applet-header'),before=await head.boundingBox();
  await page.locator('.ui-reader-body p').last().scrollIntoViewIfNeeded();
  assert(Math.abs((await head.boundingBox()).y-before.y)<1,'Header stays fixed');
  assert(await page.locator('#notionContent').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'No outer scroll');
  assert(await page.locator('.ui-reader-body').evaluate(e=>e.scrollTop>0&&e.scrollWidth<=e.clientWidth+1),'One bounded content scroll');
  await page.screenshot({path:'/tmp/text-hud-'+size.width+'.png'});
 }
 await page.evaluate(()=>location.hash='object=app-browser');
 await page.locator('#notionContent[data-template=browser]').waitFor();
 assert.equal(await page.locator('#notionContent[data-reader-hud],#notionContent>.ui-reader-body').count(),0,'Website mode must not inherit the native reader wrapper');
 assert.deepEqual(errors,[]);
 console.log('PASS native text HUD: shared day/night materials, original content and compact scroll. Fictional fixtures only.');
});
