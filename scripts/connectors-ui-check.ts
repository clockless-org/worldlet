// Settings › Connectors (ui/companion/connectors-page.ts) against a fake host: one tile per sign-in service with
// Connect, the waiting state with Cancel, Connected with Disconnect that asks once, a plain line when a sign-in did not
// finish or the service signed the person out, key services shown once connected, and every key, address and file
// under Advanced. Fails when the default path (everything outside Advanced) shows a technical word
// (CONNECTOR_TECHNICAL_WORDS). `--screenshot <file.png>` saves the page, and `-narrow.png` beside it at phone width.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONNECTOR_TECHNICAL_WORDS} from '../core/accounts/index.ts';
import {withBrowser,bundleScript,pageErrors} from './browser-test.ts';

await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:900,height:900}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Worldlet connectors settings check</title><main class="native-console" style="max-width:640px;margin:20px auto;font:14px system-ui;--control-fill:#f0f3ed;--control-ink:#203b30;--hud-paper-ink:#203b30;--hud-muted:#5b6b60;--ui-font-ui:system-ui"><h4>Connectors</h4><div id="settings"></div></main>');
 await page.addStyleTag({content:fs.readFileSync('ui/companion/companion-panel.css','utf8')});
 await page.addStyleTag({content:fs.readFileSync('ui/components/hud.css','utf8')});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/companion/connectors-page.ts'],globalName:'ConnectorsPage'})});
 await page.evaluate(async()=>{
  const w=window as any;w.calls=[];w.connections=[{provider:'github',label:'GitHub',transport:'hermes',syncStatus:'connected',connected:true,failed:false}];
  w.pending=null;w.refuse=null;w.chosen='2';
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
   if(action==='httpJson')return {endpoints:[]};
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
 assert.deepEqual(await page.locator('[data-connector]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.connector)),['google','notion','linear','todoist','supabase','github','posthog','cloudflare']);
 assert.match(await tile('notion').innerText(),/See your pages and databases in Notion\./);
 assert.equal(await tile('github').getByRole('button',{name:'Disconnect',exact:true}).count(),1,'a service connected with a key shows as connected');
 assert.equal(await tile('github').getByRole('button',{name:'Connect',exact:true}).count(),0);
 assert.equal(await page.locator('[data-advanced]').evaluate(node=>(node as HTMLDetailsElement).open),false,'Advanced starts folded');
 assert.equal(await page.locator('input:visible,textarea:visible').count(),0,'nothing to type on the default path');
 await plain('opened');
 const screenshot=process.argv.includes('--screenshot')?process.argv[process.argv.indexOf('--screenshot')+1]:'';

 // Connect: waiting, with Cancel, then Connected; the request names the Thing's region.
 await tile('notion').getByRole('button',{name:'Connect',exact:true}).click();
 await tile('notion').getByText('Finish signing in on Notion, then come back here.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect')),[{action:'connect',provider:'notion',region:'work'}]);
 await plain('waiting');
 await page.evaluate(()=>(window as any).pending.resolve());
 await tile('notion').getByText('Connected',{exact:true}).waitFor();
 await page.getByText('Notion is connected.',{exact:true}).waitFor();
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
 // Cloudflare signs in the same way and asks which account.
 await tile('cloudflare').getByRole('button',{name:'Connect',exact:true}).click();
 await page.evaluate(()=>(window as any).pending.resolve());
 const account=tile('cloudflare').getByLabel('Which Cloudflare account?',{exact:true});
 assert.equal(await account.inputValue(),'a'.repeat(32));
 await account.selectOption({label:'Shop'});
 await tile('cloudflare').getByRole('button',{name:'Use',exact:true}).click();
 await page.getByText('Cloudflare now shows Shop.',{exact:true}).waitFor();
 assert.deepEqual((await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='connect'&&c.provider==='cloudflare'))).at(-1).settings,{account:'b'.repeat(32)});
 await plain('choosing an account');
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

 // Advanced: the keys, GitHub writes, Search Console and HTTP JSON. A key leaves the page once.
 await page.getByText('Advanced',{exact:true}).click();
 for(const key of ['github','posthog','cloudflare'])await page.locator(`[data-advanced] [data-key="${key}"]`).waitFor();
 for(const box of ['github-app','search-console','http'])await page.locator(`[data-advanced] [data-accounts="${box}"]`).waitFor();
 const posthog=page.locator('[data-key="posthog"]');
 await posthog.getByLabel('PostHog personal API key',{exact:true}).fill('phx_aaaaaaaaaaaaaaaaaaaaaaaa');
 await posthog.getByLabel('Project ID',{exact:true}).fill('12345');
 await posthog.getByRole('button',{name:'Connect',exact:true}).click();
 await posthog.getByText('PostHog is connected.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.token).at(-1)),{action:'connect',provider:'posthog',token:'phx_aaaaaaaaaaaaaaaaaaaaaaaa',settings:{host:'https://us.posthog.com',project:'12345'}});
 assert.equal(await posthog.getByLabel('PostHog personal API key',{exact:true}).inputValue(),'','the key field is cleared at once');
 await plain('Advanced open');
 assert.deepEqual(errors,[]);

 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-advanced.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow settings do not overflow horizontally');
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-narrow.png'),fullPage:true});
});
console.log('PASS Settings › Connectors: sign-in tiles with Connect, waiting and Cancel, Connected as, Disconnect asks once, plain words for a refusal and a sign-out, the PostHog project and Cloudflare account choices, key services shown connected, keys and addresses only under Advanced, no technical word on the default path, narrow layout');
