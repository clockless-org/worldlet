// The world's energy in the page: no battery in the World (owner 2026-10-04), Fox's low-energy line and the Energy page.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.calls=[];w.energy={source:'own',ready:true,name:'claude-sonnet',provider:'anthropic',level:8,resetsAt:'2026-10-03T00:00:00.000Z',localCodex:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return {workspaceId:'energy-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='foxEnergy')return w.energy;
  if(b.action==='modelHealth'&&w.gateway?.active)return {agent:'remote-openclaw',available:true,lastReply:null,location:{kind:'remote',computer:w.gateway.host,direct:true},model:{name:'OpenClaw at '+w.gateway.host,id:'',provider:'remote-openclaw',source:null,ready:true,configured:false}};
  if(b.action==='modelHealth')return w.remote?{agent:'remote',available:true,lastReply:null,location:{kind:'remote',computer:w.remote},model:{name:'Agent on '+w.remote,id:'',provider:'remote',source:null,ready:true,configured:false}}:{agent:'hermes',available:true,lastReply:w.lastReply??null,model:{name:w.energy.name,id:'',provider:w.energy.provider,source:w.energy.localCodex?'local-codex':null,ready:w.energy.ready,configured:w.energy.source!=='none'}};
  if(b.action==='modelCatalog')return {providers:[{id:'openai-codex',name:'ChatGPT'},{id:'anthropic',name:'Anthropic'}]};
  if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'codex',title:'Codex',configured:true,model:true,worldTools:true},{id:'claude-code',title:'Claude Code',configured:true,model:false,worldTools:true,memory:{name:null,user:false,longTerm:true,model:false}}],recommended:'codex',selected:w.remote||w.gateway?.active?null:w.agentInUse??null,remote:w.remote?{computer:w.remote,seenAt:Date.now()}:null,gateway:w.gateway??null};
  // A Gateway on another computer reached directly: the host answers with its address and host, never the token.
  if(b.action==='agentHarness'&&b.operation==='gateway'){if(!b.token&&!w.gateway)throw new Error('Type your Gateway’s address and token.');w.gateway={url:'https://mini.tail1.ts.net',host:'mini.tail1.ts.net',active:true};w.remote=null;return {ok:true,gateway:{host:'mini.tail1.ts.net'}};}
  if(b.action==='agentHarness'&&b.operation==='forget-gateway'){w.gateway=null;return {ok:true};}
  if(b.action==='agentHarness'&&b.operation==='pair'){w.remote='Mac mini';return {ok:true,remote:{computer:'Mac mini'}};}
  if(b.action==='agentHarness'&&b.operation==='select'){w.agentInUse=b.id;return {ok:true,id:b.id};}
  if(b.action==='agentHarness'&&b.operation==='clear'){w.agentInUse=null;w.remote=null;if(w.gateway)w.gateway.active=false;return {ok:true};}
  if(b.action==='codexSession')return {rateLimits:{primary:{usedPercent:30,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600},secondary:{usedPercent:55,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+86400}}};
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 await page.getByText('Your world is running low on energy. Charge it to keep going.').waitFor();
 await page.getByRole('button',{name:'Charge',exact:true}).waitFor();
 assert.equal(await page.locator('.world-energy,.world-environment .energy-cell').count(),0,'no battery in the World\'s top-right corner');
 await page.screenshot({path:'/tmp/world-energy-low.png'});
 await page.getByRole('button',{name:'Charge',exact:true}).click();
 const energy=page.locator('#companionInfo [data-section=Energy]');await energy.waitFor();
 const openEnergy=async()=>{if(!await page.locator('#companionInfo').isVisible())await openCompanionPanel(page);await page.getByRole('tab',{name:'Energy',exact:true}).click();await energy.waitFor();};
 assert.equal(await page.getByRole('tab',{name:'Energy',exact:true}).getAttribute('aria-selected'),'true');
 await energy.getByText('Low energy · 8%').waitFor();await energy.getByText('Charging from your own account or API key.').waitFor();
 assert.match(await energy.textContent()||'',/Charge with ChatGPT.*Bring your own energy.*In use now\./);
 // Worldlet provides no energy of its own (owner decision 2026-10-05): no free daily charge, no energy packs.
 assert.doesNotMatch(await energy.textContent()||'',/Free daily charge|Energy packs|Worldlet charges/);
 await page.screenshot({path:'/tmp/world-energy-page.png'});
 await page.keyboard.press('Escape');await openEnergy();
 await energy.getByRole('button',{name:'Connect'}).first().click();
 // Charging finishes on the Energy page (owner feedback 2026-10-03): no jump to Fox's speech bubble.
 await energy.getByRole('button',{name:'ChatGPT',exact:true}).waitFor();
 assert(await page.locator('#companionInfo').isVisible(),'Connect keeps the panel open');
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='modelSettings')),false,'Connect does not hand model setup to Fox');
 assert.equal(await page.locator('#companionDialogue .companion-guide-actions button',{hasText:'ChatGPT'}).count(),0);
 await page.screenshot({path:'/tmp/world-energy-connect.png'});
 await energy.getByRole('button',{name:'Back to energy',exact:true}).click();await energy.getByText('Ways to charge',{exact:true}).waitFor();
 // Agents on this computer and the connection's fixes live in Settings › Model (owner request 2026-10-06).
 assert.equal(await energy.locator('[data-agent]').count(),0,'Energy no longer lists the Agents');
 await energy.getByRole('button',{name:'Manage model connection',exact:true}).click();
 const settingsPage=page.locator('#companionInfo [data-section=Settings]');await settingsPage.waitFor();
 assert.equal(await settingsPage.locator('[data-setting=model]').getAttribute('aria-current'),'true','Energy opens Settings on Model');
 const local=settingsPage.locator('.companion-settings-detail');
 await local.getByText('Fox’s model is connected',{exact:true}).waitFor();
 await local.locator('[data-agent=claude-code]').getByRole('button',{name:'Use',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='localAgent'&&c.operation==='adopt'&&c.id==='claude-code'));
 await local.getByText('Claude Code on this computer answers for Fox.').waitFor();
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Use',exact:true}).click();
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Stop using',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent'&&c.id==='codex').length),0,'Codex is a model: nothing to adopt');
 await page.screenshot({path:'/tmp/world-energy-local.png'});
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Stop using',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='agentHarness'&&c.operation==='clear'));
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Use',exact:true}).waitFor();
 // An Agent on another computer (core/phone/README.md#another-computers-agent): its code pairs, Settings says where Fox
 // runs, and Stop using ends the pairing.
 const remote=local.locator('[data-agent=remote]');
 await remote.getByLabel('Code from Worldlet on your other computer').fill('worldlet://agent?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac+mini');
 await remote.getByRole('button',{name:'Pair',exact:true}).click();
 await local.getByText('Fox uses your Agent on Mac mini',{exact:true}).waitFor();
 await remote.getByText('Agent on Mac mini · In use').waitFor();
 await page.screenshot({path:'/tmp/world-energy-remote.png'});
 await remote.getByRole('button',{name:'Stop using',exact:true}).click();
 await remote.getByRole('button',{name:'Pair',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&['pair','clear'].includes(c.operation)).map(c=>c.operation)),['clear','pair','clear']);
 // An OpenClaw Gateway on another computer, reached directly (core/phone/README.md#an-agent-gateway-on-another-computer):
 // its address and token connect, Settings says it is reached directly, Stop using keeps it to Use again without the
 // token, and Forget removes it.
 const gateway=local.locator('[data-agent=gateway]');
 await gateway.getByLabel('Gateway address').fill('https://mini.tail1.ts.net');
 await gateway.getByLabel('Gateway token').fill('claw-secret');
 assert.equal(await gateway.getByLabel('Gateway token').getAttribute('type'),'password','the token is not shown as it is typed');
 await gateway.getByRole('button',{name:'Connect',exact:true}).click();
 await gateway.getByText('OpenClaw at mini.tail1.ts.net · In use').waitFor();
 await local.getByText('Fox uses your Agent on mini.tail1.ts.net',{exact:true}).waitFor();
 await local.getByText(/reached directly at its address/).waitFor();
 await gateway.getByRole('button',{name:'Stop using',exact:true}).click();
 await gateway.getByRole('button',{name:'Use',exact:true}).waitFor();
 assert.equal(await gateway.getByLabel('Gateway address').inputValue(),'https://mini.tail1.ts.net');
 assert.equal(await gateway.getByLabel('Gateway token').inputValue(),'','the saved token never comes back to the page');
 await gateway.getByRole('button',{name:'Use',exact:true}).click();
 await gateway.getByText('OpenClaw at mini.tail1.ts.net · In use').waitFor();
 await gateway.getByRole('button',{name:'Forget',exact:true}).click();
 await gateway.getByRole('button',{name:'Connect',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&['gateway','clear','forget-gateway'].includes(c.operation)).slice(-4).map(c=>[c.operation,c.token??null])),[['gateway','claw-secret'],['clear',null],['gateway',''],['forget-gateway',null]]);
 // The last reply's problem in plain words, with its fix (Kelvin's 2026-10-06 timeouts).
 await page.evaluate(()=>{(window as any).lastReply={ok:false,at:Date.now(),error:'Hermes timed out. You can try again.'};});
 await local.getByRole('button',{name:'Check connection',exact:true}).click();
 await local.getByText('Fox’s last reply did not finish',{exact:true}).waitFor();
 await local.getByText(/took too long to answer/).waitFor();
 await local.getByRole('button',{name:'Restart Fox',exact:true}).waitFor();
 await page.screenshot({path:'/tmp/world-energy-settings-problem.png'});
 await page.evaluate(()=>{(window as any).lastReply=null;});
 await page.keyboard.press('Escape');
 // A ChatGPT plan through the Codex sign-in: the tightest window decides the charge.
 await page.evaluate(()=>{const w=window as any;w.energy={source:'chatgpt',ready:true,name:'Codex on this computer',provider:'openai-codex',level:null,resetsAt:null,localCodex:true};window.dispatchEvent(new Event('worldlet:model-changed'));});
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='codexSession'));
 await openEnergy();await energy.getByText('Half charged · 45%').waitFor();await energy.getByText('Charging from your ChatGPT plan.').waitFor();await page.keyboard.press('Escape');
 // An API key: only the provider knows the balance, so the world shows charged.
 await page.evaluate(()=>{const w=window as any;w.energy={source:'own',ready:true,name:'claude-sonnet',provider:'anthropic',level:null,resetsAt:null,localCodex:false};window.dispatchEvent(new Event('worldlet:model-changed'));});
 await openEnergy();await energy.getByText('Fully charged',{exact:true}).waitFor();
 // Nothing on this computer charges the world: the page says what does, with no Worldlet charge to fall back on.
 await page.evaluate(()=>{const w=window as any;w.energy={source:'none',ready:false,name:'',provider:'openai-codex',level:null,resetsAt:null,localCodex:true};window.dispatchEvent(new Event('worldlet:model-changed'));});
 await openEnergy();await energy.getByText('Out of energy',{exact:true}).waitFor();
 await energy.getByText('Your world runs on an AI on this computer. Sign in to Codex, add your own API key, or use an Agent on this computer from Settings.').waitFor();
 assert.equal(await energy.getByRole('button',{name:/Turn (?:on|off)/}).count(),0,'no free-charge switch');
 await page.screenshot({path:'/tmp/world-energy-own.png'});
 // No model connected (owner request 2026-10-05): Fox says so once and points to Settings, Model, where one is chosen.
 await page.keyboard.press('Escape');
 await page.getByText('I need an AI on this computer to answer. Sign in to Codex, add your own API key, or use an Agent like Claude Code in Settings, under Model.').waitFor();
 await page.getByRole('button',{name:'Choose a model',exact:true}).click();
 const settings=page.locator('#companionInfo [data-section=Settings]');await settings.waitFor();
 assert.equal(await settings.locator('[data-setting=model]').getAttribute('aria-current'),'true','Settings opens on Model');
 const model=settings.locator('.companion-settings-detail');
 await model.getByText('No model connected',{exact:true}).waitFor();
 await model.locator('[data-agent=claude-code]').getByText('Answers for Fox on its own sign-in.',{exact:true}).waitFor();
 await model.getByRole('button',{name:'Sign in to Codex or add an API key',exact:true}).click();
 await model.getByRole('button',{name:'ChatGPT',exact:true}).waitFor();
 assert.equal(await page.locator('#companionDialogue .companion-guide-actions button',{hasText:'ChatGPT'}).count(),0,'model setup finishes in Settings');
 await page.screenshot({path:'/tmp/world-energy-settings-model.png'});
 // An Agent on this computer can answer instead; choosing it there switches Fox and says what it runs on.
 await page.evaluate(()=>{(window as any).energy={source:'own',ready:true,name:'Claude Code on this computer',provider:'claude-code',level:null,resetsAt:null,localCodex:false};});
 await model.locator('[data-agent=claude-code]').getByRole('button',{name:'Use',exact:true}).click();
 await model.locator('[data-agent=claude-code]').getByRole('button',{name:'Stop using',exact:true}).waitFor();
 await model.getByText('Claude Code on this computer answers for Fox.').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS world energy: no battery in the World, one low-energy line, Energy page with only the person\'s own sources, connecting in place; Settings, Model switches Agents and shows the last reply\'s problem with its fix; with no model, Fox points to Settings, Model');
}finally{await browser.close();}
