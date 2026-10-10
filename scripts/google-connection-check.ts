import assert from 'node:assert/strict';
import {bundleScript,withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {hostCopy,hostFeatures} from '../platform/bridge/features.ts';

// Exercise the actual onboarding controller; only the native OAuth boundary is a fixture.
// Google consent opens in the browser only when the saved grant cannot be reused: Reconnect on a
// healthy connection opens none. A host that reports sign-in stages says `browser` only then, so
// the browser steps appear only then. An older host never reports them and keeps the steps throughout.
const stagesHost={version:1,features:{...hostFeatures({platform:'macos'}),googleSignInStages:true}};
// The host's browser stage carries the consent address it opened, so a browser that never came up
// (owner meetings 2026-10-02/03) can be opened again or the link copied. Any other address is ignored.
const consentUrl='https://accounts.google.com/o/oauth2/auth?client_id=fixture.apps.googleusercontent.com&scope=openid';
const consentStage={stage:'browser',url:consentUrl},forgedStage={stage:'browser',url:'https://accounts.google.com.evil.test/o/oauth2/auth'};
const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'GoogleConnectionCheck',platform:'browser'});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage();
 await page.setContent('<main id="root"></main>');
 await page.addScriptTag({content:bundle});
 const signIn={text:hostCopy({}).googleConnect,actions:['Cancel']},connecting={text:'**Connecting Google…**',actions:['Cancel']},success={text:'**Gmail and Calendar are connected.**',actions:[]};
 // reused: a still-valid grant, no browser. browser: consent opens, then the grant is verified.
 const expected={legacy:[signIn,success],reused:[connecting,success],browser:[connecting,signIn,connecting,success]};
 for(const mode of ['legacy','reused','browser'])for(const provider of ['google','gmail','google-calendar'])for(const consent of [false,true]){
  const result=await page.evaluate(async({provider,consent,mode,host})=>{
   const root=document.createElement('main');document.body.replaceChildren(root);
   const calls=[],guides=[];let source='';
   const stage=detail=>window.dispatchEvent(new CustomEvent('worldlet:google-sign-in',{detail}));
   const state={sources:[],knowledge:[],connections:[],onboarding:{completed:true},cloudConsent:consent,...(mode==='legacy'?{}:{hostCapabilities:host})};
   const view={setGuide:g=>{guides.push(g?{text:g.text,actions:(g.actions||[]).map(b=>b.textContent)}:null);source=g?.source||'';},revealGuide(){},get guideSource(){return source;}};
   const controller=(window as any).GoogleConnectionCheck.mountWorldOnboarding({root,state,view,call:async(action,body)=>{
    calls.push({action,body});
    if(action==='connect'){if(mode==='browser'){stage('browser');stage('verifying');}else stage('unknown');return {connected:true};}
    if(action==='snapshot')return state;throw Error('Unexpected call: '+action);
   }});
   await controller.connect(provider);
   stage('browser');// A stage after the connection settled changes nothing.
   return {calls,guides,consent:state.cloudConsent};
  },{provider,consent,mode,host:stagesHost});
  assert.deepEqual(result.calls.map(c=>c.action),['connect','snapshot'],'one connection request, without enabling private processing');
  assert.equal(result.calls[0].body.provider,provider);
  assert.equal(result.consent,consent);
  // Mac connects Calendar with local EventKit access (core/applets/INTEGRATIONS.md), not Google sign-in.
  if(provider==='google-calendar'){assert.ok(!result.guides.some(g=>[signIn.text,connecting.text].includes(g?.text)),'Mac Calendar never opens Google sign-in');continue;}
  assert.deepEqual(result.guides,expected[mode],mode+': browser steps only while consent is open, Cancel throughout, then a brief success');
 }
 // A guide said since sign-in began (a reply, another screen) keeps Fox's bubble.
 const kept=await page.evaluate(async host=>{
  const root=document.createElement('main');document.body.replaceChildren(root);
  const texts=[],state={sources:[],knowledge:[],connections:[],onboarding:{completed:true},hostCapabilities:host};let source='';
  const view={setGuide:g=>{texts.push(g?.text);source=g?.source||'';},revealGuide(){},get guideSource(){return source;}};
  const controller=(window as any).GoogleConnectionCheck.mountWorldOnboarding({root,state,view,call:async action=>{
   if(action==='connect'){view.setGuide({text:'A reply'});window.dispatchEvent(new CustomEvent('worldlet:google-sign-in',{detail:'browser'}));return {connected:true};}
   return state;
  }});
  await controller.connect('gmail');
  return texts;
 },stagesHost);
 assert.deepEqual(kept,[connecting.text,'A reply',success.text],'a sign-in stage never takes Fox back from a later guide');
 const failure=await page.evaluate(async()=>{
  const root=document.createElement('main');document.body.replaceChildren(root);let guide;
  const controller=(window as any).GoogleConnectionCheck.mountWorldOnboarding({root,state:{sources:[],knowledge:[],connections:[],onboarding:{completed:true}},view:{setGuide:g=>{guide=g;},revealGuide(){}},call:async()=>{throw Error('Read access was not granted.');}});
  await controller.connect('gmail');
  return {text:guide.text,actions:guide.actions.map(b=>b.textContent)};
 });
 assert.deepEqual(failure,{text:'Read access was not granted.',actions:['Try again']});
 const stage=(app,detail)=>app.evaluate(detail=>window.dispatchEvent(new CustomEvent('worldlet:google-sign-in',{detail})),detail);
 // Open again asks the host to open the same address in the system browser; Copy link puts it on the clipboard.
 const consentFallback=async(app,buttons,labels:string[])=>{
  await app.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Open again'&&b.offsetParent));
  assert.deepEqual(await buttons.allInnerTexts(),labels,'Open again and Copy link while the browser stage is open');
  await app.evaluate(()=>navigator.clipboard.writeText(''));
  await buttons.getByText('Open again',{exact:true}).click();
  await app.waitForFunction(url=>(window as any).calls.some(c=>c.action==='openSystemBrowser'&&c.url===url),consentUrl);
  assert.deepEqual(await app.evaluate(()=>(window as any).calls.filter(c=>c.action==='openSystemBrowser').map(c=>c.url)),[consentUrl],'Open again reopens the same consent address in the system browser, once');
  await buttons.getByText('Copy link',{exact:true}).click();
  await buttons.getByText('Link copied',{exact:true}).waitFor();
  assert.equal(await app.evaluate(()=>navigator.clipboard.readText()),consentUrl,'Copy link puts the consent address on the clipboard');
 };
 // Verify the real bundled Fox UI, not only the controller's guide payload. Its Calendar entry is local on Mac.
 for(const host of [stagesHost,undefined]){
  const app=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),errors=pageErrors(app);
  await app.addInitScript(host=>{
   const w=window as any;w.calls=[];w.connected=false;
   w.webkit={messageHandlers:{worldlet:{async postMessage(body){
    w.calls.push(body);
    if(body.action==='snapshot')return {workspaceId:'google-connection-fixture',revision:w.connected?1:0,...(host?{hostCapabilities:host}:{}),sources:[],knowledge:[],connections:w.connected?['gmail','google-calendar'].map(provider=>({id:'hermes-'+provider,provider,label:'fixture@example.test',connected:true,syncStatus:'connected'})):[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:false};
    if(body.action==='modelStatus')return {available:true,provider:'hermes',cloudAllowed:false};
    if(body.action==='connect'){await new Promise(resolve=>{w.finishGoogle=resolve;});w.connected=true;await w.worldletReceive(await w.webkit.messageHandlers.worldlet.postMessage({action:'snapshot'}));return {connected:true};}
    if(body.action==='appContent')return {pages:[]};
    return {ok:true};
   }}}};
  },host);
  await app.goto(worldUrl());
  await app.locator('.companion-avatar').waitFor();
  await app.evaluate(()=>(window as any).worldletShowControls('sources','gmail'));
  try{await app.waitForFunction(()=>typeof (window as any).finishGoogle==='function',null,{timeout:10000});}
  catch(error){throw Error(JSON.stringify(await app.evaluate(()=>({calls:(window as any).calls,guide:document.querySelector('#companionDialogue')?.textContent})))+'; '+error.message);}
  const dialogue=app.locator('#companionDialogue'),says=(pattern:RegExp)=>app.waitForFunction(source=>new RegExp(source).test(document.querySelector('#companionDialogue')?.textContent||''),pattern.source);
  const onlyCancel=async()=>assert.deepEqual(await dialogue.locator('button:visible').allInnerTexts(),['Cancel'],'Cancel is the only control while signing in');
  if(host){
   // No browser has opened (a reused grant never opens one): a neutral line, no browser steps.
   assert.match(await dialogue.innerText(),/Connecting Google…/);
   assert.doesNotMatch(await dialogue.innerText(),/browser|Sign in with Google/);
   await onlyCancel();
   await stage(app,'browser');await says(/Sign in with Google/);await onlyCancel();
   await stage(app,forgedStage);await says(/Sign in with Google/);await onlyCancel();
   await stage(app,consentStage);await consentFallback(app,dialogue.locator('button:visible'),['Open again','Copy link','Cancel']);
   await stage(app,'verifying');await says(/Connecting Google…/);
   assert.doesNotMatch(await dialogue.innerText(),/browser|Sign in with Google/,'browser steps leave once consent is done');
   await onlyCancel();
  }else{
   assert.match(await dialogue.innerText(),/Sign in with Google/,'an older host keeps the browser steps while Google is open');
   assert.doesNotMatch(await dialogue.innerText(),/Connecting|Finish the sign-in/);
   await onlyCancel();
  }
  await app.evaluate(()=>(window as any).finishGoogle());
  await app.getByText('Gmail and Calendar are connected.',{exact:true}).waitFor();
  await stage(app,'browser');
  assert.equal(await app.getByText('Gmail and Calendar are connected.',{exact:true}).isVisible(),true,'a late stage never replaces the result');
  assert.equal(await app.locator('#companionDialogue button:visible').count(),0,'success needs no extra click');
  assert.equal(await app.evaluate(()=>(window as any).calls.filter(c=>c.action==='connect').length),1);
  assert.equal(await app.evaluate(()=>(window as any).calls.some(c=>c.action==='foxPreferences'&&c.cloudConsent===true)),false);
  if(host){
   await app.screenshot({path:'/tmp/worldlet-google-connected.png'});
   // Reconnect reuses a still-valid grant, so Accounts never promises another Google account through it.
   await app.evaluate(()=>(window as any).worldletShowControls('connections'));
   await says(/Connected accounts/);
   assert.match(await dialogue.innerText(),/Choose one to reconnect or disconnect it\. To use a different Google account, disconnect Google first\./);
   assert.doesNotMatch(await dialogue.innerText(),/with a different account/);
   assert.deepEqual(await dialogue.locator('button:visible').allInnerTexts(),['Mail · fixture@example.test','Calendar · fixture@example.test']);
  }
  assert.deepEqual(errors,[]);
  await app.close();
 }
 // First-use setup follows the same rule: its help line names the browser only once it has opened.
 {
  const app=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),errors=pageErrors(app);
  await app.addInitScript(host=>{
   const w=window as any;w.connected=false;w.calls=[];
   w.webkit={messageHandlers:{worldlet:{async postMessage(body){
    w.calls.push(body);
    if(body.action==='snapshot')return {workspaceId:'google-setup-fixture',revision:w.connected?1:0,hostCapabilities:host,sources:[],knowledge:[],worldItems:[],worldChecks:[],connections:w.connected?['gmail','google-calendar'].map(provider=>({id:'hermes-'+provider,provider,connected:true})):[],onboarding:{version:1,presets:['home'],completed:false},sampleEnabled:false,cloudConsent:false};
    if(body.action==='connect'){await new Promise(resolve=>{w.finishGoogle=resolve;});w.connected=true;return {connected:true};}
    if(body.action==='installedApplets')return {keys:[]};
    if(body.action==='localAgent')return {found:false};
    if(body.action==='foxPreferences')return {companionStyle:'',model:{ready:true}};
    return {ok:true};
   }}}};
  },stagesHost);
  await app.goto(worldUrl());
  // Setup offers no Google sign-in (owner request 2026-10-05: Worldlet provides no model, so a Google sign-in alone gives
  // Fox nothing to run on), and no greyed "Coming soon" row either (owner decision 2026-10-10). Google stays connectable
  // from Mail and Calendar above.
  await app.locator('.setup-more-toggle').click();
  await app.locator('#setupMore').waitFor();
  assert.equal(await app.locator('.setup-google-button').count(),0,'setup shows no Google row');
  assert.equal(await app.evaluate(()=>(window as any).calls.some(c=>c.action==='connect')),false,'setup asks nothing of Google');
  assert.deepEqual(errors,[]);
  await app.close();
 }
 console.log('PASS Google connection: Mail entry (no Google row in setup), one request, browser steps only once consent opens (neutral for a reused grant), Cancel throughout, brief success, retry on failure, unchanged privacy permission; Open again and Copy link reuse the validated consent address when the browser never came up; first-use setup follows the same rule; older hosts keep the browser steps; Accounts says to disconnect Google to switch accounts; Mac Calendar stays local.');
});
