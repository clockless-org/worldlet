// Settings in three areas (issue #674, ui/frame/companion-settings.ts) against a fake host: Connectors, Agents and
// Context first, then Fox, Phone, General and Help smaller below a line. Agents lists every Agent that reaches the World,
// your own Agent first with Open for its page (Model, Skills, Scheduled, Permissions, Connections) and Back, each with
// what it may do in one line, what it did lately and Revoke, its switches folded; then using the World in Claude or
// ChatGPT (steps, Turn on, Copy address without showing it) and Remote access folded. Context shows each kind of
// context with how much it holds (only past conversations counted), what Fox and the Agents remember, Save a copy, and
// deletes that ask first. Old entry points (model, access, permissions, memory) land in the area that took them in.
// Fails when a default path (outside folded parts) shows a technical word (CONNECTOR_TECHNICAL_WORDS).
// `--screenshot <file.png>` saves the Agents page, and `-own`, `-context` and `-narrow` beside it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONNECTOR_TECHNICAL_WORDS} from '../context/connectors/index.ts';
import {withBrowser,bundleScript,pageErrors} from './browser-test.ts';

const screenshot=process.argv.includes('--screenshot')?process.argv[process.argv.indexOf('--screenshot')+1]:'';
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Worldlet settings areas check</title><main class="native-console" style="font:14px system-ui;--control-fill:#f0f3ed;--control-ink:#203b30;--hud-paper-ink:#203b30;--hud-muted:#5b6b60;--ui-font-ui:system-ui"><div class="companion-info-panel" open style="inset:12px;transform:none;width:auto;height:auto;max-height:none"><div class="companion-info-body" id="settings"></div></div></main>');
 await page.addStyleTag({content:fs.readFileSync('ui/companion/companion-panel.css','utf8')});
 await page.addStyleTag({content:fs.readFileSync('ui/style/hud.css','utf8')});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/frame/companion-settings.ts'],globalName:'CompanionSettings'})});
 await page.evaluate(()=>{
  const w=window as any;w.calls=[];w.copied=[];w.closes=0;w.journalOpened=0;
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{w.copied.push(text);}}});
  w.remote={enabled:false,connected:true,address:'https://mcp.worldlet.ai/'+'0'.repeat(32),connectors:[]};
  w.access=[
   {id:'claude-ai',name:'Claude',harness:'claude-ai',kind:'remote',createdAt:'2026-10-02T09:00:00.000Z',lastSeenAt:'2026-10-17T10:00:00.000Z',grants:[{id:'g1',targets:['items/query'],access:'read',duration:'standing',grantedAt:'2026-10-02T09:00:00.000Z'}],
    audit:[{at:'2026-10-17T10:00:00.000Z',target:'items',action:'query',decision:'allowed'}],services:[{provider:'github',title:'GitHub',granted:true}],asks:{ask:true,work:false},board:{read:false,define:false}},
   {id:'hermes',name:'Hermes Agent',harness:'hermes',kind:'local',createdAt:'2026-10-01T09:00:00.000Z',lastSeenAt:'2026-10-18T08:00:00.000Z',grants:[{id:'g2',targets:['items/query','world/link'],access:'write',duration:'standing',grantedAt:'2026-10-01T09:00:00.000Z'}],
    audit:[],services:[{provider:'github',title:'GitHub',granted:false}],board:{read:true,define:false}}];
  w.artifacts=[{id:'art-0001',title:'Morning plan'},{id:'art-0002',title:'Summary'},{id:'art-0003',title:'Build report',agentId:'claude-ai'}];
  const call=async(action:string,body:any={})=>{
   w.calls.push({action,...body});
   if(action==='modelHealth')return {agent:'hermes',available:true,lastReply:null,model:{name:'',id:'',provider:'anthropic',source:null,ready:true,configured:true}};
   if(action==='agentHarness'&&body.operation==='detect')return {agents:[],selected:null};
   if(action==='agentHarness'&&body.operation==='providers')return {agent:null,providers:[],chosen:null};
   if(action==='agentAccess'&&body.operation==='list')return {orders:{},agents:structuredClone(w.access)};
   if(action==='agentAccess'&&body.operation==='revoke'){w.access=w.access.map((a:any)=>a.id===body.id?{...a,revokedAt:'2026-10-18T09:00:00.000Z'}:a);return {ok:true};}
   if(action==='remoteMcp'&&body.operation==='status')return structuredClone(w.remote);
   if(action==='remoteMcp'&&body.operation==='enable'){w.remote.enabled=true;return {ok:true};}
   if(action==='worldAddress'&&body.operation==='status')return w.remote.enabled?{name:'w-7k3m9p2x',address:'https://w-7k3m9p2x.worldlet.ai',mcp:'https://w-7k3m9p2x.worldlet.ai/mcp',chosen:false,defaultName:'w-7k3m9p2x',reachable:true,remote:true,devices:[],visitors:[],shares:[]}
    :{name:null,chosen:false,defaultName:null,reachable:false,remote:false,devices:[],visitors:[],shares:[]};
   if(action==='harnessSkills'||action==='harnessSchedule'||action==='harnessApprovalRules'||action==='harnessConnections')return {current:{harness:'hermes',title:'Hermes Agent'},harnesses:[]};
   if(action==='foxPreferences')return {ok:true,dailyRoutines:{plan:true,summary:true}};
   if(action==='snapshot')return {connections:[]};
   if(action==='githubApp')return {connected:false};
   if(action==='httpJson')return {endpoints:[]};
   if(action==='worldContext')return {available:true,conversations:{count:12,bytes:48_000},services:[{provider:'github',bytes:2_300},{provider:'posthog',bytes:1_400_000}],journal:{bytes:9_000},agentOutputs:{bytes:700},board:{bytes:0}};
   if(action==='companionMemory')return {sections:[{kind:'user',text:'Prefers short replies.'},{kind:'longTerm',text:'x'.repeat(3000)}]};
   if(action==='harnessMemory')return {current:{harness:'hermes',title:'Hermes Agent'},harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,entries:[{id:'mem-1',kind:'user',text:'Lives in Lisbon.',where:''}]}]};
   if(action==='artifacts'&&body.operation==='list')return {artifacts:structuredClone(w.artifacts)};
   if(action==='artifacts'&&body.operation==='delete'){w.artifacts=w.artifacts.filter((a:any)=>a.id!==body.id);return {ok:true};}
   if(action==='dataBackup')return {ok:true,count:40};
   if(action==='deleteSourceData')return {ok:true};
   if(action==='clearWorldContent')return {cancelled:true};
   if(action==='appUpdate')return {state:'idle',channels:[]};
   throw Error('Unexpected settings action '+action+' '+JSON.stringify(body));
  };
  const box=(text:string)=>Object.assign(document.createElement('div'),{textContent:text});
  const knows=box('What Fox knows');knows.dataset.knows='';
  w.settings=w.CompanionSettings.createCompanionSettings({call,host:()=>({sample:()=>false,localDataDeletion:()=>true}),
   pages:{fox:box('Fox page'),phone:box('Phone page'),knows},records:{records:box(''),showRecords:()=>{}},onShow:()=>{},close:()=>{w.closes++;},openFeedback:()=>{},replayTutorial:()=>{}});
  addEventListener('worldlet:journal-open',()=>{w.journalOpened++;});
  document.querySelector('#settings')!.append(w.settings.element);
 });
 const list=page.locator('.companion-settings-list'),detail=page.locator('.companion-settings-detail');
 const open=(setting:string)=>page.evaluate(s=>(window as any).settings.open(s),setting);
 // Everything a person meets before opening a folded part: text, labels, placeholders and titles.
 const plain=async(when:string)=>{
  const texts=await detail.evaluate(root=>{
   const out:string[]=[];
   for(const node of root.querySelectorAll('*')){
    const fold=node.closest('details');
    if(fold&&!(node.tagName==='SUMMARY'&&node.parentElement===fold))continue;
    for(const name of ['aria-label','placeholder','title'])if(node.getAttribute(name))out.push(node.getAttribute(name)!);
    for(const child of node.childNodes)if(child.nodeType===Node.TEXT_NODE&&child.textContent!.trim())out.push(child.textContent!.trim());
   }
   return out;
  });
  for(const text of texts)assert.doesNotMatch(text,CONNECTOR_TECHNICAL_WORDS,`${when}: "${text}" is on the default path`);
 };

 // The three areas, then the rest smaller under a line.
 await open('');
 assert.deepEqual(await list.locator('[data-setting] strong').allTextContents(),['Services','Agents','Your data','Fox','Phone','General','Help']);
 assert.deepEqual(await list.locator('.companion-settings-item:not(.is-minor)').evaluateAll(n=>n.map(b=>(b as HTMLElement).dataset.setting)),['connectors','agents','context']);
 assert.equal(await list.locator('.companion-settings-minor').count(),1,'one line between the areas and the rest');
 const [big,small]=await Promise.all([list.locator('[data-setting=agents] strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),list.locator('[data-setting=help] strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))]);
 assert.ok(small<big,'the rest is smaller');

 // Agents: your own Agent first, then the others, each with its picture, what it may do and Remove; what it did lately is
 // folded with its switches (owner request 2026-10-21).
 await open('agents');
 await list.locator('[data-setting=agents][aria-current=true]').waitFor();
 const rows=detail.locator('[data-part=access] [data-access-agent]');
 await rows.first().waitFor();
 assert.deepEqual(await rows.evaluateAll(n=>n.map(r=>(r as HTMLElement).dataset.accessAgent)),['hermes','claude-ai'],'your own Agent first');
 const hermes=detail.locator('[data-access-agent=hermes]'),claude=detail.locator('[data-access-agent=claude-ai]');
 await hermes.getByText('Your Agent',{exact:true}).waitFor();
 await hermes.getByText('Fox works through it. It may do what you ask Fox, and asks you before it changes anything.',{exact:true}).waitFor();
 await hermes.getByText('It may look at and change things in your World and see your board.',{exact:true}).waitFor();
 await claude.getByText(/^On another computer\. Last used .*2026\.$/).waitFor();
 await claude.getByText('It may look at your World, read GitHub and ask you things.',{exact:true}).waitFor();
 assert.equal(await rows.locator('.companion-settings-icon').count(),2,'each Agent has its picture');
 assert.equal(await claude.locator('.companion-settings-icon img').count(),1,'Claude wears its logo');
 assert.equal(await claude.getByRole('button',{name:'Remove',exact:true}).count(),1);
 assert.equal(await claude.getByRole('button',{name:'Manage',exact:true}).count(),0,'Manage only for your own Agent');
 // Its Grants and switches are folded under Change what it may do.
 assert.equal(await claude.getByRole('checkbox',{name:'Can read GitHub',exact:true}).isVisible(),false,'switches folded');
 await claude.locator('[data-access-more] > summary').click();
 assert.equal(await claude.getByRole('checkbox',{name:'Can read GitHub',exact:true}).isChecked(),true);
 await claude.locator('.companion-settings-access-audit li').getByText(/items query · Allowed$/).waitFor();
 // Your World's address: one card (owner request 2026-10-22: no Advanced). Turn on when it is off, then the address,
 // Copy for Claude or ChatGPT and Choose a name; no remote access controls, tokens, script Agents or work routing.
 const card=detail.locator('[data-world-address]');
 await detail.getByText('Use your World anywhere',{exact:true}).waitFor();
 assert.equal(await card.getByRole('button',{name:'Copy for Claude or ChatGPT',exact:true}).count(),0,'nothing to copy while it is off');
 await card.getByRole('button',{name:'Turn on',exact:true}).click();
 await card.locator('[data-world-address-link]').getByText('w-7k3m9p2x.worldlet.ai',{exact:true}).waitFor();
 await card.getByRole('button',{name:'Copy for Claude or ChatGPT',exact:true}).click();
 await page.getByText('Copied. Paste it in Claude or ChatGPT as a connector.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).copied),['https://w-7k3m9p2x.worldlet.ai/mcp']);
 await card.getByRole('button',{name:'Choose a name',exact:true}).waitFor();
 for(const gone of ['details[data-part=advanced]','details[data-part=remote]','[data-use-in-claude]','[data-script-agents]','details[data-remote-tokens]'])
  assert.equal(await detail.locator(gone).count(),0,gone+' is gone');
 for(const word of ['Advanced','Turn off','New address','Give new work to:','Add an Agent for a script'])
  assert.equal(await detail.getByText(word,{exact:true}).count(),0,word+' is gone');
 await plain('Agents');
 if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
 // Remove asks once more, then the Agent can no longer reach the World.
 await claude.getByRole('button',{name:'Remove',exact:true}).click();
 await claude.locator('[data-action=confirm-revoke-agent]').click();
 await detail.getByText('Claude can no longer reach your World.',{exact:true}).waitFor();
 // Manage: your own Agent's page, its status and Scheduled first, Skills, Permissions and Connections folded under
 // Advanced (owner request 2026-10-21), and back to every Agent.
 await hermes.getByRole('button',{name:'Manage',exact:true}).click();
 const own=detail.locator('[data-view=own-agent]');
 await own.getByText('Hermes Agent',{exact:true}).waitFor();
 assert.deepEqual(await detail.locator('[data-part]').evaluateAll(n=>n.map(p=>(p as HTMLElement).dataset.part)),['model','routines','skills','permissions','accounts']);
 assert.deepEqual(await detail.locator('[data-part] > .companion-settings-parthead').allTextContents(),['Status','Scheduled','Skills','Permissions','Connections']);
 assert.equal(await detail.locator('details[data-own-advanced]').evaluate(n=>(n as HTMLDetailsElement).open),false,'Advanced starts folded');
 assert.equal(await detail.locator('details[data-choose-agent]').evaluate(n=>(n as HTMLDetailsElement).open),false,'other Agents and providers start folded while it works');
 assert.equal(await detail.locator('[data-part=memory],[data-part=access]').count(),0,'memory is in Context and the Agents are on the list');
 await detail.getByText('Fox’s model is connected',{exact:true}).waitFor();
 assert.equal(await detail.getByText(/claude-|gpt-/).count(),0,'no model names');
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-own.png'),fullPage:true});
 await own.getByRole('button',{name:'‹ All Agents',exact:true}).click();
 await detail.locator('[data-part=access] [data-access-agent=hermes]').waitFor();
 // Old entry points: what Fox runs on and its standing rules open your Agent's page; access opens the list.
 for(const [setting,part] of [['model','model'],['permissions','permissions'],['approvals','permissions']]){
  await open(setting);
  await list.locator('[data-setting=agents][aria-current=true]').waitFor();
  await detail.locator(`[data-view=own-agent]`).waitFor();
  await detail.locator(`[data-part=${part}]`).waitFor();
 }
 assert.equal(await detail.locator('details[data-own-advanced]').evaluate(n=>(n as HTMLDetailsElement).open),true,'a part named from outside opens the fold it is in');
 await open('access');
 await detail.locator('[data-part=access] [data-access-agent]').first().waitFor();

 // Context: everything the World keeps, how much each holds, the memory itself, Save a copy, and deletes.
 await open('context');
 await list.locator('[data-setting=context][aria-current=true]').waitFor();
 const context=detail.locator('[data-context=page]');
 await context.locator('[data-context=board]').waitFor();
 assert.deepEqual(await context.locator('[data-context]').evaluateAll(n=>n.map(r=>(r as HTMLElement).dataset.context)),['actions','conversations','memory','services','journal','agent-outputs','board']);
 const amount=(id:string)=>context.locator(`[data-context=${id}] .companion-settings-context-amount`).textContent();
 assert.deepEqual(await Promise.all(['conversations','memory','services','journal','agent-outputs','board'].map(amount)),['12 past conversations','3 KB','1.3 MB','9 KB','Under 1 KB','Not set up'],'only past conversations are counted');
 assert.deepEqual(await context.locator('[data-context=services] li').allInnerTexts().then(t=>t.map(s=>s.split('\n')[0].trim())),['PostHog · 1.3 MB','GitHub · 2 KB'],'each service, the largest first');
 // Memory: shown under the list once Show is chosen; nothing on the page is folded.
 assert.equal(await detail.locator('details').count(),0,'nothing folded');
 const remembered=detail.locator('[data-context=remembered]');
 assert.equal(await remembered.isHidden(),true,'memory waits for Show');
 await context.locator('[data-context=memory]').getByRole('button',{name:'Show',exact:true}).click();
 await remembered.waitFor();
 const memory=detail.locator('[data-part=memory]');
 await memory.locator('[data-knows]').waitFor();
 await memory.locator('[data-harness=hermes]').getByText('Lives in Lisbon.',{exact:true}).waitFor();
 await plain('Context');
 // Save a copy is the World backup; each kind has its own Delete; a Journal delete asks first and deletes only Fox's cards.
 await detail.getByRole('button',{name:'Save a copy',exact:true}).click();
 await detail.getByText(/^A copy of your World is saved\./).waitFor();
 const journal=context.locator('[data-context=journal]');
 await journal.getByRole('button',{name:'Delete…',exact:true}).click();
 await journal.getByText('Delete every card in your Journal? This can’t be undone.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='artifacts'&&c.operation==='delete').length),0,'asks first');
 await journal.locator('[data-action=confirm-delete-context]').click();
 await detail.getByText('Your Journal is empty now.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='artifacts'&&c.operation==='delete').map((c:any)=>c.id)),['art-0001','art-0002'],'only Fox\'s own cards');
 await context.locator('[data-context=services] [data-provider=github]').getByRole('button',{name:'Delete',exact:true}).click();
 await detail.getByText(/^What GitHub brought in is deleted\./).waitFor();
 await detail.locator('[data-setting=clear-world-content]').getByRole('button',{name:'Delete all',exact:true}).waitFor();
 await context.locator('[data-context=journal]').getByRole('button',{name:'Open Journal',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>[(window as any).closes,(window as any).journalOpened]),[1,1]);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>['dataBackup','deleteSourceData'].includes(c.action))),[{action:'dataBackup',operation:'export'},{action:'deleteSourceData',provider:'github'}]);
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-context.png'),fullPage:true});
 await open('memory');
 await list.locator('[data-setting=context][aria-current=true]').waitFor();
 // Narrow: nothing scrolls sideways.
 await page.setViewportSize({width:390,height:844});
 await open('agents');await detail.locator('[data-part=access] [data-access-agent]').first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow settings do not overflow horizontally');
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-narrow.png'),fullPage:true});
 assert.deepEqual(errors,[]);
});
console.log('PASS Settings in three areas: Services, Agents and Your data first, each with an icon, and the rest smaller; Agents lists your own Agent first with Manage for its page (Status and Scheduled, then Skills, Permissions and Connections under Advanced) and Back, what each may do in one line, what it did lately and Remove, switches folded, Your World’s address as one card (Turn on, Copy for Claude or ChatGPT, Choose a name) and no Advanced; Your data shows how much each kind holds (only past conversations counted), Save a copy, the memory under Show and a Delete on each kind that asks first, nothing folded; old entry points land in their area; no technical word on the default path; narrow layout');
