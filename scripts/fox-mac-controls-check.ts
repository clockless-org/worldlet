import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,openCompanionPanel} from './browser-test.ts';
import {mkdir} from 'node:fs/promises';
await mkdir('output/fox-mac',{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  window.calls=[];window.privateConsent=false;window.delaySpeech=false;window.recordedSites=[{site:'pokemonshowdown.com',visits:3},{site:'example.com',visits:1}];
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='appUpdate'){
    if(b.operation==='channel')window.updateChannel=b.channel;
    const option=(id,name,stage,available,reason='')=>({id,name,stage,summary:name+' builds.',available,...(reason?{reason}:{})});
    const switchable=window.updateSwitchable!==false;
    return {state:b.operation==='channel'?'checking':'idle',label:'',detail:b.operation==='channel'?'Checking…':'',visible:false,enabled:false,switchable,channel:switchable&&window.updateChannel||'beta',installed:{version:'2026.1004.2750',build:2750},
     channels:[option('dev','Dev','开发',false,'Runs from a checkout.'),option('alpha','Alpha','内测',true),option('beta','Beta','公测',true),option('production','Production','正式',false,'Not open yet.')]};
   }
   if(b.action==='restartFox'){sessionStorage.setItem('fox-restarted','yes');return {ok:true};}
   if(b.action==='resetFox'){sessionStorage.setItem('fox-reset','cancelled');return {cancelled:true};}
   if(b.action==='showDebug')return {ok:true};
   if(b.action==='browserCommand'&&b.operation==='recordings')return {sites:window.recordedSites};
   if(b.action==='browserCommand'&&b.operation==='deleteRecordings'){const before=window.recordedSites;window.recordedSites=b.args.all?[]:before.filter(s=>s.site!==b.args.site);return {site:b.args.all?'':b.args.site,deleted:before.filter(s=>b.args.all||s.site===b.args.site).reduce((n,s)=>n+s.visits,0)};}
   if(b.action==='snapshot')return {workspaceId:'mac-controls',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:privateConsent};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:privateConsent};
   if(b.action==='modelCatalog')return {providers:[{id:'openai-codex',name:'Codex',provider:'openai-codex',nativeSetup:true,auth:'device_code'},{id:'qwen-cloud',name:'Qwen Cloud',provider:'qwen-cloud',nativeSetup:true,auth:'api_key'},{id:'ollama',name:'Ollama',provider:'ollama',nativeSetup:true,auth:'api_key'},{id:'lmstudio',name:'LM Studio',provider:'lmstudio',nativeSetup:true,auth:'api_key',local:true}]};
   if(b.action==='foxPreferences'){if(typeof b.cloudConsent==='boolean')privateConsent=b.cloudConsent;return {model:{name:'DeepSeek V4 Flash',ready:true},cloudConsent:privateConsent,autoSync:true};}
   if(b.action==='agentChat'&&b.text==='Interrupted fixture'){window.worldletAgentEvent(b.id,{type:'delta',text:'Your note is saved.\n'});window.worldletAgentEvent(b.id,{type:'delta',text:'[response inter'});await new Promise(r=>setTimeout(r,80));window.worldletAgentEvent(b.id,{type:'delta',text:'rupted]'});return {message:'[response interrupted]'};}
   if(b.action==='agentChat'&&b.text==='Empty interrupted fixture')return {message:'[response interrupted]'};
   if(b.action==='agentChat'){window.lastContext=b.context;if(b.text==='Latency check'){window.worldletAgentEvent(b.id,{type:'status',stage:'waiting'});await new Promise(resolve=>window.finishLatency=resolve);}if(b.text==='Make the text larger')await window.worldletAgentTool(b.id,{id:'preference-call',name:'set_worldlet_preference',args:{setting:'text_size',value:1.25}});if(b.text==='Speak briefly')await window.worldletAgentTool(b.id,{id:'style-call',name:'set_worldlet_preference',args:{setting:'companion_style',value:'briefly, warmly'}});return {message:'Hello from Fox.'};}
   if(b.action==='speechStart'&&delaySpeech)await new Promise(resolve=>window.resolveSpeech=resolve);
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   if(b.action==='weatherLoad')return {place:{name:'Test city',latitude:37.77,longitude:-122.42,timezone:'America/Los_Angeles'},weather:{code:0,temperature:21,cloud:0,wind:8,fetchedAt:Date.now(),observedAt:Date.now(),timezone:'America/Los_Angeles'}};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 const fox=page.locator('.companion-avatar'),form=page.locator('#notionCommand'),input=page.locator('#notionInput'),bubble=page.locator('#companionDialogue'),panel=page.locator('#companionInfo'),handle=page.locator('#notionInput'),typing=()=>page.evaluate(()=>document.querySelector<HTMLElement>('.notion-world')!.dataset.entryExpanded==='true'),mic=page.locator('.companion-speech-button');await fox.waitFor();
 // Below Fox in World: keyboard, microphone and Companion. Back to World appears only in the desktop Companion.
 assert.equal(await page.locator('.companion-controls>button:visible:not(.companion-order-button,.companion-speech-button)').count(),0,'one message bar replaces the icon row');assert.equal(await page.locator('.companion-world-button').isVisible(),false);assert.equal(await handle.getAttribute('aria-label'),'Message Fox');assert.equal(await handle.inputValue(),'','the bar carries no hint or status copy as text');
 assert.equal(await fox.getAttribute('title'),null,'no tooltip floats beside Fox (owner report 2026-10-07); the bar says click to type, hold to speak');assert.equal(await mic.getAttribute('title'),'Click to speak · Hold to speak · Right-click to choose a microphone or Talk with Fox');
 const openSettings=async()=>{if(!await panel.isVisible())await openCompanionPanel(page);await page.getByRole('tab',{name:'Settings',exact:true}).click();await panel.locator('section.companion-settings').waitFor();};
 const dock=page.locator('.world-actions');
 const checkTextActions=async()=>{
  const bodySize=await bubble.locator('#worldConversation').evaluate(e=>getComputedStyle(e).fontSize);
  const style=control=>control.evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,border:s.borderTopWidth,decoration:s.textDecorationLine,size:s.fontSize};});
  for(const control of await bubble.locator('.companion-guide-content button:visible,.companion-reply-nav button:visible').all())
   assert.deepEqual(await style(control),{background:'rgba(0, 0, 0, 0)',border:'0px',decoration:'underline',size:bodySize},'Guide options use the same text treatment as reply actions');
  // Guide choices sit in the shared dialogue footer with Attention item controls.
  const footer=await Promise.all((await bubble.locator('.companion-action-bar :is(button,a):visible').all()).map(style));
  for(const s of footer)assert.deepEqual(s,footer[0],'Dialogue footer controls share one frameless treatment');
  if(footer.length)assert.deepEqual([footer[0].background,footer[0].border],['rgba(0, 0, 0, 0)','0px']);
 };
 // Paging the tour is an arrow on the corner of the world now, not a word inside
 // what Fox is saying.
 const nextPage=page.getByRole('button',{name:'Next page',exact:true});
 // A timeout that only names what it wanted tells you nothing about why. Say what
 // the guide was actually offering when it gave up.
 // Page forward only while there is somewhere to page to; otherwise wait for the
 // action to arrive. A timeout says what the guide was offering instead of only
 // naming what it wanted.
 // Reaching a control means Fox is speaking: showing a panel fills the bubble, and
 // a dismissed bubble stays down until something brings Fox back, exactly as it
 // does for a person. Wake it, then page on only while there is somewhere to page.
 // A guide longer than the bubble scrolls inside it (owner Order 2026-10-07); only a guide written as steps pages.
 // Paging is an arrow on the corner of the world now, not a word inside the bubble.
 const revealAction=async name=>{
  const target=bubble.getByRole('button',{name,exact:true});
  for(let n=0;n<20;n++){
   if(await target.isVisible())return;
   const page$=await page.evaluate(()=>({at:Number(document.querySelector<HTMLElement>('#companionDialogue')?.dataset.page||1),
    of:Number(document.querySelector<HTMLElement>('#companionDialogue')?.dataset.pages||1)}));
   if(page$.at>=page$.of)break;
   await nextPage.click();
   await page.waitForFunction(at=>Number(document.querySelector<HTMLElement>('#companionDialogue')?.dataset.page||1)>at,page$.at,{timeout:4000});
  }
  // The bubble grows into its new page, so the action has a size a moment after it
  // has a place. Waiting for the size is what a person's eye does anyway.
  try{await target.waitFor({state:'visible',timeout:6000});}
  catch{
   const seen=await page.evaluate(()=>({page:document.querySelector<HTMLElement>('#companionDialogue')?.dataset.page,
    pages:document.querySelector<HTMLElement>('#companionDialogue')?.dataset.pages,
    buttons:[...document.querySelectorAll<HTMLElement>('#companionDialogue button')].map(b=>{const r=b.getBoundingClientRect();return b.textContent.trim()+' '+Math.round(r.width)+'x'+Math.round(r.height);})}));
   throw new Error('"'+name+'" never became reachable: '+JSON.stringify(seen));
  }
 };
 assert.deepEqual(await dock.getByRole('button').allTextContents(),[],'an empty overview does not invent suggested actions');
 assert.deepEqual(await page.getByRole('button',{name:'Settings',exact:true}).evaluateAll(b=>b.map(e=>!!e.closest('.companion-side'))),[true],'Settings is Fox\'s own button beside it, not a world gear');assert.equal(await page.locator('.world-recovery-toggle,.world-recovery-menu').count(),0);
 assert.equal(await dock.getByRole('button',{name:'Do Work',exact:true}).count(),0,'An empty world has no next task');
 assert.equal(await page.locator('#notionDialog').evaluate((e: HTMLDialogElement)=>e.open),false);
 await page.evaluate(()=>worldletShowControls('privacy'));await revealAction('Allow selected context');await bubble.getByRole('button',{name:'Allow selected context'}).click();assert.equal(await page.evaluate(()=>privateConsent),true);
 await revealAction('Keep sources private');await bubble.getByRole('button',{name:'Keep sources private'}).click();assert.equal(await page.evaluate(()=>privateConsent),false);
 // Closing a panel is clicking away from it, which is why Done was dropped: it
 // took a line of a narrow bubble to offer what the rest of the screen already was.
 assert.equal(await bubble.getByRole('button',{name:'Done',exact:true}).count(),0,'no panel spends a line on Done');
 // Empty world in the top-right; the top-left now holds the Today corner, whose date opens the Journal (#2235).
 await page.locator('#notionStage').click({position:{x:1320,y:120}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#companionDialogue')?.hidden===true,null,{timeout:8000});
 await page.evaluate(()=>(document.activeElement as HTMLElement).blur());await page.keyboard.press('Space');assert.equal(await typing(),true,'tapping Space opens typing (owner 2026-10-07)');await input.press('Escape');await page.evaluate(()=>(document.activeElement as HTMLElement).blur());
 await handle.click();assert.equal(await typing(),true,'clicking the bar starts typing');assert.equal(await input.inputValue(),'');
 await input.fill('Keep my draft');await input.press('Space');assert.equal(await input.inputValue(),'Keep my draft ');
 await input.press('Escape');await page.evaluate(()=>(document.activeElement as HTMLElement).blur());
 let starts=()=>page.evaluate(()=>calls.filter(c=>c.action==='speechStart').length),stops=()=>page.evaluate(()=>calls.filter(c=>c.action==='speechStop').length);
 // Pointer holds wait for the recorder request itself; slow Windows headless hosts miss a fixed deadline.
 const heldStarts=(n:number)=>page.waitForFunction(n=>calls.filter(c=>c.action==='speechStart').length>=n,n,{timeout:5000}).catch(()=>{}).then(starts);
 // Unfinished onboarding must not take over a voice conversation during refresh.
 const refreshUnfinished=()=>page.evaluate(()=>worldletReceive({workspaceId:'mac-controls',revision:(window.refreshRevision=(window.refreshRevision||0)+1),sources:[],knowledge:[],connections:[],onboarding:{completed:false},sampleEnabled:false,cloudConsent:true}));
 await page.keyboard.down('Space');assert.equal(await heldStarts(1),1,'hold starts capture after 280 ms');assert.ok((await page.locator('#notionWorld').getAttribute('class')).includes('is-listening'),'capture acknowledgement shows listening immediately');await refreshUnfinished();await page.keyboard.down('Space');assert.equal(await starts(),1,'repeat does not start another recording');await page.keyboard.up('Space');assert.equal(await stops(),1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'final',text:'Hello'}})));await bubble.getByText('Hello from Fox.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>lastContext),{},'ordinary chat has no private world context');
 await refreshUnfinished();await page.waitForTimeout(150);assert.equal(await bubble.isVisible(),true,'source refresh keeps the voice reply visible');assert.match(await bubble.innerText(),/Hello from Fox/);assert.doesNotMatch(await bubble.innerText(),/make this world yours/);
 await page.locator('#notionInput').click();assert.equal(await input.inputValue(),'Keep my draft ','voice preserves typed draft');await input.press('Escape');
 const box=await fox.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();assert.equal(await heldStarts(2),2,'holding Fox records');await page.mouse.up();assert.equal(await stops(),2);assert.equal(await panel.isVisible(),false,'Holding Fox does not open details');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'error',text:'Fixture Fox recording ended'}})));await page.keyboard.press('Escape');
 const m=await mic.boundingBox();await page.mouse.move(m.x+m.width/2,m.y+m.height/2);await page.mouse.down();assert.equal(await heldStarts(3),3,'holding the microphone records');await page.mouse.up();assert.equal(await stops(),3);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase:'error',text:'Please try speaking again.'}})));await refreshUnfinished();assert.match(await bubble.innerText(),/Please try speaking again/,'speech error stays visible instead of setup');await page.keyboard.press('Escape');
 await page.evaluate(()=>{(document.activeElement as HTMLElement).blur();window.delaySpeech=true;});await page.keyboard.down('Space');assert.equal(await heldStarts(4),4,'holding Space requests the microphone');await page.keyboard.up('Space');await page.evaluate(()=>window.resolveSpeech());await page.waitForTimeout(50);assert.equal(await page.locator('#notionWorld').getAttribute('class').then(c=>c.includes('is-listening')),false,'release while waiting for microphone cancels');
 await page.evaluate(()=>window.delaySpeech=false);await page.keyboard.down('Space');assert.equal(await heldStarts(5),5,'holding Space records again');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('Space');assert.ok(await page.evaluate(()=>calls.filter(c=>c.action==='speechCancel').length)>=2,'window blur cancels microphone');
 await handle.click();await input.fill('');await input.press('Escape');await page.evaluate(()=>(document.activeElement as HTMLElement).blur());await page.keyboard.press('h');assert.equal(await typing(),false,'typing a character does not open the input');
 await handle.click();assert.equal(await input.inputValue(),'','a stray character is not typed into the input');
 await input.fill('Latency check');await page.locator('#notionSend').click();
 const headStatus=page.locator('.companion-head-status'),thought=page.locator('.companion-thought');await page.waitForFunction(()=>!!window.finishLatency);await page.waitForFunction(()=>/…\s*$/.test(document.querySelector('#worldConversation')?.textContent||''));assert.ok(!await thought.isVisible()&&!await headStatus.isVisible(),'Wait status is on the working card, not above Fox');assert.equal(await handle.textContent(),'','Wait status never appears in the input handle');
 assert.equal(await page.locator('.companion-reply-status').isVisible(),false);
 const reading=await page.locator('#worldConversation').textContent();await page.evaluate(()=>{const turn=calls.filter(c=>c.action==='agentChat').at(-1);window.worldletAgentEvent(turn.id,{type:'delta',text:'Internal draft should not replace the reader.'});});
 assert.equal(await page.locator('#worldConversation').textContent(),reading,'progress and model drafts preserve the current reply');
 await page.waitForTimeout(900);await page.screenshot({path:'output/fox-mac/waiting.png'});
 await page.evaluate(()=>finishLatency());await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true');assert.equal(await thought.isVisible(),false);assert.equal(await headStatus.isVisible(),false);assert.equal(await handle.inputValue(),'');
 await input.fill('Make the text larger');await page.locator('#notionSend').click();await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.textScale==='1.25');assert.ok(await page.evaluate(()=>calls.some(c=>c.action==='foxPreferenceChange'&&c.setting==='text_size'&&c.value===1.25)));await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true');
 // Telling Fox how to speak is saved the same way, in the user's words.
 await input.fill('Speak briefly');await page.locator('#notionSend').click();await page.waitForFunction(()=>calls.some(c=>c.action==='foxPreferenceChange'&&c.setting==='companion_style'&&c.value==='briefly, warmly'));await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true');
 await input.press('Escape');await page.evaluate(()=>privateConsent=true);
 const priorTurns=await page.evaluate(()=>calls.filter(c=>c.action==='agentChat').length);
 assert.equal(await dock.getByRole('button',{name:'Do Work',exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='agentChat').length),priorTurns,'Next navigates without asking Fox');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true');
 await page.evaluate(()=>worldletShowControls('sources'));await revealAction('Weather');assert.equal(await bubble.locator('.world-onboarding').isVisible(),true,'explicit setup still opens after a conversation');
 // Setup offers what can be connected and nothing else: no headline repeating the
 // region standing behind the panel, no footnote about which transport a
 // connection uses, and no Back to world, which is what clicking the world is.
 assert.equal(await bubble.getByRole('button',{name:'Back to world',exact:true}).count(),0,'setup spends a line on leaving');
 assert.doesNotMatch(await bubble.innerText(),/Connections use Hermes/,'setup explains its own plumbing');
 assert.doesNotMatch(await bubble.innerText(),/Bring .* to life/,'setup repeats the region already on screen');await checkTextActions();await page.screenshot({path:'output/fox-mac/source-actions.png'});await page.locator('#notionStage').click({position:{x:1320,y:120}});
 // Fox's model is the Agent's: the model screen is Settings › Model, never a model guide in the bubble.
 await page.evaluate(()=>worldletShowControls('model'));await page.locator('#companionInfo [data-section=Settings] [data-setting=model][aria-current=true]').waitFor();
 assert.equal(await bubble.locator('.fox-model-catalog').count(),0,'no model guide in the bubble');assert.equal(await page.evaluate(()=>calls.some(c=>['modelCatalog','modelConfigure','modelLogin'].includes(c.action))),false);
 await page.screenshot({path:'output/fox-mac/model.png'});await page.keyboard.press('Escape');await page.locator('#companionInfo').waitFor({state:'hidden'});await page.screenshot({path:'output/fox-mac/actions.png'});
 // Background sync progress stays in Fox's pose; a job that needs the user is a line in Fox's one card.
 await page.evaluate(()=>worldletStatus({busy:true,status:'Syncing Google…'}));await page.waitForTimeout(150);assert.doesNotMatch(await bubble.innerText().catch(()=>''),/Syncing Google/,'routine progress is not status copy');
 await page.evaluate(()=>worldletStatus({busy:false,error:'Google needs reconnecting.'}));
 await bubble.locator('#worldConversation',{hasText:'Google needs reconnecting.'}).waitFor();
 await page.evaluate(()=>worldletReceive({workspaceId:'mac-controls',revision:1,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true}));
 await page.waitForTimeout(150);
 assert.match(await bubble.locator('#worldConversation').innerText(),/Google needs reconnecting\./,'world updates do not overwrite active status');
 assert.equal(await page.locator('.companion-input-state').textContent(),'','status never appears in the bar');
 assert.equal(await page.locator('#notionStatus').isVisible(),false);
 assert.equal(await page.locator('.world-job').isVisible(),false);
 assert.equal(await headStatus.count(),0,'no second bubble over Fox\'s head');
 await page.screenshot({path:'output/fox-mac/status.png'});
 await page.evaluate(()=>worldletStatus({busy:false,status:''}));
 await page.waitForFunction(()=>!/Google needs reconnecting/.test(document.querySelector('#worldConversation')?.textContent||''));
 await page.evaluate(()=>worldletShowControls('voice'));
 await page.setViewportSize({width:1000,height:700});const bounds=await bubble.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=1000&&bounds.y+bounds.height<=700);await page.screenshot({path:'output/fox-mac/compact.png'});
 assert.match(await page.locator('.world-build-version').textContent(),/^Development · .+/);
 assert.equal(await page.locator('.world-channel-badge').count(),0);
 assert.equal(await page.locator('.world-watermark').isVisible(),false,'branding stays hidden unless a development build is ready to apply');
 await openSettings();
 assert.match(await page.locator('.world-brand').textContent(),/worldlet\.ai/);
 assert.equal(await page.locator('.world-brand').getAttribute('href'),'https://worldlet.ai');
 // Settings work like a settings window (owner feedback 2026-10-03): the list on the left, the chosen
 // setting's details on the right, and nothing hands off to Fox's speech bubble. No animation tools.
 assert.deepEqual(await panel.locator('.companion-settings-item strong').allTextContents(),
  ['Model','Approvals','Integrations','Browser','Background tasks','Data','Sample world','Sounds','Voice','Privacy','Open at login','Updates','Troubleshoot','Reset']);
 assert.equal(await panel.getByRole('button',{name:/Animation timing|Preview animation/}).count(),0);
 const detail=panel.locator('.companion-settings-detail');
 await panel.locator('[data-setting=data]').click();
 await detail.getByRole('button',{name:'Transfer companion',exact:true}).click();
 await detail.getByRole('button',{name:'Import companion',exact:true}).waitFor();assert.equal(await detail.getByRole('button',{name:'Export companion',exact:true}).isVisible(),true);
 assert.equal(await bubble.getByRole('button',{name:'Export companion',exact:true}).count(),0,'Data finishes in the panel');
 await panel.locator('[data-setting=data]').click();
 await detail.getByText('Connections, model setup and Fox’s memory are kept',{exact:false}).waitFor();
 assert.equal(await detail.getByRole('button',{name:'Delete saved data',exact:true}).count(),1,'deleting saved data says what it leaves standing');
 await panel.locator('[data-setting=sample]').click();
 const sample=detail.locator('.world-recovery-switch');
 assert.equal(await sample.getAttribute('role'),'switch','the sample world is a switch, not an action');
 assert.equal(await sample.getAttribute('aria-checked'),'false','a world opens as the user\u2019s own, never as a demo');
 // Not clicked here: switching worlds reloads the page, which takes the fixture's
 // record of what was called with it. That it calls the same toggle every other
 // entry point uses is the thing worth knowing, and it is one function.
 await page.screenshot({path:'output/fox-mac/recovery.png'});
 // Privacy: the person deletes what the built-in browser recorded, one site or all, after an in-page question.
 await panel.locator('[data-setting=privacy]').click();
 const recordings=detail.locator('.companion-settings-recordings');
 await recordings.getByText('2 sites',{exact:true}).waitFor();await recordings.getByText('4 visits',{exact:true}).waitFor();
 const deletes=()=>page.evaluate(()=>calls.filter(c=>c.action==='browserCommand'&&c.operation==='deleteRecordings'));
 await recordings.getByRole('button',{name:'Delete for a site…',exact:true}).click();
 await recordings.getByLabel('Site').selectOption('example.com');
 await recordings.getByRole('button',{name:'Keep',exact:true}).click();
 await recordings.getByRole('button',{name:'Delete all',exact:true}).waitFor();
 assert.deepEqual(await deletes(),[],'nothing is deleted until confirmed');
 await recordings.getByRole('button',{name:'Delete for a site…',exact:true}).click();
 await recordings.getByLabel('Site').selectOption('example.com');
 await recordings.getByText('Delete everything recorded on example.com?',{exact:false}).waitFor();
 await recordings.getByRole('button',{name:'Delete',exact:true}).click();
 await detail.getByText('Deleted 1 visit from example.com.',{exact:true}).waitFor();
 await recordings.getByText('1 site',{exact:true}).waitFor();
 assert.deepEqual(await deletes(),[{action:'browserCommand',operation:'deleteRecordings',args:{site:'example.com'},agent:false}],'Delete for a site deletes that site as the person');
 await recordings.getByRole('button',{name:'Delete all',exact:true}).click();
 await recordings.getByText('Delete everything recorded on pokemonshowdown.com?',{exact:false}).waitFor();
 await recordings.getByRole('button',{name:'Delete all',exact:true}).click();
 await recordings.getByText('Nothing recorded',{exact:true}).waitFor();
 assert.deepEqual((await deletes()).at(-1),{action:'browserCommand',operation:'deleteRecordings',args:{all:true},agent:false},'Delete all, confirmed in the page');
 assert.equal(await recordings.getByRole('button',{name:/Delete/}).count(),0,'nothing left to delete');
 // Updates (owner requests 2026-10-04 and 2026-10-05): the installed version and the channel it follows; on the owner's
 // computer only open channels can be chosen, anywhere else there is no switcher.
 assert.equal(await panel.locator('.companion-settings-version').textContent(),'Worldlet 2026.1004.2750 · Beta','the version and channel show under the Settings list');
 await panel.locator('[data-setting=updates]').click();
 await detail.getByText('Worldlet 2026.1004.2750 · Build 2750',{exact:false}).waitFor();
 const follow=(id:string)=>detail.locator(`[data-channel=${id}] button`);
 assert.deepEqual(await Promise.all(['dev','alpha','beta','production'].map(async id=>[await follow(id).textContent(),await follow(id).isDisabled()])),[['Follow',true],['Follow',false],['Following',true],['Follow',true]]);
 await detail.locator('[data-channel=dev]').getByText('Runs from a checkout.',{exact:false}).waitFor();
 await follow('alpha').click();
 await page.waitForFunction(()=>calls.some(c=>c.action==='appUpdate'&&c.operation==='channel'&&c.channel==='alpha'));
 assert.equal(await follow('alpha').textContent(),'Following');await page.waitForFunction(()=>document.querySelector('.companion-settings-version')?.textContent==='Worldlet 2026.1004.2750 · Alpha');assert.equal(await follow('beta').isDisabled(),false,'Beta can be chosen again');
 await page.screenshot({path:'output/fox-mac/updates.png'});
 await page.evaluate(()=>{window.updateSwitchable=false;});
 await panel.locator('[data-setting=reset]').click();await panel.locator('[data-setting=updates]').click();
 await detail.locator('[data-channel=beta]').getByText('Beta · 公测',{exact:false}).waitFor();
 assert.equal(await detail.locator('[data-channel] button').count(),0,'off the owner’s computer there is nothing to switch');
 assert.equal(await detail.locator('[data-channel]').count(),1,'only the channel it follows shows');
 await panel.locator('[data-setting=reset]').click();
 await detail.getByRole('button',{name:'Reset',exact:true}).click();
 await page.waitForFunction(()=>calls.some(c=>c.action==='resetFox'));
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('fox-reset')),'cancelled');
 // Restart Fox says what it is for.
 await panel.locator('[data-setting=troubleshoot]').click();
 await detail.getByText('If Fox stops answering or seems stuck, restart it.',{exact:false}).waitFor();
 await detail.getByRole('button',{name:'Open Debug',exact:true}).click();
 await page.waitForFunction(()=>calls.some(c=>c.action==='showDebug'));
 await openSettings();
 await page.getByRole('button',{name:'Restart Fox',exact:true}).click();
 await page.waitForFunction(()=>sessionStorage.getItem('fox-restarted')==='yes');
 await page.waitForFunction(()=>!document.body.textContent.includes('Could not restart.')&&!!document.querySelector('.companion-avatar')&&!document.querySelector<HTMLDialogElement>('#companionInfo')?.open);
 await page.locator('#notionInput').click();await input.fill('Interrupted fixture');await page.locator('#notionSend').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true'&&document.querySelector('#worldConversation')?.textContent.includes('Your note is saved.'));
 assert.ok(!(await bubble.textContent()).includes('[response inter'),'internal interruption marker never becomes final reply');
 // The dialogue keeps the context's latest reply visible; an empty interrupted turn adds nothing to it.
 const beforeEmpty=await bubble.innerText();
 await input.fill('Empty interrupted fixture');await page.locator('#notionSend').click();
 await page.waitForFunction(()=>calls.some(c=>c.action==='agentChat'&&c.text==='Empty interrupted fixture')&&document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy!=='true');
 assert.ok(!(await bubble.textContent()).includes('[response interrupted]'));
 assert.equal(await bubble.innerText(),beforeEmpty,'empty interrupted turn does not become a reply');
 assert.deepEqual(errors,[]);console.log('PASS Mac: visible Fox wait status, independent Restart Fox, development provenance without DEV badge, empty-world suggestion suppression, targeted conversational guides, explicit privacy, no-context chat, keyboard-icon typing, Space opens typing, no character shortcuts, Fox click types and hold records; separate icon opens Companion, Space and microphone hold/release dictation, status as a line in Fox’s card, Companion panel Settings, person-only deletion of browsing recordings, repeat/blur/permission races, draft retention, secure model entry, compact fit.');
});
