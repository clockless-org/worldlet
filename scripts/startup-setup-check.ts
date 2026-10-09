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
   await page.getByRole('button',{name:'Continue with Google'}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Give your agent a World'}).count(),1);
   assert.equal(await page.getByText('Bring the agent you have',{exact:true}).count(),1);
   assert.equal(await page.locator('.setup-languages,.setup-progress,.setup-skip').count(),0);
   // Three bars on top say where setup is (owner request 2026-10-05).
   assert.deepEqual(await page.locator('.setup-steps .setup-step').evaluateAll(list=>list.map(e=>e.className)),['setup-step is-current','setup-step is-next','setup-step is-next']);
   assert.equal(await page.locator('.setup-steps').getAttribute('aria-label'),'Step 1 of 3');
   assert.equal(await page.locator('.startup-brand').isVisible(),true);
   // One fixed frame (owner request 2026-10-06): the heading and the one big button keep their place on every page.
   const frame=async()=>{const [h1,next]=await Promise.all([page.locator('.startup-setup h1').boundingBox(),page.locator('.setup-next').boundingBox()]);return [h1.y,next.x,next.y,next.width,next.height].map(Math.round);};
   await page.locator('.setup-agent-button.is-missing').first().waitFor();
   const firstFrame=await frame();
   assert.equal(await page.getByRole('button',{name:'Install Hermes Agent',exact:true}).isEnabled(),true,'Without a local Agent, Worldlet installs Hermes Agent');
   assert.equal(await page.locator('.setup-back').isVisible(),false,'The first page has nothing to go back to');
   await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-google-'+platform+'.png')});
   assert.equal(await page.locator('[data-kind=region-add]:visible').count(),0,'No area add controls during onboarding');
   // Terms and Privacy live on the website; the page signs off with the brand only.
   assert.equal(await page.getByRole('link').count(),0,'No links on the first page');
   assert.equal(await page.locator('.startup-brand .startup-version').count(),0,'The sign-in page shows no version (owner feedback 2026-10-03)');
   // Two kinds of way in: an Agent on this computer first (owner request 2026-10-04), or an account in the cloud.
   assert.deepEqual(await page.locator('.setup-signin-heading').allTextContents(),['Bring your local agent','Bring your cloud agent']);
   assert.equal(await page.locator('.setup-agent-default').count(),0,'No default Agent when none is on this computer');
   // Cloud agents are coming soon and Muse is gone; Worldlet provides no model, so Google is greyed even with no Agent
   // here (owner requests 2026-10-05), and Worldlet installs Hermes Agent, with Check again (2026-10-09). Codex alone is
   // no Agent (2026-10-09), so it has no tile.
   assert.deepEqual(await page.locator('.is-new .setup-signin-option').allTextContents(),['Continue with GoogleComing soon','Continue with ChatGPTComing soon']);
   assert.equal(await page.locator('.setup-google-button').isDisabled(),true,'Google is greyed for everyone');
   await page.getByText('No agent found on this computer. Worldlet installs Hermes Agent for you the official way, then you sign in to ChatGPT inside it.',{exact:true}).waitFor();
   assert.deepEqual(await page.locator('.setup-agent-button').evaluateAll(list=>list.map(b=>b.getAttribute('aria-label'))),['Hermes Agent','OpenClaw','pi','Claude Code']);
   assert.equal(await page.locator('.setup-agent-button.is-missing').count(),4,'Agents not on this computer stay listed, greyed');
   assert.equal(await page.locator('.setup-signin-option:disabled').count(),6,'Nothing can be chosen without a local Agent');
   assert.equal(await page.locator('.setup-signin-option .setup-signin-icon').count(),6,'Each choice carries its icon');
   // One square tile per local Agent in one row; the cloud buttons stack under each other below them (owner request 2026-10-06).
   const tiles=await page.locator('.setup-agent-tile').evaluateAll(list=>list.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),Math.round(r.top)];}));
   assert.ok(tiles.length===4&&tiles.every(([w,h,top])=>Math.abs(w-h)<=1&&top===tiles[0][2]),'Agent tiles are squares in one row: '+JSON.stringify(tiles));
   const [googleBox,chatgptBox,grid]=await Promise.all([page.locator('.setup-google-button').boundingBox(),page.locator('.setup-chatgpt-button').boundingBox(),page.locator('.setup-agent-grid').boundingBox()]);
   assert.ok(chatgptBox.y>=googleBox.y+googleBox.height&&Math.abs(googleBox.x-chatgptBox.x)<1&&Math.abs((googleBox.x+googleBox.width/2)-(grid.x+grid.width/2))<2&&googleBox.y>grid.y+grid.height,'Google and ChatGPT stack under each other, centred under the tiles: '+JSON.stringify({googleBox,chatgptBox,grid}));
   // The bars carry no words (owner request 2026-10-06), and the page sits together: Fox just above the heading,
   // the Agents close to the big button, the brand well below it.
   assert.equal(await page.locator('.setup-steps').innerText(),'');
   const [fox,title,body,next,back,brand]=await Promise.all(['.startup-scene','.startup-setup h1','.setup-signin','.setup-next','.setup-back','.startup-brand'].map(s=>page.locator(s).boundingBox()));
   assert.ok(fox.y>=60,'Fox is not pressed against the top: '+JSON.stringify(fox));
   assert.ok(title.y-(fox.y+fox.height)<=24,'Fox sits just above the heading');
   assert.ok(next.y-(body.y+body.height)<=110,'The Agents are close to Continue: '+JSON.stringify({body,next}));
   assert.ok(brand.y-(back.y+back.height)>=24,'Back keeps clear of the brand: '+JSON.stringify({back,brand}));
   const before=await page.locator('.setup-google-button').boundingBox(),heading=await page.getByRole('heading',{name:'Give your agent a World'}).boundingBox();
   // Nothing above or around Google moves at any sign-in stage (#1615): connecting, the
   // browser step with its help and consent links, then preparing. Only the development build's mock signs in now.
   const mockGoogle=page.getByRole('button',{name:'Use mock Google (Dev)',exact:true});
   const layout=()=>page.evaluate(()=>[...document.querySelectorAll('.startup-setup :is(h1,h2,.setup-signin-group,.setup-google-help,.startup-brand,.setup-next)')].map(e=>{const r=e.getBoundingClientRect();return e.className+'@'+Math.round(r.top)+'+'+Math.round(r.height);}).join(' '));
   const still=await layout();
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
   assert.equal(await page.locator('.desktop-companion-setup').isVisible(),false,'Login keeps only its original Fox');
   const waiting=await page.locator('.setup-google-button').boundingBox();
   const cancel=await page.getByRole('button',{name:'Cancel sign-in'}).boundingBox();
   assert.ok(Math.abs(before.y-waiting.y)<1&&Math.abs(before.x-waiting.x)<1,'Google button stays still: '+JSON.stringify({before,waiting}));
   assert.ok(cancel.y>=waiting.y+waiting.height,'Cancel is below Google');
   // The Dev mock link keeps its room while signing in, so nothing above moves down.
   assert.equal((await page.getByRole('heading',{name:'Give your agent a World'}).boundingBox()).y,heading.y,'The heading stays still while Google waits');
   await page.evaluate(()=>(window as any).cancelGoogle());
   await page.getByRole('alert').filter({hasText:'Your request was cancelled.'}).waitFor();
   assert.equal(await page.locator('.setup-gallery').count(),0,'Failed login cannot advance');
   assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='usageEvent').map(c=>c.event)),['google_connection_absent','onboarding_started','local_agents_detected','google_connect_started','google_connect_cancelled']);
   const feedback=await page.getByRole('alert').boundingBox();assert.ok(Math.abs((feedback.y+feedback.height/2)-(cancel.y+cancel.height/2))<3,'Cancellation reuses cancel slot');
   const failed=await page.locator('.setup-google-button').boundingBox();assert.ok(Math.abs(before.y-failed.y)<1,'Error does not shift sign-in layout');
   await mockGoogle.click();
   await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
   if(platform==='macos')await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='onboarding'&&c.operation==='checkMail'));
   await page.locator('[data-applet-id="app-notion"]').waitFor();
   const appsFrame=await frame();assert.ok(appsFrame.every((v,i)=>Math.abs(v-firstFrame[i])<=1),'The heading and the big button stay where they were on the first page: '+JSON.stringify({firstFrame,appsFrame}));
   // Only the apps found on this computer (owner request 2026-10-06): no search, bookmarks or more apps.
   assert.equal(await page.locator('.setup-gallery-toolbar,.setup-more,.setup-show-all,.setup-import,input[type=search]').count(),0);
   assert.equal(await page.getByRole('button',{name:'Read browser bookmarks',exact:true}).count(),0);
   assert.equal(await page.locator('.setup-app').filter({hasText:'Notion'}).getByRole('checkbox').isChecked(),true,'Notion is a curated starter on both platforms');
   // Two sections (owner request 2026-10-06): the apps found on this computer, then popular ones. The fixture Mac has
   // Notion, the one app found; without detection, every chosen starter is a popular one.
   if(platform==='macos'){
    assert.deepEqual(await page.locator('.setup-app-section h2').allTextContents(),['Apps on your computer','Apps that are popular']);
    assert.deepEqual(await page.locator('.setup-app-section.is-found .setup-app').evaluateAll((list:HTMLElement[])=>list.map(e=>e.dataset.appletId)),['app-notion']);
    assert.ok(await page.locator('.setup-app-section.is-popular .setup-app').count()>=10);
   }else{
    assert.deepEqual(await page.locator('.setup-app-section h2').allTextContents(),['Apps that are popular']);
    assert.ok(await page.locator('.setup-app').count()>=15);
   }
   assert.equal(await page.locator('.setup-app-section.is-popular [data-applet-id="app-game-2048"]').count(),0,'Starter games arrive without being shown');
   assert.deepEqual(await page.locator('.setup-app').evaluateAll((list:HTMLElement[])=>list.filter(e=>!e.dataset.purpose||!e.title.includes(' — ')).map(e=>e.dataset.appletId)),[],'Every tile carries its purpose as a tooltip');
   assert.equal(await page.locator('.setup-back').isVisible(),false,'Google has nothing to go back to');
   await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-apps-'+platform+'.png')});
   await page.locator('.setup-app').filter({hasText:'Notion'}).getByRole('checkbox').click();
   assert.equal(await page.locator('.setup-app').filter({hasText:'Notion'}).getByRole('checkbox').isChecked(),false);
   assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='usageEvent'&&c.event==='google_connect_failed')),'Saved native connections recover even when the original bridge reply fails');
   assert.equal(await page.getByRole('alert').count(),0,'Recovered authorization does not show a stale sign-in error');
   await page.reload();
   await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
   await page.locator('[data-applet-id="app-notion"]').waitFor();
   assert.equal(await page.locator('.setup-app').filter({hasText:'Notion'}).getByRole('checkbox').isChecked(),false,'Detection must not recheck a cancelled choice');
   // Setup in Chinese; then back to English.
   for(const [language,heading] of [['zh','把常用应用带进你的世界'],['en','Bring your apps into your World']]){
    await page.evaluate(language=>{const key='worldlet-startup-setup:setup-test';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)),language}));},language);
    await page.reload();await page.getByRole('heading',{name:heading}).waitFor();
   }
   await page.setViewportSize({width:1000,height:680});
   await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-apps-compact-'+platform+'.png')});
   assert.ok(await page.evaluate(()=>{const el=document.getElementById('worldStartup');return el.scrollHeight<=el.clientHeight+1;}),'No scrolling at compact desktop size');
   await page.setViewportSize({width:1280,height:850});
   assert.deepEqual(await page.locator('.setup-steps .setup-step').evaluateAll(list=>list.map(e=>e.className)),['setup-step is-done','setup-step is-done','setup-step is-current'],'Google skips bringing an Agent in');
   await page.getByRole('button',{name:'Enter my World',exact:true}).click();
   await page.getByRole('button',{name:'Entering your World…',exact:true}).waitFor();
   // The bars and the brand leave as the icons start to change (owner request 2026-10-06).
   await page.waitForFunction(()=>document.getElementById('worldStartup')?.classList.contains('is-gathering'));
   assert.ok(await page.evaluate(()=>['.setup-steps','.startup-brand'].every(s=>getComputedStyle(document.querySelector('#worldStartup>'+s)!).transitionProperty.includes('opacity')&&document.querySelector('#worldStartup')!.classList.contains('is-gathering'))),'Bars and brand fade while the icons change');
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
   assert.ok(result.state.onboarding.unlockedApplets.includes('app-youtube'));
   assert.equal(result.state.cloudConsent,mode==='google'&&platform==='macos','Only supported background source preparation saves consent during setup');
   if(platform==='macos')assert.ok(result.calls.some(c=>c.action==='onboarding'&&c.operation==='checkMail'),'Google sign-in starts background source checks before entering');
   await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.modules?.some(m=>m.id==='app-gmail'&&m.unlocked));
   assert.ok(!result.calls.some(c=>c.action==='localAgent'),'Companion setup is deferred');
   assert.ok(!result.calls.some(c=>c.action==='localAgent'&&c.operation==='bind'),'Binding still requires a choice');
   assert.ok(!result.state.onboarding.unlockedApplets.includes('app-notion'));
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
  const useClaude=page.getByRole('button',{name:'Claude Code',exact:true});
  await useClaude.waitFor();
  await page.waitForFunction(()=>!(document.querySelector('[data-agent="claude-code"]') as HTMLButtonElement)?.disabled);
  // Cloud agents are coming soon once an Agent here can be brought (owner request 2026-10-05).
  assert.equal(await page.locator('.setup-google-button').isDisabled(),true,'Google is coming soon');
  assert.equal(await page.locator('.setup-google-button .setup-signin-tag').textContent(),'Coming soon');
  // Picked for the person (owner request 2026-10-06): Hermes, OpenClaw, pi first, then Claude Code; Codex alone is no
  // Agent (owner decision 2026-10-09). Hermes isn't here, so OpenClaw is picked, first and forest; Google comes after the local Agents.
  assert.equal(await page.locator('.setup-agent-default').getAttribute('data-agent'),'openclaw');
  assert.equal(await page.locator('.setup-agent-default').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.setup-agent-tile .setup-signin-tag',{hasText:'Recommended'}).count(),0,'The pick is the recommendation');
  // Agents found here in that order, then supported ones not found here, listed but greyed.
  assert.deepEqual(await page.locator('.setup-agent-button').evaluateAll(list=>list.map(b=>b.dataset.agent)),['openclaw','pi','claude-code','hermes']);
  const order=await page.locator('.setup-agent-default,.setup-google-button').evaluateAll(list=>list.map(e=>e.getBoundingClientRect().top));
  assert.ok(order[0]<order[1],'the default Agent comes before Google');
  assert.equal(await page.locator('[data-agent="codex"]').count(),0,'Codex has no tile');
  for(const id of ['claude-code','openclaw','pi'])assert.equal(await page.locator(`[data-agent="${id}"]`).isEnabled(),true,id);
  assert.equal(await page.locator('[data-agent="hermes"]').isDisabled(),true);
  assert.equal(await page.locator('[data-agent="hermes"]').getAttribute('title'),'Hermes Agent isn’t installed on this computer.');
  assert.equal(await page.locator('[data-agent="hermes"].is-missing').count(),1);
  assert.equal(await page.locator('.setup-chatgpt-button').isDisabled(),true,'ChatGPT is coming soon');
  assert.equal(await page.locator('.setup-muse-button').count(),0,'Muse is gone');
  // Each Agent shows its own name, then where it comes from and what comes along.
  assert.equal(await page.locator('[data-agent="openclaw"] strong').textContent(),'Nova');
  assert.equal(await page.locator('[data-agent="openclaw"] small').textContent(),'OpenClaw · 6 conversations');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-local-agent-'+platform+'.png')});
  const firstFrame=await page.locator('.setup-next').boundingBox();
  // Only some command lines can call World tools; the tile says so before the choice.
  assert.equal(await page.locator('[data-agent="pi"] .setup-signin-tag').textContent(),'Chat only');
  assert.equal(await page.locator('[data-agent="pi"]').getAttribute('title'),'With pi, Fox can talk with you but can’t act in your world yet.');
  // Clicking a tile only picks it; the one Continue brings it. An Agent that is not signed in leaves the person on the first page.
  await page.getByRole('button',{name:'Claude Code',exact:true}).click();
  assert.equal(await page.locator('.setup-agent-default').getAttribute('data-agent'),'claude-code');
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='agentHarness'&&c.operation==='select')),false,'Picking a tile brings nothing yet');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByText(/Claude Code did not answer/).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Give your agent a World'}).count(),1);
  // Choosing Nova brings it in on the second page, named by its own name: its card reads it while what is happening scrolls past.
  await page.getByRole('button',{name:'OpenClaw',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your Nova'}).waitFor();
  await page.locator('.setup-bring-ticker.is-done').waitFor();
  assert.equal(await page.locator('.setup-bring-line.is-now').textContent(),'Nova moved in.');
  assert.equal(await page.locator('.setup-lede').textContent(),'Everything came over');
  assert.equal(await page.locator('.setup-bring-older').count(),0,'No background or older-conversation copy (owner request 2026-10-06)');
  assert.equal(await page.locator('.setup-bring-feed,.setup-bring-counts,.setup-bring-links').count(),0,'No list under the card (owner request 2026-10-06)');
  const bringFrame=await page.locator('.setup-next').boundingBox();
  assert.ok(['x','y','width','height'].every(k=>Math.abs(bringFrame[k]-firstFrame[k])<=1.5),'The big button stays put: '+JSON.stringify({firstFrame,bringFrame}));
  // Its card reads the Agent: its name, personality, what it knows about the person and its model.
  // Each says in a few words what came over (owner request 2026-10-06), never just "came over".
  assert.deepEqual(await page.locator('.setup-agent-fact').allTextContents(),['NameNova','PersonalityFox’s own','About youRuns a small design studio in Kyoto','ModelChoose one in Settings']);
  // Worldlet provides no model (owner request 2026-10-05): setup says where to choose one.
  await page.getByText('Nova signs in with its own account, which Fox can’t use. After setup, choose a model in Settings, under Model.',{exact:true}).waitFor();
  assert.equal(await page.locator('.setup-agent-card.is-reading').count(),0,'Reading ends once everything is shown');
  assert.deepEqual(await page.locator('.setup-steps .setup-step').evaluateAll(list=>list.map(e=>e.className)),['setup-step is-done','setup-step is-current','setup-step is-next']);
  assert.equal(await page.locator('.setup-back').isVisible(),true,'The bring page can go back');
  assert.equal(await page.locator('.setup-gallery').count(),0,'No app gallery while bringing an Agent');
  assert.equal(await page.getByRole('button',{name:'Enter my World',exact:true}).count(),0,'The apps come after the Agent');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-bring-'+platform+'.png')});
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='select').map(c=>c.id)),['claude-code','openclaw']);
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='agentIntegrations'));
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>['localAgent','agentIntegrations'].includes(c.action)).map(c=>c.action+':'+c.operation+':'+c.id)),['localAgent:adopt:openclaw','agentIntegrations:port:openclaw']);
  assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='connect')),'No Google sign-in');
  assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='usageEvent'&&c.event==='local_agent_selected')),'The choice is measured');
  // Which Agent, who answers for Fox, and what came along: IDs, buckets and outcomes only (core/diagnostics/ANALYTICS.md#bringing-an-agent).
  await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='usageEvent'&&c.event==='agent_bring_completed'));
  const usage=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='usageEvent'));
  const chosen=usage.find(c=>c.event==='local_agent_selected'&&c.local_agent==='openclaw');
  assert.ok(chosen&&['built_in','agent'].includes(chosen.fox_brain)&&chosen.duration,JSON.stringify(chosen));
  const brought=usage.find(c=>c.event==='agent_bring_completed');
  assert.ok(brought&&brought.local_agent==='openclaw'&&brought.integrations_came_over==='1_9'&&brought.integrations_reconnect==='1_9'&&/^(0|1_9|10_99|100_999|1000_plus)$/.test(brought.bring_conversations),JSON.stringify(brought));
  assert.ok(!JSON.stringify(usage).match(/GitHub|Nova|#|\//),'No titles, names or paths in setup events');
  assert.equal(await page.evaluate(()=>(window as any).fixture.cloudConsent),true,'Choosing an Agent allows Fox to use the world’s context');
  // Restarting setup resumes on the second page with what already came over.
  await page.reload();
  await page.getByRole('heading',{name:'Bring your Nova'}).waitFor();
  await page.locator('.setup-bring-ticker.is-done').waitFor();
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent').length),0,'nothing is brought twice');
  // Then the apps, as with Google, ending on one big Enter my World; Back returns to the Agent without bringing it again.
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your Nova'}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent').length),0,'Back brings nothing again');
  // Back to the first page and Continue with the same Agent shows what came over without reading it again (owner request 2026-10-06).
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('heading',{name:'Give your agent a World'}).waitFor();
  await page.waitForFunction(()=>!(document.querySelector('[data-agent="openclaw"]') as HTMLButtonElement)?.disabled);
  assert.equal(await page.locator('.setup-agent-default').getAttribute('data-agent'),'openclaw');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your Nova'}).waitFor();
  await page.locator('.setup-bring-ticker.is-done').waitFor();
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent').length),0,'Coming back to the same Agent reads nothing again');
  assert.equal(await page.locator('.setup-agent-fact').nth(2).textContent(),'About youRuns a small design studio in Kyoto');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-agent-apps-'+platform+'.png')});
  await page.reload();
  await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
  await page.getByRole('button',{name:'Enter my World',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('worldStartup'),{},{timeout:30000});
  const result=await page.evaluate(()=>({state:(window as any).fixture,calls:(window as any).calls}));
  assert.ok(!result.calls.some(c=>c.action==='connect'),'No Google sign-in');
  assert.equal(result.state.onboarding.completed,true);
  assert.ok(result.state.onboarding.unlockedApplets.includes('app-youtube'));
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
    if(b.action==='localAgent'&&b.operation==='adopt')return {name:'Elon North',memories:[{kind:'soul'},{kind:'user'},{kind:'longTerm'}],model:{ok:false},summary:{personality:'A blunt first-principles operator',about:'Kelvin runs Worldlet from San Francisco',model:'deepseek-v4-flash'},history:{conversations:15,older:258,notes:0,skills:160,routines:4,list:Array.from({length:40},(_,i)=>({title:'Conversation '+(i+1)+' about the launch plan',messages:10+i}))}};
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
    const over=await page.evaluate(()=>[document.getElementById('worldStartup'),...document.querySelectorAll('#worldStartup .setup-content,#worldStartup .setup-gallery')].filter(e=>e&&e.scrollHeight>e.clientHeight+1).map(e=>e.className+' '+e.scrollHeight+'>'+e.clientHeight));
    assert.deepEqual(over,[],where+' scrolls at '+width+'x'+height);
   }
   await page.setViewportSize({width:1024,height:700});
  };
  await page.locator('.setup-agent-default[data-agent="hermes"]').waitFor();
  await noScroll('The agent page');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-1-'+host+'.png')});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your Elon North'}).waitFor();
  await page.locator('.setup-bring-ticker.is-done').waitFor();
  await noScroll('The bring page');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-2-'+host+'.png')});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
  await page.locator('.setup-app-section'+(host==='macos'?'.is-found':'.is-popular')+' .setup-app').first().waitFor();
  await noScroll('The apps page');
  if(host==='macos')assert.ok(await page.locator('.setup-app-section.is-found .setup-app').count()>=20,'Every app found is shown');
  else assert.equal(await page.locator('.setup-app-section.is-found .setup-app').count(),0,'Windows finds no installed apps');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-3-'+host+'.png')});
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(50);
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-fit-3-1440-'+host+'.png')});
  assert.deepEqual(errors,[]);await page.close();
 }
// One-click install (`--connect=<id>`, core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup): the Agent the
 // host hands over is connected with the same select as Continue and setup goes on to the apps page by itself; one not
 // found here, or a select that fails, leaves the first page with it picked and the error shown; a second launch while
 // setup is open (`worldlet:connect-agent`) does the same.
 for(const scenario of ['found','missing','fails','second-launch']){
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
    if(b.action==='agentHarness'&&b.operation==='select'){if(scenario==='fails')throw Error('OpenClaw did not answer.');sessionStorage.setItem('fixture-agent',b.id);return {ok:true,id:b.id,title:'OpenClaw',connected:true};}
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
   await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
   assert.deepEqual(await selects(),['openclaw'],'The named Agent is connected with the same select as Continue');
   assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='localAgent'&&c.operation==='adopt'&&c.id==='openclaw')),'and brought in before the apps page');
  }else{
   const message=scenario==='missing'?'Hermes Agent isn’t installed on this computer.':'OpenClaw did not answer.';
   await page.getByText(message,{exact:true}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Give your agent a World'}).count(),1,'The normal first page stays');
   assert.deepEqual(await selects(),scenario==='missing'?[]:['openclaw']);
   if(scenario==='fails')assert.equal(await page.locator('.setup-agent-default[data-agent="openclaw"]').count(),1,'The named Agent stays picked');
  }
  assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='requested').length>=1),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 // No Agent on this computer is no dead end (owner decisions 2026-10-07, 2026-10-09): Check again asks the host again,
 // Worldlet installs stock Hermes Agent (its installer's steps show as they run), ChatGPT is signed in inside Hermes
 // (the code its device page asks for shows here), and Hermes is then brought like any Agent found here.
 {
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=pageErrors(page);
  await page.addInitScript(({platform})=>{
   const w=window as any;w.calls=[];w.detects=0;w.installed=false;w.signedIn=false;
   w.fixture={platform,workspaceId:'setup-no-agent-test',revision:1,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:false,onboarding:{version:1,presets:['home'],completed:false,unlockedApplets:[]},connections:[],sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},appUpdate:{visible:false}};
   const event=(detail:unknown)=>window.dispatchEvent(new CustomEvent('worldlet:hermes-setup',{detail}));
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    w.calls.push(b);
    if(b.action==='snapshot')return structuredClone(w.fixture);
    if(b.action==='installedApplets')return {keys:[]};
    // Codex alone is no Agent; Hermes appears once it is installed and signed in.
    if(b.action==='agentHarness'&&b.operation==='detect'){w.detects++;return {agents:w.signedIn?[{id:'hermes',title:'Hermes Agent',configured:true,worldTools:true}]:[],recommended:null,selected:sessionStorage.getItem('fixture-agent')};}
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
  await page.getByText(/No agent found on this computer/).waitFor();
  await page.getByRole('button',{name:'Check again'}).click();
  await page.waitForFunction(()=>(window as any).detects>=2);
  await page.getByText(/No agent found on this computer/).waitFor();
  await page.getByRole('button',{name:'Install Hermes Agent',exact:true}).click();
  await page.getByText('Step 3 of 7: Create Python environment',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Installing Hermes Agent…',exact:true}).isDisabled(),true,'nothing else while it installs');
  assert.equal(await page.getByRole('button',{name:'Check again'}).count(),0,'nothing to check while it installs');
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-hermes-install-'+platform+'.png')});
  await page.evaluate(()=>(window as any).finishInstall());
  await page.getByText(/Hermes Agent is installed\. Sign in to ChatGPT in it\./).waitFor();
  await page.getByRole('button',{name:'Sign in with ChatGPT',exact:true}).click();
  await page.locator('.setup-hermes-code strong',{hasText:'ABCD-1234'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cancel sign-in'}).isVisible(),true);
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-hermes-sign-in-'+platform+'.png')});
  assert.deepEqual(await page.evaluate(()=>[document.getElementById('worldStartup'),...document.querySelectorAll('#worldStartup .setup-content')].filter(e=>e&&e.scrollHeight>e.clientHeight+1).map(e=>e!.className)),[],'the sign-in fits without scrolling');
  await page.evaluate(()=>(window as any).finishSignIn());
  await page.getByRole('heading',{name:/^Bring your/}).waitFor();
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&!['detect','requested'].includes(c.operation)).map(c=>c.operation+(c.id?':'+c.id:''))),['install-hermes','sign-in-hermes','select:hermes']);
  assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>['modelConfigure','modelCatalog'].includes(c.action))),false,'no model is configured in Worldlet');
  assert.equal(await page.evaluate(()=>(window as any).fixture.cloudConsent),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 // My Agent is on another computer (core/phone/README.md#another-computers-agent): the code from Worldlet there pairs
 // this one with it, and setup goes on to the apps page; a refused code says why and the code box stays.
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
  const toggle=page.getByRole('button',{name:'My Agent is on another computer'});await toggle.waitFor();
  await toggle.click();
  const code=page.getByLabel('Code from your other computer');await code.waitFor();
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-remote-code-'+platform+'.png')});
  assert.equal(await page.locator('.setup-agent-grid').isVisible(),false,'the code box takes the Agent tiles’ room');
  const connect=page.getByRole('button',{name:'Connect',exact:true});
  assert.equal(await connect.isDisabled(),true,'nothing to pair without a code');
  assert.deepEqual(await page.evaluate(()=>[document.getElementById('worldStartup'),...document.querySelectorAll('#worldStartup .setup-content')].filter(e=>e&&e.scrollHeight>e.clientHeight+1).map(e=>e!.className)),[],'the code box fits without scrolling');
  await code.fill('worldlet://pair?v=1&s=x');await connect.click();
  await page.getByText('This is not a code from Worldlet on another computer.').waitFor();
  await code.fill('worldlet://agent?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac+mini');await connect.click();
  await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&c.operation==='pair').map(c=>c.link.slice(0,17))),['worldlet://pair?v','worldlet://agent?']);
  assert.equal(await page.evaluate(()=>(window as any).fixture.cloudConsent),true);
  // A relaunch resumes on the apps page while the pairing lasts, and returns to the first page once it ended there.
  await page.reload();await page.getByRole('heading',{name:'Bring your apps into your World'}).waitFor();
  await page.screenshot({path:path.join(tmpdir(),'worldlet-setup-remote-agent-'+platform+'.png')});
  await page.evaluate(()=>sessionStorage.removeItem('fixture-paired'));await page.reload();
  await page.getByRole('button',{name:'My Agent is on another computer'}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: three-page setup in one fixed frame: pick your local agent (square tiles, Hermes/OpenClaw/pi first), watch it move in on the second page, then the apps found here; cloud agents coming soon and Google greyed for everyone; Google retry, app choices, background checks, existing-user bypass, local Agent entry without Google, --connect from an install script and an Agent on another computer by code');
});
