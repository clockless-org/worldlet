import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
import {tmpdir} from 'node:os';
const platform=process.platform==='win32'?'windows':'macos';
import {updateOnboarding} from '../core/onboarding/onboarding.ts';
import {WORLD_APPS} from '../core/applets/index.ts';
// Every app setup can offer says what it is for in one line (demo feedback 2026-10-03); a website Applet never claims account sync.
for(const app of WORLD_APPS){
 assert.ok(typeof app.purpose==='string'&&app.purpose.trim().length>=10&&app.purpose.length<=90&&!app.purpose.includes('\n'),'one-line purpose for '+app.key);
 if(app.connection.kind==='embedded-browser')assert.doesNotMatch(app.purpose,/\b(sync|synced|connected|imports?)\b/i,'website Applet purpose claims no account sync: '+app.key);
}
const initial={version:1,presets:['home'],completed:false};
assert.throws(()=>updateOnboarding(initial,{operation:'setup',applets:['app-invalid']}));
assert.deepEqual(updateOnboarding(initial,{operation:'setup',applets:['app-youtube','app-youtube']}).unlockedApplets,['app-youtube']);
assert.equal(updateOnboarding(initial,{operation:'setup',applets:[]}).completed,true);
await withBrowser(fileAccess,async browser=>{
 for(const mode of ['google','existing']){
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:mode==='google'?'no-preference':'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({mode,platform})=>{
   const w=window as any;w.calls=[];w.sky=[];
   window.addEventListener('worldlet:celebration-sound',e=>w.sky.push({...(e as CustomEvent).detail,at:performance.now()}));
   document.addEventListener('worldlet:celebration-done',()=>{w.celebrationDone=performance.now();},true);
   document.addEventListener('worldlet:setup-complete',()=>{w.devicesBeforeCurtain=document.querySelectorAll('#setupArrivingDevices img').length;});
   // Record the arrival state when the loader goes away; polling afterwards races the landing.
   document.addEventListener('worldlet:world-revealed',()=>{const modules=(document.querySelector('#notionWorld') as any)?.sceneMetrics?.modules||[];w.atReveal={unlocked:modules.filter(m=>m.unlocked).length,celebrations:document.querySelectorAll('.world-celebration').length,targets:modules.filter(m=>document.querySelector('#setupArrivingDevices [data-applet-id="'+m.id+'"]')).map(m=>m.arrivalBounds)};});
   w.fixture={platform,workspaceId:'setup-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:mode==='existing',unlockedApplets:['app-gmail']},mockGoogleAvailable:true,connections:sessionStorage.getItem('fixture-google')?['gmail','google-calendar'].map(provider=>({provider,status:'connected',enabled:true})):[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:['notion']};
    if(b.action==='browserBookmarks')return {urls:['https://dash.cloudflare.com/','https://us.posthog.com/','https://notion.so/'],browsers:['Chrome'],unavailable:[]};
    if(b.action==='localAgent')return {found:false};
    if(b.action==='connect'){
     // The first sign-in waits until the check has measured its waiting layout, then is cancelled: a fixed 500 ms ended
     // it before the Cancel button was measured on a loaded Windows RC (2967, boundingBox null).
     if(!w.failed){await new Promise(resolve=>w.cancelGoogle=resolve);w.failed=true;throw Error('Sign-in cancelled');}
     await new Promise(resolve=>setTimeout(resolve,500));sessionStorage.setItem('fixture-google','true');w.fixture.connections=['gmail','google-calendar'].map(provider=>({provider,status:'connected',enabled:true}));w.worldletReceive(structuredClone(w.fixture));throw Error('Connection reply interrupted after authorization');}
    if(b.action==='foxPreferences'){await new Promise(resolve=>setTimeout(resolve,350));if(b.cloudConsent)w.fixture.cloudConsent=true;return {companionStyle:'Be warm.',model:{ready:true}};}
    if(b.action==='onboarding'&&b.operation==='setup'){Object.assign(w.fixture.onboarding,{completed:true,introStep:3,unlockedApplets:b.applets});w.fixture.revision++;return {ok:true};}
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{mode,platform});
  await page.goto(worldUrl());
  if(mode!=='existing'){
   // One page (owner request 2026-10-09): the brand on top and no Fox, the Agents found here, More options folded, one big button.
   const toggle=page.locator('.setup-more-toggle');await toggle.waitFor();
   assert.equal(await page.getByRole('heading',{name:'Give your agent a world'}).count(),1);
   assert.equal(await page.locator('.setup-steps,.setup-languages,.setup-progress,.setup-skip,.setup-gallery').count(),0,'No step bars and no app gallery');
   assert.equal(await page.locator('.startup-scene').isVisible(),false,'Fox waits for the World');
   // The brand sits large on top, and the choices with the big button below them sit in the middle (owner requests
   // 2026-10-09).
   const [brandBox,chooseBox,nextBox]=await Promise.all([page.locator('.startup-brand').boundingBox(),page.locator('.setup-choose').boundingBox(),page.locator('.setup-next').boundingBox()]);
   const viewport=page.viewportSize()!;
   assert.ok(brandBox.y+brandBox.height<=chooseBox.y&&brandBox.height>=40&&Math.abs(brandBox.x+brandBox.width/2-viewport.width/2)<=2,'The brand is large on top: '+JSON.stringify({brandBox,chooseBox}));
   assert.ok(Math.abs((chooseBox.y+nextBox.y+nextBox.height)/2-viewport.height/2)<=viewport.height*.08,'The choices and the big button sit in the middle: '+JSON.stringify({chooseBox,nextBox}));
   assert.ok(nextBox.width<=360,'The big button is narrower: '+nextBox.width);
   assert.equal(await page.locator('.startup-brand .startup-version').count(),0,'The page shows no version (owner feedback 2026-10-03)');
   assert.equal(await page.getByRole('link').count(),0,'No links on the page');
   assert.equal(await page.locator('[data-kind=region-add]:visible').count(),0,'No area add controls during onboarding');
   // No Agent here (owner decisions 2026-10-07, 2026-10-09): Hermes Agent is offered, and the big button gives it a world.
   await page.getByText('No agent on this computer yet',{exact:true}).waitFor();
   assert.equal(await page.locator('.setup-agent-card.is-install strong').textContent(),'Hermes Agent');
   assert.equal(await page.getByRole('button',{name:'Build your world',exact:true}).isEnabled(),true);
   assert.equal(await page.locator('.setup-choose-again').count(),0,'The first half has nothing to choose again');
   // The main part is centred, so it may slide as it grows; the big button keeps its size and its column.
   const frame=async()=>{const next=await page.locator('.setup-next').boundingBox();return [next.x,next.width,next.height].map(Math.round);};
   // The page settles in first (its short entrance), then the big button keeps its shape.
   await page.locator('.startup-setup').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
   const firstFrame=await frame();
   // More options holds the rest, folded: Agents not on this computer greyed (owner request 2026-10-09); no "Coming soon"
   // Google or ChatGPT rows (owner decision 2026-10-10). This development host's mock Google keeps its own row.
   assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('#setupMore').isVisible(),false);
   await toggle.click();
   assert.equal(await page.locator('#setupMore').isVisible(),true);
   assert.deepEqual(await page.locator('.setup-more .setup-agent-button.is-missing').evaluateAll(list=>list.map(b=>b.getAttribute('aria-label'))),['OpenClaw','pi','Claude Code'],'Hermes Agent is the card, the rest wait in More options');
   assert.deepEqual(await page.locator('.setup-more :is(.setup-google-button,.setup-chatgpt-button)').allTextContents(),['Continue with Google'],'only the mock\'s row, no ChatGPT');
   assert.equal(await page.locator('.setup-google-button').isDisabled(),true,'the mock signs in from its own link');
   assert.equal(await page.locator('.setup-signin-tag',{hasText:'Coming soon'}).count(),0,'nothing coming soon');
   assert.deepEqual(await frame(),firstFrame,'Opening More options keeps the big button as it was');
   await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-google-'+platform+'.png')});
   // Nothing around Google moves at any sign-in stage (#1615): connecting, the browser step with its help and consent
   // links, then preparing. Only the development build's mock signs in now.
   const mockGoogle=page.getByRole('button',{name:'Use mock Google (Dev)',exact:true});
   const layout=()=>page.evaluate(()=>[...document.querySelectorAll('.startup-setup :is(.setup-agent-cards,.setup-more-toggle,.setup-more)')].map(e=>{const r=e.getBoundingClientRect();return e.className+'@'+Math.round(r.top-document.querySelector('.setup-agent-cards')!.getBoundingClientRect().top)+'+'+Math.round(r.height);}).join(' '));
   const still=await layout(),before=await page.locator('.setup-google-button').boundingBox();
   await mockGoogle.click();
   assert.match(await page.locator('.setup-google-button').textContent(),/(Connecting to|Waiting for) Google…|Finishing setup…/);
   assert.equal(await layout(),still,'Starting Google sign-in moves nothing');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:google-sign-in',{detail:{stage:'browser',url:'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture'}})));
   await page.getByRole('button',{name:'Copy link'}).waitFor();
   assert.match(await page.locator('.setup-google-help').textContent(),/Continue in your browser/);
   assert.equal(await layout(),still,'The browser step\'s help and consent links move nothing');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:google-sign-in',{detail:'preparing'})));
   assert.equal(await layout(),still,'Preparing moves nothing');
   assert.equal(await page.locator('.setup-google-button').textContent(),'Finishing setup…');
   assert.match(await page.locator('.setup-google-help').textContent(),/Google authorized/);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:google-sign-in',{detail:'browser'})));
   assert.equal(await page.evaluate(()=>(window as any).worldletCompanionGeometry(true)),null,'OAuth browser activation must not detach setup into a second Fox');
   assert.equal(await page.locator('.desktop-companion-setup').isVisible(),false,'Setup shows no Fox');
   const waiting=await page.locator('.setup-google-button').boundingBox();
   const cancel=await page.getByRole('button',{name:'Cancel sign-in'}).boundingBox();
   assert.ok(Math.abs(before.x-waiting.x)<1&&Math.abs(before.height-waiting.height)<1,'Google button keeps its place in the row: '+JSON.stringify({before,waiting}));
   assert.ok(cancel.y>=waiting.y+waiting.height,'Cancel is below Google');
   await page.evaluate(()=>(window as any).cancelGoogle());
   await page.getByRole('alert').filter({hasText:'Your request was cancelled.'}).waitFor();
   assert.equal(await page.locator('.setup-import').count(),0,'Failed login cannot advance');
   assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='usageEvent').map(c=>c.event)),['google_connection_absent','onboarding_started','local_agents_detected','google_connect_started','google_connect_cancelled']);
   assert.deepEqual(await frame(),firstFrame,'The error keeps the big button as it was');
   await mockGoogle.click();
   // Google goes straight to the second half: Google on the left, Mail and Calendar and the apps on the right.
   await page.getByRole('heading',{name:'Your world is ready'}).waitFor();
   if(platform==='macos')await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.operation==='checkMail'));
   await page.locator('.setup-tile-apps').waitFor();
   assert.equal(await page.locator('.setup-passport-name').textContent(),'Google');
   assert.deepEqual(await page.locator('.setup-tile').evaluateAll(list=>list.map(e=>e.className.split(' ')[1])),['setup-tile-avatar','setup-tile-connections','setup-tile-apps']);
   assert.deepEqual(await page.locator('.setup-tile-connections img').evaluateAll(list=>list.map(e=>(e as HTMLImageElement).title)),['Gmail','Google Calendar']);
   assert.equal(await page.getByRole('button',{name:'Enter your world',exact:true}).isEnabled(),true);
   assert.deepEqual(await frame(),firstFrame,'The big button stays where it was');
   // The apps the World starts with, the ones found here first (the fixture Mac has Notion); starter games arrive unshown.
   // Only the Applets in use (owner decision 2026-10-10): setup's draft and the apps found here, no featured starters.
   const shelf=await page.locator('.setup-tile-apps .setup-app').evaluateAll((list:HTMLElement[])=>list.map(e=>e.dataset.appletId));
   if(platform==='macos')assert.equal(shelf[0],'app-notion','Apps found here come first: '+shelf.join(' '));
   assert.deepEqual([...shelf].sort(),[...(platform==='macos'?['app-notion']:[]),'app-browser','app-gmail','app-google-calendar'].sort(),'Only the Applets in use show, games arrive unshown: '+shelf.join(' '));
   assert.equal(await page.locator('.setup-choose-again').count(),0,'Google has nothing to choose again');
   await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-google-world-'+platform+'.png')});
   assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='usageEvent'&&c.event==='google_connect_failed')),'Saved native connections recover even when the original bridge reply fails');
   assert.equal(await page.getByRole('alert').count(),0,'Recovered authorization does not show a stale sign-in error');
   // Setup in Chinese; then back to English.
   for(const [language,heading] of [['zh','你的世界准备好了'],['en','Your world is ready']]){
    await page.evaluate(language=>{const key='worldlet-startup-setup:setup-test';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)),language}));},language);
    await page.reload();await page.getByRole('heading',{name:heading}).waitFor();
   }
   await page.locator('.setup-tile-apps').waitFor();
   await page.setViewportSize({width:1000,height:680});
   await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-google-world-compact-'+platform+'.png')});
   assert.ok(await page.evaluate(()=>{const el=document.getElementById('worldStartup');return el.scrollHeight<=el.clientHeight+1;}),'No scrolling at compact desktop size');
   await page.setViewportSize({width:1280,height:850});
   await page.getByRole('button',{name:'Enter your world',exact:true}).click();
   await page.getByRole('button',{name:'Entering your world…',exact:true}).waitFor();
   // The brand and the painting leave as the icons start to change (owner request 2026-10-06).
   await page.waitForFunction(()=>document.getElementById('worldStartup')?.classList.contains('is-gathering'));
   assert.ok(await page.evaluate(()=>getComputedStyle(document.querySelector('#worldStartup>.startup-brand')!).transitionProperty.includes('opacity')),'The brand fades while the icons change');
   assert.equal(await page.locator('.setup-primary[aria-busy=true]').count(),1);
  }
  await page.waitForFunction(()=>!document.getElementById('worldStartup'),{},{timeout:30000});
  assert.equal(await page.locator('.startup-setup').count(),0);
  if(mode==='google'){
   assert.ok(await page.evaluate(()=>(window as any).devicesBeforeCurtain>0),'Icons become devices before opening the curtain');
   const atReveal=await page.evaluate(()=>(window as any).atReveal);
   assert.equal(atReveal.celebrations,0,'Fireworks wait for applet arrivals');
   assert.equal(atReveal.unlocked,0,'Destinations stay empty during arrival');
   const targets=atReveal.targets;
   assert.ok(targets.length>0&&targets.every(b=>Number.isFinite(b.x)&&b.y>150&&b.width>0&&b.height>0),'Arrival targets are on the ground, not the sky');
   await page.screenshot({path:path.join(tmpdir(),'worldlet-arrival-'+platform+'.png')});
   await page.locator('.world-celebration').waitFor();
   await page.waitForTimeout(3400);
   await page.screenshot({path:path.join(tmpdir(),'worldlet-welcome-finale-'+platform+'.png')});
   await page.waitForFunction(()=>(window as any).celebrationDone,{},{timeout:10000});
   const sky=await page.evaluate(()=>({events:(window as any).sky,done:(window as any).celebrationDone}));
   const launches=sky.events.filter(e=>e.kind==='launch'),bursts=sky.events.filter(e=>e.kind==='burst');
   assert.ok(launches.length>=7,'At least seven rockets: '+launches.length);
   assert.equal(bursts.length,launches.length,'Every rocket bursts');
   assert.ok(new Set(bursts.map(e=>e.family)).size>=3,'Bursts use several colour families');
   assert.ok(new Set(bursts.map(e=>e.shape)).size>=3,'Bursts use several shapes');
   assert.ok(launches.every(e=>e.y>=.75),'Rockets launch from the lower part of the window');
   assert.ok(bursts.every(e=>e.y>=.1&&e.y<=.18),'Rockets burst level with the distant mountains: '+JSON.stringify(bursts.map(e=>e.y)));
   assert.ok(Math.max(...launches.map(e=>e.x))-Math.min(...launches.map(e=>e.x))>.5,'Launches spread across the sky');
   assert.ok(launches.at(-1).at-launches[0].at>=2500,'Launches are staggered over several seconds');
   assert.ok(sky.done-launches[0].at<8000,'The whole celebration stays under eight seconds');
   const finale=sky.events.find(e=>e.kind==='chime');
   assert.ok(finale,'The welcome chime still plays');
   assert.ok(finale.originTop>=.7&&finale.originTop>finale.textTop+.2,'Welcome sparks start near the mountain foot, below the text: '+JSON.stringify(finale));
  }

  if(mode!=='existing'){
   const result=await page.evaluate(()=>({state:(window as any).fixture,calls:(window as any).calls}));
   assert.ok(!result.state.onboarding.unlockedApplets.includes('app-youtube')&&['app-gmail','app-google-calendar','app-browser','app-game-2048'].every(id=>result.state.onboarding.unlockedApplets.includes(id)),'A first run unlocks the Applets in use and the starter games, no featured starters: '+result.state.onboarding.unlockedApplets.join(' '));
   assert.equal(result.state.cloudConsent,mode==='google'&&platform==='macos','Only supported background source preparation saves consent during setup');
   if(platform==='macos')assert.ok(result.calls.some(c=>c.action==='onboarding'&&c.operation==='checkMail'),'Google sign-in starts background source checks before entering');
   await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.modules?.some(m=>m.id==='app-gmail'&&m.unlocked));
   assert.ok(!result.calls.some(c=>c.action==='localAgent'),'Companion setup is deferred');
   assert.ok(!result.calls.some(c=>c.action==='localAgent'&&c.operation==='bind'),'Binding still requires a choice');
   if(platform==='macos')assert.ok(result.state.onboarding.unlockedApplets.includes('app-notion'),'An app found here comes along');
   if(platform==='windows')assert.ok(!result.calls.some(c=>c.action==='installedApplets'||c.operation==='checkMail'),'No unsupported detection or background checks');
   assert.ok(!result.calls.some(c=>c.action==='agentChat'),'No model call gates entry');
   if(platform==='macos'){const checks=result.calls.filter(c=>c.action==='onboarding'&&c.operation==='checkMail');assert.equal(checks.length,1,'Entering does not duplicate the gallery source check');const checkIndex=result.calls.findIndex(c=>c.action==='onboarding'&&c.operation==='checkMail'),setupIndex=result.calls.findIndex(c=>c.action==='onboarding'&&c.operation==='setup');assert.ok(checkIndex<setupIndex,'Reads start during app selection');}
   assert.ok(!result.calls.some(c=>c.operation==='journey'),'Old mail tour is not started');
   assert.equal(await page.getByText('Mail is connected',{exact:true}).count(),0,'Connection status is not a fabricated Attention item');
  }
  const analytics=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='usageEvent'));
  assert.equal(analytics.filter(e=>e.event==='world_entered').length,1,'World entry reports once');
  assert.equal(analytics.some(e=>e.event==='onboarding_started'),mode==='google','Existing users must not restart the funnel');
  if(mode==='google')assert.ok(analytics.some(e=>e.event==='onboarding_apps_viewed'),'Resumed setup reports the actual apps step');
  assert.ok(analytics.every(e=>Object.keys(e).every(k=>['action','event','duration','operation','applet','item_status','trigger'].includes(k))),'UI telemetry excludes account/content fields');
  assert.deepEqual(errors,[]);await page.close();
 }
 // A local Agent found on this computer replaces Google sign-in (Claude Code, Codex, …).
 {
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({platform})=>{
   const w=window as any;w.calls=[];
   w.fixture={platform,workspaceId:'setup-agent-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'claude-code',title:'Claude Code',configured:true,worldTools:true},{id:'codex',title:'Codex',configured:true,worldTools:true},{id:'openclaw',title:'OpenClaw',configured:true,worldTools:true,memory:{name:'Nova',user:true,longTerm:true,model:false,history:{conversations:6,notes:31,skills:2,jobs:3}}},{id:'pi',title:'pi',configured:true,worldTools:false}],recommended:'claude-code',selected:sessionStorage.getItem('fixture-agent')};
    if(b.action==='agentHarness'&&b.operation==='select'){
     await new Promise(resolve=>setTimeout(resolve,300));
     if(b.id==='claude-code')throw Error('Claude Code did not answer. Open it once in Terminal to finish signing in, then try again.');
     sessionStorage.setItem('fixture-agent',b.id);return {ok:true,id:b.id,title:'Claude Code'};
    }
    // Bringing Nova in: its conversations for the second page, then the integrations it had.
    if(b.action==='localAgent'&&b.operation==='adopt'){await new Promise(resolve=>setTimeout(resolve,200));return {name:'Nova',memories:[{kind:'user'}],model:null,summary:{personality:'',about:'Runs a small design studio in Kyoto',model:'claude-sonnet-5'},history:{conversations:3,notes:31,skills:2,routines:3,list:[{title:'Trip plan for Kyoto',messages:48},{title:'Weekly investor update',messages:112},{title:'Fix the flaky login test',messages:67}]}};}
    if(b.action==='agentIntegrations')return {integrations:[{title:'GitHub',provider:'github',outcome:'ported'},{title:'Google Mail and Calendar',provider:'google',outcome:'reconnect'},{title:'fs',provider:null,outcome:'stays'}]};
    if(b.action==='connect')throw Error('Google must not be asked');
    // Nova signs in with its own account and there is no Codex here, so nothing answers for Fox yet.
    if(b.action==='foxEnergy')return {source:'none',ready:false,name:'',provider:'',level:null,resetsAt:null,localCodex:false};
    if(b.action==='foxPreferences'){if(b.cloudConsent)w.fixture.cloudConsent=true;return {companionStyle:'',model:{ready:true}};}
    if(b.action==='onboarding'&&b.operation==='setup'){Object.assign(w.fixture.onboarding,{completed:true,introStep:3,unlockedApplets:b.applets});w.fixture.revision++;return {ok:true};}
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{platform});
  await page.goto(worldUrl());
  await page.locator('.setup-agent-card[data-agent="openclaw"]').waitFor();
  await page.waitForFunction(()=>!(document.querySelector('.setup-agent-card[data-agent="claude-code"]') as HTMLButtonElement)?.disabled);
  // Picked for the person (owner request 2026-10-06): Hermes, OpenClaw, pi first, then Claude Code; Codex alone is no
  // Agent (owner decision 2026-10-09), so it has no card. Hermes isn't here, so OpenClaw is picked, first and lifted;
  // the big button names it by its own name.
  assert.deepEqual(await page.locator('.setup-agent-cards .setup-agent-card').evaluateAll((list:HTMLElement[])=>list.map(b=>b.dataset.agent)),['openclaw','pi','claude-code']);
  assert.equal(await page.locator('[data-agent="codex"]').count(),0,'Codex has no card');
  assert.equal(await page.locator('.setup-agent-default').getAttribute('data-agent'),'openclaw');
  assert.equal(await page.locator('.setup-agent-default').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.setup-next').textContent(),'Build your world');
  // Each card shows its own name, then where it comes from and what comes along.
  assert.equal(await page.locator('[data-agent="openclaw"] .setup-agent-name').textContent(),'Nova');
  assert.equal(await page.locator('[data-agent="openclaw"] .setup-agent-sub').textContent(),'OpenClaw');
  assert.deepEqual(await page.locator('[data-agent="openclaw"] .setup-agent-chip').allTextContents(),['6 conversations','31 notes','2 skills','3 routines']);
  // Only some command lines can call World tools; the card says so before the choice.
  assert.equal(await page.locator('[data-agent="pi"] .setup-signin-tag').textContent(),'Chat only');
  assert.equal(await page.locator('[data-agent="pi"]').getAttribute('title'),'With pi, Fox can talk with you but can’t act in your world yet.');
  // Hermes isn't here: it waits in More options, greyed. No Google or ChatGPT row (owner decision 2026-10-10).
  await page.locator('.setup-more-toggle').click();
  assert.equal(await page.locator('.setup-more [data-agent="hermes"]').isDisabled(),true);
  assert.equal(await page.locator('.setup-more [data-agent="hermes"]').getAttribute('title'),'Hermes Agent isn’t installed on this computer.');
  assert.equal(await page.locator('.setup-more :is(.setup-google-button,.setup-chatgpt-button)').count(),0,'nothing coming soon in a release build');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-local-agent-'+platform+'.png')});
  await page.locator('.setup-more-toggle').click();
  const firstFrame=await page.locator('.setup-next').boundingBox();
  // Clicking a card only picks it; the big button brings it. An Agent that is not signed in leaves the person here.
  await page.locator('.setup-agent-card[data-agent="claude-code"]').click();
  assert.equal(await page.locator('.setup-agent-default').getAttribute('data-agent'),'claude-code');
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='agentHarness'&&c.operation==='select')),false,'Picking a card brings nothing yet');
  await page.getByRole('button',{name:'Build your world',exact:true}).click();
  await page.getByText(/Claude Code did not answer/).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Give your agent a world'}).count(),1);
  // Choosing Nova brings it in on the same page: its card on the left, what came along arriving on the right.
  await page.locator('.setup-agent-card[data-agent="openclaw"]').click();
  await page.getByRole('button',{name:'Build your world',exact:true}).click();
  await page.getByRole('heading',{name:'Nova moved in'}).waitFor();
  assert.equal(await page.locator('.setup-passport-name').textContent(),'Nova');
  assert.equal(await page.locator('.setup-passport-from').textContent(),'OpenClaw');
  // Worldlet provides no model (owner request 2026-10-05): setup says where to choose one.
  assert.equal(await page.locator('.setup-passport .setup-agent-fact').count(),0,'The Agent keeps its own model, so its card shows none (owner request 2026-10-09)');
  // The tiles fill their grid with no gap (owner request 2026-10-09).
  const fill=await page.locator('.setup-tiles').evaluate(grid=>{const box=grid.getBoundingClientRect(),gap=10;let area=0;for(const tile of grid.querySelectorAll('.setup-tile')){const r=tile.getBoundingClientRect();area+=(r.width+gap)*(r.height+gap);}return area/((box.width+gap)*(box.height+gap));});
  assert.ok(Math.abs(fill-1)<.01,'The tiles fill the grid: '+fill);
  await page.getByText('Nova signs in with its own account, which Fox can’t use. After setup, choose a model in Settings, under Model.',{exact:true}).waitFor();
  // Only what came over gets a tile (owner request 2026-10-09), in the order it arrives.
  assert.deepEqual(await page.locator('.setup-tile').evaluateAll(list=>list.map(e=>e.className.split(' ')[1])),['setup-tile-avatar','setup-tile-profile','setup-tile-conversations','setup-tile-notes','setup-tile-skills','setup-tile-routines','setup-tile-connections','setup-tile-apps']);
  assert.equal(await page.locator('.setup-tile-profile .setup-tile-note').textContent(),'Knows: Runs a small design studio in Kyoto');
  assert.equal(await page.locator('.setup-tile-conversations .setup-tile-count').textContent(),'3');
  assert.deepEqual(await page.locator('.setup-tile-conversations li').allTextContents(),['Trip plan for Kyoto','Weekly investor update','Fix the flaky login test']);
  assert.deepEqual(await page.locator('.setup-tile-notes,.setup-tile-skills,.setup-tile-routines').evaluateAll(list=>list.map(e=>e.querySelector('.setup-tile-count')!.textContent)),['31','2','3']);
  assert.equal(await page.locator('.setup-tile-connections .setup-tile-note').textContent(),'1 to sign in again after setup','The integration that stays with the Agent gets no mark');
  assert.equal(await page.locator('.setup-tile-connections .setup-tile-logos>*').count(),2);
  assert.equal(await page.locator('.setup-tile-reading').count(),0,'Nothing reads as waiting once everything came over');
  const bringFrame=await page.locator('.setup-next').boundingBox();
  assert.ok(['x','width','height'].every(k=>Math.abs(bringFrame[k]-firstFrame[k])<=1.5)&&bringFrame.y+bringFrame.height<=850,'The big button keeps its shape and stays on screen: '+JSON.stringify({firstFrame,bringFrame}));
  assert.equal(await page.locator('.setup-next').textContent(),'Enter your world');
  assert.equal(await page.locator('.setup-passport .setup-choose-again').isVisible(),true,'The chosen Agent\'s card can choose again (owner request 2026-10-09: no Back button)');
  assert.equal(await page.getByRole('button',{name:'Back',exact:true}).count(),0,'No Back button');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-bring-'+platform+'.png')});
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='select').map(c=>c.id)),['claude-code','openclaw']);
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>['localAgent','agentIntegrations'].includes(c.action)).map(c=>c.action+':'+c.operation+':'+c.id)),['localAgent:adopt:openclaw','agentIntegrations:port:openclaw']);
  assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='connect')),'No Google sign-in');
  // Which Agent, who answers for Fox, and what came along: IDs, buckets and outcomes only (core/diagnostics/ANALYTICS.md#bringing-an-agent).
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='usageEvent'&&c.event==='agent_bring_completed'));
  const usage=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='usageEvent'));
  const chosen=usage.find(c=>c.event==='local_agent_selected'&&c.local_agent==='openclaw');
  assert.ok(chosen&&['built_in','agent'].includes(chosen.fox_brain)&&chosen.duration,JSON.stringify(chosen));
  const brought=usage.find(c=>c.event==='agent_bring_completed');
  assert.ok(brought&&brought.local_agent==='openclaw'&&brought.integrations_came_over==='1_9'&&brought.integrations_reconnect==='1_9'&&/^(0|1_9|10_99|100_999|1000_plus)$/.test(brought.bring_conversations),JSON.stringify(brought));
  assert.ok(!JSON.stringify(usage).match(/GitHub|Nova|#|\//),'No titles, names or paths in setup events');
  assert.equal(await page.evaluate(()=>(window as any).fixture.cloudConsent),true,'Choosing an Agent allows Fox to use the world’s context');
  // Restarting setup resumes with what already came over, read nothing again.
  await page.reload();
  await page.getByRole('heading',{name:'Nova moved in'}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent').length),0,'nothing is brought twice');
  // Choose again returns to the first half, and the same Agent again shows what came over without reading it again (owner request 2026-10-06).
  await page.getByRole('button',{name:'Choose again',exact:true}).click();
  await page.getByRole('heading',{name:'Give your agent a world'}).waitFor();
  await page.waitForFunction(()=>!(document.querySelector('[data-agent="openclaw"]') as HTMLButtonElement)?.disabled);
  assert.equal(await page.locator('.setup-agent-default').getAttribute('data-agent'),'openclaw');
  await page.getByRole('button',{name:'Build your world',exact:true}).click();
  await page.getByRole('heading',{name:'Nova moved in'}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent').length),0,'Coming back to the same Agent reads nothing again');
  assert.equal(await page.locator('.setup-tile-profile .setup-tile-note').textContent(),'Knows: Runs a small design studio in Kyoto');
  // On entry, what came along goes into Fox at the bottom, but Routines go up to the top-right corner, where the
  // World shows background work (owner request 2026-10-10): record where each tile's flight ends.
  await page.evaluate(()=>{const w=window as any,animate=Element.prototype.animate;w.parcelEnds={};Element.prototype.animate=function(frames:any,options:any){
   if(this.classList?.contains('setup-parcel')&&Array.isArray(frames)){const r=this.getBoundingClientRect(),m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(String(frames.at(-1).transform));if(m)w.parcelEnds[this.className.split(' ')[1]]={x:r.left+r.width/2+Number(m[1]),y:r.top+r.height/2+Number(m[2])};}
   return animate.call(this,frames,options);};});
  await page.getByRole('button',{name:'Enter your world',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('worldStartup'),{},{timeout:30000});
  const ends=await page.evaluate(()=>({ends:(window as any).parcelEnds,width:innerWidth,height:innerHeight}));
  assert.ok(ends.ends['setup-tile-routines']&&ends.ends['setup-tile-routines'].x>ends.width*.8&&ends.ends['setup-tile-routines'].y<ends.height*.2,'Routines fly to the top-right: '+JSON.stringify(ends));
  for(const kind of ['setup-tile-profile','setup-tile-conversations','setup-tile-notes','setup-tile-skills'])assert.ok(ends.ends[kind]&&ends.ends[kind].y>ends.height*.6,kind+' goes into Fox at the bottom: '+JSON.stringify(ends));
  const result=await page.evaluate(()=>({state:(window as any).fixture,calls:(window as any).calls}));
  assert.ok(!result.calls.some(c=>c.action==='connect'),'No Google sign-in');
  assert.equal(result.state.onboarding.completed,true);
  assert.ok(result.state.onboarding.unlockedApplets.includes('app-github')&&!result.state.onboarding.unlockedApplets.includes('app-youtube'),'The app brought from the Agent comes along; featured starters do not: '+result.state.onboarding.unlockedApplets.join(' '));
  assert.ok(!result.calls.some(c=>c.action==='onboarding'&&c.operation==='checkMail'),'No Google sources to read');
  const analytics=result.calls.filter(c=>c.action==='usageEvent').map(c=>c.event);
  assert.ok(analytics.includes('onboarding_apps_viewed')&&!analytics.some(e=>e.startsWith('google_connect_')),JSON.stringify(analytics));
  assert.deepEqual(errors,[]);await page.close();
 }
 // No setup page shows a scrollbar at common window sizes (owner request 2026-10-06), with a full Mac: a Hermes
 // Agent with a long history and two dozen apps found here. Only the Mac host finds installed apps, so every host
 // runs the full Mac, and a Windows host also checks its own apps page, which shows only the popular ones.
 for(const host of new Set(['macos',platform])){
  const page=await browser.newPage({viewport:{width:1024,height:700},reducedMotion:'reduce'});const errors=pageErrors(page);
  const found=['apple-notes','apple-reminders','weather','meetings','github','codex','claude-code','notion','obsidian','voice-memos','messages','todoist','docker','discord','browser','strava','x','youtube','tiktok','doordash','google-maps','airbnb','slack','zoom','whatsapp','telegram','spotify','figma'];
  await page.addInitScript(({platform,found})=>{
   const w=window as any;w.calls=[];
   w.fixture={platform,workspaceId:'setup-fit-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:found};
    if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'hermes',title:'Hermes Agent',configured:true,worldTools:true,memory:{name:'Elon North',user:true,longTerm:true,model:true,history:{conversations:278,notes:0,skills:160,jobs:4}}},{id:'codex',title:'Codex',configured:true,worldTools:true},{id:'claude-code',title:'Claude Code',configured:true,worldTools:true}],recommended:'hermes',selected:sessionStorage.getItem('fixture-agent')};
    if(b.action==='agentHarness'&&b.operation==='select'){sessionStorage.setItem('fixture-agent',b.id);return {ok:true,id:b.id,title:'Hermes Agent',model:true};}
    if(b.action==='localAgent'&&b.operation==='adopt')return {name:'Elon North',memories:[{kind:'soul'},{kind:'user'},{kind:'longTerm'}],model:{ok:false},summary:{personality:'A blunt first-principles operator',about:'Kelvin runs Worldlet from San Francisco',model:'deepseek-v4-flash'},recent:Array.from({length:8},(_,i)=>({title:'Conversation '+(i+1)+' about the launch plan, with a title long enough to be cut',at:Date.now()-(i+1)*3_600_000}))};
    if(b.action==='agentIntegrations')return {integrations:[]};
    if(b.action==='foxEnergy')return {source:'chatgpt',ready:true};
    if(b.action==='foxPreferences'){if(b.cloudConsent)w.fixture.cloudConsent=true;return {companionStyle:'',model:{ready:true}};}
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{platform:host,found});
  await page.goto(worldUrl());
  const sizes=[[1024,700],[1280,800],[1440,900],[1920,1080]];
  const noScroll=async(where:string)=>{
   for(const [width,height] of sizes){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(50);
    const over=await page.evaluate(()=>{
     const scrolls=[document.getElementById('worldStartup')].filter(e=>e&&e.scrollHeight>e.clientHeight+1).map(e=>e!.className+' '+e!.scrollHeight+'>'+e!.clientHeight);
     // The page's own part never runs under the big button, nor the button under the window's edge.
     const footer=document.querySelector('.startup-setup .setup-footer')!.getBoundingClientRect(),body=[...document.querySelectorAll('.setup-agent-cards,.setup-more-wrap,.setup-import,.setup-tile')].map(e=>e.getBoundingClientRect());
     if(body.some(r=>r.height&&r.bottom>footer.top+1))scrolls.push('the page runs under the big button');
     if(footer.bottom>innerHeight+1)scrolls.push('the big button is cut off');
     return scrolls;
    });
    assert.deepEqual(over,[],where+' scrolls at '+width+'x'+height);
   }
   await page.setViewportSize({width:1024,height:700});
  };
  await page.locator('.setup-agent-default[data-agent="hermes"]').waitFor();
  await noScroll('The agent page');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-1-'+host+'.png')});
  await page.locator('.setup-more-toggle').click();
  await noScroll('More options');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-1-more-'+host+'.png')});
  await page.locator('.setup-more-toggle').click();
  await page.getByRole('button',{name:'Build your world',exact:true}).click();
  await page.getByRole('heading',{name:'Elon North moved in'}).waitFor();
  await noScroll('Bringing the Agent in');
  // A Hermes Agent keeps its history, so the Conversations tile lists its newest from its own files, with when; as many
  // as fit, each row whole and inside the tile (it never scrolls).
  for(const [width,height] of [[1024,700],[1440,900],[1920,1080]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(50);
   const rows=await page.locator('.setup-tile-conversations').evaluate(tile=>{const box=tile.getBoundingClientRect();return [...tile.querySelectorAll('li')].map(li=>li.getBoundingClientRect()).filter(r=>r.height>0&&r.top<box.bottom).map(r=>({inside:r.bottom<=box.bottom+.5&&r.height>=25}));});
   assert.ok(rows.length>=2&&rows.every(row=>row.inside),'The newest conversations fit their tile at '+width+'x'+height+': '+JSON.stringify(rows));
  }
  await page.setViewportSize({width:1024,height:700});
  assert.equal(await page.locator('.setup-tile-conversations .setup-tile-count').textContent(),'278');
  assert.deepEqual(await page.locator('.setup-tile-conversations li').first().evaluate(li=>[li.querySelector('.setup-tile-titles-name')!.textContent!.slice(0,14),li.querySelector('.setup-tile-titles-when')!.textContent]),['Conversation 1','1 hr. ago']);
  if(host==='macos')assert.ok(await page.locator('.setup-tile-apps .setup-app').count()>=10,'The apps found here show in the Apps tile');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-2-'+host+'.png')});
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(50);
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-2-1440-'+host+'.png')});
  assert.deepEqual(errors,[]);await page.close();
 }
// One-click install (`--connect=<id>`, core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup): the Agent the
 // host hands over is connected with the same select as the big button and brought in by itself; one not
 // found here, or a select that fails, leaves the first half with it picked and the error shown; so does a select that
 // moved on before its answer check (`checkLater`) and hears that check failed; a second launch while setup is open
 // (`worldlet:connect-agent`) does the same.
 for(const scenario of ['found','missing','fails','check-fails','second-launch']){
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({platform,scenario})=>{
   const w=window as any;w.calls=[];w.requested=scenario==='missing'?'hermes':scenario==='second-launch'?null:'openclaw';
   w.fixture={platform,workspaceId:'setup-connect-'+scenario,revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'codex',title:'Codex',configured:true,worldTools:true},{id:'openclaw',title:'OpenClaw',configured:true,worldTools:true,memory:{name:'Nova',user:true,longTerm:true,model:false}}],recommended:'codex',selected:sessionStorage.getItem('fixture-agent')};
    if(b.action==='agentHarness'&&b.operation==='requested'){const id=w.requested;w.requested=null;return {id};}
    if(b.action==='agentHarness'&&b.operation==='select'){if(scenario==='fails')throw Error('OpenClaw did not answer.');sessionStorage.setItem('fixture-agent',b.id);
     if(scenario==='check-fails')setTimeout(()=>window.dispatchEvent(new CustomEvent('worldlet:agent-check',{detail:{id:b.id,ok:false,message:'OpenClaw did not answer.'}})),300);
     return {ok:true,id:b.id,title:'OpenClaw',connected:true,...b.checkLater?{checking:true}:{}};}
    if(b.action==='localAgent'&&b.operation==='adopt')return {name:'Nova',memories:[{kind:'soul'}],model:{ok:false},summary:{},history:{conversations:2,notes:0,skills:0,routines:0,list:[{title:'Trip plan',messages:4}]}};
    if(b.action==='agentIntegrations')return {integrations:[]};
    if(b.action==='foxEnergy')return {source:'none'};
    if(b.action==='foxPreferences'){if(b.cloudConsent)w.fixture.cloudConsent=true;return {companionStyle:'',model:{ready:true}};}
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{platform,scenario});
  await page.goto(worldUrl());
  const selects=()=>page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='select').map(c=>c.id));
  if(scenario==='second-launch'){
   await page.locator('.setup-agent-default[data-agent="openclaw"]').waitFor();
   assert.deepEqual(await selects(),[],'Nothing requested at launch: setup waits on its first page');
   await page.evaluate(()=>{const w=window as any;w.requested='openclaw';window.dispatchEvent(new CustomEvent('worldlet:connect-agent'));});
  }
  if(scenario==='found'||scenario==='second-launch'){
   await page.getByRole('heading',{name:'Nova moved in'}).waitFor();
   assert.deepEqual(await selects(),['openclaw'],'The named Agent is connected with the same select as the big button');
   assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='localAgent'&&c.operation==='adopt'&&c.id==='openclaw')),'and brought in');
   assert.equal(await page.getByRole('button',{name:'Enter your world',exact:true}).isEnabled(),true);
  }else{
   const message=scenario==='missing'?'Hermes Agent isn’t installed on this computer.':'OpenClaw did not answer.';
   await page.getByText(message,{exact:true}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Give your agent a world'}).count(),1,'The normal first half stays');
   assert.deepEqual(await selects(),scenario==='missing'?[]:['openclaw']);
   if(scenario!=='missing')assert.equal(await page.locator('.setup-agent-default[data-agent="openclaw"]').count(),1,'The named Agent stays picked');
   if(scenario==='check-fails')assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='select').map(c=>c.checkLater)),[true],'Setup does not wait for the answer check');
  }
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='requested').length>=1),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 // An Agent older than Worldlet works with (core/agent/agent-versions.ts): its card says which version it needs, the big
 // button opens its own update in Terminal instead of connecting it, and Check again reads its version afresh.
 {
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(platform=>{
   const w=window as any;w.calls=[];w.updated=false;
   w.fixture={platform,workspaceId:'setup-outdated',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'openclaw',title:'OpenClaw',configured:true,worldTools:true,version:{current:w.updated?'2026.9.8':'2026.7.1',minimum:'2026.8.1',outdated:!w.updated,update:true,howTo:'Run `openclaw update` in Terminal.'}}],recommended:'openclaw',selected:null};
    if(b.action==='agentHarness'&&b.operation==='update'){w.updated=true;return {ok:true};}
    if(b.action==='agentHarness'&&b.operation==='requested')return {id:null};
    return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },platform);
  await page.goto(worldUrl());
  await page.locator('.setup-agent-card.is-outdated[data-agent="openclaw"]').getByText('Needs version 2026.8.1 or newer').waitFor();
  await page.getByRole('button',{name:/^Update /}).click();
  await page.getByText(/is updating in Terminal/).waitFor();
  await page.getByRole('button',{name:'Check again',exact:true}).click();
  await page.getByRole('button',{name:'Build your world',exact:true}).waitFor();
  assert.equal(await page.locator('.setup-agent-card.is-outdated').count(),0,'Updated, the card is an ordinary one again');
  const harness=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation!=='requested').map(c=>c.operation+(c.id?':'+c.id:'')+(c.fresh?':fresh':'')));
  assert.deepEqual(harness,['detect','update:openclaw','detect:fresh'],'Nothing is connected while it is too old');
  assert.deepEqual(errors,[]);await page.close();
 }
 // No Agent on this computer is no dead end (owner decisions 2026-10-07, 2026-10-09): Check again asks the host again,
 // Build your world installs stock Hermes Agent (its installer's steps show as they run), ChatGPT is signed in inside
 // Hermes (the code its device page asks for shows here), and Hermes then moves in like any Agent found here.
 {
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({platform})=>{
   const w=window as any;w.calls=[];w.detects=0;w.installed=false;w.signedIn=false;
   const event=(detail:unknown)=>window.dispatchEvent(new CustomEvent('worldlet:hermes-setup',{detail}));
   w.fixture={platform,workspaceId:'setup-no-agent-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    // Codex alone is no Agent; Hermes appears once it is installed and signed in.
    if(b.action==='agentHarness'&&b.operation==='detect'){w.detects++;return {agents:w.signedIn?[{id:'hermes',title:'Hermes Agent',configured:true,worldTools:true}]:[{id:'codex',title:'Codex',configured:true,worldTools:true}],recommended:null,selected:sessionStorage.getItem('fixture-agent')};}
    if(b.action==='agentHarness'&&b.operation==='install-hermes'){
     event({stage:'install',step:3,steps:7,title:'Create Python environment'});
     await new Promise<void>(resolve=>{w.finishInstall=resolve;});
     w.installed=true;return {ok:true,id:'hermes',title:'Hermes Agent'};
    }
    if(b.action==='agentHarness'&&b.operation==='sign-in-hermes'){
     if(!w.installed)throw Error('Hermes Agent is not on this computer. Install it first.');
     event({stage:'sign-in',url:'https://auth.openai.com/codex/device',code:'ABCD-1234'});
     await new Promise<void>(resolve=>{w.finishSignIn=resolve;});
     w.signedIn=true;return {ok:true};
    }
    if(b.action==='agentHarness'&&b.operation==='select'){sessionStorage.setItem('fixture-agent',b.id);return {ok:true,id:b.id,title:'Hermes Agent',connected:true};}
    if(b.action==='localAgent'&&b.operation==='adopt')return {name:null,memories:[],model:{ok:false},summary:{},history:{conversations:0,notes:0,skills:0,routines:0,list:[]}};
    if(b.action==='agentIntegrations')return {integrations:[]};
    if(b.action==='foxEnergy')return {source:'own'};
    if(b.action==='foxPreferences'){if(b.cloudConsent)w.fixture.cloudConsent=true;return {companionStyle:'',model:{ready:true}};}
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{platform});
  await page.goto(worldUrl());
  await page.getByText('No agent on this computer yet',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-agent="codex"]').count(),0,'Codex alone is no Agent');
  await page.getByText('No agent found on this computer. Worldlet installs Hermes Agent for you the official way, then you sign in to ChatGPT inside it.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Check again'}).click();
  await page.waitForFunction(()=>(window as any).detects>=2);
  await page.getByText('No agent on this computer yet',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Build your world',exact:true}).click();
  await page.getByText('Step 3 of 7: Create Python environment',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Installing Hermes Agent…',exact:true}).isDisabled(),true,'nothing else while it installs');
  assert.equal(await page.getByRole('button',{name:'Check again'}).count(),0,'nothing to check while it installs');
  assert.equal(await page.locator('.setup-more-toggle').count(),0,'More options waits while it installs');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-hermes-install-'+platform+'.png')});
  await page.evaluate(()=>(window as any).finishInstall());
  await page.getByText(/Hermes Agent is installed\. Sign in to ChatGPT in it\./).waitFor();
  await page.getByRole('button',{name:'Sign in with ChatGPT',exact:true}).click();
  await page.locator('.setup-hermes-code strong',{hasText:'ABCD-1234'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cancel sign-in'}).isVisible(),true);
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-hermes-sign-in-'+platform+'.png')});
  assert.equal(await page.evaluate(()=>{const el=document.getElementById('worldStartup')!;return el.scrollHeight<=el.clientHeight+1;}),true,'the sign-in fits without scrolling');
  await page.evaluate(()=>(window as any).finishSignIn());
  await page.getByRole('heading',{name:/^Hermes Agent moved in$/}).waitFor();
  assert.equal(await page.locator('.setup-passport-name').textContent(),'Hermes Agent');
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&!['detect','requested'].includes(c.operation)).map(c=>c.operation+(c.id?':'+c.id:''))),['install-hermes','sign-in-hermes','select:hermes']);
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>['modelConfigure','modelCatalog'].includes(c.action))),false,'no model is configured in Worldlet');
  await page.getByRole('button',{name:'Enter your world',exact:true}).waitFor();
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-no-agent-'+platform+'.png')});
  assert.deepEqual(errors,[]);await page.close();
 }
 // Moving off Fox's own Hermes (ui/onboarding/README.md#moving-off-foxs-own-hermes-2026-10-09): a finished World whose Fox
 // still runs on it gets the first page once; Google does not stand in for an Agent, an Agent it only copied from is not
 // taken as chosen, the pick answers for Fox itself, the right side shows every tile, nothing about
 // onboarding is redone, and Enter your world opens the World as it was.
 {
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({platform})=>{
   const w=window as any;w.calls=[];
   w.fixture={platform,workspaceId:'setup-move-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,onboarding:{version:1,presets:['home'],completed:true,unlockedApplets:['app-gmail']},agentNeeded:true,connections:['gmail','google-calendar'].map(provider=>({provider,status:'connected',enabled:true})),sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'openclaw',title:'OpenClaw',configured:true,worldTools:true,memory:{name:'Nova',user:true,longTerm:true,model:true}}],recommended:'openclaw',selected:'openclaw'};
    if(b.action==='agentHarness'&&b.operation==='select'){w.fixture.agentNeeded=false;return {ok:true,id:b.id,title:'OpenClaw',connected:true};}
    if(b.action==='localAgent'&&b.operation==='adopt')return {name:'Nova',memories:[],model:{ok:false},summary:{},history:{conversations:0,notes:0,skills:0,routines:0,list:[]}};
    if(b.action==='agentIntegrations')return {integrations:[]};
    if(b.action==='foxEnergy')return {source:'own'};
    if(b.action==='foxPreferences')return {companionStyle:'',model:{ready:true}};
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{platform});
  await page.goto(worldUrl());
  await page.getByText('Fox now runs on your own agent. What Fox has learned comes along.',{exact:true}).waitFor();
  await page.locator('[data-agent="openclaw"]').waitFor();
  await page.getByRole('button',{name:'Build your world',exact:true}).click();
  await page.getByRole('heading',{name:/^Nova moved in$/}).waitFor();
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='select').map(c=>[c.id,c.direct])),[['openclaw',true]],'the pick answers for Fox itself');
  assert.equal(await page.locator('.setup-tile-apps').count(),1,'Apps and Connections show here too (owner request 2026-10-09)');
  assert.equal(await page.locator('.setup-tile-connections').count(),1);
  await page.getByRole('button',{name:'Enter your world',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.startup-setup')&&!document.getElementById('worldStartup'));
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.operation==='setup')),false,'onboarding setup is not redone');
  assert.deepEqual(errors,[]);await page.close();
 }
 // My Agent is on another computer (core/phone/README.md#another-computers-agent): the code from Worldlet there pairs
 // this one with it, and setup goes on to the second half; a refused code says why and the code box stays.
 {
  const page=await browser.newPage({viewport:{width:1024,height:700},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({platform})=>{
   const w=window as any;w.calls=[];
   w.fixture={platform,workspaceId:'setup-remote-agent-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'codex',title:'Codex',configured:true,worldTools:true}],recommended:'codex',selected:null,remote:sessionStorage.getItem('fixture-paired')?{computer:'Mac mini',seenAt:Date.now()}:null};
    if(b.action==='agentHarness'&&b.operation==='pair'){if(!b.link.startsWith('worldlet://agent?'))throw Error('This is not a code from Worldlet on another computer.');sessionStorage.setItem('fixture-paired','1');return {ok:true,remote:{computer:'Mac mini'}};}
    if(b.action==='foxPreferences'){if(b.cloudConsent)w.fixture.cloudConsent=true;return {companionStyle:'',model:{ready:true}};}
    if(b.action==='appContent')return {pages:[]};return {ok:true};
   }}}};
   if(platform==='windows')w.worldletHost={version:1,platform:'windows',request:w.webkit.messageHandlers.worldlet.postMessage};
  },{platform});
  await page.goto(worldUrl());
  await page.locator('.setup-more-toggle').click();
  const toggle=page.getByRole('button',{name:'My Agent is on another computer'});await toggle.waitFor();
  await toggle.click();
  const code=page.getByLabel('Code from your other computer');await code.waitFor();
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-remote-code-'+platform+'.png')});
  assert.equal(await page.locator('.setup-agent-cards').count(),0,'the code box takes the Agent cards’ room');
  const connect=page.getByRole('button',{name:'Connect',exact:true});
  assert.equal(await connect.isDisabled(),true,'nothing to pair without a code');
  assert.deepEqual(await page.evaluate(()=>[document.getElementById('worldStartup'),...document.querySelectorAll('#worldStartup .setup-content')].filter(e=>e&&e.scrollHeight>e.clientHeight+1).map(e=>e!.className)),[],'the code box fits without scrolling');
  await code.fill('worldlet://pair?v=1&s=x');await connect.click();
  await page.getByText('This is not a code from Worldlet on another computer.').waitFor();
  await code.fill('worldlet://agent?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac+mini');await connect.click();
  await page.getByRole('heading',{name:'Your world is ready'}).waitFor();
  assert.equal(await page.locator('.setup-passport-from').textContent(),'On Mac mini');
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='pair').map(c=>c.link.slice(0,17))),['worldlet://pair?v','worldlet://agent?']);
  assert.equal(await page.evaluate(()=>(window as any).fixture.cloudConsent),true);
  // A relaunch resumes on the second half while the pairing lasts, and returns to the first half once it ended there.
  await page.reload();await page.getByRole('heading',{name:'Your world is ready'}).waitFor();
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-remote-agent-'+platform+'.png')});
  await page.evaluate(()=>sessionStorage.removeItem('fixture-paired'));await page.reload();
  await page.getByRole('heading',{name:'Give your agent a world'}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: one-page setup: the brand large on top, the main part in the middle, the Agents found here as cards (Hermes/OpenClaw/pi first), the rest under More options (nothing coming soon), one big Build your world; the chosen Agent moves left while what came along arrives as tiles, then Enter your world; Google retry, background checks, existing-user bypass, one-click install, no-Agent Hermes install, moving off Fox’s own Hermes, Agent on another computer, no scrolling at desktop sizes');
});
