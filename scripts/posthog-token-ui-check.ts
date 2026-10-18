// Setup's Work step on the Connectors tiles (ui/onboarding/world-onboarding.ts, core connectorTiles): each service that
// signs in is a tile whose Connect signs in with no key (PostHog, Cloudflare), with no technical word and nothing to type
// outside Advanced. Under Advanced, PostHog with a key (TOKEN_PROVIDERS) asks for its address (US Cloud by default), the
// project ID and the key in a password field; the key goes to the host's `connect` once with the settings, is cleared
// from the page at once and never shows in the guide, while the address and project stay for another try; a connected
// PostHog promises no background reads.
import assert from 'node:assert/strict';
import {CONNECTOR_TECHNICAL_WORDS} from '../core/accounts/index.ts';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';

declare global {var TokenSetup:any;var tokenState:any;var tokenCalls:any[];var tokenRefuse:boolean;var tokenGuide:any;}
const PASTED='phx_'+'Ab1'.repeat(15);
await withBrowser(async browser=>{
 const page=await browser.newPage(),errors=pageErrors(page);
 const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'TokenSetup'});
 await page.setContent('<main><div id="guide"></div></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  tokenCalls=[];tokenRefuse=true;tokenState={platform:'mac',onboarding:{completed:true},sources:[],knowledge:[],connections:[],cloudConsent:true};
  const call=async(action,body:any={})=>{
   tokenCalls.push({action,...body});
   if(action==='snapshot')return structuredClone(tokenState);
   if(action==='connect'){
    // The tile's Connect: PostHog's own sign-in, no key.
    if(!body.token){tokenState.connections=[{id:'hermes-posthog',provider:'posthog',connected:true,transport:'hermes'}];return {ok:true,connected:true};}
    if(tokenRefuse)throw Error('PostHog did not accept this key. Check that it is a personal API key that has not expired, with read access to Project, Query, Insight, Dashboard, Feature flag and Annotation, then paste it again.');
    tokenState.connections=[{id:'hermes-posthog',provider:'posthog',connected:true,transport:'hermes'}];return {ok:true,connected:true};
   }
   throw Error('Unexpected native action '+action);
  };
  const view={metrics:{buildings:[]},revealGuide(){},openApplet(){},setGuide(value){const guide=document.getElementById('guide');guide.replaceChildren();if(value?.text)guide.append(document.createTextNode(value.text));if(value?.body)guide.append(value.body);for(const b of value?.actions||[])guide.append(b);}};
  tokenGuide=TokenSetup.mountWorldOnboarding({root:document.querySelector('main'),state:tokenState,call,view});tokenGuide.show('sources','work');
 });
 // The Work step: the same tiles as Settings › Connectors, plain words, nothing to type outside Advanced.
 const tiles=page.locator('[data-connector]');
 await tiles.first().waitFor();
 assert.deepEqual(await tiles.evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.connector)),['notion','linear','todoist','supabase','github','posthog','cloudflare','search-console'],'sign-in services, GitHub with its code');
 assert.equal(await page.locator('input:visible').count(),0,'nothing to type');
 const plain=await page.evaluate(()=>{
  const out:string[]=[];
  for(const node of document.querySelectorAll('#guide *')){
   if(node.closest('[data-advanced]')&&!(node.tagName==='SUMMARY'))continue;
   for(const child of node.childNodes)if(child.nodeType===Node.TEXT_NODE&&child.textContent!.trim())out.push(child.textContent!.trim());
  }
  return out;
 });
 for(const text of plain)assert.doesNotMatch(text,CONNECTOR_TECHNICAL_WORDS,`"${text}" is on the default path`);
 assert.match(await page.locator('[data-connector="posthog"]').innerText(),/Connect · See your product numbers and errors in PostHog\./);
 // Its Connect signs in: one connect with no key, into the Work region.
 await page.locator('[data-connector="posthog"]').click();
 await page.getByText('PostHog is connected',{exact:false}).waitFor();
 assert.deepEqual(await page.evaluate(()=>tokenCalls.filter(c=>c.action==='connect')),[{action:'connect',provider:'posthog',region:'work'}]);
 assert.match(await page.locator('#guide').innerText(),/other Agents ask you first/);
 await page.evaluate(async()=>{tokenState.connections=[];tokenCalls.length=0;tokenGuide.update(structuredClone(tokenState));tokenGuide.show('sources','work');});
 // Advanced: PostHog with a key.
 await page.locator('[data-advanced] summary').click();
 await page.getByRole('button',{name:'PostHog with a key',exact:true}).click();
 const key=page.getByLabel('PostHog personal API key',{exact:true}),address=page.getByLabel('PostHog address',{exact:false}),project=page.getByLabel('Project ID',{exact:false});
 await key.waitFor();
 assert.equal(await key.getAttribute('type'),'password');
 assert.equal(await address.inputValue(),'https://us.posthog.com','US Cloud by default');
 const guide=await page.locator('#guide').innerText();
 assert.match(guide,/read access to Project, Query, Insight, Dashboard, Feature flag and Annotation/);
 assert.match(guide,/EU Cloud https:\/\/eu\.posthog\.com/);
 assert.ok(await page.evaluate(()=>!tokenCalls.some(c=>c.action==='connect')),'the key form starts no sign-in');
 // A refused key: one connect with the key and both settings, the key cleared, the reason shown; Try again keeps the settings.
 await address.fill('https://eu.posthog.com');await project.fill('12345');await key.fill(PASTED);
 await page.getByRole('button',{name:'Connect PostHog',exact:true}).click();
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
 assert.match(await page.locator('#guide').innerText(),/PostHog did not accept this key/);
 assert.deepEqual(await page.evaluate(()=>tokenCalls.filter(c=>c.action==='connect').map(c=>[c.provider,c.token,c.settings])),[['posthog',PASTED,{host:'https://eu.posthog.com',project:'12345'}]]);
 assert.ok(!(await page.locator('#guide').innerText()).includes(PASTED));
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await key.waitFor();
 assert.equal(await key.inputValue(),'','the pasted key is not kept in the page');
 assert.equal(await address.inputValue(),'https://eu.posthog.com');assert.equal(await project.inputValue(),'12345');
 // An accepted key connects, and promises nothing in the background.
 await page.evaluate(()=>{tokenRefuse=false;});
 await key.fill(PASTED);
 await page.getByRole('button',{name:'Connect PostHog',exact:true}).click();
 await page.getByText('PostHog is connected',{exact:false}).waitFor();
 assert.match(await page.locator('#guide').innerText(),/Nothing is read in the background/);
 assert.ok(!(await page.content()).includes(PASTED),'the key is nowhere in the page');
 assert.deepEqual(errors,[]);
 console.log('PASS Work step on the Connectors tiles: sign-in tiles in plain words with nothing to type, PostHog\'s Connect signs in with no key; PostHog key under Advanced: address (US Cloud by default), project ID and a password field, one connect per paste with its settings, key cleared at once while the settings stay, refused key explained and asked again, accepted key connects with no background reads promised');
});
