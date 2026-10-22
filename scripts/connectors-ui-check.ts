// Settings › Services (ui/frame/connectors-page.ts) against a fake host: one tile per sign-in service with
// Connect, the waiting state with Cancel, Connected with Disconnect that asks once, a plain line when a sign-in did not
// finish or the service signed the person out, key services shown once connected, and nothing folded and nothing to
// type (owner request 2026-10-22: no Advanced in Settings). Fails when the page shows a technical word
// (CONNECTOR_TECHNICAL_WORDS). `--screenshot <file.png>` saves the page, and `-narrow.png` beside it at phone width.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONNECTOR_TECHNICAL_WORDS} from '../context/connectors/index.ts';
import {withBrowser,bundleScript,pageErrors} from './browser-test.ts';

await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:900,height:900}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Worldlet connectors settings check</title><main class="native-console" style="max-width:640px;margin:20px auto;font:14px system-ui;--control-fill:#f0f3ed;--control-ink:#203b30;--hud-paper-ink:#203b30;--hud-muted:#5b6b60;--ui-font-ui:system-ui"><h4>Connectors</h4><div id="settings"></div></main>');
 await page.addStyleTag({content:fs.readFileSync('ui/companion/companion-panel.css','utf8')});
 await page.addStyleTag({content:fs.readFileSync('ui/style/hud.css','utf8')});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/frame/connectors-page.ts'],globalName:'ConnectorsPage'})});
 await page.evaluate(async()=>{
  const w=window as any;w.calls=[];w.connections=[{provider:'github',label:'GitHub',transport:'hermes',syncStatus:'connected',connected:true,failed:false}];
  w.pending=null;w.refuse=null;w.chosen='2';w.opened=[];w.copied=[];
  // GitHub's default sync, on since it connected, last updated five minutes ago.
  w.syncs=[{id:'github-updates',provider:'github',default:true,revision:1,available:true,check:{enabled:true,intervalMinutes:60,lastStatus:'complete'},snapshotAt:Date.now()/1000-300}];
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{w.copied.push(text);}}});
  // The Agents that have reached the World, and which may read which Service ("<agent>:<provider>").
  w.agents=[{id:'claude-code',name:'Claude Code'},{id:'codex',name:'Codex'}];w.granted=new Set(['claude-code:github']);
  const call=async(action:string,body:any={})=>{
   w.calls.push({action,...body});
   if(action==='snapshot')return {connections:structuredClone(w.connections)};
   if(action==='connect'){
    if(body.token)return {ok:true,connected:true};
    // A project chosen after signing in: no new sign-in.
    if(body.settings){w.chosen=body.settings.project;return {ok:true,connected:true};}
    if(w.refuse)throw Error(w.refuse);
    // The browser sign-in: open until the check finishes or cancels it.
    await new Promise<void>((resolve,reject)=>{w.pending={resolve,reject};});
    w.connections=w.connections.filter((c:any)=>c.provider!==body.provider);
    w.connections.push({provider:body.provider,label:body.provider==='gmail'?'alex@example.com':body.provider,transport:'hermes',syncStatus:'connected',connected:true,failed:false});
    return {ok:true,connected:true};
   }
   if(action==='connectCancel'){w.pending?.reject(Error('Sign-in was cancelled.'));w.pending=null;return {ok:true};}
   if(action==='disconnectSource'){w.connections=w.connections.filter((c:any)=>c.provider!==body.provider);return {ok:true};}
   if(action==='githubApp')return {connected:false};
   if(action==='openSystemBrowser'){w.opened.push(body.url);return {ok:true};}
   if(action==='httpJson')return {endpoints:[]};
   if(action==='serviceSync'&&body.operation==='list')return {jobs:structuredClone(w.syncs)};
   if(action==='serviceSync'&&body.operation==='configure'){const job=w.syncs.find((j:any)=>j.id===body.id);job.check.enabled=body.enabled;return {ok:true};}
   if(action==='agentAccess'&&body.operation==='serviceReaders'){
    const of=(agent:any)=>({...agent,granted:w.granted.has(agent.id+':'+body.provider)});
    return {main:of(w.agents[0]),others:w.agents.slice(1).map(of)};
   }
   if(action==='agentAccess'&&(body.operation==='grantService'||body.operation==='ungrantService')){
    w.granted[body.operation==='grantService'?'add':'delete'](body.id+':'+body.provider);return {ok:true};
   }
   if(action==='serviceChoices'){
    if(!w.connections.some((c:any)=>c.provider===body.provider))return {choices:[],chosen:null};
    if(body.provider==='posthog')return {choices:[{id:'1',name:'Mobile'},{id:'2',name:'Web'}],chosen:w.chosen};
    if(body.provider==='cloudflare')return {choices:[{id:'a'.repeat(32),name:'Alex'},{id:'b'.repeat(32),name:'Shop'}],chosen:'a'.repeat(32)};
    return {choices:[],chosen:null};
   }
   throw Error('Unexpected settings action '+action);
  };
  w.draw=async()=>{document.querySelector('#settings')!.replaceChildren();await w.ConnectorsPage.showConnectors(document.querySelector('#settings'),call,()=>true);};
  await w.draw();
 });
 const tile=(id:string)=>page.locator(`[data-connector="${id}"]`);
 // Everything a person meets before opening Advanced: text, labels, placeholders and titles.
 const defaultPath=()=>page.evaluate(()=>{
  const root=document.querySelector('#settings')!,out:string[]=[];
  for(const node of root.querySelectorAll('*')){
   if(node.closest('[data-advanced]')&&!(node.tagName==='SUMMARY'&&node.parentElement?.matches('[data-advanced]')))continue;
   for(const name of ['aria-label','placeholder','title'])if(node.getAttribute(name))out.push(node.getAttribute(name)!);
   for(const child of node.childNodes)if(child.nodeType===Node.TEXT_NODE&&child.textContent!.trim())out.push(child.textContent!.trim());
  }
  return out;
 });
 const plain=async(when:string)=>{for(const text of await defaultPath())assert.doesNotMatch(text,CONNECTOR_TECHNICAL_WORDS,`${when}: "${text}" is on the default path`);};

 assert.equal(await page.title(),'Worldlet connectors settings check');
 assert.deepEqual(await page.locator('[data-connector]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.connector)),['google','notion','linear','todoist','supabase','github','posthog','cloudflare','search-console']);
 // Every service is on the page, nothing folded.
 assert.equal(await page.locator('#settings details').count(),0,'nothing folded');
 assert.match(await tile('notion').innerText(),/See your pages and databases in Notion\./);
 assert.equal(await tile('github').getByRole('button',{name:'Disconnect',exact:true}).count(),1,'a service connected with a key shows as connected');
 assert.equal(await tile('github').getByRole('button',{name:'Connect',exact:true}).count(),0);
 assert.equal(await page.locator('[data-advanced]').count(),0,'no Advanced');
 assert.equal(await page.locator('input,textarea').count(),0,'nothing to type');
 await plain('opened');
 // Using this World in Claude or ChatGPT is under Settings › Agents (issue #674; settings-areas-ui-check.ts covers it):
 // they are Agents, not Services, so this page does not ask for Remote access at all.
 assert.equal(await page.locator('[data-use-in-claude]').count(),0,'not on the Connectors page');
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='remoteMcp')),false);
 // Who may look at it is decided for the person: the Agent in use reads, other Agents ask the first time; Settings ›
 // Agents takes it back. So the tile has no switch.
 assert.equal(await tile('github').getByRole('checkbox').count(),0,'no who-may-use switches');
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='agentAccess')),false);
 // Kept up to date by itself: "Updated 5 minutes ago" on the tile, no switch.
 await tile('github').locator('[data-sync=github]').getByText('Updated 5 minutes ago.',{exact:true}).waitFor();
 // One turned off before is turned on again.
 await page.evaluate(async()=>{const w=window as any;w.syncs[0].check.enabled=false;await w.draw();});
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='serviceSync'&&c.operation==='configure')),[{action:'serviceSync',operation:'configure',id:'github-updates',enabled:true}]);
 await tile('github').locator('[data-sync=github]').getByText('Updated 5 minutes ago.',{exact:true}).waitFor();
 const screenshot=process.argv.includes('--screenshot')?process.argv[process.argv.indexOf('--screenshot')+1]:'';

 // Connect: waiting, with Cancel, then Connected; the request names the Thing's region.
 await tile('notion').getByRole('button',{name:'Connect',exact:true}).click();
 await tile('notion').getByText('Finish signing in on Notion, then come back here.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect')),[{action:'connect',provider:'notion',region:'work'}]);
 await plain('waiting');
 await page.evaluate(()=>(window as any).pending.resolve());
 await tile('notion').getByText('Connected',{exact:true}).waitFor();
 await page.getByText('Notion is connected.',{exact:true}).waitFor();
 // GitHub signs in with its code: the code in large type, Copy and open GitHub copies it and opens GitHub's page; once
 // connected, Choose projects opens GitHub's page for which projects Worldlet may see.
 await page.evaluate(()=>{const w=window as any;w.connections=w.connections.filter((c:any)=>c.provider!=='github');return w.draw();});
 await tile('github').getByRole('button',{name:'Connect',exact:true}).click();
 await tile('github').getByText("Paste the code on GitHub's page and choose Authorize, then come back here.",{exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:sign-in-code',{detail:{provider:'github',code:'WDJB-MJHT',url:'https://github.com/login/device'}})));
 await tile('github').getByText('WDJB-MJHT',{exact:true}).waitFor();
 await tile('github').getByRole('button',{name:'Copy and open GitHub',exact:true}).click();
 await page.getByText('Copied WDJB-MJHT. Paste it on the page that opened and choose Authorize.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[(window as any).copied.slice(-1),(window as any).opened]),[['WDJB-MJHT'],['https://github.com/login/device']]);
 await plain('GitHub code');
 await page.evaluate(()=>(window as any).pending.resolve());
 await page.getByText('GitHub is connected.',{exact:true}).waitFor();
 assert.equal(await tile('github').locator('[data-sign-in-code]').count(),0,'the code goes once it is connected');
 await tile('github').getByRole('button',{name:'Choose projects',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).opened.at(-1)),'https://github.com/apps/worldlet-ai/installations/new');
 // Cancel ends the sign-in and says nothing changed.
 await tile('todoist').getByRole('button',{name:'Connect',exact:true}).click();
 await tile('todoist').getByRole('button',{name:'Cancel',exact:true}).click();
 await tile('todoist').getByText('Sign-in was cancelled. Nothing changed.',{exact:true}).waitFor();
 assert.equal(await tile('todoist').getByRole('button',{name:'Connect',exact:true}).count(),1);
 // A refusal in technical words becomes a plain line.
 await page.evaluate(()=>{(window as any).refuse='This service does not let Worldlet register to sign in. Connect it with a token instead.';});
 await tile('linear').getByRole('button',{name:'Connect',exact:true}).click();
 await tile('linear').getByText('Could not connect Linear. Try again.',{exact:true}).waitFor();
 await plain('refused');
 await page.evaluate(()=>{(window as any).refuse=null;});
 // Google: connected as the address it signed in with.
 await tile('google').getByRole('button',{name:'Connect',exact:true}).click();
 await page.evaluate(()=>(window as any).pending.resolve());
 await tile('google').getByText('Connected as alex@example.com',{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect').at(-1))).provider,'gmail');

 // PostHog signs in too, then asks which project when the account has several; choosing does not sign in again.
 await tile('posthog').getByRole('button',{name:'Connect',exact:true}).click();
 await page.evaluate(()=>(window as any).pending.resolve());
 const project=tile('posthog').getByLabel('Which PostHog project?',{exact:true});
 assert.equal(await project.inputValue(),'2');
 await project.selectOption('1');
 await tile('posthog').getByRole('button',{name:'Use',exact:true}).click();
 await page.getByText('PostHog now shows Mobile.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect'&&c.provider==='posthog')),[{action:'connect',provider:'posthog',region:'work'},{action:'connect',provider:'posthog',settings:{project:'1'}}]);
 await plain('choosing a project');
 // Cloudflare signs in the same way and asks which account; once it is in use it stays with the others.
 await tile('cloudflare').getByRole('button',{name:'Connect',exact:true}).click();
 await page.evaluate(()=>(window as any).pending.resolve());
 const account=tile('cloudflare').getByLabel('Which Cloudflare account?',{exact:true});
 assert.equal(await account.inputValue(),'a'.repeat(32));
 await account.selectOption({label:'Shop'});
 await tile('cloudflare').getByRole('button',{name:'Use',exact:true}).click();
 await page.getByText('Cloudflare now shows Shop.',{exact:true}).waitFor();
 assert.deepEqual((await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect'&&c.provider==='cloudflare'))).at(-1).settings,{account:'b'.repeat(32)});
 await plain('choosing an account');
 // Search Console signs in with Google, into Work, with nothing typed.
 await tile('search-console').getByRole('button',{name:'Connect',exact:true}).click();
 await page.evaluate(()=>(window as any).pending.resolve());
 await page.getByText('Search Console is connected.',{exact:true}).waitFor();
 assert.deepEqual((await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect'&&c.provider==='search-console'))),[{action:'connect',provider:'search-console',region:'work'}]);
 assert.equal(await tile('search-console').getAttribute('data-state'),'connected');
 await plain('Search Console signed in');
 // The service signed the person out: Sign in again, in plain words.
 await page.evaluate(async()=>{const w=window as any;w.connections.push({provider:'supabase',label:'Supabase',transport:'hermes',syncStatus:'sync_error',syncError:'Supabase is disconnected. Reconnect with Fox.',connected:true,failed:true});await w.draw();});
 await tile('supabase').getByText('Supabase signed you out. Sign in again to keep seeing it here.',{exact:true}).waitFor();
 assert.equal(await tile('supabase').getAttribute('data-state'),'needs-you');
 await tile('supabase').getByRole('button',{name:'Sign in again',exact:true}).waitFor();
 await plain('signed out');
 if(screenshot)await page.screenshot({path:screenshot,fullPage:true});

 // Disconnect asks once; Keep changes nothing.
 await tile('notion').getByRole('button',{name:'Disconnect',exact:true}).click();
 await tile('notion').getByText('Worldlet will stop seeing your Notion. What it already saved stays.',{exact:true}).waitFor();
 await tile('notion').getByRole('button',{name:'Keep',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.action==='disconnectSource')),false,'Keep disconnects nothing');
 await tile('notion').getByRole('button',{name:'Disconnect',exact:true}).click();
 await tile('notion').getByRole('group').getByRole('button',{name:'Disconnect',exact:true}).click();
 await page.getByText('Notion is disconnected.',{exact:true}).waitFor();
 await tile('notion').getByRole('button',{name:'Connect',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='disconnectSource')),[{action:'disconnectSource',provider:'notion'}]);

 assert.deepEqual(errors,[]);

  await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow settings do not overflow horizontally');
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-narrow.png'),fullPage:true});
});
console.log('PASS Settings › Services: Services only (using the World in Claude or ChatGPT is under Agents), GitHub\'s code with Copy and open GitHub and Choose projects, sign-in tiles with Connect, waiting and Cancel, Connected as, Disconnect asks once, plain words for a refusal and a sign-out, kept up to date by itself ("Updated 5 minutes ago", no switch), the PostHog project and Cloudflare account choices, Search Console signing in with Google, key services shown connected, nothing folded and nothing to type, no technical word, narrow layout');
